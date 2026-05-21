import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { authFetch, hasQuickAccessPreference, persistUserSession, logout as logoutUser } from '@/lib/authFetch';
import {
  Users, TrendingUp, Clock, XCircle, AlertTriangle,
  Search, ChevronLeft, ChevronRight, Eye, UserPlus,
  Shield, LogOut, ArrowLeft, Save, Power, PowerOff,
  Plus,
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL;

interface Stats {
  totalUsers: number;
  active: number;
  trial: number;
  cancelled: number;
  expired: number;
  starterCount: number;
  advancedCount: number;
  monthlyCount: number;
  annualCount: number;
  monthlyRevenue: number;
  pendingJuniorVerifications: number;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  country: string;
  createdAt: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  disabled: boolean;
  juniorDiscountStatus?: string;
  subscription: {
    id: string;
    plan: string;
    interval: string;
    status: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    trialEndDate: string | null;
    autoRenew: boolean;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
  } | null;
}

interface JuniorVerification {
  accountId: string;
  name: string;
  email: string;
  country: string;
  status: 'pending' | 'verified' | 'rejected';
  requestedAt: string;
  proofUrl: string | null;
}

interface UserDetail {
  user: {
    id: string;
    name: string;
    email: string;
    country: string;
    createdAt: string;
    emailVerified: boolean;
    twoFactorEnabled: boolean;
    googleCalendarConnected: boolean;
    disabled: boolean;
  };
  subscription: any;
  subaccounts: { id: string; name: string; email: string; createdAt: string; twoFactorEnabled: boolean }[];
  invoices: { id: string; invoiceNumber: string; publicId: string; date: string; concept: string; totalAmount: number }[];
}

const AdminPanel = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [view, setView] = useState<'dashboard' | 'users' | 'userDetail' | 'createUser' | 'suggestions' | 'juniorVerifications' | 'promoCodes' | 'invoices'>('dashboard');
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [juniorVerifications, setJuniorVerifications] = useState<JuniorVerification[]>([]);
  const [juniorVerificationsLoading, setJuniorVerificationsLoading] = useState(false);

  // Edit subscription form
  const [editPlan, setEditPlan] = useState('');
  const [editInterval, setEditInterval] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editPeriodEnd, setEditPeriodEnd] = useState('');

  // Create user form
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newCountry, setNewCountry] = useState('ES');
  const [newPlan, setNewPlan] = useState('starter');
  const [newInterval, setNewInterval] = useState('monthly');

  // Suggestions states
  const [suggestions, setSuggestions] = useState<{ _id: string; text: string; createdAt: string }[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  // Promo codes states
  const [promoCodes, setPromoCodes] = useState<any[]>([]);
  const [promoCodesLoading, setPromoCodesLoading] = useState(false);
  const [showPromoForm, setShowPromoForm] = useState(false);
  const [editingPromo, setEditingPromo] = useState<any>(null);
  const [promoForm, setPromoForm] = useState({
    code: '',
    type: 'percentage_discount' as 'percentage_discount' | 'free_months',
    value: '',
    durationMonths: '12',
    maxUses: '',
    expiresAt: '',
  });

  // Revenue date range
  const [revenueStart, setRevenueStart] = useState('');
  const [revenueEnd, setRevenueEnd] = useState('');
  const [revenueAmount, setRevenueAmount] = useState<number | null>(null);
  const [revenueLoading, setRevenueLoading] = useState(false);

  // Invoices list
  const [invoicesList, setInvoicesList] = useState<any[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoiceStart, setInvoiceStart] = useState('');
  const [invoiceEnd, setInvoiceEnd] = useState('');

  // Check admin role on mount
  useEffect(() => {
    let cancelled = false;

    const ensureAdminSession = async () => {
      const hasSessionSnapshot = Boolean(sessionStorage.getItem('userId'));
      const canRestoreQuickAccess = hasQuickAccessPreference();

      if (!hasSessionSnapshot && !canRestoreQuickAccess) {
        navigate('/login');
        return;
      }

      try {
        const res = await authFetch(`${API_URL}/accounts/me`);
        if (!res.ok) {
          navigate('/login');
          return;
        }

        const data = await res.json();
        if (!data?.user?.id) {
          navigate('/login');
          return;
        }

        persistUserSession(data.user);
        if (data.user.role !== 'admin') {
          navigate('/login');
          return;
        }

        if (!cancelled) {
          setAuthChecked(true);
        }
      } catch {
        navigate('/login');
      }
    };

    ensureAdminSession();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/admin/stats`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  }, []);

  const fetchUsers = useCallback(async (searchStr: string, pageNum: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ search: searchStr, page: String(pageNum), limit: '15' });
      const res = await authFetch(`${API_URL}/admin/users?${params}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users);
        setTotalPages(data.totalPages);
        setTotalUsers(data.total);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchUserDetail = useCallback(async (userId: string) => {
    setLoading(true);
    try {
      const res = await authFetch(`${API_URL}/admin/users/${userId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedUser(data);
        // Pre-fill edit form
        if (data.subscription) {
          setEditPlan(data.subscription.plan || 'starter');
          setEditInterval(data.subscription.interval || 'monthly');
          setEditStatus(data.subscription.status || 'trial');
          setEditPeriodEnd(data.subscription.currentPeriodEnd ? data.subscription.currentPeriodEnd.slice(0, 16) : '');
        }
        setView('userDetail');
      }
    } catch (err) {
      console.error('Error fetching user detail:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSuggestions = useCallback(async () => {
    setSuggestionsLoading(true);
    try {
      const res = await authFetch(`${API_URL}/admin/suggestions`);
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data);
      }
    } catch (err) {
      console.error('Error fetching suggestions:', err);
    } finally {
      setSuggestionsLoading(false);
    }
  }, []);

  const fetchJuniorVerifications = useCallback(async () => {
    setJuniorVerificationsLoading(true);
    try {
      const res = await authFetch(`${API_URL}/admin/junior-verifications`);
      if (res.ok) {
        const data = await res.json();
        setJuniorVerifications(data.verifications || []);
      }
    } catch (err) {
      console.error('Error fetching junior verifications:', err);
    } finally {
      setJuniorVerificationsLoading(false);
    }
  }, []);

  const fetchPromoCodes = useCallback(async () => {
    setPromoCodesLoading(true);
    try {
      const res = await authFetch(`${API_URL}/admin/promo-codes`);
      if (res.ok) {
        const data = await res.json();
        setPromoCodes(data);
      }
    } catch (error) {
      console.error('Error fetching promo codes:', error);
    } finally {
      setPromoCodesLoading(false);
    }
  }, []);

  const fetchRevenue = useCallback(async (start: string, end: string) => {
    if (!start || !end) return;
    setRevenueLoading(true);
    try {
      const params = new URLSearchParams({ start, end });
      const res = await authFetch(`${API_URL}/admin/revenue?${params}`);
      if (res.ok) {
        const data = await res.json();
        setRevenueAmount(data.totalRevenue);
      }
    } catch (err) {
      console.error('Error fetching revenue:', err);
    } finally {
      setRevenueLoading(false);
    }
  }, []);

  const fetchInvoices = useCallback(async (start: string, end: string) => {
    if (!start || !end) return;
    setInvoicesLoading(true);
    try {
      const params = new URLSearchParams({ start, end });
      const res = await authFetch(`${API_URL}/admin/invoices?${params}`);
      if (res.ok) {
        const data = await res.json();
        setInvoicesList(data.invoices || []);
      }
    } catch (err) {
      console.error('Error fetching invoices:', err);
    } finally {
      setInvoicesLoading(false);
    }
  }, []);

  const handleSavePromoCode = async () => {
    try {
      const body = {
        code: promoForm.code,
        type: promoForm.type,
        value: Number(promoForm.value),
        durationMonths: Number(promoForm.durationMonths),
        maxUses: promoForm.maxUses ? Number(promoForm.maxUses) : null,
        expiresAt: promoForm.expiresAt || null,
      };
      const url = editingPromo
        ? `${API_URL}/admin/promo-codes/${editingPromo._id || editingPromo.id}`
        : `${API_URL}/admin/promo-codes`;
      const method = editingPromo ? 'PUT' : 'POST';
      const res = await authFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) {
        toast({ title: editingPromo ? 'Código actualizado' : 'Código creado' });
        setShowPromoForm(false);
        setEditingPromo(null);
        setPromoForm({ code: '', type: 'percentage_discount', value: '', durationMonths: '12', maxUses: '', expiresAt: '' });
        fetchPromoCodes();
      } else {
        const err = await res.json();
        toast({ title: err.error || 'Error', variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error al guardar código', variant: 'destructive' });
    }
  };

  const handleDeletePromoCode = async (id: string) => {
    if (!confirm('¿Eliminar este código promocional?')) return;
    try {
      const res = await authFetch(`${API_URL}/admin/promo-codes/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast({ title: 'Código eliminado' });
        fetchPromoCodes();
      }
    } catch (error) {
      toast({ title: 'Error al eliminar', variant: 'destructive' });
    }
  };

  const handleTogglePromoActive = async (code: any) => {
    try {
      const res = await authFetch(`${API_URL}/admin/promo-codes/${code._id || code.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !code.active }),
      });
      if (res.ok) {
        fetchPromoCodes();
      }
    } catch (error) {
      toast({ title: 'Error', variant: 'destructive' });
    }
  };

  const handleVerifyJunior = async (userId: string, status: 'verified' | 'rejected') => {
    if (status === 'rejected' && !window.confirm('¿Estás seguro de que quieres rechazar esta solicitud?')) return;
    try {
      const res = await authFetch(`${API_URL}/admin/users/${userId}/verify-junior`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        toast({ title: status === 'verified' ? 'Verificación aceptada' : 'Verificación rechazada' });
        fetchJuniorVerifications();
      } else {
        toast({ title: 'Error al actualizar verificación', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error de conexión', variant: 'destructive' });
    }
  };

  const handleDeleteSuggestion = async (id: string) => {
    if (!window.confirm('¿Eliminar esta sugerencia?')) return;
    try {
      const res = await authFetch(`${API_URL}/admin/suggestions/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast({ title: 'Sugerencia eliminada' });
        fetchSuggestions();
      } else {
        toast({ title: 'Error al eliminar sugerencia', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error al eliminar sugerencia', variant: 'destructive' });
    }
  };

  useEffect(() => {
    if (!authChecked) return;
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const startOfMonth = `${y}-${m}-01`;
    const today = `${y}-${m}-${d}`;
    setRevenueStart(startOfMonth);
    setRevenueEnd(today);
    fetchRevenue(startOfMonth, today);
  }, [authChecked, fetchRevenue]);

  useEffect(() => {
    if (!authChecked) return;
    fetchStats();
  }, [authChecked, fetchStats]);

  useEffect(() => {
    if (authChecked && view === 'users') {
      fetchUsers(searchQuery, page);
    }
    if (authChecked && view === 'suggestions') {
      fetchSuggestions();
    }
    if (authChecked && view === 'juniorVerifications') {
      fetchJuniorVerifications();
    }
    if (authChecked && view === 'promoCodes') {
      fetchPromoCodes();
    }
    if (authChecked && view === 'invoices') {
      if (invoiceStart && invoiceEnd) {
        fetchInvoices(invoiceStart, invoiceEnd);
      }
    }
  }, [authChecked, view, page, fetchUsers, searchQuery, fetchSuggestions, fetchJuniorVerifications, fetchPromoCodes, invoiceStart, invoiceEnd, fetchInvoices]);

  if (!authChecked) {
    return <div className="min-h-screen bg-background" />;
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchUsers(searchQuery, 1);
  };

  const handleSaveSubscription = async () => {
    if (!selectedUser) return;
    setLoading(true);
    try {
      const body: any = {};
      if (editPlan) body.plan = editPlan;
      if (editInterval) body.interval = editInterval;
      if (editStatus) body.status = editStatus;
      if (editPeriodEnd) body.currentPeriodEnd = new Date(editPeriodEnd).toISOString();

      const res = await authFetch(`${API_URL}/admin/users/${selectedUser.user.id}/subscription`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.warnings && data.warnings.length > 0) {
          toast({ title: `Actualizado con advertencias: ${data.warnings.join('; ')}`, variant: 'destructive' });
        } else {
          toast({ title: 'Suscripción actualizada correctamente' });
        }
        fetchUserDetail(selectedUser.user.id);
      } else {
        const data = await res.json();
        toast({ title: data.error || 'Error al actualizar', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: 'Error de conexión', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!selectedUser) return;
    setLoading(true);
    try {
      const res = await authFetch(`${API_URL}/admin/users/${selectedUser.user.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disabled: !selectedUser.user.disabled }),
      });

      if (res.ok) {
        toast({ title: selectedUser.user.disabled ? 'Cuenta reactivada' : 'Cuenta desactivada' });
        fetchUserDetail(selectedUser.user.id);
      } else {
        toast({ title: 'Error al cambiar estado', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: 'Error de conexión', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newEmail || !newPassword) {
      toast({ title: 'Rellena todos los campos obligatorios', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const res = await authFetch(`${API_URL}/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          email: newEmail,
          password: newPassword,
          country: newCountry,
          plan: newPlan,
          interval: newInterval,
        }),
      });

      if (res.ok) {
        toast({ title: 'Cuenta creada correctamente' });
        setNewName(''); setNewEmail(''); setNewPassword(''); setNewCountry('ES');
        setNewPlan('starter'); setNewInterval('monthly');
        setView('users');
        fetchUsers('', 1);
      } else {
        const data = await res.json();
        toast({ title: data.error || 'Error al crear cuenta', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: 'Error de conexión', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logoutUser();
  };

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const getStatusBadge = (status: string, periodEnd?: string) => {
    const isExpired = periodEnd && new Date(periodEnd) < new Date();
    const effectiveStatus = isExpired ? 'expired' : status;

    const colors: Record<string, string> = {
      active: 'bg-green-500/20 text-green-400 border-green-500/30',
      trial: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
      canceled: 'bg-red-500/20 text-red-400 border-red-500/30',
      expired: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    };
    const labels: Record<string, string> = {
      active: 'Activo', trial: 'Trial', cancelled: 'Cancelado', canceled: 'Cancelado', expired: 'Expirado',
    };
    return (
      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${colors[effectiveStatus] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
        {labels[effectiveStatus] || effectiveStatus}
      </span>
    );
  };

  // ============= RENDER =============

  return (
    <div className="min-h-screen bg-[#080808] text-white">
      {/* Top bar */}
      <div className="border-b border-white/10 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="h-6 w-6 text-white/60" />
            <span className="text-lg font-semibold text-white/90">Lyrium Admin Panel</span>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-2 text-sm text-white/50 hover:text-white/80 transition-colors">
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      </div>

      {/* Navigation tabs */}
      <div className="border-b border-white/10 bg-white/[0.01]">
        <div className="max-w-7xl mx-auto px-6 flex gap-1">
          {[
            { key: 'dashboard', label: 'Dashboard' },
            { key: 'users', label: 'Usuarios' },
            { key: 'createUser', label: 'Crear Cuenta' },
            { key: 'suggestions', label: 'Sugerencias' },
            { key: 'juniorVerifications', label: 'Verificaciones Junior' },
            { key: 'promoCodes', label: 'Códigos Promocionales' },
            { key: 'invoices', label: 'Facturas' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => { setView(tab.key as any); if (tab.key === 'dashboard') fetchStats(); }}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                view === tab.key || (tab.key === 'users' && view === 'userDetail')
                  ? 'border-white text-white'
                  : 'border-transparent text-white/40 hover:text-white/70'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* ============= DASHBOARD ============= */}
        {view === 'dashboard' && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-white/90">Estadísticas generales</h2>

            {stats ? (
              <>
                {/* Stats cards */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  {[
                    { label: 'Total Usuarios', value: stats.totalUsers, icon: Users, color: 'text-white/70' },
                    { label: 'Activos', value: stats.active, icon: TrendingUp, color: 'text-green-400' },
                    { label: 'En Trial', value: stats.trial, icon: Clock, color: 'text-blue-400' },
                    { label: 'Cancelados', value: stats.cancelled, icon: XCircle, color: 'text-red-400' },
                    { label: 'Expirados', value: stats.expired, icon: AlertTriangle, color: 'text-orange-400' },
                    { label: 'Junior Pendientes', value: stats.pendingJuniorVerifications ?? 0, icon: Shield, color: 'text-yellow-400' },
                  ].map(stat => (
                    <Card key={stat.label} className="bg-white/[0.04] border-white/10">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <stat.icon className={`h-5 w-5 ${stat.color}`} />
                        </div>
                        <p className="text-2xl font-bold text-white">{stat.value}</p>
                        <p className="text-xs text-white/40 mt-1">{stat.label}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Revenue + Plan distribution */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="bg-white/[0.04] border-white/10">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-white/60">Ingresos</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2 mb-3">
                        <input
                          type="date"
                          value={revenueStart}
                          onChange={(e) => setRevenueStart(e.target.value)}
                          className="px-2 py-1 rounded bg-white/[0.06] border border-white/10 text-sm text-white focus:outline-none focus:border-white/30"
                        />
                        <span className="text-white/40 text-sm">hasta</span>
                        <input
                          type="date"
                          value={revenueEnd}
                          onChange={(e) => setRevenueEnd(e.target.value)}
                          className="px-2 py-1 rounded bg-white/[0.06] border border-white/10 text-sm text-white focus:outline-none focus:border-white/30"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-white/20 text-white hover:bg-white/10"
                          onClick={() => fetchRevenue(revenueStart, revenueEnd)}
                          disabled={revenueLoading || !revenueStart || !revenueEnd}
                        >
                          Calcular
                        </Button>
                      </div>
                      {revenueLoading ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white/30" />
                      ) : (
                        <p className="text-3xl font-bold text-white">{revenueAmount != null ? revenueAmount.toFixed(2) : '—'} €</p>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="bg-white/[0.04] border-white/10">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-white/60">Distribución por plan</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-white/50">Starter</span>
                        <span className="text-white font-medium">{stats.starterCount}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-white/50">Avanzado</span>
                        <span className="text-white font-medium">{stats.advancedCount}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-white/[0.04] border-white/10">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-white/60">Distribución por periodo</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-white/50">Mensual</span>
                        <span className="text-white font-medium">{stats.monthlyCount}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-white/50">Anual</span>
                        <span className="text-white font-medium">{stats.annualCount}</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </>
            ) : (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white/30" />
              </div>
            )}
          </div>
        )}

        {/* ============= USER LIST ============= */}
        {view === 'users' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white/90">Usuarios ({totalUsers})</h2>
            </div>

            {/* Search */}
            <form onSubmit={handleSearch} className="flex gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar por nombre o email..."
                  className="pl-10 bg-white/[0.04] border-white/10 text-white placeholder:text-white/30"
                />
              </div>
              <Button type="submit" variant="outline" className="border-white/20 text-white hover:bg-white/10">
                Buscar
              </Button>
            </form>

            {/* Table */}
            <div className="border border-white/10 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.03]">
                    <th className="text-left px-4 py-3 text-xs font-medium text-white/40 uppercase">Nombre</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-white/40 uppercase">Email</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-white/40 uppercase">Plan</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-white/40 uppercase">Estado</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-white/40 uppercase">Vence</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-white/40 uppercase">Cuenta</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-white/40 uppercase">Descuento</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-white/40 uppercase"></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 text-sm text-white/80">{user.name}</td>
                      <td className="px-4 py-3 text-sm text-white/60">{user.email}</td>
                      <td className="px-4 py-3 text-sm text-white/60 capitalize">
                        {user.subscription ? `${user.subscription.plan} / ${user.subscription.interval === 'monthly' ? 'Mes' : 'Año'}` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {user.subscription
                          ? getStatusBadge(user.subscription.status, user.subscription.currentPeriodEnd)
                          : <span className="text-xs text-white/30">Sin suscripción</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-sm text-white/50">
                        {user.subscription ? formatDate(user.subscription.currentPeriodEnd) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {user.disabled ? (
                          <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full border bg-red-500/20 text-red-400 border-red-500/30">Desactivada</span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full border bg-green-500/20 text-green-400 border-green-500/30">Activa</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {user.juniorDiscountStatus ? (
                          <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${user.juniorDiscountStatus === 'verified' ? 'bg-green-500/20 text-green-400 border-green-500/30' : user.juniorDiscountStatus === 'pending' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'}`}>
                            {user.juniorDiscountStatus === 'verified' ? 'Junior' : user.juniorDiscountStatus === 'pending' ? 'Pendiente' : 'Rechazado'}
                          </span>
                        ) : (
                          <span className="text-xs text-white/20">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => fetchUserDetail(user.id)}
                          className="p-1.5 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                          title="Ver detalle"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && !loading && (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-white/30 text-sm">No se encontraron usuarios</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 rounded hover:bg-white/10 text-white/40 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm text-white/50">Página {page} de {totalPages}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-2 rounded hover:bg-white/10 text-white/40 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ============= USER DETAIL ============= */}
        {view === 'userDetail' && selectedUser && (
          <div className="space-y-6">
            <button
              onClick={() => { setView('users'); setSelectedUser(null); }}
              className="flex items-center gap-2 text-sm text-white/40 hover:text-white/70 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver a usuarios
            </button>

            {/* User info */}
            <Card className="bg-white/[0.04] border-white/10">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg text-white/90">{selectedUser.user.name}</CardTitle>
                  <button
                    onClick={handleToggleStatus}
                    disabled={loading}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      selectedUser.user.disabled
                        ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/30'
                        : 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30'
                    }`}
                  >
                    {selectedUser.user.disabled ? <Power className="h-4 w-4" /> : <PowerOff className="h-4 w-4" />}
                    {selectedUser.user.disabled ? 'Reactivar cuenta' : 'Desactivar cuenta'}
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Email', value: selectedUser.user.email },
                    { label: 'País', value: selectedUser.user.country },
                    { label: 'Creado', value: formatDate(selectedUser.user.createdAt) },
                    { label: 'Email verificado', value: selectedUser.user.emailVerified ? 'Sí' : 'No' },
                    { label: '2FA activo', value: selectedUser.user.twoFactorEnabled ? 'Sí' : 'No' },
                    { label: 'Google Calendar', value: selectedUser.user.googleCalendarConnected ? 'Conectado' : 'No' },
                    { label: 'Subcuentas', value: String(selectedUser.subaccounts.length) },
                    { label: 'Estado cuenta', value: selectedUser.user.disabled ? 'Desactivada' : 'Activa' },
                  ].map(item => (
                    <div key={item.label}>
                      <p className="text-xs text-white/30 mb-1">{item.label}</p>
                      <p className="text-sm text-white/80">{item.value}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Subscription management */}
            <Card className="bg-white/[0.04] border-white/10">
              <CardHeader>
                <CardTitle className="text-lg text-white/90">Gestión de suscripción</CardTitle>
              </CardHeader>
              <CardContent>
                {selectedUser.subscription ? (
                  <div className="space-y-6">
                    {/* Current subscription info */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pb-4 border-b border-white/10">
                      <div>
                        <p className="text-xs text-white/30 mb-1">Stripe Customer ID</p>
                        <p className="text-xs text-white/50 font-mono">{selectedUser.subscription.stripeCustomerId || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-white/30 mb-1">Stripe Subscription ID</p>
                        <p className="text-xs text-white/50 font-mono">{selectedUser.subscription.stripeSubscriptionId || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-white/30 mb-1">Auto-renovación</p>
                        <p className="text-sm text-white/80">{selectedUser.subscription.autoRenew ? 'Sí' : 'No'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-white/30 mb-1">Trial termina</p>
                        <p className="text-sm text-white/80">{formatDate(selectedUser.subscription.trialEndDate)}</p>
                      </div>
                    </div>

                    {/* Edit form */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <label className="text-xs text-white/40 mb-1 block">Plan</label>
                        <select
                          value={editPlan}
                          onChange={(e) => setEditPlan(e.target.value)}
                          className="w-full px-3 py-2 rounded-md bg-white/[0.06] border border-white/10 text-sm text-white focus:outline-none focus:border-white/30"
                        >
                          <option value="starter">Starter</option>
                          <option value="individual">Individual</option>
                          <option value="advanced">Avanzado</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-white/40 mb-1 block">Periodo</label>
                        <select
                          value={editInterval}
                          onChange={(e) => setEditInterval(e.target.value)}
                          className="w-full px-3 py-2 rounded-md bg-white/[0.06] border border-white/10 text-sm text-white focus:outline-none focus:border-white/30"
                        >
                          <option value="monthly">Mensual</option>
                          <option value="annual">Anual</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-white/40 mb-1 block">Estado</label>
                        <select
                          value={editStatus}
                          onChange={(e) => setEditStatus(e.target.value)}
                          className="w-full px-3 py-2 rounded-md bg-white/[0.06] border border-white/10 text-sm text-white focus:outline-none focus:border-white/30"
                        >
                          <option value="trial">Trial</option>
                          <option value="active">Activo</option>
                          <option value="cancelled">Cancelado</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-white/40 mb-1 block">Vencimiento</label>
                        <input
                          type="datetime-local"
                          value={editPeriodEnd}
                          onChange={(e) => setEditPeriodEnd(e.target.value)}
                          className="w-full px-3 py-2 rounded-md bg-white/[0.06] border border-white/10 text-sm text-white focus:outline-none focus:border-white/30"
                        />
                      </div>
                    </div>

                    <Button
                      onClick={handleSaveSubscription}
                      disabled={loading}
                      className="bg-white text-black hover:bg-white/90"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      Guardar cambios en suscripción
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-white/40">Este usuario no tiene suscripción</p>
                )}
              </CardContent>
            </Card>

            {/* Subaccounts */}
            {selectedUser.subaccounts.length > 0 && (
              <Card className="bg-white/[0.04] border-white/10">
                <CardHeader>
                  <CardTitle className="text-lg text-white/90">Subcuentas ({selectedUser.subaccounts.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {selectedUser.subaccounts.map(sub => (
                      <div key={sub.id} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/5">
                        <div>
                          <p className="text-sm text-white/80">{sub.name}</p>
                          <p className="text-xs text-white/40">{sub.email}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-white/30">Creada: {formatDate(sub.createdAt)}</p>
                          <p className="text-xs text-white/30">2FA: {sub.twoFactorEnabled ? 'Sí' : 'No'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Invoices */}
            {selectedUser.invoices && selectedUser.invoices.length > 0 && (
              <Card className="bg-white/[0.04] border-white/10">
                <CardHeader>
                  <CardTitle className="text-lg text-white/90">Facturas ({selectedUser.invoices.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="border border-white/10 rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-white/10 bg-white/[0.03]">
                          <th className="text-left px-4 py-3 text-xs font-medium text-white/40 uppercase">Nº Factura</th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-white/40 uppercase">Fecha</th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-white/40 uppercase">Concepto</th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-white/40 uppercase">Importe</th>
                          <th className="text-right px-4 py-3 text-xs font-medium text-white/40 uppercase"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedUser.invoices.map((inv) => (
                          <tr key={inv.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                            <td className="px-4 py-3 text-sm text-white/80">{inv.invoiceNumber}</td>
                            <td className="px-4 py-3 text-sm text-white/60">{formatDate(inv.date)}</td>
                            <td className="px-4 py-3 text-sm text-white/60">{inv.concept || '—'}</td>
                            <td className="px-4 py-3 text-sm text-white/80">{inv.totalAmount?.toFixed(2)} €</td>
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => window.open(`${window.location.origin}/invoice/${inv.publicId}`, '_blank')}
                                className="p-1.5 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                                title="Ver factura"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ============= CREATE USER ============= */}
        {view === 'createUser' && (
          <div className="max-w-lg space-y-6">
            <h2 className="text-xl font-semibold text-white/90">Crear cuenta manualmente</h2>

            <Card className="bg-white/[0.04] border-white/10">
              <CardContent className="pt-6">
                <form onSubmit={handleCreateUser} className="space-y-4">
                  <div>
                    <label className="text-xs text-white/40 mb-1 block">Nombre *</label>
                    <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nombre completo"
                      className="bg-white/[0.04] border-white/10 text-white placeholder:text-white/30" />
                  </div>
                  <div>
                    <label className="text-xs text-white/40 mb-1 block">Email *</label>
                    <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="email@ejemplo.com" type="email"
                      className="bg-white/[0.04] border-white/10 text-white placeholder:text-white/30" />
                  </div>
                  <div>
                    <label className="text-xs text-white/40 mb-1 block">Contraseña *</label>
                    <Input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Contraseña" type="password"
                      className="bg-white/[0.04] border-white/10 text-white placeholder:text-white/30" />
                  </div>
                  <div>
                    <label className="text-xs text-white/40 mb-1 block">País</label>
                    <Input value={newCountry} onChange={(e) => setNewCountry(e.target.value)} placeholder="ES"
                      className="bg-white/[0.04] border-white/10 text-white placeholder:text-white/30" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-white/40 mb-1 block">Plan</label>
                        <select
                          value={newPlan}
                          onChange={(e) => setNewPlan(e.target.value)}
                          className="w-full px-3 py-2 rounded-md bg-white/[0.06] border border-white/10 text-sm text-white focus:outline-none focus:border-white/30"
                        >
                          <option value="starter">Starter</option>
                          <option value="individual">Individual</option>
                          <option value="advanced">Avanzado</option>
                        </select>
                    </div>
                    <div>
                      <label className="text-xs text-white/40 mb-1 block">Periodo</label>
                      <select
                        value={newInterval}
                        onChange={(e) => setNewInterval(e.target.value)}
                        className="w-full px-3 py-2 rounded-md bg-white/[0.06] border border-white/10 text-sm text-white focus:outline-none focus:border-white/30"
                      >
                        <option value="monthly">Mensual</option>
                        <option value="annual">Anual</option>
                      </select>
                    </div>
                  </div>

                  <p className="text-xs text-white/30">
                    La cuenta se creará con email verificado y 14 días de trial. Sin 2FA obligatorio.
                  </p>

                  <Button type="submit" disabled={loading} className="w-full bg-white text-black hover:bg-white/90">
                    <UserPlus className="h-4 w-4 mr-2" />
                    Crear cuenta
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ============= SUGGESTIONS ============= */}
        {view === 'suggestions' && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-white/90">Sugerencias</h2>
            {suggestionsLoading ? (
              <div className="text-white/50">Cargando...</div>
            ) : suggestions.length === 0 ? (
              <div className="text-white/50">No hay sugerencias.</div>
            ) : (
              <div className="space-y-4">
                {suggestions.map((s) => (
                  <Card key={s._id} className="bg-white/[0.04] border-white/10">
                    <CardContent className="pt-6">
                      <p className="text-sm text-white/80 whitespace-pre-wrap">{s.text}</p>
                      <div className="mt-4 flex items-center justify-between">
                        <span className="text-xs text-white/40">{new Date(s.createdAt).toLocaleString()}</span>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteSuggestion(s._id)}
                        >
                          Eliminar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ============= PROMO CODES ============= */}
        {view === 'promoCodes' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Códigos promocionales</h2>
              <Button onClick={() => { setShowPromoForm(true); setEditingPromo(null); setPromoForm({ code: '', type: 'percentage_discount', value: '', durationMonths: '12', maxUses: '', expiresAt: '' }); }}>
                <Plus className="h-4 w-4 mr-2" /> Nuevo código
              </Button>
            </div>
            {promoCodesLoading ? (
              <p className="text-muted-foreground">Cargando...</p>
            ) : (
              <div className="bg-card border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-3 font-medium">Código</th>
                      <th className="text-left p-3 font-medium">Tipo</th>
                      <th className="text-left p-3 font-medium">Valor</th>
                      <th className="text-left p-3 font-medium">Duración</th>
                      <th className="text-left p-3 font-medium">Usos</th>
                      <th className="text-left p-3 font-medium">Expira</th>
                      <th className="text-left p-3 font-medium">Estado</th>
                      <th className="text-right p-3 font-medium">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {promoCodes.map((code) => (
                      <tr key={code._id || code.id} className="border-t">
                        <td className="p-3 font-mono font-medium">{code.code}</td>
                        <td className="p-3">{code.type === 'percentage_discount' ? 'Descuento %' : 'Meses gratis'}</td>
                        <td className="p-3">{code.type === 'percentage_discount' ? `${code.value}%` : `${code.value} meses`}</td>
                        <td className="p-3">{code.durationMonths} meses</td>
                        <td className="p-3">{code.usedCount} / {code.maxUses ?? '∞'}</td>
                        <td className="p-3">{code.expiresAt ? new Date(code.expiresAt).toLocaleDateString() : 'Nunca'}</td>
                        <td className="p-3">
                          <span className={`px-2 py-1 rounded-full text-xs ${code.active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                            {code.active ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="p-3 text-right space-x-2">
                          <Button size="sm" variant="outline" onClick={() => handleTogglePromoActive(code)}>
                            {code.active ? 'Desactivar' : 'Activar'}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => { setEditingPromo(code); setPromoForm({ code: code.code, type: code.type, value: String(code.value), durationMonths: String(code.durationMonths), maxUses: code.maxUses ? String(code.maxUses) : '', expiresAt: code.expiresAt ? code.expiresAt.split('T')[0] : '' }); setShowPromoForm(true); }}>
                            Editar
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => handleDeletePromoCode(code._id || code.id)}>
                            Eliminar
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {promoCodes.length === 0 && (
                      <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No hay códigos promocionales</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ============= INVOICES ============= */}
        {view === 'invoices' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white/90">Facturas</h2>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="date"
                value={invoiceStart}
                onChange={(e) => setInvoiceStart(e.target.value)}
                className="px-3 py-2 rounded bg-white/[0.06] border border-white/10 text-sm text-white focus:outline-none focus:border-white/30"
              />
              <span className="text-white/40 text-sm">hasta</span>
              <input
                type="date"
                value={invoiceEnd}
                onChange={(e) => setInvoiceEnd(e.target.value)}
                className="px-3 py-2 rounded bg-white/[0.06] border border-white/10 text-sm text-white focus:outline-none focus:border-white/30"
              />
              <Button
                variant="outline"
                className="border-white/20 text-white hover:bg-white/10"
                onClick={() => fetchInvoices(invoiceStart, invoiceEnd)}
                disabled={invoicesLoading || !invoiceStart || !invoiceEnd}
              >
                Buscar
              </Button>
            </div>

            {invoicesLoading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white/30" />
              </div>
            ) : invoicesList.length === 0 ? (
              <div className="text-white/50 text-sm">No hay facturas en el rango seleccionado.</div>
            ) : (
              <div className="border border-white/10 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.03]">
                      <th className="text-left px-4 py-3 text-xs font-medium text-white/40 uppercase">Nº Factura</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-white/40 uppercase">Cliente</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-white/40 uppercase">Email</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-white/40 uppercase">Fecha</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-white/40 uppercase">Importe</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-white/40 uppercase"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoicesList.map((inv) => (
                      <tr key={inv.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3 text-sm text-white/80">{inv.invoiceNumber}</td>
                        <td className="px-4 py-3 text-sm text-white/60">{inv.clientName || '—'}</td>
                        <td className="px-4 py-3 text-sm text-white/60">{inv.clientEmail || '—'}</td>
                        <td className="px-4 py-3 text-sm text-white/60">{formatDate(inv.date)}</td>
                        <td className="px-4 py-3 text-sm text-white/80">{inv.totalAmount?.toFixed(2)} €</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => window.open(`${window.location.origin}/invoice/${inv.publicId}`, '_blank')}
                            className="p-1.5 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                            title="Ver factura"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ============= JUNIOR VERIFICATIONS ============= */}
        {view === 'juniorVerifications' && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-white/90">Verificaciones Junior</h2>
            {juniorVerificationsLoading ? (
              <div className="text-white/50">Cargando...</div>
            ) : juniorVerifications.length === 0 ? (
              <div className="text-white/50">No hay verificaciones pendientes.</div>
            ) : (
              <div className="border border-white/10 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.03]">
                      <th className="text-left px-4 py-3 text-xs font-medium text-white/40 uppercase">Nombre</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-white/40 uppercase">Email</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-white/40 uppercase">País</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-white/40 uppercase">Estado</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-white/40 uppercase">Fecha</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-white/40 uppercase">Prueba</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-white/40 uppercase">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {juniorVerifications.map((v) => (
                      <tr key={v.accountId} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3 text-sm text-white/80">{v.name}</td>
                        <td className="px-4 py-3 text-sm text-white/60">{v.email}</td>
                        <td className="px-4 py-3 text-sm text-white/60">{v.country}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${v.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' : v.status === 'verified' ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'}`}>
                            {v.status === 'pending' ? 'Pendiente' : v.status === 'verified' ? 'Verificado' : 'Rechazado'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-white/50">{formatDate(v.requestedAt)}</td>
                        <td className="px-4 py-3">
                          {v.proofUrl ? (
                            <a href={v.proofUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 hover:text-blue-300">Ver prueba</a>
                          ) : (
                            <span className="text-xs text-white/30">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleVerifyJunior(v.accountId, 'verified')}
                              className="px-2 py-1 rounded text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 transition-colors"
                            >
                              Aceptar
                            </button>
                            <button
                              onClick={() => handleVerifyJunior(v.accountId, 'rejected')}
                              className="px-2 py-1 rounded text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
                            >
                              Rechazar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {showPromoForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-card border rounded-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold mb-4">{editingPromo ? 'Editar código' : 'Nuevo código promocional'}</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1">Código</label>
                <input value={promoForm.code} onChange={(e) => setPromoForm({ ...promoForm, code: e.target.value.toUpperCase() })} className="w-full px-3 py-2 bg-muted border rounded-lg text-sm" placeholder="EJ: VERANO25" />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Tipo</label>
                <select value={promoForm.type} onChange={(e) => setPromoForm({ ...promoForm, type: e.target.value as any })} className="w-full px-3 py-2 bg-muted border rounded-lg text-sm">
                  <option value="percentage_discount">Descuento porcentaje</option>
                  <option value="free_months">Meses gratuitos</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Valor</label>
                <input type="number" value={promoForm.value} onChange={(e) => setPromoForm({ ...promoForm, value: e.target.value })} className="w-full px-3 py-2 bg-muted border rounded-lg text-sm" placeholder={promoForm.type === 'percentage_discount' ? 'Ej: 25' : 'Ej: 3'} />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Duración (meses)</label>
                <input type="number" value={promoForm.durationMonths} onChange={(e) => setPromoForm({ ...promoForm, durationMonths: e.target.value })} className="w-full px-3 py-2 bg-muted border rounded-lg text-sm" placeholder="12" />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Usos máximos (dejar vacío para ilimitado)</label>
                <input type="number" value={promoForm.maxUses} onChange={(e) => setPromoForm({ ...promoForm, maxUses: e.target.value })} className="w-full px-3 py-2 bg-muted border rounded-lg text-sm" placeholder="Ilimitado" />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Fecha de expiración</label>
                <input type="date" value={promoForm.expiresAt} onChange={(e) => setPromoForm({ ...promoForm, expiresAt: e.target.value })} className="w-full px-3 py-2 bg-muted border rounded-lg text-sm" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => { setShowPromoForm(false); setEditingPromo(null); }}>Cancelar</Button>
                <Button onClick={handleSavePromoCode}>{editingPromo ? 'Guardar cambios' : 'Crear código'}</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
