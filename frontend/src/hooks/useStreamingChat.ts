import { useRef, useState, useCallback } from 'react';
import { authFetch } from '../lib/authFetch';

const API = import.meta.env.VITE_API_URL;

interface StreamOptions {
  /** Full URL path after /api, e.g. "/assistant/chat/message/stream" */
  endpoint: string;
  /** POST body (JSON-serializable) */
  body: Record<string, unknown>;
  /** Optional headers to merge */
  headers?: Record<string, string>;
  /** Called once with the final accumulated text when stream finishes */
  onDone?: (fullText: string) => void;
}

/**
 * Hook that reads a Server-Sent-Events (SSE) POST response token-by-token.
 *
 * Returns:
 *  - `streamingText`  – accumulating string, triggers re-render per chunk
 *  - `isStreaming`     – whether a stream is currently active
 *  - `startStream`     – function to start a new stream
 *  - `cancelStream`    – abort ongoing stream
 */
export function useStreamingChat() {
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isContractGeneration, setIsContractGeneration] = useState(false);
  const contractDetectedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const resetContractGeneration = useCallback(() => {
    setIsContractGeneration(false);
    contractDetectedRef.current = false;
  }, []);

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
    setIsContractGeneration(false);
    contractDetectedRef.current = false;
  }, []);

  const startStream = useCallback(async (opts: StreamOptions) => {
    // Abort any previous stream
    abortRef.current?.abort();

    const controller = new AbortController();
    abortRef.current = controller;

    setStreamingText('');
    setIsStreaming(true);
    setIsSaving(false);
    setIsContractGeneration(false);
    contractDetectedRef.current = false;

    let accumulated = '';
    let ragEnhanced = false;

    try {
      const res = await authFetch(`${API}${opts.endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...opts.headers,
        },
        body: JSON.stringify(opts.body),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Stream request failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // keep incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;

          const jsonStr = trimmed.slice(6); // remove "data: "
          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.done) {
              // Stream complete
              if (ragEnhanced) accumulated += '\n<!-- rag-enhanced -->';
              setIsStreaming(false);
              setIsSaving(false);
              opts.onDone?.(accumulated);
              return accumulated;
            }
            if (parsed.ragEnhanced) {
              ragEnhanced = true;
            }
            if (parsed.saving) {
              setIsSaving(true);
            }
            if (parsed.token) {
              accumulated += parsed.token;
              // Si la IA está generando un contrato, activar modo generación
              const contractIdx = accumulated.indexOf('[GENERAR_CONTRATO_COMPLETO]');
              if (contractIdx !== -1) {
                if (!contractDetectedRef.current) {
                  contractDetectedRef.current = true;
                  setIsContractGeneration(true);
                  setStreamingText('');
                }
              } else {
                let displayText = accumulated;
                // Strip [OFFER_PDF] marker from display (handled by component)
                displayText = displayText.replace(/\[OFFER_PDF\]/g, '');
                setStreamingText(displayText);
              }
            }
            if (parsed.error) {
              console.error('Stream error from server:', parsed.error);
            }
          } catch {
            // Not valid JSON, skip
          }
        }
      }

      // If we get here without a done signal, still finish
      if (ragEnhanced) accumulated += '\n<!-- rag-enhanced -->';
      setIsStreaming(false);
      setIsSaving(false);
      if (accumulated) opts.onDone?.(accumulated);
      return accumulated;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // Intentional cancellation
      } else {
        console.error('Stream error:', err);
      }
      setIsStreaming(false);
      setIsSaving(false);
      if (accumulated) opts.onDone?.(accumulated);
      return accumulated;
    }
  }, []);

  return { streamingText, isStreaming, isSaving, isContractGeneration, startStream, cancelStream, resetContractGeneration };
}
