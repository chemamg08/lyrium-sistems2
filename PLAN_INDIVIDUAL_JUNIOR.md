# Plan Técnico — Nuevo Plan Individual + Descuento Junior

> Documento de análisis y planificación. NO ejecutar cambios de código sin confirmación explícita del usuario.

---

## 1. Resumen del cambio

Se añade un tercer plan de suscripción:
- **Plan Individual**: orientado a abogados autónomos. **60 €/mes** o **600 €/año**. **0 subcuentas**.
- **Descuento Junior**: para licenciados hace menos de 2 años. Aplica sobre el Plan Individual (ambos intervalos) y reduce el precio a:
  - **45 €/mes** (descuento de 15 €)
  - **480 €/año** (descuento de 120 €)

El descuento se activa mediante un **toggle** en los modales de pago (Perfil y Renovación). Al activarlo:
- El precio mostrado cambia según el intervalo: 45 €/mes o 480 €/año.
- Aparece un campo para subir pruebas.
- El usuario completa el pago con el precio reducido.

Las cuentas con descuento Junior quedan en estado **"pendiente de verificación"** hasta que un administrador las revise desde el panel de admin y las apruebe o rechace.

**Límite de duración**: el descuento Junior tiene una vigencia máxima de **2 años** desde la fecha de verificación. Pasados los 2 años, el sistema lo desactiva automáticamente y la suscripción pasa a costar 60 €/mes o 600 €/año según el intervalo.

**Al aceptar desde admin**: cuando un administrador pulsa **Aceptar** en una verificación junior, el sistema marca el descuento como verificado **y elimina el archivo subido por el usuario** del servidor para no ocupar espacio innecesario.

---

## 2. Qué hacer en Stripe Dashboard (instrucciones para el administrador)

Antes de tocar código, debes configurar lo siguiente en tu cuenta de Stripe:

1. **Crear el Producto y los Price IDs base para el Plan Individual**:
   - Ve a Stripe Dashboard → Productos → Añadir producto.
   - Nombre: "Lyrium — Plan Individual".
   - Crea un **Price ID mensual** de **60,00 €** (recurring).
   - Crea un **Price ID anual** de **600,00 €** (recurring).
   - Copia ambos Price IDs (empiezan por `price_`).

2. **Crear los Price IDs de descuento Junior** (se recomienda usar Price IDs separados en lugar de Coupons, ya que los descuentos son de importes fijos diferentes: 15 € vs 120 €):
   - En el mismo producto "Lyrium — Plan Individual", añade dos Price IDs adicionales:
   - **Price ID mensual junior**: **45,00 €** (recurring).
   - **Price ID anual junior**: **480,00 €** (recurring).
   - Copia ambos Price IDs.

3. **Añadir las variables de entorno al `.env` del backend**:
```env
# Plan Individual — precios base
STRIPE_PRICE_INDIVIDUAL_MONTHLY=price_tu_id_mensual_60
STRIPE_PRICE_INDIVIDUAL_ANNUAL=price_tu_id_anual_600

# Plan Individual — precios junior
STRIPE_PRICE_INDIVIDUAL_JUNIOR_MONTHLY=price_tu_id_mensual_45
STRIPE_PRICE_INDIVIDUAL_JUNIOR_ANNUAL=price_tu_id_anual_480
```

> **Nota sobre Stripe Coupons**: no se usan Coupons de Stripe para este descuento. Se usan Price IDs separados porque el descuento varía según el intervalo (15 € en mensual, 120 € en anual) y es más sencillo cambiar de Price ID en Stripe que gestionar dos coupons diferentes.

---

## 3. Impacto en Modelos de Datos

### 3.1 `backend/src/models/Subscription.ts`

Añadir los siguientes campos opcionales al schema/interface `ISubscription`:

```ts
export interface ISubscription {
  // ... campos existentes ...

  /** Descuento junior */
  juniorDiscount?: {
    enabled: boolean;           // true si el usuario activó el toggle
    proofUrl: string | null;    // ruta al archivo subido (se limpia al aceptar)
    status: 'pending' | 'verified' | 'rejected'; // estado de verificación
    appliedAt: string | null;   // ISO date: cuándo se aprobó (inicio de los 2 años)
    verifiedAt: string | null;  // ISO date: cuándo el admin verificó
    verifiedBy: string | null;  // admin user id
    originalPrice: number;      // 60 o 600 según intervalo
    finalPrice: number;         // 45 o 480 según intervalo
  } | null;
}
```

### 3.2 `backend/src/models/Account.ts`

No requiere cambios.

---

## 4. Cambios en Backend (API y Lógica)

### 4.1 `backend/src/subscriptions.ts`

**A) Definición de planes** (líneas ~49-66):
- Añadir el nuevo plan `individual` al objeto `PLANS` y al type `LocalPlanId`:

```ts
type LocalPlanId = 'starter' | 'advanced' | 'individual';
```

```ts
const PLANS: Record<LocalPlanId, PlanConfig> = {
  starter: { /* ... existente ... */ },
  advanced: { /* ... existente ... */ },
  individual: {
    name: 'Individual',
    monthlyPrice: 60,
    annualPrice: 600,
    stripePriceIdMonthly: process.env.STRIPE_PRICE_INDIVIDUAL_MONTHLY || 'price_individual_monthly',
    stripePriceIdAnnual: process.env.STRIPE_PRICE_INDIVIDUAL_ANNUAL || 'price_individual_annual',
    stripePriceIdJuniorMonthly: process.env.STRIPE_PRICE_INDIVIDUAL_JUNIOR_MONTHLY || 'price_individual_junior_monthly',
    stripePriceIdJuniorAnnual: process.env.STRIPE_PRICE_INDIVIDUAL_JUNIOR_ANNUAL || 'price_individual_junior_annual',
    maxSubaccounts: 0,
  },
};
```

**B) Endpoint `POST /payment-intent`**:
- Recibir nuevo campo opcional en el body: `isJunior: boolean`.
- **Validar**: `isJunior` solo se acepta si `plan === 'individual'`. Si no, ignorar.
- Determinar el `priceId` de Stripe según plan, intervalo y si es junior:
  ```ts
  let priceId: string;
  if (plan === 'individual' && req.body.isJunior) {
    priceId = interval === 'monthly' ? planConfig.stripePriceIdJuniorMonthly : planConfig.stripePriceIdJuniorAnnual;
  } else {
    priceId = interval === 'monthly' ? planConfig.stripePriceIdMonthly : planConfig.stripePriceIdAnnual;
  }
  ```
- Calcular el `amount` en céntimos para la factura (solo informativo, el cobro real lo hace Stripe con el priceId):
  ```ts
  let amount = interval === 'monthly' ? planConfig.monthlyPrice : planConfig.annualPrice;
  if (plan === 'individual' && req.body.isJunior) {
    amount = interval === 'monthly' ? 45 : 480;
  }
  const amountCents = amount * 100;
  ```
- Si `autoRenew=true`, crear la Stripe Subscription con el `priceId` correspondiente (base o junior).
- Si `autoRenew=false`, crear un `PaymentIntent` de `amountCents`.

**C) Endpoint `POST /confirm-payment`**:
- Recibir `isJunior: boolean` y `proofUrl?: string`.
- Validar: `isJunior` solo si `plan === 'individual'`.
- Al actualizar la suscripción en MongoDB, poblar el campo `juniorDiscount`:
  ```ts
  const isJuniorMonthly = plan === 'individual' && interval === 'monthly' && req.body.isJunior;
  const isJuniorAnnual = plan === 'individual' && interval === 'annual' && req.body.isJunior;
  subscription.juniorDiscount = {
    enabled: true,
    proofUrl: req.body.proofUrl || null,
    status: 'pending',
    appliedAt: null,
    originalPrice: interval === 'monthly' ? 60 : 600,
    finalPrice: interval === 'monthly' ? 45 : 480,
  };
  ```
- Generar la factura con el precio final.

**D) Endpoint `GET /` (obtener suscripción)**:
- Devolver el campo `juniorDiscount`.
- **Comprobar expiración de 2 años**: si `juniorDiscount.enabled === true` y `appliedAt` tiene más de 2 años, desactivar automáticamente:
  ```ts
  if (subscription.juniorDiscount?.enabled && subscription.juniorDiscount?.appliedAt) {
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    if (new Date(subscription.juniorDiscount.appliedAt) < twoYearsAgo) {
      subscription.juniorDiscount.enabled = false;
      subscription.juniorDiscount.status = 'expired';
      // Si hay suscripción Stripe activa, cambiar al Price ID base del mismo intervalo
      if (subscription.stripeSubscriptionId && subscription.interval) {
        const basePriceId = subscription.interval === 'monthly'
          ? PLANS.individual.stripePriceIdMonthly
          : PLANS.individual.stripePriceIdAnnual;
        await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
          items: [{ id: /* obtener item id */, price: basePriceId }],
          proration_behavior: 'none',
        });
      }
    }
  }
  ```

### 4.2 `backend/src/services/stripeReconciliationService.ts`

- Añadir el nuevo plan `individual` con sus 4 Price IDs.
- Asegurar que `getPlanAndIntervalFromPriceId` maneje los nuevos price IDs (tanto base como junior).
- Añadir lógica de expiración automática del descuento junior durante la reconciliación.

### 4.3 `backend/src/middleware/auth.ts`

- No requiere cambios.

### 4.4 Nuevo endpoint: Subida de pruebas Junior

```
POST /api/subscriptions/junior-proof
```

- `multer` con `diskStorage`.
- Directorio: `backend/uploads/junior-proofs/`.
- Validar tipo (PDF, JPG, PNG) y tamaño máximo 5 MB.
- Nombre: `${accountId}_${Date.now()}_${file.originalname}`.
- Devolver la URL relativa.
- Asociar `proofUrl` a la suscripción actual.

### 4.5 Panel de Admin — Endpoints

**A) `backend/src/controllers/adminController.ts`**:

- **`searchUsers`**: Incluir `juniorDiscount`.
- **`getUserDetail`**: Incluir `juniorDiscount`.
- **Nuevo endpoint** `POST /admin/users/:id/verify-junior`:
  - Body: `{ status: 'verified' | 'rejected' }`
  - Buscar suscripción por `accountId`.
  - Si `status === 'verified'`:
    - Actualizar `juniorDiscount.status = 'verified'`.
    - Establecer `juniorDiscount.appliedAt = new Date().toISOString()` (inicio de los 2 años).
    - Establecer `verifiedAt` y `verifiedBy`.
    - **Eliminar el archivo físico** del servidor usando `fs.unlinkSync` en la ruta `juniorDiscount.proofUrl`.
    - Limpiar `juniorDiscount.proofUrl = null`.
  - Si `status === 'rejected'`:
    - `juniorDiscount.status = 'rejected'`.
    - `enabled = false`.
    - **Eliminar el archivo físico** del servidor.
    - Limpiar `proofUrl = null`.
    - Si hay suscripción Stripe activa, cambiar al Price ID base del mismo intervalo (quitar el Price ID junior).
  - Responder con la suscripción actualizada.

- **Nuevo endpoint** `GET /admin/junior-verifications`:
  - Listar suscripciones con `juniorDiscount.enabled === true` (cualquier estado).
  - Populate del `Account`.
  - Devolver: nombre, email, país, estado, proofUrl (si aún existe), fecha de solicitud.

**B) `backend/src/routes/adminRoutes.ts`**:
- Añadir: `POST /admin/users/:id/verify-junior`.
- Añadir: `GET /admin/junior-verifications`.

---

## 5. Cambios en Frontend

### 5.1 `frontend/src/pages/Landing.tsx`

- Añadir tarjeta Individual entre Starter y Advanced (o al final).
- Precios base: 60 €/mes y 600 €/año.
- Precios junior: 45 €/mes y 480 €/año.
- Features: acceso completo, **0 subcuentas**.
- Botón redirige a `/signup`.
- **NO eliminar ni modificar** Starter y Advanced.

### 5.2 `frontend/src/components/ProfileModal.tsx`

**A) Definición de planes**:
- Añadir `individual` al array `PLANS` y a los types.

**B) UI de selección de plan**:
- Al seleccionar el plan `individual` (cualquier intervalo), mostrar el **toggle (Switch)**:
  - "Soy abogado junior (licenciado hace menos de 2 años)"
- Al activar el toggle:
  - Si intervalo = mensual: precio cambia de 60 € a 45 €.
  - Si intervalo = anual: precio cambia de 600 € a 480 €.
  - Aparece input de archivo genérico: "Subir prueba".
  - Botón "Subir documento".

**C) Visualización del estado actual**:
- `pending`: "Tu descuento junior está pendiente de verificación."
- `verified`: "Descuento junior activo (45 €/mes o 480 €/año)."
- `rejected`: "Tu descuento junior ha sido rechazado. El siguiente cobro será del precio base."

### 5.3 `frontend/src/components/RenewalModal.tsx`

- Mismos cambios que `ProfileModal.tsx`.

### 5.4 `frontend/src/pages/AdminPanel.tsx`

**A) Nueva vista "Verificaciones Junior"**:
- Pestaña/vista independiente.
- Llama a `GET /admin/junior-verifications`.
- Tabla con:
  - Nombre, email, país.
  - Estado (badge: Pendiente / Verificado / Rechazado).
  - Fecha de solicitud.
  - Enlace para descargar prueba (solo si `proofUrl` aún existe; al aceptar/rechazar, el admin la elimina).
  - **Botón "Aceptar"** (verde): verifica la cuenta.
  - **Botón "Rechazar"** (rojo): rechaza la cuenta. Confirmación previa.

**B) Dashboard**:
- Stat: "Verificaciones junior pendientes".

### 5.5 Traducciones

Añadir claves i18n necesarias.

---

## 6. Flujos detallados

### 6.1 Pago con descuento junior

1. Usuario selecciona plan Individual + intervalo (mensual o anual).
2. Activa toggle "Soy abogado junior".
   - Precio se actualiza: 45 €/mes o 480 €/año.
   - Aparece input de archivo.
3. Sube archivo → backend guarda en `uploads/junior-proofs/`.
4. Paga con Stripe (usa Price ID junior correspondiente al intervalo).
5. Backend guarda `juniorDiscount` con `status: 'pending'`.
6. Factura por el precio junior.

### 6.2 Verificación por Administrador

1. Admin va a "Verificaciones Junior".
2. Ve listado exclusivo de cuentas con descuento junior.
3. Pulsa **Aceptar**:
   - Backend marca `verified`, guarda `appliedAt`.
   - **Elimina el archivo físico** del servidor.
   - Limpia `proofUrl`.
4. Pulsa **Rechazar**:
   - Backend marca `rejected`, desactiva `enabled`.
   - **Elimina el archivo físico**.
   - Limpia `proofUrl`.
   - Cambia Price ID en Stripe al base.

### 6.3 Expiración automática a los 2 años

- Si `appliedAt` supera los 2 años:
  - `enabled = false`, `status = 'expired'`.
  - Se cambia el Price ID en Stripe al base del mismo intervalo.
  - El siguiente cobro será al precio base.

---

## 7. Checklist de implementación

### Fase 1: Stripe
- [ ] Crear 4 Price IDs en Stripe:
  - Individual Mensual 60 €
  - Individual Anual 600 €
  - Individual Junior Mensual 45 €
  - Individual Junior Anual 480 €
- [ ] Añadir variables de entorno al `.env`.

### Fase 2: Backend — Modelos y Configuración
- [ ] `Subscription.ts`: añadir `juniorDiscount` con `appliedAt`.
- [ ] `subscriptions.ts`: añadir plan `individual` con 4 Price IDs.
- [ ] `stripeReconciliationService.ts`: añadir plan `individual` y expiración de 2 años.

### Fase 3: Backend — Lógica de pago
- [ ] `POST /subscriptions/payment-intent`: leer `isJunior`, seleccionar Price ID correcto, calcular amount.
- [ ] `POST /subscriptions/confirm-payment`: guardar `juniorDiscount`.
- [ ] `GET /subscriptions/`: devolver `juniorDiscount` + comprobar expiración de 2 años.

### Fase 4: Backend — Subida de archivos
- [ ] Endpoint `POST /api/subscriptions/junior-proof` con multer.

### Fase 5: Backend — Admin
- [ ] `POST /admin/users/:id/verify-junior`: aceptar/rechazar + **eliminar archivo físico** + limpiar `proofUrl`.
- [ ] `GET /admin/junior-verifications`: lista separada.
- [ ] Añadir rutas en `adminRoutes.ts`.

### Fase 6: Frontend — Planes
- [ ] `Landing.tsx`: tarjeta Individual (60/600, 45/480).
- [ ] `ProfileModal.tsx`: toggle junior en **ambos intervalos**, upload, precio dinámico.
- [ ] `RenewalModal.tsx`: idem.

### Fase 7: Frontend — Admin
- [ ] Nueva vista "Verificaciones Junior" con botones **Aceptar** y **Rechazar**.
- [ ] Dashboard: stat de pendientes.

### Fase 8: Traducciones y pulido
- [ ] Claves i18n.
- [ ] Validar JSX.

### Fase 9: Testing
- [ ] Individual mensual + junior → 45 €.
- [ ] Individual anual + junior → 480 €.
- [ ] Verificación admin: aceptar (archivo eliminado) y rechazar.
- [ ] Expiración automática tras 2 años.
- [ ] Starter y Advanced sin cambios.

---

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Archivo no se elimina al aceptar/rechazar | Usar `fs.unlinkSync` con try/catch. Si falla, loggear error pero no bloquear la operación. |
| Precios duplicados | Documentar que están hardcodeados en frontend y backend. |
| Expiración de 2 años | Implementar en `GET /subscriptions/` y en reconciliador. |
| Cambio de Price ID en Stripe al rechazar | Usar `stripe.subscriptions.update` con `items: [{ price: basePriceId }]` y `proration_behavior: 'none'`. |

---

*Documento actualizado con precios junior en ambos intervalos y eliminación de archivos al verificar. Pendiente de permiso explícito para modificar código.*
