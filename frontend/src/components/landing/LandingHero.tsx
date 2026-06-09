import { ArrowRight, CheckCircle2 } from "lucide-react";

type LandingHeroProps = {
  badge: string;
  title: string;
  titleAccent: string;
  titleEnd: string;
  subtitle: string;
  primaryCta: string;
  secondaryCta: string;
  confidenceItems: string[];
  onPrimaryAction: () => void;
  onSecondaryAction: () => void;
};

const LandingHero = ({
  badge,
  title,
  titleAccent,
  titleEnd,
  subtitle,
  primaryCta,
  secondaryCta,
  confidenceItems,
  onPrimaryAction,
  onSecondaryAction,
}: LandingHeroProps) => {
  return (
    <section id="hero" className="landing-hero">
      <div className="landing-container landing-hero-grid">
        <div className="landing-hero-copy">
          <span className="landing-section-chip">{badge}</span>
          <span className="landing-hero-overline">Plataforma de trabajo para despachos</span>
          <h1 className="landing-hero-title">
            {title} <span>{titleAccent}</span> {titleEnd}
          </h1>
          <p className="landing-hero-subtitle">{subtitle}</p>

          <div className="landing-hero-actions">
            <button type="button" className="landing-primary-button" onClick={onPrimaryAction}>
              {primaryCta}
              <ArrowRight className="h-4 w-4" />
            </button>
            <button type="button" className="landing-secondary-button" onClick={onSecondaryAction}>
              {secondaryCta}
            </button>
          </div>
        </div>

        <aside className="landing-hero-summary">
          <div className="landing-hero-summary-intro">
            <p className="landing-hero-summary-label">Una sola plataforma</p>
            <h2>Más orden operativo. Más claridad para trabajar mejor cada asunto.</h2>
          </div>
          {confidenceItems.map((item, index) => (
            <div key={item} className="landing-hero-summary-item">
              <span className="landing-hero-summary-index">0{index + 1}</span>
              <div className="landing-hero-summary-copy">
                <CheckCircle2 className="h-4 w-4" />
                <p>{item}</p>
              </div>
            </div>
          ))}
        </aside>
      </div>
    </section>
  );
};

export default LandingHero;
