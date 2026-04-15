import {
  Mail, MessageCircle, Calendar, ArrowLeft, Send, Paperclip, Search,
  MoreVertical, Users, HelpCircle, X, Plus, Trash2, Eye, Upload, PauseCircle, PanelLeft, Pencil,
  FolderOpen, Copy, Check, ChevronDown, FileText, Image, Download, ChevronRight, Settings2, Phone, Sparkles, Settings
} from "lucide-react";
import { useState, useEffect, useRef, DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { useIsMobile } from "@/hooks/use-mobile";
import { authFetch } from '../lib/authFetch';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import allLocales from '@fullcalendar/core/locales-all';

const API = `${import.meta.env.VITE_API_URL}/automatizaciones`;
const CALENDAR_API = `${import.meta.env.VITE_API_URL}/calendar`;

interface Especialidad { id: string; nombre: string; descripcion: string; createdAt: string; }
interface CuentaCorreo { id: string; plataforma: string; correo: string; password: string; createdAt: string; }
interface Documento { id: string; nombre: string; filename: string; uploadedAt: string; }
interface Subcuenta { id: string; name: string; email: string; }
interface EmailAttachment { id: string; filename: string; originalName: string; mimeType: string; size: number; }
interface EmailMessage { id: string; from: string; text: string; time: string; sent: boolean; attachments?: EmailAttachment[]; }
interface EmailConversation {
  id: string; contactName: string; contactEmail: string; subject: string;
  messages: EmailMessage[]; lastMessageTime: string; unread: number; autoClientId?: string; autoReplyPaused?: boolean;
}
interface EmailFolder {
  id: string;
  name: string;
  conversationIds: string[];
}
interface ClassifyRule {
  id: string;
  name: string;
  description: string;
  folderIds: string[];
  createdAt: string;
}
interface AutoData {
  especialidades: Especialidad[];
  cuentasCorreo: CuentaCorreo[];
  correosConsultas: string[];
  documentos: Documento[];
  switchActivo: boolean;
  subcuentaEspecialidades: Record<string, string>;
  sortByCarga: boolean;
  autoAssignEnabled: boolean;
  emailConversations: EmailConversation[];
  pendingConsultas: any[];
  emailFolders: EmailFolder[];
  respondConsultasGenerales?: boolean;
  respondSolicitudesServicio?: boolean;
  soloContactosConocidos?: boolean;
}

const PLATFORMS = [
  { value: "gmail", label: "Gmail" },
  { value: "outlook", label: "Outlook / Hotmail" },
  { value: "yahoo", label: "Yahoo" },
  { value: "icloud", label: "iCloud" },
  { value: "zoho", label: "Zoho" },
  { value: "hostinger", label: "Hostinger" },
  { value: "ionos", label: "IONOS" },
  { value: "ovh", label: "OVH" },
  { value: "godaddy", label: "GoDaddy" },
  { value: "custom", label: "Custom / Personalizado" },
];

const WA_API = `${import.meta.env.VITE_API_URL}/whatsapp`;

// Facebook JS SDK loader for WhatsApp Embedded Signup
function loadFbSdk(appId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).FB) {
      (window as any).FB.init({ appId, autoLogAppEvents: true, xfbml: true, version: 'v22.0' });
      resolve();
      return;
    }
    (window as any).fbAsyncInit = function () {
      (window as any).FB.init({ appId, autoLogAppEvents: true, xfbml: true, version: 'v22.0' });
      resolve();
    };
    const script = document.createElement('script');
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error('No se pudo cargar el SDK de Facebook'));
    document.head.appendChild(script);
  });
}

interface WAMessage { id: string; from: string; text: string; time: string; sent: boolean; attachments?: { id: string; filename: string; originalName: string; mimeType: string; size: number }[]; }
interface WAConversation { id: string; contactName: string; contactPhone: string; messages: WAMessage[]; lastMessageTime: string; unread: number; autoReplyPaused?: boolean; }
interface WAFolder { id: string; name: string; color: string; conversationIds: string[]; }

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className={`bg-card border border-border rounded-lg shadow-xl flex flex-col max-h-[85vh] w-[95vw] ${wide ? "md:w-[700px]" : "md:w-[520px]"}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-accent text-muted-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

function SwitchBox({ active, onChange, label }: { active: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      onClick={() => onChange(!active)}
      className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors"
    >
      <span className="text-xs font-medium text-foreground">{label}</span>
      <div className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${active ? "bg-green-500" : "bg-muted-foreground/30"}`}>
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200 ${active ? "left-6" : "left-0.5"}`} />
      </div>
    </button>
  );
}

type View = "main" | "email" | "whatsapp" | "calendar";

// Format ISO or legacy time strings to local HH:MM
function formatTime(raw: string): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return raw; // fallback for old "HH:MM" strings
}

const Automations = () => {
  const { t, i18n } = useTranslation();
  const isMobile = useIsMobile();
  const [showConvPanel, setShowConvPanel] = useState(false);
  const [view, setView] = useState<View>("main");
  const [selectedEmailConv, setSelectedEmailConv] = useState<string>("");
  const [selectedWAContact, setSelectedWAContact] = useState<string>("");
  const [waConversations, setWaConversations] = useState<WAConversation[]>([]);
  const [waFolders, setWaFolders] = useState<WAFolder[]>([]);
  const [waSwitchActivo, setWaSwitchActivo] = useState(false);
  const [waConnected, setWaConnected] = useState(false);
  const [waSearch, setWaSearch] = useState('');
  const [waFilter, setWaFilter] = useState<'all' | 'manual' | 'auto'>('all');
  const [waFolderFilter, setWaFolderFilter] = useState('');
  const [showWaFolderPanel, setShowWaFolderPanel] = useState(false);
  const [newWaFolderName, setNewWaFolderName] = useState('');
  const [qrLoading, setQrLoading] = useState(false);
  const [waOAuthProcessing, setWaOAuthProcessing] = useState(false);
  const [showWaConnectModal, setShowWaConnectModal] = useState(false);
  const [waConnectError, setWaConnectError] = useState('');
  const [showWaCorreosConsultas, setShowWaCorreosConsultas] = useState(false);
  const [waCorreoInput, setWaCorreoInput] = useState('');
  const [waCorreosConsultas, setWaCorreosConsultas] = useState<string[]>([]);
  const [showWaSelection, setShowWaSelection] = useState(false);
  const [waSelection, setWaSelection] = useState({
    respondConsultasGenerales: true,
    respondSolicitudesServicio: true,
    soloContactosConocidos: false,
  });
  const [showWaClassifyModal, setShowWaClassifyModal] = useState(false);
  const [waClassifyRules, setWaClassifyRules] = useState<ClassifyRule[]>([]);
  const [waClassifyForm, setWaClassifyForm] = useState({ name: '', description: '', folderIds: [] as string[] });
  const [waClassifyLoading, setWaClassifyLoading] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const [accountId, setAccountId] = useState("");
  const [calendarUserId, setCalendarUserId] = useState("");
  const [autoData, setAutoData] = useState<AutoData>({
    especialidades: [], cuentasCorreo: [], correosConsultas: [],
    documentos: [], switchActivo: false, subcuentaEspecialidades: {}, sortByCarga: false, autoAssignEnabled: false,
    emailConversations: [], pendingConsultas: [], emailFolders: [],
  });
  const [subcuentas, setSubcuentas] = useState<Subcuenta[]>([]);
  const [showAsignacion, setShowAsignacion] = useState(false);
  const [showConsultas, setShowConsultas] = useState(false);
  const [showEspecialidades, setShowEspecialidades] = useState(false);
  const [showCreateEspForm, setShowCreateEspForm] = useState(false);
  const [editingEspId, setEditingEspId] = useState<string | null>(null);
  const [showCuentasCorreo, setShowCuentasCorreo] = useState(false);
  const [showCorreosConsultas, setShowCorreosConsultas] = useState(false);
  const [showSubirInfo, setShowSubirInfo] = useState(false);
  const [showAddCuenta, setShowAddCuenta] = useState(false);
  const [showAddCorreo, setShowAddCorreo] = useState(false);
  const [espForm, setEspForm] = useState({ nombre: "", descripcion: "" });
  const [cuentaForm, setCuentaForm] = useState({ plataforma: "gmail", correo: "", password: "", customSmtpHost: "", customSmtpPort: 587, customImapHost: "", customImapPort: 993 });
  const [correoInput, setCorreoInput] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [calendarEmail, setCalendarEmail] = useState('');
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [showAddEventForm, setShowAddEventForm] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventForm, setEventForm] = useState({ title: '', date: '', startTime: '', endTime: '', description: '', allDay: false, recurrence: '', colorId: '' });
  const [showConfirmDisconnect, setShowConfirmDisconnect] = useState(false);
  const [confirmDeleteEventId, setConfirmDeleteEventId] = useState<string | null>(null);
  const [selectedEventDetail, setSelectedEventDetail] = useState<{ id: string; title: string; description?: string; start: Date | null; end: Date | null; allDay: boolean; colorId?: string; recurrence?: string[] } | null>(null);
  const [showSeleccion, setShowSeleccion] = useState(false);
  const [emailFilter, setEmailFilter] = useState<'all' | 'manual' | 'auto'>('all');
  const [emailSearch, setEmailSearch] = useState('');
  const [showFolderPanel, setShowFolderPanel] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderFilter, setFolderFilter] = useState('');
  const [dragConvId, setDragConvId] = useState<string | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [folderDropdownOpen, setFolderDropdownOpen] = useState(false);
  const folderDropdownRef = useRef<HTMLDivElement>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const emailFileInputRef = useRef<HTMLInputElement>(null);
  const [expandedFolderId, setExpandedFolderId] = useState<string | null>(null);
  const [chatDragOver, setChatDragOver] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [showClassifyModal, setShowClassifyModal] = useState(false);
  const [classifyRules, setClassifyRules] = useState<ClassifyRule[]>([]);
  const [classifyForm, setClassifyForm] = useState({ name: '', description: '', folderIds: [] as string[] });
  const [classifyLoading, setClassifyLoading] = useState(false);

  useEffect(() => {
    const accId = sessionStorage.getItem("accountId") || "";
    setAccountId(accId);
    setCalendarUserId(sessionStorage.getItem("userId") || accId);
    setUserEmail(sessionStorage.getItem("userEmail") || "");
  }, []);

  useEffect(() => { if (accountId) loadClassifyRules(); }, [accountId]);

  // Close folder dropdown on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (folderDropdownRef.current && !folderDropdownRef.current.contains(e.target as Node)) setFolderDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadData = async (accId: string, signal?: AbortSignal) => {
    if (!accId) return;
    try {
      const [d, s] = await Promise.all([
        authFetch(`${API}?accountId=${accId}`, { signal }),
        authFetch(`${API}/subcuentas?accountId=${accId}`, { signal }),
      ]);
      if (d.ok) {
        const data = await d.json();
        if (!data.emailConversations) data.emailConversations = [];
        if (!data.pendingConsultas) data.pendingConsultas = [];
        if (!data.subcuentaEspecialidades) data.subcuentaEspecialidades = {};
        if (!data.especialidades) data.especialidades = [];
        if (!data.emailFolders) data.emailFolders = [];
        setAutoData(data);
        // Auto-select first conversation (functional update avoids stale closure)
        if (data.emailConversations.length > 0) {
          setSelectedEmailConv(prev => prev || data.emailConversations[0].id);
        }
      }
      if (s.ok) setSubcuentas(await s.json());
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      /* backend offline */
    }
  };

  useEffect(() => { if (accountId) loadData(accountId); }, [accountId]);

  // Auto-refresh conversations every 10 seconds
  useEffect(() => {
    if (!accountId) return;
    const controller = new AbortController();
    const interval = setInterval(() => {
      loadData(accountId, controller.signal);
    }, 10000);
    return () => { controller.abort(); clearInterval(interval); };
  }, [accountId]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [autoData.emailConversations, selectedEmailConv]);

  const api = async (method: string, path: string, body?: Record<string, unknown>) => {
    const res = await authFetch(`${API}${path}`, {
      method,
      headers: method !== "GET" ? { "Content-Type": "application/json" } : {},
      body: method !== "GET" ? JSON.stringify({ accountId, ...body }) : undefined,
    });
    return res.ok;
  };

  const loadClassifyRules = async () => {
    if (!accountId) return;
    try {
      const res = await authFetch(`${API}/email-classify-rules?accountId=${accountId}`);
      if (res.ok) {
        const data = await res.json();
        setClassifyRules(data.rules || []);
      }
    } catch { /* offline */ }
  };

  const saveClassifyRule = async () => {
    if (!classifyForm.name.trim() || !classifyForm.description.trim() || classifyForm.folderIds.length === 0) return;
    setClassifyLoading(true);
    try {
      const res = await authFetch(`${API}/email-classify-rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, name: classifyForm.name.trim(), description: classifyForm.description.trim(), folderIds: classifyForm.folderIds }),
      });
      if (res.ok) {
        const data = await res.json();
        setClassifyRules(prev => [...prev, data.rule]);
        setClassifyForm({ name: '', description: '', folderIds: [] });
      }
    } catch { /* offline */ }
    setClassifyLoading(false);
  };

  const deleteClassifyRule = async (ruleId: string) => {
    try {
      await authFetch(`${API}/email-classify-rules/${ruleId}?accountId=${accountId}`, { method: 'DELETE' });
      setClassifyRules(prev => prev.filter(r => r.id !== ruleId));
    } catch { /* offline */ }
  };

  const toggleClassifyFolder = (folderId: string) => {
    setClassifyForm(prev => ({
      ...prev,
      folderIds: prev.folderIds.includes(folderId)
        ? prev.folderIds.filter(id => id !== folderId)
        : [...prev.folderIds, folderId],
    }));
  };

  const apiFile = async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("accountId", accountId);
    const res = await authFetch(`${API}/documentos`, { method: "POST", body: fd });
    return res.ok;
  };

  const reload = () => loadData(accountId);

  // ── WhatsApp API helpers ───────────────────────────────────────
  const waApi = async (method: string, path: string, body?: Record<string, unknown>) => {
    const res = await authFetch(`${WA_API}${path}`, {
      method,
      headers: method !== 'GET' ? { 'Content-Type': 'application/json' } : {},
      body: method !== 'GET' ? JSON.stringify({ accountId, ...body }) : undefined,
    });
    return res;
  };

  const loadWaData = async () => {
    if (!accountId) return;
    try {
      const res = await authFetch(`${WA_API}/conversations?accountId=${accountId}`);
      if (res.ok) {
        const data = await res.json();
        setWaConversations(data.conversations || []);
        setWaFolders(data.folders || []);
        setWaSwitchActivo(data.switchActivo || false);
        setWaConnected(data.connected || false);
        setWaCorreosConsultas(data.correosConsultas || []);
        setWaSelection({
          respondConsultasGenerales: data?.selection?.respondConsultasGenerales !== false,
          respondSolicitudesServicio: data?.selection?.respondSolicitudesServicio !== false,
          soloContactosConocidos: data?.selection?.soloContactosConocidos === true,
        });
        if (!selectedWAContact && (data.conversations || []).length > 0) {
          setSelectedWAContact(data.conversations[0].id);
        }
      }
    } catch { /* offline */ }
  };

  const checkWaStatus = async () => {
    if (!accountId) return;
    try {
      const res = await authFetch(`${WA_API}/status?accountId=${accountId}`);
      if (res.ok) {
        const data = await res.json();
        setWaConnected(data.connected || false);
      }
    } catch { /* offline */ }
  };

  const connectWa = async () => {
    if (!accountId) {
      setWaConnectError('No se pudo identificar la cuenta actual. Recarga la pagina e intentalo de nuevo.');
      setShowWaConnectModal(true);
      return;
    }

    setQrLoading(true);
    setWaConnectError('');
    try {
      // Step 1: Init session on backend → get state + appId
      const initRes = await waApi('POST', '/connect', {});
      if (!initRes.ok) {
        let errorMessage = 'No fue posible iniciar la conexion con Meta.';
        try {
          const data = await initRes.json();
          if (Array.isArray(data?.missingEnv) && data.missingEnv.length > 0) {
            errorMessage = `Faltan variables de entorno en backend: ${data.missingEnv.join(', ')}`;
          } else if (data?.error) {
            errorMessage = String(data.error);
          }
        } catch { /* ignore */ }
        setWaConnectError(errorMessage);
        setQrLoading(false);
        setShowWaConnectModal(true);
        return;
      }
      const { state: oauthState, appId } = await initRes.json();

      // Step 2: Load Facebook JS SDK
      await loadFbSdk(appId);
      setQrLoading(false);

      // Step 3: Open Meta Embedded Signup popup
      setShowWaConnectModal(true);
      setWaOAuthProcessing(true);

      (window as any).FB.login((response: any) => {
        const code = response?.authResponse?.code;
        if (!code) {
          setWaConnectError('No se recibió autorización de Meta. Inténtalo de nuevo.');
          setWaOAuthProcessing(false);
          return;
        }
        // FB.login callback must be synchronous — run async work in IIFE
        (async () => {
          try {
            // Step 4: Exchange code on backend
            const connectRes = await authFetch(`${WA_API}/meta/connect`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ accountId, code, state: oauthState }),
            });
            if (connectRes.ok) {
              await loadWaData();
              await loadWaClassifyRules();
              setShowWaConnectModal(false);
            } else {
              let errorMessage = 'No fue posible finalizar la conexion con Meta.';
              try {
                const data = await connectRes.json();
                if (Array.isArray(data?.missingEnv) && data.missingEnv.length > 0) {
                  errorMessage = `Faltan variables de entorno en backend: ${data.missingEnv.join(', ')}`;
                } else if (data?.error) {
                  errorMessage = String(data.error);
                }
              } catch { /* ignore */ }
              setWaConnectError(errorMessage);
            }
          } catch {
            setWaConnectError('No fue posible finalizar la conexion con Meta. Revisa tu configuracion e intentalo de nuevo.');
          } finally {
            setWaOAuthProcessing(false);
          }
        })();
      }, {
        scope: 'whatsapp_business_management,whatsapp_business_messaging,business_management',
        response_type: 'code',
        override_default_response_type: true,
      });
    } catch (err: any) {
      setWaConnectError(err?.message || 'No fue posible iniciar la conexion con Meta. Revisa tu conexion e intentalo de nuevo.');
      setQrLoading(false);
      setShowWaConnectModal(true);
    }
  };

  const disconnectWa = async () => {
    await waApi('POST', '/disconnect', {});
    setWaConnected(false);
  };

  const toggleWaSwitch = async () => {
    const newVal = !waSwitchActivo;
    setWaSwitchActivo(newVal);
    await waApi('PUT', '/switch', { enabled: newVal });
  };

  const sendWaMessage = async () => {
    if (!messageInput.trim() && pendingFiles.length === 0) return;
    const conv = waConversations.find(c => c.id === selectedWAContact);
    if (!conv) return;

    if (pendingFiles.length > 0) {
      const fd = new FormData();
      fd.append('accountId', accountId);
      fd.append('phone', conv.contactPhone);
      fd.append('text', messageInput);
      pendingFiles.forEach(f => fd.append('files', f));
      await authFetch(`${WA_API}/conversations/${conv.id}/send`, { method: 'POST', body: fd });
    } else {
      await waApi('POST', `/conversations/${conv.id}/send`, { phone: conv.contactPhone, text: messageInput });
    }

    setMessageInput('');
    setPendingFiles([]);
    loadWaData();
  };

  const markWaRead = async (conversationId: string) => {
    await waApi('PUT', '/mark-read', { conversationId });
    setWaConversations(prev => prev.map(c => c.id === conversationId ? { ...c, unread: 0 } : c));
  };

  const toggleWaAutoReply = async (conversationId: string) => {
    await waApi('PUT', `/conversations/${conversationId}/auto-reply`, {});
    loadWaData();
  };

  const deleteWaConversation = async (conversationId: string) => {
    await waApi('DELETE', `/conversations/${conversationId}`, {});
    if (selectedWAContact === conversationId) setSelectedWAContact('');
    loadWaData();
  };

  const createWaFolder = async () => {
    if (!newWaFolderName.trim()) return;
    await waApi('POST', '/folders', { name: newWaFolderName.trim(), color: '#6366f1' });
    setNewWaFolderName('');
    loadWaData();
  };

  const deleteWaFolder = async (folderId: string) => {
    await waApi('DELETE', `/folders/${folderId}`, {});
    if (waFolderFilter === folderId) setWaFolderFilter('');
    loadWaData();
  };

  const assignWaFolder = async (folderId: string, conversationId: string) => {
    await waApi('PUT', '/folders/assign', { folderId, conversationId });
    loadWaData();
  };

  const removeWaFolder = async (folderId: string, conversationId: string) => {
    await waApi('PUT', '/folders/remove', { folderId, conversationId });
    loadWaData();
  };

  const loadWaClassifyRules = async () => {
    if (!accountId) return;
    try {
      const res = await authFetch(`${WA_API}/classify-rules?accountId=${accountId}`);
      if (res.ok) {
        const data = await res.json();
        setWaClassifyRules(data.rules || []);
      }
    } catch { /* offline */ }
  };

  const saveWaClassifyRule = async () => {
    if (!waClassifyForm.name.trim() || !waClassifyForm.description.trim() || waClassifyForm.folderIds.length === 0) return;
    setWaClassifyLoading(true);
    try {
      const res = await authFetch(`${WA_API}/classify-rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          name: waClassifyForm.name.trim(),
          description: waClassifyForm.description.trim(),
          folderIds: waClassifyForm.folderIds,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setWaClassifyRules(prev => [...prev, data.rule]);
        setWaClassifyForm({ name: '', description: '', folderIds: [] });
      }
    } catch { /* offline */ }
    setWaClassifyLoading(false);
  };

  const deleteWaClassifyRule = async (ruleId: string) => {
    try {
      await authFetch(`${WA_API}/classify-rules/${ruleId}?accountId=${accountId}`, { method: 'DELETE' });
      setWaClassifyRules(prev => prev.filter(r => r.id !== ruleId));
    } catch { /* offline */ }
  };

  const toggleWaClassifyFolder = (folderId: string) => {
    setWaClassifyForm(prev => ({
      ...prev,
      folderIds: prev.folderIds.includes(folderId)
        ? prev.folderIds.filter(id => id !== folderId)
        : [...prev.folderIds, folderId],
    }));
  };

  const saveWaCorreoConsulta = async () => {
    if (!waCorreoInput.trim()) return;
    await waApi('POST', '/correos-consultas', { email: waCorreoInput.trim() });
    setWaCorreoInput('');
    setShowWaCorreosConsultas(false);
    loadWaData();
  };

  const deleteWaCorreoConsulta = async (email: string) => {
    await waApi('DELETE', '/correos-consultas', { email });
    loadWaData();
  };

  const toggleWaSeleccion = async (field: 'respondConsultasGenerales' | 'respondSolicitudesServicio' | 'soloContactosConocidos') => {
    const next = {
      ...waSelection,
      [field]: !waSelection[field],
    };
    setWaSelection(next);
    await waApi('PUT', '/selection', next);
  };

  // Load WA data and auto-refresh
  useEffect(() => { if (accountId) { loadWaData(); checkWaStatus(); } }, [accountId]);
  useEffect(() => { if (accountId) loadWaClassifyRules(); }, [accountId]);
  useEffect(() => {
    if (!accountId || view !== 'whatsapp') return;
    const interval = setInterval(() => { loadWaData(); loadWaClassifyRules(); }, 10000);
    return () => clearInterval(interval);
  }, [accountId, view]);

  // Finalize WhatsApp Meta OAuth when returning from Meta
  useEffect(() => {
    if (waOAuthProcessing) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get('wa_meta') !== '1') return;

    const clearWaMetaParams = () => {
      window.history.replaceState({}, '', window.location.pathname);
    };

    const status = params.get('wa_status');
    const waMessage = params.get('wa_message') || '';
    const code = params.get('code');
    const state = params.get('state');

    if (status === 'error') {
      setShowWaConnectModal(true);
      setWaConnectError(waMessage || 'No fue posible finalizar la conexion con Meta.');
      clearWaMetaParams();
      return;
    }

    if (!accountId) return;

    const finishConnected = async () => {
      setShowWaConnectModal(true);
      setWaOAuthProcessing(true);
      setWaConnectError('');
      try {
        await loadWaData();
        await loadWaClassifyRules();
        setShowWaConnectModal(false);
      } catch {
        setWaConnectError('No fue posible sincronizar el estado de WhatsApp tras volver de Meta.');
      } finally {
        clearWaMetaParams();
        setWaOAuthProcessing(false);
      }
    };

    if (status === 'connected') {
      finishConnected();
      return;
    }

    if (!code || !state) return;

    const finishLegacy = async () => {
      setShowWaConnectModal(true);
      setWaOAuthProcessing(true);
      setWaConnectError('');
      try {
        const redirectUri = `${window.location.origin}${window.location.pathname}?wa_meta=1`;
        const res = await authFetch(`${WA_API}/meta/connect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId, code, state, redirectUri }),
        });
        if (res.ok) {
          await loadWaData();
          await loadWaClassifyRules();
          setShowWaConnectModal(false);
        } else {
          let errorMessage = 'No fue posible finalizar la conexion con Meta.';
          try {
            const data = await res.json();
            if (Array.isArray(data?.missingEnv) && data.missingEnv.length > 0) {
              errorMessage = `Faltan variables de entorno en backend: ${data.missingEnv.join(', ')}`;
            } else if (data?.error) {
              errorMessage = String(data.error);
            }
          } catch { /* ignore */ }
          setWaConnectError(errorMessage);
        }
      } catch {
        setWaConnectError('No fue posible finalizar la conexion con Meta. Revisa tu configuracion e intentalo de nuevo.');
      }
      finally {
        clearWaMetaParams();
        setWaOAuthProcessing(false);
      }
    };

    finishLegacy();
  }, [accountId, waOAuthProcessing]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('calendarConnected') === 'true') {
      window.history.replaceState({}, '', window.location.pathname);
      setView('calendar');
    } else if (params.get('calendarError') === 'true') {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Load calendar status when entering calendar view
  useEffect(() => {
    if (view === 'calendar' && calendarUserId) {
      loadCalendarStatus(calendarUserId);
    }
  }, [view, calendarUserId]);

  const loadCalendarStatus = async (accId: string) => {
    if (!accId) return;
    try {
      const res = await authFetch(`${CALENDAR_API}/status?accountId=${accId}`);
      if (res.ok) {
        const data = await res.json();
        setCalendarConnected(data.connected);
        setCalendarEmail(data.email || '');
        if (data.connected) loadCalendarEvents(accId, true);
      }
    } catch { /* offline */ }
  };

  const loadCalendarEvents = async (accId: string, showLoading = false) => {
    if (showLoading) setCalendarLoading(true);
    try {
      const res = await authFetch(`${CALENDAR_API}/events?accountId=${accId}`);
      if (res.ok) {
        const data = await res.json();
        setCalendarEvents(data.events || []);
      }
    } catch { /* offline */ }
    if (showLoading) setCalendarLoading(false);
  };

  const handleConnectCalendar = async () => {
    setCalendarLoading(true);
    try {
      const res = await authFetch(`${CALENDAR_API}/auth-url?accountId=${calendarUserId}`);
      if (res.ok) {
        const { url } = await res.json();
        window.location.href = url;
      }
    } catch { /* offline */ }
    setCalendarLoading(false);
  };

  const handleDisconnectCalendar = async () => {
    setShowConfirmDisconnect(false);
    try {
      await authFetch(`${CALENDAR_API}/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: calendarUserId }),
      });
      setCalendarConnected(false);
      setCalendarEmail('');
      setCalendarEvents([]);
    } catch { /* offline */ }
  };

  const GOOGLE_COLOR_MAP: Record<string, string> = {
    '1': '#7986cb', '2': '#33b679', '3': '#8e24aa', '4': '#e67c73',
    '5': '#f6bf26', '6': '#f4511e', '7': '#039be5', '8': '#616161',
    '9': '#3f51b5', '10': '#0b8043', '11': '#d50000',
  };

  const resetEventForm = () => {
    setEventForm({ title: '', date: '', startTime: '', endTime: '', description: '', allDay: false, recurrence: '', colorId: '' });
    setEditingEventId(null);
  };

  const [savingEvent, setSavingEvent] = useState(false);

  const handleAddEvent = async () => {
    if (!eventForm.title || !eventForm.date) return;
    setSavingEvent(true);
    try {
      let startDateTime = eventForm.date;
      let endDateTime = eventForm.date;
      if (!eventForm.allDay && eventForm.startTime) {
        startDateTime = `${eventForm.date}T${eventForm.startTime}:00`;
        endDateTime = `${eventForm.date}T${eventForm.endTime || eventForm.startTime}:00`;
      }
      const body: any = { accountId: calendarUserId, title: eventForm.title, description: eventForm.description, startDateTime, endDateTime, allDay: eventForm.allDay };
      if (eventForm.recurrence) body.recurrence = eventForm.recurrence;
      if (eventForm.colorId) body.colorId = eventForm.colorId;

      const url = editingEventId ? `${CALENDAR_API}/events/${editingEventId}` : `${CALENDAR_API}/events`;
      const method = editingEventId ? 'PUT' : 'POST';
      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setShowAddEventForm(false);
        resetEventForm();
        await loadCalendarEvents(calendarUserId);
      } else {
        const errData = await res.json().catch(() => null);
        console.error('Calendar event error:', res.status, errData);
      }
    } catch (err) { console.error('Calendar event network error:', err); }
    setSavingEvent(false);
  };

  const handleEditEvent = (detail: typeof selectedEventDetail) => {
    if (!detail) return;
    const startDate = detail.start ? new Date(detail.start) : null;
    const endDate = detail.end ? new Date(detail.end) : null;
    const dateStr = startDate ? startDate.toISOString().split('T')[0] : '';
    const startTime = !detail.allDay && startDate ? startDate.toTimeString().slice(0, 5) : '';
    const endTime = !detail.allDay && endDate ? endDate.toTimeString().slice(0, 5) : '';
    const rrule = detail.recurrence?.[0] || '';
    setEventForm({
      title: detail.title,
      date: dateStr,
      startTime,
      endTime,
      description: detail.description || '',
      allDay: detail.allDay,
      recurrence: rrule,
      colorId: detail.colorId || '',
    });
    setEditingEventId(detail.id);
    setSelectedEventDetail(null);
    setShowAddEventForm(true);
  };

  const handleDeleteEvent = async (eventId: string) => {
    setConfirmDeleteEventId(null);
    try {
      const res = await authFetch(`${CALENDAR_API}/events/${eventId}?accountId=${calendarUserId}`, { method: 'DELETE' });
      if (res.ok) setCalendarEvents(prev => prev.filter((e: any) => e.id !== eventId));
    } catch { /* offline */ }
  };

  const saveEspecialidad = async () => {
    if (!espForm.nombre.trim()) return;
    if (editingEspId) {
      await api("PUT", `/especialidades/${editingEspId}`, { nombre: espForm.nombre, descripcion: espForm.descripcion });
      setEditingEspId(null);
    } else {
      await api("POST", "/especialidades", { nombre: espForm.nombre, descripcion: espForm.descripcion });
    }
    setEspForm({ nombre: "", descripcion: "" }); setShowCreateEspForm(false); reload();
  };
  const startEditEsp = (e: { id: string; nombre: string; descripcion?: string }) => {
    setEspForm({ nombre: e.nombre, descripcion: e.descripcion || "" });
    setEditingEspId(e.id);
    setShowCreateEspForm(true);
  };
  const deleteEsp = async (id: string) => { await api("DELETE", `/especialidades/${id}?accountId=${accountId}`); reload(); };

  const saveCuenta = async () => {
    if (!cuentaForm.correo.trim()) return;
    await api("POST", "/cuentas-correo", cuentaForm);
    setCuentaForm({ plataforma: "gmail", correo: "", password: "", customSmtpHost: "", customSmtpPort: 587, customImapHost: "", customImapPort: 993 }); setShowAddCuenta(false); reload();
  };
  const deleteCuenta = async (id: string) => { await api("DELETE", `/cuentas-correo/${id}?accountId=${accountId}`); reload(); };

  const saveCorreo = async () => {
    if (!correoInput.trim()) return;
    await api("POST", "/correos-consultas", { email: correoInput });
    setCorreoInput(""); setShowAddCorreo(false); reload();
  };
  const deleteCorreo = async (email: string) => { await api("DELETE", "/correos-consultas", { email }); reload(); };

  const handleFileDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file?.type === "application/pdf") { await apiFile(file); reload(); }
  };
  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file?.type === "application/pdf") { await apiFile(file); reload(); }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };
  const deleteDoc = async (id: string) => { await api("DELETE", `/documentos/${id}?accountId=${accountId}`); reload(); };

  const toggleSwitch = async () => { await api("PUT", "/switch", { switchActivo: !autoData.switchActivo }); reload(); };
  const toggleSortByCarga = async () => { await api("PUT", "/sort-by-carga", { sortByCarga: !autoData.sortByCarga }); reload(); };
  const toggleAutoAssign = async () => { await api("PUT", "/auto-assign-enabled", { autoAssignEnabled: !autoData.autoAssignEnabled }); reload(); };
  const toggleSeleccion = async (field: 'respondConsultasGenerales' | 'respondSolicitudesServicio' | 'soloContactosConocidos') => {
    const current = field === 'soloContactosConocidos' ? (autoData[field] ?? false) : (autoData[field] ?? true);
    await api("PUT", "/email-selection", { [field]: !current });
    reload();
  };
  const sendManualMessage = async () => {
    const conv = autoData.emailConversations.find(c => c.id === selectedEmailConv);
    if (!selectedEmailConv || !conv?.autoReplyPaused || isSending) return;
    const text = messageInput.trim();
    if (!text && pendingFiles.length === 0) return;
    setIsSending(true);
    setMessageInput("");
    const filesToSend = [...pendingFiles];
    setPendingFiles([]);
    try {
      const formData = new FormData();
      formData.append('accountId', accountId);
      formData.append('conversationId', selectedEmailConv);
      formData.append('text', text);
      for (const file of filesToSend) {
        formData.append('files', file);
      }
      const res = await authFetch(`${API}/conversations/${selectedEmailConv}/send`, {
        method: 'POST',
        body: formData,
      });
      const result = await res.json();
      const sentAttachments: EmailAttachment[] = result.attachments || [];
      setAutoData(prev => ({
        ...prev,
        emailConversations: prev.emailConversations.map(c =>
          c.id === selectedEmailConv ? {
            ...c,
            messages: [...c.messages, {
              id: Date.now().toString(),
              from: 'me',
              text,
              time: new Date().toISOString(),
              sent: true,
              attachments: sentAttachments,
            }],
          } : c
        ),
      }));
    } catch { /* error */ } finally {
      setIsSending(false);
    }
  };
  const toggleConvAutoReply = async (convId: string, paused: boolean) => {
    try {
      await authFetch(`${API}/conversations/${convId}/auto-reply`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, conversationId: convId, paused }),
      });
      setAutoData(prev => ({
        ...prev,
        emailConversations: prev.emailConversations.map(c =>
          c.id === convId ? { ...c, autoReplyPaused: paused } : c
        ),
      }));
    } catch { /* error */ }
  };
  const setSubcuentaEsp = async (subcuentaId: string, especialidadId: string) => {
    await api("PUT", "/subcuenta-especialidad", { subcuentaId, especialidadId }); reload();
  };

  // Folder CRUD
  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const res = await authFetch(`${API}/email-folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, name: newFolderName.trim() }),
      });
      if (res.ok) {
        const { folder } = await res.json();
        setAutoData(prev => ({ ...prev, emailFolders: [...prev.emailFolders, folder] }));
        setNewFolderName('');
      }
    } catch { /* error */ }
  };
  const deleteFolder = async (folderId: string) => {
    try {
      await authFetch(`${API}/email-folders/${folderId}?accountId=${accountId}`, { method: 'DELETE' });
      setAutoData(prev => ({ ...prev, emailFolders: prev.emailFolders.filter(f => f.id !== folderId) }));
      if (folderFilter === folderId) setFolderFilter('');
    } catch { /* error */ }
  };
  const assignToFolder = async (folderId: string, conversationId: string) => {
    try {
      await authFetch(`${API}/email-folders/assign`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, folderId, conversationId }),
      });
      setAutoData(prev => ({
        ...prev,
        emailFolders: prev.emailFolders.map(f => ({
          ...f,
          conversationIds: f.id === folderId
            ? [...f.conversationIds.filter(id => id !== conversationId), conversationId]
            : f.conversationIds.filter(id => id !== conversationId),
        })),
      }));
    } catch { /* error */ }
  };
  const removeFromFolder = async (folderId: string, conversationId: string) => {
    try {
      await authFetch(`${API}/email-folders/remove`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, folderId, conversationId }),
      });
      setAutoData(prev => ({
        ...prev,
        emailFolders: prev.emailFolders.map(f =>
          f.id === folderId ? { ...f, conversationIds: f.conversationIds.filter(id => id !== conversationId) } : f
        ),
      }));
    } catch { /* error */ }
  };
  const copyMessage = (msgId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(null), 1500);
  };
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };
  const handleEmailFileSelect = (files: FileList | null) => {
    if (!files) return;
    const maxSize = 10 * 1024 * 1024;
    const validFiles = Array.from(files).filter(f => f.size <= maxSize);
    setPendingFiles(prev => [...prev, ...validFiles].slice(0, 10));
  };
  const removePendingFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };
  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return Image;
    return FileText;
  };

  const stats = { emailMessages: autoData.emailConversations.reduce((a, c) => a + c.messages.length, 0), emailConversations: autoData.emailConversations.length, emailUnread: autoData.emailConversations.reduce((a, c) => a + c.unread, 0), whatsappMessages: waConversations.reduce((a, c) => a + c.messages.length, 0), whatsappConversations: waConversations.length, whatsappUnread: waConversations.reduce((a, c) => a + c.unread, 0) };

  if (view === "calendar") {
    return (
      <div className="h-[calc(100vh-0px)] flex flex-col">
        <div className="flex items-center justify-between p-3 md:p-4 border-b border-border bg-card">
          <div className="flex items-center gap-3">
            <button onClick={() => setView("main")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />{t('common.back')}
            </button>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-foreground" />
              <span className="text-sm font-semibold text-foreground">{t('automations.calendar')}</span>
            </div>
          </div>
          {calendarConnected && (
            <button onClick={() => setShowConfirmDisconnect(true)} className="text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1">
              {t('automations.calendarDisconnect')}
            </button>
          )}
        </div>
        <div className="flex-1 flex flex-col overflow-hidden p-4 md:p-6 gap-3">
          <style>{`
            /* ── base ── */
            .fc { color: inherit; font-size: 0.8rem; }
            /* ── toolbar inside card box ── */
            .fc .fc-toolbar { margin: 0 !important; padding: 10px 14px; border-bottom: 1px solid hsl(var(--border)); background: transparent; }
            .fc .fc-toolbar-title { font-size: 0.92rem !important; font-weight: 700; letter-spacing: -0.01em; }
            /* ── scrollgrid: no outer border (card wrapper handles it) ── */
            table.fc-scrollgrid { border: none !important; }
            .fc-scrollgrid td, .fc-scrollgrid th { border-color: hsl(var(--border)) !important; }
            /* ── weekday header ── */
            .fc .fc-col-header-cell { background: hsl(var(--muted)/0.45); padding: 5px 0; }
            .dark .fc .fc-col-header-cell { background: transparent; }
            .fc .fc-col-header-cell-cushion { font-size: 0.67rem; color: hsl(var(--muted-foreground)); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; text-decoration: none; }
            /* ── day cells ── */
            .fc .fc-daygrid-day { background: hsl(var(--card)); transition: background 0.12s; }
            .fc .fc-daygrid-day:hover { background: hsl(var(--accent)/0.6); }
            .fc .fc-day-today { background: hsl(var(--primary)/0.08) !important; }
            .fc .fc-day-today .fc-daygrid-day-number { background: hsl(var(--foreground)); color: hsl(var(--background)); border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; font-weight: 700; }
            .fc .fc-daygrid-day-number { font-size: 0.71rem; color: hsl(var(--foreground)); text-decoration: none; padding: 4px 6px; }
            /* ── prev / next: just the arrow icon, no box ── */
            .fc .fc-prev-button,
            .fc .fc-next-button { background: transparent !important; border: none !important; color: hsl(var(--foreground)) !important; box-shadow: none !important; padding: 4px 6px !important; border-radius: 50% !important; transition: background 0.12s !important; }
            .fc .fc-prev-button:hover,
            .fc .fc-next-button:hover { background: hsl(var(--accent)) !important; }
            .fc .fc-prev-button:focus,
            .fc .fc-next-button:focus { box-shadow: none !important; }
            /* ── today + view-switch buttons: same ghost style as arrows ── */
            .fc .fc-today-button,
            .fc .fc-dayGridMonth-button,
            .fc .fc-timeGridWeek-button { background: transparent !important; color: hsl(var(--foreground)) !important; border: none !important; font-size: 0.7rem !important; padding: 4px 9px !important; box-shadow: none !important; border-radius: 6px !important; transition: background 0.12s !important; font-weight: 500 !important; }
            .fc .fc-today-button:hover,
            .fc .fc-dayGridMonth-button:hover,
            .fc .fc-timeGridWeek-button:hover { background: hsl(var(--accent)) !important; }
            .fc .fc-today-button:disabled { opacity: 0.35 !important; }
            .fc .fc-button-primary:not(:disabled).fc-button-active { background: hsl(var(--accent)) !important; color: hsl(var(--foreground)) !important; opacity: 1 !important; font-weight: 700 !important; }
            /* ── fixed-height day rows with internal scroll ── */
            .fc .fc-daygrid-day-frame { min-height: 86px !important; max-height: 86px !important; overflow: hidden; display: flex; flex-direction: column; }
            .fc .fc-daygrid-day-events { overflow-y: auto; overflow-x: hidden; max-height: 56px; flex: 1; scrollbar-width: thin; scrollbar-color: hsl(var(--border)) transparent; }
            .fc .fc-daygrid-day-events::-webkit-scrollbar { width: 3px; }
            .fc .fc-daygrid-day-events::-webkit-scrollbar-thumb { background: hsl(var(--border)); border-radius: 2px; }
            /* ── events: coloured but slightly transparent ── */
            .fc .fc-event { cursor: pointer; border: none !important; border-radius: 4px !important; font-size: 0.69rem !important; padding: 1px 5px !important; font-weight: 600; opacity: 0.72; box-shadow: 0 1px 3px rgba(0,0,0,0.10); transition: opacity 0.12s, transform 0.12s, box-shadow 0.12s; }
            .fc .fc-event:hover { opacity: 1; transform: translateY(-1px); box-shadow: 0 3px 8px rgba(0,0,0,0.18); }
            .fc .fc-daygrid-event-dot { border-color: hsl(var(--primary)) !important; }
            .fc .fc-more-link { font-size: 0.65rem; color: hsl(var(--primary)); font-weight: 600; }
            /* ── popover ── */
            .fc .fc-popover { background: hsl(var(--card)); border: 1px solid hsl(var(--border)); border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.14); color: hsl(var(--foreground)); overflow: hidden; }
            .fc .fc-popover-header { background: hsl(var(--muted)/0.5); padding: 6px 10px; font-size: 0.72rem; font-weight: 600; }
            .fc .fc-popover-body { padding: 6px; }
          `}</style>
          {!calendarConnected ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                <Calendar className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-1">{t('automations.calendarNotConnected')}</h3>
                <p className="text-xs text-muted-foreground">{t('automations.calendarDesc')}</p>
              </div>
              <button onClick={handleConnectCalendar} disabled={calendarLoading} className="px-4 py-2 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                {calendarLoading ? '...' : t('automations.calendarConnect')}
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 p-2 rounded-lg bg-green-500/10 border border-green-500/30">
                  <div className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
                  <span className="text-xs text-foreground">{t('automations.calendarConnectedAs', { email: calendarEmail })}</span>
                </div>
                <button onClick={() => setShowAddEventForm(true)} className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-card hover:bg-accent text-foreground text-xs font-medium transition-colors">
                  <Plus className="h-3.5 w-3.5" />{t('automations.calendarAddEvent')}
                </button>
              </div>
              {calendarLoading ? (
                <div className="text-xs text-muted-foreground text-center py-8">...</div>
              ) : (
                <div className="flex-1 min-h-0 rounded-xl border border-border overflow-hidden bg-card">
                  <FullCalendar
                    plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                    initialView="dayGridMonth"
                    headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' }}
                    locale={i18n.language}
                    locales={allLocales}
                    height={720}
                    dayMaxEvents={false}
                    events={(() => {
                      const palette = [
                        '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6',
                        '#06b6d4', '#f97316', '#ec4899', '#84cc16', '#14b8a6',
                      ];
                      const hashCode = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; } return Math.abs(h); };
                      return calendarEvents.map((e: any) => {
                        const color = e.colorId ? (GOOGLE_COLOR_MAP[e.colorId] || palette[hashCode(e.id) % palette.length]) : palette[hashCode(e.id) % palette.length];
                        return {
                          id: e.id,
                          title: e.summary,
                          start: e.start?.dateTime || e.start?.date,
                          end: e.end?.dateTime || e.end?.date,
                          allDay: !e.start?.dateTime,
                          backgroundColor: color,
                          borderColor: color,
                          textColor: '#ffffff',
                          extendedProps: { description: e.description, colorId: e.colorId, recurrence: e.recurrence },
                        };
                      });
                    })()}
                    dateClick={(info) => {
                      setEventForm(f => ({ ...f, date: info.dateStr.split('T')[0], allDay: true }));
                      setShowAddEventForm(true);
                    }}
                    eventClick={(info) => {
                      setSelectedEventDetail({
                        id: info.event.id,
                        title: info.event.title,
                        description: info.event.extendedProps.description,
                        start: info.event.start,
                        end: info.event.end,
                        allDay: info.event.allDay,
                        location: info.event.extendedProps.location,
                        colorId: info.event.extendedProps.colorId,
                        recurrence: info.event.extendedProps.recurrence,
                        attendees: info.event.extendedProps.attendees,
                      });
                    }}
                  />
                </div>
              )}
            </>
          )}
        </div>
        {showAddEventForm && (
          <Modal title={editingEventId ? t('automations.calendarEditEvent') : t('automations.calendarAddEvent')} onClose={() => { setShowAddEventForm(false); resetEventForm(); }}>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-foreground">{t('automations.calendarEventTitle')} *</label>
                <input type="text" value={eventForm.title} onChange={(e) => setEventForm(f => ({ ...f, title: e.target.value }))} className="mt-1 w-full text-xs border border-border rounded px-3 py-2 bg-background text-foreground focus:outline-none" placeholder={t('automations.calendarEventTitle')} />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="calAllDay" checked={eventForm.allDay} onChange={(e) => setEventForm(f => ({ ...f, allDay: e.target.checked }))} className="h-3.5 w-3.5" />
                <label htmlFor="calAllDay" className="text-xs text-foreground cursor-pointer">{t('automations.calendarAllDay')}</label>
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">{t('automations.calendarDate')} *</label>
                <input type="date" value={eventForm.date} onChange={(e) => setEventForm(f => ({ ...f, date: e.target.value }))} className="mt-1 w-full text-xs border border-border rounded px-3 py-2 bg-background text-foreground focus:outline-none" />
              </div>
              {!eventForm.allDay && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-foreground">{t('automations.calendarStartTime')}</label>
                    <input type="time" value={eventForm.startTime} onChange={(e) => setEventForm(f => ({ ...f, startTime: e.target.value }))} className="mt-1 w-full text-xs border border-border rounded px-3 py-2 bg-background text-foreground focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-foreground">{t('automations.calendarEndTime')}</label>
                    <input type="time" value={eventForm.endTime} onChange={(e) => setEventForm(f => ({ ...f, endTime: e.target.value }))} className="mt-1 w-full text-xs border border-border rounded px-3 py-2 bg-background text-foreground focus:outline-none" />
                  </div>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-foreground">{t('automations.calendarDescription')}</label>
                <textarea value={eventForm.description} onChange={(e) => setEventForm(f => ({ ...f, description: e.target.value }))} rows={2} className="mt-1 w-full text-xs border border-border rounded px-3 py-2 bg-background text-foreground focus:outline-none resize-none" placeholder={t('automations.calendarDescription')} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-foreground">{t('automations.calendarColor') || 'Color'}</label>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => setEventForm(f => ({ ...f, colorId: '' }))} className={`h-6 w-6 rounded-full border-2 transition-all ${!eventForm.colorId ? 'border-foreground scale-110' : 'border-transparent'}`} style={{ background: '#6366f1' }} title="Default" />
                    {Object.entries(GOOGLE_COLOR_MAP).map(([id, hex]) => (
                      <button key={id} type="button" onClick={() => setEventForm(f => ({ ...f, colorId: id }))} className={`h-6 w-6 rounded-full border-2 transition-all ${eventForm.colorId === id ? 'border-foreground scale-110' : 'border-transparent'}`} style={{ background: hex }} />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground">{t('automations.calendarRecurrence')}</label>
                  <select value={eventForm.recurrence} onChange={(e) => setEventForm(f => ({ ...f, recurrence: e.target.value }))} className="mt-1 w-full text-xs border border-border rounded px-3 py-2 bg-background text-foreground focus:outline-none">
                    <option value="">{t('automations.calendarRecurrenceNone')}</option>
                    <option value="RRULE:FREQ=DAILY">{t('automations.calendarRecurrenceDaily')}</option>
                    <option value="RRULE:FREQ=WEEKLY">{t('automations.calendarRecurrenceWeekly')}</option>
                    <option value="RRULE:FREQ=MONTHLY">{t('automations.calendarRecurrenceMonthly')}</option>
                    <option value="RRULE:FREQ=YEARLY">{t('automations.calendarRecurrenceYearly')}</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={handleAddEvent} disabled={savingEvent || !eventForm.title || !eventForm.date} className="flex-1 px-3 py-2 bg-foreground text-background rounded-md text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                  {savingEvent ? '...' : t('automations.calendarSave')}
                </button>
                <button onClick={() => { setShowAddEventForm(false); resetEventForm(); }} className="px-3 py-2 border border-border rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                  {t('automations.cancel')}
                </button>
              </div>
            </div>
          </Modal>
        )}
        {selectedEventDetail && (
          <Modal title={t('automations.calendarUpcoming')} onClose={() => setSelectedEventDetail(null)}>
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/40 border border-border">
                <div className="h-9 w-9 rounded-lg bg-foreground/10 flex items-center justify-center shrink-0">
                  <Calendar className="h-4 w-4 text-foreground" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-foreground leading-tight break-words">{selectedEventDetail.title}</h3>
                  {selectedEventDetail.start && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {selectedEventDetail.allDay
                        ? selectedEventDetail.start.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                        : `${selectedEventDetail.start.toLocaleString([], { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}${selectedEventDetail.end ? ` – ${selectedEventDetail.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}`}
                    </p>
                  )}
                </div>
              </div>
              {selectedEventDetail.description ? (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{t('automations.calendarDescription')}</p>
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{selectedEventDetail.description}</p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">{t('automations.calendarNoDescription')}</p>
              )}
              {selectedEventDetail.recurrence && selectedEventDetail.recurrence.length > 0 && (
                <p className="text-xs text-muted-foreground italic">{t('automations.calendarRecurringEvent')}</p>
              )}
              <div className="flex gap-2 pt-1 border-t border-border">
                <button
                  onClick={() => handleEditEvent(selectedEventDetail)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-foreground/10 text-foreground border border-border rounded-md text-xs font-medium hover:bg-accent transition-all"
                >
                  {t('automations.calendarEditEvent')}
                </button>
                <button
                  onClick={() => { setConfirmDeleteEventId(selectedEventDetail.id); setSelectedEventDetail(null); }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-destructive/10 text-destructive border border-destructive/30 rounded-md text-xs font-medium hover:bg-destructive hover:text-destructive-foreground transition-all"
                >
                  <Trash2 className="h-3.5 w-3.5" />{t('automations.calendarDeleteEvent')}
                </button>
                <button onClick={() => setSelectedEventDetail(null)} className="ml-auto px-3 py-2 border border-border rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                  {t('automations.cancel')}
                </button>
              </div>
            </div>
          </Modal>
        )}
        {showConfirmDisconnect && (
          <Modal title={t('automations.calendarDisconnect')} onClose={() => setShowConfirmDisconnect(false)}>
            <div className="space-y-4">
              <p className="text-sm text-foreground">{t('automations.calendarDisconnectConfirm')}</p>
              <div className="flex gap-2">
                <button onClick={handleDisconnectCalendar} className="flex-1 px-3 py-2 bg-destructive text-destructive-foreground rounded-md text-xs font-medium hover:opacity-90 transition-opacity">
                  {t('automations.calendarDisconnect')}
                </button>
                <button onClick={() => setShowConfirmDisconnect(false)} className="px-3 py-2 border border-border rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                  {t('automations.cancel')}
                </button>
              </div>
            </div>
          </Modal>
        )}
        {confirmDeleteEventId && (
          <Modal title={t('automations.calendarDeleteEvent')} onClose={() => setConfirmDeleteEventId(null)}>
            <div className="space-y-4">
              <p className="text-sm text-foreground">{t('automations.calendarDeleteConfirm')}</p>
              <div className="flex gap-2">
                <button onClick={() => handleDeleteEvent(confirmDeleteEventId)} className="flex-1 px-3 py-2 bg-destructive text-destructive-foreground rounded-md text-xs font-medium hover:opacity-90 transition-opacity">
                  {t('automations.calendarDeleteEvent')}
                </button>
                <button onClick={() => setConfirmDeleteEventId(null)} className="px-3 py-2 border border-border rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                  {t('automations.cancel')}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    );
  }

  if (view === "email") {
    const allConversations = autoData.emailConversations;
    const conversations = allConversations.filter(c => {
      if (folderFilter) {
        const folder = autoData.emailFolders.find(f => f.id === folderFilter);
        if (!folder?.conversationIds.includes(c.id)) return false;
      }
      if (emailFilter === 'manual' && !c.autoReplyPaused) return false;
      if (emailFilter === 'auto' && c.autoReplyPaused) return false;
      if (emailSearch) {
        const q = emailSearch.toLowerCase();
        if (!c.contactName.toLowerCase().includes(q) && !c.contactEmail.toLowerCase().includes(q) && !c.subject.toLowerCase().includes(q)) return false;
      }
      return true;
    });
    const currentConv = allConversations.find(c => c.id === selectedEmailConv);
    const currentMessages = currentConv?.messages || [];

    return (
      <>
        <div className="h-[calc(100vh-0px)] flex flex-col">
          <div className="flex items-center justify-between p-3 md:p-4 border-b border-border bg-card flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <button onClick={() => setView("main")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="h-4 w-4" />{t('common.back')}
              </button>
              <div className="h-4 w-px bg-border" />
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-foreground" />
                <span className="text-sm font-semibold text-foreground">Email</span>
              </div>
            </div>
            <div className="flex items-center gap-2 md:gap-3 flex-wrap">
              <button onClick={() => setShowSeleccion(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-card hover:bg-accent text-foreground transition-colors">
                <Settings2 className="h-3.5 w-3.5" />{t('automations.emailSelection')}
              </button>
              <button onClick={() => setShowFolderPanel(!showFolderPanel)} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-card hover:bg-accent text-foreground transition-colors ${showFolderPanel ? 'ring-1 ring-ring' : ''}`}>
                <FolderOpen className="h-3.5 w-3.5" />{t('automations.organizeFolders')}
              </button>
              <button onClick={() => { setShowClassifyModal(true); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-card hover:bg-accent text-foreground transition-colors" title={t('automations.classifyRules') || 'Reglas de clasificación'}>
                <Settings className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setShowAsignacion(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-card hover:bg-accent text-foreground transition-colors">
                <Users className="h-3.5 w-3.5" />{t('automations.autoAssign')}
              </button>
              <button onClick={() => setShowConsultas(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-card hover:bg-accent text-foreground transition-colors">
                <HelpCircle className="h-3.5 w-3.5" />{t('automations.frequentQueriesTab')}
              </button>
              <SwitchBox active={autoData.switchActivo} onChange={toggleSwitch} label={t('automations.autoReply')} />
            </div>
          </div>
          <div className="flex flex-1 min-h-0 relative">
            {/* Mobile backdrop */}
            {isMobile && showConvPanel && (
              <div className="fixed inset-0 z-30 bg-black/50" onClick={() => setShowConvPanel(false)} />
            )}
            <div className={`${isMobile ? `fixed left-0 top-0 z-40 h-full w-72 transition-transform duration-300 ${showConvPanel ? 'translate-x-0' : '-translate-x-full'}` : 'w-80'} border-r border-border bg-card flex flex-col`}>
              <div className="p-3 border-b border-border space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input value={emailSearch} onChange={e => setEmailSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 text-sm bg-muted/50 border-none rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" placeholder={t('automations.searchConversation')} />
                </div>
                <div className="flex rounded-md border border-border overflow-hidden">
                  {(['all', 'manual', 'auto'] as const).map(f => (
                    <button key={f} onClick={() => setEmailFilter(f)} className={`flex-1 px-2 py-1 text-[11px] font-medium transition-colors ${emailFilter === f ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:bg-accent/50 hover:text-foreground'}`}>
                      {t(`automations.filter${f.charAt(0).toUpperCase() + f.slice(1)}`)}
                    </button>
                  ))}
                </div>
                {autoData.emailFolders.length > 0 && (
                  <div ref={folderDropdownRef} className="relative">
                    <button
                      onClick={() => setFolderDropdownOpen(!folderDropdownOpen)}
                      className="w-full flex items-center justify-between px-3 py-1.5 text-xs rounded-md border border-border bg-muted/50 text-foreground hover:bg-accent/50 transition-colors focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FolderOpen className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="truncate">{folderFilter ? autoData.emailFolders.find(f => f.id === folderFilter)?.name || t('automations.allConversations') : t('automations.allConversations')}</span>
                      </div>
                      <ChevronDown className={`h-3 w-3 text-muted-foreground shrink-0 transition-transform duration-200 ${folderDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {folderDropdownOpen && (
                      <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-card shadow-lg py-1 animate-in fade-in-0 zoom-in-95 duration-150">
                        <button
                          onClick={() => { setFolderFilter(''); setFolderDropdownOpen(false); }}
                          className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${!folderFilter ? 'bg-accent text-foreground font-medium' : 'text-foreground hover:bg-accent/50'}`}
                        >
                          <Mail className="h-3 w-3 text-muted-foreground" />
                          {t('automations.allConversations')}
                        </button>
                        {autoData.emailFolders.map(f => (
                          <button
                            key={f.id}
                            onClick={() => { setFolderFilter(f.id); setFolderDropdownOpen(false); }}
                            className={`w-full flex items-center justify-between px-3 py-1.5 text-xs transition-colors ${folderFilter === f.id ? 'bg-accent text-foreground font-medium' : 'text-foreground hover:bg-accent/50'}`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <FolderOpen className="h-3 w-3 text-muted-foreground shrink-0" />
                              <span className="truncate">{f.name}</span>
                            </div>
                            <span className="text-[10px] text-muted-foreground shrink-0">{f.conversationIds.length}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-y-auto">
                {conversations.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-8">{t('automations.noEmailConversations')}</p>
                )}
                {conversations.map((conv) => (
                  <button key={conv.id} draggable onDragStart={() => setDragConvId(conv.id)} onDragEnd={() => setDragConvId(null)} onClick={() => {
                    setSelectedEmailConv(conv.id);
                    if (isMobile) setShowConvPanel(false);
                    if (conv.unread > 0) {
                      const prevUnread = conv.unread;
                      // Clear unread locally
                      setAutoData(prev => ({
                        ...prev,
                        emailConversations: prev.emailConversations.map(c =>
                          c.id === conv.id ? { ...c, unread: 0 } : c
                        ),
                      }));
                      // Persist to backend — revert on failure
                      authFetch(`${API}/mark-read`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ accountId, conversationId: conv.id }),
                      }).catch(() => {
                        setAutoData(prev => ({
                          ...prev,
                          emailConversations: prev.emailConversations.map(c =>
                            c.id === conv.id ? { ...c, unread: prevUnread } : c
                          ),
                        }));
                      });
                    }
                  }}
                    className={`group w-full text-left p-3 border-b border-border/50 hover:bg-accent/50 transition-colors ${selectedEmailConv === conv.id ? "bg-accent" : ""}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                          <span className="text-xs font-semibold text-foreground">{conv.contactName.split(" ").map((n) => n[0]).join("").substring(0, 2)}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{conv.contactName}</p>
                          <p className="text-xs text-muted-foreground truncate">{conv.messages[conv.messages.length - 1]?.text || conv.subject}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-[10px] text-muted-foreground">{formatTime(conv.messages[conv.messages.length - 1]?.time || "")}</span>
                        <div className="flex items-center gap-1">
                          {conv.unread > 0 && (
                            <span className="h-4 min-w-4 px-1 rounded-full bg-foreground text-background text-[10px] font-bold flex items-center justify-center">{conv.unread}</span>
                          )}
                          {conv.autoReplyPaused && (
                            <PauseCircle className="h-3.5 w-3.5 text-amber-500" title="Auto-reply pausado" />
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              authFetch(`${API}/conversations/${conv.id}?accountId=${accountId}`, { method: 'DELETE' })
                                .then(() => {
                                  setAutoData(prev => ({
                                    ...prev,
                                    emailConversations: prev.emailConversations.filter(c => c.id !== conv.id),
                                  }));
                                  if (selectedEmailConv === conv.id) setSelectedEmailConv("");
                                })
                                .catch(() => {});
                            }}
                            className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                            title={t('automations.deleteConversation')}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 flex flex-col bg-background">
              {currentConv ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3 md:p-4 border-b border-border bg-card">
                    <div className="flex items-center gap-3 min-w-0">
                      {isMobile && (
                        <button onClick={() => setShowConvPanel(true)} className="p-1.5 rounded-md hover:bg-accent transition-colors">
                          <PanelLeft className="h-4 w-4 text-muted-foreground" />
                        </button>
                      )}
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <span className="text-xs font-semibold text-foreground">{currentConv.contactName.split(" ").map((n) => n[0]).join("").substring(0, 2)}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{currentConv.contactName}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{currentConv.contactEmail}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {currentConv.autoReplyPaused && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 font-medium whitespace-nowrap">Auto-reply pausado</span>}
                      <SwitchBox active={!currentConv.autoReplyPaused} onChange={() => toggleConvAutoReply(currentConv.id, !currentConv.autoReplyPaused)} label="Auto-reply" />
                    </div>
                  </div>
                  <div
                    className={`flex-1 overflow-y-auto p-4 space-y-3 transition-colors ${chatDragOver ? 'bg-primary/5 ring-2 ring-primary/30 ring-inset' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); if (currentConv.autoReplyPaused) setChatDragOver(true); }}
                    onDragLeave={() => setChatDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setChatDragOver(false);
                      if (currentConv.autoReplyPaused && e.dataTransfer.files.length > 0) handleEmailFileSelect(e.dataTransfer.files);
                    }}
                  >
                    {chatDragOver && (
                      <div className="flex items-center justify-center py-8 text-primary/60 text-sm font-medium pointer-events-none">
                        <Upload className="h-5 w-5 mr-2" />{t('automations.dropFilesHere')}
                      </div>
                    )}
                    {currentMessages.map((msg) => (
                      <div key={msg.id} className={`group/msg flex ${msg.sent ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[70%] px-3 py-2 rounded-lg text-sm ${msg.sent ? "bg-foreground text-background rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"}`}>
                          {msg.text && <p className="whitespace-pre-wrap break-words">{msg.text}</p>}
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className={`${msg.text ? 'mt-2 pt-2 border-t' : ''} ${msg.sent ? 'border-background/20' : 'border-border'} space-y-1`}>
                              {msg.attachments.map((att) => {
                                const IconComp = getFileIcon(att.mimeType);
                                return (
                                  <a
                                    key={att.id}
                                    href={`${API}/email-attachments/${encodeURIComponent(att.filename)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors ${msg.sent ? 'bg-background/10 hover:bg-background/20 text-background' : 'bg-accent/50 hover:bg-accent text-foreground'}`}
                                  >
                                    <IconComp className="h-3.5 w-3.5 shrink-0" />
                                    <span className="truncate flex-1">{att.originalName}</span>
                                    <span className="shrink-0 text-[10px] opacity-60">{formatFileSize(att.size)}</span>
                                    <Download className="h-3 w-3 shrink-0 opacity-60" />
                                  </a>
                                );
                              })}
                            </div>
                          )}
                          <div className={`flex items-center justify-between mt-1 gap-2`}>
                            <p className={`text-[10px] ${msg.sent ? "text-background/60" : "text-muted-foreground"}`}>{formatTime(msg.time)}</p>
                            <button
                              onClick={() => copyMessage(msg.id, msg.text)}
                              className={`p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 opacity-0 group-hover/msg:opacity-100 transition-opacity ${msg.sent ? "text-background/60 hover:text-background" : "text-muted-foreground hover:text-foreground"}`}
                              title={t('automations.copyMessage')}
                            >
                              {copiedMsgId === msg.id ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                  <div className="p-3 border-t border-border bg-card">
                    {pendingFiles.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2 px-1">
                        {pendingFiles.map((file, i) => {
                          const IconComp = getFileIcon(file.type);
                          return (
                            <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted text-xs text-foreground max-w-[200px]">
                              <IconComp className="h-3 w-3 shrink-0 text-muted-foreground" />
                              <span className="truncate">{file.name}</span>
                              <span className="shrink-0 text-[10px] text-muted-foreground">{formatFileSize(file.size)}</span>
                              <button onClick={() => removePendingFile(i)} className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive shrink-0">
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <input type="file" ref={emailFileInputRef} className="hidden" multiple onChange={(e) => { handleEmailFileSelect(e.target.files); e.target.value = ''; }} />
                    <div className="flex items-center gap-2">
                      <button onClick={() => emailFileInputRef.current?.click()} disabled={!currentConv.autoReplyPaused} className="p-2 rounded-md hover:bg-accent text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed" title={t('automations.attachFiles')}><Paperclip className="h-4 w-4" /></button>
                      <input className="flex-1 px-3 py-2 text-sm bg-muted/50 border-none rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
                        placeholder={currentConv.autoReplyPaused ? t('automations.writeMessage') : t('automations.pauseToSend')} value={messageInput} onChange={(e) => setMessageInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendManualMessage(); } }} disabled={!currentConv.autoReplyPaused} />
                      <button onClick={sendManualMessage} disabled={!currentConv.autoReplyPaused || isSending} className="p-2 rounded-md bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"><Send className="h-4 w-4" /></button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm gap-3">
                  {isMobile && (
                    <button onClick={() => setShowConvPanel(true)} className="px-3 py-1.5 rounded-md bg-accent text-foreground text-xs font-medium hover:bg-accent/80 transition-colors">
                      <PanelLeft className="h-4 w-4 inline mr-1.5" />{t('automations.searchConversation')}
                    </button>
                  )}
                  {conversations.length === 0 ? t('automations.activateToStart') : t('automations.selectConversation')}
                </div>
              )}
            </div>
            {/* Folder panel */}
            <div className={`border-l border-border bg-card flex flex-col overflow-hidden transition-all duration-300 ease-in-out ${showFolderPanel ? 'w-56 opacity-100' : 'w-0 opacity-0 border-l-0'}`}>
              {showFolderPanel && (
                <>
                <div className="p-3 border-b border-border">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-foreground">{t('automations.folders')}</p>
                    <button onClick={() => {
                      if (newFolderName.trim()) { createFolder(); }
                      else { setNewFolderName(' '); setTimeout(() => { setNewFolderName(''); folderInputRef.current?.focus(); }, 0); }
                    }} className="p-1.5 rounded-md bg-foreground text-background hover:opacity-90 transition-opacity" title={t('automations.createFolder')}>
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                  <input
                    ref={folderInputRef}
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') createFolder(); }}
                    placeholder={t('automations.newFolder')}
                    className="w-full px-2 py-1.5 text-xs bg-muted/50 border-none rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {autoData.emailFolders.length === 0 && (
                    <p className="text-[10px] text-muted-foreground text-center py-4">{t('automations.noFolders')}</p>
                  )}
                  {autoData.emailFolders.map((folder) => {
                    const isExpanded = expandedFolderId === folder.id;
                    const folderConvs = autoData.emailConversations.filter(c => folder.conversationIds.includes(c.id));
                    return (
                      <div key={folder.id}>
                        <div
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => { if (dragConvId) assignToFolder(folder.id, dragConvId); }}
                          className={`group/folder flex items-center justify-between p-2 rounded-md border border-border hover:bg-accent/50 transition-colors cursor-pointer ${dragConvId ? 'border-dashed border-primary/50' : ''}`}
                          onClick={() => setExpandedFolderId(isExpanded ? null : folder.id)}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <ChevronRight className={`h-3 w-3 text-muted-foreground shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                            <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-xs text-foreground truncate">{folder.name}</span>
                            <span className="text-[10px] text-muted-foreground">({folder.conversationIds.length})</span>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteFolder(folder.id); }}
                            className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive opacity-0 group-hover/folder:opacity-100 transition-opacity"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                        {isExpanded && (
                          <div className="ml-3 mt-1 space-y-0.5">
                            {folderConvs.length === 0 && (
                              <p className="text-[10px] text-muted-foreground py-1 pl-2">{t('automations.emptyFolder')}</p>
                            )}
                            {folderConvs.map(conv => (
                              <div key={conv.id} className="group/fconv flex items-center justify-between px-2 py-1 rounded-md hover:bg-accent/30 transition-colors text-xs">
                                <div className="flex items-center gap-1.5 min-w-0 cursor-pointer" onClick={() => { setSelectedEmailConv(conv.id); setFolderFilter(''); }}>
                                  <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center shrink-0">
                                    <span className="text-[8px] font-semibold">{conv.contactName.split(" ").map((n) => n[0]).join("").substring(0, 2)}</span>
                                  </div>
                                  <div className="min-w-0">
                                    <span className="block truncate text-foreground">{conv.contactName}</span>
                                    <span className="block truncate text-[9px] text-muted-foreground">{conv.contactEmail}</span>
                                  </div>
                                </div>
                                <button
                                  onClick={() => removeFromFolder(folder.id, conv.id)}
                                  className="p-0.5 rounded hover:bg-amber-500/10 text-muted-foreground hover:text-amber-600 opacity-0 group-hover/fconv:opacity-100 transition-opacity shrink-0"
                                  title={t('automations.removeFromFolder')}
                                >
                                  <X className="h-2.5 w-2.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                </>
              )}
            </div>
          </div>
        </div>

        {showClassifyModal && (
          <Modal title={t('automations.classifyRules') || 'Reglas de clasificación automática'} onClose={() => setShowClassifyModal(false)} wide>
            <div className="space-y-5">
              <p className="text-xs text-muted-foreground">{t('automations.classifyRulesDesc') || 'Define reglas para que la IA clasifique automáticamente los emails entrantes en las carpetas que indiques.'}</p>

              {/* Formulario nueva regla */}
              <div className="space-y-3 p-4 rounded-lg border border-border bg-muted/30">
                <h3 className="text-xs font-semibold text-foreground">{t('automations.newClassifyRule') || 'Nueva regla'}</h3>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-foreground">{t('automations.classifyRuleName') || 'Nombre'}</label>
                  <input
                    value={classifyForm.name}
                    onChange={e => setClassifyForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder={t('automations.classifyRuleNamePlaceholder') || 'Ej: Facturas recibidas'}
                    className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-foreground">{t('automations.classifyRuleDesc') || 'Descripción'}</label>
                  <textarea
                    value={classifyForm.description}
                    onChange={e => setClassifyForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder={t('automations.classifyRuleDescPlaceholder') || 'Describe qué tipo de emails deben clasificarse aquí. Ej: Emails que contienen facturas, recibos o cobros de proveedores.'}
                    rows={3}
                    className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-foreground">{t('automations.classifyRuleFolders') || 'Carpetas destino'}</label>
                  {autoData.emailFolders.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t('automations.noFolders') || 'No hay carpetas creadas'}</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {autoData.emailFolders.map(folder => (
                        <button
                          key={folder.id}
                          onClick={() => toggleClassifyFolder(folder.id)}
                          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full border transition-colors ${classifyForm.folderIds.includes(folder.id) ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-muted/50 text-foreground hover:bg-accent/50'}`}
                        >
                          <FolderOpen className="h-3 w-3" />
                          {folder.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={saveClassifyRule}
                  disabled={classifyLoading || !classifyForm.name.trim() || !classifyForm.description.trim() || classifyForm.folderIds.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {classifyLoading ? (
                    <span className="h-3 w-3 border border-background/50 border-t-background rounded-full animate-spin" />
                  ) : (
                    <Plus className="h-3 w-3" />
                  )}
                  {t('automations.saveClassifyRule') || 'Guardar regla'}
                </button>
              </div>

              {/* Lista de reglas guardadas */}
              {classifyRules.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-foreground">{t('automations.savedClassifyRules') || 'Reglas guardadas'}</h3>
                  {classifyRules.map(rule => (
                    <div key={rule.id} className="group flex items-start justify-between p-3 rounded-lg border border-border bg-muted/20 gap-3">
                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="text-sm font-medium text-foreground truncate">{rule.name}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2">{rule.description}</p>
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {rule.folderIds.map(fid => {
                            const folder = autoData.emailFolders.find(f => f.id === fid);
                            if (!folder) return null;
                            return (
                              <span key={fid} className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full bg-primary/10 text-primary border border-primary/20">
                                <FolderOpen className="h-2.5 w-2.5" />{folder.name}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                      <button
                        onClick={() => deleteClassifyRule(rule.id)}
                        className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Modal>
        )}

        {showSeleccion && (
          <Modal title={t('automations.emailSelection')} onClose={() => setShowSeleccion(false)}>
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground mb-4">{t('automations.emailSelectionDesc')}</p>
              <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-background">
                <div className="flex-1 mr-3">
                  <p className="text-sm font-medium text-foreground">{t('automations.respondConsultas')}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('automations.respondConsultasDesc')}</p>
                </div>
                <SwitchBox active={autoData.respondConsultasGenerales !== false} onChange={() => toggleSeleccion('respondConsultasGenerales')} label="" />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-background">
                <div className="flex-1 mr-3">
                  <p className="text-sm font-medium text-foreground">{t('automations.respondSolicitudes')}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('automations.respondSolicitudesDesc')}</p>
                </div>
                <SwitchBox active={autoData.respondSolicitudesServicio !== false} onChange={() => toggleSeleccion('respondSolicitudesServicio')} label="" />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-background">
                <div className="flex-1 mr-3">
                  <p className="text-sm font-medium text-foreground">{t('automations.onlyKnownContacts')}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('automations.onlyKnownContactsDesc')}</p>
                </div>
                <SwitchBox active={autoData.soloContactosConocidos === true} onChange={() => toggleSeleccion('soloContactosConocidos')} label="" />
              </div>
            </div>
          </Modal>
        )}

        {showAsignacion && (
          <Modal title={t('automations.autoAssign')} onClose={() => setShowAsignacion(false)} wide>
            <div className="flex items-center justify-between mb-5">
              <SwitchBox active={autoData.autoAssignEnabled} onChange={toggleAutoAssign} label={t('automations.enableAutoAssign') || 'Activar asignación automática'} />
            </div>
            <div className={`${!autoData.autoAssignEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="flex items-center justify-between mb-5">
              <SwitchBox active={autoData.sortByCarga} onChange={toggleSortByCarga} label={t('automations.sortByWorkload')} />
              <button onClick={() => setShowEspecialidades(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-foreground text-background hover:opacity-90">
                <Plus className="h-3.5 w-3.5" />{t('automations.createSpeciality')}
              </button>
            </div>
            {subcuentas.length === 0
              ? <p className="text-sm text-muted-foreground text-center py-8">{t('automations.noSubaccounts')}</p>
              : <div className="space-y-3">
                  {subcuentas.map((sc) => (
                    <div key={sc.id} className="flex items-center justify-between p-4 border border-border rounded-lg bg-muted/30">
                      <div><p className="text-sm font-medium text-foreground">{sc.name}</p><p className="text-xs text-muted-foreground">{sc.email}</p></div>
                      <select value={autoData.subcuentaEspecialidades[sc.id] || ""} onChange={(e) => setSubcuentaEsp(sc.id, e.target.value)}
                        className="text-xs px-2 py-1.5 rounded-md border border-border bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                        <option value="">{t('automations.noSpeciality')}</option>
                        {autoData.especialidades.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                      </select>
                    </div>
                  ))}
                </div>}
            </div>
          </Modal>
        )}

        {showEspecialidades && (
          <Modal title={t('automations.specialities')} onClose={() => { setShowEspecialidades(false); setShowCreateEspForm(false); setEditingEspId(null); }}>
            <div className="flex items-center justify-between mb-5">
              <span className="text-xs text-muted-foreground">{autoData.especialidades.length} {autoData.especialidades.length !== 1 ? "specialities" : "speciality"}</span>
              <button onClick={() => { setEditingEspId(null); setEspForm({ nombre: "", descripcion: "" }); setShowCreateEspForm(true); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-foreground text-background hover:opacity-90">
                <Plus className="h-3.5 w-3.5" />{t('automations.create')}
              </button>
            </div>
            {showCreateEspForm && (
              <div className="mb-5 p-4 border border-border rounded-lg bg-muted/20 space-y-3">
                <p className="text-xs font-medium text-foreground mb-1">{editingEspId ? t('automations.editSpeciality') : t('automations.create')}</p>
                <input placeholder={t('automations.namePlaceholder')} value={espForm.nombre} onChange={(e) => setEspForm({ ...espForm, nombre: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-md border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                <textarea placeholder={t('automations.whatIsIt')} value={espForm.descripcion} onChange={(e) => setEspForm({ ...espForm, descripcion: e.target.value })} rows={3}
                  className="w-full px-3 py-2 text-sm rounded-md border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => { setShowCreateEspForm(false); setEditingEspId(null); }} className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground">{t('automations.cancel')}</button>
                  <button onClick={saveEspecialidad} className="px-3 py-1.5 text-xs rounded-md bg-foreground text-background hover:opacity-90">{t('automations.save')}</button>
                </div>
              </div>
            )}
            {autoData.especialidades.length === 0
              ? <p className="text-sm text-muted-foreground text-center py-6">{t('automations.noSpecialities')}</p>
              : <div className="space-y-3">
                  {autoData.especialidades.map((e) => (
                    <div key={e.id} className="flex items-start justify-between p-4 border border-border rounded-lg bg-muted/20">
                      <div><p className="text-sm font-medium text-foreground">{e.nombre}</p>{e.descripcion && <p className="text-xs text-muted-foreground mt-0.5">{e.descripcion}</p>}</div>
                      <div className="flex gap-1">
                        <button onClick={() => startEditEsp(e)} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => deleteEsp(e.id)} className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>}
          </Modal>
        )}

        {showConsultas && (
          <Modal title={t('automations.frequentQueries')} onClose={() => setShowConsultas(false)}>
            <div className="flex items-center justify-end gap-2 mb-5">
              <button onClick={() => { setShowSubirInfo(true); setShowConsultas(false); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-card hover:bg-accent text-foreground">
                <Upload className="h-3.5 w-3.5" />{t('automations.uploadInfo')}
              </button>
              <button onClick={() => { setShowCorreosConsultas(true); setShowConsultas(false); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-card hover:bg-accent text-foreground">
                <Mail className="h-3.5 w-3.5" />{t('automations.queryEmail')}
              </button>
              <button onClick={() => { setShowCuentasCorreo(true); setShowConsultas(false); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-foreground text-background hover:opacity-90">
                <Plus className="h-3.5 w-3.5" />{t('automations.emailAccounts')}
              </button>
            </div>
            <p className="text-sm text-muted-foreground text-center py-6">{t('automations.selectOption')}</p>
          </Modal>
        )}

        {showCuentasCorreo && (
          <Modal title={t('automations.emailAccountsTitle')} onClose={() => setShowCuentasCorreo(false)}>
            <div className="flex items-center justify-between mb-5">
              <span className="text-xs text-muted-foreground">{autoData.cuentasCorreo.length} {autoData.cuentasCorreo.length !== 1 ? "accounts" : "account"}</span>
              <button onClick={() => setShowAddCuenta(true)} disabled={autoData.cuentasCorreo.length >= 1} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-foreground text-background hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed">
                <Plus className="h-3.5 w-3.5" />{t('automations.add')}
              </button>
            </div>
            {showAddCuenta && (
              <div className="mb-5 p-4 border border-border rounded-lg bg-muted/20 space-y-3">
                <select value={cuentaForm.plataforma} onChange={(e) => setCuentaForm({ ...cuentaForm, plataforma: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-md border border-border bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                  {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
                <input placeholder={t('automations.emailPlaceholder')} value={cuentaForm.correo} onChange={(e) => setCuentaForm({ ...cuentaForm, correo: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-md border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                <input type="password" placeholder={t('automations.appPassword')} value={cuentaForm.password} onChange={(e) => setCuentaForm({ ...cuentaForm, password: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-md border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                {cuentaForm.plataforma === 'custom' && (
                  <div className="grid grid-cols-2 gap-3">
                    <input placeholder="SMTP Host" value={cuentaForm.customSmtpHost} onChange={(e) => setCuentaForm({ ...cuentaForm, customSmtpHost: e.target.value })}
                      className="px-3 py-2 text-sm rounded-md border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                    <input type="number" placeholder="SMTP Port (587)" value={cuentaForm.customSmtpPort} onChange={(e) => setCuentaForm({ ...cuentaForm, customSmtpPort: parseInt(e.target.value) || 587 })}
                      className="px-3 py-2 text-sm rounded-md border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                    <input placeholder="IMAP Host" value={cuentaForm.customImapHost} onChange={(e) => setCuentaForm({ ...cuentaForm, customImapHost: e.target.value })}
                      className="px-3 py-2 text-sm rounded-md border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                    <input type="number" placeholder="IMAP Port (993)" value={cuentaForm.customImapPort} onChange={(e) => setCuentaForm({ ...cuentaForm, customImapPort: parseInt(e.target.value) || 993 })}
                      className="px-3 py-2 text-sm rounded-md border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                )}
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowAddCuenta(false)} className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground">{t('automations.cancel')}</button>
                  <button onClick={saveCuenta} className="px-3 py-1.5 text-xs rounded-md bg-foreground text-background hover:opacity-90">{t('automations.save')}</button>
                </div>
              </div>
            )}
            {autoData.cuentasCorreo.length === 0
              ? <p className="text-sm text-muted-foreground text-center py-6">{t('automations.noAccounts')}</p>
              : <div className="space-y-3">
                  {autoData.cuentasCorreo.map((c) => (
                    <div key={c.id} className="flex items-center justify-between p-4 border border-border rounded-lg bg-muted/20">
                      <div>
                        <p className="text-xs text-muted-foreground">{PLATFORMS.find(p => p.value === c.plataforma)?.label || c.plataforma}</p>
                        <p className="text-sm font-medium text-foreground">{c.correo}</p>
                      </div>
                      <button onClick={() => deleteCuenta(c.id)} className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                </div>}
          </Modal>
        )}

        {showCorreosConsultas && (
          <Modal title={t('automations.queryEmailTitle')} onClose={() => setShowCorreosConsultas(false)}>
            <div className="flex items-center justify-between mb-5">
              <span className="text-xs text-muted-foreground">{autoData.correosConsultas.length} {autoData.correosConsultas.length !== 1 ? "emails" : "email"}</span>
              <button onClick={() => setShowAddCorreo(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-foreground text-background hover:opacity-90">
                <Plus className="h-3.5 w-3.5" />{t('automations.add')}
              </button>
            </div>
            {showAddCorreo && (
              <div className="mb-5 p-4 border border-border rounded-lg bg-muted/20 space-y-3">
                <input placeholder="Email" value={correoInput} onChange={(e) => setCorreoInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-md border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowAddCorreo(false)} className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground">{t('automations.cancel')}</button>
                  <button onClick={saveCorreo} className="px-3 py-1.5 text-xs rounded-md bg-foreground text-background hover:opacity-90">{t('automations.save')}</button>
                </div>
              </div>
            )}
            {autoData.correosConsultas.length === 0
              ? <p className="text-sm text-muted-foreground text-center py-6">{t('automations.noEmails')}</p>
              : <div className="space-y-3">
                  {autoData.correosConsultas.map((email) => (
                    <div key={email} className="flex items-center justify-between p-4 border border-border rounded-lg bg-muted/20">
                      <p className="text-sm font-medium text-foreground">{email}</p>
                      <button onClick={() => deleteCorreo(email)} className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                </div>}
          </Modal>
        )}

        {showSubirInfo && (
          <Modal title={t('automations.uploadInfo')} onClose={() => setShowSubirInfo(false)}>
            <div className="flex items-center justify-between mb-5">
              <span className="text-xs text-muted-foreground">{autoData.documentos.length} documento{autoData.documentos.length !== 1 ? "s" : ""}</span>
              <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-foreground text-background hover:opacity-90">
                <Upload className="h-3.5 w-3.5" />{t('automations.upload')}
              </button>
            </div>
            <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={handleFileInput} />
            <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleFileDrop}
              className={`mb-5 border-2 border-dashed rounded-lg p-10 text-center transition-colors cursor-pointer ${dragOver ? "border-green-500 bg-green-500/5" : "border-border hover:border-muted-foreground/50"}`}
              onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">{t('automations.dragPdf')}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('automations.orClickToSelect')}</p>
            </div>
            {autoData.documentos.length === 0
              ? <p className="text-sm text-muted-foreground text-center py-4">{t('automations.noDocs')}</p>
              : <div className="space-y-3">
                  {autoData.documentos.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-4 border border-border rounded-lg bg-muted/20">
                      <p className="text-sm font-medium text-foreground truncate max-w-[280px]">{doc.nombre}</p>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={async () => {
                          try {
                            const res = await authFetch(`${API}/documentos/${doc.id}/view?accountId=${accountId}`);
                            if (res.ok) {
                              const blob = await res.blob();
                              const url = URL.createObjectURL(blob);
                              window.open(url, '_blank');
                            }
                          } catch { /* ignore */ }
                        }}
                          className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground" title="Ver">
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => deleteDoc(doc.id)} className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>}
          </Modal>
        )}
      </>
    );
  }

  if (view === "whatsapp") {
    const filteredConvs = waConversations.filter(c => {
      if (waFolderFilter) {
        const folder = waFolders.find(f => f.id === waFolderFilter);
        if (!folder?.conversationIds.includes(c.id)) return false;
      }
      if (waFilter === 'manual' && !c.autoReplyPaused) return false;
      if (waFilter === 'auto' && c.autoReplyPaused) return false;
      if (waSearch) {
        const q = waSearch.toLowerCase();
        if (!c.contactName.toLowerCase().includes(q) && !c.contactPhone.includes(q)) return false;
      }
      return true;
    });
    const currentConv = waConversations.find(c => c.id === selectedWAContact);
    const currentMessages = currentConv?.messages || [];

    return (
      <>
      {showWaConnectModal && !waConnected && (
        <Modal
          title="Conectar WhatsApp con Meta"
          onClose={() => {
            if (waOAuthProcessing || qrLoading) return;
            setShowWaConnectModal(false);
          }}
        >
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Este es el proceso oficial: conectar tu cuenta de WhatsApp Business en Meta y volver automaticamente a Lyrium.
            </p>

            <div className="p-3 rounded-lg border border-border bg-muted/20 text-xs text-foreground space-y-2">
              <p className="font-medium">Pasos</p>
              <p>1. Pulsa "Continuar con Meta".</p>
              <p>2. Inicia sesion en Meta y selecciona tu negocio y numero de WhatsApp.</p>
              <p>3. Al terminar, volveras a esta pantalla y se completara la conexion.</p>
            </div>

            {waConnectError && (
              <div className="p-3 rounded-lg border border-red-300 bg-red-50 text-red-700 text-xs">
                {waConnectError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setShowWaConnectModal(false)}
                disabled={waOAuthProcessing || qrLoading}
                className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground disabled:opacity-50"
              >
                Cerrar
              </button>
              <button
                onClick={connectWa}
                disabled={qrLoading || waOAuthProcessing}
                className="px-3 py-1.5 text-xs rounded-md bg-foreground text-background hover:opacity-90 disabled:opacity-50"
              >
                {waOAuthProcessing ? 'Finalizando conexion...' : qrLoading ? 'Abriendo Meta...' : 'Continuar con Meta'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showWaSelection && (
        <Modal title="Seleccion de WhatsApp" onClose={() => setShowWaSelection(false)}>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground mb-4">Define que mensajes de WhatsApp puede responder automaticamente la IA.</p>
            <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-background">
              <div className="flex-1 mr-3">
                <p className="text-sm font-medium text-foreground">{t('automations.respondConsultas')}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t('automations.respondConsultasDesc')}</p>
              </div>
              <SwitchBox active={waSelection.respondConsultasGenerales !== false} onChange={() => toggleWaSeleccion('respondConsultasGenerales')} label="" />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-background">
              <div className="flex-1 mr-3">
                <p className="text-sm font-medium text-foreground">{t('automations.respondSolicitudes')}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t('automations.respondSolicitudesDesc')}</p>
              </div>
              <SwitchBox active={waSelection.respondSolicitudesServicio !== false} onChange={() => toggleWaSeleccion('respondSolicitudesServicio')} label="" />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-background">
              <div className="flex-1 mr-3">
                <p className="text-sm font-medium text-foreground">{t('automations.onlyKnownContacts')}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t('automations.onlyKnownContactsDesc')}</p>
              </div>
              <SwitchBox active={waSelection.soloContactosConocidos === true} onChange={() => toggleWaSeleccion('soloContactosConocidos')} label="" />
            </div>
          </div>
        </Modal>
      )}

      {showWaCorreosConsultas && (
        <Modal title="Correos de consulta de WhatsApp" onClose={() => { setShowWaCorreosConsultas(false); setWaCorreoInput(''); }}>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">Estos correos reciben consultas no resueltas por IA desde WhatsApp.</p>
            <div className="flex items-center gap-2">
              <input
                placeholder="correo@empresa.com"
                value={waCorreoInput}
                onChange={(e) => setWaCorreoInput(e.target.value)}
                className="flex-1 px-3 py-2 text-sm rounded-md border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button onClick={saveWaCorreoConsulta} className="px-3 py-2 text-xs rounded-md bg-foreground text-background hover:opacity-90">Agregar</button>
            </div>
            {waCorreosConsultas.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No hay correos configurados.</p>
            ) : (
              <div className="space-y-2">
                {waCorreosConsultas.map((email) => (
                  <div key={email} className="flex items-center justify-between p-3 border border-border rounded-lg bg-muted/20">
                    <p className="text-sm font-medium text-foreground">{email}</p>
                    <button onClick={() => deleteWaCorreoConsulta(email)} className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}

      {showWaClassifyModal && (
        <Modal title="Reglas de clasificacion de WhatsApp" onClose={() => setShowWaClassifyModal(false)}>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">Las reglas ayudan a decidir a que carpeta enviar conversaciones automaticamente.</p>
            <div className="space-y-2 p-3 border border-border rounded-lg bg-muted/20">
              <input
                placeholder="Nombre de la regla"
                value={waClassifyForm.name}
                onChange={(e) => setWaClassifyForm(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <textarea
                placeholder="Describe cuando aplicar esta regla"
                value={waClassifyForm.description}
                onChange={(e) => setWaClassifyForm(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Carpetas de destino</p>
                {waFolders.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Crea al menos una carpeta para usar reglas de clasificacion.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {waFolders.map(folder => (
                      <label key={folder.id} className="flex items-center gap-2 text-xs p-2 rounded-md border border-border bg-card cursor-pointer">
                        <input
                          type="checkbox"
                          checked={waClassifyForm.folderIds.includes(folder.id)}
                          onChange={() => toggleWaClassifyFolder(folder.id)}
                        />
                        <span className="text-foreground truncate">{folder.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex justify-end">
                <button
                  onClick={saveWaClassifyRule}
                  disabled={waClassifyLoading || waFolders.length === 0}
                  className="px-3 py-1.5 text-xs rounded-md bg-foreground text-background hover:opacity-90 disabled:opacity-50"
                >
                  {waClassifyLoading ? 'Guardando...' : 'Guardar regla'}
                </button>
              </div>
            </div>

            {waClassifyRules.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-2">No hay reglas de clasificacion.</p>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {waClassifyRules.map(rule => (
                  <div key={rule.id} className="p-3 border border-border rounded-lg bg-muted/20">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{rule.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{rule.description}</p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {rule.folderIds.map(fid => {
                            const folder = waFolders.find(f => f.id === fid);
                            return (
                              <span key={fid} className="px-2 py-0.5 text-[10px] rounded-full border border-border bg-card text-muted-foreground">
                                {folder?.name || 'Carpeta'}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                      <button onClick={() => deleteWaClassifyRule(rule.id)} className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}

      <div className="h-[calc(100vh-0px)] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-3 md:p-4 border-b border-border bg-card flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <button onClick={() => setView("main")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />{t('common.back')}
            </button>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-foreground" />
              <span className="text-sm font-semibold text-foreground">WhatsApp</span>
              <div className={`h-2.5 w-2.5 rounded-full ${waConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {waConnected ? (
              <button onClick={disconnectWa} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-red-300 text-red-600 hover:bg-red-50 transition-colors">
                <MessageCircle className="h-3.5 w-3.5" />{t('automations.waDisconnect')}
              </button>
            ) : (
              <button onClick={() => { setWaConnectError(''); setShowWaConnectModal(true); }} disabled={qrLoading || waOAuthProcessing} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-foreground text-background rounded-md hover:opacity-90 transition-opacity disabled:opacity-50">
                {(qrLoading || waOAuthProcessing) ? <div className="animate-spin h-3 w-3 border-2 border-background border-t-transparent rounded-full" /> : <MessageCircle className="h-3.5 w-3.5" />}
                {waOAuthProcessing ? 'Conectando...' : t('automations.waConnect')}
              </button>
            )}
            <button onClick={() => setShowWaSelection(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-card hover:bg-accent text-foreground transition-colors">
              <Settings2 className="h-3.5 w-3.5" />Seleccion WhatsApp
            </button>
            <button onClick={() => setShowWaCorreosConsultas(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-card hover:bg-accent text-foreground transition-colors">
              <Phone className="h-3.5 w-3.5" />Correos consulta
            </button>
            <button onClick={() => setShowWaClassifyModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-card hover:bg-accent text-foreground transition-colors">
              <Sparkles className="h-3.5 w-3.5" />Reglas WA
            </button>
            <button onClick={() => setShowWaFolderPanel(!showWaFolderPanel)} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-card hover:bg-accent text-foreground transition-colors ${showWaFolderPanel ? 'ring-1 ring-ring' : ''}`}>
              <FolderOpen className="h-3.5 w-3.5" />{t('automations.folders')}
            </button>
            <button onClick={() => setShowAsignacion(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-card hover:bg-accent text-foreground transition-colors">
              <Users className="h-3.5 w-3.5" />{t('automations.autoAssign')}
            </button>
            <button onClick={() => setShowConsultas(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-card hover:bg-accent text-foreground transition-colors">
              <HelpCircle className="h-3.5 w-3.5" />{t('automations.frequentQueriesTab')}
            </button>
            {/* Auto-reply switch */}
            <div className="flex items-center gap-2 px-3 py-1.5 text-xs border border-border rounded-md">
              <span className="text-muted-foreground">{t('automations.autoReply')}</span>
              <button onClick={toggleWaSwitch} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${waSwitchActivo ? 'bg-foreground' : 'bg-muted'}`}>
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-background transition-transform ${waSwitchActivo ? 'translate-x-[18px]' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-1 min-h-0 relative">
          {/* Mobile backdrop */}
          {isMobile && showConvPanel && (
            <div className="fixed inset-0 z-30 bg-black/50" onClick={() => setShowConvPanel(false)} />
          )}

          {/* LEFT PANEL: Conversation list */}
          <div className={`${isMobile ? `fixed left-0 top-0 z-40 h-full w-72 transition-transform duration-300 ${showConvPanel ? 'translate-x-0' : '-translate-x-full'}` : 'w-80'} border-r border-border bg-card flex flex-col`}>
            <div className="p-3 border-b border-border space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input className="w-full pl-9 pr-3 py-2 text-sm bg-muted/50 border-none rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder={t('automations.searchConversation')} value={waSearch} onChange={e => setWaSearch(e.target.value)} />
              </div>
              <div className="flex gap-1">
                {(['all', 'auto', 'manual'] as const).map(f => (
                  <button key={f} onClick={() => setWaFilter(f)}
                    className={`flex-1 px-2 py-1 text-[10px] font-medium rounded-md transition-colors ${waFilter === f ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:bg-accent'}`}>
                    {f === 'all' ? t('automations.all') : f === 'auto' ? t('automations.autoReply') : t('automations.manual')}
                  </button>
                ))}
              </div>
              {waFolders.length > 0 && (
                <select value={waFolderFilter} onChange={e => setWaFolderFilter(e.target.value)}
                  className="w-full px-2 py-1 text-xs bg-muted/50 border border-border rounded-md text-foreground">
                  <option value="">{t('automations.allFolders')}</option>
                  {waFolders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {filteredConvs.length === 0 ? (
                <div className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">{waConnected ? t('automations.waNoConversations') : t('automations.waNotConnectedHint')}</p>
                </div>
              ) : filteredConvs.map((conv) => (
                <button key={conv.id} onClick={() => { setSelectedWAContact(conv.id); markWaRead(conv.id); if (isMobile) setShowConvPanel(false); }}
                  className={`w-full text-left p-3 border-b border-border/50 hover:bg-accent/50 transition-colors ${selectedWAContact === conv.id ? "bg-accent" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <span className="text-xs font-semibold text-foreground">{conv.contactName.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{conv.contactName}</p>
                        <p className="text-xs text-muted-foreground truncate">{conv.messages.length > 0 ? conv.messages[conv.messages.length - 1].text : ''}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[10px] text-muted-foreground">{conv.lastMessageTime ? formatTime(conv.lastMessageTime) : ''}</span>
                      {conv.unread > 0 && (
                        <span className="h-4 min-w-4 px-1 rounded-full bg-foreground text-background text-[10px] font-bold flex items-center justify-center">{conv.unread}</span>
                      )}
                      {conv.autoReplyPaused && <PauseCircle className="h-3 w-3 text-yellow-500" />}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* RIGHT PANEL: Messages & Input */}
          <div className="flex-1 flex flex-col bg-background">
            {currentConv ? (
              <>
                {/* Message Header */}
                <div className="flex items-center justify-between p-3 md:p-4 border-b border-border bg-card">
                  <div className="flex items-center gap-3">
                    {isMobile && (
                      <button onClick={() => setShowConvPanel(true)} className="p-1.5 rounded-md hover:bg-accent transition-colors">
                        <PanelLeft className="h-4 w-4 text-muted-foreground" />
                      </button>
                    )}
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                      <span className="text-xs font-semibold text-foreground">{currentConv.contactName.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{currentConv.contactName}</p>
                      <p className="text-[11px] text-muted-foreground">{currentConv.contactPhone}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => toggleWaAutoReply(currentConv.id)} title={currentConv.autoReplyPaused ? t('automations.enableAutoReply') : t('automations.pauseAutoReply')}
                      className={`p-2 rounded-md hover:bg-accent transition-colors ${currentConv.autoReplyPaused ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                      <PauseCircle className="h-4 w-4" />
                    </button>
                    <button onClick={() => deleteWaConversation(currentConv.id)} className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-red-500 transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {currentMessages.map((msg, i) => (
                    <div key={msg.id || i} className={`flex ${msg.sent ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[70%] px-3 py-2 rounded-lg text-sm ${msg.sent ? "bg-foreground text-background rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"}`}>
                        {msg.text && !msg.text.startsWith('[📷') && !msg.text.startsWith('[🔊') && !msg.text.startsWith('[🎥') && !msg.text.startsWith('[📄') && (
                          <p className="whitespace-pre-wrap">{msg.text}</p>
                        )}
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className={`${msg.text && !msg.text.startsWith('[') ? 'mt-2 pt-2 border-t' : ''} ${msg.sent ? 'border-background/20' : 'border-border'} space-y-1`}>
                            {msg.attachments.map((att) => {
                              const isAudio = att.mimeType?.startsWith('audio/');
                              const isImage = att.mimeType?.startsWith('image/');
                              const fileUrl = `${WA_API}/wa-attachments/${encodeURIComponent(att.filename)}`;
                              if (isAudio) {
                                return (
                                  <div key={att.id}>
                                    <audio controls className="max-w-full" style={{ height: 36 }}>
                                      <source src={fileUrl} type={att.mimeType} />
                                    </audio>
                                  </div>
                                );
                              }
                              if (isImage) {
                                return (
                                  <a key={att.id} href={fileUrl} target="_blank" rel="noopener noreferrer">
                                    <img src={fileUrl} alt={att.originalName} className="max-w-[240px] max-h-[200px] rounded-md object-cover" loading="lazy" />
                                  </a>
                                );
                              }
                              const IconComp = getFileIcon(att.mimeType);
                              return (
                                <a key={att.id} href={fileUrl} target="_blank" rel="noopener noreferrer"
                                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors ${msg.sent ? 'bg-background/10 hover:bg-background/20 text-background' : 'bg-accent/50 hover:bg-accent text-foreground'}`}>
                                  <IconComp className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate flex-1">{att.originalName}</span>
                                  <span className="shrink-0 text-[10px] opacity-60">{formatFileSize(att.size)}</span>
                                  <Download className="h-3 w-3 shrink-0 opacity-60" />
                                </a>
                              );
                            })}
                          </div>
                        )}
                        {/* Show label text for media-only messages without saved attachment */}
                        {(!msg.attachments || msg.attachments.length === 0) && (msg.text?.startsWith('[📷') || msg.text?.startsWith('[🔊') || msg.text?.startsWith('[🎥') || msg.text?.startsWith('[📄') || msg.text === '[Media]') && (
                          <p className="whitespace-pre-wrap italic opacity-70">{msg.text}</p>
                        )}
                        <p className={`text-[10px] mt-1 ${msg.sent ? "text-background/60" : "text-muted-foreground"}`}>{formatTime(msg.time)}</p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input area */}
                <div className="p-3 border-t border-border bg-card">
                  {pendingFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {pendingFiles.map((f, i) => (
                        <div key={i} className="flex items-center gap-1 px-2 py-1 bg-muted rounded-md text-xs text-foreground">
                          <FileText className="h-3 w-3" />{f.name}
                          <button onClick={() => removePendingFile(i)} className="ml-1 text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <button onClick={() => { const input = document.createElement('input'); input.type = 'file'; input.multiple = true; input.onchange = (e) => { const files = (e.target as HTMLInputElement).files; if (files) setPendingFiles(prev => [...prev, ...Array.from(files)]); }; input.click(); }}
                      className="p-2 rounded-md hover:bg-accent text-muted-foreground"><Paperclip className="h-4 w-4" /></button>
                    <input className="flex-1 px-3 py-2 text-sm bg-muted/50 border-none rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      placeholder={t('automations.writeMessage')} value={messageInput} onChange={(e) => setMessageInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendWaMessage(); } }}
                      disabled={!waConnected} />
                    <button onClick={sendWaMessage} disabled={!waConnected || (!messageInput.trim() && pendingFiles.length === 0)}
                      className="p-2 rounded-md bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-50"><Send className="h-4 w-4" /></button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <MessageCircle className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">{waConnected ? t('automations.waSelectConversation') : t('automations.waNotConnectedHint')}</p>
                  {!waConnected && (
                    <button onClick={() => { setWaConnectError(''); setShowWaConnectModal(true); }} className="mt-3 px-4 py-2 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 transition-opacity">{t('automations.waConnect')}</button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Folders panel */}
          {showWaFolderPanel && (
            <div className="w-60 border-l border-border bg-card flex flex-col">
              <div className="p-3 border-b border-border">
                <p className="text-xs font-semibold text-foreground mb-2">{t('automations.folders')}</p>
                <div className="flex gap-1">
                  <input value={newWaFolderName} onChange={e => setNewWaFolderName(e.target.value)} placeholder={t('automations.newFolder')}
                    className="flex-1 px-2 py-1 text-xs bg-muted/50 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    onKeyDown={e => { if (e.key === 'Enter') createWaFolder(); }} />
                  <button onClick={createWaFolder} className="p-1.5 rounded-md bg-foreground text-background hover:opacity-90"><Plus className="h-3 w-3" /></button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {waFolders.map(folder => (
                  <div key={folder.id} className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-accent group">
                    <button onClick={() => setWaFolderFilter(waFolderFilter === folder.id ? '' : folder.id)}
                      className={`flex items-center gap-2 text-xs flex-1 ${waFolderFilter === folder.id ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: folder.color }} />
                      {folder.name}
                    </button>
                    <button onClick={() => deleteWaFolder(folder.id)} className="p-1 rounded-md hover:bg-accent text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Shared modals — same as email view */}
      {showSeleccion && (
          <Modal title={t('automations.emailSelection')} onClose={() => setShowSeleccion(false)}>
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground mb-4">{t('automations.emailSelectionDesc')}</p>
              <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-background">
                <div className="flex-1 mr-3">
                  <p className="text-sm font-medium text-foreground">{t('automations.respondConsultas')}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('automations.respondConsultasDesc')}</p>
                </div>
                <SwitchBox active={autoData.respondConsultasGenerales !== false} onChange={() => toggleSeleccion('respondConsultasGenerales')} label="" />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-background">
                <div className="flex-1 mr-3">
                  <p className="text-sm font-medium text-foreground">{t('automations.respondSolicitudes')}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('automations.respondSolicitudesDesc')}</p>
                </div>
                <SwitchBox active={autoData.respondSolicitudesServicio !== false} onChange={() => toggleSeleccion('respondSolicitudesServicio')} label="" />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-background">
                <div className="flex-1 mr-3">
                  <p className="text-sm font-medium text-foreground">{t('automations.onlyKnownContacts')}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('automations.onlyKnownContactsDesc')}</p>
                </div>
                <SwitchBox active={autoData.soloContactosConocidos === true} onChange={() => toggleSeleccion('soloContactosConocidos')} label="" />
              </div>
            </div>
          </Modal>
        )}

        {showAsignacion && (
          <Modal title={t('automations.autoAssign')} onClose={() => setShowAsignacion(false)} wide>
            <div className="flex items-center justify-between mb-5">
              <SwitchBox active={autoData.autoAssignEnabled} onChange={toggleAutoAssign} label={t('automations.enableAutoAssign') || 'Activar asignación automática'} />
            </div>
            <div className={`${!autoData.autoAssignEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="flex items-center justify-between mb-5">
              <SwitchBox active={autoData.sortByCarga} onChange={toggleSortByCarga} label={t('automations.sortByWorkload')} />
              <button onClick={() => setShowEspecialidades(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-foreground text-background hover:opacity-90">
                <Plus className="h-3.5 w-3.5" />{t('automations.createSpeciality')}
              </button>
            </div>
            {subcuentas.length === 0
              ? <p className="text-sm text-muted-foreground text-center py-8">{t('automations.noSubaccounts')}</p>
              : <div className="space-y-3">
                  {subcuentas.map((sc) => (
                    <div key={sc.id} className="flex items-center justify-between p-4 border border-border rounded-lg bg-muted/30">
                      <div><p className="text-sm font-medium text-foreground">{sc.name}</p><p className="text-xs text-muted-foreground">{sc.email}</p></div>
                      <select value={autoData.subcuentaEspecialidades[sc.id] || ""} onChange={(e) => setSubcuentaEsp(sc.id, e.target.value)}
                        className="text-xs px-2 py-1.5 rounded-md border border-border bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                        <option value="">{t('automations.noSpeciality')}</option>
                        {autoData.especialidades.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                      </select>
                    </div>
                  ))}
                </div>}
            </div>
          </Modal>
        )}

        {showEspecialidades && (
          <Modal title={t('automations.specialities')} onClose={() => { setShowEspecialidades(false); setShowCreateEspForm(false); setEditingEspId(null); }}>
            <div className="flex items-center justify-between mb-5">
              <span className="text-xs text-muted-foreground">{autoData.especialidades.length} {autoData.especialidades.length !== 1 ? "specialities" : "speciality"}</span>
              <button onClick={() => { setEditingEspId(null); setEspForm({ nombre: "", descripcion: "" }); setShowCreateEspForm(true); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-foreground text-background hover:opacity-90">
                <Plus className="h-3.5 w-3.5" />{t('automations.create')}
              </button>
            </div>
            {showCreateEspForm && (
              <div className="mb-5 p-4 border border-border rounded-lg bg-muted/20 space-y-3">
                <p className="text-xs font-medium text-foreground mb-1">{editingEspId ? t('automations.editSpeciality') : t('automations.create')}</p>
                <input placeholder={t('automations.namePlaceholder')} value={espForm.nombre} onChange={(e) => setEspForm({ ...espForm, nombre: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-md border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                <textarea placeholder={t('automations.whatIsIt')} value={espForm.descripcion} onChange={(e) => setEspForm({ ...espForm, descripcion: e.target.value })} rows={3}
                  className="w-full px-3 py-2 text-sm rounded-md border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => { setShowCreateEspForm(false); setEditingEspId(null); }} className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground">{t('automations.cancel')}</button>
                  <button onClick={saveEspecialidad} className="px-3 py-1.5 text-xs rounded-md bg-foreground text-background hover:opacity-90">{t('automations.save')}</button>
                </div>
              </div>
            )}
            {autoData.especialidades.length === 0
              ? <p className="text-sm text-muted-foreground text-center py-6">{t('automations.noSpecialities')}</p>
              : <div className="space-y-3">
                  {autoData.especialidades.map((e) => (
                    <div key={e.id} className="flex items-start justify-between p-4 border border-border rounded-lg bg-muted/20">
                      <div><p className="text-sm font-medium text-foreground">{e.nombre}</p>{e.descripcion && <p className="text-xs text-muted-foreground mt-0.5">{e.descripcion}</p>}</div>
                      <div className="flex gap-1">
                        <button onClick={() => startEditEsp(e)} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => deleteEsp(e.id)} className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>}
          </Modal>
        )}

        {showConsultas && (
          <Modal title={t('automations.frequentQueries')} onClose={() => setShowConsultas(false)}>
            <div className="flex items-center justify-end gap-2 mb-5">
              <button onClick={() => { setShowSubirInfo(true); setShowConsultas(false); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-card hover:bg-accent text-foreground">
                <Upload className="h-3.5 w-3.5" />{t('automations.uploadInfo')}
              </button>
              <button onClick={() => { setShowWaCorreosConsultas(true); setShowConsultas(false); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-foreground text-background hover:opacity-90">
                <Phone className="h-3.5 w-3.5" />Correos de consulta WA
              </button>
              <button onClick={() => { setShowWaClassifyModal(true); setShowConsultas(false); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-card hover:bg-accent text-foreground">
                <Sparkles className="h-3.5 w-3.5" />Reglas de clasificacion
              </button>
            </div>
            <p className="text-sm text-muted-foreground text-center py-6">{t('automations.selectOption')}</p>
          </Modal>
        )}

        {showSubirInfo && (
          <Modal title={t('automations.uploadInfo')} onClose={() => setShowSubirInfo(false)}>
            <div className="flex items-center justify-between mb-5">
              <span className="text-xs text-muted-foreground">{autoData.documentos.length} documento{autoData.documentos.length !== 1 ? "s" : ""}</span>
              <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-foreground text-background hover:opacity-90">
                <Upload className="h-3.5 w-3.5" />{t('automations.upload')}
              </button>
            </div>
            <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={handleFileInput} />
            <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleFileDrop}
              className={`mb-5 border-2 border-dashed rounded-lg p-10 text-center transition-colors cursor-pointer ${dragOver ? "border-green-500 bg-green-500/5" : "border-border hover:border-muted-foreground/50"}`}
              onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">{t('automations.dragPdf')}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('automations.orClickToSelect')}</p>
            </div>
            {autoData.documentos.length === 0
              ? <p className="text-sm text-muted-foreground text-center py-4">{t('automations.noDocs')}</p>
              : <div className="space-y-3">
                  {autoData.documentos.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-4 border border-border rounded-lg bg-muted/20">
                      <p className="text-sm font-medium text-foreground truncate max-w-[280px]">{doc.nombre}</p>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={async () => {
                          try {
                            const res = await authFetch(`${API}/documentos/${doc.id}/view?accountId=${accountId}`);
                            if (res.ok) {
                              const blob = await res.blob();
                              const url = URL.createObjectURL(blob);
                              window.open(url, '_blank');
                            }
                          } catch { /* ignore */ }
                        }}
                          className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground" title="Ver">
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => deleteDoc(doc.id)} className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>}
          </Modal>
        )}

      </>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('nav.automations')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('automations.manageChannels')}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-3">
          <div className="border border-border rounded-lg p-6 bg-card">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center"><Mail className="h-5 w-5 text-foreground" /></div>
              <div><h3 className="text-sm font-semibold text-foreground">Email</h3><p className="text-xs text-muted-foreground">{t('automations.emailManagement')}</p></div>
            </div>
            <button onClick={() => { setView("email"); }} className="w-full px-4 py-2 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 transition-opacity">{t('automations.access')}</button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="border border-border rounded-md p-3 bg-card text-center"><p className="text-lg font-semibold text-foreground font-mono">{stats.emailMessages}</p><p className="text-[10px] text-muted-foreground mt-0.5">{t('automations.messages')}</p></div>
            <div className="border border-border rounded-md p-3 bg-card text-center"><p className="text-lg font-semibold text-foreground font-mono">{stats.emailConversations}</p><p className="text-[10px] text-muted-foreground mt-0.5">{t('automations.conversations')}</p></div>
            <div className="border border-border rounded-md p-3 bg-card text-center"><p className="text-lg font-semibold text-foreground font-mono">{stats.emailUnread}</p><p className="text-[10px] text-muted-foreground mt-0.5">{t('automations.unread')}</p></div>
          </div>
          <div className="border border-border rounded-lg p-6 bg-card">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center"><Sparkles className="h-5 w-5 text-foreground" /></div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">{t('automations.customAutomation')}</h3>
                <p className="text-xs text-muted-foreground">{t('automations.customAutomationDesc')}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-3">{t('automations.customAutomationInfo')}</p>
            <div className="flex items-center justify-between mb-3">
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-xs font-semibold text-foreground">{t('automations.customAutomationPrice')}</span>
            </div>
            <a href="mailto:support@lyrium.io" className="w-full px-4 py-2 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 transition-opacity text-center block">{t('automations.contactSpecialist')}</a>
          </div>
        </div>
        <div className="space-y-3">
          <div className="border border-border rounded-lg p-6 bg-card">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center"><MessageCircle className="h-5 w-5 text-foreground" /></div>
              <div><h3 className="text-sm font-semibold text-foreground">WhatsApp</h3><p className="text-xs text-muted-foreground">{t('automations.instantMsg')}</p></div>
            </div>
            <button onClick={() => { setView("whatsapp"); loadWaData(); }} className="w-full px-4 py-2 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 transition-opacity">{t('automations.access')}</button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="border border-border rounded-md p-3 bg-card text-center"><p className="text-lg font-semibold text-foreground font-mono">{stats.whatsappMessages}</p><p className="text-[10px] text-muted-foreground mt-0.5">{t('automations.messages')}</p></div>
            <div className="border border-border rounded-md p-3 bg-card text-center"><p className="text-lg font-semibold text-foreground font-mono">{stats.whatsappConversations}</p><p className="text-[10px] text-muted-foreground mt-0.5">{t('automations.conversations')}</p></div>
            <div className="border border-border rounded-md p-3 bg-card text-center"><p className="text-lg font-semibold text-foreground font-mono">{stats.whatsappUnread}</p><p className="text-[10px] text-muted-foreground mt-0.5">{t('automations.unread')}</p></div>
          </div>
        </div>
        <div className="space-y-3">
          <div className="border border-border rounded-lg p-6 bg-card">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center"><Calendar className="h-5 w-5 text-foreground" /></div>
              <div><h3 className="text-sm font-semibold text-foreground">{t('automations.calendar')}</h3><p className="text-xs text-muted-foreground">{t('automations.calendarEvents')}</p></div>
            </div>
            <button onClick={() => setView("calendar")} className="w-full px-4 py-2 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 transition-opacity">{t('automations.access')}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Automations;
