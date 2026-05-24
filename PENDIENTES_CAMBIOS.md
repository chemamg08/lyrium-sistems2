# Cambios Pendientes

## Restriccion General

- No ejecutar cambios de codigo hasta recibir permiso explicito del usuario.

## Cambio 1. Sustituir modelo de IA de texto por DeepSeek

### Objetivo

- Dejar de usar Qwen como modelo principal de IA textual.
- Pasar a usar `deepseek-ai/deepseek-v4-pro`.
- Mantener intactos los valores actuales de `max_tokens` y `temperature` en cada modulo.

### Alcance

- Cambiar la configuracion del modelo principal de texto.
- Revisar todos los clientes y llamadas de IA textual que actualmente dependan del modelo global.
- Mantener el comportamiento funcional actual de los chats.

### Archivos a tocar

- `backend/src/config/aiModel.ts`
- `backend/src/services/aiService.ts`
- `backend/src/controllers/contractsChatController.ts`
- `backend/src/controllers/documentSummariesController.ts`
- `backend/src/services/specialtiesService.ts`
- `backend/src/services/legalKnowledgeService.ts`
- `backend/src/services/customerAutomationEngine.ts`
- `backend/src/services/emailProcessorService.ts`
- `backend/src/services/whatsappService.ts`
- `backend/src/services/automationMessages.ts`

### Condiciones confirmadas

- El usuario quiere usar `deepseek-ai/deepseek-v4-pro`.
- No hay que tocar `max_tokens`.
- No hay que tocar `temperature`.
- La API key ya esta resuelta por el usuario.

### Validacion

- Confirmar que las llamadas de IA textual ya no usen Qwen como modelo principal.
- Confirmar que los modulos de asistente, contratos, defensa, resumentes, fiscal y utilidades auxiliares siguen respondiendo correctamente.

## Cambio 2. Mantener OpenAI para embeddings de Mejorar IA

### Objetivo

- Conservar `OpenAI` para la generacion de embeddings de `Mejorar IA`.
- No migrar embeddings a DeepSeek.

### Alcance

- Verificar que el flujo RAG siga usando `text-embedding-3-large`.
- No alterar la logica de fragmentacion, almacenamiento ni recuperacion.

### Archivos a tocar

- `backend/src/services/ragService.ts`

### Condiciones confirmadas

- El usuario quiere mantener embeddings en OpenAI.

### Validacion

- Confirmar que la subida y procesamiento de archivos sigue funcionando.
- Confirmar que el RAG sigue recuperando contexto a partir de embeddings OpenAI.

## Cambio 3. Eliminar Qwen-VL

### Objetivo

- Quitar el uso de `Qwen-VL` del sistema.

### Alcance

- Eliminar dependencias funcionales del servicio de vision basado en Qwen-VL.
- Retirar imports o referencias que queden obsoletas.
- No sustituirlo por otro modelo de vision.

### Archivos a tocar

- `backend/src/services/qwenVisionService.ts`
- Cualquier archivo que lo importe o lo use realmente

### Condiciones confirmadas

- El usuario ha indicado expresamente que `Qwen-VL` debe quitarse.
- No hay que reemplazarlo por otro modelo.

### Validacion

- Confirmar que no quedan rutas ni servicios activos dependiendo de Qwen-VL.
- Confirmar que la eliminacion no rompe compilacion ni imports.

## Cambio 4. Cambiar texto del navbar de landing

### Objetivo

- Cambiar el texto visible `Precios` por `Inversion` en el navbar de la landing.

### Alcance

- Cambiar solo el texto visible.
- No cambiar estructura, scroll, ancla ni estetica salvo que sea estrictamente necesario.

### Archivos a tocar

- `frontend/src/pages/Landing.tsx`
- `frontend/src/i18n/es.json`

### Condiciones confirmadas

- El usuario solo quiere ese cambio de texto en el navbar.

### Validacion

- Confirmar que el navbar muestra `Inversion`.
- Confirmar que el click sigue llevando a la misma seccion de la landing.

## Cambio 5. Mejorar PDF final de Contratos

### Objetivo

- Conseguir que el PDF generado en el modulo de `Contratos` se vea limpio, ordenado y profesional.

### Alcance

- Mejorar maquetacion, jerarquia visual, espaciado, consistencia tipografica y presentacion general.
- Mantener el flujo actual de generacion del contrato.
- No romper descarga de PDF ni DOCX.

### Archivos a tocar

- `backend/src/services/contractPdfService.ts`
- `backend/src/controllers/contractsChatController.ts`
- Solo si hace falta, `frontend/src/components/ContractChatInterface.tsx`

### Condiciones confirmadas

- El usuario no quiere cambiar el flujo general.
- El objetivo es mejorar el resultado visual final.

### Validacion

- Generar un contrato de prueba.
- Confirmar que el PDF se ve mas limpio, ordenado y profesional.
- Confirmar que sigue funcionando la descarga del PDF.
- Confirmar que sigue funcionando la descarga del DOCX si ya existia.

## Cambio 6. Mejorar PDF de Preparacion de defensa

### Objetivo

- Conseguir que el PDF exportado desde `Preparacion de defensa` se vea mas limpio, ordenado y profesional.

### Alcance

- Mejorar estructura visual del PDF.
- Mantener el flujo actual de exportacion y descarga.
- No romper el guardado de estrategias ni la exportacion al expediente del cliente.

### Archivos a tocar

- `backend/src/services/pdfService.ts`
- `backend/src/controllers/defenseChatController.ts`
- Solo si hace falta, `frontend/src/pages/DefensePrep.tsx`

### Condiciones confirmadas

- El usuario quiere mejorar la limpieza y el orden del PDF.
- No ha pedido cambiar el flujo del modulo.

### Validacion

- Exportar un PDF de defensa de prueba.
- Confirmar legibilidad, orden, separacion de secciones y mejor presentacion general.
- Confirmar que sigue funcionando la descarga.
- Confirmar que sigue funcionando la exportacion a cliente si aplica.

## Cambio 7. Cambiar precio del plan Individual

### Objetivo

- Cambiar el plan `Individual` de `60/600` a `50/500`.

### Alcance

- Actualizar frontend y backend.
- Ajustar cualquier logica de calculo que dependa de esos importes.

### Archivos a tocar

- `frontend/src/pages/Landing.tsx`
- `backend/src/subscriptions.ts`
- `frontend/src/components/ProfileModal.tsx`
- `frontend/src/components/RenewalModal.tsx`
- Cualquier otro punto visible o logico que use `60` o `600` como precio del plan individual

### Condiciones confirmadas

- El usuario quiere que el cambio sea real, no solo visual.

### Validacion

- Confirmar que el plan individual muestra `50` mensual y `500` anual donde corresponda.
- Confirmar que la logica interna usa esos importes.

## Cambio 8. Cambiar precio del plan Junior

### Objetivo

- Cambiar el plan `Junior` de `45/480` a `40/420`.

### Alcance

- Actualizar frontend y backend.
- Ajustar textos, descuentos, importes finales y referencias internas.

### Archivos a tocar

- `frontend/src/pages/Landing.tsx`
- `backend/src/subscriptions.ts`
- `frontend/src/i18n/es.json`
- `frontend/src/components/ProfileModal.tsx`
- `frontend/src/components/RenewalModal.tsx`
- Cualquier otro punto visible o logico que use `45` o `480` como precio junior

### Condiciones confirmadas

- El usuario ha confirmado que el anual junior debe ser `420`.

### Validacion

- Confirmar que el plan junior muestra `40` mensual y `420` anual donde corresponda.
- Confirmar que la logica de descuento junior usa esos importes.

## Cambio 9. Ajustar textos y logica de precios para consistencia completa

### Objetivo

- Evitar inconsistencias entre precios mostrados, calculos internos y mensajes al usuario.

### Alcance

- Revisar frontend y backend en todos los puntos donde aparezcan precios del plan individual y junior.
- Ajustar mensajes visibles, comparativas, precios tachados, textos de descuento y referencias internas.

### Archivos a tocar

- `frontend/src/pages/Landing.tsx`
- `frontend/src/i18n/es.json`
- `frontend/src/i18n/en.json`
- Otros archivos `frontend/src/i18n/*.json` si el cambio debe mantenerse coherente en varios idiomas
- `backend/src/subscriptions.ts`
- `frontend/src/components/ProfileModal.tsx`
- `frontend/src/components/RenewalModal.tsx`

### Condiciones confirmadas

- Debe quedar consistente en frontend y backend.

### Validacion

- Confirmar que no quedan referencias antiguas a `60/600` ni `45/480` donde ya no correspondan.
- Confirmar coherencia entre landing, modales y backend.

## Cambio 10. Mantener los mismos price_id de Stripe

### Objetivo

- Aplicar los cambios de precio manteniendo los `price_id` existentes.

### Alcance

- No introducir nuevos `price_id`.
- Ajustar solo la logica y los importes internos que dependan de esos planes.

### Archivos a tocar

- `backend/src/subscriptions.ts`
- Cualquier otro archivo backend que derive comportamiento a partir de importes de plan

### Condiciones confirmadas

- El usuario ha indicado expresamente que se usan los mismos `price_id`.

### Validacion

- Confirmar que no se cambian identificadores de Stripe.
- Confirmar que la app sigue apuntando a los mismos `price_id`.
