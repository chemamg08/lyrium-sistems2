import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import {
  LayoutDashboard,
  Users,
  FileText,
  FileSignature,
  MessageSquare,
  Shield,
  PenTool,
  Calculator,
  Zap,
  Scale,
  Send,
  Download,
  Plus,
  Mail,
  MessageCircle,
  PanelLeftClose,
  PanelLeft,
  Sun,
  Moon,
  Search,
  FolderOpen,
  Info,
  Pencil,
  Trash2,
  MessageSquarePlus,
  Upload,
  ChevronDown,
  Image,
  BookMarked,
  Calendar,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  AlignLeft,
  Save,
  Paperclip,
  Eye,
  X,
  HelpCircle,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type Module =
  | "dashboard"
  | "clients"
  | "documents"
  | "contracts"
  | "assistant"
  | "defense"
  | "writing"
  | "fiscal"
  | "automations";

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  hasDownload?: boolean;
}

// ── Mock conversations ────────────────────────────────────────────────────────
const CLIENT_CHAT: Msg[] = [
  {
    id: "c1",
    role: "user",
    content: "Summarise the Martínez García & Associates file",
  },
  {
    id: "c2",
    role: "assistant",
    content:
      "**Martínez García & Associates — Case File**\n\nThe client has 3 active matters:\n\n- **Matter 1** — Contractual dispute with supplier (under negotiation)\n- **Matter 2** — Debt recovery claim for unpaid invoices, hearing pending\n- **Matter 3** — Corporate restructuring advisory\n\nLast communication: 28/02/2026. Full documentation attached to the file.",
  },
  {
    id: "c3",
    role: "user",
    content: "What are the weak points in the debt recovery claim?",
  },
  {
    id: "c4",
    role: "assistant",
    content:
      "**Weak points identified in the claim:**\n\n1. **Partial limitation** — Two of the five invoices are approaching the 3-year limitation period under Art. 1964 CC.\n2. **No certified notice** — Prior demands were sent by email with no reliable proof of receipt.\n3. **Verbal contract** — Part of the services rendered lack a written contractual basis.\n\nRecommendation: strengthen the documentary evidence before the hearing.",
  },
];

const CONTRACT_CHAT: Msg[] = [
  {
    id: "ct1",
    role: "user",
    content:
      "Generate an NDA for client Martínez García with a 2-year non-compete clause",
  },
  {
    id: "ct2",
    role: "assistant",
    content:
      "**NON-DISCLOSURE AND NON-COMPETE AGREEMENT**\n\nBetween Lyrium Legal Practice (hereinafter \"the Firm\") and Martínez García & Associates (hereinafter \"the Client\"), this Agreement is entered into on 2 March 2026.\n\n**1. PURPOSE**\nThe parties agree to maintain strict confidentiality over all information exchanged within the scope of the professional relationship.\n\n**2. CONFIDENTIAL INFORMATION**\nAll technical, commercial, financial or strategic information communicated by one party to the other shall be deemed confidential, regardless of the medium.\n\n**3. OBLIGATIONS**\nEach party undertakes to: (i) not disclose the information to third parties; (ii) use it solely for the agreed purposes; (iii) protect it with the same degree of care applied to its own confidential information.\n\n**4. NON-COMPETE**\nThe Client undertakes not to engage in activities that directly compete with the Firm for a period of 24 months from the date of signature.\n\n**5. TERM**\nThis Agreement shall remain in force throughout the professional relationship and for 5 years after its termination.\n\n**6. GOVERNING LAW**\nThis Agreement is governed by Spanish law and submitted to the courts of Madrid.",
    hasDownload: true,
  },
  {
    id: "ct3",
    role: "user",
    content: "Add an intellectual property clause",
  },
  {
    id: "ct4",
    role: "assistant",
    content:
      "Clause added to the Agreement:\n\n**7. INTELLECTUAL PROPERTY**\nAll documentation, analyses, reports and legal work product produced by the Firm under this agreement are the Firm's exclusive intellectual property. The Client receives a limited, non-exclusive, non-transferable licence to use such materials solely for the specific purposes of the professional relationship. Reproduction, assignment or exploitation of said materials without prior written authorisation from the Firm is expressly prohibited.\n\nThe updated document is ready to download.",
    hasDownload: true,
  },
];

const DOCUMENTS_CHAT: Msg[] = [
  {
    id: "d1",
    role: "user",
    content: "What is the ruling in the Supreme Court judgment?",
  },
  {
    id: "d2",
    role: "assistant",
    content:
      "**Supreme Court Ruling (Civil Division) — Document analysed:**\n\nThe Supreme Court partially upholds the cassation appeal filed by the appellant and orders the defendant to:\n\n1. Repay **€38,450** plus statutory interest from the date of the extrajudicial claim.\n2. Pay the first-instance court costs.\n\nThe Court bases its decision on the doctrine of unjust enrichment and Art. 1,902 of the Civil Code. The defendant's counterclaim is dismissed.",
  },
  {
    id: "d3",
    role: "user",
    content: "Is there applicable Supreme Court case law for similar cases?",
  },
  {
    id: "d4",
    role: "assistant",
    content:
      "**Directly applicable Supreme Court case law:**\n\n- **STS 245/2023** — Confirms the criteria on contractual liability for partial non-performance.\n- **STS 112/2022** — Sets the time limit for actions based on Art. 1,902 CC.\n- **STS 876/2021** — Current doctrine on the calculation of interest in monetary judgments.\n\nAll three judgments strengthen the appellant's position and may be cited directly in the closing submissions.",
  },
];

const ASSISTANT_CHAT: Msg[] = [
  {
    id: "a1",
    role: "user",
    content:
      "What are the deadlines to appeal a first-instance judgment in Spain?",
  },
  {
    id: "a2",
    role: "assistant",
    content:
      "**Deadlines to appeal first-instance judgments:**\n\n**Civil Appeal**\n- 20 business days from notification (Art. 458 LEC)\n- Filed with the same court that issued the ruling\n\n**Criminal Appeal**\n- 10 days from notification (Art. 790 LECrim, summary procedure)\n- 5 days in minor offence proceedings\n\n**Social/Labour Appeal (Suplicación)**\n- 10 business days from notification\n\n⚠️ Deadlines are preclusive — missing them renders the judgment final.",
  },
  {
    id: "a3",
    role: "user",
    content: "What about cassation before the Supreme Court?",
  },
  {
    id: "a4",
    role: "assistant",
    content:
      "**Cassation Appeal — Supreme Court:**\n\n**Civil**\n- Deadline: 20 business days from notification of the appeal judgment\n- Threshold: claim value >€600,000 or demonstrated cassation interest\n- Filed with the Provincial Court (Audiencia Provincial)\n\n**Administrative**\n- Deadline: 30 days from notification\n- Since the 2015 reform, requires objective cassation interest (interés casacional)\n\nEstimated cost: solicitor and barrister fees in Madrid + advance payment of €3,000–6,000 depending on case complexity.",
  },
];

const DEFENSE_CHAT: Msg[] = [
  {
    id: "df1",
    role: "user",
    content:
      "Prepara una estrategia de defensa para el caso López vs. Empresa SL por despido improcedente",
  },
  {
    id: "df2",
    role: "assistant",
    content:
      "ESTRATEGIA DE DEFENSA — López vs. Empresa SL\nDespido Improcedente\n\nLÍNEAS DE DEFENSA PRINCIPALES\n\n1. Nulidad de la carta de despido — Incumplimiento del art. 55.1 ET: la carta no especifica con suficiente detalle los hechos imputados ni la fecha de efectos.\n2. Ausencia de proporcionalidad — La conducta atribuida no alcanza el umbral de gravedad exigido jurisprudencialmente para el despido disciplinario.\n3. Vulneración de garantías formales — No se siguió el procedimiento previsto en el convenio colectivo sectorial aplicable.\n\nARGUMENTOS JURÍDICOS\n· Arts. 55 y 56 del Estatuto de los Trabajadores\n· Doctrina del TS sobre proporcionalidad en despido disciplinario\n· Convenio Colectivo del Sector — cláusula de audiencia previa\n\nPUNTOS FUERTES DEL CASO\n· Trabajadora con 8 años de antigüedad y expediente limpio\n· Los retrasos coinciden con un período de baja médica documentada\n· La empresa no realizó apercibimiento previo por escrito",
  },
  {
    id: "df3",
    role: "user",
    content: "¿Qué jurisprudencia concreta podemos usar sobre proporcionalidad?",
  },
  {
    id: "df4",
    role: "assistant",
    content:
      "Jurisprudencia sobre falta de proporcionalidad en despido disciplinario:\n\n· STS 4ª 22/11/2022 (rec. 3847/2019) — El TS reitera que el despido debe ser la última ratio; los retrasos esporádicos no justifican extinción si no hay perjuicio económico acreditado.\n· STS 4ª 15/03/2021 (rec. 1205/2018) — Declara improcedente el despido por absentismo cuando las ausencias tenían cobertura médica aunque no se comunicaran en plazo.\n· TSJ Madrid 18/10/2023 — Caso similar con 7 años de antigüedad: el tribunal consideró que la ausencia de amonestaciones previas determina la improcedencia.\n\nRecomendación: solicita en el acto del juicio el historial disciplinario completo del trabajador. Si la empresa no lo aporta, se presume que no existen sanciones previas.",
  },
];

const WRITING_CHAT: Msg[] = [
  {
    id: "w1",
    role: "user",
    content: "Review this claim paragraph and improve the legal drafting",
  },
  {
    id: "w2",
    role: "assistant",
    content:
      "Text analysed. Suggested improvements:\n\n**Original:**\n> \"The company didn't pay the worker and that's wrong because it has to pay according to the contract they signed\"\n\n**Improved version:**\n> \"The defendant has manifestly breached the remuneration obligation established in the employment contract executed on [date], in contravention of Article 29 of Royal Legislative Decree 2/2015 of 23 October approving the revised text of the Workers' Statute\"\n\n**Changes applied:**\n- Precise legal identification of the breach\n- Specific statutory reference (Art. 29 ET)\n- Appropriate procedural terminology: \"defendant\", \"remuneration obligation\"\n- Contractual title identified with date",
  },
  {
    id: "w3",
    role: "user",
    content: "Perfect. Also add applicable case law",
  },
  {
    id: "w4",
    role: "assistant",
    content:
      "Updated paragraph with case law citation:\n\n> \"The defendant has manifestly breached the remuneration obligation established in the employment contract executed on [date], in contravention of Article 29 of Royal Legislative Decree 2/2015. This breach has been repeatedly sanctioned by Supreme Court doctrine, which in its Judgment of 14 May 2019 (appeal 2,186/2017) holds that systematic non-payment of wages constitutes just cause for termination at the employee's instance with entitlement to compensation, without prejudice to full payment of the amounts owed plus statutory interest under Art. 1,100 CC\"",
  },
];

const FISCAL_CHAT: Msg[] = [
  {
    id: "f1",
    role: "user",
    content:
      "How much income tax does a self-employed person pay with €45,000 revenue and €12,000 expenses in 2025?",
  },
  {
    id: "f2",
    role: "assistant",
    content:
      "**Estimated Income Tax 2025 — Self-employed (simplified direct assessment)**\n\nNet income: 45,000 − 12,000 = **€33,000**\nProvisions deduction (5%): −€1,650\nReduced net income: **€31,350**\n\n**State tax scale 2025:**\n| Bracket | Rate | Tax |\n|---|---|---|\n| 0 – €12,450 | 9.5% | €1,182.75 |\n| €12,450 – €20,200 | 12% | €930.00 |\n| €20,200 – €31,350 | 15% | €1,672.50 |\n\nState tax: ~€3,785\nRegional tax (average): ~€3,600\n**Total estimated tax: ~€7,385**\n\nDeduct: withholdings already paid and quarterly instalments (Form 130).",
  },
  {
    id: "f3",
    role: "user",
    content: "Can Social Security contributions be deducted?",
  },
  {
    id: "f4",
    role: "assistant",
    content:
      "**Yes.** Social Security contributions (RETA) are fully deductible as a business expense for income tax purposes.\n\n**How it works:**\n- Reported as an expense in Form 130 and the annual tax return\n- Directly reduces net income before applying the tax scale\n\n**Example with your figures:**\n- Average RETA contribution 2025: ~€400/month = **€4,800/year**\n- New net income: 33,000 − 4,800 = **€28,200**\n- Estimated tax saving: **~€1,200** vs. the figure calculated above\n\nAdditional contributions for cessation of activity or occupational accidents are also fully deductible.",
  },
];

// ── Mock data ─────────────────────────────────────────────────────────────────
const MOCK_CLIENTS = [
  {
    id: "1",
    name: "Martínez García & Asociados",
    email: "martinez@mgabogados.es",
    phone: "+34 912 345 678",
    cases: 3,
    status: "abierto",
  },
  {
    id: "2",
    name: "Carlos López Herrera",
    email: "carlos.lopez@email.com",
    phone: "+34 623 456 789",
    cases: 1,
    status: "abierto",
  },
  {
    id: "3",
    name: "Fernández Consulting SL",
    email: "admin@fernandez.consulting",
    phone: "+34 934 567 890",
    cases: 2,
    status: "finalizado",
  },
  {
    id: "4",
    name: "Ana Ruiz Sánchez",
    email: "ana.ruiz@personal.com",
    phone: "+34 645 678 901",
    cases: 1,
    status: "abierto",
  },
];

const CONTRACT_BASES = [
  {
    id: "1",
    name: "Non-Disclosure Agreement (NDA)",
    summary:
      "Standard template for confidentiality agreements with clients and collaborators.",
  },
  {
    id: "2",
    name: "Professional Services Agreement",
    summary:
      "Base template for legal services contracts with hourly fee structure.",
  },
  {
    id: "3",
    name: "Commercial Lease Agreement",
    summary: "Template for commercial premises leases under applicable tenancy law.",
  },
];

const SUMMARY_DOCS = [
  { id: "1", title: "Supreme Court — Civil Div. Rec. 2847/2023", date: "28/02/2026" },
  {
    id: "2",
    title: "Lease_Agreement_López.pdf",
    date: "15/02/2026",
  },
];

const MOCK_WRITING_TEXT = `LEGAL GROUNDS

FIRST.— On subject-matter and territorial jurisdiction.

Jurisdiction over the present claim lies with this Employment Tribunal by virtue of Articles 1 and 2 of Act 36/2011 of 10 October governing the social jurisdiction, territorial competence being established pursuant to Article 10.1 LJS, given that the services were performed within this judicial district.

SECOND.— On the employment relationship and its termination.

The claimant was employed by the defendant company from 15 January 2018 until 28 January 2026, on which date written notice of termination of the employment contract on disciplinary grounds was received, in the terms set out in Article 55 of Royal Legislative Decree 2/2015.

THIRD.— On the unfairness of the disciplinary dismissal.

The dismissal letter fails to meet the requirement of specifying the alleged facts imposed by Article 55.1 of the Workers' Statute, which per se renders the termination unfair under established Supreme Court case law.`;

const WRITING_SUGGESTIONS = [
  {
    id: 0,
    original: "written notice of termination of the employment contract on disciplinary grounds was received",
    suggestion: "written notification of the termination of the employment relationship on disciplinary grounds was served upon the claimant",
    reason: "More precise legal terminology: 'notification' and 'served upon' are standard procedural terms; 'employment relationship' is the technically correct concept."
  },
  {
    id: 1,
    original: "fails to meet the requirement of specifying the alleged facts",
    suggestion: "does not satisfy the requirement of sufficient specification of the facts upon which the disciplinary action is based",
    reason: "Greater legal precision: 'sufficient specification' aligns with established case law on the content requirements of a dismissal letter."
  },
  {
    id: 2,
    original: "per se renders the termination unfair under established Supreme Court case law",
    suggestion: "constitutes, in itself, grounds for a declaration of unfair dismissal in accordance with the consolidated case law of the Social Chamber of the Supreme Court",
    reason: "Specifying 'Social Chamber' and 'consolidated case law' strengthens the legal argument with a more accurate citation."
  }
];

const EMAIL_CONVERSATIONS = [
  {
    id: "1",
    name: "Carlos López Herrera",
    email: "carlos.lopez@email.com",
    subject: "Court file enquiry",
    lastMsg: "Thank you very much for the information.",
    time: "10:32",
    unread: 2,
  },
  {
    id: "2",
    name: "Fernández Consulting SL",
    email: "admin@fernandez.consulting",
    subject: "Pending documentation",
    lastMsg: "Please find the requested documents attached.",
    time: "09:15",
    unread: 0,
  },
  {
    id: "3",
    name: "Ana Ruiz Sánchez",
    email: "ana.ruiz@personal.com",
    subject: "Appointment request",
    lastMsg: "Could I schedule an appointment for next week?",
    time: "Yesterday",
    unread: 1,
  },
];

const EMAIL_MESSAGES_INIT: Record<
  string,
  { from: string; text: string; time: string; sent: boolean }[]
> = {
  "1": [
    {
      from: "Carlos López",
      text: "Good morning, could you update me on the status of my court file?",
      time: "09:45",
      sent: false,
    },
    {
      from: "You",
      text: "Good morning Carlos. Your file is at the investigation stage. You will shortly receive notification of the hearing date.",
      time: "10:00",
      sent: true,
    },
    {
      from: "Carlos López",
      text: "Thank you very much for the information.",
      time: "10:32",
      sent: false,
    },
  ],
  "2": [
    {
      from: "You",
      text: "We kindly request that you send us the signed contracts and the updated company certificate.",
      time: "08:30",
      sent: true,
    },
    {
      from: "Fernández Consulting",
      text: "Please find the requested documents attached.",
      time: "09:15",
      sent: false,
    },
  ],
  "3": [
    {
      from: "Ana Ruiz",
      text: "Could I schedule an appointment for next week?",
      time: "Yesterday 16:00",
      sent: false,
    },
  ],
};

const WA_CONTACTS = [
  {
    id: 1,
    name: "Carlos López Herrera",
    phone: "+34 623 456 789",
    lastMsg: "Perfect, see you tomorrow",
    time: "11:05",
    unread: 0,
  },
  {
    id: 2,
    name: "Martínez García",
    phone: "+34 912 345 678",
    lastMsg: "When is the hearing?",
    time: "10:20",
    unread: 2,
  },
  {
    id: 3,
    name: "Juzgado Nº3 Madrid",
    phone: "+34 634 567 890",
    lastMsg: "Reminder: oral hearing 15/03",
    time: "09:00",
    unread: 1,
  },
];

const WA_MESSAGES_INIT: Record<
  number,
  { from: string; text: string; time: string; sent: boolean }[]
> = {
  1: [
    {
      from: "Carlos López",
      text: "Can we sign the documents tomorrow at 10?",
      time: "10:50",
      sent: false,
    },
    {
      from: "You",
      text: "Yes, perfect — I'll be at the office",
      time: "10:55",
      sent: true,
    },
    {
      from: "Carlos López",
      text: "Perfect, see you tomorrow",
      time: "11:05",
      sent: false,
    },
  ],
  2: [
    {
      from: "Martínez García",
      text: "Good morning, when is the next hearing?",
      time: "10:15",
      sent: false,
    },
    {
      from: "You",
      text: "The hearing is scheduled for 18 March at 11:00",
      time: "10:18",
      sent: true,
    },
    {
      from: "Martínez García",
      text: "When is the hearing?",
      time: "10:20",
      sent: false,
    },
  ],
  3: [
    {
      from: "Juzgado Nº3",
      text: "Reminder: oral hearing 15/03 at 10:00. Case: López vs. Empresa SL",
      time: "09:00",
      sent: false,
    },
  ],
};

// ── ChatPane ──────────────────────────────────────────────────────────────────
interface ChatPaneProps {
  messages: Msg[];
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  placeholder: string;
}

const ChatPane = ({
  messages,
  input,
  setInput,
  onSend,
  placeholder,
}: ChatPaneProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${
              msg.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[70%] rounded-lg px-4 py-3 text-sm leading-relaxed prose prose-sm prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-headings:text-inherit prose-strong:text-inherit prose-a:text-inherit prose-code:text-inherit ${
                msg.role === "user"
                  ? "bg-chat-user text-chat-user-foreground"
                  : "bg-chat-ai text-chat-ai-foreground"
              }`}
            >
              <ReactMarkdown>{msg.content}</ReactMarkdown>
              {msg.hasDownload && (
                <div className="mt-2.5 pt-2 border-t border-white/10">
                  <button
                    onClick={(e) => e.preventDefault()}
                    className="flex items-center gap-1.5 text-xs bg-white/10 hover:bg-white/15 rounded px-2.5 py-1.5 transition-colors cursor-default"
                  >
                    <Download className="h-3 w-3" />
                    Download PDF
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-border p-3 flex gap-2 shrink-0">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSend()}
          placeholder={placeholder}
          className="flex-1 bg-accent/50 border border-border rounded-md px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          onClick={onSend}
          disabled={!input.trim()}
          className="p-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 shrink-0"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

// ── ClientsPane ───────────────────────────────────────────────────────────────
interface ClientsPaneProps {
  selectedClient: (typeof MOCK_CLIENTS)[0] | null;
  setSelectedClient: (c: (typeof MOCK_CLIENTS)[0] | null) => void;
  clientMsgs: Msg[];
  clientInput: string;
  setClientInput: (v: string) => void;
  onClientSend: () => void;
}

const ClientsPane = ({
  selectedClient,
  setSelectedClient,
  clientMsgs,
  clientInput,
  setClientInput,
  onClientSend,
}: ClientsPaneProps) => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | "abierto" | "finalizado">("todos");
  const [lyraOpen, setLyraOpen] = useState(false);
  const [clientChatsOpen, setClientChatsOpen] = useState(false);

  useEffect(() => {
    setIsVisible(false);
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  const filtered = MOCK_CLIENTS.filter((c) => {
    const matchSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "todos" || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  if (lyraOpen && selectedClient) {
    return (
      <div className="relative h-full overflow-hidden">
        {/* clients list behind (dimmed) */}
        <div className="h-full overflow-y-auto p-8 opacity-30 pointer-events-none">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">{t('clients.title')}</h1>
              <p className="text-sm text-muted-foreground mt-1">{t('clients.count', { count: MOCK_CLIENTS.length })}</p>
            </div>
          </div>
          <div className="space-y-3">
            {MOCK_CLIENTS.slice(0, 3).map((client) => (
              <div key={client.id} className="bg-card border border-border rounded-lg p-5">
                <h3 className="font-medium text-foreground">{client.name}</h3>
              </div>
            ))}
          </div>
        </div>
        {/* modal overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-50">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl flex flex-col" style={{ height: "80%" }}>
            {/* modal header */}
            <div className="border-b border-border px-4 py-3 shrink-0 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <button onClick={() => setClientChatsOpen(!clientChatsOpen)} className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-background text-sm text-foreground hover:bg-accent transition-colors">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate max-w-[160px]">{selectedClient.name}</span>
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  {clientChatsOpen && (
                    <div className="absolute top-full left-0 mt-1 w-64 bg-popover border border-border rounded-lg shadow-lg z-50 py-1">
                      <button className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-accent flex items-center gap-2">
                        <Plus className="h-4 w-4" /> {t('common.newChat')}
                      </button>
                      <div className="border-t border-border my-1" />
                      {[selectedClient.name, "Follow-up query"].map((c, i) => (
                        <button key={i} onClick={() => setClientChatsOpen(false)} className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-accent flex items-center justify-between group">
                          <span className="truncate">{c}</span>
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <button onClick={() => setLyraOpen(false)} className="p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            {/* chat area */}
            <div className="flex-1 overflow-hidden">
              <ChatPane
                messages={clientMsgs}
                input={clientInput}
                setInput={setClientInput}
                onSend={onClientSend}
                placeholder={t('clients.actions.talkToLyra')}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 overflow-y-auto h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t('clients.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('clients.count', { count: MOCK_CLIENTS.length })}
          </p>
        </div>
        <button className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity">
          <Plus className="h-4 w-4" /> {t('clients.new')}
        </button>
      </div>

      {/* Search + filters */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('clients.search')}
            className="w-full bg-accent/50 border border-border rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <div className="flex items-center gap-1 bg-accent/50 border border-border rounded-md p-0.5">
          {([
            { key: "todos" as const, label: t('clients.statusAll') },
            { key: "abierto" as const, label: t('clients.statusOpen') },
            { key: "finalizado" as const, label: t('clients.statusClosed') },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                statusFilter === key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Client cards */}
      <div className="space-y-3">
        {filtered.map((client, index) => (
          <div
            key={client.id}
            className={`bg-card border border-border rounded-lg p-5 flex items-center justify-between ${
              isVisible ? "animate-slide-up" : "opacity-0"
            }`}
            style={{ animationDelay: `${index * 75}ms` }}
          >
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-foreground truncate">{client.name}</h3>
              <div className="flex gap-4 mt-1">
                <span className="text-xs text-muted-foreground">{client.email}</span>
                <span className="text-xs text-muted-foreground">{client.phone}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-4">
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  client.status === "abierto"
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {client.status === "abierto" ? t('clients.statusOpen') : t('clients.statusClosed')}
              </span>
              <button
                onClick={() => { setSelectedClient(client); setLyraOpen(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent hover:bg-accent/80 text-foreground text-xs font-medium transition-colors"
              >
                <MessageSquare className="h-3.5 w-3.5" /> {t('clients.actions.talkToLyra')}
              </button>
              <button className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                <FolderOpen className="h-4 w-4" />
              </button>
              <button className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                <Info className="h-4 w-4" />
              </button>
              <button className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                <Pencil className="h-4 w-4" />
              </button>
              <button className="p-2 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">{t('clients.noResults')}</p>
        )}
      </div>
    </div>
  );
};

// ── DashboardPane ────────────────────────────────────────────────────────────
const DashboardPane = () => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(false);
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  const cards = [
    { icon: Users, label: t('dashboard.stats.clients'), value: 12 },
    { icon: Shield, label: t('dashboard.stats.defenses'), value: 8 },
    { icon: FileSignature, label: t('dashboard.stats.contracts'), value: 24 },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">{t('dashboard.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('dashboard.subtitle')}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map((card, index) => (
          <div
            key={index}
            className={`${isVisible ? "animate-slide-up" : "opacity-0"}`}
            style={{ animationDelay: `${index * 75}ms` }}
          >
            <div className="bg-card border border-border rounded-lg p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{card.label}</span>
                <card.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-3xl font-semibold font-mono text-foreground">{card.value}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── AppDemo ───────────────────────────────────────────────────────────────────
const AppDemo = () => {
  const { t } = useTranslation();
  const [module, setModule] = useState<Module>("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [isDark, setIsDark] = useState(true);

  // — clients
  const [selectedClient, setSelectedClient] = useState<
    (typeof MOCK_CLIENTS)[0] | null
  >(null);
  const [clientMsgs, setClientMsgs] = useState<Msg[]>(CLIENT_CHAT);
  const [clientInput, setClientInput] = useState("");

  // — contracts
  const [selectedBase, setSelectedBase] = useState<
    (typeof CONTRACT_BASES)[0]
  >(CONTRACT_BASES[0]);
  const [contractMsgs, setContractMsgs] = useState<Msg[]>(CONTRACT_CHAT);
  const [contractInput, setContractInput] = useState("");
  const [contractSelector, setContractSelector] = useState(false);
  const [contractChatsOpen, setContractChatsOpen] = useState(false);

  // — documents
  const [selectedDoc, setSelectedDoc] = useState<(typeof SUMMARY_DOCS)[0]>(
    SUMMARY_DOCS[0]
  );
  const [docMsgs, setDocMsgs] = useState<Msg[]>(DOCUMENTS_CHAT);
  const [docInput, setDocInput] = useState("");
  const [docSelector, setDocSelector] = useState(false);

  // — assistant
  const [assistMsgs, setAssistMsgs] = useState<Msg[]>(ASSISTANT_CHAT);
  const [assistInput, setAssistInput] = useState("");
  const [assistChatsOpen, setAssistChatsOpen] = useState(false);

  // — defense
  const [defenseMsgs, setDefenseMsgs] = useState<Msg[]>(DEFENSE_CHAT);
  const [defenseInput, setDefenseInput] = useState("");
  const [defenseChatsOpen, setDefenseChatsOpen] = useState(false);

  // — writing
  const [writingMsgs, setWritingMsgs] = useState<Msg[]>(WRITING_CHAT);
  const [writingInput, setWritingInput] = useState("");
  const [writingSelector, setWritingSelector] = useState(false);
  const [writingSuggestion, setWritingSuggestion] = useState<number | null>(null);
  const [writingApplied, setWritingApplied] = useState<Set<number>>(new Set());

  // — fiscal
  const [fiscalMsgs, setFiscalMsgs] = useState<Msg[]>(FISCAL_CHAT);
  const [fiscalInput, setFiscalInput] = useState("");
  const [fiscalTab, setFiscalTab] = useState<"queries" | "alerts">("queries");
  const [fiscalChatsOpen, setFiscalChatsOpen] = useState(false);

  // — automations
  const [autoView, setAutoView] = useState<"main" | "detail">("main");
  const [autoTab, setAutoTab] = useState<"email" | "whatsapp">("email");
  const [selEmail, setSelEmail] = useState<(typeof EMAIL_CONVERSATIONS)[0]>(
    EMAIL_CONVERSATIONS[0]
  );
  const [emailMsgs, setEmailMsgs] = useState(EMAIL_MESSAGES_INIT);
  const [emailInputs, setEmailInputs] = useState<Record<string, string>>({});
  const [selWA, setSelWA] = useState<(typeof WA_CONTACTS)[0]>(WA_CONTACTS[0]);
  const [waMsgs, setWaMsgs] = useState(WA_MESSAGES_INIT);
  const [waInputs, setWaInputs] = useState<Record<number, string>>({});

  const sendMsg = (
    msgs: Msg[],
    setMsgs: React.Dispatch<React.SetStateAction<Msg[]>>,
    input: string,
    setInput: (v: string) => void
  ) => {
    if (!input.trim()) return;
    setMsgs([
      ...msgs,
      { id: Date.now().toString(), role: "user", content: input.trim() },
    ]);
    setInput("");
  };

  const navItems: { id: Module; icon: React.ElementType; label: string }[] = [
    { id: "dashboard", icon: LayoutDashboard, label: t('nav.dashboard') },
    { id: "clients", icon: Users, label: t('nav.clients') },
    { id: "documents", icon: FileText, label: t('nav.documents') },
    { id: "contracts", icon: FileSignature, label: t('nav.contracts') },
    { id: "assistant", icon: MessageSquare, label: t('nav.assistant') },
    { id: "defense", icon: Shield, label: t('nav.defense') },
    { id: "writing", icon: PenTool, label: t('nav.writing') },
    { id: "fiscal", icon: Calculator, label: t('nav.fiscal') },
    { id: "automations", icon: Zap, label: t('nav.automations') },
  ];

  // ── Module renderers ────────────────────────────────────────────────────────
  const renderDashboard = () => (
    <DashboardPane />
  );

  const renderClients = () => (
    <ClientsPane
      selectedClient={selectedClient}
      setSelectedClient={setSelectedClient}
      clientMsgs={clientMsgs}
      clientInput={clientInput}
      setClientInput={setClientInput}
      onClientSend={() => sendMsg(clientMsgs, setClientMsgs, clientInput, setClientInput)}
    />
  );

  const renderContracts = () => (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar with buttons — mirrors real Contracts.tsx */}
      <div className="border-b border-border px-6 py-3 flex items-center justify-end gap-2 shrink-0">
        {/* Chats dropdown */}
        <div className="relative mr-auto">
          <button onClick={() => setContractChatsOpen(!contractChatsOpen)} className="flex items-center gap-2 bg-accent text-foreground px-3 py-1.5 rounded-md text-xs font-medium hover:bg-accent/80 transition-colors">
            <MessageSquare className="h-3.5 w-3.5" /> {t('contracts.chats')}
          </button>
          {contractChatsOpen && (
            <div className="absolute left-0 top-full mt-1 w-72 bg-card border border-border rounded-lg shadow-lg z-10 overflow-hidden">
              <div className="p-2 border-b border-border">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input placeholder={t('common.searchChats')} className="w-full pl-7 pr-2 py-1.5 text-xs bg-accent/50 border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring text-foreground placeholder:text-muted-foreground" />
                </div>
              </div>
              <button className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-foreground hover:bg-accent transition-colors border-b border-border">
                <Plus className="h-3.5 w-3.5" /> {t('contracts.newChat')}
              </button>
              <div className="max-h-[220px] overflow-y-auto">
                <div className="px-3 py-2.5 bg-accent/50 border-b border-border/50">
                  <span className="text-xs font-medium text-foreground truncate block">{selectedBase.name} — NDA</span>
                  <p className="text-[9px] text-muted-foreground/70 mt-0.5">02/03/2026 14:30</p>
                </div>
              </div>
            </div>
          )}
        </div>
        {/* Upload button */}
        <button className="flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-xs font-medium hover:opacity-90 transition-opacity">
          <Upload className="h-3.5 w-3.5" /> {t('contracts.upload')}
        </button>
        {/* Logo button */}
        <button className="flex items-center gap-2 bg-accent text-foreground px-3 py-1.5 rounded-md text-xs font-medium hover:opacity-90 transition-opacity">
          <Image className="h-3.5 w-3.5" /> {t('contracts.uploadLogo')}
        </button>
        {/* Info button */}
        <button className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
          <Info className="h-4 w-4" />
        </button>
        {/* Contract base selector dropdown */}
        <div className="relative">
          <button onClick={() => setContractSelector(!contractSelector)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent hover:bg-accent/80 text-xs font-medium text-foreground transition-colors">
            {selectedBase.name} <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {contractSelector && (
            <div className="absolute right-0 top-full mt-1 w-64 bg-card border border-border rounded-lg shadow-lg z-10 overflow-hidden">
              <div className="px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{t('contracts.templatesLabel')}</div>
              {CONTRACT_BASES.map((cb) => (
                <button key={cb.id} onClick={() => { setSelectedBase(cb); setContractSelector(false); }} className={`w-full text-left px-4 py-2.5 text-sm hover:bg-accent transition-colors ${selectedBase.id === cb.id ? "bg-accent" : ""}`}>
                  <span className="block truncate font-medium text-foreground">{cb.name}</span>
                  <span className="text-[10px] text-muted-foreground">{cb.summary}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* Chat */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b border-border px-6 py-4 shrink-0">
          <h2 className="text-base font-semibold text-foreground">{selectedBase.name}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{selectedBase.summary}</p>
        </div>
        <div className="flex-1 overflow-hidden">
          <ChatPane messages={contractMsgs} input={contractInput} setInput={setContractInput} onSend={() => sendMsg(contractMsgs, setContractMsgs, contractInput, setContractInput)} placeholder="Generate a contract using this base..." />
        </div>
      </div>
    </div>
  );

  const renderDocuments = () => (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="border-b border-border px-6 py-3 flex items-center gap-2 shrink-0">
        <div className="relative mr-auto">
          <button
            onClick={() => setDocSelector(!docSelector)}
            className="flex items-center gap-2 bg-accent text-foreground px-3 py-1.5 rounded-md text-xs font-medium hover:bg-accent/80 transition-colors"
          >
            <MessageSquare className="h-3.5 w-3.5" /> {t('documents.chats')}
          </button>
          {docSelector && (
            <div className="absolute left-0 top-full mt-1 w-72 bg-card border border-border rounded-lg shadow-lg z-10 overflow-hidden">
              <div className="p-2 border-b border-border">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input placeholder={t('documents.searchChats')} className="w-full pl-7 pr-2 py-1.5 text-xs bg-accent/50 border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring text-foreground placeholder:text-muted-foreground" />
                </div>
              </div>
              <button className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-foreground hover:bg-accent transition-colors border-b border-border">
                <Plus className="h-3.5 w-3.5" /> {t('documents.newChat')}
              </button>
              <div className="max-h-[220px] overflow-y-auto">
                {SUMMARY_DOCS.map((doc) => (
                  <button
                    key={doc.id}
                    onClick={() => { setSelectedDoc(doc); setDocSelector(false); }}
                    className={`group w-full text-left px-3 py-2.5 hover:bg-accent transition-colors border-b border-border/50 ${selectedDoc.id === doc.id ? "bg-accent/50" : ""}`}
                  >
                    <span className="text-xs font-medium text-foreground truncate block">{doc.title}</span>
                    <p className="text-[9px] text-muted-foreground/70 mt-0.5">{doc.date}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Chat */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b border-border px-6 py-4 shrink-0">
          <h2 className="text-base font-semibold text-foreground">{selectedDoc.title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Uploaded {selectedDoc.date}</p>
        </div>
        <div className="flex-1 overflow-hidden">
          <ChatPane messages={docMsgs} input={docInput} setInput={setDocInput} onSend={() => sendMsg(docMsgs, setDocMsgs, docInput, setDocInput)} placeholder="Ask about this document..." />
        </div>
      </div>
    </div>
  );

  const renderAssistant = () => (
    <div className="flex flex-col h-full overflow-hidden">
      {/* top bar */}
      <div className="border-b border-border px-4 py-2 shrink-0 flex items-center gap-2">
        <div className="relative">
          <button onClick={() => setAssistChatsOpen(!assistChatsOpen)} className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-card text-sm text-foreground hover:bg-accent transition-colors">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <span className="max-w-[180px] truncate">{t('assistant.conversations')}</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          {assistChatsOpen && (
            <div className="absolute top-full left-0 mt-1 w-72 bg-popover border border-border rounded-lg shadow-lg z-50 py-1">
              <div className="px-3 py-2">
                <input className="w-full text-xs bg-muted border border-border rounded px-2 py-1.5 text-foreground placeholder:text-muted-foreground" placeholder={t('common.searchChats')} />
              </div>
              <button className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-accent flex items-center gap-2">
                <Plus className="h-4 w-4" /> {t('assistant.newChat')}
              </button>
              <div className="border-t border-border my-1" />
              {["General consultation", "Contract review help", "Tax planning"].map((c, i) => (
                <button key={i} onClick={() => setAssistChatsOpen(false)} className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-accent flex items-center justify-between group">
                  <span className="truncate">{c}</span>
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1" />
        <div className="text-xs text-muted-foreground">{t('assistant.subtitle')}</div>
      </div>
      {/* chat */}
      <div className="flex-1 overflow-hidden">
        <ChatPane
          messages={assistMsgs}
          input={assistInput}
          setInput={setAssistInput}
          onSend={() => sendMsg(assistMsgs, setAssistMsgs, assistInput, setAssistInput)}
          placeholder={t('assistant.placeholder')}
        />
      </div>
    </div>
  );

  const renderDefense = () => (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar — mirrors real DefensePrep.tsx */}
      <div className="border-b border-border px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          {/* Chats dropdown */}
          <div className="relative">
            <button onClick={() => setDefenseChatsOpen(!defenseChatsOpen)} className="flex items-center gap-2 bg-accent text-foreground px-3 py-1.5 rounded-md text-xs font-medium hover:bg-accent/80 transition-colors">
              <MessageSquare className="h-3.5 w-3.5" /> {t('defense.chats')}
            </button>
            {defenseChatsOpen && (
              <div className="absolute left-0 top-full mt-1 w-80 bg-card border border-border rounded-lg shadow-lg z-10 overflow-hidden">
                <div className="p-2 border-b border-border">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input placeholder={t('common.searchChats')} className="w-full pl-7 pr-2 py-1.5 text-xs bg-accent/50 border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring text-foreground placeholder:text-muted-foreground" />
                  </div>
                </div>
                <button className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-foreground hover:bg-accent transition-colors border-b border-border">
                  <Plus className="h-3.5 w-3.5" /> {t('defense.newChat')}
                </button>
                <div className="max-h-[220px] overflow-y-auto">
                  <div className="px-3 py-2.5 bg-accent/50 border-b border-border/50">
                    <div className="flex items-center gap-1.5 mb-1">
                      <BookMarked className="h-3 w-3 text-green-600 flex-shrink-0" />
                      <span className="text-xs font-medium text-foreground truncate">López vs. Empresa SL</span>
                    </div>
                    <p className="text-[9px] text-muted-foreground/70">02/03/2026 12:45</p>
                  </div>
                </div>
              </div>
            )}
          </div>
          {/* Saved strategies */}
          <button className="flex items-center gap-2 bg-green-600 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-green-700 transition-colors">
            <BookMarked className="h-3.5 w-3.5" /> 1 {t('defense.savedStrategiesBtn', { count: 1 })}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 bg-accent text-foreground px-3 py-1.5 rounded-md text-xs font-medium hover:bg-accent/80 transition-colors">
            <Download className="h-3.5 w-3.5" /> {t('defense.exportToClient')}
          </button>
          <button className="flex items-center gap-2 bg-accent text-foreground px-3 py-1.5 rounded-md text-xs font-medium hover:bg-accent/80 transition-colors">
            <Upload className="h-3.5 w-3.5" /> {t('defense.importClient')}
          </button>
          <button className="flex items-center gap-2 bg-accent text-foreground px-3 py-1.5 rounded-md text-xs font-medium hover:bg-accent/80 transition-colors">
            <Paperclip className="h-3.5 w-3.5" /> PDF
          </button>
        </div>
      </div>
      {/* Chat header + main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b border-border px-6 py-4 shrink-0">
          <h2 className="text-xl font-semibold text-foreground">{t('defense.title')}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t('defense.subtitle')}</p>
        </div>
        <div className="flex-1 overflow-hidden">
          <ChatPane messages={defenseMsgs} input={defenseInput} setInput={setDefenseInput} onSend={() => sendMsg(defenseMsgs, setDefenseMsgs, defenseInput, setDefenseInput)} placeholder={t('defense.placeholder')} />
        </div>
      </div>
    </div>
  );

  const renderWriting = () => (
    <div className="flex flex-col h-full overflow-hidden">
      {/* top toolbar */}
      <div className="border-b border-border px-4 py-2 shrink-0 flex items-center gap-2 flex-wrap">
        {/* text selector dropdown */}
        <div className="relative">
          <button onClick={() => setWritingSelector(!writingSelector)} className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-card text-sm text-foreground hover:bg-accent transition-colors">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="max-w-[180px] truncate">Employment contract — Draft</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          {writingSelector && (
            <div className="absolute top-full left-0 mt-1 w-64 bg-popover border border-border rounded-lg shadow-lg z-50 py-1">
              <button className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-accent flex items-center gap-2">
                <Plus className="h-4 w-4" /> {t('writing.newDocument')}
              </button>
              <div className="border-t border-border my-1" />
              {["Employment contract — Draft", "NDA — Review", "Rental agreement — Final"].map((doc, i) => (
                <button key={i} onClick={() => setWritingSelector(false)} className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-accent truncate">{doc}</button>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1" />
        {/* action buttons */}
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors">
          <Save className="h-4 w-4" /> {t('writing.saveBtn')}
        </button>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm text-foreground hover:bg-accent transition-colors">
          <Eye className="h-4 w-4" /> {t('writing.reviewBtn')}
        </button>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-destructive/50 text-sm text-destructive hover:bg-destructive/10 transition-colors">
          <Trash2 className="h-4 w-4" /> {t('common.delete')}
        </button>
      </div>
      {/* formatting toolbar */}
      <div className="border-b border-border px-4 py-1.5 shrink-0 flex items-center gap-1">
        <button className="p-1.5 rounded hover:bg-accent transition-colors"><Bold className="h-4 w-4 text-foreground" /></button>
        <button className="p-1.5 rounded hover:bg-accent transition-colors"><Italic className="h-4 w-4 text-foreground" /></button>
        <button className="p-1.5 rounded hover:bg-accent transition-colors"><Underline className="h-4 w-4 text-foreground" /></button>
        <div className="w-px h-5 bg-border mx-1" />
        <button className="p-1.5 rounded hover:bg-accent transition-colors"><List className="h-4 w-4 text-foreground" /></button>
        <button className="p-1.5 rounded hover:bg-accent transition-colors"><ListOrdered className="h-4 w-4 text-foreground" /></button>
        <div className="w-px h-5 bg-border mx-1" />
        <button className="p-1.5 rounded hover:bg-accent transition-colors"><AlignLeft className="h-4 w-4 text-foreground" /></button>
        <div className="w-px h-5 bg-border mx-1" />
        <select className="text-xs bg-card border border-border rounded px-2 py-1 text-foreground">
          <option>{t('writing.styleNormal')}</option>
          <option>{t('writing.styleH1')}</option>
          <option>{t('writing.styleH2')}</option>
          <option>{t('writing.styleH3')}</option>
        </select>
      </div>
      {/* editor content */}
      <div className="flex-1 overflow-y-auto p-6 bg-muted/30">
        <div className="max-w-3xl mx-auto bg-white dark:bg-card min-h-[400px] shadow-lg rounded-lg border border-border p-8 relative">
          <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
            {(() => {
              let text = MOCK_WRITING_TEXT;
              const parts: React.ReactNode[] = [];
              let lastIndex = 0;
              // Build sorted list of suggestions in text order
              const sorted = WRITING_SUGGESTIONS.map(s => ({
                ...s,
                start: text.indexOf(writingApplied.has(s.id) ? s.suggestion : s.original)
              })).filter(s => s.start >= 0).sort((a, b) => a.start - b.start);
              sorted.forEach((s) => {
                const target = writingApplied.has(s.id) ? s.suggestion : s.original;
                const idx = text.indexOf(target, lastIndex);
                if (idx < 0) return;
                if (idx > lastIndex) parts.push(text.slice(lastIndex, idx));
                parts.push(
                  <span
                    key={s.id}
                    onClick={() => setWritingSuggestion(writingSuggestion === s.id ? null : s.id)}
                    className={`bg-yellow-200 dark:bg-yellow-300/30 underline decoration-yellow-400 decoration-2 underline-offset-2 cursor-pointer hover:bg-yellow-300 dark:hover:bg-yellow-400/40 transition-colors rounded-sm px-0.5 ${writingSuggestion === s.id ? 'ring-2 ring-yellow-400' : ''}`}
                  >
                    {target}
                  </span>
                );
                lastIndex = idx + target.length;
              });
              if (lastIndex < text.length) parts.push(text.slice(lastIndex));
              return parts;
            })()}
          </div>
          {/* Suggestion popup */}
          {writingSuggestion !== null && (() => {
            const s = WRITING_SUGGESTIONS.find(s => s.id === writingSuggestion);
            if (!s) return null;
            const applied = writingApplied.has(s.id);
            return (
              <div className="absolute left-1/2 -translate-x-1/2 bottom-4 w-[90%] max-w-lg bg-popover border border-border rounded-lg shadow-xl z-50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Eye className="h-4 w-4 text-yellow-500" />
                    {t('writing.suggestionTitle')}
                  </h4>
                  <button onClick={() => setWritingSuggestion(null)} className="text-muted-foreground hover:text-foreground transition-colors">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-2 text-xs">
                  <div>
                    <span className="font-medium text-muted-foreground">{t('writing.originalText')}</span>
                    <p className="mt-0.5 text-foreground bg-destructive/10 rounded px-2 py-1.5 line-through">{s.original}</p>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">{t('writing.suggestedText')}</span>
                    <p className="mt-0.5 text-foreground bg-primary/10 rounded px-2 py-1.5">{s.suggestion}</p>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">{t('writing.reason')}</span>
                    <p className="mt-0.5 text-muted-foreground italic">{s.reason}</p>
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setWritingSuggestion(null)}
                    className="px-3 py-1.5 text-xs rounded-md border border-border text-foreground hover:bg-accent transition-colors"
                  >
                    {t('common.close')}
                  </button>
                  <button
                    onClick={() => {
                      if (applied) {
                        setWritingApplied(prev => { const n = new Set(prev); n.delete(s.id); return n; });
                      } else {
                        setWritingApplied(prev => new Set(prev).add(s.id));
                      }
                      setWritingSuggestion(null);
                    }}
                    className="px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    {applied ? t('common.cancel') : t('writing.change')}
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );

  const renderFiscal = () => (
    <div className="flex flex-col h-full overflow-hidden">
      {/* header */}
      <div className="border-b border-border px-6 py-4 shrink-0">
        <h2 className="text-xl font-semibold text-foreground">{t('fiscal.title')}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t('fiscal.chatDesc')}</p>
      </div>
      {/* tabs */}
      <div className="border-b border-border px-6 shrink-0 flex gap-4">
        <button onClick={() => setFiscalTab("queries")} className={`py-2.5 text-sm font-medium border-b-2 transition-colors ${fiscalTab === "queries" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
          {t('fiscal.tabConsultas')}
        </button>
        <button onClick={() => setFiscalTab("alerts")} className={`py-2.5 text-sm font-medium border-b-2 transition-colors ${fiscalTab === "alerts" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
          {t('fiscal.tabAlertas')}
        </button>
      </div>
      {fiscalTab === "queries" ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* chat selector bar */}
          <div className="border-b border-border px-4 py-2 shrink-0 flex items-center gap-2 flex-wrap">
            <div className="relative">
              <button onClick={() => setFiscalChatsOpen(!fiscalChatsOpen)} className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-card text-sm text-foreground hover:bg-accent transition-colors">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <span className="max-w-[180px] truncate">IRPF Freelancer 2025</span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              {fiscalChatsOpen && (
                <div className="absolute top-full left-0 mt-1 w-72 bg-popover border border-border rounded-lg shadow-lg z-50 py-1">
                  <div className="px-3 py-2">
                    <input className="w-full text-xs bg-muted border border-border rounded px-2 py-1.5 text-foreground placeholder:text-muted-foreground" placeholder={t('common.searchChats')} />
                  </div>
                  <button className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-accent flex items-center gap-2">
                    <Plus className="h-4 w-4" /> {t('common.newChat')}
                  </button>
                  <div className="border-t border-border my-1" />
                  {["IRPF Freelancer 2025", "Corporate Tax Q4", "VAT Consultation"].map((c, i) => (
                    <button key={i} onClick={() => setFiscalChatsOpen(false)} className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-accent flex items-center justify-between group">
                      <span className="truncate">{c}</span>
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* client selector */}
            <select className="text-xs bg-card border border-border rounded px-2 py-1.5 text-foreground">
              <option>{t('fiscal.allClients')}</option>
              <option>García López, S.L.</option>
              <option>Tech Solutions Inc.</option>
            </select>
            <div className="flex-1" />
            <button className="p-1.5 rounded-md hover:bg-accent transition-colors text-destructive">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          {/* chat */}
          <div className="flex-1 overflow-hidden">
            <ChatPane
              messages={fiscalMsgs}
              input={fiscalInput}
              setInput={setFiscalInput}
              onSend={() => sendMsg(fiscalMsgs, setFiscalMsgs, fiscalInput, setFiscalInput)}
              placeholder={t('fiscal.chatPlaceholder')}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* alerts header */}
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-semibold text-foreground">{t('fiscal.alertsTitle')}</h2>
              <p className="text-sm text-muted-foreground">{t('fiscal.alertsDesc')}</p>
            </div>
            <div className="flex gap-2">
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors">
                <Plus className="h-3.5 w-3.5" /> {t('fiscal.newAlert')}
              </button>
            </div>
          </div>
          {/* search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input className="w-full pl-9 pr-3 py-2 text-sm bg-accent/50 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" placeholder={t('fiscal.searchAlerts')} />
          </div>
          {/* alert cards */}
          <div className="space-y-4">
            {[
              { subject: "IRPF Filing Deadline", recipients: 8, freq: "Quarterly", date: "2026-03-15", msg: "Reminder: quarterly IRPF installment payment due in 15 days. Please prepare the necessary documentation." },
              { subject: "Corporate Tax Q4", recipients: 3, freq: "Annual", date: "2026-04-01", msg: "Annual corporate tax filing period opens soon. Ensure all accounting records are up to date." },
              { subject: "VAT Regulation Update", recipients: 12, freq: "Once", date: "2026-02-28", msg: "New VAT rules effective next quarter. Review client billing configurations accordingly." },
            ].map((alert, i) => (
              <div key={i} className="bg-card border border-border rounded-lg overflow-hidden">
                <div className="px-5 py-4 flex justify-between items-start">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{alert.subject}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{alert.recipients} recipients · {alert.freq} · {alert.date}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <button className="px-2.5 py-1 rounded-md border border-border text-xs text-foreground hover:bg-accent transition-colors">{t('fiscal.editAlert')}</button>
                    <button className="px-2.5 py-1 rounded-md bg-destructive text-destructive-foreground text-xs hover:bg-destructive/90 transition-colors">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <div className="px-5 pb-4">
                  <p className="text-xs text-muted-foreground">{alert.msg}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderAutomations = () => {
    // Main view: 3 cards
    if (autoView === "main") return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="border-b border-border px-6 py-4 shrink-0">
          <h2 className="text-xl font-semibold text-foreground">{t('nav.automations')}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t('automations.manageChannels')}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-3 gap-6 max-w-4xl mx-auto">
            {/* Email card */}
            <div className="space-y-3">
              <div className="border border-border rounded-lg p-6 bg-card">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center"><Mail className="h-5 w-5 text-foreground" /></div>
                  <div><h3 className="text-sm font-semibold text-foreground">{t('automations.email')}</h3><p className="text-xs text-muted-foreground">{t('automations.emailDesc')}</p></div>
                </div>
                <button onClick={() => { setAutoTab("email"); setAutoView("detail"); }} className="w-full px-4 py-2 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 transition-opacity">{t('automations.access')}</button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="border border-border rounded-md p-3 bg-card text-center"><p className="text-lg font-semibold text-foreground font-mono">24</p><p className="text-[10px] text-muted-foreground mt-0.5">{t('automations.messages')}</p></div>
                <div className="border border-border rounded-md p-3 bg-card text-center"><p className="text-lg font-semibold text-foreground font-mono">3</p><p className="text-[10px] text-muted-foreground mt-0.5">{t('automations.conversations')}</p></div>
                <div className="border border-border rounded-md p-3 bg-card text-center"><p className="text-lg font-semibold text-foreground font-mono">2</p><p className="text-[10px] text-muted-foreground mt-0.5">{t('automations.unread')}</p></div>
              </div>
            </div>
            {/* WhatsApp card */}
            <div className="space-y-3">
              <div className="border border-border rounded-lg p-6 bg-card">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center"><MessageCircle className="h-5 w-5 text-foreground" /></div>
                  <div><h3 className="text-sm font-semibold text-foreground">{t('automations.whatsapp')}</h3><p className="text-xs text-muted-foreground">{t('automations.instantMsg')}</p></div>
                </div>
                <button className="w-full px-4 py-2 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 transition-opacity">{t('automations.comingSoon')}</button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="border border-border rounded-md p-3 bg-card text-center"><p className="text-lg font-semibold text-foreground font-mono">1253</p><p className="text-[10px] text-muted-foreground mt-0.5">{t('automations.messages')}</p></div>
                <div className="border border-border rounded-md p-3 bg-card text-center"><p className="text-lg font-semibold text-foreground font-mono">89</p><p className="text-[10px] text-muted-foreground mt-0.5">{t('automations.conversations')}</p></div>
                <div className="border border-border rounded-md p-3 bg-card text-center"><p className="text-lg font-semibold text-foreground font-mono">4</p><p className="text-[10px] text-muted-foreground mt-0.5">{t('automations.unread')}</p></div>
              </div>
            </div>
            {/* Calendar card */}
            <div className="space-y-3">
              <div className="border border-border rounded-lg p-6 bg-card">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center"><Calendar className="h-5 w-5 text-foreground" /></div>
                  <div><h3 className="text-sm font-semibold text-foreground">{t('automations.calendar')}</h3><p className="text-xs text-muted-foreground">{t('automations.calendarDesc')}</p></div>
                </div>
                <button disabled className="w-full px-4 py-2 bg-muted text-muted-foreground rounded-md text-sm font-medium cursor-not-allowed">{t('automations.comingSoon')}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );

    // Detail view: conversation list + messages
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* top bar — matches real Automations.tsx */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setAutoView("main")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ChevronDown className="h-4 w-4 rotate-90" /> {t('common.back')}
            </button>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-foreground" />
              <span className="text-sm font-semibold text-foreground">{t('automations.email')}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-card hover:bg-accent text-foreground transition-colors">
              <Users className="h-3.5 w-3.5" /> {t('automations.autoAssign')}
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-card hover:bg-accent text-foreground transition-colors">
              <HelpCircle className="h-3.5 w-3.5" /> {t('automations.frequentQueriesTab')}
            </button>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{t('automations.autoReply')}</span>
              <div className="w-8 h-4 rounded-full bg-primary relative cursor-pointer">
                <div className="absolute right-0.5 top-0.5 w-3 h-3 rounded-full bg-primary-foreground" />
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-1 min-h-0">
          {/* left list */}
          <div className="w-72 border-r border-border bg-card flex flex-col shrink-0">
            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input className="w-full pl-9 pr-3 py-2 text-sm bg-muted/50 border-none rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" placeholder={t('automations.searchConversation')} />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {EMAIL_CONVERSATIONS.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => setSelEmail(conv)}
                  className={`group w-full text-left p-3 border-b border-border/50 hover:bg-accent/50 transition-colors ${selEmail.id === conv.id ? "bg-accent" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <span className="text-xs font-semibold text-foreground">{conv.name.split(" ").map((n: string) => n[0]).join("").substring(0, 2)}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{conv.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{conv.lastMsg}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[10px] text-muted-foreground">{conv.time}</span>
                      {conv.unread > 0 && (
                        <span className="h-4 min-w-4 px-1 rounded-full bg-foreground text-background text-[10px] font-bold flex items-center justify-center">{conv.unread}</span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* right panel */}
          <div className="flex-1 flex flex-col bg-background overflow-hidden">
            {selEmail && (
              <>
                {/* conversation header */}
                <div className="flex items-center justify-between p-4 border-b border-border bg-card">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                      <span className="text-xs font-semibold text-foreground">{selEmail.name.split(" ").map((n: string) => n[0]).join("").substring(0, 2)}</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{selEmail.name}</p>
                      <p className="text-[11px] text-muted-foreground">{selEmail.subject}</p>
                    </div>
                  </div>
                </div>
                {/* messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {(emailMsgs[selEmail.id] || []).map((msg, i) => (
                    <div key={i} className={`flex ${msg.sent ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[70%] px-3 py-2 rounded-lg text-sm ${msg.sent ? "bg-foreground text-background rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"}`}>
                        <p>{msg.text}</p>
                        <p className={`text-[10px] mt-1 ${msg.sent ? "text-background/60" : "text-muted-foreground"}`}>{msg.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {/* input */}
                <div className="p-3 border-t border-border bg-card">
                  <div className="flex items-center gap-2">
                    <button className="p-2 rounded-md hover:bg-accent text-muted-foreground"><Paperclip className="h-4 w-4" /></button>
                    <input
                      value={emailInputs[selEmail.id] || ""}
                      onChange={(e) => setEmailInputs((prev) => ({ ...prev, [selEmail.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const text = (emailInputs[selEmail.id] || "").trim();
                          if (!text) return;
                          setEmailMsgs((prev) => ({ ...prev, [selEmail.id]: [...(prev[selEmail.id] || []), { from: "You", text, time: "Now", sent: true }] }));
                          setEmailInputs((prev) => ({ ...prev, [selEmail.id]: "" }));
                        }
                      }}
                      placeholder={t('automations.writeMessage')}
                      className="flex-1 px-3 py-2 text-sm bg-muted/50 border-none rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <button
                      onClick={() => {
                        const text = (emailInputs[selEmail.id] || "").trim();
                        if (!text) return;
                        setEmailMsgs((prev) => ({ ...prev, [selEmail.id]: [...(prev[selEmail.id] || []), { from: "You", text, time: "Now", sent: true }] }));
                        setEmailInputs((prev) => ({ ...prev, [selEmail.id]: "" }));
                      }}
                      className="p-2 rounded-md bg-foreground text-background hover:opacity-90 transition-opacity"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderModule = () => {
    switch (module) {
      case "dashboard":    return renderDashboard();
      case "clients":     return renderClients();
      case "contracts":   return renderContracts();
      case "documents":   return renderDocuments();
      case "assistant":   return renderAssistant();
      case "defense":     return renderDefense();
      case "writing":     return renderWriting();
      case "fiscal":      return renderFiscal();
      case "automations": return renderAutomations();
      default:            return null;
    }
  };

  // ── Light-mode CSS variables (needed because the landing page is always dark,
  // so removing the "dark" class alone doesn't override inherited custom props) ──
  const lightVars: React.CSSProperties | undefined = isDark
    ? undefined
    : ({
        "--background": "0 0% 98%",
        "--foreground": "0 0% 8%",
        "--card": "0 0% 100%",
        "--card-foreground": "0 0% 8%",
        "--popover": "0 0% 100%",
        "--popover-foreground": "0 0% 8%",
        "--primary": "0 0% 9%",
        "--primary-foreground": "0 0% 98%",
        "--secondary": "0 0% 94%",
        "--secondary-foreground": "0 0% 15%",
        "--muted": "0 0% 95%",
        "--muted-foreground": "0 0% 45%",
        "--accent": "0 0% 92%",
        "--accent-foreground": "0 0% 9%",
        "--destructive": "0 72% 51%",
        "--destructive-foreground": "0 0% 98%",
        "--border": "0 0% 90%",
        "--input": "0 0% 90%",
        "--ring": "0 0% 9%",
        "--sidebar-background": "0 0% 100%",
        "--sidebar-foreground": "0 0% 25%",
        "--sidebar-primary": "0 0% 9%",
        "--sidebar-primary-foreground": "0 0% 98%",
        "--sidebar-accent": "0 0% 95%",
        "--sidebar-accent-foreground": "0 0% 9%",
        "--sidebar-border": "0 0% 92%",
        "--sidebar-ring": "0 0% 9%",
        "--stat-bg": "0 0% 100%",
        "--stat-border": "0 0% 90%",
        "--stat-value": "0 0% 9%",
        "--stat-label": "0 0% 50%",
        "--chat-user": "0 0% 9%",
        "--chat-user-foreground": "0 0% 98%",
        "--chat-ai": "0 0% 95%",
        "--chat-ai-foreground": "0 0% 15%",
      } as React.CSSProperties);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className={isDark ? "dark" : ""} style={lightVars}>
      <div className="flex h-[700px] rounded-2xl border border-white/10 bg-background overflow-hidden shadow-2xl">
        {/* Sidebar */}
        <aside
          className={`h-full border-r border-border bg-card flex flex-col transition-all duration-300 shrink-0 ${
            collapsed ? "w-16" : "w-64"
          }`}
        >
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div
              className={`flex items-center gap-3 overflow-hidden ${
                collapsed ? "justify-center w-full" : ""
              }`}
            >
              <Scale className="h-6 w-6 text-foreground shrink-0" />
              {!collapsed && (
                <div className="min-w-0">
                  <h1 className="text-lg font-semibold tracking-tight text-foreground leading-tight">
                    LexPanel
                  </h1>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    {t('sidebar.legalManagement')}
                  </p>
                </div>
              )}
            </div>
            {!collapsed && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setIsDark(!isDark)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title={isDark ? "Light mode" : "Dark mode"}
                >
                  {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => setCollapsed(true)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {collapsed && (
            <button
              onClick={() => setCollapsed(false)}
              className="mx-auto mt-3 text-muted-foreground hover:text-foreground transition-colors"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
          )}

          <nav
            className={`flex-1 space-y-1 overflow-y-auto ${
              collapsed ? "p-2 mt-1" : "p-4"
            }`}
          >
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setModule(item.id)}
                title={item.label}
                className={`w-full flex items-center gap-3 rounded-md text-sm font-medium transition-colors ${
                  collapsed
                    ? "justify-center px-2 py-2.5"
                    : "px-3 py-2.5"
                } ${
                  module === item.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && item.label}
              </button>
            ))}
          </nav>

          <div
            className={`border-t border-border ${
              collapsed ? "p-2" : "p-3"
            }`}
          >
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-hidden">{renderModule()}</main>
      </div>
    </div>
  );
};

export default AppDemo;
