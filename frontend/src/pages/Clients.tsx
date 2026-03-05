import { useState, useRef, useEffect } from "react";
import { Plus, Pencil, Trash2, FolderOpen, X, Upload, Info, MessageSquare, Search, Send, ChevronDown, Eye, StopCircle, Calculator } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/use-toast";
import { useStreamingChat } from "@/hooks/useStreamingChat";
import { authFetch } from '../lib/authFetch';

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
}

interface ClientFile {
  id: string;
  name: string;
  date: string;
  filePath: string;
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

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

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

const CALC_API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

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
  const [showCalculos, setShowCalculos] = useState<string | null>(null);
  const [calculosList, setCalculosList] = useState<any[]>([]);
  const [viewCalculo, setViewCalculo] = useState<any | null>(null);
  const formFileRef = useRef<HTMLInputElement>(null);
  const modalFileRef = useRef<HTMLInputElement>(null);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | "abierto" | "finalizado" | "automaticos">("todos");

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

  const openClientFiles = (clientId: string) => {
    const client = clients.find(c => c.id === clientId);
    if (client) {
      setCurrentClientFiles(client.files);
      setFilesClientId(clientId);
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
              <select
                value={client.status}
                onChange={(e) => updateClientStatus(client.id, e.target.value as "abierto" | "finalizado")}
                className="text-xs bg-card border border-border rounded px-2 py-1 text-foreground focus:outline-none [&>option]:bg-card [&>option]:text-foreground"
              >
                <option value="abierto">{t('clients.statusOpen')}</option>
                <option value="finalizado">{t('clients.statusClosed')}</option>
              </select>
              {/* Subaccount selector - only visible for main accounts */}
              {userType === 'main' && (
                <select
                  value={client.assignedSubaccountId || ""}
                  onChange={(e) => assignClientToSubaccount(client.id, e.target.value)}
                  className="text-xs bg-card border border-border rounded px-2 py-1 text-foreground focus:outline-none [&>option]:bg-card [&>option]:text-foreground"
                >
                  <option value="">{t('clients.unassigned')}</option>
                  {subaccounts.map((sub) => (
                    <option key={sub.id} value={sub.id}>{sub.name}</option>
                  ))}
                </select>
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
        <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setFilesClientId(null)}>
          <div className="bg-card border border-border rounded-lg w-full max-w-lg p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-foreground">{t('clients.filesModal.title')}</h2>
              <button onClick={() => setFilesClientId(null)} className="p-1 hover:bg-accent rounded"><X className="h-4 w-4" /></button>
            </div>
            
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
                currentClientFiles.map((file) => (
                  <div key={file.id} className="flex items-center justify-between bg-accent/50 rounded-md px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{file.name}</p>
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
                ))
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
                const currencySymbol = countryConfig?.currency || 'EUR';
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
              {isSendingMessage && !lyriIsStreaming && (
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
