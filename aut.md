# Analisis de Automatizaciones

## Alcance

- Revision solo de codigo del apartado Automatizaciones.
- Sin cambios en codigo de la app.

## Errores confirmados

1. Creacion automatica de clientes rota en automatizaciones Email y WhatsApp.

- Archivos: `backend/src/services/emailProcessorService.ts`, `backend/src/services/whatsappService.ts`, `backend/src/models/Client.ts`.
- Explicacion sencilla: cuando entra un cliente nuevo por Email o por WhatsApp, el sistema intenta crearlo, pero lo hace dejando fuera un dato obligatorio. Eso hace que el alta pueda romperse justo en el momento de guardar al cliente.
- Solucion: hacer que la creacion automatica de clientes genere y guarde siempre un `_id` valido antes de llamar a `Client.create(...)`, o reutilizar el mismo mecanismo de alta que ya usa el resto del sistema cuando crea clientes correctamente.
- Motivo tecnico: ambos `findOrCreateClient(...)` llaman a `Client.create(...)` sin enviar `_id`, pero el modelo `Client` exige `_id: string` obligatorio.
- Impacto: cuando entra un contacto nuevo y la automatizacion necesita crear cliente/caso, el flujo puede fallar antes de persistir el cliente.

2. `autoClientId` de conversaciones Email guarda un id ficticio, no el id real del cliente.

- Archivo: `backend/src/services/emailProcessorService.ts`.
- Explicacion sencilla: la conversacion de Email se queda apuntando a un cliente inventado, mientras que el caso real se crea con otro id distinto. Es como poner una etiqueta falsa en la ficha.
- Solucion: guardar en `conv.autoClientId` solo el `_id` real devuelto por `findOrCreateClient(...)` y eliminar cualquier id temporal generado con `Date.now()`.
- Motivo tecnico: en `assignCaseToSubaccount(...)` y `assignCase(...)` se genera `const clientId = Date.now().toString()` y se guarda en `conv.autoClientId` antes de llamar a `findOrCreateClient(...)`, pero luego se usa `client._id` real para el caso.
- Impacto: la conversacion queda enlazada a un id que no corresponde al cliente real; la limpieza posterior por `autoClientId` no es fiable.

3. Las respuestas manuales de Email salen sin cabeceras de hilo.

- Archivos: `backend/src/services/emailProcessorService.ts`, `backend/src/services/emailService.ts`, `backend/src/models/Automation.ts`.
- Explicacion sencilla: cuando alguien responde manualmente a un correo desde Automatizaciones, ese correo puede salir como si fuera una conversacion nueva en vez de continuar el hilo original.
- Solucion: almacenar el `messageId`, `inReplyTo` y `references` del correo original y pasarlos siempre a `replyToEmail(...)` para que la respuesta salga dentro del hilo correcto.
- Motivo tecnico: `sendManualEmail(...)` llama a `replyToEmail(...)` con `inReplyTo` y `references` como `undefined`, y el modelo de mensajes/conversaciones no conserva `messageId` ni `references` del correo original.
- Impacto: la respuesta manual puede salir como correo nuevo fuera del hilo real del cliente.

4. El envio manual de WhatsApp no es atomico y puede dejar historial falso.

- Archivos: `backend/src/controllers/whatsappController.ts`, `backend/src/services/whatsappService.ts`.
- Explicacion sencilla: si se mandan varios mensajes o archivos juntos por WhatsApp y uno falla a mitad, el sistema puede dejar el historial diciendo que no se envio nada, aunque el cliente si haya recibido una parte.
- Solucion: registrar cada envio con estado individual (`pendiente`, `enviado`, `fallido`) y confirmar en base solo lo que realmente haya aceptado Meta, en vez de hacer un rollback total del lote.
- Motivo tecnico: `sendWhatsAppMessage(...)` persiste primero todos los mensajes salientes y despues envia texto/adjuntos uno a uno a Meta. Si falla un envio intermedio, hace rollback local completo aunque algun texto o archivo anterior ya se haya enviado de verdad.
- Impacto: la base queda diciendo que no se envio nada aunque el cliente si haya recibido una parte del lote.

5. La conexion manual de WhatsApp falsea la vida del token.

- Archivo: `backend/src/services/whatsappService.ts`.
- Explicacion sencilla: cuando se conecta WhatsApp metiendo el token a mano, el sistema da por hecho que ese token dura 60 dias aunque en realidad podria caducar mucho antes.
- Solucion: validar el token manual contra Meta antes de guardarlo y persistir la caducidad real devuelta por la API; si no se puede conocer, marcarlo como caducidad desconocida y no inventarla.
- Motivo tecnico: `connectMetaManual(...)` guarda siempre `tokenType: 'long'` y `tokenExpiresAt = ahora + 60 dias` sin verificar la caducidad real del token introducido manualmente.
- Impacto: el estado de token, los avisos visuales y las alertas pueden ser incorrectos desde el primer momento.

6. La UI de Automatizaciones tiene varias acciones que pueden mentir si el backend responde 4xx/5xx.

- Archivos: `frontend/src/pages/Automations.tsx`, `frontend/src/lib/authFetch.ts`.
- Explicacion sencilla: hay botones y cambios visuales que parecen haberse guardado, pero realmente no se han guardado si el servidor responde con error. La pantalla puede decir una cosa y la base tener otra.
- Solucion: en cada accion de la UI comprobar siempre `res.ok` antes de tocar el estado local y, si falla, mantener el estado anterior y mostrar un error claro al usuario.
- Motivo tecnico: `authFetch(...)` devuelve `Response` aunque venga con error HTTP, pero varias acciones actualizan estado local sin comprobar `res.ok` ni revertirlo.
- Casos confirmados:
	- `toggleConvAutoReply(...)` en Email.
	- borrado/asignacion/eliminacion local de carpetas de Email.
	- borrado local de reglas de clasificacion de Email.
	- `toggleWaSwitch(...)`, `toggleWaSeleccion(...)`, `markWaRead(...)` en WhatsApp.
	- `handleDisconnectCalendar(...)` en Calendario.
- Impacto: la pantalla puede mostrar cambios aplicados aunque el backend los haya rechazado.

7. Las consultas manuales de WhatsApp dependen silenciosamente de tener una cuenta de correo de Automatizaciones.

- Archivo: `backend/src/services/whatsappService.ts`.
- Explicacion sencilla: si una cuenta trabaja solo con WhatsApp y no tiene un correo configurado dentro de Automatizaciones, el sistema deja de reenviar consultas por email aunque el usuario haya configurado destinatarios para ello.
- Solucion: desacoplar ese flujo de `cuentasCorreo`, permitiendo usar un remitente alternativo valido o avisando claramente en configuracion que falta una cuenta de correo obligatoria antes de activar esa funcion.
- Motivo tecnico: `forwardWhatsAppToConsultas(...)` siempre usa `const cuentaCorreo = (account.cuentasCorreo || [])[0]`; si no existe una cuenta de correo configurada, aborta y no reenvia nada aunque haya `whatsappCorreosConsultas` configurados.
- Impacto: el flujo de derivar consultas de WhatsApp por email no funciona en cuentas que solo usan WhatsApp.

8. Las alertas de caducidad de token de WhatsApp no usan las cuentas de correo del propio modulo de Automatizaciones.

- Archivos: `backend/src/services/whatsappAlertScheduler.ts`, `backend/src/services/emailService.ts`.
- Explicacion sencilla: el aviso de que el token de WhatsApp va a caducar no sale por el correo que configuras en Automatizaciones, sino por una configuracion antigua distinta. Por eso puede parecer todo bien configurado y aun asi no llegar ningun aviso.
- Solucion: hacer que el scheduler use directamente las cuentas de correo de `Automation.cuentasCorreo` o una configuracion unificada, eliminando la dependencia de `EmailConfig` legacy para este modulo.
- Motivo tecnico: el scheduler llama a `sendEmail(accountId, ...)`, y `sendEmail(...)` tira de `EmailConfig` legacy/fiscal, no de `Automation.cuentasCorreo`.
- Impacto: puedes configurar `alertEmail` en WhatsApp y seguir sin recibir nada si no existe esa configuracion legacy aparte.

9. Las respuestas desde Email hacia pendientes de WhatsApp pueden salir por el numero equivocado.

- Archivo: `backend/src/services/emailProcessorService.ts`.
- Explicacion sencilla: si el despacho tiene varios numeros de WhatsApp conectados, una respuesta que se lanza desde Email puede acabar saliendo por el numero que no toca.
- Solucion: resolver siempre la sesion exacta del pending usando `phoneNumberId` o la conversacion original de WhatsApp, y no depender del campo legacy `whatsappSession` para estos envios.
- Motivo tecnico: `sendWhatsAppReplyFromPending(...)` usa solo `account.whatsappSession` legacy para decidir `phoneNumberId` y token, sin resolver la sesion real de la conversacion/pending.
- Impacto: en cuentas con varios numeros de WhatsApp, una respuesta manual enviada desde el correo de consultas puede salir por otro numero o fallar aunque el numero correcto siga conectado.

10. Si falla el envio Email -> WhatsApp de una consulta pendiente, el pendiente se borra igualmente.

- Archivo: `backend/src/services/emailProcessorService.ts`.
- Explicacion sencilla: si el sistema intenta mandar una respuesta a WhatsApp y falla, en vez de dejar el pendiente para reintentarlo lo borra como si todo hubiese ido bien.
- Solucion: solo eliminar el pending cuando `sendWhatsAppReplyFromPending(...)` confirme exito; si falla, conservarlo con estado de error y registrar el motivo para poder reintentarlo.
- Motivo tecnico: en `processConsultaReply(...)`, tras intentar `sendWhatsAppReplyFromPending(...)`, el `catch` solo hace log y luego siempre ejecuta `account.pendingConsultas.splice(pendingIdx, 1)`.
- Impacto: si Meta rechaza el mensaje por numero incorrecto, token invalido o ventana de 24 horas, la instruccion manual se pierde y el despacho ya no tiene el pendiente para reintentarlo.

11. Las respuestas programadas de Email pueden salir desde una cuenta equivocada o descartarse silenciosamente.

- Archivos: `backend/src/controllers/automatizacionesController.ts`, `backend/src/services/emailProcessorService.ts`.
- Explicacion sencilla: una respuesta automatica que estaba pendiente puede terminar saliendo desde otro correo del despacho distinto al original, o incluso desaparecer sin haberse enviado.
- Solucion: fijar de forma estricta la cuenta emisora original en cada `pendingReply`; si ya no existe, dejar el pendiente en error y avisar, pero nunca reenviarlo automaticamente desde otra cuenta ni marcarlo como enviado.
- Motivo tecnico: al procesar `pendingReplies`, el sistema intenta primero la cuenta original, luego la de la conversacion y finalmente la cuenta por defecto. Si la cuenta original fue borrada, puede reenviar desde otra distinta sin avisar; si ya no queda ninguna, marca el pending como eliminado igualmente (`sentIds.push(reply.id)`).
- Impacto: una respuesta automatica diferida puede salir desde el buzon equivocado o desaparecer sin haberse enviado realmente.

12. Las carpetas de WhatsApp pierden su color al persistirse.

- Archivos: `frontend/src/pages/Automations.tsx`, `backend/src/controllers/whatsappController.ts`, `backend/src/models/Automation.ts`.
- Explicacion sencilla: el usuario crea una carpeta de WhatsApp con un color, la ve bien al principio, pero al recargar desaparece ese color porque nunca se guardo de verdad.
- Solucion: anadir `color` al `waFolderSchema` y validar ese campo en backend para que se persista y vuelva intacto al recargar.
- Motivo tecnico: la UI crea y renderiza carpetas con `color`, y el controller guarda ese campo al crear la carpeta, pero el schema `waFolderSchema` no define `color`, asi que Mongo lo descarta.
- Impacto: tras recargar, las carpetas vuelven sin color y la UI queda inconsistente con lo que el usuario acaba de crear.

13. La conexion OAuth de WhatsApp puede enlazar el numero equivocado cuando Meta tiene varios numeros o varias WABA.

- Archivo: `backend/src/services/whatsappService.ts`.
- Explicacion sencilla: si la cuenta de Meta tiene varios numeros, Automatizaciones puede quedarse con el primero que encuentre y no con el que el usuario queria conectar.
- Solucion: recoger y persistir el `wabaId` y `phoneNumberId` realmente seleccionados en el flujo de conexion, y usarlos de forma explicita en backend en lugar de tomar siempre el primer elemento.
- Motivo tecnico: tanto en `connectMetaWithCodeInternal(...)` como en `connectMetaWithToken(...)` el backend se queda siempre con `data[0]` para la WABA y con `phone_numbers.data[0]` para el numero, en vez de usar la seleccion real hecha por el usuario en Meta.
- Impacto: el usuario puede completar la conexion pensando que ha elegido un numero concreto y terminar con otro distinto enlazado en Automatizaciones.

14. Email mezcla conversaciones de distintos buzones si escribe el mismo remitente.

- Archivo: `backend/src/services/emailProcessorService.ts`.
- Explicacion sencilla: si el mismo cliente escribe a dos correos distintos del despacho, el sistema puede mezclar ambos hilos como si fueran una sola conversacion.
- Solucion: identificar las conversaciones al menos por `contactEmail + cuentaCorreoId` y, si hace falta, reforzarlo con datos del hilo o del asunto para que cada buzon mantenga su propia conversacion.
- Motivo tecnico: `addToConversation(...)` y otras comprobaciones (`existingConv`, `known contact`, etc.) localizan conversaciones solo por `contactEmail === email.from`, sin separar por `cuentaCorreoId` ni por asunto.
- Impacto: si un mismo cliente escribe a dos cuentas de correo distintas del despacho, todo cae en una sola conversacion, se pisa `cuentaCorreoId`, el filtro por cuenta deja de ser fiable y las respuestas manuales/diferidas pueden salir desde el buzon equivocado.

15. Las confirmaciones pendientes de Email se correlacionan de forma ambigua para un mismo remitente.

- Archivo: `backend/src/services/emailProcessorService.ts`.
- Explicacion sencilla: si un mismo cliente tiene varias confirmaciones pendientes por Email, el sistema puede enganchar la respuesta a la solicitud equivocada.
- Solucion: usar siempre un identificador unico fuerte en asunto o cabeceras, guardarlo en el pending y resolver la respuesta solo por ese identificador, nunca por coincidencias debiles del remitente o del asunto.
- Motivo tecnico: `processOneEmail(...)` activa el flujo de confirmacion con solo encontrar algun `pendingConsultas` del mismo `originalFrom`, y `processConsultaReply(...)` remata buscando por `subject.includes(p.originalSubject)` cuando no hay un id fuerte en el asunto.
- Impacto: si un mismo cliente tiene varias solicitudes/casos pendientes, una respuesta puede aplicarse al pending equivocado.

16. La confirmacion de asignacion automatica en WhatsApp queda huérfana y no puede resolverse.

- Archivo: `backend/src/services/whatsappService.ts`.
- Explicacion sencilla: el sistema lanza la pregunta de confirmacion por WhatsApp, pero luego no sabe encontrar esa confirmacion cuando el cliente responde. Es decir, crea la tarea pendiente, pero la deja mal enlazada.
- Solucion: al guardar el pending de WhatsApp persistir siempre `waConversationId` y/o `waContactPhone` con el mismo formato que luego usa el buscador, o adaptar `findPendingWhatsAppConfirmation(...)` para que tambien resuelva por `conversationId`.
- Motivo tecnico: al crear el pending de tipo `confirmacion_asignacion`, el codigo guarda `conversationId`, pero no rellena `waConversationId` ni `waContactPhone`. Despues `findPendingWhatsAppConfirmation(...)` solo busca por esos dos campos y nunca por `conversationId` simple.
- Impacto: cuando el cliente responde al mensaje de confirmacion por WhatsApp, el flujo no encuentra el pending, no ejecuta la asignacion/confirmacion esperada y la automatizacion sigue por un camino incorrecto.

## Dudas funcionales

_Sin dudas por ahora._