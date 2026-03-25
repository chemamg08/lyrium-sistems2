import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, CalendarClock, CheckCircle2, Download, Filter, PlusCircle, ReceiptText, Trash2, XCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { authFetch } from '@/lib/authFetch';
import { useTranslation } from 'react-i18next';

const API_URL = import.meta.env.VITE_API_URL;

type ObligationStatus = 'draft' | 'calculated' | 'filed' | 'paid' | 'overdue' | 'error';

interface Client {
  id: string;
  name: string;
  clientType?: string;
  fiscalInfo?: Record<string, any>;
}

interface Calculation {
  id: string;
  label: string;
  createdAt: string;
  resultado: number;
  clientId: string;
}

interface TaxModelDef {
  code: string;
  name: string;
  periodType: 'monthly' | 'quarterly' | 'yearly' | 'custom';
}

interface TaxObligation {
  id: string;
  clientId: string;
  clientName: string;
  modelCode: string;
  modelName: string;
  period: string;
  taxDue: number;
  currency: string;
  status: ObligationStatus;
  deadline: string;
  portalUrl?: string;
  notes?: string;
}

function statusBadgeClass(status: ObligationStatus): string {
  if (status === 'paid') return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
  if (status === 'filed') return 'bg-blue-500/15 text-blue-600 dark:text-blue-400';
  if (status === 'calculated') return 'bg-sky-500/15 text-sky-600 dark:text-sky-400';
  if (status === 'overdue') return 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
  if (status === 'error') return 'bg-rose-500/15 text-rose-600 dark:text-rose-400';
  return 'bg-muted text-muted-foreground';
}

function defaultPeriod(periodType: TaxModelDef['periodType']): string {
  const now = new Date();
  const year = now.getFullYear();
  if (periodType === 'yearly') return `Y-${year}`;
  if (periodType === 'monthly') {
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `M${month}-${year}`;
  }
  const month = now.getMonth() + 1;
  const quarter = month <= 3 ? 'T1' : month <= 6 ? 'T2' : month <= 9 ? 'T3' : 'T4';
  return `${quarter}-${year}`;
}

export default function TaxCompliance() {
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const [accountId, setAccountId] = useState('');

  const [clients, setClients] = useState<Client[]>([]);
  const [obligations, setObligations] = useState<TaxObligation[]>([]);
  const [deadlines, setDeadlines] = useState<TaxObligation[]>([]);
  const [summary, setSummary] = useState<{ total: number; totalDue: number; pendingDue: number; byStatus: Record<string, number> }>({
    total: 0,
    totalDue: 0,
    pendingDue: 0,
    byStatus: {},
  });

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [calculations, setCalculations] = useState<Calculation[]>([]);
  const [selectedCalculationId, setSelectedCalculationId] = useState('');
  const [models, setModels] = useState<TaxModelDef[]>([]);
  const [selectedModelCode, setSelectedModelCode] = useState('');
  const [period, setPeriod] = useState('');
  const [notes, setNotes] = useState('');
  const [creating, setCreating] = useState(false);
  const [isBetaOpen, setIsBetaOpen] = useState(false);
  const [deleteObligationId, setDeleteObligationId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const selectedModel = useMemo(() => models.find((m) => m.code === selectedModelCode) || null, [models, selectedModelCode]);

  useEffect(() => {
    const stored = sessionStorage.getItem('accountId') || '';
    setAccountId(stored);
  }, []);

  useEffect(() => {
    if (!accountId) return;
    void loadClients();
    void loadObligations();
    void loadDeadlines();
    void loadSummary();
  }, [accountId]);

  async function loadClients() {
    try {
      const userType = sessionStorage.getItem('userType') || '';
      const res = await authFetch(`${API_URL}/clients?accountId=${accountId}&userType=${userType}`);
      if (!res.ok) return;
      const data = await res.json() as Client[];
      setClients(data || []);
    } catch {
      // silent
    }
  }

  async function loadObligations() {
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (clientFilter !== 'all') params.append('clientId', clientFilter);
      const query = params.toString();
      const res = await authFetch(`${API_URL}/tax-compliance/obligations${query ? `?${query}` : ''}`, {
        headers: { 'x-account-id': accountId },
      });
      if (!res.ok) return;
      const data = await res.json() as TaxObligation[];
      setObligations(data || []);
    } catch {
      // silent
    }
  }

  async function loadDeadlines() {
    try {
      const res = await authFetch(`${API_URL}/tax-compliance/deadlines`, {
        headers: { 'x-account-id': accountId },
      });
      if (!res.ok) return;
      const data = await res.json() as TaxObligation[];
      setDeadlines(data || []);
    } catch {
      // silent
    }
  }

  async function loadSummary() {
    try {
      const res = await authFetch(`${API_URL}/tax-compliance/summary`, {
        headers: { 'x-account-id': accountId },
      });
      if (!res.ok) return;
      const data = await res.json() as any;
      setSummary({
        total: Number(data?.total || 0),
        totalDue: Number(data?.totalDue || 0),
        pendingDue: Number(data?.pendingDue || 0),
        byStatus: data?.byStatus || {},
      });
    } catch {
      // silent
    }
  }

  useEffect(() => {
    if (!accountId) return;
    void loadObligations();
  }, [accountId, statusFilter, clientFilter]);

  async function onClientForCreation(clientId: string) {
    setSelectedClientId(clientId);
    setSelectedCalculationId('');
    setSelectedModelCode('');
    setPeriod('');

    const client = clients.find((c) => c.id === clientId);
    const countryCode = String(sessionStorage.getItem('country') || '').toUpperCase().trim();
    const clientType = client?.clientType || '';

    if (!countryCode) {
      setCalculations([]);
      setModels([]);
      toast({
        title: t('taxCompliance.toasts.accountCountryRequiredTitle'),
        description: t('taxCompliance.toasts.accountCountryRequiredDesc'),
        variant: 'destructive',
      });
      return;
    }

    try {
      const [calcRes, modelRes] = await Promise.all([
        authFetch(`${API_URL}/calculos?clientId=${clientId}&accountId=${accountId}`),
        authFetch(`${API_URL}/tax-compliance/models/${countryCode}?clientType=${encodeURIComponent(clientType)}`, {
          headers: { 'x-account-id': accountId },
        }),
      ]);

      if (calcRes.ok) {
        const calcData = await calcRes.json() as Calculation[];
        setCalculations(calcData || []);
      } else {
        setCalculations([]);
      }

      if (modelRes.ok) {
        const modelData = await modelRes.json() as TaxModelDef[];
        setModels(modelData || []);
        const defaultCode = modelData?.[0]?.code || '';
        setSelectedModelCode(defaultCode);
        if (modelData?.[0]) {
          setPeriod(defaultPeriod(modelData[0].periodType));
        }
      } else {
        setModels([]);
      }
    } catch {
      setCalculations([]);
      setModels([]);
    }
  }

  useEffect(() => {
    if (!selectedModel) return;
    if (!period) setPeriod(defaultPeriod(selectedModel.periodType));
  }, [selectedModel]);

  async function createObligation() {
    if (!selectedCalculationId) {
      toast({ title: t('taxCompliance.toasts.selectCalculation'), variant: 'destructive' });
      return;
    }
    if (!selectedModelCode) {
      toast({ title: t('taxCompliance.toasts.selectTaxModel'), variant: 'destructive' });
      return;
    }

    setCreating(true);
    try {
      const res = await authFetch(`${API_URL}/tax-compliance/obligations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-account-id': accountId,
        },
        body: JSON.stringify({
          calculationId: selectedCalculationId,
          modelCode: selectedModelCode,
          period,
          notes,
        }),
      });

      if (!res.ok) {
        let message = t('taxCompliance.toasts.createObligationFailed');
        try {
          const payload = await res.json() as { error?: string };
          if (payload?.error) message = payload.error;
        } catch {
          // keep fallback message
        }
        throw new Error(message);
      }

      setIsCreateOpen(false);
      setSelectedClientId('');
      setSelectedCalculationId('');
      setSelectedModelCode('');
      setPeriod('');
      setNotes('');
      setCalculations([]);
      setModels([]);

      toast({
        title: t('taxCompliance.toasts.obligationCreatedTitle'),
        description: t('taxCompliance.toasts.obligationCreatedDesc'),
      });
      await Promise.all([loadObligations(), loadDeadlines(), loadSummary()]);
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error?.message || t('taxCompliance.toasts.createObligationFailed'),
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  }

  async function updateStatus(obligationId: string, status: ObligationStatus) {
    try {
      const body: Record<string, any> = { status };
      if (status === 'filed') body.filedAt = new Date().toISOString();
      if (status === 'paid') body.paidAt = new Date().toISOString();

      const res = await authFetch(`${API_URL}/tax-compliance/obligations/${obligationId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-account-id': accountId,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('failed');

      await Promise.all([loadObligations(), loadDeadlines(), loadSummary()]);
    } catch {
      toast({ title: t('common.error'), description: t('taxCompliance.toasts.updateStatusFailed'), variant: 'destructive' });
    }
  }

  async function downloadDocument(obligationId: string) {
    try {
      const res = await authFetch(`${API_URL}/tax-compliance/obligations/${obligationId}/document`, {
        headers: { 'x-account-id': accountId },
      });
      if (!res.ok) throw new Error('failed');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tax-obligation-${obligationId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: t('common.error'), description: t('taxCompliance.toasts.downloadPdfFailed'), variant: 'destructive' });
    }
  }

  async function deleteObligation() {
    if (!deleteObligationId || deleting) return;
    setDeleting(true);
    try {
      const res = await authFetch(`${API_URL}/tax-compliance/obligations/${deleteObligationId}`, {
        method: 'DELETE',
        headers: { 'x-account-id': accountId },
      });

      if (!res.ok) {
        let message = t('taxCompliance.toasts.deleteFailed');
        try {
          const payload = await res.json() as { error?: string };
          if (payload?.error) message = payload.error;
        } catch {
          // keep fallback
        }
        throw new Error(message);
      }

      setDeleteObligationId(null);
      toast({
        title: t('taxCompliance.toasts.deletedTitle'),
        description: t('taxCompliance.toasts.deletedDesc'),
      });
      await Promise.all([loadObligations(), loadDeadlines(), loadSummary()]);
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error?.message || t('taxCompliance.toasts.deleteFailed'),
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  }

  const filteredObligations = obligations.filter((ob) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return (
      ob.clientName.toLowerCase().includes(term) ||
      ob.modelCode.toLowerCase().includes(term) ||
      ob.modelName.toLowerCase().includes(term) ||
      ob.period.toLowerCase().includes(term)
    );
  });

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">{t('taxCompliance.title')}</h1>
          <p className="text-muted-foreground">{t('taxCompliance.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setIsBetaOpen(true)}>
            {t('taxCompliance.beta.button')}
          </Button>
          <Button onClick={() => setIsCreateOpen(true)}>
            <PlusCircle className="h-4 w-4 mr-2" />
            {t('taxCompliance.newObligation')}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="obligations" className="w-full">
        <TabsList>
          <TabsTrigger value="obligations">
            <ReceiptText className="h-4 w-4 mr-2" />
            {t('taxCompliance.tabs.obligations')}
          </TabsTrigger>
          <TabsTrigger value="calendar">
            <CalendarClock className="h-4 w-4 mr-2" />
            {t('taxCompliance.tabs.calendar')}
          </TabsTrigger>
          <TabsTrigger value="summary">
            <BadgeCheck className="h-4 w-4 mr-2" />
            {t('taxCompliance.tabs.summary')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="obligations" className="space-y-4 mt-4">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                  <Filter className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('taxCompliance.filters.searchPlaceholder')} className="pl-9" />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full md:w-48">
                    <SelectValue placeholder={t('taxCompliance.filters.status')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('taxCompliance.filters.all')}</SelectItem>
                    <SelectItem value="draft">{t('taxCompliance.status.draft')}</SelectItem>
                    <SelectItem value="calculated">{t('taxCompliance.status.calculated')}</SelectItem>
                    <SelectItem value="filed">{t('taxCompliance.status.filed')}</SelectItem>
                    <SelectItem value="paid">{t('taxCompliance.status.paid')}</SelectItem>
                    <SelectItem value="overdue">{t('taxCompliance.status.overdue')}</SelectItem>
                    <SelectItem value="error">{t('taxCompliance.status.error')}</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={clientFilter} onValueChange={setClientFilter}>
                  <SelectTrigger className="w-full md:w-64">
                    <SelectValue placeholder={t('taxCompliance.filters.client')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('taxCompliance.filters.allClients')}</SelectItem>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="overflow-auto border border-border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-accent/40">
                    <tr>
                      <th className="text-left px-3 py-2">{t('taxCompliance.table.client')}</th>
                      <th className="text-left px-3 py-2">{t('taxCompliance.table.model')}</th>
                      <th className="text-left px-3 py-2">{t('taxCompliance.table.period')}</th>
                      <th className="text-left px-3 py-2">{t('taxCompliance.table.amount')}</th>
                      <th className="text-left px-3 py-2">{t('taxCompliance.table.status')}</th>
                      <th className="text-left px-3 py-2">{t('taxCompliance.table.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredObligations.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">{t('taxCompliance.table.noResults')}</td>
                      </tr>
                    ) : (
                      filteredObligations.map((ob) => (
                        <tr key={ob.id} className="border-t border-border/60">
                          <td className="px-3 py-2">{ob.clientName}</td>
                          <td className="px-3 py-2">{ob.modelCode} - {ob.modelName}</td>
                          <td className="px-3 py-2">{ob.period}</td>
                          <td className="px-3 py-2 font-medium">{new Intl.NumberFormat(i18n.language, { style: 'currency', currency: ob.currency || 'EUR' }).format(ob.taxDue || 0)}</td>
                          <td className="px-3 py-2">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusBadgeClass(ob.status)}`}>
                              {t(`taxCompliance.status.${ob.status}`)}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-2">
                              <Button size="sm" variant="outline" onClick={() => downloadDocument(ob.id)}>
                                <Download className="h-3.5 w-3.5 mr-1" /> {t('taxCompliance.actions.pdf')}
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => updateStatus(ob.id, 'filed')}>{t('taxCompliance.actions.markFiled')}</Button>
                              <Button size="sm" onClick={() => updateStatus(ob.id, 'paid')}>{t('taxCompliance.actions.markPaid')}</Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => setDeleteObligationId(ob.id)}
                                title={t('taxCompliance.actions.delete')}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-1" /> {t('taxCompliance.actions.delete')}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calendar" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('taxCompliance.calendar.title')}</CardTitle>
              <CardDescription>{t('taxCompliance.calendar.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {deadlines.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t('taxCompliance.calendar.empty')}</p>
              ) : (
                deadlines.map((item) => (
                  <div key={item.id} className="border border-border rounded-md p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <p className="font-medium">{item.clientName} · {item.modelCode}</p>
                      <p className="text-sm text-muted-foreground">{item.modelName} · {item.period}</p>
                      <p className="text-sm">{t('taxCompliance.calendar.dueLabel')}: {item.deadline ? new Date(item.deadline).toLocaleDateString(i18n.language) : '-'}</p>
                    </div>
                    <div className="flex gap-2">
                      {item.portalUrl ? (
                        <Button size="sm" variant="outline" onClick={() => window.open(item.portalUrl, '_blank')}>{t('taxCompliance.actions.officialPortal')}</Button>
                      ) : null}
                      <Button size="sm" onClick={() => updateStatus(item.id, 'filed')}>{t('taxCompliance.actions.markFiled')}</Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="summary" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>{t('taxCompliance.summary.totalObligations')}</CardDescription>
                <CardTitle className="text-2xl">{summary.total}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>{t('taxCompliance.summary.totalEstimated')}</CardDescription>
                <CardTitle className="text-2xl">{new Intl.NumberFormat(i18n.language, { style: 'currency', currency: 'EUR' }).format(summary.totalDue)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>{t('taxCompliance.summary.pendingPayment')}</CardDescription>
                <CardTitle className="text-2xl">{new Intl.NumberFormat(i18n.language, { style: 'currency', currency: 'EUR' }).format(summary.pendingDue)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>{t('taxCompliance.summary.currentStatus')}</CardDescription>
                <CardTitle className="text-base">{t('taxCompliance.summary.currentStatusLine', { calculated: summary.byStatus.calculated || 0, filed: summary.byStatus.filed || 0, paid: summary.byStatus.paid || 0 })}</CardTitle>
              </CardHeader>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('taxCompliance.dialog.title')}</DialogTitle>
            <DialogDescription>{t('taxCompliance.dialog.description')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{t('taxCompliance.dialog.client')}</label>
              <Select value={selectedClientId} onValueChange={(val) => { void onClientForCreation(val); }}>
                <SelectTrigger>
                  <SelectValue placeholder={t('taxCompliance.dialog.selectClient')} />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">{t('taxCompliance.dialog.savedCalculation')}</label>
              <Select value={selectedCalculationId} onValueChange={setSelectedCalculationId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('taxCompliance.dialog.selectCalculation')} />
                </SelectTrigger>
                <SelectContent>
                  {calculations.map((calc) => (
                    <SelectItem key={calc.id} value={calc.id}>
                      {calc.label} · {new Date(calc.createdAt).toLocaleDateString(i18n.language)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{t('taxCompliance.dialog.taxModel')}</label>
                <Select value={selectedModelCode} onValueChange={(val) => {
                  setSelectedModelCode(val);
                  const model = models.find((m) => m.code === val);
                  if (model) setPeriod(defaultPeriod(model.periodType));
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('taxCompliance.dialog.modelPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((model) => (
                      <SelectItem key={model.code} value={model.code}>{model.code} - {model.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">{t('taxCompliance.dialog.period')}</label>
                <Input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="T1-2026" />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">{t('taxCompliance.dialog.notes')}</label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('taxCompliance.dialog.optional')} />
            </div>

          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              <XCircle className="h-4 w-4 mr-2" /> {t('common.cancel')}
            </Button>
            <Button onClick={createObligation} disabled={creating}>
              {creating ? (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2 animate-pulse" /> {t('taxCompliance.dialog.creating')}
                </>
              ) : (
                <>
                  <PlusCircle className="h-4 w-4 mr-2" /> {t('taxCompliance.dialog.create')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isBetaOpen} onOpenChange={setIsBetaOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('taxCompliance.beta.title')}</DialogTitle>
            <DialogDescription>{t('taxCompliance.beta.description')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setIsBetaOpen(false)}>{t('common.close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteObligationId} onOpenChange={(open) => { if (!open) setDeleteObligationId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('taxCompliance.deleteDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('taxCompliance.deleteDialog.description')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { void deleteObligation(); }} disabled={deleting}>
              {deleting ? t('taxCompliance.deleteDialog.deleting') : t('taxCompliance.deleteDialog.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
