import { useState, useEffect } from "react";
import { Users, Shield, FileSignature, Share2, Brain, Calendar } from "lucide-react";
import StatCard from "@/components/StatCard";
import { useTranslation } from "react-i18next";
import SharedFilesModal from "@/components/SharedFilesModal";
import ImproveAIModal from "@/components/ImproveAIModal";
import { authFetch } from '../lib/authFetch';
import { useNavigate } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL;

const Dashboard = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isVisible, setIsVisible] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showImproveAIModal, setShowImproveAIModal] = useState(false);
  const [stats, setStats] = useState({
    clientsRegistered: 0,
    contractsCreated: 0,
    defensesCreated: 0
  });
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [todayEvents, setTodayEvents] = useState<{ id: string; summary: string; start: string; allDay: boolean }[]>([]);

  useEffect(() => {
    setIsVisible(false);
    const timer = setTimeout(() => setIsVisible(true), 10);
    loadStats();
    loadCalendarWidget();
    return () => clearTimeout(timer);
  }, []);

  const loadStats = async () => {
    try {
      const accountId = sessionStorage.getItem('accountId');
      if (!accountId) return;
      
      const response = await authFetch(`${API_URL}/stats?accountId=${accountId}`);
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error al cargar estadísticas:', error);
    }
  };

  const loadCalendarWidget = async () => {
    try {
      const accountId = sessionStorage.getItem('accountId');
      if (!accountId) return;
      const statusRes = await authFetch(`${API_URL}/calendar/status?accountId=${accountId}`);
      if (!statusRes.ok) return;
      const statusData = await statusRes.json();
      setCalendarConnected(statusData.connected);
      if (!statusData.connected) return;
      const eventsRes = await authFetch(`${API_URL}/calendar/events?accountId=${accountId}`);
      if (!eventsRes.ok) return;
      const eventsData = await eventsRes.json();
      const today = new Date().toISOString().split('T')[0];
      const filtered = (eventsData.events || [])
        .filter((e: any) => {
          const eDate = (e.start?.dateTime || e.start?.date || '').split('T')[0];
          return eDate === today;
        })
        .slice(0, 5)
        .map((e: any) => ({
          id: e.id,
          summary: e.summary || '',
          start: e.start?.dateTime || e.start?.date || '',
          allDay: !e.start?.dateTime,
        }));
      setTodayEvents(filtered);
    } catch { /* ignore */ }
  };

  const cards = [
    { icon: Users, label: t('dashboard.stats.clients'), value: stats.clientsRegistered },
    { icon: Shield, label: t('dashboard.stats.defenses'), value: stats.defensesCreated },
    { icon: FileSignature, label: t('dashboard.stats.contracts'), value: stats.contractsCreated },
  ];

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-start justify-between mb-6 md:mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t('dashboard.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('dashboard.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowImproveAIModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md border border-border bg-card hover:bg-accent text-foreground transition-colors"
          >
            <Brain className="h-4 w-4" />
            {t('improveAI.title')}
          </button>
          <button
            onClick={() => setShowShareModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md border border-border bg-card hover:bg-accent text-foreground transition-colors"
          >
            <Share2 className="h-4 w-4" />
            {t('shareFiles.title')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card, index) => (
          <div
            key={index}
            className={`${isVisible ? 'animate-slide-up' : 'opacity-0'}`}
            style={{ animationDelay: `${index * 75}ms` }}
          >
            <StatCard icon={card.icon} label={card.label} value={card.value} />
          </div>
        ))}
      </div>

      <div className={`mt-6 rounded-xl border border-border bg-card p-4 ${isVisible ? 'animate-slide-up' : 'opacity-0'}`} style={{ animationDelay: '300ms' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-foreground" />
            <h3 className="text-sm font-semibold text-foreground">{t('dashboard.calendarToday')}</h3>
          </div>
          <button onClick={() => navigate('/automatizaciones')} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            {t('dashboard.calendarViewAll')}
          </button>
        </div>
        {!calendarConnected ? (
          <p className="text-xs text-muted-foreground">{t('dashboard.calendarNotConnected')}</p>
        ) : todayEvents.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('dashboard.calendarNoEventsToday')}</p>
        ) : (
          <div className="space-y-2">
            {todayEvents.map((ev) => (
              <div key={ev.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/40 border border-border">
                <div className="h-7 w-7 rounded-md bg-foreground/10 flex items-center justify-center shrink-0">
                  <Calendar className="h-3.5 w-3.5 text-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground truncate">{ev.summary}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {ev.allDay ? t('automations.calendarAllDay') : new Date(ev.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <SharedFilesModal isOpen={showShareModal} onClose={() => setShowShareModal(false)} />
      <ImproveAIModal isOpen={showImproveAIModal} onClose={() => setShowImproveAIModal(false)} />
    </div>
  );
};

export default Dashboard;
