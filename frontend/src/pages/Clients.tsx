import { useState, useRef, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, FolderOpen, X, Upload, Info, MessageSquare, Search, Send, ChevronDown, Eye, StopCircle, Calculator, StickyNote, Timer, Play, Pause, FileText, Check, Mail, CheckCircle2, Clock, AlertTriangle, PenTool } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/use-toast";
import { useStreamingChat } from "@/hooks/useStreamingChat";
import { authFetch } from '../lib/authFetch';
import { getCurrencyForCountry } from '../i18n';
import { QRCodeSVG } from 'qrcode.react';

interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  cases: number;
  status: "abierto" | "finalizado";
  summary?: string;
  files: ClientFile[];
  assignedSubaccountId?: string;
  autoCreated?: boolean;
  clientType?: 'asalariado' | 'autonomo' | 'empresa';
  fiscalInfo?: FiscalInfo;
  notes?: string;
  timerEntries?: TimerEntry[];
}

interface TimerEntry {
  id: string;
  duration: number;
  date: string;
  time: string;
}

interface InvoiceLine {
  id: string;
  concept: string;
  quantity: number;
  price: number;
  subtotal: number;
}

interface InvoiceData {
  id: string;
  clientId: string;
  invoiceNumber: string;
  date: string;
  firmName: string;
  firmAddress: string;
  firmPhone: string;
  firmNIF?: string;
  firmInfo?: string;
  paymentMethod: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  taxRate: number;
  lines: InvoiceLine[];
  baseAmount: number;
  taxAmount: number;
  totalAmount: number;
  sentAt?: string;
  sentFrom?: string;
  huella?: string;
  verifactuTimestamp?: string;
}

interface EmailAccount {
  id: string;
  plataforma: string;
  correo: string;
}

interface ClientFile {
  id: string;
  name: string;
  date: string;
  filePath: string;
  signatureRequestId?: string;
}

interface FiscalInfo {
  nif: string;
  comunidadAutonoma: string;
  // Comunes asalariado + autónomo
  fechaNacimiento: string;
  estadoCivil: string;
  numHijos: string;
  discapacidad: string;
  pctDiscapacidad: string;
  // Solo asalariado
  tipoContrato: string;
  declaracionConjunta: string;
  rentasCapital: string;
  // Solo autónomo
  fechaAltaHacienda: string;
  altaRETA: string;
  fechaAltaRETA: string;
  epigrafeIAE: string;
  descripcionActividad: string;
  variasActividades: string;
  cnae: string;
  regimenIRPF: string;
  regimenIVA: string;
  prorrata: string;
  frecuenciaIVA: string;
  modelo130: string;
  retencionesFacturas: string;
  tieneTrabajadores: string;
  operacionesIntracomunitarias: string;
  retencionesProfesionales: string;
  // Empresa
  tipoSociedad: string;
  fechaConstitucion: string;
  fechaInicioActividad: string;
  cnaeEmpresa: string;
  descripcionActividadEmpresa: string;
  variasActividadesEmpresa: string;
  numEmpleados: string;
  tipoIS: string;
  reducidaDimension: string;
  grupoEmpresarial: string;
  consolidacionFiscal: string;
  perdidasAnteriores: string;
  concurso: string;
  regimenIVAEmpresa: string;
  proEmpresa: string;
  intracomEmpresa: string;
  frecuenciaIVAEmpresa: string;
  trabajadoresEmpresa: string;
  retencionesModelo111: string;
  reparteDividendos: string;
  observaciones: string;
}

interface LyriChat {
  id: string;
  clientId: string;
  title: string;
  date: string;
  source: string;
  messages: { id: string; role: "user" | "assistant"; content: string }[];
}

interface Subaccount {
  id: string;
  name: string;
  email: string;
}

const API_URL = import.meta.env.VITE_API_URL;

const FIELD_LABELS: Record<string, string> = {
  salarioBruto: "Salario bruto anual", retencionesEmpresa: "Retenciones empresa",
  cotizacionesSS: "Cotizaciones S.S.", pagasExtras: "Pagas extra fuera del bruto",
  retribucionesEspecie: "Retribuciones en especie", capitalMobiliario: "Capital mobiliario",
  capitalInmobiliario: "Capital inmobiliario / alquileres", gananciaPatrimonial: "Ganancias patrimoniales",
  pensiones: "Pensiones y prestaciones", planPensiones: "Plan de pensiones",
  cuotasSindicales: "Union dues", donaciones: "Donations",
  deduccionesAuto: "Regional deductions", viviendaHabitual: "Primary residence – deduction",
  retencionesTotales: "Total withholdings", facturacionTotal: "Total revenue excl. VAT",
  ingresosIntracom: "Intra-EU income", subvenciones: "Grants / subsidies",
  otrosIngresos: "Other income", gastosActividad: "Business expenses",
  cuotaRETA: "RETA contribution – Social Security", amortizaciones: "Depreciation",
  gastosFinancieros: "Financial expenses", dietasDesplaz: "Meals & travel",
  segurosPro: "Professional insurance", ivaRepercutido: "Output VAT (issued)",
  ivaSoportado: "Input VAT (received)", ivaIntracom: "Intra-EU VAT",
  ivaRegularizacion: "VAT adjustments / offsets",
  pagosFracc130: "Instalment payments mod. 130", retencionesSoportadas: "Withholdings",
  m2Local: "m² premises (flat-rate)", empleadosModulos: "Employees (flat-rate)",
  potenciaElec: "Electric power kW (flat-rate)", ingresosTotal: "Total income",
  gastosTotal: "Total expenses", resultadoAntesImp: "Pre-tax profit",
  gastosNoDeducibles: "Non-deductible expenses", amortizFiscal: "Fiscal depreciation adjustment",
  provisiones: "Provisions", deterioros: "Value impairments", opVinculadas: "Related-party transactions",
  basesNegAnter: "Prior-year negative tax bases", reservaCapitalizacion: "Capitalisation reserve",
  reservaNivelacion: "Equalisation reserve", deduccionID: "I+D",
  deduccionEmpleo: "Job creation", dobleImposicion: "International double taxation",
  deduccionDonac: "Donations (Corp. tax)", incentivosAuto: "Regional incentives",
  pagosFracc202: "Instalment payments mod. 202", retencionesSop: "Withholdings (Corp. tax)",
  ivaRepercutidoEmp: "Output VAT", ivaSoportadoEmp: "Input VAT",
  ivaRegularizEmp: "VAT adjustments & offsets",
};

const CALC_API_URL = import.meta.env.VITE_API_URL;

const Clients = () => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [filesClientId, setFilesClientId] = useState<string | null>(null);
  const [currentClientFiles, setCurrentClientFiles] = useState<ClientFile[]>([]);
  const [form, setForm] = useState({ name: "", email: "", phone: "", summary: "" });
  const [clientType, setClientType] = useState("asalariado");
  const [showFiscalInfo, setShowFiscalInfo] = useState(false);
  const [countryConfig, setCountryConfig] = useState<any>(null);
  const emptyFiscalInfo = {
    nif: "", comunidadAutonoma: "", fechaNacimiento: "", fechaAltaHacienda: "",
    altaRETA: "", fechaAltaRETA: "", epigrafeIAE: "", descripcionActividad: "",
    variasActividades: "", cnae: "", regimenIRPF: "", regimenIVA: "", prorrata: "",
    frecuenciaIVA: "", modelo130: "", retencionesFacturas: "", tieneTrabajadores: "",
    operacionesIntracomunitarias: "", retencionesProfesionales: "", estadoCivil: "",
    numHijos: "", discapacidad: "", pctDiscapacidad: "", tipoContrato: "", declaracionConjunta: "", rentasCapital: "",
    tipoSociedad: "", fechaConstitucion: "", fechaInicioActividad: "",
    cnaeEmpresa: "", descripcionActividadEmpresa: "", variasActividadesEmpresa: "",
    numEmpleados: "", tipoIS: "", reducidaDimension: "", grupoEmpresarial: "",
    consolidacionFiscal: "", perdidasAnteriores: "", concurso: "",
    regimenIVAEmpresa: "", proEmpresa: "", intracomEmpresa: "", frecuenciaIVAEmpresa: "",
    trabajadoresEmpresa: "", retencionesModelo111: "", reparteDividendos: "", observaciones: ""
  };
  const [fiscalInfo, setFiscalInfo] = useState(emptyFiscalInfo);
  const [formFiles, setFormFiles] = useState<File[]>([]);
  const [isDraggingForm, setIsDraggingForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [summaryClientId, setSummaryClientId] = useState<string | null>(null);
  const [summaryText, setSummaryText] = useState("");
  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [notesClientId, setNotesClientId] = useState<string | null>(null);
  const [notesText, setNotesText] = useState("");
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [showCalculos, setShowCalculos] = useState<string | null>(null);

  // Timer state
  const [timerClientId, setTimerClientId] = useState<string | null>(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeTimerIdRef = useRef<string | null>(null);
  const timerStartedAtRef = useRef<number | null>(null);

  // Invoice creation state
  const [showCreateInvoice, setShowCreateInvoice] = useState(false);
  const [invoiceSettings, setInvoiceSettings] = useState({ firmName: '', firmAddress: '', firmPhone: '', firmNIF: '', firmInfo: '', fiscalTerritory: 'comun', paymentMethod: '', defaultTaxRate: 21 });
  const [invoiceTaxRate, setInvoiceTaxRate] = useState(21);
  const [invoiceLines, setInvoiceLines] = useState<InvoiceLine[]>([]);
  const [calcPricePerHour, setCalcPricePerHour] = useState('');
  const [selectedTimerEntries, setSelectedTimerEntries] = useState<string[]>([]);
  const [calcResult, setCalcResult] = useState<string | null>(null);

  // Invoice view state
  const [viewInvoice, setViewInvoice] = useState<InvoiceData | null>(null);
  const [clientInvoices, setClientInvoices] = useState<InvoiceData[]>([]);
  const [showInvoicesList, setShowInvoicesList] = useState(false);

  // Send invoice state
  const [showSendInvoice, setShowSendInvoice] = useState<InvoiceData | null>(null);
  const [emailAccounts, setEmailAccounts] = useState<EmailAccount[]>([]);
  const [selectedEmailAccountId, setSelectedEmailAccountId] = useState<string | null>(null);
  const [isSendingInvoice, setIsSendingInvoice] = useState(false);
  const invoicePreviewRef = useRef<HTMLDivElement>(null);

  // Attach message state
  const [invoiceMessage, setInvoiceMessage] = useState('');
  const [showMessageField, setShowMessageField] = useState(false);

  // Add email account from invoice modal
  const [showAddEmail, setShowAddEmail] = useState(false);
  const [addEmailForm, setAddEmailForm] = useState({ plataforma: 'gmail', correo: '', password: '' });
  const [isAddingEmail, setIsAddingEmail] = useState(false);

  // Edit invoice state
  const [editingInvoice, setEditingInvoice] = useState<InvoiceData | null>(null);

  // Delete invoice state
  const [invoiceToDelete, setInvoiceToDelete] = useState<InvoiceData | null>(null);

  const [calculosList, setCalculosList] = useState<any[]>([]);
  const [viewCalculo, setViewCalculo] = useState<any | null>(null);
  const formFileRef = useRef<HTMLInputElement>(null);
  const modalFileRef = useRef<HTMLInputElement>(null);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [clientSignatureRequests, setClientSignatureRequests] = useState<Record<string, any>>({});
  const [showSignUploadForm, setShowSignUploadForm] = useState(false);
  const [signFile, setSignFile] = useState<File | null>(null);
  const [signFileName, setSignFileName] = useState('');
  const [signDescription, setSignDescription] = useState('');
  const [isSendingSign, setIsSendingSign] = useState(false);
  const signFileRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | "abierto" | "finalizado" | "automaticos">("todos");
  const [openStatusDropdown, setOpenStatusDropdown] = useState<string | null>(null);
  const [openSubDropdown, setOpenSubDropdown] = useState<string | null>(null);

  // Lyri chat state
  const [lyriClientId, setLyriClientId] = useState<string | null>(null);
  const [lyriChats, setLyriChats] = useState<LyriChat[]>([]);
  const [activeLyriChatId, setActiveLyriChatId] = useState<string | null>(null);
  const [lyriInput, setLyriInput] = useState("");
  const [showChatSelector, setShowChatSelector] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const lyriEndRef = useRef<HTMLDivElement>(null);
  const { streamingText: lyriStreamingText, isStreaming: lyriIsStreaming, startStream: lyriStartStream, cancelStream: lyriCancelStream } = useStreamingChat();

  // Animation state
  const [isVisible, setIsVisible] = useState(false);

  // Subaccounts state
  const [subaccounts, setSubaccounts] = useState<Subaccount[]>([]);
  const [userType, setUserType] = useState<string>('main');
  const [userId, setUserId] = useState<string>('');
  const [accountId, setAccountId] = useState<string>('');


  useEffect(() => {
    const country = sessionStorage.getItem('country') || 'ES';
    authFetch(`${API_URL}/calculos/config?country=${country}`)
      .then(res => res.json())
      .then(data => setCountryConfig(data))
      .catch(() => {});
  }, []);

  const cf = countryConfig?.clientForm;

  const currencyInfo = getCurrencyForCountry(sessionStorage.getItem('country') || 'ES');
  const cSym = currencyInfo.symbol;

  // Close client dropdowns on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('[data-status-dd]')) setOpenStatusDropdown(null);
      if (!t.closest('[data-sub-dd]')) setOpenSubDropdown(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const type = sessionStorage.getItem('userType') || 'main';
    const id = sessionStorage.getItem('userId') || '';
    const accId = sessionStorage.getItem('accountId') || '';
    setUserType(type);
    setUserId(id);
    setAccountId(accId);
    
    loadClients();
    loadSubaccounts();
    setIsVisible(false);
    const timer = setTimeout(() => setIsVisible(true), 10);

    // Restore timer from sessionStorage
    const savedTimerClient = sessionStorage.getItem('timerClientId');
    const savedStartedAt = sessionStorage.getItem('timerStartedAt');
    const savedBase = parseInt(sessionStorage.getItem('timerBaseSeconds') || '0', 10);
    if (savedTimerClient && savedStartedAt) {
      const elapsed = Math.floor((Date.now() - parseInt(savedStartedAt, 10)) / 1000) + savedBase;
      activeTimerIdRef.current = savedTimerClient;
      timerStartedAtRef.current = parseInt(savedStartedAt, 10);
      setTimerRunning(true);
      setTimerSeconds(elapsed);
      timerRef.current = setInterval(() => {
        const now = Date.now();
        setTimerSeconds(Math.floor((now - parseInt(savedStartedAt, 10)) / 1000) + savedBase);
      }, 1000);
    }

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (lyriClientId) {
      loadClientChats(lyriClientId);
    }
  }, [lyriClientId]);

  useEffect(() => {
    lyriEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lyriChats, activeLyriChatId, lyriStreamingText]);

  // Auto-refresh files list while modal is open
  useEffect(() => {
    if (!filesClientId) return;
    const interval = setInterval(async () => {
      try {
        const accId = sessionStorage.getItem('accountId');
        if (!accId) return;
        const res = await authFetch(`${API_URL}/clients?accountId=${accId}&userType=${sessionStorage.getItem('userType')}`);
        if (res.ok) {
          const data: Client[] = await res.json();
          const updated = data.find(c => c.id === filesClientId);
          if (updated) {
            setCurrentClientFiles(updated.files);
            setClients(data);
          }
        }
      } catch { /* ignore */ }
    }, 10000);
    return () => clearInterval(interval);
  }, [filesClientId]);

  const loadClients = async () => {
    try {
      const accId = sessionStorage.getItem('accountId');
      if (!accId) return;
      
      const response = await authFetch(`${API_URL}/clients?accountId=${accId}&userType=${sessionStorage.getItem('userType')}`);
      if (response.ok) {
        const data = await response.json();
        setClients(data);
      }
    } catch (error) {
      console.error('Error al cargar clientes:', error);
    }
  };

  const loadSubaccounts = async () => {
    try {
      const accId = sessionStorage.getItem('accountId');
      if (!accId) return;
      
      const response = await authFetch(`${API_URL}/accounts/subaccounts?accountId=${accId}`);
      if (response.ok) {
        const data = await response.json();
        setSubaccounts(data);
      }
    } catch (error) {
      console.error('Error al cargar subcuentas:', error);
    }
  };

  const openNew = () => {
    setForm({ name: "", email: "", phone: "", summary: "" });
    setClientType("asalariado");
    setFiscalInfo(emptyFiscalInfo);
    setShowFiscalInfo(false);
    setFormFiles([]);
    setEditingClient(null);
    setShowForm(true);
  };

  const openEdit = (client: Client) => {
    setForm({ name: client.name, email: client.email, phone: client.phone, summary: client.summary || "" });
    setClientType((client.clientType as any) || "asalariado");
    setFiscalInfo(client.fiscalInfo ? { ...emptyFiscalInfo, ...client.fiscalInfo } : emptyFiscalInfo);
    setShowFiscalInfo(false);
    setFormFiles([]);
    setEditingClient(client);
    setShowForm(true);
  };

  const save = async () => {
    if (!form.name.trim()) return;
    
    setIsLoading(true);
    try {
      const accId = sessionStorage.getItem('accountId');
      if (!accId) {
        toast({ title: t('clients.errorNoAccount'), variant: 'destructive' });
        setIsLoading(false);
        return;
      }
      
      const formData = new FormData();
      formData.append('name', form.name);
      formData.append('email', form.email);
      formData.append('phone', form.phone);
      formData.append('summary', form.summary);
      formData.append('accountId', accId);
      formData.append('clientType', clientType);
      formData.append('fiscalInfo', JSON.stringify(fiscalInfo));
      
      formFiles.forEach((file) => {
        formData.append('files', file);
      });

      if (editingClient) {
        const response = await authFetch(`${API_URL}/clients/${editingClient.id}`, {
          method: 'PUT',
          body: formData,
        });

        if (response.ok) {
          await loadClients();
          setShowForm(false);
          setFormFiles([]);
        } else {
          toast({ title: t('clients.errorUpdate'), variant: 'destructive' });
        }
      } else {
        const response = await authFetch(`${API_URL}/clients`, {
          method: 'POST',
          body: formData,
        });

        if (response.ok) {
          await loadClients();
          setShowForm(false);
          setFormFiles([]);
        } else {
          toast({ title: t('clients.errorCreate'), variant: 'destructive' });
        }
      }
    } catch (error) {
      console.error('Error:', error);
      toast({ title: t('clients.errorSave'), variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const confirmRemove = (id: string) => {
    setClientToDelete(id);
    setShowDeleteConfirm(true);
  };

  const remove = async () => {
    if (!clientToDelete) return;

    try {
      const response = await authFetch(`${API_URL}/clients/${clientToDelete}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await loadClients();
        setShowDeleteConfirm(false);
        setClientToDelete(null);
      } else {
        toast({ title: t('clients.errorDelete'), variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error:', error);
      toast({ title: t('clients.errorDelete'), variant: 'destructive' });
    }
  };

  const removeFile = async (fileId: string) => {
    if (!filesClientId) return;

    try {
      const response = await authFetch(`${API_URL}/clients/${filesClientId}/files/${fileId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setCurrentClientFiles((prev) => prev.filter((f) => f.id !== fileId));
        setClients((prev) =>
          prev.map((client) =>
            client.id === filesClientId
              ? { ...client, files: client.files.filter((f) => f.id !== fileId) }
              : client
          )
        );
      } else {
        toast({ title: t('clients.errorFile'), variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error:', error);
      toast({ title: t('clients.errorFile'), variant: 'destructive' });
    }
  };

  const uploadFileToClient = async (files: FileList) => {
    if (!filesClientId || files.length === 0) return;

    // Subir archivos uno por uno porque el endpoint espera un solo archivo
    for (const file of Array.from(files)) {
      // Check individual file size on frontend (100MB)
      if (file.size > 100 * 1024 * 1024) {
        toast({ title: t('clients.fileTooLarge', { name: file.name }), variant: 'destructive' });
        continue;
      }

      const formData = new FormData();
      formData.append('file', file); // Backend espera 'file' singular

      try {
        const response = await authFetch(`${API_URL}/clients/${filesClientId}/files`, {
          method: 'POST',
          body: formData,
        });

        if (response.ok) {
          const uploadedFile: ClientFile = await response.json();
          setCurrentClientFiles((prev) => [...prev, uploadedFile]);
          setClients((prev) =>
            prev.map((client) =>
              client.id === filesClientId
                ? { ...client, files: [...client.files, uploadedFile] }
                : client
            )
          );
        } else if (response.status === 413) {
          const data = await response.json();
          if (data.error === 'STORAGE_LIMIT') {
            toast({ title: t('clients.storageLimitReached', { used: data.usedMB, limit: data.limitMB }), variant: 'destructive' });
          } else {
            toast({ title: t('clients.fileTooLarge', { name: file.name }), variant: 'destructive' });
          }
        } else {
          toast({ title: t('clients.errorUpload', { name: file.name }), variant: 'destructive' });
        }
      } catch (error) {
        console.error('Error:', error);
        toast({ title: t('clients.errorUpload', { name: file.name }), variant: 'destructive' });
      }
    }
  };

  const handleModalFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      uploadFileToClient(e.target.files);
    }
  };

  const handleModalDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFiles(true);
  };

  const handleModalDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFiles(false);
  };

  const handleModalDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleModalDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFiles(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadFileToClient(e.dataTransfer.files);
    }
  };

  const handleFormFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) setFormFiles((prev) => [...prev, ...Array.from(files)]);
  };

  const updateClientStatus = async (clientId: string, status: "abierto" | "finalizado") => {
    try {
      const response = await authFetch(`${API_URL}/clients/${clientId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      if (response.ok) {
        setClients((prev) => prev.map((c) => c.id === clientId ? { ...c, status } : c));
      }
    } catch (error) {
      console.error('Error al actualizar estado:', error);
    }
  };

  const assignClientToSubaccount = async (clientId: string, subaccountId: string) => {
    try {
      const response = await authFetch(`${API_URL}/accounts/clients/${clientId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subaccountId: subaccountId || null }),
      });

      if (response.ok) {
        setClients((prev) => prev.map((c) => 
          c.id === clientId ? { ...c, assignedSubaccountId: subaccountId || undefined } : c
        ));
      }
    } catch (error) {
      console.error('Error al asignar cliente:', error);
    }
  };

  const openClientFiles = async (clientId: string) => {
    const client = clients.find(c => c.id === clientId);
    if (client) {
      setCurrentClientFiles(client.files);
      setFilesClientId(clientId);
      // Load signature requests for this client
      try {
        const res = await authFetch(`${API_URL}/signatures/client/${clientId}`);
        if (res.ok) {
          const sigReqs = await res.json();
          const map: Record<string, any> = {};
          sigReqs.forEach((s: any) => { map[s._id || s.id] = s; });
          setClientSignatureRequests(map);
        }
      } catch { /* ignore */ }
    }
  };

  const handleSendForSign = async () => {
    if (!filesClientId || !signFile) return;

    const client = clients.find(c => c.id === filesClientId);
    if (!client?.email) {
      toast({ title: t('clients.filesModal.noEmailWarning'), variant: 'destructive' });
      return;
    }

    setIsSendingSign(true);
    try {
      const formData = new FormData();
      formData.append('file', signFile);
      formData.append('clientId', filesClientId);
      if (signFileName) formData.append('fileName', signFileName);
      if (signDescription) formData.append('description', signDescription);

      const res = await authFetch(`${API_URL}/signatures/upload-sign`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        toast({ title: t('signature.sent') });
        setShowSignUploadForm(false);
        setSignFile(null);
        setSignFileName('');
        setSignDescription('');
        // Reload files & signature requests
        await openClientFiles(filesClientId);
      } else {
        const data = await res.json();
        if (data.error === 'NO_CLIENT_EMAIL') {
          toast({ title: t('clients.filesModal.noEmailWarning'), variant: 'destructive' });
        } else {
          toast({ title: data.error || t('common.error'), variant: 'destructive' });
        }
      }
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    } finally {
      setIsSendingSign(false);
    }
  };

  const openClientFile = async (clientId: string, fileId: string) => {
    try {
      const res = await authFetch(`${API_URL}/clients/${clientId}/files/${fileId}`);
      if (!res.ok) throw new Error('Error');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    }
  };

  const openSummary = (client: Client) => {
    setSummaryClientId(client.id);
    setSummaryText(client.summary || "");
    setIsEditingSummary(false);
  };

  const openCalculos = async (clientId: string) => {
    try {
      const res = await authFetch(`${CALC_API_URL}/calculos?clientId=${clientId}`);
      if (res.ok) {
        const data = await res.json();
        setCalculosList(data);
        setShowCalculos(clientId);
      }
    } catch (e) {
      console.error("Error al cargar cálculos:", e);
    }
  };

  const deleteCalculo = async (id: string) => {
    if (!confirm(t('clients.deleteCalcConfirm'))) return;
    try {
      const res = await authFetch(`${CALC_API_URL}/calculos/${id}`, { method: "DELETE" });
      if (res.ok) {
        setCalculosList(prev => prev.filter((c: any) => c.id !== id));
      }
    } catch (e) {
      console.error("Error al eliminar cálculo:", e);
    }
  };

  const saveSummary = async () => {
    if (!summaryClientId) return;

    try {
      const formData = new FormData();
      const client = clients.find(c => c.id === summaryClientId);
      if (!client) return;

      formData.append('name', client.name);
      formData.append('email', client.email);
      formData.append('phone', client.phone);
      formData.append('summary', summaryText);

      const response = await authFetch(`${API_URL}/clients/${summaryClientId}`, {
        method: 'PUT',
        body: formData,
      });

      if (response.ok) {
        await loadClients();
        setIsEditingSummary(false);
      } else {
        toast({ title: t('clients.errorSummary'), variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error:', error);
      toast({ title: t('clients.errorSummary'), variant: 'destructive' });
    }
  };

  const openNotes = (client: Client) => {
    setNotesClientId(client.id);
    setNotesText(client.notes || "");
  };

  const saveNotes = async () => {
    if (!notesClientId) return;
    setIsSavingNotes(true);
    try {
      const response = await authFetch(`${API_URL}/clients/${notesClientId}/notes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notesText }),
      });
      if (response.ok) {
        await loadClients();
        toast({ title: t('clients.notesModal.saved') });
      } else {
        toast({ title: t('common.error'), variant: 'destructive' });
      }
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    } finally {
      setIsSavingNotes(false);
    }
  };

  // ── TIMER FUNCTIONS ──
  const openTimer = (clientId: string) => {
    if (activeTimerIdRef.current === clientId) {
      // Same client — just reopen modal, keep timer state
      setTimerClientId(clientId);
      return;
    }
    // Different client or no timer active — reset
    if (timerRef.current) clearInterval(timerRef.current);
    setTimerRunning(false);
    setTimerSeconds(0);
    activeTimerIdRef.current = null;
    setTimerClientId(clientId);
  };

  const closeTimerModal = () => {
    setTimerClientId(null);
  };

  const startTimer = () => {
    setTimerRunning(true);
    activeTimerIdRef.current = timerClientId;
    timerStartedAtRef.current = Date.now();
    sessionStorage.setItem('timerClientId', timerClientId || '');
    sessionStorage.setItem('timerStartedAt', String(Date.now()));
    sessionStorage.setItem('timerBaseSeconds', '0');
    timerRef.current = setInterval(() => {
      const startedAt = timerStartedAtRef.current;
      const base = parseInt(sessionStorage.getItem('timerBaseSeconds') || '0', 10);
      if (startedAt) setTimerSeconds(Math.floor((Date.now() - startedAt) / 1000) + base);
    }, 1000);
  };

  const pauseTimer = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimerRunning(false);
    const clientId = activeTimerIdRef.current || timerClientId;
    if (timerSeconds === 0 || !clientId) return;
    const now = new Date();
    const entry = {
      duration: timerSeconds,
      date: now.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      time: now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
    };
    setTimerSeconds(0);
    activeTimerIdRef.current = null;
    timerStartedAtRef.current = null;
    sessionStorage.removeItem('timerClientId');
    sessionStorage.removeItem('timerStartedAt');
    sessionStorage.removeItem('timerBaseSeconds');
    try {
      const accountId = sessionStorage.getItem('accountId') || '';
      await authFetch(`${API_URL}/clients/${clientId}/timer-entries`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...entry, accountId }),
      });
      await loadClients();
    } catch { /* silent */ }
  };

  const deleteTimerEntry = async (entryId: string) => {
    if (!timerClientId) return;
    try {
      await authFetch(`${API_URL}/clients/${timerClientId}/timer-entries/${entryId}`, { method: 'DELETE' });
      await loadClients();
    } catch { /* silent */ }
  };

  const formatDuration = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // ── INVOICE FUNCTIONS ──
  const loadInvoiceSettings = async () => {
    try {
      const accountId = sessionStorage.getItem('accountId') || '';
      const res = await authFetch(`${API_URL}/invoice-settings?accountId=${accountId}`);
      if (res.ok) {
        const data = await res.json();
        setInvoiceSettings({ firmName: data.firmName || '', firmAddress: data.firmAddress || '', firmPhone: data.firmPhone || '', firmNIF: data.firmNIF || '', firmInfo: data.firmInfo || '', fiscalTerritory: data.fiscalTerritory || 'comun', paymentMethod: data.paymentMethod || '', defaultTaxRate: data.defaultTaxRate ?? 21 });
        setInvoiceTaxRate(data.defaultTaxRate ?? 21);
      }
    } catch { /* silent */ }
  };

  const openCreateInvoice = async () => {
    await loadInvoiceSettings();
    setEditingInvoice(null);
    setInvoiceLines([]);
    setSelectedTimerEntries([]);
    setCalcPricePerHour('');
    setCalcResult(null);
    setShowCreateInvoice(true);
  };

  const addInvoiceLine = () => {
    setInvoiceLines(prev => [...prev, { id: Date.now().toString(), concept: '', quantity: 1, price: 0, subtotal: 0 }]);
  };

  const updateInvoiceLine = (id: string, field: string, value: string | number) => {
    setInvoiceLines(prev => prev.map(l => {
      if (l.id !== id) return l;
      const updated = { ...l, [field]: value };
      updated.subtotal = Math.round(updated.quantity * updated.price * 100) / 100;
      return updated;
    }));
  };

  const removeInvoiceLine = (id: string) => {
    setInvoiceLines(prev => prev.filter(l => l.id !== id));
  };

  const calculateTimePrice = () => {
    const client = clients.find(c => c.id === timerClientId);
    if (!client?.timerEntries) return;
    const selected = client.timerEntries.filter(e => selectedTimerEntries.includes(e.id));
    const totalSecs = selected.reduce((sum, e) => sum + e.duration, 0);
    const totalHours = totalSecs / 3600;
    const priceH = parseFloat(calcPricePerHour) || 0;
    const total = Math.round(totalHours * priceH * 100) / 100;
    setCalcResult(`${totalHours.toFixed(2)}h × ${priceH.toFixed(2)} ${cSym}/h = ${total.toFixed(2)} ${cSym}`);
  };

  const toggleAllTimerEntries = () => {
    const client = clients.find(c => c.id === timerClientId);
    if (!client?.timerEntries) return;
    if (selectedTimerEntries.length === client.timerEntries.length) {
      setSelectedTimerEntries([]);
    } else {
      setSelectedTimerEntries(client.timerEntries.map(e => e.id));
    }
  };

  const saveInvoice = async () => {
    if (!timerClientId) return;
    const accountId = sessionStorage.getItem('accountId') || '';
    const country = sessionStorage.getItem('country') || 'ES';
    // Save settings first
    try {
      await authFetch(`${API_URL}/invoice-settings`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, ...invoiceSettings }),
      });
    } catch { /* silent */ }
    // Create invoice
    try {
      const res = await authFetch(`${API_URL}/clients/${timerClientId}/invoices`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          firmName: invoiceSettings.firmName,
          firmAddress: invoiceSettings.firmAddress,
          firmPhone: invoiceSettings.firmPhone,
          firmNIF: invoiceSettings.firmNIF,
          firmInfo: invoiceSettings.firmInfo,
          fiscalTerritory: invoiceSettings.fiscalTerritory,
          country,
          paymentMethod: invoiceSettings.paymentMethod,
          taxRate: invoiceTaxRate,
          lines: invoiceLines,
        }),
      });
      if (res.ok) {
        const invoice = await res.json();
        setShowCreateInvoice(false);
        setViewInvoice(invoice);
        toast({ title: t('clients.invoice.created') });
      } else {
        toast({ title: t('common.error'), variant: 'destructive' });
      }
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    }
  };

  const loadClientInvoices = async (clientId: string) => {
    try {
      const res = await authFetch(`${API_URL}/clients/${clientId}/invoices`);
      if (res.ok) {
        const data = await res.json();
        setClientInvoices(data);
        setShowInvoicesList(true);
      }
    } catch { /* silent */ }
  };

  const loadEmailAccounts = async () => {
    try {
      const accountId = sessionStorage.getItem('accountId') || '';
      const res = await authFetch(`${API_URL}/email-accounts?accountId=${accountId}`);
      if (res.ok) setEmailAccounts(await res.json());
    } catch { /* silent */ }
  };

  const openSendInvoice = async (invoice: InvoiceData) => {
    await loadEmailAccounts();
    setSelectedEmailAccountId(null);
    setShowSendInvoice(invoice);
  };

  const sendInvoice = async () => {
    if (!showSendInvoice || !selectedEmailAccountId) return;
    setIsSendingInvoice(true);
    try {
      // Generate PDF from preview
      const el = invoicePreviewRef.current;
      if (!el) throw new Error('No preview element');
      const html2pdfMod = await import('html2pdf.js');
      const html2pdf = html2pdfMod.default;
      const elHeight = el.scrollHeight;
      const pdfBlob: Blob = await html2pdf().set({
        margin: 10, filename: `Factura_${showSendInvoice.invoiceNumber}.pdf`,
        html2canvas: { scale: 2, useCORS: true, scrollY: 0, height: elHeight, windowHeight: elHeight },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css'] },
      } as any).from(el).outputPdf('blob');
      // Convert to base64
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(pdfBlob);
      });
      const accountId = sessionStorage.getItem('accountId') || '';
      const res = await authFetch(`${API_URL}/invoices/${showSendInvoice.id}/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, cuentaCorreoId: selectedEmailAccountId, pdfBase64: base64, message: invoiceMessage || undefined }),
      });
      if (res.ok) {
        toast({ title: t('clients.invoice.sent') });
        setShowSendInvoice(null);
        setInvoiceMessage('');
        setShowMessageField(false);
      } else {
        const err = await res.json();
        toast({ title: err.error || t('common.error'), variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: e.message || t('common.error'), variant: 'destructive' });
    } finally {
      setIsSendingInvoice(false);
    }
  };

  const printInvoice = async () => {
    const el = invoicePreviewRef.current;
    if (!el) return;
    const html2pdfMod = await import('html2pdf.js');
    const html2pdf = html2pdfMod.default;
    const elHeight = el.scrollHeight;
    html2pdf().set({
      margin: 10, filename: `Factura_${viewInvoice?.invoiceNumber || showSendInvoice?.invoiceNumber || 'factura'}.pdf`,
      html2canvas: { scale: 2, useCORS: true, scrollY: 0, height: elHeight, windowHeight: elHeight },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css'] },
    } as any).from(el).save();
  };

  // Add email account from invoice send modal
  const addEmailAccount = async () => {
    if (!addEmailForm.correo.trim() || !addEmailForm.password.trim()) return;
    setIsAddingEmail(true);
    try {
      const accountId = sessionStorage.getItem('accountId') || '';
      const res = await authFetch(`${API_URL}/automatizaciones/cuentas-correo`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, ...addEmailForm }),
      });
      if (res.ok) {
        toast({ title: t('clients.invoice.emailAdded') });
        setShowAddEmail(false);
        setAddEmailForm({ plataforma: 'gmail', correo: '', password: '' });
        await loadEmailAccounts();
      } else {
        toast({ title: t('common.error'), variant: 'destructive' });
      }
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    } finally {
      setIsAddingEmail(false);
    }
  };

  // Delete invoice
  const deleteInvoice = async (invoice: InvoiceData) => {
    try {
      const accountId = sessionStorage.getItem('accountId') || '';
      const res = await authFetch(`${API_URL}/invoices/${invoice.id}?accountId=${encodeURIComponent(accountId)}`, { method: 'DELETE' });
      if (res.ok) {
        toast({ title: t('clients.invoice.deleted') });
        setClientInvoices(prev => prev.filter(i => i.id !== invoice.id));
        setInvoiceToDelete(null);
        if (viewInvoice?.id === invoice.id) setViewInvoice(null);
      } else {
        toast({ title: t('common.error'), variant: 'destructive' });
      }
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    }
  };

  // Open edit invoice (reuse create form with existing data)
  const openEditInvoice = (invoice: InvoiceData) => {
    setEditingInvoice(invoice);
    setInvoiceSettings(prev => ({
      firmName: invoice.firmName,
      firmAddress: invoice.firmAddress,
      firmPhone: invoice.firmPhone,
      firmNIF: invoice.firmNIF || prev.firmNIF || '',
      firmInfo: invoice.firmInfo || prev.firmInfo || '',
      fiscalTerritory: prev.fiscalTerritory || 'comun',
      paymentMethod: invoice.paymentMethod,
      defaultTaxRate: invoice.taxRate,
    }));
    setInvoiceTaxRate(invoice.taxRate);
    setInvoiceLines(invoice.lines.map(l => ({ ...l })));
    setSelectedTimerEntries([]);
    setCalcPricePerHour('');
    setCalcResult(null);
    setShowInvoicesList(false);
    setShowCreateInvoice(true);
  };

  // Update invoice
  const updateExistingInvoice = async () => {
    if (!editingInvoice) return;
    const accountId = sessionStorage.getItem('accountId') || '';
    try {
      const res = await authFetch(`${API_URL}/invoices/${editingInvoice.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          firmName: invoiceSettings.firmName,
          firmAddress: invoiceSettings.firmAddress,
          firmPhone: invoiceSettings.firmPhone,
          paymentMethod: invoiceSettings.paymentMethod,
          taxRate: invoiceTaxRate,
          lines: invoiceLines,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setShowCreateInvoice(false);
        setEditingInvoice(null);
        setViewInvoice(updated);
        toast({ title: t('clients.invoice.updated') });
      } else {
        toast({ title: t('common.error'), variant: 'destructive' });
      }
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    }
  };

  // Drag & Drop handlers para formulario
  const handleFormDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingForm(true);
  };

  const handleFormDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingForm(false);
  };

  const handleFormDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleFormDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingForm(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      setFormFiles((prev) => [...prev, ...Array.from(files)]);
    }
  };

  // Lyri chat functions
  const loadClientChats = async (clientId: string) => {
    try {
      const response = await authFetch(`${API_URL}/chats?clientId=${clientId}`);
      if (response.ok) {
        const data = await response.json();
        setLyriChats(data);
        // Solo establecer el primer chat si NO hay uno activo actualmente
        if (data.length > 0 && !activeLyriChatId) {
          setActiveLyriChatId(data[0].id);
        }
        // Si el chat activo ya no existe en la lista, seleccionar el primero
        if (activeLyriChatId && !data.find((c: any) => c.id === activeLyriChatId)) {
          setActiveLyriChatId(data.length > 0 ? data[0].id : null);
        }
      }
    } catch (error) {
      console.error('Error al cargar chats:', error);
    }
  };

  const openLyri = (clientId: string) => {
    setLyriClientId(clientId);
    setLyriInput("");
  };

  const cancelLyriJob = () => {
    lyriCancelStream();
    setIsSendingMessage(false);
  };

  const sendLyriMessage = async () => {
    if (!lyriInput.trim() || !activeLyriChatId || !lyriClientId || isSendingMessage) return;
    
    const userContent = lyriInput.trim();
    const userMessageId = Date.now().toString();
    
    // Añadir mensaje del usuario inmediatamente a la UI
    setLyriChats(prev => prev.map(chat => 
      chat.id === activeLyriChatId
        ? { ...chat, messages: [...chat.messages, { id: userMessageId, role: 'user' as const, content: userContent }] }
        : chat
    ));
    
    setLyriInput("");
    setIsSendingMessage(true);

    try {
      await lyriStartStream({
        endpoint: "/chats/message/stream",
        body: {
          clientId: lyriClientId,
          chatId: activeLyriChatId,
          content: userContent
        },
        onDone: (fullText) => {
          setLyriChats(prev => prev.map(chat =>
            chat.id === activeLyriChatId
              ? { ...chat, messages: [...chat.messages, { id: `ai-${Date.now()}`, role: 'assistant' as const, content: fullText }] }
              : chat
          ));
          setIsSendingMessage(false);
        },
      });
    } catch (error) {
      console.error('Error:', error);
      toast({ title: t('clients.errorSendMsg'), variant: 'destructive' });
      setLyriChats(prev => prev.map(chat => 
        chat.id === activeLyriChatId
          ? { ...chat, messages: chat.messages.filter(m => m.id !== userMessageId) }
          : chat
      ));
      setLyriInput(userContent);
      setIsSendingMessage(false);
    }
  };

  const createNewLyriChat = async () => {
    if (!lyriClientId) return;

    try {
      const response = await authFetch(`${API_URL}/chats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: lyriClientId,
          title: `${t("clients.lyraModal.newChat")} - ${new Date().toLocaleDateString(i18n.language)}`
        })
      });

      if (response.ok) {
        const newChat = await response.json();
        setLyriChats((prev) => [newChat, ...prev]);
        setActiveLyriChatId(newChat.id);
        setShowChatSelector(false);
      }
    } catch (error) {
      console.error('Error al crear chat:', error);
      toast({ title: t('clients.errorCreate'), variant: 'destructive' });
    }
  };

  const deleteLyriChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!confirm(t('clients.lyraModal.deleteChat') + '?')) return;

    try {
      const response = await authFetch(`${API_URL}/chats/${chatId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        // Recargar chats
        if (lyriClientId) {
          await loadClientChats(lyriClientId);
        }
        // Si era el chat activo, limpiar selección
        if (activeLyriChatId === chatId) {
          setActiveLyriChatId(null);
        }
      } else {
        toast({ title: t('clients.errorDelete'), variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error al eliminar chat:', error);
      toast({ title: t('clients.errorDelete'), variant: 'destructive' });
    }
  };

  const closeLyri = async () => {
    if (!lyriClientId) return;

    try {
      // Eliminar chats vacíos antes de cerrar
      await authFetch(`${API_URL}/chats/empty/${lyriClientId}`, {
        method: 'DELETE'
      });
    } catch (error) {
      console.error('Error al limpiar chats vacíos:', error);
    } finally {
      // Cerrar modal independientemente de si falla la limpieza
      setLyriClientId(null);
      setActiveLyriChatId(null);
      setShowChatSelector(false);
    }
  };

  const activeLyriChat = lyriChats.find((c) => c.id === activeLyriChatId);

  // Filtering
  const filteredClients = clients.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "automaticos" ? c.autoCreated === true : (statusFilter === "todos" || c.status === statusFilter);
    const matchesSubaccount = userType === 'main' || c.assignedSubaccountId === userId;
    return matchesSearch && matchesStatus && matchesSubaccount;
  });

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-foreground">{t('clients.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('clients.count', {count: clients.length})}</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity self-start sm:self-auto">
          <Plus className="h-4 w-4" /> {t('clients.new')}
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('clients.search')}
            className="w-full bg-accent/50 border border-border rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="flex items-center gap-1 bg-accent/50 border border-border rounded-md p-0.5 overflow-x-auto">
          {([
            { key: "todos" as const, label: t('clients.statusAll') },
            { key: "abierto" as const, label: t('clients.statusOpen') },
            { key: "finalizado" as const, label: t('clients.statusClosed') },
            { key: "automaticos" as const, label: t('clients.statusAutomatic') },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap ${statusFilter === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Client List */}
      <div className="space-y-3">
        {filteredClients.map((client, index) => (
          <div 
            key={client.id} 
            className={`bg-card border border-border rounded-lg p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-3 ${isVisible ? 'animate-slide-up' : 'opacity-0'}`}
            style={{ animationDelay: `${index * 75}ms` }}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-medium text-foreground">{client.name}</h3>
                {client.clientType && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    client.clientType === "empresa"
                      ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                      : client.clientType === "autonomo"
                        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  }`}>
                    {client.clientType === "empresa" ? t('clients.typeEmpresa') : client.clientType === "autonomo" ? t('clients.typeAutonomo') : t('clients.typeAsalariado')}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 items-center">
                <span className="text-xs text-muted-foreground truncate">{client.email}</span>
                <span className="text-xs text-muted-foreground">{client.phone}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Status selector */}
              <div className="relative" data-status-dd>
                <button
                  onClick={() => setOpenStatusDropdown(openStatusDropdown === client.id ? null : client.id)}
                  className={`text-xs font-medium border rounded-full px-2.5 py-1 flex items-center gap-1 transition-colors ${
                    client.status === 'abierto'
                      ? 'bg-green-500/15 border-green-500/30 text-green-600 dark:text-green-400'
                      : 'bg-red-500/15 border-red-500/30 text-red-600 dark:text-red-400'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${client.status === 'abierto' ? 'bg-green-500' : 'bg-red-500'}`} />
                  {client.status === 'abierto' ? t('clients.statusOpen') : t('clients.statusClosed')}
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </button>
                {openStatusDropdown === client.id && (
                  <div className="absolute z-50 top-full mt-1 left-0 min-w-[130px] bg-card border border-border rounded-lg shadow-lg py-1 animate-in fade-in-0 zoom-in-95 duration-100">
                    <button
                      onClick={() => { updateClientStatus(client.id, 'abierto'); setOpenStatusDropdown(null); }}
                      className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-accent transition-colors ${client.status === 'abierto' ? 'font-semibold' : ''}`}
                    >
                      <span className="h-2 w-2 rounded-full bg-green-500" />
                      <span className="text-green-600 dark:text-green-400">{t('clients.statusOpen')}</span>
                    </button>
                    <button
                      onClick={() => { updateClientStatus(client.id, 'finalizado'); setOpenStatusDropdown(null); }}
                      className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-accent transition-colors ${client.status === 'finalizado' ? 'font-semibold' : ''}`}
                    >
                      <span className="h-2 w-2 rounded-full bg-red-500" />
                      <span className="text-red-600 dark:text-red-400">{t('clients.statusClosed')}</span>
                    </button>
                  </div>
                )}
              </div>
              {/* Subaccount selector - only visible for main accounts */}
              {userType === 'main' && (
                <div className="relative" data-sub-dd>
                  <button
                    onClick={() => setOpenSubDropdown(openSubDropdown === client.id ? null : client.id)}
                    className={`text-xs font-medium border rounded-full px-2.5 py-1 flex items-center gap-1 transition-colors ${
                      client.assignedSubaccountId
                        ? 'bg-blue-500/15 border-blue-500/30 text-blue-600 dark:text-blue-400'
                        : 'bg-muted border-border text-muted-foreground'
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${client.assignedSubaccountId ? 'bg-blue-500' : 'bg-muted-foreground/40'}`} />
                    {client.assignedSubaccountId
                      ? subaccounts.find(s => s.id === client.assignedSubaccountId)?.name || t('clients.unassigned')
                      : t('clients.unassigned')
                    }
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </button>
                  {openSubDropdown === client.id && (
                    <div className="absolute z-50 top-full mt-1 left-0 min-w-[150px] bg-card border border-border rounded-lg shadow-lg py-1 animate-in fade-in-0 zoom-in-95 duration-100 max-h-48 overflow-y-auto">
                      <button
                        onClick={() => { assignClientToSubaccount(client.id, ''); setOpenSubDropdown(null); }}
                        className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-accent transition-colors ${!client.assignedSubaccountId ? 'font-semibold' : ''}`}
                      >
                        <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                        <span className="text-muted-foreground">{t('clients.unassigned')}</span>
                      </button>
                      {subaccounts.map((sub) => (
                        <button
                          key={sub.id}
                          onClick={() => { assignClientToSubaccount(client.id, sub.id); setOpenSubDropdown(null); }}
                          className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-accent transition-colors ${client.assignedSubaccountId === sub.id ? 'font-semibold' : ''}`}
                        >
                          <span className="h-2 w-2 rounded-full bg-blue-500" />
                          <span className="text-blue-600 dark:text-blue-400">{sub.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <button onClick={() => openLyri(client.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent hover:bg-accent/80 text-foreground text-xs font-medium transition-colors">
                <MessageSquare className="h-3.5 w-3.5" /> {t('clients.actions.talkToLyra')}
              </button>
              <button onClick={() => openClientFiles(client.id)} className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" title={t('clients.actions.files')}>
                <FolderOpen className="h-4 w-4" />
              </button>
              <button onClick={() => openSummary(client)} className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" title={t('clients.actions.info')}>
                <Info className="h-4 w-4" />
              </button>
              <button onClick={() => openNotes(client)} className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" title={t('clients.actions.notes')}>
                <StickyNote className="h-4 w-4" />
              </button>
              <button onClick={() => openTimer(client.id)} className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" title={t('clients.actions.timer')}>
                <Timer className="h-4 w-4" />
              </button>
              <button onClick={() => openEdit(client)} className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" title={t('clients.actions.edit')}>
                <Pencil className="h-4 w-4" />
              </button>
              <button onClick={() => confirmRemove(client.id)} className="p-2 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title={t('clients.actions.delete')}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
        {filteredClients.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">{t('clients.noResults')}</p>
        )}
      </div>

      {/* New/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowForm(false)}>
          <div className="bg-card border border-border rounded-lg w-[95vw] max-w-lg p-4 md:p-6 shadow-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-foreground">{editingClient ? t('clients.edit') : t('clients.new')}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-accent rounded"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-4">
              {/* Tipo de cliente — solo al crear */}
              {!editingClient && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.clientType')}</label>
                <div className="flex gap-2">
                  {(["asalariado", "autonomo", "empresa"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setClientType(type)}
                      className={`flex-1 py-2 rounded-md text-sm font-medium border transition-colors ${
                        clientType === type
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-accent/50 border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {type === "asalariado" ? t('clients.typeAsalariado') : type === "autonomo" ? t('clients.typeAutonomo') : t('clients.typeEmpresa')}
                    </button>
                  ))}
                </div>
              </div>
              )}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.form.name')}</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.form.email')}</label>
                <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.form.phone')}</label>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.form.summary')}</label>
                <textarea 
                  value={form.summary} 
                  onChange={(e) => setForm({ ...form, summary: e.target.value })} 
                  rows={4}
                  placeholder={t('clients.form.summaryPlaceholder')}
                  className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                />
              </div>

              {/* Información fiscal */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowFiscalInfo(!showFiscalInfo)}
                  className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                >
                  <span>{showFiscalInfo ? "▲" : "▼"}</span>
                  {t('clients.fiscalInfo')}
                </button>
              </div>

              {showFiscalInfo && (
                <div className="border border-border rounded-lg p-4 space-y-4 bg-accent/20">
                  
                  {/* ── IDENTIFICATION ── */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{t('clients.identification')}</p>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">{clientType === "empresa" ? (cf?.taxIdCompanyLabel || t('clients.taxId')) : (cf?.taxIdLabel || t('clients.taxId'))}</label>
                        <input value={fiscalInfo.nif} onChange={(e) => setFiscalInfo({ ...fiscalInfo, nif: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" placeholder={cf?.taxIdPlaceholder || ""} />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">{cf?.regionLabel || t('clients.region')}</label>
                        <select value={fiscalInfo.comunidadAutonoma} onChange={(e) => setFiscalInfo({ ...fiscalInfo, comunidadAutonoma: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                          <option value="">{t('common.select')}...</option>
                          {(cf?.regions || []).map((r: string) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                  
                  {/* ── PERSONAL DATA ── */}
                  {(clientType === "asalariado" || clientType === "autonomo") && (
                    <>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{t('clients.personalData')}</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.dateOfBirth')}</label>
                            <input type="date" value={fiscalInfo.fechaNacimiento} onChange={(e) => setFiscalInfo({ ...fiscalInfo, fechaNacimiento: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.maritalStatus')}</label>
                            <select value={fiscalInfo.estadoCivil} onChange={(e) => setFiscalInfo({ ...fiscalInfo, estadoCivil: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                              <option value="">{t('common.select')}...</option>
                              <option value="soltero">{t('clients.single')}</option>
                              <option value="casado">{t('clients.married')}</option>
                              <option value="divorciado">{t('clients.divorced')}</option>
                              <option value="viudo">{t('clients.widowed')}</option>
                              <option value="pareja">{t('clients.civilPartnership')}</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.dependentChildren')}</label>
                            <input type="number" min="0" value={fiscalInfo.numHijos} onChange={(e) => setFiscalInfo({ ...fiscalInfo, numHijos: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" placeholder="0" />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.disability')}</label>
                            <select value={fiscalInfo.discapacidad} onChange={(e) => setFiscalInfo({ ...fiscalInfo, discapacidad: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                              <option value="">No</option>
                              <option value="si">{t('clients.yes')}</option>
                            </select>
                          </div>
                        </div>
                        {fiscalInfo.discapacidad === "si" && (
                          <div className="mt-3">
                            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.disabilityPct')}</label>
                            <input type="number" min="0" max="100" value={fiscalInfo.pctDiscapacidad} onChange={(e) => setFiscalInfo({ ...fiscalInfo, pctDiscapacidad: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" placeholder="%" />
                          </div>
                        )}
                      </div>
                      {clientType === "asalariado" && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{t('clients.workData')}</p>
                          <div className="space-y-3">
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.contractType')}</label>
                              <select value={fiscalInfo.tipoContrato} onChange={(e) => setFiscalInfo({ ...fiscalInfo, tipoContrato: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                                <option value="">{t('common.select')}...</option>
                                {(cf?.contractTypes || []).map((ct: any) => (
                                  <option key={ct.value} value={ct.value}>{ct.label}</option>
                                ))}
                              </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.irpfDeclarationLabel')}</label>
                                <select value={fiscalInfo.declaracionConjunta} onChange={(e) => setFiscalInfo({ ...fiscalInfo, declaracionConjunta: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                                  <option value="">{t('common.select')}...</option>
                                  <option value="individual">{t('clients.individual')}</option>
                                  <option value="conjunta" disabled={!["casado","pareja",""].includes(fiscalInfo.estadoCivil)}>{t('clients.joint')}</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.capitalIncomeLabel')}</label>
                                <select value={fiscalInfo.rentasCapital} onChange={(e) => setFiscalInfo({ ...fiscalInfo, rentasCapital: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                                  <option value="no">No</option>
                                  <option value="si">{t('clients.yes')}</option>
                                </select>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  
                  {/* ── SELF-EMPLOYED ── */}
                  {clientType === "autonomo" && (
                    <>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{t('clients.registrationActivity')}</p>
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">{cf?.selfEmployedFields?.registrationLabel || t('clients.taxRegistrationDate')}</label>
                              <input type="date" value={fiscalInfo.fechaAltaHacienda} onChange={(e) => setFiscalInfo({ ...fiscalInfo, fechaAltaHacienda: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                            </div>
                            {cf?.selfEmployedFields?.hasSSRegistration && (
                              <div>
                                <label className="text-xs font-medium text-muted-foreground mb-1 block">{cf?.selfEmployedFields?.ssRegistrationLabel || t('clients.retaLabel')}</label>
                                <select value={fiscalInfo.altaRETA} onChange={(e) => setFiscalInfo({ ...fiscalInfo, altaRETA: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                                  <option value="">No</option>
                                  <option value="si">{t('clients.yes')}</option>
                                </select>
                              </div>
                            )}
                          </div>
                          {cf?.selfEmployedFields?.hasSSRegistration && fiscalInfo.altaRETA === "si" && (
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.retaDate')}</label>
                              <input type="date" value={fiscalInfo.fechaAltaRETA} onChange={(e) => setFiscalInfo({ ...fiscalInfo, fechaAltaRETA: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">{cf?.selfEmployedFields?.activityCodeLabel || t('clients.activityCode')}</label>
                              <input value={fiscalInfo.epigrafeIAE} onChange={(e) => setFiscalInfo({ ...fiscalInfo, epigrafeIAE: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" placeholder={cf?.selfEmployedFields?.activityCodePlaceholder || ""} />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">CNAE ({t('common.optional')})</label>
                              <input value={fiscalInfo.cnae} onChange={(e) => setFiscalInfo({ ...fiscalInfo, cnae: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" placeholder={cf?.selfEmployedFields?.activityCodePlaceholder || ""} />
                            </div>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.activityDescription')}</label>
                            <input value={fiscalInfo.descripcionActividad} onChange={(e) => setFiscalInfo({ ...fiscalInfo, descripcionActividad: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.multipleActivities')}</label>
                            <select value={fiscalInfo.variasActividades} onChange={(e) => setFiscalInfo({ ...fiscalInfo, variasActividades: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                              <option value="no">No</option>
                              <option value="si">{t('clients.yes')}</option>
                            </select>
                          </div>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{t('clients.taxRegime')}</p>
                        <div className="space-y-3">
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.incomeRegime')}</label>
                            <select value={fiscalInfo.regimenIRPF} onChange={(e) => setFiscalInfo({ ...fiscalInfo, regimenIRPF: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                              <option value="">{t('common.select')}...</option>
                              {(cf?.selfEmployedFields?.incomeRegimes || []).map((r: any) => (
                                <option key={r.value} value={r.value}>{r.label}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.vatRegime')}</label>
                            <select value={fiscalInfo.regimenIVA} onChange={(e) => setFiscalInfo({ ...fiscalInfo, regimenIVA: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                              <option value="">{t('common.select')}...</option>
                              {(cf?.vatRegimes || []).map((r: any) => (
                                <option key={r.value} value={r.value}>{r.label}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{t('clients.taxObligations')}</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.vatFilingFrequency')}</label>
                            <select value={fiscalInfo.frecuenciaIVA} onChange={(e) => setFiscalInfo({ ...fiscalInfo, frecuenciaIVA: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                              <option value="">{t('common.select')}...</option>
                              {(cf?.selfEmployedFields?.vatFilingFrequencies || []).map((freq: any) => (
                                <option key={freq.value} value={freq.value}>{freq.label}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.vatProRata')}</label>
                            <select value={(fiscalInfo as any)["prorrata"]} onChange={(e) => setFiscalInfo({ ...fiscalInfo, prorrata: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                              <option value="no">No</option>
                              <option value="si">{t('clients.yes')}</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.estimatedPayments')}</label>
                            <select value={(fiscalInfo as any)["modelo130"]} onChange={(e) => setFiscalInfo({ ...fiscalInfo, modelo130: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                              <option value="no">No</option>
                              <option value="si">{t('clients.yes')}</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.invoiceWithholdings')}</label>
                            <select value={(fiscalInfo as any)["retencionesFacturas"]} onChange={(e) => setFiscalInfo({ ...fiscalInfo, retencionesFacturas: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                              <option value="no">No</option>
                              <option value="si">{t('clients.yes')}</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.hasEmployees')}</label>
                            <select value={(fiscalInfo as any)["tieneTrabajadores"]} onChange={(e) => setFiscalInfo({ ...fiscalInfo, tieneTrabajadores: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                              <option value="no">No</option>
                              <option value="si">{t('clients.yes')}</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.intraEU')}</label>
                            <select value={(fiscalInfo as any)["operacionesIntracomunitarias"]} onChange={(e) => setFiscalInfo({ ...fiscalInfo, operacionesIntracomunitarias: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                              <option value="no">No</option>
                              <option value="si">{t('clients.yes')}</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.professionalWithholdings')}</label>
                            <select value={(fiscalInfo as any)["retencionesProfesionales"]} onChange={(e) => setFiscalInfo({ ...fiscalInfo, retencionesProfesionales: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                              <option value="no">No</option>
                              <option value="si">{t('clients.yes')}</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                  
                  {/* ── COMPANY ── */}
                  {clientType === "empresa" && (
                    <>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{t('clients.companyDetails')}</p>
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.companyType')}</label>
                              <select value={fiscalInfo.tipoSociedad} onChange={(e) => setFiscalInfo({ ...fiscalInfo, tipoSociedad: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                                <option value="">{t('common.select')}...</option>
                                {(cf?.companyTypes || []).map((ct: any) => (
                                  <option key={ct.value} value={ct.value}>{ct.label}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.numEmployees')}</label>
                              <input type="number" min="0" value={fiscalInfo.numEmpleados} onChange={(e) => setFiscalInfo({ ...fiscalInfo, numEmpleados: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" placeholder="0" />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.incorporationDate')}</label>
                              <input type="date" value={fiscalInfo.fechaConstitucion} onChange={(e) => setFiscalInfo({ ...fiscalInfo, fechaConstitucion: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.activityStartDate')}</label>
                              <input type="date" value={fiscalInfo.fechaInicioActividad} onChange={(e) => setFiscalInfo({ ...fiscalInfo, fechaInicioActividad: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                            </div>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1 block">{cf?.selfEmployedFields?.activityCodeLabel || t('clients.activityCode')}</label>
                            <input value={fiscalInfo.cnaeEmpresa} onChange={(e) => setFiscalInfo({ ...fiscalInfo, cnaeEmpresa: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" placeholder={cf?.selfEmployedFields?.activityCodePlaceholder || ""} />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.activityDescription')}</label>
                            <input value={fiscalInfo.descripcionActividadEmpresa} onChange={(e) => setFiscalInfo({ ...fiscalInfo, descripcionActividadEmpresa: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.multipleActivities')}</label>
                            <select value={fiscalInfo.variasActividadesEmpresa} onChange={(e) => setFiscalInfo({ ...fiscalInfo, variasActividadesEmpresa: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                              <option value="no">No</option>
                              <option value="si">{t('clients.yes')}</option>
                            </select>
                          </div>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{t('clients.corporateTax')}</p>
                        <div className="space-y-3">
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.taxType')}</label>
                            <select value={fiscalInfo.tipoIS} onChange={(e) => setFiscalInfo({ ...fiscalInfo, tipoIS: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                              <option value="">{t('common.select')}...</option>
                              {(cf?.companyTaxTypes || []).map((ct: any) => (
                                <option key={ct.value} value={ct.value}>{ct.label}</option>
                              ))}
                            </select>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.smallCompany')}</label>
                              <select value={(fiscalInfo as any)["reducidaDimension"]} onChange={(e) => setFiscalInfo({ ...fiscalInfo, reducidaDimension: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                                <option value="no">No</option>
                                <option value="si">{t('clients.yes')}</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.businessGroup')}</label>
                              <select value={(fiscalInfo as any)["grupoEmpresarial"]} onChange={(e) => setFiscalInfo({ ...fiscalInfo, grupoEmpresarial: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                                <option value="no">No</option>
                                <option value="si">{t('clients.yes')}</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.fiscalConsolidation')}</label>
                              <select value={(fiscalInfo as any)["consolidacionFiscal"]} onChange={(e) => setFiscalInfo({ ...fiscalInfo, consolidacionFiscal: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                                <option value="no">No</option>
                                <option value="si">{t('clients.yes')}</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.priorLosses')}</label>
                              <select value={(fiscalInfo as any)["perdidasAnteriores"]} onChange={(e) => setFiscalInfo({ ...fiscalInfo, perdidasAnteriores: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                                <option value="no">No</option>
                                <option value="si">{t('clients.yes')}</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.insolvency')}</label>
                              <select value={(fiscalInfo as any)["concurso"]} onChange={(e) => setFiscalInfo({ ...fiscalInfo, concurso: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                                <option value="no">No</option>
                                <option value="si">{t('clients.yes')}</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{t('clients.vatRegimeObligations')}</p>
                        <div className="space-y-3">
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.vatRegime')}</label>
                            <select value={fiscalInfo.regimenIVAEmpresa} onChange={(e) => setFiscalInfo({ ...fiscalInfo, regimenIVAEmpresa: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                              <option value="">{t('common.select')}...</option>
                              {(cf?.vatRegimes || []).map((r: any) => (
                                <option key={r.value} value={r.value}>{r.label}</option>
                              ))}
                            </select>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.vatProRata')}</label>
                              <select value={(fiscalInfo as any)["proEmpresa"]} onChange={(e) => setFiscalInfo({ ...fiscalInfo, proEmpresa: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                                <option value="no">No</option>
                                <option value="si">{t('clients.yes')}</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.intraEU')}</label>
                              <select value={(fiscalInfo as any)["intracomEmpresa"]} onChange={(e) => setFiscalInfo({ ...fiscalInfo, intracomEmpresa: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                                <option value="no">No</option>
                                <option value="si">{t('clients.yes')}</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.hasEmployees')}</label>
                              <select value={(fiscalInfo as any)["trabajadoresEmpresa"]} onChange={(e) => setFiscalInfo({ ...fiscalInfo, trabajadoresEmpresa: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                                <option value="no">No</option>
                                <option value="si">{t('clients.yes')}</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.withholdings')}</label>
                              <select value={(fiscalInfo as any)["retencionesModelo111"]} onChange={(e) => setFiscalInfo({ ...fiscalInfo, retencionesModelo111: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                                <option value="no">No</option>
                                <option value="si">{t('clients.yes')}</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.distributesDividends')}</label>
                              <select value={(fiscalInfo as any)["reparteDividendos"]} onChange={(e) => setFiscalInfo({ ...fiscalInfo, reparteDividendos: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                                <option value="no">No</option>
                                <option value="si">{t('clients.yes')}</option>
                              </select>
                            </div>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.vatFilingFrequency')}</label>
                            <select value={fiscalInfo.frecuenciaIVAEmpresa} onChange={(e) => setFiscalInfo({ ...fiscalInfo, frecuenciaIVAEmpresa: e.target.value })} className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                              <option value="">{t('common.select')}...</option>
                              {(cf?.selfEmployedFields?.vatFilingFrequencies || []).map((freq: any) => (
                                <option key={freq.value} value={freq.value}>{freq.label}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                  
                  {/* ── OBSERVATIONS ── */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.observations')}</label>
                    <textarea
                      value={fiscalInfo.observaciones}
                      onChange={(e) => setFiscalInfo({ ...fiscalInfo, observaciones: e.target.value })}
                      rows={3}
                      placeholder={t('clients.fiscalNotes')}
                      className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                    />
                  </div>
                  
                </div>
              )}
              {/* File upload */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('clients.form.files')}</label>
                <input type="file" ref={formFileRef} onChange={handleFormFiles} className="hidden" multiple />
                <div
                  onDragEnter={handleFormDragEnter}
                  onDragOver={handleFormDragOver}
                  onDragLeave={handleFormDragLeave}
                  onDrop={handleFormDrop}
                  onClick={() => formFileRef.current?.click()}
                  className={`flex items-center gap-2 text-sm border border-dashed rounded-md px-4 py-3 w-full justify-center cursor-pointer transition-colors ${
                    isDraggingForm 
                      ? 'border-primary bg-primary/10 text-primary' 
                      : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  }`}
                >
                  <Upload className="h-4 w-4" /> 
                  {isDraggingForm ? t('clients.form.dropFiles') : t('clients.form.uploadFiles')}
                </div>
                {formFiles.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {formFiles.map((f, i) => (
                      <div key={i} className="flex items-center justify-between text-xs bg-accent/50 rounded px-3 py-1.5">
                        <span className="text-foreground truncate">{f.name}</span>
                        <button onClick={() => setFormFiles((prev) => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive ml-2">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={save} disabled={isLoading} className="w-full bg-primary text-primary-foreground py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                {isLoading ? t('clients.form.saving') : editingClient ? t('clients.form.saveChanges') : t('clients.form.create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Files Modal */}
      {filesClientId && (
        <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => { setFilesClientId(null); setShowSignUploadForm(false); }}>
          <div className="bg-card border border-border rounded-lg w-full max-w-lg p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-foreground">{t('clients.filesModal.title')}</h2>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { setShowSignUploadForm(!showSignUploadForm); setSignFile(null); setSignFileName(''); setSignDescription(''); }}
                  className={`p-1.5 rounded transition-colors ${showSignUploadForm ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-muted-foreground hover:text-foreground'}`}
                  title={t('clients.filesModal.sendForSign')}
                >
                  <PenTool className="h-4 w-4" />
                </button>
                <button onClick={() => { setFilesClientId(null); setShowSignUploadForm(false); }} className="p-1 hover:bg-accent rounded"><X className="h-4 w-4" /></button>
              </div>
            </div>

            {/* Sign Upload Form */}
            {showSignUploadForm && (
              <div className="mb-4 p-4 border border-primary/30 bg-primary/5 rounded-lg space-y-3">
                <p className="text-sm font-medium text-foreground">{t('clients.filesModal.sendForSign')}</p>
                <input ref={signFileRef} type="file" accept=".pdf" onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    if (f.size > 50 * 1024 * 1024) {
                      toast({ title: t('clients.fileTooLarge'), variant: 'destructive' });
                      return;
                    }
                    setSignFile(f); if (!signFileName) setSignFileName(f.name.replace(/\.pdf$/i, ''));
                  }
                }} className="hidden" />
                <button
                  onClick={() => signFileRef.current?.click()}
                  className="flex items-center gap-2 text-sm border border-dashed border-border rounded-md px-4 py-2.5 w-full justify-center hover:bg-accent/50 transition-colors cursor-pointer"
                >
                  <Upload className="h-4 w-4" />
                  {signFile ? signFile.name : t('clients.filesModal.selectPdf')}
                </button>
                {signFile && (
                  <>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">{t('signature.documentName')}</label>
                      <input
                        value={signFileName}
                        onChange={(e) => setSignFileName(e.target.value)}
                        className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        placeholder={t('signature.documentName')}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">{t('signature.optionalMessage')}</label>
                      <input
                        value={signDescription}
                        onChange={(e) => setSignDescription(e.target.value)}
                        className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        placeholder={t('signature.optionalMessage')}
                      />
                    </div>
                    <button
                      onClick={handleSendForSign}
                      disabled={isSendingSign}
                      className="w-full bg-primary text-primary-foreground py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {isSendingSign ? t('signature.sending') : t('signature.send')}
                    </button>
                  </>
                )}
              </div>
            )}
            
            {/* Upload area with drag & drop */}
            <input
              ref={modalFileRef}
              type="file"
              multiple
              onChange={handleModalFiles}
              className="hidden"
            />
            <div
              onDragEnter={handleModalDragEnter}
              onDragLeave={handleModalDragLeave}
              onDragOver={handleModalDragOver}
              onDrop={handleModalDrop}
              onClick={() => modalFileRef.current?.click()}
              className={`flex items-center gap-2 text-sm border border-dashed rounded-md px-4 py-3 w-full justify-center mb-4 transition-colors cursor-pointer ${
                isDraggingFiles
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
              }`}
            >
              <Upload className="h-4 w-4" />
              {isDraggingFiles ? t('clients.filesModal.dropFile') : t('clients.filesModal.upload')}
            </div>

            <div className="space-y-2">
              {currentClientFiles.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">{t('clients.filesModal.noFiles')}</p>
              ) : (
                currentClientFiles.map((file) => {
                  const sigReq = file.signatureRequestId ? clientSignatureRequests[file.signatureRequestId] : null;
                  const sigStatus = sigReq?.status;
                  const sigBadge: Record<string, {icon: any; color: string; bg: string; label: string}> = {
                    sent: { icon: Mail, color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-900/30', label: t('signature.statusSent') },
                    pending: { icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-100 dark:bg-yellow-900/30', label: t('signature.statusPending') },
                    signed: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-100 dark:bg-green-900/30', label: t('signature.statusSigned') },
                    expired: { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900/30', label: t('signature.statusExpired') },
                  };
                  const badge = sigStatus ? sigBadge[sigStatus] : null;
                  const BadgeIcon = badge?.icon;
                  return (
                  <div key={file.id} className="flex items-center justify-between bg-accent/50 rounded-md px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                        {badge && BadgeIcon && (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${badge.bg} ${badge.color}`}>
                            <BadgeIcon className="h-3 w-3" />
                            {badge.label}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{file.date}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openClientFile(filesClientId, file.id)} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" title="Ver archivo">
                        <Eye className="h-4 w-4" />
                      </button>
                      <button onClick={() => removeFile(file.id)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Eliminar archivo">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-card border border-border rounded-lg w-[95vw] max-w-sm p-4 md:p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-foreground mb-2">{t('clients.deleteModal.title')}</h3>
            <p className="text-sm text-muted-foreground mb-6">
              {t('clients.deleteModal.message')}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 rounded-md border border-border hover:bg-accent text-sm text-foreground transition-colors"
              >
                {t('clients.deleteModal.cancel')}
              </button>
              <button
                onClick={remove}
                className="px-4 py-2 rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 text-sm transition-colors"
              >
                {t('clients.deleteModal.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary Modal */}
      {summaryClientId && (
        <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setSummaryClientId(null)}>
          <div className="bg-card border border-border rounded-lg w-[95vw] max-w-lg p-4 md:p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-foreground">{t('clients.summaryModal.title')}</h2>
                <button
                  onClick={() => { setSummaryClientId(null); openCalculos(summaryClientId!); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-md hover:bg-accent transition-colors"
                >
                  <Calculator className="h-3.5 w-3.5" />
                  {t('clients.calculations')}
                </button>
              </div>
              <button onClick={() => setSummaryClientId(null)} className="p-1 hover:bg-accent rounded">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4">
              {isEditingSummary ? (
                <>
                  <textarea
                    value={summaryText}
                    onChange={(e) => setSummaryText(e.target.value)}
                    rows={8}
                    className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                    placeholder={t('clients.summaryModal.placeholder')}
                  />
                  <button
                    onClick={saveSummary}
                    className="w-full bg-primary text-primary-foreground py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    {t('clients.summaryModal.save')}
                  </button>
                </>
              ) : (
                <>
                  <div className="bg-accent/50 rounded-md px-4 py-3 min-h-[200px]">
                    <p className="text-sm text-foreground whitespace-pre-wrap">
                      {summaryText || t('clients.summaryModal.noSummary')}
                    </p>
                  </div>
                  <button
                    onClick={() => setIsEditingSummary(true)}
                    className="w-full border border-border hover:bg-accent py-2 rounded-md text-sm font-medium text-foreground transition-colors"
                  >
                    {t('clients.summaryModal.edit')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── NOTES MODAL ── */}
      {notesClientId && (
        <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setNotesClientId(null)}>
          <div className="bg-card border border-border rounded-lg w-[95vw] max-w-lg p-4 md:p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <StickyNote className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-lg font-semibold text-foreground">
                  {t('clients.notesModal.title')} — {clients.find(c => c.id === notesClientId)?.name}
                </h2>
              </div>
              <button onClick={() => setNotesClientId(null)} className="p-1 hover:bg-accent rounded">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4">
              <textarea
                value={notesText}
                onChange={(e) => setNotesText(e.target.value)}
                rows={10}
                className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                placeholder={t('clients.notesModal.placeholder')}
              />
              <button
                onClick={saveNotes}
                disabled={isSavingNotes}
                className="w-full bg-primary text-primary-foreground py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {isSavingNotes ? t('clients.form.saving') : t('clients.notesModal.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TIMER MODAL ── */}
      {timerClientId && !showCreateInvoice && !viewInvoice && !showSendInvoice && !showInvoicesList && (() => {
        const timerClient = clients.find(c => c.id === timerClientId);
        const entries = timerClient?.timerEntries || [];
        return (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center" onClick={closeTimerModal}>
            <div className="bg-card border border-border rounded-lg w-[95vw] max-w-lg p-4 md:p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Timer className="h-5 w-5 text-muted-foreground" />
                  <h2 className="text-lg font-semibold text-foreground">{t('clients.timer.title')} — {timerClient?.name}</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => loadClientInvoices(timerClientId)} className="px-3 py-1.5 text-xs border border-border rounded-md hover:bg-accent transition-colors">
                    <FileText className="h-3.5 w-3.5 inline mr-1" />{t('clients.invoice.list')}
                  </button>
                  <button onClick={openCreateInvoice} className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity">
                    {t('clients.invoice.create')}
                  </button>
                  <button onClick={closeTimerModal} className="p-1 hover:bg-accent rounded">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {/* Cronómetro */}
              <div className="text-center mb-6">
                <p className="text-5xl font-mono font-bold text-foreground mb-4">{formatDuration(timerSeconds)}</p>
                <div className="flex justify-center gap-3">
                  {!timerRunning ? (
                    <button onClick={startTimer} className="flex items-center gap-2 px-6 py-2 border border-border rounded-md hover:bg-accent transition-colors text-foreground">
                      <Play className="h-4 w-4" /> {t('clients.timer.start')}
                    </button>
                  ) : (
                    <button onClick={pauseTimer} className="flex items-center gap-2 px-6 py-2 border border-border rounded-md hover:bg-accent transition-colors text-foreground">
                      <Pause className="h-4 w-4" /> {t('clients.timer.pause')}
                    </button>
                  )}
                </div>
              </div>
              {/* Lista de tiempos */}
              {entries.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2 font-medium">{t('clients.timer.entries')} ({entries.length})</p>
                  <div className={entries.length > 3 ? "max-h-[144px] overflow-y-auto" : ""}>
                    <div className="space-y-1.5">
                      {entries.slice().reverse().map(entry => (
                        <div key={entry.id} className="flex items-center justify-between px-3 py-2 bg-accent/50 rounded-md text-sm">
                          <span className="font-mono font-medium">{formatDuration(entry.duration)}</span>
                          <span className="text-muted-foreground">{entry.date} — {entry.time}</span>
                          <button onClick={() => deleteTimerEntry(entry.id)} className="p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── CREATE INVOICE MODAL ── */}
      {showCreateInvoice && timerClientId && (() => {
        const timerClient = clients.find(c => c.id === timerClientId);
        const entries = timerClient?.timerEntries || [];
        const baseAmount = invoiceLines.reduce((s, l) => s + l.subtotal, 0);
        const taxAmount = Math.round(baseAmount * invoiceTaxRate) / 100;
        const totalAmount = baseAmount + taxAmount;
        const userCountry = sessionStorage.getItem('country') || 'ES';
        const isSpain = userCountry === 'ES';
        const FORAL_TERRITORIES = ['bizkaia', 'gipuzkoa', 'araba', 'navarra'];
        const isForalTerritory = isSpain && FORAL_TERRITORIES.includes((invoiceSettings.fiscalTerritory || '').toLowerCase());
        return (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowCreateInvoice(false)}>
            <div className="bg-card border border-border rounded-lg w-[95vw] max-w-2xl shadow-lg max-h-[90vh] overflow-y-auto p-4 md:p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-foreground">{editingInvoice ? t('clients.invoice.editTitle') : t('clients.invoice.createTitle')}</h2>
                <button onClick={() => { setShowCreateInvoice(false); setEditingInvoice(null); }} className="p-1 hover:bg-accent rounded"><X className="h-4 w-4" /></button>
              </div>

              {/* Datos del despacho */}
              <div className="mb-6 p-4 border border-border rounded-lg space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('clients.invoice.firmData')}</p>
                <input value={invoiceSettings.firmName} onChange={e => setInvoiceSettings(s => ({ ...s, firmName: e.target.value }))} placeholder={t('clients.invoice.firmName')} className="w-full px-3 py-2 text-sm rounded-md border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                <input value={invoiceSettings.firmAddress} onChange={e => setInvoiceSettings(s => ({ ...s, firmAddress: e.target.value }))} placeholder={t('clients.invoice.firmAddress')} className="w-full px-3 py-2 text-sm rounded-md border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                <input value={invoiceSettings.firmPhone} onChange={e => setInvoiceSettings(s => ({ ...s, firmPhone: e.target.value }))} placeholder={t('clients.invoice.firmPhoneLabel')} className="w-full px-3 py-2 text-sm rounded-md border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                <textarea value={invoiceSettings.firmInfo} onChange={e => setInvoiceSettings(s => ({ ...s, firmInfo: e.target.value }))} placeholder={t('clients.invoice.firmInfo')} rows={2} className="w-full px-3 py-2 text-sm rounded-md border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
                {isSpain && (
                  <>
                    <input value={invoiceSettings.firmNIF} onChange={e => setInvoiceSettings(s => ({ ...s, firmNIF: e.target.value }))} placeholder={t('clients.invoice.firmNIF')} className="w-full px-3 py-2 text-sm rounded-md border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">{t('clients.invoice.fiscalTerritory')}</p>
                      <select value={invoiceSettings.fiscalTerritory} onChange={e => setInvoiceSettings(s => ({ ...s, fiscalTerritory: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-md border border-border bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                        <option value="comun">{t('clients.invoice.territoryComun')}</option>
                        <option value="bizkaia">Bizkaia</option>
                        <option value="gipuzkoa">Gipuzkoa</option>
                        <option value="araba">Álava / Araba</option>
                        <option value="navarra">Navarra</option>
                      </select>
                    </div>
                  </>
                )}
                <div>
                  <p className="text-xs text-muted-foreground mb-2">{t('clients.invoice.paymentSelect')}</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: 'transfer', label: t('clients.invoice.payTransfer') },
                      { value: 'card', label: t('clients.invoice.payCard') },
                      { value: 'cash', label: t('clients.invoice.payCash') },
                      { value: 'bizum', label: 'Bizum' },
                      { value: 'paypal', label: 'PayPal' },
                      { value: 'other', label: t('clients.invoice.payOther') },
                    ].map(opt => (
                      <button key={opt.value} type="button" onClick={() => setInvoiceSettings(s => ({ ...s, paymentMethod: opt.value }))}
                        className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${invoiceSettings.paymentMethod === opt.value ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Aviso TicketBAI */}
              {isForalTerritory && (
                <div className="mb-6 p-4 border border-amber-500/40 bg-amber-500/10 rounded-lg flex items-start gap-3">
                  <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-amber-700 dark:text-amber-400">{t('clients.invoice.ticketbaiWarning')}</p>
                </div>
              )}

              {/* Calculadora de tiempo */}
              {entries.length > 0 && (
                <div className="mb-6 p-4 border border-border rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('clients.invoice.timeCalc')}</p>
                    <button onClick={toggleAllTimerEntries} className="text-xs text-primary hover:underline">{t('clients.invoice.selectAll')}</button>
                  </div>
                  <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
                    {entries.slice().reverse().map(entry => (
                      <label key={entry.id} className="flex items-center gap-3 px-3 py-1.5 rounded-md hover:bg-accent/50 cursor-pointer text-sm">
                        <input type="checkbox" checked={selectedTimerEntries.includes(entry.id)} onChange={() => setSelectedTimerEntries(prev => prev.includes(entry.id) ? prev.filter(id => id !== entry.id) : [...prev, entry.id])} className="rounded border-border" />
                        <span className="font-mono">{formatDuration(entry.duration)}</span>
                        <span className="text-muted-foreground">{entry.date} — {entry.time}</span>
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="text-xs text-muted-foreground">{t('clients.invoice.pricePerHour', { currencySymbol: cSym })}</label>
                      <input type="number" value={calcPricePerHour} onChange={e => setCalcPricePerHour(e.target.value)} placeholder="0.00" className="w-full px-3 py-2 text-sm rounded-md border border-border bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                    </div>
                    <button onClick={calculateTimePrice} className="px-4 py-2 text-xs bg-accent hover:bg-accent/80 text-foreground rounded-md transition-colors whitespace-nowrap">
                      {t('clients.invoice.calcPrice')}
                    </button>
                  </div>
                  {calcResult && <p className="text-sm font-medium text-primary bg-primary/10 px-3 py-2 rounded-md">{calcResult}</p>}
                </div>
              )}

              {/* Líneas de factura */}
              <div className="mb-6 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('clients.invoice.lines')}</p>
                  <button onClick={addInvoiceLine} className="flex items-center gap-1 text-xs text-primary hover:underline"><Plus className="h-3 w-3" /> {t('clients.invoice.addLine')}</button>
                </div>
                {invoiceLines.length > 0 && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-[1fr_70px_90px_90px_32px] gap-2 text-xs text-muted-foreground font-medium px-1">
                      <span>{t('clients.invoice.concept')}</span>
                      <span className="text-center">{t('clients.invoice.qty')}</span>
                      <span className="text-right">{t('clients.invoice.price')}</span>
                      <span className="text-right">{t('clients.invoice.subtotal')}</span>
                      <span></span>
                    </div>
                    {invoiceLines.map(line => (
                      <div key={line.id} className="grid grid-cols-[1fr_70px_90px_90px_32px] gap-2 items-center">
                        <input value={line.concept} onChange={e => updateInvoiceLine(line.id, 'concept', e.target.value)} placeholder={t('clients.invoice.conceptPh')} className="px-2 py-1.5 text-sm rounded-md border border-border bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                        <input type="number" value={line.quantity || ''} onChange={e => updateInvoiceLine(line.id, 'quantity', parseFloat(e.target.value) || 0)} className="px-2 py-1.5 text-sm rounded-md border border-border bg-card text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring" />
                        <input type="number" value={line.price || ''} onChange={e => updateInvoiceLine(line.id, 'price', parseFloat(e.target.value) || 0)} placeholder="0.00" className="px-2 py-1.5 text-sm rounded-md border border-border bg-card text-foreground text-right focus:outline-none focus:ring-1 focus:ring-ring" />
                        <span className="text-sm text-right font-medium">{line.subtotal.toFixed(2)} {cSym}</span>
                        <button onClick={() => removeInvoiceLine(line.id)} className="p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* IVA y Totales */}
              <div className="mb-6 border-t border-border pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t('clients.invoice.baseAmount')}</span>
                  <span className="font-medium">{baseAmount.toFixed(2)} {cSym}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{t('clients.invoice.tax')}</span>
                    <input type="number" value={invoiceTaxRate} onChange={e => setInvoiceTaxRate(parseFloat(e.target.value) || 0)} className="w-16 px-2 py-1 text-xs rounded border border-border bg-card text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring" />
                    <span className="text-muted-foreground">%</span>
                  </div>
                  <span className="font-medium">{taxAmount.toFixed(2)} {cSym}</span>
                </div>
                <div className="flex justify-between text-lg font-bold pt-2 border-t border-border">
                  <span>{t('clients.invoice.total')}</span>
                  <span className="text-primary">{totalAmount.toFixed(2)} {cSym}</span>
                </div>
              </div>

              <button onClick={editingInvoice ? updateExistingInvoice : saveInvoice} disabled={invoiceLines.length === 0 || isForalTerritory} className="w-full bg-primary text-primary-foreground py-2.5 rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                {editingInvoice ? t('clients.invoice.update') : t('clients.invoice.create')}
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── INVOICES LIST MODAL ── */}
      {showInvoicesList && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowInvoicesList(false)}>
          <div className="bg-card border border-border rounded-lg w-[95vw] max-w-lg shadow-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">{t('clients.invoice.list')}</h2>
              <button onClick={() => setShowInvoicesList(false)} className="p-1 hover:bg-accent rounded"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {clientInvoices.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">{t('clients.invoice.noInvoices')}</p>
              ) : (
                <div className="space-y-2">
                  {clientInvoices.map(inv => (
                    <div key={inv.id} className="flex items-center gap-2 border border-border rounded-lg hover:bg-accent/50 transition-colors">
                      <button onClick={() => { setShowInvoicesList(false); setViewInvoice(inv); }} className="flex-1 flex items-center justify-between p-4 text-left">
                        <div>
                          <p className="text-sm font-medium text-foreground">{t('clients.invoice.number')} {inv.invoiceNumber}</p>
                          <p className="text-xs text-muted-foreground">{inv.date}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-primary">{inv.totalAmount.toFixed(2)} {cSym}</p>
                          {inv.sentAt && <p className="text-xs text-green-600">{t('clients.invoice.sentLabel')}</p>}
                        </div>
                      </button>
                      <div className="flex gap-1 pr-3">
                        <button onClick={() => openEditInvoice(inv)} className="p-1.5 hover:bg-accent rounded transition-colors" title={t('clients.invoice.edit')}>
                          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                        <button onClick={() => setInvoiceToDelete(inv)} className="p-1.5 hover:bg-destructive/10 rounded transition-colors" title={t('clients.invoice.delete')}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── VIEW INVOICE MODAL ── */}
      {viewInvoice && !showSendInvoice && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setViewInvoice(null)}>
          <div className="bg-white border border-border rounded-lg w-[95vw] max-w-3xl shadow-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Action bar */}
            <div className="sticky top-0 bg-white/90 backdrop-blur-sm border-b border-gray-200 px-6 py-3 flex justify-between items-center z-10">
              <div className="flex gap-2">
                <button onClick={printInvoice} className="flex items-center gap-2 px-4 py-1.5 text-xs bg-gray-900 text-white rounded hover:bg-gray-800 transition-colors">
                  <FileText className="h-3.5 w-3.5" /> {t('clients.invoice.printPdf')}
                </button>
                <button onClick={() => openSendInvoice(viewInvoice)} className="flex items-center gap-2 px-4 py-1.5 text-xs border border-gray-300 text-gray-700 rounded hover:bg-gray-100 transition-colors">
                  <Mail className="h-3.5 w-3.5" /> {t('clients.invoice.send')}
                </button>
                <button onClick={() => setShowMessageField(prev => !prev)} className={`flex items-center gap-2 px-4 py-1.5 text-xs border rounded transition-colors ${showMessageField ? 'border-primary text-primary bg-primary/5' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}`}>
                  <MessageSquare className="h-3.5 w-3.5" /> {t('clients.invoice.attachMessage')}
                </button>
              </div>
              <button onClick={() => setViewInvoice(null)} className="p-1 hover:bg-gray-100 rounded text-gray-600"><X className="h-4 w-4" /></button>
            </div>
            {/* Attach message field */}
            {showMessageField && (
              <div className="px-6 py-3 border-b border-gray-200 bg-gray-50">
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">{t('clients.invoice.messageLabel')}</label>
                <textarea value={invoiceMessage} onChange={e => setInvoiceMessage(e.target.value)} placeholder={t('clients.invoice.messagePlaceholder')} rows={3} className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
              </div>
            )}
            {/* Invoice content */}
            <div ref={invoicePreviewRef} className="p-10" style={{ fontFamily: 'system-ui, sans-serif', color: '#1a1c1c', background: 'white' }}>
              {/* Header */}
              <div className="flex justify-between items-start mb-16">
                <div>
                  <h1 className="text-4xl font-bold text-gray-900 mb-1">{t('clients.invoice.invoiceTitle')}</h1>
                </div>
                <div className="text-right text-xs text-gray-500 leading-relaxed">
                  <p className="text-lg font-bold text-gray-900 mb-2">{viewInvoice.firmName}</p>
                  <p>{viewInvoice.firmAddress}</p>
                  <p>{viewInvoice.firmPhone}</p>
                  {viewInvoice.firmNIF && <p>{viewInvoice.firmNIF}</p>}
                  {viewInvoice.firmInfo && <p style={{ whiteSpace: 'pre-line' }}>{viewInvoice.firmInfo}</p>}
                </div>
              </div>
              {/* Meta */}
              <div className="grid grid-cols-2 gap-16 mb-12">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-2 border-b border-gray-100 pb-1">{t('clients.invoice.billedTo')}</p>
                  <h4 className="text-lg font-bold text-gray-900 mb-1">{viewInvoice.clientName}</h4>
                  <div className="text-gray-500 text-sm">
                    {viewInvoice.clientEmail && <p>{viewInvoice.clientEmail}</p>}
                    {viewInvoice.clientPhone && <p>{viewInvoice.clientPhone}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">{t('clients.invoice.number')}</p>
                    <p className="text-lg font-bold text-gray-900">{viewInvoice.invoiceNumber}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">{t('clients.invoice.date')}</p>
                    <p className="text-gray-900 font-medium">{viewInvoice.date}</p>
                  </div>
                </div>
              </div>
              {/* Table */}
              <table className="w-full text-left border-collapse mb-8">
                <thead>
                  <tr className="border-y-2 border-gray-900">
                    <th className="py-3 px-2 text-[10px] uppercase tracking-widest font-bold text-gray-900">{t('clients.invoice.concept')}</th>
                    <th className="py-3 px-2 text-[10px] uppercase tracking-widest font-bold text-gray-900 text-center">{t('clients.invoice.qty')}</th>
                    <th className="py-3 px-2 text-[10px] uppercase tracking-widest font-bold text-gray-900 text-right">{t('clients.invoice.price')}</th>
                    <th className="py-3 px-2 text-[10px] uppercase tracking-widest font-bold text-gray-900 text-right">{t('clients.invoice.subtotal')}</th>
                  </tr>
                </thead>
                <tbody>
                  {viewInvoice.lines.map((line, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-4 px-2 font-medium text-gray-900">{line.concept}</td>
                      <td className="py-4 px-2 text-center text-gray-700">{line.quantity}</td>
                      <td className="py-4 px-2 text-right text-gray-700">{line.price.toFixed(2)} {cSym}</td>
                      <td className="py-4 px-2 text-right font-medium text-gray-900">{line.subtotal.toFixed(2)} {cSym}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Totals */}
              <div className="flex justify-between items-start border-t-2 border-gray-900 pt-8">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-2">{t('clients.invoice.paymentMethod')}</p>
                  <p className="text-sm text-gray-700">{viewInvoice.paymentMethod === 'transfer' ? t('clients.invoice.payTransfer') : viewInvoice.paymentMethod === 'card' ? t('clients.invoice.payCard') : viewInvoice.paymentMethod === 'cash' ? t('clients.invoice.payCash') : viewInvoice.paymentMethod || '-'}</p>
                </div>
                <div className="w-1/3 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500 uppercase tracking-widest">{t('clients.invoice.baseAmount')}</span>
                    <span className="text-gray-900 font-medium">{viewInvoice.baseAmount.toFixed(2)} {cSym}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500 uppercase tracking-widest">{t('clients.invoice.tax')} ({viewInvoice.taxRate}%)</span>
                    <span className="text-gray-900 font-medium">{viewInvoice.taxAmount.toFixed(2)} {cSym}</span>
                  </div>
                  <div className="flex justify-between items-end pt-4">
                    <span className="text-[10px] uppercase tracking-widest font-bold text-gray-900">{t('clients.invoice.total')}</span>
                    <span className="text-4xl font-bold text-gray-900">{viewInvoice.totalAmount.toFixed(2)} {cSym}</span>
                  </div>
                </div>
              </div>
              {/* QR VeriFactu — solo facturas con huella (España territorio común) */}
              {viewInvoice.huella && viewInvoice.firmNIF && (() => {
                const qrUrl = `https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?nif=${encodeURIComponent(viewInvoice.firmNIF)}&numserie=${encodeURIComponent(viewInvoice.invoiceNumber)}&fecha=${encodeURIComponent(viewInvoice.date)}&importe=${encodeURIComponent(viewInvoice.totalAmount.toFixed(2))}`;
                return (
                  <div className="mt-8 pt-6 border-t border-gray-100 flex items-center gap-4">
                    <QRCodeSVG value={qrUrl} size={64} level="M" />
                    <div>
                      <p className="text-[8px] uppercase tracking-widest text-gray-400 mb-1">{t('clients.invoice.verifactuLabel')}</p>
                      <p className="text-[7px] text-gray-400 break-all max-w-xs">{viewInvoice.huella.substring(0, 32)}...</p>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── SEND INVOICE MODAL ── */}
      {showSendInvoice && (<>
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center" onClick={() => setShowSendInvoice(null)}>
          <div className="bg-card border border-border rounded-lg w-[95vw] max-w-md p-4 md:p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-foreground">{t('clients.invoice.sendTitle')}</h2>
              <button onClick={() => setShowSendInvoice(null)} className="p-1 hover:bg-accent rounded"><X className="h-4 w-4" /></button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">{t('clients.invoice.selectAccount')}</p>
            {emailAccounts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">{t('clients.invoice.noAccounts')}</p>
            ) : (
              <div className="space-y-2 mb-4">
                {emailAccounts.map(acc => (
                  <label key={acc.id} className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${selectedEmailAccountId === acc.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/50'}`}>
                    <input type="radio" name="emailAcc" checked={selectedEmailAccountId === acc.id} onChange={() => setSelectedEmailAccountId(acc.id)} className="accent-primary" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{acc.correo}</p>
                      <p className="text-xs text-muted-foreground capitalize">{acc.plataforma}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}
            {/* Add email account button & form */}
            {!showAddEmail ? (
              <button onClick={() => setShowAddEmail(true)} className="flex items-center gap-1.5 text-xs text-primary hover:underline mb-4">
                <Plus className="h-3.5 w-3.5" /> {t('clients.invoice.addAccount')}
              </button>
            ) : (
              <div className="border border-border rounded-lg p-3 mb-4 space-y-2">
                <p className="text-xs font-semibold text-foreground">{t('clients.invoice.newAccount')}</p>
                <select value={addEmailForm.plataforma} onChange={e => setAddEmailForm(f => ({ ...f, plataforma: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-md border border-border bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                  {['Gmail', 'Outlook / Hotmail', 'Yahoo', 'iCloud', 'Zoho', 'Hostinger', 'IONOS', 'OVH', 'GoDaddy'].map(p => (
                    <option key={p} value={p.toLowerCase().replace(/\s*\/\s*/g, '')}>{p}</option>
                  ))}
                </select>
                <input value={addEmailForm.correo} onChange={e => setAddEmailForm(f => ({ ...f, correo: e.target.value }))} placeholder={t('clients.invoice.emailPlaceholder')} className="w-full px-3 py-2 text-sm rounded-md border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                <input type="password" value={addEmailForm.password} onChange={e => setAddEmailForm(f => ({ ...f, password: e.target.value }))} placeholder={t('clients.invoice.passwordPlaceholder')} className="w-full px-3 py-2 text-sm rounded-md border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                <div className="flex gap-2">
                  <button onClick={addEmailAccount} disabled={isAddingEmail || !addEmailForm.correo.trim()} className="flex-1 bg-primary text-primary-foreground py-1.5 rounded-md text-xs font-medium hover:opacity-90 disabled:opacity-50">
                    {isAddingEmail ? t('clients.invoice.adding') : t('clients.invoice.addAccount')}
                  </button>
                  <button onClick={() => { setShowAddEmail(false); setAddEmailForm({ plataforma: 'gmail', correo: '', password: '' }); }} className="px-3 py-1.5 text-xs border border-border rounded-md hover:bg-accent">
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground mb-4">{t('clients.invoice.sendTo')}: <strong>{showSendInvoice.clientEmail}</strong></p>
            <button onClick={sendInvoice} disabled={!selectedEmailAccountId || isSendingInvoice} className="w-full bg-primary text-primary-foreground py-2.5 rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
              {isSendingInvoice ? t('clients.invoice.sending') : t('clients.invoice.send')}
            </button>
          </div>
        </div>
        {/* Hidden invoice preview for PDF generation — outside modal to avoid clipping */}
        <div style={{ position: 'fixed', left: '-9999px', top: 0, zIndex: -1, overflow: 'visible' }}>
          <div ref={invoicePreviewRef} style={{ width: '190mm', paddingBottom: '20px', fontFamily: 'system-ui, sans-serif', color: '#1a1c1c', background: 'white' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                  <div><h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#1a1c1c' }}>{t('clients.invoice.invoiceTitle')}</h1></div>
                  <div style={{ textAlign: 'right', fontSize: '11px', color: '#6b7280' }}>
                    <p style={{ fontSize: '16px', fontWeight: 'bold', color: '#1a1c1c', marginBottom: '8px' }}>{showSendInvoice.firmName}</p>
                    <p>{showSendInvoice.firmAddress}</p>
                    <p>{showSendInvoice.firmPhone}</p>
                    {showSendInvoice.firmNIF && <p>{showSendInvoice.firmNIF}</p>}
                    {showSendInvoice.firmInfo && <p style={{ whiteSpace: 'pre-line' }}>{showSendInvoice.firmInfo}</p>}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '20px' }}>
                  <div>
                    <p style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '2px', color: '#9ca3af', marginBottom: '8px', borderBottom: '1px solid #f3f4f6', paddingBottom: '4px' }}>{t('clients.invoice.billedTo')}</p>
                    <h4 style={{ fontSize: '16px', fontWeight: 'bold', color: '#1a1c1c', marginBottom: '4px' }}>{showSendInvoice.clientName}</h4>
                    <div style={{ color: '#6b7280', fontSize: '13px' }}>
                      {showSendInvoice.clientEmail && <p>{showSendInvoice.clientEmail}</p>}
                      {showSendInvoice.clientPhone && <p>{showSendInvoice.clientPhone}</p>}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div><p style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '2px', color: '#9ca3af' }}>{t('clients.invoice.number')}</p><p style={{ fontSize: '16px', fontWeight: 'bold', color: '#1a1c1c' }}>{showSendInvoice.invoiceNumber}</p></div>
                    <div><p style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '2px', color: '#9ca3af' }}>{t('clients.invoice.date')}</p><p style={{ color: '#1a1c1c', fontWeight: 500 }}>{showSendInvoice.date}</p></div>
                  </div>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px' }}>
                  <thead>
                    <tr style={{ borderTop: '2px solid #1a1c1c', borderBottom: '2px solid #1a1c1c' }}>
                      <th style={{ padding: '10px 8px', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 'bold', textAlign: 'left' }}>{t('clients.invoice.concept')}</th>
                      <th style={{ padding: '10px 8px', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 'bold', textAlign: 'center' }}>{t('clients.invoice.qty')}</th>
                      <th style={{ padding: '10px 8px', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 'bold', textAlign: 'right' }}>{t('clients.invoice.price')}</th>
                      <th style={{ padding: '10px 8px', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 'bold', textAlign: 'right' }}>{t('clients.invoice.subtotal')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {showSendInvoice.lines.map((line, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '12px 8px', fontWeight: 500 }}>{line.concept}</td>
                        <td style={{ padding: '12px 8px', textAlign: 'center' }}>{line.quantity}</td>
                        <td style={{ padding: '12px 8px', textAlign: 'right' }}>{line.price.toFixed(2)} {cSym}</td>
                        <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 500 }}>{line.subtotal.toFixed(2)} {cSym}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ borderTop: '2px solid #1a1c1c', paddingTop: '16px', display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '2px', color: '#6b7280', fontWeight: 'bold', marginBottom: '6px' }}>{t('clients.invoice.paymentMethod')}</p>
                    <p style={{ fontSize: '13px', color: '#374151' }}>{showSendInvoice.paymentMethod === 'transfer' ? t('clients.invoice.payTransfer') : showSendInvoice.paymentMethod === 'card' ? t('clients.invoice.payCard') : showSendInvoice.paymentMethod === 'cash' ? t('clients.invoice.payCash') : showSendInvoice.paymentMethod || '-'}</p>
                  </div>
                  <div style={{ width: '33%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '4px 0' }}><span style={{ color: '#6b7280', textTransform: 'uppercase', letterSpacing: '2px' }}>{t('clients.invoice.baseAmount')}</span><span style={{ fontWeight: 500 }}>{showSendInvoice.baseAmount.toFixed(2)} {cSym}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '4px 0' }}><span style={{ color: '#6b7280', textTransform: 'uppercase', letterSpacing: '2px' }}>{t('clients.invoice.tax')} ({showSendInvoice.taxRate}%)</span><span style={{ fontWeight: 500 }}>{showSendInvoice.taxAmount.toFixed(2)} {cSym}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: '10px' }}>
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '3px', fontWeight: 'bold' }}>{t('clients.invoice.total')}</span>
                      <span style={{ fontSize: '24px', fontWeight: 'bold' }}>{showSendInvoice.totalAmount.toFixed(2)} {cSym}</span>
                </div>
              </div>
            </div>
            {/* QR VeriFactu — solo facturas con huella (España territorio común) */}
            {showSendInvoice.huella && showSendInvoice.firmNIF && (() => {
              const qrUrl = `https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?nif=${encodeURIComponent(showSendInvoice.firmNIF)}&numserie=${encodeURIComponent(showSendInvoice.invoiceNumber)}&fecha=${encodeURIComponent(showSendInvoice.date)}&importe=${encodeURIComponent(showSendInvoice.totalAmount.toFixed(2))}`;
              return (
                <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <QRCodeSVG value={qrUrl} size={64} level="M" />
                  <div>
                    <p style={{ fontSize: '8px', textTransform: 'uppercase', letterSpacing: '2px', color: '#9ca3af', marginBottom: '4px' }}>{t('clients.invoice.verifactuLabel')}</p>
                    <p style={{ fontSize: '7px', color: '#9ca3af', wordBreak: 'break-all', maxWidth: '200px' }}>{showSendInvoice.huella.substring(0, 32)}...</p>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </>)}

      {/* ── DELETE INVOICE CONFIRM ── */}
      {invoiceToDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70] flex items-center justify-center" onClick={() => setInvoiceToDelete(null)}>
          <div className="bg-card border border-border rounded-lg w-[95vw] max-w-sm p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-foreground mb-2">{t('clients.invoice.deleteConfirmTitle')}</h3>
            <p className="text-sm text-muted-foreground mb-6">{t('clients.invoice.deleteConfirmMsg', { number: invoiceToDelete.invoiceNumber })}</p>
            <div className="flex gap-2">
              <button onClick={() => deleteInvoice(invoiceToDelete)} className="flex-1 bg-destructive text-destructive-foreground py-2 rounded-md text-sm font-medium hover:opacity-90">
                {t('clients.invoice.delete')}
              </button>
              <button onClick={() => setInvoiceToDelete(null)} className="flex-1 border border-border py-2 rounded-md text-sm hover:bg-accent">
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CALCULOS LIST MODAL ── */}
      {showCalculos && (
        <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowCalculos(null)}>
          <div className="bg-card border border-border rounded-lg w-full max-w-lg shadow-lg flex flex-col max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div className="flex items-center gap-2">
                <Calculator className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-lg font-semibold text-foreground">{t('clients.savedCalculations')}</h2>
              </div>
              <button onClick={() => setShowCalculos(null)} className="p-1 hover:bg-accent rounded transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {calculosList.length === 0 ? (
                <div className="text-center py-12">
                  <Calculator className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">{t('clients.noCalculations')}</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">{t('clients.createCalcHint')}</p>
                </div>
              ) : (
                calculosList.map((calc: any) => (
                  <div key={calc.id} className="flex items-center justify-between border border-border rounded-lg p-4 hover:bg-accent/30 transition-colors">
                    <div>
                      <p className="text-sm font-medium text-foreground">{calc.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(calc.createdAt).toLocaleDateString(undefined, { day: '2-digit', month: 'long', year: 'numeric' })}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setViewCalculo(calc)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-md hover:bg-accent transition-colors"
                      >
                        <Eye className="h-3 w-3" />
                        Ver
                      </button>
                      <button
                        onClick={() => deleteCalculo(calc.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-destructive border border-destructive/30 rounded-md hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── VIEW CALCULO MODAL ── */}
      {viewCalculo && (
        <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setViewCalculo(null)}>
          <div className="bg-card border border-border rounded-lg w-full max-w-xl shadow-xl flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{viewCalculo.label}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {new Date(viewCalculo.createdAt).toLocaleDateString(undefined, { day: '2-digit', month: 'long', year: 'numeric' })}
                  {' · '}
                  {viewCalculo.clientType === 'empresa' ? t('clients.typeEmpresa') : viewCalculo.clientType === 'autonomo' ? t('clients.typeAutonomo') : t('clients.typeAsalariado')}
                </p>
              </div>
              <button onClick={() => setViewCalculo(null)} className="p-1 hover:bg-accent rounded transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {(() => {
                const entries = (Object.entries(viewCalculo.data as Record<string, string>)
                  .filter(([, v]) => v !== "" && v !== null && v !== undefined)) as [string, string][];
                if (entries.length === 0) return (
                  <p className="text-sm text-muted-foreground text-center py-8">{t('clients.noCalcData')}</p>
                );
                // Build a flat key→label map from the country config fields
                const dynamicLabels: Record<string, string> = {};
                if (countryConfig?.fields) {
                  for (const typeConfig of Object.values(countryConfig.fields) as Array<{basic: {key:string;label:string}[];advanced: {key:string;label:string}[]}>) {
                    for (const f of [...(typeConfig.basic || []), ...(typeConfig.advanced || [])]) {
                      dynamicLabels[f.key] = f.label;
                    }
                  }
                }
                const fieldLabel = (key: string) => dynamicLabels[key] || FIELD_LABELS[key] || key;
                const currencySymbol = cSym;
                return (
                  <div className="grid grid-cols-2 gap-3">
                    {entries.map(([key, value]) => (
                      <div key={key} className="bg-accent/50 rounded-md px-3 py-2">
                        <p className="text-xs text-muted-foreground truncate">{fieldLabel(key)}</p>
                        <p className="text-sm font-medium text-foreground mt-0.5">{value} {currencySymbol}</p>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Lyri Chat Modal */}
      {lyriClientId && (
        <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => closeLyri()}>
          <div className="bg-card border border-border rounded-lg w-[95vw] max-w-2xl h-[85vh] md:h-[80vh] flex flex-col shadow-lg" onClick={(e) => e.stopPropagation()}>
            {/* Chat Header */}
            <div className="border-b border-border p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-foreground">{t('clients.lyraModal.title')}</h2>
              </div>
              <div className="flex items-center gap-2">
                {/* Chat selector */}
                <div className="relative">
                  <button
                    onClick={() => setShowChatSelector(!showChatSelector)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent hover:bg-accent/80 text-sm text-foreground transition-colors"
                  >
                    {activeLyriChat?.title || t('clients.lyraModal.title')} <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  {showChatSelector && (
                    <div className="absolute right-0 top-full mt-1 w-64 bg-card border border-border rounded-lg shadow-lg z-10 overflow-hidden">
                      <button
                        onClick={createNewLyriChat}
                        className="w-full text-left px-4 py-2.5 text-sm font-medium text-primary hover:bg-accent transition-colors border-b border-border flex items-center gap-2"
                      >
                        <Plus className="h-3.5 w-3.5" /> {t('clients.lyraModal.newChat')}
                      </button>
                      {lyriChats.map((chat) => (
                        <div
                          key={chat.id}
                          className={`flex items-center justify-between px-4 py-2.5 text-sm hover:bg-accent transition-colors ${activeLyriChatId === chat.id ? "bg-accent" : ""}`}
                        >
                          <button
                            onClick={() => { setActiveLyriChatId(chat.id); setShowChatSelector(false); }}
                            className={`flex-1 text-left ${activeLyriChatId === chat.id ? "font-medium" : "text-muted-foreground"}`}
                          >
                            <span className="block truncate">{chat.title}</span>
                            <span className="text-[10px] text-muted-foreground">{chat.date}</span>
                          </button>
                          <button
                            onClick={(e) => deleteLyriChat(chat.id, e)}
                            className="p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive transition-colors"
                            title={t('clients.lyraModal.deleteChat')}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={() => closeLyri()} className="p-1 hover:bg-accent rounded"><X className="h-4 w-4" /></button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {(!activeLyriChat || activeLyriChat.messages.length === 0) && !isSendingMessage && (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm text-muted-foreground">{t('clients.lyraModal.noMessages')}</p>
                </div>
              )}
              {activeLyriChat?.messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[70%] rounded-lg px-4 py-3 text-sm leading-relaxed prose prose-sm dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1 ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground"}`}>
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                </div>
              ))}
              {isSendingMessage && (!lyriIsStreaming || !lyriStreamingText) && (
                <div className="flex justify-start">
                  <div className="bg-accent text-accent-foreground rounded-lg px-4 py-3 text-sm">
                    <span className="inline-block animate-pulse">{t('clients.lyraModal.typing')}</span>
                  </div>
                </div>
              )}
              {lyriIsStreaming && lyriStreamingText && (
                <div className="flex justify-start">
                  <div className="max-w-[70%] rounded-lg px-4 py-3 text-sm leading-relaxed prose prose-sm dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1 bg-accent text-accent-foreground">
                    <ReactMarkdown>{lyriStreamingText}</ReactMarkdown>
                  </div>
                </div>
              )}
              <div ref={lyriEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-border p-4 flex items-center gap-2">
              <textarea
                value={lyriInput}
                rows={1}
                style={{ height: lyriInput === '' ? '40px' : undefined }}
                onChange={(e) => {
                  setLyriInput(e.target.value);
                  if (e.target.value) {
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
                  }
                }}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendLyriMessage(); } }}
                placeholder={t('clients.lyraModal.placeholder')}
                disabled={isSendingMessage || !activeLyriChatId}
                className="flex-1 bg-accent/50 border border-border rounded-md px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 resize-none overflow-hidden"
              />
              <button onClick={isSendingMessage ? cancelLyriJob : sendLyriMessage} disabled={!isSendingMessage && (!lyriInput.trim() || !activeLyriChatId)} className="p-2.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40">
                {isSendingMessage ? <StopCircle className="h-4 w-4" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Clients;
