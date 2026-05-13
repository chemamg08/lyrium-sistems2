# Auditoria de produccion

Nota de organizacion:

- Se mantiene la numeracion original de los hallazgos para no romper referencias previas.
- Se ha priorizado la agrupacion tematica sobre el orden cronologico de deteccion.

Hallazgos:

## Bloque 1. Plataforma, acceso, sesiones y seguridad base

2. Fallo: la restauracion de sesion esta rota y el usuario puede quedar expulsado visualmente aunque siga autenticado por cookies.
Motivo: el frontend protege rutas con `sessionStorage.getItem('userId')` en `frontend/src/components/AppLayout.tsx` y `frontend/src/pages/AdminPanel.tsx`, mientras que la renovacion real de sesion vive en cookies httpOnly y solo se intenta desde `frontend/src/lib/authFetch.ts` cuando una peticion devuelve 401. Si el navegador se cierra o se pierde `sessionStorage`, la app redirige antes de intentar recuperar la sesion.
Solucion: la app debe reconstruir la sesion desde backend al arrancar, en lugar de depender de `sessionStorage` como fuente principal de autenticacion.
Explicacion tecnica: crea un endpoint tipo `/accounts/me` o usa `/accounts/refresh` al iniciar la app, hidrata el estado de usuario desde la respuesta y cambia los guards para depender de ese estado. `sessionStorage` puede quedarse solo para preferencias o cache de UI, no para decidir si un usuario esta autenticado.

7. Fallo: la activacion inicial del 2FA es publica y se puede disparar solo con `userId` y `userType`.
Motivo: `backend/src/routes/accountsRoutes.ts` expone `POST /accounts/setup-2fa` y `POST /accounts/verify-2fa-setup` sin autenticacion. En `backend/src/controllers/accountsController.ts`, ambas funciones operan directamente sobre el usuario indicado por `userId`. En `frontend/src/pages/Setup2FA.tsx` ese `userId` viaja en la URL.
Solucion: la fase de setup de 2FA debe requerir una prueba temporal de identidad, no solo un identificador de usuario.
Explicacion tecnica: despues de registro o login sin 2FA, emite un token temporal firmado y de vida corta para el flujo de setup, y valida ese token en vez de confiar en `userId` de query/body. Ademas, evita poner identificadores sensibles en la URL cuando no sean imprescindibles.

8. Fallo: la verificacion de email pierde valor porque el backend devuelve al navegador el `emailVerificationToken` del alta.
Motivo: `createAccount` en `backend/src/controllers/accountsController.ts` responde con `newAccount.toJSON()` y solo elimina `password`. El modelo `backend/src/models/Account.ts` no limpia `emailVerificationToken`, `emailVerificationExpires` ni otros campos sensibles en `toJSON`.
Solucion: el frontend no debe recibir tokens internos de verificacion, recuperacion o seguridad.
Explicacion tecnica: crea una respuesta segura explicita para registro, por ejemplo `{ id, name, email, country }`, y elimina del `toJSON` del modelo todos los campos sensibles: tokens de verificacion, reset, secretos 2FA, recovery codes, intentos fallidos y datos internos similares.

13. Fallo: la app usa de forma masiva IDs basados en `Date.now().toString()`, lo que hace muchos recursos faciles de adivinar.
Motivo: hay decenas de creaciones con IDs temporales en `accountsController`, `casesController`, `clientsController`, `chatsController`, `documentSummariesController`, `contractsChatController`, `fiscalController`, `subscriptions.ts` y otros modulos. Cuando esto se combina con rutas publicas o checks de ownership ausentes, la superficie de enumeracion crece mucho.
Solucion: los identificadores externos deben ser aleatorios y no secuenciales.
Explicacion tecnica: sustituye los IDs sensibles expuestos fuera del backend por UUID v4 o tokens criptograficamente aleatorios. Mantener IDs predecibles no rompe por si solo todos los flujos, pero amplifica cualquier fallo de autorizacion y facilita ataques de scraping o enumeracion.

16. Fallo: el middleware de autenticacion falla en modo abierto si la comprobacion de cuenta desactivada da error.
Motivo: en `backend/src/middleware/auth.ts`, `checkAccountDisabled` captura cualquier error y ejecuta `next()` igualmente. Eso significa que una incidencia en la lectura de cuenta puede dejar pasar usuarios que deberian estar bloqueados.
Solucion: ante un fallo en una comprobacion de seguridad, el sistema debe cerrar el acceso, no abrirlo.
Explicacion tecnica: cambia ese comportamiento a fail-closed, devolviendo 503 o 403 cuando no pueda validarse el estado de la cuenta. Los checks de desactivacion forman parte del control de acceso, por lo que no deben ignorarse silenciosamente.

29. Fallo: el logout principal del panel no cierra realmente la sesion en backend.
Motivo: `frontend/src/components/AppSidebar.tsx` usa `handleLogout()` para hacer solo `sessionStorage.clear()` y redirigir a `/login`, pero no llama a `POST /accounts/logout`. Como la autenticacion real vive en cookies `httpOnly`, el backend sigue considerando valida la sesion hasta que expira o se limpie explicitamente.
Solucion: cualquier logout de usuario debe invalidar primero la sesion de backend y despues limpiar el estado local del navegador.
Explicacion tecnica: reutiliza la utilidad `logout()` ya existente en `frontend/src/lib/authFetch.ts` o llama siempre a `POST /accounts/logout` antes de navegar fuera. Mientras solo se borre `sessionStorage`, las cookies `authToken` y `refreshToken` seguiran activas y el cierre de sesion sera solo aparente.

30. Fallo: la aceptacion de terminos y privacidad en el registro no se valida ni se guarda en backend.
Motivo: `frontend/src/pages/Signup.tsx` obliga a marcar `acceptedTerms`, pero la peticion solo envia `{ name, email, password, country }`. En `backend/src/controllers/accountsController.ts` `createAccount` no recibe ni comprueba esa aceptacion, y `backend/src/models/Account.ts` tampoco guarda ninguna evidencia de consentimiento.
Solucion: la aceptacion legal debe comprobarse en servidor y quedar registrada de forma auditable junto con la cuenta creada.
Explicacion tecnica: envia en el registro un campo explicito de consentimiento, rechaza el alta si falta y persiste al menos fecha, version del texto legal aceptado e identificador del usuario/cuenta. Si el control existe solo en frontend, puede saltarse facilmente y no deja trazabilidad valida para cumplimiento.

## Bloque 2. Suscripciones, planes, pagos y facturacion

1. Fallo: los endpoints de suscripciones y pagos estan expuestos sin autenticacion ni comprobacion de propiedad de cuenta.
Motivo: en `backend/src/routes/index.ts` se monta `router.use('/subscriptions', subscriptionsRoutes)` antes de `authMiddleware`, y en `backend/src/subscriptions.ts` controladores como `getSubscription`, `createPaymentIntent`, `confirmPayment`, `changePlan`, `cancelAutoRenew` y `validateSubscription` aceptan `accountId` desde query o body sin llamar a `verifyOwnership`.
Solucion: estos endpoints deben quedar protegidos para que un usuario solo pueda leer o modificar la suscripcion de su propia cuenta. El webhook puede seguir siendo publico, pero el resto no.
Explicacion tecnica: separa el webhook en una ruta publica aislada o aplica `authMiddleware` a todo el router de suscripciones salvo `POST /webhook`. Despues, valida siempre `accountId` con `verifyOwnership(req, accountId)` antes de leer o mutar datos de Stripe o MongoDB.

10. Fallo: las facturas publicas son facilmente enumerables porque el identificador de la URL es predecible.
Motivo: en `backend/src/controllers/clientsController.ts` cada factura se crea con `_id: Date.now().toString()`, y `backend/src/controllers/publicInvoiceController.ts` la expone en `GET /invoice/:invoiceId` sin token firmado ni slug aleatorio. Que la vista sea publica por QR esta bien, pero ahora mismo tambien se puede adivinar por fuerza bruta o por proximidad temporal.
Solucion: la factura publica debe seguir siendo accesible desde su QR o enlace, pero con un identificador no predecible o con un token de verificacion asociado.
Explicacion tecnica: manten el endpoint publico, pero sustituye el `_id` expuesto por un token aleatorio largo o por un `publicId` criptograficamente seguro, indexado y distinto del ID interno. Si quieres conservar el ID interno para backend, no lo uses como clave publica de acceso.

11. Fallo: la pagina publica de factura puede sufrir XSS almacenado porque inserta HTML sin escapar.
Motivo: `backend/src/controllers/publicInvoiceController.ts` construye una plantilla HTML interpolando valores como `invoice.clientName`, `invoice.clientEmail`, `invoice.firmName` o `invoice.invoiceNumber` directamente dentro del HTML. Esos campos pueden venir de datos introducidos por usuarios.
Solucion: cualquier valor mostrado en una respuesta HTML debe escaparse antes de renderizarse.
Explicacion tecnica: aplica una funcion de escape HTML a todos los campos interpolados o usa una plantilla segura con escaping por defecto. No interpoles directamente strings de base de datos en una pagina HTML publica.

18. Fallo: el limite de subcuentas del plan solo se aplica en frontend y puede saltarse por API.
Motivo: `frontend/src/components/ProfileModal.tsx` bloquea la UI cuando se supera `maxSubaccounts`, pero `backend/src/controllers/accountsController.ts` en `createSubaccount` no consulta la suscripcion ni el numero actual de subcuentas antes de crear otra.
Solucion: el backend debe ser la fuente real de verdad para los limites del plan.
Explicacion tecnica: antes de crear una subcuenta, carga la suscripcion activa, determina el maximo permitido por plan e intervalo y compara contra `Subaccount.countDocuments({ parentAccountId })`. Si se supera, responde 403 o 409 y no crees la subcuenta aunque la UI lo intente.

19. Fallo: la caducidad de la suscripcion se comprueba al hacer login, pero no se revalida en sesiones ya abiertas ni al refrescar tokens.
Motivo: `backend/src/controllers/accountsController.ts` bloquea el login cuando `currentPeriodEnd` ha vencido, pero `refreshAccessToken` genera nuevos access tokens sin revisar la suscripcion y `authMiddleware` tampoco valida estado o vencimiento de la suscripcion en cada peticion.
Solucion: una cuenta vencida no debe seguir operando solo porque tenia una sesion abierta antes de caducar.
Explicacion tecnica: añade una comprobacion ligera de suscripcion en `authMiddleware` o en el refresh token flow, al menos para invalidar sesiones cuando `currentPeriodEnd` haya pasado y la cuenta no tenga estado permitido. Si prefieres grace period, aplícalo de forma explicita y consistente en backend.

20. Fallo: el alta de cuentas puede dejar usuarios creados a medias y en estado inconsistente.
Motivo: `backend/src/controllers/accountsController.ts` crea la cuenta y luego intenta crear la trial en un `try/catch` separado que solo hace log si falla, devolviendo igualmente `success: true`. Ademas, `backend/src/controllers/adminController.ts` en `createAccountManually` crea primero la cuenta y despues la suscripcion sin transaccion ni rollback, asi que si la segunda parte falla queda una cuenta parcial.
Solucion: la creacion de cuenta y la creacion de la suscripcion inicial deben tratarse como una unica operacion atomica.
Explicacion tecnica: usa una transaccion de Mongoose para crear cuenta y suscripcion juntas, o haz rollback explicito si falla la segunda parte. El envio de email puede quedarse fuera de la transaccion, pero nunca debes confirmar el alta si la trial no se ha persistido correctamente.

21. Fallo: la numeracion de facturas puede duplicarse si se crean dos facturas al mismo tiempo.
Motivo: en `backend/src/controllers/clientsController.ts` se lee `nextInvoiceNumber`, se calcula `invoiceNumber`, se incrementa en memoria y luego se guarda. Ese patron no es atomico y dos peticiones concurrentes pueden usar el mismo numero antes de que una de ellas persista el incremento.
Solucion: la reserva del siguiente numero de factura debe hacerse de forma atomica y con proteccion adicional en base de datos.
Explicacion tecnica: sustituye esa lectura y guardado por un `findOneAndUpdate` con `$inc` atomico dentro de una transaccion o usa un contador dedicado. Añade tambien un indice unico por `accountId + invoiceNumber` para evitar duplicados aunque haya carreras o reintentos.

25. Fallo: el cambio de plan puede romperse con un 500 si Stripe devuelve la suscripcion sin items.
Motivo: en `backend/src/subscriptions.ts`, `changePlan` hace `stripeSubscription.items.data[0].id` sin comprobar que exista `data[0]`. La propia suite de backend reproduce el `TypeError`, asi que es un borde real del flujo de facturacion.
Solucion: el cambio de plan debe validar la respuesta de Stripe y devolver un error controlado o reintentar la sincronizacion, no caerse por una lectura ciega.
Explicacion tecnica: comprueba que `stripeSubscription.items.data` tenga al menos un item antes de acceder al ID. Si falta, responde con un error funcional claro, registra el caso y evita modificar MongoDB hasta tener una referencia valida del item de Stripe.

26. Fallo: el panel admin infravalora los ingresos mensuales cuando hay mas de 100 cargos en Stripe.
Motivo: `backend/src/controllers/adminController.ts` calcula `monthlyRevenue` con `stripe.charges.list({ ..., limit: 100 })` y suma solo esa primera pagina. Si el mes supera 100 cobros exitosos, el dato mostrado deja de ser real.
Solucion: las metricas de admin deben paginarse completas o calcularse con una fuente agregada que no corte en 100 resultados.
Explicacion tecnica: pagina `charges.list` hasta `has_more === false`, o usa invoices, balance transactions o una agregacion propia persistida en backend. Mientras mantengas `limit: 100` sin paginacion, la cifra de ingresos sera incorrecta en cuanto el volumen crezca.

## Bloque 3. Infraestructura, sincronizacion y rendimiento

14. Fallo: los workers y schedulers se arrancan dentro del proceso web en cada instancia, sin coordinacion entre replicas.
Motivo: `backend/src/server.ts` lanza `startJobsWorker`, `resumeAllPolling`, `startCleanupWorker`, `startAlertScheduler`, `startTaxRateSyncWorker` y `startCalendarSyncJob` al arrancar el servidor HTTP. No hay leader election ni separacion entre proceso web y proceso worker.
Solucion: en produccion, las tareas recurrentes deben ejecutarse desde un worker dedicado o con un mecanismo de bloqueo distribuido.
Explicacion tecnica: separa los schedulers del servidor web o introduce locking/idempotencia a nivel de base de datos. Si despliegas varias replicas del backend tal como esta ahora, cada replica repetira las mismas tareas y podras tener duplicados, carreras o llamadas externas innecesarias.

15. Fallo: el scheduler fiscal puede enviar recordatorios duplicados y ademas escala mal con el volumen.
Motivo: `backend/src/services/alertScheduler.ts` hace `FiscalAlert.find().lean()` completo cada minuto, calcula en memoria qué alertas vencen y despues llama a `sendEmail` antes de actualizar el registro. Si hay varias instancias, todas pueden leer la misma alerta pendiente y enviarla a la vez. Aunque haya una sola instancia, revisar todas las alertas cada minuto penaliza rendimiento al crecer la base.
Solucion: las alertas deben reclamarse de forma atomica y consultarse por criterio, no cargar toda la tabla en cada ciclo.
Explicacion tecnica: usa una query acotada a alertas vencidas y pendientes, marca cada alerta como `processing` con `findOneAndUpdate` atomico antes de enviar y solo entonces procesa el correo. Esto evita duplicados entre replicas y reduce carga innecesaria.

17. Fallo: la sincronizacion de Google Calendar esta planteada de forma secuencial y no escalará bien cuando haya muchas cuentas conectadas.
Motivo: `backend/src/jobs/calendarSyncJob.ts` hace un barrido completo de cuentas y subcuentas conectadas cada 5 minutos y las sincroniza una por una con `for ... await`. Si el numero de cuentas crece, el ciclo tardara cada vez mas y puede solaparse con el siguiente, ademas de duplicarse en cada replica del backend.
Solucion: la sincronizacion debe repartirse por lotes o cola, con control de concurrencia e idempotencia.
Explicacion tecnica: mueve el trabajo a una cola o job scheduler con particionado por cuenta, limita concurrencia por proveedor y evita que la misma cuenta se procese simultaneamente en varias instancias. El enfoque actual funcionara con poco volumen, pero no es una base robusta para produccion escalable.

28. Fallo: el frontend sale a produccion con un bundle principal excesivamente grande y con code splitting desaprovechado.
Motivo: `npm run build` genera un chunk principal de `dist/assets/index-*.js` de unos 4.58 MB minificados y Vite avisa de que `html2pdf.js` se importa de forma dinamica en `frontend/src/pages/Clients.tsx`, pero tambien de forma estatica en `frontend/src/pages/WritingReview.tsx`, impidiendo separarlo en otro chunk.
Solucion: las librerias pesadas deben cargarse solo cuando el flujo realmente las necesita, para no penalizar la carga inicial de toda la app.
Explicacion tecnica: elimina el import estatico de `html2pdf.js` en `WritingReview.tsx` y cargalo tambien por `import()` bajo demanda, o mueve exportacion PDF a un modulo perezoso. Revisa ademas otras dependencias grandes del chunk principal y trocea por rutas para bajar el coste inicial de descarga, parseo y ejecucion.

## Bloque 4. Integraciones, API publica, webhooks, firmas y modulos auxiliares

9. Fallo: todo el modulo `improve-ai` permite acceder a datos de otras cuentas porque no valida propiedad en ninguna operacion.
Motivo: `backend/src/routes/improveAIRoutes.ts` contiene logica directa para listar carpetas, listar archivos, crear carpetas, subir archivos, ver archivos, borrar archivos, borrar carpetas, consultar almacenamiento y `has-files`, pero no usa `verifyOwnership` ni filtra por usuario autenticado. Solo resuelve `accountId` recibido desde query/body o usa `fileId` directo.
Solucion: ese modulo debe tratarse como multi-tenant estricto, igual que clientes, contratos o chats.
Explicacion tecnica: antes de cualquier accion, valida la cuenta con `verifyOwnership(req, accountId)`. Para acciones por `fileId` o `folderId`, carga primero el registro y verifica su `accountId`. No debes confiar en `accountId` que llega desde frontend ni en IDs directos sin comprobacion adicional.

22. Fallo: el flujo de envio a firma permite asociar contratos propios con clientes de otra cuenta.
Motivo: `backend/src/controllers/signatureController.ts` en `sendForSignature` verifica el contrato y el chat, pero no valida que `clientId` pertenezca a la misma cuenta. Luego `backend/src/services/signatureService.ts` hace `Client.findById(params.clientId)` y modifica `client.files` sin comprobar `accountId`, de modo que puede contaminar fichas de clientes ajenos si se conoce su ID.
Solucion: el cliente usado para la firma debe validarse igual que el contrato y debe pertenecer a la misma cuenta autenticada.
Explicacion tecnica: antes de crear la firma, carga el `Client` por `clientId`, comprueba `verifyOwnership(req, client.accountId)` y valida tambien que `client.accountId === chat.accountId`. En el servicio, evita mutar un cliente cargado solo por ID sin verificar el contexto de cuenta.

23. Fallo: la integracion de webhooks queda incompleta porque el secreto se genera pero la interfaz no lo muestra al usuario.
Motivo: `backend/src/routes/webhookRoutes.ts` crea cada webhook con `secret`, y `backend/src/services/webhookService.ts` firma cada entrega con ese secreto en `X-Lyrium-Signature`. Sin embargo, `frontend/src/components/ProfileModal.tsx` en `createWebhook` ignora la respuesta de creacion y la lista renderizada de webhooks no muestra ni permite copiar ese secreto.
Solucion: el usuario debe poder ver y copiar el secreto al menos una vez al crear el webhook, o regenerarlo desde la propia interfaz.
Explicacion tecnica: devuelve el `secret` en la respuesta de alta y muestralo en un modal de copia unica, igual que ya se hace con las API keys. Como alternativa, añade un flujo de `rotate secret` y una vista segura para revelarlo bajo demanda.

31. Fallo: la API publica permite subir archivos a disco antes de comprobar que el `clientId` pertenece realmente a la API key.
Motivo: en `backend/src/routes/publicApiRoutes.ts` la ruta `POST /api/v1/clients/:clientId/files` usa `multer` antes del controlador, y `apiUploadStorage.destination` crea la carpeta `uploads/clients/<clientId>` con el valor de la URL. La validacion de propiedad (`Client.findOne({ _id: clientId, accountId })`) ocurre despues, cuando el fichero ya se ha guardado.
Solucion: el backend debe validar primero que el cliente existe y pertenece a la cuenta de la API key, y solo entonces aceptar la subida del fichero.
Explicacion tecnica: no dejes que `multer` escriba directamente a disco con un `clientId` no validado. Haz una comprobacion previa de ownership antes del middleware de subida, o usa memoria temporal y persiste el archivo solo tras validar `accountId + clientId`. Si falla la validacion despues de subir, elimina el fichero temporal para evitar abuso de almacenamiento y residuos huerfanos.

## Bloque 5. Apartados del menu lateral

### Riesgos transversales comunes a modulos con chat IA

5. Fallo: cualquier usuario autenticado puede marcar o desmarcar mensajes de chats ajenos.
Motivo: `backend/src/controllers/messageFlagsController.ts` busca el chat por `chatId` y modifica `message.flags`, pero no comprueba que el chat pertenezca a la cuenta autenticada. Estas rutas cuelgan de `backend/src/routes/index.ts` despues de `authMiddleware`, pero sin autorizacion por cuenta.
Solucion: las banderas de mensajes deben respetar el aislamiento entre cuentas igual que el resto de chats.
Explicacion tecnica: despues de cargar el chat, valida `verifyOwnership(req, chat.accountId)` o usa queries filtradas por `_id` y `accountId` derivado del usuario autenticado. Si no coincide, responde 403 sin modificar nada.

58. Fallo: los chats de IA no estan aislados por usuario y pueden compartirse entre la cuenta principal y sus subcuentas, incumpliendo el requisito de privacidad interna.
Motivo: el sistema usa el `accountId` de la cuenta principal como contexto comun para cuenta principal y subcuentas, y los chats de IA se consultan y validan principalmente por `accountId`. Aunque algunos listados aplican `createdBy`, esa restriccion no se mantiene de forma consistente al abrir chats, enviar mensajes, renombrarlos o borrarlos. Esto afecta al menos a Asistente, chats de Clientes, Defensa, Fiscal, Resumenes y Contratos.
Solucion: cada chat de IA debe pertenecer al `userId` autenticado que lo creo, incluida la cuenta principal, y todos los endpoints del ciclo de vida del chat deben aplicar el mismo criterio de acceso por `accountId + createdBy`.
Explicacion tecnica: con la implementacion actual, `accountId` representa solo el tenant y no el propietario real del chat. Si el requisito es que ningun chat se comparta ni con la cuenta principal ni con otras subcuentas, la autorizacion por `accountId` es insuficiente y debe sustituirse por una validacion estricta por usuario en listar, abrir, escribir, renombrar, borrar, duplicar y descargar.

### Inicio

44. Fallo: el widget de calendario del apartado Inicio no muestra correctamente los eventos del dia aunque existan en la base local.
Motivo: `frontend/src/pages/Dashboard.tsx` espera que `/calendar/events` devuelva eventos con shape de Google (`event.start.dateTime`, `event.start.date`, `event.summary`), pero `backend/src/controllers/calendarController.ts` devuelve documentos `CalendarEvent` con campos `startDateTime`, `endDateTime`, `title` y `allDay`. El filtro del Dashboard toma `((e.start?.dateTime || e.start?.date || '').split('T')[0])`, por lo que con el shape real obtiene cadena vacia y descarta todos los eventos.
Solucion: el frontend del Dashboard y el backend de `/calendar/events` deben usar el mismo contrato de datos.
Explicacion tecnica: o bien adapta `Dashboard.tsx` para leer `title`, `startDateTime` y `allDay` del modelo local, o bien transforma la respuesta del backend al formato esperado antes de enviarla. Con el codigo actual, Inicio puede mostrar "No hay eventos hoy" aunque la cuenta si tenga eventos sincronizados para ese dia.

45. Fallo: desde el modal Shared Files del apartado Inicio se pueden falsificar destinatarios y remitente a nivel backend.
Motivo: `backend/src/controllers/sharedFilesController.ts` en `uploadAndShare` solo valida que `senderId` pertenezca al usuario autenticado, pero acepta `recipientIds` y `senderName` exactamente como los manda el frontend. No comprueba que los destinatarios pertenezcan al mismo grupo/cuenta ni recalcula el nombre real del remitente desde la base de datos.
Solucion: el backend debe derivar el remitente real desde la sesion autenticada y validar que todos los `recipientIds` pertenezcan al mismo grupo permitido.
Explicacion tecnica: ahora mismo un cliente adulterado puede enviar un archivo a IDs arbitrarios si los conoce y, ademas, guardar un `senderName` falso que luego se muestra en la UI de recibidos. Eso rompe el aislamiento del espacio compartido y permite suplantacion visual dentro del propio flujo de Inicio.

### Clientes

46. Fallo: los flujos de facturacion del apartado Clientes confian en `accountId` enviado por el frontend y pueden consumir configuracion, numeracion, webhooks y SMTP de otra cuenta.
Motivo: en `backend/src/controllers/clientsController.ts`, `createInvoice` valida la propiedad del `clientId`, pero luego usa `InvoiceSettings.findOne({ accountId })`, crea la factura con `accountId` tomado del body y dispara `dispatchWebhook(accountId, ...)`. `updateInvoice` repite el mismo patron para webhook, y `sendInvoiceEmail` valida la factura por `invoice.accountId` pero despues busca `Automation.findOne({ accountId })` con el `accountId` del body para elegir la cuenta SMTP. Desde `frontend/src/pages/Clients.tsx`, `saveInvoice`, `updateExistingInvoice` y `sendInvoice` mandan ese `accountId` desde `sessionStorage`, por lo que una peticion manipulada puede apuntar a otra cuenta.
Solucion: el backend debe ignorar `accountId` en estos endpoints y derivar siempre la cuenta efectiva desde `client.accountId` o `invoice.accountId`.
Explicacion tecnica: en creacion usa `client.accountId` para cargar `InvoiceSettings`, generar numeracion, persistir `invoice.accountId` y emitir webhooks. En edicion y envio usa `invoice.accountId` para resolver `Automation`, validar `cuentaCorreoId` y disparar eventos. Mientras se siga confiando en `accountId` del body, una cuenta autenticada puede contaminar numeradores ajenos o intentar enviar facturas usando el SMTP de otra cuenta.

47. Fallo: las subidas autenticadas del apartado Clientes escriben archivos en disco antes de validar ownership o almacenamiento permitido, dejando residuos y abriendo la puerta a abuso de espacio.
Motivo: en `backend/src/routes/clientsRoutes.ts`, `POST /clients` y `PUT /clients/:id` ejecutan `uploadMultiple.array('files')` antes de entrar en `createClient` o `updateClient`, y `POST /clients/:clientId/files` ejecuta `uploadSingle.single('file')` antes de `uploadClientFile`. Eso hace que `multer` escriba primero en `uploads/clients/temp` o en `uploads/clients/<clientId>` y solo despues se compruebe `verifyOwnership`, la existencia del cliente o el limite de almacenamiento. Los paths de rechazo por 403/404 no limpian esos archivos.
Solucion: la validacion de cuenta/cliente debe ocurrir antes de persistir archivos, o debe existir una limpieza garantizada en todos los rechazos.
Explicacion tecnica: este endpoint interno repite el mismo patron peligroso ya detectado en la API publica, pero dentro del flujo normal de Clientes. Valida primero `accountId` y `clientId`, o sube a memoria/temporal y borra siempre en cualquier salida no exitosa. Si no, un usuario autenticado puede generar basura en disco mediante peticiones invalidadas o manipular carpetas de clientes que no deberian aceptar la subida.

48. Fallo: borrar un cliente deja registros dependientes huerfanos y parte de ellos deja de ser gestionable desde la propia app.
Motivo: `backend/src/controllers/clientsController.ts` en `deleteClient` solo elimina la carpeta de archivos y ejecuta `Client.findByIdAndDelete(id)`. No limpia colecciones relacionadas como `ClientReminder`, `Invoice` o `Chat`, aunque esas entidades siguen referenciando `clientId`. Ademas, `getClientInvoices` exige que el cliente exista para poder listar las facturas, asi que las facturas del cliente borrado permanecen en MongoDB pero desaparecen del flujo normal de gestion.
Solucion: el borrado de cliente debe ser transaccional y resolver explicitamente todas sus dependencias, o bloquearse mientras existan.
Explicacion tecnica: antes de eliminar, el backend debe borrar o reasignar recordatorios, chats y cualquier otro documento ligado al `clientId`, y decidir un tratamiento explicito para las facturas. Si las facturas deben conservarse por motivos contables, el sistema deberia impedir borrar el cliente o pasar a un borrado logico. Tal como esta ahora, Clientes puede dejar datos colgados y algunos quedan invisibles para el usuario aunque sigan existiendo.

49. Fallo: la asignacion de clientes a subcuentas no valida que la subcuenta destino pertenezca realmente a la misma cuenta.
Motivo: `backend/src/controllers/accountsController.ts` en `assignClientToSubaccount` carga el cliente y verifica `client.accountId`, pero si recibe `subaccountId` simplemente lo guarda en `client.assignedSubaccountId` sin comprobar que exista ni que su `parentAccountId` coincida. La UI de `frontend/src/pages/Clients.tsx` solo ofrece subcuentas propias, pero la API acepta cualquier ID manipulado.
Solucion: el backend debe validar la subcuenta destino antes de persistir la asignacion.
Explicacion tecnica: cuando llegue un `subaccountId`, carga `Subaccount.findById(subaccountId)` y rechaza la operacion si no existe o si `parentAccountId !== client.accountId`. Si no se hace, el cliente puede quedar apuntando a una subcuenta inexistente o ajena, rompiendo filtros, asignaciones y el aislamiento entre cuentas.

50. Fallo: el filtro por abogado/subcuenta del modal global de recordatorios no funciona nunca.
Motivo: en `frontend/src/pages/Clients.tsx`, el modal de recordatorios globales calcula `const matchSub = globalRemindersSubFilter === 'all' || true;`, expresion que siempre devuelve `true`. El selector se muestra en pantalla, pero cambiarlo no altera los resultados.
Solucion: el filtro debe implementarse con un campo real de subcuenta o eliminarse de la interfaz mientras no exista esa informacion.
Explicacion tecnica: ahora mismo el usuario ve un control que aparenta segmentar recordatorios por abogado, pero es UI muerta. En produccion eso induce a error operativo porque transmite una capacidad de filtrado que el codigo no ejecuta en ningun caso.

51. Fallo: las facturas aceptan subtotales y totales calculados por el frontend, de modo que una peticion manipulada puede guardar importes incoherentes.
Motivo: en `backend/src/controllers/clientsController.ts`, tanto `createInvoice` como `updateInvoice` calculan `baseAmount` sumando `l.subtotal` y persisten `quantity`, `price` y `subtotal` exactamente como llegan en `lines`. Aunque `frontend/src/pages/Clients.tsx` recalcula el subtotal en la UI, el backend nunca rehace `subtotal = quantity * price` ni valida coherencia entre campos.
Solucion: el backend debe recalcular cada linea y todos los importes derivados a partir de `quantity` y `price`, ignorando `subtotal` enviado por el cliente.
Explicacion tecnica: una factura es un documento sensible y no puede depender de aritmetica delegada al navegador. Si se aceptan subtotales arbitrarios, tambien quedan comprometidos `baseAmount`, `taxAmount`, `totalAmount`, la huella VeriFactu y el QR generado. La logica correcta es derivar todo en servidor y solo usar el frontend como capturador de datos base.

70. Fallo: el apartado Clientes ya permite ver varios casos por cliente, pero el modelo sigue arrastrando un campo de asignación única que induce a error.
Motivo: la UI de Clientes muestra que un mismo cliente puede acumular varios casos, pero el backend conserva `Client.assignedSubaccountId` como si bastara un único abogado para representar toda la relación. Esa combinación genera confusión funcional y decisiones erróneas si luego se usa ese campo para filtros, badges o reparto de carga.
Solucion: el apartado Clientes debe tratar los abogados como una vista agregada de los casos del cliente, no como un único responsable fijo salvo que exista un campo separado y claramente nombrado para otro rol, por ejemplo `gestorPrincipal`.
Explicacion tecnica: en vez de leer un único `assignedSubaccountId` para representar al cliente, conviene derivar la lista de abogados desde los casos activos vinculados a ese cliente. Asi la interfaz refleja la realidad del expediente y evita que un solo campo sobrescriba o esconda el trabajo de otros abogados.

### Contratos

24. Fallo: el logo de contratos es global para toda la instalacion y cualquier usuario autenticado puede cambiarlo o borrarlo.
Motivo: `backend/src/controllers/settingsController.ts` usa un unico archivo `uploads/logo.png`, `backend/src/routes/settingsRoutes.ts` no pide contexto de cuenta para `/settings/logo`, y `frontend/src/pages/Contracts.tsx` expone ese flujo a cualquier usuario autenticado. En una app multi-tenant, eso hace que una cuenta pueda romper la imagen de marca de todas las demas.
Solucion: el logo debe estar aislado por cuenta, o bien la operacion debe restringirse a un ambito realmente global administrado por admins.
Explicacion tecnica: guarda el logo por `accountId`, por ejemplo en `uploads/logos/<accountId>/logo.png`, y exige ownership antes de leer, subir o borrar. Si el producto quiere un logo global del sistema, entonces mueve esa accion a rutas de administrador y no a la UI normal de contratos.

32. Fallo: al borrar una base contractual quedan chats huerfanos y la UI puede seguir apuntando al contrato eliminado.
Motivo: `backend/src/controllers/contractsController.ts` en `deleteContract` borra el archivo y el registro de `Contract`, pero no elimina los `ContractChat` asociados por `contractBaseId`. A la vez, `frontend/src/pages/Contracts.tsx` en `deleteContract` recarga la lista pero no limpia `selectedContract` ni el chat activo si el contrato borrado era el seleccionado.
Solucion: borrar una base contractual debe limpiar o reasignar sus chats asociados y dejar el estado del frontend coherente con la eliminacion.
Explicacion tecnica: al eliminar un contrato, borra tambien los `ContractChat` relacionados o impide la eliminacion si existen dependencias que el usuario deba resolver antes. En frontend, si `contractToDelete === selectedContract?.id`, resetea `selectedContract`, `currentChatId` y cualquier estado derivado antes o despues de refrescar la lista para evitar referencias colgantes.

52. Fallo: la descarga en DOCX de los contratos generados no funciona desde la interfaz de Contratos.
Motivo: en `frontend/src/components/ContractChatInterface.tsx` el boton DOCX llama a `/contracts/chat/generated/:id/download-docx` sin enviar `accountId`, pero `backend/src/controllers/contractsChatController.ts` exige ese query param y responde `400` si falta. Ademas, esa ruta valida con `chat.accountId !== accountId` en vez de reutilizar `verifyOwnership` como hace la descarga PDF.
Solucion: la descarga DOCX debe validar la propiedad del recurso en servidor igual que la PDF y no depender de un `accountId` suministrado por el cliente.
Explicacion tecnica: ahora mismo el flujo frontend y backend no coinciden. El resultado en produccion es que el usuario puede generar el contrato y descargar el PDF, pero la version DOCX falla sistematicamente aunque exista en disco.

53. Fallo: los chats de analisis directo sin contrato base se pierden y no reaparecen en el selector de chats.
Motivo: `createTemporaryChat` guarda chats con `isTemporary: true` y `contractBaseId` vacio, pero `getAllContractChats` solo devuelve chats cuyo `contractBaseId` esta dentro de los contratos base existentes (`{ contractBaseId: { $in: accountContractIds } }`). La UI del selector en `frontend/src/pages/Contracts.tsx` espera precisamente chats sin contrato base porque muestra el fallback `contracts.noContract`.
Solucion: el listado global de chats debe incluir tambien los chats temporales de la cuenta y aplicarles las mismas reglas de visibilidad por subcuenta.
Explicacion tecnica: el modo de analisis directo es una funcionalidad principal del apartado. Con la implementacion actual, esos chats se crean y se guardan en base de datos, pero tras recargar la pagina desaparecen del historial y quedan irrecuperables desde la interfaz.

54. Fallo: eliminar un contrato base deja chats, contratos generados y artefactos asociados huerfanos.
Motivo: `deleteContract` en `backend/src/controllers/contractsController.ts` solo borra el PDF original y el documento `Contract`. No elimina `ContractChat`, `GeneratedContract`, PDFs/DOCX generados ni la estructura analizada guardada en `templates/<contractId>/structure.json`. Despues, `getAllContractChats` deja de listarlos porque recompone el historial solo a partir de contratos base que siguen existiendo.
Solucion: al borrar un contrato base debe ejecutarse un borrado en cascada de todos sus datos derivados, o bloquear el borrado mientras existan dependencias que el usuario deba resolver antes.
Explicacion tecnica: en produccion esto provoca deriva silenciosa de datos: el almacenamiento crece con archivos invisibles, quedan conversaciones historicas sin padre funcional y la interfaz oculta el problema en vez de resolverlo.

55. Fallo: la subida de contratos base acepta archivos no PDF y sin limite de tamano real.
Motivo: en `frontend/src/pages/Contracts.tsx` el input del modal no restringe `accept="application/pdf"`, y en backend la ruta `POST /contracts` usa `backend/src/config/multer.ts`, que no aplica ni `fileFilter` ni `limits.fileSize`. Sin embargo, `analyzeContractPdf` en `backend/src/services/contractPdfService.ts` solo sabe analizar PDFs mediante `pdf-parse`.
Solucion: el alta de contratos base debe restringirse a PDF con un limite de tamano razonable tanto en frontend como en backend, rechazando el archivo antes de persistir el contrato.
Explicacion tecnica: hoy se puede guardar cualquier binario como contrato base. El alta aparenta funcionar, pero el analisis posterior falla y deja una plantilla visible pero inutilizable para la generacion asistida por IA.

56. Fallo: el logo usado en los contratos es global para toda la plataforma y cualquier cuenta autenticada puede sobrescribirlo o borrarlo.
Motivo: `backend/src/controllers/settingsController.ts` guarda y lee siempre el mismo archivo `uploads/logo.png`, sin `accountId` ni `verifyOwnership`. A su vez, `backend/src/services/contractPdfService.ts` inserta ese mismo fichero en todos los contratos generados.
Solucion: el logo debe almacenarse por cuenta y los endpoints de `/settings/logo` deben exigir contexto de cuenta con validacion de propiedad.
Explicacion tecnica: esto rompe el aislamiento multi-tenant. En produccion, un despacho puede cambiar el logo que veran otros despachos en sus contratos generados, lo que afecta directamente a branding y confidencialidad operativa.

57. Fallo: al borrar el contrato base que esta seleccionado, la interfaz sigue apuntando a una plantilla que ya no existe.
Motivo: en `frontend/src/pages/Contracts.tsx`, `deleteContract` recarga la lista pero no limpia `selectedContract`, `currentChatId` ni `selectedContractId` de `sessionStorage` cuando el contrato eliminado era el activo. Sin embargo, `createContractChat` en backend exige que `Contract.findById(contractBaseId)` siga existiendo y devuelve `404` si ya fue borrado.
Solucion: cuando se elimina el contrato actualmente seleccionado, la UI debe limpiar el estado asociado y volver automaticamente al modo de analisis directo o a otro contrato valido.
Explicacion tecnica: si no se hace, el usuario queda en un estado roto dentro del propio apartado: el selector sigue mostrando una plantilla borrada y al intentar abrir un chat nuevo sobre ella el backend rechaza la operacion.

59. Fallo: el apartado de Contratos mezcla de forma visible chats de distintos usuarios cuando comparten una misma plantilla base.
Motivo: el listado general intenta separar chats por creador, pero al entrar en un contrato base concreto se recuperan todos los chats asociados a esa plantilla sin mantener el filtro por usuario. Como consecuencia, una subcuenta puede ver desde el selector conversaciones creadas por otra subcuenta o por la cuenta principal sobre ese mismo contrato base.
Solucion: las consultas por contrato base y la apertura de chats deben aplicar exactamente la misma regla de propiedad por usuario que el resto del modulo.
Explicacion tecnica: este caso es especialmente grave porque la fuga no depende de conocer manualmente un `chatId` ajeno: la propia interfaz puede exponer conversaciones de otros usuarios del mismo tenant cuando comparten contrato base.

### Asistente de IA

79. Fallo: el apartado Asistente de IA no mantiene el aislamiento de chats entre cuenta principal y subcuentas en todas sus operaciones.
Motivo: en `backend/src/controllers/assistantController.ts`, `getAssistantChats` y `getAssistantChat` solo filtran por `createdBy` cuando el usuario es subcuenta, pero `sendAssistantMessage`, `streamAssistantMessage`, `deleteAssistantChat`, `renameAssistantChat` y `clearAssistantChat` trabajan por `accountId` y `chatId` sin reaplicar ese filtro. Ademas, si no encuentran el chat, `sendAssistantMessage` y `streamAssistantMessage` pueden crear uno nuevo sin `createdBy`.
Solucion: todos los endpoints del modulo deben validar por `accountId + createdBy`, tambien para la cuenta principal si el requisito es privacidad interna total, y cualquier chat creado por fallback debe heredar siempre el `userId` autenticado.
Explicacion tecnica: con el comportamiento actual, la cuenta principal puede operar sobre todos los chats del tenant, una subcuenta con un `chatId` valido puede mutar un chat ajeno del mismo tenant y los fallbacks pueden dejar chats huerfanos o invisibles para su propio creador. En produccion eso rompe la privacidad interna y la coherencia del historial del Asistente.

80. Fallo: subir un PDF al Asistente de IA puede fallar sistematicamente en produccion y dejar archivos temporales huerfanos en disco.
Motivo: `backend/src/controllers/assistantController.ts` usa `pdf-parse` con `const PDFParse = pdfParseModule.PDFParse; const parser = new PDFParse(...)`, patron que no coincide con la API normal del paquete y que ya aparece como fallo real en otras zonas del proyecto. Ademas, el `fs.unlink(filePath)` solo se ejecuta tras el parseo exitoso, no en un `finally`.
Solucion: el procesado de PDF del Asistente debe usar la API correcta de `pdf-parse` y borrar siempre el archivo temporal aunque el parseo falle.
Explicacion tecnica: ahora mismo el flujo de adjuntar documentos al Asistente queda en falso positivo funcional: el usuario puede subir TXT/CSV, pero los PDF pueden romper el endpoint y acumular basura en `uploads/assistant_files`. Para un apartado que promete responder sobre documentos, eso no es aceptable en produccion.

81. Fallo: una respuesta del Asistente puede mostrarse al usuario como completada aunque el streaming haya fallado a mitad y el backend no la haya guardado.
Motivo: `frontend/src/hooks/useStreamingChat.ts` en el `catch` llama a `opts.onDone(accumulated)` cuando ya habia texto parcial, y `frontend/src/pages/AIAssistant.tsx` usa ese `onDone` para insertar el mensaje del asistente en pantalla como si fuera final. Sin embargo, `backend/src/controllers/assistantController.ts` solo persiste el mensaje del asistente despues de que `streamAssistantAI(...)` termine correctamente.
Solucion: si el stream falla, la UI no debe cerrar el flujo como exito ni añadir la respuesta final salvo confirmacion explicita del backend; como minimo debe revalidar el chat antes de pintar el mensaje definitivo.
Explicacion tecnica: en produccion, un corte de red o un error de streaming puede dejar al usuario viendo una respuesta truncada que parece enviada con normalidad, pero que no existe realmente en el historial persistido. Eso rompe la confianza del apartado y genera discrepancias entre lo que ve el usuario y lo que conserva la base de datos.

### Preparacion de Defensa

60. Fallo: importar un chat de cliente al apartado Defensa puede sobrescribir un chat distinto del que ve el usuario y dejar estrategias antiguas mezcladas con mensajes importados.
Motivo: en `frontend/src/pages/DefensePrep.tsx`, `importFromClient` solo envia `{ chatId, accountId }`, no manda `activeChatId` ni actualiza `activeChatId` con la respuesta. A su vez, en `backend/src/controllers/defenseChatController.ts`, `importDefenseChat` cuando no recibe `targetChatId` hace `DefenseChat.findOne({ accountId })` sin orden ni filtro por usuario, y si encuentra un chat solo reemplaza `messages`, dejando intacto `savedStrategies`.
Solucion: la importacion debe dirigirse siempre al chat activo explicito o crear un chat nuevo de forma determinista, y el frontend debe cambiar a `data.chatId`, recargar estrategias y limpiar cualquier estado previo incompatible.
Explicacion tecnica: con varios chats de defensa, la importacion puede persistirse en un registro distinto del mostrado en pantalla y conservar estrategias antiguas ajenas a los mensajes importados. En produccion esto puede llevar a exportar al cliente un PDF que no corresponde con la conversacion visible.

61. Fallo: exportar e importar desde Defensa permite cruzar datos con clientes o chats ajenos si se manipula la peticion.
Motivo: `exportDefenseChat` valida solo `accountId`, pero crea un `Chat` con el `clientId` recibido, escribe el PDF en `uploads/clients/<clientId>` y hace `Client.findById(clientId)` sin comprobar ownership. `importDefenseChat` hace `Chat.findById(sourceChatId)` sin verificar que el chat fuente pertenezca a un cliente de la cuenta autenticada.
Solucion: ambos flujos deben cargar primero el cliente o chat fuente, derivar el `accountId` real desde ese documento y rechazar la operacion si no pertenece a la cuenta y al usuario autorizados.
Explicacion tecnica: ahora mismo Defensa confia en IDs directos enviados por el navegador. Una peticion manipulada puede inyectar una defensa en el expediente de otro cliente o arrastrar al apartado Defensa una conversacion de cliente que no pertenece al tenant autenticado.

62. Fallo: las rutas de pruebas y contrarreplica de Defensa pierden el control de ownership y permiten mutar datos solo con el `accountId` enviado por cliente.
Motivo: `getEvidence`, `createEvidence`, `updateEvidence`, `deleteEvidence` y `simulateCounterReplica` en `backend/src/controllers/defenseChatController.ts` no llaman a `verifyOwnership`. Se limitan a comparar `chat.accountId` o `evidence.accountId` contra el `accountId` del body o query y tampoco filtran por `createdBy`.
Solucion: estas rutas deben validar `verifyOwnership(req, doc.accountId)` y, si el requisito es aislamiento entre cuenta principal y subcuentas, aplicar tambien `createdBy === req.user.userId` igual que en los listados seguros.
Explicacion tecnica: bajo autenticacion normal, un usuario no deberia poder tocar pruebas o simulaciones de otra cuenta ni de otra subcuenta. Aqui la autorizacion avanzada del modulo queda degradada respecto al resto del propio controlador y extiende la fuga no solo al chat, sino tambien al registro de evidencias y al analisis de contrarreplica.

63. Fallo: la subida de PDF en Defensa acepta archivos arbitrarios y de cualquier tamano antes de intentar parsearlos.
Motivo: `backend/src/routes/defenseChatRoutes.ts` usa `upload.single('pdf')`, pero `backend/src/config/multer.ts` es el middleware generico que guarda cualquier fichero en `uploads/` sin `fileFilter` ni limite de tamano. El frontend en `frontend/src/pages/DefensePrep.tsx` solo filtra `application/pdf` en cliente, control trivialmente saltable.
Solucion: Defensa necesita un middleware especifico para PDF con validacion de tipo y limite razonable antes de escribir en disco.
Explicacion tecnica: en produccion, un usuario autenticado puede subir binarios grandes o archivos no PDF, consumir almacenamiento y forzar errores de parseo innecesarios. La validacion en frontend no protege el backend ni evita abuso operativo.

64. Fallo: el modulo de Pruebas de Defensa se queda a medio camino y no sirve como sistema real de gestion probatoria en produccion.
Motivo: hoy el sistema solo guarda metadatos simples de la prueba y no ofrece una biblioteca real de archivos, ni almacenamiento persistente de evidencias, ni visor de lo subido, ni papelera, ni control de cuota por usuario, ni integracion util con la exportacion del PDF de estrategia. Para un uso profesional, las pruebas deberian poder subirse a Lyrium con nombre propio, quedar asociadas al usuario que las sube y poder consultarse despues desde una biblioteca dedicada.
Solucion: convertir Pruebas en un repositorio real de evidencias dentro de Defensa. Cada cuenta principal y cada subcuenta deberian disponer de su propia cuota independiente de 10 GB para pruebas; al crear una prueba se deberia exigir al menos nombre de la prueba y archivo; deberia existir un boton de Biblioteca de pruebas donde ver todas las pruebas subidas por ese usuario, abrirlas en un visor online segun su tipo, eliminarlas de forma logica a una papelera y, desde la ventana de papelera, borrarlas definitivamente. Al exportar la estrategia a PDF, las pruebas deberian aparecer con enlaces publicos largos y no adivinables que abran un visor de Lyrium para video, imagen, audio, PDF o descarga controlada.
Explicacion tecnica: si Defensa va a manejar pruebas de verdad, la app debe actuar como custodio documental y no como simple ficha descriptiva. Eso implica almacenamiento persistente por usuario, contabilidad real del espacio consumido, soft delete con papelera, invalidacion del enlace publico cuando la prueba pase a papelera o se elimine, y URLs publicas por posesion del enlace pero no descubribles ni indexables. Sin esa capa, el modulo sigue siendo insuficiente para un flujo serio de gestion y presentacion de evidencias.

**Plan tecnico detallado (punto 64):**
- Extender `DefenseEvidence` con campos: `filePath`, `fileSize`, `mimeType`, `publicToken` (UUID aleatorio), `isDeleted`, `deletedAt`, `createdBy`.
- Crear middleware `multerDefense.ts` con `fileFilter` para PDF, imágenes, video, audio; sin límite de tamaño por archivo individual.
- Almacenar archivos en `uploads/evidence/<createdBy>/<randomName>`.
- Control de cuota: 10 GB acumulados por `createdBy`. Se calcula sumando `fileSize` de todos los `DefenseEvidence` activos (`isDeleted: false`) de ese usuario. Si la subida supera la cuota, rechazar con 413.
- Nuevos endpoints (autenticados):
  - `POST /defense-chat/:chatId/evidence/upload` — subir archivo, generar `publicToken`, validar cuota.
  - `GET /defense-chat/evidence/library?accountId=` — listar pruebas del usuario (`createdBy`, `isDeleted: false`).
  - `GET /defense-chat/evidence/trash?accountId=` — listar papelera (`isDeleted: true`).
  - `POST /defense-chat/evidence/:evidenceId/trash` — soft delete (`isDeleted: true`, `deletedAt`).
  - `POST /defense-chat/evidence/:evidenceId/restore` — restaurar desde papelera.
  - `DELETE /defense-chat/evidence/:evidenceId/permanent` — borrar archivo de disco y registro de BD.
- Nuevo endpoint público (sin auth, solo token):
  - `GET /public/evidence/:token` — buscar por `publicToken`, si `isDeleted` o no existe devolver 404; si existe, servir archivo según `mimeType`: video/mp4 → inline video, image/* → inline image, audio/* → inline audio, application/pdf → inline PDF, resto → descarga con `Content-Disposition: attachment`. Token = UUID largo no adivinable.
- Al soft-deletear o eliminar permanentemente, el token queda invalidado automáticamente porque la query filtra `isDeleted: false`.
- Integrar en `generateDefensePDF` (pdfService.ts): añadir sección "Evidencias adjuntas" al final de cada estrategia, listando nombre de prueba + enlace público completo (`https://<domain>/public/evidence/<token>`).
- Frontend (`DefensePrep.tsx`):
  - Añadir botón "Biblioteca de pruebas" junto a la pestaña Pruebas.
  - Modal de biblioteca con listado, drag-and-drop de subida, visor inline según tipo, botón de papelera.
  - Modal de papelera con opción de restaurar o borrar permanentemente.
  - Indicador de espacio usado / 10 GB.

### Redaccion

71. Fallo: la revisión puede resaltar o sustituir el fragmento equivocado cuando el mismo texto aparece varias veces en el escrito.
Motivo: `frontend/src/pages/WritingReview.tsx` localiza cada sugerencia con `findPmRange(...)`, que primero hace `plain.indexOf(searchText)` y, si falla, intenta una búsqueda aproximada cercana. Si una frase, cláusula o fórmula se repite, el sistema toma la primera coincidencia o una coincidencia aproximada, no necesariamente la correcta.
Solucion: las sugerencias de IA deben venir ligadas a offsets fiables sobre la version exacta del texto revisado, en lugar de reubicar despues cada cambio mediante busquedas por cadena.
Explicacion tecnica: en produccion esto puede marcar o reemplazar otra ocurrencia distinta dentro del documento, algo especialmente peligroso en redaccion juridica donde se repiten expresiones muy parecidas en varios apartados.
Detalle tecnico (solucion definitiva): el backend divide el texto plano en parrafos y asigna un ID unico a cada uno (P0, P1, P2...). El prompt de revision instruye a la IA para que devuelva, junto a cada sugerencia, el paragraphId correspondiente. Tras recibir la respuesta, el backend localiza el parrafo afectado por su ID, busca el texto original SOLO dentro de ese parrafo reducido y calcula los offsets absolutos from/to sobre el documento completo. El frontend recibe las sugerencias ya con from/to exactos y aplica los Highlight marks directamente en esas posiciones del editor, eliminando por completo la ambiguedad de repeticiones en distintos apartados.

72. Fallo: los resultados de la revision con IA pueden terminar aplicandose sobre otro documento o sobre otra version del mismo texto.
Motivo: `frontend/src/pages/WritingReview.tsx` mantiene `_reviewPromise`, `_reviewResults`, `_reviewInProgress` y `_reviewAbort` a nivel de modulo y, al restaurar la revision, vuelve a pintar las sugerencias sobre el editor que este abierto en ese momento. No guarda ni `currentTextId` ni una huella del contenido exacto que se envio a revisar.
Solucion: cada revision debe quedar vinculada al documento y al snapshot concreto del texto revisado, invalidandose si el usuario cambia de escrito o modifica el contenido antes de que llegue la respuesta.
Explicacion tecnica: si el usuario cambia de documento, sigue escribiendo mientras la IA revisa o sale y vuelve al apartado, las sugerencias pueden rehidratarse sobre contenido distinto y quedar desalineadas o directamente engañosas.

73. Fallo: el borrador local mezcla todos los documentos de Redaccion de una misma cuenta y puede reaparecer en el contexto equivocado.
Motivo: el autosave usa siempre la misma clave `localStorage` `writing_draft_<accountId>` y la restauracion tambien solo lee esa clave. No distingue entre documento nuevo, texto guardado A o texto guardado B.
Solucion: el borrador debe guardarse por documento o, como minimo, junto con metadatos que permitan saber exactamente a que escrito pertenece.
Explicacion tecnica: en produccion esto permite que los cambios sin guardar de un escrito sobrescriban el borrador de otro y que, al volver al apartado, aparezca contenido que no corresponde con el texto que el usuario cree estar retomando.

74. Fallo: la revision de IA no tiene limite de tamaño ni particionado, y con escritos largos puede fallar o degradarse de forma imprevisible.
Motivo: `backend/src/controllers/writingController.ts` solo valida que `text` exista, y `backend/src/services/aiService.ts` envia el texto completo a `reviewLegalText(...)` con un timeout fijo de 180 segundos. No hay validacion de longitud, chunking, job en segundo plano ni estrategia especifica para documentos extensos.
Solucion: el apartado Redaccion necesita dos modos de revision: uno corto y sincronico para textos pequeños, y otro por bloques para escritos largos. Cuando el documento supere un umbral razonable, no deberia enviarse completo en una sola llamada, sino dividirse por secciones o parrafos, revisar cada bloque por separado, consolidar despues las sugerencias y, preferiblemente, ejecutar ese proceso en segundo plano.
Explicacion tecnica: con textos juridicos largos, el usuario puede encontrarse timeouts, respuestas truncadas o costes de revision descontrolados sin que la UI gestione bien ese escenario. En produccion eso vuelve poco fiable la funcion precisamente en los documentos mas importantes. La salida robusta no es aumentar el timeout, sino limitar la revision directa y pasar los escritos extensos a un flujo de revision fragmentada y reensamblada.

75. Fallo: los textos del apartado Redaccion se comparten entre la cuenta principal y sus subcuentas, incumpliendo la regla de privacidad interna.
Motivo: `backend/src/controllers/writingController.ts` filtra y autoriza solo por `accountId`, y `verifyOwnership(req, accountId)` permite acceso tanto a la cuenta principal como a cualquier subcuenta con `parentAccountId` coincidente. El modelo `backend/src/models/WritingText.ts` tampoco guarda ningun `createdBy` o propietario por usuario.
Solucion: cada texto de Redaccion debe pertenecer al `userId` autenticado que lo crea, y todos los endpoints del modulo deben validar por `accountId + createdBy` en lugar de compartir la coleccion completa entre usuarios del mismo tenant.
Explicacion tecnica: con el comportamiento actual, una subcuenta puede listar, abrir, editar o borrar textos creados por la cuenta principal o por otra subcuenta de la misma cuenta. Si el requisito de producto es que ni chats ni textos se compartan internamente, Redaccion ahora mismo no cumple el aislamiento esperado en produccion.

### Resumenes

76. Fallo: el apartado Resumenes no aisla los chats entre la cuenta principal y sus subcuentas, y los endpoints del ciclo de vida permiten abrir y mutar chats de otro usuario del mismo tenant.
Motivo: en `backend/src/controllers/documentSummariesController.ts`, `getAllSummaryChats` solo añade `createdBy = user.userId` cuando el usuario es subcuenta, asi que la cuenta principal recibe todos los chats del tenant. Ademas, `getSummaryChat`, `updateChatTitle`, `deleteSummaryChat`, `duplicateSummaryChat`, `deleteFile`, `sendMessage` y `streamMessage` validan unicamente `verifyOwnership(req, chat.accountId)` y no comprueban `chat.createdBy`.
Solucion: cada chat de Resumenes debe validarse por `accountId + createdBy` tanto para la cuenta principal como para las subcuentas, y la cuenta principal no deberia ver ni operar chats ajenos si el requisito es privacidad interna total.
Explicacion tecnica: el filtrado parcial del listado no basta si abrir, renombrar, duplicar, borrar, subir archivos o enviar mensajes sigue autorizado solo por tenant. En produccion eso deja el modulo expuesto a fugas internas y reabre en Resumenes un problema que el negocio ya ha prohibido expresamente.

77. Fallo: duplicar un chat de Resumenes desde una subcuenta rompe la propiedad del chat y puede dejar la copia fuera del selector normal.
Motivo: `duplicateSummaryChat` en `backend/src/controllers/documentSummariesController.ts` crea la copia con `title`, `uploadedFiles`, `messages`, `lastModified` y `accountId`, pero no copia ni recalcula `createdBy`. El modelo `backend/src/models/DocumentSummariesChat.ts` deja entonces `createdBy` con su valor por defecto (`''`), y `getAllSummaryChats` filtra las subcuentas por `createdBy = user.userId`.
Solucion: al duplicar un chat hay que heredar el propietario real del chat o reasignarlo explicitamente al `userId` autenticado, manteniendo el mismo criterio de visibilidad que usa el listado.
Explicacion tecnica: hoy una subcuenta puede duplicar un chat, seguir viendolo solo mientras conserva el `currentSummaryChat` en `sessionStorage`, y despues perderlo del historial normal. Ademas, al quedar sin propietario explicito, se agrava el desorden de permisos internos del modulo.

78. Fallo: la subida de PDFs de Resumenes persiste archivos en disco antes de validar el chat y luego el procesado confia en rutas reenviadas por el cliente.
Motivo: `backend/src/routes/documentSummariesRoutes.ts` aplica `uploadSummaries.array('files', 4)` antes de `stageUploadFiles`, de modo que `multer` escribe primero en `uploads/summaries` y el controlador valida despues si el chat existe y pertenece al usuario. Luego `processStagedUploadFiles` vuelve a aceptar `stagedFiles[]` desde `req.body` y solo comprueba `isSafeSummaryUploadPath(stagedFile.path)`, no que esas rutas staged hayan sido emitidas por el servidor para ese chat y ese usuario.
Solucion: el staging debe gestionarse en servidor y quedar ligado al `chatId` y al usuario autenticado mediante IDs opacos o una tabla temporal; si la validacion falla o el job no arranca, los ficheros temporales deben limpiarse siempre.
Explicacion tecnica: en produccion esto permite generar residuos en disco con peticiones invalidas o abandonadas y deja el modulo confiando en paths reenviados por el navegador, algo demasiado debil para un flujo que maneja documentos legales.

### Automatizaciones

**Decisiones ya cerradas para este apartado:**
- El flujo de sincronizacion manual de Google Calendar se mantiene como funcionalidad de producto. No debe retirarse la UI ni la llamada frontend; debe completarse y mantenerse operativa la ruta backend correspondiente.
- El campo `alertEmail` de WhatsApp se mantiene y debe implementarse de verdad. No debe retirarse de la interfaz ni quedarse como dato decorativo sin logica real de aviso.
- La fuente de verdad para la gestion de sesiones y numeros de WhatsApp debe pasar a ser `whatsappSessions`. El campo legacy `whatsappSession` debe quedar solo como compatibilidad temporal o dato derivado mientras se completa la migracion, pero no debe seguir siendo la base de la logica nueva.

HECHO 3. Fallo: el flujo de sincronizacion manual de Google Calendar no puede funcionar porque la ruta backend no existe.
Motivo: en `frontend/src/pages/Automations.tsx` se llama a `POST ${CALENDAR_API}/sync`, y en `backend/src/controllers/calendarController.ts` existe `syncCalendar`, pero `backend/src/routes/calendarRoutes.ts` no registra `router.post('/sync', syncCalendar)`.
Solucion: hay que exponer la ruta de sincronizacion o eliminar la llamada del frontend si ya no forma parte del producto.
Explicacion tecnica: registra `syncCalendar` en `calendarRoutes.ts` con el mismo esquema de autenticacion que el resto de rutas del calendario. Si el flujo debe seguir existiendo, añade tambien una prueba o validacion que cubra el boton de sincronizar del panel.

HECHO 6. Fallo: el endpoint de subcuentas de automatizaciones filtra todas las subcuentas del sistema si falta `accountId`.
Motivo: en `backend/src/controllers/automatizacionesController.ts`, `getSubcuentas` hace `Subaccount.find()` completo cuando no llega `accountId`, y ademas en caso de error devuelve `[]`, ocultando el fallo real.
Solucion: ese endpoint nunca debe devolver datos globales. Si falta `accountId`, debe responder 400 o derivarlo del usuario autenticado.
Explicacion tecnica: elimina el branch `if (!accountId) { const all = await Subaccount.find(); ... }` y exige siempre contexto de cuenta con `verifyOwnership`. En errores, devuelve 500 en lugar de vaciar silenciosamente la respuesta.

HECHO 27. Fallo: las descargas de adjuntos de Email y WhatsApp no estan aisladas por cuenta.
Motivo: `backend/src/controllers/automatizacionesController.ts` en `downloadEmailAttachment` descarga por `filename` sin validar `accountId`, y `backend/src/controllers/whatsappController.ts` en `serveWAAttachment` hace lo mismo con archivos de WhatsApp. Ademas, `frontend/src/pages/Automations.tsx` construye las URLs directas con `att.filename`, por lo que cualquier usuario autenticado que conozca o adivine un nombre de archivo puede intentar descargar adjuntos de otra cuenta.
Solucion: cada descarga debe comprobar que el adjunto pertenece a la cuenta autenticada antes de enviarlo.
Explicacion tecnica: deja de resolver adjuntos solo por nombre de fichero. Guarda y consulta un identificador de adjunto asociado a la cuenta y a la conversacion, y valida `verifyOwnership` antes de hacer `sendFile` o `download`. Mientras el control se base solo en `filename`, el almacenamiento compartido seguira exponiendo ficheros entre tenants.


HECHO 34. Fallo: el modal de gestion de numeros de WhatsApp esta roto y no puede administrar correctamente las sesiones Meta.
Motivo: en `frontend/src/pages/Automations.tsx`, `loadAutoData` espera `data.whatsappSessions`, pero `backend/src/controllers/whatsappController.ts` en `getWhatsAppStatus` devuelve `sessions`. Ademas, `saveWaSession`, `deleteWaSession` y `refreshWaToken` llaman al helper `api()` de automatizaciones con rutas como `/whatsapp/connect-manual`, `/whatsapp/disconnect` y `/whatsapp/refresh-token`, aunque esas rutas reales viven bajo `/whatsapp` y no bajo `/automatizaciones`. Para rematar, la UI usa `s.phoneNumberId`, pero `getWhatsAppStatus` devuelve `id` y no expone `phoneNumberId`.
Solucion: la gestion de numeros de WhatsApp debe usar un contrato unico entre frontend y backend, con el mismo namespace y las mismas propiedades de sesion.
Explicacion tecnica: haz que `getWhatsAppStatus` devuelva exactamente el shape que consume la UI o adapta la UI al shape real. Y en el modal, sustituye el helper `api()` por llamadas a `WA_API` para conectar, desconectar y renovar token. Mientras convivan nombres de campo y rutas distintas, el modal seguira mostrando listas vacias o acciones inoperantes.

HECHO 35. Fallo: si una cuenta tiene varios numeros de WhatsApp conectados, los mensajes pueden salir por el numero equivocado.
Motivo: `frontend/src/pages/Automations.tsx` filtra conversaciones por `phoneNumberId`, y cada conversacion puede pertenecer a un numero distinto. Sin embargo, `backend/src/controllers/whatsappController.ts` en `sendWhatsAppMessage` usa `account.whatsappSession.instanceName` sin seleccionar la sesion de la conversacion, y `backend/src/services/whatsappService.ts` en `sendTextMessage` y `sendMediaMessage` vuelve a elegir simplemente la primera sesion conectada (`find((s) => s.connected)`).
Solucion: cada respuesta manual o automatica debe usar la sesion concreta del `phoneNumberId` asociado a la conversacion, no una sesion conectada cualquiera.
Explicacion tecnica: pasa `conversation.phoneNumberId` hasta el servicio de envio y resuelve la sesion exacta con ese identificador. Si no existe una sesion valida para esa conversacion, devuelve error controlado. Con el codigo actual, el soporte multi-numero queda incoherente y puede enviar respuestas desde el remitente incorrecto.

HECHO 36. Fallo: la interfaz de email manual puede mostrar un mensaje como enviado aunque el backend haya fallado.
Motivo: en `frontend/src/pages/Automations.tsx`, `sendManualMessage` hace el `POST /automatizaciones/conversations/:id/send`, pero añade el mensaje al estado local sin comprobar `res.ok`. Si el backend responde 404/500 o falla el SMTP, la UI igualmente pinta el mensaje como enviado.
Solucion: la conversacion solo debe actualizarse como enviada cuando la respuesta del backend confirme exito real.
Explicacion tecnica: tras el `fetch`, comprueba `res.ok` antes de leer adjuntos y antes de mutar `emailConversations`. Si falla, conserva el texto o muestra error al usuario en vez de insertar un mensaje falso en la cronologia. Ahora mismo el backend intenta hacer rollback, pero la UI se queda con un estado de exito inexistente.

HECHO 37. Fallo: las rutas de renovacion y consulta de token de WhatsApp no validan ownership de la cuenta.
Motivo: en `backend/src/routes/index.ts` todo `/api/whatsapp/*` pasa por `authMiddleware`, pero `backend/src/controllers/whatsappController.ts` en `refreshWhatsAppToken` y `getTokenStatus` usa `accountId` y `phoneNumberId` sin llamar a `verifyOwnership(req, accountId)`, a diferencia del resto del controlador.
Solucion: renovar un token o consultar su estado debe exigir el mismo control de ownership que el resto de endpoints de automatizaciones.
Explicacion tecnica: añade `verifyOwnership` al inicio de ambos handlers antes de invocar `waService.refreshWhatsAppToken` o `waService.getTokenStatus`. Con el codigo actual, cualquier usuario autenticado que conozca o adivine un `accountId` y `phoneNumberId` validos puede consultar metadatos del token o forzar su renovacion sobre cuentas ajenas.

HECHO 38. Fallo: el envio manual de WhatsApp desde la UI puede fallar aunque la cuenta figure como conectada.
Motivo: `backend/src/services/whatsappService.ts` en `connectMetaWithCodeInternal`, `connectMetaWithToken` y `connectMetaManual` guarda `whatsappSession` copiando una entrada de `whatsappSessions`, pero esas sesiones no incluyen `instanceName`. Luego `backend/src/controllers/whatsappController.ts` en `sendWhatsAppMessage` exige `account.whatsappSession.instanceName` para considerar la conexion valida y, si falta, responde `WhatsApp not connected`.
Solucion: la sesion legacy usada por envio manual debe conservar un `instanceName` valido o, mejor, el controlador no debe depender de ese campo para enviar con Meta.
Explicacion tecnica: al conectar WhatsApp, persiste `instanceName: lyrium_${accountId}` tanto en `whatsappSession` como en cada sesion que pueda reutilizarse despues. Con el codigo actual, la pantalla puede mostrar WhatsApp conectado mientras el envio manual falla por un mismatch interno del modelo de sesion.

HECHO 39. Fallo: desconectar un numero concreto de WhatsApp puede dejar una sesion legacy zombi activa.
Motivo: `backend/src/services/whatsappService.ts` en `disconnectWhatsApp(accountId, phoneNumberId)` elimina la entrada de `whatsappSessions`, pero solo limpia `whatsappSession` cuando la desconexion es total. Si se desconecta un numero concreto, `whatsappSession` puede seguir apuntando a la sesion borrada. A partir de ahi, `getInstanceStatus`, `sendTextMessage`, `sendMediaMessage` y otros flujos todavia pueden usar ese estado heredado.
Solucion: al desconectar un numero individual, el backend debe reasignar `whatsappSession` a otra sesion conectada valida o vaciarla si ya no queda ninguna.
Explicacion tecnica: despues del `filter` por `phoneNumberId`, recalcula `whatsappSession` en funcion de `whatsappSessions` restantes. Si no se hace, la app puede seguir reportando conexion o intentar operar con un numero que el usuario ya elimino del sistema.

HECHO 40. Fallo: el envio manual de WhatsApp no es atomico y puede dejar mensajes enviados sin rastro en la app y archivos huerfanos en disco.
Motivo: `backend/src/controllers/whatsappController.ts` en `sendWhatsAppMessage` primero envia texto y adjuntos a Meta, y solo despues llama a `persistOutgoingWhatsAppMessage`. Si falla cualquier paso posterior a un envio ya realizado, el `catch` devuelve 500 sin registrar la conversacion y sin ejecutar `cleanupUploadedFiles(files)`. Esto deja al cliente recibiendo mensajes que no aparecen en la UI, y adjuntos subidos que quedan abandonados en disco.
Solucion: el envio manual de WhatsApp debe persistir y limpiar de forma consistente, incluso cuando hay fallos parciales.
Explicacion tecnica: o bien guarda primero la intencion de envio y luego aplica rollback/persistencia por cada paso, o bien persiste cada mensaje/adjunto confirmado conforme Meta lo acepta. En todos los errores posteriores a la subida, limpia los ficheros temporales. Ahora mismo el flujo puede quedar partido entre Meta, base de datos y sistema de archivos.

HECHO 41. Fallo: el polling de Email puede quedar colgado en memoria aunque la cuenta ya no tenga ninguna bandeja configurada.
Motivo: `backend/src/controllers/automatizacionesController.ts` en `createCuentaCorreo` y `updateSwitch` llama a `startPolling(accountId)`, pero `deleteCuentaCorreo` nunca llama a `stopPolling(accountId)`. `backend/src/services/emailProcessorService.ts` mantiene un `setInterval` por cuenta en `pollingIntervals`, de modo que al borrar la ultima cuenta de correo el timer sigue vivo hasta reiniciar el proceso.
Solucion: cuando una cuenta se queda sin `cuentasCorreo`, el backend debe detener el polling asociado.
Explicacion tecnica: despues de borrar una cuenta de correo, si `account.cuentasCorreo.length === 0`, invoca `stopPolling(accountId)`. Si mas adelante se vuelve a crear una cuenta, `startPolling(accountId)` puede reactivarlo. Con el codigo actual, una instancia larga acumula timers ociosos para cuentas ya desconfiguradas.

HECHO 42. Fallo: la gestion del token de WhatsApp Meta puede marcar como valido 60 dias un token que en realidad sigue siendo corto o ya no es el correcto.
Motivo: en `backend/src/services/whatsappService.ts`, `connectMetaWithCodeInternal` y `connectMetaWithToken` intentan intercambiar el token por uno long-lived, pero si ese exchange falla conservan el token original (`Keep short-lived token if long-lived exchange fails`) y aun asi guardan `tokenType: 'long'` y `tokenExpiresAt = ahora + 60 dias`. `connectMetaManual` hace lo mismo sin verificar duracion real del token proporcionado.
Solucion: el backend debe distinguir entre token corto y token long-lived real, y almacenar la expiracion segun el `expires_in` devuelto por Meta o segun el tipo real de token recibido.
Explicacion tecnica: no hardcodees 60 dias ni marques `tokenType: 'long'` salvo cuando el exchange haya tenido exito y Meta haya devuelto un token renovado. Si el exchange falla, conserva el tipo real del token y una expiracion coherente, o bloquea la conexion hasta obtener un token valido. Con el codigo actual, la UI puede mostrar una falsa sensacion de validez durante 60 dias aunque el token real caduque mucho antes.

HECHO 43. Fallo: el supuesto email de alerta para el token de WhatsApp no hace nada en produccion.
Motivo: la UI de `frontend/src/pages/Automations.tsx` permite guardar `alertEmail` y luego lo muestra en la ficha de la sesion, mientras `backend/src/services/whatsappService.ts` solo almacena ese campo dentro de la sesion. No aparece ningun worker, scheduler ni envio de correo que lea `alertEmail`, `tokenExpiresAt` o `daysRemaining` para avisar antes de la caducidad.
Solucion: si el producto ofrece un email de alerta, debe existir una logica real de aviso o retirarse ese campo de la interfaz.
Explicacion tecnica: implementa un proceso programado que recorra las sesiones de WhatsApp, evalue `tokenExpiresAt` y envie avisos al `alertEmail` cuando el token entre en estado `warning` o `critical`; o elimina la opcion de la UI si el refresco va a ser siempre manual. Ahora mismo se guarda un dato que da a entender una proteccion operativa que no existe.

HECHO 65. Fallo: confirmar una asignacion automatica por email puede duplicar el caso en lugar de promocionar el pendiente existente.
Motivo: `backend/src/services/emailProcessorService.ts` llama a `assignCase(...)` cuando el cliente responde afirmativamente a la confirmacion de asignacion. Dentro de esa funcion primero hace `CaseModel.findOneAndUpdate({ accountId, sourceId: conversationId, status: 'pending' }, ...)` y despues vuelve a crear otro registro con `createCaseFromEmail(...)`. Si el pendiente ya se habia creado al pedir confirmacion, la misma conversacion termina con dos casos.
Solucion: la confirmacion debe reutilizar el caso pendiente existente y solo crear un caso nuevo cuando no haya ninguno para esa conversacion.
Explicacion tecnica: `assignCase` debe comportarse de forma idempotente por `accountId + sourceId`. Mientras mantenga un `update` sobre el pendiente y despues una creacion incondicional, el apartado Casos acumulara duplicados, contadores inflados y estados incoherentes por una sola solicitud real.

HECHO 66. Fallo: la asignacion automatica de casos de WhatsApp deja casos marcados como asignados pero sin abogado responsable persistido.
Motivo: en `backend/src/services/whatsappService.ts`, tanto al confirmar una asignacion pendiente como al detectar una solicitud explicita, el flujo llama a `assignWhatsAppCase(...)` y luego hace `CaseModel.findOneAndUpdate(..., { status: 'assigned', assignedAt: ... })`. Ese `update` no guarda `assignedSubaccountId` ni `assignedSubaccountName`, aunque la subcuenta ya se ha elegido dentro de `assignWhatsAppCaseToSubaccount`.
Solucion: cuando un caso de WhatsApp quede asignado, el documento `Case` debe persistir tambien la subcuenta responsable y no solo el cambio de estado.
Explicacion tecnica: si Casos guarda registros `assigned` sin `assignedSubaccountId`, los filtros por abogado, la trazabilidad operativa y cualquier logica posterior basada en responsable quedan rotos aunque la asignacion haya ocurrido realmente.

HECHO 70. Fallo: el envio manual de Email oculta los fallos reales de SMTP como si la conversacion o la cuenta no existieran.
Motivo: `backend/src/services/emailProcessorService.ts` en `sendManualEmail(...)` devuelve `false` tanto cuando no encuentra la conversacion o la cuenta de correo como cuando el SMTP falla despues del rollback. Luego `backend/src/controllers/automatizacionesController.ts` en `sendManualEmailHandler` traduce cualquier `false` a `404 Conversación o cuenta de correo no encontrada`.
Solucion: el backend debe diferenciar entre recurso inexistente y fallo operativo de envio.
Explicacion tecnica: `sendManualEmail` deberia devolver un resultado discriminado o lanzar errores especificos, por ejemplo `conversation_not_found`, `mailbox_not_found` y `send_failed`. El controlador solo deberia responder `404` en los casos de recurso ausente y usar `5xx` o `502` cuando el envio falle realmente. Con el codigo actual, la UI y los logs reciben un diagnostico falso justo en el flujo manual que el usuario usa para corregir respuestas automaticas.

HECHO 71. Fallo: el `alertEmail` de las sesiones de WhatsApp ni siquiera hace roundtrip completo entre UI y backend en los flujos Meta actuales.
Motivo: `frontend/src/pages/Automations.tsx` envia `alertEmail` al guardar una sesion manual y espera leerlo despues en la ficha de la sesion, pero `backend/src/controllers/whatsappController.ts` en `connectWhatsAppManual` y `connectWhatsAppWithToken` no desestructura ni reenvia `alertEmail` a `connectMetaManual(...)` o `connectMetaWithToken(...)`. Ademas, `getWhatsAppStatus` serializa `sessions` sin incluir `alertEmail`, por lo que incluso una sesion que lo tuviera guardado no puede volver a la UI con ese dato.
Solucion: el contrato de alta y lectura de sesiones debe aceptar, persistir y devolver `alertEmail` de forma consistente.
Explicacion tecnica: añade `alertEmail` al body y al passthrough de los handlers Meta, persiste el campo en la sesion correspondiente y devuelvelo en el shape que consume la UI. Mientras no exista ese roundtrip completo, el usuario rellena un dato que desaparece al guardar y la interfaz muestra una falsa sensacion de configuracion persistida.

### Testeo

- Estado actual: se han creado los tests y suites, pero no se ha ejecutado ninguno todavia por decision explicita de trabajo en esta fase.
- `backend/src/test/automations.unit.test.ts`: cubre `automationMessages.ts` y handlers de token de `whatsappController.ts` para validacion de parametros, errores de servicio, payloads de exito y 404 de sesion inexistente.
- `backend/src/test/automations.controller.test.ts`: cubre `automatizacionesController.ts` y `calendarController.ts` en `getData`, `createEspecialidad`, `createCuentaCorreo`, `getSubcuentas`, `getEvents` y `syncCalendar`.
- `backend/src/test/email.automation-flows.test.ts`: cubre flujo profundo de Email en `processIncomingEmails`, agrupacion y marcado de UIDs, respuesta desde base de conocimiento, creacion de confirmaciones de asignacion, rollback del envio manual y limpieza de conversaciones/pendientes.
- `backend/src/test/whatsapp.automation-flows.test.ts`: cubre flujo profundo de WhatsApp en `processIncomingMessage`, almacenamiento de mensajes entrantes, respuesta desde KB, creacion de confirmaciones de asignacion, bloqueo del envio manual fuera de la ventana de 24 horas y contratos pendientes de corregir entre controlador y frontend.
- `backend/src/test/stripe.scenario.test.ts`: cubre escenarios realistas de Stripe para `createPaymentIntent`, `confirmPayment`, auto renovacion en trial y `validateSubscription` con las combinaciones de plan e intervalo actualmente soportadas.

### Casos

4. Fallo: el modulo de casos permite leer, crear, modificar, asignar y borrar casos de otras cuentas.
Motivo: en `backend/src/controllers/casesController.ts` funciones como `getCases`, `getCaseById`, `assignCase`, `updateCaseStatus`, `linkCaseToClient`, `createManualCase`, `getCaseConversation`, `deleteCase` y `updateCaseNotes` trabajan con `accountId`, `caseId`, `clientId` o `subaccountId` sin llamar a `verifyOwnership`. Las rutas de `backend/src/routes/casesRoutes.ts` dependen solo de que el usuario este autenticado.
Solucion: todas las operaciones del modulo de casos deben verificar que el caso, el cliente y la subcuenta pertenecen a la cuenta autenticada antes de leer o escribir.
Explicacion tecnica: para listados, valida `accountId` con `verifyOwnership(req, accountId)`. Para operaciones por `caseId`, carga primero el caso y comprueba `verifyOwnership(req, caseDoc.accountId)`. Para asignaciones, valida tambien que la `Subaccount` y el `Client` pertenezcan a la misma cuenta que el caso.

67. Fallo: el modulo mezcla dos conceptos distintos como si fueran el mismo: abogado del caso y responsable global del cliente.
Motivo: los flujos automaticos de email y WhatsApp trabajan sobre `Case.assignedSubaccountId`, pero otras partes del sistema siguen apoyandose en `Client.assignedSubaccountId` como si un cliente solo pudiera tener un abogado. Sin embargo, en la propia app un cliente ya puede tener varios casos, y cada caso puede corresponder a un abogado distinto.
Solucion: la verdad operativa debe vivir en el caso, no en un unico campo global del cliente. Si la ficha del cliente necesita un dato adicional, debe ser otro concepto separado, por ejemplo un `gestorPrincipal`, y no el supuesto responsable de todos los asuntos.
Explicacion tecnica: no conviene sincronizar ciegamente cada asignacion de caso hacia `Client.assignedSubaccountId`, porque eso pisaria otros asuntos del mismo cliente. Los listados, filtros y reparto deben basarse en `Case.assignedSubaccountId`, y la ficha del cliente debe derivar sus abogados desde los casos enlazados o mostrar un gestor principal distinto.

68. Fallo: el alta manual desde el apartado Casos no permite elegir especialidad aunque el flujo y el modelo si la contemplan.
Motivo: `frontend/src/pages/Cases.tsx` mantiene `newCaseForm.especialidadId` y al enviar intenta resolver `especialidadName`, pero el modal de `Nuevo caso` no renderiza ningun selector ni input de especialidad. El usuario solo puede rellenar contacto, descripcion, abogado y cliente.
Solucion: si la especialidad forma parte del modelo operativo de Casos, el formulario manual debe permitir seleccionarla; si no, hay que retirar esa logica muerta y tratar el caso manual como un flujo distinto de manera explicita.
Explicacion tecnica: en produccion esto deja todos los casos manuales creados desde la pantalla sin clasificacion real de especialidad, degradando reporting, filtros y cualquier automatizacion que dependa de ese campo.

69. Fallo: al crear manualmente un caso desde una subcuenta, el sistema sigue arrastrando la ambigüedad de un cliente con responsable unico.
Motivo: `backend/src/controllers/casesController.ts` asigna correctamente el caso a la subcuenta autenticada, pero la ficha del cliente solo puede conservar un `assignedSubaccountId` unico o incluso uno anterior. En un cliente con varios casos, ese dato deja de representar la realidad completa porque distintos asuntos pueden tener abogados distintos.
Solucion: al crear el caso manual, la asignacion debe mantenerse en el caso como fuente de verdad. La ficha del cliente no deberia reescribirse para reflejar cada asunto; en su lugar, debe mostrar los abogados de sus casos o, si existe, un `gestorPrincipal` independiente.
Explicacion tecnica: con clientes multi-asunto, sincronizar o no sincronizar un unico `Client.assignedSubaccountId` no resuelve el problema de fondo: el modelo no puede condensar varios abogados activos en un solo campo. La solucion robusta es separar asignacion por caso y representacion agregada del cliente.

### Fiscal

12. Fallo: el modulo fiscal tiene texto con codificacion rota y eso degrada respuestas, prompts y mensajes internos.
Motivo: `backend/src/controllers/fiscalController.ts` contiene cadenas corruptas como `EspaÃ±a`, `PaÃ­s`, `informaciÃ³n` o `vÃ¡lido`. Ese texto se usa en `COUNTRY_NAMES` y tambien dentro de prompts enviados al asistente fiscal.
Solucion: el archivo debe guardarse con codificacion correcta y revisarse cualquier texto ya dañado.
Explicacion tecnica: normaliza el fichero a UTF-8 real, corrige las cadenas mojibake y valida que los prompts resultantes llegan limpios al modelo. Si estas cadenas se generaron por scripts de parcheo, revisa tambien la fuente que las produjo.
