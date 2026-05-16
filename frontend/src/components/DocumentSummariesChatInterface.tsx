import { useState, useRef, useEffect } from "react";
import { Send, Paperclip, Loader2, X, FileText, Trash2, StopCircle, Brain, FolderOpen, Flag } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/use-toast";
import { useStreamingChat } from "@/hooks/useStreamingChat";
import { authFetch } from '../lib/authFetch';
import ThinkingDetails from "@/components/ThinkingDetails";

interface UploadedFile {
  id: string;
  originalName: string;
  fileName: string;
  filePath: string;
  uploadedAt: string;
  extractedText: string;
  summary: string;
  size: number;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  metadata?: {
    type?: "text" | "files_uploaded";
    uploadedFiles?: UploadedFile[];
  };
  flags?: Array<{ id: string }>;
}

interface DocumentSummariesChatInterfaceProps {
  existingChatId?: string | null;
  onChatCreated?: (chatId: string) => void;
  onMessagesChanged?: () => void;
}

interface StagedUploadFile {
  path: string;
  originalName: string;
  fileName: string;
  size: number;
}

const API_URL = import.meta.env.VITE_API_URL;

const DocumentSummariesChatInterface = ({
  existingChatId,
  onChatCreated,
  onMessagesChanged,
}: DocumentSummariesChatInterfaceProps) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [ragEnabled, setRagEnabled] = useState(false);
  const [hasImproveAI, setHasImproveAI] = useState(false);
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const [isPollingForResponse, setIsPollingForResponse] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const chatIdRef = useRef<string | null>(null);
  const streamPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { streamingText, streamingReasoning, isStreaming, startStream, cancelStream } = useStreamingChat();
  const pendingReasoningRef = useRef('');
  const [showFlagPanel, setShowFlagPanel] = useState(false);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);

  // Mantener ref sincronizado
  useEffect(() => { chatIdRef.current = chatId; }, [chatId]);

  // Limpiar polling al desmontar
  useEffect(() => {
    return () => { if (streamPollingRef.current) { clearInterval(streamPollingRef.current); streamPollingRef.current = null; } };
  }, []);

  const getPendingJobKey = (id: string) => `summaryPendingJob_${id}`;

  useEffect(() => {
    if (existingChatId) {
      loadExistingChat(existingChatId);
    } else {
      // No crear chat automáticamente, solo marcar como listo
      setIsInitializing(false);
    }
    const accId = sessionStorage.getItem('accountId');
    if (accId) {
      const cached = sessionStorage.getItem('hasImproveAI');
      if (cached !== null) {
        setHasImproveAI(cached === 'true');
      } else {
        authFetch(`${API_URL}/improve-ai/has-files?accountId=${accId}`)
          .then(r => r.json()).then(d => { setHasImproveAI(d.hasFiles); sessionStorage.setItem('hasImproveAI', String(d.hasFiles)); }).catch(() => {});
      }
    }
  }, [existingChatId]);

  useEffect(() => {
    if (isInitializing) return;
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isInitializing, streamingText]);

  const loadExistingChat = async (chatId: string) => {
    try {
      const response = await authFetch(`${API_URL}/summaries/chat/${chatId}`);

      if (response.ok) {
        const data = await response.json();
        setChatId(data.id);
        setMessages(data.messages || []);
        setUploadedFiles(data.uploadedFiles || []);
        if (onChatCreated) {
          onChatCreated(data.id);
        }
        // Restaurar job pendiente si el componente fue remontado durante el procesamiento
        const savedJobId = sessionStorage.getItem(getPendingJobKey(data.id));
        if (savedJobId) {
          setPendingJobId(savedJobId);
          setIsLoading(true);
        }

        // Detectar si hay un stream SSE en curso (componente fue remontado)
        const streamingFlag = sessionStorage.getItem(`streaming_summaries_${data.id}`);
        if (streamingFlag) {
          const expectedMsgCount = parseInt(streamingFlag, 10);
          setIsPollingForResponse(true);
          setIsLoading(true);
          if (streamPollingRef.current) clearInterval(streamPollingRef.current);
          streamPollingRef.current = setInterval(async () => {
            try {
              const res = await authFetch(`${API_URL}/summaries/chat/${data.id}`);
              if (res.ok) {
                const chatData = await res.json();
                const msgs: Message[] = chatData.messages || [];
                if (msgs.length > expectedMsgCount) {
                  setMessages(msgs);
                  setUploadedFiles(chatData.uploadedFiles || []);
                  setIsPollingForResponse(false);
                  setIsLoading(false);
                  sessionStorage.removeItem(`streaming_summaries_${data.id}`);
                  if (streamPollingRef.current) { clearInterval(streamPollingRef.current); streamPollingRef.current = null; }
                  if (onMessagesChanged) onMessagesChanged();
                }
              }
            } catch { /* ignore */ }
          }, 2000);
        }
      } else {
        // Chat not found (404) or access denied - clean up stale reference
        sessionStorage.removeItem('currentSummaryChat');
        if (onChatCreated) onChatCreated('');
        setChatId(null);
        setIsInitializing(false);
      }
    } catch (error) {
      console.error("Error:", error);
      setIsInitializing(false);
    } finally {
      setIsInitializing(false);
    }
  };

  const refreshChatData = async (targetChatId: string) => {
    const response = await authFetch(`${API_URL}/summaries/chat/${targetChatId}`);
    if (!response.ok) return;

    const data = await response.json();
    setChatId(data.id);
    setMessages(data.messages || []);
    setUploadedFiles(data.uploadedFiles || []);

    if (onMessagesChanged) {
      onMessagesChanged();
    }
  };

  useEffect(() => {
    if (!pendingJobId || !chatId) return;

    let canceled = false;
    const poll = async () => {
      try {
        const response = await authFetch(`${API_URL}/jobs/${pendingJobId}`);
        
        if (response.status === 404) {
          // Job no encontrado, detener polling
          setPendingJobId(null);
          sessionStorage.removeItem(getPendingJobKey(chatId));
          setIsLoading(false);
          toast({ title: t('docChat.jobNotFound'), variant: 'destructive' });
          return;
        }
        
        if (!response.ok) return;

        const job = await response.json();
        if (canceled) return;

        if (job.status === 'done') {
          setPendingJobId(null);
          sessionStorage.removeItem(getPendingJobKey(chatId));
          setIsLoading(false);
          await refreshChatData(chatId);
        } else if (job.status === 'failed' || job.status === 'canceled') {
          setPendingJobId(null);
          sessionStorage.removeItem(getPendingJobKey(chatId));
          setIsLoading(false);
          toast({ title: job.error || t('docChat.errorProcessMsg'), variant: 'destructive' });
        }
      } catch (error) {
        console.error('Error consultando job de resúmenes:', error);
      }
    };

    void poll();
    const interval = setInterval(() => {
      void poll();
    }, 1500);

    return () => {
      canceled = true;
      clearInterval(interval);
    };
  }, [pendingJobId, chatId]);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    // Validar límite de archivos
    const currentFilesCount = uploadedFiles.length + pendingFiles.length;
    const newFilesCount = files.length;
    
    if (currentFilesCount + newFilesCount > 4) {
      toast({ title: t('docChat.maxFilesAlert', { count: currentFilesCount }), variant: 'destructive' });
      return;
    }

    // Validar que sean PDFs
    const pdfFiles = Array.from(files).filter(f => f.type === 'application/pdf');
    if (pdfFiles.length !== files.length) {
      toast({ title: t('docChat.pdfOnly'), variant: 'destructive' });
      return;
    }

    // Validar tamaño (10MB)
    const oversized = pdfFiles.filter(f => f.size > 10 * 1024 * 1024);
    if (oversized.length > 0) {
      toast({ title: t('docChat.filesTooLarge'), variant: 'destructive' });
      return;
    }

    // Agregar archivos a pendientes (no subir todavía)
    setPendingFiles(prev => [...prev, ...pdfFiles]);
    
    // Limpiar el input file
    if (fileRef.current) {
      fileRef.current.value = '';
    }
  };

  const removePendingFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!chatId || !confirm(t('docChat.deleteFileConfirm'))) return;

    try {
      const response = await authFetch(`${API_URL}/summaries/chat/${chatId}/file/${fileId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
        
        // Actualizar mensajes que contengan este archivo
        setMessages(prev => prev.map(msg => {
          if (msg.metadata?.uploadedFiles) {
            return {
              ...msg,
              metadata: {
                ...msg.metadata,
                uploadedFiles: msg.metadata.uploadedFiles.filter(f => f.id !== fileId)
              }
            };
          }
          return msg;
        }));

        if (onMessagesChanged) {
          onMessagesChanged();
        }
      }
    } catch (error) {
      console.error("Error:", error);
      toast({ title: t('docChat.errorDeleteFile'), variant: 'destructive' });
    }
  };

  const cancelJob = () => {
    cancelStream();
    setIsLoading(false);
  };

  const toggleFlag = async (messageId: string) => {
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return;
    const isFlagged = msg.flags && msg.flags.length > 0;
    const currentChatId = chatId || '';
    try {
      if (isFlagged) {
        const flagId = msg.flags[msg.flags.length - 1].id;
        const res = await authFetch(`${import.meta.env.VITE_API_URL}/flags/summaries/${currentChatId}/messages/${messageId}/flags/${flagId}`, { method: 'DELETE' });
        if (res.ok) {
          const data = await res.json();
          setMessages(prev => prev.map(m => m.id === messageId ? { ...m, flags: data.flags } : m));
        }
      } else {
        const res = await authFetch(`${import.meta.env.VITE_API_URL}/flags/summaries/${currentChatId}/messages/${messageId}`, { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          setMessages(prev => prev.map(m => m.id === messageId ? { ...m, flags: data.flags } : m));
        }
      }
    } catch (err) { console.error(err); }
  };

  const scrollToMessage = (messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMsgId(messageId);
      setTimeout(() => setHighlightedMsgId(null), 2000);
      setShowFlagPanel(false);
    }
  };

  const send = async () => {
    // Validar que haya algo que enviar
    if ((!input.trim() && pendingFiles.length === 0) || isLoading) return;

    const userMessage = input.trim();
    const filesToUpload = [...pendingFiles];
    
    setInput("");
    setPendingFiles([]);
    setIsLoading(true);

    // Mostrar mensaje del usuario inmediatamente si hay texto
    if (userMessage) {
      const tempUserMsg: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: userMessage
      };
      setMessages(prev => [...prev, tempUserMsg]);
    }

    try {
      // Crear chat si no existe
      let currentChatId = chatId;
      let isNewChat = false;
      if (!currentChatId) {
        const accountId = sessionStorage.getItem('accountId');
        if (!accountId) {
          throw new Error(t('docChat.errorNoAccount'));
        }
        
        const createResponse = await authFetch(`${API_URL}/summaries/chat/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId }),
        });
        
        if (createResponse.ok) {
          const data = await createResponse.json();
          currentChatId = data.id;
          setChatId(data.id);
          isNewChat = true;
          // NO llamar onChatCreated aquí — se llama al final, después de guardar
          // el jobId en sessionStorage, para evitar que el remount borre el estado
        } else {
          throw new Error(t('docChat.errorCreateChat'));
        }
      }

      // Si hay archivos pendientes, subirlos a staging y procesarlos por jobs
      if (filesToUpload.length > 0) {
        setIsUploading(true);
        const formData = new FormData();
        filesToUpload.forEach(file => {
          formData.append('files', file);
        });

        const stageResponse = await authFetch(`${API_URL}/summaries/chat/${currentChatId}/upload/stage`, {
          method: 'POST',
          body: formData,
        });

        if (stageResponse.ok) {
          const stageData = await stageResponse.json();
          const stagedFiles: StagedUploadFile[] = stageData.stagedFiles || [];

          const uploadJobResponse = await authFetch(`${API_URL}/jobs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              endpoint: `/summaries/chat/${currentChatId}/upload/process`,
              method: 'POST',
              accountId: sessionStorage.getItem('accountId') || undefined,
              chatId: currentChatId,
              body: { stagedFiles }
            })
          });

          if (!uploadJobResponse.ok) {
            const error = await uploadJobResponse.json();
            toast({ title: error.error || t('docChat.errorCreateJobFiles'), variant: 'destructive' });
            setIsLoading(false);
            setIsUploading(false);
            return;
          }

          const uploadJob = await uploadJobResponse.json();
          let lastJobId = uploadJob.id;

          if (userMessage) {
            const messageJobResponse = await authFetch(`${API_URL}/jobs`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                endpoint: `/summaries/chat/${currentChatId}/message`,
                method: 'POST',
                accountId: sessionStorage.getItem('accountId') || undefined,
                chatId: currentChatId,
                body: { content: userMessage }
              })
            });

            if (!messageJobResponse.ok) {
              const error = await messageJobResponse.json();
              toast({ title: error.error || t('docChat.errorCreateJobMsg'), variant: 'destructive' });
              setIsLoading(false);
              setIsUploading(false);
              return;
            }

            const messageJob = await messageJobResponse.json();
            lastJobId = messageJob.id;
          }

          setPendingJobId(lastJobId);
          sessionStorage.setItem(getPendingJobKey(currentChatId), lastJobId);
          setIsUploading(false);
          // Llamar onChatCreated DESPUÉS de guardar en sessionStorage para que
          // el remount encuentre el jobId pendiente y reactive el polling
          if (isNewChat && onChatCreated) onChatCreated(currentChatId!);
          setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
          return;
        } else {
          const error = await stageResponse.json();
          toast({ title: error.error || t('docChat.errorUploadFiles'), variant: 'destructive' });
          setIsLoading(false);
          setIsUploading(false);
          return;
        }
      }

      // Si hay mensaje de texto, enviarlo con streaming
      if (userMessage) {
        // Marcar stream en curso
        const currentMsgCount = messages.length + (userMessage ? 1 : 0);
        sessionStorage.setItem(`streaming_summaries_${currentChatId}`, String(currentMsgCount));

        pendingReasoningRef.current = '';
        await startStream({
          endpoint: `/summaries/chat/${currentChatId}/message/stream`,
          body: { content: userMessage, ...(ragEnabled ? { ragEnabled: true } : {}) },
          onDoneReasoning: (fullReasoning) => { pendingReasoningRef.current = fullReasoning; },
          onDone: (fullText) => {
            // Limpiar flag de streaming
            const doneChatId = chatIdRef.current;
            if (doneChatId) sessionStorage.removeItem(`streaming_summaries_${doneChatId}`);

            const content = ragEnabled ? `${fullText}\n<!-- rag-enhanced -->` : fullText;
            setMessages((prev) => [
              ...prev,
              { id: `ai-${Date.now()}`, role: "assistant", content, reasoning: pendingReasoningRef.current || undefined },
            ]);
            pendingReasoningRef.current = '';
            setIsLoading(false);
            if (isNewChat && onChatCreated) onChatCreated(currentChatId!);
            if (onMessagesChanged) onMessagesChanged();
          },
        });
        return;
      }
      
      setIsLoading(false);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (error) {
      console.error("Error:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: t('docChat.errorConnection'),
        },
      ]);
      setIsLoading(false);
      setIsUploading(false);
    }
  };

  // Drag & Drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Solo desactivar si salimos del contenedor principal
    const rect = e.currentTarget.getBoundingClientRect();
    if (
      e.clientX <= rect.left ||
      e.clientX >= rect.right ||
      e.clientY <= rect.top ||
      e.clientY >= rect.bottom
    ) {
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

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFiles(files);
    }
  };

  if (isInitializing) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground mt-4">{t('docChat.preparing')}</p>
      </div>
    );
  }

  return (
    <div 
      className="flex flex-col h-full relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-primary/10 border-4 border-dashed border-primary z-50 flex items-center justify-center">
          <div className="text-center">
            <FileText className="h-16 w-16 text-primary mx-auto mb-4" />
            <p className="text-lg font-semibold text-foreground">{t('docChat.dragTitle')}</p>
            <p className="text-sm text-muted-foreground mt-1">{t('docChat.dragSubtitle')}</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="border-b border-border p-4 md:p-6 relative">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg md:text-xl font-semibold text-foreground">
              {t('docChat.headerTitle')}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {uploadedFiles.length > 0 
                ? `${t('docChat.subtitleLoaded', { count: uploadedFiles.length })}${pendingFiles.length > 0 ? ` + ${pendingFiles.length} pendiente(s)` : ''}`
                : pendingFiles.length > 0
                  ? t('docChat.subtitlePending', { count: pendingFiles.length })
                  : t('docChat.subtitleDefault')}
            </p>
          </div>
          <button
            onClick={() => setShowFlagPanel(!showFlagPanel)}
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors relative"
            title="Mensajes marcados"
          >
            <Flag size={18} />
            {messages.filter(m => m.flags && m.flags.length > 0).length > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 bg-yellow-500 text-[10px] text-black rounded-full flex items-center justify-center font-bold">
                {messages.filter(m => m.flags && m.flags.length > 0).length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground text-sm">
                {t('docChat.emptyState')}
              </p>
              <p className="text-muted-foreground/60 text-xs mt-3">
                {t('docChat.emptyStateHint')}
              </p>
            </div>
          </div>
        )}
        {messages.map((msg) => {
          const isRagEnhanced = msg.role === 'assistant' && msg.content.includes('<!-- rag-enhanced -->');
          const displayContent = isRagEnhanced ? msg.content.replace(/\n?<!-- rag-enhanced -->/g, '') : msg.content;
          return (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div className="max-w-[85%] md:max-w-[70%]">
              <div
                id={`msg-${msg.id}`}
                className={`rounded-lg px-4 py-3 text-sm relative group transition-all ${highlightedMsgId === msg.id ? 'ring-2 ring-yellow-500' : ''} ${msg.flags && msg.flags.length > 0 ? 'border-l-2 border-l-yellow-500' : ''} ${
                  msg.role === "user"
                    ? "bg-chat-user text-chat-user-foreground"
                    : "bg-chat-ai text-chat-ai-foreground prose prose-sm dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1"
                }`}
              >
                {msg.role === 'assistant' && msg.reasoning && (
                  <ThinkingDetails content={msg.reasoning} />
                )}
                {msg.role === "assistant" ? (
                  <ReactMarkdown>{displayContent}</ReactMarkdown>
                ) : (
                  msg.content
                )}
                {isRagEnhanced && (
                  <div className="flex items-center justify-end gap-1 mt-2 pt-1.5 border-t border-border/30 not-prose">
                    <FolderOpen className="h-3 w-3 text-primary/60" />
                    <span className="text-[10px] text-muted-foreground">{t('improveAI.ragUsed')}</span>
                  </div>
                )}
                <button
                  onClick={() => toggleFlag(msg.id)}
                  className="absolute top-1 right-1 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/10"
                  title={msg.flags && msg.flags.length > 0 ? 'Desmarcar' : 'Marcar'}
                >
                  <Flag size={14} className={msg.flags && msg.flags.length > 0 ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground'} />
                </button>
              </div>

              {/* Mostrar archivos subidos en el mensaje */}
              {msg.role === "assistant" &&
                msg.metadata?.type === "files_uploaded" &&
                msg.metadata.uploadedFiles &&
                msg.metadata.uploadedFiles.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {msg.metadata.uploadedFiles.map((file) => (
                      <div
                        key={file.id}
                        className="bg-card border border-border rounded-lg p-3 text-xs"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                            <span className="font-medium text-foreground truncate">
                              {file.originalName}
                            </span>
                          </div>
                          <button
                            onClick={() => handleDeleteFile(file.id)}
                            className="p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                            title={t('docChat.deleteFileTitle')}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {(file.size / 1024).toFixed(0)} KB • {new Date(file.uploadedAt).toLocaleString(i18n.language, {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          </div>
          );
        })}
        {(isLoading || isUploading || isPollingForResponse) && !isStreaming && (
          <div className="flex justify-start">
            <div className="bg-chat-ai text-chat-ai-foreground rounded-lg px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          </div>
        )}
        {isStreaming && (streamingText || streamingReasoning) && (
          <div className="flex justify-start">
            <div className="max-w-[85%] md:max-w-[70%] rounded-lg px-4 py-3 text-sm leading-relaxed prose prose-sm dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1 bg-chat-ai text-chat-ai-foreground">
              {streamingReasoning && (
                <ThinkingDetails content={streamingReasoning} open />
              )}
              <ReactMarkdown>{streamingText}</ReactMarkdown>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border p-4">
        {/* Archivos pendientes */}
        {pendingFiles.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {pendingFiles.map((file, index) => (
              <div
                key={index}
                className="flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-lg px-3 py-2 text-xs"
              >
                <FileText className="h-4 w-4 text-primary" />
                <span className="font-medium text-foreground max-w-[200px] truncate">
                  {file.name}
                </span>
                <span className="text-muted-foreground text-[10px]">
                  ({(file.size / 1024).toFixed(0)} KB)
                </span>
                <button
                  onClick={() => removePendingFile(index)}
                  className="ml-1 p-0.5 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive transition-colors"
                  title="Quitar archivo"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        
        <div className="flex items-center gap-2">
          <input 
            type="file" 
            ref={fileRef} 
            onChange={(e) => handleFiles(e.target.files)} 
            className="hidden" 
            accept="application/pdf"
            multiple
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={isUploading || (uploadedFiles.length + pendingFiles.length >= 4)}
            className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title={(uploadedFiles.length + pendingFiles.length >= 4) ? t('docChat.maxFilesTitle') : t('docChat.selectPdfs')}
          >
            <Paperclip className="h-5 w-5" />
          </button>
          {hasImproveAI && (
            <button
              onClick={() => setRagEnabled(!ragEnabled)}
              className={`p-2 rounded-md transition-colors ${ragEnabled ? 'bg-primary/20 text-primary' : 'hover:bg-accent text-muted-foreground hover:text-foreground'}`}
              title={t('improveAI.ragToggle')}
            >
              <Brain className="h-5 w-5" />
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
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!isLoading && !isUploading) send(); } }}
            placeholder={
              pendingFiles.length > 0
                ? t('docChat.placeholderFiles', { count: pendingFiles.length })
                : uploadedFiles.length > 0
                  ? t('docChat.placeholderUploaded')
                  : t('docChat.placeholderDefault')
            }
            disabled={isLoading || isUploading}
            className="flex-1 bg-accent/50 border border-border rounded-md px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 resize-none overflow-hidden"
          />
          <button
            onClick={isLoading ? cancelJob : send}
            disabled={!isLoading && (input.trim() === '' && pendingFiles.length === 0) || isUploading}
            className="p-2.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {isLoading ? <StopCircle className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {/* Flag Panel Drawer */}
      {showFlagPanel && (
        <div className="absolute top-0 right-0 h-full w-80 bg-card border-l border-border z-30 flex flex-col shadow-xl">
          <div className="flex items-center justify-between p-4 border-b">
            <h3 className="font-semibold flex items-center gap-2">
              <Flag size={16} className="text-yellow-500" />
              Mensajes marcados ({messages.filter(m => m.flags && m.flags.length > 0).length})
            </h3>
            <button onClick={() => setShowFlagPanel(false)} className="p-1 rounded hover:bg-muted">
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.filter(m => m.flags && m.flags.length > 0).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No hay mensajes marcados</p>
            ) : (
              messages.filter(m => m.flags && m.flags.length > 0).map((msg) => (
                <button
                  key={msg.id}
                  onClick={() => scrollToMessage(msg.id)}
                  className="w-full text-left p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${msg.role === 'user' ? 'bg-primary/20 text-primary' : 'bg-muted-foreground/20 text-muted-foreground'}`}>
                      {msg.role === 'user' ? 'Tú' : 'Lyra'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{msg.content.substring(0, 120)}...</p>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentSummariesChatInterface;
