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
  Briefcase,
  Globe,
  Monitor,
  Lock,
  ShieldCheck,
  KeyRound,
  Award,
  PenTool,
  Calendar,
  Webhook,
  Brain,
  Share2,
  ChevronDown,
} from "lucide-react";
import AppDemo from "@/components/AppDemo";
import LandingThemeToggle from "@/components/LandingThemeToggle";
import { useLandingTheme } from "@/hooks/useLandingTheme";
import { getLanguageForCountry, getCurrencyForCountry, formatPrice, COUNTRIES_LIST } from "@/i18n";
import "./landing-theme.css";

type DustTone = {
  core: string;
  glow: string;
};

type DustPattern = "wave-body" | "wave-foam" | "wave-spray" | "section-body" | "section-foam";

type DustStreamConfig = {
  key: string;
  top: string;
  height: number;
  duration: number;
  count: number;
  phase: number;
  sway: number;
  sizeBoost?: number;
  pattern: DustPattern;
  tone: DustTone;
};

const DARK_DUST_TONES: DustTone[] = [
  { core: "rgba(255,255,255,0.72)", glow: "rgba(255,255,255,0.24)" },
  { core: "rgba(226,232,240,0.56)", glow: "rgba(148,163,184,0.2)" },
  { core: "rgba(255,255,255,0.38)", glow: "rgba(255,255,255,0.14)" },
];

const LIGHT_HERO_DUST_TONES: DustTone[] = [
  { core: "rgba(15,23,42,0.48)", glow: "rgba(15,23,42,0.2)" },
  { core: "rgba(30,41,59,0.38)", glow: "rgba(30,41,59,0.16)" },
  { core: "rgba(51,65,85,0.3)", glow: "rgba(71,85,105,0.14)" },
];

const LIGHT_SECTION_DUST_TONES: DustTone[] = [
  { core: "rgba(2,6,23,0.98)", glow: "rgba(2,6,23,0.42)" },
  { core: "rgba(15,23,42,0.92)", glow: "rgba(15,23,42,0.34)" },
  { core: "rgba(30,41,59,0.82)", glow: "rgba(30,41,59,0.28)" },
];

const getDustSeed = (value: string) =>
  value.split("").reduce((total, char, index) => total + char.charCodeAt(0) * (index + 17), 0);

const gaussian = (value: number, center: number, spread: number) =>
  Math.exp(-Math.pow((value - center) / spread, 2));

const waveProfile = (progress: number, intensity = 1) => {
  const arch = Math.sin(Math.pow(progress, 1.82) * Math.PI);
  const curl = gaussian(progress, 0.72, 0.14);
  const crash = Math.pow(Math.max(progress - 0.78, 0), 1.12) * 210;

  return (28 - arch * 92 - curl * 22 + crash) * intensity;
};

const sectionWaveProfile = (progress: number, intensity = 1) => {
  const primary = Math.sin(progress * Math.PI * 2 - 0.42) * 24;
  const secondary = Math.sin(progress * Math.PI * 4 + 0.96) * 8.5;
  const undertow = Math.cos(progress * Math.PI * 2 + 0.68) * 6.4;

  return (primary + secondary + undertow) * intensity;
};

const buildDustParticles = (stream: DustStreamConfig) =>
  Array.from({ length: stream.count }, (_, index) => {
    const progressRaw = stream.count === 1 ? 0 : index / (stream.count - 1);
    let progress = progressRaw;
    let x = progress * 50;
    let y = 0;
    let size = 1;
    let opacity = 0.2;
    let blur = 8;
    let offsetX = 0;
    let offsetY = 0;

    if (stream.pattern === "wave-body") {
      const thickness = 15 + gaussian(progress, 0.67, 0.2) * 22 + Math.sin(progress * Math.PI) * 8;
      const baseY = waveProfile(progress, 1);
      const offset =
        Math.sin((index + 1) * 1.91 + stream.phase) * thickness * 0.58 +
        Math.cos((index + 1) * 0.77 + stream.phase) * thickness * 0.16;
      const lateralSpread =
        Math.sin((index + 1) * 0.86 + stream.phase) * thickness * 0.78 +
        Math.cos((index + 1) * 1.44 + stream.phase) * thickness * 0.28;
      const verticalNoise =
        Math.sin((index + 1) * 1.23 + stream.phase) * thickness * 0.18 +
        Math.cos((index + 1) * 0.52 + stream.phase) * thickness * 0.12;

      x = progress * 50 + Math.sin(progress * Math.PI * 6.4 + stream.phase) * 0.45;
      y = baseY + offset;
      offsetX = lateralSpread;
      offsetY = verticalNoise;
      size = 1.55 + (((Math.sin((index + 1) * 1.48 + stream.phase) + 1) / 2) * 3.8) + (stream.sizeBoost ?? 0);
      opacity = 0.34 + gaussian(progress, 0.67, 0.18) * 0.34 + (((Math.cos((index + 1) * 1.1 + stream.phase) + 1) / 2) * 0.16);
      blur = 8 + size * 2.5;
    } else if (stream.pattern === "wave-foam") {
      progress = 0.52 + progressRaw * 0.33;
      const crestLift = gaussian(progress, 0.73, 0.09) * 10;
      const thickness = 9 + gaussian(progress, 0.72, 0.09) * 17;
      const baseY = waveProfile(progress, 1) - 10 - crestLift;
      const offset =
        Math.sin((index + 1) * 2.6 + stream.phase) * thickness * 0.5 -
        Math.abs(Math.cos((index + 1) * 1.3 + stream.phase)) * 4.5;
      const lateralSpread =
        Math.sin((index + 1) * 1.4 + stream.phase) * thickness * 0.56 +
        Math.cos((index + 1) * 0.74 + stream.phase) * thickness * 0.22;

      x = progress * 50 + Math.sin(progressRaw * Math.PI * 10 + stream.phase) * 0.72;
      y = baseY + offset;
      offsetX = lateralSpread;
      offsetY = -Math.abs(Math.cos((index + 1) * 1.18 + stream.phase)) * 3.6;
      size = 1.1 + (((Math.sin((index + 1) * 1.9 + stream.phase) + 1) / 2) * 2.7) + (stream.sizeBoost ?? 0) * 0.55;
      opacity = 0.46 + gaussian(progress, 0.73, 0.08) * 0.28 + (((Math.cos((index + 2) * 1.44 + stream.phase) + 1) / 2) * 0.12);
      blur = 10 + size * 3.1;
    } else if (stream.pattern === "wave-spray") {
      progress = 0.66 + progressRaw * 0.18;
      const baseY = waveProfile(progress, 1) - 18 - progressRaw * 16;
      const spread = 12 + progressRaw * 12;

      x = progress * 50 + progressRaw * 2.4 + Math.sin(progressRaw * Math.PI * 12 + stream.phase) * 0.52;
      y = baseY - Math.abs(Math.sin((index + 1) * 1.82 + stream.phase)) * spread;
      offsetX = Math.sin((index + 1) * 1.37 + stream.phase) * spread * 0.36;
      offsetY = -Math.abs(Math.cos((index + 1) * 0.94 + stream.phase)) * spread * 0.24;
      size = 0.9 + (((Math.sin((index + 1) * 2.08 + stream.phase) + 1) / 2) * 2.1) + (stream.sizeBoost ?? 0) * 0.35;
      opacity = 0.22 + gaussian(progress, 0.74, 0.07) * 0.18 + (((Math.cos((index + 1) * 1.66 + stream.phase) + 1) / 2) * 0.1);
      blur = 12 + size * 3.6;
    } else if (stream.pattern === "section-body") {
      const crestFocus = (Math.sin(progress * Math.PI * 2 - 0.24) + 1) / 2;
      const thickness = 7 + crestFocus * 5 + (((Math.sin(progress * Math.PI * 4 + stream.phase * 0.35) + 1) / 2) * 4.2);
      const baseY = sectionWaveProfile(progress, 1) + 4;
      const offset =
        Math.sin((index + 1) * 1.84 + stream.phase) * thickness * 0.56 +
        Math.cos((index + 1) * 0.92 + stream.phase) * thickness * 0.18;
      const lateralSpread =
        Math.sin((index + 1) * 0.92 + stream.phase) * thickness * 0.56 +
        Math.cos((index + 1) * 1.28 + stream.phase) * thickness * 0.18;

      x = progress * 54 - 2 + Math.sin(progress * Math.PI * 6.1 + stream.phase) * 0.4;
      y = baseY + offset;
      offsetX = lateralSpread;
      offsetY = Math.cos((index + 1) * 0.68 + stream.phase) * thickness * 0.14;
      size = 1.08 + (((Math.sin((index + 1) * 1.52 + stream.phase) + 1) / 2) * 2.5) + (stream.sizeBoost ?? 0) * 0.48;
      opacity = 0.3 + crestFocus * 0.16 + (((Math.cos((index + 1) * 1.18 + stream.phase) + 1) / 2) * 0.1);
      blur = 7.6 + size * 2.5;
    } else {
      progress = progressRaw;
      const crestFocus = Math.pow((Math.sin(progress * Math.PI * 2 - 0.28) + 1) / 2, 1.4);
      const thickness = 4.4 + crestFocus * 7.2;
      const baseY = sectionWaveProfile(progress, 0.96) - 6 - crestFocus * 10;
      const offset =
        Math.sin((index + 1) * 2.35 + stream.phase) * thickness * 0.52 -
        Math.abs(Math.cos((index + 1) * 1.22 + stream.phase)) * 2.4;

      x = progress * 54 - 2 + Math.sin(progressRaw * Math.PI * 8.7 + stream.phase) * 0.6;
      y = baseY + offset;
      offsetX = Math.sin((index + 1) * 1.22 + stream.phase) * thickness * 0.48;
      offsetY = -Math.abs(Math.cos((index + 1) * 1.34 + stream.phase)) * thickness * 0.22;
      size = 0.96 + (((Math.sin((index + 1) * 1.88 + stream.phase) + 1) / 2) * 2.05) + (stream.sizeBoost ?? 0) * 0.36;
      opacity = 0.32 + crestFocus * 0.18 + (((Math.cos((index + 1) * 1.5 + stream.phase) + 1) / 2) * 0.08);
      blur = 8.8 + size * 2.9;
    }

    const pulseDuration = 4.3 + ((Math.sin((index + 3) * 0.82 + stream.phase) + 1) / 2) * 3.1;
    const pulseDelay = ((index * 0.37) + stream.phase) % 4.5;

    return { x, y, size, opacity, pulseDuration, pulseDelay, blur, offsetX, offsetY };
  });

const DustCurrents = ({
  seed,
  isLightTheme,
  variant = "section",
}: {
  seed: string;
  isLightTheme: boolean;
  variant?: "hero" | "section" | "body";
}) => {
  const tones = isLightTheme
    ? variant === "hero"
      ? LIGHT_HERO_DUST_TONES
      : LIGHT_SECTION_DUST_TONES
    : DARK_DUST_TONES;
  const seedNumber = getDustSeed(seed);
  const streams: DustStreamConfig[] =
    variant === "hero"
      ? [
          {
            key: `${seed}-body`,
            top: "50%",
            height: 320,
            duration: 34,
            count: 152,
            phase: seedNumber * 0.012 + 0.4,
            sway: 12,
            sizeBoost: 0.9,
            pattern: "wave-body",
            tone: tones[1],
          },
          {
            key: `${seed}-foam`,
            top: "44%",
            height: 260,
            duration: 28,
            count: 76,
            phase: seedNumber * 0.016 + 1.3,
            sway: 7,
            sizeBoost: 0.55,
            pattern: "wave-foam",
            tone: tones[0],
          },
          {
            key: `${seed}-spray`,
            top: "39%",
            height: 220,
            duration: 24,
            count: 36,
            phase: seedNumber * 0.014 + 2.1,
            sway: 5,
            sizeBoost: 0.2,
            pattern: "wave-spray",
            tone: tones[2],
          },
        ]
      : variant === "body"
        ? [4, 11, 18, 25, 32, 39, 46, 53, 60, 67, 74, 81, 88, 95].map((anchor, index) => {
            const isFoamStream = index % 2 === 1;
            const variance = (seedNumber + index) % 4;

            return {
              key: `${seed}-${isFoamStream ? "foam" : "body"}-${index}`,
              top: `${anchor + ((seedNumber + index) % 2)}%`,
              height: isFoamStream ? 128 : 168,
              duration: (isFoamStream ? 16 : 22) + variance,
              count: (isFoamStream ? 22 : 38) + variance * (isFoamStream ? 2 : 3),
              phase: seedNumber * (isFoamStream ? 0.021 : 0.017) + index * 0.41,
              sway: isFoamStream ? 2.2 : 3.2,
              sizeBoost: isFoamStream ? 0.04 : 0.12,
              pattern: isFoamStream ? "section-foam" : "section-body",
              tone: tones[(seedNumber + index) % tones.length],
            };
          })
        : [
            {
              key: `${seed}-upper-body`,
              top: `${18 + (seedNumber % 4)}%`,
              height: 190,
              duration: 22 + (seedNumber % 5),
              count: 28 + (seedNumber % 5),
              phase: seedNumber * 0.014 + 0.16,
              sway: 3.2,
              pattern: "section-body",
              tone: tones[seedNumber % tones.length],
            },
            {
              key: `${seed}-upper-foam`,
              top: `${31 + (seedNumber % 4)}%`,
              height: 150,
              duration: 18 + (seedNumber % 4),
              count: 14 + ((seedNumber + 1) % 4),
              phase: seedNumber * 0.019 + 0.92,
              sway: 2.5,
              pattern: "section-foam",
              tone: tones[(seedNumber + 1) % tones.length],
            },
            {
              key: `${seed}-mid-body`,
              top: `${50 + (seedNumber % 3)}%`,
              height: 176,
              duration: 24 + (seedNumber % 5),
              count: 40 + (seedNumber % 6),
              phase: seedNumber * 0.017 + 1.44,
              sway: 4,
              sizeBoost: 0.1,
              pattern: "section-body",
              tone: tones[(seedNumber + 2) % tones.length],
            },
            {
              key: `${seed}-lower-foam`,
              top: `${69 + (seedNumber % 3)}%`,
              height: 152,
              duration: 20 + (seedNumber % 4),
              count: 16 + ((seedNumber + 2) % 5),
              phase: seedNumber * 0.022 + 2.08,
              sway: 2.7,
              pattern: "section-foam",
              tone: tones[seedNumber % tones.length],
            },
            {
              key: `${seed}-lower-body`,
              top: `${82 - (seedNumber % 3)}%`,
              height: 190,
              duration: 25 + (seedNumber % 5),
              count: 30 + (seedNumber % 5),
              phase: seedNumber * 0.016 + 2.66,
              sway: 3.4,
              pattern: "section-body",
              tone: tones[(seedNumber + 1) % tones.length],
            },
          ];

  const shouldEnter = variant === "hero";

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
      <motion.div
        className="absolute inset-0"
        initial={shouldEnter ? { x: "38%", opacity: 0 } : false}
        animate={shouldEnter ? { x: "0%", opacity: 1 } : undefined}
        transition={shouldEnter ? { duration: 1.6, ease: [0.16, 1, 0.3, 1] } : undefined}
      >
        <ParticleCanvas isLightTheme={isLightTheme} />
      </motion.div>
    </div>
  );
};

const ParticleCanvas = ({ isLightTheme }: { isLightTheme: boolean }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let running = true;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    };
    resize();

    const particles = Array.from({ length: 200 }, () => ({
      x: Math.random() * (canvas.width || 1),
      y: Math.random() * (canvas.height || 1),
      size: 1 + Math.random() * 2,
      opacity: 0.2 + Math.random() * 0.5,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
    }));

    const loop = () => {
      if (!running) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = isLightTheme
          ? `rgba(15,23,42,${p.opacity})`
          : `rgba(255,255,255,${p.opacity})`;
        ctx.fill();
      }
      animationId = requestAnimationFrame(loop);
    };

    const handleVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(animationId);
      } else {
        running = true;
        loop();
      }
    };

    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", handleVisibility);
    loop();

    return () => {
      running = false;
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [isLightTheme]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />;
};

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
  const { landingTheme, isLightTheme, toggleLandingTheme } = useLandingTheme();

  // Country & currency state
  const [selectedCountry, setSelectedCountry] = useState(() => {
    return sessionStorage.getItem('landingCountry') || 'ES';
  });
  const [countryOpen, setCountryOpen] = useState(false);
  const countryRef = useRef<HTMLDivElement>(null);
  const currency = getCurrencyForCountry(selectedCountry);

  // Billing toggle for pricing section
  const [billingAnnual, setBillingAnnual] = useState(true);

  // IP-based country detection on first visit
  useEffect(() => {
    if (sessionStorage.getItem('landingCountry')) return; // already detected
    const controller = new AbortController();
    fetch('https://ipapi.co/json/', { signal: controller.signal })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        const cc = data?.country_code?.toUpperCase();
        if (cc && COUNTRIES_LIST.some(c => c.code === cc)) {
          setSelectedCountry(cc);
          sessionStorage.setItem('landingCountry', cc);
          const lang = getLanguageForCountry(cc);
          i18n.changeLanguage(lang);
          localStorage.setItem('appLanguage', lang);
        }
      })
      .catch(() => {}); // fallback: keep ES
    return () => controller.abort();
  }, []);

  // Close country dropdown on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (countryRef.current && !countryRef.current.contains(e.target as Node)) {
        setCountryOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleCountryChange = (code: string) => {
    setSelectedCountry(code);
    sessionStorage.setItem('landingCountry', code);
    setCountryOpen(false);
    const lang = getLanguageForCountry(code);
    i18n.changeLanguage(lang);
    localStorage.setItem('appLanguage', lang);
  };

  const currentCountry = COUNTRIES_LIST.find(c => c.code === selectedCountry) || COUNTRIES_LIST[0];

  // Data (reactive to language)
  const modules = [
    { icon: FileSignature, title: t('landing.mod1Title'), description: t('landing.mod1Desc') },
    { icon: Users,         title: t('landing.mod2Title'), description: t('landing.mod2Desc') },
    { icon: Briefcase,     title: t('landing.mod7Title'), description: t('landing.mod7Desc') },
    { icon: Shield,        title: t('landing.mod3Title'), description: t('landing.mod3Desc') },
    { icon: FileText,      title: t('landing.mod4Title'), description: t('landing.mod4Desc') },
    { icon: Zap,           title: t('landing.mod5Title'), description: t('landing.mod5Desc') },
    { icon: UserPlus,      title: t('landing.mod6Title'), description: t('landing.mod6Desc') },
  ];

  const stats = [
    { value: "12h",    label: t('landing.stat1Label'), sub: t('landing.stat1Sub') },
    { value: "3×",     label: t('landing.stat2Label'), sub: t('landing.stat2Sub') },
    { value: "70%",    label: t('landing.stat3Label'), sub: t('landing.stat3Sub') },
    { value: t('landing.stat4Value'), label: t('landing.stat4Label'), sub: t('landing.stat4Sub') },
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

  // Pricing data (reactive to currency)
  const starterMonthly = formatPrice(197, currency);
  const starterAnnual = formatPrice(2100, currency);
  const starterAnnualPerMonth = formatPrice(175, currency);
  const starterSaving = formatPrice(264, currency);
  const advancedMonthly = formatPrice(350, currency);
  const advancedAnnual = formatPrice(3700, currency);
  const advancedAnnualPerMonth = formatPrice(308, currency);
  const advancedSaving = formatPrice(500, currency);
  const individualMonthly = formatPrice(60, currency);
  const individualAnnual = formatPrice(600, currency);
  const individualJuniorMonthly = formatPrice(45, currency);
  const individualJuniorAnnual = formatPrice(480, currency);
  const roiPrice = formatPrice(197, currency);

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

  return (
    <div className={`landing-shell ${isLightTheme ? "landing-light" : "landing-dark"} bg-[#080808] text-white min-h-screen overflow-x-hidden`}>

      {/* NAV */}
      <nav className={`landing-themed landing-nav fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 md:px-8 py-4 border-b transition-all duration-300 ${scrolled ? "landing-nav-scrolled border-white/8 bg-[#080808]/90 backdrop-blur-md" : "border-transparent bg-transparent"}`}>
        {/* Logo */}
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2.5">
            <Scale className="h-5 w-5 text-white" />
            <span className="text-lg font-semibold tracking-tight">Lyrium</span>
          </div>
          <span className="text-[9px] text-white/25 tracking-widest uppercase ml-0.5">Powered by Claude</span>
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
          <LandingThemeToggle theme={landingTheme} onToggle={toggleLandingTheme} />
          <div ref={countryRef} className="relative">
            <button
              onClick={() => setCountryOpen(!countryOpen)}
              className="flex items-center gap-1.5 text-white text-sm cursor-pointer hover:text-white/80 transition-colors"
            >
              <span className="text-base leading-none">{currentCountry.flag}</span>
              <span className="hidden sm:inline">{currentCountry.name}</span>
              <ChevronDown className={`h-3 w-3 transition-transform ${countryOpen ? 'rotate-180' : ''}`} />
            </button>
            {countryOpen && (
              <div className="landing-country-menu absolute right-0 top-full mt-2 w-56 max-h-72 overflow-y-auto rounded-lg border border-white/10 bg-[#111] shadow-xl z-[100]">
                {COUNTRIES_LIST.map(c => (
                  <button
                    key={c.code}
                    onClick={() => handleCountryChange(c.code)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-white/5 transition-colors ${
                      c.code === selectedCountry ? 'bg-white/10 text-white' : 'text-white/60'
                    }`}
                  >
                    <span className="text-base leading-none">{c.flag}</span>
                    <span>{c.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => window.open('/login', '_blank')}
            className="landing-login-link flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors"
          >
            {t('landing.navLogin')} <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section ref={heroRef} className="landing-themed relative flex flex-col items-center justify-center min-h-screen px-6 text-center overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.032) 15%, rgba(255,255,255,0.016) 32%, rgba(255,255,255,0.007) 52%, rgba(255,255,255,0.002) 68%, transparent 82%)",
          }}
        />
        <DustCurrents seed="hero" isLightTheme={isLightTheme} variant="hero" />

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
            <button onClick={() => window.open('/signup', '_blank')} className="landing-primary-button group flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black hover:bg-white/90 transition-all">
              {t('landing.heroButton')}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </motion.div>
        </motion.div>
        <div className="landing-hero-fade pointer-events-none absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#080808] to-transparent" />
      </section>

      <div className="relative overflow-hidden">
        <DustCurrents seed="body" isLightTheme={isLightTheme} variant="body" />
        <div className="relative z-10">

      {/* STATS */}
      <section id="ventajas" className="landing-themed relative overflow-hidden py-20 px-6 border-y border-white/5">
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
      <section className="landing-themed relative overflow-hidden py-32 px-6">
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
        <div className="landing-divider h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      {/* ROI */}
      <section className="landing-themed relative overflow-hidden py-32 px-6">
        <div className="relative z-10 mx-auto max-w-5xl">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-10 sm:p-16 text-center relative overflow-hidden">
            {/* glow */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="w-[500px] h-[300px] rounded-full bg-white/[0.04] blur-3xl" />
            </div>
            <FadeUp className="relative z-10">
              <p className="text-xs uppercase tracking-widest text-white/30 mb-4">{t('landing.roiLabel')}</p>
              <h2 className="text-3xl sm:text-5xl font-bold tracking-tight mb-6">
                {t('landing.roiH2a', { price: roiPrice })}<br />
                <span className="text-white/30">{t('landing.roiH2b')}</span>
              </h2>
              <p className="text-white/40 text-base max-w-2xl mx-auto leading-relaxed mb-10">
                {t('landing.roiDesc')}
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <button onClick={() => window.open('/signup', '_blank')} className="landing-primary-button group flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-black hover:bg-white/90 transition-all">
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
        <div className="landing-divider h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      {/* MODULES */}
      <section id="funciones" className="landing-themed relative overflow-hidden py-32 px-6">
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

          {/* SIMULADOR DE DEFENSA */}
          <div className="mt-20">
            <FadeUp>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-6 max-w-3xl">
                {t('landing.simH2a')}{" "}
                <span className="text-white/30">{t('landing.simH2b')}</span>
              </h2>
              <div className="max-w-2xl space-y-4 text-white/40 text-base leading-relaxed">
                <p>{t('landing.simP1')}</p>
                <p>{t('landing.simP2')}</p>
                <p className="text-white/70">{t('landing.simP3')}</p>
              </div>
            </FadeUp>
          </div>

          {/* EXPEDIENTE LARGO */}
          <div className="mt-20">
            <FadeUp>
              <p className="text-xs uppercase tracking-widest text-white/30 mb-3">{t('landing.expLabel')}</p>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-10">
                {t('landing.expH2a')}{" "}
                <span className="text-white/30">{t('landing.expH2b')}</span>
              </h2>
            </FadeUp>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <FadeUp delay={0.05}>
                <div className="rounded-2xl border border-white/8 bg-white/[0.015] p-8 h-full">
                  <p className="text-xs uppercase tracking-widest text-white/25 mb-6">{t('landing.expAnguishLabel')}</p>
                  <div className="space-y-4">
                    <p className="text-sm text-white/35 leading-relaxed">
                      {t('landing.expAnguishP1')}
                    </p>
                    <div className="space-y-3 text-sm text-white/35 leading-relaxed">
                      <p>• {t('landing.expAnguishList1')}</p>
                      <p>• {t('landing.expAnguishList2')}</p>
                      <p>• {t('landing.expAnguishList3')}</p>
                    </div>
                  </div>
                </div>
              </FadeUp>
              <FadeUp delay={0.12}>
                <div className="rounded-2xl border border-white/20 bg-white/[0.04] p-8 h-full">
                  <p className="text-xs uppercase tracking-widest text-white/50 mb-6">{t('landing.expReliefLabel')}</p>
                  <div className="space-y-4 text-sm text-white/70 leading-relaxed">
                    <p>
                      <span className="text-white">{t('landing.expReliefP1')}</span>
                    </p>
                  </div>
                </div>
              </FadeUp>
            </div>
            <FadeUp delay={0.18}>
              <p className="mt-6 text-xs text-white/20">
                {t('landing.expNote')}
              </p>
            </FadeUp>
          </div>

          {/* COMPETIDOR */}
          <div className="mt-20">
            <FadeUp>
              <p className="text-xs uppercase tracking-widest text-white/30 mb-3">{t('landing.compLabel')}</p>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-6">
                {t('landing.compH2a')}{" "}
                <span className="text-white/30">{t('landing.compH2b')}</span>
              </h2>
              <div className="max-w-2xl space-y-4 text-white/40 text-base leading-relaxed">
                <p className="text-white/70">
                  {t('landing.compP1')}
                </p>
              </div>
            </FadeUp>
          </div>

          {/* INTEGRATIONS — Signature & Calendar */}
          <div className="mt-16">
            <FadeUp>
              <p className="text-xs uppercase tracking-widest text-white/30 mb-3">{t('landing.integrationsLabel')}</p>
              <h3 className="text-2xl sm:text-3xl font-bold tracking-tight mb-10">
                {t('landing.integrationsH2')}
              </h3>
            </FadeUp>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { icon: PenTool, title: t('landing.integSignTitle'), description: t('landing.integSignDesc') },
                { icon: Calendar, title: t('landing.integCalTitle'), description: t('landing.integCalDesc') },
                { icon: Webhook, title: t('landing.integZapierTitle'), description: t('landing.integZapierDesc') },
              ].map((item, i) => (
                <FadeUp key={item.title} delay={i * 0.1} className="h-full">
                  <div className="relative group rounded-xl border border-white/8 bg-white/[0.02] p-8 transition-all duration-300 hover:bg-white/[0.05] hover:border-white/15 cursor-default h-full">
                    <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-lg border border-white/10 bg-white/5">
                      <item.icon className="h-6 w-6 text-white/70" />
                    </div>
                    <h3 className="mb-2 text-base font-semibold text-white">{item.title}</h3>
                    <p className="text-sm text-white/40 leading-relaxed">{item.description}</p>
                  </div>
                </FadeUp>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 max-w-2xl mx-auto">
              {[
                { icon: Brain, title: t('landing.integAITitle'), description: t('landing.integAIDesc') },
                { icon: Share2, title: t('landing.integShareTitle'), description: t('landing.integShareDesc') },
              ].map((item, i) => (
                <FadeUp key={item.title} delay={i * 0.1 + 0.3} className="h-full">
                  <div className="relative group rounded-xl border border-white/8 bg-white/[0.02] p-8 transition-all duration-300 hover:bg-white/[0.05] hover:border-white/15 cursor-default h-full">
                    <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-lg border border-white/10 bg-white/5">
                      <item.icon className="h-6 w-6 text-white/70" />
                    </div>
                    <h3 className="mb-2 text-base font-semibold text-white">{item.title}</h3>
                    <p className="text-sm text-white/40 leading-relaxed">{item.description}</p>
                  </div>
                </FadeUp>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* DIVIDER */}
      <div className="mx-auto max-w-5xl px-8">
        <div className="landing-divider h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      {/* APP MOCKUPS */}
      <section className="relative overflow-hidden py-32 px-6">
        <div className="relative z-10 mx-auto max-w-screen-2xl">
          <FadeUp className="landing-themed">
            <p className="text-xs uppercase tracking-widest text-white/30 mb-3">{t('landing.appLabel')}</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              {t('landing.appH2a')}<br />
              <span className="text-white/30">{t('landing.appH2b')}</span>
            </h2>
            <p className="text-white/40 text-base mb-16 max-w-xl">{t('landing.appDesc')}</p>
          </FadeUp>

          <FadeUp delay={0.05}>
            <div className="hidden md:block relative">
              <span className="absolute top-3 right-3 z-20 bg-white/10 backdrop-blur-sm border border-white/20 text-white/60 text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full">
                DEMO
              </span>
              <AppDemo />
            </div>
            <div className="landing-themed md:hidden flex flex-col items-center justify-center py-16 rounded-2xl border border-white/10 bg-white/[0.02]">
              <Monitor className="h-10 w-10 text-white/20 mb-4" />
              <p className="text-white/40 text-sm mb-6">{t('landing.demoDesktop')}</p>
              <button
                onClick={() => window.open('/signup', '_blank')}
                className="landing-primary-button group flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black hover:bg-white/90 transition-all"
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
        <div className="landing-divider h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      {/* PRICING */}
      <section id="precio" className="landing-themed relative overflow-hidden py-32 px-6">
        <div className="relative z-10 mx-auto max-w-5xl">
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
            <p className="text-white/40 mb-10 text-base">{t('landing.pricingDesc')}</p>
          </FadeUp>

          {/* Billing toggle */}
          <FadeUp delay={0.05}>
            <div className="flex items-center justify-center gap-3 mb-10">
              <span className={`text-sm transition-colors ${!billingAnnual ? 'text-white' : 'text-white/40'}`}>{t('landing.planMonthly')}</span>
              <button
                onClick={() => setBillingAnnual(!billingAnnual)}
                className={`relative w-12 h-6 rounded-full transition-colors ${billingAnnual ? 'bg-white/20' : 'bg-white/10'}`}
              >
                <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${billingAnnual ? 'left-[26px]' : 'left-0.5'}`} />
              </button>
              <span className={`text-sm transition-colors ${billingAnnual ? 'text-white' : 'text-white/40'}`}>{t('landing.planAnnual')}</span>
            </div>
          </FadeUp>

          {/* Plan cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            {/* Sin Cargo */}
            <FadeUp delay={0.05}>
              <div className="relative rounded-2xl border border-white/8 bg-white/[0.02] p-8 h-full">
                <p className="text-sm font-semibold text-white mb-1">Sin Cargo</p>
                <p className="text-xs text-white/30 mb-6">Para empezar sin compromiso</p>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-5xl font-bold tracking-tight">0</span>
                  <span className="text-white/40 text-base">€/mes</span>
                </div>
                <p className="text-xs text-white/25 mb-8">Siempre gratis</p>
                <button onClick={() => window.open('/signup?plan=free', '_blank')} className="landing-outline-button w-full rounded-full py-3 text-sm font-semibold border border-white/15 text-white hover:bg-white/5 transition-all">
                  Empezar sin cargo
                </button>
                <ul className="mt-6 space-y-3">
                  <li className="flex items-center gap-2 text-sm text-white/50">
                    <Check className="h-3.5 w-3.5 text-white/40 shrink-0" />
                    Hasta 10 clientes
                  </li>
                  <li className="flex items-center gap-2 text-sm text-white/50">
                    <Check className="h-3.5 w-3.5 text-white/40 shrink-0" />
                    Hasta 5 casos activos
                  </li>
                  <li className="flex items-center gap-2 text-sm text-white/50">
                    <Check className="h-3.5 w-3.5 text-white/40 shrink-0" />
                    50 mensajes IA/día
                  </li>
                  <li className="flex items-center gap-2 text-sm text-white/50">
                    <Check className="h-3.5 w-3.5 text-white/40 shrink-0" />
                    Sin automatizaciones
                  </li>
                  <li className="flex items-center gap-2 text-sm text-white/50">
                    <Check className="h-3.5 w-3.5 text-white/40 shrink-0" />
                    Sin subcuentas
                  </li>
                </ul>
              </div>
            </FadeUp>

            {/* Starter */}
            <FadeUp delay={0.1}>
              <div className="relative rounded-2xl border border-white/8 bg-white/[0.02] p-8 h-full">
                <p className="text-sm font-semibold text-white mb-1">{t('landing.planStarterName')}</p>
                <p className="text-xs text-white/30 mb-6">{t('landing.planStarterSub')}</p>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-5xl font-bold tracking-tight">{billingAnnual ? starterAnnual : starterMonthly}</span>
                  <span className="text-white/40 text-base">{billingAnnual ? t('landing.perYear') : t('landing.perMonth')}</span>
                </div>
                <p className="text-xs text-white/25 mb-8">
                  {billingAnnual
                    ? t('landing.planAnnualEquiv', { perMonth: starterAnnualPerMonth, saving: starterSaving })
                    : t('landing.planMonthlyNote')}
                </p>
                <button onClick={() => window.open('/signup', '_blank')} className="landing-outline-button w-full rounded-full py-3 text-sm font-semibold border border-white/15 text-white hover:bg-white/5 transition-all">
                  {t('landing.planButton')}
                </button>
                <ul className="mt-6 space-y-3">
                  <li className="flex items-center gap-2 text-sm text-white/50">
                    <Check className="h-3.5 w-3.5 text-white/40 shrink-0" />
                    {t('landing.feat1')}
                  </li>
                  <li className="flex items-center gap-2 text-sm text-white/50">
                    <Check className="h-3.5 w-3.5 text-white/40 shrink-0" />
                    {t('landing.feat2')}
                  </li>
                  <li className="flex items-center gap-2 text-sm text-white/50">
                    <Check className="h-3.5 w-3.5 text-white/40 shrink-0" />
                    {t('landing.planStarterSubaccounts')}
                  </li>
                  <li className="flex items-center gap-2 text-sm text-white/50">
                    <Check className="h-3.5 w-3.5 text-white/40 shrink-0" />
                    {t('landing.feat4')}
                  </li>
                  <li className="flex items-center gap-2 text-sm text-white/50">
                    <Check className="h-3.5 w-3.5 text-white/40 shrink-0" />
                    {t('landing.feat5')}
                  </li>
                </ul>
              </div>
            </FadeUp>

            {/* Individual */}
            <FadeUp delay={0.15}>
              <div className="relative rounded-2xl border border-white/8 bg-white/[0.02] p-8 h-full">
                <p className="text-sm font-semibold text-white mb-1">Plan Individual</p>
                <p className="text-xs text-white/30 mb-6">Para abogados autónomos</p>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-5xl font-bold tracking-tight">{billingAnnual ? individualJuniorAnnual : individualJuniorMonthly}</span>
                  <span className="text-white/40 text-base">{billingAnnual ? t('landing.perYear') : t('landing.perMonth')}</span>
                </div>
                <div className="flex items-center gap-2 mb-8">
                  <span className="text-sm text-white/30 line-through">{billingAnnual ? individualAnnual : individualMonthly}</span>
                  <span className="text-xs text-green-400 font-medium">Precio junior</span>
                </div>
                <button onClick={() => window.open('/signup', '_blank')} className="landing-outline-button w-full rounded-full py-3 text-sm font-semibold border border-white/15 text-white hover:bg-white/5 transition-all">
                  {t('landing.planButton')}
                </button>
                <ul className="mt-6 space-y-3">
                  <li className="flex items-center gap-2 text-sm text-white/50">
                    <Check className="h-3.5 w-3.5 text-white/40 shrink-0" />
                    {t('landing.feat1')}
                  </li>
                  <li className="flex items-center gap-2 text-sm text-white/50">
                    <Check className="h-3.5 w-3.5 text-white/40 shrink-0" />
                    {t('landing.feat2')}
                  </li>
                  <li className="flex items-center gap-2 text-sm text-white/50">
                    <Check className="h-3.5 w-3.5 text-white/40 shrink-0" />
                    0 subcuentas (acceso completo para el titular)
                  </li>
                  <li className="flex items-center gap-2 text-sm text-white/50">
                    <Check className="h-3.5 w-3.5 text-white/40 shrink-0" />
                    {t('landing.feat4')}
                  </li>
                  <li className="flex items-center gap-2 text-sm text-white/50">
                    <Check className="h-3.5 w-3.5 text-white/40 shrink-0" />
                    {t('landing.feat5')}
                  </li>
                </ul>
              </div>
            </FadeUp>

            {/* Advanced */}
            <FadeUp delay={0.2}>
              <div className="relative rounded-2xl border border-white/25 bg-white/[0.06] p-8 h-full">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] uppercase tracking-widest text-white/60">
                  {t('landing.mostPopular')}
                </div>
                <p className="text-sm font-semibold text-white mb-1">{t('landing.planAdvancedName')}</p>
                <p className="text-xs text-white/30 mb-6">{t('landing.planAdvancedSub')}</p>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-5xl font-bold tracking-tight">{billingAnnual ? advancedAnnual : advancedMonthly}</span>
                  <span className="text-white/40 text-base">{billingAnnual ? t('landing.perYear') : t('landing.perMonth')}</span>
                </div>
                <p className="text-xs text-white/25 mb-8">
                  {billingAnnual
                    ? t('landing.planAnnualEquiv', { perMonth: advancedAnnualPerMonth, saving: advancedSaving })
                    : t('landing.planMonthlyNote')}
                </p>
                <button onClick={() => window.open('/signup', '_blank')} className="landing-primary-button w-full rounded-full py-3 text-sm font-semibold bg-white text-black hover:bg-white/90 transition-all">
                  {t('landing.planButton')}
                </button>
                <ul className="mt-6 space-y-3">
                  <li className="flex items-center gap-2 text-sm text-white/50">
                    <Check className="h-3.5 w-3.5 text-white/40 shrink-0" />
                    {t('landing.feat1')}
                  </li>
                  <li className="flex items-center gap-2 text-sm text-white/50">
                    <Check className="h-3.5 w-3.5 text-white/40 shrink-0" />
                    {t('landing.feat2')}
                  </li>
                  <li className="flex items-center gap-2 text-sm text-white/50">
                    <Check className="h-3.5 w-3.5 text-white/40 shrink-0" />
                    {t('landing.planAdvancedSubaccounts')}
                  </li>
                  <li className="flex items-center gap-2 text-sm text-white/50">
                    <Check className="h-3.5 w-3.5 text-white/40 shrink-0" />
                    {t('landing.feat4')}
                  </li>
                  <li className="flex items-center gap-2 text-sm text-white/50">
                    <Check className="h-3.5 w-3.5 text-white/40 shrink-0" />
                    {t('landing.feat5')}
                  </li>
                </ul>
              </div>
            </FadeUp>
          </div>

          {/* Billed in EUR note */}
          {currency.code !== 'EUR' && (
            <FadeUp delay={0.25}>
              <p className="text-center text-xs text-white/20 mb-6">{t('landing.billedInEur')}</p>
            </FadeUp>
          )}
        </div>
      </section>

      {/* DIVIDER */}
      <div className="mx-auto max-w-5xl px-8">
        <div className="landing-divider h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      {/* SECURITY CERTIFICATES */}
      <section className="landing-themed relative overflow-hidden py-32 px-6">
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
        <div className="landing-divider h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      {/* SECURITY BANNER */}
      <section className="landing-themed relative overflow-hidden py-20 px-6 border-y border-white/5">
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <FadeUp>
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-white/[0.04] border border-white/10 mb-8">
              <ShieldCheck className="h-8 w-8 text-white/50" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-6">
              {t('landing.securityBannerTitle')}
            </h2>
            <div className="space-y-4 text-white/40 text-base leading-relaxed">
              <p>{t('landing.securityBannerLine1')}</p>
              <p>{t('landing.securityBannerLine2')}</p>
              <p>{t('landing.securityBannerLine3')}</p>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* DIVIDER */}
      <div className="mx-auto max-w-5xl px-8">
        <div className="landing-divider h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      {/* CTA FINAL */}
      <section className="landing-themed py-40 px-6 text-center">
        <FadeUp>
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-6">
            {t('landing.ctaH2a')} <span className="text-white/30">{t('landing.ctaH2b')}</span>
          </h2>
          <p className="text-white/40 text-base mb-10 max-w-md mx-auto">
            {t('landing.ctaDesc')}
          </p>
          <button onClick={() => window.open('/signup', '_blank')} className="landing-primary-button group inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-sm font-semibold text-black hover:bg-white/90 transition-all">
            {t('landing.ctaButton')}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        </FadeUp>
      </section>

        </div>
      </div>

      {/* FOOTER */}
      <footer className="landing-themed border-t border-white/5 py-8 px-4 md:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-white/20">
            <Scale className="h-4 w-4" />
            <span className="text-sm font-medium">Lyrium</span>
            <span className="text-white/15">·</span>
            <span className="text-xs text-white/25">{t('landing.footerCustomerService')} <a href="mailto:support@lyrium.io" className="hover:text-white/50 transition-colors">support@lyrium.io</a></span>
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
