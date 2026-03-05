import { useState, useEffect, useRef } from "react";
import { X, Download, Upload, ChevronRight, Send, Paperclip, BookMarked, StopCircle, MessageSquare, Plus, Search, Pencil, Check, Trash2, FileText, Info } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/use-toast";
import { useStreamingChat } from "@/hooks/useStreamingChat";
import { authFetch } from '../lib/authFetch';

interface Client {
  id: string;
  name: string;
  email: string;
}

interface Chat {
  id: string;
  clientId: string;
  title: string;
  date: string;
  messages: Message[];
}

interface DefenseChatInfo {
  id: string;
  title: string;
  createdAt: string;
  lastModified: string;
  messageCount: number;
  strategiesCount: number;
  firstMessagePreview?: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface SavedStrategy {
  id: string;
  title: string;
  date: string;
  sections: {
    lineasDefensa: string[];
    argumentosJuridicos: string[];
    jurisprudencia: string[];
    puntosDebiles: string[];
    contraArgumentos: string[];
    recomendaciones: string[];
  };
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const ACTIVE_DEFENSE_CHAT_KEY = 'activeDefenseChatId';

const DefensePrep = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importStep, setImportStep] = useState<"clients" | "chats">("clients");
  const [selectedImportClient, setSelectedImportClient] = useState<Client | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientChats, setClientChats] = useState<Chat[]>([]);
  const [exportTitle, setExportTitle] = useState("");
  const [selectedExportClient, setSelectedExportClient] = useState<Client | null>(null);
  const [savedStrategies, setSavedStrategies] = useState<SavedStrategy[]>([]);
  const [showStrategies, setShowStrategies] = useState(false);
  const { streamingText: defStreamingText, isStreaming: defIsStreaming, isSaving: defIsSaving, startStream: defStartStream, cancelStream: defCancelStream } = useStreamingChat();
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isUploadingPdf, setIsUploadingPdf] = useState<string | null>(null); // nombre del archivo
  const [attachedPdf, setAttachedPdf] = useState<{ filename: string; text: string } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const activeChatIdRef = useRef<string | null>(null);

  // Estados para selector de chats
  const [defenseChats, setDefenseChats] = useState<DefenseChatInfo[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [showChatsSelector, setShowChatsSelector] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [showInfoModal, setShowInfoModal] = useState(false);

  // Mantener ref sincronizado con el estado para evitar stale closures
  useEffect(() => { activeChatIdRef.current = activeChatId; }, [activeChatId]);

  useEffect(() => {
    initDefenseChats();
    loadClients();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, defStreamingText]);

  // Cargar chat activo cuando cambia
  useEffect(() => {
    if (activeChatId) {
      loadDefenseChat(activeChatId);
      loadSavedStrategies(activeChatId);
      sessionStorage.setItem(ACTIVE_DEFENSE_CHAT_KEY, activeChatId);
    }
  }, [activeChatId]);

  // Inicializar chats de defensa
  const initDefenseChats = async () => {
    try {
      const accountId = sessionStorage.getItem('accountId');
      if (!accountId) return;

      const response = await authFetch(`${API_URL}/defense-chat/chats?accountId=${accountId}`);
      if (response.ok) {
        const data = await response.json();
        setDefenseChats(data.chats || []);
        
        // Restaurar chat activo o seleccionar el primero
        const savedActive = sessionStorage.getItem(ACTIVE_DEFENSE_CHAT_KEY);
        if (savedActive && data.chats?.some((c: DefenseChatInfo) => c.id === savedActive)) {
          setActiveChatId(savedActive);
        } else if (data.chats?.length > 0) {
          setActiveChatId(data.chats[0].id);
        } else {
          // Crear primer chat automÃ¡ticamente
          await createDefenseChat();
        }
      }
    } catch (error) {
      console.error('Error al cargar chats de defensa:', error);
    }
  };

  const createDefenseChat = async () => {
    try {
      const accountId = sessionStorage.getItem('accountId');
      if (!accountId) return;

      const response = await authFetch(`${API_URL}/defense-chat/chats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId })
      });

      if (response.ok) {
        const newChat = await response.json();
        setDefenseChats(prev => [{ ...newChat, messageCount: 0, strategiesCount: 0 }, ...prev]);
        setActiveChatId(newChat.id);
        setMessages([]);
        setSavedStrategies([]);
        setShowChatsSelector(false);
      }
    } catch (error) {
      console.error('Error al crear chat de defensa:', error);
    }
  };

  const deleteDefenseChat = async (chatId: string) => {
    try {
      const accountId = sessionStorage.getItem('accountId');
      if (!accountId) return;

      const response = await authFetch(`${API_URL}/defense-chat/chats/${chatId}?accountId=${accountId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        const remaining = defenseChats.filter(c => c.id !== chatId);
        setDefenseChats(remaining);
        
        if (activeChatId === chatId) {
          if (remaining.length > 0) {
            setActiveChatId(remaining[0].id);
          } else {
            await createDefenseChat();
          }
        }
      }
    } catch (error) {
      console.error('Error al eliminar chat de defensa:', error);
    }
  };

  const updateChatTitle = async (chatId: string, newTitle: string) => {
    try {
      const accountId = sessionStorage.getItem('accountId');
      if (!accountId || !newTitle.trim()) return;

      const response = await authFetch(`${API_URL}/defense-chat/chats/${chatId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, title: newTitle.trim() })
      });

      if (response.ok) {
        setDefenseChats(prev => prev.map(c => 
          c.id === chatId ? { ...c, title: newTitle.trim() } : c
        ));
        setEditingChatId(null);
        setEditingTitle("");
      }
    } catch (error) {
      console.error('Error al actualizar tÃ­tulo:', error);
    }
  };

  const filteredDefenseChats = defenseChats.filter(chat =>
    chat.title.toLowerCase().includes(chatSearchQuery.toLowerCase()) ||
    chat.firstMessagePreview?.toLowerCase().includes(chatSearchQuery.toLowerCase())
  );

  const loadDefenseChat = async (chatId?: string) => {
    try {
      const accountId = sessionStorage.getItem('accountId');
      if (!accountId) return;
      
      const targetChatId = chatId || activeChatId;
      const url = targetChatId 
        ? `${API_URL}/defense-chat?accountId=${accountId}&chatId=${targetChatId}`
        : `${API_URL}/defense-chat?accountId=${accountId}`;
      
      const response = await authFetch(url);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
        if (data.id && !activeChatId) {
          setActiveChatId(data.id);
        }
      }
    } catch (error) {
      console.error('Error al cargar chat de defensa:', error);
    }
  };

  const loadClients = async () => {
    try {
      const accountId = sessionStorage.getItem('accountId');
      const userType = sessionStorage.getItem('userType');
      if (!accountId) return;
      
      const response = await authFetch(`${API_URL}/clients?accountId=${accountId}&userType=${userType}`);
      if (response.ok) {
        const data = await response.json();
        setClients(data);
      }
    } catch (error) {
      console.error('Error al cargar clientes:', error);
    }
  };

  const loadSavedStrategies = async (chatId?: string) => {
    try {
      const accountId = sessionStorage.getItem('accountId');
      if (!accountId) return;
      
      const targetChatId = chatId || activeChatId;
      const url = targetChatId
        ? `${API_URL}/defense-chat/strategies?accountId=${accountId}&chatId=${targetChatId}`
        : `${API_URL}/defense-chat/strategies?accountId=${accountId}`;
      
      const response = await authFetch(url);
      if (response.ok) {
        const data = await response.json();
        setSavedStrategies(data.strategies || []);
      }
    } catch (error) {
      console.error('Error al cargar estrategias:', error);
    }
  };

  const loadClientChats = async (clientId: string) => {
    try {
      const response = await authFetch(`${API_URL}/chats?clientId=${clientId}`);
      if (response.ok) {
        const data = await response.json();
        setClientChats(data);
      }
    } catch (error) {
      console.error('Error al cargar chats del cliente:', error);
    }
  };

  const cancelJob = () => {
    defCancelStream();
    setIsLoading(false);
  };

  const sendMessage = async () => {
    if ((!input.trim() && !attachedPdf) || isLoading || !activeChatId) return;

    const accountId = sessionStorage.getItem('accountId');
    if (!accountId) {
      toast({ title: t('defense.errorNoAccount'), variant: 'destructive' });
      return;
    }

    let userContent = input.trim();
    if (attachedPdf) {
      userContent = `[Documento adjunto: ${attachedPdf.filename}]\n\n${attachedPdf.text}\n\n${userContent}`.trim();
      setAttachedPdf(null);
    }
    setInput("");
    setIsLoading(true);
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'user',
      content: userContent
    }]);

    try {
      await defStartStream({
        endpoint: "/defense-chat/message/stream",
        body: { content: userContent, accountId, chatId: activeChatId },
        onDone: async (fullText) => {
          setMessages(prev => [...prev, {
            id: `ai-${Date.now()}`,
            role: 'assistant',
            content: fullText
          }]);
          setIsLoading(false);
          initDefenseChats();
          const currentChatId = activeChatIdRef.current;
          const accountId = sessionStorage.getItem('accountId');
          if (currentChatId && accountId) {
            authFetch(`${API_URL}/defense-chat/strategies?accountId=${accountId}&chatId=${currentChatId}`)
              .then(r => r.ok ? r.json() : null)
              .then(data => { if (data) setSavedStrategies(data.strategies || []); })
              .catch(() => {});
          }
        },
      });
    } catch (error) {
      console.error('Error:', error);
      toast({ title: t('defense.errorJobMsg'), variant: 'destructive' });
      setIsLoading(false);
      await loadDefenseChat(activeChatId);
    }
  };

  const handlePdfDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);

    const file = Array.from(e.dataTransfer.files).find(f => f.type === 'application/pdf');
    if (!file) {
      toast({ title: t('defense.errorPdfOnly'), variant: 'destructive' });
      return;
    }

    setIsUploadingPdf(file.name);
    try {
      const formData = new FormData();
      formData.append('pdf', file);

      const response = await authFetch(`${API_URL}/defense-chat/upload-pdf`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error('Error al procesar el PDF');

      const data = await response.json();
      setAttachedPdf({ filename: data.filename, text: data.text });
    } catch (error) {
      console.error('Error subiendo PDF:', error);
      toast({ title: t('defense.errorPdf'), variant: 'destructive' });
    } finally {
      setIsUploadingPdf(null);
    }
  };

  const openExportModal = () => {
    const defaultTitle = `Defensa - ${new Date().toLocaleDateString('es-ES')}`;
    setExportTitle(defaultTitle);
    setSelectedExportClient(null);
    setShowExport(true);
  };

  const downloadStrategyPDF = async (strategyId?: string) => {
    const accountId = sessionStorage.getItem('accountId');
    if (!accountId) {
      toast({ title: t('defense.errorNoAccount'), variant: 'destructive' });
      return;
    }
    try {
      const response = await authFetch(`${API_URL}/defense-chat/download-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, chatId: activeChatId, strategyId })
      });
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Defensa_${new Date().toLocaleDateString('es-ES')}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast({ title: t('defense.downloadSuccess') || 'PDF descargado correctamente' });
      } else {
        toast({ title: t('defense.errorDownload') || 'Error al descargar PDF', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error downloading PDF:', error);
      toast({ title: t('defense.errorDownload') || 'Error al descargar PDF', variant: 'destructive' });
    }
  };

  const selectClientForExport = (client: Client) => {
    setSelectedExportClient(client);
  };

  const exportToClient = async () => {
    if (!selectedExportClient || !exportTitle.trim()) {
      toast({ title: t('defense.exportSelectFields'), variant: 'destructive' });
      return;
    }

    const accountId = sessionStorage.getItem('accountId');
    if (!accountId) {
      toast({ title: t('defense.errorNoAccount'), variant: 'destructive' });
      return;
    }

    try {
      const response = await authFetch(`${API_URL}/defense-chat/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: selectedExportClient.id,
          chatTitle: exportTitle,
          accountId,
          chatId: activeChatId
        })
      });

      if (response.ok) {
        // Descargar PDF
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${exportTitle}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        setShowExport(false);
        toast({ title: t('defense.exportSuccess') });
      } else {
        toast({ title: t('defense.errorExport'), variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error:', error);
      toast({ title: t('defense.errorExport'), variant: 'destructive' });
    }
  };

  const openImport = () => {
    setImportStep("clients");
    setSelectedImportClient(null);
    setClientChats([]);
    setShowImport(true);
  };

  const selectImportClient = async (client: Client) => {
    setSelectedImportClient(client);
    await loadClientChats(client.id);
    setImportStep("chats");
  };

  const importFromClient = async (chatId: string) => {
    const accountId = sessionStorage.getItem('accountId');
    if (!accountId) {
      toast({ title: t('defense.errorNoAccount'), variant: 'destructive' });
      return;
    }

    try {
      const response = await authFetch(`${API_URL}/defense-chat/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, accountId })
      });

      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
        setShowImport(false);
        toast({ title: t('defense.importSuccess') });
      } else {
        toast({ title: t('defense.errorImport'), variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error:', error);
      toast({ title: t('defense.errorImport'), variant: 'destructive' });
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Top bar */}
      <div className="border-b border-border px-3 md:px-6 py-3 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {/* Selector de chats */}
          <div className="relative">
            <button
              onClick={() => setShowChatsSelector(!showChatsSelector)}
              className="flex items-center gap-2 bg-accent text-foreground px-3 py-1.5 rounded-md text-xs font-medium hover:bg-accent/80 transition-colors"
            >
              <MessageSquare className="h-3.5 w-3.5" /> {t('defense.chats')}
            </button>
            {showChatsSelector && (
              <div className="absolute left-0 top-full mt-1 w-80 bg-card border border-border rounded-lg shadow-lg z-10 overflow-hidden">
                {/* Search bar */}
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

                {/* New chat option */}
                <button
                  onClick={createDefenseChat}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-foreground hover:bg-accent transition-colors border-b border-border"
                >
                  <Plus className="h-3.5 w-3.5" /> {t('defense.newChat')}
                </button>

                {/* Chats list */}
                <div className="max-h-[280px] overflow-y-auto">
                  {filteredDefenseChats.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-muted-foreground text-center">
                      {chatSearchQuery ? t('defense.noChatsFound') : t('defense.noChats')}
                    </p>
                  ) : (
                    filteredDefenseChats.map((chat) => (
                      <div
                        key={chat.id}
                        className={`group relative px-3 py-2.5 hover:bg-accent transition-colors border-b border-border/50 ${
                          activeChatId === chat.id ? 'bg-accent/50' : ''
                        }`}
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
                                    if (e.key === 'Enter') updateChatTitle(chat.id, editingTitle);
                                    if (e.key === 'Escape') { setEditingChatId(null); setEditingTitle(""); }
                                  }}
                                  className="flex-1 px-1.5 py-0.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring"
                                  autoFocus
                                />
                                <button
                                  onClick={() => updateChatTitle(chat.id, editingTitle)}
                                  className="p-0.5 hover:bg-accent rounded text-green-600"
                                >
                                  <Check className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={() => { setEditingChatId(null); setEditingTitle(""); }}
                                  className="p-0.5 hover:bg-accent rounded text-muted-foreground"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => {
                                  setActiveChatId(chat.id);
                                  setShowChatsSelector(false);
                                }}
                                className="w-full text-left"
                              >
                                <div className="flex items-center gap-1.5 mb-1">
                                  {chat.strategiesCount > 0 && (
                                    <BookMarked className="h-3 w-3 text-green-600 flex-shrink-0" />
                                  )}
                                  <span className="text-xs font-medium text-foreground truncate">
                                    {chat.title}
                                  </span>
                                </div>
                                {chat.firstMessagePreview && (
                                  <p className="text-[10px] text-muted-foreground line-clamp-1">
                                    {chat.firstMessagePreview}
                                  </p>
                                )}
                                <div className="flex items-center justify-between mt-0.5">
                                  <p className="text-[9px] text-muted-foreground/70">
                                    {new Date(chat.lastModified || chat.createdAt).toLocaleString('es-ES', {
                                      day: '2-digit',
                                      month: '2-digit',
                                      year: '2-digit',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </p>
                                  <p className="text-[9px] text-primary/70 font-medium">
                                    {chat.messageCount} msg{chat.messageCount !== 1 ? 's' : ''}
                                  </p>
                                </div>
                              </button>
                            )}
                          </div>

                          {/* Action buttons */}
                          {editingChatId !== chat.id && (
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingChatId(chat.id);
                                  setEditingTitle(chat.title);
                                }}
                                className="p-1 rounded hover:bg-background text-muted-foreground hover:text-foreground transition-colors"
                                title={t('defense.editTitle')}
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm(t('defense.deleteConfirm'))) {
                                    deleteDefenseChat(chat.id);
                                  }
                                }}
                                className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                title={t('contracts.delete')}
                              >
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

          {savedStrategies.length > 0 && (
            <button
              onClick={() => setShowStrategies(!showStrategies)}
              className="flex items-center gap-2 bg-green-600 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-green-700 transition-colors"
            >
              <BookMarked className="h-3.5 w-3.5" />
              {t('defense.savedStrategiesBtn', { count: savedStrategies.length })}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowInfoModal(true)}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title={t('defense.info') || 'Información'}
          >
            <Info className="h-4 w-4" />
          </button>
          <button
            onClick={openExportModal}
            disabled={savedStrategies.length === 0}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            title={savedStrategies.length === 0 ? t('defense.saveStrategyFirst') : ""}
          >
            <Download className="h-3.5 w-3.5" /> {t('defense.exportToClient')}
          </button>
          <button
            onClick={openImport}
            className="flex items-center gap-2 bg-accent text-foreground px-3 py-1.5 rounded-md text-xs font-medium hover:bg-accent/80 transition-colors"
          >
            <Upload className="h-3.5 w-3.5" /> {t('defense.importClient')}
          </button>
        </div>
      </div>

      {/* Chat */}
      <div className="flex flex-col flex-1 min-h-0">
        {/* Header */}
        <div className="border-b border-border p-4 md:p-6">
          <h2 className="text-lg md:text-xl font-semibold text-foreground">{t('defense.title')}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t('defense.subtitle')}</p>
        </div>

        {/* Messages */}
        <div
          className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 relative"
          onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDraggingOver(false); }}
          onDrop={handlePdfDrop}
        >
          {/* Overlay drag & drop */}
          {(isDraggingOver || isUploadingPdf) && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-primary/10 border-2 border-dashed border-primary rounded-lg pointer-events-none">
              <FileText className="h-12 w-12 text-primary mb-3" />
              {isUploadingPdf
                ? <p className="text-primary font-medium">{t('defense.extracting', {filename: isUploadingPdf})}</p>
                : <><p className="text-primary font-semibold text-lg">{t('defense.dropPdf')}</p><p className="text-primary/70 text-sm mt-1">{t('defense.pdfContext')}</p></>}
            </div>
          )}
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-muted-foreground text-sm">{t('defense.noMessages')}</p>
                <p className="text-muted-foreground/60 text-xs mt-1">{t('defense.startMessage')}</p>
              </div>
            </div>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] md:max-w-[70%] rounded-lg px-4 py-3 text-sm leading-relaxed prose prose-sm dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1 ${
                  msg.role === "user"
                    ? "bg-chat-user text-chat-user-foreground"
                    : "bg-chat-ai text-chat-ai-foreground"
                }`}
              >
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
            </div>
          ))}
          {isLoading && !defIsStreaming && (
            <div className="flex justify-start">
              <div className="bg-chat-ai text-chat-ai-foreground rounded-lg px-4 py-3 text-sm">
                <span className="inline-block animate-pulse">{t('defense.analyzing')}</span>
              </div>
            </div>
          )}
          {defIsStreaming && !defStreamingText && (
            <div className="flex justify-start">
              <div className="bg-chat-ai text-chat-ai-foreground rounded-lg px-4 py-3 text-sm">
                <div className="flex items-center justify-center">
                  <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              </div>
            </div>
          )}
          {defIsStreaming && defStreamingText && (
            <div className="flex justify-start">
              <div className="max-w-[85%] md:max-w-[70%] rounded-lg px-4 py-3 text-sm leading-relaxed prose prose-sm dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1 bg-chat-ai text-chat-ai-foreground">
                <ReactMarkdown>{defStreamingText}</ReactMarkdown>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Input */}
        <div className="border-t border-border p-4">
          {/* Tarjeta PDF adjunto */}
          {attachedPdf && (
            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-md px-3 py-1.5 text-xs text-primary max-w-xs">
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate font-medium">{attachedPdf.filename}</span>
                <button
                  onClick={() => setAttachedPdf(null)}
                  className="ml-1 hover:text-destructive transition-colors shrink-0"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              rows={1}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder={t('defense.placeholder')}
              className="flex-1 bg-accent/50 border border-border rounded-md px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none overflow-hidden"
              disabled={isLoading}
            />
            <button
              onClick={isLoading ? cancelJob : sendMessage}
              disabled={!isLoading && !input.trim() && !attachedPdf}
              className="p-2.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {isLoading ? <StopCircle className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Export Modal */}
      {showExport && (
        <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowExport(false)}>
          <div className="bg-card border border-border rounded-lg w-[95vw] max-w-md p-4 md:p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-foreground">{t('defense.exportModal.title')}</h2>
              <button onClick={() => setShowExport(false)} className="p-1 hover:bg-accent rounded"><X className="h-4 w-4" /></button>
            </div>
            
            {!selectedExportClient ? (
              <>
                <p className="text-xs text-muted-foreground mb-4">{t('defense.exportModal.subtitle')}</p>
                <div className="space-y-2">
                  {clients.map((client) => (
                    <div key={client.id} className="flex items-center justify-between bg-accent/50 rounded-md px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{client.name}</p>
                        <p className="text-xs text-muted-foreground">{client.email}</p>
                      </div>
                      <button
                        onClick={() => selectClientForExport(client)}
                        className="px-3 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
                      >
                        {t('defense.exportModal.select')}
                      </button>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mb-4">{t('defense.exportModal.clientLabel')} <span className="font-medium text-foreground">{selectedExportClient.name}</span></p>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('defense.exportModal.chatTitle')}</label>
                    <input
                      value={exportTitle}
                      onChange={(e) => setExportTitle(e.target.value)}
                      className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      placeholder={t('defense.exportModal.titlePlaceholder')}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedExportClient(null)}
                      className="flex-1 px-4 py-2 rounded-md border border-border hover:bg-accent text-sm text-foreground transition-colors"
                    >
                      {t('defense.exportModal.back')}
                    </button>
                    <button
                      onClick={exportToClient}
                      disabled={!exportTitle.trim()}
                      className="flex-1 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {t('defense.exportModal.export')}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowImport(false)}>
          <div className="bg-card border border-border rounded-lg w-[95vw] max-w-md p-4 md:p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                {importStep === "chats" && (
                  <button onClick={() => setImportStep("clients")} className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground">
                    <ChevronRight className="h-4 w-4 rotate-180" />
                  </button>
                )}
                <h2 className="text-lg font-semibold text-foreground">
                  {importStep === "clients" ? t('defense.importModal.stepClients') : t('defense.importModal.stepChats', {name: selectedImportClient?.name})}
                </h2>
              </div>
              <button onClick={() => setShowImport(false)} className="p-1 hover:bg-accent rounded"><X className="h-4 w-4" /></button>
            </div>

            {importStep === "clients" && (
              <>
                <p className="text-xs text-muted-foreground mb-4">{t('defense.importModal.selectClient')}</p>
                <div className="space-y-2">
                  {clients.map((client) => (
                    <div key={client.id} className="flex items-center justify-between bg-accent/50 rounded-md px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{client.name}</p>
                        <p className="text-xs text-muted-foreground">{client.email}</p>
                      </div>
                      <button
                        onClick={() => selectImportClient(client)}
                        className="px-3 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
                      >
                        {t('defense.exportModal.select')}
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {importStep === "chats" && (
              <>
                <p className="text-xs text-muted-foreground mb-4">{t('defense.importModal.selectChat')}</p>
                <div className="space-y-2">
                  {clientChats.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">{t('defense.importModal.noChats')}</p>
                  ) : (
                    clientChats.map((chat) => (
                      <div key={chat.id} className="flex items-center justify-between bg-accent/50 rounded-md px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">{chat.title}</p>
                          <p className="text-xs text-muted-foreground">{chat.date}</p>
                        </div>
                        <button
                          onClick={() => importFromClient(chat.id)}
                          className="px-3 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
                        >
                          {t('defense.importModal.import')}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Strategies Modal */}
      {showStrategies && (
        <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowStrategies(false)}>
          <div className="bg-card border border-border rounded-lg w-[95vw] max-w-3xl max-h-[80vh] overflow-y-auto p-4 md:p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <BookMarked className="h-5 w-5" />
                {t('defense.strategiesModal.title', {count: savedStrategies.length})}
              </h2>
              <button onClick={() => setShowStrategies(false)} className="p-1 hover:bg-accent rounded">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              {savedStrategies.map((strategy) => (
                <div key={strategy.id} className="bg-accent/30 border border-border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">{strategy.title}</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        {strategy.date ? new Date(strategy.date).toLocaleDateString('es-ES') : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => downloadStrategyPDF(strategy.id)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-primary/10 text-primary hover:bg-primary/20 rounded-md transition-colors"
                      title={t('defense.strategiesModal.download') || 'Descargar PDF'}
                    >
                      <Download className="h-3.5 w-3.5" />
                      PDF
                    </button>
                  </div>

                  <div className="space-y-3 text-xs">
                    {(strategy.sections?.lineasDefensa?.length ?? 0) > 0 && (
                      <div>
                        <p className="font-medium text-foreground mb-1">{t('defense.strategiesModal.defenseLines')}</p>
                        <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                          {strategy.sections!.lineasDefensa.map((linea, idx) => (
                            <li key={idx}>{linea}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {(strategy.sections?.argumentosJuridicos?.length ?? 0) > 0 && (
                      <div>
                        <p className="font-medium text-foreground mb-1">{t('defense.strategiesModal.legalArgs')}</p>
                        <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                          {strategy.sections!.argumentosJuridicos.map((arg, idx) => (
                            <li key={idx}>{arg}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {(strategy.sections?.recomendaciones?.length ?? 0) > 0 && (
                      <div>
                        <p className="font-medium text-green-600 mb-1">{t('defense.strategiesModal.recommendations')}</p>
                        <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                          {strategy.sections!.recomendaciones.map((rec, idx) => (
                            <li key={idx}>{rec}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {t('defense.strategiesModal.note')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Info Modal */}
      {showInfoModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowInfoModal(false)}>
          <div className="bg-card border border-border rounded-xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Info className="h-5 w-5 text-primary" />
                {t('defense.infoModal.title') || 'Preparación de defensa'}
              </h2>
              <button onClick={() => setShowInfoModal(false)} className="p-1 hover:bg-accent rounded">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>{t('defense.infoModal.desc1') || 'Este chat te permite preparar estrategias de defensa judicial con ayuda de la IA. Puedes:'}</p>
              <ul className="list-disc list-inside space-y-1.5 ml-1">
                <li>{t('defense.infoModal.item1') || 'Estructurar líneas de defensa y argumentos jurídicos'}</li>
                <li>{t('defense.infoModal.item2') || 'Identificar puntos débiles y preparar contra-argumentos'}</li>
                <li>{t('defense.infoModal.item3') || 'Pedir a la IA que guarde la estrategia desarrollada'}</li>
                <li>{t('defense.infoModal.item4') || 'Exportar la defensa como PDF al expediente de un cliente'}</li>
                <li>{t('defense.infoModal.item5') || 'Adjuntar documentos PDF para que la IA los analice'}</li>
              </ul>
              <p className="text-xs border-t border-border pt-3 mt-3">
                {t('defense.infoModal.tip') || '💡 Consejo: Cuando la estrategia esté completa, pide a la IA "guarda esta estrategia" y podrás exportarla después con el botón "Exportar a cliente".'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DefensePrep;
