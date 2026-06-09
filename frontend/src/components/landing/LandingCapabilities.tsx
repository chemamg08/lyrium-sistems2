type Capability = {
  title: string;
  description: string;
  bullets: string[];
};

type LandingCapabilitiesProps = {
  sectionLabel: string;
  title: string;
  titleAccent: string;
  description: string;
  capabilities: Capability[];
};

const LandingCapabilities = ({
  sectionLabel,
  title,
  titleAccent,
  description,
  capabilities,
}: LandingCapabilitiesProps) => {
  return (
    <section className="landing-section landing-section-soft">
      <div className="landing-container">
        <div className="landing-section-heading">
          <span className="landing-section-chip">{sectionLabel}</span>
          <h2>
            {title} <span>{titleAccent}</span>
          </h2>
          <p>{description}</p>
        </div>

        <div className="landing-capabilities-grid">
          {capabilities.map((capability, index) => (
            <article
              key={capability.title}
              className={`landing-capability-card ${index === capabilities.length - 1 ? "landing-capability-card-centered" : ""}`}
            >
              <h3>{capability.title}</h3>
              <p>{capability.description}</p>
              <ul>
                {capability.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default LandingCapabilities;
