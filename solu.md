# solu.md — Plan de implementación

## 1. Configuración de Email: Aviso contextual por plataforma sobre "contraseña de aplicación"
- **Archivo afectado:** `frontend/src/pages/FiscalAdvisory.tsx` (líneas ~1563–1649 del formulario de configuración de email).
- **Situación actual:** solo Gmail muestra una nota pequeña (`gmailNote`) diciendo "Para Gmail, usa una contraseña de aplicación". Las demás plataformas no tienen aviso, lo que genera confusión.
- **Solución propuesta:**
  - Crear un objeto de mapeo `PLATFORM_PASSWORD_GUIDE` que clasifique cada plataforma en tres grupos:
    - **Contraseña de aplicación obligatoria:** Gmail, Outlook/Hotmail, Yahoo, iCloud, Office 365.
    - **Contraseña normal (del panel de hosting):** Hostinger, IONOS, OVH, GoDaddy, Custom.
    - **Ambas posibles / recomendada de app:** Zoho.
  - Renderizar dinámicamente un componente `<Alert>` debajo del campo de contraseña según la plataforma seleccionada.
  - Incluir un enlace pequeño "¿Cómo obtenerla?" a la documentación oficial de cada proveedor.
- **Beneficio:** elimina la ambigüedad y reduce errores de conexión IMAP/SMTP.

## 2. Quitar "Systems" de Login y Signup
- **Archivos afectados:**
  - `frontend/src/pages/Login.tsx` (línea ~203: `<CardTitle className="text-2xl font-bold text-center">Lyrium Systems</CardTitle>`).
  - Revisar también `frontend/src/pages/Signup.tsx` y traducciones en `frontend/src/i18n/es.json`.
- **Solución propuesta:**
  - En `Login.tsx`, cambiar el texto a `Lyrium`.
  - Buscar y sustituir cualquier "Lyrium Systems" por "Lyrium" en traducciones.
- **Beneficio:** alineación con la marca actual.

## 3. Guía / Onboarding contextual por módulo
- **Concepto:** Guía rápida que aparece al entrar por primera vez a cada módulo. Es una ventana modal centrada con 1-2 frases explicando para qué sirve ese apartado y un botón "Entendido" para cerrarla.
- **Módulos con guía:** Dashboard, Clientes, Casos, Contratos, Automatizaciones, IA Asistente, Firma Electrónica, Defensa Legal, Redacción y Revisión, Configuración, etc.
- **Sin guía en:** Cumplimiento Fiscal (`TaxCompliance.tsx`) y Asesoramiento Fiscal (`FiscalAdvisory.tsx`).
- **Persistencia:** flag por módulo en `localStorage` (ej. `lyrium_guide_seen_clients`).
- **Componente:** `<ModuleGuide />` propio que lee el flag del módulo actual y abre el Dialog en la primera visita.

## 4. Landing: mantener partículas animadas (Canvas)
- **Archivo afectado:** `frontend/src/pages/Landing.tsx` (sección hero / fondo de partículas).
- **Problema:** el fondo actual genera cientos de nodos DOM animados que saturan el rendimiento.
- **Solución implementar:** migrar el sistema de partículas a un único elemento `<canvas>` usando Canvas 2D. Se renderizarán ~200 partículas a 60fps sin nodos DOM individuales. Se mantiene la estética actual con fidelidad ~95-98%.
- **Beneficio:** mejora drástica de rendimiento (pasa de 30fps a 60fps) sin perder el efecto visual.

## 5. Plan "Sin Cargo" (Free Tier)
### 5.1. Landing — Sección de Precios
- **Archivo afectado:** `frontend/src/pages/Landing.tsx`.
- **Cambio:** Añadir una cuarta tarjeta a la izquierda (primer lugar):
  - **Nombre:** Sin Cargo.
  - **Precio:** 0 €/mes.
  - **CTA:** "Empezar sin cargo".

### 5.2. Perfil / Modal de suscripción (post-login)
- **Archivo afectado:** `frontend/src/components/ProfileModal.tsx`.
- **Cambio:** Añadir la tarjeta "Sin Cargo" al grid para que los usuarios logueados puedan descender de plan.

### 5.3. Suscripción caducada — Opción "Acceder sin cargo"
- **Archivo afectado:** `frontend/src/pages/Login.tsx`.
- **Cambio:**
  - Añadir botón secundario **"Acceder sin cargo"** junto a "Renovar suscripción".
  - Al pulsarlo, abrir un `<Dialog>` de confirmación/aviso con los límites del plan.
  - Si acepta, el backend activa una suscripción tipo `free` y redirige al dashboard.

### 5.4. Límites del plan "Sin Cargo"
- **Máximo 10 clientes** en el CRM.
- **Máximo 5 casos activos** simultáneos.
- **50 mensajes al día** acumulados entre TODOS los chats de IA (mensajes del usuario + respuestas de la IA suman 1 cada uno). Al llegar al límite, salta un aviso.
- **Sin acceso** al apartado de Automatizaciones (ocultar en sidebar / bloquear ruta).
- **Sin posibilidad de subir archivos** a la sección "Mejorar IA" del Dashboard/Inicio.
- **Sin subcuentas** (un solo usuario por cuenta).
- **Sí puede suscribirse** a cualquier plan de pago cuando lo desee.
- **Nota técnica:** el backend debe soportar `plan: 'free'` en `Subscription.ts` y `Account.ts`. Las funciones premium deben estar protegidas por middleware/guards.

## 6. AppLayout — Estado de carga
- **Archivo afectado:** `frontend/src/components/AppLayout.tsx`.
- **Situación actual:** mientras `authState === 'checking'`, devuelve un `<div>` vacío que produce pantalla en blanco.
- **Solución propuesta:**
  - Sustituir por un componente de carga visual: logo de Lyrium centrado + spinner (`Loader2`) + texto "Cargando tu espacio de trabajo…".
- **Beneficio:** el usuario recibe feedback visual y no piensa que la app está rota.
