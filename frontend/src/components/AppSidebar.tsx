import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "next-themes";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  LayoutDashboard,
  Users,
  FileText,
  FileSignature,
  MessageSquare,
  Shield,
  PenTool,
  Calculator,
  Scale,
  Zap,
  PanelLeftClose,
  PanelLeft,
  LogOut,
  UserCircle,
  Sun,
  Moon,
  X,
} from "lucide-react";



const AppSidebar = ({ 
  collapsed, 
  onToggle,
  onProfileClick,
  mobileOpen,
  onMobileClose,
}: { 
  collapsed: boolean; 
  onToggle: () => void;
  onProfileClick: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) => {
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [isMainAccount, setIsMainAccount] = useState(true);

  const navItems = [
    { to: "/", icon: LayoutDashboard, label: t('nav.dashboard') },
    { to: "/clientes", icon: Users, label: t('nav.clients') },
    { to: "/resumenes", icon: FileText, label: t('nav.documents') },
    { to: "/contratos", icon: FileSignature, label: t('nav.contracts') },
    { to: "/asistente", icon: MessageSquare, label: t('nav.assistant') },
    { to: "/defensa", icon: Shield, label: t('nav.defense') },
    { to: "/redaccion", icon: PenTool, label: t('nav.writing') },
    { to: "/fiscal", icon: Calculator, label: t('nav.fiscal') },
    { to: "/automatizaciones", icon: Zap, label: t('nav.automations') },
  ];

  useEffect(() => {
    const userType = sessionStorage.getItem('userType');
    setIsMainAccount(userType !== 'subaccount');
  }, []);

  const handleLogout = () => {
    sessionStorage.clear();
    navigate("/login");
  };

  const handleNavClick = () => {
    if (isMobile && onMobileClose) onMobileClose();
  };

  // Mobile: overlay drawer
  if (isMobile) {
    return (
      <>
        {/* Backdrop */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 transition-opacity"
            onClick={onMobileClose}
          />
        )}
        {/* Drawer */}
        <aside
          className={`fixed left-0 top-0 z-50 h-screen w-72 border-r border-border bg-card flex flex-col transition-transform duration-300 ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Scale className="h-6 w-6 text-foreground shrink-0" />
              <div className="min-w-0">
                <h1 className="text-lg font-semibold tracking-tight text-foreground leading-tight">Lyrium</h1>
                <p className="text-[10px] text-muted-foreground font-mono">{t('sidebar.legalManagement')}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <button onClick={onMobileClose} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <nav className="flex-1 space-y-1 p-4 overflow-y-auto">
            {navItems.map((item) => {
              const isActive = location.pathname === item.to;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  title={item.label}
                  onClick={handleNavClick}
                  className={`flex items-center gap-3 rounded-md text-sm font-medium transition-colors px-3 py-2.5 ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>

          <div className="border-t border-border p-4 space-y-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => { handleLogout(); handleNavClick(); }}
                title={t('nav.logout')}
                className="flex items-center gap-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors px-3 py-2.5 flex-1"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                {t('nav.logout')}
              </button>
              {isMainAccount && (
                <button
                  onClick={() => { onProfileClick(); handleNavClick(); }}
                  title="Perfil"
                  className="flex items-center justify-center rounded-md text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors px-3 py-2.5"
                >
                  <UserCircle className="h-4 w-4 shrink-0" />
                </button>
              )}
            </div>
          </div>
        </aside>
      </>
    );
  }

  // Desktop: fixed sidebar
  return (
    <aside
      className={`h-screen border-r border-border bg-card flex flex-col fixed left-0 top-0 z-30 transition-all duration-300 ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className={`flex items-center gap-3 overflow-hidden ${collapsed ? "justify-center w-full" : ""}`}>
          <Scale className="h-6 w-6 text-foreground shrink-0" />
          {!collapsed && (
            <div className="min-w-0">
              <h1 className="text-lg font-semibold tracking-tight text-foreground leading-tight">Lyrium</h1>
              <p className="text-[10px] text-muted-foreground font-mono">{t('sidebar.legalManagement')}</p>
            </div>
          )}
        </div>
        {!collapsed && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button onClick={onToggle} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {collapsed && (
        <button onClick={onToggle} className="mx-auto mt-3 text-muted-foreground hover:text-foreground transition-colors">
          <PanelLeft className="h-4 w-4" />
        </button>
      )}

      <nav className={`flex-1 space-y-1 ${collapsed ? "p-2 mt-1" : "p-4"}`}>
        {navItems.map((item) => {
          const isActive = location.pathname === item.to;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              title={item.label}
              className={`flex items-center gap-3 rounded-md text-sm font-medium transition-colors ${
                collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5"
              } ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && item.label}
            </NavLink>
          );
        })}
      </nav>

      <div className={`border-t border-border ${collapsed ? "p-2" : "p-4"} space-y-2`}>
        <div className={`flex items-center gap-2 ${collapsed ? "flex-col" : ""}`}>
          <button
            onClick={handleLogout}
            title={t('nav.logout')}
            className={`flex items-center gap-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors ${collapsed ? "justify-center px-2 py-2.5 w-full" : "px-3 py-2.5 flex-1"}`}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && t('nav.logout')}
          </button>
          {isMainAccount && (
            <button
              onClick={onProfileClick}
              title="Perfil"
              className={`flex items-center justify-center rounded-md text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors ${collapsed ? "px-2 py-2.5 w-full" : "px-3 py-2.5"}`}
            >
              <UserCircle className="h-4 w-4 shrink-0" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};

export default AppSidebar;
