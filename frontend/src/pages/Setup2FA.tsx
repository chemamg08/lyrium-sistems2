import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Scale, ShieldCheck, Copy, CheckCircle2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/use-toast";

const API_URL = import.meta.env.VITE_API_URL;

const WavesBg = () => (
  <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
    {([
      { s: 'fa1', dur: 24, a: 30, yo: '25%', c1: 'rgba(255,255,255,0.06)', c2: 'rgba(180,180,180,0.01)' },
      { s: 'fa2', dur: 16, a: 22, yo: '40%', c1: 'rgba(220,220,220,0.05)', c2: 'rgba(255,255,255,0.07)' },
      { s: 'fa3', dur: 11, a: 16, yo: '60%', c1: 'rgba(200,200,200,0.04)', c2: 'rgba(130,130,130,0.01)' },
      { s: 'fa4', dur: 29, a: 26, yo: '75%', c1: 'rgba(255,255,255,0.05)', c2: 'rgba(160,160,160,0.02)' },
    ] as const).map(({ s, dur, a, yo, c1, c2 }) => {
      const id = `fa2g${s}`;
      const y1 = 100 - a, y2 = 100 + a;
      const d = `M 0 100 C 180 ${y1}, 540 ${y2}, 720 100 C 900 ${y1}, 1260 ${y2}, 1440 100 C 1620 ${y1}, 1980 ${y2}, 2160 100 C 2340 ${y1}, 2700 ${y2}, 2880 100`;
      return (
        <motion.svg key={id} className="absolute"
          style={{ width: '200%', height: 200, top: yo, left: 0, marginTop: -100 }}
          animate={{ x: ['0%', '-50%'] }}
          transition={{ duration: dur, repeat: Infinity, ease: 'linear' }}
          viewBox="0 0 2880 200" preserveAspectRatio="none">
          <defs>
            <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={c1} />
              <stop offset="50%" stopColor={c2} />
              <stop offset="100%" stopColor={c1} />
            </linearGradient>
          </defs>
          <path d={d} stroke={`url(#${id})`} strokeWidth="1.5" fill="none" />
        </motion.svg>
      );
    })}
  </div>
);

const Setup2FA = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const userId = searchParams.get('userId') || '';
  const userType = searchParams.get('userType') || 'main';

  const [step, setStep] = useState<'qr' | 'verify' | 'recovery'>('qr');
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Step 1: Generate QR code
  const handleGenerateQR = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/accounts/setup-2fa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, userType }),
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setOtpauthUrl(data.otpauthUrl);
        setSecretKey(data.secret);
        setStep('verify');
      } else {
        toast({ title: data.error || 'Error', variant: 'destructive' });
      }
    } catch {
      toast({ title: t('auth.errorLogin'), variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Verify code
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/accounts/verify-2fa-setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, userType, token: verifyCode }),
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setRecoveryCodes(data.recoveryCodes);
        setStep('recovery');
      } else {
        toast({ title: data.error || t('auth.invalid2FA'), variant: 'destructive' });
      }
    } catch {
      toast({ title: t('auth.errorLogin'), variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const copyRecoveryCodes = () => {
    navigator.clipboard.writeText(recoveryCodes.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const darkVars = {
    "--background": "0 0% 5%",
    "--foreground": "0 0% 98%",
    "--card": "0 0% 7%",
    "--card-foreground": "0 0% 98%",
    "--popover": "0 0% 7%",
    "--popover-foreground": "0 0% 98%",
    "--primary": "0 0% 98%",
    "--primary-foreground": "0 0% 9%",
    "--secondary": "0 0% 15%",
    "--secondary-foreground": "0 0% 98%",
    "--muted": "0 0% 15%",
    "--muted-foreground": "0 0% 60%",
    "--accent": "0 0% 15%",
    "--accent-foreground": "0 0% 98%",
    "--destructive": "0 72% 51%",
    "--destructive-foreground": "0 0% 98%",
    "--border": "0 0% 20%",
    "--input": "0 0% 15%",
    "--ring": "0 0% 80%",
  } as React.CSSProperties;

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 bg-[#080808] overflow-hidden" style={darkVars}>
      <WavesBg />
      <div className="absolute top-5 right-6 z-10 flex items-center gap-3">
        <Scale className="h-6 w-6 text-white/50" />
        <span className="text-xl font-semibold text-white/70 tracking-tight">Lyrium</span>
      </div>

      <Card className="relative z-10 w-full max-w-md bg-white/[0.04] border-white/10">
        <CardHeader className="space-y-1">
          <div className="flex justify-center mb-2">
            <ShieldCheck className="h-10 w-10 text-green-500" />
          </div>
          <CardTitle className="text-2xl font-bold text-center">{t('auth.setup2FATitle')}</CardTitle>
          <CardDescription className="text-center">
            {step === 'qr' && t('auth.setup2FADesc')}
            {step === 'verify' && t('auth.scan2FADesc')}
            {step === 'recovery' && t('auth.recoveryCodesDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 'qr' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                {t('auth.setup2FAInstructions')}
              </p>
              <Button onClick={handleGenerateQR} className="w-full" disabled={isLoading}>
                {isLoading ? t('auth.loading') : t('auth.generateQR')}
              </Button>
            </div>
          )}

          {step === 'verify' && (
            <div className="space-y-4">
              {/* QR Code */}
              <div className="flex justify-center p-4 bg-white rounded-lg">
                <QRCodeSVG value={otpauthUrl} size={200} />
              </div>

              {/* Manual key */}
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground text-center">{t('auth.manualKey')}</p>
                <p className="text-center font-mono text-sm bg-muted/50 rounded px-3 py-2 select-all break-all">
                  {secretKey}
                </p>
              </div>

              {/* Verify form */}
              <form onSubmit={handleVerify} className="space-y-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('auth.enter2FACode')}</label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="000000"
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    maxLength={6}
                    className="font-mono tracking-widest text-center text-lg"
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading || verifyCode.length !== 6}>
                  {isLoading ? t('auth.loading') : t('auth.verify2FA')}
                </Button>
              </form>
            </div>
          )}

          {step === 'recovery' && (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-2 mb-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <span className="text-sm font-medium text-green-500">{t('auth.twoFAEnabled')}</span>
              </div>

              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  {recoveryCodes.map((code, i) => (
                    <div key={i} className="font-mono text-sm text-center bg-background/50 rounded px-2 py-1">
                      {code}
                    </div>
                  ))}
                </div>
              </div>

              <Button variant="outline" onClick={copyRecoveryCodes} className="w-full">
                {copied ? <CheckCircle2 className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                {copied ? t('auth.copied') : t('auth.copyRecoveryCodes')}
              </Button>

              <p className="text-xs text-red-400 text-center">
                {t('auth.recoveryCodesWarning')}
              </p>

              <Button onClick={() => navigate('/login')} className="w-full">
                {t('auth.goToLogin')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Setup2FA;
