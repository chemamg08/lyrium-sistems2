import type { LucideIcon } from "lucide-react";

type SecurityItem = {
  title: string;
  description: string;
  icon: LucideIcon;
};

type LandingSecurityProps = {
  sectionLabel: string;
  title: string;
  titleAccent: string;
  description: string;
  items: SecurityItem[];
};

const LandingSecurity = ({
  sectionLabel,
  title,
  titleAccent,
  description,
  items,
}: LandingSecurityProps) => {
  return (
    <section className="landing-section landing-section-soft landing-section-security">
      <div className="landing-container">
        <div className="landing-section-heading">
          <span className="landing-section-chip">{sectionLabel}</span>
          <h2>
            {title} <span>{titleAccent}</span>
          </h2>
          <p>{description}</p>
        </div>

        <div className="landing-security-grid">
          {items.map((item) => (
            <article key={item.title} className="landing-security-card">
              <div className="landing-benefit-icon">
                <item.icon className="h-5 w-5" />
              </div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default LandingSecurity;
