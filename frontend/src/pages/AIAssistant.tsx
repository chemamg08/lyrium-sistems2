import { useEffect, useRef, useState } from "react";
import { Send, StopCircle, Trash2, Paperclip, FileText, Brain, FolderOpen, MessageSquare, Search, Plus, Pencil, Check, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/use-toast";
import { useStreamingChat } from "@/hooks/useStreamingChat";
import { authFetch } from '../lib/authFetch';

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface Chat {
  id: string;
  name: string;
  createdAt: string;
  messageCount: number;
}

const API_URL = import.meta.env.VITE_API_URL;
const ACTIVE_CHAT_KEY = "assistantActiveChatId";

const AIAssistant = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [showChatsSelector, setShowChatsSelector] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [showDeleteChatConfirm, setShowDeleteChatConfirm] = useState(false);
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [fileContextName, setFileContextName] = useState<string | null>(null);
  const [fileContext, setFileContext] = useState<string | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [ragEnabled, setRagEnabled] = useState(false);
  const [hasImproveAI, setHasImproveAI] = useState(false);
  const [isPollingForResponse, setIsPollingForResponse] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const activeChatIdRef = useRef<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { streamingText, isStreaming, startStream, cancelStream } = useStreamingChat();

  useEffect(() => {
    loadChats();
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
  }, []);

  // Mantener ref sincronizado
  useEffect(() => { activeChatIdRef.current = activeChatId; }, [activeChatId]);

  useEffect(() => {
    if (activeChatId) {
      loadChat(activeChatId);
      sessionStorage.setItem(ACTIVE_CHAT_KEY, activeChatId);

      // Detectar si hay un stream en curso (componente fue remontado)
      const streamingFlag = sessionStorage.getItem(`streaming_assistant_${activeChatId}`);
      if (streamingFlag) {
        const expectedMsgCount = parseInt(streamingFlag, 10);
        setIsPollingForResponse(true);
        setIsLoading(true);
        if (pollingRef.current) clearInterval(pollingRef.current);
        pollingRef.current = setInterval(async () => {
          try {
            const accountId = sessionStorage.getItem('accountId');
            if (!accountId) return;
            const res = await authFetch(`${API_URL}/assistant/chat?accountId=${accountId}&chatId=${activeChatId}`);
            if (res.ok) {
              const data = await res.json();
              const msgs: Message[] = data.messages || [];
              if (msgs.length > expectedMsgCount) {
                setMessages(msgs);
                setIsPollingForResponse(false);
                setIsLoading(false);
                sessionStorage.removeItem(`streaming_assistant_${activeChatId}`);
                if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
                loadChats();
              }
            }
          } catch { /* ignore */ }
        }, 2000);
      }
    }
    return () => {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    };
  }, [activeChatId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  const loadChats = async () => {
    try {
      const accountId = sessionStorage.getItem("accountId");
      if (!accountId) return;

      const response = await authFetch(
        `${API_URL}/assistant/chats?accountId=${accountId}`
      );
      if (response.ok) {
        const data = await response.json();
        const chatList: Chat[] = data.chats || data || [];
        setChats(chatList);

        const savedActiveId = sessionStorage.getItem(ACTIVE_CHAT_KEY);
        if (savedActiveId && chatList.find((c) => c.id === savedActiveId)) {
          setActiveChatId(savedActiveId);
        } else if (chatList.length > 0) {
          setActiveChatId(chatList[0].id);
        } else {
          await createChat();
        }
      }
    } catch (error) {
      console.error("Error al obtener chats:", error);
    }
  };

  const loadChat = async (chatId: string) => {
    try {
      const accountId = sessionStorage.getItem("accountId");
      if (!accountId) return;

      const response = await authFetch(`${API_URL}/assistant/chat?accountId=${accountId}&chatId=${chatId}`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
      }
    } catch (error) {
      console.error("Error al cargar chat del asistente:", error);
    }
  };

  const createChat = async () => {
    try {
      const accountId = sessionStorage.getItem("accountId");
      if (!accountId) return;

      const response = await authFetch(`${API_URL}/assistant/chats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId })
      });

      if (response.ok) {
        const newChat = await response.json();
        setChats(prev => [...prev, { ...newChat, messageCount: 0 }]);
        setActiveChatId(newChat.id);
        setMessages([]);
      }
    } catch (error) {
      console.error("Error al crear chat:", error);
    }
  };

  const deleteChat = async (chatId: string) => {
    try {
      const accountId = sessionStorage.getItem("accountId");
      if (!accountId) return;

      const response = await authFetch(`${API_URL}/assistant/chats/${chatId}?accountId=${accountId}`, {
        method: "DELETE"
      });

      if (response.ok) {
        const remaining = chats.filter(c => c.id !== chatId);
        setChats(remaining);

        if (activeChatId === chatId) {
          if (remaining.length > 0) {
            setActiveChatId(remaining[0].id);
          } else {
            await createChat();
          }
        }
      }
    } catch (error) {
      console.error("Error al eliminar chat:", error);
    }
  };

  const handleCancel = () => {
    cancelStream();
    setIsLoading(false);
  };

  const uploadFile = async (file: File) => {
    const allowed = ["application/pdf", "text/plain", "text/csv"];
    if (!allowed.includes(file.type) && !file.name.endsWith(".txt")) {
      toast({ title: "Solo se permiten archivos PDF o TXT", variant: "destructive" });
      return;
    }
    setIsUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await authFetch(`${API_URL}/assistant/upload-file`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error("Error al subir el archivo");
      const data = await response.json();
      setFileContext(data.text);
      setFileContextName(data.fileName);
      toast({ title: `Archivo cargado: ${data.fileName}` });
    } catch {
      toast({ title: "No se pudo procesar el archivo", variant: "destructive" });
    } finally {
      setIsUploadingFile(false);
    }
  };

  const clearFile = () => {
    setFileContext(null);
    setFileContextName(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await uploadFile(file);
  };

  const sendMessage = async () => {
    const content = input.trim();
    if (!content || isLoading || !activeChatId) return;

    const accountId = sessionStorage.getItem("accountId");
    if (!accountId) {
      toast({ title: t('assistant.errorNoAccount'), variant: 'destructive' });
      return;
    }

    setInput("");
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content }]);
    setIsLoading(true);

    // Marcar stream en curso
    const currentMsgCount = messages.length + 1;
    sessionStorage.setItem(`streaming_assistant_${activeChatId}`, String(currentMsgCount));

    try {
      await startStream({
        endpoint: "/assistant/chat/message/stream",
        body: { accountId, chatId: activeChatId, content, ...(fileContext ? { fileContext } : {}), ...(ragEnabled ? { ragEnabled: true } : {}) },
        onDone: (fullText) => {
          // Limpiar flag de streaming
          const doneChatId = activeChatIdRef.current;
          if (doneChatId) sessionStorage.removeItem(`streaming_assistant_${doneChatId}`);

          const content = ragEnabled ? `${fullText}\n<!-- rag-enhanced -->` : fullText;
          setMessages(prev => [...prev, { id: `ai-${Date.now()}`, role: 'assistant', content }]);
          setIsLoading(false);
          loadChats();
        },
      });
    } catch (error) {
      console.error("Error al enviar mensaje:", error);
      setIsLoading(false);
      toast({ title: t('assistant.errorSend'), variant: 'destructive' });
    }
  };

  const filteredChats = chats.filter(chat =>
    chat.name.toLowerCase().includes(chatSearchQuery.toLowerCase())
  );

  const renameChat = async (chatId: string, newName: string) => {
    if (!newName.trim()) return;
    try {
      const accountId = sessionStorage.getItem("accountId");
      if (!accountId) return;
      const response = await authFetch(`${API_URL}/assistant/chats/${chatId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, name: newName.trim() })
      });
      if (response.ok) {
        setChats(prev => prev.map(c => c.id === chatId ? { ...c, name: newName.trim() } : c));
      }
    } catch (error) {
      console.error("Error al renombrar chat:", error);
    } finally {
      setEditingChatId(null);
      setEditingTitle("");
    }
  };

  const confirmDeleteChat = (chatId: string) => {
    setChatToDelete(chatId);
    setShowDeleteChatConfirm(true);
  };

  return (
    <div className="flex h-[calc(100vh-0px)] relative">
      {/* Delete chat modal */}
      {showDeleteChatConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-foreground mb-2">{t('assistant.deleteConfirm')}</h3>
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => { setShowDeleteChatConfirm(false); setChatToDelete(null); }}
                className="px-4 py-2 text-sm rounded-md border border-border hover:bg-accent transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => {
                  if (chatToDelete) deleteChat(chatToDelete);
                  setShowDeleteChatConfirm(false);
                  setChatToDelete(null);
                }}
                className="px-4 py-2 text-sm rounded-md bg-destructive text-destructive-foreground hover:opacity-90 transition-opacity"
              >
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Panel principal del chat */}
      <div className="flex-1 flex flex-col">
        <div className="border-b border-border px-4 md:px-6 py-3 md:py-4 flex items-center gap-3">
          <div className="relative">
            <button
              onClick={() => setShowChatsSelector(!showChatsSelector)}
              className="flex items-center gap-2 bg-accent text-foreground px-3 py-1.5 rounded-md text-xs font-medium hover:bg-accent/80 transition-colors"
            >
              <MessageSquare className="h-3.5 w-3.5" /> {t('assistant.conversations')}
            </button>
            {showChatsSelector && (
              <div className="absolute left-0 top-full mt-1 w-80 bg-card border border-border rounded-lg shadow-lg z-10 overflow-hidden">
                <div className="p-2 border-b border-border">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder={t('common.searchChats')}
                      value={chatSearchQuery}
                      onChange={(e) => setChatSearchQuery(e.target.value)}
                      className="w-full pl-7 pr-2 py-1.5 text-xs bg-accent/50 border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                </div>
                <button
                  onClick={() => { createChat(); setShowChatsSelector(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-foreground hover:bg-accent transition-colors border-b border-border"
                >
                  <Plus className="h-3.5 w-3.5" /> {t('assistant.newChat')}
                </button>
                <div className="max-h-[280px] overflow-y-auto">
                  {filteredChats.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-muted-foreground text-center">{t('common.noResults')}</p>
                  ) : (
                    filteredChats.map((chat) => (
                      <div
                        key={chat.id}
                        className={`group relative px-3 py-2.5 hover:bg-accent transition-colors border-b border-border/50 ${activeChatId === chat.id ? 'bg-accent/50' : ''}`}
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            {editingChatId === chat.id ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={editingTitle}
                                  onChange={(e) => setEditingTitle(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') renameChat(chat.id, editingTitle);
                                    if (e.key === 'Escape') { setEditingChatId(null); setEditingTitle(""); }
                                  }}
                                  className="flex-1 px-1.5 py-0.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring"
                                  autoFocus
                                />
                                <button onClick={() => renameChat(chat.id, editingTitle)}
                                  className="p-0.5 hover:bg-accent rounded text-green-600">
                                  <Check className="h-3 w-3" />
                                </button>
                                <button onClick={() => { setEditingChatId(null); setEditingTitle(""); }}
                                  className="p-0.5 hover:bg-accent rounded text-muted-foreground">
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => { setActiveChatId(chat.id); setShowChatsSelector(false); }} className="w-full text-left">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <span className="text-xs font-medium text-foreground truncate">{chat.name}</span>
                                  {chat.messageCount > 0 && (
                                    <span className="text-[9px] text-muted-foreground/70">{chat.messageCount}</span>
                                  )}
                                </div>
                                <p className="text-[9px] text-muted-foreground/70">
                                  {new Date(chat.createdAt).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </button>
                            )}
                          </div>
                          {editingChatId !== chat.id && (
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={(e) => { e.stopPropagation(); setEditingChatId(chat.id); setEditingTitle(chat.name); }}
                                className="p-1 rounded hover:bg-background text-muted-foreground hover:text-foreground transition-colors">
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); confirmDeleteChat(chat.id); }}
                                className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          <div>
            <h2 className="text-lg md:text-xl font-semibold text-foreground">{t('assistant.title')}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t('assistant.subtitle')}</p>
          </div>
        </div>

        <div
          className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 relative"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Drag overlay */}
          {isDragOver && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm border-2 border-dashed border-primary rounded-lg pointer-events-none">
              <FileText className="h-10 w-10 text-primary mb-3" />
              <p className="text-sm font-medium text-primary">Suelta el archivo aquí</p>
              <p className="text-xs text-muted-foreground mt-1">PDF o TXT — el asistente podrá responder preguntas sobre él</p>
            </div>
          )}
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-muted-foreground text-sm">{t('assistant.noMessages')}</p>
                <p className="text-muted-foreground/60 text-xs mt-1">{t('assistant.startMessage')}</p>
              </div>
            </div>
          )}

          {messages.map((msg) => {
            const isRagEnhanced = msg.role === 'assistant' && msg.content.includes('<!-- rag-enhanced -->');
            const displayContent = isRagEnhanced ? msg.content.replace(/\n?<!-- rag-enhanced -->/g, '') : msg.content;
            return (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] md:max-w-[70%] rounded-lg px-4 py-3 text-sm leading-relaxed prose prose-sm dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1 ${
                  msg.role === "user"
                    ? "bg-chat-user text-chat-user-foreground"
                    : "bg-chat-ai text-chat-ai-foreground"
                }`}
              >
                <ReactMarkdown>{displayContent}</ReactMarkdown>
                {isRagEnhanced && (
                  <div className="flex items-center justify-end gap-1 mt-2 pt-1.5 border-t border-border/30 not-prose">
                    <FolderOpen className="h-3 w-3 text-primary/60" />
                    <span className="text-[10px] text-muted-foreground">{t('improveAI.ragUsed')}</span>
                  </div>
                )}
              </div>
            </div>
            );
          })}

          {(isLoading || isPollingForResponse) && !isStreaming && (
            <div className="flex justify-start">
              <div className="rounded-lg px-4 py-3 bg-chat-ai text-chat-ai-foreground flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-current animate-bounce [animation-delay:-0.3s]" />
                <span className="h-2 w-2 rounded-full bg-current animate-bounce [animation-delay:-0.15s]" />
                <span className="h-2 w-2 rounded-full bg-current animate-bounce" />
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

        <div className="border-t border-border p-4">
          {fileContextName && (
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground bg-primary/10 text-primary rounded px-3 py-1.5 w-fit">
              <FileText className="h-3 w-3" />
              <span className="max-w-[200px] truncate">{fileContextName}</span>
              <button onClick={clearFile} className="ml-1 hover:text-destructive transition-colors">×</button>
            </div>
          )}
          {isUploadingFile && (
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground bg-accent rounded px-3 py-1.5 w-fit">
              <Paperclip className="h-3 w-3 animate-pulse" />
              Procesando archivo...
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileRef}
              onChange={async (e) => { const f = e.target.files?.[0]; if (f) await uploadFile(f); }}
              className="hidden"
              accept=".pdf,.txt,.csv"
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={isUploadingFile}
              className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              title="Adjuntar PDF o TXT"
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
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder={t('assistant.placeholder')}
              disabled={isLoading}
              className="flex-1 bg-accent/50 border border-border rounded-md px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-70 resize-none overflow-hidden"
            />
            <button
              onClick={isLoading ? handleCancel : sendMessage}
              disabled={!isLoading && !input.trim()}
              className="p-2.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {isLoading ? <StopCircle className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIAssistant;
