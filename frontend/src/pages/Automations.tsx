import {
  Mail, MessageCircle, Calendar, ArrowLeft, Send, Paperclip, Search,
  MoreVertical, Users, HelpCircle, X, Plus, Trash2, Eye, Upload, PauseCircle, PanelLeft, Pencil,
  FolderOpen, Copy, Check, ChevronDown, FileText, Image, Download, ChevronRight, Settings2
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

const whatsappContacts = [
  { id: 1, name: "Carlos Garcia", phone: "+34 612 345 678", lastMessage: "Perfect, see you tomorrow", time: "11:05", unread: 1 },
  { id: 2, name: "Maria Lopez", phone: "+34 623 456 789", lastMessage: "Thanks for the information", time: "10:20", unread: 0 },
  { id: 3, name: "Juzgado Nº3", phone: "+34 634 567 890", lastMessage: "Recordatorio: vista oral 15/03", time: "09:00", unread: 3 },
  { id: 4, name: "Ana Martinez", phone: "+34 645 678 901", lastMessage: "Can you send me the invoice?", time: "Yesterday", unread: 0 },
];
const whatsappMessages: Record<number, { from: string; text: string; time: string; sent: boolean }[]> = {
  1: [
    { from: "Carlos Garcia", text: "Hi, shall we meet tomorrow to sign?", time: "10:50", sent: false },
    { from: "You", text: "Yes, at 11 at the office", time: "10:55", sent: true },
    { from: "Carlos Garcia", text: "Perfect, see you tomorrow", time: "11:05", sent: false },
  ],
  2: [
    { from: "You", text: "I will send you the documents by email", time: "10:00", sent: true },
    { from: "Maria Lopez", text: "Thanks for the information", time: "10:20", sent: false },
  ],
  3: [{ from: "Juzgado Nº3", text: "Recordatorio: vista oral 15/03", time: "09:00", sent: false }],
  4: [
    { from: "Ana Martinez", text: "Can you send me the invoice?", time: "18:00", sent: false },
    { from: "You", text: "I will send it first thing tomorrow", time: "18:30", sent: true },
  ],
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
  const [selectedWAContact, setSelectedWAContact] = useState<number>(1);
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

  useEffect(() => {
    const accId = sessionStorage.getItem("accountId") || "";
    setAccountId(accId);
    setCalendarUserId(sessionStorage.getItem("userId") || accId);
    setUserEmail(sessionStorage.getItem("userEmail") || "");
  }, []);

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

  const apiFile = async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("accountId", accountId);
    const res = await authFetch(`${API}/documentos`, { method: "POST", body: fd });
    return res.ok;
  };

  const reload = () => loadData(accountId);

  // Detect Google OAuth callback redirect
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

  const stats = { emailMessages: autoData.emailConversations.reduce((a, c) => a + c.messages.length, 0), emailConversations: autoData.emailConversations.length, emailUnread: autoData.emailConversations.reduce((a, c) => a + c.unread, 0), whatsappMessages: 1253, whatsappConversations: 89, whatsappUnread: 4 };

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
    const contacts = whatsappContacts;
    const messages = whatsappMessages;
    const currentMessages = messages[selectedWAContact] || [];

    return (
      <div className="h-[calc(100vh-2rem)] flex flex-col">
        <div className="flex items-center justify-between p-3 md:p-4 border-b border-border bg-card">
          <div className="flex items-center gap-3">
            <button onClick={() => setView("main")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />{t('common.back')}
            </button>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-foreground" />
              <span className="text-sm font-semibold text-foreground">WhatsApp</span>
            </div>
          </div>
        </div>
        <div className="flex flex-1 min-h-0 relative">
          {/* Mobile backdrop */}
          {isMobile && showConvPanel && (
            <div className="fixed inset-0 z-30 bg-black/50" onClick={() => setShowConvPanel(false)} />
          )}
          <div className={`${isMobile ? `fixed left-0 top-0 z-40 h-full w-72 transition-transform duration-300 ${showConvPanel ? 'translate-x-0' : '-translate-x-full'}` : 'w-80'} border-r border-border bg-card flex flex-col`}>
            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input className="w-full pl-9 pr-3 py-2 text-sm bg-muted/50 border-none rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" placeholder={t('automations.searchConversation')} />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {contacts.map((contact) => (
                <button key={contact.id} onClick={() => { setSelectedWAContact(contact.id); if (isMobile) setShowConvPanel(false); }}
                  className={`w-full text-left p-3 border-b border-border/50 hover:bg-accent/50 transition-colors ${selectedWAContact === contact.id ? "bg-accent" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <span className="text-xs font-semibold text-foreground">{contact.name.split(" ").map((n) => n[0]).join("")}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{contact.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{contact.lastMessage}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[10px] text-muted-foreground">{contact.time}</span>
                      {contact.unread > 0 && (
                        <span className="h-4 min-w-4 px-1 rounded-full bg-foreground text-background text-[10px] font-bold flex items-center justify-center">{contact.unread}</span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 flex flex-col bg-background">
            <div className="flex items-center justify-between p-3 md:p-4 border-b border-border bg-card">
              <div className="flex items-center gap-3">
                {isMobile && (
                  <button onClick={() => setShowConvPanel(true)} className="p-1.5 rounded-md hover:bg-accent transition-colors">
                    <PanelLeft className="h-4 w-4 text-muted-foreground" />
                  </button>
                )}
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                  <span className="text-xs font-semibold text-foreground">
                    {contacts.find((c) => c.id === selectedWAContact)?.name.split(" ").map((n) => n[0]).join("")}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{contacts.find((c) => c.id === selectedWAContact)?.name}</p>
                  <p className="text-[11px] text-muted-foreground">{contacts.find((c) => c.id === selectedWAContact)?.phone}</p>
                </div>
              </div>
              <button className="p-2 rounded-md hover:bg-accent text-muted-foreground"><MoreVertical className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {currentMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.sent ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[70%] px-3 py-2 rounded-lg text-sm ${msg.sent ? "bg-foreground text-background rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"}`}>
                    <p>{msg.text}</p>
                    <p className={`text-[10px] mt-1 ${msg.sent ? "text-background/60" : "text-muted-foreground"}`}>{msg.time}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-border bg-card">
              <div className="flex items-center gap-2">
                <button className="p-2 rounded-md hover:bg-accent text-muted-foreground"><Paperclip className="h-4 w-4" /></button>
                <input className="flex-1 px-3 py-2 text-sm bg-muted/50 border-none rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder={t('automations.writeMessage')} value={messageInput} onChange={(e) => setMessageInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && setMessageInput("")} />
                <button className="p-2 rounded-md bg-foreground text-background hover:opacity-90 transition-opacity"><Send className="h-4 w-4" /></button>
              </div>
            </div>
          </div>
        </div>
      </div>
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
        </div>
        <div className="space-y-3">
          <div className="border border-border rounded-lg p-6 bg-card">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center"><MessageCircle className="h-5 w-5 text-foreground" /></div>
              <div><h3 className="text-sm font-semibold text-foreground">WhatsApp</h3><p className="text-xs text-muted-foreground">{t('automations.instantMsg')}</p></div>
            </div>
            <button onClick={() => { setView("whatsapp"); setSelectedWAContact(1); }} className="w-full px-4 py-2 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 transition-opacity">{t('automations.comingSoon')}</button>
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
