import { Outlet, Navigate } from "react-router-dom";
import { useState } from "react";
import { Menu } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import AppSidebar from "./AppSidebar";
import ProfileModal from "./ProfileModal";

const AppLayout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = useIsMobile();

  if (!sessionStorage.getItem('userId')) {
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
