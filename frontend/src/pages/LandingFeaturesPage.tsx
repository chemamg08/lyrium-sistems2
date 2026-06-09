import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Scale } from "lucide-react";
import LandingFooter from "@/components/landing/LandingFooter";
import "./landing-theme.css";

const LandingFeaturesPage = () => {
  const { t } = useTranslation();
  const location = useLocation();

  useEffect(() => {
    if (!location.hash) {
      window.scrollTo(0, 0);
      return;
    }

    const id = location.hash.replace("#", "");
    const element = document.getElementById(id);

    if (element) {
      requestAnimationFrame(() => {
        element.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [location.hash]);

  const sections = [
    {
      id: "clientes-expedientes",
      label: t("landing.featurePage.section1Label", { defaultValue: "Clientes y expedientes" }),
      title: t("landing.capability1Title", { defaultValue: "Clientes y expedientes" }),
      description: t("landing.featurePage.section1Desc", {
        defaultValue:
          "Toda la información del cliente queda reunida en un mismo espacio para trabajar cada asunto con contexto, trazabilidad y acceso rápido a la documentación relevante.",
      }),
      bullets: [
        t("landing.featurePage.section1Bullet1", {
          defaultValue: "Fichas completas de cliente con datos, documentación, notas y seguimiento del asunto.",
        }),
        t("landing.featurePage.section1Bullet2", {
          defaultValue: "Expedientes organizados por estado, responsable y actividad reciente para saber qué está ocurriendo en cada caso.",
        }),
        t("landing.featurePage.section1Bullet3", {
          defaultValue: "Consultas a la IA con el contexto del cliente y su documentación, sin cambiar de herramienta.",
        }),
        t("landing.featurePage.section1Bullet4", {
          defaultValue: "Mejor coordinación entre titular y equipo cuando el despacho trabaja con subcuentas.",
        }),
      ],
    },
    {
      id: "contratos-escritos",
      label: t("landing.featurePage.section2Label", { defaultValue: "Contratos y escritos" }),
      title: t("landing.capability2Title", { defaultValue: "Contratos y escritos" }),
      description: t("landing.featurePage.section2Desc", {
        defaultValue:
          "Lyrium permite trabajar sobre bases propias del despacho para acelerar la redacción sin renunciar al criterio jurídico ni al estilo documental de la firma.",
      }),
      bullets: [
        t("landing.featurePage.section2Bullet1", {
          defaultValue: "Subida y gestión de contratos base para reutilizarlos como referencia real del despacho.",
        }),
        t("landing.featurePage.section2Bullet2", {
          defaultValue: "Generación de borradores adaptados al caso con apoyo de IA y posibilidad de seguir afinándolos.",
        }),
        t("landing.featurePage.section2Bullet3", {
          defaultValue: "Reducción del tiempo de arranque en contratos, escritos y documentos repetitivos.",
        }),
        t("landing.featurePage.section2Bullet4", {
          defaultValue: "Incorporación de identidad visual y trabajo más homogéneo en la documentación emitida.",
        }),
      ],
    },
    {
      id: "documentos-analisis",
      label: t("landing.featurePage.section3Label", { defaultValue: "Documentos y análisis" }),
      title: t("landing.capability3Title", { defaultValue: "Resúmenes y análisis documental" }),
      description: t("landing.featurePage.section3Desc", {
        defaultValue:
          "Los documentos largos dejan de ser un cuello de botella: Lyrium ayuda a localizar lo importante, resumir contenido extenso y seguir trabajando sobre él con más agilidad.",
      }),
      bullets: [
        t("landing.featurePage.section3Bullet1", {
          defaultValue: "Resúmenes automáticos de documentos extensos para entender rápido el contenido clave.",
        }),
        t("landing.featurePage.section3Bullet2", {
          defaultValue: "Preguntas y respuestas sobre el archivo cargado sin perder el hilo del análisis.",
        }),
        t("landing.featurePage.section3Bullet3", {
          defaultValue: "Chats de trabajo asociados al documento para seguir profundizando cuando hace falta.",
        }),
        t("landing.featurePage.section3Bullet4", {
          defaultValue: "Menos tiempo leyendo de forma lineal y más tiempo interpretando lo realmente relevante.",
        }),
      ],
    },
    {
      id: "preparacion-defensa",
      label: t("landing.featurePage.section4Label", { defaultValue: "Preparación de defensa" }),
      title: t("landing.capability4Title", { defaultValue: "Preparación de defensa" }),
      description: t("landing.featurePage.section4Desc", {
        defaultValue:
          "La preparación de defensa va más allá de generar ideas sueltas: la herramienta ayuda a estructurar la estrategia, revisar puntos débiles y anticipar la respuesta de la otra parte.",
      }),
      bullets: [
        t("landing.featurePage.section4Bullet1", {
          defaultValue: "Estructuración de líneas de defensa, argumentos jurídicos y recomendaciones para cada asunto.",
        }),
        t("landing.featurePage.section4Bullet2", {
          defaultValue: "Detección de puntos débiles, lagunas probatorias o contradicciones que conviene reforzar.",
        }),
        t("landing.featurePage.section4Bullet3", {
          defaultValue: "Simulación de contrarréplicas y objeciones para llegar mejor preparado al juicio o a la negociación.",
        }),
        t("landing.featurePage.section4Bullet4", {
          defaultValue: "Exportación y vinculación de la estrategia con clientes o expedientes cuando se necesita integrarla en el flujo del despacho.",
        }),
      ],
    },
    {
      id: "automatizaciones-seguimiento",
      label: t("landing.featurePage.section5Label", { defaultValue: "Automatizaciones y seguimiento" }),
      title: t("landing.capability5Title", { defaultValue: "Automatizaciones y comunicaciones" }),
      description: t("landing.featurePage.section5Desc", {
        defaultValue:
          "Lyrium centraliza canales, reduce tareas repetitivas y ordena el seguimiento para que el despacho responda con más rapidez y menos fricción interna.",
      }),
      bullets: [
        t("landing.featurePage.section5Bullet1", {
          defaultValue: "Gestión de email y WhatsApp desde un flujo unificado para no dispersar conversaciones.",
        }),
        t("landing.featurePage.section5Bullet2", {
          defaultValue: "Clasificación, organización y seguimiento de consultas para no perder contexto entre canales.",
        }),
        t("landing.featurePage.section5Bullet3", {
          defaultValue: "Apoyo a la coordinación de tareas, responsables y respuestas pendientes dentro del despacho.",
        }),
        t("landing.featurePage.section5Bullet4", {
          defaultValue: "Integración con calendario y base preparada para automatizaciones más avanzadas.",
        }),
      ],
    },
  ];

  return (
    <div className="landing-shell">
      <header className="landing-header landing-header-scrolled">
        <div className="landing-container landing-detail-header">
          <a href="/landing" className="landing-brand">
            <span className="landing-brand-mark">
              <Scale className="h-4 w-4" />
            </span>
            <span className="landing-brand-copy">
              <span className="landing-brand-name">Lyrium</span>
              <span className="landing-brand-tag">Software jurídico con IA</span>
            </span>
          </a>

          <div className="landing-detail-header-actions">
            <a href="/landing" className="landing-secondary-button landing-detail-back">
              <ArrowLeft className="h-4 w-4" />
              {t("landing.featurePage.backToLanding", { defaultValue: "Volver a la landing" })}
            </a>
            <a href="/signup" className="landing-primary-button">
              {t("landing.heroButton", { defaultValue: "Empezar ahora" })}
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </header>

      <main className="landing-main landing-detail-main">
        <section className="landing-section landing-detail-hero">
          <div className="landing-container">
            <div className="landing-section-heading landing-detail-heading">
              <span className="landing-section-chip">
                {t("landing.featurePage.label", { defaultValue: "Funciones en detalle" })}
              </span>
              <h1 className="landing-detail-title">
                {t("landing.capabilitiesTitle", { defaultValue: "Qué puede hacer" })}{" "}
                <span>{t("landing.capabilitiesTitleAccent", { defaultValue: "exactamente Lyrium" })}</span>
              </h1>
              <p>
                {t("landing.featurePage.heroDesc", {
                  defaultValue:
                    "Una visión más concreta de las funciones que más impacto tienen en el trabajo diario del despacho, con el mismo criterio de claridad y control que define la plataforma.",
                })}
              </p>
            </div>

            <div className="landing-detail-nav">
              {sections.map((section) => (
                <a key={section.id} href={`#${section.id}`} className="landing-detail-nav-link">
                  {section.label}
                </a>
              ))}
            </div>
          </div>
        </section>

        {sections.map((section, index) => (
          <section
            key={section.id}
            id={section.id}
            className={`landing-section landing-detail-anchor ${index % 2 === 1 ? "landing-section-soft" : ""}`}
          >
            <div className="landing-container landing-detail-grid">
              <div className="landing-detail-side">
                <span className="landing-detail-kicker">{`0${index + 1}`}</span>
                <h2>{section.title}</h2>
                <p>{section.description}</p>
              </div>

              <article className="landing-detail-card">
                <ul className="landing-detail-list">
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </article>
            </div>
          </section>
        ))}
      </main>

      <LandingFooter
        termsLabel={t("landing.footerTerms", { defaultValue: "Términos y Condiciones" })}
        privacyLabel={t("landing.footerPrivacy", { defaultValue: "Política de Privacidad" })}
        cookiesLabel={t("landing.footerCookies", { defaultValue: "Política de Cookies" })}
        supportLabel={t("landing.footerCustomerService", { defaultValue: "Atención al cliente:" })}
        copyLabel={t("landing.footerCopy", { defaultValue: "© 2026 Lyrium. Todos los derechos reservados." })}
      />
    </div>
  );
};

export default LandingFeaturesPage;
