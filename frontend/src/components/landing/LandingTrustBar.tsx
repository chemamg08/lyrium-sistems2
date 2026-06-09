type LandingTrustBarProps = {
  items: string[];
};

const LandingTrustBar = ({ items }: LandingTrustBarProps) => {
  return (
    <section className="landing-trust-bar">
      <div className="landing-container landing-trust-grid">
        {items.map((item, index) => (
          <div key={item} className="landing-trust-item">
            <span className="landing-trust-index">0{index + 1}</span>
            {item}
          </div>
        ))}
      </div>
    </section>
  );
};

export default LandingTrustBar;
