import { Scale } from "lucide-react";

type LandingFooterProps = {
  termsLabel: string;
  privacyLabel: string;
  cookiesLabel: string;
  supportLabel: string;
  copyLabel: string;
};

const LandingFooter = ({
  termsLabel,
  privacyLabel,
  cookiesLabel,
  supportLabel,
  copyLabel,
}: LandingFooterProps) => {
  return (
    <footer className="landing-footer">
      <div className="landing-container landing-footer-inner">
        <div className="landing-footer-brand">
          <span className="landing-brand-mark">
            <Scale className="h-4 w-4" />
          </span>
          <div>
            <p>Lyrium</p>
            <span>{supportLabel} support@lyrium.io</span>
          </div>
        </div>

        <div className="landing-footer-links">
          <a href="/terminos" target="_blank" rel="noopener noreferrer">
            {termsLabel}
          </a>
          <a href="/privacidad" target="_blank" rel="noopener noreferrer">
            {privacyLabel}
          </a>
          <a href="/cookies" target="_blank" rel="noopener noreferrer">
            {cookiesLabel}
          </a>
        </div>

        <p className="landing-footer-copy">{copyLabel}</p>
      </div>
    </footer>
  );
};

export default LandingFooter;
