# Plan Técnico de Implementación — Lyrium Systems

---

## 1. Apartado "Casos" (nuevo)

### Backend
1. **Modelo de datos**: Crear nuevo modelo `Case` (`backend/src/models/Case.ts`) con campos:
   - `_id: string`
   - `accountId: string` (indexado)
   - `source: 'email' | 'whatsapp'`
   - `sourceId: string` (conversationId o waConversationId)
   - `contactName: string`
   - `contactEmail?: string`
   - `contactPhone?: string`
   - `subject?: string`
   - `body: string`
   - `status: 'pending' | 'assigned' | 'closed'`
   - `especialidadId?: string`
   - `assignedSubaccountId?: string`
   - `createdAt: string`
   - `assignedAt?: string`
    - `classificationType: 'solicitud_servicio' | 'intencion_implicita' | 'otro'`

2. **Detección de intención de asignación**:
   - Modificar `emailProcessorService.ts` y `whatsappService.ts` para detectar intención de caso nuevo en:
     - Solicitudes de servicio explícitas (`detectExplicitAssignmentRequest` ya existe).
     - Cualquier mensaje donde se detecte intención implícita de necesitar un abogado.
      - **Las consultas generales NO generan casos.**
   - **IMPORTANTE**: Un caso se crea SIEMPRE que se detecte intención de contratar, independientemente del valor de `autoAssignEnabled`.
   - Si `autoAssignEnabled=true`, el caso se crea con `status: 'pending'` y el sistema también ejecuta la asignación automática por detrás (como ya lo hace actualmente). El usuario ve el caso en el apartado "Casos" y puede reasignarlo manualmente si lo desea.
   - Si `autoAssignEnabled=false`, el caso se crea con `status: 'pending'` y queda a la espera de asignación manual desde "Casos".
    - Usar una nueva función `detectImplicitAssignmentIntent()` que devuelva boolean.
    - Cuando se detecte intención de caso nuevo, crear un registro en `Case` con `status: 'pending'` y `classificationType` apropiado.
    - En la página de Casos, agrupar por canal: sección Email y sección WhatsApp.
   - El usuario podrá: ver detalle, asignar a subcuenta, rechazar caso, cerrar caso.

3. **Endpoints**:
   - `GET /api/cases?accountId=...&status=...` — listar casos.
   - `POST /api/cases/:caseId/assign` — asignar a subcuenta.
   - `PUT /api/cases/:caseId/status` — cambiar estado (pending/assigned/closed).
   - `GET /api/cases/:caseId` — detalle de un caso.
   - Crear controller `casesController.ts` y rutas `casesRoutes.ts`.
   - Registrar rutas en `backend/src/routes/index.ts`.

4. **Servicios de asignación**:
   - Reutilizar `assignCase()` / `assignWhatsAppCase()` ya existentes en `emailProcessorService.ts`, pero adaptarlos para que acepten un `caseId` y actualicen el registro `Case`.
   - Al asignar, actualizar `assignedSubaccountId`, `status: 'assigned'`, `assignedAt`.

### Frontend
5. **Menú lateral**:
   - Añadir ítem "Casos" en `frontend/src/components/AppSidebar.tsx` (icono Briefcase) con ruta `/casos`.
   - Añadir traducción `t('nav.cases')` en todos los archivos i18n (`frontend/src/i18n/*.json`).
   - Añadir badge de casos pendientes consultando `GET /api/cases?status=pending` cada 30 segundos (similar a automatizaciones).
   - Registrar la ruta `/casos` en `frontend/src/App.tsx` apuntando al componente `Cases.tsx`.

6. **Página Casos**:
   - Crear `frontend/src/pages/Cases.tsx`.
   - Tabla/lista de casos con filtros por estado y canal.
   - Columnas: contacto, asunto, canal, estado, especialidad, abogado asignado.
   - Acciones: "Asignar abogado" (dropdown con subcuentas obtenidas de `GET /automatizaciones/subcuentas`), "Cerrar caso", "Ver conversación" (navega a email/WhatsApp).
   - Implementar llamadas a la API de casos.

---

## 2. Sincronización bidireccional Google Calendar

**Opción seleccionada: Polling cada 5 minutos + modelo local.**

### Opción recomendada (Polling + modelo local)

1. **Modelo de datos**: Crear `backend/src/models/CalendarEvent.ts`:
   - `_id: string`
   - `accountId: string`
   - `googleEventId: string` (indexado, único por cuenta)
   - `title: string`
   - `description?: string`
   - `startDateTime: string`
   - `endDateTime: string`
   - `allDay: boolean`
   - `source: 'lyrium' | 'google'`
   - `lastSyncedAt: string`
   - `deleted: boolean` (soft delete)

2. **Backend**:
   - Modificar `calendarController.ts`:
     - En `createCalendarEvent`: tras crear en Google, guardar en MongoDB con `source: 'lyrium'`.
     - En `updateCalendarEvent`: actualizar también en MongoDB.
     - En `deleteCalendarEvent`: marcar `deleted: true` en MongoDB.
   - Crear cron job con `node-cron` en un nuevo archivo `backend/src/jobs/calendarSyncJob.ts`:
     - Ejecutar cada 5 minutos para cuentas con `googleCalendarConnected: true`.
     - En la primera sync (sin `syncToken`), obtener todos los eventos y guardar el `syncToken` recibido.
     - Guardar el `syncToken` en el campo `googleCalendarSyncToken` del modelo `Account` (o `Automation`, donde se guarde la configuración de calendario de la cuenta).
     - Para cada cuenta, obtener eventos de Google Calendar desde `lastSyncedAt`.
     - Comparar con eventos locales (`CalendarEvent.find({ accountId, deleted: false })`).
     - Si un evento existe en Google pero no en local → crearlo (`source: 'google'`).
     - Si fue eliminado en Google → marcar `deleted: true`.
     - Si fue modificado en Google (updated timestamp diferente) → actualizar campos locales.
     - Actualizar `lastSyncedAt` de cada evento y de la cuenta.
     - Importar e iniciar el cron job en `backend/src/server.ts` (o el entry point principal del servidor) para que se ejecute al arrancar la aplicación.
   - En `getEvents`: devolver eventos desde MongoDB (`CalendarEvent.find({ accountId, deleted: false })`) en lugar de llamar directamente a Google.
   - Añadir endpoint `POST /api/calendar/sync` para sync manual inmediata.

3. **Frontend**:
   - En `Automations.tsx` (vista calendario), seguir usando `/api/calendar/events` (ahora devuelve desde MongoDB).
   - Añadir botón "Sincronizar ahora" que llame a `POST /api/calendar/sync`.
   - Mostrar indicador de última sincronización (timestamp).

---

## 3. Sistema de banderas en chats

### Backend
1. **Modelos**: Añadir campo `flags` al array `messages` de todos los modelos de chat:
   - `Chat.ts`, `DefenseChat.ts`, `ContractChat.ts`, `DocumentSummariesChat.ts`, `FiscalChat.ts`, `AssistantChat.ts`.
   - Estructura del flag dentro del mensaje:
     ```typescript
      flags?: Array<{
        id: string;
        createdAt: string;
      }>;
     ```
   - Hacer `markModified('messages')` al guardar después de modificar flags.

2. **Endpoints** (añadir a cada controller de chat o crear un controller genérico `messageFlagsController.ts`):
   - `POST /api/:chatType/chat/:chatId/messages/:messageId/flag` — añadir flag (body vacío).
   - `DELETE /api/:chatType/chat/:chatId/messages/:messageId/flags/:flagId` — quitar flag.
   - `GET /api/flags?accountId=...` — listar todos los mensajes marcados de todos los chats de esa cuenta.

3. **Controladores**: Actualizar o crear funciones en:
   - `chatsController.ts`, `defenseChatController.ts`, `contractsChatController.ts`, `documentSummariesController.ts`, `fiscalController.ts`, `assistantController.ts`.
   - O crear `messageFlagsController.ts` con lógica genérica que acepte el modelo como parámetro.

### Frontend
4. **Componentes de chat**:
   - En cada componente de chat (`AIAssistant.tsx`, `DefensePrep.tsx`, `ContractChatInterface.tsx`, `DocumentSummariesChatInterface.tsx`, `FiscalAdvisory.tsx`, `Clients.tsx` para Lyri Chat), añadir un icono de bandera (Flag de lucide-react) en cada burbuja de mensaje.
   - Al hacer clic, mostrar un pequeño popover/input opcional para nota.
   - El mensaje marcado debe tener borde amarillo o indicador visual distintivo.
   - Guardar flag vía `POST /api/:chatType/chat/:chatId/messages/:messageId/flag`.

5. **Acceso rápido**:
   - Panel lateral deslizable desde la derecha dentro de cada chat.
   - Lista de mensajes marcados en ese chat.
   - Al hacer clic en uno, scroll automático al mensaje usando `msg.id`.
   - Sin notas ni comentarios; solo marcado visual.

---

## 4. Seguridad y privacidad en prompts

1. **Actualizar identidad en prompts**:
   - La IA siempre se presenta como Lyra.
   - NO se menciona Claude, Qwen, GPT, OpenAI, Anthropic ni ningún proveedor.
   - Añadir sección de privacidad a todos los system prompts base:
     ```
     PRIVACIDAD Y SEGURIDAD:
     - Esta conversación es privada y segura.
     - No se comparte ninguna información personal ni legal con terceros.
     - Todos los datos están cifrados y protegidos.
     - Si te preguntan sobre seguridad, privacidad o protección de datos, indica estos puntos de forma breve y profesional.
     ```

2. **Añadir regla de no emojis** a todos los system prompts base:
   - `DEFENSE_SYSTEM_PROMPT`
   - `CLIENT_SYSTEM_PROMPT`
   - `ASSISTANT_SYSTEM_PROMPT`
   - `FISCAL_SYSTEM_PROMPT` (via `buildFiscalSystemPrompt()`)
   - `WRITING_REVIEW_SYSTEM_PROMPT`
   - `SUMMARY_SYSTEM_PROMPT` (en `documentSummariesController.ts`)
   - `buildContractSystemPrompt` (en `contractsChatController.ts`)
   - Añadir línea: "NO uses emojis ni emoticonos en tus respuestas."

3. **Actualizar prompts individuales**:
   - Revisar todos los system prompts en `aiService.ts`, `contractsChatController.ts`, `documentSummariesController.ts`, `fiscalController.ts`.
   - Asegurar que digan "Claude" o "Anthropic" en lugar de "Qwen" u "OpenAI" donde se mencione el proveedor.
   - Mantener la identidad "Lyra" como nombre visible para el usuario.

---

## 5. Facturación y Verifactu

1. **Eliminar menciones explícitas de "VeriFactu"**:
   - Frontend: `frontend/src/pages/Clients.tsx` — reemplazar texto branding por algo genérico como "Factura verificable ante la Agencia Tributaria".
   - i18n: Actualizar `verifactuLabel` en todos los JSON.
    - No eliminar funcionalidad (QR apunta a URL pública de lyrium.io, huella encadenada sigue funcionando).

2. **Añadir Verifactu a facturas de suscripción Stripe**:
   - En `backend/src/services/invoiceService.ts`, en `generateInvoicePDF()`:
     - Si país ES y no territorio foral, calcular huella encadenada.
     - Buscar última factura del accountId en modelo Invoice.
     - Generar hash SHA-256 (NIF + número + fecha + importe + huella anterior).
     - Guardar huella en documento Invoice creado.
      - Añadir QR al PDF apuntando a `https://lyrium.io/invoice/:invoiceId`, donde se renderiza la factura verificable.
   - Usar librería `qrcode` del backend para generar QR en el PDF.

3. **Facturas manuales**:
   - Asegurar que el flujo actual de `clientsController.ts` sigue generando huella y QR.
   - Verificar que al enviar factura por email desde el apartado clientes, el PDF incluye el QR.

4. **Endpoint público de verificación**:
   - Crear endpoint público en el backend (por ejemplo `GET /invoice/:invoiceId`) que renderice la factura o sus datos verificables (huella, NIF, importe, fecha, etc.) cuando se escanee el QR, sin requerir autenticación.

---

## 6. Revisión completa de automatizaciones email y WhatsApp

1. **Email (`emailProcessorService.ts`)**:
   - Revisar manejo de errores en `processIncomingEmails`: si falla la clasificación, debe fallback a `consulta_general` (ya lo hace, verificar que no se pierdan emails).
   - Revisar `processConsultaReply`: verificar que los `pendingConsultas` se eliminen correctamente en todos los branches.
   - Añadir logging más detallado en cada paso del flujo (classification, assign, forward, reply).
   - Revisar race conditions en `withAccountLock`: asegurar que se usa en todas las operaciones que modifican `emailConversations` y `pendingConsultas`.
   - Validar que `assignCase` y `assignCaseToSubaccount` manejen correctamente el caso de que no haya subcuentas disponibles.

2. **WhatsApp (`whatsappService.ts`)**:
   - Revisar `processOneIncomingMetaMessage`: verificar que las respuestas automáticas no se envíen fuera de la ventana de 24h (ya existe `isWhatsAppConversationOutside24h`, verificar que se use correctamente).
   - Revisar `classifyWhatsAppMessage`: asegurar parseo robusto del JSON de respuesta (manejar respuestas truncadas).
   - Revisar `findAnswerInKB`: si la respuesta está vacía después de stripThinkTags, debe fallback a forward.
   - Verificar que `forwardWhatsAppToConsultas` siempre persista el mensaje en la conversación.
   - Revisar que `applyWhatsAppClassifyRules` no falle silenciosamente si una regla tiene JSON malformado.

3. **Testing del flujo completo**:
   - Simular email de solicitud de servicio con `autoAssignEnabled=true` y sin especialista → debe crear pending y reenviar.
   - Simular respuesta del responsable con "asigna a Juan" → debe asignar a la subcuenta correspondiente.
   - Simular WhatsApp fuera de ventana 24h → no debe enviar auto-reply.

---

## 7. WhatsApp Meta: conexión manual, tokens y alertas

### Backend
1. **Conexión manual**:
   - Ya existe `connectMetaManual()` en `whatsappService.ts` y endpoint `POST /api/whatsapp/manual-connect` en `whatsappController.ts`.
   - Verificar que el frontend expone esta opción. Si no, añadirla en la UI de Automatizaciones > WhatsApp.

2. **Gestión de tokens**:
   - Ya existe intercambio a long-lived token en `connectMetaWithCode` y `connectMetaWithToken`.
   - Añadir campos a `whatsappSession` en modelo Automation:
     - `tokenExpiresAt?: string` (fecha calculada: conexión + 60 días)
     - `tokenType?: 'short' | 'long'`
   - Al conectar/renovar, calcular fecha de expiración y guardarla.

3. **Renovación manual**:
   - Crear endpoint `POST /api/whatsapp/refresh-token`.
   - Intentar re-canjear token actual por nuevo long-lived usando `fb_exchange_token`.
   - Si falla, requerir re-autorización.
   - Actualizar `tokenExpiresAt` tras renovación exitosa.

4. **Contador de expiración**:
   - Endpoint `GET /api/whatsapp/token-status` que devuelva `{ connected, tokenType, expiresAt, daysRemaining }`.
   - Calcular `daysRemaining` desde `tokenExpiresAt`.

5. **Alerta por email (Brevo)**:
   - Añadir campo a modelo `Automation` (o `Account`, según dónde se guarde la configuración de WhatsApp de la cuenta): `whatsappAlertEmail?: string`.
   - Crear cron job `tokenExpiryJob.ts`:
     - Ejecutar una vez al día.
     - Buscar cuentas con `tokenExpiresAt` en los próximos 7 días.
     - Enviar email usando `getSystemTransporter()` (Brevo) a `whatsappAlertEmail || account.email`.
     - Asunto: "Alerta: tu conexión de WhatsApp expira en X días".
     - Importar e iniciar el cron job en `backend/src/server.ts` para que se ejecute al arrancar la aplicación.
   - En frontend (Automations > WhatsApp): input para `whatsappAlertEmail` y toggle para activar alertas.

6. **Frontend**:
   - En `Automations.tsx` (sección WhatsApp), mostrar:
     - Tipo de token (corto / largo).
     - Días restantes hasta expiración (rojo si <= 7).
     - Botón "Renovar token ahora".
     - Input para configurar "Email de alerta de expiración".
     - Toggle "Recibir alertas de expiración".

---

## 8. Modelos de IA separados

### Backend
1. **Configuración** (`backend/src/config/aiModel.ts`):
   - Crear dos constantes:
     ```typescript
     export const AI_MODEL = process.env.AI_MODEL || 'qwen/qwen3-235b-a22b-thinking-2507';
     export const AI_AUTOMATION_MODEL = process.env.AI_AUTOMATION_MODEL || 'Qwen/Qwen3-235B-A22B-Instruct-2507';
      ```
   - **IMPORTANTE**: Ambos modelos usan la MISMA API de AtlasCloud (`ATLASCLOUD_API_KEY`).
   - No se crean dos clientes OpenAI. Se usa el mismo cliente con la misma `base_url` y `api_key`.
   - La única diferencia es el parámetro `model` que se pasa en cada llamada a `client.chat.completions.create()`.
   - No se necesita variable de entorno adicional para la API key del modelo de automatizaciones.

2. **Automatizaciones** (usar `AI_AUTOMATION_MODEL`):
   - `backend/src/services/emailProcessorService.ts` — cambiar import y todas las llamadas a usar `AI_AUTOMATION_MODEL`.
   - `backend/src/services/whatsappService.ts` — cambiar import y todas las llamadas a usar `AI_AUTOMATION_MODEL`.
   - `backend/src/services/automationMessages.ts` — cambiar import y llamada a usar `AI_AUTOMATION_MODEL`.

3. **Chats** (mantener `AI_MODEL`):
   - `backend/src/services/aiService.ts` — sin cambios, sigue usando `AI_MODEL` (thinking).
   - `backend/src/controllers/contractsChatController.ts` — sin cambios.
   - `backend/src/controllers/documentSummariesController.ts` — sin cambios.
   - `backend/src/controllers/defenseChatController.ts` — sin cambios.
   - `backend/src/controllers/fiscalController.ts` — sin cambios.
   - `backend/src/controllers/assistantController.ts` — sin cambios.

### Consideración
- `AI_AUTOMATION_MODEL` no genera bloques `<think>`, por lo que el filtro `stripThinkTags` sigue funcionando pero es innecesario para estas rutas. Se mantiene por robustez.

---

## 9. Revisión global del apartado de automatizaciones para producción

### Backend
1. **Revisar todos los controllers de automatizaciones**:
   - `automatizacionesController.ts` — verificar que todos los endpoints persistan correctamente en MongoDB.
   - `calendarController.ts` — revisar manejo de errores de Google Calendar API, reconexión automática, validación de tokens.
   - `whatsappController.ts` — revisar todos los endpoints de conexión, estado, desconexión y webhook.
   - `casesController.ts` (nuevo) — validar CRUD completo y asignaciones.

2. **Revisar todos los servicios de automatizaciones**:
   - `emailProcessorService.ts` — flujo completo de recepción, clasificación, respuesta, reenvío, asignación, confirmación.
   - `whatsappService.ts` — recepción de mensajes Meta, clasificación, respuesta automática, reenvío, asignación, manejo de ventana 24h.
   - `automationMessages.ts` — detección de idioma y generación de mensajes automáticos.
   - `webhookService.ts` — entrega de webhooks con reintentos y manejo de fallos.
   - `calendarSyncJob.ts` (nuevo) — robustez del polling y manejo de errores.
   - `tokenExpiryJob.ts` (nuevo) — envío de alertas y manejo de fallos de email.

3. **Base de datos y modelos**:
   - `Automation.ts` — validar que todos los campos nuevos (casos, token expiry, etc.) tengan defaults correctos.
   - `Case.ts` (nuevo) — índices correctos, validaciones de estado.
   - `CalendarEvent.ts` (nuevo) — índices por `accountId` y `googleEventId`.

4. **Manejo de errores y logs**:
   - Asegurar `try/catch` en todas las operaciones asíncronas de automatizaciones.
   - Añadir logs estructurados en cada paso del flujo (recibido, clasificado, asignado, reenviado, error).
   - Implementar reintentos con backoff para llamadas a APIs externas (Meta, Google, Brevo).

5. **Seguridad**:
   - Verificar que los webhooks de WhatsApp validen correctamente la firma HMAC-SHA256.
   - Asegurar que los tokens de OAuth y API estén encriptados en reposo.
   - Validar que todas las rutas de automatizaciones requieran autenticación adecuada.

### Frontend
6. **Revisar la página Automations** (`Automations.tsx`):
   - Verificar que todos los toggles reflejen correctamente el estado del backend.
   - Validar que los estados de carga y error se manejen en cada operación.
   - Revisar que las notificaciones de éxito/error sean claras para el usuario.
   - Validar que las nuevas funciones (Casos, renovación de token, alertas) se integren sin romper el flujo existente.

### Testing y validación
7. **Validación manual de flujos críticos**:
   - Email: recibir, clasificar, responder automáticamente, reenviar a consultas, asignar, confirmar.
   - WhatsApp: recibir mensaje, clasificar, responder, reenviar, asignar, manejar ventana 24h.
   - Calendario: crear, editar, eliminar evento; verificar sync bidireccional.
   - Casos: detectar caso, aparecer en lista, asignar manualmente, cerrar.
   - Tokens: conectar WhatsApp, ver contador, recibir alerta, renovar.

8. **Validación en producción**:
  
   - Verificar que los cron jobs no consuman recursos excesivos.
    - Validar que los logs sean útiles para debugging sin exponer datos sensibles.

---

## 10. Texto de seguridad en la landing

### Frontend
1. **Añadir sección/banner en `Landing.tsx`**:
   - Añadir banner prominente debajo de la sección hero (antes de stats) con icono Lock o ShieldCheck de lucide-react.
   - Texto a mostrar (traducible):
     ```
     Tu información está protegida
     Todos los datos se transmiten y almacenan de forma cifrada.
     No compartimos ninguna información con terceros.
     Tu privacidad es nuestra prioridad.
     ```
   - Usar claves i18n: `landing.securityBannerTitle`, `landing.securityBannerLine1`, `landing.securityBannerLine2`, `landing.securityBannerLine3`.
   - Estilo coherente con el diseño actual de la landing (fondo oscuro, tipografía clara, bordes sutiles).

---

## 11. Internacionalización (i18n)

### Regla general
Para CADA nueva funcionalidad, componente o texto añadido:
1. Definir las claves de traducción en inglés (referencia).
2. Añadir las claves a TODOS los archivos JSON en `frontend/src/i18n/`:
   - `es.json`, `en.json`, `de.json`, `fr.json`, `it.json`, `pt.json`, `nl.json`, `sv.json`, `pl.json`, `cs.json`, `da.json`, `el.json`, `fi.json`, `hu.json`, `ro.json`, `sk.json`, `sl.json`, `bg.json`, `hr.json`, `lt.json`, `lv.json`, `et.json`, `no.json`
3. Las traducciones pueden hacerse vía herramienta de traducción automática (Google Translate, DeepL) o dejarse en inglés como fallback si no se dispone de traductor nativo.
4. En el código React, usar siempre `t('clave.de.traduccion')` en lugar de texto hardcodeado.
5. En el backend, los mensajes de error que lleguen al frontend deben tener códigos, no textos literales, para que el frontend los traduzca.

### Claves nuevas necesarias (ejemplos)
- Sección Casos: `nav.cases`, `cases.title`, `cases.pending`, `cases.assigned`, `cases.closed`, `cases.assign`, `cases.close`, `cases.reject`, etc.
- Sección WhatsApp tokens: `automations.tokenExpiresIn`, `automations.refreshToken`, `automations.alertEmail`, etc.
- Banderas en chats: `chat.flagMessage`, `chat.flaggedMessages`, `chat.unflag`, etc.
- Landing seguridad: `landing.securityBannerTitle`, `landing.securityBannerLine1`, etc.

---

## 12. Análisis continuo de la aplicación

### Proceso
1. La IA revisará cada apartado de la app de forma sistemática (backend y frontend).
2. Los apartados a revisar son:
   - Inicio
   - Clientes
   - Resúmenes
   - Contratos
   - Asistente IA
   - Preparación de Defensa
   - Automatizaciones
   - Casos (nuevo apartado)
   
   Nota: Los apartados de Asesoramiento Fiscal, Cumplimiento Fiscal, Redacción y Landing NO se analizarán.
   Durante el análisis se pueden sugerir nuevos apartados para la app.
3. Por cada apartado analizado, documentará en `nuevo.md`:
   - Mejoras de UX/UI detectadas.
   - Funcionalidades faltantes comparadas con software legal estándar.
   - Optimizaciones de rendimiento.
   - Problemas de seguridad o privacidad.
   - Sugerencias de nuevas integraciones útiles para abogados.
4. El archivo `nuevo.md` actuará como backlog/product roadmap vivo.
5. Este análisis se realizará de forma incremental, apartado por apartado, sin modificar código salvo que el usuario lo autorice explícitamente.

### Formato de `nuevo.md`
Cada entrada debe seguir esta estructura:
```markdown
## [Apartado analizado]

### Fecha: YYYY-MM-DD

#### Mejoras detectadas
1. [Descripción de la mejora]
   - Prioridad: Alta/Media/Baja
   - Esfuerzo estimado: Alto/Medio/Bajo

#### Nuevas funciones sugeridas
1. [Descripción de la función]
   - Justificación: [Por qué es útil para abogados]
   - Prioridad: Alta/Media/Baja
```

---

## 13. Backlog de mejoras detectadas en análisis

> Estas mejoras fueron detectadas tras analizar cada apartado de la app. Son independientes de las 12 secciones anteriores.

---

### Inicio (Dashboard)

1. **Widget de facturación resumida** (facturas pendientes, ingresos del mes, total facturado)
   - Prioridad: Alta | Esfuerzo: Medio
   - Justificación: El módulo de facturas ya existe en Clientes. Exponerlo en el dashboard es crítico para la gestión económica diaria del bufete.

2. **Estadísticas de casos / expedientes** (activos, cerrados, por especialidad)
   - Prioridad: Alta | Esfuerzo: Medio
   - Justificación: Core para un despacho legal.
   - Las especialidades se reutilizan de Automatizaciones > Especialidades.
   - Se muestran como chips/badges: "Penal: 5", "Laboral: 4", etc.

3. **Loaders y estados de error visibles** (skeletons para stats/calendario, toasts en errores de red)
   - Prioridad: Alta | Esfuerzo: Bajo
   - Justificación: Actualmente errores silenciados y valores "0" engañosos.

4. **Tendencias y comparativas temporales** (clientes nuevos este mes vs anterior, evolución de facturación)
   - Prioridad: Media | Esfuerzo: Medio
   - Justificación: Gráfico de barras con clientes nuevos este mes vs anterior.



---

### Clientes

1. **Calendario de recordatorios/plazos por cliente**
   - Prioridad: Crítica | Esfuerzo: Alto
   - Justificación: Los abogados viven de los plazos.
   - Implementación:
     - En la tarjeta del cliente, icono de calendario 📅 a la izquierda del icono de archivos y al lado del botón "Hablar con Lyra".
     - Al pulsar, modal con lista de eventos/recordatorios en tarjetas, ordenados por fecha (más próximos primero).
     - En la esquina superior derecha del modal, botón "+" para crear nuevo evento.
     - Al crear: título, rango de fechas libre (desde-hasta), tipo (Recordatorio / Plazo legal / Audiencia / Reunión), notas opcionales.
     - Los eventos son SOLO internos de la app, no sync con Google Calendar.
     - A la izquierda del botón "Nuevo cliente" en la lista, botón "Eventos" que abre vista global de todos los eventos.
     - En la vista global: barra de búsqueda, filtro por subcuentas, ordenados por fecha (más próximos primero).

2. **Seguimiento de cobros y estados de pago**
   - Prioridad: Alta | Esfuerzo: Medio
   - Justificación: Las facturas tienen sentAt pero no estado de cobro (pendiente, parcial, pagado, impagado). No hay registro de pagos recibidos.

3. **Paginación y ordenación en listado de clientes**
   - Prioridad: Media | Esfuerzo: Bajo
   - Justificación: No hay paginación de servidor. Si una cuenta tiene >500 clientes, la carga será costosa.
   - Implementación: 20 clientes por página con botones Anterior/Siguiente.

---


### Contratos

1. **Exportar contratos a DOCX**
   - Prioridad: Alta | Esfuerzo: Medio
   - Justificación: Solo se genera PDF. Muchos abogados necesitan DOCX para seguir editando.


### Preparación de Defensa

1. **Gestión estructurada de pruebas**
   - Prioridad: Crítica | Esfuerzo: Alto
   - Justificación: Se permite soltar un PDF, pero no hay un módulo de "pruebas" donde clasificar documentos.
   - Implementación:
     - Nueva pestaña "Pruebas" dentro del chat de Defensa (al lado de "Estrategias guardadas").
     - Botón "Añadir prueba" con formulario: Tipo (Testimonio / Peritaje / Documento / Fotografía / Escrito ), Descripción, Fecha de obtención, Archivo adjunto, Número de exhibit (auto o manual).
     - Lista de pruebas con icono según tipo, número de exhibit, miniatura, estado (Pendiente / Presentada / Admitida / Excluida).
     - Al exportar estrategia a PDF, las pruebas aparecen en tabla: Nº, Tipo, Descripción, Estado.

2. **Simulación de escenarios / contrarreplicas**
   - Prioridad: Media | Esfuerzo: Medio
   - Justificación: No hay estimación probabilística de éxito ni simulación de réplicas de la contraparte.
   - Implementación:
     - Botón "Simular contrarreplica" dentro del panel de estrategias guardadas.
     - La IA genera: argumentos de la contraparte, cómo rebatirlos, score de fortaleza de la defensa.
     - Se muestra en un modal o panel lateral, sin mezclarse con el chat de preparación.

---

### Automatizaciones

1. **Horarios de atención configurables**
   - Prioridad: Alta | Esfuerzo: Medio
   - Justificación: Fuera de horario la IA no debe responder ni enviar mensajes. Solo marcar como pendientes de procesar.
   - Implementación:
     - En Email: botón "Horarios" a la izquierda del botón "Selección".
     - En WhatsApp: botón "Horarios" a la izquierda del botón "Carpetas".
     - Al pulsar, modal con: días de la semana (toggle lunes-domingo), hora inicio, hora fin.
     - La zona horaria se determina automáticamente según el país de la cuenta (ya configurado al crear la cuenta), sin selector manual.
     - Si llega mensaje fuera de horario: se guarda en la conversación como "pendiente de procesar". Cuando empiece el horario, la IA los procesa en orden.
     - No se envía ningún mensaje automático fuera de horario.

2. **Múltiples números de WhatsApp por cuenta**
   - Prioridad: Baja | Esfuerzo: Alto
   - Justificación: Poder conectar más de un número de WhatsApp Business (ej. uno para penal, otro para laboral).
   - Implementación:
     - Botón "Añadir número de WhatsApp" en Automatizaciones > WhatsApp.
     - Cada número tiene nombre personalizado ("WhatsApp Penal", "WhatsApp General").
     - Filtro en la lista de chats para seleccionar qué número se quiere ver.
     - Las conversaciones se etiquetan con el número al que llegaron.

---

### Automatizaciones — Implementación completa (Bloque de trabajo activo)

> Este bloque detalla TODAS las tareas a implementar en el apartado de Automatizaciones. Reemplaza y amplía el bloque anterior de Automatizaciones.

#### 1. Múltiples cuentas de correo de recepción
- **Problema**: En `Automations.tsx` línea 2093, el botón de añadir cuenta de correo tiene `disabled={autoData.cuentasCorreo.length >= 1}`, lo que impide añadir más de 1 cuenta.
- **Solución**:
  - **Frontend (`Automations.tsx`)**: Quitar `disabled={autoData.cuentasCorreo.length >= 1}` del botón de añadir cuenta.
  - **Backend**: Sin cambios. El modelo `Automation.cuentasCorreo` ya es un array y `processIncomingEmails` itera sobre todas las cuentas configuradas.

#### 2. Múltiples números de WhatsApp (Meta) por cuenta
- **Problema**: El modelo `Automation` tiene `whatsappSession` como objeto único, no como array. Solo se puede conectar 1 número de WhatsApp.
- **Solución**:
  - **Backend (`Automation.ts`)**: Cambiar `whatsappSession` de objeto único a array `whatsappSessions: IWhatsAppSession[]`. Cada sesión tiene: `phoneNumber`, `phoneNumberId`, `businessAccountId`, `accessToken`, `connected`, `name` (nombre personalizado), `tokenExpiresAt`, `tokenType`.
  - **Backend (`whatsappService.ts`)**: Actualizar `findAccountByPhoneNumberId` para buscar en el array `whatsappSessions`. Actualizar `connectMetaWithToken`, `connectMetaManual`, `disconnectWhatsApp` para trabajar con array.
  - **Backend (`whatsappController.ts`)**: Webhook debe procesar mensajes de todos los `phoneNumberId` configurados (ya lo hace, pero verificar que funcione con array).
  - **Frontend (`Automations.tsx`)**: Añadir UI para añadir/eliminar/renombrar sesiones de WhatsApp. Cada sesión tiene nombre personalizado ("WhatsApp Penal", "WhatsApp General").
  - **Filtro de chats**: Dropdown en panel de conversaciones de WhatsApp para filtrar por número de la empresa configurado.

#### 3. No crear clientes duplicados
- **Problema**: Las funciones `assignCase`, `assignCaseToSubaccount` (emailProcessorService.ts) y `assignWhatsAppCase`, `assignWhatsAppCaseToSubaccount` (whatsappService.ts) siempre hacen `Client.create()` sin verificar si ya existe un cliente con ese email o teléfono.
- **Solución**:
  - **Backend (`emailProcessorService.ts` y `whatsappService.ts`)**: Crear función `findOrCreateClient(accountId, email?, phone?, name?)` que:
    1. Normalice el teléfono (quitar espacios, guiones, caracteres no numéricos, mantener prefijo país).
    2. Busque cliente existente por `email` + `accountId` (para email) o `phone` normalizado + `accountId` (para WhatsApp).
    3. Si existe → incrementa `cases` en 1, actualiza `assignedSubaccountId` si aplica, retorna el cliente existente.
    4. Si no existe → crea nuevo cliente con `Client.create()`, `cases: 1`, `status: 'abierto'`, `autoCreated: true`.
  - Reemplazar todas las llamadas a `Client.create()` en las funciones de asignación por `findOrCreateClient()`.

#### 4. Caso + cliente siempre vinculados
- **Problema**: Cuando se crea un caso automáticamente, no siempre se vincula correctamente al cliente mediante `linkedClientId`.
- **Solución**:
  - **Backend (`emailProcessorService.ts`)**: En `assignCase` y `assignCaseToSubaccount`, tras obtener/crear el cliente, pasar su `_id` a `createCaseFromEmail` para que se guarde como `linkedClientId`.
  - **Backend (`whatsappService.ts`)**: En `assignWhatsAppCase`, tras obtener/crear el cliente, actualizar el caso con `linkedClientId`.
  - **Backend (`casesService.ts`)**: Asegurar que `createCaseFromEmail` y `createCaseFromWhatsApp` acepten y guarden `linkedClientId`.

#### 5. Filtro de conversaciones de email por cuenta de correo configurada
- **Problema**: No hay forma de filtrar las conversaciones de email por la cuenta de correo de recepción a la que llegaron.
- **Solución**:
  - **Frontend (`Automations.tsx`)**: Añadir dropdown en el panel de conversaciones de email (junto al filtro de carpetas) que muestre las cuentas de correo configuradas (`autoData.cuentasCorreo`). Al seleccionar una, filtrar conversaciones por las que llegaron a esa cuenta.
  - **Nota**: Las conversaciones de email necesitan un campo que indique a qué cuenta de correo llegaron. Verificar si ya existe (`cuentaCorreoId` o similar en la conversación). Si no existe, añadirlo.

#### 6. Filtro de conversaciones de WhatsApp por número de la empresa
- **Problema**: No hay forma de filtrar las conversaciones de WhatsApp por el número de la empresa al que llegaron.
- **Solución**:
  - **Frontend (`Automations.tsx`)**: Añadir dropdown en el panel de conversaciones de WhatsApp que muestre los números de WhatsApp configurados (`autoData.whatsappSessions`). Al seleccionar uno, filtrar conversaciones por las que llegaron a ese número.
  - **Nota**: Las conversaciones de WhatsApp necesitan un campo que indique a qué número llegaron (`phoneNumberId` o similar). Actualmente, la interfaz `IWhatsAppConversation` en `Automation.ts` NO tiene el campo `phoneNumberId`. La estructura actual es:
    ```typescript
    export interface IWhatsAppConversation {
      id: string;
      contactName: string;
      contactPhone: string;
      messages: IWhatsAppMessage[];
      lastMessageTime: string;
      unread: number;
      autoReplyPaused?: boolean;
    }
    ```
    Por tanto, antes de implementar el filtro, hay que:
    1. Añadir `phoneNumberId?: string` a la interfaz `IWhatsAppConversation` en `Automation.ts`.
    2. Añadir `phoneNumberId: String` al schema `waConversationSchema` en `Automation.ts`.
    3. Asegurar que cuando se crea una conversación de WhatsApp (en `whatsappService.ts`, función `processOneIncomingMetaMessage`), se guarde el `phoneNumberId` del mensaje entrante en la conversación.
    4. Las conversaciones existentes que no tengan este campo se tratarán como "sin número asignado" y no aparecerán en ningún filtro específico hasta que reciban un nuevo mensaje.

#### 7. Casos por subcuenta
- **Problema**: Actualmente `getCases` devuelve todos los casos de una cuenta. Las subcuentas deberían ver solo sus casos asignados.
- **Solución**:
  - **Backend (`casesController.ts`)**:
    - En `getCases`: Detectar si `req.user.type === 'subaccount'`. Si es subcuenta, filtrar por `assignedSubaccountId === req.user.userId`. Si es cuenta principal, devolver todos los casos del `accountId`.
    - En `createManualCase`: Si `req.user.type === 'subaccount'`, asignar automáticamente el caso a esa subcuenta (`assignedSubaccountId = req.user.userId`, `assignedSubaccountName = req.user.email`).
  - **Frontend (`Cases.tsx`)**: El botón de crear caso se mantiene visible para todos. El backend se encarga de la asignación automática. Los controles de asignación manual (dropdown de abogados) solo se muestran para casos `pending` y si el usuario es cuenta principal.

---

### Flujo de funcionamiento general

**Email/WhatsApp entrante → pide abogado:**
1. Llega mensaje → se clasifica (consulta_general / solicitud_servicio / otro)
2. Si es `solicitud_servicio` y `autoAssignEnabled = true`:
   - Se busca cliente existente por email/teléfono + accountId (`findOrCreateClient`)
   - Si existe → se reutiliza (incrementa `cases`). Si no → se crea nuevo (`autoCreated: true`)
   - Se crea caso vinculado al cliente (`linkedClientId`)
   - Se asigna a subcuenta por especialidad si hay match
3. Si es `solicitud_servicio` y `autoAssignEnabled = false`:
   - Se crea caso con `status: 'pending'`
   - Se vincula al cliente (existente o nuevo)
   - Queda a la espera de asignación manual desde "Casos"

**Subcuenta entra en Casos:**
1. Backend detecta `type === 'subaccount'` en el token JWT
2. Filtra casos por `assignedSubaccountId === userId`
3. Solo ve los casos asignados a sí misma
4. Si crea caso nuevo → se auto-asigna automáticamente

**Filtros de conversaciones:**
1. Usuario selecciona cuenta de correo o número de WhatsApp en dropdown
2. Lista de conversaciones se filtra mostrando solo las que llegaron a esa cuenta/número

---

### WhatsApp Meta: Tokens y Alertas — Implementación completa (Bloque 7)

> Este bloque detalla la implementación del Bloque 7 del plan técnico: gestión de tokens de WhatsApp Meta con renovación manual y alertas.

#### 1. Campo `alertEmail` por sesión de WhatsApp
- **Problema**: Cada sesión de WhatsApp necesita su propio email de alerta para notificar expiración de token.
- **Solución**:
  - **Backend (`Automation.ts`)**: Añadir campo `alertEmail?: string` a la interfaz `IWhatsAppSession` y al schema `whatsappSessionSchema`.
  - **Backend (`whatsappService.ts`)**: Aceptar `alertEmail` en las funciones de conexión (`connectMetaManual`, `connectMetaWithToken`, `connectMetaWithCode`).
  - **Frontend (`Automations.tsx`)**: Añadir input para configurar `alertEmail` en el formulario de añadir sesión y en la tarjeta de cada sesión existente.

#### 2. Renovación manual de token
- **Problema**: No existe forma de renovar tokens de WhatsApp sin reconectar completamente.
- **Solución**:
  - **Backend (`whatsappService.ts`)**: Crear función `refreshWhatsAppToken(accountId: string, phoneNumberId: string)`:
    1. Obtener la sesión actual por `phoneNumberId`.
    2. Usar el endpoint de Meta `fb_exchange_token` para intercambiar el token actual por uno nuevo long-lived.
    3. Actualizar `accessToken`, `tokenExpiresAt` (+60 días), `tokenType: 'long'`.
    4. Retornar `{ success: boolean, newExpiresAt: string, error?: string }`.
  - **Backend (`whatsappController.ts`)**: Crear endpoint `POST /api/whatsapp/refresh-token` que acepte `{ accountId, phoneNumberId }`.
  - **Backend (`whatsappRoutes.ts`)**: Registrar la nueva ruta.
  - **Frontend (`Automations.tsx`)**: Añadir botón "Renovar token" en cada sesión del modal de sesiones. Al hacer clic, llamar al endpoint y actualizar la UI.

#### 3. Indicador visual de estado del token
- **Problema**: No hay feedback visual sobre el estado de expiración del token.
- **Solución**:
  - **Frontend (`Automations.tsx`)**: En la tarjeta de cada sesión del modal:
    - Calcular `daysRemaining` desde `tokenExpiresAt`.
    - Si `daysRemaining > 14`: indicador verde (OK).
    - Si `7 < daysRemaining <= 14`: indicador amarillo (warning).
    - Si `daysRemaining <= 7`: indicador rojo (crítico).
    - Si token expirado (`daysRemaining < 0`): indicador rojo + texto "Expirado".
    - Mostrar texto "X días restantes" junto al indicador.

#### 4. Endpoint de estado de token
- **Problema**: No hay endpoint dedicado que devuelva información de expiración de tokens.
- **Solución**:
  - **Backend (`whatsappController.ts`)**: Crear endpoint `GET /api/whatsapp/token-status?accountId=...&phoneNumberId=...` que devuelva:
    ```json
    {
      "phoneNumberId": "string",
      "connected": true,
      "tokenType": "long",
      "expiresAt": "2026-06-29T00:00:00.000Z",
      "daysRemaining": 45,
      "status": "ok" | "warning" | "critical" | "expired"
    }
    ```
  - **Backend (`whatsappRoutes.ts`)**: Registrar la nueva ruta.

#### 5. Flujo de renovación manual
1. Usuario ve sesión con token próximo a expirar (indicador amarillo/rojo).
2. Hace clic en botón "Renovar token".
3. Backend intenta renovar token vía Meta API (`fb_exchange_token`).
4. Si éxito → actualiza sesión, frontend muestra nuevo `tokenExpiresAt` y indicador verde.
5. Si fallo → muestra error "No se pudo renovar. Reconecta manualmente."

#### 6. Flujo de token expirado
1. Usuario ve sesión con indicador rojo + texto "Expirado".
2. Puede intentar renovar (puede fallar si el token es demasiado antiguo).
3. Si renovación falla → debe reconectar manualmente con nuevo token.
