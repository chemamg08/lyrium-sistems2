import { Outlet, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Menu, Scale } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { authFetch, persistUserSession } from "@/lib/authFetch";
import AppSidebar from "./AppSidebar";
import ProfileModal from "./ProfileModal";

const API_URL = import.meta.env.VITE_API_URL;

const AppLayout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authState, setAuthState] = useState<'checking' | 'authenticated' | 'unauthenticated'>('checking');
  const isMobile = useIsMobile();

  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      try {
        const res = await authFetch(`${API_URL}/accounts/me`);
        if (!res.ok) {
          if (!cancelled) setAuthState('unauthenticated');
          return;
        }

        const data = await res.json();
        if (!data?.user?.id) {
          if (!cancelled) setAuthState('unauthenticated');
          return;
        }

        persistUserSession(data.user);
        if (!cancelled) setAuthState('authenticated');
      } catch {
        if (!cancelled) setAuthState('unauthenticated');
      }
    };

    restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  if (authState === 'checking') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-4">
        <Scale className="h-10 w-10 text-primary animate-spin" />
        <span className="text-muted-foreground text-sm">Cargando tu espacio de trabajo…</span>
      </div>
    );
  }

  if (authState === 'unauthenticated') {
    return <Navigate to="/landing" replace />;
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar 
        collapsed={isMobile ? false : collapsed} 
        onToggle={() => isMobile ? setMobileOpen(false) : setCollapsed(!collapsed)}
        onProfileClick={() => setShowProfileModal(true)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div className={`flex-1 flex flex-col transition-all duration-300 ${isMobile ? "ml-0" : collapsed ? "ml-16" : "ml-64"}`}>
        {/* Mobile top bar */}
        {isMobile && (
          <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-card px-4 py-3">
            <button onClick={() => setMobileOpen(true)} className="p-1.5 rounded-md hover:bg-accent transition-colors">
              <Menu className="h-5 w-5 text-foreground" />
            </button>
            <span className="text-sm font-semibold text-foreground">LexPanel</span>
          </div>
        )}
        <main className="flex-1">
          <Outlet />
        </main>
      </div>

      <ProfileModal isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} />
    </div>
  );
};

export default AppLayout;
