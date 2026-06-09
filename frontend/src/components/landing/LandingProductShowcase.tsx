import { ArrowRight } from "lucide-react";
import AppDemo from "@/components/AppDemo";

type ProductFeature = {
  title: string;
  description: string;
};

type LandingProductShowcaseProps = {
  sectionLabel: string;
  title: string;
  titleAccent: string;
  description: string;
  points: string[];
  featureCards: ProductFeature[];
  ctaLabel: string;
  onPrimaryAction: () => void;
};

const LandingProductShowcase = ({
  sectionLabel,
  title,
  titleAccent,
  description,
  points,
  featureCards,
  ctaLabel,
  onPrimaryAction,
}: LandingProductShowcaseProps) => {
  return (
    <section id="producto" className="landing-section landing-product-section">
      <div className="landing-container">
        <div className="landing-product-copy">
          <span className="landing-section-chip">{sectionLabel}</span>
          <h2>
            {title} <span>{titleAccent}</span>
          </h2>
          <p>{description}</p>
          <ul className="landing-product-points">
            {points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>

        <div className="landing-product-demo">
          <div className="landing-demo-shell">
            <span className="landing-demo-badge">Demo</span>
            <div className="landing-demo-stage">
              <AppDemo />
            </div>
          </div>
        </div>

        <div className="landing-product-feature-grid">
          {featureCards.map((feature) => (
            <article key={feature.title} className="landing-product-feature-card">
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>

        <div className="landing-product-cta-row">
          <button type="button" className="landing-primary-button" onClick={onPrimaryAction}>
            {ctaLabel}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
};

export default LandingProductShowcase;
