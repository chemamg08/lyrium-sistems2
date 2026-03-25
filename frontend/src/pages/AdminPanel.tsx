import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { authFetch } from '@/lib/authFetch';
import {
  Users, TrendingUp, Clock, XCircle, AlertTriangle,
  Search, ChevronLeft, ChevronRight, Eye, UserPlus,
  Shield, LogOut, ArrowLeft, Save, Power, PowerOff,
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
}

const AdminPanel = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [view, setView] = useState<'dashboard' | 'users' | 'userDetail' | 'createUser'>('dashboard');
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(false);

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

  // Check admin role on mount
  useEffect(() => {
    const role = sessionStorage.getItem('userRole');
    if (role !== 'admin') {
      navigate('/login');
    }
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

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    if (view === 'users') {
      fetchUsers(searchQuery, page);
    }
  }, [view, page, fetchUsers, searchQuery]);

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

  const handleLogout = async () => {
    try {
      await authFetch(`${API_URL}/accounts/logout`, { method: 'POST' });
    } catch {}
    sessionStorage.clear();
    navigate('/login');
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
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  {[
                    { label: 'Total Usuarios', value: stats.totalUsers, icon: Users, color: 'text-white/70' },
                    { label: 'Activos', value: stats.active, icon: TrendingUp, color: 'text-green-400' },
                    { label: 'En Trial', value: stats.trial, icon: Clock, color: 'text-blue-400' },
                    { label: 'Cancelados', value: stats.cancelled, icon: XCircle, color: 'text-red-400' },
                    { label: 'Expirados', value: stats.expired, icon: AlertTriangle, color: 'text-orange-400' },
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
                      <CardTitle className="text-sm font-medium text-white/60">Ingresos este mes</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-bold text-white">{stats.monthlyRevenue.toFixed(2)} €</p>
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
                      <td colSpan={7} className="px-4 py-8 text-center text-white/30 text-sm">No se encontraron usuarios</td>
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
      </div>
    </div>
  );
};

export default AdminPanel;
