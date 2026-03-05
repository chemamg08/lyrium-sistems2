import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/use-toast";
import { Send, Download, Loader2, StopCircle, Upload, Paperclip, X, FileText } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useStreamingChat } from "@/hooks/useStreamingChat";
import { authFetch } from '../lib/authFetch';

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  metadata?: {
    type?: "text" | "contract_generated";
    generatedContractId?: string;
    fileName?: string;
  };
}

interface ContractChatInterfaceProps {
  contractBaseId?: string | null; // Ahora es opcional
  contractBaseName?: string;
  existingChatId?: string | null;
  onChatCreated?: (chatId: string) => void;
  onMessagesChanged?: () => void;
  onClose?: () => void;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const ContractChatInterface = ({
  contractBaseId,
  contractBaseName,
  existingChatId,
  onChatCreated,
  onMessagesChanged,
}: ContractChatInterfaceProps) => {
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isTemporary, setIsTemporary] = useState(false);
  const [hasUploadedPdf, setHasUploadedPdf] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();
  const { toast } = useToast();
  const { streamingText, isStreaming, startStream, cancelStream } = useStreamingChat();

  // Crear o cargar chat al montar
  useEffect(() => {
    if (existingChatId) {
      loadExistingChat(existingChatId);
    } else if (contractBaseId) {
      createChat();
    } else {
      // Sin contractBaseId ni chatId = modo temporal
      createTemporaryChat();
    }
  }, [existingChatId, contractBaseId]);

  const loadExistingChat = async (chatId: string) => {
    try {
      const response = await authFetch(`${API_URL}/contracts/chat/${chatId}`);

      if (response.ok) {
        const data = await response.json();
        setChatId(data.id);
        setMessages(data.messages || []);
        if (onChatCreated) {
          onChatCreated(data.id);
        }
      } else {
        console.error("Error cargando chat, creando uno nuevo");
        createChat();
      }
    } catch (error) {
      console.error("Error:", error);
      createChat();
    } finally {
      setIsInitializing(false);
    }
  };

  const createChat = async () => {
    try {
      const response = await authFetch(`${API_URL}/contracts/chat/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractBaseId }),
      });

      if (response.ok) {
        const data = await response.json();
        setChatId(data.id);
        setMessages(data.messages || []);
        setIsTemporary(false);
        if (onChatCreated) {
          onChatCreated(data.id);
        }
      } else {
        console.error("Error creando chat");
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsInitializing(false);
    }
  };

  const createTemporaryChat = async () => {
    try {
      const accountId = sessionStorage.getItem('accountId');
      if (!accountId) {
        console.error("No accountId found");
        setIsInitializing(false);
        return;
      }

      const response = await authFetch(`${API_URL}/contracts/chat/create-temporary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });

      if (response.ok) {
        const data = await response.json();
        setChatId(data.id);
        setMessages(data.messages || []);
        setIsTemporary(true);
        if (onChatCreated) {
          onChatCreated(data.id);
        }
      } else {
        console.error("Error creando chat temporal");
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsInitializing(false);
    }
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !chatId) return;

    const file = files[0];
    if (file.type !== 'application/pdf') {
      toast({ title: t('contractChat.pdfOnly'), variant: 'destructive' });
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await authFetch(`${API_URL}/contracts/chat/${chatId}/upload-temporary`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        setHasUploadedPdf(true);
        toast({ title: t('contractChat.pdfUploaded', { name: data.fileName }) });
      } else {
        const error = await response.json();
        toast({ title: error.error || t('contractChat.errorUploadPdf'), variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error uploading PDF:', error);
      toast({ title: t('contractChat.errorUploadPdf'), variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    handleFileUpload(e.dataTransfer.files);
  };

  const refreshChat = async (targetChatId: string) => {
    const response = await authFetch(`${API_URL}/contracts/chat/${targetChatId}`);
    if (!response.ok) return;
    const data = await response.json();
    setChatId(data.id);
    setMessages(data.messages || []);
    if (onMessagesChanged) {
      onMessagesChanged();
    }
  };

  // Polling: espera hasta que el backend haya guardado el mensaje con contract_generated
  const pollUntilContractReady = async (targetChatId: string, maxAttempts = 12, intervalMs = 800) => {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, intervalMs));
      const response = await authFetch(`${API_URL}/contracts/chat/${targetChatId}`);
      if (!response.ok) continue;
      const data = await response.json();
      const hasContract = (data.messages || []).some(
        (m: any) => m.metadata?.type === 'contract_generated'
      );
      if (hasContract) {
        setChatId(data.id);
        setMessages(data.messages || []);
        if (onMessagesChanged) onMessagesChanged();
        return;
      }
    }
    // Si tras todos los intentos no apareció, recargar igualmente
    await refreshChat(targetChatId);
  };

  const cancelJob = () => {
    cancelStream();
    setIsLoading(false);
  };

  const send = async () => {
    if (!input.trim() || !chatId || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setIsLoading(true);

    // Agregar mensaje del usuario inmediatamente
    const tempUserMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: userMessage,
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      await startStream({
        endpoint: "/contracts/chat/message/stream",
        body: {
          chatId,
          content: userMessage,
        },
        onDone: async (fullText) => {
          if (fullText.includes('[GENERAR_CONTRATO_COMPLETO]')) {
            // El backend genera el PDF tras cerrar el stream — hacer polling hasta que esté listo
            await pollUntilContractReady(chatId!);
          } else {
            setMessages((prev) => [
              ...prev,
              { id: `ai-${Date.now()}`, role: "assistant", content: fullText },
            ]);
          }
          setIsLoading(false);
          if (onMessagesChanged) onMessagesChanged();
        },
      });
    } catch (error) {
      console.error("Error:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: t('contractChat.connectionError'),
        },
      ]);
      setIsLoading(false);
    }
  };

  const downloadContract = async (generatedContractId: string) => {
    try {
      const res = await authFetch(`${API_URL}/contracts/chat/generated/${generatedContractId}/download`);
      if (!res.ok) throw new Error('Error');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'contrato.pdf';
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      // error downloading
    }
  };

  if (isInitializing) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground mt-4">Preparando el chat...</p>
      </div>
    );
  }

  return (
    <div 
      className="flex flex-col h-full relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="border-b border-border p-4 md:p-6">
        <h2 className="text-lg md:text-xl font-semibold text-foreground">
          {isTemporary ? t('contractChat.analysisTitle') : t('contractChat.generationTitle')}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {isTemporary ? (
            hasUploadedPdf ? (
              t('contractChat.analysedDesc')
            ) : (
              t('contractChat.uploadPdf')
            )
          ) : (
            <>{t('contractChat.basedOn')}: <span className="font-medium">{contractBaseName}</span></>
          )}
        </p>
      </div>

      {/* Drag & Drop Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-primary/10 backdrop-blur-sm flex items-center justify-center border-4 border-dashed border-primary rounded-lg m-4">
          <div className="text-center">
            <Upload className="h-16 w-16 text-primary mx-auto mb-4" />
            <p className="text-lg font-semibold text-foreground">{t('contractChat.dropPdf')}</p>
            <p className="text-sm text-muted-foreground mt-2">{t('contractChat.dropPdfSub')}</p>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        {messages.length === 0 && !isTemporary && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md">
              <p className="text-muted-foreground text-sm">
                {t('contractChat.welcomeMsgPre')} <span className="font-medium">{contractBaseName}</span> {t('contractChat.welcomeMsgPost')}
              </p>
              <p className="text-muted-foreground/60 text-xs mt-3">
                {t('contractChat.welcomeMsgSub')}
              </p>
            </div>
          </div>
        )}
        {messages.length === 0 && isTemporary && !hasUploadedPdf && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md">
              <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground text-sm">
                {t('contractChat.dragInstruction')}
              </p>
              <p className="text-muted-foreground/60 text-xs mt-3">
                {t('contractChat.dragInstructionSub')}
              </p>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={isUploading}
                className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2 mx-auto"
              >
                <Paperclip className="h-4 w-4" />
                {isUploading ? t('contractChat.uploading') : t('contractChat.selectPdf')}
              </button>
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div className="max-w-[85%] md:max-w-[70%]">
              <div
                className={`rounded-lg px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-chat-user text-chat-user-foreground"
                    : "bg-chat-ai text-chat-ai-foreground prose prose-sm dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1"
                }`}
              >
                {msg.role === "assistant" ? (
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                ) : (
                  msg.content
                )}
              </div>

              {/* Tarjeta de descarga si es un contrato generado */}
              {msg.role === "assistant" &&
                msg.metadata?.type === "contract_generated" &&
                msg.metadata.generatedContractId && (
                  <div className="mt-3 bg-card border border-border rounded-lg p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          Contrato Generado
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {msg.metadata.fileName}
                        </p>
                      </div>
                      <button
                        onClick={() =>
                          downloadContract(msg.metadata!.generatedContractId!)
                        }
                        className="flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-xs font-medium hover:opacity-90 transition-opacity"
                      >
                        <Download className="h-3.5 w-3.5" />
                        {t('contractChat.downloadPdf')}
                      </button>
                    </div>
                  </div>
                )}
            </div>
          </div>
        ))}
        {isLoading && !isStreaming && (
          <div className="flex justify-start">
            <div className="bg-chat-ai text-chat-ai-foreground rounded-lg px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          </div>
        )}
        {isStreaming && streamingText && (
          <div className="flex justify-start">
            <div className="max-w-[85%] md:max-w-[70%] rounded-lg px-4 py-3 text-sm leading-relaxed prose prose-sm dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1 bg-chat-ai text-chat-ai-foreground">
              <ReactMarkdown>{streamingText}</ReactMarkdown>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border p-4">
        {/* Tarjeta PDF subido (en modo no temporal) */}
        {hasUploadedPdf && !isTemporary && (
          <div className="flex items-center gap-2 mb-2">
            <div className="flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-md px-3 py-1.5 text-xs text-primary">
              <FileText className="h-3.5 w-3.5 shrink-0" />
              <span className="font-medium">PDF adjunto como base del contrato</span>
              <button onClick={() => setHasUploadedPdf(false)} className="ml-1 hover:text-destructive transition-colors">
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2">
          {(isTemporary || hasUploadedPdf) && (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={isUploading}
              className="p-2.5 rounded-md bg-accent hover:bg-accent/80 transition-colors disabled:opacity-50"
              title="Subir PDF"
            >
              <Paperclip className="h-4 w-4 text-foreground" />
            </button>
          )}
          <textarea
            value={input}
            rows={1}
            style={{ height: input === '' ? '40px' : undefined }}
            onChange={(e) => {
              setInput(e.target.value);
              if (e.target.value) {
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
              }
            }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!isLoading) send(); } }}
            placeholder={isTemporary ? "Pregunta sobre el contrato..." : "Describe los cambios que necesitas..."}
            disabled={isLoading || (isTemporary && !hasUploadedPdf)}
            className="flex-1 bg-accent/50 border border-border rounded-md px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 resize-none overflow-hidden"
          />
          <button
            onClick={isLoading ? cancelJob : send}
            disabled={!isLoading && (!input.trim() || (isTemporary && !hasUploadedPdf))}
            className="p-2.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {isLoading ? <StopCircle className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
      
      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept=".pdf"
        onChange={(e) => handleFileUpload(e.target.files)}
        className="hidden"
      />
    </div>
  );
};

export default ContractChatInterface;
