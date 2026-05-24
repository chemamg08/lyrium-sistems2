# Arquitectura correcta: una sola IA y un motor ejecutor

## Principio base

El sistema debe funcionar con una sola IA decisora.

## Estado de implementación

### Ya implementado

- el motor unificado usa el mismo modelo que los chats generales
- `/clasificar` ha dejado de formar parte del contrato activo del motor
- la IA decide con comandos de acción reales
- el motor valida técnicamente la salida
- el motor hace exactamente 3 reintentos automáticos si la salida es inválida
- si tras esos 3 reintentos la salida sigue siendo inválida, no ejecuta ninguna acción automática
- email y WhatsApp unificados consumen ya el nuevo contrato del motor
- se mantiene la cuenta correcta de salida en email
- se mantiene la sesión o `phoneNumberId` correcto de salida en WhatsApp
- se ha introducido `/crear_caso_pendiente` como acción real del motor
- el archivo de consultas ya contempla que el humano puede pedir pausar solo esa conversación

### Legacy retirado del flujo activo

- el pipeline semántico antiguo de cliente en email ha quedado retirado a favor de `processOneEmailUnified`
- el pipeline semántico antiguo de cliente en WhatsApp ha quedado retirado a favor de `processOneIncomingMetaMessageUnified`
- la clasificación antigua de cliente y la búsqueda antigua de respuesta para esos flujos han quedado fuera del flujo activo
- la limpieza física de los bloques legacy retirados ya está hecha en los servicios activos

### Se mantiene por diseño

- la interpretación de instrucciones humanas desde el correo de consultas
- la organización por reglas y carpetas usando contexto real del workspace
- las restricciones técnicas duras de canal, cuenta y sesión

Esa IA:

- recibe el contexto completo de la conversación
- recibe los documentos subidos
- recibe la configuración activa del workspace
- recibe las restricciones del canal
- recibe las especialidades, reglas y opciones disponibles
- decide qué significa el mensaje del cliente
- decide qué debe hacerse
- devuelve una salida estructurada en forma de comandos

El motor:

- no interpreta intención
- no reevalúa si la IA acertó o no
- no clasifica por su cuenta
- no confirma con lógica paralela si algo es afirmativo o negativo
- no detecta por separado si hay solicitud explícita o implícita
- no corrige la decisión
- solo ejecuta los comandos emitidos por la IA

## Modelo correcto

Flujo ideal:

1. Llega un mensaje del cliente.
2. Se construye un contexto completo.
3. La IA analiza todo el contexto.
4. La IA responde con comandos estructurados.
5. El motor ejecuta esos comandos en orden.

La decisión debe salir únicamente de la IA.

## Qué debe recibir la IA

La IA debe recibir siempre:

- canal de entrada
- últimos mensajes de la conversación
- si el contacto es conocido o no
- si la respuesta automática está activa
- si la ventana de 24 horas de WhatsApp está abierta o no
- si están activadas respuestas a consultas generales
- si están activadas respuestas a solicitudes de servicio
- si solo se puede responder a contactos conocidos
- si la autoasignación está activa
- especialidades disponibles
- candidatos asignables
- carpetas disponibles
- reglas de organización
- correos de consultas
- documentos subidos con su texto extraído

Además, la IA debe recibir también la definición operativa de los comandos:

- qué comandos existen
- qué hace exactamente cada comando
- cuándo debe usarse cada comando
- qué comandos pueden combinarse en una misma respuesta
- qué comandos no deben combinarse entre sí
- qué formato exacto debe devolver

Esto es importante porque la IA no solo debe conversar: también debe saber cómo convertir su decisión en instrucciones ejecutables para el motor.

Regla importante sobre el contexto:

- sí deben enviarse hechos reales del sistema
- no deben enviarse interpretaciones semánticas prefabricadas

Ejemplos de hechos reales válidos:

- historial real de mensajes
- documentos reales
- especialidades reales
- candidatos reales
- carpetas reales
- reglas reales de organización
- restricciones técnicas reales del canal

Ejemplos de ruido que no debe enviarse:

- "esto es una confirmación"
- "esto probablemente es una solicitud de servicio"
- "esta conversación está en la fase X"
- clasificaciones o conclusiones semánticas ya cocinadas por lógica auxiliar

La IA debe recibir contexto real para razonar.

No debe recibir pistas artificiales sobre qué pensar.

Esta definición de comandos debe formar parte explícita del prompt del motor unificado.

No basta con que el parser conozca los comandos.

La propia IA debe recibir en el prompt:

- la lista completa de comandos disponibles
- el propósito exacto de cada comando
- cuándo debe usar cada comando
- cómo se escribe cada comando
- qué comandos pueden aparecer juntos
- qué comandos son excluyentes entre sí
- qué comandos implican respuesta al cliente
- qué comandos implican solo acciones internas

## Contrato técnico de comandos

El prompt del motor debe enseñar a la IA un contrato claro de salida.

Ese contrato debe incluir:

- formato exacto de cada comando
- qué parámetros requiere cada uno
- qué parámetros son opcionales
- qué combinación de comandos es válida
- qué combinación de comandos no debe emitirse
- cuál debe ser el orden lógico de las líneas

Ejemplos de compatibilidad que deben quedar claros en el diseño:

- `///whatsapp` + `/mover_a_carpeta` + `//mensaje ...` es válido
- `///whatsapp` + `/crear_caso_pendiente ...` + `/preguntar_asignacion ...` + `//mensaje ...` es válido
- `///whatsapp` + `/preguntar_asignacion ...` + `//mensaje ...` es válido
- `///email` + `/preguntar_consultas ...` sin mensaje al cliente es válido
- `///whatsapp` + `/no_responder` es válido

Ejemplos de combinaciones que no deben permitirse:

- `/no_responder` junto con `//mensaje ...`
- `/preguntar_consultas ...` junto con `//mensaje ...` si la política deseada es no responder al cliente en ese flujo
- `/pausar_auto_reply ...` junto con acciones contradictorias que requieran seguir conversando de forma automática en el mismo paso

## Responsabilidad del parser

El parser no debe reinterpretar la intención del mensaje del cliente.

Pero sí debe validar la estructura técnica de salida de la IA.

Eso significa:

- aceptar comandos válidos
- rechazar o degradar combinaciones inválidas
- normalizar parámetros
- impedir ejecuciones técnicamente incoherentes

Ejemplos:

- si la IA devuelve asignación directa sin destinatario válido, el parser o ejecutor debe degradar esa salida a una derivación interna
- si la IA devuelve un mensaje al cliente y al mismo tiempo `/no_responder`, debe prevalecer una regla técnica de consistencia, no una reinterpretación semántica
- si la IA devuelve carpetas inexistentes, el ejecutor no debe inventar carpetas ni clasificar en destinos inválidos

## Reglas y carpetas: contexto completo

Las reglas de clasificación y organización en carpetas deben enviarse completas a la IA cuando formen parte del contexto real del workspace.

No deben resumirse artificialmente si ese resumen elimina matices reales de la regla.

No se consideran ruido si son reglas reales del sistema.

Sí se considerarían ruido si se transforman en interpretaciones previas del backend sobre lo que "debería pensar" la IA.

## Corrección de salidas inválidas

Si la IA devuelve una salida mal formada, incompleta o incompatible con el contrato de comandos, el motor no debe:

- adivinar lo que la IA quiso decir
- corregirlo por su cuenta
- reinterpretar la intención
- ejecutar una salida ambigua

El comportamiento correcto es este:

1. el motor valida la salida
2. si la salida es inválida, la rechaza
3. el motor devuelve a la IA un error técnico claro
4. la IA genera una nueva salida corregida
5. el motor vuelve a validarla
6. solo si la nueva salida es válida, se ejecuta

Ejemplos de error técnico que el motor debe poder devolver a la IA:

- combinación inválida: `/no_responder` no puede ir junto con `//mensaje ...`
- falta un parámetro obligatorio en `/asignar_caso`
- se ha usado un comando inexistente
- el formato de una línea no cumple el contrato
- se ha intentado mover la conversación a carpetas no válidas

Regla importante:

- el motor valida y rechaza
- la IA corrige y vuelve a decidir la salida formal

Esto mantiene la arquitectura correcta:

- la IA sigue siendo la única que decide
- el motor no compite semánticamente con la IA
- el motor solo controla validez técnica y ejecución

Diseño recomendado:

- permitir exactamente 3 reintentos automáticos de regeneración
- si tras esos 3 reintentos la salida sigue siendo inválida, no ejecutar ninguna acción automática

## Diferencia entre comandos internos e instrucciones humanas

Hay que distinguir dos niveles:

- los comandos internos que conoce y emite la IA
- las instrucciones humanas en lenguaje natural que puede dar una persona del despacho

La persona que gestiona el correo de consultas no tiene por qué conocer comandos como:

- `/pausar_auto_reply`
- `/no_responder`
- `/preguntar_consultas`
- `/asignar_caso`

Esa persona no debe verse obligada a escribir comandos técnicos.

Lo correcto es que pueda responder en lenguaje natural y que el sistema entienda esa instrucción dentro del flujo previsto.

Ejemplo:

- una persona del despacho responde algo como: "A partir de ahora este caso debe llevarlo una persona. Pausad la respuesta automática de esta conversación."

El sistema, en ese caso, debe ser capaz de traducir esa instrucción funcional al efecto equivalente a:

- pausar la respuesta automática de solo esa conversación

## Correo de consultas: información que debe incluirse

El propio correo de consultas debe informar a la persona revisora de las acciones que puede ordenar sobre ese caso concreto.

No hace falta mostrarle comandos técnicos, pero sí debe saber qué opciones funcionales tiene.

Entre ellas, debe quedar claro que puede indicar:

- que se pause la respuesta automática de solo ese chat
- que no se responda automáticamente a ese cliente
- que se responda con una instrucción concreta
- que el caso se mantenga en revisión humana

Ejemplo de redacción recomendable dentro del correo de consultas:

"Si este caso debe dejar de recibir respuestas automáticas, indícalo en tu respuesta y el sistema pausará solo esta conversación."

Otro ejemplo:

"Si quieres que se envíe una respuesta concreta al cliente, escríbela claramente. Si quieres que no se responda, indícalo expresamente."

## Regla importante sobre la pausa de auto reply

Cuando se pida pausar la respuesta automática desde consultas, esa pausa debe aplicarse solo al chat o conversación concreta relacionada con esa consulta.

No debe:

- desactivar WhatsApp completo
- desactivar Email completo
- pausar otras conversaciones del mismo cliente
- pausar conversaciones de otros clientes

La pausa debe ser siempre localizada a la conversación concreta que generó la consulta.

## Qué debe quedar claro para una IA futura

Si una IA futura lee este archivo para continuar el trabajo, debe entender también esto:

- los comandos técnicos los emite la IA del sistema
- la persona humana de consultas puede dar órdenes en lenguaje natural
- el sistema debe contemplar ese puente entre intención humana y acción técnica
- pausar auto reply de un caso concreto es una capacidad obligatoria del flujo
- esa capacidad debe explicarse en el propio correo de consultas para que el humano sepa que puede pedirla

## Modelo de IA

El sistema debe usar el mismo modelo de IA que se usa en los chats con IA del resto de apartados.

No debe existir un modelo "más simple" o distinto solo para automatizaciones si la intención es que una sola IA tome todas las decisiones con el mismo nivel de comprensión, contexto y razonamiento.

Si la IA principal del producto usa un modelo con thinking, ese mismo debe ser el modelo usado también aquí.

## Seguridad y producción

El rediseño no debe centrarse solo en la lógica conversacional.

También debe quedar preparado para producción con criterios de seguridad reales.

Puntos importantes:

- cifrar correctamente tokens, contraseñas y secretos sensibles
- no guardar en claro datos que deban estar cifrados
- minimizar exposición de secretos en logs
- validar siempre la pertenencia por `accountId` o `workspaceId`
- impedir cruces de datos entre cuentas
- no permitir que una conversación, caso o sesión de una cuenta afecte a otra
- validar carpetas, candidatos, sesiones y destinos antes de ejecutar acciones
- manejar adjuntos y rutas de archivo de forma segura
- usar fallos seguros por defecto cuando falte integridad o contexto válido

La regla general es:

- si hay duda de integridad, pertenencia o validez técnica, no se ejecuta

## Separación estricta de canal de entrada y salida

Debe mantenerse estrictamente la relación entre:

- origen de entrada
- conversación
- canal o sesión exacta de salida

### En email

Si un workspace tiene varias cuentas de correo, debe mantenerse esta lógica:

1. cada email entrante se detecta dentro de la cuenta concreta desde la que fue leído
2. la conversación queda asociada a esa cuenta concreta
3. las respuestas automáticas y manuales de ese hilo deben salir por esa misma cuenta

Si un correo entró por una cuenta concreta, no debe responderse desde otra por error.

El fallback a una cuenta por defecto solo debería existir si está plenamente controlado y no introduce riesgo de responder desde el buzón equivocado.

### En WhatsApp

Si un workspace tiene varias sesiones, números o `phoneNumberId` de WhatsApp, debe mantenerse esta lógica:

1. cada mensaje entrante se identifica dentro de la sesión concreta por la que llegó
2. la conversación queda asociada a ese `phoneNumberId` o sesión concreta
3. las respuestas automáticas y manuales de ese chat deben salir por esa misma sesión

Si un mensaje entró por un número o sesión concreta de WhatsApp, no debe responderse desde otra sesión distinta por error.

## Regla de seguridad asociada

No debe romperse esta relación con el rediseño del motor unificado.

Al contrario: debe quedar más estricta para producción.

Si no se puede garantizar con seguridad la sesión o cuenta correcta de salida, no debe ejecutarse la respuesta automática.

## Qué no debe hacer el motor

El motor no debe:

- decidir si una respuesta del cliente significa “sí”
- decidir si una frase implica contratar
- decidir si una consulta tiene respuesta suficiente
- decidir si debe preguntar o asignar
- decidir si debe pausar o no responder

Todo eso lo decide la IA.

## Comandos que puede ejecutar la IA

La IA puede devolver uno o varios comandos en la misma respuesta.

### `///whatsapp` o `///email`

Indica el canal al que pertenece la decisión.

Ejemplo:

```txt
///whatsapp
```

Significa:

- esta decisión corresponde a una conversación de WhatsApp

### `/mover_a_carpeta`

Sirve para organizar automáticamente la conversación.

Si no existen carpetas creadas en el workspace, este comando simplemente no debe emitirse.

La ausencia de carpetas no impide que la IA responda, asigne, pause o derive una conversación. Solo impide la organización en carpetas.

Formato:

```txt
/mover_a_carpeta folderIds=["id1","id2"]
```

Ejemplo:

```txt
/mover_a_carpeta folderIds=["carpeta_laboral","prioridad_alta"]
```

Significa:

- el motor debe asociar la conversación a esas carpetas

### `/crear_caso_pendiente`

Sirve para registrar una solicitud de servicio como caso pendiente sin necesidad de clasificarla con una etiqueta intermedia.

Formato:

```txt
/crear_caso_pendiente especialidadId="id|null"
```

Ejemplo:

```txt
/crear_caso_pendiente especialidadId="laboral_01"
```

Significa:

- la IA ha decidido que debe quedar creado o asegurado un caso pendiente
- el motor debe registrar ese caso sin interpretar semántica adicional

### `/preguntar_consultas`

Sirve para derivar el caso al correo de consultas cuando la IA no puede responder con seguridad o necesita revisión humana.

Formato:

```txt
/preguntar_consultas mensaje="texto para el equipo interno"
```

Ejemplo:

```txt
/preguntar_consultas mensaje="El cliente pregunta por un asunto fiscal internacional y no hay base suficiente en los documentos. Revisad y decidme qué responder."
```

Significa:

- el motor debe reenviar la conversación al circuito de consultas
- ese texto es el mensaje interno para el equipo

### `/preguntar_asignacion`

Sirve para que la IA decida preguntar al cliente si quiere que se le asigne un abogado.

Formato:

```txt
/preguntar_asignacion especialidadId="id|null"
```

Ejemplo:

```txt
/preguntar_asignacion especialidadId="mercantil_02"
```

Significa:

- la IA considera que procede ofrecer asignación
- el motor debe enviar al cliente el mensaje correspondiente

### `/asignar_caso`

Sirve para asignar directamente el caso a una cuenta o subcuenta.

Formato:

```txt
/asignar_caso especialidadId="id|null" asignarA="id_cuenta"
```

Ejemplo:

```txt
/asignar_caso especialidadId="penal_01" asignarA="sub_ana"
```

Significa:

- la IA ya decidió que el caso debe asignarse
- la IA también decidió a quién asignarlo
- el motor solo ejecuta

### `/pausar_auto_reply`

Sirve para pausar respuestas automáticas en esa conversación.

Formato:

```txt
/pausar_auto_reply motivo="texto"
```

Ejemplo:

```txt
/pausar_auto_reply motivo="El cliente solicita atención humana y no desea seguir hablando con el asistente."
```

Significa:

- el motor debe marcar esa conversación como pausada

### `/no_responder`

Sirve para que la IA decida que no debe enviarse ningún mensaje al cliente.

Ejemplo:

```txt
/no_responder
```

Significa:

- el motor no debe enviar respuesta al cliente

### `//mensaje al cliente`

Sirve para indicar el texto exacto que hay que enviar al cliente.

Ejemplo:

```txt
//Hola, ofrecemos asesoramiento laboral, mercantil y fiscal. Si quieres, puedo ayudarte a identificar el servicio adecuado para tu caso.
```

Significa:

- el motor debe enviar exactamente ese mensaje al cliente

## La IA puede ejecutar varios comandos a la vez

Esto es obligatorio.

La IA no debe estar limitada a un solo comando por respuesta.

Puede decidir varias cosas a la vez si el caso lo requiere.

### Ejemplo 1

```txt
///whatsapp
/mover_a_carpeta folderIds=["informacion_general"]
//Hola, ofrecemos consultas iniciales desde 60 euros y revisiones de contrato desde 120 euros. Si me indicas tu caso, te orientaré mejor.
```

Qué hace:

- la mueve a una carpeta
- responde al cliente

### Ejemplo 2

```txt
///whatsapp
/crear_caso_pendiente especialidadId="laboral_01"
/mover_a_carpeta folderIds=["potenciales_clientes","laboral"]
/preguntar_asignacion especialidadId="laboral_01"
//Podemos ayudarte con este asunto laboral. Si quieres, puedo dejar tu caso preparado para asignarte un abogado del despacho.
```

Qué hace:

- la organiza
- activa el flujo de pregunta de asignación
- responde al cliente

### Ejemplo 3

```txt
///whatsapp
/preguntar_consultas mensaje="El cliente pregunta por un tema no cubierto en los documentos y conviene revisión manual."
```

Qué hace:

- deriva al equipo interno
- no responde al cliente

### Ejemplo 4

```txt
///whatsapp
/no_responder
```

Qué hace:

- no envía respuesta

## Regla de oro

La IA decide.

El motor ejecuta.

Si una decisión no sale de la IA, no debe tomarla el motor.

## Objetivo final

El sistema correcto es un sistema donde:

- la conversación se entiende de forma contextual
- no hay lógica paralela compitiendo con la IA
- no hay validadores secundarios decidiendo por detrás
- toda la intención sale de una sola IA
- el motor solo convierte esa decisión en acciones reales

## Estado actual del código

Este bloque se deja aquí como referencia técnica para futuras sesiones si el contexto del chat se compacta.

### Motor unificado actual

El motor unificado principal está en:

- `backend/src/services/customerAutomationEngine.ts`

Actualmente:

- construye un prompt con contexto estructurado
- llama a un modelo de automatización
- obliga a que la IA devuelva una línea `/clasificar`
- parsea una salida con clasificación, acción principal, carpetas y mensaje

La estructura actual devuelta por el parser es híbrida:

- `plataforma`
- `clasificacion.tipo`
- `clasificacion.especialidadId`
- `folderIds`
- `accion`
- `asignarA`
- `mensajeConsultas`
- `mensajeCliente`
- `motivoPausa`
- `bruto`

Ese diseño no es el deseado, porque mantiene una clasificación intermedia que no debería ser necesaria si la IA principal ya entiende el contexto completo.

### Modelo actual

La configuración de modelos está en:

- `backend/src/config/aiModel.ts`

Estado actual detectado:

- `AI_MODEL = qwen/qwen3-235b-a22b-thinking-2507`
- `AI_AUTOMATION_MODEL = Qwen/Qwen3-235B-A22B-Instruct-2507`

Esto significa que:

- los chats generales usan el modelo principal con thinking
- automatizaciones usa otro modelo distinto

Diseño correcto deseado:

- automatizaciones debe usar el mismo modelo que los chats generales
- si el chat general usa `AI_MODEL`, automatizaciones también debe usar `AI_MODEL`
- no debe mantenerse un modelo diferente para automatizaciones si se quiere una única IA decisora coherente en todo el producto

## Flujos actuales que ya usan el motor unificado

WhatsApp y Email ya llaman al motor unificado, pero todavía arrastran estructura y lógica heredada.

Rutas técnicas principales:

- `backend/src/services/whatsappService.ts`
- `backend/src/services/emailProcessorService.ts`

En ambos casos, hoy se construye un contexto amplio y se llama a `runCustomerAutomationEngine(...)`.

Después, los consumidores siguen leyendo cosas como:

- `decision.clasificacion.tipo`
- `decision.clasificacion.especialidadId`
- `decision.accion`
- `decision.folderIds`

Eso implica que el sistema todavía depende de una semántica intermedia en vez de depender solo de acciones ejecutables.

## Diseño correcto deseado tras la limpieza

La arquitectura correcta debe quedar así:

1. Llega un mensaje de email o WhatsApp.
2. Se construye un contexto completo.
3. La única IA decisora analiza todo.
4. La IA devuelve únicamente comandos ejecutables.
5. El motor parsea esos comandos.
6. El motor ejecuta sin reinterpretar semántica.

No debe existir una fase intermedia obligatoria de clasificación.

## Qué significa quitar `/clasificar`

Quitar `/clasificar` no significa perder comprensión del caso.

Significa que la comprensión ya no se expresa como una etiqueta intermedia obligatoria, sino como acciones.

La intención se deduce directamente de lo que la IA decide hacer:

- si la IA devuelve una acción equivalente a preguntar asignación o asignar caso, eso significa que ha entendido que hay intención de servicio o avance del caso
- si la IA devuelve una acción equivalente a derivar a consultas internas sin responder al cliente, eso significa que ha decidido escalar el asunto
- si la IA devuelve solo un mensaje al cliente, eso significa que ha entendido que puede responder directamente
- si devuelve no responder, significa que ha decidido que no debe enviarse respuesta

En resumen:

- antes: primero clasificar, luego actuar
- diseño correcto: entender y actuar directamente

## Estructura deseada del motor

El motor unificado debe dejar de devolver una estructura basada en `clasificacion + accion`.

Debe pasar a devolver una estructura centrada en ejecución.

Ejemplo conceptual de salida deseada:

```ts
{
  plataforma: 'whatsapp',
  folderIds: ['potenciales_clientes', 'laboral'],
  askAssignment: true,
  assignmentSpecialtyId: 'laboral_01',
  assignCase: false,
  assignTo: undefined,
  consultasMessage: undefined,
  pauseAutoReply: false,
  noResponder: false,
  mensajeCliente: 'Podemos ayudarte con este asunto...'
}
```

Otro ejemplo:

```ts
{
  plataforma: 'email',
  folderIds: [],
  askAssignment: false,
  assignmentSpecialtyId: undefined,
  assignCase: false,
  assignTo: undefined,
  consultasMessage: 'Consulta compleja no cubierta con suficiente seguridad...',
  pauseAutoReply: false,
  noResponder: false,
  mensajeCliente: undefined
}
```

La clave es esta:

- la IA decide
- la salida representa acciones
- el motor no necesita una clasificación previa para saber qué ejecutar

## Cambios técnicos que habrá que hacer

Cuando se implemente esta limpieza, habrá que hacer al menos estos cambios:

### 1. Cambiar el prompt del motor unificado

Archivo:

- `backend/src/services/customerAutomationEngine.ts`

Cambios necesarios:

- quitar `/clasificar` del formato de salida
- explicar los comandos restantes y cómo se combinan
- indicar que la IA debe devolver solo acciones ejecutables
- mantener las restricciones técnicas del canal

### 2. Cambiar el parser del motor unificado

Archivo:

- `backend/src/services/customerAutomationEngine.ts`

Cambios necesarios:

- dejar de esperar `/clasificar`
- dejar de construir `decision.clasificacion`
- devolver un objeto centrado en comandos y ejecución
- permitir varias acciones compatibles en la misma salida

### 3. Cambiar el modelo usado por automatizaciones

Archivo:

- `backend/src/config/aiModel.ts`

Diseño deseado:

- automatizaciones debe usar `AI_MODEL`
- no debe seguir usando `AI_AUTOMATION_MODEL` como modelo separado si se busca una sola IA coherente en todo el sistema

### 4. Adaptar consumidores del motor

Archivos principales:

- `backend/src/services/whatsappService.ts`
- `backend/src/services/emailProcessorService.ts`

Cambios necesarios:

- dejar de depender de `decision.clasificacion.tipo`
- dejar de depender de `decision.clasificacion.especialidadId`
- dejar de depender de una sola `decision.accion`
- ejecutar directamente en función de los comandos/flags devueltos por el motor

### 5. Mantener solo restricciones técnicas duras

Esto sí debe seguir existiendo en el motor ejecutor:

- no responder por WhatsApp fuera de la ventana de 24 horas
- no responder si la conversación tiene auto reply pausado
- no mover a carpetas si no existen carpetas válidas
- no asignar si no existe destinatario válido

Estas reglas no son “pensamiento semántico”.

Son restricciones técnicas de ejecución.

## Lógica heredada que debe limpiarse

Objetivo deseado por el usuario:

- no solo ajustar el motor nuevo
- también limpiar la lógica heredada paralela

Eso incluye especialmente:

- clasificación antigua separada
- detección explícita aparte de intención de asignación
- interpretación separada de confirmaciones del cliente
- búsquedas o decisiones antiguas que compitan semánticamente con la IA principal

Piezas heredadas identificadas en el código:

- `classifyWhatsAppMessage(...)`
- `classifyEmail(...)`
- `detectExplicitAssignmentRequest(...)`
- `interpretClientConfirmation(...)`
- partes heredadas de búsqueda de respuesta y clasificación previa fuera del motor unificado

Diseño correcto:

- la IA principal decide todo eso con contexto completo
- el motor solo ejecuta
- no debe haber una segunda capa semántica paralela

## Nota operativa para futuras sesiones

Si este archivo se consulta en una sesión futura con menos contexto, la dirección correcta del trabajo es esta:

1. revisar `customerAutomationEngine.ts`
2. quitar `/clasificar` del prompt y del parser
3. hacer que automatizaciones use el mismo modelo que el chat general
4. adaptar `whatsappService.ts` y `emailProcessorService.ts` al nuevo contrato de salida
5. eliminar progresivamente la lógica heredada que sigue tomando decisiones semánticas fuera del motor unificado

La intención final no es solo que “funcione”.

La intención final es que haya una sola IA decisora real y un motor puramente ejecutor.
