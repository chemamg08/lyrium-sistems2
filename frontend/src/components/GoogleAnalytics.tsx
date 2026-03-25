import { useEffect, useState } from "react";

const GA_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;

function getAnalyticsConsent(): boolean {
  try {
    const raw = localStorage.getItem("lyrium_cookie_consent");
    if (!raw) return false;
    return JSON.parse(raw).analytics === true;
  } catch {
    return false;
  }
}

const GoogleAnalytics = () => {
  const [enabled, setEnabled] = useState(getAnalyticsConsent);

  useEffect(() => {
    const handler = () => setEnabled(getAnalyticsConsent());
    window.addEventListener("cookie-consent-change", handler);
    return () => window.removeEventListener("cookie-consent-change", handler);
  }, []);

  useEffect(() => {
    if (!enabled || !GA_ID) return;
    if (document.getElementById("gtag-script")) return;

    const script = document.createElement("script");
    script.id = "gtag-script";
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
    document.head.appendChild(script);

    const w = window as unknown as Record<string, unknown[]>;
    w.dataLayer = w.dataLayer || [];
    const gtag = (...args: unknown[]) => {
      w.dataLayer.push(args);
    };
    gtag("js", new Date());
    gtag("config", GA_ID);
  }, [enabled]);

  return null;
};

export default GoogleAnalytics;
