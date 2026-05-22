import {
  Mail, MessageCircle, Calendar, ArrowLeft, Send, Paperclip, Search,
  MoreVertical, Users, HelpCircle, X, Plus, Trash2, Eye, Upload, PauseCircle, PanelLeft, Pencil,
  FolderOpen, Copy, Check, ChevronDown, FileText, Image, Download, ChevronRight, Settings2, Phone, Sparkles, Settings, AlertTriangle, RefreshCw, Info
} from "lucide-react";
import { useState, useEffect, useRef, DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { useIsMobile } from "@/hooks/use-mobile";
import { authFetch } from '../lib/authFetch';
import SpecialtiesManagerModal from "@/components/SpecialtiesManagerModal";
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import allLocales from '@fullcalendar/core/locales-all';
import ModuleGuide from "@/components/ModuleGuide";

const API = `${import.meta.env.VITE_API_URL}/automatizaciones`;
const CALENDAR_API = `${import.meta.env.VITE_API_URL}/calendar`;
const WA_QUICK_CONNECT_MAINTENANCE = true;
const WA_HELP_IMAGE_URL = '/ayudanum.png';

interface Especialidad { id: string; nombre: string; descripcion: string; createdAt: string; }
interface CuentaCorreo {
  id: string;
  plataforma: string;
  correo: string;
  password: string;
  hasPassword?: boolean;
  createdAt: string;
  customSmtpHost?: string;
  customSmtpPort?: number;
  customImapHost?: string;
  customImapPort?: number;
}
interface Documento { id: string; nombre: string; filename: string; uploadedAt: string; }
interface Subcuenta { id: string; name: string; email: string; kind?: 'main' | 'subaccount' | 'self'; }
interface EmailAttachment { id: string; filename: string; originalName: string; mimeType: string; size: number; }
interface EmailMessage { id: string; from: string; text: string; time: string; sent: boolean; attachments?: EmailAttachment[]; }
interface EmailConversation {
  id: string; contactName: string; contactEmail: string; subject: string;
  messages: EmailMessage[]; lastMessageTime: string; unread: number; autoClientId?: string; autoReplyPaused?: boolean; classificationType?: 'consulta_general' | 'solicitud_servicio' | 'otro';
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
  whatsappSessions?: IWhatsAppSession[];
}
interface IWhatsAppSession {
  id?: string;
  name?: string;
  phoneNumber?: string;
  phoneNumberId: string;
  connected?: boolean;
  tokenExpiresAt?: string;
  tokenType?: string;
  tokenStatus?: string;
  alertEmail?: string;
  hasAccessToken?: boolean;
  credentialSource?: string;
  expiryKnown?: boolean;
  connectionStatus?: string;
  lastValidatedAt?: string;
  lastValidationError?: string;
}

interface CalendarApiEvent {
  id: string;
  title: string;
  description?: string;
  startDateTime: string;
  endDateTime: string;
  allDay: boolean;
  colorId?: string;
  recurrence?: string[];
  location?: string;
  attendees?: string[];
}

interface CalendarEventDetail {
  id: string;
  title: string;
  description?: string;
  start: Date | null;
  end: Date | null;
  allDay: boolean;
  location?: string;
  colorId?: string;
  recurrence?: string[];
  attendees?: string[];
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

const getFolderConversationKey = (channel: 'email' | 'whatsapp', conversationId: string) => `${channel}:${conversationId}`;

const folderContainsConversation = (
  folder: { conversationIds?: string[] },
  channel: 'email' | 'whatsapp',
  conversationId: string,
) => {
  const conversationIds = folder.conversationIds || [];
  return conversationIds.includes(getFolderConversationKey(channel, conversationId)) || conversationIds.includes(conversationId);
};

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

type View = "main" | "messages" | "email" | "whatsapp" | "calendar";
const WA_WINDOW_MS = 24 * 60 * 60 * 1000;

// Format ISO or legacy time strings to local HH:MM
function formatTime(raw: string): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return raw; // fallback for old "HH:MM" strings
}

function getLastIncomingWATimestamp(conversation: WAConversation): number | null {
  for (let index = conversation.messages.length - 1; index >= 0; index -= 1) {
    const message = conversation.messages[index];
    if (message.sent) continue;

    const timestamp = new Date(message.time).getTime();
    if (!isNaN(timestamp)) return timestamp;
  }

  return null;
}

function isWAConversationOutside24h(conversation: WAConversation, now = Date.now()): boolean {
  const lastIncomingTimestamp = getLastIncomingWATimestamp(conversation);
  if (lastIncomingTimestamp === null) return false;
  return now - lastIncomingTimestamp > WA_WINDOW_MS;
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
  const [waFilter, setWaFilter] = useState<'all' | 'manual' | 'auto' | 'expired'>('all');
  const [waFolderFilter, setWaFolderFilter] = useState('');
  const [showWaFolderPanel, setShowWaFolderPanel] = useState(false);
  const [newWaFolderName, setNewWaFolderName] = useState('');
  const [qrLoading, setQrLoading] = useState(false);
  const [waOAuthProcessing, setWaOAuthProcessing] = useState(false);
  const [showWaConnectModal, setShowWaConnectModal] = useState(false);
  const [waConnectError, setWaConnectError] = useState('');
  const [waManualMode, setWaManualMode] = useState(false);
  const [showWaManualInstructions, setShowWaManualInstructions] = useState(false);
  const [waQuickAlertEmail, setWaQuickAlertEmail] = useState('');
  const [waManualToken, setWaManualToken] = useState('');
  const [waManualPhoneId, setWaManualPhoneId] = useState('');
  const [waManualWabaId, setWaManualWabaId] = useState('');
  const [waManualAlertEmail, setWaManualAlertEmail] = useState('');
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
  const [showCorreoConsultaInfo, setShowCorreoConsultaInfo] = useState(false);
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
  const [calendarEvents, setCalendarEvents] = useState<CalendarApiEvent[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [showAddEventForm, setShowAddEventForm] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventForm, setEventForm] = useState({ title: '', date: '', startTime: '', endTime: '', description: '', allDay: false, recurrence: '', colorId: '' });
  const [showConfirmDisconnect, setShowConfirmDisconnect] = useState(false);
  const [confirmDeleteEventId, setConfirmDeleteEventId] = useState<string | null>(null);
  const [selectedEventDetail, setSelectedEventDetail] = useState<CalendarEventDetail | null>(null);
  const [calendarLastSyncedAt, setCalendarLastSyncedAt] = useState<string | null>(null);
  const [calendarSyncing, setCalendarSyncing] = useState(false);
  const [showSeleccion, setShowSeleccion] = useState(false);
  const [emailFilter, setEmailFilter] = useState<'all' | 'manual' | 'auto'>('all');
  const [emailSearch, setEmailSearch] = useState('');
  const [unifiedChannelFilter, setUnifiedChannelFilter] = useState<'all' | 'email' | 'whatsapp'>('all');
  const [unifiedStatusFilter, setUnifiedStatusFilter] = useState<'all' | 'pending' | 'paused'>('all');
  const [unifiedTypeFilter, setUnifiedTypeFilter] = useState<'all' | 'others'>('all');
  const [unifiedSearch, setUnifiedSearch] = useState('');
  const [unifiedFolderFilter, setUnifiedFolderFilter] = useState('');
  const [activeAutomationChannel, setActiveAutomationChannel] = useState<'email' | 'whatsapp'>('email');
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
  const lastScrollChatRef = useRef<string>('');
  const lastScrollCountRef = useRef<number>(0);
  const [expandedFolderId, setExpandedFolderId] = useState<string | null>(null);
  const [chatDragOver, setChatDragOver] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [showClassifyModal, setShowClassifyModal] = useState(false);
  const [classifyRules, setClassifyRules] = useState<ClassifyRule[]>([]);
  const [classifyForm, setClassifyForm] = useState({ name: '', description: '', folderIds: [] as string[] });
  const [classifyLoading, setClassifyLoading] = useState(false);
  const [showWhatsAppSessions, setShowWhatsAppSessions] = useState(false);
  const [showAddWaSession, setShowAddWaSession] = useState(false);
  const [waSessionForm, setWaSessionForm] = useState({ name: '', accessToken: '', phoneNumberId: '', wabaId: '', alertEmail: '' });
  const [emailAccountFilter, setEmailAccountFilter] = useState<string>('all');
  const [whatsappNumberFilter, setWhatsappNumberFilter] = useState<string>('all');

  useEffect(() => {
    const workspaceId = sessionStorage.getItem("userId") || sessionStorage.getItem("accountId") || "";
    setAccountId(workspaceId);
    setCalendarUserId(workspaceId);
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

  // Auto-scroll only when switching chat or when a new message arrives
  useEffect(() => {
    const currentEmail = autoData.emailConversations.find(c => c.id === selectedEmailConv);
    const currentWa = waConversations.find(c => c.id === selectedWAContact);
    const chatKey = view === 'whatsapp'
      ? (currentWa ? `whatsapp:${currentWa.id}` : '')
      : view === 'email'
        ? (currentEmail ? `email:${currentEmail.id}` : '')
        : currentWa
          ? `whatsapp:${currentWa.id}`
          : currentEmail
            ? `email:${currentEmail.id}`
            : '';
    const messageCount = currentWa?.messages.length ?? currentEmail?.messages.length ?? 0;
    if (!chatKey) return;
    const switchedChat = lastScrollChatRef.current !== chatKey;
    const hasNewMessages = messageCount > lastScrollCountRef.current;
    if (switchedChat || hasNewMessages) {
      messagesEndRef.current?.scrollIntoView({ behavior: switchedChat ? "auto" : "smooth" });
    }
    lastScrollChatRef.current = chatKey;
    lastScrollCountRef.current = messageCount;
  }, [view, selectedEmailConv, selectedWAContact, autoData.emailConversations, waConversations]);

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
      const res = await authFetch(`${API}/email-classify-rules/${ruleId}?accountId=${accountId}`, { method: 'DELETE' });
      if (!res.ok) return;
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
    if (!waQuickAlertEmail.trim()) {
      setWaConnectError(t('automations.waMetaAlertEmailRequired'));
      setShowWaConnectModal(true);
      return;
    }
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
      const { state: oauthState, appId, configId } = await initRes.json();

      // Step 2: Load Facebook JS SDK
      await loadFbSdk(appId);
      setQrLoading(false);

      // Step 3: Open Meta Embedded Signup popup
      setShowWaConnectModal(true);
      setWaOAuthProcessing(true);

      if (configId) {
        (window as any).FB.ui({
          type: 'embedded_signup',
          configId,
        }, async (response: any) => {
          const accessToken = response?.authResponse?.accessToken;
          const loginExpiresIn = Number(response?.authResponse?.expiresIn || 0) || undefined;
          if (!accessToken) {
            setWaConnectError('No se recibió autorización de Meta. Inténtalo de nuevo.');
            setWaOAuthProcessing(false);
            return;
          }
          try {
            const connectRes = await authFetch(`${WA_API}/meta/connect-token`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ accountId, state: oauthState, accessToken, alertEmail: waQuickAlertEmail.trim(), loginExpiresIn }),
            });
            if (connectRes.ok) {
              await refreshWhatsAppSessionState();
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
        });
      } else {
        (window as any).FB.login((response: any) => {
          const accessToken = response?.authResponse?.accessToken;
          const loginExpiresIn = Number(response?.authResponse?.expiresIn || 0) || undefined;
          if (!accessToken) {
            setWaConnectError('No se recibió autorización de Meta. Inténtalo de nuevo.');
            setWaOAuthProcessing(false);
            return;
          }
          // FB.login callback must be synchronous — run async work in IIFE
          (async () => {
            try {
              // Step 4: Send access token to backend
              const connectRes = await authFetch(`${WA_API}/meta/connect-token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId, state: oauthState, accessToken, alertEmail: waQuickAlertEmail.trim(), loginExpiresIn }),
              });
              if (connectRes.ok) {
                await refreshWhatsAppSessionState();
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
        });
      }
    } catch (err: any) {
      setWaConnectError(err?.message || 'No fue posible iniciar la conexion con Meta. Revisa tu conexion e intentalo de nuevo.');
      setQrLoading(false);
      setShowWaConnectModal(true);
    }
  };

  const disconnectWa = async () => {
    const res = await waApi('POST', '/disconnect', {});
    if (res.ok) {
      await refreshWhatsAppSessionState();
    } else {
      setWaConnected(false);
    }
  };

  const connectWaManual = async () => {
    if (!accountId) return;
    if (!waManualToken.trim() || !waManualPhoneId.trim()) {
      setWaConnectError('El token y el Phone Number ID son obligatorios.');
      return;
    }
    if (!waManualAlertEmail.trim()) {
      setWaConnectError(t('automations.waMetaAlertEmailRequired'));
      return;
    }
    setWaOAuthProcessing(true);
    setWaConnectError('');
    try {
      const res = await authFetch(`${WA_API}/meta/connect-manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          accessToken: waManualToken.trim(),
          phoneNumberId: waManualPhoneId.trim(),
          wabaId: waManualWabaId.trim() || undefined,
          alertEmail: waManualAlertEmail.trim() || undefined,
        }),
      });
      if (res.ok) {
        await refreshWhatsAppSessionState();
        await loadWaClassifyRules();
        setShowWaConnectModal(false);
        setWaManualToken('');
        setWaManualPhoneId('');
        setWaManualWabaId('');
        setWaManualAlertEmail('');
        setWaManualMode(false);
      } else {
        const data = await res.json().catch(() => ({}));
        setWaConnectError(data?.error || 'No fue posible conectar con las credenciales proporcionadas.');
      }
    } catch {
      setWaConnectError('Error de conexión. Verifica las credenciales e inténtalo de nuevo.');
    } finally {
      setWaOAuthProcessing(false);
    }
  };

  const toggleWaSwitch = async () => {
    const previous = waSwitchActivo;
    const newVal = !waSwitchActivo;
    setWaSwitchActivo(newVal);
    try {
      const res = await waApi('PUT', '/switch', { enabled: newVal });
      if (!res.ok) throw new Error('switch rejected');
    } catch {
      setWaSwitchActivo(previous);
    }
  };

  const sendWaMessage = async () => {
    if (!messageInput.trim() && pendingFiles.length === 0) return;
    const conv = waConversations.find(c => c.id === selectedWAContact);
    if (!conv) return;
    if (isWAConversationOutside24h(conv)) return;

    let response: Response;

    if (pendingFiles.length > 0) {
      const fd = new FormData();
      fd.append('accountId', accountId);
      fd.append('phone', conv.contactPhone);
      fd.append('text', messageInput);
      pendingFiles.forEach(f => fd.append('files', f));
      response = await authFetch(`${WA_API}/conversations/${conv.id}/send`, { method: 'POST', body: fd });
    } else {
      response = await waApi('POST', `/conversations/${conv.id}/send`, { phone: conv.contactPhone, text: messageInput });
    }

    if (!response.ok) return;

    setMessageInput('');
    setPendingFiles([]);
    await loadWaData();
  };

  const markWaRead = async (conversationId: string) => {
    const previousUnread = waConversations.find(c => c.id === conversationId)?.unread || 0;
    setWaConversations(prev => prev.map(c => c.id === conversationId ? { ...c, unread: 0 } : c));
    try {
      const res = await waApi('PUT', '/mark-read', { conversationId });
      if (!res.ok) throw new Error('mark read rejected');
    } catch {
      setWaConversations(prev => prev.map(c => c.id === conversationId ? { ...c, unread: previousUnread } : c));
    }
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
      const res = await authFetch(`${WA_API}/classify-rules/${ruleId}?accountId=${accountId}`, { method: 'DELETE' });
      if (!res.ok) return;
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
    if ((autoData.correosConsultas || []).length >= 1) return;
    await api("POST", "/correos-consultas", { email: waCorreoInput.trim().toLowerCase() });
    setWaCorreoInput('');
    setShowWaCorreosConsultas(false);
    reload();
    loadWaData();
  };

  const deleteWaCorreoConsulta = async (email: string) => {
    await api("DELETE", "/correos-consultas", { email });
    reload();
    loadWaData();
  };

  const toggleWaSeleccion = async (field: 'respondConsultasGenerales' | 'respondSolicitudesServicio' | 'soloContactosConocidos') => {
    const previous = waSelection;
    const next = {
      ...waSelection,
      [field]: !waSelection[field],
    };
    setWaSelection(next);
    try {
      const res = await waApi('PUT', '/selection', next);
      if (!res.ok) throw new Error('selection rejected');
    } catch {
      setWaSelection(previous);
    }
  };

  const saveWaSession = async () => {
    if (!waSessionForm.accessToken.trim() || !waSessionForm.phoneNumberId.trim() || !waSessionForm.alertEmail.trim()) return;
    try {
      const res = await authFetch(`${WA_API}/meta/connect-manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          accessToken: waSessionForm.accessToken,
          phoneNumberId: waSessionForm.phoneNumberId,
          wabaId: waSessionForm.wabaId || undefined,
          name: waSessionForm.name || undefined,
          alertEmail: waSessionForm.alertEmail || undefined,
        }),
      });
      if (res.ok) {
        setShowAddWaSession(false);
        setWaSessionForm({ name: '', accessToken: '', phoneNumberId: '', wabaId: '', alertEmail: '' });
        await refreshWhatsAppSessionState();
      }
    } catch { /* offline */ }
  };

  const deleteWaSession = async (phoneNumberId: string) => {
    try {
      const res = await authFetch(`${WA_API}/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, phoneNumberId }),
      });
      if (res.ok) await refreshWhatsAppSessionState();
    } catch { /* offline */ }
  };

  const refreshWaToken = async (phoneNumberId: string) => {
    try {
      const res = await authFetch(`${WA_API}/refresh-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, phoneNumberId }),
      });
      if (res.ok) await refreshWhatsAppSessionState();
    } catch { /* offline */ }
  };

  const getTokenStatus = (session?: IWhatsAppSession): { color: string; label: string; days: number } => {
    if (!session) return { color: 'text-muted-foreground', label: t('automations.waTokenStatusUnknown'), days: 999 };
    if (session.tokenStatus === 'invalid' || session.connectionStatus === 'error' || session.connectionStatus === 'disconnected') {
      return { color: 'text-red-400', label: t('automations.waTokenStatusDisconnected'), days: -1 };
    }
    if (session.tokenStatus === 'expired' || session.connectionStatus === 'expired') {
      return { color: 'text-red-400', label: t('automations.waTokenStatusExpired'), days: -1 };
    }
    if (session.tokenStatus === 'expiring' && session.tokenExpiresAt) {
      const expires = new Date(session.tokenExpiresAt).getTime();
      const now = Date.now();
      const days = Math.floor((expires - now) / (1000 * 60 * 60 * 24));
      return { color: 'text-red-400', label: t('automations.waTokenStatusDays', { count: days }), days };
    }
    if (!session.tokenExpiresAt) {
      return { color: 'text-muted-foreground', label: t('automations.waTokenStatusUnknown'), days: 999 };
    }
    const expires = new Date(session.tokenExpiresAt).getTime();
    const now = Date.now();
    const days = Math.floor((expires - now) / (1000 * 60 * 60 * 24));
    if (days < 0) return { color: 'text-red-400', label: t('automations.waTokenStatusExpired'), days };
    if (days <= 7) return { color: 'text-red-400', label: t('automations.waTokenStatusDays', { count: days }), days };
    if (days <= 14) return { color: 'text-yellow-400', label: t('automations.waTokenStatusDays', { count: days }), days };
    return { color: 'text-green-400', label: t('automations.waTokenStatusDays', { count: days }), days };
  };

  const formatTokenExpiryDate = (expiresAt?: string): string => {
    if (!expiresAt) return '';
    const date = new Date(expiresAt);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleString();
  };

  async function loadAutoData() {
    if (!accountId) return;
    try {
      const res = await authFetch(`${WA_API}/status?accountId=${accountId}`);
      if (res.ok) {
        const data = await res.json();
        setAutoData(prev => ({ ...prev, whatsappSessions: data.whatsappSessions || [] }));
      }
    } catch { /* offline */ }
  }

  async function refreshWhatsAppSessionState() {
    await Promise.all([
      loadWaData(),
      loadAutoData(),
      checkWaStatus(),
    ]);
  }

  // Load WA data and auto-refresh
  useEffect(() => { if (accountId) { loadWaData(); checkWaStatus(); } }, [accountId]);
  useEffect(() => { if (accountId) loadWaClassifyRules(); }, [accountId]);
  useEffect(() => {
    if (!accountId || (view !== 'whatsapp' && view !== 'messages')) return;
    loadWaData();
    loadWaClassifyRules();
    checkWaStatus();

    const dataInterval = setInterval(() => {
      loadWaData();
      loadWaClassifyRules();
    }, 10000);
    const statusInterval = setInterval(() => {
      checkWaStatus();
    }, 30000);

    return () => {
      clearInterval(dataInterval);
      clearInterval(statusInterval);
    };
  }, [accountId, view]);

  useEffect(() => {
    if (unifiedChannelFilter === 'email' || unifiedChannelFilter === 'whatsapp') {
      setActiveAutomationChannel(unifiedChannelFilter);
    }
  }, [unifiedChannelFilter]);

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
        setCalendarLastSyncedAt(data.lastSyncedAt || null);
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
        setCalendarEvents(Array.isArray(data.events) ? data.events : []);
      }
    } catch { /* offline */ }
    if (showLoading) setCalendarLoading(false);
  };

  const handleSyncCalendar = async () => {
    setCalendarSyncing(true);
    try {
      const res = await authFetch(`${CALENDAR_API}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: calendarUserId }),
      });
      if (res.ok) {
        loadCalendarEvents(calendarUserId);
        loadCalendarStatus(calendarUserId);
      }
    } catch { /* offline */ }
    setCalendarSyncing(false);
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
      const res = await authFetch(`${CALENDAR_API}/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: calendarUserId }),
      });
      if (!res.ok) return;
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

  const handleEditEvent = (detail: CalendarEventDetail | null) => {
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
    if (cuentaForm.plataforma === 'custom' && (!cuentaForm.customSmtpHost.trim() || !cuentaForm.customImapHost.trim())) return;
    const ok = await api("POST", "/cuentas-correo", cuentaForm);
    if (!ok) return;
    setCuentaForm({ plataforma: "gmail", correo: "", password: "", customSmtpHost: "", customSmtpPort: 587, customImapHost: "", customImapPort: 993 }); setShowAddCuenta(false); reload();
  };
  const deleteCuenta = async (id: string) => { await api("DELETE", `/cuentas-correo/${id}?accountId=${accountId}`); reload(); };

  const saveCorreo = async () => {
    if (!correoInput.trim()) return;
    if ((autoData.correosConsultas || []).length >= 1) return;
    await api("POST", "/correos-consultas", { email: correoInput.trim().toLowerCase() });
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
      if (!res.ok) {
        setPendingFiles(filesToSend);
        setMessageInput(text);
        return;
      }
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
    } catch {
      setPendingFiles(filesToSend);
      setMessageInput(text);
    } finally {
      setIsSending(false);
    }
  };
  const toggleConvAutoReply = async (convId: string, paused: boolean) => {
    const previousConversations = autoData.emailConversations;
    try {
      setAutoData(prev => ({
        ...prev,
        emailConversations: prev.emailConversations.map(c =>
          c.id === convId ? { ...c, autoReplyPaused: paused } : c
        ),
      }));
      const res = await authFetch(`${API}/conversations/${convId}/auto-reply`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, conversationId: convId, paused }),
      });
      if (!res.ok) throw new Error('auto-reply rejected');
    } catch {
      setAutoData(prev => ({ ...prev, emailConversations: previousConversations }));
    }
  };
  const deleteEmailConversation = async (conversationId: string) => {
    try {
      const res = await authFetch(`${API}/conversations/${conversationId}?accountId=${accountId}`, { method: 'DELETE' });
      if (!res.ok) return;
      setAutoData(prev => ({
        ...prev,
        emailConversations: prev.emailConversations.filter(c => c.id !== conversationId),
      }));
      if (selectedEmailConv === conversationId) setSelectedEmailConv("");
    } catch { /* ignore */ }
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
        setWaFolders(prev => [...prev, folder]);
        setNewFolderName('');
      }
    } catch { /* error */ }
  };
  const deleteFolder = async (folderId: string) => {
    try {
      const res = await authFetch(`${API}/email-folders/${folderId}?accountId=${accountId}`, { method: 'DELETE' });
      if (!res.ok) return;
      setAutoData(prev => ({ ...prev, emailFolders: prev.emailFolders.filter(f => f.id !== folderId) }));
      setWaFolders(prev => prev.filter(f => f.id !== folderId));
      if (folderFilter === folderId) setFolderFilter('');
      if (unifiedFolderFilter === folderId) setUnifiedFolderFilter('');
    } catch { /* error */ }
  };
  const assignToFolder = async (folderId: string, conversationId: string) => {
    try {
      const res = await authFetch(`${API}/email-folders/assign`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, folderId, conversationId }),
      });
      if (!res.ok) return;
      const folderKey = getFolderConversationKey('email', conversationId);
      setAutoData(prev => ({
        ...prev,
        emailFolders: prev.emailFolders.map(f => ({
          ...f,
          conversationIds: f.id === folderId
            ? [...f.conversationIds.filter(id => id !== conversationId && id !== folderKey), folderKey]
            : f.conversationIds,
        })),
      }));
    } catch { /* error */ }
  };
  const removeFromFolder = async (folderId: string, conversationId: string) => {
    try {
      const res = await authFetch(`${API}/email-folders/remove`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, folderId, conversationId }),
      });
      if (!res.ok) return;
      const folderKey = getFolderConversationKey('email', conversationId);
      setAutoData(prev => ({
        ...prev,
        emailFolders: prev.emailFolders.map(f =>
          f.id === folderId ? { ...f, conversationIds: f.conversationIds.filter(id => id !== conversationId && id !== folderKey) } : f
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

  const renderUnifiedInboxContent = () => {
    const now = Date.now();
    const pendingEmailIds = new Set(
      (autoData.pendingConsultas || [])
        .filter((pending: any) => pending.channel !== 'whatsapp')
        .map((pending: any) => String(pending.conversationId || ''))
        .filter(Boolean),
    );
    const pendingWhatsAppIds = new Set(
      (autoData.pendingConsultas || [])
        .filter((pending: any) => pending.channel === 'whatsapp')
        .map((pending: any) => String(pending.waConversationId || pending.conversationId || ''))
        .filter(Boolean),
    );

    const unifiedFolderOptions = autoData.emailFolders.map(folder => ({ id: folder.id, name: folder.name }));

    const unifiedConversations = [
      ...autoData.emailConversations.map(conv => ({
        key: `email:${conv.id}`,
        id: conv.id,
        channel: 'email' as const,
        contactName: conv.contactName,
        contactDetail: conv.contactEmail,
        preview: conv.messages[conv.messages.length - 1]?.text || conv.subject,
        lastMessageTime: conv.messages[conv.messages.length - 1]?.time || conv.lastMessageTime,
        unread: conv.unread,
        autoReplyPaused: !!conv.autoReplyPaused,
        pending: pendingEmailIds.has(conv.id),
        outside24h: false,
        folderKeys: autoData.emailFolders.filter(folder => folderContainsConversation(folder, 'email', conv.id)).map(folder => folder.id),
        classificationType: conv.classificationType,
      })),
      ...waConversations.map(conv => ({
        key: `whatsapp:${conv.id}`,
        id: conv.id,
        channel: 'whatsapp' as const,
        contactName: conv.contactName,
        contactDetail: conv.contactPhone,
        preview: conv.messages[conv.messages.length - 1]?.text || '',
        lastMessageTime: conv.lastMessageTime,
        unread: conv.unread,
        autoReplyPaused: !!conv.autoReplyPaused,
        pending: pendingWhatsAppIds.has(conv.id),
        outside24h: isWAConversationOutside24h(conv, now),
        folderKeys: autoData.emailFolders.filter(folder => folderContainsConversation(folder, 'whatsapp', conv.id)).map(folder => folder.id),
      })),
    ]
      .filter(conv => {
        if (unifiedChannelFilter !== 'all' && conv.channel !== unifiedChannelFilter) return false;
        if (unifiedStatusFilter === 'pending' && !conv.pending) return false;
        if (unifiedStatusFilter === 'paused' && !conv.autoReplyPaused) return false;
        if (conv.channel === 'email' && conv.classificationType === 'otro' && unifiedTypeFilter !== 'others') return false;
        if (unifiedTypeFilter === 'others') return conv.channel === 'email' && conv.classificationType === 'otro';
        if (unifiedFolderFilter && !conv.folderKeys.includes(unifiedFolderFilter)) return false;
        if (unifiedSearch) {
          const q = unifiedSearch.toLowerCase();
          if (!conv.contactName.toLowerCase().includes(q) && !conv.contactDetail.toLowerCase().includes(q) && !conv.preview.toLowerCase().includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.lastMessageTime || 0).getTime() - new Date(a.lastMessageTime || 0).getTime());

    const currentUnified = unifiedConversations.find((item) =>
      item.channel === 'email' ? item.id === selectedEmailConv : item.id === selectedWAContact,
    ) || null;
    const effectiveChannel = currentUnified?.channel || (unifiedChannelFilter !== 'all' ? unifiedChannelFilter : activeAutomationChannel);
    const currentEmailConv = currentUnified?.channel === 'email'
      ? autoData.emailConversations.find(conv => conv.id === currentUnified.id) || null
      : null;
    const currentWAConv = currentUnified?.channel === 'whatsapp'
      ? waConversations.find(conv => conv.id === currentUnified.id) || null
      : null;
    const currentMessages = currentEmailConv?.messages || currentWAConv?.messages || [];
    const waManualSendBlocked = currentWAConv ? isWAConversationOutside24h(currentWAConv, now) : false;
    const currentAutoReplyEnabled = effectiveChannel === 'email' ? autoData.switchActivo : waSwitchActivo;
    const activeFolderPanel = showFolderPanel;
    const currentConversationId = currentEmailConv?.id || currentWAConv?.id || '';
    const activeFolders = autoData.emailFolders;

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
              <MessageCircle className="h-4 w-4 text-foreground" />
              <span className="text-sm font-semibold text-foreground">Email + WhatsApp</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full border border-border text-muted-foreground uppercase">{effectiveChannel}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-3 flex-wrap">
              <button
                onClick={() => {
                  if (effectiveChannel === 'whatsapp') {
                    setShowWaSelection(true);
                  } else {
                    setShowSeleccion(true);
                  }
                }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-card hover:bg-accent text-foreground transition-colors"
            >
              <Settings2 className="h-3.5 w-3.5" />Selección
            </button>
            <button
              onClick={() => {
                setShowWaFolderPanel(false);
                setShowFolderPanel(prev => !prev);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-card hover:bg-accent text-foreground transition-colors ${activeFolderPanel ? 'ring-1 ring-ring' : ''}`}
            >
              <FolderOpen className="h-3.5 w-3.5" />Organizar
            </button>
            <button
              onClick={() => {
                if (effectiveChannel === 'whatsapp') {
                  setShowWaClassifyModal(true);
                } else {
                  setShowClassifyModal(true);
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-card hover:bg-accent text-foreground transition-colors"
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setShowAsignacion(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-card hover:bg-accent text-foreground transition-colors">
              <Users className="h-3.5 w-3.5" />{t('automations.autoAssign')}
            </button>
            <button
              onClick={() => {
                if (effectiveChannel === 'whatsapp') {
                  setShowConsultas(true);
                }
                setShowConsultas(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-card hover:bg-accent text-foreground transition-colors"
            >
              <HelpCircle className="h-3.5 w-3.5" />Consultas frecuentes
            </button>
            <SwitchBox active={currentAutoReplyEnabled} onChange={() => { effectiveChannel === 'whatsapp' ? toggleWaSwitch() : toggleSwitch(); }} label={t('automations.autoReply')} />
            <button onClick={() => { setShowWhatsAppSessions(true); void refreshWhatsAppSessionState(); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-card hover:bg-accent text-foreground transition-colors">
              <Phone className="h-3.5 w-3.5" />Números de WhatsApp
            </button>
          </div>
        </div>

        <div className="flex flex-1 min-h-0 relative">
          {isMobile && showConvPanel && (
            <div className="fixed inset-0 z-30 bg-black/50" onClick={() => setShowConvPanel(false)} />
          )}

          <div className={`${isMobile ? `fixed left-0 top-0 z-40 h-full w-72 transition-transform duration-300 ${showConvPanel ? 'translate-x-0' : '-translate-x-full'}` : 'w-80'} border-r border-border bg-card flex flex-col`}>
            <div className="p-3 border-b border-border space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input className="w-full pl-9 pr-3 py-2 text-sm bg-muted/50 border-none rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder={t('automations.searchConversation')} value={unifiedSearch} onChange={e => setUnifiedSearch(e.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-1">
                {(['all', 'email', 'whatsapp'] as const).map(f => (
                  <button key={f} onClick={() => setUnifiedChannelFilter(f)}
                    className={`px-2 py-1 text-[10px] font-medium rounded-md transition-colors ${unifiedChannelFilter === f ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:bg-accent'}`}>
                    {f === 'all' ? t('automations.all') : f === 'email' ? 'Email' : 'WhatsApp'}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-1">
                {(['all', 'pending', 'paused'] as const).map(f => (
                  <button key={f} onClick={() => setUnifiedStatusFilter(f)}
                    className={`px-2 py-1 text-[10px] font-medium rounded-md transition-colors ${unifiedStatusFilter === f ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:bg-accent'}`}>
                    {f === 'all' ? 'Todas' : f === 'pending' ? 'Pendientes' : 'Pausadas'}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-1">
                {(['all', 'others'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => {
                      setUnifiedTypeFilter(f);
                      if (f === 'others') setUnifiedFolderFilter('');
                    }}
                    className={`px-2 py-1 text-[10px] font-medium rounded-md transition-colors ${unifiedTypeFilter === f ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:bg-accent'}`}
                  >
                    {f === 'all' ? t('automations.all') : t('automations.others')}
                  </button>
                ))}
              </div>
              {unifiedFolderOptions.length > 0 && (
                <select value={unifiedFolderFilter} onChange={e => setUnifiedFolderFilter(e.target.value)}
                  className="w-full px-2 py-1 text-xs bg-muted/50 border border-border rounded-md text-foreground">
                  <option value="">{t('automations.allFolders')}</option>
                  {unifiedFolderOptions.map(folder => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {unifiedConversations.length === 0 ? (
                <div className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">{t('automations.noConversation')}</p>
                </div>
              ) : unifiedConversations.map((conv) => (
                <button
                  key={conv.key}
                  onClick={() => {
                    setActiveAutomationChannel(conv.channel);
                    if (conv.channel === 'email') {
                      setSelectedEmailConv(conv.id);
                      authFetch(`${API}/conversations/${conv.id}/read`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId, conversationId: conv.id }) })
                        .then(() => setAutoData(prev => ({
                          ...prev,
                          emailConversations: prev.emailConversations.map(c => c.id === conv.id ? { ...c, unread: 0 } : c),
                        })))
                        .catch(() => {});
                    } else {
                      setSelectedWAContact(conv.id);
                      void markWaRead(conv.id);
                    }
                    if (isMobile) setShowConvPanel(false);
                  }}
                  className={`group w-full text-left p-3 border-b border-border/50 hover:bg-accent/50 transition-colors ${currentUnified?.key === conv.key ? "bg-accent" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <span className="text-xs font-semibold text-foreground">{conv.contactName.split(" ").map((n: string) => n[0]).join("").substring(0, 2)}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{conv.contactName}</p>
                        <p className="text-xs text-muted-foreground truncate">{conv.preview}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[10px] text-muted-foreground">{formatTime(conv.lastMessageTime || "")}</span>
                      <div className="flex items-center gap-1">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${conv.channel === 'email' ? 'border-sky-300 text-sky-700' : 'border-emerald-300 text-emerald-700'}`}>{conv.channel === 'email' ? 'Email' : 'WhatsApp'}</span>
                        {conv.unread > 0 && (
                          <span className="h-4 min-w-4 px-1 rounded-full bg-foreground text-background text-[10px] font-bold flex items-center justify-center">{conv.unread}</span>
                        )}
                        {conv.pending && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">Pendiente</span>}
                        {conv.autoReplyPaused && <PauseCircle className="h-3.5 w-3.5 text-amber-500" />}
                        {conv.channel === 'whatsapp' && conv.outside24h && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 flex flex-col bg-background">
            {currentUnified ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 p-3 md:p-4 border-b border-border bg-card">
                  <div className="flex items-center gap-3 min-w-0">
                    {isMobile && (
                      <button onClick={() => setShowConvPanel(true)} className="p-1.5 rounded-md hover:bg-accent transition-colors">
                        <PanelLeft className="h-4 w-4 text-muted-foreground" />
                      </button>
                    )}
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <span className="text-xs font-semibold text-foreground">{currentUnified.contactName.split(" ").map((n) => n[0]).join("").substring(0, 2)}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{currentUnified.contactName}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{currentUnified.contactDetail}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {currentUnified.channel === 'email' && currentEmailConv && (
                      <>
                        <SwitchBox active={!currentEmailConv.autoReplyPaused} onChange={() => toggleConvAutoReply(currentEmailConv.id, !currentEmailConv.autoReplyPaused)} label="Auto-reply" />
                        <button onClick={() => deleteEmailConversation(currentEmailConv.id)} className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-red-500 transition-colors" title={t('automations.deleteConversation')}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                    {currentUnified.channel === 'whatsapp' && currentWAConv && (
                      <>
                        <button onClick={() => toggleWaAutoReply(currentWAConv.id)} title={currentWAConv.autoReplyPaused ? t('automations.enableAutoReply') : t('automations.pauseAutoReply')}
                          className={`p-2 rounded-md hover:bg-accent transition-colors ${currentWAConv.autoReplyPaused ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                          <PauseCircle className="h-4 w-4" />
                        </button>
                        <button onClick={() => deleteWaConversation(currentWAConv.id)} className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-red-500 transition-colors" title={t('automations.deleteConversation')}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className={`flex-1 overflow-y-auto p-4 space-y-3 transition-colors ${chatDragOver ? 'bg-primary/5 ring-2 ring-primary/30 ring-inset' : ''}`}>
                  {currentMessages.map((msg: any) => (
                    <div key={msg.id} className={`group/msg flex ${msg.sent ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[70%] px-3 py-2 rounded-lg text-sm ${msg.sent ? "bg-foreground text-background rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"}`}>
                        {msg.text && <p className="whitespace-pre-wrap break-words">{msg.text}</p>}
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className={`${msg.text ? 'mt-2 pt-2 border-t' : ''} ${msg.sent ? 'border-background/20' : 'border-border'} space-y-1`}>
                            {msg.attachments.map((att: any) => {
                              if (currentUnified.channel === 'whatsapp') {
                                const fileUrl = `${WA_API}/wa-attachments/${encodeURIComponent(att.filename)}?accountId=${accountId}`;
                                const isAudio = att.mimeType?.startsWith('audio/');
                                const isImage = att.mimeType?.startsWith('image/');
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
                                  <a
                                    key={att.id}
                                    href={fileUrl}
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
                              }

                              const IconComp = getFileIcon(att.mimeType);
                              return (
                                <a
                                  key={att.id}
                                  href={`${API}/email-attachments/${encodeURIComponent(att.filename)}?accountId=${accountId}`}
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
                  {currentUnified.channel === 'whatsapp' && waManualSendBlocked && (
                    <div className="mb-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      Meta bloquea los mensajes manuales libres cuando han pasado más de 24 horas desde el último mensaje del cliente. El cliente debe volver a escribir para reabrir la ventana.
                    </div>
                  )}
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
                    <button
                      onClick={() => {
                        if (currentUnified.channel === 'email') {
                          emailFileInputRef.current?.click();
                        } else {
                          const input = document.createElement('input');
                          input.type = 'file';
                          input.multiple = true;
                          input.onchange = (e) => {
                            const files = (e.target as HTMLInputElement).files;
                            if (files) setPendingFiles(prev => [...prev, ...Array.from(files)]);
                          };
                          input.click();
                        }
                      }}
                      disabled={currentUnified.channel === 'email' ? !currentEmailConv?.autoReplyPaused : !waConnected || waManualSendBlocked}
                      className="p-2 rounded-md hover:bg-accent text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                    ><Paperclip className="h-4 w-4" /></button>
                    <input className="flex-1 px-3 py-2 text-sm bg-muted/50 border-none rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
                      placeholder={currentUnified.channel === 'email'
                        ? (currentEmailConv?.autoReplyPaused ? t('automations.writeMessage') : t('automations.pauseToSend'))
                        : (waManualSendBlocked ? 'Bloqueado por Meta hasta que el cliente vuelva a escribir' : t('automations.writeMessage'))}
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          currentUnified.channel === 'email' ? sendManualMessage() : sendWaMessage();
                        }
                      }}
                      disabled={currentUnified.channel === 'email' ? !currentEmailConv?.autoReplyPaused : !waConnected || waManualSendBlocked}
                    />
                    <button
                      onClick={() => currentUnified.channel === 'email' ? sendManualMessage() : sendWaMessage()}
                      disabled={currentUnified.channel === 'email'
                        ? !currentEmailConv?.autoReplyPaused || isSending
                        : !waConnected || waManualSendBlocked || (!messageInput.trim() && pendingFiles.length === 0)}
                      className="p-2 rounded-md bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                    ><Send className="h-4 w-4" /></button>
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
                {unifiedConversations.length === 0 ? t('automations.activateToStart') : t('automations.selectConversation')}
              </div>
            )}
          </div>

          <div className={`border-l border-border bg-card flex flex-col overflow-hidden transition-all duration-300 ease-in-out ${activeFolderPanel ? 'w-56 opacity-100' : 'w-0 opacity-0 border-l-0'}`}>
            {activeFolderPanel && (
              <>
                <div className="p-3 border-b border-border">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-foreground">{t('automations.folders')}</p>
                    <button
                      onClick={createFolder}
                      className="p-1.5 rounded-md bg-foreground text-background hover:opacity-90 transition-opacity"
                      title={t('automations.createFolder')}
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                  <input
                    ref={folderInputRef}
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { createFolder(); } }}
                    placeholder={t('automations.newFolder')}
                    className="w-full px-2 py-1.5 text-xs bg-muted/50 border-none rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {activeFolders.length === 0 && (
                    <p className="text-[11px] text-muted-foreground text-center py-4">{t('automations.noFolders')}</p>
                  )}
                  {activeFolders.map((folder: any) => {
                    const isAssigned = currentConversationId ? folderContainsConversation(folder, effectiveChannel, currentConversationId) : false;
                    return (
                      <div key={folder.id} className="flex items-center justify-between gap-1 px-2 py-1.5 rounded-md hover:bg-accent">
                        <button
                          onClick={() => {
                            setUnifiedTypeFilter('all');
                            setUnifiedFolderFilter(unifiedFolderFilter === folder.id ? '' : folder.id);
                          }}
                          className="flex items-center gap-2 text-xs flex-1 text-left"
                        >
                          <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="truncate">{folder.name}</span>
                        </button>
                        {currentConversationId ? (
                          isAssigned ? (
                            <button onClick={() => effectiveChannel === 'whatsapp' ? removeWaFolder(folder.id, currentConversationId) : removeFromFolder(folder.id, currentConversationId)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" title={t('automations.removeFromFolder')}>
                              <Trash2 className="h-3 w-3" />
                            </button>
                          ) : (
                            <button onClick={() => effectiveChannel === 'whatsapp' ? assignWaFolder(folder.id, currentConversationId) : assignToFolder(folder.id, currentConversationId)} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground" title={t('automations.addToFolder')}>
                              <Plus className="h-3 w-3" />
                            </button>
                          )
                        ) : (
                          <button onClick={() => deleteFolder(folder.id)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" title={t('automations.deleteFolder')}>
                            <Trash2 className="h-3 w-3" />
                          </button>
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

      {showClassifyModal && (
        <Modal title={t('automations.classifyRules') || 'Reglas de clasificación'} onClose={() => setShowClassifyModal(false)}>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">{t('automations.classifyRulesDesc') || 'Las reglas ayudan a decidir a qué carpetas enviar automáticamente las conversaciones de email.'}</p>
            <div className="space-y-2 p-3 border border-border rounded-lg bg-muted/20">
              <input
                placeholder={t('automations.classifyRuleNamePlaceholder') || 'Ej: Facturas recibidas'}
                value={classifyForm.name}
                onChange={(e) => setClassifyForm(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <textarea
                placeholder={t('automations.classifyRuleDescPlaceholder') || 'Describe qué tipo de emails deben clasificarse aquí.'}
                value={classifyForm.description}
                onChange={(e) => setClassifyForm(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">{t('automations.classifyRuleFolders') || 'Carpetas de destino'}</p>
                {autoData.emailFolders.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t('automations.noFolders') || 'No hay carpetas creadas'}</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {autoData.emailFolders.map(folder => (
                      <label key={folder.id} className="flex items-center gap-2 text-xs p-2 rounded-md border border-border bg-card cursor-pointer">
                        <input
                          type="checkbox"
                          checked={classifyForm.folderIds.includes(folder.id)}
                          onChange={() => toggleClassifyFolder(folder.id)}
                        />
                        <span className="text-foreground truncate">{folder.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex justify-end">
                <button
                  onClick={saveClassifyRule}
                  disabled={classifyLoading || autoData.emailFolders.length === 0}
                  className="px-3 py-1.5 text-xs rounded-md bg-foreground text-background hover:opacity-90 disabled:opacity-50"
                >
                  {classifyLoading ? (t('automations.saving') || 'Guardando...') : (t('automations.saveClassifyRule') || 'Guardar regla')}
                </button>
              </div>
            </div>
            {classifyRules.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-2">No hay reglas de clasificación.</p>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {classifyRules.map(rule => (
                  <div key={rule.id} className="p-3 border border-border rounded-lg bg-muted/20">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{rule.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{rule.description}</p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {rule.folderIds.map(fid => {
                            const folder = autoData.emailFolders.find(f => f.id === fid);
                            return (
                              <span key={fid} className="px-2 py-0.5 text-[10px] rounded-full border border-border bg-card text-muted-foreground">
                                {folder?.name || 'Carpeta'}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                      <button onClick={() => deleteClassifyRule(rule.id)} className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
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

      {showWaClassifyModal && (
        <Modal title="Reglas de clasificacion" onClose={() => setShowWaClassifyModal(false)}>
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
                {autoData.emailFolders.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Crea al menos una carpeta para usar reglas de clasificacion.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {autoData.emailFolders.map(folder => (
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
                  disabled={waClassifyLoading || autoData.emailFolders.length === 0}
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
                            const folder = autoData.emailFolders.find(f => f.id === fid);
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
                      <div>
                        <p className="text-sm font-medium text-foreground">{sc.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {sc.email}
                          {sc.kind === 'main' ? ' · Cuenta principal' : sc.kind === 'self' ? ' · Mi cuenta' : ''}
                        </p>
                      </div>
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

      <SpecialtiesManagerModal
        open={showEspecialidades}
        title={t('automations.specialities')}
        specialities={autoData.especialidades}
        showCreateForm={showCreateEspForm}
        editingId={editingEspId}
        form={espForm}
        createLabel={t('automations.create')}
        editLabel={t('automations.editSpeciality')}
        namePlaceholder={t('automations.namePlaceholder')}
        descriptionPlaceholder={t('automations.whatIsIt')}
        cancelLabel={t('automations.cancel')}
        saveLabel={t('automations.save')}
        emptyLabel={t('automations.noSpecialities')}
        singularCountLabel="speciality"
        pluralCountLabel="specialities"
        onClose={() => { setShowEspecialidades(false); setShowCreateEspForm(false); setEditingEspId(null); }}
        onStartCreate={() => { setEditingEspId(null); setEspForm({ nombre: "", descripcion: "" }); setShowCreateEspForm(true); }}
        onCancelForm={() => { setShowCreateEspForm(false); setEditingEspId(null); }}
        onSave={saveEspecialidad}
        onEdit={startEditEsp}
        onDelete={deleteEsp}
        onFormChange={setEspForm}
      />

      {showConsultas && (
        <Modal title={t('automations.frequentQueries')} onClose={() => setShowConsultas(false)}>
          {effectiveChannel === 'whatsapp' ? (
            <>
              <div className="flex items-center justify-end gap-2 mb-5">
                <button onClick={() => { setShowSubirInfo(true); setShowConsultas(false); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-card hover:bg-accent text-foreground">
                  <Upload className="h-3.5 w-3.5" />{t('automations.uploadInfo')}
                </button>
                <button onClick={() => { setShowCorreosConsultas(true); setShowConsultas(false); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-foreground text-background hover:opacity-90">
                  <Mail className="h-3.5 w-3.5" />{t('automations.queryEmail')}
                </button>
                <button onClick={() => { setShowWaClassifyModal(true); setShowConsultas(false); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-card hover:bg-accent text-foreground">
                  <Sparkles className="h-3.5 w-3.5" />Reglas de clasificacion
                </button>
              </div>
              <p className="text-sm text-muted-foreground text-center py-6">{t('automations.selectOption')}</p>
            </>
          ) : (
            <>
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
            </>
          )}
        </Modal>
      )}

      {showCuentasCorreo && (
        <Modal title={t('automations.emailAccountsTitle')} onClose={() => setShowCuentasCorreo(false)}>
          <div className="flex items-center justify-between mb-5">
            <span className="text-xs text-muted-foreground">{autoData.cuentasCorreo.length} {autoData.cuentasCorreo.length !== 1 ? "accounts" : "account"}</span>
            <button onClick={() => setShowAddCuenta(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-foreground text-background hover:opacity-90">
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
              {(() => {
                const platformGuides: Record<string, { text: string; link?: string }> = {
                  gmail: { text: "Para Gmail, usa una contraseña de aplicación.", link: "https://support.google.com/accounts/answer/185833" },
                  outlook: { text: "Para Outlook/Hotmail, usa una contraseña de aplicación.", link: "https://support.microsoft.com/account-billing/usar-contrase%C3%B1as-de-aplicaci%C3%B3n-con-el-correo-de-Outlook-como-autenticaci%C3%B3n-de-dos-factores-b8c22536-7b10-4e06-8f9b-3d8c5c8d8a0e" },
                  yahoo: { text: "Para Yahoo, usa una contraseña de aplicación.", link: "https://help.yahoo.com/kb/SLN15241.html" },
                  icloud: { text: "Para iCloud, usa una contraseña de aplicación.", link: "https://support.apple.com/es-es/102654" },
                  "office365": { text: "Para Office 365, usa una contraseña de aplicación.", link: "https://support.microsoft.com/account-billing/usar-contrase%C3%B1as-de-aplicaci%C3%B3n-con-el-correo-de-Outlook-como-autenticaci%C3%B3n-de-dos-factores-b8c22536-7b10-4e06-8f9b-3d8c5c8d8a0e" },
                  hostinger: { text: "Para Hostinger, usa la contraseña normal de tu panel de hosting." },
                  ionos: { text: "Para IONOS, usa la contraseña normal de tu panel de hosting." },
                  ovh: { text: "Para OVH, usa la contraseña normal de tu panel de hosting." },
                  godaddy: { text: "Para GoDaddy, usa la contraseña normal de tu panel de hosting." },
                  custom: { text: "Para servidores personalizados, usa la contraseña de tu panel de hosting." },
                  zoho: { text: "Para Zoho, se recomienda usar una contraseña de aplicación.", link: "https://help.zoho.com/portal/en/kb/bigin/settings/security/articles/generate-an-app-specific-password" },
                };
                const guide = platformGuides[cuentaForm.plataforma];
                if (!guide) return null;
                return (
                  <div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-2.5">
                    <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                      {guide.text}
                      {guide.link && (
                        <a
                          href={guide.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-1 underline hover:text-amber-700 dark:hover:text-amber-300"
                        >
                          ¿Cómo obtenerla?
                        </a>
                      )}
                    </p>
                  </div>
                );
              })()}
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
            <div className="flex items-center gap-2">
              <button onClick={() => setShowCorreoConsultaInfo(true)} className="p-2 rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground">
                <Info className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setShowAddCorreo(true)} disabled={autoData.correosConsultas.length >= 1} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-foreground text-background hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed">
                <Plus className="h-3.5 w-3.5" />{t('automations.add')}
              </button>
            </div>
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

      {showCorreoConsultaInfo && (
        <Modal title={t('automations.queryEmailTitle')} onClose={() => setShowCorreoConsultaInfo(false)}>
          <div className="space-y-3 text-sm text-foreground">
            <p>Este correo de consulta es único para todo el workspace.</p>
            <p>Sirve tanto para dudas que llegan por Email como para dudas que llegan por WhatsApp.</p>
            <p>Cuando la IA no sabe qué responder o qué hacer, enviará la consulta a este correo y esperará la respuesta.</p>
            <p>Solo puede existir uno.</p>
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

      {showWhatsAppSessions && (
        <Modal title={t('automations.whatsappNumbersTitle') || 'Números de WhatsApp'} onClose={() => setShowWhatsAppSessions(false)}>
          <div className="flex items-center justify-between mb-5">
            <span className="text-xs text-muted-foreground">
              {(autoData.whatsappSessions || []).length} {(autoData.whatsappSessions || []).length !== 1 ? "números" : "número"}
            </span>
            <button
              onClick={() => setShowAddWaSession(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-foreground text-background hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />{t('automations.add') || 'Añadir'}
            </button>
          </div>
          {showAddWaSession && (
            <div className="mb-5 p-4 border border-border rounded-lg bg-muted/20 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled
                  className="p-3 rounded-lg border border-border bg-muted text-left text-xs text-muted-foreground cursor-not-allowed opacity-70"
                >
                  <span className="block font-medium text-foreground">{t('automations.waMetaQuickOptionTitle')}</span>
                  <span className="block mt-1">{t('automations.waMetaQuickOptionMaintenance')}</span>
                </button>
                <div className="p-3 rounded-lg border border-border bg-background text-xs">
                  <span className="block font-medium text-foreground">{t('automations.waMetaManualOptionTitle')}</span>
                  <span className="block mt-1 text-muted-foreground">{t('automations.waMetaManualOptionHint')}</span>
                </div>
              </div>
              <input
                placeholder={t('automations.waMetaManualNamePlaceholder')}
                value={waSessionForm.name}
                onChange={(e) => setWaSessionForm({ ...waSessionForm, name: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <input
                placeholder={t('automations.waMetaTokenLabel')}
                value={waSessionForm.accessToken}
                onChange={(e) => setWaSessionForm({ ...waSessionForm, accessToken: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <input
                placeholder={t('automations.waMetaPhoneIdLabel')}
                value={waSessionForm.phoneNumberId}
                onChange={(e) => setWaSessionForm({ ...waSessionForm, phoneNumberId: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <input
                placeholder={t('automations.waMetaWabaIdLabel')}
                value={waSessionForm.wabaId}
                onChange={(e) => setWaSessionForm({ ...waSessionForm, wabaId: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <input
                type="email"
                placeholder={t('automations.waMetaAlertEmailPlaceholder')}
                value={waSessionForm.alertEmail}
                onChange={(e) => setWaSessionForm({ ...waSessionForm, alertEmail: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <div className="flex justify-between items-center gap-2">
                <button
                  onClick={() => setShowWaManualInstructions(true)}
                  type="button"
                  className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  {t('automations.waMetaInstructionsButton')}
                </button>
                <div className="flex gap-2">
                  <button onClick={() => setShowAddWaSession(false)} className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground">{t('automations.cancel')}</button>
                  <button onClick={saveWaSession} className="px-3 py-1.5 text-xs rounded-md bg-foreground text-background hover:opacity-90">{t('automations.save')}</button>
                </div>
              </div>
            </div>
          )}
          {(autoData.whatsappSessions || []).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">{t('automations.waNoNumbersConfigured') || 'No hay números configurados.'}</p>
          ) : (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              {(autoData.whatsappSessions || []).map((session: any) => (
                <div key={session.id} className="p-4 border border-border rounded-lg bg-muted/20 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{session.name || session.phoneNumber || session.phoneNumberId}</p>
                      <p className="text-xs text-muted-foreground truncate">{session.phoneNumber || session.phoneNumberId}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${session.connected ? 'border-green-300 text-green-700' : 'border-amber-300 text-amber-700'}`}>
                        {session.connected ? 'Conectado' : 'Desconectado'}
                      </span>
                      <button onClick={() => deleteWaSession(session.id)} className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <p><span className="text-foreground font-medium">Caducidad:</span> {session.expiresAt ? new Date(session.expiresAt).toLocaleString() : 'Desconocida'}</p>
                    <p><span className="text-foreground font-medium">Email alerta:</span> {session.alertEmail || '-'}</p>
                  </div>
                  <div className="flex justify-end">
                    <button onClick={() => refreshWaToken(session.id)} className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-foreground">
                      {t('automations.refreshToken') || 'Refrescar token'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {showWaManualInstructions && (
        <Modal title={t('automations.waMetaInstructionsTitle')} onClose={() => setShowWaManualInstructions(false)} wide>
          <div className="space-y-4 text-xs text-foreground">
            <p>
              1. {t('automations.waMetaInstructionsStep1Before')}{' '}
              <a
                href="https://developers.facebook.com/apps/"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                Meta Developers &gt; Apps
              </a>{' '}
              {t('automations.waMetaInstructionsStep1After')}
            </p>
            <p>2. {t('automations.waMetaInstructionsStep2')}</p>
            <p>3. {t('automations.waMetaInstructionsStep3')}</p>
            <div className="space-y-2">
              <p>4. {t('automations.waMetaInstructionsStep4')}</p>
              <p>- {t('automations.waMetaInstructionsStep4ItemToken')}</p>
              <p>- {t('automations.waMetaInstructionsStep4ItemPhone')}</p>
              <p>- {t('automations.waMetaInstructionsStep4ItemWaba')}</p>
              <p className="font-medium text-red-600">- {t('automations.waMetaInstructionsStep4Rule1')}</p>
              <p className="font-medium text-red-600">- {t('automations.waMetaInstructionsStep4Rule2')}</p>
              <p className="font-medium text-red-600">- {t('automations.waMetaInstructionsStep4Rule3')}</p>
              <img src={WA_HELP_IMAGE_URL} alt={t('automations.waMetaInstructionsImageAlt')} className="w-full rounded-lg border border-border" />
            </div>
            <p>5. {t('automations.waMetaInstructionsStep5')}</p>
            <p>6. {t('automations.waMetaInstructionsStep6')}</p>
            <p>7. {t('automations.waMetaInstructionsStep7')}</p>
          </div>
        </Modal>
      )}
      </>
    );
  };

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
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-green-500/10 border border-green-500/30">
                    <div className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
                    <span className="text-xs text-foreground">{t('automations.calendarConnectedAs', { email: calendarEmail })}</span>
                  </div>
                  {calendarLastSyncedAt && (
                    <span className="text-[11px] text-muted-foreground">
                      {t('automations.calendarLastSync') || 'Última sync'}: {(() => {
                        const diff = Date.now() - new Date(calendarLastSyncedAt).getTime();
                        const mins = Math.floor(diff / 60000);
                        if (mins < 1) return 'Ahora mismo';
                        if (mins < 60) return `Hace ${mins} min`;
                        const hours = Math.floor(mins / 60);
                        return `Hace ${hours}h`;
                      })()}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={handleSyncCalendar} disabled={calendarSyncing} className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-border bg-card hover:bg-accent text-foreground text-xs font-medium transition-colors disabled:opacity-50" title={t('automations.calendarSyncNow') || 'Sincronizar ahora'}>
                    <RefreshCw className={`h-3.5 w-3.5 ${calendarSyncing ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">{t('automations.calendarSyncNow') || 'Sincronizar'}</span>
                  </button>
                  <button onClick={() => setShowAddEventForm(true)} className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-card hover:bg-accent text-foreground text-xs font-medium transition-colors">
                    <Plus className="h-3.5 w-3.5" />{t('automations.calendarAddEvent')}
                  </button>
                </div>
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
                      return calendarEvents.map((e) => {
                        const color = e.colorId ? (GOOGLE_COLOR_MAP[e.colorId] || palette[hashCode(e.id) % palette.length]) : palette[hashCode(e.id) % palette.length];
                        return {
                          id: e.id,
                          title: e.title,
                          start: e.startDateTime,
                          end: e.endDateTime,
                          allDay: e.allDay,
                          backgroundColor: color,
                          borderColor: color,
                          textColor: '#ffffff',
                          extendedProps: {
                            description: e.description,
                            colorId: e.colorId,
                            recurrence: e.recurrence,
                            location: e.location,
                            attendees: e.attendees,
                          },
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

  if (view === "messages") {
    return renderUnifiedInboxContent();
  }

  if (view === "email") {
    const allConversations = autoData.emailConversations;
    const filteredEmailConversations = emailAccountFilter === 'all'
      ? allConversations
      : allConversations.filter((c: any) => c.cuentaCorreoId === emailAccountFilter);
    const conversations = filteredEmailConversations.filter(c => {
      if (c.classificationType === 'otro' && folderFilter !== '__others__') return false;
      if (folderFilter === '__others__') return c.classificationType === 'otro';
      if (folderFilter && folderFilter !== '__others__') {
        const folder = autoData.emailFolders.find(f => f.id === folderFilter);
        if (!folder || !folderContainsConversation(folder, 'email', c.id)) return false;
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
                        <span className="truncate">{folderFilter === '__others__' ? 'Others' : folderFilter ? autoData.emailFolders.find(f => f.id === folderFilter)?.name || t('automations.allConversations') : t('automations.allConversations')}</span>
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
                        <button
                          onClick={() => { setFolderFilter('__others__'); setFolderDropdownOpen(false); }}
                          className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${folderFilter === '__others__' ? 'bg-accent text-foreground font-medium' : 'text-foreground hover:bg-accent/50'}`}
                        >
                          <FolderOpen className="h-3 w-3 text-muted-foreground" />
                          Others
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
              {autoData.cuentasCorreo.length > 1 && (
                <div className="px-4 py-2 border-b border-border">
                  <select
                    value={emailAccountFilter}
                    onChange={(e) => setEmailAccountFilter(e.target.value)}
                    className="w-full text-xs bg-muted border border-border rounded-md px-2 py-1.5 text-foreground focus:outline-none"
                  >
                    <option value="all">Todas las cuentas</option>
                    {autoData.cuentasCorreo.map((c: any) => (
                      <option key={c.id} value={c.id}>{c.correo}</option>
                    ))}
                  </select>
                </div>
              )}
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
                                    href={`${API}/email-attachments/${encodeURIComponent(att.filename)}?accountId=${accountId}`}
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
                    const folderConvs = autoData.emailConversations.filter(c => folderContainsConversation(folder, 'email', c.id));
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
                            <span className="text-[10px] text-muted-foreground">({folderConvs.length})</span>
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
                      <div>
                        <p className="text-sm font-medium text-foreground">{sc.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {sc.email}
                          {sc.kind === 'main' ? ' · Cuenta principal' : sc.kind === 'self' ? ' · Mi cuenta' : ''}
                        </p>
                      </div>
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

        <SpecialtiesManagerModal
          open={showEspecialidades}
          title={t('automations.specialities')}
          specialities={autoData.especialidades}
          showCreateForm={showCreateEspForm}
          editingId={editingEspId}
          form={espForm}
          createLabel={t('automations.create')}
          editLabel={t('automations.editSpeciality')}
          namePlaceholder={t('automations.namePlaceholder')}
          descriptionPlaceholder={t('automations.whatIsIt')}
          cancelLabel={t('automations.cancel')}
          saveLabel={t('automations.save')}
          emptyLabel={t('automations.noSpecialities')}
          singularCountLabel="speciality"
          pluralCountLabel="specialities"
          onClose={() => { setShowEspecialidades(false); setShowCreateEspForm(false); setEditingEspId(null); }}
          onStartCreate={() => { setEditingEspId(null); setEspForm({ nombre: "", descripcion: "" }); setShowCreateEspForm(true); }}
          onCancelForm={() => { setShowCreateEspForm(false); setEditingEspId(null); }}
          onSave={saveEspecialidad}
          onEdit={startEditEsp}
          onDelete={deleteEsp}
          onFormChange={setEspForm}
        />

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
              <button onClick={() => setShowAddCuenta(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-foreground text-background hover:opacity-90">
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
                {(() => {
                  const platformGuides: Record<string, { text: string; link?: string }> = {
                    gmail: { text: "Para Gmail, usa una contraseña de aplicación.", link: "https://support.google.com/accounts/answer/185833" },
                    outlook: { text: "Para Outlook/Hotmail, usa una contraseña de aplicación.", link: "https://support.microsoft.com/account-billing/usar-contrase%C3%B1as-de-aplicaci%C3%B3n-con-el-correo-de-Outlook-como-autenticaci%C3%B3n-de-dos-factores-b8c22536-7b10-4e06-8f9b-3d8c5c8d8a0e" },
                    yahoo: { text: "Para Yahoo, usa una contraseña de aplicación.", link: "https://help.yahoo.com/kb/SLN15241.html" },
                    icloud: { text: "Para iCloud, usa una contraseña de aplicación.", link: "https://support.apple.com/es-es/102654" },
                    "office365": { text: "Para Office 365, usa una contraseña de aplicación.", link: "https://support.microsoft.com/account-billing/usar-contrase%C3%B1as-de-aplicaci%C3%B3n-con-el-correo-de-Outlook-como-autenticaci%C3%B3n-de-dos-factores-b8c22536-7b10-4e06-8f9b-3d8c5c8d8a0e" },
                    hostinger: { text: "Para Hostinger, usa la contraseña normal de tu panel de hosting." },
                    ionos: { text: "Para IONOS, usa la contraseña normal de tu panel de hosting." },
                    ovh: { text: "Para OVH, usa la contraseña normal de tu panel de hosting." },
                    godaddy: { text: "Para GoDaddy, usa la contraseña normal de tu panel de hosting." },
                    custom: { text: "Para servidores personalizados, usa la contraseña de tu panel de hosting." },
                    zoho: { text: "Para Zoho, se recomienda usar una contraseña de aplicación.", link: "https://help.zoho.com/portal/en/kb/bigin/settings/security/articles/generate-an-app-specific-password" },
                  };
                  const guide = platformGuides[cuentaForm.plataforma];
                  if (!guide) return null;
                  return (
                    <div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-2.5">
                      <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                        {guide.text}
                        {guide.link && (
                          <a
                            href={guide.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-1 underline hover:text-amber-700 dark:hover:text-amber-300"
                          >
                            ¿Cómo obtenerla?
                          </a>
                        )}
                      </p>
                    </div>
                  );
                })()}
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
    const now = Date.now();
    const filteredWaConversations = whatsappNumberFilter === 'all'
      ? waConversations
      : waConversations.filter((c: any) => c.phoneNumberId === whatsappNumberFilter);
    const filteredConvs = filteredWaConversations.filter(c => {
      if (waFolderFilter) {
        const folder = waFolders.find(f => f.id === waFolderFilter);
        if (!folder || !folderContainsConversation(folder, 'whatsapp', c.id)) return false;
      }
      if (waFilter === 'manual' && !c.autoReplyPaused) return false;
      if (waFilter === 'auto' && c.autoReplyPaused) return false;
      if (waFilter === 'expired' && !isWAConversationOutside24h(c, now)) return false;
      if (waSearch) {
        const q = waSearch.toLowerCase();
        if (!c.contactName.toLowerCase().includes(q) && !c.contactPhone.includes(q)) return false;
      }
      return true;
    });
    const currentConv = waConversations.find(c => c.id === selectedWAContact);
    const currentMessages = currentConv?.messages || [];
    const waManualSendBlocked = currentConv ? isWAConversationOutside24h(currentConv, now) : false;

    return (
      <>
      {showWaConnectModal && !waConnected && (
        <Modal
          title={t('automations.waMetaConnectTitle')}
          onClose={() => {
            if (waOAuthProcessing || qrLoading) return;
            setShowWaConnectModal(false);
            setWaManualMode(false);
            setWaConnectError('');
            setShowWaManualInstructions(false);
          }}
        >
          <div className="space-y-4">
            {!waManualMode ? (
              <>
                <p className="text-xs text-muted-foreground">
                  {t('automations.waMetaQuickIntro')}
                </p>

                <div className="p-3 rounded-lg border border-border bg-muted/20 text-xs text-foreground space-y-2">
                  <p className="font-medium">{t('automations.waMetaQuickStepsTitle')}</p>
                  <p>{t('automations.waMetaQuickStep1')}</p>
                  <p>{t('automations.waMetaQuickStep2')}</p>
                  <p>{t('automations.waMetaQuickStep3')}</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">{t('automations.waMetaAlertEmailLabel')}</label>
                  <input
                    type="email"
                    value={waQuickAlertEmail}
                    onChange={e => setWaQuickAlertEmail(e.target.value)}
                    placeholder={t('automations.waMetaAlertEmailPlaceholder')}
                    className="w-full px-3 py-1.5 text-xs rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5">{t('automations.waMetaAlertEmailHint')}</p>
                </div>

                <div className="p-3 rounded-lg border border-border bg-muted/20 text-xs text-muted-foreground">
                  {t('automations.waMetaQuickMaintenance')}
                </div>

                {waConnectError && (
                  <div className="p-3 rounded-lg border border-red-300 bg-red-50 text-red-700 text-xs">
                    {waConnectError}
                  </div>
                )}

                <div className="flex justify-between items-center pt-1">
                  <button
                    onClick={() => { setWaManualMode(true); setWaConnectError(''); }}
                    disabled={waOAuthProcessing || qrLoading}
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50"
                  >
                    {t('automations.waMetaManualLink')}
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setShowWaConnectModal(false);
                        setWaConnectError('');
                        setShowWaManualInstructions(false);
                      }}
                      disabled={waOAuthProcessing || qrLoading}
                      className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground disabled:opacity-50"
                    >
                      {t('automations.close')}
                    </button>
                    <button
                      onClick={() => {}}
                      disabled
                      className="px-3 py-1.5 text-xs rounded-md bg-muted text-muted-foreground cursor-not-allowed opacity-70"
                    >
                      {t('automations.waMetaContinueMetaMaintenance')}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  {t('automations.waMetaManualIntro')}
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">{t('automations.waMetaTokenLabel')}</label>
                    <input
                      type="password"
                      value={waManualToken}
                      onChange={e => setWaManualToken(e.target.value)}
                      placeholder="EAAxxxxxxx..."
                      className="w-full px-3 py-1.5 text-xs rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <p className="text-[10px] text-muted-foreground mt-0.5">{t('automations.waMetaTokenHint')}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">{t('automations.waMetaPhoneIdLabel')}</label>
                    <input
                      type="text"
                      value={waManualPhoneId}
                      onChange={e => setWaManualPhoneId(e.target.value)}
                      placeholder="1234567890"
                      className="w-full px-3 py-1.5 text-xs rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <p className="text-[10px] text-muted-foreground mt-0.5">{t('automations.waMetaPhoneIdHint')}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">{t('automations.waMetaWabaIdLabel')}</label>
                    <input
                      type="text"
                      value={waManualWabaId}
                      onChange={e => setWaManualWabaId(e.target.value)}
                      placeholder="9876543210"
                      className="w-full px-3 py-1.5 text-xs rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <p className="text-[10px] text-muted-foreground mt-0.5">{t('automations.waMetaWabaIdHint')}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">{t('automations.waMetaAlertEmailLabel')}</label>
                    <input
                      type="email"
                      value={waManualAlertEmail}
                      onChange={e => setWaManualAlertEmail(e.target.value)}
                      placeholder={t('automations.waMetaAlertEmailPlaceholder')}
                      className="w-full px-3 py-1.5 text-xs rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <p className="text-[10px] text-muted-foreground mt-0.5">{t('automations.waMetaAlertEmailHint')}</p>
                  </div>
                </div>

                {waConnectError && (
                  <div className="p-3 rounded-lg border border-red-300 bg-red-50 text-red-700 text-xs">
                    {waConnectError}
                  </div>
                )}

                <div className="flex justify-between items-center pt-1">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => { setWaManualMode(false); setWaConnectError(''); }}
                      disabled={waOAuthProcessing}
                      className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50"
                    >
                      {t('automations.waMetaManualBack')}
                    </button>
                    <button
                      onClick={() => setShowWaManualInstructions(true)}
                      type="button"
                      className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    >
                      {t('automations.waMetaInstructionsButton')}
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setShowWaConnectModal(false); setWaManualMode(false); setWaConnectError(''); }}
                      disabled={waOAuthProcessing}
                      className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground disabled:opacity-50"
                    >
                      {t('automations.close')}
                    </button>
                    <button
                      onClick={connectWaManual}
                      disabled={waOAuthProcessing || !waManualToken.trim() || !waManualPhoneId.trim() || !waManualAlertEmail.trim()}
                      className="px-3 py-1.5 text-xs rounded-md bg-foreground text-background hover:opacity-90 disabled:opacity-50"
                    >
                      {waOAuthProcessing ? t('automations.connecting') : t('automations.connect')}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

      {showWaManualInstructions && (
        <Modal title={t('automations.waMetaInstructionsTitle')} onClose={() => setShowWaManualInstructions(false)} wide>
          <div className="space-y-4 text-xs text-foreground">
            <p>
              1. {t('automations.waMetaInstructionsStep1Before')}{' '}
              <a
                href="https://developers.facebook.com/apps/"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                Meta Developers &gt; Apps
              </a>{' '}
              {t('automations.waMetaInstructionsStep1After')}
            </p>
            <p>2. {t('automations.waMetaInstructionsStep2')}</p>
            <p>3. {t('automations.waMetaInstructionsStep3')}</p>
            <div className="space-y-2">
              <p>4. {t('automations.waMetaInstructionsStep4')}</p>
              <p>- {t('automations.waMetaInstructionsStep4ItemToken')}</p>
              <p>- {t('automations.waMetaInstructionsStep4ItemPhone')}</p>
              <p>- {t('automations.waMetaInstructionsStep4ItemWaba')}</p>
              <p className="font-medium text-red-600">- {t('automations.waMetaInstructionsStep4Rule1')}</p>
              <p className="font-medium text-red-600">- {t('automations.waMetaInstructionsStep4Rule2')}</p>
              <p className="font-medium text-red-600">- {t('automations.waMetaInstructionsStep4Rule3')}</p>
              <img src={WA_HELP_IMAGE_URL} alt={t('automations.waMetaInstructionsImageAlt')} className="w-full rounded-lg border border-border" />
            </div>
            <p>5. {t('automations.waMetaInstructionsStep5')}</p>
            <p>6. {t('automations.waMetaInstructionsStep6')}</p>
            <p>7. {t('automations.waMetaInstructionsStep7')}</p>
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
        <Modal title="Reglas de clasificacion" onClose={() => setShowWaClassifyModal(false)}>
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
                {autoData.emailFolders.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Crea al menos una carpeta para usar reglas de clasificacion.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {autoData.emailFolders.map(folder => (
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
                  disabled={waClassifyLoading || autoData.emailFolders.length === 0}
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
                            const folder = autoData.emailFolders.find(f => f.id === fid);
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
            <button onClick={() => setShowCorreosConsultas(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-card hover:bg-accent text-foreground transition-colors">
              <Mail className="h-3.5 w-3.5" />{t('automations.queryEmail')}
            </button>
            <button
              onClick={() => { setShowWhatsAppSessions(true); void refreshWhatsAppSessionState(); }}
              className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-border hover:bg-accent transition-colors"
            >
              <Phone className="h-3.5 w-3.5" />
              {t('automations.whatsappNumbers') || 'Números'}
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
              <div className="grid grid-cols-4 gap-1">
                {(['all', 'auto', 'manual'] as const).map(f => (
                  <button key={f} onClick={() => setWaFilter(f)}
                    className={`px-2 py-1 text-[10px] font-medium rounded-md transition-colors ${waFilter === f ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:bg-accent'}`}>
                    {f === 'all' ? t('automations.all') : f === 'auto' ? t('automations.autoReply') : t('automations.manual')}
                  </button>
                ))}
                <button
                  onClick={() => setWaFilter('expired')}
                  title={t('automations.waExpired24hFilter')}
                  aria-label={t('automations.waExpired24hFilter')}
                  className={`flex items-center justify-center px-2 py-1 rounded-md transition-colors ${waFilter === 'expired' ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:bg-accent'}`}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                </button>
              </div>
              {waFolders.length > 0 && (
                <select value={waFolderFilter} onChange={e => setWaFolderFilter(e.target.value)}
                  className="w-full px-2 py-1 text-xs bg-muted/50 border border-border rounded-md text-foreground">
                  <option value="">{t('automations.allFolders')}</option>
                  {waFolders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              )}
              {(autoData.whatsappSessions || []).length > 1 && (
                <div className="px-4 py-2 border-b border-border">
                  <select
                    value={whatsappNumberFilter}
                    onChange={(e) => setWhatsappNumberFilter(e.target.value)}
                    className="w-full text-xs bg-muted border border-border rounded-md px-2 py-1.5 text-foreground focus:outline-none"
                  >
                    <option value="all">Todos los números</option>
                    {(autoData.whatsappSessions || []).filter((s: any) => s.connected).map((s: any) => (
                      <option key={s.phoneNumberId} value={s.phoneNumberId}>{s.name || `WhatsApp ${s.phoneNumber || s.phoneNumberId}`}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {filteredConvs.length === 0 ? (
                <div className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">{waConnected ? t('automations.waNoConversations') : t('automations.waNotConnectedHint')}</p>
                </div>
              ) : filteredConvs.map((conv) => {
                const isOutside24h = isWAConversationOutside24h(conv, now);

                return (
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
                        {isOutside24h && <AlertTriangle className="h-3 w-3 text-amber-500" title={t('automations.waExpired24hFilter')} />}
                        {conv.autoReplyPaused && <PauseCircle className="h-3 w-3 text-yellow-500" />}
                      </div>
                    </div>
                  </button>
                );
              })}
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
                              const fileUrl = `${WA_API}/wa-attachments/${encodeURIComponent(att.filename)}?accountId=${accountId}`;
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
                  {waManualSendBlocked && (
                    <div className="mb-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      Meta bloquea los mensajes manuales libres cuando han pasado más de 24 horas desde el último mensaje del cliente. El cliente debe volver a escribir para reabrir la ventana.
                    </div>
                  )}
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
                      disabled={!waConnected || waManualSendBlocked}
                      className="p-2 rounded-md hover:bg-accent text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed"><Paperclip className="h-4 w-4" /></button>
                    <input className="flex-1 px-3 py-2 text-sm bg-muted/50 border-none rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      placeholder={waManualSendBlocked ? 'Bloqueado por Meta hasta que el cliente vuelva a escribir' : t('automations.writeMessage')} value={messageInput} onChange={(e) => setMessageInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendWaMessage(); } }}
                      disabled={!waConnected || waManualSendBlocked} />
                    <button onClick={sendWaMessage} disabled={!waConnected || waManualSendBlocked || (!messageInput.trim() && pendingFiles.length === 0)}
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
                      <div>
                        <p className="text-sm font-medium text-foreground">{sc.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {sc.email}
                          {sc.kind === 'main' ? ' · Cuenta principal' : sc.kind === 'self' ? ' · Mi cuenta' : ''}
                        </p>
                      </div>
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

        <SpecialtiesManagerModal
          open={showEspecialidades}
          title={t('automations.specialities')}
          specialities={autoData.especialidades}
          showCreateForm={showCreateEspForm}
          editingId={editingEspId}
          form={espForm}
          createLabel={t('automations.create')}
          editLabel={t('automations.editSpeciality')}
          namePlaceholder={t('automations.namePlaceholder')}
          descriptionPlaceholder={t('automations.whatIsIt')}
          cancelLabel={t('automations.cancel')}
          saveLabel={t('automations.save')}
          emptyLabel={t('automations.noSpecialities')}
          singularCountLabel="speciality"
          pluralCountLabel="specialities"
          onClose={() => { setShowEspecialidades(false); setShowCreateEspForm(false); setEditingEspId(null); }}
          onStartCreate={() => { setEditingEspId(null); setEspForm({ nombre: "", descripcion: "" }); setShowCreateEspForm(true); }}
          onCancelForm={() => { setShowCreateEspForm(false); setEditingEspId(null); }}
          onSave={saveEspecialidad}
          onEdit={startEditEsp}
          onDelete={deleteEsp}
          onFormChange={setEspForm}
        />

        {showConsultas && (
          <Modal title={t('automations.frequentQueries')} onClose={() => setShowConsultas(false)}>
            <div className="flex items-center justify-end gap-2 mb-5">
              <button onClick={() => { setShowSubirInfo(true); setShowConsultas(false); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-card hover:bg-accent text-foreground">
                <Upload className="h-3.5 w-3.5" />{t('automations.uploadInfo')}
              </button>
              <button onClick={() => { setShowCorreosConsultas(true); setShowConsultas(false); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-foreground text-background hover:opacity-90">
                <Mail className="h-3.5 w-3.5" />{t('automations.queryEmail')}
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

        {showWhatsAppSessions && (
          <Modal title={t('automations.whatsappNumbersTitle') || 'Números de WhatsApp'} onClose={() => setShowWhatsAppSessions(false)}>
            <div className="flex items-center justify-between mb-5">
              <span className="text-xs text-muted-foreground">
                {(autoData.whatsappSessions || []).length} {(autoData.whatsappSessions || []).length !== 1 ? "números" : "número"}
              </span>
              <button
                onClick={() => setShowAddWaSession(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-foreground text-background hover:opacity-90"
              >
                <Plus className="h-3.5 w-3.5" />{t('automations.add') || 'Añadir'}
              </button>
            </div>
            {showAddWaSession && (
              <div className="mb-5 p-4 border border-border rounded-lg bg-muted/20 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled
                    className="p-3 rounded-lg border border-border bg-muted text-left text-xs text-muted-foreground cursor-not-allowed opacity-70"
                  >
                    <span className="block font-medium text-foreground">{t('automations.waMetaQuickOptionTitle')}</span>
                    <span className="block mt-1">{t('automations.waMetaQuickOptionMaintenance')}</span>
                  </button>
                  <div className="p-3 rounded-lg border border-border bg-background text-xs">
                    <span className="block font-medium text-foreground">{t('automations.waMetaManualOptionTitle')}</span>
                    <span className="block mt-1 text-muted-foreground">{t('automations.waMetaManualOptionHint')}</span>
                  </div>
                </div>
                <input
                  placeholder={t('automations.waMetaManualNamePlaceholder')}
                  value={waSessionForm.name}
                  onChange={(e) => setWaSessionForm({ ...waSessionForm, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-md border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <input
                  placeholder={t('automations.waMetaTokenLabel')}
                  value={waSessionForm.accessToken}
                  onChange={(e) => setWaSessionForm({ ...waSessionForm, accessToken: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-md border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <input
                  placeholder={t('automations.waMetaPhoneIdLabel')}
                  value={waSessionForm.phoneNumberId}
                  onChange={(e) => setWaSessionForm({ ...waSessionForm, phoneNumberId: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-md border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <input
                  placeholder={t('automations.waMetaWabaIdLabel')}
                  value={waSessionForm.wabaId}
                  onChange={(e) => setWaSessionForm({ ...waSessionForm, wabaId: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-md border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <input
                  placeholder={t('automations.waMetaAlertEmailPlaceholder')}
                  type="email"
                  value={waSessionForm.alertEmail}
                  onChange={(e) => setWaSessionForm({ ...waSessionForm, alertEmail: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-md border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <p className="text-[11px] text-muted-foreground">{t('automations.waMetaAlertEmailHint')}</p>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowWaManualInstructions(true)} className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground">{t('automations.waMetaInstructionsButton')}</button>
                  <button onClick={() => setShowAddWaSession(false)} className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground">{t('automations.cancel') || 'Cancelar'}</button>
                  <button onClick={saveWaSession} disabled={!waSessionForm.accessToken.trim() || !waSessionForm.phoneNumberId.trim() || !waSessionForm.alertEmail.trim()} className="px-3 py-1.5 text-xs rounded-md bg-foreground text-background hover:opacity-90 disabled:opacity-50">{t('automations.save') || 'Guardar'}</button>
                </div>
              </div>
            )}
            {(autoData.whatsappSessions || []).length === 0
              ? <p className="text-sm text-muted-foreground text-center py-6">{t('automations.noWhatsAppNumbers') || 'No hay números configurados'}</p>
              : <div className="space-y-3">
                  {(autoData.whatsappSessions || []).map((s: any) => {
                    const status = getTokenStatus(s);
                    return (
                      <div key={s.phoneNumberId || s.id} className="flex items-center justify-between p-4 border border-border rounded-lg bg-muted/20">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-foreground">{s.name || `WhatsApp ${s.phoneNumber || ''}`}</p>
                            <span className={`text-xs font-medium ${status.color}`}>● {status.label}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{s.phoneNumber || s.phoneNumberId}</p>
                          <div className="flex items-center gap-3 mt-1">
                            <p className="text-xs text-muted-foreground">
                              {s.connected ? <span className="text-green-400">{t('automations.waConnected')}</span> : <span className="text-red-400">{t('automations.waDisconnected')}</span>}
                            </p>
                            {s.alertEmail && <p className="text-xs text-muted-foreground">{t('automations.waAlertEmailPrefix')}: {s.alertEmail}</p>}
                          </div>
                          {!!formatTokenExpiryDate(s.tokenExpiresAt) && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Caduca: {formatTokenExpiryDate(s.tokenExpiresAt)}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {s.connected && s.phoneNumberId && (
                            <button
                              onClick={() => refreshWaToken(s.phoneNumberId)}
                              className="px-2 py-1 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground"
                              title={t('automations.refreshToken')}
                            >
                              {t('automations.refreshToken')}
                            </button>
                          )}
                          <button onClick={() => deleteWaSession(s.phoneNumberId)} className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>}
          </Modal>
        )}

      </>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <ModuleGuide moduleId="automations" />
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('nav.automations')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('automations.manageChannels')}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-3">
          <div className="border border-border rounded-lg p-6 bg-card">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center"><MessageCircle className="h-5 w-5 text-foreground" /></div>
              <div><h3 className="text-sm font-semibold text-foreground">Email + WhatsApp</h3><p className="text-xs text-muted-foreground">{t('automations.manageChannels')}</p></div>
            </div>
            <button onClick={() => { setView("messages"); void loadWaData(); }} className="w-full px-4 py-2 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 transition-opacity">{t('automations.access')}</button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="border border-border rounded-md p-3 bg-card text-center"><p className="text-lg font-semibold text-foreground font-mono">{stats.emailMessages + stats.whatsappMessages}</p><p className="text-[10px] text-muted-foreground mt-0.5">{t('automations.messages')}</p></div>
            <div className="border border-border rounded-md p-3 bg-card text-center"><p className="text-lg font-semibold text-foreground font-mono">{stats.emailConversations + stats.whatsappConversations}</p><p className="text-[10px] text-muted-foreground mt-0.5">{t('automations.conversations')}</p></div>
            <div className="border border-border rounded-md p-3 bg-card text-center"><p className="text-lg font-semibold text-foreground font-mono">{stats.emailUnread + stats.whatsappUnread}</p><p className="text-[10px] text-muted-foreground mt-0.5">{t('automations.unread')}</p></div>
          </div>
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
          <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {t('automations.customAutomationExtraNotice')}
          </div>
          <div className="flex items-center justify-between mb-3">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-xs font-semibold text-foreground">{t('automations.customAutomationPrice')}</span>
          </div>
          <a href="mailto:support@lyrium.io" className="w-full px-4 py-2 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 transition-opacity text-center block">{t('automations.contactSpecialist')}</a>
        </div>
        <div className="border border-border rounded-lg p-6 bg-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center"><Calendar className="h-5 w-5 text-foreground" /></div>
            <div><h3 className="text-sm font-semibold text-foreground">{t('automations.calendar')}</h3><p className="text-xs text-muted-foreground">{t('automations.calendarEvents')}</p></div>
          </div>
          <button onClick={() => setView("calendar")} className="w-full px-4 py-2 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 transition-opacity">{t('automations.access')}</button>
        </div>
      </div>
    </div>
  );
};

export default Automations;
