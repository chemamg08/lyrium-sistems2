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

          <div className="landing-confidence-list">
            {confidenceItems.map((item) => (
              <div key={item} className="landing-confidence-item">
                <CheckCircle2 className="h-4 w-4" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="landing-hero-panel">
          <div className="landing-hero-panel-card landing-hero-panel-main">
            <p className="landing-panel-eyebrow">Vision general del despacho</p>
            <h2>Un espacio de trabajo juridico claro, ordenado y listo para producir.</h2>
            <p>
              Controla expedientes, clientes, documentos y trabajo asistido por IA desde una sola
              plataforma.
            </p>
          </div>

          <div className="landing-hero-panel-grid">
            <div className="landing-hero-panel-card">
              <span className="landing-panel-metric">12h</span>
              <p>menos trabajo manual cada semana</p>
            </div>
            <div className="landing-hero-panel-card">
              <span className="landing-panel-metric">1 panel</span>
              <p>para clientes, expedientes, contratos y automatizaciones</p>
            </div>
            <div className="landing-hero-panel-card">
              <span className="landing-panel-metric">IA</span>
              <p>aplicada a tareas juridicas y documentales de uso diario</p>
            </div>
            <div className="landing-hero-panel-card">
              <span className="landing-panel-metric">Control</span>
              <p>sobre informacion sensible, plazos y trabajo de equipo</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default LandingHero;
