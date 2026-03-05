import { useState, useRef, useEffect } from "react";
import { Upload, Info, X, Eye, Trash2, ChevronDown, Image, MessageSquare, Plus, FileText, Check, Pencil, Copy, Search } from "lucide-react";
import ChatInterface from "@/components/ChatInterface";
import ContractChatInterface from "@/components/ContractChatInterface";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/use-toast";
import { authFetch } from '../lib/authFetch';

interface ContractBase {
  id: string;
  name: string;
  summary: string;
  fileName: string;
  filePath: string;
}

interface ContractChat {
  id: string;
  contractBaseId: string;
  title: string;
  date: string;
  messages: any[];
  lastModified?: string;
  firstMessagePreview?: string;
  hasGeneratedContract?: boolean;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const Contracts = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [contracts, setContracts] = useState<ContractBase[]>([]);
  const [selectedContract, setSelectedContract] = useState<ContractBase | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showLogoModal, setShowLogoModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showHowToModal, setShowHowToModal] = useState(false);
  const [showSelector, setShowSelector] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [contractToDelete, setContractToDelete] = useState<string | null>(null);
  const [uploadForm, setUploadForm] = useState({ name: "", summary: "" });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [hasLogo, setHasLogo] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const logoFileRef = useRef<HTMLInputElement>(null);

  // Estados para gestiÃ³n de chats
  const [allChats, setAllChats] = useState<ContractChat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [showChatsSelector, setShowChatsSelector] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const [showSaveCurrentChatConfirm, setShowSaveCurrentChatConfirm] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [showDeleteChatConfirm, setShowDeleteChatConfirm] = useState(false);
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);
  const [isRestoringChatState, setIsRestoringChatState] = useState(true);

  // Cargar contratos al montar el componente
  useEffect(() => {
    const init = async () => {
      try {
        await loadContracts();
        checkLogo();
        loadAllChats();
        
        // Restaurar contrato seleccionado desde sessionStorage
        const savedContractId = sessionStorage.getItem('selectedContractId');
        if (savedContractId) {
          const accountId = sessionStorage.getItem('accountId');
          if (accountId) {
            const response = await authFetch(`${API_URL}/contracts?accountId=${accountId}`);
            if (response.ok) {
              const data = await response.json();
              const savedContract = data.find((c: ContractBase) => c.id === savedContractId);
              if (savedContract) {
                setSelectedContract(savedContract);

                // Restaurar tambiÃ©n chat activo antes de montar la interfaz
                const savedChatId = sessionStorage.getItem(`currentChat_${savedContractId}`);
                if (savedChatId) {
                  setCurrentChatId(savedChatId);
                }
              }
            }
          }
        }
      } catch (error) {
        console.error('Error al restaurar estado inicial:', error);
      } finally {
        setIsRestoringChatState(false);
      }
    };
    
    init();
  }, []);

  // Guardar contrato seleccionado en sessionStorage
  useEffect(() => {
    if (selectedContract) {
      sessionStorage.setItem('selectedContractId', selectedContract.id);
    }
  }, [selectedContract]);

  // Cargar chats cuando cambie el contrato seleccionado
  useEffect(() => {
    if (selectedContract) {
      // Verificar si hay un chat guardado en sessionStorage
      const savedChatId = sessionStorage.getItem(`currentChat_${selectedContract.id}`);
      if (savedChatId) {
        setCurrentChatId(savedChatId);
      } else {
        setCurrentChatId(null);
      }
    } else {
      setCurrentChatId(null);
    }
  }, [selectedContract]);

  // Guardar chat actual en sessionStorage cada vez que cambie
  useEffect(() => {
    if (selectedContract && currentChatId) {
      sessionStorage.setItem(`currentChat_${selectedContract.id}`, currentChatId);
    }
    // No eliminamos aquÃ­ porque puede ser un estado transitorio durante la restauraciÃ³n
  }, [currentChatId, selectedContract]);

  // Limpiar chats vacÃ­os al desmontar el componente
  useEffect(() => {
    return () => {
      // Cleanup: eliminar chats vacÃ­os del contrato actual
      const contractId = sessionStorage.getItem('selectedContractId');
      if (contractId) {
        authFetch(`${API_URL}/contracts/chat/empty/${contractId}`, {
          method: 'DELETE'
        }).catch(error => {
          console.error('Error al limpiar chats vacÃ­os:', error);
        });
      }
    };
  }, []);

  const loadContracts = async () => {
    try {
      const accountId = sessionStorage.getItem('accountId');
      if (!accountId) return;
      
      const response = await authFetch(`${API_URL}/contracts?accountId=${accountId}`);
      if (response.ok) {
        const data = await response.json();
        setContracts(data);
      }
    } catch (error) {
      console.error('Error al cargar contratos:', error);
    }
  };

  const checkLogo = async () => {
    try {
      const response = await authFetch(`${API_URL}/settings/logo`);
      if (response.ok) {
        const data = await response.json();
        setHasLogo(data.hasLogo);
      }
    } catch (error) {
      console.error('Error al verificar logo:', error);
    }
  };

  const loadAllChats = async () => {
    try {
      const accountId = sessionStorage.getItem('accountId');
      if (!accountId) return;
      
      const response = await authFetch(`${API_URL}/contracts/chat?accountId=${accountId}`);
      if (response.ok) {
        const data = await response.json();
        setAllChats(data);
      }
    } catch (error) {
      console.error('Error al cargar chats:', error);
    }
  };

  const loadChatsForContract = async (contractBaseId: string) => {
    try {
      const response = await authFetch(`${API_URL}/contracts/chat/by-contract/${contractBaseId}`);
      if (response.ok) {
        const data = await response.json();
        setAllChats(data);
      }
    } catch (error) {
      console.error('Error al cargar chats:', error);
    }
  };

  const handleNewChat = () => {
    if (!selectedContract) {
      toast({ title: t('contracts.noBaseSelected'), variant: 'destructive' });
      setShowChatsSelector(false);
      return;
    }
    
    if (currentChatId && allChats.find(c => c.id === currentChatId)?.messages?.length > 0) {
      // Hay mensajes en el chat actual, pedir confirmaciÃ³n
      setPendingAction(() => () => createNewChat());
      setShowSaveCurrentChatConfirm(true);
    } else {
      createNewChat();
    }
  };

  const createNewChat = () => {
    setCurrentChatId(null);
    if (selectedContract) {
      sessionStorage.removeItem(`currentChat_${selectedContract.id}`);
    }
    setShowSaveCurrentChatConfirm(false);
    setShowChatsSelector(false);
  };

  const handleSelectChat = (chatId: string) => {
    if (currentChatId === chatId) {
      setShowChatsSelector(false);
      return;
    }

    if (currentChatId && allChats.find(c => c.id === currentChatId)?.messages?.length > 0) {
      // Hay mensajes en el chat actual, pedir confirmaciÃ³n
      setPendingAction(() => () => selectChat(chatId));
      setShowSaveCurrentChatConfirm(true);
    } else {
      selectChat(chatId);
    }
  };

  const selectChat = (chatId: string) => {
    const chat = allChats.find(c => c.id === chatId);
    if (!chat) return;

    // Buscar y seleccionar el contrato base asociado al chat
    const contract = contracts.find(c => c.id === chat.contractBaseId);
    if (contract) {
      setSelectedContract(contract);
    }

    setCurrentChatId(chatId);
    if (chat.contractBaseId) {
      sessionStorage.setItem(`currentChat_${chat.contractBaseId}`, chatId);
    }
    setShowSaveCurrentChatConfirm(false);
    setShowChatsSelector(false);
  };

  const handleChatCreated = (chatId: string) => {
    setCurrentChatId(chatId);
    if (selectedContract) {
      sessionStorage.setItem(`currentChat_${selectedContract.id}`, chatId);
    }
    loadAllChats();
  };

  const handleMessagesChanged = () => {
    loadAllChats();
  };

  const handleEditChatTitle = async (chatId: string, newTitle: string) => {
    if (!newTitle.trim()) return;

    try {
      const response = await authFetch(`${API_URL}/contracts/chat/${chatId}/title`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() }),
      });

      if (response.ok) {
        setEditingChatId(null);
        setEditingTitle("");
        loadAllChats();
      }
    } catch (error) {
      console.error('Error al editar tÃ­tulo:', error);
    }
  };

  const handleDeleteChat = async () => {
    if (!chatToDelete) return;

    try {
      const response = await authFetch(`${API_URL}/contracts/chat/${chatToDelete}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        if (currentChatId === chatToDelete) {
          setCurrentChatId(null);
          if (selectedContract) {
            sessionStorage.removeItem(`currentChat_${selectedContract.id}`);
          }
        }
        loadAllChats();
        setShowDeleteChatConfirm(false);
        setChatToDelete(null);
      }
    } catch (error) {
      console.error('Error al eliminar chat:', error);
    }
  };

  const handleDuplicateChat = async (chatId: string) => {
    try {
      const response = await authFetch(`${API_URL}/contracts/chat/${chatId}/duplicate`, {
        method: 'POST',
      });

      if (response.ok) {
        const newChat = await response.json();
        
        // Buscar y seleccionar el contrato base asociado al chat duplicado
        const contract = contracts.find(c => c.id === newChat.contractBaseId);
        if (contract) {
          setSelectedContract(contract);
        }
        
        setCurrentChatId(newChat.id);
        if (newChat.contractBaseId) {
          sessionStorage.setItem(`currentChat_${newChat.contractBaseId}`, newChat.id);
        }
        loadAllChats();
        setShowChatsSelector(false);
      }
    } catch (error) {
      console.error('Error al duplicar chat:', error);
    }
  };

  const confirmDeleteChat = (chatId: string) => {
    setChatToDelete(chatId);
    setShowDeleteChatConfirm(true);
  };

  const filteredChats = allChats.filter(chat =>
    chat.title.toLowerCase().includes(chatSearchQuery.toLowerCase()) ||
    chat.firstMessagePreview?.toLowerCase().includes(chatSearchQuery.toLowerCase())
  );

  const uploadLogo = async () => {
    if (!logoFile) return;
    
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('logo', logoFile);

      const response = await authFetch(`${API_URL}/settings/logo`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        await checkLogo();
        setLogoFile(null);
        setShowLogoModal(false);
        toast({ title: t('contracts.logoSaved') });
      } else {
        toast({ title: t('contracts.errorLogo'), variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error:', error);
      toast({ title: t('contracts.errorLogo'), variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const deleteLogo = async () => {
    try {
      const response = await authFetch(`${API_URL}/settings/logo`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await checkLogo();
        toast({ title: t('contracts.logoDeleted') });
      } else {
        toast({ title: t('contracts.errorDeleteLogo'), variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error:', error);
      toast({ title: t('contracts.errorDeleteLogo'), variant: 'destructive' });
    }
  };

  const saveContract = async () => {
    if (!uploadForm.name.trim() || !uploadFile) return;
    
    const accountId = sessionStorage.getItem('accountId');
    if (!accountId) {
      toast({ title: t('clients.errorNoAccount'), variant: 'destructive' });
      return;
    }
    
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('name', uploadForm.name);
      formData.append('summary', uploadForm.summary);
      formData.append('file', uploadFile);
      formData.append('accountId', accountId);

      const response = await authFetch(`${API_URL}/contracts`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        await loadContracts();
        setUploadForm({ name: "", summary: "" });
        setUploadFile(null);
        setShowUploadModal(false);
      } else {
        toast({ title: t('contracts.errorSave'), variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error:', error);
      toast({ title: t('contracts.errorSave'), variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const openContractFile = async (id: string) => {
    try {
      const res = await authFetch(`${API_URL}/contracts/${id}/file`);
      if (!res.ok) throw new Error('Error');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    }
  };

  const confirmDelete = (id: string) => {
    setContractToDelete(id);
    setShowDeleteConfirm(true);
  };

  const deleteContract = async () => {
    if (!contractToDelete) return;

    try {
      const response = await authFetch(`${API_URL}/contracts/${contractToDelete}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await loadContracts();
        setShowDeleteConfirm(false);
        setContractToDelete(null);
      } else {
        toast({ title: t('contracts.errorDelete'), variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error:', error);
      toast({ title: t('contracts.errorDelete'), variant: 'destructive' });
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
    setIsDragging(false);
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
      setUploadFile(files[0]);
    }
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Top bar with buttons */}
      <div className="border-b border-border px-3 md:px-6 py-3 flex items-center justify-end gap-2 flex-wrap">
        {/* Selector de chats */}
        <div className="relative mr-auto">
          <button
            onClick={() => setShowChatsSelector(!showChatsSelector)}
            className="flex items-center gap-2 bg-accent text-foreground px-3 py-1.5 rounded-md text-xs font-medium hover:bg-accent/80 transition-colors"
          >
            <MessageSquare className="h-3.5 w-3.5" /> {t('contracts.chats')}
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
                  onClick={handleNewChat}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-foreground hover:bg-accent transition-colors border-b border-border"
                >
                  <Plus className="h-3.5 w-3.5" /> {t('contracts.newChat')}
                </button>

                {/* Chats list */}
                <div className="max-h-[280px] overflow-y-auto">
                  {filteredChats.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-muted-foreground text-center">
                      {chatSearchQuery ? t('contracts.noChatsFound') : t('contracts.noChats')}
                    </p>
                  ) : (
                    filteredChats.map((chat) => (
                      <div
                        key={chat.id}
                        className={`group relative px-3 py-2.5 hover:bg-accent transition-colors border-b border-border/50 ${
                          currentChatId === chat.id ? 'bg-accent/50' : ''
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
                                    if (e.key === 'Enter') handleEditChatTitle(chat.id, editingTitle);
                                    if (e.key === 'Escape') { setEditingChatId(null); setEditingTitle(""); }
                                  }}
                                  className="flex-1 px-1.5 py-0.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring"
                                  autoFocus
                                />
                                <button
                                  onClick={() => handleEditChatTitle(chat.id, editingTitle)}
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
                                onClick={() => handleSelectChat(chat.id)}
                                className="w-full text-left"
                              >
                                <div className="flex items-center gap-1.5 mb-1">
                                  {chat.hasGeneratedContract && (
                                    <FileText className="h-3 w-3 text-green-600 flex-shrink-0" />
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
                                    {new Date(chat.lastModified || chat.date).toLocaleString('es-ES', {
                                      day: '2-digit',
                                      month: '2-digit',
                                      year: '2-digit',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </p>
                                  <p className="text-[9px] text-primary/70 font-medium truncate max-w-[120px]">
                                    {contracts.find(c => c.id === chat.contractBaseId)?.name || t('contracts.noContract')}
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
                                title={t('contracts.editTitle')}
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDuplicateChat(chat.id);
                                }}
                                className="p-1 rounded hover:bg-background text-muted-foreground hover:text-foreground transition-colors"
                                title={t('contracts.duplicate')}
                              >
                                <Copy className="h-3 w-3" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  confirmDeleteChat(chat.id);
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

        <button
          onClick={() => setShowHowToModal(true)}
          className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-primary transition-colors"
          title="¿Cómo funciona el generador de contratos?"
        >
          <Info className="h-4 w-4" />
        </button>
        <button
          onClick={() => setShowUploadModal(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-xs font-medium hover:opacity-90 transition-opacity"
        >
          <Upload className="h-3.5 w-3.5" /> {t('contracts.upload')}
        </button>
        <button
          onClick={() => setShowLogoModal(true)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium hover:opacity-90 transition-opacity ${
            hasLogo 
              ? 'bg-green-600 text-white' 
              : 'bg-accent text-foreground'
          }`}
          title={hasLogo ? t('contracts.logoConfigured') : t('contracts.uploadLogo')}
        >
          <Image className="h-3.5 w-3.5" /> {hasLogo ? t('contracts.logoConfigured') : t('contracts.uploadLogo')}
        </button>
        <button
          onClick={() => setShowInfoModal(true)}
          className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          title={t('contracts.contractsModal.title')}
        >
          <Info className="h-4 w-4" />
        </button>

        {/* Selector de ejemplos base */}
        <div className="relative">
          <button
            onClick={() => setShowSelector(!showSelector)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent hover:bg-accent/80 text-xs font-medium text-foreground transition-colors"
          >
            {selectedContract ? selectedContract.name : t('contracts.directAnalysis')} <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {showSelector && (
            <div className="absolute right-0 top-full mt-1 w-64 bg-card border border-border rounded-lg shadow-lg z-10 overflow-hidden max-h-96 overflow-y-auto">
              {/* OpciÃ³n de anÃ¡lisis directo */}
              <button
                onClick={() => {
                  setSelectedContract(null);
                  setCurrentChatId(null);
                  setShowSelector(false);
                }}
                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-accent transition-colors border-b border-border ${
                  !selectedContract ? 'bg-accent' : ''
                }`}
              >
                <span className="block truncate font-medium text-foreground">ðŸ“„ {t('contracts.directAnalysis')}</span>
                <span className="text-[10px] text-muted-foreground">{t('contracts.directAnalysisDesc')}</span>
              </button>
              
              {contracts.length === 0 ? (
                <p className="px-4 py-3 text-xs text-muted-foreground">{t('contracts.noContracts')}</p>
              ) : (
                <>
                  <div className="px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {t('contracts.templatesLabel')}
                  </div>
                  {contracts.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setSelectedContract(c);
                        setShowSelector(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-accent transition-colors ${
                        selectedContract?.id === c.id ? 'bg-accent' : ''
                      }`}
                    >
                      <span className="block truncate font-medium text-foreground">{c.name}</span>
                      <span className="text-[10px] text-muted-foreground">{c.fileName}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Chat */}
      <div className="flex-1 min-h-0">
        {isRestoringChatState && selectedContract ? (
          <ChatInterface
            title={t('contracts.draftingTitle')}
            subtitle={t('contracts.restoring')}
            placeholder={t('contracts.loadingChat')}
          />
        ) : (
          <ContractChatInterface
            key={currentChatId || (selectedContract ? `new-${selectedContract.id}` : 'temp')}
            contractBaseId={selectedContract?.id}
            contractBaseName={selectedContract?.name || ''}
            existingChatId={currentChatId || undefined}
            onChatCreated={handleChatCreated}
            onMessagesChanged={handleMessagesChanged}
          />
        )}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowUploadModal(false)}>
          <div className="bg-card border border-border rounded-lg w-[95vw] max-w-md p-4 md:p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-foreground">{t('contracts.uploadModal.title')}</h2>
              <button onClick={() => setShowUploadModal(false)} className="p-1 hover:bg-accent rounded"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('contracts.uploadModal.name')}</label>
                <input value={uploadForm.name} onChange={(e) => setUploadForm({ ...uploadForm, name: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('contracts.uploadModal.summary')}</label>
                <textarea value={uploadForm.summary} onChange={(e) => setUploadForm({ ...uploadForm, summary: e.target.value })} rows={3} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('contracts.uploadModal.file')}</label>
                <input type="file" ref={fileRef} onChange={(e) => setUploadFile(e.target.files?.[0] || null)} className="hidden" />
                <div
                  onDragEnter={handleDragEnter}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileRef.current?.click()}
                  className={`flex items-center gap-2 text-sm border border-dashed rounded-md px-4 py-3 w-full justify-center cursor-pointer transition-colors ${
                    isDragging 
                      ? 'border-primary bg-primary/10 text-primary' 
                      : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  }`}
                >
                  <Upload className="h-4 w-4" /> 
                  {uploadFile ? uploadFile.name : isDragging ? t('contracts.uploadModal.dropFile') : t('contracts.uploadModal.selectFile')}
                </div>
              </div>
              <button onClick={saveContract} disabled={isLoading} className="w-full bg-primary text-primary-foreground py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                {isLoading ? t('clients.form.saving') : t('contracts.uploadModal.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info Modal - contracts list */}
      {showHowToModal && (
        <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowHowToModal(false)}>
          <div className="bg-card border border-border rounded-lg w-[95vw] max-w-lg p-5 md:p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Info className="h-5 w-5 text-primary" />
                <h2 className="text-base font-semibold text-foreground">¿Cómo funciona el generador de contratos?</h2>
              </div>
              <button onClick={() => setShowHowToModal(false)} className="p-1 hover:bg-accent rounded"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-4 text-sm text-muted-foreground">
              <p>Lyra puede generar contratos de dos formas:</p>
              <div className="space-y-2">
                <div className="flex gap-3 bg-accent/50 rounded-md p-3">
                  <span className="text-primary font-bold mt-0.5">A</span>
                  <div>
                    <p className="font-medium text-foreground">Con contrato base</p>
                    <p className="text-xs mt-0.5">Sube un PDF existente. Lyra lo analiza, detecta los campos vacíos y te guía para completarlos uno a uno.</p>
                  </div>
                </div>
                <div className="flex gap-3 bg-accent/50 rounded-md p-3">
                  <span className="text-primary font-bold mt-0.5">B</span>
                  <div>
                    <p className="font-medium text-foreground">Desde cero</p>
                    <p className="text-xs mt-0.5">Sin contrato base, Lyra te preguntará el tipo de contrato y el país, y recopilará todos los datos legalmente necesarios antes de redactarlo.</p>
                  </div>
                </div>
              </div>
              <div className="border-t border-border pt-3 flex gap-2 items-start">
                <span className="text-lg leading-none">📥</span>
                <p>Cuando Lyra haya recopilado toda la información, generará el contrato automáticamente. En ese momento aparecerá un <span className="text-foreground font-medium">botón de descarga</span> en el mensaje para obtener el PDF listo para firmar.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {showInfoModal && (
        <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowInfoModal(false)}>
          <div className="bg-card border border-border rounded-lg w-[95vw] max-w-lg p-4 md:p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-foreground">{t('contracts.contractsModal.title')}</h2>
              <button onClick={() => setShowInfoModal(false)} className="p-1 hover:bg-accent rounded"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-2">
              {contracts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">{t('contracts.contractsModal.noContracts')}</p>
              ) : (
                contracts.map((c) => (
                  <div key={c.id} className="flex items-center justify-between bg-accent/50 rounded-md px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.summary}</p>
                      <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{c.fileName}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openContractFile(c.id)} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" title={t('contracts.contractsModal.view')}>
                        <Eye className="h-4 w-4" />
                      </button>
                      <button onClick={() => confirmDelete(c.id)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title={t('contracts.delete')}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-card border border-border rounded-lg w-[95vw] max-w-sm p-4 md:p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-foreground mb-2">{t('contracts.deleteModal.title')}</h2>
              <p className="text-sm text-muted-foreground">{t('contracts.deleteModal.message')}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 bg-accent text-foreground py-2 rounded-md text-sm font-medium hover:bg-accent/80 transition-colors">
                {t('contracts.deleteModal.cancel')}
              </button>
              <button onClick={deleteContract} className="flex-1 bg-destructive text-destructive-foreground py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity">
                {t('contracts.deleteModal.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logo Upload Modal */}
      {showLogoModal && (
        <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowLogoModal(false)}>
          <div className="bg-card border border-border rounded-lg w-[95vw] max-w-md p-4 md:p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-foreground">{t('contracts.logoModal.title')}</h2>
              <button onClick={() => setShowLogoModal(false)} className="p-1 hover:bg-accent rounded"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-4">
              {hasLogo && (
                <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-md p-3">
                  <p className="text-sm text-green-800 dark:text-green-200 mb-2">{t('contracts.logoModal.hasLogo')}</p>
                  <button 
                    onClick={deleteLogo}
                    className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 underline"
                  >
                    {t('contracts.logoModal.deleteLogo')}
                  </button>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  {hasLogo ? t('contracts.logoModal.replaceLogo') : t('contracts.logoModal.uploadLogoLabel')}
                </label>
                <p className="text-xs text-muted-foreground mb-2">{t('contracts.logoModal.logoNote')}</p>
                <input 
                  type="file" 
                  ref={logoFileRef} 
                  accept="image/png,image/jpeg,image/jpg"
                  onChange={(e) => setLogoFile(e.target.files?.[0] || null)} 
                  className="hidden" 
                />
                <div
                  onClick={() => logoFileRef.current?.click()}
                  className="flex items-center gap-2 text-sm border border-dashed rounded-md px-4 py-3 w-full justify-center cursor-pointer transition-colors border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
                >
                  <Image className="h-4 w-4" /> 
                  {logoFile ? logoFile.name : t('contracts.logoModal.selectImage')}
                </div>
              </div>
              <button 
                onClick={uploadLogo} 
                disabled={isLoading || !logoFile} 
                className="w-full bg-primary text-primary-foreground py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {isLoading ? t('clients.form.saving') : hasLogo ? t('contracts.logoModal.replace') : t('contracts.logoModal.upload')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmaciÃ³n para guardar chat actual */}
      {showSaveCurrentChatConfirm && (
        <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowSaveCurrentChatConfirm(false)}>
          <div className="bg-card border border-border rounded-lg w-[95vw] max-w-sm p-4 md:p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-foreground mb-2">{t('contracts.chatInProgress.title')}</h2>
              <p className="text-sm text-muted-foreground">
                {t('contracts.chatInProgress.message')}
              </p>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => {
                  setShowSaveCurrentChatConfirm(false);
                  setPendingAction(null);
                }} 
                className="flex-1 bg-accent text-foreground py-2 rounded-md text-sm font-medium hover:bg-accent/80 transition-colors"
              >
                {t('contracts.chatInProgress.cancel')}
              </button>
              <button 
                onClick={() => {
                  if (pendingAction) pendingAction();
                  setPendingAction(null);
                }} 
                className="flex-1 bg-primary text-primary-foreground py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
              >
                {t('contracts.chatInProgress.continue')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmaciÃ³n para eliminar chat */}
      {showDeleteChatConfirm && (
        <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowDeleteChatConfirm(false)}>
          <div className="bg-card border border-border rounded-lg w-[95vw] max-w-sm p-4 md:p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-foreground mb-2">{t('contracts.deleteChatModal.title')}</h2>
              <p className="text-sm text-muted-foreground">
                {t('contracts.deleteChatModal.message')}
              </p>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => {
                  setShowDeleteChatConfirm(false);
                  setChatToDelete(null);
                }} 
                className="flex-1 bg-accent text-foreground py-2 rounded-md text-sm font-medium hover:bg-accent/80 transition-colors"
              >
                {t('contracts.deleteChatModal.cancel')}
              </button>
              <button 
                onClick={handleDeleteChat} 
                className="flex-1 bg-destructive text-destructive-foreground py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
              >
                {t('contracts.deleteChatModal.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Contracts;
