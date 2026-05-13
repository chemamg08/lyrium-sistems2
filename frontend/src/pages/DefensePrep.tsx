import { useState, useEffect, useRef } from "react";
import { X, Download, Upload, ChevronRight, Send, Paperclip, BookMarked, StopCircle, MessageSquare, Plus, Search, Pencil, Check, Trash2, FileText, Info, Brain, FolderOpen, Flag, Shield, RefreshCw, CheckCircle2, Calendar } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/use-toast";
import { useStreamingChat } from "@/hooks/useStreamingChat";
import { authFetch } from '../lib/authFetch';
import ModuleGuide from "@/components/ModuleGuide";

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
  flags?: { id: string }[];
  reasoning?: string;
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

const API_URL = import.meta.env.VITE_API_URL;
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
  const { streamingText: defStreamingText, streamingReasoning: defStreamingReasoning, isStreaming: defIsStreaming, isSaving: defIsSaving, startStream: defStartStream, cancelStream: defCancelStream } = useStreamingChat();
  const pendingDefReasoningRef = useRef('');
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isUploadingPdf, setIsUploadingPdf] = useState<string | null>(null); // nombre del archivo
  const [attachedPdf, setAttachedPdf] = useState<{ filename: string; text: string } | null>(null);
  const [ragEnabled, setRagEnabled] = useState(false);
  const [hasImproveAI, setHasImproveAI] = useState(false);
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
  const [isPollingForResponse, setIsPollingForResponse] = useState(false);
  const [exportClientSearch, setExportClientSearch] = useState("");
  const [importClientSearch, setImportClientSearch] = useState("");
  const [showFlagPanel, setShowFlagPanel] = useState(false);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Evidence states
  const [activeTab, setActiveTab] = useState<'chat' | 'evidence'>('chat');
  const [evidenceList, setEvidenceList] = useState<any[]>([]);
  const [loadingEvidence, setLoadingEvidence] = useState(false);
  const [showEvidenceForm, setShowEvidenceForm] = useState(false);
  const [editingEvidence, setEditingEvidence] = useState<any>(null);
  const [evidenceForm, setEvidenceForm] = useState({ exhibitNumber: '', type: '', description: '', fileName: '', dateObtained: '', status: 'pending' });
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidenceToDelete, setEvidenceToDelete] = useState<string | null>(null);
  const [showEvidenceLibrary, setShowEvidenceLibrary] = useState(false);
  const [showEvidenceTrash, setShowEvidenceTrash] = useState(false);
  const [evidenceViewerItem, setEvidenceViewerItem] = useState<any | null>(null);
  const [evidenceQuota, setEvidenceQuota] = useState<{ used: number; limit: number } | null>(null);
  const [isUploadingEvidence, setIsUploadingEvidence] = useState(false);
  // Counter-replica states
  const [simulatingCounter, setSimulatingCounter] = useState(false);
  const [counterReplicaResult, setCounterReplicaResult] = useState<any>(null);
  const [savingCounter, setSavingCounter] = useState(false);

  // Mantener ref sincronizado con el estado para evitar stale closures
  useEffect(() => { activeChatIdRef.current = activeChatId; }, [activeChatId]);

  useEffect(() => {
    initDefenseChats();
    loadClients();
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

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, defStreamingText]);

  // Cargar chat activo cuando cambia
  useEffect(() => {
    if (activeChatId) {
      loadDefenseChat(activeChatId);
      loadSavedStrategies(activeChatId);
      sessionStorage.setItem(ACTIVE_DEFENSE_CHAT_KEY, activeChatId);

      // Detectar si hay un stream en curso (componente fue remontado)
      const streamingFlag = sessionStorage.getItem(`streaming_defense_${activeChatId}`);
      if (streamingFlag) {
        const expectedMsgCount = parseInt(streamingFlag, 10);
        setIsPollingForResponse(true);
        setIsLoading(true);
        if (pollingRef.current) clearInterval(pollingRef.current);
        pollingRef.current = setInterval(async () => {
          try {
            const accountId = sessionStorage.getItem('accountId');
            if (!accountId) return;
            const res = await authFetch(`${API_URL}/defense-chat?accountId=${accountId}&chatId=${activeChatId}`);
            if (res.ok) {
              const data = await res.json();
              const msgs: Message[] = data.messages || [];
              if (msgs.length > expectedMsgCount) {
                // La respuesta de la IA ya está en BD
                setMessages(msgs);
                setIsPollingForResponse(false);
                setIsLoading(false);
                sessionStorage.removeItem(`streaming_defense_${activeChatId}`);
                if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
                loadSavedStrategies(activeChatId);
                initDefenseChats();
              }
            }
          } catch { /* ignore polling errors */ }
        }, 2000);
      }
    }
    return () => {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    };
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

  const loadEvidence = async () => {
    if (!activeChatId) return;
    const accountId = sessionStorage.getItem('accountId');
    if (!accountId) return;
    setLoadingEvidence(true);
    try {
      const res = await authFetch(`${import.meta.env.VITE_API_URL}/defense-chat/${activeChatId}/evidence?accountId=${accountId}`);
      if (res.ok) setEvidenceList(await res.json());
    } catch (err) { console.error(err); }
    setLoadingEvidence(false);
  };

  useEffect(() => {
    if (activeTab === 'evidence' && activeChatId) loadEvidence();
  }, [activeTab, activeChatId]);

  const handleSaveEvidence = async () => {
    if (!activeChatId) return;
    const accountId = sessionStorage.getItem('accountId');
    if (!accountId) return;
    try {
      if (!editingEvidence && evidenceFile) {
        // Crear con archivo via upload endpoint
        const formData = new FormData();
        formData.append('file', evidenceFile);
        formData.append('accountId', accountId);
        formData.append('exhibitNumber', evidenceForm.exhibitNumber || `EXH-${String(evidenceList.length + 1).padStart(3, '0')}`);
        formData.append('type', evidenceForm.type || evidenceFile.type.split('/')[1]?.toUpperCase() || 'ARCHIVO');
        formData.append('description', evidenceForm.description || evidenceFile.name);
        formData.append('dateObtained', evidenceForm.dateObtained || new Date().toISOString().split('T')[0]);
        formData.append('status', evidenceForm.status || 'pending');

        const res = await authFetch(`${import.meta.env.VITE_API_URL}/defense-chat/${activeChatId}/evidence/upload`, {
          method: 'POST',
          body: formData,
        });
        if (res.ok) {
          setShowEvidenceForm(false);
          setEditingEvidence(null);
          setEvidenceForm({ exhibitNumber: '', type: '', description: '', fileName: '', dateObtained: '', status: 'pending' });
          setEvidenceFile(null);
          loadEvidence();
        } else {
          const err = await res.json();
          toast({ title: err.error || 'Error al subir prueba', variant: 'destructive' });
        }
      } else {
        // Sin archivo: comportamiento anterior (crear/editar metadatos)
        const url = editingEvidence
          ? `${import.meta.env.VITE_API_URL}/defense-chat/evidence/${editingEvidence._id || editingEvidence.id}`
          : `${import.meta.env.VITE_API_URL}/defense-chat/${activeChatId}/evidence`;
        const method = editingEvidence ? 'PUT' : 'POST';
        const body = { accountId, ...evidenceForm };
        const res = await authFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (res.ok) {
          setShowEvidenceForm(false);
          setEditingEvidence(null);
          setEvidenceForm({ exhibitNumber: '', type: '', description: '', fileName: '', dateObtained: '', status: 'pending' });
          setEvidenceFile(null);
          loadEvidence();
        }
      }
    } catch (err) {
      console.error(err);
      toast({ title: 'Error al guardar prueba', variant: 'destructive' });
    }
  };

  const handleDeleteEvidence = async (evidenceId: string) => {
    const accountId = sessionStorage.getItem('accountId');
    if (!accountId) return;
    try {
      const res = await authFetch(`${import.meta.env.VITE_API_URL}/defense-chat/evidence/${evidenceId}?accountId=${accountId}`, { method: 'DELETE' });
      if (res.ok) {
        setEvidenceToDelete(null);
        loadEvidence();
      }
    } catch (err) { console.error(err); }
  };

  const startEditEvidence = (ev: any) => {
    setEditingEvidence(ev);
    setEvidenceForm({
      exhibitNumber: ev.exhibitNumber || '',
      type: ev.type || '',
      description: ev.description || '',
      fileName: ev.fileName || '',
      dateObtained: ev.dateObtained || '',
      status: ev.status || 'pending',
    });
    setShowEvidenceForm(true);
  };

  const handleSimulateCounter = async () => {
    if (!activeChatId) return;
    const accountId = sessionStorage.getItem('accountId');
    if (!accountId) return;
    setSimulatingCounter(true);
    setCounterReplicaResult(null);
    try {
      const res = await authFetch(`${import.meta.env.VITE_API_URL}/defense-chat/${activeChatId}/simulate-counter-replica`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, strategyId: savedStrategies[0]?.id || null }),
      });
      if (res.ok) {
        const data = await res.json();
        setCounterReplicaResult(data.counterReplica);
      }
    } catch (err) { console.error(err); }
    setSimulatingCounter(false);
  };

  const handleSaveCounterReplica = async () => {
    if (!activeChatId || !counterReplicaResult) return;
    const accountId = sessionStorage.getItem('accountId');
    if (!accountId) return;
    setSavingCounter(true);
    try {
      const res = await authFetch(`${import.meta.env.VITE_API_URL}/defense-chat/${activeChatId}/simulate-counter-replica`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, strategyId: savedStrategies[0]?.id || null }),
      });
      if (res.ok) {
        loadSavedStrategies(activeChatId);
      }
    } catch (err) { console.error(err); }
    setSavingCounter(false);
  };

  const cycleEvidenceStatus = async (evidence: any) => {
    const accountId = sessionStorage.getItem('accountId');
    if (!accountId) return;
    const order = ['pending', 'presented', 'admitted', 'excluded'];
    const currentIdx = order.indexOf(evidence.status);
    const nextStatus = order[(currentIdx + 1) % order.length];
    try {
      const res = await authFetch(`${import.meta.env.VITE_API_URL}/defense-chat/evidence/${evidence._id || evidence.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, status: nextStatus }),
      });
      if (res.ok) loadEvidence();
    } catch (err) { console.error(err); }
  };

  const loadEvidenceQuota = async () => {
    const accountId = sessionStorage.getItem('accountId');
    if (!accountId) return;
    try {
      const res = await authFetch(`${import.meta.env.VITE_API_URL}/defense-chat/evidence/quota?accountId=${accountId}`);
      if (res.ok) setEvidenceQuota(await res.json());
    } catch (err) { console.error(err); }
  };

  const loadEvidenceLibrary = async () => {
    const accountId = sessionStorage.getItem('accountId');
    if (!accountId) return;
    try {
      const res = await authFetch(`${import.meta.env.VITE_API_URL}/defense-chat/evidence/library?accountId=${accountId}`);
      if (res.ok) setEvidenceList(await res.json());
    } catch (err) { console.error(err); }
  };

  const loadEvidenceTrash = async () => {
    const accountId = sessionStorage.getItem('accountId');
    if (!accountId) return;
    try {
      const res = await authFetch(`${import.meta.env.VITE_API_URL}/defense-chat/evidence/trash?accountId=${accountId}`);
      if (res.ok) setEvidenceList(await res.json());
    } catch (err) { console.error(err); }
  };

  const handleUploadEvidence = async (file: File, chatId: string) => {
    const accountId = sessionStorage.getItem('accountId');
    if (!accountId || !chatId) return;
    setIsUploadingEvidence(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('accountId', accountId);
      formData.append('exhibitNumber', `EXH-${String(evidenceList.length + 1).padStart(3, '0')}`);
      formData.append('type', file.type.split('/')[1]?.toUpperCase() || 'ARCHIVO');
      formData.append('description', file.name);
      formData.append('status', 'pending');

      const res = await authFetch(`${import.meta.env.VITE_API_URL}/defense-chat/${chatId}/evidence/upload`, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        toast({ title: 'Archivo subido correctamente' });
        loadEvidenceLibrary();
        loadEvidenceQuota();
        if (activeTab === 'evidence') loadEvidence();
      } else {
        const err = await res.json();
        toast({ title: err.error || 'Error al subir archivo', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: 'Error al subir archivo', variant: 'destructive' });
    } finally {
      setIsUploadingEvidence(false);
    }
  };

  const handleTrashEvidence = async (evidenceId: string) => {
    const accountId = sessionStorage.getItem('accountId');
    if (!accountId) return;
    try {
      const res = await authFetch(`${import.meta.env.VITE_API_URL}/defense-chat/evidence/${evidenceId}/trash`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });
      if (res.ok) {
        loadEvidenceLibrary();
        loadEvidenceQuota();
        if (activeTab === 'evidence') loadEvidence();
      }
    } catch (err) { console.error(err); }
  };

  const handleRestoreEvidence = async (evidenceId: string) => {
    const accountId = sessionStorage.getItem('accountId');
    if (!accountId) return;
    try {
      const res = await authFetch(`${import.meta.env.VITE_API_URL}/defense-chat/evidence/${evidenceId}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });
      if (res.ok) {
        loadEvidenceTrash();
        loadEvidenceQuota();
      }
    } catch (err) { console.error(err); }
  };

  const handlePermanentDeleteEvidence = async (evidenceId: string) => {
    const accountId = sessionStorage.getItem('accountId');
    if (!accountId) return;
    try {
      const res = await authFetch(`${import.meta.env.VITE_API_URL}/defense-chat/evidence/${evidenceId}/permanent?accountId=${accountId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        loadEvidenceTrash();
        loadEvidenceQuota();
      }
    } catch (err) { console.error(err); }
  };

  const openEvidenceViewer = (ev: any) => {
    if (!ev.filePath && !ev.publicToken) return;
    setEvidenceViewerItem(ev);
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
    const currentMsgCount = messages.length + 1; // +1 por el mensaje user que estamos a punto de añadir
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'user',
      content: userContent
    }]);

    // Marcar que hay un stream en curso para este chat
    sessionStorage.setItem(`streaming_defense_${activeChatId}`, String(currentMsgCount));
    pendingDefReasoningRef.current = '';

    try {
      await defStartStream({
        endpoint: "/defense-chat/message/stream",
        body: { content: userContent, accountId, chatId: activeChatId, ...(ragEnabled ? { ragEnabled: true } : {}) },
        onDoneReasoning: (fullReasoning) => { pendingDefReasoningRef.current = fullReasoning; },
        onDone: async (fullText) => {
          // Limpiar flag de streaming (funciona incluso si el componente fue desmontado)
          const doneChatId = activeChatIdRef.current;
          if (doneChatId) sessionStorage.removeItem(`streaming_defense_${doneChatId}`);

          const content = ragEnabled ? `${fullText}\n<!-- rag-enhanced -->` : fullText;
          setMessages(prev => [...prev, {
            id: `ai-${Date.now()}`,
            role: 'assistant',
            content,
            reasoning: pendingDefReasoningRef.current || undefined
          }]);
          pendingDefReasoningRef.current = '';
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

    const file = Array.from(e.dataTransfer.files)[0];
    if (!file) return;

    if (activeTab === 'evidence' && activeChatId) {
      await handleUploadEvidence(file, activeChatId);
      return;
    }

    if (file.type !== 'application/pdf') {
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
    setExportClientSearch("");
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
    setImportClientSearch("");
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
        body: JSON.stringify({ chatId, accountId, targetChatId: activeChatIdRef.current })
      });

      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
        if (data.chatId) {
          setActiveChatId(data.chatId);
          setSavedStrategies([]);
          loadSavedStrategies(data.chatId);
        }
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

  const toggleFlag = async (messageId: string) => {
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return;
    const isFlagged = msg.flags && msg.flags.length > 0;
    const chatId = activeChatId || '';
    try {
      if (isFlagged) {
        const flagId = msg.flags[msg.flags.length - 1].id;
        const res = await authFetch(`${import.meta.env.VITE_API_URL}/flags/defense/${chatId}/messages/${messageId}/flags/${flagId}`, { method: 'DELETE' });
        if (res.ok) {
          const data = await res.json();
          setMessages(prev => prev.map(m => m.id === messageId ? { ...m, flags: data.flags } : m));
        }
      } else {
        const res = await authFetch(`${import.meta.env.VITE_API_URL}/flags/defense/${chatId}/messages/${messageId}`, { method: 'POST' });
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

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <ModuleGuide moduleId="defense" />
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

        {/* Tabs */}
        <div className="flex items-center gap-1 px-4 border-b border-border">
          <button
            onClick={() => setActiveTab('chat')}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${activeTab === 'chat' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {t('defense.chat') || 'Chat'}
          </button>
          <button
            onClick={() => { setActiveTab('evidence'); loadEvidence(); }}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${activeTab === 'evidence' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {t('defense.evidence') || 'Pruebas'} {evidenceList.length > 0 && <span className="ml-1 text-xs opacity-60">({evidenceList.length})</span>}
          </button>
        </div>

        {/* Messages */}
        {activeTab === 'chat' && (
        <>
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
          {messages.map((msg) => {
            const isRagEnhanced = msg.role === 'assistant' && msg.content.includes('<!-- rag-enhanced -->');
            const displayContent = isRagEnhanced ? msg.content.replace(/\n?<!-- rag-enhanced -->/g, '') : msg.content;
            return (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                id={`msg-${msg.id}`}
                className={`max-w-[85%] md:max-w-[70%] rounded-lg px-4 py-3 text-sm leading-relaxed prose prose-sm dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1 relative group transition-all ${highlightedMsgId === msg.id ? 'ring-2 ring-yellow-500' : ''} ${msg.flags && msg.flags.length > 0 ? 'border-l-2 border-l-yellow-500' : ''} ${
                  msg.role === "user"
                    ? "bg-chat-user text-chat-user-foreground"
                    : "bg-chat-ai text-chat-ai-foreground"
                }`}
              >
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
                <ReactMarkdown>{displayContent}</ReactMarkdown>
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
            </div>
            );
          })}
          {(isLoading || isPollingForResponse) && !defIsStreaming && (
            <div className="flex justify-start">
              <div className="bg-chat-ai text-chat-ai-foreground rounded-lg px-4 py-3 text-sm">
                <span className="inline-block animate-pulse">{t('defense.analyzing')}</span>
              </div>
            </div>
          )}
          {defIsStreaming && !defStreamingText && !defStreamingReasoning && (
            <div className="flex justify-start">
              <div className="bg-chat-ai text-chat-ai-foreground rounded-lg px-4 py-3 text-sm">
                <div className="flex items-center justify-center">
                  <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              </div>
            </div>
          )}
          {defIsStreaming && (defStreamingText || defStreamingReasoning) && (
            <div className="flex justify-start">
              <div className="max-w-[85%] md:max-w-[70%] rounded-lg px-4 py-3 text-sm leading-relaxed prose prose-sm dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1 bg-chat-ai text-chat-ai-foreground">
                {defStreamingReasoning && (
                  <details className="mb-2 not-prose" open>
                    <summary className="text-xs text-muted-foreground cursor-pointer select-none flex items-center gap-1.5 list-none">
                      <Brain className="h-3 w-3" />
                      <span>Pensando...</span>
                    </summary>
                    <div className="mt-1.5 text-xs text-muted-foreground/80 font-mono whitespace-pre-wrap border-t border-border/40 pt-1.5" style={{ maxHeight: '4.5em', overflowY: 'auto' }}>
                      {defStreamingReasoning}
                    </div>
                  </details>
                )}
                <ReactMarkdown>{defStreamingText}</ReactMarkdown>
              </div>
            </div>
          )}
          <div ref={endRef} />
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

        {/* Counter-replica section */}
        <>
          {/* Simulation button */}
          <div className="px-4 md:px-8 pb-2">
            <button
              onClick={handleSimulateCounter}
              disabled={simulatingCounter}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 text-sm font-medium hover:bg-purple-500/20 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={16} className={simulatingCounter ? 'animate-spin' : ''} />
              {t('defense.simulateCounter') || 'Simular contrarréplica'}
            </button>
          </div>

          {/* Simulation result */}
          {counterReplicaResult && (
            <div className="px-4 md:px-8 pb-4">
              <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-5 space-y-4">
                <h4 className="font-semibold text-purple-400 flex items-center gap-2">
                  <Shield size={18} />
                  {t('defense.counterResult') || 'Resultado de la simulación'}
                </h4>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">{t('defense.opponentArgs') || '⚖️ Argumentos de la contraparte:'}</p>
                  <ul className="space-y-1">
                    {counterReplicaResult.opponentArguments?.map((arg: string, i: number) => (
                      <li key={i} className="text-sm text-muted-foreground flex gap-2"><span className="text-purple-400">•</span>{arg}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">{t('defense.rebuttals') || '🛡️ Cómo rebatirlos:'}</p>
                  <ul className="space-y-1">
                    {counterReplicaResult.rebuttals?.map((r: string, i: number) => (
                      <li key={i} className="text-sm text-muted-foreground flex gap-2"><span className="text-green-400">•</span>{r}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-medium text-muted-foreground">{t('defense.strength') || '📊 Fortaleza de la defensa'}</p>
                    <span className="text-sm font-bold text-purple-400">{counterReplicaResult.strengthScore}/100</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-purple-500 to-purple-400 rounded-full transition-all" style={{ width: `${counterReplicaResult.strengthScore}%` }} />
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleSaveCounterReplica}
                    disabled={savingCounter}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/20 text-green-400 text-sm font-medium hover:bg-green-500/30 transition-colors disabled:opacity-50"
                  >
                    <CheckCircle2 size={14} />
                    {t('defense.saveToStrategy') || 'Guardar en estrategia'}
                  </button>
                  <button onClick={() => setCounterReplicaResult(null)} className="px-3 py-2 rounded-lg border text-sm hover:bg-muted">{t('cases.cancel') || 'Cerrar'}</button>
                </div>
              </div>
            </div>
          )}
        </>

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
            {hasImproveAI && (
              <button
                onClick={() => setRagEnabled(!ragEnabled)}
                className={`p-2 rounded-md transition-colors shrink-0 ${ragEnabled ? 'bg-primary/20 text-primary' : 'hover:bg-accent text-muted-foreground hover:text-foreground'}`}
                title={t('improveAI.ragToggle')}
              >
                <Brain className="h-5 w-5" />
              </button>
            )}
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
        </>
        )}

        {/* Evidence Panel */}
        {activeTab === 'evidence' && (
          <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold">{t('defense.evidenceList') || 'Pruebas del caso'}</h3>
                {evidenceQuota && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Espacio usado: {(evidenceQuota.used / (1024 * 1024 * 1024)).toFixed(2)} GB / {(evidenceQuota.limit / (1024 * 1024 * 1024)).toFixed(0)} GB
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { setShowEvidenceLibrary(true); loadEvidenceLibrary(); loadEvidenceQuota(); }} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent text-foreground text-sm font-medium hover:bg-accent/80 transition-colors">
                  <FolderOpen size={16} />
                  Biblioteca
                </button>
                <button onClick={() => { setShowEvidenceForm(true); setEditingEvidence(null); setEvidenceForm({ exhibitNumber: `EXH-${String(evidenceList.length + 1).padStart(3, '0')}`, type: '', description: '', fileName: '', dateObtained: new Date().toISOString().split('T')[0], status: 'pending' }); }} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
                  <Plus size={16} />
                  {t('defense.addEvidence') || 'Añadir'}
                </button>
              </div>
            </div>
            {loadingEvidence ? (
              <p className="text-sm text-muted-foreground text-center py-12">{t('cases.loading') || 'Cargando...'}</p>
            ) : evidenceList.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">{t('defense.noEvidence') || 'No hay pruebas registradas'}</p>
            ) : (
              <div className="space-y-3">
                {evidenceList.map((ev) => (
                  <div key={ev._id || ev.id} className="bg-card border rounded-lg p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono font-bold text-primary">{ev.exhibitNumber}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium cursor-pointer transition-colors ${
                            ev.status === 'admitted' ? 'bg-green-500/20 text-green-400' :
                            ev.status === 'presented' ? 'bg-blue-500/20 text-blue-400' :
                            ev.status === 'excluded' ? 'bg-red-500/20 text-red-400' :
                            'bg-yellow-500/20 text-yellow-400'
                          }`} onClick={() => cycleEvidenceStatus(ev)} title="Clic para cambiar estado">
                            {ev.status === 'admitted' ? (t('defense.admitted') || 'Admitida') :
                             ev.status === 'presented' ? (t('defense.presented') || 'Presentada') :
                             ev.status === 'excluded' ? (t('defense.excluded') || 'Excluida') :
                             (t('defense.pending') || 'Pendiente')}
                          </span>
                          {ev.type && <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{ev.type}</span>}
                        </div>
                        <p className="text-sm font-medium truncate">{ev.description}</p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                          <span>{ev.dateObtained ? new Date(ev.dateObtained).toLocaleDateString() : '—'}</span>
                          {ev.fileName && (
                            <button
                              onClick={() => openEvidenceViewer(ev)}
                              className="text-primary hover:underline cursor-pointer"
                            >
                              📎 {ev.fileName}
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => startEditEvidence(ev)} className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Pencil size={14} /></button>
                        <button onClick={() => handleTrashEvidence(ev._id || ev.id)} className="p-1.5 rounded hover:bg-yellow-500/20 text-yellow-400" title="Mover a papelera"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
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
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    value={exportClientSearch}
                    onChange={(e) => setExportClientSearch(e.target.value)}
                    className="w-full bg-accent/50 border border-border rounded-md pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
                    placeholder={t('clients.search')}
                  />
                </div>
                <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                  {clients.filter(c => c.name.toLowerCase().includes(exportClientSearch.toLowerCase()) || c.email.toLowerCase().includes(exportClientSearch.toLowerCase())).map((client) => (
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
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    value={importClientSearch}
                    onChange={(e) => setImportClientSearch(e.target.value)}
                    className="w-full bg-accent/50 border border-border rounded-md pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
                    placeholder={t('clients.search')}
                  />
                </div>
                <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                  {clients.filter(c => c.name.toLowerCase().includes(importClientSearch.toLowerCase()) || c.email.toLowerCase().includes(importClientSearch.toLowerCase())).map((client) => (
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

      {/* Evidence Form Modal */}
      {showEvidenceForm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="bg-card border rounded-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-4">{editingEvidence ? (t('defense.editEvidence') || 'Editar prueba') : (t('defense.newEvidence') || 'Nueva prueba')}</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium mb-1 block">{t('defense.exhibitNumber') || 'Nº Exhibit'}</label>
                  <input value={evidenceForm.exhibitNumber} onChange={(e) => setEvidenceForm({ ...evidenceForm, exhibitNumber: e.target.value })} className="w-full px-3 py-2 bg-muted border rounded-lg text-sm" placeholder="EXH-001" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">{t('defense.evidenceType') || 'Tipo'}</label>
                  <input value={evidenceForm.type} onChange={(e) => setEvidenceForm({ ...evidenceForm, type: e.target.value })} className="w-full px-3 py-2 bg-muted border rounded-lg text-sm" placeholder="Testimonio, Documento..." />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">{t('defense.description') || 'Descripción'}</label>
                <input value={evidenceForm.description} onChange={(e) => setEvidenceForm({ ...evidenceForm, description: e.target.value })} className="w-full px-3 py-2 bg-muted border rounded-lg text-sm" placeholder="Descripción de la prueba..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium mb-1 block">{t('defense.fileName') || 'Nombre archivo'}</label>
                  <input value={evidenceForm.fileName} onChange={(e) => setEvidenceForm({ ...evidenceForm, fileName: e.target.value })} className="w-full px-3 py-2 bg-muted border rounded-lg text-sm" placeholder="referencia.pdf" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">{t('defense.dateObtained') || 'Fecha'}</label>
                  <input type="date" value={evidenceForm.dateObtained} onChange={(e) => setEvidenceForm({ ...evidenceForm, dateObtained: e.target.value })} className="w-full px-3 py-2 bg-muted border rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">{t('defense.status') || 'Estado'}</label>
                <select value={evidenceForm.status} onChange={(e) => setEvidenceForm({ ...evidenceForm, status: e.target.value })} className="w-full px-3 py-2 bg-muted border rounded-lg text-sm">
                  <option value="pending">{t('defense.pending') || 'Pendiente'}</option>
                  <option value="presented">{t('defense.presented') || 'Presentada'}</option>
                  <option value="admitted">{t('defense.admitted') || 'Admitida'}</option>
                  <option value="excluded">{t('defense.excluded') || 'Excluida'}</option>
                </select>
              </div>
              {!editingEvidence && (
                <div>
                  <label className="text-sm font-medium mb-1 block">{t('common.upload') || 'Subir'}</label>
                  <input
                    type="file"
                    onChange={(e) => setEvidenceFile(e.target.files?.[0] || null)}
                    className="w-full px-3 py-2 bg-muted border rounded-lg text-sm file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                  />
                  {evidenceFile && (
                    <p className="text-xs text-muted-foreground mt-1">{evidenceFile.name}</p>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => { setShowEvidenceForm(false); setEditingEvidence(null); setEvidenceFile(null); }} className="px-4 py-2 rounded-lg border text-sm hover:bg-muted">{t('cases.cancel') || 'Cancelar'}</button>
              <button onClick={handleSaveEvidence} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90">{t('cases.save') || 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Evidence Confirmation */}
      {evidenceToDelete && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
          <div className="bg-card border rounded-xl w-full max-w-sm p-6 text-center">
            <h3 className="text-lg font-bold mb-2">{t('defense.deleteEvidence') || 'Eliminar prueba'}</h3>
            <p className="text-sm text-muted-foreground mb-6">{t('defense.deleteEvidenceMsg') || '¿Estás seguro?'}</p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setEvidenceToDelete(null)} className="px-4 py-2 rounded-lg border text-sm hover:bg-muted">{t('cases.cancel') || 'Cancelar'}</button>
              <button onClick={() => handleDeleteEvidence(evidenceToDelete)} className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600">{t('cases.delete') || 'Eliminar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Evidence Library Modal */}
      {showEvidenceLibrary && (
        <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowEvidenceLibrary(false)}>
          <div className="bg-card border border-border rounded-lg w-[95vw] max-w-2xl max-h-[80vh] overflow-y-auto p-4 md:p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Biblioteca de pruebas</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => { setShowEvidenceTrash(true); setShowEvidenceLibrary(false); loadEvidenceTrash(); }} className="text-xs text-muted-foreground hover:text-foreground underline">Ver papelera</button>
                <button onClick={() => setShowEvidenceLibrary(false)} className="p-1 hover:bg-accent rounded"><X className="h-4 w-4" /></button>
              </div>
            </div>
            {evidenceQuota && (
              <div className="mb-4">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Espacio usado</span>
                  <span className="font-medium">{(evidenceQuota.used / (1024 * 1024 * 1024)).toFixed(2)} GB / {(evidenceQuota.limit / (1024 * 1024 * 1024)).toFixed(0)} GB</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min((evidenceQuota.used / evidenceQuota.limit) * 100, 100)}%` }} />
                </div>
              </div>
            )}
            {isUploadingEvidence && (
              <p className="text-sm text-muted-foreground text-center py-4">Subiendo archivo...</p>
            )}
            <div className="space-y-2">
              {evidenceList.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No hay pruebas en la biblioteca</p>
              ) : (
                evidenceList.map((ev) => (
                  <div key={ev._id || ev.id} className="flex items-center justify-between bg-accent/30 rounded-md px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{ev.description || ev.fileName}</p>
                      <p className="text-xs text-muted-foreground">{ev.fileName} · {(ev.fileSize / (1024 * 1024)).toFixed(2)} MB</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => openEvidenceViewer(ev)} className="p-1.5 rounded hover:bg-muted text-primary" title="Ver"><FolderOpen size={14} /></button>
                      <button onClick={() => handleTrashEvidence(ev._id || ev.id)} className="p-1.5 rounded hover:bg-yellow-500/20 text-yellow-400" title="Papelera"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Evidence Trash Modal */}
      {showEvidenceTrash && (
        <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowEvidenceTrash(false)}>
          <div className="bg-card border border-border rounded-lg w-[95vw] max-w-2xl max-h-[80vh] overflow-y-auto p-4 md:p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Papelera de pruebas</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => { setShowEvidenceLibrary(true); setShowEvidenceTrash(false); loadEvidenceLibrary(); }} className="text-xs text-muted-foreground hover:text-foreground underline">Volver a biblioteca</button>
                <button onClick={() => setShowEvidenceTrash(false)} className="p-1 hover:bg-accent rounded"><X className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="space-y-2">
              {evidenceList.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">La papelera está vacía</p>
              ) : (
                evidenceList.map((ev) => (
                  <div key={ev._id || ev.id} className="flex items-center justify-between bg-accent/30 rounded-md px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{ev.description || ev.fileName}</p>
                      <p className="text-xs text-muted-foreground">{ev.fileName} · Eliminada: {ev.deletedAt ? new Date(ev.deletedAt).toLocaleDateString() : '—'}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => handleRestoreEvidence(ev._id || ev.id)} className="p-1.5 rounded hover:bg-green-500/20 text-green-400" title="Restaurar"><Check className="h-3.5 w-3.5" /></button>
                      <button onClick={() => handlePermanentDeleteEvidence(ev._id || ev.id)} className="p-1.5 rounded hover:bg-red-500/20 text-red-400" title="Eliminar definitivamente"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Evidence Viewer Modal */}
      {evidenceViewerItem && (
        <div className="fixed inset-0 bg-black/70 z-[80] flex items-center justify-center p-4" onClick={() => setEvidenceViewerItem(null)}>
          <div className="bg-card border border-border rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold truncate pr-4">{evidenceViewerItem.description || evidenceViewerItem.fileName}</h3>
              <button onClick={() => setEvidenceViewerItem(null)} className="p-1 hover:bg-accent rounded"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-black/50">
              {evidenceViewerItem.mimeType?.startsWith('image/') ? (
                <img src={`${import.meta.env.VITE_API_URL}/public/evidence/${evidenceViewerItem.publicToken}`} alt={evidenceViewerItem.fileName} className="max-w-full max-h-[70vh] object-contain rounded" />
              ) : evidenceViewerItem.mimeType?.startsWith('video/') ? (
                <video src={`${import.meta.env.VITE_API_URL}/public/evidence/${evidenceViewerItem.publicToken}`} controls className="max-w-full max-h-[70vh] rounded" />
              ) : evidenceViewerItem.mimeType?.startsWith('audio/') ? (
                <audio src={`${import.meta.env.VITE_API_URL}/public/evidence/${evidenceViewerItem.publicToken}`} controls className="w-full max-w-md" />
              ) : evidenceViewerItem.mimeType === 'application/pdf' ? (
                <iframe src={`${import.meta.env.VITE_API_URL}/public/evidence/${evidenceViewerItem.publicToken}`} className="w-full h-[70vh] rounded" />
              ) : (
                <div className="text-center">
                  <p className="text-muted-foreground mb-4">Vista previa no disponible</p>
                  <a href={`${import.meta.env.VITE_API_URL}/public/evidence/${evidenceViewerItem.publicToken}`} download className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">Descargar archivo</a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DefensePrep;
