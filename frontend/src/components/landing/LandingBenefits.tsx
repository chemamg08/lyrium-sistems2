import type { LucideIcon } from "lucide-react";

type BenefitPillar = {
  title: string;
  description: string;
  items: string[];
  icon: LucideIcon;
};

type LandingBenefitsProps = {
  sectionLabel: string;
  title: string;
  titleAccent: string;
  description: string;
  pillars: BenefitPillar[];
};

const LandingBenefits = ({
  sectionLabel,
  title,
  titleAccent,
  description,
  pillars,
}: LandingBenefitsProps) => {
  return (
    <section className="landing-section landing-section-soft landing-section-rhythm">
      <div className="landing-container">
        <div className="landing-section-heading">
          <span className="landing-section-chip">{sectionLabel}</span>
          <h2>
            {title} <span>{titleAccent}</span>
          </h2>
          <p>{description}</p>
        </div>

        <div className="landing-benefits-grid">
          {pillars.map((pillar, index) => (
            <article key={pillar.title} className={`landing-benefit-card landing-benefit-card-${index + 1}`}>
              <div className="landing-benefit-icon">
                <pillar.icon className="h-5 w-5" />
              </div>
              <h3>{pillar.title}</h3>
              <p>{pillar.description}</p>
              <ul>
                {pillar.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default LandingBenefits;
