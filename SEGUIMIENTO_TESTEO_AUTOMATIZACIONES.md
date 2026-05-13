# Seguimiento de testeo de automatizaciones

Fecha de arranque: 2026-05-04

## Objetivo activo

- Crear tests amplios del apartado de Automatizaciones.
- Crear un script/suite de Stripe lo mas realista y completo posible.
- Actualizar documentacion despues con bloque de testeo en `holafinal.md`.
- No ejecutar tests por ahora; solo crearlos.

## Restriccion activa

- El usuario ha pedido expresamente no ejecutar ningun test en esta fase.

## Infraestructura ya confirmada

- Backend usa Vitest con `npm test` y `npm run test:integration` desde `backend/`.
- Frontend usa Vitest propio en `frontend/`.
- Ya existen referencias de estilo en `backend/src/test/stripe.test.ts` y `backend/src/test/stripe.integration.test.ts`.
- La configuracion de integracion backend vive en `backend/vitest.integration.config.ts`.

## Superficie de automatizaciones ya analizada

### Email

- Rutas en `backend/src/routes/automatizacionesRoutes.ts`.
- Controller principal en `backend/src/controllers/automatizacionesController.ts`.
- Procesado en `backend/src/services/emailProcessorService.ts`.
- Mensajeria automatica/i18n en `backend/src/services/automationMessages.ts`.

### WhatsApp

- Rutas en `backend/src/routes/whatsappRoutes.ts`.
- Controller en `backend/src/controllers/whatsappController.ts`.
- Servicio en `backend/src/services/whatsappService.ts`.

### Calendar

- Rutas en `backend/src/routes/calendarRoutes.ts`.
- Controller en `backend/src/controllers/calendarController.ts`.

### Frontend

- UI principal en `frontend/src/pages/Automations.tsx`.

## Hallazgos funcionales ya consolidados para automatizaciones

- Falta la ruta backend de sync manual de calendar.
- `getSubcuentas` devuelve todas las subcuentas si falta `accountId`.
- `GET /automatizaciones` expone secretos internos de Email y WhatsApp.
- El modal de sesiones de WhatsApp tiene mismatch de shape y rutas entre frontend y backend.
- En multi-numero WhatsApp se puede responder desde la sesion equivocada.
- El envio manual de email puede pintarse como enviado aunque falle backend.
- `refresh-token` y `token-status` de WhatsApp no validan ownership.
- El envio manual de WhatsApp depende de `instanceName` legacy y puede fallar aunque la cuenta aparezca conectada.
- Desconectar un numero de WhatsApp puede dejar `whatsappSession` legacy incoherente.
- El envio manual de WhatsApp no es atomico y puede dejar mensajes fantasma o archivos huerfanos.
- El polling de Email puede quedar vivo al borrar la ultima cuenta.
- El token de WhatsApp puede marcarse falsamente como long-lived durante 60 dias.
- `alertEmail` de WhatsApp se guarda pero no dispara alertas reales.
- La confirmacion de asignacion por email puede duplicar casos.
- La asignacion automatica de casos de WhatsApp puede dejar casos `assigned` sin abogado persistido.
- El envio manual de Email mezcla fallo operativo de SMTP con recurso inexistente y termina devolviendo 404 falso.
- `alertEmail` de las sesiones de WhatsApp no hace roundtrip completo entre UI y backend aunque exista el campo en pantalla.

## Riesgos de testeo ya detectados

- `emailProcessorService.ts` tiene side effects al importar y timers.
- Hay partes relevantes encapsuladas en funciones privadas, asi que la cobertura total exigira mezcla de unit tests y tests de controlador.
- Hay dependencias externas pesadas: IMAP/SMTP, Meta Graph API, Google Calendar, OpenAI/Atlas.
- Varias rutas usan `multer` y escritura a disco; conviene mockear o aislar esos flujos.

## Estrategia decidida

- Empezar por tests backend de helpers/controladores que no arrastren timers ni proveedores externos.
- Añadir despues tests de flujo con mocks para email/WhatsApp/calendar.
- Mantener aparte la capa realista de Stripe como suite o runner dedicado.

## Archivos ya creados en esta fase

- `backend/src/test/automations.unit.test.ts`
- `backend/src/test/automations.controller.test.ts`
- `backend/src/test/email.automation-flows.test.ts`
- `backend/src/test/whatsapp.automation-flows.test.ts`
- `backend/src/test/stripe.scenario.test.ts`

## Cobertura inicial ya escrita

- Helpers de `automationMessages.ts`:
  - mapeo de pais a idioma
  - interpolacion de mensajes
  - deteccion por modelo
  - cache de deteccion
  - fallback a pais de cuenta
  - fallback final a espanol
- Handlers de token de `whatsappController.ts`:
  - validacion de parametros requeridos
  - propagacion de errores del servicio
  - payload de exito en refresh
  - 404 cuando no existe la sesion
  - devolucion del estado bruto cuando existe
- Controladores de `automatizacionesController.ts`:
  - `getData` con validacion basica
  - `createEspecialidad`
  - `createCuentaCorreo` custom
  - `getSubcuentas` con cuenta valida
- Controladores de `calendarController.ts`:
  - `getEvents`
  - `syncCalendar`
- Flujos profundos de Email:
  - `processIncomingEmails` con switch desactivado y marcado de UIDs
  - respuesta diferida desde KB
  - creacion de confirmacion de asignacion antes de asignar caso
  - rollback de `sendManualEmail` si falla SMTP
  - limpieza de pendientes y cliente auto-creado al borrar conversacion
- Flujos profundos de WhatsApp:
  - almacenamiento de entrantes con automatizacion desactivada
  - respuesta automatica desde KB
  - creacion de confirmacion de asignacion
  - bloqueo del envio manual fuera de la ventana de 24 horas y limpieza de archivos
  - tests de contrato pendientes para shape de sesiones y ownership en token endpoints
- Suite de escenarios Stripe:
  - `createPaymentIntent` sin auto renovacion para las 4 combinaciones de plan/intervalo
  - `createPaymentIntent` con auto renovacion y trial activo para las 4 combinaciones
  - `confirmPayment` para las 4 combinaciones de plan/intervalo
  - `validateSubscription` para expiracion

## Documentacion ya actualizada

- `holafinal.md` ya incluye el bloque `testeo`.
- `holafinal.md` ya incluye dos fallos nuevos confirmados durante esta fase:
  - envio manual de Email devolviendo 404 falso cuando falla SMTP
  - `alertEmail` de WhatsApp sin roundtrip completo entre UI y backend

## Proximos archivos previstos

- `backend/src/test/automations.routes-shape.test.ts` o equivalente
- `backend/src/test/automations.integration-shape.test.ts` o equivalente
- script runner adicional de Stripe si se quiere flujo CLI separado de Vitest

## Notas para retomar sin reanalizar

- No ejecutar nada todavia; solo seguir creando archivos.
- Si la conversacion se compacta, continuar desde esta secuencia:
  1. cubrir shapes integrados frontend-backend que siguen rotos en WhatsApp y Calendar
  2. decidir si conviene separar tests de contrato actualmente fallidos en un archivo propio
  3. ampliar cobertura de email/whatsapp sobre adjuntos, ownership y rutas de descarga
  4. crear script runner adicional de Stripe si hace falta fuera de Vitest