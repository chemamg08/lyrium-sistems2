import { useRef, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion, useInView, useScroll, useTransform } from "framer-motion";
import {
  FileSignature,
  Users,
  Shield,
  FileText,
  Zap,
  UserPlus,
  ChevronRight,
  Check,
  Scale,
  ArrowRight,
  Clock,
  TrendingUp,
  AlertTriangle,
  Folders,
  MessagesSquare,
  BrainCircuit,
  Globe,
  Monitor,
  Lock,
  ShieldCheck,
  KeyRound,
  Award,
} from "lucide-react";
import AppDemo from "@/components/AppDemo";

// Scroll-triggered fade-up wrapper
const FadeUp = ({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

// Smooth scroll helper
const scrollTo = (id: string) => {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
};

// Component
const Landing = () => {
  const { t, i18n } = useTranslation();

  // Data (reactive to language)
  const modules = [
    { icon: FileSignature, title: t('landing.mod1Title'), description: t('landing.mod1Desc') },
    { icon: Users,         title: t('landing.mod2Title'), description: t('landing.mod2Desc') },
    { icon: Shield,        title: t('landing.mod3Title'), description: t('landing.mod3Desc') },
    { icon: FileText,      title: t('landing.mod4Title'), description: t('landing.mod4Desc') },
    { icon: Zap,           title: t('landing.mod5Title'), description: t('landing.mod5Desc') },
    { icon: UserPlus,      title: t('landing.mod6Title'), description: t('landing.mod6Desc') },
  ];

  const stats = [
    { value: "12h",    label: t('landing.stat1Label'), sub: t('landing.stat1Sub') },
    { value: "3×",     label: t('landing.stat2Label'), sub: t('landing.stat2Sub') },
    { value: "70%",    label: t('landing.stat3Label'), sub: t('landing.stat3Sub') },
    { value: "1 case", label: t('landing.stat4Label'), sub: t('landing.stat4Sub') },
  ];

  const problems = [
    { icon: Clock,          text: t('landing.problem1') },
    { icon: Folders,        text: t('landing.problem2') },
    { icon: AlertTriangle,  text: t('landing.problem3') },
    { icon: MessagesSquare, text: t('landing.problem4') },
  ];

  const solutions = [
    { icon: BrainCircuit,  text: t('landing.solution1') },
    { icon: FileSignature, text: t('landing.solution2') },
    { icon: Users,         text: t('landing.solution3') },
    { icon: Zap,           text: t('landing.solution4') },
  ];

  const plans = [
    { period: t('landing.planMonthly'), price: "250",   unit: t('landing.planUnitMonthly'), note: t('landing.planMonthlyNote'), highlight: false },
    { period: t('landing.planAnnual'),  price: "2.700", unit: t('landing.planUnitAnnual'),  note: t('landing.planAnnualNote'),  highlight: true  },
  ];

  const features = [
    t('landing.feat1'),
    t('landing.feat2'),
    t('landing.feat3'),
    t('landing.feat4'),
    t('landing.feat5'),
  ];

  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroY = useTransform(scrollYProgress, [0, 1], ["0%", "18%"]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);
  const [hoveredModule, setHoveredModule] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const WavesBg = ({ p }: { p: string }) => (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {([
        { s: '1', dur: 24, a: 30, yo: '35%', c1: 'rgba(255,255,255,0.06)', c2: 'rgba(180,180,180,0.01)' },
        { s: '2', dur: 16, a: 22, yo: '45%', c1: 'rgba(220,220,220,0.05)', c2: 'rgba(255,255,255,0.07)' },
        { s: '3', dur: 11, a: 16, yo: '55%', c1: 'rgba(200,200,200,0.04)', c2: 'rgba(130,130,130,0.01)' },
        { s: '4', dur: 29, a: 26, yo: '65%', c1: 'rgba(255,255,255,0.05)', c2: 'rgba(160,160,160,0.02)' },
      ] as const).map(({ s, dur, a, yo, c1, c2 }) => {
        const id = `${p}${s}`;
        const y1 = 100 - a, y2 = 100 + a;
        const d = `M 0 100 C 180 ${y1}, 540 ${y2}, 720 100 C 900 ${y1}, 1260 ${y2}, 1440 100 C 1620 ${y1}, 1980 ${y2}, 2160 100 C 2340 ${y1}, 2700 ${y2}, 2880 100`;
        return (
          <motion.svg key={id} className="absolute" style={{ width: '200%', height: 200, top: yo, left: 0, marginTop: -100 }}
            animate={{ x: ['0%', '-50%'] }} transition={{ duration: dur, repeat: Infinity, ease: 'linear' }}
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

  return (
    <div className="bg-[#080808] text-white min-h-screen overflow-x-hidden">

      {/* NAV */}
      <nav className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 md:px-8 py-4 border-b transition-all duration-300 ${scrolled ? "border-white/8 bg-[#080808]/90 backdrop-blur-md" : "border-transparent bg-transparent"}`}>
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <Scale className="h-5 w-5 text-white" />
          <span className="text-lg font-semibold tracking-tight">Lyrium</span>
        </div>

        {/* Central nav links */}
        <div className="hidden md:flex items-center gap-1 ml-36">
          <button
            onClick={() => scrollTo("ventajas")}
            className="rounded-full px-4 py-1.5 text-sm text-white/50 hover:text-white transition-all"
          >
            {t('landing.navBenefits')}
          </button>
          <button
            onClick={() => scrollTo("funciones")}
            className="rounded-full px-4 py-1.5 text-sm text-white/50 hover:text-white transition-all"
          >
            {t('landing.navFeatures')}
          </button>
          <button
            onClick={() => scrollTo("precio")}
            className="rounded-full px-4 py-1.5 text-sm text-white/50 hover:text-white transition-all"
          >
            {t('landing.navPricing')}
          </button>
        </div>

        {/* Right CTA */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-white">
            <Globe className="h-3.5 w-3.5" />
            <select
              value={i18n.language.slice(0,2)}
              onChange={(e) => { i18n.changeLanguage(e.target.value); localStorage.setItem('appLanguage', e.target.value); }}
              className="bg-black text-white text-sm cursor-pointer focus:outline-none appearance-none pr-1 [&>option]:bg-black [&>option]:text-white rounded px-1"
            >
              <option value="en">English</option>
              <option value="es">Español</option>
              <option value="fr">Français</option>
              <option value="de">Deutsch</option>
              <option value="it">Italiano</option>
              <option value="pt">Português</option>
              <option value="nl">Nederlands</option>
              <option value="pl">Polski</option>
              <option value="sv">Svenska</option>
              <option value="no">Norsk</option>
              <option value="da">Dansk</option>
              <option value="fi">Suomi</option>
              <option value="cs">Čeština</option>
              <option value="sk">Slovenčina</option>
              <option value="hu">Magyar</option>
              <option value="ro">Română</option>
              <option value="hr">Hrvatski</option>
              <option value="bg">Български</option>
              <option value="el">Ελληνικά</option>
              <option value="lt">Lietuvių</option>
              <option value="lv">Latviešu</option>
              <option value="et">Eesti</option>
              <option value="sl">Slovenščina</option>
            </select>
          </div>
          <button
            onClick={() => window.open('/login', '_blank')}
            className="flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors"
          >
            {t('landing.navLogin')} <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section ref={heroRef} className="relative flex flex-col items-center justify-center min-h-screen px-6 text-center overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.032) 15%, rgba(255,255,255,0.016) 32%, rgba(255,255,255,0.007) 52%, rgba(255,255,255,0.002) 68%, transparent 82%)",
          }}
        />

        {/* Animated wave lines */}
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          {([
            // Flujo superior (20%–34%)
            { id: 'u1', duration: 30, a: 40, yo: '20%', c1: 'rgba(255,255,255,0.07)', c2: 'rgba(160,160,160,0.02)' },
            { id: 'u2', duration: 20, a: 32, yo: '25%', c1: 'rgba(200,200,200,0.06)', c2: 'rgba(255,255,255,0.09)' },
            { id: 'u3', duration: 13, a: 22, yo: '30%', c1: 'rgba(230,230,230,0.05)', c2: 'rgba(130,130,130,0.02)' },
            { id: 'u4', duration: 24, a: 36, yo: '34%', c1: 'rgba(255,255,255,0.08)', c2: 'rgba(190,190,190,0.03)' },
            // Flujo central (35%–55%)
            { id: 'w1', duration: 26, a: 46, yo: '35%', c1: 'rgba(255,255,255,0.10)', c2: 'rgba(180,180,180,0.02)' },
            { id: 'w2', duration: 18, a: 38, yo: '40%', c1: 'rgba(220,220,220,0.08)', c2: 'rgba(255,255,255,0.12)' },
            { id: 'w3', duration: 22, a: 44, yo: '45%', c1: 'rgba(255,255,255,0.13)', c2: 'rgba(200,200,200,0.03)' },
            { id: 'w4', duration: 14, a: 30, yo: '50%', c1: 'rgba(150,150,150,0.09)', c2: 'rgba(255,255,255,0.06)' },
            { id: 'w5', duration: 10, a: 20, yo: '55%', c1: 'rgba(200,200,200,0.07)', c2: 'rgba(120,120,120,0.03)' },
            { id: 'w6', duration: 8,  a: 16, yo: '43%', c1: 'rgba(240,240,240,0.06)', c2: 'rgba(100,100,100,0.02)' },
            // Flujo inferior (56%–70%)
            { id: 'd1', duration: 19, a: 28, yo: '56%', c1: 'rgba(255,255,255,0.08)', c2: 'rgba(170,170,170,0.02)' },
            { id: 'd2', duration: 12, a: 20, yo: '61%', c1: 'rgba(210,210,210,0.06)', c2: 'rgba(255,255,255,0.09)' },
            { id: 'd3', duration: 28, a: 34, yo: '66%', c1: 'rgba(240,240,240,0.05)', c2: 'rgba(140,140,140,0.02)' },
            { id: 'd4', duration: 16, a: 24, yo: '70%', c1: 'rgba(255,255,255,0.07)', c2: 'rgba(180,180,180,0.03)' },
          ] as const).map(({ id, duration, a, yo, c1, c2 }) => {
            const y1 = 100 - a, y2 = 100 + a;
            const d = `M 0 100 C 180 ${y1}, 540 ${y2}, 720 100 C 900 ${y1}, 1260 ${y2}, 1440 100 C 1620 ${y1}, 1980 ${y2}, 2160 100 C 2340 ${y1}, 2700 ${y2}, 2880 100`;
            return (
              <motion.svg
                key={id}
                className="absolute"
                style={{ width: '200%', height: 200, top: yo, left: 0, marginTop: -100 }}
                animate={{ x: ['0%', '-50%'] }}
                transition={{ duration, repeat: Infinity, ease: 'linear' }}
                viewBox="0 0 2880 200"
                preserveAspectRatio="none"
              >
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

        <motion.div style={{ y: heroY, opacity: heroOpacity }} className="relative z-10 flex flex-col items-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-white/50 tracking-widest uppercase"
          >
            {t('landing.heroBadge')}
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-3xl text-5xl sm:text-6xl md:text-7xl font-bold leading-[1.08] tracking-tight"
          >
            {t('landing.heroH1a')}{" "}
            <span className="text-white/30">{t('landing.heroH1dim')}</span>{" "}
            {t('landing.heroH1b')}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="mt-6 max-w-xl text-base sm:text-lg text-white/40 leading-relaxed"
          >
            {t('landing.heroSubtitle')}
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.34, ease: [0.22, 1, 0.36, 1] }}
            className="mt-10 flex items-center gap-4"
          >
            <button onClick={() => window.open('/signup', '_blank')} className="group flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black hover:bg-white/90 transition-all">
              {t('landing.heroButton')}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </motion.div>
        </motion.div>
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#080808] to-transparent" />
      </section>

      {/* STATS */}
      <section id="ventajas" className="relative overflow-hidden py-20 px-6 border-y border-white/5">
        <WavesBg p="st" />
        <div className="relative z-10 mx-auto max-w-5xl grid grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map((s, i) => (
            <FadeUp key={s.label} delay={i * 0.08}>
              <div className="text-center">
                <p className="text-4xl sm:text-5xl font-bold tracking-tight mb-1">{s.value}</p>
                <p className="text-sm font-medium text-white/60 mb-0.5">{s.label}</p>
                <p className="text-xs text-white/25">{s.sub}</p>
              </div>
            </FadeUp>
          ))}
        </div>
      </section>

      {/* PROBLEMA / SOLUCION */}
      <section className="relative overflow-hidden py-32 px-6">
        <WavesBg p="pr" />
        <div className="relative z-10 mx-auto max-w-5xl">
          <FadeUp>
            <p className="text-xs uppercase tracking-widest text-white/30 mb-3">{t('landing.problemLabel')}</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              {t('landing.problemH2a')}<br />
              <span className="text-white/30">{t('landing.problemH2b')}</span>
            </h2>
            <p className="text-white/40 text-base mb-16 max-w-xl">
              {t('landing.problemDesc')}
            </p>
          </FadeUp>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Without Lyrium */}
            <FadeUp delay={0.05}>
              <div className="rounded-2xl border border-white/8 bg-white/[0.015] p-8 h-full">
                <p className="text-xs uppercase tracking-widest text-white/25 mb-6">{t('landing.withoutLabel')}</p>
                <div className="space-y-5">
                  {problems.map((p) => (
                    <div key={p.text} className="flex items-start gap-4">
                      <div className="mt-0.5 h-8 w-8 rounded-lg border border-white/8 bg-white/[0.03] flex items-center justify-center shrink-0">
                        <p.icon className="h-4 w-4 text-white/25" />
                      </div>
                      <p className="text-sm text-white/35 leading-relaxed">{p.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </FadeUp>

            {/* With Lyrium */}
            <FadeUp delay={0.12}>
              <div className="rounded-2xl border border-white/20 bg-white/[0.04] p-8 h-full">
                <div className="flex items-center justify-between mb-6">
                  <p className="text-xs uppercase tracking-widest text-white/50">{t('landing.withLabel')}</p>
                  <div className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1">
                    <TrendingUp className="h-3 w-3 text-white/50" />
                    <span className="text-[10px] text-white/40 uppercase tracking-wider">{t('landing.withBadge')}</span>
                  </div>
                </div>
                <div className="space-y-5">
                  {solutions.map((s) => (
                    <div key={s.text} className="flex items-start gap-4">
                      <div className="mt-0.5 h-8 w-8 rounded-lg border border-white/15 bg-white/8 flex items-center justify-center shrink-0">
                        <s.icon className="h-4 w-4 text-white/70" />
                      </div>
                      <p className="text-sm text-white/70 leading-relaxed">{s.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </FadeUp>
          </div>
        </div>
      </section>

      {/* DIVIDER */}
      <div className="mx-auto max-w-5xl px-8">
        <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      {/* ROI */}
      <section className="relative overflow-hidden py-32 px-6">
        <WavesBg p="ro" />
        <div className="relative z-10 mx-auto max-w-5xl">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-10 sm:p-16 text-center relative overflow-hidden">
            {/* glow */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="w-[500px] h-[300px] rounded-full bg-white/[0.04] blur-3xl" />
            </div>
            <FadeUp className="relative z-10">
              <p className="text-xs uppercase tracking-widest text-white/30 mb-4">{t('landing.roiLabel')}</p>
              <h2 className="text-3xl sm:text-5xl font-bold tracking-tight mb-6">
                {t('landing.roiH2a')}<br />
                <span className="text-white/30">{t('landing.roiH2b')}</span>
              </h2>
              <p className="text-white/40 text-base max-w-2xl mx-auto leading-relaxed mb-10">
                {t('landing.roiDesc')}
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <button onClick={() => window.open('/signup', '_blank')} className="group flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-black hover:bg-white/90 transition-all">
                  {t('landing.heroButton')}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>
            </FadeUp>
          </div>
        </div>
      </section>

      {/* DIVIDER */}
      <div className="mx-auto max-w-5xl px-8">
        <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      {/* MODULES */}
      <section id="funciones" className="relative overflow-hidden py-32 px-6">
        <WavesBg p="mo" />
        <div className="relative z-10 mx-auto max-w-5xl">
          <FadeUp>
            <p className="text-xs uppercase tracking-widest text-white/30 mb-3">{t('landing.modulesLabel')}</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-16">
              {t('landing.modulesH2a')}<br />
              <span className="text-white/30">{t('landing.modulesH2b')}</span>
            </h2>
          </FadeUp>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {modules.map((mod, i) => (
              <FadeUp key={mod.title} delay={i * 0.07} className="h-full">
                <div
                  onMouseEnter={() => setHoveredModule(i)}
                  onMouseLeave={() => setHoveredModule(null)}
                  className="relative group rounded-xl border border-white/8 bg-white/[0.02] p-6 transition-all duration-300 hover:bg-white/[0.05] hover:border-white/15 cursor-default h-full"
                >
                  <motion.div
                    animate={{ opacity: hoveredModule === i ? 1 : 0 }}
                    transition={{ duration: 0.3 }}
                    className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br from-white/5 to-transparent"
                  />
                  <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5">
                    <mod.icon className="h-5 w-5 text-white/70" />
                  </div>
                  <h3 className="mb-2 text-sm font-semibold text-white">{mod.title}</h3>
                  <p className="text-sm text-white/40 leading-relaxed">{mod.description}</p>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* DIVIDER */}
      <div className="mx-auto max-w-5xl px-8">
        <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      {/* APP MOCKUPS */}
      <section className="relative overflow-hidden py-32 px-6">
        <WavesBg p="ap" />
        <div className="relative z-10 mx-auto max-w-screen-2xl">
          <FadeUp>
            <p className="text-xs uppercase tracking-widest text-white/30 mb-3">{t('landing.appLabel')}</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              {t('landing.appH2a')}<br />
              <span className="text-white/30">{t('landing.appH2b')}</span>
            </h2>
            <p className="text-white/40 text-base mb-16 max-w-xl">{t('landing.appDesc')}</p>
          </FadeUp>

          <FadeUp delay={0.05}>
            <div className="hidden md:block">
              <AppDemo />
            </div>
            <div className="md:hidden flex flex-col items-center justify-center py-16 rounded-2xl border border-white/10 bg-white/[0.02]">
              <Monitor className="h-10 w-10 text-white/20 mb-4" />
              <p className="text-white/40 text-sm mb-6">{t('landing.demoDesktop')}</p>
              <button
                onClick={() => window.open('/signup', '_blank')}
                className="group flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black hover:bg-white/90 transition-all"
              >
                {t('landing.heroButton')}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* DIVIDER */}
      <div className="mx-auto max-w-5xl px-8">
        <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      {/* PRICING */}
      <section id="precio" className="relative overflow-hidden py-32 px-6">
        <WavesBg p="pc" />
        <div className="relative z-10 mx-auto max-w-4xl">
          <FadeUp>
            <p className="text-xs uppercase tracking-widest text-white/30 mb-3">{t('landing.pricingLabel')}</p>
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
                {t('landing.pricingH2')}
              </h2>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-white/10 text-white/70 border border-white/15 tracking-wide">
                {t('landing.freeTrial')}
              </span>
            </div>
            <p className="text-white/40 mb-16 text-base">{t('landing.pricingDesc')}</p>
          </FadeUp>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
            {plans.map((plan, i) => (
              <FadeUp key={plan.period} delay={i * 0.1}>
                <div
                  className={`relative rounded-2xl border p-8 transition-all ${
                    plan.highlight
                      ? "border-white/25 bg-white/[0.06]"
                      : "border-white/8 bg-white/[0.02]"
                  }`}
                >
                  {plan.highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] uppercase tracking-widest text-white/60">
                      {t('landing.mostPopular')}
                    </div>
                  )}
                  <p className="text-sm text-white/40 mb-4">{plan.period}</p>
                  <div className="flex items-baseline gap-1 mb-1">
                    <span className="text-5xl font-bold tracking-tight">{plan.price}</span>
                    <span className="text-white/40 text-base">{plan.unit}</span>
                  </div>
                  <p className="text-xs text-white/25 mb-8">{plan.note}</p>
                  <button onClick={() => window.open('/signup', '_blank')} className={`w-full rounded-full py-3 text-sm font-semibold transition-all ${
                    plan.highlight
                      ? "bg-white text-black hover:bg-white/90"
                      : "border border-white/15 text-white hover:bg-white/5"
                  }`}>
                    {t('landing.planButton')}
                  </button>
                </div>
              </FadeUp>
            ))}
          </div>

          <FadeUp delay={0.2}>
            <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-8">
              <p className="text-sm font-semibold text-white mb-5">{t('landing.includedLabel')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {features.map((f) => (
                  <div key={f} className="flex items-center gap-3">
                    <div className="h-5 w-5 rounded-full border border-white/15 bg-white/5 flex items-center justify-center shrink-0">
                      <Check className="h-3 w-3 text-white/60" />
                    </div>
                    <span className="text-sm text-white/50">{f}</span>
                  </div>
                ))}
              </div>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* DIVIDER */}
      <div className="mx-auto max-w-5xl px-8">
        <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      {/* SECURITY CERTIFICATES */}
      <section className="relative overflow-hidden py-32 px-6">
        <WavesBg p="sc" />
        <div className="relative z-10 max-w-5xl mx-auto">
          <FadeUp>
            <div className="text-center mb-16">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-white/10 text-white/70 border border-white/15 tracking-wide mb-5">
                {t('landing.securityLabel')}
              </span>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
                {t('landing.securityH2a')} <span className="text-white/30">{t('landing.securityH2b')}</span>
              </h2>
              <p className="text-white/40 text-base max-w-lg mx-auto">{t('landing.securityDesc')}</p>
            </div>
          </FadeUp>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { icon: Lock, title: t('landing.secSSL'), desc: t('landing.secSSLDesc') },
              { icon: ShieldCheck, title: t('landing.secRGPD'), desc: t('landing.secRGPDDesc') },
              { icon: KeyRound, title: t('landing.secAES'), desc: t('landing.secAESDesc') },
              { icon: Award, title: t('landing.secISO'), desc: t('landing.secISODesc') },
            ].map((item, i) => (
              <FadeUp key={item.title} delay={i * 0.08}>
                <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-6 h-full">
                  <div className="h-10 w-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                    <item.icon className="h-5 w-5 text-white/50" />
                  </div>
                  <p className="text-sm font-semibold text-white/80 mb-2">{item.title}</p>
                  <p className="text-xs text-white/35 leading-relaxed">{item.desc}</p>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* DIVIDER */}
      <div className="mx-auto max-w-5xl px-8">
        <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      {/* CTA FINAL */}
      <section className="py-40 px-6 text-center">
        <FadeUp>
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-6">
            {t('landing.ctaH2a')} <span className="text-white/30">{t('landing.ctaH2b')}</span>
          </h2>
          <p className="text-white/40 text-base mb-10 max-w-md mx-auto">
            {t('landing.ctaDesc')}
          </p>
          <button onClick={() => window.open('/signup', '_blank')} className="group inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-sm font-semibold text-black hover:bg-white/90 transition-all">
            {t('landing.ctaButton')}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        </FadeUp>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/5 py-8 px-4 md:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-white/20">
            <Scale className="h-4 w-4" />
            <span className="text-sm font-medium">Lyrium</span>
            <span className="text-white/15">·</span>
            <span className="text-xs text-white/25">{t('landing.footerCustomerService')} <a href="mailto:customerservice@lyrium.io" className="hover:text-white/50 transition-colors">customerservice@lyrium.io</a></span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 sm:ml-40">
            <a href="/terminos" target="_blank" rel="noopener noreferrer" className="text-xs text-white/25 hover:text-white/50 transition-colors">{t('landing.footerTerms')}</a>
            <a href="/privacidad" target="_blank" rel="noopener noreferrer" className="text-xs text-white/25 hover:text-white/50 transition-colors">{t('landing.footerPrivacy')}</a>
            <a href="/cookies" target="_blank" rel="noopener noreferrer" className="text-xs text-white/25 hover:text-white/50 transition-colors">{t('landing.footerCookies')}</a>
          </div>
          <p className="text-xs text-white/15">{t('landing.footerCopy')}</p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
