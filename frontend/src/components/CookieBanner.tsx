import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

const CookieBanner = () => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem("lyrium_cookie_consent");
    if (!consent) {
      const timer = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleConsent = (analytics: boolean) => {
    localStorage.setItem(
      "lyrium_cookie_consent",
      JSON.stringify({ essential: true, analytics })
    );
    setVisible(false);
    window.dispatchEvent(new Event("cookie-consent-change"));
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 max-w-sm w-[calc(100vw-2rem)] sm:w-96 rounded-2xl border border-white/10 bg-[#111]/95 backdrop-blur-xl p-5 shadow-2xl animate-in slide-in-from-bottom-4 fade-in duration-500">
      {/* Close */}
      <button
        onClick={() => handleConsent(false)}
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

      {/* Buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => handleConsent(false)}
          className="flex-1 rounded-full border border-white/10 text-white/60 text-xs font-semibold py-2.5 hover:bg-white/5 transition-colors"
        >
          {t("landing.cookieReject")}
        </button>
        <button
          onClick={() => handleConsent(true)}
          className="flex-1 rounded-full bg-white text-black text-xs font-semibold py-2.5 hover:bg-white/90 transition-colors"
        >
          {t("landing.cookieAccept")}
        </button>
      </div>
    </div>
  );
};

export default CookieBanner;
