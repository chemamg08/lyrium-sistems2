# Backlog de Mejoras — Lyrium Systems

> Este archivo es un backlog vivo donde se documentan mejoras, nuevas funciones y optimizaciones detectadas tras analizar cada apartado de la aplicación.
> Orientado a abogados y despachos de abogados.

---

## Cómo se usa este archivo
- Cada apartado analizado añade una sección nueva.
- Las entradas incluyen prioridad y esfuerzo estimado.
- No se modifica código basándose solo en este archivo; el usuario debe autorizar explícitamente cada cambio.

---

## Apartados del menú lateral (estado de análisis)
- [x] Inicio
- [x] Clientes
- [x] Resúmenes
- [x] Contratos
- [x] Asistente IA
- [x] Preparación de Defensa
- [x] Automatizaciones
- [ ] Casos (nuevo)

> Nota: Se pueden sugerir nuevos apartados para la app durante el análisis.
> Los apartados de Asesoramiento Fiscal, Cumplimiento Fiscal, Redacción y Landing NO se analizarán.

---

*Análisis en curso...*

---

## Inicio (Dashboard)

### Fecha: 2026-04-28

#### Mejoras detectadas
1. **Widget de facturación resumida** (facturas pendientes, ingresos del mes, total facturado)
   - Prioridad: Alta
   - Esfuerzo estimado: Medio
   - Justificación: El módulo de facturas ya existe en Clientes. Exponerlo en el dashboard es crítico para la gestión económica diaria del bufete.

2. **Estadísticas de casos / expedientes** (activos, cerrados, por especialidad)
   - Prioridad: Alta
   - Esfuerzo estimado: Medio
   - Justificación: Core para un despacho legal. Actualmente solo se trackean contratos y defensas como contadores aislados.
   - Las especialidades se reutilizan de las ya creadas en Automatizaciones > Especialidades.
   - Se mostrarían como chips/badges debajo de los contadores: "Penal: 5", "Laboral: 4", etc.

3. **Loaders y estados de error visibles** (skeletons para stats/calendario, toasts en errores de red)
   - Prioridad: Alta
   - Esfuerzo estimado: Bajo
   - Justificación: Mejora UX drásticamente. Actualmente errores silenciados y valores "0" engañosos.

4. **Tendencias y comparativas temporales** (clientes nuevos este mes vs anterior, evolución de facturación)
   - Prioridad: Media
   - Esfuerzo estimado: Medio
   - Justificación: Añade valor analítico. Requiere extender queries de stats con rangos de fecha.

#### Nuevas funciones sugeridas
1. **Nuevo apartado "Casos"** en el menú lateral
   - Prioridad: Alta
   - Justificación: Un bufete no gestiona "clientes", gestiona "expedientes/casos". Cada cliente puede tener múltiples asuntos.
   


---

## Clientes

### Fecha: 2026-04-28

#### Mejoras detectadas
2. **Calendario de recordatorios/plazos por cliente**
   - Prioridad: Crítica
   - Esfuerzo estimado: Alto
   - Justificación: Los abogados viven de los plazos.
   - Implementación:
     - En la tarjeta del cliente, icono de calendario 📅 a la izquierda del icono de archivos y al lado del botón "Hablar con Lyra".
     - Al pulsar, modal con lista de eventos/recordatorios en tarjetas, ordenados por fecha (más próximos primero).
     - En la esquina superior derecha del modal, botón "+" para crear nuevo evento.
     - Al crear: título, rango de fechas libre (desde-hasta), tipo (Recordatorio / Plazo legal / Audiencia / Reunión), notas opcionales.
     - Los eventos son SOLO internos de la app, no sync con Google Calendar.
     - A la izquierda del botón "Nuevo cliente" en la lista, botón "Eventos" que abre vista global de todos los eventos.
     - En la vista global: barra de búsqueda, filtro por subcuentas, ordenados por fecha (más próximos primero).

3. **Seguimiento de cobros y estados de pago**
   - Prioridad: Alta
   - Esfuerzo estimado: Medio
   - Justificación: Las facturas tienen sentAt pero no estado de cobro (pendiente, parcial, pagado, impagado). No hay registro de pagos recibidos.

4. **Paginación y ordenación en listado de clientes**
   - Prioridad: Media
   - Esfuerzo estimado: Bajo
   - Justificación: No hay paginación de servidor. Si una cuenta tiene >500 clientes, la carga será costosa.
   - Implementación: 20 clientes por página con botones Anterior/Siguiente.

---

## Automatizaciones

### Fecha: 2026-04-28

#### Mejoras detectadas
2. **Horarios de atención configurables**
   - Prioridad: Alta
   - Esfuerzo estimado: Medio
   - Justificación: Fuera de horario la IA no debe responder ni enviar mensajes. Solo marcar como pendientes de procesar.
    - Implementación:
      - En Email: botón "Horarios" a la izquierda del botón "Selección".
      - En WhatsApp: botón "Horarios" a la izquierda del botón "Carpetas".
      - Al pulsar, modal con: días de la semana (toggle lunes-domingo), hora inicio, hora fin.
      - La zona horaria se determina automáticamente según el país de la cuenta (ya configurado al crear la cuenta), sin selector manual.
      - Si llega mensaje fuera de horario: se guarda en la conversación como "pendiente de procesar". Cuando empiece el horario, la IA los procesa en orden.
      - No se envía ningún mensaje automático fuera de horario.



5. **Múltiples números de WhatsApp por cuenta**
   - Prioridad: Baja
   - Esfuerzo estimado: Alto
   - Justificación: Poder conectar más de un número de WhatsApp Business (ej. uno para penal, otro para laboral).
   - Implementación:
     - Botón "Añadir número de WhatsApp" en Automatizaciones > WhatsApp.
     - Cada número tiene nombre personalizado ("WhatsApp Penal", "WhatsApp General").
     - Filtro en la lista de chats para seleccionar qué número se quiere ver.
     - Las conversaciones se etiquetan con el número al que llegaron.


---

## Preparación de Defensa

### Fecha: 2026-04-28

#### Mejoras detectadas
1. **Gestión estructurada de pruebas**
   - Prioridad: Crítica
   - Esfuerzo estimado: Alto
   - Justificación: Se permite soltar un PDF, pero no hay un módulo de "pruebas" donde clasificar documentos.
   - Implementación:
     - Nueva pestaña "Pruebas" dentro del chat de Defensa (al lado de "Estrategias guardadas").
     - Botón "Añadir prueba" con formulario: Tipo (Testimonio / Peritaje / Documento / Fotografía / Escrito / Audio-Vídeo), Descripción, Fecha de obtención, Archivo adjunto, Número de exhibit (auto o manual).
     - Lista de pruebas con icono según tipo, número de exhibit, miniatura, estado (Pendiente / Presentada / Admitida / Excluida).
     - Al exportar estrategia a PDF, las pruebas aparecen en tabla: Nº, Tipo, Descripción, Estado.

2. **Simulación de escenarios / contrarreplicas**
   - Prioridad: Media
   - Esfuerzo estimado: Medio
   - Justificación: No hay estimación probabilística de éxito ni simulación de réplicas de la contraparte.
   - Implementación:
     - Botón aparte dentro del panel de estrategias guardadas: "Simular contrarreplica" o "Ensayo de juicio".
     - La IA analiza la estrategia guardada y genera:
       1. Posibles argumentos de la contraparte
       2. Cómo rebatir cada uno
       3. Score de fortaleza de la defensa (fortalezas / debilidades)
     - Se muestra en un modal o panel lateral, sin mezclarse con el chat de preparación.
