import { ArrowRight } from "lucide-react";

type LandingFinalCtaProps = {
  title: string;
  titleAccent: string;
  description: string;
  ctaLabel: string;
  onAction: () => void;
};

const LandingFinalCta = ({
  title,
  titleAccent,
  description,
  ctaLabel,
  onAction,
}: LandingFinalCtaProps) => {
  return (
    <section className="landing-final-cta">
      <div className="landing-container landing-final-cta-card">
        <h2>
          {title} <span>{titleAccent}</span>
        </h2>
        <p>{description}</p>
        <button type="button" className="landing-primary-button" onClick={onAction}>
          {ctaLabel}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
};

export default LandingFinalCta;
