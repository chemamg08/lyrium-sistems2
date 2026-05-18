# WhatsApp Meta: especificacion tecnica completa

## Estado de autorizacion

Este documento se crea como especificacion tecnica previa.

No se debe modificar codigo de la app a partir de este documento hasta que el usuario lo autorice de forma explicita.

## Estado de implementacion

- [HECHO] Corregido el error de Mongo al inicializar `whatsappSession` cuando estaba a `null`
- [HECHO] Ampliado el schema de sesiones de WhatsApp con campos de estado, caducidad conocida/desconocida y trazas de alertas
- [HECHO] El envio de alertas de WhatsApp pasa por el correo de sistema del backend
- [HECHO] Scheduler de revision de sesiones actualizado a una frecuencia de 2 horas
- [HECHO] Alertas separadas entre caducidad prevista y fallo funcional, con reenvio diario mientras siga roto
- [HECHO] Conexion manual guardando el token intercambiado `long-lived` como credencial final
- [HECHO] Conexion rapida mantenida en codigo pero deshabilitada visualmente en la UI
- [HECHO] Email de alerta obligatorio en los flujos visibles de conexion
- [HECHO] Modal de instrucciones manuales anadido con enlace a `Meta Developers > Apps` e imagen `ayudanum.png`
- [HECHO] Modal `Numeros de WhatsApp` ampliado para mostrar la opcion rapida/manual sin eliminar lo existente
- [HECHO] Textos nuevos o modificados integrados con claves `i18n`

## Objetivo general

Reestructurar la conexion de WhatsApp con Meta en el modulo de Automatizaciones para que:

- la via rapida use el flujo oficial de Meta para negocio
- la via manual use obligatoriamente `short-lived user token -> exchange automatico -> long-lived user token`
- nunca se guarde en produccion un token corto como credencial final
- la app compruebe periodicamente si la credencial y el numero siguen siendo funcionales
- los avisos de caducidad y fallo se envien siempre por Brevo usando la cuenta configurada en el `env` del backend
- la UI muestre instrucciones correctas y mas seguras para la conexion manual
- el boton de via rapida quede deshabilitado visualmente por mantenimiento, sin eliminar su logica interna

## Restricciones impuestas por el usuario

- hablar y rotular en castellano donde proceda en la UI afectada
- no eliminar botones, funciones ni estetica salvo lo pedido
- cambios minimos y precisos
- separar logica nueva de la existente
- mantener JSX limpio
- no mezclar logica compleja dentro del JSX
- separar estado y llamadas API
- no hacer cambios grandes fuera del alcance
- no tocar codigo hasta nueva autorizacion del usuario

## Regla obligatoria de i18n

Todo texto nuevo o modificado en frontend que forme parte de la UI traducible debe implementarse usando el sistema actual de internacionalizacion del proyecto.

### Obligaciones

- no hardcodear en JSX textos nuevos de UI si deben poder traducirse
- crear o reutilizar claves del sistema actual de `i18n`
- actualizar los archivos de idioma necesarios siguiendo el patron ya existente del proyecto
- respetar la estructura actual de namespaces y claves del frontend

### Aplicacion minima

Esto afecta como minimo a:

- textos nuevos del modal de conexion de WhatsApp
- texto de mantenimiento del boton rapido
- labels y ayudas del email obligatorio
- boton `Instrucciones`
- contenido traducible del modal de instrucciones, salvo que se decida conscientemente dejarlo fijo por requisito de negocio
- textos nuevos del modal `Numeros de WhatsApp`
- estados nuevos de token, caducidad o error si se muestran en UI

### Regla de decision

Si un texto aparece en interfaz visible al usuario y ya existe un patron de traduccion para elementos similares, debe ir por `i18n`.

## Contexto actual detectado

### Frontend

Archivo principal afectado:

- `frontend/src/pages/Automations.tsx`

Situacion actual:

- existe modal `Conectar WhatsApp con Meta`
- existe modo rapido y modo manual dentro del modal
- el boton `Continuar con Meta` actualmente intenta abrir el flujo real con `FB.ui` o `FB.login`
- el email de alerta es opcional en la conexion manual
- no existe boton `Instrucciones`
- no existe modal de instrucciones con el contenido proporcionado por el usuario
- no se muestra `ayudanum.png`
- en `Numeros de WhatsApp` existe un formulario manual simple, pero no replica el esquema rapido/manual del modal principal
- el frontend pinta la caducidad de forma local con `tokenExpiresAt`, sin consultar el endpoint `/token-status`

### Backend

Archivos principales afectados:

- `backend/src/controllers/whatsappController.ts`
- `backend/src/services/whatsappService.ts`
- `backend/src/services/whatsappAlertScheduler.ts`
- `backend/src/services/emailService.ts`
- `backend/src/models/Automation.ts`
- `backend/src/server.ts`

Situacion actual:

- el flujo rapido actual inicializa estado OAuth y usa rutas:
  - `POST /api/whatsapp/connect`
  - `POST /api/whatsapp/meta/connect-token`
  - `POST /api/whatsapp/meta/connect`
- el flujo manual actual usa:
  - `POST /api/whatsapp/meta/connect-manual`
- el backend sigue tocando el campo legacy `whatsappSession`
- existe `whatsappSessions` como estructura moderna, pero convive con `whatsappSession`
- el scheduler de alertas actual revisa cada 24 horas
- el scheduler actual intenta enviar con la primera cuenta de correo de Automatizaciones y luego cae a un sistema legacy
- no existe un chequeo tecnico real cada 2 horas contra Meta para verificar operatividad
- la via manual actual guarda el token introducido por el usuario; no fuerza exchange obligatorio a long-lived
- la via rapida actual intenta intercambiar `fb_exchange_token`, pero conceptualmente sigue modelada como token de usuario y no como credencial oficial del flujo de negocio

## Error actual identificado

### Error funcional

Al pulsar `Continuar con Meta` se recibe:

- frontend:
  - `POST https://lyrium-sistems2.onrender.com/api/whatsapp/connect 500 (Internal Server Error)`
- backend/Mongo:
  - `Plan executor error during findAndModify :: caused by :: Cannot create field 'connected' in element {whatsappSession: null}`

### Causa tecnica detectada

En `backend/src/services/whatsappService.ts`, funcion `initMetaEmbeddedSignup(...)`, y tambien en rutas equivalentes de inicializacion, se hace `findByIdAndUpdate` con paths anidados como:

- `'whatsappSession.provider'`
- `'whatsappSession.instanceName'`
- `'whatsappSession.connected'`

Cuando `whatsappSession` vale `null`, Mongo no puede crear subcampos sobre `null`.

### Implicacion

Aunque el boton rapido vaya a quedar en mantenimiento y sin accion visible, esta rotura debe corregirse igualmente para dejar la funcionalidad interna sana y reactivable en el futuro.

## Resultado funcional deseado

### Via rapida

Debe representar el flujo oficial de Meta para negocio.

Requisitos:

- el usuario inicia sesion en Meta
- elige negocio
- elige WABA
- elige numero
- Meta devuelve la credencial oficial del flujo de negocio
- Lyrium guarda como credencial final el `Business Integration System User Token` o la credencial equivalente real que devuelva ese flujo
- esa credencial final es la que usa el sistema para API, webhook y operaciones sobre el numero

Regla de UI temporal:

- el boton `Continuar con Meta` debe verse grisaceo
- debe verse en mantenimiento
- al pulsarlo no debe pasar nada
- la logica interna debe seguir existiendo y quedar intacta o encapsulada para poder reactivarse con un cambio minimo futuro

### Via manual

Debe ser flujo de respaldo.

Requisitos:

- el usuario prepara en Meta el numero real y su WABA
- el usuario autoriza con Meta o pega el token temporal obtenido en Meta
- Lyrium recibe inicialmente un `short-lived user token`
- el backend intercambia automaticamente ese token por `long-lived user token`
- Lyrium guarda el `long-lived user token`
- Lyrium no debe guardar nunca el token corto como credencial final
- si el exchange falla, la conexion debe fallar y no persistir una credencial final invalida

## Regla sobre caducidad

### Principio general

No inventar fechas de caducidad.

### Casos

#### Si Meta devuelve expiracion exacta

- guardar `tokenExpiresAt` con la fecha exacta devuelta por Meta
- usar esa fecha para UI, avisos preventivos y estado

#### Si Meta no devuelve expiracion exacta

- guardar `tokenExpiresAt` vacio o `null`
- guardar un indicador semantico de `caducidad desconocida`
- no programar emails del tipo `caduca en X dias`
- no mostrar contadores ficticios de dias en UI
- no usar `60 dias` como sustituto visible o funcional de una fecha real
- depender del chequeo tecnico cada 2 horas para saber si la credencial sigue operativa

### Regla explicita

No usar `60 dias` como fecha de verdad por precaucion.

Si se necesita una heuristica interna temporal, no debe presentarse como caducidad real ni activar avisos preventivos.

## Chequeo tecnico cada 2 horas

### Objetivo

Comprobar contra Meta si la credencial guardada y el numero conectado siguen siendo funcionales de verdad.

### Frecuencia

- cada 2 horas

### Comprobaciones minimas

#### 1. Validacion de credencial

Comprobar si la credencial sigue siendo aceptada por Meta.

Para manual:

- inspeccionar el token si aplica con `debug_token`
- detectar token expirado, revocado, invalido o sin permisos

Para via rapida:

- validar operativamente la credencial oficial del flujo rapido
- no asumir que por existir en BD ya funciona

#### 2. Validacion de numero

Comprobar que el `Phone Number ID` guardado sigue siendo accesible con esa credencial.

Ejemplo de criterio:

- leer el numero via Graph API
- confirmar que el `phoneNumberId` existe y responde con la credencial actual

#### 3. Validacion de cuenta de negocio

Comprobar que la relacion entre numero, WABA y credencial sigue siendo coherente.

Debe detectar escenarios como:

- credencial valida pero sin acceso al numero concreto
- numero desconectado del negocio
- permisos retirados
- WABA no accesible

### Resultado del chequeo

Normalizar a estados internos claros, por ejemplo:

- `ok`
- `warning`
- `expired`
- `error`
- `disconnected`
- `unknown_expiry`

### Efectos del chequeo

Si todo va bien:

- actualizar estado interno si hiciera falta
- actualizar fecha real de expiracion si Meta devuelve nueva informacion fiable

Si falla:

- marcar la sesion como no funcional
- registrar causa tecnica resumida
- disparar sistema de alertas por Brevo con politica anti-duplicado

### Reglas obligatorias del chequeo

- este chequeo es backend y autonomo
- no debe depender de que el frontend este abierto
- no debe depender de refrescos manuales de la UI
- debe seguir ejecutandose aunque ningun usuario tenga abierta la pantalla de Automatizaciones

## Politica de emails

### Requisito de transporte

Todos los emails de alertas de WhatsApp deben salir siempre por Brevo usando la cuenta configurada en el `env` del backend.

No usar:

- la primera cuenta de correo de Automatizaciones del usuario
- el sistema legacy basado en configuraciones antiguas por cuenta

### Requisito de configuracion

El email de alerta o renovacion es obligatorio:

- en via manual
- en via rapida

### Explicacion que debe aparecer en UI

Bajo ese campo debe aparecer una frase breve explicando su uso.

Sentido funcional:

- es el correo al que Lyrium enviara avisos de caducidad, renovacion o problemas de conexion del numero de WhatsApp

## Tipos de avisos por email

### 1. Avisos preventivos por caducidad conocida

Solo si `tokenExpiresAt` es conocido y fiable.

Enviar:

- 7 dias antes
- 3 dias antes
- 1 dia antes
- el mismo dia de caducidad

No enviar estos avisos si la fecha es desconocida.

### 2. Avisos por problema funcional

Se activan cuando el chequeo cada 2 horas detecta fallo real.

Politica:

- primer fallo detectado: email inmediato
- si sigue roto: un email al dia mientras siga roto
- no reenviar cada 2 horas
- si se recupera, cerrar la incidencia
- si vuelve a fallar despues, abrir nuevo ciclo de avisos

### Tipos de problema funcional a avisar

- token expirado
- token invalido
- token revocado
- falta de permisos
- numero no accesible
- WABA no accesible
- desconexion tecnica de la integracion

## Requisitos de persistencia adicionales

Para soportar avisos coherentes y anti-duplicados, cada sesion de WhatsApp debe poder guardar estado adicional como minimo.

Posibles campos a anadir a `IWhatsAppSession` y schema:

- `expiryKnown?: boolean`
- `connectionStatus?: 'ok' | 'warning' | 'expired' | 'error' | 'disconnected'`
- `lastValidatedAt?: string`
- `lastValidationError?: string`
- `lastExpiryReminder7dAt?: string`
- `lastExpiryReminder3dAt?: string`
- `lastExpiryReminder1dAt?: string`
- `lastExpiryReminder0dAt?: string`
- `lastFailureAlertAt?: string`
- `failureAlertOpen?: boolean`
- `failureFirstDetectedAt?: string`
- `failureResolvedAt?: string`

No es obligatorio usar exactamente esos nombres, pero el modelo final debe permitir:

- saber si la caducidad es conocida o no
- evitar duplicados de avisos preventivos
- evitar duplicados de avisos diarios por fallo
- saber si una incidencia sigue abierta o ya se resolvio

### Separacion obligatoria de historiales

Separar historiales por tipo de alerta:

- historial de avisos preventivos por caducidad conocida
- historial de avisos por fallo funcional

No mezclar ambos tipos en un unico marcador ambiguo.

## Requisito de arquitectura

Separar responsabilidades.

### Backend

Separar como minimo en funciones o servicios distintos:

- inicializacion de flujo rapido
- finalizacion de flujo rapido
- exchange de token manual corto a largo
- inspeccion de token
- validacion operativa de sesion
- scheduler de chequeo
- scheduler de avisos
- envio de email por Brevo

### Frontend

Separar como minimo:

- handlers de conexion rapida
- handlers de conexion manual
- modal de instrucciones
- render de formulario rapido o manual
- render de lista de numeros o sesiones

Evitar meter logica compleja dentro del JSX.

## Cambios de UI requeridos

### Modal `Conectar WhatsApp con Meta`

Archivo:

- `frontend/src/pages/Automations.tsx`

Cambios requeridos:

- mantener el modal existente
- mantener la opcion rapida y la manual
- el boton `Continuar con Meta` debe verse grisaceo
- debe mostrar que esta en mantenimiento
- al pulsarlo no debe hacer nada
- la funcion real debe seguir existiendo en el codigo
- el campo de email debe pasar de opcional a obligatorio
- debajo del campo de email debe aparecer una frase corta explicando en que consiste

### Conexion manual

Cambios requeridos:

- anadir boton `Instrucciones`
- al pulsarlo, abrir una ventana o modal de instrucciones
- esa ventana debe contener exactamente el contenido funcional indicado por el usuario
- en el paso 4 debe mostrarse la imagen local `ayudanum.png`
- en el paso 4 debe remarcarse de forma clara que:
  - el `Phone Number ID` debe ser el del numero real del negocio
  - el `WhatsApp Business Account ID` debe ser el del numero real del negocio
  - no se deben usar los IDs del numero de prueba de Meta

### Texto obligatorio de instrucciones

Implementar estas instrucciones en la ventana `Instrucciones` de `Conexion manual`:

1. `Primero entra en Meta Developers > Apps y crea la app si todavia no existe.`
   Si Meta te pregunta para que quieres la app, elige el caso de uso `Conecta con los clientes a traves de WhatsApp`. Termina el asistente hasta que la app quede creada.
   En la implementacion del modal, el texto `Meta Developers > Apps` debe funcionar como enlace directo a `https://developers.facebook.com/apps/`.

2. `Cuando la app ya este creada, entra dentro de ella y abre la seccion Configuracion de la API de WhatsApp.`
   Esa es la pantalla principal desde la que Meta te ira guiando para preparar la conexion del numero con la app.

3. `Antes de conectar nada en Lendry, anade o vincula en Meta el numero de telefono real del negocio que se va a usar con WhatsApp.`
   Este paso es importante: si el numero todavia no esta dado de alta en Meta, Lendry no lo podra encontrar ni conectar. Dentro de `Configuracion de la API`, Meta te ira pidiendo completar el alta del numero, verificarlo y dejarlo asociado al negocio.

4. `Cuando el numero ya este anadido en Meta, en esa misma pantalla veras los datos tecnicos que Lendry necesita para conectarlo.`
   Ahi tendras que localizar:
   - el `Temporary Access Token`
   - el `Phone Number ID`
   - el `WhatsApp Business Account ID`

   Reglas obligatorias de este paso:
   - hay que remarcar que el `Phone Number ID` y el `WhatsApp Business Account ID` deben ser los del `numero real del negocio`
   - no se deben usar los IDs del numero de prueba de Meta
   - dentro de este mismo paso debe mostrarse la imagen local `ayudanum.png`

5. `Copia primero el Temporary Access Token, vuelve a Lendry, entra en Conexion manual y pegalo.`
   Despues pulsa el boton para cargar numeros. Si todo esta bien, Lendry intentara encontrar automaticamente el numero del negocio.

6. `Si Lendry encuentra el numero, seleccionalo y continua.`
   Si no lo encuentra, vuelve a `Configuracion de la API` en Meta y copia manualmente el `Phone Number ID` y el `WhatsApp Business Account ID` del numero real. Despues pegalos en Lendry.

7. `Cuando ya tengas el token y, si hace falta, tambien los IDs, pulsa Conectar numero en Lendry.`
   Si todo esta correcto, el numero del negocio quedara conectado a Lendry.

### Modal `Numeros de WhatsApp`

Cambios requeridos:

- mantener lo que ya existe y no romper gestion actual
- anadir tambien las opciones de conexion rapida y manual, como en `Conectar WhatsApp con Meta`
- no sustituir la lista actual de numeros por otra UI completamente distinta
- sumar la nueva capacidad sin eliminar la gestion de sesiones existente
- el boton rapido tambien debe estar gris, en mantenimiento y sin accion
- el flujo manual de este modal debe respetar las mismas reglas:
  - email obligatorio
  - texto explicativo debajo
  - boton de instrucciones
  - uso del contenido e imagen indicados

## Requisito especial sobre el campo email

Donde hoy se muestra `Email de alerta (opcional)`, debe pasar a ser obligatorio.

Debe explicarse con una sola frase debajo del input, por ejemplo a nivel funcional:

- `Usaremos este correo para avisarte si tu conexion de WhatsApp va a caducar, necesita renovacion o deja de funcionar.`

La redaccion final puede variar, pero debe expresar exactamente ese sentido.

Debe mantenerse coherencia visual con el formulario actual, cambiando solo lo necesario.

## Cambios backend requeridos por area

### 1. Corregir el error de inicializacion de `whatsappSession`

Archivos probables:

- `backend/src/services/whatsappService.ts`
- `backend/src/controllers/whatsappController.ts`

Accion:

- dejar de escribir subcampos sobre `whatsappSession: null`
- inicializar objeto completo o, preferiblemente, evitar depender del campo legacy para este flujo
- la nueva logica no debe basarse en `whatsappSession` como fuente principal

### 2. Revisar estrategia `whatsappSession` vs `whatsappSessions`

La fuente de verdad debe ser `whatsappSessions`.

`whatsappSession` puede quedar solo para compatibilidad temporal si es imprescindible.

La logica nueva debe:

- leer y escribir sobre `whatsappSessions`
- no asumir que `whatsappSession` existe
- no romper flujos legacy que aun lo lean

### 3. Redisenar conexion manual

Archivo principal:

- `backend/src/services/whatsappService.ts`

Objetivo:

- recibir token corto
- intercambiarlo automaticamente por long-lived
- si el exchange falla, abortar
- guardar solo el long-lived
- persistir expiracion real si Meta la devuelve
- si no la devuelve, marcar caducidad desconocida

Comportamiento obligatorio:

- no persistir el short-lived como credencial final
- no fingir una caducidad de 60 dias

### 4. Redisenar semantica de conexion rapida

Objetivo:

- conservar la logica interna del flujo rapido
- adaptar el modelo de persistencia para que la credencial final represente la credencial oficial de integracion de negocio
- no modelarla como simple token manual extendido

Si la informacion exacta de expiracion no viene en el flujo:

- marcar caducidad desconocida
- depender del chequeo real

### 5. Crear servicio de validacion de sesion

Crear una funcion nueva separada, por ejemplo:

- `validateWhatsAppSession(...)`

Debe:

- recibir cuenta y sesion
- validar credencial
- validar numero
- validar WABA
- devolver estado normalizado, expiracion actualizada si existe, y motivo de error si aplica

### 6. Crear scheduler de chequeo cada 2 horas

Separado del scheduler de alertas, o integrado de forma limpia si se justifica.

Debe:

- recorrer sesiones conectadas
- ejecutar `validateWhatsAppSession(...)`
- actualizar estado persistido
- disparar logica de avisos cuando corresponda

### 7. Reescribir envio de alertas para usar siempre Brevo

Archivos probables:

- `backend/src/services/whatsappAlertScheduler.ts`
- `backend/src/services/emailService.ts`
- posible helper nuevo de email sistema

Objetivo:

- usar siempre `SYSTEM_EMAIL_HOST`, `SYSTEM_EMAIL_PORT`, `SYSTEM_EMAIL_LOGIN` o equivalentes del backend
- usar Brevo como canal unico para estas alertas
- eliminar fallback a cuentas de usuario o sistema legacy para estas alertas concretas

### 8. Implementar politicas anti-duplicado

Debe evitar:

- enviar aviso de 7 dias varias veces el mismo dia
- enviar aviso de 3 dias varias veces
- enviar aviso inmediato de fallo en cada chequeo de 2 horas

Debe permitir:

- avisos preventivos en hitos concretos
- aviso inmediato al abrir incidencia
- recordatorio diario mientras siga abierta

### 9. Exponer estado real a frontend

Mejorar o reutilizar:

- `GET /api/whatsapp/status`
- `GET /api/whatsapp/token-status`

La UI debe poder saber:

- si esta conectado
- si la caducidad es conocida o no
- si hay estado de warning, expired o error
- cual fue la ultima validacion
- si existe mensaje de error relevante

## Cambios frontend requeridos por area

### 1. Deshabilitar visualmente via rapida

El boton debe:

- verse gris
- mostrar mantenimiento
- no ejecutar la accion

La funcion subyacente debe quedarse disponible en codigo para reactivacion futura.

Recomendacion:

- mantener el handler actual
- introducir una bandera local constante o estado derivado del backend, por ejemplo `waQuickConnectMaintenance = true`
- el `onClick` visible no debe disparar nada mientras esa bandera este activa

### 2. Hacer obligatorio el email

Afecta al menos a:

- modal principal de conexion manual
- modal de `Numeros de WhatsApp`

Debe bloquear el submit si el email esta vacio o invalido.

### 3. Modal de instrucciones

Recomendacion de separacion:

- crear componente aparte para el modal de instrucciones de WhatsApp manual

Debe incluir:

- texto proporcionado por el usuario
- enlace clicable `Meta Developers > Apps`
- imagen `ayudanum.png`
- enfasis visual del paso 4

### 4. Integrar opciones rapida o manual en `Numeros de WhatsApp`

Sin romper la lista actual de sesiones, anadir:

- acceso a conexion rapida deshabilitada
- acceso a conexion manual
- mismas reglas de email obligatorio e instrucciones

### 5. Mejorar representacion del estado

La UI deberia distinguir entre:

- conectado y sano
- conectado con caducidad cercana
- conectado con caducidad desconocida
- conectado pero con error
- desconectado

No basta con pintar solo por `tokenExpiresAt`.

Si la caducidad es desconocida:

- no mostrar contadores ficticios de dias
- no mostrar `60 dias`
- mostrar un estado honesto como `caducidad no disponible`, `fecha no facilitada por Meta` o equivalente gestionado por `i18n`

## Compatibilidad y migracion

### Principio

No romper sesiones existentes mas de lo necesario.

### Requisito

Si existen documentos con:

- `whatsappSession: null`
- `whatsappSessions` incompleto
- sesiones sin `alertEmail`
- sesiones con `tokenExpiresAt` heredado de logica antigua

la nueva implementacion debe manejarlos de forma segura.

### Recomendacion

Anadir logica defensiva al leer:

- si falta `expiryKnown`, derivarlo desde `tokenExpiresAt`
- si falta `connectionStatus`, inferir temporalmente
- si `whatsappSession` es `null`, no intentar escribir subcampos sobre el

Al migrar o reescribir estado:

- no eliminar datos utiles ya guardados en sesiones existentes
- si una sesion previa tiene `alertEmail`, conservarlo
- si una sesion previa carece de fecha fiable de caducidad, no rellenarla artificialmente
- si hay datos legacy inconsistentes, preferir estado conservador y chequeo tecnico real

## Riesgos a evitar

- guardar short-lived token como credencial final
- inventar caducidad de 60 dias
- mandar emails preventivos con fecha desconocida
- mandar emails en bucle cada 2 horas
- deshabilitar tanto la UI del boton rapido que se pierda la logica subyacente
- romper la gestion actual de sesiones multiples
- seguir dependiendo del campo legacy `whatsappSession` como verdad principal
- hardcodear textos nuevos ignorando `i18n`
- reemplazar modales o bloques completos cuando basta con cambios incrementales
- mezclar la logica de alertas preventivas y la de fallo funcional hasta volverlas indistinguibles

## Orden recomendado de implementacion

1. Corregir backend para que no falle la inicializacion actual por `whatsappSession: null`.
2. Aislar y normalizar fuente de verdad en `whatsappSessions`.
3. Redisenar conexion manual con exchange obligatorio a long-lived.
4. Redefinir persistencia y estado para caducidad conocida o desconocida.
5. Crear validador tecnico de sesion contra Meta.
6. Crear scheduler de chequeo cada 2 horas.
7. Rehacer alertas por Brevo con politica anti-duplicado.
8. Exponer mejor estado al frontend.
9. Cambiar UI del modal principal.
10. Crear modal de instrucciones con `ayudanum.png`.
11. Replicar rapido o manual en `Numeros de WhatsApp`.
12. Probar regresiones.

## Criterios de aceptacion

### Conexion rapida

- el boton aparece gris y en mantenimiento
- al pulsarlo no hace nada
- la funcion real sigue existiendo en codigo
- el backend ya no rompe con `whatsappSession: null`
- reactivar la via rapida en el futuro debe requerir un cambio minimo y localizado, no reimplementar el flujo

### Conexion manual

- no permite conectar sin email
- no guarda nunca un short-lived como credencial final
- si el exchange a long-lived falla, no conecta
- si Meta devuelve expiracion, se guarda
- si no la devuelve, queda como desconocida

### Instrucciones

- existe boton `Instrucciones`
- abre una ventana
- contiene el texto pedido
- `Meta Developers > Apps` es enlace a `https://developers.facebook.com/apps/`
- aparece `ayudanum.png` en el paso 4
- el paso 4 remarca que los IDs deben ser del numero real y no del numero de prueba
- los textos visibles nuevos o modificados siguen el sistema actual de `i18n`

### Emails

- siempre salen por Brevo del backend
- 7, 3, 1 y 0 dias solo si hay fecha fiable
- si la fecha es desconocida, no hay avisos preventivos
- si el chequeo detecta fallo, se manda inmediato
- si sigue roto, se reenvia una vez al dia

### Chequeo

- se ejecuta cada 2 horas
- valida credencial, numero y WABA
- actualiza estado
- no depende solo de una fecha guardada
- si el frontend esta cerrado, el chequeo sigue funcionando igual

## Notas finales para la IA implementadora

- no reinterpretar el requisito de tokens: el manual debe terminar en `long-lived user token`; el rapido debe terminar en la credencial oficial del flujo de negocio
- no usar `60 dias` como verdad si Meta no la devuelve
- si la fecha es desconocida, no inventar recordatorios preventivos
- priorizar separacion de funciones y cambios pequenos
- revisar cuidadosamente `frontend/src/pages/Automations.tsx` antes de tocar JSX
- cualquier ajuste sobre `whatsappSession` debe ser defensivo por la coexistencia con datos legacy
- respetar el sistema actual de `i18n` para toda UI nueva o modificada
- no sustituir grandes bloques de UI si el requisito puede resolverse ampliando la estructura actual con cambios incrementales

## Mapa tecnico de archivos y puntos de entrada

### Frontend principal

- `frontend/src/pages/Automations.tsx`

Piezas detectadas dentro de ese archivo:

- modal principal de conexion WhatsApp
- formulario de conexion manual
- boton `Continuar con Meta`
- gestion de `Numeros de WhatsApp`
- render de estados de sesion
- llamadas a:
  - `POST /api/whatsapp/connect`
  - `POST /api/whatsapp/meta/connect-token`
  - `POST /api/whatsapp/meta/connect-manual`
  - `GET /api/whatsapp/status`
  - `POST /api/whatsapp/refresh-token`

### Backend principal

- `backend/src/routes/whatsappRoutes.ts`
- `backend/src/controllers/whatsappController.ts`
- `backend/src/services/whatsappService.ts`
- `backend/src/services/whatsappAlertScheduler.ts`
- `backend/src/models/Automation.ts`
- `backend/src/server.ts`

### Funciones detectadas actualmente

En `backend/src/controllers/whatsappController.ts`:

- `connectWhatsApp`
- `connectWhatsAppWithCode`
- `connectWhatsAppWithToken`
- `connectWhatsAppManual`
- `getWhatsAppStatus`
- `refreshWhatsAppToken`
- `getTokenStatus`

En `backend/src/services/whatsappService.ts`:

- `connectMetaWithToken`
- `connectMetaManual`
- `refreshWhatsAppToken`
- `getTokenStatus`
- funciones internas de inicializacion y validacion de Meta

En `backend/src/models/Automation.ts`:

- `whatsappSessionSchema`
- `whatsappSessions`
- `whatsappSession`

## Contrato tecnico objetivo del modelo de sesion

La fuente de verdad debe ser `whatsappSessions`.

### Shape minimo esperado por sesion

La implementacion final debe soportar al menos este conjunto semantico:

```ts
type WhatsAppCredentialMode = 'quick_official' | 'manual_long_lived';
type WhatsAppConnectionStatus = 'ok' | 'warning' | 'expired' | 'error' | 'disconnected';

interface IWhatsAppSessionTargetShape {
  provider?: 'meta';
  instanceName?: string;
  connected: boolean;
  phoneNumber?: string;
  connectedAt?: string;
  businessAccountId?: string;
  phoneNumberId?: string;
  accessToken?: string;
  name?: string;
  tokenExpiresAt?: string | null;
  tokenType?: string;
  alertEmail?: string;

  credentialMode?: WhatsAppCredentialMode;
  expiryKnown?: boolean;
  connectionStatus?: WhatsAppConnectionStatus;
  lastValidatedAt?: string;
  lastValidationError?: string;

  lastExpiryReminder7dAt?: string;
  lastExpiryReminder3dAt?: string;
  lastExpiryReminder1dAt?: string;
  lastExpiryReminder0dAt?: string;

  lastFailureAlertAt?: string;
  failureAlertOpen?: boolean;
  failureFirstDetectedAt?: string;
  failureResolvedAt?: string;
}
```

### Reglas del modelo

- `credentialMode = 'manual_long_lived'` para la via manual
- `credentialMode = 'quick_official'` para la via rapida
- `expiryKnown = true` solo si la fecha vino de Meta de forma fiable
- `tokenExpiresAt = null` o vacio si la fecha es desconocida
- `connected` no debe ser la unica fuente de verdad visible; debe coexistir con `connectionStatus`

## Contrato tecnico de respuestas a frontend

### `GET /api/whatsapp/status`

La respuesta final deberia exponer, por sesion, al menos:

```json
{
  "connected": true,
  "whatsappSessions": [
    {
      "id": "pn_123",
      "phoneNumberId": "pn_123",
      "name": "WhatsApp Principal",
      "phoneNumber": "+34 600000000",
      "connected": true,
      "provider": "meta",
      "tokenType": "long",
      "tokenExpiresAt": "2026-06-01T00:00:00.000Z",
      "alertEmail": "avisos@dominio.com",
      "expiryKnown": true,
      "connectionStatus": "ok",
      "lastValidatedAt": "2026-05-18T10:00:00.000Z",
      "lastValidationError": ""
    }
  ]
}
```

No es obligatorio que coincida exactamente ese JSON, pero el frontend debe recibir informacion suficiente para:

- renderizar estado real
- distinguir caducidad conocida o desconocida
- mostrar ultima validacion
- mostrar error relevante si lo hubiera

### `GET /api/whatsapp/token-status`

Debe ser consistente con la sesion devuelta por `/status`.

No debe devolver una semantica distinta para el mismo `phoneNumberId`.

## Pseudoflujo tecnico: via manual

### Entrada esperada

- `accountId`
- `accessToken` corto recibido de Meta
- `phoneNumberId`
- `wabaId` opcional
- `alertEmail` obligatorio
- `name` opcional

### Algoritmo objetivo

1. Validar ownership y payload.
2. Validar que `alertEmail` exista y tenga formato correcto.
3. Intercambiar `short-lived user token` por `long-lived user token`.
4. Si el exchange falla:
   - abortar
   - no persistir sesion conectada
   - devolver error claro
5. Con el `long-lived user token`:
   - validar acceso al `phoneNumberId`
   - resolver `display_phone_number`
   - resolver `businessAccountId` si falta
6. Inspeccionar expiracion fiable si Meta la devuelve.
7. Guardar sesion en `whatsappSessions`.
8. Marcar:
   - `credentialMode = 'manual_long_lived'`
   - `expiryKnown` segun informacion real
   - `connectionStatus = 'ok'` si todo fue bien
9. Mantener compatibilidad temporal con `whatsappSession` solo si hace falta, pero sin basar la logica nueva en ese campo.
10. Devolver respuesta normalizada al frontend.

### Regla critica

Si no se obtiene `long-lived user token`, la conexion manual no se completa.

## Pseudoflujo tecnico: via rapida

### Situacion temporal visible al usuario

- el boton esta deshabilitado visualmente
- no ejecuta accion
- muestra mantenimiento

### Requisito tecnico interno

La logica real no debe eliminarse.

### Algoritmo objetivo que debe quedar preservado o encapsulado

1. Inicializar flujo oficial de Meta para negocio.
2. Obtener seleccion real de negocio, WABA y numero desde Meta.
3. Obtener la credencial oficial final del flujo:
   - `Business Integration System User Token`
   - o equivalente real del flujo oficial
4. Validar acceso al numero y WABA seleccionados.
5. Persistir sesion con:
   - `credentialMode = 'quick_official'`
   - `expiryKnown` segun datos reales de Meta
6. Dejar la sesion lista para uso de API, webhook y operaciones.

### Regla critica

No tratar la via rapida final como si fuera simplemente un token manual extendido con `fb_exchange_token`.

## Pseudoflujo tecnico: chequeo cada 2 horas

### Algoritmo objetivo

1. Cargar todas las cuentas con `whatsappSessions` no vacias.
2. Para cada sesion conectada:
   - descifrar credencial
   - validar credencial
   - validar `phoneNumberId`
   - validar `businessAccountId` si existe
3. Normalizar resultado de validacion.
4. Actualizar en BD:
   - `lastValidatedAt`
   - `connectionStatus`
   - `connected`
   - `lastValidationError`
   - `tokenExpiresAt` si Meta devuelve fecha fiable actualizada
   - `expiryKnown`
5. Ejecutar logica de alertas:
   - preventivas si hay fecha conocida
   - funcionales si hay fallo real
6. Persistir resultado.

### Regla de interpretacion

- si Meta responde con error temporal de red o 5xx, no degradar agresivamente la sesion sin criterio
- si Meta indica claramente token invalido, expirado, revocado o sin acceso al numero, marcar fallo real

## Matriz de estados y transiciones esperadas

### Estados funcionales

- `ok`
- `warning`
- `expired`
- `error`
- `disconnected`

### Transiciones minimas

- `ok -> warning`
  - cuando la fecha conocida entra en zona de aviso
- `warning -> expired`
  - cuando la fecha conocida ya vencio o Meta informa expiracion
- `ok -> error`
  - cuando el chequeo detecta fallo real
- `error -> ok`
  - cuando el chequeo vuelve a validar correctamente
- `disconnected -> ok`
  - cuando el usuario reconecta de forma correcta
- `warning -> ok`
  - cuando la credencial se renueva y se obtiene nueva expiracion valida

### Reglas de email por transicion

- al pasar a `error` por primera vez: email inmediato
- mientras siga en `error`: un email al dia
- al pasar de `warning` a nueva fecha sana por renovacion: no enviar alerta de fallo
- con `expiryKnown = false`: no enviar avisos preventivos por dias

## Definicion operativa de "mismo problema"

Para no duplicar alertas funcionales cada 2 horas, considerar mismo problema si se mantiene la misma combinacion semantica, por ejemplo:

- mismo `phoneNumberId`
- mismo tipo de error normalizado
- misma sesion o misma credencial afectada

Ejemplos:

- `token_invalid` hoy y dentro de 2 horas sigue siendo `token_invalid` -> mismo problema
- `token_invalid` y luego `phone_number_inaccessible` -> puede considerarse problema nuevo

## Estrategia recomendada de claves i18n

No es obligatorio usar exactamente estas claves, pero se recomienda un esquema consistente:

```txt
automations.whatsapp.metaConnectTitle
automations.whatsapp.metaConnectMaintenance
automations.whatsapp.metaConnectContinue
automations.whatsapp.manualInstructions
automations.whatsapp.alertEmailLabel
automations.whatsapp.alertEmailHelp
automations.whatsapp.expiryUnknown
automations.whatsapp.tokenStatusOk
automations.whatsapp.tokenStatusWarning
automations.whatsapp.tokenStatusExpired
automations.whatsapp.tokenStatusError
automations.whatsapp.instructions.step1
automations.whatsapp.instructions.step2
automations.whatsapp.instructions.step3
automations.whatsapp.instructions.step4
automations.whatsapp.instructions.step5
automations.whatsapp.instructions.step6
automations.whatsapp.instructions.step7
```

## Casos edge que deben contemplarse

- `whatsappSession = null`
- `whatsappSessions` vacio pero existe campo legacy
- sesion con `alertEmail` vacio heredado de logica antigua
- sesion con `tokenExpiresAt` inventado por codigo antiguo
- token valido pero sin acceso al `phoneNumberId`
- `WABA ID` ausente pero resoluble
- `WABA ID` ausente y no resoluble
- fecha desconocida
- token renovado correctamente
- token imposible de renovar
- usuario intenta conectar manual sin email
- usuario abre `Numeros de WhatsApp` y debe ver tambien vias manual o rapida sin perder la lista actual
