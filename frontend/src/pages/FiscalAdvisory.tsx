import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Send, Trash2, Plus, Mail, Settings, Calculator, StopCircle, Search, Check, ChevronsUpDown, ChevronDown, X, Info, Download, ReceiptText } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useStreamingChat } from "@/hooks/useStreamingChat";
import { authFetch } from '../lib/authFetch';

const API_URL = import.meta.env.VITE_API_URL;

interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  cases: number;
  status: string;
  clientType?: string;
  fiscalInfo?: Record<string, any>;
}

type FieldDef = { key: string; label: string };

const BADGE_CLASS: Record<string, string> = {
  asalariado: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  autonomo: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  empresa: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
};

const BADGE_LABEL: Record<string, string> = {
  asalariado: "Employee",
  autonomo: "Self-employed",
  empresa: "Company",
};

const TABS_CONFIG: Record<string, { basic: FieldDef[]; advanced: FieldDef[] }> = {
  asalariado: {
    basic: [
      { key: "salarioBruto", label: "Annual gross salary (€)" },
      { key: "retencionesEmpresa", label: "Withholdings by employer (€)" },
      { key: "planPensiones", label: "Pension plan contribution (€)" },
    ],
    advanced: [
      { key: "cotizacionesSS", label: "Social Security contributions (€) — calculated automatically if blank" },
      { key: "pagasExtras", label: "Extra payments outside gross (€)" },
      { key: "retribucionesEspecie", label: "Benefits in kind (€)" },
      { key: "capitalMobiliario", label: "Movable capital income (interest, dividends) (€)" },
      { key: "capitalInmobiliario", label: "Real estate capital / rentals (€)" },
      { key: "gananciaPatrimonial", label: "Capital gains (€)" },
      { key: "pensiones", label: "Pensions and benefits (€)" },
      { key: "cuotasSindicales", label: "Union dues (€)" },
      { key: "donaciones", label: "Donations (€)" },
      { key: "deduccionesAuto", label: "Regional deductions (€)" },
      { key: "viviendaHabitual", label: "Primary residence — old deduction (€)" },
      { key: "retencionesTotales", label: "Total withholdings (if different from employer's) (€)" },
    ],
  },
  autonomo: {
    basic: [
      { key: "facturacionTotal", label: "Annual revenue excl. VAT (€)" },
      { key: "gastosDeducibles", label: "Total deductible expenses incl. RETA (€)" },
      { key: "ivaRepercutido", label: "VAT charged / collected (€)" },
      { key: "ivaSoportado", label: "VAT paid / borne (€)" },
    ],
    advanced: [
      { key: "ingresosIntracom", label: "EU intra-community income (€)" },
      { key: "subvenciones", label: "Subsidies (€)" },
      { key: "otrosIngresos", label: "Other income (€)" },
      { key: "cuotaRETA", label: "Itemised RETA contribution (€)" },
      { key: "gastosActividad", label: "Activity expenses (premises, utilities) (€)" },
      { key: "amortizaciones", label: "Depreciation (€)" },
      { key: "gastosFinancieros", label: "Financial expenses (€)" },
      { key: "dietasDesplaz", label: "Allowances and travel (€)" },
      { key: "segurosPro", label: "Professional insurance (€)" },
      { key: "pagosFracc130", label: "Instalment payments form 130 (€)" },
      { key: "retencionesSoportadas", label: "Withholdings suffered 15% (€)" },
      { key: "ivaIntracom", label: "EU VAT (€)" },
      { key: "ivaRegularizacion", label: "VAT regularisations / refunds (€)" },
    ],
  },
  empresa: {
    basic: [
      { key: "ingresosTotal", label: "Total income (€)" },
      { key: "gastosTotal", label: "Total expenses (€)" },
      { key: "ivaRepercutidoEmp", label: "IVA cobrado / repercutido (€)" },
      { key: "ivaSoportadoEmp", label: "IVA pagado / soportado (€)" },
    ],
    advanced: [
      { key: "gastosNoDeducibles", label: "Non-deductible expenses (€)" },
      { key: "amortizFiscal", label: "Tax depreciation adjustment (€)" },
      { key: "provisiones", label: "Provisions (€)" },
      { key: "deterioros", label: "Impairment losses (€)" },
      { key: "opVinculadas", label: "Related-party transactions (€)" },
      { key: "basesNegAnter", label: "Prior year tax losses (€)" },
      { key: "reservaCapitalizacion", label: "Capitalisation reserve (€)" },
      { key: "reservaNivelacion", label: "Equalisation reserve (€)" },
      { key: "deduccionID", label: "R&D (€)" },
      { key: "deduccionEmpleo", label: "Job creation (€)" },
      { key: "dobleImposicion", label: "International double taxation (€)" },
      { key: "deduccionDonac", label: "Donaciones (€)" },
      { key: "incentivosAuto", label: "Regional incentives (€)" },
      { key: "pagosFracc202", label: "Instalment payments form 202 (€)" },
      { key: "retencionesSop", label: "Withholdings suffered (€)" },
      { key: "ivaRegularizEmp", label: "VAT regularisations & refunds (€)" },
    ],
  },
};

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  offerPdf?: boolean;
}

interface FiscalChatListItem {
  id: string;
  title: string;
  clientId: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

interface FiscalChatDetail {
  id: string;
  title: string;
  clientId: string | null;
  accountId: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

interface AlertRecipient {
  clientId: string;
  clientName: string;
  email: string;
}

interface FiscalAlert {
  id: string;
  asunto: string;
  mensaje: string;
  destinatarios: AlertRecipient[];
  fechaEnvio: string;
  repeticion: "una vez" | "diaria" | "semanal" | "mensual" | "trimestral" | "anual";
  estado: "pendiente" | "enviado" | "error";
  createdAt?: string;
}

interface EmailConfig {
  platform: string;
  smtpServer: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
}

interface CalcResultLine {
  concepto: string;
  valor: number;
  params?: Record<string, string | number>;
  isSection?: boolean;
}

interface CalcResult {
  total: number;
  desglose: CalcResultLine[];
  etiquetaTotal: string;
  currency?: string;
}

interface SavedCalculationItem {
  id: string;
  label: string;
  createdAt: string;
}

interface ObligationModelOption {
  code: string;
  name: string;
  periodType: "monthly" | "quarterly" | "yearly" | "custom";
}

const EMAIL_PLATFORMS: Record<string, { name: string; server: string; port: number }> = {
  gmail: { name: "Gmail", server: "smtp.gmail.com", port: 587 },
  outlook: { name: "Outlook / Hotmail", server: "smtp-mail.outlook.com", port: 587 },
  yahoo: { name: "Yahoo", server: "smtp.mail.yahoo.com", port: 465 },
  office365: { name: "Office 365", server: "smtp.office365.com", port: 587 },
  icloud: { name: "iCloud", server: "smtp.mail.me.com", port: 587 },
  zoho: { name: "Zoho", server: "smtp.zoho.com", port: 587 },
  hostinger: { name: "Hostinger", server: "smtp.hostinger.com", port: 465 },
  ionos: { name: "IONOS", server: "smtp.ionos.es", port: 587 },
  ovh: { name: "OVH", server: "ssl0.ovh.net", port: 465 },
  godaddy: { name: "GoDaddy", server: "smtpout.secureserver.net", port: 465 },
  custom: { name: "Custom / Personalizado", server: "", port: 587 },
};

export default function FiscalAdvisory() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auth
  const [accountId, setAccountId] = useState<string>("");

  // Clients (needed for alert recipients)
  const [clients, setClients] = useState<Client[]>([]);

  // Chat
  const [chatsList, setChatsList] = useState<FiscalChatListItem[]>([]);
  const [activeChat, setActiveChat] = useState<FiscalChatDetail | null>(null);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [showChatSelector, setShowChatSelector] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const { streamingText: fiscalStreamingText, isStreaming: fiscalIsStreaming, startStream: fiscalStartStream, cancelStream: fiscalCancelStream } = useStreamingChat();

  // Alerts (need clients for recipients)
  const [alerts, setAlerts] = useState<FiscalAlert[]>([]);
  const [isAlertDialogOpen, setIsAlertDialogOpen] = useState(false);
  const [editingAlert, setEditingAlert] = useState<FiscalAlert | null>(null);
  const [newAlert, setNewAlert] = useState<FiscalAlert>({
    id: "",
    asunto: "",
    mensaje: "",
    destinatarios: [],
    fechaEnvio: "",
    repeticion: "una vez",
    estado: "pendiente",
  });
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [deleteAlertId, setDeleteAlertId] = useState<string | null>(null);
  const [clientSearchTerm, setClientSearchTerm] = useState("");

  // Search
  const [alertSearchTerm, setAlertSearchTerm] = useState("");

  // Email Config
  const [isEmailConfigOpen, setIsEmailConfigOpen] = useState(false);

  const [emailConfig, setEmailConfig] = useState<EmailConfig>({
    platform: "gmail",
    smtpServer: "smtp.gmail.com",
    smtpPort: 587,
    smtpUser: "",
    smtpPassword: "",
  });

  // Calculation (client selector + modal)
  const [selectedCalcClient, setSelectedCalcClient] = useState<Client | null>(null);
  // Country-aware field configuration
  const [country, setCountry] = useState<string>('ES');
  const [countryData, setCountryData] = useState<null | {
    fields: typeof TABS_CONFIG | null;
    currency: string;
    country: string;
  }>(null);

  useEffect(() => {
    const storedCountry = sessionStorage.getItem('country') || 'ES';
    setCountry(storedCountry);
    authFetch(`${API_URL}/calculos/config?country=${storedCountry}`)
      .then(r => r.json())
      .then(data => {
        if (data && data.fields) {
          setCountryData({ fields: data.fields, currency: data.currency || 'EUR', country: data.country || storedCountry });
        }
      })
      .catch(() => {/* fallback to hardcoded config */});
  }, []);

  const activeTabsConfig = countryData?.fields ?? TABS_CONFIG;

  const [showClientSelector, setShowClientSelector] = useState(false);
  const [calcClientSearch, setCalcClientSearch] = useState("");
  const [showCalcModal, setShowCalcModal] = useState(false);
  const [calcTab, setCalcTab] = useState(0);
  const [calcData, setCalcData] = useState<Record<string, string>>({});
  const [calcLabel, setCalcLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [calcResult, setCalcResult] = useState<CalcResult | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const [showDesglose, setShowDesglose] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showObligationDialog, setShowObligationDialog] = useState(false);
  const [savedCalculations, setSavedCalculations] = useState<SavedCalculationItem[]>([]);
  const [obligationModels, setObligationModels] = useState<ObligationModelOption[]>([]);
  const [selectedObligationCalculationId, setSelectedObligationCalculationId] = useState("");
  const [selectedObligationModelCode, setSelectedObligationModelCode] = useState("");
  const [obligationPeriod, setObligationPeriod] = useState("");
  const [creatingObligation, setCreatingObligation] = useState(false);
  const [isBetaModalOpen, setIsBetaModalOpen] = useState(false);

  // Real-time calculation (debounced)
  useEffect(() => {
    if (!showCalcModal || !selectedCalcClient) {
      setCalcResult(null);
      return;
    }
    const hasAnyData = Object.values(calcData).some(v => v !== "" && v !== "0" && v !== undefined);
    if (!hasAnyData) {
      setCalcResult(null);
      return;
    }
    setCalcLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await authFetch(`${API_URL}/calculos/calculate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientType: selectedCalcClient.clientType || "asalariado",
            data: calcData,
            country,
          }),
        });
        if (res.ok) {
          const result = await res.json();
          setCalcResult(result as CalcResult);
        }
      } catch (e) {
        console.error("Error calculando:", e);
      } finally {
        setCalcLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [calcData, showCalcModal, selectedCalcClient]);

  // Check auth
  useEffect(() => {
    const storedAccountId = sessionStorage.getItem("accountId");
    if (!storedAccountId) {
      navigate("/login");
      return;
    }
    setAccountId(storedAccountId);
  }, [navigate]);

  // Fetch clients, alerts, email config
  useEffect(() => {
    if (!accountId) return;
    fetchClients();
    fetchAlerts();
    fetchEmailConfig();
  }, [accountId]);

  // Load chats when accountId or selected client changes
  useEffect(() => {
    if (!accountId) return;
    setActiveChatId(null);
    setActiveChat(null);
    setChatsList([]);
    void fetchChatsForClient(selectedCalcClient?.id ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, selectedCalcClient]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChat?.messages, fiscalStreamingText]);

  const fetchClients = async () => {
    try {
      const userType = sessionStorage.getItem('userType');
      const response = await authFetch(
        `${API_URL}/clients?accountId=${accountId}&userType=${userType}`
      );
      if (response.ok) {
        const data = await response.json();
        setClients(data);
      }
    } catch (error) {
      console.error("Error fetching clients:", error);
    }
  };

  const fetchChatsForClient = async (clientId: string | null) => {
    try {
      const param = clientId ? `clientId=${clientId}` : 'clientId=null';
      const response = await authFetch(`${API_URL}/fiscal/chats?${param}`, {
        headers: { "x-account-id": accountId },
      });
      if (response.ok) {
        const data: FiscalChatListItem[] = await response.json();
        setChatsList(data);
        if (data.length > 0) {
          await fetchChatById(data[0].id);
        } else {
          await createChatForClient(clientId);
        }
      }
    } catch (error) {
      console.error("Error fetching chats:", error);
    }
  };

  const fetchChatById = async (id: string) => {
    try {
      const response = await authFetch(`${API_URL}/fiscal/chats/${id}`, {
        headers: { "x-account-id": accountId },
      });
      if (response.ok) {
        const data: FiscalChatDetail = await response.json();
        setActiveChat(data);
        setActiveChatId(data.id);
      }
    } catch (error) {
      console.error("Error fetching chat:", error);
    }
  };

  const createChatForClient = async (clientId: string | null) => {
    try {
      const response = await authFetch(`${API_URL}/fiscal/chats`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-account-id": accountId },
        body: JSON.stringify({ clientId }),
      });
      if (response.ok) {
        const newItem: FiscalChatListItem = await response.json();
        setChatsList(prev => [newItem, ...prev]);
        await fetchChatById(newItem.id);
      }
    } catch (error) {
      console.error("Error creating chat:", error);
    }
  };

  const handleCreateNewChat = async () => {
    await createChatForClient(selectedCalcClient?.id ?? null);
  };

  const handleDeleteActiveChat = async (chatId: string) => {
    try {
      const response = await authFetch(`${API_URL}/fiscal/chats/${chatId}`, {
        method: "DELETE",
        headers: { "x-account-id": accountId },
      });
      if (response.ok) {
        const newList = chatsList.filter(c => c.id !== chatId);
        setChatsList(newList);
        if (activeChatId === chatId) {
          if (newList.length > 0) {
            await fetchChatById(newList[0].id);
          } else {
            setActiveChat(null);
            setActiveChatId(null);
            await createChatForClient(selectedCalcClient?.id ?? null);
          }
        }
      }
    } catch (error) {
      console.error("Error deleting chat:", error);
      toast({ title: t('common.error'), description: t('fiscal.errorDeleteChat'), variant: "destructive" });
    }
  };

  const fetchAlerts = async () => {
    try {
      const response = await authFetch(`${API_URL}/fiscal/alerts`, {
        headers: { "x-account-id": accountId },
      });
      if (response.ok) {
        const data = await response.json();
        setAlerts(data);
      }
    } catch (error) {
      console.error("Error fetching alerts:", error);
    }
  };

  const fetchEmailConfig = async () => {
    try {
      const response = await authFetch(`${API_URL}/fiscal/email-config`, {
        headers: { "x-account-id": accountId },
      });
      if (response.ok) {
        const data = await response.json();
        // Ensure platform field exists, default to gmail if not
        if (!data.platform) {
          data.platform = "gmail";
        }
        setEmailConfig(data);
      }
    } catch (error) {
      console.error("Error fetching email config:", error);
    }
  };

  const cancelJob = () => {
    fiscalCancelStream();
    setIsSending(false);
  };

  const handleSendMessage = async () => {
    if (!messageInput.trim() || isSending || !activeChatId) return;

    const userText = messageInput;
    const userMessage: Message = {
      role: "user",
      content: userText,
      timestamp: new Date().toISOString(),
    };

    setActiveChat((prev) => prev ? ({ ...prev, messages: [...prev.messages, userMessage] }) : prev);
    setMessageInput("");
    setIsSending(true);

    try {
      await fiscalStartStream({
        endpoint: `/fiscal/chats/${activeChatId}/message/stream`,
        body: { message: userText },
        headers: { 'x-account-id': accountId || '' },
        onDone: async (fullText) => {
          const hasOfferPdf = fullText.includes('[OFFER_PDF]');
          const cleanText = fullText.replace(/\[OFFER_PDF\]/g, '').trim();
          const assistantMessage: Message = {
            role: "assistant",
            content: cleanText,
            timestamp: new Date().toISOString(),
            offerPdf: hasOfferPdf,
          };
          setActiveChat((prev) => prev ? ({ ...prev, messages: [...prev.messages, assistantMessage] }) : prev);
          setIsSending(false);
        },
      });
    } catch (error) {
      console.error("Error sending message:", error);
      setActiveChat((prev) => prev ? ({ ...prev, messages: prev.messages.filter((m, index, arr) => !(index === arr.length - 1 && m.role === "user" && m.content === userText)) }) : prev);
      setMessageInput(userText);
      setIsSending(false);
      toast({
        title: t('common.error'),
        description: t('fiscal.errorSend'),
        variant: "destructive",
      });
    }
  };

  // handleClearChat replaced by handleDeleteActiveChat

  const handleOpenNewAlert = () => {
    setEditingAlert(null);
    setNewAlert({
      id: "",
      asunto: "",
      mensaje: "",
      destinatarios: [],
      fechaEnvio: "",
      repeticion: "una vez",
      estado: "pendiente",
    });
    setSelectedRecipients([]);
    setClientSearchTerm("");
    setIsAlertDialogOpen(true);
  };

  const handleEditAlert = (alert: FiscalAlert) => {
    setEditingAlert(alert);
    setNewAlert(alert);
    setSelectedRecipients(alert.destinatarios.map(d => d.clientId));
    setClientSearchTerm("");
    setIsAlertDialogOpen(true);
  };

  const handleSaveAlert = async () => {
    // Warn if email is not configured
    if (!emailConfig.smtpUser || !emailConfig.smtpPassword) {
      toast({
        title: t('fiscal.emailNotConfigured') || '⚠️ Email no configurado',
        description: t('fiscal.emailNotConfiguredDesc') || 'No has configurado tu cuenta de correo. Las alertas se guardarán pero no se enviarán por email hasta que configures el correo en "Configuración de Email".',
        variant: "destructive",
      });
    }

    try {
      // Build recipients from selected clients
      const destinatarios: AlertRecipient[] = selectedRecipients.map(clientId => {
        const client = clients.find(c => c.id === clientId);
        return {
          clientId,
          clientName: client?.name || "",
          email: client?.email || "",
        };
      });

      const alertData = {
        ...newAlert,
        destinatarios,
      };

      const url = editingAlert
        ? `${API_URL}/fiscal/alerts/${editingAlert.id}`
        : `${API_URL}/fiscal/alerts`;

      const method = editingAlert ? "PUT" : "POST";

      const response = await authFetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-account-id": accountId,
        },
        body: JSON.stringify(alertData),
      });

      if (response.ok) {
        toast({
          title: editingAlert ? t('fiscal.alertUpdated') : t('fiscal.alertCreated'),
          description: `La alerta se ha ${editingAlert ? "actualizado" : "creado"} correctamente`,
        });
        setIsAlertDialogOpen(false);
        fetchAlerts();
      } else {
        throw new Error("Failed to save alert");
      }
    } catch (error) {
      console.error("Error saving alert:", error);
      toast({
        title: t('common.error'),
        description: t('fiscal.errorSaveAlert'),
        variant: "destructive",
      });
    }
  };

  const handleDeleteAlert = async () => {
    if (!deleteAlertId) return;

    try {
      const response = await authFetch(`${API_URL}/fiscal/alerts/${deleteAlertId}`, {
        method: "DELETE",
        headers: { "x-account-id": accountId },
      });

      if (response.ok) {
        toast({
          title: t('fiscal.alertDeleted'),
          description: "La alerta se ha eliminado correctamente",
        });
        setDeleteAlertId(null);
        fetchAlerts();
      }
    } catch (error) {
      console.error("Error deleting alert:", error);
      toast({
        title: t('common.error'),
        description: t('fiscal.errorDeleteAlert'),
        variant: "destructive",
      });
    }
  };

  const handleSendAlert = async (alertId: string) => {
    try {
      const response = await authFetch(`${API_URL}/fiscal/alerts/${alertId}/send`, {
        method: "POST",
        headers: { "x-account-id": accountId },
      });

      if (response.ok) {
        toast({
          title: t('fiscal.alertSent'),
          description: "La alerta se ha enviado correctamente",
        });
        fetchAlerts();
      } else {
        throw new Error("Failed to send alert");
      }
    } catch (error) {
      console.error("Error sending alert:", error);
      toast({
        title: t('common.error'),
        description: t('fiscal.errorSendAlert'),
        variant: "destructive",
      });
    }
  };



  const handleSaveEmailConfig = async () => {
    try {
      const response = await authFetch(`${API_URL}/fiscal/email-config`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-account-id": accountId,
        },
        body: JSON.stringify(emailConfig),
      });

      if (response.ok) {
        toast({
          title: t('fiscal.emailConfigSaved'),
          description: t('fiscal.emailConfigSavedDesc'),
        });
        setIsEmailConfigOpen(false);
      } else {
        throw new Error("Failed to save email config");
      }
    } catch (error) {
      console.error("Error saving email config:", error);
      toast({
        title: t('common.error'),
        description: t('fiscal.errorSaveEmailConfig'),
        variant: "destructive",
      });
    }
  };

  const toggleRecipient = (clientId: string) => {
    setSelectedRecipients(prev =>
      prev.includes(clientId)
        ? prev.filter(id => id !== clientId)
        : [...prev, clientId]
    );
  };

  const openCalcModal = () => {
    setCalcData({});
    setCalcTab(0);
    setCalcLabel("");
    setCalcResult(null);
    setShowDesglose(false);
    setShowAdvanced(false);
    setShowCalcModal(true);
  };

  const saveCalculo = async () => {
    if (!selectedCalcClient || saving) return;
    setSaving(true);
    try {
      const res = await authFetch(`${API_URL}/calculos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: selectedCalcClient.id,
          clientName: selectedCalcClient.name,
          clientType: selectedCalcClient.clientType || "asalariado",
          label: calcLabel.trim() || `${t('fiscal.calcDefaultLabel')} ${new Date().toLocaleDateString(i18n.language)}`,
          data: calcData,
          resultado: calcResult?.total,
          etiquetaTotal: calcResult?.etiquetaTotal,
          desglose: calcResult?.desglose,
          accountId,
        }),
      });
      if (res.ok) {
        setShowCalcModal(false);
        toast({ title: t('fiscal.calcSaved'), description: t('fiscal.calcSavedDesc') });
      }
    } catch (e) {
      console.error(e);
      toast({ title: t('common.error'), description: t('fiscal.errorSaveCalc'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handlePlatformChange = (platform: string) => {
    const platformConfig = EMAIL_PLATFORMS[platform];
    if (platform === 'custom') {
      setEmailConfig({ ...emailConfig, platform });
    } else {
      setEmailConfig({
        ...emailConfig,
        platform,
        smtpServer: platformConfig.server,
        smtpPort: platformConfig.port,
      });
    }
  };

  const defaultPeriodForModel = (periodType: "monthly" | "quarterly" | "yearly" | "custom") => {
    const now = new Date();
    const year = now.getFullYear();
    if (periodType === "yearly") return `Y-${year}`;
    if (periodType === "monthly") {
      const month = String(now.getMonth() + 1).padStart(2, "0");
      return `M${month}-${year}`;
    }
    const month = now.getMonth() + 1;
    const quarter = month <= 3 ? "T1" : month <= 6 ? "T2" : month <= 9 ? "T3" : "T4";
    return `${quarter}-${year}`;
  };

  const openObligationDialog = async () => {
    if (!selectedCalcClient) {
      toast({ title: t('common.error'), description: 'Selecciona un cliente primero', variant: 'destructive' });
      return;
    }

    try {
      const clientType = selectedCalcClient.clientType || 'asalariado';
      const countryCode = String(sessionStorage.getItem('country') || '').toUpperCase().trim();
      if (!countryCode) {
        toast({
          title: t('common.error'),
          description: 'La cuenta no tiene pais configurado. Completa el pais en la cuenta para crear obligaciones.',
          variant: 'destructive',
        });
        return;
      }
      const [calcRes, modelRes] = await Promise.all([
        authFetch(`${API_URL}/calculos?clientId=${selectedCalcClient.id}&accountId=${accountId}`),
        authFetch(`${API_URL}/tax-compliance/models/${countryCode}?clientType=${encodeURIComponent(clientType)}`, {
          headers: { 'x-account-id': accountId },
        }),
      ]);

      if (calcRes.ok) {
        const calcData = await calcRes.json() as SavedCalculationItem[];
        setSavedCalculations(calcData || []);
      } else {
        setSavedCalculations([]);
      }

      if (modelRes.ok) {
        const modelData = await modelRes.json() as ObligationModelOption[];
        setObligationModels(modelData || []);
        const defaultModelCode = modelData?.[0]?.code || '';
        setSelectedObligationModelCode(defaultModelCode);
        if (modelData?.[0]) {
          setObligationPeriod(defaultPeriodForModel(modelData[0].periodType));
        } else {
          setObligationPeriod('');
        }
      } else {
        setObligationModels([]);
      }

      setSelectedObligationCalculationId('');
      setShowObligationDialog(true);
    } catch (error) {
      console.error('Error opening obligation dialog:', error);
      toast({ title: t('common.error'), description: 'No se pudo preparar la creacion de obligacion', variant: 'destructive' });
    }
  };

  const createTaxObligation = async () => {
    if (!selectedObligationCalculationId || !selectedObligationModelCode) {
      toast({ title: t('common.error'), description: 'Selecciona calculo y modelo fiscal', variant: 'destructive' });
      return;
    }
    setCreatingObligation(true);
    try {
      const res = await authFetch(`${API_URL}/tax-compliance/obligations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-account-id': accountId,
        },
        body: JSON.stringify({
          calculationId: selectedObligationCalculationId,
          modelCode: selectedObligationModelCode,
          period: obligationPeriod,
        }),
      });
      if (!res.ok) {
        let message = 'No se pudo crear la obligacion';
        try {
          const payload = await res.json() as { error?: string };
          if (payload?.error) message = payload.error;
        } catch {
          // keep fallback
        }
        throw new Error(message);
      }

      setShowObligationDialog(false);
      toast({ title: 'Obligacion creada', description: 'Ya disponible en Tax Compliance.' });
    } catch (error: any) {
      console.error('Error creating obligation:', error);
      toast({ title: t('common.error'), description: error?.message || 'No se pudo crear la obligacion', variant: 'destructive' });
    } finally {
      setCreatingObligation(false);
    }
  };

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-bold mb-2">{t('fiscal.title')}</h1>
        <p className="text-muted-foreground">
          {t('fiscal.subtitle')}
        </p>
      </div>

      <Tabs defaultValue="consultas" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="consultas">
            <Calculator className="w-4 h-4 mr-2" />
            {t('fiscal.tabConsultas')}
          </TabsTrigger>
          <TabsTrigger value="alertas">
            <Mail className="w-4 h-4 mr-2" />
            {t('fiscal.tabAlertas')}
          </TabsTrigger>
        </TabsList>

        {/* ============= CONSULTAS FISCALES ============= */}
        <TabsContent value="consultas">
          <Card className="h-full flex flex-col">
            <CardHeader>
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle>{t('fiscal.chatTitle')}</CardTitle>
                    <Button size="sm" variant="outline" onClick={() => setIsBetaModalOpen(true)}>
                      {t('fiscal.beta.button')}
                    </Button>
                  </div>
                  <CardDescription>
                    {t('fiscal.chatDesc')}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                  {/* Chat selector */}
                  <div className="relative">
                    <button
                      onClick={() => { setShowChatSelector(!showChatSelector); }}
                      className="flex items-center gap-2 px-3 py-1.5 bg-accent/50 border border-border rounded-md text-sm text-foreground hover:bg-accent transition-colors min-w-[160px] justify-between"
                    >
                      <span className="truncate max-w-[120px]">
                        {activeChat?.title || "Sin chat"}
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    </button>
                    {showChatSelector && (
                      <div className="absolute left-0 top-full mt-1 w-64 bg-card border border-border rounded-lg shadow-lg z-30">
                        <div className="max-h-64 overflow-y-auto py-1">
                          {chatsList.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-4">Sin chats</p>
                          ) : (
                            chatsList.map(c => (
                              <div
                                key={c.id}
                                className={`flex items-center justify-between px-3 py-2 hover:bg-accent transition-colors group ${activeChatId === c.id ? "bg-primary/10" : ""}`}
                              >
                                <span
                                  onClick={() => { void fetchChatById(c.id); setShowChatSelector(false); }}
                                  className={`text-sm truncate flex-1 cursor-pointer ${activeChatId === c.id ? "text-primary font-medium" : ""}`}
                                >
                                  {c.title}
                                </span>
                                <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">{c.messageCount}</span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); void handleDeleteActiveChat(c.id); setShowChatSelector(false); }}
                                  className="ml-1 p-0.5 text-muted-foreground hover:text-destructive transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  {/* New chat button */}
                  <button
                    onClick={() => { void handleCreateNewChat(); }}
                    title="Nuevo chat"
                    className="flex items-center justify-center w-8 h-8 rounded-md border border-border hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  {/* Delete current chat button */}
                  {activeChatId && (
                    <button
                      onClick={() => { void handleDeleteActiveChat(activeChatId); }}
                      title="Eliminar chat"
                      className="flex items-center justify-center w-8 h-8 rounded-md border border-border hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  {selectedCalcClient && (
                    <button
                      onClick={openCalcModal}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
                    >
                      <Calculator className="h-3.5 w-3.5" />
                      {t('fiscal.infoSection')}
                    </button>
                  )}
                  {selectedCalcClient && (
                    <button
                      onClick={() => { void openObligationDialog(); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-sm font-medium hover:bg-accent transition-colors"
                    >
                      <ReceiptText className="h-3.5 w-3.5" />
                      Tax Compliance
                    </button>
                  )}
                  <div className="relative">
                    <button
                      onClick={() => { setShowClientSelector(!showClientSelector); setCalcClientSearch(""); }}
                      className="flex items-center gap-2 px-3 py-1.5 bg-accent/50 border border-border rounded-md text-sm text-foreground hover:bg-accent transition-colors min-w-[180px] justify-between"
                    >
                      <span className="truncate max-w-[140px]">
                        {selectedCalcClient ? selectedCalcClient.name : t('fiscal.selectClient')}
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    </button>
                    {showClientSelector && (
                      <div className="absolute right-0 top-full mt-1 w-72 bg-card border border-border rounded-lg shadow-lg z-30">
                        <div className="p-2 border-b border-border">
                          <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <input
                              autoFocus
                              value={calcClientSearch}
                              onChange={(e) => setCalcClientSearch(e.target.value)}
                              placeholder="Buscar cliente..."
                              className="w-full bg-accent/50 border border-border rounded-md pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                          </div>
                        </div>
                        <div className="max-h-56 overflow-y-auto py-1">
                          {clients.filter(c => c.name.toLowerCase().includes(calcClientSearch.toLowerCase())).length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-4">{t('fiscal.noResults')}</p>
                          ) : (
                            clients.filter(c => c.name.toLowerCase().includes(calcClientSearch.toLowerCase())).map((client) => (
                              <div
                                key={client.id}
                                onClick={() => {
                                  setSelectedCalcClient(client);
                                  setShowClientSelector(false);
                                  setCalcTab(0);
                                }}
                                className={`flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-accent transition-colors ${
                                  selectedCalcClient?.id === client.id ? "bg-primary/10 text-primary" : ""
                                }`}
                              >
                                <span className="text-sm truncate">{client.name}</span>
                                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ml-2 flex-shrink-0 ${BADGE_CLASS[client.clientType || "asalariado"]}`}>
                                  {t(`clients.type${(client.clientType || 'asalariado').charAt(0).toUpperCase()}${(client.clientType || 'asalariado').slice(1)}`)}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                        {selectedCalcClient && (
                          <div className="border-t border-border p-2">
                            <button
                              onClick={() => { setSelectedCalcClient(null); setShowClientSelector(false); }}
                              className="w-full text-xs text-muted-foreground hover:text-foreground py-1 transition-colors"
                            >
                              {t('fiscal.deselectClient')}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              <div className="flex-1 overflow-y-auto mb-4 space-y-4 max-h-[calc(100vh-320px)] border rounded-lg p-4">
                {activeChat && activeChat.messages.length > 0 ? (
                  activeChat.messages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div className="max-w-[90%] md:max-w-[80%]">
                        <div
                          className={`rounded-lg p-3 prose prose-sm dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1 ${
                            msg.role === "user"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted"
                          }`}
                        >
                          <ReactMarkdown>{msg.content.replace(/\[OFFER_PDF\]/g, '')}</ReactMarkdown>
                        </div>
                        {msg.role === "assistant" && (msg.offerPdf || msg.content.includes('[OFFER_PDF]')) && activeChatId && (
                          <div className="mt-2 flex">
                            <button
                              onClick={async () => {
                                try {
                                  const res = await authFetch(`${API_URL}/fiscal/chats/${activeChatId}/export-pdf?accountId=${accountId}`);
                                  if (!res.ok) throw new Error('Error');
                                  const blob = await res.blob();
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = 'informe-fiscal.pdf';
                                  document.body.appendChild(a);
                                  a.click();
                                  URL.revokeObjectURL(url);
                                  document.body.removeChild(a);
                                } catch {
                                  toast({ title: t('common.error'), variant: 'destructive' });
                                }
                              }}
                              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
                            >
                              <Download className="h-4 w-4" />
                              {t('fiscal.downloadReport') || 'Descargar informe fiscal'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <p>{t('fiscal.noMessages')}</p>
                  </div>
                )}
                {isSending && !fiscalIsStreaming && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-lg p-3 text-sm">
                      <span className="inline-block animate-pulse">{t('fiscal.analyzing')}</span>
                    </div>
                  </div>
                )}
                {fiscalIsStreaming && fiscalStreamingText && (
                  <div className="flex justify-start">
                    <div className="max-w-[85%] md:max-w-[70%] rounded-lg p-3 text-sm leading-relaxed prose prose-sm dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1 bg-muted">
                      <ReactMarkdown>{fiscalStreamingText}</ReactMarkdown>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="flex items-end gap-2">
                <textarea
                  value={messageInput}
                  rows={1}
                  onChange={(e) => {
                    setMessageInput(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder={t('fiscal.placeholder')}
                  disabled={isSending}
                  className="flex-1 bg-accent/50 border border-border rounded-md px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none overflow-hidden"
                />
                <Button onClick={isSending ? cancelJob : handleSendMessage} disabled={!isSending && (!messageInput.trim() || !activeChatId)} className="shrink-0">
                  {isSending ? <StopCircle className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============= ALERTAS Y RECORDATORIOS ============= */}
        <TabsContent value="alertas">
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
              <div>
                <h2 className="text-2xl font-bold">{t('fiscal.alertsTitle')}</h2>
                <p className="text-muted-foreground">
                  {t('fiscal.alertsDesc')}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setIsEmailConfigOpen(true)}>
                  <Settings className="w-4 h-4 mr-2" />
                  {t('fiscal.configEmailBtn')}
                </Button>
                <Button onClick={handleOpenNewAlert}>
                  <Plus className="w-4 h-4 mr-2" />
                  {t('fiscal.newAlert')}
                </Button>
              </div>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-9"
                placeholder={t('fiscal.searchAlerts')}
                value={alertSearchTerm}
                onChange={(e) => setAlertSearchTerm(e.target.value)}
              />
            </div>

            <div className="grid gap-4">
              {alerts.filter((a) => {
                const term = alertSearchTerm.toLowerCase();
                if (!term) return true;
                return (
                  a.asunto.toLowerCase().includes(term) ||
                  a.mensaje.toLowerCase().includes(term) ||
                  a.destinatarios.some((d) =>
                    d.clientName.toLowerCase().includes(term) ||
                    d.email.toLowerCase().includes(term)
                  )
                );
              }).length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    {alertSearchTerm ? t('fiscal.noAlertsFound') : t('fiscal.noAlerts')}
                  </CardContent>
                </Card>
              ) : (
                alerts.filter((a) => {
                  const term = alertSearchTerm.toLowerCase();
                  if (!term) return true;
                  return (
                    a.asunto.toLowerCase().includes(term) ||
                    a.mensaje.toLowerCase().includes(term) ||
                    a.destinatarios.some((d) =>
                      d.clientName.toLowerCase().includes(term) ||
                      d.email.toLowerCase().includes(term)
                    )
                  );
                }).map((alert) => (
                  <Card key={alert.id}>
                    <CardHeader>
                      <div className="flex flex-col md:flex-row justify-between items-start gap-3">
                        <div>
                          <CardTitle className="text-lg">{alert.asunto}</CardTitle>
                          <CardDescription>
                            {alert.destinatarios.length} {t('fiscal.recipients')} • {({
                              "una vez": t('fiscal.once'),
                              "diaria": t('fiscal.daily'),
                              "semanal": t('fiscal.weekly'),
                              "mensual": t('fiscal.monthly'),
                              "trimestral": t('fiscal.quarterly'),
                              "anual": t('fiscal.annual'),
                            } as Record<string,string>)[alert.repeticion] ?? alert.repeticion} •{" "}
                            {new Date(alert.fechaEnvio).toLocaleDateString()}
                          </CardDescription>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditAlert(alert)}
                          >
                            {t('fiscal.editAlert')}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSendAlert(alert.id)}
                            disabled={alert.estado === "enviado"}
                          >
                            <Send className="w-4 h-4 mr-1" />
                            {t('fiscal.sendAlert')}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setDeleteAlertId(alert.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm mb-3">{alert.mensaje}</p>
                      <div className="flex flex-wrap gap-2">
                        {alert.destinatarios.map((dest) => (
                          <span
                            key={dest.clientId}
                            className="inline-flex items-center px-2 py-1 rounded-md bg-secondary text-secondary-foreground text-xs"
                          >
                            {dest.clientName}
                          </span>
                        ))}
                      </div>
                      <div className="mt-3">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-md text-xs ${
                            alert.estado === "enviado"
                              ? "bg-green-100 text-green-800"
                              : alert.estado === "error"
                              ? "bg-red-100 text-red-800"
                              : "bg-yellow-100 text-yellow-800"
                          }`}
                        >
                          {alert.estado === "enviado"
                            ? t('fiscal.statusSent')
                            : alert.estado === "error"
                            ? "Error"
                            : t('fiscal.statusPending')}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Alert Dialog */}
      <Dialog open={isAlertDialogOpen} onOpenChange={setIsAlertDialogOpen}>
        <DialogContent className="max-w-[95vw] md:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingAlert ? t('fiscal.editAlertTitle') : t('fiscal.newAlertTitle')}</DialogTitle>
            <DialogDescription>
              {t('fiscal.alertDialogDesc')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>{t('fiscal.subject')}</Label>
              <Input
                value={newAlert.asunto}
                onChange={(e) => setNewAlert({ ...newAlert, asunto: e.target.value })}
                placeholder={t('fiscal.alertPlaceholder')}
              />
            </div>

            <div>
              <Label>{t('fiscal.messageLabel')}</Label>
              <Textarea
                value={newAlert.mensaje}
                onChange={(e) => setNewAlert({ ...newAlert, mensaje: e.target.value })}
                placeholder="Escribe el mensaje del recordatorio..."
                rows={4}
              />
            </div>

            <div>
              <Label>{t('fiscal.recipientClients')}</Label>
              <div className="space-y-2">
                <Input
                  placeholder={t('fiscal.searchClientInDialog')}
                  value={clientSearchTerm}
                  onChange={(e) => setClientSearchTerm(e.target.value)}
                  className="w-full"
                />
                <div className="border rounded-lg p-4 max-h-[220px] overflow-y-auto space-y-2">
                  {clients
                    .filter((client) =>
                      client.name.toLowerCase().includes(clientSearchTerm.toLowerCase()) ||
                      client.email.toLowerCase().includes(clientSearchTerm.toLowerCase())
                    )
                    .map((client) => (
                      <div key={client.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`client-${client.id}`}
                          checked={selectedRecipients.includes(client.id)}
                          onCheckedChange={() => toggleRecipient(client.id)}
                        />
                        <label
                          htmlFor={`client-${client.id}`}
                          className="text-sm cursor-pointer flex-1"
                        >
                          {client.name} ({client.email})
                        </label>
                      </div>
                    ))}
                  {clients.filter((client) =>
                    client.name.toLowerCase().includes(clientSearchTerm.toLowerCase()) ||
                    client.email.toLowerCase().includes(clientSearchTerm.toLowerCase())
                  ).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-2">
                      {t('fiscal.noClientsFound')}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>{t('fiscal.sendDate')}</Label>
                <Input
                  type="date"
                  value={newAlert.fechaEnvio}
                  onChange={(e) => setNewAlert({ ...newAlert, fechaEnvio: e.target.value })}
                />
              </div>

              <div>
                <Label>{t('fiscal.repetition')}</Label>
                <Select
                  value={newAlert.repeticion}
                  onValueChange={(value: any) => setNewAlert({ ...newAlert, repeticion: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="una vez">{t('fiscal.once')}</SelectItem>
                    <SelectItem value="diaria">{t('fiscal.daily')}</SelectItem>
                    <SelectItem value="semanal">{t('fiscal.weekly')}</SelectItem>
                    <SelectItem value="mensual">{t('fiscal.monthly')}</SelectItem>
                    <SelectItem value="trimestral">{t('fiscal.quarterly')}</SelectItem>
                    <SelectItem value="anual">{t('fiscal.annual')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAlertDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSaveAlert}>{t('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Config Dialog */}
      <Dialog open={isEmailConfigOpen} onOpenChange={setIsEmailConfigOpen}>
        <DialogContent className="max-w-[95vw] md:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('fiscal.emailConfigTitle')}</DialogTitle>
            <DialogDescription>
              {t('fiscal.emailConfigDesc')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>{t('fiscal.emailPlatform')}</Label>
              <Select value={emailConfig.platform} onValueChange={handlePlatformChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(EMAIL_PLATFORMS).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      {config.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {emailConfig.platform !== 'custom' && (
                <p className="text-xs text-muted-foreground mt-1">
                  Servidor: {emailConfig.smtpServer} | Puerto: {emailConfig.smtpPort}
                </p>
              )}
            </div>

            {emailConfig.platform === 'custom' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>SMTP Server</Label>
                  <Input
                    value={emailConfig.smtpServer}
                    onChange={(e) => setEmailConfig({ ...emailConfig, smtpServer: e.target.value })}
                    placeholder="smtp.example.com"
                  />
                </div>
                <div>
                  <Label>Puerto SMTP</Label>
                  <Input
                    type="number"
                    value={emailConfig.smtpPort}
                    onChange={(e) => setEmailConfig({ ...emailConfig, smtpPort: parseInt(e.target.value) || 587 })}
                    placeholder="587"
                  />
                </div>
              </div>
            )}

            <div>
              <Label>{t('fiscal.emailUser')}</Label>
              <Input
                value={emailConfig.smtpUser}
                onChange={(e) => setEmailConfig({ ...emailConfig, smtpUser: e.target.value })}
                placeholder="tu@email.com"
              />
            </div>

            <div>
              <Label>{t('fiscal.emailPassword')}</Label>
              <Input
                type="password"
                value={emailConfig.smtpPassword}
                onChange={(e) =>
                  setEmailConfig({ ...emailConfig, smtpPassword: e.target.value })
                }
                placeholder={t('fiscal.emailPasswordPlaceholder')}
              />
              {emailConfig.platform === "gmail" && (
                <p className="text-xs text-muted-foreground mt-1">
                  {t('fiscal.gmailNote')}
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEmailConfigOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSaveEmailConfig}>{t('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tax Obligation Dialog */}
      <Dialog open={showObligationDialog} onOpenChange={setShowObligationDialog}>
        <DialogContent className="max-w-[95vw] md:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Crear obligacion fiscal</DialogTitle>
            <DialogDescription>
              Convierte un calculo guardado en una obligacion trazable de Tax Compliance.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Calculo guardado</Label>
              <Select value={selectedObligationCalculationId} onValueChange={setSelectedObligationCalculationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un calculo" />
                </SelectTrigger>
                <SelectContent>
                  {savedCalculations.map((calc) => (
                    <SelectItem key={calc.id} value={calc.id}>
                      {calc.label} • {new Date(calc.createdAt).toLocaleDateString(i18n.language)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Modelo fiscal</Label>
              <Select
                value={selectedObligationModelCode}
                onValueChange={(value) => {
                  setSelectedObligationModelCode(value);
                  const selected = obligationModels.find((m) => m.code === value);
                  if (selected) setObligationPeriod(defaultPeriodForModel(selected.periodType));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un modelo" />
                </SelectTrigger>
                <SelectContent>
                  {obligationModels.map((model) => (
                    <SelectItem key={model.code} value={model.code}>
                      {model.code} - {model.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Periodo</Label>
              <Input value={obligationPeriod} onChange={(e) => setObligationPeriod(e.target.value)} placeholder="T1-2026" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowObligationDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => { void createTaxObligation(); }} disabled={creatingObligation}>
              {creatingObligation ? 'Creando...' : 'Crear obligacion'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isBetaModalOpen} onOpenChange={setIsBetaModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('fiscal.beta.title')}</DialogTitle>
            <DialogDescription>{t('fiscal.beta.description')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setIsBetaModalOpen(false)}>{t('common.close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Alert Confirmation */}
      <AlertDialog open={!!deleteAlertId} onOpenChange={() => setDeleteAlertId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('fiscal.deleteAlertTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('fiscal.deleteAlertDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteAlertId(null)}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAlert}>{t('common.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* ── CALCULATION MODAL ── */}
      {showCalcModal && selectedCalcClient && (() => {
        const config = activeTabsConfig[selectedCalcClient.clientType as keyof typeof TABS_CONFIG || "asalariado"] || activeTabsConfig.asalariado;
        const renderField = (field: FieldDef) => (
          <div key={field.key}>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              {field.label}
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={calcData[field.key] || ""}
              onChange={(e) => setCalcData((prev) => ({ ...prev, [field.key]: e.target.value }))}
              placeholder="0.00"
              className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        );
        return (
          <div
            className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-50 flex items-center justify-center"
            onClick={() => setShowCalcModal(false)}
          >
            <div
              className="bg-card border border-border rounded-lg w-[95vw] max-w-2xl flex flex-col shadow-xl max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal header */}
              <div className="flex items-center justify-between p-4 border-b border-border">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold text-foreground">{t('fiscal.fiscalInfoTitle')}</h2>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${BADGE_CLASS[selectedCalcClient.clientType || "asalariado"]}`}>
                    {t(`clients.type${(selectedCalcClient.clientType || 'asalariado').charAt(0).toUpperCase()}${(selectedCalcClient.clientType || 'asalariado').slice(1)}`)}
                  </span>
                  <span className="text-sm text-muted-foreground">{selectedCalcClient.name}</span>
                </div>
                <button onClick={() => setShowCalcModal(false)} className="p-1 hover:bg-accent rounded transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Label input */}
              <div className="px-4 pt-4 pb-2">
                <input
                  value={calcLabel}
                  onChange={(e) => setCalcLabel(e.target.value)}
                  placeholder={t('fiscal.calcNamePlaceholder', { year: new Date().getFullYear() })}
                  className="w-full bg-accent/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              {/* Fields */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Basic fields */}
                <div className="grid grid-cols-2 gap-3">
                  {config.basic.map(renderField)}
                </div>

                {/* Advanced fields toggle */}
                <div>
                  <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                  >
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
                    Campos avanzados
                  </button>
                  {showAdvanced && (
                    <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-border">
                      {config.advanced.map(renderField)}
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-border flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  {calcLoading ? (
                    <span className="text-muted-foreground animate-pulse">{t('fiscal.calculating')}</span>
                  ) : calcResult ? (
                    <>
                      <span className="text-muted-foreground">{t(calcResult.etiquetaTotal)}:</span>
                      <span className={`font-semibold text-base ${calcResult.total >= 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}>
                        {new Intl.NumberFormat(i18n.language, { style: "currency", currency: calcResult.currency || "EUR" }).format(calcResult.total)}
                      </span>
                      <button
                        onClick={() => setShowDesglose(true)}
                        className="p-0.5 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                        title={t('fiscal.viewBreakdown')}
                      >
                        <Info className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <span className="text-muted-foreground">{t('fiscal.estimatedResult')}: <span className="font-medium text-foreground">—</span></span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowCalcModal(false)}
                    className="px-4 py-2 text-sm border border-border rounded-md hover:bg-accent transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={saveCalculo}
                    disabled={saving}
                    className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {saving ? t('fiscal.saving') : t('fiscal.saveCalc')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Close selector on outside click */}
      {showClientSelector && (
        <div className="fixed inset-0 z-20" onClick={() => setShowClientSelector(false)} />
      )}

      {/* Desglose modal */}
      {showDesglose && calcResult && (
        <div
          className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-[60] flex items-center justify-center"
          onClick={() => setShowDesglose(false)}
        >
          <div
            className="bg-card border border-border rounded-lg w-[95vw] max-w-md shadow-xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="text-base font-semibold text-foreground">{t('fiscal.calcBreakdown')}</h3>
              <button onClick={() => setShowDesglose(false)} className="p-1 hover:bg-accent rounded transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <table className="w-full text-sm">
                <tbody>
                  {calcResult.desglose.map((line, i) => (
                    line.isSection ? (
                      <tr key={i}>
                        <td colSpan={2} className="pt-3 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          {t(line.concepto)}
                        </td>
                      </tr>
                    ) : (
                      <tr key={i} className="border-b border-border/50 last:border-0">
                        <td className="py-1.5 text-muted-foreground pr-4">{t(line.concepto, line.params)}</td>
                        <td className={`py-1.5 text-right font-medium tabular-nums ${line.valor < 0 ? "text-emerald-600 dark:text-emerald-400" : line.valor > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                          {line.valor === 0 ? "—" : new Intl.NumberFormat(i18n.language, { style: "currency", currency: calcResult?.currency || "EUR" }).format(line.valor)}
                        </td>
                      </tr>
                    )
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-border flex justify-between items-center">
              <span className="text-sm text-muted-foreground">{t(calcResult.etiquetaTotal)}</span>
              <span className={`text-lg font-bold tabular-nums ${calcResult.total >= 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}>
                {new Intl.NumberFormat(i18n.language, { style: "currency", currency: calcResult.currency || "EUR" }).format(calcResult.total)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
