import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/use-toast";
import { Scale } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const WavesBg = () => (
  <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
    {([
      { s: 's1', dur: 24, a: 30, yo: '25%', c1: 'rgba(255,255,255,0.06)', c2: 'rgba(180,180,180,0.01)' },
      { s: 's2', dur: 16, a: 22, yo: '40%', c1: 'rgba(220,220,220,0.05)', c2: 'rgba(255,255,255,0.07)' },
      { s: 's3', dur: 11, a: 16, yo: '60%', c1: 'rgba(200,200,200,0.04)', c2: 'rgba(130,130,130,0.01)' },
      { s: 's4', dur: 29, a: 26, yo: '75%', c1: 'rgba(255,255,255,0.05)', c2: 'rgba(160,160,160,0.02)' },
    ] as const).map(({ s, dur, a, yo, c1, c2 }) => {
      const id = `susg${s}`;
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

const Signup = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [country, setCountry] = useState("ES");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name || !email || !password || !country) {
      toast({ title: t('auth.fillAllFields'), variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/accounts/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, country }),
      });

      if (response.ok) {
        toast({ title: t('auth.accountCreated') });
        navigate("/login");
      } else {
        const error = await response.json();
        toast({ title: error.error || t('auth.errorCreating'), variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error:', error);
      toast({ title: t('auth.errorCreating'), variant: 'destructive' });
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
      {/* Branding top-right */}
      <div className="absolute top-5 right-6 z-10 flex items-center gap-3">
        <Scale className="h-6 w-6 text-white/50" />
        <span className="text-xl font-semibold text-white/70 tracking-tight">Lyrium</span>
      </div>
      <Card className="relative z-10 w-full max-w-md bg-white/[0.04] border-white/10">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">{t('auth.createAccount')}</CardTitle>
          <CardDescription className="text-center">
            {t('auth.enterData')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                {t('auth.name')}
              </label>
              <Input
                id="name"
                type="text"
                placeholder={t('auth.namePlaceholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
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
              <label className="text-sm font-medium">{t('auth.country')}</label>
              <Select value={country} onValueChange={setCountry} required>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('auth.selectCountry')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AT">Österreich</SelectItem>
                  <SelectItem value="AU">Australia</SelectItem>
                  <SelectItem value="BG">България</SelectItem>
                  <SelectItem value="CA">Canada</SelectItem>
                  <SelectItem value="CH">Schweiz / Suisse</SelectItem>
                  <SelectItem value="CY">Κύπρος</SelectItem>
                  <SelectItem value="CZ">Česká republika</SelectItem>
                  <SelectItem value="DE">Deutschland</SelectItem>
                  <SelectItem value="DK">Danmark</SelectItem>
                  <SelectItem value="EE">Eesti</SelectItem>
                  <SelectItem value="ES">España</SelectItem>
                  <SelectItem value="FI">Suomi</SelectItem>
                  <SelectItem value="FR">France</SelectItem>
                  <SelectItem value="GB">United Kingdom</SelectItem>
                  <SelectItem value="GR">Ελλάδα</SelectItem>
                  <SelectItem value="HR">Hrvatska</SelectItem>
                  <SelectItem value="HU">Magyarország</SelectItem>
                  <SelectItem value="IE">Ireland</SelectItem>
                  <SelectItem value="IT">Italia</SelectItem>
                  <SelectItem value="LT">Lietuva</SelectItem>
                  <SelectItem value="LU">Lëtzebuerg</SelectItem>
                  <SelectItem value="LV">Latvija</SelectItem>
                  <SelectItem value="MT">Malta</SelectItem>
                  <SelectItem value="NL">Nederland</SelectItem>
                  <SelectItem value="NO">Norge</SelectItem>
                  <SelectItem value="PL">Polska</SelectItem>
                  <SelectItem value="PT">Portugal</SelectItem>
                  <SelectItem value="RO">România</SelectItem>
                  <SelectItem value="SE">Sverige</SelectItem>
                  <SelectItem value="SI">Slovenija</SelectItem>
                  <SelectItem value="SK">Slovensko</SelectItem>
                  <SelectItem value="US">United States</SelectItem>
                </SelectContent>
              </Select>
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
              {isLoading ? t('auth.creating') : t('auth.createAccount')}
            </Button>
            <Button 
              type="button" 
              variant="outline" 
              className="w-full" 
              onClick={() => navigate("/login")}
            >
              {t('auth.backToLogin')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Signup;
