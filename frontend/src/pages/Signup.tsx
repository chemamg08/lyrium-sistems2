import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/use-toast";
import { Scale, Check, X, ChevronsUpDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandItem } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";

const API_URL = import.meta.env.VITE_API_URL;

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

const COUNTRIES = [
  { value: "AR", label: "Argentina" },
  { value: "AT", label: "Österreich" },
  { value: "AU", label: "Australia" },
  { value: "BG", label: "България" },
  { value: "BO", label: "Bolivia" },
  { value: "BR", label: "Brasil" },
  { value: "CA", label: "Canada" },
  { value: "CH", label: "Schweiz / Suisse" },
  { value: "CL", label: "Chile" },
  { value: "CO", label: "Colombia" },
  { value: "CR", label: "Costa Rica" },
  { value: "CY", label: "Κύπρος" },
  { value: "CZ", label: "Česká republika" },
  { value: "DE", label: "Deutschland" },
  { value: "DK", label: "Danmark" },
  { value: "DO", label: "República Dominicana" },
  { value: "EC", label: "Ecuador" },
  { value: "EE", label: "Eesti" },
  { value: "ES", label: "España" },
  { value: "FI", label: "Suomi" },
  { value: "FR", label: "France" },
  { value: "GB", label: "United Kingdom" },
  { value: "GR", label: "Ελλάδα" },
  { value: "GT", label: "Guatemala" },
  { value: "HN", label: "Honduras" },
  { value: "HR", label: "Hrvatska" },
  { value: "HU", label: "Magyarország" },
  { value: "IE", label: "Ireland" },
  { value: "IT", label: "Italia" },
  { value: "LI", label: "Liechtenstein" },
  { value: "LT", label: "Lietuva" },
  { value: "LU", label: "Lëtzebuerg" },
  { value: "LV", label: "Latvija" },
  { value: "MC", label: "Monaco" },
  { value: "MT", label: "Malta" },
  { value: "MX", label: "México" },
  { value: "NI", label: "Nicaragua" },
  { value: "NL", label: "Nederland" },
  { value: "NO", label: "Norge" },
  { value: "NZ", label: "New Zealand" },
  { value: "PA", label: "Panamá" },
  { value: "PE", label: "Perú" },
  { value: "PL", label: "Polska" },
  { value: "PT", label: "Portugal" },
  { value: "PY", label: "Paraguay" },
  { value: "RO", label: "România" },
  { value: "SE", label: "Sverige" },
  { value: "SG", label: "Singapore" },
  { value: "SI", label: "Slovenija" },
  { value: "SK", label: "Slovensko" },
  { value: "SV", label: "El Salvador" },
  { value: "US", label: "United States" },
  { value: "UY", label: "Uruguay" },
];

const Signup = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [country, setCountry] = useState("ES");
  const [countryOpen, setCountryOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const navigate = useNavigate();

  const pwChecks = useMemo(() => ({
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  }), [password]);

  const allValid = pwChecks.length && pwChecks.upper && pwChecks.lower && pwChecks.number && pwChecks.special;

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name || !email || !password || !country) {
      toast({ title: t('auth.fillAllFields'), variant: 'destructive' });
      return;
    }

    if (!allValid) {
      toast({ title: t('auth.passwordRequirements'), variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/accounts/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, country }),
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        toast({ title: t('auth.accountCreated') });
        // Redirect to 2FA setup only if backend requires it
        if (data.needsSetup2FA && (data.account?.id || data.account?.['_id'])) {
          navigate(`/setup-2fa?userId=${data.account.id || data.account['_id']}&userType=main`);
        } else {
          navigate("/login");
        }
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
              <Popover open={countryOpen} onOpenChange={setCountryOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    role="combobox"
                    aria-expanded={countryOpen}
                    className="flex items-center justify-between w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  >
                    <span className="truncate">{COUNTRIES.find(c => c.value === country)?.label ?? t('auth.selectCountry')}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder={t('auth.searchCountry')} />
                    <CommandList className="max-h-60">
                      <CommandEmpty>{t('auth.noCountryFound')}</CommandEmpty>
                      {COUNTRIES.map(c => (
                        <CommandItem
                          key={c.value}
                          value={c.label}
                          onSelect={() => { setCountry(c.value); setCountryOpen(false); }}
                        >
                          <Check className={`mr-2 h-4 w-4 ${country === c.value ? "opacity-100" : "opacity-0"}`} />
                          {c.label}
                        </CommandItem>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
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
            <div className="flex items-start gap-2 pt-1">
              <Checkbox
                id="terms"
                checked={acceptedTerms}
                onCheckedChange={(v) => setAcceptedTerms(v === true)}
                className="mt-0.5"
              />
              <label htmlFor="terms" className="text-xs text-muted-foreground leading-tight cursor-pointer">
                {t('auth.acceptTermsPrefix')}{' '}
                <a href="/terminos" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">{t('auth.termsLink')}</a>
                {' '}{t('auth.acceptTermsAnd')}{' '}
                <a href="/privacidad" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">{t('auth.privacyLink')}</a>
              </label>
            </div>
            <Button type="submit" className="w-full" disabled={isLoading || !acceptedTerms}>
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
