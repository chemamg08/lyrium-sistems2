import { Check } from "lucide-react";

type Plan = {
  name: string;
  subtitle: string;
  price: string;
  unit: string;
  note: string;
  features: string[];
  ctaLabel: string;
  highlighted?: boolean;
  badge?: string;
  onAction: () => void;
};

type LandingPricingProps = {
  sectionLabel: string;
  title: string;
  description: string;
  monthlyLabel: string;
  annualLabel: string;
  billingAnnual: boolean;
  onToggleBilling: () => void;
  plans: Plan[];
  billedInEur?: string;
};

const LandingPricing = ({
  sectionLabel,
  title,
  description,
  monthlyLabel,
  annualLabel,
  billingAnnual,
  onToggleBilling,
  plans,
  billedInEur,
}: LandingPricingProps) => {
  return (
    <section id="precio" className="landing-section">
      <div className="landing-container">
        <div className="landing-section-heading">
          <span className="landing-section-chip">{sectionLabel}</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>

        <div className="landing-pricing-toggle">
          <span className={!billingAnnual ? "active" : ""}>{monthlyLabel}</span>
          <button type="button" className="landing-billing-switch" onClick={onToggleBilling} aria-pressed={billingAnnual}>
            <span className={billingAnnual ? "landing-billing-knob annual" : "landing-billing-knob"} />
          </button>
          <span className={billingAnnual ? "active" : ""}>{annualLabel}</span>
        </div>

        <div className="landing-pricing-grid">
          {plans.map((plan) => (
            <article key={plan.name} className={`landing-plan-card ${plan.highlighted ? "highlighted" : ""}`}>
              {plan.badge && <span className="landing-plan-badge">{plan.badge}</span>}
              <p className="landing-plan-name">{plan.name}</p>
              <p className="landing-plan-subtitle">{plan.subtitle}</p>
              <div className="landing-plan-price-row">
                <span className="landing-plan-price">{plan.price}</span>
                <span className="landing-plan-unit">{plan.unit}</span>
              </div>
              <p className="landing-plan-note">{plan.note}</p>
              <button
                type="button"
                className={plan.highlighted ? "landing-primary-button landing-plan-button" : "landing-secondary-button landing-plan-button"}
                onClick={plan.onAction}
              >
                {plan.ctaLabel}
              </button>

              <ul className="landing-plan-features">
                {plan.features.map((feature) => (
                  <li key={feature}>
                    <Check className="h-4 w-4" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        {billedInEur ? <p className="landing-pricing-footnote">{billedInEur}</p> : null}
      </div>
    </section>
  );
};

export default LandingPricing;
