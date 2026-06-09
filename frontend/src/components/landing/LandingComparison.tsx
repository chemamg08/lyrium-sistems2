import type { LucideIcon } from "lucide-react";

type ComparisonItem = {
  icon: LucideIcon;
  text: string;
};

type LandingComparisonProps = {
  sectionLabel: string;
  title: string;
  titleAccent: string;
  description: string;
  leftTitle: string;
  rightTitle: string;
  leftItems: ComparisonItem[];
  rightItems: ComparisonItem[];
};

const LandingComparison = ({
  sectionLabel,
  title,
  titleAccent,
  description,
  leftTitle,
  rightTitle,
  leftItems,
  rightItems,
}: LandingComparisonProps) => {
  return (
    <section id="ventajas" className="landing-section landing-section-contrast">
      <div className="landing-container">
        <div className="landing-section-heading">
          <span className="landing-section-chip">{sectionLabel}</span>
          <h2>
            {title} <span>{titleAccent}</span>
          </h2>
          <p>{description}</p>
        </div>

        <div className="landing-comparison-grid">
          <article className="landing-comparison-card landing-comparison-muted">
            <p className="landing-card-label">{leftTitle}</p>
            <div className="landing-comparison-list">
              {leftItems.map((item) => (
                <div key={item.text} className="landing-comparison-item">
                  <item.icon className="h-4 w-4" />
                  <span>{item.text}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="landing-comparison-card landing-comparison-strong">
            <p className="landing-card-label">{rightTitle}</p>
            <div className="landing-comparison-list">
              {rightItems.map((item) => (
                <div key={item.text} className="landing-comparison-item">
                  <item.icon className="h-4 w-4" />
                  <span>{item.text}</span>
                </div>
              ))}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
};

export default LandingComparison;
