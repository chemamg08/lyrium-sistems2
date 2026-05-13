# Plan: Mostrar thinking/razonamiento en todos los chats

## Backend (ya está hecho)
- `aiService.ts` ya emite `reasoning_content` de Atlas Cloud como eventos SSE `{ thinking: "..." }`.
- `useStreamingChat.ts` ya expone `streamingReasoning` y `onDoneReasoning`.

## Archivos a tocar (6 chats)

### 1. frontend/src/pages/Clients.tsx (ya hecho - referencia)
- Hook: `streamingReasoning: lyriStreamingReasoning`
- Ref: `pendingLyriReasoningRef`
- Historial: `msg.reasoning` en burbuja assistant, renderizado con `<details>` plegable + `<Brain>` icono + caja scroll `maxHeight: 4.5em`
- Streaming: `<details open>` dentro de la burbuja de streaming
- Condición typing: `isSendingMessage && lyriIsStreaming && !lyriStreamingText`
- Condición burbuja: `lyriIsStreaming && (lyriStreamingText || lyriStreamingReasoning)`

### 2. frontend/src/pages/AIAssistant.tsx
- Hook: `const { streamingText, streamingReasoning, isStreaming, startStream, cancelStream } = useStreamingChat();`
- Necesita: `reasoning?: string` en interface `Message`
- Necesita: `pendingReasoningRef = useRef('')`
- Historial: dentro de la burbuja `bg-chat-ai`, antes de `<ReactMarkdown>`, añadir `<details>` con `msg.reasoning`
- Streaming: dentro de la burbuja `{isStreaming && (streamingText || streamingReasoning)}`, antes de `<ReactMarkdown>`, añadir `<details open>` con `streamingReasoning`
- Typing: `(isLoading || isPollingForResponse) && isStreaming && !streamingText`
- onDoneReasoning: guardar en ref
- onDone: incluir `reasoning: pendingReasoningRef.current || undefined` en el mensaje assistant
- Importar `Brain` de lucide-react (no está ahora, solo `Flag`)

### 3. frontend/src/pages/DefensePrep.tsx
- Hook: `const { streamingText: defStreamingText, streamingReasoning: defStreamingReasoning, isStreaming: defIsStreaming, ... } = useStreamingChat();`
- Necesita: `reasoning?: string` en el tipo de mensaje (usado en `messages` state)
- Necesita: `pendingDefReasoningRef = useRef('')`
- Historial: dentro de la burbuja `bg-chat-ai`, antes de `<ReactMarkdown>`, añadir `<details>` con `msg.reasoning`
- Streaming: dentro de la burbuja `{defIsStreaming && (defStreamingText || defStreamingReasoning)}`, añadir `<details open>` con `defStreamingReasoning`
- Typing 1 (puntos saltando): `(isLoading || isPollingForResponse) && defIsStreaming && !defStreamingText`
- Typing 2 (spinner): `defIsStreaming && !defStreamingText` → mantener tal cual, pero la condición del streaming ya cubre reasoning
- onDoneReasoning + onDone: igual que Clients.tsx
- Importar `Brain` de lucide-react

### 4. frontend/src/pages/FiscalAdvisory.tsx
- Hook: `const { streamingText: fiscalStreamingText, streamingReasoning: fiscalStreamingReasoning, isStreaming: fiscalIsStreaming, ... } = useStreamingChat();`
- Necesita: `reasoning?: string` en el tipo de mensaje del chat (usado en `activeChat.messages`)
- Necesita: `pendingFiscalReasoningRef = useRef('')`
- Historial: dentro de la burbuja `bg-muted`, antes de `<ReactMarkdown>`, añadir `<details>` con `msg.reasoning`
- Streaming: dentro de la burbuja `{fiscalIsStreaming && (fiscalStreamingText || fiscalStreamingReasoning)}`, añadir `<details open>` con `fiscalStreamingReasoning`
- Typing: `{isSending && fiscalIsStreaming && !fiscalStreamingText}`
- onDoneReasoning + onDone: igual patrón
- Importar `Brain` de lucide-react

### 5. frontend/src/components/ContractChatInterface.tsx
- Hook: `const { streamingText, streamingReasoning, isStreaming, isContractGeneration, startStream, cancelStream, resetContractGeneration } = useStreamingChat();`
- Necesita: `reasoning?: string` en interface `Message` del componente
- Necesita: `pendingReasoningRef = useRef('')`
- Historial: dentro de la burbuja `bg-chat-ai`, antes de `<ReactMarkdown>`, añadir `<details>` con `msg.reasoning`
- Streaming: dentro de la burbuja `{isStreaming && (streamingText || streamingReasoning) && !isContractGeneration}`, añadir `<details open>` con `streamingReasoning`
- Typing: `(isLoading || isPollingForResponse) && isStreaming && !isContractGeneration && !streamingText`
- onDoneReasoning + onDone: igual patrón
- Importar `Brain` de lucide-react

### 6. frontend/src/components/DocumentSummariesChatInterface.tsx
- Hook: `const { streamingText, streamingReasoning, isStreaming, startStream, cancelStream } = useStreamingChat();`
- Necesita: `reasoning?: string` en interface `Message`
- Necesita: `pendingReasoningRef = useRef('')`
- Historial: dentro de la burbuja `bg-chat-ai`, antes de `<ReactMarkdown>`, añadir `<details>` con `msg.reasoning`
- Streaming: dentro de la burbuja `{isStreaming && (streamingText || streamingReasoning)}`, añadir `<details open>` con `streamingReasoning`
- Typing: `(isLoading || isUploading || isPollingForResponse) && isStreaming && !streamingText`
- onDoneReasoning + onDone: igual patrón
- Importar `Brain` de lucide-react

## Patrón común en cada archivo

### Paso A: Hook
Extraer `streamingReasoning` del hook con nombre renombrado (ej: `fiscalStreamingReasoning`).

### Paso B: Ref
`const pendingReasoningRef = useRef('');` (usar nombre descriptivo del chat).

### Paso C: Tipos
Añadir `reasoning?: string` al tipo/interface de mensaje del chat.

### Paso D: onDoneReasoning + onDone
En la llamada `startStream`:
- `onDoneReasoning: (r) => { pendingReasoningRef.current = r; }`
- `onDone: (text) => { guardar msg con reasoning: pendingReasoningRef.current || undefined }`

### Paso E: Condición typing
Cambiar la condición del indicador "escribiendo/analizando" para que SOLO se muestre cuando `isStreaming` es true pero aún no hay texto de respuesta. Esto hace que durante el thinking se vea tanto el indicador como la burbuja del thinking.

### Paso F: Condición burbuja streaming
Cambiar la condición de la burbuja de streaming para que aparezca cuando haya texto O reasoning.

### Paso G: Bloque thinking en historial
Dentro del map de mensajes históricos, en mensajes `assistant`, antes del `<ReactMarkdown>`, renderizar:
```tsx
{msg.role === 'assistant' && msg.reasoning && (
  <details className="mb-2 not-prose">
    <summary className="text-xs text-muted-foreground cursor-pointer select-none flex items-center gap-1.5 list-none">
      <Brain className="h-3 w-3" />
      <span>Pensando...</span>
    </summary>
    <div className="mt-1.5 text-xs text-muted-foreground/80 font-mono whitespace-pre-wrap border-t border-border/40 pt-1.5" style={{ maxHeight: '4.5em', overflowY: 'auto' }}>
      {msg.reasoning}
    </div>
  </details>
)}
```

### Paso H: Bloque thinking en streaming
Dentro de la burbuja de streaming, antes del `<ReactMarkdown>`, renderizar igual pero con `<details open>`.

### Paso I: Import
Añadir `Brain` a la importación de `lucide-react`.

## Notas
- No se toca base de datos. El reasoning solo persiste en la sesión actual.
- `processThinkChunk` en backend se mantiene como fallback para `<think>` tags.
- El backend `streamAIResponse` ya maneja `reasoning_content` nativo de Atlas Cloud.

## Condiciones corregidas para evitar superposición

Estas son las condiciones JSX que deben quedar en cada archivo para que NO haya indicadores superpuestos durante el thinking.

| Chat | Fase previa (antes del stream) | Thinking (streaming activo, solo reasoning) | Respuesta (streaming activo, ya hay texto) |
|------|--------------------------------|---------------------------------------------|------------------------------------------|
| **Clients** | `{isSendingMessage && !lyriIsStreaming}` | `{isSendingMessage && lyriIsStreaming && !lyriStreamingText}` | `{lyriIsStreaming && (lyriStreamingText || lyriStreamingReasoning)}` |
| **AIAssistant** | `{(isLoading || isPollingForResponse) && !isStreaming}` | `{(isLoading || isPollingForResponse) && isStreaming && !streamingText}` | `{isStreaming && (streamingText || streamingReasoning)}` |
| **DefensePrep** | `{(isLoading || isPollingForResponse) && !defIsStreaming}` | `{(isLoading || isPollingForResponse) && defIsStreaming && !defStreamingText}` | `{defIsStreaming && (defStreamingText || defStreamingReasoning)}` |
| **FiscalAdvisory** | `{isSending && !fiscalIsStreaming}` | `{isSending && fiscalIsStreaming && !fiscalStreamingText}` | `{fiscalIsStreaming && (fiscalStreamingText || fiscalStreamingReasoning)}` |
| **ContractChatInterface** | `{(isLoading || isPollingForResponse) && !isStreaming}` | `{(isLoading || isPollingForResponse) && isStreaming && !isContractGeneration && !streamingText}` | `{isStreaming && (streamingText || streamingReasoning) && !isContractGeneration}` |
| **DocumentSummariesChatInterface** | `{(isLoading || isUploading || isPollingForResponse) && !isStreaming}` | `{(isLoading || isUploading || isPollingForResponse) && isStreaming && !streamingText}` | `{isStreaming && (streamingText || streamingReasoning)}` |

**Reglas:**
- En **Defensa**, el spinner (`defIsStreaming && !defStreamingText`) se elimina porque ya no tiene sentido. Si hay streaming y no hay texto, es porque hay reasoning, y eso se muestra en la burbuja.
- En todos los chats, la condición de la burbuja de streaming es `isStreaming && (streamingText || streamingReasoning)`.
- En todos los chats, la condición del indicador de carga solo se activa cuando `isStreaming` es true pero aún no hay ni texto ni reasoning.

---

## Flujo visual paso a paso por chat

### Clients (ya implementado - referencia)

**Fase previa:**
```
Lyra está escribiendo...
```

**Fase thinking:**
```
┌─────────────────────────────────────────┐
│ ▼ Pensando...                           │
│ ┌─────────────────────────────────────┐ │
│ │ Analizo la normativa...            │ │
│ │ El art. 23 del CC...               │ │  ← scroll si es largo
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

**Fase respuesta:**
```
┌─────────────────────────────────────────┐
│ ▶ Pensando...                           │
│ ├─────────────────────────────────────────┤
│ Aquí va la respuesta formateada...       │
└─────────────────────────────────────────┘
```

---

### AIAssistant

**Fase previa:**
```
● ● ●   (puntos saltando)
```

**Fase thinking:**
```
┌─────────────────────────────────────────┐
│ ▼ Pensando...                           │
│ ┌─────────────────────────────────────┐ │
│ │ Analizo la consulta...             │ │
│ │ Según la normativa española...     │ │
│ │ Considerando la jurisprudencia...  │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

**Fase respuesta:**
```
┌─────────────────────────────────────────┐
│ ▶ Pensando...                           │
│ ├─────────────────────────────────────────┤
│ Respuesta formateada con markdown...     │
└─────────────────────────────────────────┘
```

---

### DefensePrep

**Fase previa:**
```
● ● ●   (puntos saltando)
```

**Fase thinking:**
```
┌─────────────────────────────────────────┐
│ ▼ Pensando...                           │
│ ┌─────────────────────────────────────┐ │
│ │ Analizo el caso...                 │ │
│ │ El art. 53 del ET menciona...      │ │
│ │ Considerando jurisprudencia...     │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

**Fase respuesta:**
```
┌─────────────────────────────────────────┐
│ ▶ Pensando...                           │
│ ├─────────────────────────────────────────┤
│ Respuesta de defensa formateada...       │
└─────────────────────────────────────────┘
```

---

### FiscalAdvisory

**Fase previa:**
```
Analizando...   (texto con animación pulse)
```

**Fase thinking:**
```
┌─────────────────────────────────────────┐
│ ▼ Pensando...                           │
│ ┌─────────────────────────────────────┐ │
│ │ Analizo la fiscalidad...           │ │
│ │ Según la normativa tributaria...   │ │
│ │ Considerando el tipo impositivo... │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

**Fase respuesta:**
```
┌─────────────────────────────────────────┐
│ ▶ Pensando...                           │
│ ├─────────────────────────────────────────┤
│ Respuesta fiscal formateada...           │
└─────────────────────────────────────────┘
```

---

### ContractChatInterface

**Fase previa:**
```
Generando respuesta...   (texto con pulse)
```

**Fase thinking:**
```
┌─────────────────────────────────────────┐
│ ▼ Pensando...                           │
│ ┌─────────────────────────────────────┐ │
│ │ Analizo la cláusula 3...           │ │
│ │ Según el Código Civil...           │ │
│ │ Considerando jurisprudencia...     │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

**Fase respuesta:**
```
┌─────────────────────────────────────────┐
│ ▶ Pensando...                           │
│ ├─────────────────────────────────────────┤
│ Respuesta sobre contratos...             │
└─────────────────────────────────────────┘
```

**Fase contrato (si se detecta):**
```
Generando contrato... ████████░░ 80%
```
→ Todo lo anterior desaparece y se muestra la barra de progreso. El thinking no se ve en esta fase.

---

### DocumentSummariesChatInterface

**Fase previa:**
```
Generando respuesta...   (texto con pulse)
```

**Fase thinking:**
```
┌─────────────────────────────────────────┐
│ ▼ Pensando...                           │
│ ┌─────────────────────────────────────┐ │
│ │ Analizo el documento...            │ │
│ │ El contenido menciona...           │ │
│ │ Resumiendo los puntos clave...     │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

**Fase respuesta:**
```
┌─────────────────────────────────────────┐
│ ▶ Pensando...                           │
│ ├─────────────────────────────────────────┤
│ Resumen del documento...                 │
└─────────────────────────────────────────┘
```

---

## Edge cases y notas técnicas

### 1. Limpieza del ref al inicio del stream
El `pendingReasoningRef` debe limpiarse al **inicio** de cada `startStream`, no solo al final en `onDone`. Si el stream se aborta o falla antes de que `onDone` se ejecute, el ref podría contener reasoning de un mensaje anterior. La forma correcta es:
- Limpiar el ref justo antes de llamar `startStream()` (o al inicio de `sendMessage()`).
- Guardar el valor en `onDoneReasoning`.
- Incluirlo en el mensaje en `onDone`.
- Limpiar el ref dentro de `onDone` después de guardar.

### 2. `onDoneReasoning` no se llama si el stream corta sin `done`
En `useStreamingChat.ts`, si el stream termina sin recibir `parsed.done` (líneas 150-155), `opts.onDone?.(accumulated)` se llama, pero `opts.onDoneReasoning` **no**. Esto es un edge case aceptable: el mensaje se guardará sin reasoning.

### 3. Estructuras de mensaje diferentes por chat
Cada chat tiene una estructura de mensaje ligeramente distinta. El bloque `<details>` debe insertarse en la posición correcta:
- **Clients, AIAssistant, DefensePrep, FiscalAdvisory**: dentro de la burbuja coloreada, antes de `<ReactMarkdown>`.
- **ContractChatInterface, DocumentSummariesChatInterface**: dentro de la burbuja `bg-chat-ai`, antes de `<ReactMarkdown>`.
- **FiscalAdvisory** usa `bg-muted` en vez de `bg-chat-ai`.

### 4. Flags (marcadores) en los mensajes
Algunos mensajes tienen botón de flag (`<Flag>`) en la esquina superior derecha. El bloque `<details>` debe ir **antes** del `<ReactMarkdown>`, no interferir con el botón de flag.

### 5. `isContractGeneration` en Contratos
Este modo debe seguir funcionando igual. La condición `!isContractGeneration` debe mantenerse en todas las condiciones de streaming de Contratos.

### 6. No se toca base de datos
El reasoning se pierde al recargar la página. Para persistirlo, habría que modificar el schema de cada modelo (Chat, DefenseChat, FiscalChat, etc.), cosa que NO hacemos ahora.
