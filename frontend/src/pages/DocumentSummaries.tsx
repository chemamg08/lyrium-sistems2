import { useState, useEffect } from "react";
import { MessageSquare, Plus, Pencil, Copy, Trash2, Search, Check, X, FileText } from "lucide-react";
import DocumentSummariesChatInterface from "@/components/DocumentSummariesChatInterface";
import { useTranslation } from "react-i18next";
import { authFetch } from '../lib/authFetch';

interface SummaryChat {
  id: string;
  title: string;
  date: string;
  uploadedFiles: any[];
  messages: any[];
  lastModified?: string;
  firstMessagePreview?: string;
}

const API_URL = import.meta.env.VITE_API_URL;

const DocumentSummaries = () => {
  const { t } = useTranslation();
  const [allChats, setAllChats] = useState<SummaryChat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [showChatsSelector, setShowChatsSelector] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const [showSaveCurrentChatConfirm, setShowSaveCurrentChatConfirm] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [showDeleteChatConfirm, setShowDeleteChatConfirm] = useState(false);
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);

  useEffect(() => {
    loadAllChats();
    
    // Verificar si hay un chat guardado en sessionStorage
    const savedChatId = sessionStorage.getItem('currentSummaryChat');
    if (savedChatId) {
      setCurrentChatId(savedChatId);
    }

    // Cleanup: eliminar chat vacÃ­o al salir
    return () => {
      const chatId = sessionStorage.getItem('currentSummaryChat');
      if (chatId) {
        // Verificar y eliminar si estÃ¡ vacÃ­o (usar async en cleanup)
        authFetch(`${API_URL}/summaries/chat/${chatId}`)
          .then(res => res.json())
          .then(chat => {
            if (!chat.messages || chat.messages.length === 0) {
              authFetch(`${API_URL}/summaries/chat/${chatId}`, { method: 'DELETE' });
            }
          })
          .catch(() => {});
      }
    };
  }, []);

  const loadAllChats = async () => {
    try {
      const accountId = sessionStorage.getItem('accountId');
      if (!accountId) return;
      
      const response = await authFetch(`${API_URL}/summaries/chat?accountId=${accountId}`);
      if (response.ok) {
        const data = await response.json();
        // Filtrar solo chats que tengan mensajes
        const chatsWithMessages = data.filter((chat: SummaryChat) => chat.messages && chat.messages.length > 0);
        setAllChats(chatsWithMessages);
      }
    } catch (error) {
      console.error('Error al cargar chats:', error);
    }
  };

  const deleteEmptyChat = async (chatId: string) => {
    try {
      await authFetch(`${API_URL}/summaries/chat/${chatId}`, {
        method: 'DELETE',
      });
    } catch (error) {
      // Ignore - chat may already be deleted
    }
  };

  const handleNewChat = async () => {
    // Si el chat actual existe y no tiene mensajes, eliminarlo
    if (currentChatId) {
      const currentChat = allChats.find(c => c.id === currentChatId);
      if (!currentChat || (currentChat.messages && currentChat.messages.length === 0)) {
        await deleteEmptyChat(currentChatId);
      }
    }
    
    createNewChat();
  };

  const createNewChat = () => {
    setCurrentChatId(null);
    sessionStorage.removeItem('currentSummaryChat');
    setShowSaveCurrentChatConfirm(false);
    setShowChatsSelector(false);
    loadAllChats(); // Recargar para actualizar la lista sin el chat vacÃ­o
  };

  const handleSelectChat = async (chatId: string) => {
    if (currentChatId === chatId) {
      setShowChatsSelector(false);
      return;
    }

    // Si el chat actual existe y no tiene mensajes, eliminarlo
    if (currentChatId) {
      const currentChat = allChats.find(c => c.id === currentChatId);
      if (!currentChat || (currentChat.messages && currentChat.messages.length === 0)) {
        await deleteEmptyChat(currentChatId);
      }
    }

    selectChat(chatId);
  };

  const selectChat = (chatId: string) => {
    setCurrentChatId(chatId);
    sessionStorage.setItem('currentSummaryChat', chatId);
    setShowSaveCurrentChatConfirm(false);
    setShowChatsSelector(false);
  };

  const handleChatCreated = (chatId: string) => {
    setCurrentChatId(chatId);
    sessionStorage.setItem('currentSummaryChat', chatId);
    loadAllChats();
  };

  const handleMessagesChanged = () => {
    loadAllChats();
  };

  const handleEditChatTitle = async (chatId: string, newTitle: string) => {
    if (!newTitle.trim()) return;

    try {
      const response = await authFetch(`${API_URL}/summaries/chat/${chatId}/title`, {
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
      const response = await authFetch(`${API_URL}/summaries/chat/${chatToDelete}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        if (currentChatId === chatToDelete) {
          setCurrentChatId(null);
          sessionStorage.removeItem('currentSummaryChat');
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
      const response = await authFetch(`${API_URL}/summaries/chat/${chatId}/duplicate`, {
        method: 'POST',
      });

      if (response.ok) {
        const newChat = await response.json();
        setCurrentChatId(newChat.id);
        sessionStorage.setItem('currentSummaryChat', newChat.id);
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

  return (
    <div className="flex flex-col h-screen">
      {/* Top bar with chats button */}
      <div className="border-b border-border px-3 md:px-6 py-3 flex items-center justify-end gap-2 flex-wrap">
        {/* Selector de chats */}
        <div className="relative mr-auto">
          <button
            onClick={() => setShowChatsSelector(!showChatsSelector)}
            className="flex items-center gap-2 bg-accent text-foreground px-3 py-1.5 rounded-md text-xs font-medium hover:bg-accent/80 transition-colors"
          >
            <MessageSquare className="h-3.5 w-3.5" /> {t('documents.chats')}
          </button>
          {showChatsSelector && (
            <div className="absolute left-0 top-full mt-1 w-80 bg-card border border-border rounded-lg shadow-lg z-10 overflow-hidden">
              {/* Search bar */}
              <div className="p-2 border-b border-border">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder={t('documents.searchChats')}
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
                <Plus className="h-3.5 w-3.5" /> {t('documents.newChat')}
              </button>

              {/* Chats list */}
              <div className="max-h-[280px] overflow-y-auto">
                {filteredChats.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-muted-foreground text-center">
                    {chatSearchQuery ? t('documents.noChatsFound') : t('documents.noChats')}
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
                                <span className="text-xs font-medium text-foreground truncate">
                                  {chat.title}
                                </span>
                                {chat.uploadedFiles && chat.uploadedFiles.length > 0 && (
                                  <span className="flex items-center gap-0.5 text-[9px] text-primary/70 font-medium">
                                    <FileText className="h-2.5 w-2.5" />
                                    {chat.uploadedFiles.length}
                                  </span>
                                )}
                              </div>
                              {chat.firstMessagePreview && (
                                <p className="text-[10px] text-muted-foreground line-clamp-1">
                                  {chat.firstMessagePreview}
                                </p>
                              )}
                              <p className="text-[9px] text-muted-foreground/70 mt-0.5">
                                {new Date(chat.lastModified || chat.date).toLocaleString('es-ES', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </p>
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
                              title={t('documents.editTitle')}
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDuplicateChat(chat.id);
                              }}
                              className="p-1 rounded hover:bg-background text-muted-foreground hover:text-foreground transition-colors"
                              title={t('documents.duplicate')}
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                confirmDeleteChat(chat.id);
                              }}
                              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                              title={t('documents.delete')}
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
      </div>

      {/* Chat */}
      <div className="flex-1 min-h-0">
        <DocumentSummariesChatInterface
          key={currentChatId || 'new'}
          existingChatId={currentChatId}
          onChatCreated={handleChatCreated}
          onMessagesChanged={handleMessagesChanged}
        />
      </div>

      {/* Modal de confirmaciÃ³n para cambiar de chat */}
      {showSaveCurrentChatConfirm && (
        <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowSaveCurrentChatConfirm(false)}>
          <div className="bg-card border border-border rounded-lg w-[95vw] max-w-sm p-4 md:p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-foreground mb-2">{t('documents.chatInProgress.title')}</h2>
              <p className="text-sm text-muted-foreground">
                {t('documents.chatInProgress.message')}
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
                {t('documents.chatInProgress.cancel')}
              </button>
              <button 
                onClick={() => {
                  if (pendingAction) pendingAction();
                  setPendingAction(null);
                }} 
                className="flex-1 bg-primary text-primary-foreground py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
              >
                {t('documents.chatInProgress.continue')}
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
              <h2 className="text-lg font-semibold text-foreground mb-2">{t('documents.deleteChatModal.title')}</h2>
              <p className="text-sm text-muted-foreground">
                {t('documents.deleteChatModal.message')}
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
                {t('documents.deleteChatModal.cancel')}
              </button>
              <button 
                onClick={handleDeleteChat} 
                className="flex-1 bg-destructive text-destructive-foreground py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
              >
                {t('documents.deleteChatModal.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentSummaries;

