type LandingTrustBarProps = {
  items: string[];
};

const LandingTrustBar = ({ items }: LandingTrustBarProps) => {
  return (
    <section className="landing-trust-bar">
      <div className="landing-container landing-trust-grid">
        {items.map((item) => (
          <div key={item} className="landing-trust-item">
            {item}
          </div>
        ))}
      </div>
    </section>
  );
};

export default LandingTrustBar;
