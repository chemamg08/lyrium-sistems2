 # Análisis Completo de la App Lyrium Systems

> Fecha del análisis: 30 de abril de 2026
> Alcance: Frontend + Backend completa

---

## ERRORES CRITICOS (pueden causar fallos en producción)

### 1. Uso incorrecto de `pdf-parse` en múltiples archivos
**Archivos afectados:** `assistantController.ts`, `automatizacionesController.ts`, `clientsController.ts`, `defenseChatController.ts`, `documentSummariesController.ts`, `emailProcessorService.ts`, `contractPdfService.ts`, `ragService.ts`

`pdfParseModule.PDFParse` no es un constructor válido. El módulo `pdf-parse` exporta una función por defecto, no una clase `PDFParse`. Esto causará un **crash en runtime** cada vez que se intente procesar un PDF.

**Uso correcto:**
```typescript
const pdfParse = await import('pdf-parse');
const result = await pdfParse.default(pdfBuffer);
```

---

### 2. Endpoints de Cases sin verificación de propiedad
**Archivo:** `casesController.ts` — Líneas 26-247

7 endpoints NO tienen verificación `verifyOwnership`:
- `getCaseById` — cualquiera puede ver cualquier caso
- `assignCase` — cualquiera puede reasignar casos
- `updateCaseStatus` — cualquiera puede cambiar el estado
- `linkCaseToClient` — cualquiera puede enlazar casos a clientes
- `deleteCase` — cualquiera puede eliminar cualquier caso
- `updateCaseNotes` — cualquiera puede modificar notas
- `createManualCase` — no verifica que el accountId pertenezca al usuario

**Impacto:** Cualquier usuario autenticado puede acceder, modificar o eliminar datos de otros usuarios.

---

### 3. XSS en `publicInvoiceController.ts`
**Archivo:** `publicInvoiceController.ts` — Líneas 57-83

Los campos de la factura (`invoiceNumber`, `date`, `firmName`, `clientName`, etc.) se interpolan directamente en HTML sin escapar. Si algún campo contiene `<script>`, se ejecutará.

**Además:** `totalAmount.toFixed(2)` puede lanzar error si `totalAmount` es null/undefined.

---

### 4. Logo global compartido entre todas las cuentas
**Archivo:** `settingsController.ts` — Líneas 28, 51-57

- `copyFile` sobrescribe `logo.png` para TODOS los usuarios. El logo de un usuario reemplaza el de todos.
- `deleteLogo` NO tiene autenticación. Cualquiera puede eliminar el logo global.

---

### 5. Bug de orden de rutas en `signPublicRoutes.ts`
**Archivo:** `signPublicRoutes.ts` — Línea 11

`/:token` se registra ANTES que `/:token/pdf`. Esto significa que `GET /:token/pdf` nunca se ejecutará porque Express interpreta `pdf` como parte del token.

**Solución:** Registrar `/:token/pdf` ANTES que `/:token`.

---

### 6. Race condition en generación de números de factura
**Archivo:** `clientsController.ts` — Líneas 576-579

`settings.nextInvoiceNumber` se lee, incrementa y guarda de forma no atómica. Dos peticiones concurrentes pueden obtener el mismo número de factura.

---

### 7. Tokens de Google OAuth almacenados en texto plano
**Archivo:** `calendarController.ts` — Línea 10

Si `GOOGLE_TOKEN_ENCRYPTION_KEY` no está configurada, la función `encrypt` devuelve el texto sin cifrar. Los tokens se almacenan sin protección en la base de datos.

---

### 8. Descarga de adjuntos de email sin autenticación
**Archivo:** `automatizacionesRoutes.ts` — Línea 77

`/email-attachments/:filename` NO tiene middleware de autenticación. Cualquiera puede descargar adjuntos de email conociendo el nombre del archivo.

---

### 9. `crypto.subtle.digest` no disponible en Node.js
**Archivo:** `signatureService.ts` — Línea 366

`crypto.subtle.digest` es una API web, no está disponible en Node.js por defecto. Debe usarse `crypto.createHash('sha256')`. Esto lanzará `TypeError` en runtime.

---

### 10. Colisiones de IDs con `Date.now().toString()`
**Archivos afectados:** `accountsController.ts` (líneas 92, 117, 674), `casesService.ts` (líneas 18, 58), `calculosController.ts` (línea 52), `chatsController.ts` (línea 58), `AIAssistant.tsx` (líneas 307, 324), `ChatInterface.tsx` (línea 37)

Usar `Date.now().toString()` como `_id` produce IDs duplicados si dos registros se crean en el mismo milisegundo.

**Solución:** Usar `crypto.randomUUID()` o MongoDB ObjectId.

---

## ERRORES DE SEGURIDAD

### 11. 2FA setup sin verificación de autorización
**Archivo:** `accountsController.ts` — Líneas 176-205

`setup2FA` y `verify2FASetup` NO verifican que el usuario sea el dueño de la cuenta. Cualquier usuario puede generar/verificar 2FA para otra cuenta proporcionando `userId` y `userType`.

---

### 12. Bypass de autenticación con header `x-internal-job`
**Archivo:** `auth.ts` — Líneas 99-102

El header `x-internal-job` bypassa TODO el middleware de autenticación. Si el secreto se filtra, un atacante tiene acceso ilimitado.

---

### 13. Fallo abierto en verificación de cuenta deshabilitada
**Archivo:** `auth.ts` — Línea 127

Si la base de datos falla durante `checkAccountDisabled`, se permite el acceso (fail-open). Una cuenta deshabilitada podría seguir haciendo requests.

---

### 14. Regex injection en búsqueda de clientes por email/teléfono
**Archivo:** `emailProcessorService.ts` — Líneas 43, 51

`new RegExp(\`^${email}$\`, 'i')` — si el email contiene caracteres regex (ej: `.*`), puede coincidir con clientes no deseados.

---

### 15. Clave de cifrado con fallback conocido
**Archivo:** `emailProcessorService.ts` — Línea 88

Si `JWT_SECRET` no está configurada, se usa `'lyrium-fallback-key'` como clave de cifrado. Cualquiera puede descifrar las contraseñas de email almacenadas.

---

### 16. TLS deshabilitado en conexión IMAP
**Archivo:** `emailService.ts` — Líneas 129, 269

`tlsOptions: { rejectUnauthorized: false }` — deshabilita la validación de certificados TLS, vulnerable a ataques MITM.

---

### 17. Inyección de headers en `Content-Disposition`
**Archivos:** `sharedFilesController.ts` (línea 125), `improveAIRoutes.ts` (línea 139)

`file.originalName` se interpola directamente en el header sin sanitización.

---

### 18. `assignClientToSubaccount` sin validación de subcuenta
**Archivo:** `accountsController.ts` — Línea 747

El `subaccountId` se asigna directamente sin verificar que la subcuenta exista o pertenezca a la misma cuenta padre.

---

### 19. `getClientsBySubaccount` permite acceso si la subcuenta no existe
**Archivo:** `accountsController.ts` — Líneas 777-784

Si `sub` es null, la verificación de propiedad se salta y se devuelven todos los clientes con ese `assignedSubaccountId`.

---

### 20. `refreshAccessToken` no valida que el usuario siga existiendo
**Archivo:** `accountsController.ts` — Líneas 466-468

Un refresh token puede usarse incluso después de que la cuenta sea eliminada o deshabilitada.

---

## ERRORES DE LÓGICA Y FUNCIONALIDAD

### 21. `handleSaveCounterReplica` llama al endpoint de simulación en vez de guardar
**Archivo:** `DefensePrep.tsx` — Líneas 419-435

`handleSaveCounterReplica` llama al mismo endpoint que `handleSimulateCounter` (`simulate-counter-replica`). Debería llamar a un endpoint de guardado.

---

### 22. `decryptPassword` acepta contraseñas sin cifrar silenciosamente
**Archivo:** `emailProcessorService.ts` — Líneas 103-105

Si el ciphertext no contiene `:` o tiene partes incorrectas, devuelve el texto plano sin error.

---

### 23. `extractPdfText` usa API incorrecta de pdf-parse
**Archivo:** `emailProcessorService.ts` — Líneas 321-331

`pdfParseModule.PDFParse` no existe. Lanzará error en runtime.

---

### 24. Sufijo de firma hardcoded en emails automatizados
**Archivo:** `emailService.ts` — Líneas 315, 359

`'\n\n\u2014 Asistente del despacho'` se añade a TODOS los emails automatizados, incluso cuando el body ya tiene firma. No hay forma de desactivarlo.

---

### 25. Monedas incorrectas para países latinoamericanos
**Archivos:** `invoiceService.ts` (líneas 82-89), `i18n.ts` (líneas 117-119)

Países como Bolivia (BO), Paraguay (PY), Costa Rica (CR) están mapeados a USD pero usan sus propias monedas (BOB, PYG, CRC).

---

### 26. `saveIncomingAttachments` — colisión de nombres de archivo
**Archivo:** `emailProcessorService.ts` — Línea 1822

Usa `Date.now()` para `id` y `filename`. Dos attachments en el mismo milisegundo tendrán el mismo nombre y uno sobrescribirá al otro.

---

### 27. `processPendingReplies` — intervalo sin forma de detenerse
**Archivo:** `emailProcessorService.ts` — Líneas 1812-1816

El `setInterval` se inicia al cargar el módulo sin mecanismo de parada. Si el módulo se importa múltiples veces (ej: en tests), se ejecutarán múltiples intervalos.

---

### 28. Emails con attachments ignorados si `switchActivo` es false
**Archivo:** `emailProcessorService.ts` — Línea 2002

Los attachments se ignoran silenciosamente cuando el switch está desactivado.

---

### 29. Cuerpos de email truncados a 10000 caracteres
**Archivo:** `emailProcessorService.ts` — Línea 2217

`mergedBody.substring(0, 10000)` — si múltiples emails del mismo remitente exceden 10k caracteres, el contenido importante se pierde.

---

### 30. `withAccountLock` traga errores
**Archivos:** `emailProcessorService.ts` (línea 292-298), `whatsappService.ts` (línea 46-51)

Si `fn` rechaza, el error es absorbido por `.then(() => {}, () => {})` en la cadena del lock. El siguiente caller obtiene una promesa resuelta, permitiendo ejecución concurrente.

---

### 31. `sendEmail` — fuga de conexión del transporter
**Archivos:** `emailService.ts` (línea 386-392), `invoiceService.ts` (línea 419)

`transporter.close()` no está en un bloque `finally`. Si `sendMail` lanza error, la conexión se fuga.

---

### 32. Tasas de cambio de moneda hardcoded y obsoletas
**Archivo:** `invoiceService.ts` — Líneas 57-80

Las tasas de cambio en `CURRENCY_MAP` están fijas y se desviarán de las reales con el tiempo.

---

### 33. Footer de PDF puede solapar contenido
**Archivo:** `invoiceService.ts` — Línea 360

`footerY = doc.page.height - 120` es hardcoded. Si la sección de totales se extiende más allá, el footer solapará contenido.

---

### 34. `processNextJob` — race condition con flag `processing`
**Archivo:** `jobsService.ts` — Líneas 97-162

El flag `processing` no es un mutex. Si `processNextJob` se llama concurrentemente, dos jobs pueden procesarse simultáneamente.

---

### 35. Fetch de jobs sin timeout
**Archivo:** `jobsService.ts` — Línea 122-126

Si el endpoint objetivo se cuelga, el job quedará bloqueado indefinidamente.

---

### 36. Firma de solo PNG soportada
**Archivo:** `signatureService.ts` — Línea 316

`signatureDataUrl.replace(/^data:image\/png;base64,/, '')` — solo maneja PNG. Si la firma es JPEG u otro formato, `embedPng` fallará.

---

### 37. Webhooks de firma fallidos silenciosamente
**Archivo:** `signatureService.ts` — Líneas 232, 297

`dispatchWebhook(...).catch(() => {})` — los fallos de webhook se tragan sin retry ni logging.

---

### 38. `loadTaxModelConfig` usa lectura síncrona de archivo
**Archivos:** `taxComplianceService.ts` (línea 87-90), `calculosService.ts` (línea 54)

`fs.readFileSync` bloquea el event loop. Si el archivo es grande o el disco es lento, toda la app se congela.

---

### 39. `baseAmount.toFixed(2)` puede lanzar error
**Archivo:** `taxComplianceService.ts` — Líneas 279-281

Si `baseAmount` es NaN o undefined, `toFixed` lanzará error.

---

### 40. Token de larga duración de WhatsApp falla silenciosamente
**Archivo:** `whatsappService.ts` — Líneas 963-965, 1063-1072

El intercambio de token de larga duración falla silenciosamente. Se usa el token de corta duración (60 min) que expirará sin aviso.

---

### 41. `FiscalAlert.find().lean()` carga TODAS las alertas en memoria
**Archivo:** `alertScheduler.ts` — Línea 8

Se ejecuta cada minuto. Para datasets grandes, es ineficiente. Debería consultar solo alertas vencidas.

---

### 42. Fecha de envío de alertas puede dispararse prematuramente
**Archivo:** `alertScheduler.ts` — Línea 17

`fechaEnvio <= today` — si `fechaEnvio` es un timestamp ISO completo y la alerta está programada para hoy a una hora futura, se disparará prematuramente.

---

### 43. Drift de fechas en alertas recurrentes mensuales
**Archivo:** `alertScheduler.ts` — Líneas 44-49

Si la fecha original es el 31 y el siguiente mes tiene 30 días, JavaScript auto-avanza al día 1 del mes siguiente, causando drift.

---

### 44. `cleanupService` lanza error si STRIPE_SECRET_KEY no está configurada
**Archivo:** `cleanupService.ts` — Línea 28-33

La verificación lanza en tiempo de carga del módulo. Si la variable no está en tests o dev local sin Stripe, toda la app crashea al importar.

---

### 45. `Stat.deleteMany` usa `_id` en vez de `accountId`
**Archivo:** `cleanupService.ts` — Línea 124

`Stat.deleteMany({ _id: { $in: ids } })` — probablemente debería ser `Stat.deleteMany({ accountId: { $in: ids } })`.

---

### 46. Intervalo de cleanup es de 20 horas, no 24
**Archivo:** `cleanupService.ts` — Líneas 35-36

`INTERVAL_MS = 20 * 60 * 60 * 1000` — probablemente debería ser 24 horas.

---

### 47. Cancelación de suscripción Stripe silenciosa
**Archivo:** `cleanupService.ts` — Líneas 79-88

Si la cancelación falla por error de red (no esperado), la suscripción permanece activa y el usuario podría ser cobrado.

---

### 48. `cosineSimilarity` produce NaN con vectores cero
**Archivo:** `ragService.ts` — Línea 71

Si ambos vectores son cero, `normA` y `normB` son 0, resultando en `0 / 0 = NaN`.

---

### 49. `getOpenAIClient` usa `OPENAI_API_KEY` en vez de `ATLAS_API_KEY`
**Archivo:** `ragService.ts` — Línea 9

El resto de la app usa `ATLAS_API_KEY`. Si `OPENAI_API_KEY` no está configurada, lanzará error.

---

### 50. `validateVatNumber` regex demasiado permisivo
**Archivo:** `taxApiService.ts` — Líneas 254-272

`/^[A-Z]{2}[A-Z0-9]{6,14}$/` aceptaría NIFs inválidos que coincidan con el patrón pero no sean válidos.

---

### 51. `getExchangeRateEurUsd` siempre devuelve 1
**Archivo:** `taxApiService.ts` — Líneas 248-252

Cualquier código que dependa de tasas de cambio reales obtendrá datos incorrectos.

---

### 52. `abortSignal.timeout` no soportado en Node.js antiguo
**Archivo:** `webhookService.ts` — Línea 28

`AbortSignal.timeout(10000)` no está disponible en versiones antiguas de Node.js.

---

### 53. Webhooks se ejecutan fire-and-forget sin retry
**Archivo:** `webhookService.ts` — Líneas 23-37

Los webhooks fallidos se loguean pero nunca se reintentan.

---

### 54. `events.filter` sin validación de array
**Archivo:** `webhookRoutes.ts` — Línea 92

Si `events` no es un array, `.filter()` lanzará error.

---

### 55. `classifyQuerySpecialties` puede devolver array vacío
**Archivo:** `specialtiesService.ts` — Líneas 280-319

Si la AI devuelve un array vacío, la función devuelve vacío, lo que puede causar que código downstream use cero especialidades.

---

### 56. `detectLanguage` no reconoce nombres completos de idiomas
**Archivo:** `automationMessages.ts` — Línea 368

Si la AI devuelve "spanish" o "español" en vez de "es", el patrón no coincidirá y `normalizeLanguage` devolverá null.

---

### 57. `interpolate` no maneja placeholders con caracteres especiales
**Archivo:** `automationMessages.ts` — Línea 343

Usa `/\{(\w+)\}/g`. Si un template contiene `{` seguido de caracteres no-word, el regex no coincidirá.

---

### 58. `changePlan` no valida que el nuevo plan sea diferente
**Archivo:** `subscriptions.ts` — Líneas 869-931

Se puede "cambiar" al mismo plan, generando una factura de prorrata innecesaria en Stripe.

---

### 59. `handleWebhook` — `billing_reason` check puede no cubrir todos los casos
**Archivo:** `subscriptions.ts` — Líneas 767-771

Solo ignora `subscription_update` y `subscription_create`. Otros billing reasons podrían procesarse incorrectamente.

---

### 60. `verifyOwnership` con type casting inseguro
**Archivo:** `auth.ts` — Línea 193

`(req as any).user` — el casting a `any` defeats TypeScript type safety.

---

### 61. `pdf-parse` fallback siempre falla primero
**Archivo:** `ragService.ts` — Líneas 179-189

Intenta `pdfParseModule.PDFParse` primero (que no existe), luego usa el fallback. La primera rama siempre lanzará, haciendo el proceso ineficiente.

---

### 62. `sanitizeForWinAnsi` reemplaza caracteres C1 con `?`
**Archivo:** `contractPdfService.ts` — Líneas 221-250

El rango 0x80-0x9F (códigos de control C1) se reemplaza con `?`. Algunos de estos son caracteres Latin-1 válidos.

---

### 63. Emojis en PDF con fuente Helvetica no se renderizan
**Archivo:** `pdfService.ts` — Líneas 93, 118

Los emojis ⚠ y ✓ no se renderizan correctamente con las fuentes estándar de PDFKit.

---

### 64. `legalTermHits >= 2` requiere 2 términos legales
**Archivo:** `legalIntentService.ts` — Línea 32

Una consulta con un solo término legal fuerte (ej: "demanda") no se detectará como intención legal.

---

### 65. Cache de embedding elimina solo el primer entry
**Archivo:** `legalKnowledgeService.ts` — Línea 785-787

Cuando el cache excede 500 entries, solo se elimina el primero. Debería eliminar el más antiguo (LRU).

---

### 66. Logging de retrieval construido pero nunca usado
**Archivo:** `legalKnowledgeService.ts` — Líneas 989, 1011

Bloques `if (LOG_RETRIEVAL) {}` vacíos. El payload se construye pero nunca se loguea.

---

### 67. `persistEmbeddingCache` escribe síncronamente
**Archivo:** `legalKnowledgeService.ts` — Línea 749

`fs.writeFile` síncrono para caches grandes bloquea el event loop.

---

### 68. `withTimeout` puede resolver con fallback después del timeout
**Archivo:** `legalKnowledgeService.ts` — Líneas 247-265

Si la promesa original resuelve después del timeout, el handler del timeout ya resolvió con fallback. El `clearTimeout` en `finally` puede no ejecutarse.

---

### 69. `startTaxRateSyncWorker` parsea países una vez al inicio
**Archivo:** `taxRateSyncService.ts` — Líneas 244-256

Si la variable de entorno cambia en runtime, el worker no recoge los nuevos países.

---

### 70. `getTaxSnapshotForCountry` bypassa la base de datos en fallback
**Archivo:** `taxRateSyncService.ts` — Líneas 226-231

El fallback a `getExternalTaxSnapshot` no persiste el resultado en la base de datos.

---

### 71. Tarifas de IVA hardcoded con encoding corrupto
**Archivo:** `fiscalController.ts` — Líneas 16-31

Nombres de países con mojibake (ej: `'EspaÃ±a'` en vez de `'España'`). Problema de encoding del archivo.

---

### 72. `callFiscalAI` pasa `null` como perfil
**Archivo:** `fiscalController.ts` — Líneas 474, 917

`callFiscalAI(null, acctCtx as any, ...)` — no está claro si el servicio maneja correctamente un perfil null.

---

### 73. Parsing de JSON de AI es frágil
**Archivo:** `fiscalController.ts` — Líneas 1141-1149

Si la AI devuelve JSON malformado, el endpoint devuelve 500 sin retry ni fallback.

---

### 74. XSS en email de alertas fiscales
**Archivo:** `fiscalController.ts` — Línea 269

`alert.mensaje.replace(/\n/g, '<br>')` se inserta en HTML sin sanitización. Si `mensaje` contiene HTML/JS, se renderizará.

---

### 75. Stripe charges limitado a 100 en admin
**Archivo:** `adminController.ts` — Líneas 62-69

`stripe.charges.list({ limit: 100 })` solo obtiene 100 charges. Si hay más de 100 en un mes, los ingresos se subcalculan.

---

### 76. `trial_end` misuse en Stripe para extender suscripciones pagadas
**Archivo:** `adminController.ts` — Líneas 263-269

Usar `trial_end` para extender un periodo de suscripción pagada no es el uso previsto de la API de Stripe.

---

### 77. Admin-created accounts skip email verification
**Archivo:** `adminController.ts` — Línea 376

`emailVerified: true` se establece sin verificación real. Es por diseño pero es una consideración de seguridad.

---

### 78. `returnDocument: 'after'` puede ser incompatible con Mongoose antiguo
**Archivo:** `automatizacionesController.ts` — Líneas 51-52

En Mongoose < 7, debería ser `new: true`. Uso inconsistente en el codebase.

---

### 79. Path traversal en `viewDocumento`
**Archivo:** `automatizacionesController.ts` — Línea 349

`res.sendFile(filePath)` donde `filePath` se construye desde `doc.filename`. Si el nombre fue manipulado durante la subida, permite traversal de directorios.

---

### 80. `downloadEmailAttachment` sin verificación de propiedad
**Archivo:** `automatizacionesController.ts` — Línea 627

Descarga archivos por nombre sin verificar que el usuario sea dueño de la cuenta que los subió.

---

### 81. `startPolling` llamado independientemente del estado del switch
**Archivo:** `automatizacionesController.ts` — Línea 367

El comentario dice "Always keep polling active" pero esto anula el propósito del toggle `switchActivo`.

---

### 82. `JSON.parse` sin try-catch en `clientsController.ts`
**Archivo:** `clientsController.ts` — Líneas 129, 165

Si `fiscalInfo` es un string JSON malformado, lanzará excepción no manejada.

---

### 83. `res.sendFile` sin validación de path en `clientsController.ts`
**Archivo:** `clientsController.ts` — Línea 314

`file.filePath` de la base de datos se usa directamente. Si la entrada fue manipulada, puede servir archivos arbitrarios.

---

### 84. Path traversal en `deleteClientFile`
**Archivo:** `clientsController.ts` — Línea 415

Mismo problema que #83 — `file.filePath` se usa para construir el path de eliminación.

---

### 85. `transporter.close()` puede lanzar error
**Archivo:** `clientsController.ts` — Línea 630

No está envuelto en try-catch después de `sendMail`.

---

### 86. Singleton OpenAI client no se resetea
**Archivos:** `contractsChatController.ts` (línea 29-38), `aiService.ts` (línea 16-25), `specialtiesService.ts` (línea 241-249), `automationMessages.ts` (línea 314-325)

Si `ATLAS_API_KEY` cambia en runtime (ej: hot reload), el cliente stale persiste.

---

### 87. Extracción de texto de contrato es frágil
**Archivo:** `contractsChatController.ts` — Líneas 669-670

Dividir por `[GENERAR_CONTRATO_COMPLETO]` y `[/FIN_CONTRATO]` puede fallar si la AI outputea estos markers en lugares inesperados.

---

### 88. Emojis en respuestas del contrato a pesar del system prompt
**Archivo:** `contractsChatController.ts` — Líneas 719, 910

`✅ Contrato generado exitosamente.` y `✅ Estrategia guardada correctamente` a pesar de que el system prompt dice "NO uses emojis".

---

### 89. Eliminación de archivos de contrato sin validación de path
**Archivo:** `contractsChatController.ts` — Líneas 380-393

`path.join(GENERATED_DIR, contract.fileName)` — si `contract.fileName` contiene `..`, puede eliminar archivos fuera del directorio.

---

### 90. PDF analysis en background con error silenciado
**Archivo:** `contractsController.ts` — Línea 64

`.catch(err => console.error(...))` — si el análisis falla, el contrato se crea pero nunca se analiza.

---

### 91. `exportDefenseChat` pipe sin handler de cierre
**Archivo:** `defenseChatController.ts` — Líneas 628-629

Si el cliente se desconecta durante el pipe, puede lanzar error sin handler `res.on('close')`.

---

### 92. Sanitización de nombre de archivo débil
**Archivo:** `defenseChatController.ts` — Línea 638

`chatTitle.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s-]/g, '')` no maneja todos los caracteres Unicode y puede producir nombres vacíos.

---

### 93. `wantsSaveStrategy` hace llamada AI en cada mensaje
**Archivo:** `defenseChatController.ts` — Línea 467

Es costoso y lento. La detección por keywords en línea 462 debería ser suficiente.

---

### 94. Emojis en summaries a pesar del system prompt
**Archivo:** `documentSummariesController.ts` — Líneas 399, 402

`📄` y `❌` se añaden a los summaries a pesar del system prompt.

---

### 95. Eliminación de archivos sin check de path traversal
**Archivo:** `documentSummariesController.ts` — Línea 272

`path.join(__dirname, '../..', file.filePath)` — si `file.filePath` es malicioso, puede eliminar archivos fuera de uploads.

---

### 96. `getJob` sin try-catch
**Archivo:** `jobsController.ts` — Línea 38

`getJobById` puede lanzar y no hay handler de error.

---

### 97. TOCTOU race condition en ownership check
**Archivos:** `calculosController.ts` (línea 122), `jobsController.ts` (línea 42)

`verifyOwnership` se verifica después del fetch. Entre el fetch y el check, el `accountId` podría haber sido cambiado.

---

### 98. `flagMessage` sin verificación de propiedad
**Archivo:** `messageFlagsController.ts` — Líneas 18-44

Cualquiera que conozca un `chatId` y `messageId` puede flaggear/unflaggear mensajes.

---

### 99. `message.flags` crece sin límite
**Archivo:** `messageFlagsController.ts` — Línea 33

No hay límite en cuántos flags puede tener un mensaje. Puede ser abusado para inflar la base de datos.

---

### 100. `JSON.parse` sin try-catch en `sharedFilesController.ts`
**Archivo:** `sharedFilesController.ts` — Línea 36

`JSON.parse(recipientIds || '[]')` lanzará si `recipientIds` es un string no-JSON.

---

### 101. `includes` check puede fallar si `recipientIds` no es array
**Archivo:** `sharedFilesController.ts` — Línea 118

Si `recipientIds` no es un array (datos corruptos), `.includes()` lanzará.

---

### 102. Ownership check solo en primer resultado
**Archivo:** `signatureController.ts` — Línea 78

`getSignaturesForClient` verifica ownership solo en `requests[0]`. Si el array está vacío, no se verifica.

---

### 103. Lee PDF completo en memoria
**Archivo:** `signatureController.ts` — Línea 252

`fs.readFile(sigReq.originalFilePath)` carga el PDF completo en memoria. Para archivos grandes, puede causar OOM.

---

### 104. `dest: 'uploads/temp/'` es path relativo
**Archivo:** `settingsRoutes.ts` — Línea 6

Se resuelve relativo al CWD, no al root del proyecto. Si el servidor se inicia desde otro directorio, los uploads van al lugar equivocado.

---

### 105. `filePath` almacenado como path absoluto
**Archivo:** `publicApiRoutes.ts` — Línea 133

`file.path` de multer es un path absoluto. Se almacena en la DB. Si el servidor se mueve a otra máquina, los paths serán inválidos.

---

### 106. `view/:fileId` sin verificación de propiedad
**Archivo:** `improveAIRoutes.ts` — Línea 136

Sirve archivos sin verificar que el requester tenga acceso a la cuenta dueña.

---

### 107. Stream error no manejado en `view/:fileId`
**Archivo:** `improveAIRoutes.ts` — Línea 140

`stream.pipe(res)` — si el stream falla (archivo eliminado mid-read), el error no se captura y puede crashear el proceso.

---

### 108. `file.originalname` no sanitizado en multer
**Archivo:** `whatsappController.ts` — Línea 135

`${Date.now()}_${file.originalname}` — si `originalname` contiene separadores de path, puede causar problemas en diferentes OS.

---

### 109. Webhook de WhatsApp procesa entries sincrónicamente
**Archivo:** `whatsappController.ts` — Líneas 764-797

Si Meta envía muchos entries, el webhook handler bloquea en cada `processIncomingMessage`. Debería encolar para procesamiento async.

---

### 110. `getInstanceStatus` puede causar falsas desconexiones
**Archivo:** `whatsappService.ts` — Líneas 1284-1317

Si la llamada a Graph API falla con error no transitorio, la sesión se marca como desconectada. Pero si es un error de red temporal, causa falsas desconexiones.

---

### 111. Extensiones de archivo no cubren todos los formatos válidos
**Archivo:** `whatsappService.ts` — Líneas 1387-1395

No cubre `.webm` para audio, `.3gp`, etc.

---

### 112. `buildWAPublicAttachmentUrl` usa nombre sin sanitizar
**Archivo:** `whatsappService.ts` — Línea 1398

El `filename` es del path local del disco, no sanitizado. Si contiene caracteres especiales, la URL puede ser malformada.

---

### 113. `detectionCache` crece sin límite
**Archivo:** `automationMessages.ts` — Línea 315

Map sin límite de tamaño ni política de evicción. Crecerá indefinidamente.

---

### 114. `cache` de `taxApiService` crece sin límite
**Archivo:** `taxApiService.ts` — Línea 10

Map sin límite de tamaño ni política de evicción.

---

### 115. `queryResultCache` de `legalKnowledgeService` con política LRU ineficiente
**Archivo:** `legalKnowledgeService.ts` — Líneas 77-79, 1119-1126

Elimina los 20 entries más antiguos cuando llega a 100. Correcto pero ineficiente para alto tráfico.

---

### 116. `EMBEDDING_CACHE_MAX_SIZE` elimina solo el primer entry
**Archivo:** `legalKnowledgeService.ts` — Línea 234, 785-787

Cuando excede 500, solo elimina el primero. Debería eliminar el más antiguo.

---

### 117. `handleFailedLogin` usa `user.updateOne` en documento Mongoose
**Archivo:** `accountsController.ts` — Línea 56-63

`user.updateOne({ $set: update })` en una instancia de documento. Válido pero inconsistente con el resto del codebase.

---

### 118. Login retorna `success: false` para redirect de 2FA setup
**Archivo:** `accountsController.ts` — Línea 352-361

Respuesta usa `success: false` con `needs2FASetup: true`. Semánticamente confuso — el login no "falló", requiere un paso adicional.

---

### 119. `undefined as any` type hack
**Archivo:** `accountsController.ts` — Línea 765

`client.assignedSubaccountId = undefined as any` — bypass del sistema de tipos.

---

### 120. `updateBillingProfile` usa asignación directa + `save()`
**Archivo:** `accountsController.ts` — Líneas 999-1004

Inconsistente con el resto del codebase que usa `updateOne`. Puede trigger middleware/validators de Mongoose inesperadamente.

---

### 121. `/refresh` endpoint sin rate limiting
**Archivo:** `accountsRoutes.ts` — Línea 32

Token refresh es una operación sensible sin rate limiter. Permite intentos ilimitados.

---

### 122. `/logout` endpoint sin autenticación
**Archivo:** `accountsRoutes.ts` — Línea 31

Cualquier request puede hit el logout endpoint, limpiando cookies. Puede usarse para disrupt sesiones de usuarios.

---

### 123. `as any` casts pervasivos en routes
**Archivo:** `accountsRoutes.ts` — Líneas 47-61

Suprime type checking de TypeScript. Si las firmas de middleware cambian, los errores no se capturan en compile time.

---

## ERRORES DE MODELOS Y BASE DE DATOS

### 124. Modelos faltantes en `index.ts`
**Archivo:** `models/index.ts`

No exporta: `Case`, `Invoice`, `InvoiceSettings`, `ApiKey`, `Webhook`, `SignatureRequest`, `CalendarEvent`, `ClientReminder`, `ImproveAIFolder`, `ImproveAIFile`, `ImproveAIFragment`, `DefenseEvidence`.

---

### 125. `Case.ts` usa `export default` en vez de named export
**Archivo:** `models/Case.ts` — Línea 59

Inconsistente con todos los demás modelos. Causa problemas de importación.

---

### 126. `_id: false` contradictorio en Account y Subaccount
**Archivos:** `models/Account.ts` (línea 41), `models/Subaccount.ts` (línea 28)

Definen `_id: { type: String, required: true }` pero pasan `{ _id: false }` en schema options. Contradictorio.

---

### 127. `updatedAt` no se auto-actualiza en múltiples modelos
**Archivos:** `Subscription.ts`, `FiscalProfile.ts`, `FiscalAlert.ts`, `FiscalChat.ts`, `WritingText.ts`, `TaxObligation.ts`

Usa `default` en vez de `timestamps: true` de Mongoose. `updatedAt` solo se setea en creación, nunca se actualiza en save.

---

### 128. `periodType` enum no validado en schema
**Archivo:** `models/TaxObligation.ts` — Línea 64

La interfaz declara `'monthly' | 'quarterly' | 'yearly' | 'custom'` pero el schema no tiene validación `enum`.

---

### 129. `Automation` — documento puede exceder 16MB de MongoDB
**Archivo:** `models/Automation.ts` — Línea 362

Almacena arrays embebidos masivos (conversations, messages, documents, etc.). Con el tiempo, excederá el límite de 16MB.

---

### 130. `ImproveAIFile` — `toJSON` borra `__v` en vez de `_id`
**Archivo:** `models/ImproveAIFile.ts` — Líneas 41-44, 58-61, 73-76

Inconsistente con otros modelos que borran `_id` (después de copiar a `id`).

---

### 131. `embedding` array sin límite de dimensiones
**Archivo:** `models/ImproveAIFile.ts` — Línea 71

Embeddings vectoriales son grandes (1536+ dimensiones). Sin consideración de límites de tamaño de documento.

---

### 132. `fiscalInfo` tipado como `any`
**Archivo:** `models/Client.ts` — Línea 32

Debería usar `Schema.Types.Mixed` o una interfaz propia.

---

### 133. `assignedSubaccountId` default mismatch
**Archivo:** `models/Client.ts` — Línea 70

Interfaz: `string` (requerido, non-nullable). Schema: `default: null`.

---

### 134. `temporaryContractFile` default es `undefined`
**Archivo:** `models/ContractChat.ts` — Línea 60

Debería ser `default: null` para consistencia.

---

### 135. `clientId` default `'general'` en FiscalChat
**Archivo:** `models/FiscalChat.ts` — Línea 43

Magic string. Si `clientId` referencia un documento Client, `'general'` no es un ID válido.

---

### 136. Múltiples modelos con `accountId` default `''`
**Archivos:** `Contract.ts` (línea 18), `Calculation.ts` (línea 38), `GeneratedContract.ts` (línea 17), `SignatureRequest.ts` (línea 27), `DocumentSummariesChat.ts` (línea 65)

Empty string como default para campos de referencia. Debería ser `required: true` o `null`.

---

### 137. `email` unique index sin collation case-insensitive
**Archivos:** `models/Account.ts` (línea 43), `models/Subaccount.ts` (línea 30)

Sin collation case-insensitive, `Test@email.com` y `test@email.com` se tratan como emails diferentes.

---

### 138. `IFlag` interface duplicada en 6 modelos
**Archivos:** `Chat.ts`, `ContractChat.ts`, `DefenseChat.ts`, `AssistantChat.ts`, `DocumentSummariesChat.ts`, `FiscalChat.ts`

Debería extraerse a un archivo de tipos compartido.

---

### 139. `Stat` no tiene `accountId`
**Archivo:** `models/Stat.ts`

Las stats son globales, no por cuenta. Si es intencional, el naming de `_id` es confuso.

---

### 140. `Automation` — password almacenada sin cifrar
**Archivo:** `models/Automation.ts` — Línea 208

`correo: String, password: String` — contraseñas de email sin cifrado.

---

### 141. Índices faltantes
**Archivos varios:**
- `SharedFile.ts` — `senderId` y `recipientIds` sin índices
- `Job.ts` — sin índice en `createdAt`
- `Invoice.ts` — sin índice en `accountId` ni `invoiceNumber`
- `FiscalProfile.ts` — `accountId` sin índice
- `CalendarEvent.ts` — `updatedAt` sin default

---

### 142. `exhibitNumber` no es único por chat
**Archivo:** `models/DefenseEvidence.ts` — Línea 20

Debería tener un índice único compuesto con `chatId`.

---

## ERRORES DE FRONTEND

### 143. Memory leak: timer interval no se limpia en Clients.tsx
**Archivo:** `frontend/src/pages/Clients.tsx` — Líneas 388-394

El `setInterval` se crea pero el cleanup en línea 394 solo limpia el animation `timer`, NO el interval.

---

### 144. Memory leak: blob URL nunca revocado en SignDocument.tsx
**Archivo:** `frontend/src/pages/SignDocument.tsx` — Línea 50

`URL.createObjectURL(blob)` se crea pero nunca se revoca con `URL.revokeObjectURL()`.

---

### 145. Memory leak: blob URL nunca revocado en ContractChatInterface.tsx
**Archivo:** `frontend/src/components/ContractChatInterface.tsx` — Líneas 384-400, 402-418, 528-542

Si `res.ok` es false y se lanza error, `URL.revokeObjectURL(url)` nunca se llama.

---

### 146. Memory leak: blob URL nunca revocado en SharedFilesModal.tsx
**Archivo:** `frontend/src/components/SharedFilesModal.tsx` — Líneas 102-112

Mismo problema que #145.

---

### 147. Operaciones async en cleanup de useEffect
**Archivos:** `DocumentSummaries.tsx` (líneas 42-55), `Contracts.tsx` (líneas 120-132)

Las funciones de cleanup de useEffect hacen `authFetch` async. React cleanup es síncrono; el fetch puede ejecutarse después del unmount.

---

### 148. `handleLogout` en AppSidebar no usa función centralizada
**Archivo:** `frontend/src/components/AppSidebar.tsx` — Líneas 110-113

Usa `sessionStorage.clear(); navigate("/login")` en vez de `logout()` de `authFetch.ts` que también limpia cookies httpOnly del backend.

---

### 149. Auth check en render body de AppLayout
**Archivo:** `frontend/src/components/AppLayout.tsx` — Línea 14

`sessionStorage.getItem('userId')` se ejecuta en cada render. Si la sesión expira en otro tab, no triggerá un re-render para redirect.

---

### 150. `navItems` array recreado en cada render
**Archivo:** `frontend/src/components/AppSidebar.tsx` — Líneas 53-65

Debería usar `useMemo` o mover fuera del componente.

---

### 151. Múltiples useEffect intervals independientes
**Archivo:** `frontend/src/components/AppSidebar.tsx` — Líneas 67-70, 73-89, 91-108

Tres `useEffect` separados, cada uno con su propio `setInterval` de 30 segundos. Causa 3 llamadas API concurrentes. Podrían consolidarse.

---

### 152. `send` function no envuelta en `useCallback`
**Archivo:** `frontend/src/components/ChatInterface.tsx` — Líneas 33-53

Se recrea en cada render, causando re-renders innecesarios si se pasa a hijos.

---

### 153. Textarea auto-resize no encoge al borrar texto
**Archivo:** `frontend/src/components/ChatInterface.tsx` — Línea 127-133

Solo crece cuando hay contenido. Debería resetear altura cuando se borra.

---

### 154. `toggleFlag` no maneja `msg.flags` undefined
**Archivos:** `ContractChatInterface.tsx` (línea 485-506), `DocumentSummariesChatInterface.tsx` (línea 310-331)

`msg.flags[msg.flags.length - 1].id` lanzará TypeError si `msg.flags` es undefined o vacío.

---

### 155. `loadSignatureRequests` no está en dependency array
**Archivo:** `frontend/src/components/ContractChatInterface.tsx` — Línea 546-547

Causa warning de exhaustive-deps de React y posibles stale closures.

---

### 156. `confirm()` blocking en DocumentSummariesChatInterface
**Archivo:** `frontend/src/components/DocumentSummariesChatInterface.tsx` — Línea 271

`confirm()` es un dialog blocking del navegador. Debería usar un modal custom.

---

### 157. localStorage sin try-catch en CookieBanner
**Archivo:** `frontend/src/components/CookieBanner.tsx` — Línea 11

Si localStorage está deshabilitado (Safari private browsing), lanzará error.

---

### 158. GA script no se remueve al revocar consentimiento
**Archivo:** `frontend/src/components/GoogleAnalytics.tsx` — Líneas 28-40

Cuando `enabled` se vuelve false, el script GA ya inyectado nunca se elimina.

---

### 159. Polling interval no se limpia cuando `currentFolder` cambia
**Archivo:** `frontend/src/components/ImproveAIModal.tsx` — Líneas 64-77

El interval se crea pero no se limpia cuando `currentFolder` cambia.

---

### 160. Drag handlers causan flickering
**Archivos:** `ImproveAIModal.tsx` (líneas 211-217), `SharedFilesModal.tsx` (líneas 299-300)

`handleDragLeave` setea `isDragging` a false inmediatamente, causando flicker al arrastrar sobre elementos hijos.

---

### 161. Estado de integraciones no se resetea al cerrar modal
**Archivo:** `frontend/src/components/ProfileModal.tsx` — Líneas 218-224

`newKeyName`, `newWebhookUrl`, etc. retienen valores previos al cerrar y reabrir.

---

### 162. `PaymentForm` duplicado entre ProfileModal y RenewalModal
**Archivos:** `ProfileModal.tsx` (líneas 47-139), `RenewalModal.tsx`

Debería extraerse a un componente compartido.

---

### 163. `startStream` no se limpia en unmount
**Archivo:** `frontend/src/hooks/useStreamingChat.ts` — Líneas 47-156

Si el componente se desmonta mientras un stream está activo, el loop `reader.read()` continúa.

---

### 164. Contract detection tiene display bug
**Archivo:** `frontend/src/hooks/useStreamingChat.ts` — Líneas 116-128

Cuando se detecta `[GENERAR_CONTRATO_COMPLETO]`, `setStreamingText('')` borra el texto. El texto acumulado antes del tag nunca se muestra durante streaming.

---

### 165. Error case llama `onDone` con texto parcial
**Archivo:** `frontend/src/hooks/useStreamingChat.ts` — Líneas 145-155

Cuando ocurre un error (no AbortError), `onDone` se llama con texto parcial. El componente puede tratarlo como respuesta exitosa.

---

### 166. `authFetch` — estado mutable global para refresh
**Archivo:** `frontend/src/lib/authFetch.ts` — Líneas 3-4, 33-39

`isRefreshing` y `refreshPromise` son variables mutables a nivel de módulo. Si llegan múltiples 401 simultáneos, el refresh puede comportarse impredeciblemente.

---

### 167. `authFetch` — retry no maneja fallo de refresh
**Archivo:** `frontend/src/lib/authFetch.ts` — Líneas 38-49

Si `refreshed` es `false`, la respuesta 401 original se devuelve sin indicar que el refresh falló.

---

### 168. `logout()` usa `window.location.href`
**Archivo:** `frontend/src/lib/authFetch.ts` — Líneas 65-73

Causa full page reload en vez de navegación client-side.

---

### 169. Efecto secundario en módulo i18n
**Archivo:** `frontend/src/i18n.ts` — Líneas 199-203

Leer `window.location.search` y escribir en `localStorage` al cargar el módulo es un side effect que corre durante import. Problemático en SSR o tests.

---

### 170. HRK currency deprecated
**Archivo:** `frontend/src/i18n.ts` — Línea 91

Croacia adoptó EUR en 2023. La entrada HRK es código muerto.

---

### 171. `use-toast.ts` — useEffect dependency causa re-subscripción
**Archivo:** `frontend/src/hooks/use-toast.ts` — Línea 177

El useEffect con `[state]` como dependency causa que el listener se elimine y re-añada en cada cambio de estado.

---

### 172. `toastTimeouts` Map crece sin límite
**Archivo:** `frontend/src/hooks/use-toast.ts` — Líneas 53-69

Solo elimina entries cuando el timeout se ejecuta. Si toasts se dismiss manualmente antes del timeout, el entry persiste.

---

### 173. `genId` usa contador mutable a nivel de módulo
**Archivo:** `frontend/src/hooks/use-toast.ts` — Líneas 22-27

En SSR o tests, no se resetea entre renders/tests, causando colisiones de ID.

---

### 174. `useIsMobile` — estado inicial es `undefined`
**Archivo:** `frontend/src/hooks/use-mobile.tsx` — Línea 6

`useState<boolean | undefined>(undefined)` causa flash de layout desktop en móvil antes de que el effect corra.

---

### 175. Module-level state persiste entre navegación en WritingReview
**Archivo:** `frontend/src/pages/WritingReview.tsx` — Líneas 82-83

`_reviewPromise`, `_reviewResults`, `_reviewInProgress`, `_reviewAbort` persisten entre navegación. Datos stale pueden restaurarse incorrectamente.

---

### 176. Debug `console.log` en producción
**Archivo:** `frontend/src/pages/WritingReview.tsx` — Líneas 271-272, 273, 307

Deberían eliminarse antes de producción.

---

### 177. Draft restoration sobrescribe contenido del servidor
**Archivo:** `frontend/src/pages/WritingReview.tsx` — Líneas 166-174

Restauración de `localStorage` sobrescribe contenido del editor incondicionalmente. Si el usuario tenía contenido guardado en servidor, el draft stale lo sobrescribe.

---

### 178. `findPmRange` tiene bug en normalización de whitespace
**Archivo:** `frontend/src/pages/WritingReview.tsx` — Líneas 401-451

El loop de mapeo de posiciones normalizadas a originales es incompleto y puede producir valores `origPos` incorrectos.

---

### 179. `suggestion.length` asume offset de posición ProseMirror
**Archivo:** `frontend/src/pages/WritingReview.tsx` — Línea 558

`suggestion.start + suggestion.suggestion.length` asume que la longitud del texto de sugerencia equivale al offset de posición ProseMirror, incorrecto para caracteres multi-byte o rich text.

---

### 180. `toggleFlag` usa `import.meta.env` directamente
**Archivos:** `DefensePrep.tsx` (líneas 696, 704, 710), `FiscalAdvisory.tsx` (líneas 562, 568)

Inconsistente con el uso de la constante `API_URL` definida en el archivo.

---

### 181. Error recovery frágil en FiscalAdvisory
**Archivo:** `frontend/src/pages/FiscalAdvisory.tsx` — Línea 623

`prev.messages.filter(...)` — si el usuario envía el mismo mensaje dos veces rápido, puede eliminar el mensaje equivocado.

---

### 182. `handleSaveAlert` continúa a pesar de warning
**Archivo:** `frontend/src/pages/FiscalAdvisory.tsx` — Líneas 660-668

Muestra warning toast sobre email no configurado pero continúa guardando. Debería bloquear o usar diálogo de confirmación.

---

### 183. `msg.id || idx` como key puede ser inestable
**Archivo:** `frontend/src/pages/FiscalAdvisory.tsx` — Línea 1170

Si `msg.id` es falsy (string vacío, 0), se usa `idx`, causando inestabilidad de keys al reordenar mensajes.

---

### 184. Funciones de carga de datos con catch blocks vacíos
**Archivo:** `frontend/src/pages/TaxCompliance.tsx` — Líneas 143, 161, 174, 191

Errores de red son completamente invisibles al usuario.

---

### 185. `disconnectWa` sin manejo de errores
**Archivo:** `frontend/src/pages/Automations.tsx` — Líneas 576-578

Si la llamada API falla, `waConnected` se setea a `false` de todos modos.

---

### 186. `savingEvent` declarado después de funciones que lo referencian
**Archivo:** `frontend/src/pages/Automations.tsx` — Línea 1019

Confuso y viola legibilidad top-to-bottom.

---

### 187. `toggleSeleccion` lee `autoData[field]` que puede ser stale
**Archivo:** `frontend/src/pages/Automations.tsx` — Línea 1133

Si `autoData` no se ha actualizado aún, lee valor stale.

---

### 188. `connectWa` extremadamente complejo
**Archivo:** `frontend/src/pages/Automations.tsx` — Líneas 446-574

Múltiples callbacks anidados y async IIFEs. Manejo de errores disperso con mensajes duplicados.

---

### 189. `window.open` en vez de React Router navigation
**Archivo:** `frontend/src/pages/Landing.tsx` — Líneas 256, 377, 485, 672, 717, 835

Abre nuevos tabs en vez de usar navegación SPA. Inconsistente con patrones de SPA y puede causar problemas de sharing de sesión.

---

### 190. `WavesBg` definido dentro del componente Landing
**Archivo:** `frontend/src/pages/Landing.tsx` — Líneas 187-214

Se recrea en cada render, causando reconciliaciones innecesarias de React.

---

### 191. Resend verification email usa email del estado
**Archivo:** `frontend/src/pages/Login.tsx` — Líneas 226-238

Si el usuario cambió el campo email después del intento de login fallido, reenviará al email equivocado.

---

### 192. `RenewalModal` condicionalmente renderizado
**Archivo:** `frontend/src/pages/Login.tsx` — Líneas 406-422

Solo se renderiza cuando `subscriptionError?.accountId && subscriptionError?.email` son truthy. Si el backend devuelve error sin estos campos, el modal no se muestra.

---

### 193. Admin check redirect no limpia sesión
**Archivo:** `frontend/src/pages/AdminPanel.tsx` — Líneas 97-102

Redirige a `/login` si no es admin, pero no limpia la sesión primero.

---

### 194. Strings hardcoded en español en AdminPanel
**Archivo:** `frontend/src/pages/AdminPanel.tsx` — Línea 469

`'Mes'` y `'Año'` deberían usar keys de traducción.

---

### 195. Copyright year hardcoded
**Archivo:** `frontend/src/pages/LegalPage.tsx` — Línea 518

`© 2025 Lyrium` debería ser dinámico: `© {new Date().getFullYear()} Lyrium`.

---

### 196. Ruta legal desconocida muestra términos silenciosamente
**Archivo:** `frontend/src/pages/LegalPage.tsx` — Línea 437

Si `pathname` no está en `contentMap`, muestra términos silenciosamente. Debería mostrar 404 o error.

---

### 197. `NotFound.tsx` usa `<a href="/">` en vez de `<Link>`
**Archivo:** `frontend/src/pages/NotFound.tsx` — Línea 16

Causa full page reload en vez de navegación client-side, perdiendo estado de la aplicación.

---

### 198. `fetch` sin validación de JSON en VerifyEmail
**Archivo:** `frontend/src/pages/VerifyEmail.tsx` — Línea 33

Si la respuesta no es JSON válido, `r.json()` lanzará y el `.catch()` seteará status a 'error' silenciosamente.

---

### 199. `setView(tab.key as any)` con type assertion
**Archivo:** `frontend/src/pages/AdminPanel.tsx` — Línea 331

Debería usar tipado propio en vez de `as any`.

---

### 200. Tabla de usuarios sin loading state visual
**Archivo:** `frontend/src/pages/AdminPanel.tsx` — Líneas 464-497

El estado `loading` se setea pero nunca se renderiza un indicador visual.

---

### 201. `currency` computado en render time en ProfileModal
**Archivo:** `frontend/src/components/ProfileModal.tsx` — Línea 250

Si el país cambia mientras el modal está abierto, no se actualiza hasta reabrir.

---

### 202. Async functions en useEffect sin cleanup
**Archivo:** `frontend/src/components/ProfileModal.tsx` — Líneas 277-290

Si el modal se cierra antes de que las funciones async completen, los setters de estado se ejecutan en componente desmontado.

---

### 203. `accountId` leído de sessionStorage dentro de JSX
**Archivo:** `frontend/src/components/ProfileModal.tsx` — Línea 1379

Si la sesión cambia entre renders, el accountId incorrecto puede pasarse al payment form.

---

### 204. Múltiples funciones leen `accountId` independientemente
**Archivo:** `frontend/src/components/ProfileModal.tsx` — Líneas 367-383, 386-393, etc.

Si la sesión cambia mid-flow, comportamiento inconsistente.

---

### 205. `PLANS` array recreado en cada render
**Archivo:** `frontend/src/components/RenewalModal.tsx` — Líneas 207-224

Debería usar `useMemo` o mover fuera del componente.

---

### 206. `accountId`, `userId`, `userName` leídos en render time
**Archivo:** `frontend/src/components/SharedFilesModal.tsx` — Líneas 59-61

Si la sesión cambia mientras el modal está abierto, valores stale se usan.

---

### 207. `sendMsg` muta estado de forma no convencional
**Archivo:** `frontend/src/components/AppDemo.tsx` — Líneas 904-917

Pasa `msgs` directamente. Debería usar functional updates.

---

### 208. Enter key handler no previene default
**Archivo:** `frontend/src/components/AppDemo.tsx` — Línea 569

Puede causar form submission si está envuelto en un form.

---

### 209. `indexOf` logic puede encontrar ocurrencia incorrecta
**Archivo:** `frontend/src/components/AppDemo.tsx` — Líneas 1233-1260

Si el texto ha sido modificado, `indexOf` puede encontrar la ocurrencia equivocada o retornar -1 silenciosamente.

---

### 210. ToastViewport animation conflictante
**Archivo:** `frontend/src/components/ui/toast.tsx` — Línea 17

`data-[state=open]:slide-in-from-top-full` conflictúa con posicionamiento bottom en desktop. Los toasts deberían slide-in desde bottom en desktop.

---

### 211. `countryConfig?.clientForm` declarado pero no usado
**Archivo:** `frontend/src/pages/Clients.tsx` — Línea 349

Código muerto.

---

### 212. `STATUS_COLORS` definido dentro del componente
**Archivo:** `frontend/src/pages/Clients.tsx` — Líneas 564-569

Recreado en cada render. Debería moverse fuera o memoizarse.

---

### 213. `pauseTimer` usa `timerSeconds` directamente en closure
**Archivo:** `frontend/src/pages/Clients.tsx` — Línea 1067

Si se llama desde una closure stale, usará valor outdated. Debería usar un ref.

---

### 214. Sin loading indicator durante generación de PDF de factura
**Archivo:** `frontend/src/pages/Clients.tsx` — Líneas 1243-1279

La generación de PDF puede tomar varios segundos sin indicador visual.

---

### 215. `currencyInfo` y `cSym` recomputados en cada render
**Archivos:** `Clients.tsx` (líneas 351-352), `FiscalAdvisory.tsx` (línea 252-255)

Deberían memoizarse con `useMemo`.

---

### 216. `filteredChats` computado en cada render
**Archivo:** `frontend/src/pages/Contracts.tsx` — Líneas 334-337

Debería envolverse en `useMemo`.

---

### 217. ChatInterface genérico mostrado durante restauración de estado
**Archivo:** `frontend/src/pages/Contracts.tsx` — Líneas 740-755

Durante `isRestoringChatState && selectedContract`, se muestra `ChatInterface` genérico en vez de `ContractChatInterface`. Pierde contexto específico del contrato.

---

### 218. `createChat` puede fallar silenciosamente
**Archivo:** `frontend/src/pages/AIAssistant.tsx` — Línea 133

Si `createChat` falla silenciosamente, `loadChats` no reintenta, dejando al usuario sin chat activo.

---

### 219. Polling interval usa `activeChatId` de closure stale
**Archivos:** `AIAssistant.tsx` (líneas 84-102), `DefensePrep.tsx` (línea 146)

Si `activeChatId` cambia durante polling, el valor stale se usa.

---

### 220. Múltiples valores computados en cada render en Cases.tsx
**Archivo:** `frontend/src/pages/Cases.tsx` — Líneas 311-355

`filteredClients`, `filteredClientsCreate`, `filteredCases`, `grouped`, `renderCaseCard` — todos computados en cada render. Deberían memoizarse.

---

### 221. `handleAssign` y `handleStatus` recargan clients innecesariamente
**Archivo:** `frontend/src/pages/Cases.tsx` — Líneas 170-200

Actualizar el estado de un caso no requiere recargar clients.

---

### 222. Subaccount filter usa `s._id` como key pero `s.id || s._id` como value
**Archivo:** `frontend/src/pages/Cases.tsx` — Línea 484

Si `s.id` y `s._id` difieren, puede causar problemas.

---

### 223. `accountId` leído directamente en body del componente
**Archivo:** `frontend/src/pages/Cases.tsx` — Línea 109

Se lee en cada render. Debería estar en `useState` o `useMemo`.

---

## RESUMEN POR SEVERIDAD

| Severidad | Cantidad |
|-----------|----------|
| Crítico | 10 |
| Seguridad | 10 |
| Lógica/Funcionalidad | 95 |
| Frontend | 82 |
| Modelos/DB | 19 |
| **Total** | **225** |

## RESUMEN POR CATEGORÍA

| Categoría | Errores |
|-----------|---------|
| Crash en runtime | #1, #9, #23, #33, #39, #48, #49, #54, #105 |
| Seguridad (auth bypass, XSS, injection) | #2, #3, #11, #12, #13, #14, #15, #16, #17, #18, #19, #20 |
| Memory leaks | #31, #34, #43, #63, #113, #114, #115, #116, #143, #144, #145, #146, #172 |
| Race conditions | #6, #30, #34, #44, #97, #166 |
| Datos incorrectos | #25, #32, #50, #51, #137, #170, #171 |
| UX/UI | #24, #153, #156, #174, #182, #189, #197, #200, #210, #214 |
| Código muerto / Debug | #176, #211 |
| Archivos grandes (deberían dividirse) | Clients.tsx (~1400+ líneas), Automations.tsx (~1263+ líneas) |
