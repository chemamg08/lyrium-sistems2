import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/use-toast";
import { Send, Download, Loader2, StopCircle, Upload, Paperclip, X, FileText, Brain, FolderOpen, PenTool, Search, RefreshCw, CheckCircle2, Clock, AlertTriangle, Mail } from "lucide-react";
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

const API_URL = import.meta.env.VITE_API_URL;

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
  const [ragEnabled, setRagEnabled] = useState(false);
  const [hasImproveAI, setHasImproveAI] = useState(false);
  // Signature states
  const [showSignModal, setShowSignModal] = useState(false);
  const [signContractId, setSignContractId] = useState<string | null>(null);
  const [signClients, setSignClients] = useState<{id:string;name:string;email:string}[]>([]);
  const [signClientSearch, setSignClientSearch] = useState('');
  const [signSelectedClient, setSignSelectedClient] = useState<{id:string;name:string;email:string}|null>(null);
  const [signEmail, setSignEmail] = useState('');
  const [signName, setSignName] = useState('');
  const [signMessage, setSignMessage] = useState('');
  const [signDocName, setSignDocName] = useState('');
  const [signSending, setSignSending] = useState(false);
  const [signatureRequests, setSignatureRequests] = useState<any[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const chatIdRef = useRef<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isPollingForResponse, setIsPollingForResponse] = useState(false);
  const { t } = useTranslation();
  const { toast } = useToast();
  const { streamingText, isStreaming, isContractGeneration, startStream, cancelStream, resetContractGeneration } = useStreamingChat();

  // Auto-scroll al fondo cuando cambian mensajes o streaming
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

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
  }, [existingChatId, contractBaseId]);

  // Mantener ref sincronizado
  useEffect(() => { chatIdRef.current = chatId; }, [chatId]);

  // Limpiar polling al desmontar
  useEffect(() => {
    return () => { if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; } };
  }, []);

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

        // Detectar si hay un stream en curso (componente fue remontado)
        const streamingFlag = sessionStorage.getItem(`streaming_contract_${data.id}`);
        if (streamingFlag) {
          const expectedMsgCount = parseInt(streamingFlag, 10);
          setIsPollingForResponse(true);
          setIsLoading(true);
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = setInterval(async () => {
            try {
              const res = await authFetch(`${API_URL}/contracts/chat/${data.id}`);
              if (res.ok) {
                const chatData = await res.json();
                const msgs: Message[] = chatData.messages || [];
                if (msgs.length > expectedMsgCount) {
                  setMessages(msgs);
                  setIsPollingForResponse(false);
                  setIsLoading(false);
                  sessionStorage.removeItem(`streaming_contract_${data.id}`);
                  if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
                  if (onMessagesChanged) onMessagesChanged();
                }
              }
            } catch { /* ignore */ }
          }, 2000);
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
    const currentMsgCount = messages.length + 1;
    setMessages((prev) => [...prev, tempUserMsg]);

    // Marcar stream en curso
    sessionStorage.setItem(`streaming_contract_${chatId}`, String(currentMsgCount));

    try {
      await startStream({
        endpoint: "/contracts/chat/message/stream",
        body: {
          chatId,
          content: userMessage,
          ...(ragEnabled ? { ragEnabled: true } : {}),
        },
        onDone: async (fullText) => {
          // Limpiar flag de streaming
          const doneChatId = chatIdRef.current;
          if (doneChatId) sessionStorage.removeItem(`streaming_contract_${doneChatId}`);

          if (fullText.includes('[GENERAR_CONTRATO_COMPLETO]')) {
            // isContractGeneration is already true (set by the hook during streaming)
            // Show the text before the tag as a permanent message
            const preTagText = fullText.split('[GENERAR_CONTRATO_COMPLETO]')[0]?.trim();
            if (preTagText) {
              setMessages((prev) => [
                ...prev,
                { id: `ai-pre-${Date.now()}`, role: "assistant", content: preTagText },
              ]);
            }
            // El backend genera el PDF tras cerrar el stream — hacer polling hasta que esté listo
            await pollUntilContractReady(chatId!);
            resetContractGeneration();
          } else {
            const content = ragEnabled ? `${fullText}\n<!-- rag-enhanced -->` : fullText;
            setMessages((prev) => [
              ...prev,
              { id: `ai-${Date.now()}`, role: "assistant", content },
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

  // === Signature functions ===
  const openSignModal = async (generatedContractId: string, fileName?: string) => {
    setSignContractId(generatedContractId);
    setSignSelectedClient(null);
    setSignEmail('');
    setSignName('');
    setSignMessage('');
    setSignDocName(fileName || '');
    setSignClientSearch('');
    setShowSignModal(true);
    // Load clients
    try {
      const accId = sessionStorage.getItem('accountId');
      const res = await authFetch(`${API_URL}/clients?accountId=${accId}&userType=${sessionStorage.getItem('userType')}`);
      if (res.ok) {
        const data = await res.json();
        setSignClients(data.map((c: any) => ({ id: c.id || c._id, name: c.name, email: c.email })));
      }
    } catch { /* ignore */ }
  };

  const selectSignClient = (client: {id:string;name:string;email:string}) => {
    setSignSelectedClient(client);
    setSignEmail(client.email);
    setSignName(client.name);
    setSignClientSearch('');
  };

  const sendForSignature = async () => {
    if (!signContractId || !signEmail || !signName || !signSelectedClient) return;
    setSignSending(true);
    try {
      const res = await authFetch(`${API_URL}/signatures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generatedContractId: signContractId,
          clientId: signSelectedClient.id,
          signerEmail: signEmail,
          signerName: signName,
          message: signMessage,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error');
      }
      toast({ title: t('signature.sent'), description: t('signature.sentDesc') });
      setShowSignModal(false);
      // Refresh signature requests
      if (chatId) loadSignatureRequests(chatId);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSignSending(false);
    }
  };

  const loadSignatureRequests = async (cId: string) => {
    try {
      const res = await authFetch(`${API_URL}/signatures/chat/${cId}`);
      if (res.ok) setSignatureRequests(await res.json());
    } catch { /* ignore */ }
  };

  const resendSignature = async (sigId: string) => {
    try {
      const res = await authFetch(`${API_URL}/signatures/${sigId}/resend`, { method: 'POST' });
      if (res.ok) {
        toast({ title: t('signature.resent') });
        if (chatId) loadSignatureRequests(chatId);
      }
    } catch { /* ignore */ }
  };

  const downloadSignedPdf = async (sigId: string) => {
    try {
      const res = await authFetch(`${API_URL}/signatures/${sigId}/download-signed`);
      if (!res.ok) throw new Error('Error');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'contrato_firmado.pdf';
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch { /* ignore */ }
  };

  // Load signature requests when chatId changes
  useEffect(() => {
    if (chatId) loadSignatureRequests(chatId);
  }, [chatId]);

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

      {/* Signature Status Bar */}
      {signatureRequests.length > 0 && (
        <div className="border-b border-border bg-accent/30 px-4 py-2.5 flex items-center gap-3 flex-wrap">
          {signatureRequests.map((sig: any) => {
            const statusConfig: Record<string, {icon: any; color: string; label: string}> = {
              sent: { icon: Mail, color: 'text-blue-500', label: t('signature.statusSent') },
              pending: { icon: Clock, color: 'text-yellow-500', label: t('signature.statusPending') },
              signed: { icon: CheckCircle2, color: 'text-green-500', label: t('signature.statusSigned') },
              expired: { icon: AlertTriangle, color: 'text-red-500', label: t('signature.statusExpired') },
            };
            const cfg = statusConfig[sig.status] || statusConfig.sent;
            const Icon = cfg.icon;
            return (
              <div key={sig.id} className="flex items-center gap-2 bg-card border border-border rounded-md px-3 py-1.5 text-xs">
                <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                <span className="font-medium text-foreground">{sig.signerName}</span>
                <span className={`${cfg.color} font-medium`}>{cfg.label}</span>
                {sig.status === 'signed' && (
                  <button onClick={() => downloadSignedPdf(sig.id)} className="ml-1 text-primary hover:underline">{t('signature.downloadSigned')}</button>
                )}
                {(sig.status === 'sent' || sig.status === 'pending' || sig.status === 'expired') && (
                  <button onClick={() => resendSignature(sig.id)} className="ml-1 text-muted-foreground hover:text-foreground">
                    <RefreshCw className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
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
                className={`rounded-lg px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-chat-user text-chat-user-foreground"
                    : "bg-chat-ai text-chat-ai-foreground prose prose-sm dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1"
                }`}
              >
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
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            downloadContract(msg.metadata!.generatedContractId!)
                          }
                          className="flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-xs font-medium hover:opacity-90 transition-opacity"
                        >
                          <Download className="h-3.5 w-3.5" />
                          {t('contractChat.downloadPdf')}
                        </button>
                        <button
                          onClick={() => openSignModal(msg.metadata!.generatedContractId!, msg.metadata!.fileName)}
                          className="flex items-center gap-2 bg-indigo-600 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-indigo-700 transition-colors"
                        >
                          <PenTool className="h-3.5 w-3.5" />
                          {t('signature.sendToSign')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
            </div>
          </div>
          );
        })}
        {(isLoading || isPollingForResponse) && !isStreaming && !isContractGeneration && (
          <div className="flex justify-start">
            <div className="bg-chat-ai text-chat-ai-foreground rounded-lg px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          </div>
        )}
        {isContractGeneration && (
          <div className="flex justify-start">
            <div className="bg-chat-ai text-chat-ai-foreground rounded-lg px-4 py-3 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">{t('contractChat.generatingPdf', 'Generando contrato PDF...')}</span>
            </div>
          </div>
        )}
        {isStreaming && streamingText && !isContractGeneration && (
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
          {hasImproveAI && (
            <button
              onClick={() => setRagEnabled(!ragEnabled)}
              className={`p-2.5 rounded-md transition-colors ${ragEnabled ? 'bg-primary/20 text-primary' : 'hover:bg-accent text-muted-foreground hover:text-foreground'}`}
              title={t('improveAI.ragToggle')}
            >
              <Brain className="h-4 w-4" />
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
      
      {/* Sign Modal */}
      {showSignModal && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={() => setShowSignModal(false)}>
          <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h3 className="text-base font-semibold text-foreground">{t('signature.modalTitle')}</h3>
              <button onClick={() => setShowSignModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Client selector */}
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">{t('signature.selectClient')}</label>
                {signSelectedClient ? (
                  <div className="flex items-center justify-between bg-accent/50 border border-border rounded-md px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">{signSelectedClient.name}</p>
                      <p className="text-xs text-muted-foreground">{signSelectedClient.email}</p>
                    </div>
                    <button onClick={() => { setSignSelectedClient(null); setSignEmail(''); setSignName(''); }} className="text-muted-foreground hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="flex items-center border border-border rounded-md px-3 py-2 bg-background">
                      <Search className="h-3.5 w-3.5 text-muted-foreground mr-2 flex-shrink-0" />
                      <input
                        type="text"
                        value={signClientSearch}
                        onChange={e => setSignClientSearch(e.target.value)}
                        placeholder={t('signature.searchClient')}
                        className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                      />
                    </div>
                    {(() => {
                      const filtered = signClientSearch
                        ? signClients.filter(c => c.name.toLowerCase().includes(signClientSearch.toLowerCase()) || c.email.toLowerCase().includes(signClientSearch.toLowerCase()))
                        : signClients;
                      return (
                        <div className="absolute left-0 right-0 top-full mt-1 bg-card border border-border rounded-md shadow-lg max-h-40 overflow-y-auto z-10">
                          {filtered.length > 0 ? (
                            filtered.slice(0, 10).map(c => (
                              <button
                                key={c.id}
                                onClick={() => selectSignClient(c)}
                                className="w-full text-left px-3 py-2 hover:bg-accent/50 transition-colors"
                              >
                                <p className="text-sm font-medium text-foreground">{c.name}</p>
                                <p className="text-xs text-muted-foreground">{c.email}</p>
                              </button>
                            ))
                          ) : (
                            <p className="px-3 py-2 text-xs text-muted-foreground">{t('signature.noClientsFound')}</p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
              {/* Email */}
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">{t('signature.signerEmail')}</label>
                <input
                  type="email"
                  value={signEmail}
                  onChange={e => setSignEmail(e.target.value)}
                  className="w-full border border-border rounded-md px-3 py-2 bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              {/* Name */}
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">{t('signature.signerName')}</label>
                <input
                  type="text"
                  value={signName}
                  onChange={e => setSignName(e.target.value)}
                  className="w-full border border-border rounded-md px-3 py-2 bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              {/* Document name */}
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">{t('signature.documentName')}</label>
                <input
                  type="text"
                  value={signDocName}
                  onChange={e => setSignDocName(e.target.value)}
                  className="w-full border border-border rounded-md px-3 py-2 bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              {/* Message */}
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">{t('signature.optionalMessage')}</label>
                <textarea
                  value={signMessage}
                  onChange={e => setSignMessage(e.target.value)}
                  rows={3}
                  className="w-full border border-border rounded-md px-3 py-2 bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring resize-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-border px-5 py-4">
              <button
                onClick={() => setShowSignModal(false)}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {t('signature.cancel')}
              </button>
              <button
                onClick={sendForSignature}
                disabled={signSending || !signEmail || !signName || !signSelectedClient}
                className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {signSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PenTool className="h-3.5 w-3.5" />}
                {signSending ? t('signature.sending') : t('signature.send')}
              </button>
            </div>
          </div>
        </div>
      )}

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
