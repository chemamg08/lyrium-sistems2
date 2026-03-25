import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Scale, KeyRound, CheckCircle2, Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/use-toast";
import { useMemo } from "react";

const API_URL = import.meta.env.VITE_API_URL;

const WavesBg = () => (
  <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
    {([
      { s: 'rp1', dur: 24, a: 30, yo: '25%', c1: 'rgba(255,255,255,0.06)', c2: 'rgba(180,180,180,0.01)' },
      { s: 'rp2', dur: 16, a: 22, yo: '40%', c1: 'rgba(220,220,220,0.05)', c2: 'rgba(255,255,255,0.07)' },
      { s: 'rp3', dur: 11, a: 16, yo: '60%', c1: 'rgba(200,200,200,0.04)', c2: 'rgba(130,130,130,0.01)' },
      { s: 'rp4', dur: 29, a: 26, yo: '75%', c1: 'rgba(255,255,255,0.05)', c2: 'rgba(160,160,160,0.02)' },
    ] as const).map(({ s, dur, a, yo, c1, c2 }) => {
      const id = `rpg${s}`;
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

const ResetPassword = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);

  const pwChecks = useMemo(() => ({
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  }), [password]);

  const allValid = pwChecks.length && pwChecks.upper && pwChecks.lower && pwChecks.number && pwChecks.special;

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!allValid) {
      toast({ title: t('auth.passwordRequirements'), variant: 'destructive' });
      return;
    }

    if (password !== confirmPassword) {
      toast({ title: t('auth.passwordsNoMatch'), variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/accounts/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setDone(true);
      } else {
        toast({ title: data.error || t('auth.errorLogin'), variant: 'destructive' });
      }
    } catch {
      toast({ title: t('auth.errorLogin'), variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
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
            <KeyRound className="h-10 w-10 text-foreground/60" />
          </div>
          <CardTitle className="text-2xl font-bold text-center">{t('auth.resetPasswordTitle')}</CardTitle>
          <CardDescription className="text-center">
            {done ? t('auth.passwordResetSuccess') : t('auth.resetPasswordDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {done ? (
            <div className="space-y-4 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
              <Button onClick={() => navigate('/login')} className="w-full">
                {t('auth.goToLogin')}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleReset} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('auth.newPassword')}</label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                {password.length > 0 && (
                  <div className="space-y-1 mt-2">
                    {([
                      ['length', t('auth.pwMin8')],
                      ['upper', t('auth.pwUppercase')],
                      ['lower', t('auth.pwLowercase')],
                      ['number', t('auth.pwNumber')],
                      ['special', t('auth.pwSpecial')],
                    ] as const).map(([key, label]) => (
                      <div key={key} className="flex items-center gap-2 text-xs">
                        {pwChecks[key] ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <X className="h-3 w-3 text-red-400" />
                        )}
                        <span className={pwChecks[key] ? 'text-green-500' : 'text-red-400'}>{label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('auth.confirmPassword')}</label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading || !allValid}>
                {isLoading ? t('auth.loading') : t('auth.resetPassword')}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;
