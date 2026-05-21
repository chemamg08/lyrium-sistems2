# Especificacion Tecnica por Puntos: "Atencion al cliente automatizada"

## 1. Uso del documento

Este documento es la base tecnica de implementacion del sistema unificado de automatizacion de atencion al cliente.

Formato de seguimiento:

- cada punto principal tiene un estado
- estados permitidos:
  - `PENDIENTE`
  - `EN CURSO`
  - `HECHO`
- un punto solo pasa a `HECHO` cuando:
  - su codigo esta implementado
  - supera sus pruebas minimas
  - no rompe el comportamiento fuera de alcance
  - queda integrado con el resto del sistema

Regla de trabajo:

- se implementa por puntos
- al cerrar un punto, se actualiza este archivo
- no se deben marcar subtareas como cerradas si el punto principal sigue incompleto

## 2. Objetivo tecnico

Construir un sistema unico de automatizacion para Email y WhatsApp que:

- use una sola IA como decisor
- use un solo motor como ejecutor
- mantenga conectores separados por canal
- mantenga aislamiento total entre cuenta principal y subcuentas
- permita trazabilidad total de decisiones y acciones
- sea apto para produccion

## 3. Reglas funcionales cerradas

Estas reglas ya se consideran definitivas:

- la IA actua como recepcionista de un despacho de abogados
- la IA puede:
  - responder preguntas simples
  - organizar conversaciones
  - detectar solicitudes de servicio
  - preguntar si el cliente quiere abogado
  - asignar si el cliente confirma y procede
  - escalar a correo de consultas
- la IA no debe:
  - inventar
  - resolver fondo juridico complejo
  - prometer resultados
  - usar plantillas predefinidas
- el mensaje al cliente siempre lo redacta la IA
- el motor no sustituye respuestas por plantillas
- se responde siempre por el mismo canal de entrada
- no se intenta resolver identidad entre Email y WhatsApp mas alla de relaciones ya existentes en datos
- si no hay vinculo explicito, Email y WhatsApp se tratan como identidades separadas
- `solo contactos conocidos` cuenta en cualquier canal del mismo workspace
- la IA recibe siempre:
  - toda la informacion extraida de documentos
  - especialidades
  - carga de trabajo
  - carpetas
  - reglas
  - toggles
  - ultimos 20 mensajes con fecha y hora
- si llegan varios mensajes seguidos del cliente, la IA debe tener en cuenta el bloque nuevo completo
- si la IA usa `/preguntar_consultas`, no se responde al cliente en ese momento
- si el cliente vuelve a escribir mientras hay una consulta pendiente, la conversacion se reevalua inmediatamente
- si ya hay un caso asignado y entra un asunto claramente distinto, puede abrirse o asignarse uno nuevo
- en empate total de carga entre candidatas validas, el reparto puede resolverse `50/50`
- WhatsApp manual solo dentro de la ventana de 24 horas
- si la IA quisiera responder por WhatsApp fuera de 24 horas, no se responde y la conversacion queda `pendiente`
- no hay migracion de datos inicial que hacer

## 4. Alcance de la refactorizacion

El objetivo no es unir dos pantallas por encima. El objetivo es:

- reemplazar la duplicacion de logica Email/WhatsApp
- consolidar dominio
- consolidar flujo de decision
- consolidar capa de ejecucion
- mantener integraciones separadas

No entra en alcance:

- resolver matching inteligente entre email y telefono
- crear funciones nuevas fuera de las que ya existen funcionalmente
- redisenar la experiencia visual desde cero

## 5. Arquitectura objetivo

Estado: `HECHO`

### 5.1 Capas

El sistema final debe separarse en 4 capas:

1. `Channel Connectors`
- Email Connector
- WhatsApp Connector

2. `Automation Engine`
- motor unico de ejecucion

3. `Persistence / Repositories`
- conversaciones
- mensajes
- decisiones
- casos
- carpetas
- reglas
- conexiones

4. `Unified UI`
- pagina unificada

### 5.2 Responsabilidades por capa

#### Channel Connectors

Responsables de:

- recibir mensajes entrantes
- validar autenticidad
- normalizar payload
- enviar respuestas
- gestionar credenciales
- exponer estado de conexion

No deben decidir logica de negocio.

#### Automation Engine

Responsable de:

- cargar workspace
- construir contexto
- llamar a IA
- parsear salida
- validar comandos
- ejecutar acciones
- registrar auditoria

No debe decidir la estrategia funcional. Esa decision es de la IA.

#### Persistence / Repositories

Responsables de lectura y escritura. No deben contener reglas de negocio complejas.

#### Unified UI

Responsable de mostrar y operar. No debe replicar logica de backend.

## 6. Punto 0. Descubrimiento y congelacion del comportamiento actual

Estado: `HECHO`

### Objetivo

Congelar el comportamiento real actual antes de empezar la unificacion.

### Entregables

- mapa de flujos actuales de Email
- mapa de flujos actuales de WhatsApp
- inventario de botones, modales y toggles
- inventario de endpoints usados
- inventario de dependencias:
  - `Automation`
  - `Case`
  - `Client`
  - `Subaccount`
  - Brevo
  - Meta
  - IMAP/SMTP

### Criterio de cierre

- existe una lista completa de flujos actuales
- se conocen las diferencias entre Email y WhatsApp
- no quedan comportamientos ocultos sin identificar

## 7. Punto 1. Nuevo dominio por workspace

Estado: `HECHO`

### Objetivo

Eliminar la dependencia conceptual del `Automation` del padre y reemplazarla por un `workspace` aislado.

### Requisito tecnico

Cada recurso de automatizacion debe colgar de `workspaceId`, no de `accountId` compartido.

### Entidades minimas

#### AutomationWorkspace

Campos minimos:

```ts
type AutomationWorkspace = {
  id: string;
  ownerId: string;
  ownerType: 'main' | 'subaccount';
  status: 'active' | 'disabled';
  createdAt: string;
  updatedAt: string;
};
```

### Recursos que pasan a ser por workspace

- conexiones de canal
- documentos
- carpetas
- reglas
- especialidades
- correos de consultas
- cuentas operativas de correo
- conversaciones
- mensajes
- decisiones IA
- casos creados desde automatizacion

### Regla de aislamiento

- la cuenta principal no comparte automatizaciones con subcuentas
- las subcuentas no heredan configuracion del padre
- toda consulta y escritura debe filtrar por `workspaceId`

### Criterio de cierre

- existe `workspaceId` como frontera real
- ya no hay dependencia funcional del `Automation` compartido del padre

## 8. Punto 2. Modelo unificado de conversacion y mensaje

Estado: `HECHO`

### Objetivo

Tener una unica representacion de conversaciones y mensajes para ambos canales.

### Entidades minimas

#### UnifiedConversation

```ts
type UnifiedConversation = {
  id: string;
  workspaceId: string;
  channel: 'email' | 'whatsapp';
  channelThreadId?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  knownContact: boolean;
  status: 'active' | 'pending' | 'paused';
  autoReplyPaused: boolean;
  pendingReason?: 'consultas' | 'whatsapp_24h' | 'manual';
  assignedCaseId?: string;
  createdAt: string;
  updatedAt: string;
  lastInboundAt?: string;
  lastOutboundAt?: string;
};
```

#### UnifiedMessage

```ts
type UnifiedMessage = {
  id: string;
  conversationId: string;
  workspaceId: string;
  channel: 'email' | 'whatsapp';
  direction: 'inbound' | 'outbound';
  authorType: 'client' | 'assistant' | 'human' | 'system';
  text: string;
  attachments: NormalizedAttachment[];
  providerMessageId?: string;
  receivedAt?: string;
  sentAt?: string;
  createdAt: string;
};
```

### Reglas

- todo mensaje debe tener timestamp
- debe distinguirse:
  - autor
  - direccion
  - canal
- la conversacion debe soportar `pending` y `paused`

### Criterio de cierre

- ambos canales usan el mismo modelo conversacional

## 9. Punto 3. Conectores de canal

Estado: `HECHO`

### Objetivo

Mantener Email y WhatsApp aislados en la capa de integracion externa.

### Email Connector

Debe soportar:

- polling cada `1 minuto`
- lectura de correos entrantes
- envio de correos salientes
- lectura de respuestas a consultas
- deduplicacion por identificador del proveedor

### WhatsApp Connector

Debe soportar:

- entrada por webhook de Meta
- validacion de firma
- envio de mensajes salientes
- descarga de media
- chequeo de ventana de 24 horas

### Reglas

- WhatsApp entrante no usa polling
- Email sigue con polling cada `1 minuto`
- el refresco de UI/estado debe normalizarse a `1 minuto` cuando aplique

### Criterio de cierre

- ambos canales entran y salen por su conector propio
- ninguno contiene reglas de negocio de recepcionista

## 10. Punto 4. Motor unificado de ejecucion

Estado: `HECHO`

### Objetivo

Crear `customerAutomationEngine.ts` como orquestador unico.

### API minima del motor

```ts
type InboundAutomationEvent = {
  workspaceId: string;
  channel: 'email' | 'whatsapp';
  externalMessageId: string;
  externalThreadId?: string;
  contact: {
    displayName?: string;
    email?: string;
    phone?: string;
  };
  message: {
    text: string;
    attachments: NormalizedAttachment[];
    receivedAt: string;
  };
  providerMeta: Record<string, unknown>;
};
```

### Flujo del motor

1. resolver `workspaceId`
2. aplicar idempotencia de entrada
3. crear o recuperar conversacion
4. guardar mensaje entrante
5. cargar configuracion completa del workspace
6. construir contexto para IA
7. llamar a IA
8. parsear salida
9. validar comandos
10. ejecutar acciones en orden
11. guardar auditoria
12. si procede, enviar mensaje por el conector

### Reglas operativas

- si entran varios mensajes seguidos del cliente, se procesan como bloque contextual, no solo el ultimo
- si una conversacion esta `pending` por consultas y el cliente vuelve a escribir, se reevalua inmediatamente
- si una accion critica falla, no debe enviarse el mensaje de cliente asociado

### Criterio de cierre

- existe una unica entrada de ejecucion comun para Email y WhatsApp

## 11. Punto 5. Contrato del prompt de IA

Estado: `HECHO`

### Objetivo

Dejar el prompt y el contrato de salida cerrados y repetibles.

### Contenido obligatorio del prompt

#### Bloque 1. Rol

- recepcionista IA de un despacho de abogados

#### Bloque 2. Reglas

- responder por el mismo canal
- no inventar
- no usar plantillas
- usar solo la informacion recibida
- tono cercano pero profesional
- si no sabe que hacer, usar `/preguntar_consultas`

#### Bloque 3. Formato de salida

- `///plataforma`
- `/comando ...`
- `//mensaje al cliente`

#### Bloque 4. Contexto estructurado

```ts
type AIContext = {
  workspace: {
    id: string;
    channel: 'email' | 'whatsapp';
    respuestaAutomaticaActiva: boolean;
    respondConsultasGenerales: boolean;
    respondSolicitudesServicio: boolean;
    soloContactosConocidos: boolean;
    autoAssignEnabled: boolean;
    sortByCarga: boolean;
  };
  channelRestrictions: {
    whatsapp24hOpen?: boolean;
    sameChannelOnly: true;
  };
  especialidades: Array<{
    id: string;
    nombre: string;
    descripcion: string;
  }>;
  candidateAccounts: Array<{
    id: string;
    nombre: string;
    especialidades: string[];
    cargaActual: number;
    tipo: 'main' | 'subaccount';
  }>;
  folders: Array<{
    id: string;
    nombre: string;
    descripcion: string;
  }>;
  organizationRules: Array<{
    id: string;
    nombre: string;
    descripcion: string;
    folderIds: string[];
  }>;
  consultasConfig: {
    destinationEmails: string[];
    operativeEmailAccountId?: string;
  };
  documents: Array<{
    id: string;
    nombre: string;
    texto: string;
  }>;
  last20Messages: Array<{
    fechaHora: string;
    autor: 'cliente' | 'asistente' | 'humano';
    canal: 'email' | 'whatsapp';
    texto: string;
  }>;
};
```

#### Bloque 5. Tarea

- decidir que hacer con el bloque mas reciente del cliente
- devolver solo el formato de salida

### Criterio de cierre

- existe un contrato de prompt fijo
- existe un contrato de salida fijo

## 12. Punto 6. Catalogo cerrado de comandos

Estado: `HECHO`

### Objetivo

Soportar un conjunto minimo y cerrado de comandos.

### Comandos

#### `/clasificar`

```ts
type ClassifyCommand = {
  name: 'clasificar';
  args: {
    tipo: 'consulta_general' | 'solicitud_servicio' | 'otro';
    especialidadId: string | null;
  };
};
```

#### `/mover_a_carpeta`

```ts
type MoveFolderCommand = {
  name: 'mover_a_carpeta';
  args: {
    folderIds: string[];
  };
};
```

#### `/asignar_caso`

```ts
type AssignCaseCommand = {
  name: 'asignar_caso';
  args: {
    especialidadId: string;
    asignarA: string;
  };
};
```

Semantica obligatoria:

- si no existe caso para la conversacion, se crea
- si existe `pending`, se actualiza
- el resultado final debe ser `assigned`

#### `/preguntar_consultas`

```ts
type AskConsultasCommand = {
  name: 'preguntar_consultas';
  args: {
    mensaje: string;
  };
};
```

Semantica obligatoria:

- se envia correo al destino configurado
- no se responde al cliente en esa misma ejecucion
- la conversacion queda `pending`

#### `/pausar_auto_reply`

```ts
type PauseCommand = {
  name: 'pausar_auto_reply';
  args: {
    motivo: string;
  };
};
```

#### `/no_responder`

```ts
type NoReplyCommand = {
  name: 'no_responder';
  args: {};
};
```

### Orden obligatorio de ejecucion

1. clasificar
2. mover a carpeta
3. asignar caso o preguntar consultas
4. responder al cliente

### Criterio de cierre

- todos los comandos tienen schema
- todos los comandos tienen validador
- todos los comandos tienen executor

## 13. Punto 7. Reglas de negocio de la IA

Estado: `HECHO`

### Objetivo

Traducir el comportamiento funcional a reglas operativas implementables.

### Reglas de respuesta

- si es `consulta_general` y hay base suficiente, responder
- si es `consulta_general` y no hay base suficiente, usar `/preguntar_consultas`
- si es `solicitud_servicio`, no dar fondo juridico complejo
- si es `solicitud_servicio` y procede, preguntar si quiere abogado
- si el cliente confirma y hay candidato valido, usar `/asignar_caso`

### Reglas de no respuesta

- si `soloContactosConocidos` esta activo y no es conocido, no responder
- si el canal es WhatsApp y la ventana de 24h esta cerrada, no responder
- si la salida valida no puede ejecutarse de forma segura, no responder

### Reglas de continuidad

- si entra un bloque nuevo mientras hay una consulta pendiente, la IA debe responder a lo nuevo
- puede indicar que sobre lo anterior se sigue esperando respuesta

### Criterio de cierre

- la IA tiene reglas cerradas y no ambiguas para cada caso principal

## 14. Punto 8. Contactos conocidos

Estado: `HECHO`

### Objetivo

Fijar la semantica tecnica de `solo contactos conocidos`.

### Regla cerrada

- una conversacion cuenta como de contacto conocido si en ese mismo workspace existe conversacion previa del mismo contacto en cualquier canal

### Regla de identidad

- no se debe intentar reconciliar Email y WhatsApp por heuristica
- solo se usan vinculos que ya existan explicitamente en los datos
- si no existe un vinculo claro, ambos canales se consideran contactos distintos

### Criterio de cierre

- existe una funcion determinista `isKnownContact(...)`

## 15. Punto 9. Flujo de consultas por email

Estado: `HECHO`

### Objetivo

Implementar el flujo completo de escalado por correo.

### Requisitos de configuracion

- al menos un `correo de consultas` destino
- al menos una cuenta operativa del workspace que pueda:
  - enviar
  - leer respuesta

### Flujo

1. la IA emite `/preguntar_consultas`
2. el motor valida configuracion
3. el sistema envia correo
4. la conversacion queda `pending`
5. se espera respuesta
6. al llegar la respuesta:
  - se correlaciona con la conversacion original
  - se guarda como informacion reutilizable
  - la IA decide la reformulacion final al cliente

### Reglas

- si falta configuracion, no se ejecuta el envio
- si el cliente vuelve a escribir antes de la respuesta, se reevalua inmediatamente
- la respuesta de consultas debe persistirse como informacion reutilizable
- debe aparecer en UI como tarjeta equivalente a informacion subida manualmente

### Criterio de cierre

- el flujo de consultas puede ejecutarse de extremo a extremo

## 16. Punto 10. Casos y asignacion

Estado: `HECHO`

### Objetivo

Unificar la apertura y asignacion de casos en una sola semantica.

### Modelo actual deseado

- escribir por Email o WhatsApp con una solicitud real suele desembocar en crear y asignar en la misma accion de negocio

### Reglas

- `/asignar_caso` crea el caso si no existe
- `/asignar_caso` actualiza el caso si ya esta `pending`
- si existe caso `assigned` y el asunto nuevo es claramente distinto, puede crearse o asignarse uno nuevo
- si no esta claro, se mantiene el flujo del caso actual

### Criterios de seleccion

1. especialidad compatible
2. menor carga real
3. si hay empate total:
  - reparto `50/50`

### Candidatas validas

- cuenta principal si tiene especialidad compatible
- subcuentas compatibles
- subcuenta sola puede autoasignarse

### Efectos laterales obligatorios

- actualizar `Case`
- relacionar caso con conversacion
- enviar aviso al profesional asignado por Brevo
- evitar duplicados por reproceso

### Criterio de cierre

- existe un flujo idempotente y unico de asignacion

## 17. Punto 11. Carpetas y organizacion

Estado: `HECHO`

### Objetivo

Conservar y unificar la funcion de `Organizar`.

### Datos

#### AutomationFolder

```ts
type AutomationFolder = {
  id: string;
  workspaceId: string;
  channelScope: 'email' | 'whatsapp' | 'both';
  nombre: string;
  descripcion: string;
  color?: string;
  conversationIds: string[];
};
```

#### AutomationRule

```ts
type AutomationRule = {
  id: string;
  workspaceId: string;
  channelScope: 'email' | 'whatsapp' | 'both';
  nombre: string;
  descripcion: string;
  folderIds: string[];
};
```

### Reglas

- una conversacion puede pertenecer a varias carpetas
- carpeta y filtros generales deben poder combinarse
- la IA debe recibir carpetas y reglas en cada prompt

### Criterio de cierre

- `Organizar` funciona igual o mejor que hoy, sin perder nada

## 18. Punto 12. Frontend unificado

Estado: `HECHO`

### Objetivo

Fusionar visualmente Email y WhatsApp sin cambiar la filosofia del producto.

### Estructura minima

- cabecera superior
- bandeja unificada
- panel de conversacion
- modales actuales fusionados

### Cabecera obligatoria

- `Seleccion`
- `Organizar`
- boton del engranaje
- `Asignacion automatica de casos`
- `Consultas frecuentes`
- toggle de `Respuesta automatica`
- `Numeros de WhatsApp`

### Reglas

- no inventar nuevas funciones visibles
- mantener envio manual de Email
- mantener envio manual de WhatsApp solo dentro de 24h
- mantener estilo actual fusionado

### Criterio de cierre

- la UI funciona como una sola pagina real

## 19. Punto 13. WhatsApp Meta y tokens

Estado: `EN CURSO`

### Objetivo

Corregir y robustecer la conexion con Meta.

### Reglas

- flujo manual:
  - short token -> long-lived token
- flujo rapido Meta:
  - intercambio a `Business Integration System User Token`
- obtener caducidad real siempre que sea posible
- si no se puede obtener:
  - marcar `caducidad desconocida`
- la conexion no debe perderse al recargar si sigue siendo valida

### Criterio de cierre

- las sesiones persisten correctamente y muestran estado real

## 20. Punto 14. Seguridad y produccion

Estado: `PENDIENTE`

### Objetivo

Blindar el sistema para entorno real.

### Requisitos

- aislamiento real por workspace
- cifrado fuerte de credenciales
- parser estricto
- catalogo cerrado de comandos
- auditoria bruta y parseada
- sanitizacion de respuestas
- control de adjuntos
- URLs firmadas
- idempotencia
- locks por workspace y canal
- deduplicacion

### Casos de fallo a cubrir

- entrada duplicada
- reproceso
- respuesta de IA invalida
- asignacion fallida
- token expirado
- proveedor caido

### Criterio de cierre

- el sistema falla de forma segura

## 21. Punto 15. Testing obligatorio

Estado: `PENDIENTE`

### Objetivo

Cubrir funcionalidad y seguridad antes de ponerlo en uso.

### Unit tests

- parser de comandos
- validador de salida IA
- clasificacion
- asignacion
- escalado
- `isKnownContact`

### Integration tests

- Email entrante
- WhatsApp entrante
- creacion de conversacion
- respuesta por mismo canal
- no cambio de canal
- mensajes seguidos procesados como bloque
- informacion subida siempre incluida
- uso correcto de carpetas, reglas y especialidades
- flujo de `/preguntar_consultas`
- re-procesado durante `pending`
- creacion y asignacion de caso
- nuevo caso por asunto distinto
- `solo contactos conocidos`
- empate `50/50`
- WhatsApp fuera de 24h
- aislamiento por workspace

### Security tests

- acceso denegado entre workspaces
- comandos invalidos rechazados
- adjuntos inaccesibles fuera de su scope

### E2E tests

- conectar canal
- recibir mensaje
- responder
- pausar
- reanudar
- asignar
- ver cuenta principal en asignacion
- autoasignacion de subcuenta sola
- filtrar por canal
- bloqueo WhatsApp fuera de 24h
- polling Email cada `1 minuto`
- entrada WhatsApp por webhook

### Criterio de cierre

- existe una suite minima que cubre los casos obligatorios

## 22. Punto 16. Observabilidad

Estado: `PENDIENTE`

### Objetivo

Poder reconstruir cualquier decision o fallo.

### Datos minimos a registrar

- `workspaceId`
- `conversationId`
- `messageId`
- input al motor
- contexto entregado a IA
- salida bruta de IA
- salida parseada
- comandos ejecutados
- errores
- proveedor implicado

### Metricas minimas

- respuestas automaticas
- conversaciones en `pending`
- escalados a consultas
- errores por canal
- latencia de IA
- errores de parser
- reintentos

### Criterio de cierre

- se puede auditar una ejecucion completa de punta a punta

## 23. Punto 17. Activacion controlada

Estado: `PENDIENTE`

### Objetivo

Encender el sistema nuevo de forma segura.

### Reglas

- no hay migracion inicial de datos que hacer
- la activacion puede ser directa sobre el sistema nuevo
- si se considera conveniente, puede usarse feature flag por workspace
- el legado se retira cuando el nuevo sistema este validado

### Criterio de cierre

- existe una forma segura de activar el sistema sin romper operativa

## 24. Punto 18. Definicion de hecho

Estado: `PENDIENTE`

Un punto pasa a `HECHO` solo si:

- esta implementado
- esta integrado
- supera sus pruebas minimas
- respeta aislamiento por workspace
- no introduce regresiones fuera del alcance
- queda apto para produccion

## 25. Orden recomendado de implementacion

1. Punto 0. Descubrimiento y congelacion del comportamiento actual
2. Punto 1. Nuevo dominio por workspace
3. Punto 2. Modelo unificado de conversacion y mensaje
4. Punto 3. Conectores de canal
5. Punto 4. Motor unificado de ejecucion
6. Punto 5. Contrato del prompt de IA
7. Punto 6. Catalogo cerrado de comandos
8. Punto 7. Reglas de negocio de la IA
9. Punto 8. Contactos conocidos
10. Punto 9. Flujo de consultas por email
11. Punto 10. Casos y asignacion
12. Punto 11. Carpetas y organizacion
13. Punto 12. Frontend unificado
14. Punto 13. WhatsApp Meta y tokens
15. Punto 14. Seguridad y produccion
16. Punto 15. Testing obligatorio
17. Punto 16. Observabilidad
18. Punto 17. Activacion controlada
19. Punto 18. Definicion de hecho
