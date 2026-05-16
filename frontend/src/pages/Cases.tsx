import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { authFetch } from '@/lib/authFetch';
import {
  Briefcase,
  Mail,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  X,
  Check,
  User,
  Search,
  Eye,
  Plus,
  Link,
  Send,
  Calendar,
  Tag,
  Trash2,
  StickyNote,
} from 'lucide-react';
import NewCaseModal from '@/components/NewCaseModal';
import ModuleGuide from "@/components/ModuleGuide";
import { Button } from "@/components/ui/button";
import SpecialtiesManagerModal from "@/components/SpecialtiesManagerModal";

interface ICase {
  _id: string;
  accountId: string;
  source: 'email' | 'whatsapp' | 'manual';
  sourceId: string;
  contactName: string;
  contactEmail?: string;
  contactPhone?: string;
  subject?: string;
  body: string;
  status: 'pending' | 'assigned' | 'closed' | 'rejected';
  especialidadName?: string;
  assignedSubaccountId?: string;
  assignedSubaccountName?: string;
  linkedClientId?: string;
  linkedClientName?: string;
  classificationType: string;
  createdAt: string;
  notes?: string;
}

interface IMessage {
  id: string;
  from: string;
  text: string;
  time: string;
  sent: boolean;
}

interface SpecialityItem {
  id: string;
  nombre: string;
  descripcion?: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  assigned: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  closed: 'bg-green-500/20 text-green-400 border-green-500/30',
  rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
};

export default function Cases() {
  const { t } = useTranslation();
  const statusLabels: Record<string, string> = {
    pending: t('cases.pending'),
    assigned: t('cases.assigned'),
    closed: t('cases.closed'),
    rejected: t('cases.rejected'),
  };

  const [cases, setCases] = useState<ICase[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterSource, setFilterSource] = useState<string>('all');
  const [filterSubaccount, setFilterSubaccount] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [expandedChannel, setExpandedChannel] = useState<Record<string, boolean>>({
    email: true,
    whatsapp: true,
    manual: true,
  });
  const [subaccounts, setSubaccounts] = useState<any[]>([]);
  const [especialidades, setEspecialidades] = useState<SpecialityItem[]>([]);
  const [subaccountSpecialities, setSubaccountSpecialities] = useState<Record<string, string>>({});
  const [clients, setClients] = useState<any[]>([]);
  const [selectedCase, setSelectedCase] = useState<ICase | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [conversationMessages, setConversationMessages] = useState<IMessage[]>([]);
  const [convLoading, setConvLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [linkClientSearch, setLinkClientSearch] = useState('');
  const [showClientResults, setShowClientResults] = useState(false);
  const [caseToDelete, setCaseToDelete] = useState<string | null>(null);
  const [caseNotesOpen, setCaseNotesOpen] = useState(false);
  const [caseNotesText, setCaseNotesText] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [showSpecialities, setShowSpecialities] = useState(false);
  const [showSpecialityForm, setShowSpecialityForm] = useState(false);
  const [editingSpecialityId, setEditingSpecialityId] = useState<string | null>(null);
  const [specialityForm, setSpecialityForm] = useState({ nombre: '', descripcion: '' });

  const accountId = sessionStorage.getItem('accountId');

  const loadCases = useCallback(async () => {
    try {
      const res = await authFetch(`${import.meta.env.VITE_API_URL}/cases?accountId=${accountId}`);
      if (res.ok) {
        const data = await res.json();
        setCases(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  const loadSubaccounts = useCallback(async () => {
    try {
      const res = await authFetch(`${import.meta.env.VITE_API_URL}/accounts/subaccounts?accountId=${accountId}`);
      if (res.ok) {
        const data = await res.json();
        setSubaccounts(data || []);
      }
    } catch (err) {
      console.error(err);
    }
  }, [accountId]);

  const loadClients = useCallback(async () => {
    try {
      const res = await authFetch(`${import.meta.env.VITE_API_URL}/clients?accountId=${accountId}`);
      if (res.ok) {
        const data = await res.json();
        setClients(data || []);
      }
    } catch (err) {
      console.error(err);
    }
  }, [accountId]);

  const loadEspecialidades = useCallback(async () => {
    try {
      const res = await authFetch(`${import.meta.env.VITE_API_URL}/automatizaciones?accountId=${accountId}`);
      if (res.ok) {
        const data = await res.json();
        setEspecialidades(data.especialidades || []);
        setSubaccountSpecialities(data.subcuentaEspecialidades || {});
      }
    } catch (err) {
      console.error(err);
    }
  }, [accountId]);

  const saveSpeciality = async () => {
    if (!accountId || !specialityForm.nombre.trim()) return;

    try {
      const url = editingSpecialityId
        ? `${import.meta.env.VITE_API_URL}/automatizaciones/especialidades/${editingSpecialityId}`
        : `${import.meta.env.VITE_API_URL}/automatizaciones/especialidades`;
      const method = editingSpecialityId ? 'PUT' : 'POST';
      const response = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          nombre: specialityForm.nombre.trim(),
          descripcion: specialityForm.descripcion.trim(),
        }),
      });

      if (!response.ok) return;

      setEditingSpecialityId(null);
      setShowSpecialityForm(false);
      setSpecialityForm({ nombre: '', descripcion: '' });
      await loadEspecialidades();
    } catch (err) {
      console.error(err);
    }
  };

  const startEditSpeciality = (speciality: SpecialityItem) => {
    setEditingSpecialityId(speciality.id);
    setSpecialityForm({
      nombre: speciality.nombre,
      descripcion: speciality.descripcion || '',
    });
    setShowSpecialityForm(true);
  };

  const deleteSpeciality = async (specialityId: string) => {
    if (!accountId) return;

    try {
      const response = await authFetch(
        `${import.meta.env.VITE_API_URL}/automatizaciones/especialidades/${specialityId}?accountId=${accountId}`,
        { method: 'DELETE' }
      );
      if (!response.ok) return;
      await loadEspecialidades();
    } catch (err) {
      console.error(err);
    }
  };

  const assignSubaccountSpeciality = async (subaccountId: string, specialityId: string) => {
    if (!accountId) return;

    try {
      const response = await authFetch(`${import.meta.env.VITE_API_URL}/automatizaciones/subcuenta-especialidad`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          subcuentaId: subaccountId,
          especialidadId: specialityId,
        }),
      });
      if (!response.ok) return;
      await loadEspecialidades();
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadCases();
    loadSubaccounts();
    loadClients();
    loadEspecialidades();
  }, [loadCases, loadSubaccounts, loadClients, loadEspecialidades]);

  const loadConversation = async (caseId: string) => {
    setConvLoading(true);
    try {
      const res = await authFetch(`${import.meta.env.VITE_API_URL}/cases/${caseId}/conversation`);
      if (res.ok) {
        const data = await res.json();
        setConversationMessages(data.messages || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setConvLoading(false);
    }
  };

  const handleAssign = async (caseId: string, subaccountId: string) => {
    try {
      const res = await authFetch(`${import.meta.env.VITE_API_URL}/cases/${caseId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subaccountId }),
      });
      if (res.ok) {
        loadCases();
        loadClients();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleStatus = async (caseId: string, status: string) => {
    try {
      const res = await authFetch(`${import.meta.env.VITE_API_URL}/cases/${caseId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        loadCases();
        loadClients();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleLinkClient = async (caseId: string, clientId: string, clientName: string) => {
    try {
      const res = await authFetch(`${import.meta.env.VITE_API_URL}/cases/${caseId}/link-client`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });
      if (res.ok) {
        loadCases();
        loadClients();
        if (selectedCase && selectedCase._id === caseId) {
          setSelectedCase({ ...selectedCase, linkedClientName: clientName, linkedClientId: clientId });
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteCase = async (caseId: string) => {
    try {
      const res = await authFetch(`${import.meta.env.VITE_API_URL}/cases/${caseId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setCaseToDelete(null);
        loadCases();
        loadClients();
        if (detailOpen && selectedCase?._id === caseId) {
          setDetailOpen(false);
          setSelectedCase(null);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const openCaseNotes = (c: ICase) => {
    setCaseNotesText(c.notes || '');
    setCaseNotesOpen(true);
  };

  const saveCaseNotes = async () => {
    if (!selectedCase) return;
    setIsSavingNotes(true);
    try {
      const res = await authFetch(`${import.meta.env.VITE_API_URL}/cases/${selectedCase._id}/notes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: caseNotesText }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSelectedCase(updated);
        setCaseNotesOpen(false);
        loadCases();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingNotes(false);
    }
  };

  const openDetail = (c: ICase) => {
    setSelectedCase(c);
    setDetailOpen(true);
    setLinkClientSearch('');
    setShowClientResults(false);
    if (c.source !== 'manual') {
      loadConversation(c._id);
    } else {
      setConversationMessages([]);
    }
  };

  const filteredClients = linkClientSearch.length > 1
    ? clients.filter((cl) => {
        const q = linkClientSearch.toLowerCase();
        return (
          cl.name.toLowerCase().includes(q) ||
          (cl.email && cl.email.toLowerCase().includes(q)) ||
          (cl.phone && cl.phone.toLowerCase().includes(q))
        );
      })
    : [];

  const filteredCases = cases.filter((c) => {
    if (filterStatus !== 'all' && c.status !== filterStatus) return false;
    if (filterSource !== 'all' && c.source !== filterSource) return false;
    if (filterSubaccount !== 'all' && c.assignedSubaccountId !== filterSubaccount) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        c.contactName.toLowerCase().includes(q) ||
        (c.subject && c.subject.toLowerCase().includes(q)) ||
        (c.especialidadName && c.especialidadName.toLowerCase().includes(q)) ||
        (c.assignedSubaccountName && c.assignedSubaccountName.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const grouped = {
    email: filteredCases.filter((c) => c.source === 'email'),
    whatsapp: filteredCases.filter((c) => c.source === 'whatsapp'),
    manual: filteredCases.filter((c) => c.source === 'manual'),
  };

  const renderCaseCard = (c: ICase) => (
    <div key={c._id} className="bg-card border rounded-xl p-5 hover:border-primary/50 transition-colors shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${STATUS_COLORS[c.status]}`}>
              {statusLabels[c.status]}
            </span>
            {c.especialidadName && (
              <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground flex items-center gap-1">
                <Tag size={10} />
                {c.especialidadName}
              </span>
            )}
          </div>
          <h3 className="font-semibold text-base mb-1">{c.contactName}</h3>
          {c.subject && <p className="text-sm text-muted-foreground mb-1 truncate">{c.subject}</p>}
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
            <span className="flex items-center gap-1">
              <Calendar size={12} />
              {new Date(c.createdAt).toLocaleDateString()}
            </span>
            {c.assignedSubaccountName && (
              <span className="flex items-center gap-1 text-blue-400">
                <User size={12} />
                {c.assignedSubaccountName}
              </span>
            )}
            {c.linkedClientName && (
              <span className="flex items-center gap-1 text-green-400">
                <Link size={12} />
                {c.linkedClientName}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => openDetail(c)}
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
            title={t('cases.viewDetail')}
          >
            <Eye size={16} />
          </button>
          {c.status === 'pending' && (
            <>
              <select
                onChange={(e) => handleAssign(c._id, e.target.value)}
                className="text-xs bg-muted border rounded-lg px-3 py-2 cursor-pointer"
                defaultValue=""
              >
                <option value="" disabled>{t('cases.assign')}</option>
                {subaccounts.map((s) => (
                  <option key={s.id || s._id} value={s.id || s._id}>{s.name || s.email}</option>
                ))}
              </select>
              <button
                onClick={() => handleStatus(c._id, 'closed')}
                className="p-2 rounded-lg hover:bg-green-500/20 text-green-400 transition-colors"
                title={t('cases.close')}
              >
                <Check size={16} />
              </button>
              <button
                onClick={() => handleStatus(c._id, 'rejected')}
                className="p-2 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors"
                title={t('cases.reject')}
              >
                <X size={16} />
              </button>
            </>
          )}
          {c.status === 'assigned' && (
            <button
              onClick={() => handleStatus(c._id, 'closed')}
              className="p-2 rounded-lg hover:bg-green-500/20 text-green-400 transition-colors"
              title={t('cases.close')}
            >
              <Check size={16} />
            </button>
          )}
          <button
            onClick={() => setCaseToDelete(c._id)}
            className="p-2 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors"
            title={t('cases.delete') || 'Eliminar caso'}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );

  const isFreePlan = sessionStorage.getItem('plan') === 'free';
  const planDowngradedAt = sessionStorage.getItem('planDowngradedAt');
  const inGracePeriod = planDowngradedAt ? (Date.now() - new Date(planDowngradedAt).getTime()) < 7 * 24 * 60 * 60 * 1000 : false;
  const activeCasesCount = cases.filter((c) => c.status !== 'closed' && c.status !== 'rejected').length;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <ModuleGuide moduleId="cases" />
      {isFreePlan && !inGracePeriod && activeCasesCount >= 5 && (
        <div className="mb-4 rounded-md border border-red-500/20 bg-red-500/10 p-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-red-700 dark:text-red-400">Límite alcanzado</p>
            <p className="text-xs text-red-600 dark:text-red-300">Has llegado al máximo de 5 casos activos del plan Sin Cargo.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => { /* open profile modal */ }}>
            Suscribirse
          </Button>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Briefcase size={28} />
          {t('cases.title')}
          <span className="text-base font-normal text-muted-foreground bg-muted px-3 py-1 rounded-full">
            {cases.length}
          </span>
        </h1>
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => setShowSpecialities(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-card text-foreground hover:bg-accent transition-colors"
          >
            <Tag size={16} />
            Especialidades
          </button>
          {!(isFreePlan && !inGracePeriod && activeCasesCount >= 5) && (
            <button
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-lg font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus size={18} />
              {t('cases.newCase') || 'Nuevo caso'}
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-8 bg-card border rounded-xl p-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder={t('cases.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 pr-4 py-2.5 text-sm bg-muted border rounded-lg w-64"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="text-sm bg-muted border rounded-lg px-4 py-2.5"
        >
          <option value="all">{t('cases.allStatuses')}</option>
          <option value="pending">{t('cases.pending')}</option>
          <option value="assigned">{t('cases.assigned')}</option>
          <option value="closed">{t('cases.closed')}</option>
          <option value="rejected">{t('cases.rejected')}</option>
        </select>
        <select
          value={filterSource}
          onChange={(e) => setFilterSource(e.target.value)}
          className="text-sm bg-muted border rounded-lg px-4 py-2.5"
        >
          <option value="all">{t('cases.allChannels')}</option>
          <option value="email">{t('cases.email')}</option>
          <option value="whatsapp">{t('cases.whatsapp')}</option>
          <option value="manual">{t('cases.manual')}</option>
        </select>
        <select
          value={filterSubaccount}
          onChange={(e) => setFilterSubaccount(e.target.value)}
          className="text-sm bg-muted border rounded-lg px-4 py-2.5"
        >
          <option value="all">{t('cases.allLawyers')}</option>
          <option value="">{t('cases.unassigned')}</option>
          {subaccounts.map((s) => (
            <option key={s._id} value={s.id || s._id}>{s.name || s.email}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground py-16 text-lg">{t('cases.loading')}</div>
      ) : (
        <div className="space-y-8">
          {/* Email */}
          {grouped.email.length > 0 && (
            <div>
              <button
                onClick={() => setExpandedChannel((p) => ({ ...p, email: !p.email }))}
                className="flex items-center gap-2 text-lg font-semibold mb-4 hover:text-primary transition-colors"
              >
                <Mail size={20} />
                {t('cases.email')} ({grouped.email.length})
                {expandedChannel.email ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {expandedChannel.email && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {grouped.email.map(renderCaseCard)}
                </div>
              )}
            </div>
          )}

          {/* WhatsApp */}
          {grouped.whatsapp.length > 0 && (
            <div>
              <button
                onClick={() => setExpandedChannel((p) => ({ ...p, whatsapp: !p.whatsapp }))}
                className="flex items-center gap-2 text-lg font-semibold mb-4 hover:text-primary transition-colors"
              >
                <MessageCircle size={20} />
                {t('cases.whatsapp')} ({grouped.whatsapp.length})
                {expandedChannel.whatsapp ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {expandedChannel.whatsapp && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {grouped.whatsapp.map(renderCaseCard)}
                </div>
              )}
            </div>
          )}

          {/* Manual */}
          {grouped.manual.length > 0 && (
            <div>
              <button
                onClick={() => setExpandedChannel((p) => ({ ...p, manual: !p.manual }))}
                className="flex items-center gap-2 text-lg font-semibold mb-4 hover:text-primary transition-colors"
              >
                <Briefcase size={20} />
                {t('cases.manual')} ({grouped.manual.length})
                {expandedChannel.manual ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {expandedChannel.manual && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {grouped.manual.map(renderCaseCard)}
                </div>
              )}
            </div>
          )}

          {filteredCases.length === 0 && (
            <div className="text-center text-muted-foreground py-16 text-lg">
              {t('cases.noCases')}
            </div>
          )}
        </div>
      )}

      {/* Create Case Modal */}
      {createOpen && (
        <NewCaseModal
          accountId={accountId || ''}
          onClose={() => setCreateOpen(false)}
          onSuccess={() => {
            loadCases();
            setCreateOpen(false);
          }}
        />
      )}

      <SpecialtiesManagerModal
        open={showSpecialities}
        title="Especialidades"
        specialities={especialidades}
        subaccounts={subaccounts}
        subaccountAssignments={subaccountSpecialities}
        showCreateForm={showSpecialityForm}
        editingId={editingSpecialityId}
        form={specialityForm}
        createLabel={t('automations.createSpeciality') || 'Crear especialidad'}
        editLabel={t('automations.editSpeciality') || 'Editar especialidad'}
        namePlaceholder={t('automations.namePlaceholder') || 'Nombre'}
        descriptionPlaceholder={t('automations.whatIsIt') || 'Describe esta especialidad'}
        cancelLabel={t('automations.cancel') || 'Cancelar'}
        saveLabel={t('automations.save') || 'Guardar'}
        emptyLabel={t('automations.noSpecialities') || 'No hay especialidades'}
        singularCountLabel="especialidad"
        pluralCountLabel="especialidades"
        assignmentsTitle="Asignacion automatica por subcuenta"
        unassignedLabel="Sin especialidad"
        onClose={() => {
          setShowSpecialities(false);
          setShowSpecialityForm(false);
          setEditingSpecialityId(null);
        }}
        onStartCreate={() => {
          setEditingSpecialityId(null);
          setSpecialityForm({ nombre: '', descripcion: '' });
          setShowSpecialityForm(true);
        }}
        onCancelForm={() => {
          setShowSpecialityForm(false);
          setEditingSpecialityId(null);
        }}
        onSave={saveSpeciality}
        onEdit={startEditSpeciality}
        onDelete={deleteSpeciality}
        onFormChange={setSpecialityForm}
        onAssignSpeciality={assignSubaccountSpeciality}
      />

      {/* Detail Modal */}
      {detailOpen && selectedCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-card border rounded-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b">
              <div>
                <h2 className="text-xl font-bold">{t('cases.detailTitle')}</h2>
                <p className="text-sm text-muted-foreground mt-1">{selectedCase.contactName}</p>
              </div>
              <button onClick={() => setDetailOpen(false)} className="p-2 rounded-lg hover:bg-muted transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left: Case info */}
                <div className="space-y-4">
                  <div className="bg-muted/50 rounded-xl p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${STATUS_COLORS[selectedCase.status]}`}>
                        {statusLabels[selectedCase.status]}
                      </span>
                      {selectedCase.especialidadName && (
                        <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground flex items-center gap-1">
                          <Tag size={10} />
                          {selectedCase.especialidadName}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs mb-0.5">{t('cases.contact')}</p>
                        <p className="font-medium">{selectedCase.contactName}</p>
                      </div>
                      {selectedCase.contactEmail && (
                        <div>
                          <p className="text-muted-foreground text-xs mb-0.5">{t('cases.emailLabel')}</p>
                          <p className="font-medium">{selectedCase.contactEmail}</p>
                        </div>
                      )}
                      {selectedCase.contactPhone && (
                        <div>
                          <p className="text-muted-foreground text-xs mb-0.5">{t('cases.phone')}</p>
                          <p className="font-medium">{selectedCase.contactPhone}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-muted-foreground text-xs mb-0.5">{t('cases.date')}</p>
                        <p className="font-medium">{new Date(selectedCase.createdAt).toLocaleString()}</p>
                      </div>
                      {selectedCase.assignedSubaccountName && (
                        <div>
                          <p className="text-muted-foreground text-xs mb-0.5">{t('cases.assignedLawyer')}</p>
                          <p className="font-medium text-blue-400">{selectedCase.assignedSubaccountName}</p>
                        </div>
                      )}
                      {selectedCase.linkedClientName && (
                        <div>
                          <p className="text-muted-foreground text-xs mb-0.5">{t('cases.linkedClient')}</p>
                          <p className="font-medium text-green-400">{selectedCase.linkedClientName}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Link client */}
                  {!selectedCase.linkedClientName && (
                    <div className="bg-muted/50 rounded-xl p-5">
                      <p className="text-sm font-medium mb-2">{t('cases.linkClient') || 'Vincular a cliente'}</p>
                      <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                          type="text"
                          placeholder={t('cases.searchClient') || 'Buscar cliente...'}
                          value={linkClientSearch}
                          onChange={(e) => { setLinkClientSearch(e.target.value); setShowClientResults(true); }}
                          onFocus={() => setShowClientResults(true)}
                          className="w-full pl-9 pr-3 py-2.5 bg-background border rounded-lg text-sm"
                        />
                        {showClientResults && filteredClients.length > 0 && (
                          <div className="absolute z-10 mt-1 w-full bg-popover border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                            {filteredClients.map((cl) => (
                              <button
                                key={cl.id}
                                onClick={() => {
                                  handleLinkClient(selectedCase._id, cl.id, cl.name);
                                  setLinkClientSearch('');
                                  setShowClientResults(false);
                                }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors flex items-center gap-2"
                              >
                                <User size={14} />
                                <span>{cl.name}</span>
                                <span className="text-muted-foreground text-xs ml-auto">{cl.email}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Original message */}
                  <div className="bg-muted/50 rounded-xl p-5">
                    <p className="text-sm font-medium mb-2">{t('cases.originalMessage')}</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{selectedCase.body}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => openCaseNotes(selectedCase)}
                      className="px-3 py-2 rounded-lg bg-yellow-500/20 text-yellow-400 text-sm font-medium hover:bg-yellow-500/30 transition-colors flex items-center gap-1.5"
                    >
                      <StickyNote size={14} />
                      {t('cases.notes') || 'Notas'}
                    </button>
                    {selectedCase.status === 'pending' && (
                      <>
                        <select
                          onChange={(e) => handleAssign(selectedCase._id, e.target.value)}
                          className="text-sm bg-muted border rounded-lg px-3 py-2"
                          defaultValue=""
                        >
                          <option value="" disabled>{t('cases.assign')}</option>
                          {subaccounts.map((s) => (
                            <option key={s.id || s._id} value={s.id || s._id}>{s.name || s.email}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleStatus(selectedCase._id, 'closed')}
                          className="px-3 py-2 rounded-lg bg-green-500/20 text-green-400 text-sm font-medium hover:bg-green-500/30 transition-colors"
                        >
                          {t('cases.close')}
                        </button>
                        <button
                          onClick={() => handleStatus(selectedCase._id, 'rejected')}
                          className="px-3 py-2 rounded-lg bg-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/30 transition-colors"
                        >
                          {t('cases.reject')}
                        </button>
                      </>
                    )}
                    {selectedCase.status === 'assigned' && (
                      <button
                        onClick={() => handleStatus(selectedCase._id, 'closed')}
                        className="px-3 py-2 rounded-lg bg-green-500/20 text-green-400 text-sm font-medium hover:bg-green-500/30 transition-colors"
                      >
                        {t('cases.close')}
                      </button>
                    )}
                  </div>
                </div>

                {/* Right: Conversation history */}
                <div className="bg-muted/30 rounded-xl p-5 flex flex-col h-[500px]">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <MessageCircle size={16} />
                    {t('cases.conversation') || 'Historial de conversación'}
                  </h3>
                  <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                    {convLoading ? (
                      <p className="text-sm text-muted-foreground text-center py-8">{t('cases.loadingConversation')}</p>
                    ) : conversationMessages.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        {selectedCase.source === 'manual'
                          ? t('cases.manualCaseNoConversation')
                          : t('cases.noMessages')}
                      </p>
                    ) : (
                      conversationMessages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex ${msg.sent ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${
                              msg.sent
                                ? 'bg-primary text-primary-foreground rounded-br-sm'
                                : 'bg-card border rounded-bl-sm'
                            }`}
                          >
                            <p className="text-xs opacity-70 mb-1">{msg.from}</p>
                            <p className="whitespace-pre-wrap">{msg.text}</p>
                            <p className={`text-[10px] mt-1 ${msg.sent ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                              {new Date(msg.time).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Case Notes Modal */}
      {caseNotesOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
          <div className="bg-card border rounded-xl w-full max-w-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <StickyNote size={20} />
                {t('cases.notes') || 'Notas del caso'}
              </h2>
              <button onClick={() => setCaseNotesOpen(false)} className="p-1.5 rounded hover:bg-muted transition-colors">
                <X size={20} />
              </button>
            </div>
            <textarea
              value={caseNotesText}
              onChange={(e) => setCaseNotesText(e.target.value)}
              rows={20}
              className="w-full px-3 py-2 bg-muted border rounded-lg text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder={t('cases.notesPlaceholder') || 'Escribe tus notas aquí...'}
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => setCaseNotesOpen(false)}
                className="px-4 py-2 rounded-lg border text-sm hover:bg-muted transition-colors"
              >
                {t('cases.cancel') || 'Cancelar'}
              </button>
              <button
                onClick={saveCaseNotes}
                disabled={isSavingNotes}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {isSavingNotes ? (t('cases.saving') || 'Guardando...') : (t('cases.saveNotes') || 'Guardar notas')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Case Confirmation */}
      {caseToDelete && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
          <div className="bg-card border rounded-xl w-full max-w-sm p-6 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
              <Trash2 size={24} className="text-red-400" />
            </div>
            <h3 className="text-lg font-bold mb-2">{t('cases.deleteConfirmTitle') || 'Eliminar caso'}</h3>
            <p className="text-sm text-muted-foreground mb-6">{t('cases.deleteConfirmMsg') || '¿Estás seguro de que quieres eliminar este caso? Esta acción no se puede deshacer.'}</p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setCaseToDelete(null)}
                className="px-4 py-2 rounded-lg border text-sm hover:bg-muted transition-colors"
              >
                {t('cases.cancel') || 'Cancelar'}
              </button>
              <button
                onClick={() => handleDeleteCase(caseToDelete)}
                className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors"
              >
                {t('cases.delete') || 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
