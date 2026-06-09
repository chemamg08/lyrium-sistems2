import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  BrainCircuit,
  Briefcase,
  Calendar,
  CheckCircle2,
  Clock,
  FileSignature,
  FileText,
  Folders,
  KeyRound,
  Lock,
  MessagesSquare,
  Shield,
  ShieldCheck,
  Users,
  Zap,
} from "lucide-react";
import LandingHeader from "@/components/landing/LandingHeader";
import LandingHero from "@/components/landing/LandingHero";
import LandingTrustBar from "@/components/landing/LandingTrustBar";
import LandingComparison from "@/components/landing/LandingComparison";
import LandingBenefits from "@/components/landing/LandingBenefits";
import LandingProductShowcase from "@/components/landing/LandingProductShowcase";
import LandingSecurity from "@/components/landing/LandingSecurity";
import LandingPricing from "@/components/landing/LandingPricing";
import LandingFinalCta from "@/components/landing/LandingFinalCta";
import LandingFooter from "@/components/landing/LandingFooter";
import { COUNTRIES_LIST, formatPrice, getCurrencyForCountry, getLanguageForCountry } from "@/i18n";
import "./landing-theme.css";

const LANDING_COUNTRY_SELECTOR_ENABLED = false;
const LANDING_LOCKED_COUNTRY_CODE = "ES";

const scrollToSection = (id: string) => {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
};

const Landing = () => {
  const { t, i18n } = useTranslation();
  const [selectedCountry, setSelectedCountry] = useState(() => sessionStorage.getItem("landingCountry") || "ES");
  const [countryOpen, setCountryOpen] = useState(false);
  const [billingAnnual, setBillingAnnual] = useState(true);
  const [scrolled, setScrolled] = useState(false);
  const countryRef = useRef<HTMLDivElement>(null);
  const effectiveCountryCode = LANDING_COUNTRY_SELECTOR_ENABLED ? selectedCountry : LANDING_LOCKED_COUNTRY_CODE;
  const currency = getCurrencyForCountry(effectiveCountryCode);

  useEffect(() => {
    if (!LANDING_COUNTRY_SELECTOR_ENABLED) return;
    if (sessionStorage.getItem("landingCountry")) return;

    const controller = new AbortController();

    fetch("https://ipapi.co/json/", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => {
        const code = data?.country_code?.toUpperCase();
        if (!code || !COUNTRIES_LIST.some((country) => country.code === code)) return;

        setSelectedCountry(code);
        sessionStorage.setItem("landingCountry", code);
        const language = getLanguageForCountry(code);
        i18n.changeLanguage(language);
        localStorage.setItem("appLanguage", language);
      })
      .catch(() => {});

    return () => controller.abort();
  }, [i18n]);

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (countryRef.current && !countryRef.current.contains(event.target as Node)) {
        setCountryOpen(false);
      }
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleCountryChange = (code: string) => {
    if (!LANDING_COUNTRY_SELECTOR_ENABLED) return;
    setSelectedCountry(code);
    sessionStorage.setItem("landingCountry", code);
    setCountryOpen(false);
    const language = getLanguageForCountry(code);
    i18n.changeLanguage(language);
    localStorage.setItem("appLanguage", language);
  };

  const openLogin = () => window.open("/login", "_blank");
  const openSignup = () => window.open("/signup", "_blank");
  const openFreeSignup = () => window.open("/signup?plan=free", "_blank");

  const starterMonthly = formatPrice(197, currency);
  const starterAnnual = formatPrice(2100, currency);
  const starterAnnualPerMonth = formatPrice(175, currency);
  const starterSaving = formatPrice(264, currency);
  const advancedMonthly = formatPrice(350, currency);
  const advancedAnnual = formatPrice(3700, currency);
  const advancedAnnualPerMonth = formatPrice(308, currency);
  const advancedSaving = formatPrice(500, currency);
  const individualMonthly = formatPrice(40, currency);
  const individualAnnual = formatPrice(420, currency);

  const currentCountry = COUNTRIES_LIST.find((country) => country.code === effectiveCountryCode) || COUNTRIES_LIST[0];

  const trustItems = [
    t("landing.trustItem1"),
    t("landing.trustItem2"),
    t("landing.trustItem3"),
    t("landing.trustItem4"),
  ];

  const comparisonProblems = [
    { icon: Clock, text: t("landing.problem1") },
    { icon: Folders, text: t("landing.problem2") },
    { icon: AlertTriangle, text: t("landing.problem3") },
    { icon: MessagesSquare, text: t("landing.problem4") },
  ];

  const comparisonSolutions = [
    { icon: BrainCircuit, text: t("landing.solution1") },
    { icon: FileSignature, text: t("landing.solution2") },
    { icon: Users, text: t("landing.solution3") },
    { icon: Zap, text: t("landing.solution4") },
  ];

  const benefitPillars = [
    {
      icon: Briefcase,
      title: t("landing.pillar1Title"),
      description: t("landing.pillar1Desc"),
      items: [t("landing.pillar1Item1"), t("landing.pillar1Item2"), t("landing.pillar1Item3")],
    },
    {
      icon: FileText,
      title: t("landing.pillar2Title"),
      description: t("landing.pillar2Desc"),
      items: [t("landing.pillar2Item1"), t("landing.pillar2Item2"), t("landing.pillar2Item3")],
    },
    {
      icon: Calendar,
      title: t("landing.pillar3Title"),
      description: t("landing.pillar3Desc"),
      items: [t("landing.pillar3Item1"), t("landing.pillar3Item2"), t("landing.pillar3Item3")],
    },
  ];

  const productPoints = [
    t("landing.productPoint1"),
    t("landing.productPoint2"),
    t("landing.productPoint3"),
    t("landing.productPoint4"),
  ];

  const productFeatureCards = [
    {
      title: t("landing.productCard1Title"),
      description: t("landing.productCard1Desc"),
      href: "/funciones#clientes-expedientes",
      linkLabel: t("landing.productSeeMore", { defaultValue: "Ver más" }),
    },
    {
      title: t("landing.productCard2Title"),
      description: t("landing.productCard2Desc"),
      href: "/funciones#contratos-escritos",
      linkLabel: t("landing.productSeeMore", { defaultValue: "Ver más" }),
    },
    {
      title: t("landing.productCard3Title"),
      description: t("landing.productCard3Desc"),
      href: "/funciones#documentos-analisis",
      linkLabel: t("landing.productSeeMore", { defaultValue: "Ver más" }),
    },
    {
      title: t("landing.productCard4Title"),
      description: t("landing.productCard4Desc"),
      href: "/funciones#automatizaciones-seguimiento",
      linkLabel: t("landing.productSeeMore", { defaultValue: "Ver más" }),
    },
  ];

  const securityItems = [
    { icon: Lock, title: t("landing.secSSL"), description: t("landing.secSSLDesc") },
    { icon: ShieldCheck, title: t("landing.secRGPD"), description: t("landing.secRGPDDesc") },
    { icon: KeyRound, title: t("landing.secAES"), description: t("landing.secAESDesc") },
    { icon: Shield, title: t("landing.secISO"), description: t("landing.secISODesc") },
  ];

  const pricingPlans = [
    {
      name: t("landing.freePlanName"),
      subtitle: t("landing.freePlanSub"),
      price: "0",
      unit: t("landing.perMonth"),
      note: t("landing.freePlanNote"),
      features: [
        t("landing.freePlanFeat1"),
        t("landing.freePlanFeat2"),
        t("landing.freePlanFeat3"),
        t("landing.freePlanFeat4"),
      ],
      ctaLabel: t("landing.freePlanButton"),
      onAction: openFreeSignup,
    },
    {
      name: t("landing.planStarterName"),
      subtitle: t("landing.planStarterSub"),
      price: billingAnnual ? starterAnnual : starterMonthly,
      unit: billingAnnual ? t("landing.perYear") : t("landing.perMonth"),
      note: billingAnnual
        ? t("landing.planAnnualEquiv", { perMonth: starterAnnualPerMonth, saving: starterSaving })
        : t("landing.planMonthlyNote"),
      features: [
        t("landing.feat1"),
        t("landing.feat2"),
        t("landing.planStarterSubaccounts"),
        t("landing.feat4"),
      ],
      ctaLabel: t("landing.planButton"),
      onAction: openSignup,
    },
    {
      name: t("landing.planIndividualName"),
      subtitle: t("landing.planIndividualSub"),
      price: billingAnnual ? individualAnnual : individualMonthly,
      unit: billingAnnual ? t("landing.perYear") : t("landing.perMonth"),
      note: t("landing.individualPlanNote"),
      features: [
        t("landing.feat1"),
        t("landing.feat2"),
        t("landing.planIndividualSubaccounts"),
        t("landing.feat5"),
      ],
      ctaLabel: t("landing.planButton"),
      onAction: openSignup,
    },
    {
      name: t("landing.planAdvancedName"),
      subtitle: t("landing.planAdvancedSub"),
      price: billingAnnual ? advancedAnnual : advancedMonthly,
      unit: billingAnnual ? t("landing.perYear") : t("landing.perMonth"),
      note: billingAnnual
        ? t("landing.planAnnualEquiv", { perMonth: advancedAnnualPerMonth, saving: advancedSaving })
        : t("landing.planMonthlyNote"),
      features: [
        t("landing.feat1"),
        t("landing.feat2"),
        t("landing.planAdvancedSubaccounts"),
        t("landing.feat4"),
      ],
      ctaLabel: t("landing.planButton"),
      highlighted: true,
      badge: t("landing.mostPopular"),
      onAction: openSignup,
    },
  ];

  return (
    <div className="landing-shell">
      <LandingHeader
        scrolled={scrolled}
        navBenefitsLabel={t("landing.navBenefits")}
        navFeaturesLabel={t("landing.navFeatures")}
        navPricingLabel={t("landing.navPricing")}
        navLoginLabel={t("landing.navLogin")}
        loginLabel={t("landing.heroButton")}
        primaryCtaLabel={t("landing.heroButton")}
        selectedCountryCode={currentCountry.code}
        selectedCountryName={currentCountry.name}
        countrySelectorEnabled={LANDING_COUNTRY_SELECTOR_ENABLED}
        countryOpen={countryOpen}
        countries={COUNTRIES_LIST}
        countryRef={countryRef}
        onToggleCountry={() => setCountryOpen((open) => !open)}
        onSelectCountry={handleCountryChange}
        onScrollTo={scrollToSection}
        onLogin={openLogin}
        onSignup={openSignup}
      />

      <main className="landing-main">
        <LandingHero
          badge={t("landing.heroBadge")}
          title={t("landing.heroH1a")}
          titleAccent={t("landing.heroH1dim")}
          titleEnd={t("landing.heroH1b")}
          subtitle={t("landing.heroSubtitle")}
          primaryCta={t("landing.heroButton")}
          secondaryCta={t("landing.heroSecondary")}
          confidenceItems={[
            t("landing.heroConfidence1"),
            t("landing.heroConfidence2"),
            t("landing.heroConfidence3"),
            t("landing.heroConfidence4"),
          ]}
          onPrimaryAction={openSignup}
          onSecondaryAction={() => scrollToSection("producto")}
        />

        <LandingTrustBar items={trustItems} />

        <LandingComparison
          sectionLabel={t("landing.problemLabel")}
          title={t("landing.problemTitleNew")}
          titleAccent={t("landing.problemTitleAccentNew")}
          description={t("landing.problemDesc")}
          leftTitle={t("landing.withoutLabel")}
          rightTitle={t("landing.withLabel")}
          leftItems={comparisonProblems}
          rightItems={comparisonSolutions}
        />

        <LandingBenefits
          sectionLabel={t("landing.benefitsLabel")}
          title={t("landing.benefitsTitle")}
          titleAccent={t("landing.benefitsTitleAccent")}
          description={t("landing.benefitsDesc")}
          pillars={benefitPillars}
        />

        <LandingProductShowcase
          sectionLabel={t("landing.appLabel")}
          title={t("landing.productTitle")}
          titleAccent={t("landing.productTitleAccent")}
          description={t("landing.productDesc")}
          points={productPoints}
          featureCards={productFeatureCards}
          ctaLabel={t("landing.heroButton")}
          onPrimaryAction={openSignup}
        />

        <LandingSecurity
          sectionLabel={t("landing.securityLabel")}
          title={t("landing.securityH2a")}
          titleAccent={t("landing.securityH2b")}
          description={t("landing.securityDesc")}
          items={securityItems}
        />

        <LandingPricing
          sectionLabel={t("landing.pricingLabel")}
          title={t("landing.pricingTitleNew")}
          description={t("landing.pricingDescNew")}
          monthlyLabel={t("landing.planMonthly")}
          annualLabel={t("landing.planAnnual")}
          billingAnnual={billingAnnual}
          onToggleBilling={() => setBillingAnnual((value) => !value)}
          plans={pricingPlans}
          billedInEur={currency.code !== "EUR" ? t("landing.billedInEur") : undefined}
        />

        <LandingFinalCta
          title={t("landing.ctaH2a")}
          titleAccent={t("landing.ctaH2b")}
          description={t("landing.ctaDescNew")}
          ctaLabel={t("landing.ctaButton")}
          onAction={openSignup}
        />
      </main>

      <LandingFooter
        termsLabel={t("landing.footerTerms")}
        privacyLabel={t("landing.footerPrivacy")}
        cookiesLabel={t("landing.footerCookies")}
        supportLabel={t("landing.footerCustomerService")}
        copyLabel={t("landing.footerCopy")}
      />
    </div>
  );
};

export default Landing;
