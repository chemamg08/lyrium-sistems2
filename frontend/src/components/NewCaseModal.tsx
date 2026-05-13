import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { authFetch } from '@/lib/authFetch';
import { X, Search, User, Link } from 'lucide-react';

interface PreselectedClient {
  id: string;
  name: string;
}

interface NewCaseModalProps {
  accountId: string;
  onClose: () => void;
  onSuccess: () => void;
  preselectedClient?: PreselectedClient | null;
}

export default function NewCaseModal({ accountId, onClose, onSuccess, preselectedClient }: NewCaseModalProps) {
  const { t } = useTranslation();

  const [form, setForm] = useState({
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    subject: '',
    body: '',
    especialidadId: '',
  });
  const [subaccountId, setSubaccountId] = useState('');
  const [linkedClientId, setLinkedClientId] = useState('');
  const [linkedClientName, setLinkedClientName] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [showClientResults, setShowClientResults] = useState(false);

  const [subaccounts, setSubaccounts] = useState<any[]>([]);
  const [especialidades, setEspecialidades] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [subRes, espRes, cliRes] = await Promise.all([
          authFetch(`${import.meta.env.VITE_API_URL}/accounts/subaccounts?accountId=${accountId}`),
          authFetch(`${import.meta.env.VITE_API_URL}/automatizaciones?accountId=${accountId}`),
          preselectedClient ? Promise.resolve({ ok: true, json: async () => [] }) : authFetch(`${import.meta.env.VITE_API_URL}/clients?accountId=${accountId}`),
        ]);
        if (subRes.ok) {
          const data = await subRes.json();
          setSubaccounts(data || []);
        }
        if (espRes.ok) {
          const data = await espRes.json();
          setEspecialidades(data.especialidades || []);
        }
        if (!preselectedClient && cliRes.ok) {
          const data = await cliRes.json();
          setClients(data || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingData(false);
      }
    };
    load();
  }, [accountId, preselectedClient]);

  const filteredClients = clientSearch.length > 1
    ? clients.filter((cl: any) => {
        const q = clientSearch.toLowerCase();
        return (
          cl.name.toLowerCase().includes(q) ||
          (cl.email && cl.email.toLowerCase().includes(q)) ||
          (cl.phone && cl.phone.toLowerCase().includes(q))
        );
      })
    : [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const esp = subaccounts.find((s: any) => s.especialidadId === form.especialidadId);
      const payload: any = {
        ...form,
        accountId,
        especialidadName: esp?.especialidadName || 'General',
      };
      if (subaccountId) payload.assignedSubaccountId = subaccountId;
      if (preselectedClient) {
        payload.linkedClientId = preselectedClient.id;
        payload.linkedClientName = preselectedClient.name;
      } else if (linkedClientId) {
        payload.linkedClientId = linkedClientId;
        payload.linkedClientName = linkedClientName;
      }

      const res = await authFetch(`${import.meta.env.VITE_API_URL}/cases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        onSuccess();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border rounded-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">{t('cases.newCase') || 'Nuevo caso'}</h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-muted">
            <X size={20} />
          </button>
        </div>
        {loadingData ? (
          <p className="text-sm text-muted-foreground text-center py-8">{t('common.loading') || 'Cargando...'}</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Nombre del contacto</label>
              <input
                required
                value={form.contactName}
                onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                className="w-full px-3 py-2 bg-muted border rounded-lg text-sm"
                placeholder="Ej: Juan García"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Email</label>
                <input
                  type="email"
                  value={form.contactEmail}
                  onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                  className="w-full px-3 py-2 bg-muted border rounded-lg text-sm"
                  placeholder="email@ejemplo.com"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Teléfono</label>
                <input
                  value={form.contactPhone}
                  onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                  className="w-full px-3 py-2 bg-muted border rounded-lg text-sm"
                  placeholder="+34 612 345 678"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Asunto</label>
              <input
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                className="w-full px-3 py-2 bg-muted border rounded-lg text-sm"
                placeholder="Ej: Divorcio contencioso"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Descripción</label>
              <textarea
                rows={3}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                className="w-full px-3 py-2 bg-muted border rounded-lg text-sm resize-none"
                placeholder="Describe el caso..."
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Especialidad</label>
              <select
                value={form.especialidadId}
                onChange={(e) => setForm({ ...form, especialidadId: e.target.value })}
                className="w-full px-3 py-2 bg-muted border rounded-lg text-sm"
              >
                <option value="">Seleccionar especialidad</option>
                {especialidades.map((esp: any) => (
                  <option key={esp.id} value={esp.id}>{esp.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Asignar a abogado</label>
              <select
                value={subaccountId}
                onChange={(e) => setSubaccountId(e.target.value)}
                className="w-full px-3 py-2 bg-muted border rounded-lg text-sm"
              >
                <option value="">Seleccionar abogado (opcional)</option>
                {subaccounts.map((s: any) => (
                  <option key={s.id || s._id} value={s.id || s._id}>{s.name || s.email}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Vincular a cliente</label>
              {preselectedClient ? (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400 border border-green-500/30 flex items-center gap-1">
                    <Link size={10} />
                    {preselectedClient.name}
                  </span>
                </div>
              ) : (
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Buscar por nombre, email o teléfono..."
                    value={clientSearch}
                    onChange={(e) => { setClientSearch(e.target.value); setShowClientResults(true); }}
                    onFocus={() => setShowClientResults(true)}
                    onBlur={() => setTimeout(() => setShowClientResults(false), 200)}
                    className="w-full pl-9 pr-3 py-2 bg-muted border rounded-lg text-sm"
                  />
                  {showClientResults && filteredClients.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-popover border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {filteredClients.map((cl: any) => (
                        <button
                          key={cl.id}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setLinkedClientId(cl.id);
                            setLinkedClientName(cl.name);
                            setClientSearch('');
                            setShowClientResults(false);
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors flex items-center gap-2"
                        >
                          <User size={14} />
                          <span>{cl.name}</span>
                          {cl.email && <span className="text-muted-foreground text-xs">{cl.email}</span>}
                          {cl.phone && <span className="text-muted-foreground text-xs">{cl.phone}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {!preselectedClient && linkedClientName && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400 border border-green-500/30 flex items-center gap-1">
                    <Link size={10} />
                    {linkedClientName}
                    <button
                      type="button"
                      onClick={() => { setLinkedClientId(''); setLinkedClientName(''); }}
                      className="ml-1 hover:text-green-200"
                    >
                      <X size={12} />
                    </button>
                  </span>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border text-sm hover:bg-muted transition-colors"
              >
                {t('cases.cancel') || 'Cancelar'}
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                {t('cases.create') || 'Crear caso'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
