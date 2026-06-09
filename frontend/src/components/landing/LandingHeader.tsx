import type { RefObject } from "react";
import { ChevronDown, ChevronRight, Scale } from "lucide-react";

type CountryOption = {
  code: string;
  name: string;
};

type LandingHeaderProps = {
  scrolled: boolean;
  navBenefitsLabel: string;
  navFeaturesLabel: string;
  navPricingLabel: string;
  navLoginLabel: string;
  loginLabel: string;
  primaryCtaLabel: string;
  selectedCountryCode: string;
  selectedCountryName: string;
  countryOpen: boolean;
  countries: CountryOption[];
  countryRef: RefObject<HTMLDivElement>;
  onToggleCountry: () => void;
  onSelectCountry: (code: string) => void;
  onScrollTo: (id: string) => void;
  onLogin: () => void;
  onSignup: () => void;
};

const LandingHeader = ({
  scrolled,
  navBenefitsLabel,
  navFeaturesLabel,
  navPricingLabel,
  navLoginLabel,
  loginLabel,
  primaryCtaLabel,
  selectedCountryCode,
  selectedCountryName,
  countryOpen,
  countries,
  countryRef,
  onToggleCountry,
  onSelectCountry,
  onScrollTo,
  onLogin,
  onSignup,
}: LandingHeaderProps) => {
  return (
    <header className={`landing-header ${scrolled ? "landing-header-scrolled" : ""}`}>
      <div className="landing-container landing-header-inner">
        <button type="button" className="landing-brand" onClick={() => onScrollTo("hero")}>
          <span className="landing-brand-mark">
            <Scale className="h-4 w-4" />
          </span>
          <span className="landing-brand-copy">
            <span className="landing-brand-name">Lyrium</span>
            <span className="landing-brand-tag">Software jurídico con IA</span>
          </span>
        </button>

        <nav className="landing-nav-links" aria-label="Navegación principal">
          <button type="button" onClick={() => onScrollTo("ventajas")}>
            {navBenefitsLabel}
          </button>
          <button type="button" onClick={() => onScrollTo("producto")}>
            {navFeaturesLabel}
          </button>
          <button type="button" onClick={() => onScrollTo("precio")}>
            {navPricingLabel}
          </button>
        </nav>

        <div className="landing-header-actions">
          <div className="landing-country" ref={countryRef}>
            <button
              type="button"
              className="landing-country-trigger"
              onClick={onToggleCountry}
              aria-expanded={countryOpen}
            >
              <span>{selectedCountryCode}</span>
              <span className="landing-country-name">{selectedCountryName}</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${countryOpen ? "rotate-180" : ""}`} />
            </button>

            {countryOpen && (
              <div className="landing-country-menu">
                {countries.map((country) => (
                  <button
                    key={country.code}
                    type="button"
                    className={`landing-country-option ${country.code === selectedCountryCode ? "active" : ""}`}
                    onClick={() => onSelectCountry(country.code)}
                  >
                    <span>{country.code}</span>
                    <span>{country.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button type="button" className="landing-login-link" onClick={onLogin}>
            {navLoginLabel}
            <ChevronRight className="h-3.5 w-3.5" />
          </button>

          <button type="button" className="landing-primary-button landing-header-cta" onClick={onSignup}>
            {primaryCtaLabel || loginLabel}
          </button>
        </div>
      </div>
    </header>
  );
};

export default LandingHeader;
