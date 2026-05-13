# Requisitos de Usuario — Lyrium Systems

## Contexto
Aplicación legal (Lyrium Systems) con asistente IA (Lyra), automatizaciones de email/WhatsApp, gestión de clientes, facturación, calendario y chats especializados.

---

## 1. Apartado "Casos" (nuevo)
En automatizaciones email y WhatsApp existe un toggle "gestionar solicitudes de servicio" que organiza automáticamente los casos. Se quiere:
- Detectar también la intención de asignación de caso (no solo explícita, sino implícita).
- Crear un nuevo apartado en el menú lateral llamado **"Casos"**.
- En "Casos" deben aparecer los casos detectados por la IA como nuevos casos pendientes.
- Un usuario podrá ir organizándolos manualmente entre los distintos abogados (subcuentas creadas).

**Aclaraciones:**
- Un "caso" SOLO incluye solicitudes de servicio explícitas o intención implícita de contratar un abogado. Las consultas generales NO aparecen en Casos.
- En "Casos" el usuario podrá: ver, asignar a abogado, rechazar y cerrar casos.
- Los casos aparecerán agrupados por canal: email por un lado, WhatsApp por otro.
- **Independientemente de que la asignación automática esté activa o no**, todos los casos detectados aparecerán en el apartado "Casos". La asignación automática sigue funcionando por detrás, pero el usuario siempre puede ver y gestionar los casos manualmente desde este apartado.
- Cuando `autoAssignEnabled=true` y el sistema asigna automáticamente un abogado, el caso se crea con `status: 'assigned'`.
- Se puede crear un caso manualmente y enlazarlo a un cliente existente del apartado "Clientes" mediante un campo `linkedClientId`.

---

## 2. Sincronización bidireccional calendario
Actualmente la sincronización con Google Calendar es unidireccional (Lyrium → Google). Se quiere:
- Si se hace un cambio en Google Calendar, también debe reflejarse en el calendario de Lyrium.
- Es decir, sincronización bidireccional real.

**Aclaración:** Se usará la Opción B: polling cada 5 minutos usando `syncToken` de Google Calendar API (solo devuelve cambios, muy eficiente) + modelo local en MongoDB. También habrá botón "Sincronizar ahora" para forzar manualmente.

---

## 3. Sistema de banderas en chats
En todos los chats con IA se quiere:
- Poder marcar (flaggear) un mensaje específico dentro de una conversación.
- Poder ir a ese mensaje del chat de manera rápida posteriormente.
- Debe funcionar en todos los chats: asistente IA, cliente, defensa, contratos, resúmenes, fiscal.

**Aclaraciones:**
- Las banderas son por mensaje individual (no por conversación completa).
- Son solo visuales, sin notas ni comentarios.
- Acceso rápido mediante panel lateral deslizable dentro de cada chat.

---

## 4. Seguridad y privacidad en prompts
- Se debe reforzar el tema de privacidad: si se le pregunta a la IA, debe responder que el chat es seguro, no se comparte información con terceros y todo está cifrado.
- Revisar y reforzar la seguridad en todos los system prompts.
- Los prompts deben indicar que no se usen emojis.

**Aclaraciones:**
- La IA se presenta como Lyra (sin mencionar Claude, Qwen, OpenAI ni ningún proveedor).
- Se añade una sección de privacidad a los prompts: "Esta conversación es privada, no se comparte información con terceros, todo está cifrado."
- Se añade la regla "NO uses emojis ni emoticonos" a todos los system prompts.

---

## 5. Facturación y Verifactu
- Revisar si el sistema de verificación de facturas (QR + huella encadenada) está implementado en facturas de suscripción (Stripe) y en facturas manuales.
- Si está implementado, eliminar cualquier mención explícita de "VeriFactu" en la interfaz, pero mantener el funcionamiento (QR, huella, etc.) de forma genérica.
- Asegurar que el sistema de QR y huella encadenada funcione también en facturas enviadas por email desde el apartado de clientes.

**Aclaraciones:**
- El sistema de verificación de facturas (QR + huella encadenada) se añade también a las facturas de suscripción Stripe (ahora solo está en manuales).
- Se elimina la palabra "VeriFactu" del frontend y de todo el código. El sistema se presenta como un sistema genérico de verificación de facturas.
- El QR apunta a una URL del dominio lyrium.io (ej: `https://lyrium.io/invoice/:invoiceId`) donde se visualiza la factura verificable.
- El sistema de QR y huella encadenada funciona en TODOS los países usando el algoritmo estándar de huella encadenada (sin branding específico de ningún país).

---

## 6. Revisión completa de automatizaciones email y WhatsApp
Revisar todo el flujo de funcionamiento de email y WhatsApp en automatizaciones:
- Corregir errores lógicos o flujos rotos que no generen errores de código explícitos.
- Asegurar que funcione perfectamente en producción.
- Incluye: clasificación, respuestas automáticas, reenvío a consultas, asignación, confirmaciones, gestión de conversaciones, reglas de clasificación, etc.

---

## 7. WhatsApp Meta: conexión manual, tokens y alertas
- Añadir opción de conexión manual a WhatsApp (además de la automática actual).
- Usar token long-lived (60 días) y renovarlo antes de caducar.
- Permitir renovar el token aunque no haya caducado.
- Mostrar un contador de días restantes hasta la expiración.
- Si quedan 7 días o menos, enviar alerta vía email usando Brevo.
- El email de alerta debe ser configurable por el usuario (no un correo por defecto).
- El flujo de email (alerta) y WhatsApp debe ser coherente entre sí.

**Aclaraciones:**
- Meta ya intenta obtener token long-lived (60 días), pero no guarda fecha de expiración ni lo renueva.
- Se implementará contador de días restantes y renovación manual antes de caducar.
- La alerta por email se envía usando Brevo y es configurable por cuenta (campo `whatsappAlertEmail`).
- El botón de renovación irá en Automatizaciones > WhatsApp.

---

## 8. Modelos de IA separados
- **Automatizaciones** (email y WhatsApp): usar modelo `Qwen/Qwen3-235B-A22B-Instruct-2507` (no-thinking, más rápido y barato para tareas de clasificación y respuesta).
- **Chats** (Lyra, defensa, contratos, resúmenes, fiscal, redacción): usar modelo `qwen/qwen3-235b-a22b-thinking-2507` (thinking, mejor razonamiento para conversaciones complejas).
- Ambos modelos apuntan a la misma API de AtlasCloud.

---

## 9. Revisión global del apartado de automatizaciones
Revisar de manera exhaustiva TODO el apartado de automatizaciones (no solo email y WhatsApp):
- Verificar que cada toggle, switch y configuración funcione correctamente en producción.
- Revisar flujos de respuesta automática, reenvío, asignación, calendario, reglas de clasificación y notificaciones.
- Asegurar que no existan errores silenciosos, race conditions ni flujos rotos que no generen errores explícitos.
- Validar que los cambios de estado se persistan correctamente en la base de datos.
- Comprobar que las integraciones externas (Google Calendar, Meta WhatsApp, Brevo, Stripe, Tavily, etc.) manejen errores y reintentos adecuadamente.
- Todo debe estar preparado para funcionar en un entorno de producción real.

---

## 10. Texto de seguridad en la landing
En la página de inicio (landing page) se quiere añadir un texto/banner visible que comunique:
- Toda la información está cifrada.
- No se comparte ningún dato con terceros.
- La comunicación es privada y segura.
Este texto debe integrarse en la landing de forma elegante (ej. banner debajo del hero, o en la sección de seguridad existente).

---

## 11. Internacionalización (i18n)
Todo lo nuevo que se añada a la aplicación (textos, etiquetas, botones, notificaciones, etc.) debe estar traducido a TODOS los idiomas soportados por la app:
es, en, de, fr, it, pt, nl, sv, pl, cs, da, el, fi, hu, ro, sk, sl, bg, hr, lt, lv, et, no.
Se deben añadir las nuevas claves de traducción a todos los archivos JSON en `frontend/src/i18n/`.

---

## 12. Análisis continuo de la aplicación
La IA debe analizar la aplicación apartado por apartado (clientes, facturación, calendario, automatizaciones, chats, landing, etc.) e ir apuntando en un archivo `nuevo.md` todas las mejoras, nuevas funciones y optimizaciones que detecte para que la app quede lo más completa posible orientada a abogados y despachos de abogados.
