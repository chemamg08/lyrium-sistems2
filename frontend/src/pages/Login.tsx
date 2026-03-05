import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Scale } from "lucide-react";
import RenewalModal from "@/components/RenewalModal";
import i18n, { getLanguageForCountry } from "@/i18n";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/use-toast";

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const WavesBg = () => (
  <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
    {([
      { s: 'l1', dur: 24, a: 30, yo: '25%', c1: 'rgba(255,255,255,0.06)', c2: 'rgba(180,180,180,0.01)' },
      { s: 'l2', dur: 16, a: 22, yo: '40%', c1: 'rgba(220,220,220,0.05)', c2: 'rgba(255,255,255,0.07)' },
      { s: 'l3', dur: 11, a: 16, yo: '60%', c1: 'rgba(200,200,200,0.04)', c2: 'rgba(130,130,130,0.01)' },
      { s: 'l4', dur: 29, a: 26, yo: '75%', c1: 'rgba(255,255,255,0.05)', c2: 'rgba(160,160,160,0.02)' },
    ] as const).map(({ s, dur, a, yo, c1, c2 }) => {
      const id = `lglg${s}`;
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

const Login = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState<{
    message: string;
    type: 'main' | 'subaccount' | null;
    accountId?: string;
    email?: string;
  } | null>(null);
  const [showRenewalModal, setShowRenewalModal] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setIsLoading(true);
    setSubscriptionError(null);
    
    try {
      const response = await fetch(`${API_URL}/accounts/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (response.ok) {
        const data = await response.json();
        
        // Guardar token JWT
        sessionStorage.setItem('authToken', data.token);
        
        // Guardar información del usuario en sessionStorage
        sessionStorage.setItem('userId', data.user.id);
        sessionStorage.setItem('userName', data.user.name);
        sessionStorage.setItem('userEmail', data.user.email);
        sessionStorage.setItem('userType', data.user.type);
        const userCountry = data.user.country || 'ES';
        sessionStorage.setItem('country', userCountry);
        const lang = getLanguageForCountry(userCountry);
        i18n.changeLanguage(lang);
        localStorage.setItem('appLanguage', lang);
        
        // Si es subcuenta, guardar el parentAccountId y usarlo como accountId
        if (data.user.type === 'subaccount' && data.user.parentAccountId) {
          sessionStorage.setItem('parentAccountId', data.user.parentAccountId);
          sessionStorage.setItem('accountId', data.user.parentAccountId);
        } else {
          // Si es cuenta principal, el accountId es su propio ID
          sessionStorage.setItem('accountId', data.user.id);
        }
        
        navigate("/");
      } else if (response.status === 403) {
        // Suscripción caducada
        const data = await response.json();
        setSubscriptionError({
          message: data.error,
          type: data.type,
          accountId: data.accountId,
          email: data.email || email
        });
      } else {
        toast({ title: t('auth.wrongCredentials'), variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error:', error);
      toast({ title: t('auth.errorLogin'), variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePayment = () => {
    setShowRenewalModal(true);
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
      {/* Branding top-right */}
      <div className="absolute top-5 right-6 z-10 flex items-center gap-3">
        <Scale className="h-6 w-6 text-white/50" />
        <span className="text-xl font-semibold text-white/70 tracking-tight">Lyrium</span>
      </div>
      <Card className="relative z-10 w-full max-w-md bg-white/[0.04] border-white/10">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Lyrium Systems</CardTitle>
          <CardDescription className="text-center">
            {t('auth.enterCredentials')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {subscriptionError && (
            <div className="mb-4 bg-destructive/10 border border-destructive/20 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-destructive mb-1">
                    {subscriptionError.type === 'main' 
                      ? t('auth.subscriptionExpired')
                      : t('auth.noAccess')}
                  </p>
                  <p className="text-sm text-destructive/80">{subscriptionError.message}</p>
                  {subscriptionError.type === 'main' && (
                    <Button 
                      onClick={handlePayment}
                      className="mt-3 w-full"
                      variant="destructive"
                    >
                      {t('auth.renewSubscription')}
                    </Button>
                  )}
                  {subscriptionError.type === 'subaccount' && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {t('auth.contactAdmin')}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                {t('auth.email')}
              </label>
              <Input
                id="email"
                type="email"
                placeholder={t('auth.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                {t('auth.password')}
              </label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? t('auth.loading') : t('auth.login')}
            </Button>
            <Button 
              type="button" 
              variant="outline" 
              className="w-full" 
              onClick={() => navigate("/signup")}
            >
              {t('auth.createAccount')}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Modal de Renovación */}
      {subscriptionError?.accountId && subscriptionError?.email && (
        <RenewalModal
          isOpen={showRenewalModal}
          onClose={() => {
            setShowRenewalModal(false);
            setSubscriptionError(null);
          }}
          onSuccess={() => {
            sessionStorage.setItem('accountId', subscriptionError!.accountId);
            navigate('/');
          }}
          accountId={subscriptionError.accountId}
          userEmail={subscriptionError.email}
        />
      )}
    </div>
  );
};

export default Login;
