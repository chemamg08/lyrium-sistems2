import { useState, useEffect } from "react";
import { Users, Shield, FileSignature, Share2 } from "lucide-react";
import StatCard from "@/components/StatCard";
import { useTranslation } from "react-i18next";
import SharedFilesModal from "@/components/SharedFilesModal";
import { authFetch } from '../lib/authFetch';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const Dashboard = () => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [stats, setStats] = useState({
    clientsRegistered: 0,
    contractsCreated: 0,
    defensesCreated: 0
  });

  useEffect(() => {
    setIsVisible(false);
    const timer = setTimeout(() => setIsVisible(true), 10);
    loadStats();
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
        <button
          onClick={() => setShowShareModal(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md border border-border bg-card hover:bg-accent text-foreground transition-colors shrink-0"
        >
          <Share2 className="h-4 w-4" />
          {t('shareFiles.title')}
        </button>
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

      <SharedFilesModal isOpen={showShareModal} onClose={() => setShowShareModal(false)} />
    </div>
  );
};

export default Dashboard;
