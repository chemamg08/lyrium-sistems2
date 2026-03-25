import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Scale, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

const API_URL = import.meta.env.VITE_API_URL;

const WavesBg = () => (
  <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
    <svg viewBox="0 0 1440 590" className="absolute bottom-0 w-full min-w-[1200px]" preserveAspectRatio="none">
      <path d="M0,288 C360,420 720,180 1440,320 L1440,590 L0,590Z" fill="rgba(99,102,241,0.07)" />
      <path d="M0,350 C480,250 960,450 1440,300 L1440,590 L0,590Z" fill="rgba(168,85,247,0.06)" />
    </svg>
  </div>
);

const VerifyEmail = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      return;
    }

    fetch(`${API_URL}/accounts/verify-email/${encodeURIComponent(token)}`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        setStatus(data.success ? 'success' : 'error');
      })
      .catch(() => setStatus('error'));
  }, [searchParams]);

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 overflow-hidden">
      <WavesBg />
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md px-4"
      >
        <div className="flex justify-center mb-6">
          <div className="bg-zinc-800/80 p-3 rounded-xl shadow-lg">
            <Scale className="text-indigo-400 w-8 h-8" />
          </div>
        </div>

        <Card className="bg-zinc-900/90 border-zinc-800/50 shadow-2xl backdrop-blur-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center">Lyrium Systems</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-6 py-8">
            {status === 'loading' && (
              <>
                <Loader2 className="h-16 w-16 text-indigo-400 animate-spin" />
                <p className="text-zinc-400 text-center">{t('auth.verifyingEmail')}</p>
              </>
            )}

            {status === 'success' && (
              <>
                <div className="bg-green-500/10 border border-green-500/20 rounded-full p-4">
                  <CheckCircle2 className="h-16 w-16 text-green-500" />
                </div>
                <div className="text-center space-y-2">
                  <h2 className="text-xl font-semibold text-white">{t('auth.emailVerifiedSuccess')}</h2>
                  <p className="text-zinc-400 text-sm">{t('auth.emailVerifiedDesc')}</p>
                </div>
                <Button
                  onClick={() => navigate('/login')}
                  className="w-full mt-2 bg-indigo-600 hover:bg-indigo-700"
                >
                  {t('auth.goToLogin')}
                </Button>
              </>
            )}

            {status === 'error' && (
              <>
                <div className="bg-red-500/10 border border-red-500/20 rounded-full p-4">
                  <XCircle className="h-16 w-16 text-red-500" />
                </div>
                <div className="text-center space-y-2">
                  <h2 className="text-xl font-semibold text-white">{t('auth.verifyFailed')}</h2>
                  <p className="text-zinc-400 text-sm">{t('auth.verifyFailedDesc')}</p>
                </div>
                <Button
                  onClick={() => navigate('/login')}
                  variant="outline"
                  className="w-full mt-2"
                >
                  {t('auth.goToLogin')}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default VerifyEmail;
