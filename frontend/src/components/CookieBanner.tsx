import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { X, ChevronDown, ChevronUp } from "lucide-react";

const LANDING_PATHS = ["/landing", "/terminos", "/privacidad", "/cookies"];

const CookieBanner = () => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  const isLandingPage = LANDING_PATHS.includes(pathname);

  useEffect(() => {
    if (!isLandingPage) return;
    const consent = localStorage.getItem("lyrium_cookie_consent");
    if (!consent) {
      const timer = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [isLandingPage]);

  if (!isLandingPage) return null;

  const save = (choice: object) => {
    localStorage.setItem("lyrium_cookie_consent", JSON.stringify(choice));
    setVisible(false);
  };

  const acceptAll = () => save({ essential: true, analytics: true, marketing: true });
  const acceptEssential = () => save({ essential: true, analytics: false, marketing: false });
  const saveCustom = () => save({ essential: true, analytics, marketing });

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 max-w-sm w-[calc(100vw-2rem)] sm:w-96 rounded-2xl border border-white/10 bg-[#111]/95 backdrop-blur-xl p-5 shadow-2xl animate-in slide-in-from-bottom-4 fade-in duration-500">
      {/* Close */}
      <button
        onClick={acceptEssential}
        className="absolute top-3 right-3 text-white/20 hover:text-white/50 transition-colors"
        aria-label="Close"
      >
        <X className="h-4 w-4" />
      </button>

      {/* Content */}
      <p className="text-sm font-semibold text-white/90 mb-1.5">
        {t("landing.cookieTitle")}
      </p>
      <p className="text-xs text-white/40 leading-relaxed mb-4">
        {t("landing.cookieDesc")}
      </p>

      {/* Panel de configuración expandible */}
      {expanded && (
        <div className="mb-4 space-y-3 border border-white/10 rounded-xl p-3">
          {/* Esenciales — siempre activas */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-white/80">{t("landing.cookieCatEssential")}</p>
              <p className="text-[11px] text-white/35">{t("landing.cookieCatEssentialDesc")}</p>
            </div>
            <div className="w-8 h-4 rounded-full bg-white/20 flex items-center justify-end px-0.5 cursor-not-allowed">
              <div className="w-3 h-3 rounded-full bg-white/40" />
            </div>
          </div>
          {/* Analíticas */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-white/80">{t("landing.cookieCatAnalytics")}</p>
              <p className="text-[11px] text-white/35">{t("landing.cookieCatAnalyticsDesc")}</p>
            </div>
            <button
              onClick={() => setAnalytics(!analytics)}
              className={`w-8 h-4 rounded-full flex items-center px-0.5 transition-colors ${
                analytics ? "bg-white justify-end" : "bg-white/10 justify-start"
              }`}
            >
              <div className={`w-3 h-3 rounded-full transition-colors ${analytics ? "bg-black" : "bg-white/40"}`} />
            </button>
          </div>
          {/* Marketing */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-white/80">{t("landing.cookieCatMarketing")}</p>
              <p className="text-[11px] text-white/35">{t("landing.cookieCatMarketingDesc")}</p>
            </div>
            <button
              onClick={() => setMarketing(!marketing)}
              className={`w-8 h-4 rounded-full flex items-center px-0.5 transition-colors ${
                marketing ? "bg-white justify-end" : "bg-white/10 justify-start"
              }`}
            >
              <div className={`w-3 h-3 rounded-full transition-colors ${marketing ? "bg-black" : "bg-white/40"}`} />
            </button>
          </div>
        </div>
      )}

      {/* Buttons */}
      {!expanded ? (
        <div className="flex gap-2">
          <button
            onClick={acceptAll}
            className="flex-1 rounded-full bg-white text-black text-xs font-semibold py-2.5 hover:bg-white/90 transition-colors"
          >
            {t("landing.cookieAccept")}
          </button>
          <button
            onClick={() => setExpanded(true)}
            className="flex items-center gap-1 rounded-full border border-white/15 text-white/60 text-xs font-semibold px-3 py-2.5 hover:bg-white/5 transition-colors"
          >
            {t("landing.cookieConfigure")} <ChevronDown className="h-3 w-3" />
          </button>
          <button
            onClick={acceptEssential}
            className="flex-1 rounded-full border border-white/15 text-white/60 text-xs font-semibold py-2.5 hover:bg-white/5 transition-colors"
          >
            {t("landing.cookieReject")}
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={saveCustom}
            className="flex-1 rounded-full bg-white text-black text-xs font-semibold py-2.5 hover:bg-white/90 transition-colors"
          >
            {t("landing.cookieSave")}
          </button>
          <button
            onClick={() => setExpanded(false)}
            className="flex items-center gap-1 rounded-full border border-white/15 text-white/60 text-xs font-semibold px-3 py-2.5 hover:bg-white/5 transition-colors"
          >
            <ChevronUp className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
};

export default CookieBanner;
