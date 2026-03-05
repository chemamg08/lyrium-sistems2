import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { Scale, ArrowLeft } from "lucide-react";

const termsContentES = `
1. INFORMACIÓN GENERAL

El presente sitio web y la plataforma SaaS "Lyrium" (en adelante, "la Plataforma") son propiedad de Lyrium Systems S.L., con domicilio social en España (en adelante, "Lyrium", "nosotros" o "la Empresa").

El acceso y uso de la Plataforma implica la aceptación plena y sin reservas de todos los términos y condiciones aquí recogidos.

2. OBJETO DEL SERVICIO

Lyrium proporciona una plataforma de software como servicio (SaaS) dirigida a despachos de abogados y profesionales del sector legal. La Plataforma incluye módulos de gestión de contratos, clientes, preparación de defensas, resúmenes de documentos, automatizaciones de comunicaciones y asesoría fiscal, todo ello asistido por inteligencia artificial.

3. REGISTRO Y CUENTAS DE USUARIO

3.1. Para acceder a la Plataforma es necesario crear una cuenta proporcionando información veraz y actualizada.
3.2. El usuario es responsable de mantener la confidencialidad de sus credenciales de acceso.
3.3. Cada cuenta principal puede crear subcuentas para miembros de su equipo, asumiendo responsabilidad sobre las mismas.
3.4. Lyrium se reserva el derecho de suspender o cancelar cuentas que incumplan estos términos.

4. PLANES Y FACTURACIÓN

4.1. Lyrium ofrece un período de prueba gratuito de 14 días con acceso completo a todas las funcionalidades.
4.2. Al finalizar el período de prueba, el usuario deberá suscribirse a uno de los planes disponibles (Starter o Avanzado) para continuar usando el servicio.
4.3. Los precios se muestran en euros (EUR) e incluyen los impuestos aplicables según la normativa vigente.
4.4. La facturación se realiza de forma anticipada, mensual o anualmente según el plan elegido.
4.5. Los cambios de plan se aplicarán al inicio del siguiente ciclo de facturación.

5. PROPIEDAD INTELECTUAL

5.1. Todos los derechos de propiedad intelectual sobre la Plataforma, incluyendo software, diseño, textos, gráficos y marcas, pertenecen a Lyrium Systems S.L.
5.2. Los contenidos generados por la IA son herramientas de apoyo profesional y no sustituyen el criterio del usuario.
5.3. Los documentos, contratos y datos del usuario son propiedad exclusiva del mismo. Lyrium no adquiere ningún derecho sobre ellos.

6. USO ACEPTABLE

6.1. El usuario se compromete a utilizar la Plataforma exclusivamente para fines profesionales legítimos.
6.2. Queda prohibido: (a) usar la Plataforma para actividades ilegales; (b) intentar acceder a datos de otros usuarios; (c) realizar ingeniería inversa del software; (d) compartir credenciales con terceros no autorizados.

7. INTELIGENCIA ARTIFICIAL — DESCARGO DE RESPONSABILIDAD

7.1. Las respuestas generadas por la IA son orientativas y no constituyen asesoramiento legal vinculante.
7.2. El usuario, como profesional del derecho, es el único responsable de verificar, validar y adaptar cualquier contenido generado por la IA antes de su uso profesional.
7.3. Lyrium no garantiza la exactitud, completitud o actualización de las respuestas de la IA.

8. LIMITACIÓN DE RESPONSABILIDAD

8.1. Lyrium no será responsable de daños indirectos, incidentales o consecuentes derivados del uso de la Plataforma.
8.2. La responsabilidad total de Lyrium en cualquier caso estará limitada al importe abonado por el usuario en los últimos 12 meses.
8.3. Lyrium no garantiza la disponibilidad ininterrumpida del servicio, aunque se compromete a mantener un nivel de disponibilidad del 99.5%.

9. MODIFICACIONES

9.1. Lyrium se reserva el derecho de modificar estos términos en cualquier momento. Los cambios serán notificados con al menos 30 días de antelación.
9.2. El uso continuado de la Plataforma tras la notificación implica la aceptación de los nuevos términos.

10. RESOLUCIÓN

10.1. El usuario puede cancelar su suscripción en cualquier momento desde su perfil.
10.2. Lyrium se reserva el derecho de resolver el contrato ante incumplimientos graves de estos términos.
10.3. Tras la cancelación, los datos del usuario se mantendrán durante 30 días naturales, periodo tras el cual serán eliminados definitivamente.

11. LEGISLACIÓN APLICABLE Y JURISDICCIÓN

Estos términos se rigen por la legislación española. Para la resolución de cualquier controversia, las partes se someten a los Juzgados y Tribunales de la ciudad del domicilio social de Lyrium Systems S.L.
`;

const termsContentEN = `
1. GENERAL INFORMATION

This website and the SaaS platform "Lyrium" (hereinafter, "the Platform") are owned by Lyrium Systems S.L., with registered office in Spain (hereinafter, "Lyrium", "we" or "the Company").

Access to and use of the Platform implies full and unreserved acceptance of all terms and conditions set forth herein.

2. PURPOSE OF THE SERVICE

Lyrium provides a software-as-a-service (SaaS) platform aimed at law firms and legal professionals. The Platform includes modules for contract management, client management, defense preparation, document summaries, communication automations and fiscal advisory, all assisted by artificial intelligence.

3. REGISTRATION AND USER ACCOUNTS

3.1. To access the Platform, it is necessary to create an account by providing truthful and up-to-date information.
3.2. The user is responsible for maintaining the confidentiality of their access credentials.
3.3. Each main account may create sub-accounts for team members, assuming responsibility for them.
3.4. Lyrium reserves the right to suspend or cancel accounts that violate these terms.

4. PLANS AND BILLING

4.1. Lyrium offers a 14-day free trial period with full access to all features.
4.2. Upon expiration of the trial period, the user must subscribe to one of the available plans (Starter or Advanced) to continue using the service.
4.3. Prices are displayed in euros (EUR) and include applicable taxes under current regulations.
4.4. Billing is done in advance, monthly or annually depending on the chosen plan.
4.5. Plan changes will take effect at the beginning of the next billing cycle.

5. INTELLECTUAL PROPERTY

5.1. All intellectual property rights over the Platform, including software, design, texts, graphics and trademarks, belong to Lyrium Systems S.L.
5.2. AI-generated content is a professional support tool and does not replace the user's judgment.
5.3. The user's documents, contracts and data are the exclusive property of the user. Lyrium does not acquire any rights over them.

6. ACCEPTABLE USE

6.1. The user agrees to use the Platform exclusively for legitimate professional purposes.
6.2. The following is prohibited: (a) using the Platform for illegal activities; (b) attempting to access other users' data; (c) reverse engineering the software; (d) sharing credentials with unauthorized third parties.

7. ARTIFICIAL INTELLIGENCE — DISCLAIMER

7.1. AI-generated responses are for guidance only and do not constitute binding legal advice.
7.2. The user, as a legal professional, is solely responsible for verifying, validating and adapting any AI-generated content before professional use.
7.3. Lyrium does not guarantee the accuracy, completeness or currency of AI responses.

8. LIMITATION OF LIABILITY

8.1. Lyrium shall not be liable for indirect, incidental or consequential damages arising from use of the Platform.
8.2. Lyrium's total liability in any case shall be limited to the amount paid by the user in the last 12 months.
8.3. Lyrium does not guarantee uninterrupted service availability, although it commits to maintaining 99.5% availability.

9. MODIFICATIONS

9.1. Lyrium reserves the right to modify these terms at any time. Changes will be notified at least 30 days in advance.
9.2. Continued use of the Platform after notification implies acceptance of the new terms.

10. TERMINATION

10.1. The user may cancel their subscription at any time from their profile.
10.2. Lyrium reserves the right to terminate the contract for serious breaches of these terms.
10.3. After cancellation, user data will be retained for 30 calendar days, after which it will be permanently deleted.

11. APPLICABLE LAW AND JURISDICTION

These terms are governed by Spanish law. For the resolution of any dispute, the parties submit to the Courts and Tribunals of the city of the registered office of Lyrium Systems S.L.
`;

const privacyContentES = `
1. RESPONSABLE DEL TRATAMIENTO

Lyrium Systems S.L. (en adelante, "Lyrium") es el responsable del tratamiento de los datos personales recogidos a través de la plataforma.

Correo de contacto para cuestiones de privacidad: privacidad@lyrium.es

2. DATOS QUE RECOPILAMOS

2.1. Datos de registro: nombre, dirección de correo electrónico, nombre del despacho, número de colegiado (opcional).
2.2. Datos de uso: registros de actividad dentro de la plataforma, módulos utilizados, frecuencia de uso.
2.3. Datos de facturación: información de pago procesada de forma segura a través de Stripe. Lyrium NO almacena datos de tarjetas de crédito.
2.4. Datos profesionales: documentos, contratos e información de clientes que el usuario introduce voluntariamente en la plataforma.
2.5. Datos técnicos: dirección IP, tipo de navegador, sistema operativo, datos de cookies.

3. FINALIDAD DEL TRATAMIENTO

Utilizamos los datos personales para:
a) Proporcionar y mantener el servicio de la Plataforma.
b) Gestionar la cuenta del usuario y la facturación.
c) Mejorar y personalizar la experiencia del usuario.
d) Comunicar actualizaciones del servicio y cambios relevantes.
e) Cumplir con obligaciones legales y fiscales.
f) Entrenar y mejorar los modelos de IA (solo con datos anonimizados y agregados, nunca con datos personales identificables).

4. BASE LEGAL DEL TRATAMIENTO

- Ejecución del contrato (art. 6.1.b RGPD): para la prestación del servicio contratado.
- Interés legítimo (art. 6.1.f RGPD): para mejoras del servicio y seguridad.
- Consentimiento (art. 6.1.a RGPD): para comunicaciones comerciales opcionales.
- Obligación legal (art. 6.1.c RGPD): para el cumplimiento de normativa fiscal y mercantil.

5. DESTINATARIOS DE LOS DATOS

Los datos pueden ser comunicados a:
- Stripe Inc.: procesamiento de pagos (cumple con el Privacy Shield y RGPD).
- Proveedores de infraestructura cloud: alojamiento de servidores en la Unión Europea.
- Proveedores de IA: las consultas enviadas a modelos de IA se procesan sin datos personales identificables del cliente final.
- Autoridades competentes: cuando exista obligación legal.

No vendemos ni compartimos datos personales con terceros con fines comerciales.

6. TRANSFERENCIAS INTERNACIONALES

En caso de transferencias de datos fuera del Espacio Económico Europeo, se garantizan las salvaguardas adecuadas conforme al artículo 46 del RGPD, incluyendo Cláusulas Contractuales Tipo aprobadas por la Comisión Europea.

7. CONSERVACIÓN DE LOS DATOS

- Datos de cuenta activa: durante la vigencia de la relación contractual.
- Datos tras cancelación: 30 días naturales para permitir la recuperación, tras los cuales se eliminan definitivamente.
- Datos de facturación: 5 años conforme a la normativa fiscal española.
- Logs de seguridad: 12 meses.

8. DERECHOS DEL USUARIO

Conforme al RGPD, el usuario tiene derecho a:
a) Acceso: obtener confirmación y copia de sus datos personales.
b) Rectificación: solicitar la corrección de datos inexactos.
c) Supresión: solicitar la eliminación de sus datos ("derecho al olvido").
d) Limitación: solicitar que se restrinja el tratamiento en determinadas circunstancias.
e) Portabilidad: recibir sus datos en un formato estructurado y de uso común.
f) Oposición: oponerse al tratamiento basado en interés legítimo.

Para ejercer estos derechos, el usuario puede contactar a: privacidad@lyrium.es

El usuario tiene también derecho a presentar una reclamación ante la Agencia Española de Protección de Datos (www.aepd.es).

9. SEGURIDAD

Implementamos las siguientes medidas de seguridad:
- Cifrado SSL/TLS en todas las comunicaciones.
- Cifrado AES-256 para datos en reposo.
- Controles de acceso basados en roles.
- Auditorías de seguridad periódicas.
- Copias de seguridad cifradas diarias.

10. MODIFICACIONES

Nos reservamos el derecho de actualizar esta política de privacidad. Los cambios significativos serán notificados por correo electrónico o mediante un aviso visible en la Plataforma.
`;

const privacyContentEN = `
1. DATA CONTROLLER

Lyrium Systems S.L. (hereinafter, "Lyrium") is the data controller for personal data collected through the platform.

Contact email for privacy matters: privacy@lyrium.es

2. DATA WE COLLECT

2.1. Registration data: name, email address, firm name, bar association number (optional).
2.2. Usage data: activity logs within the platform, modules used, usage frequency.
2.3. Billing data: payment information processed securely through Stripe. Lyrium does NOT store credit card data.
2.4. Professional data: documents, contracts and client information that the user voluntarily enters into the platform.
2.5. Technical data: IP address, browser type, operating system, cookie data.

3. PURPOSE OF PROCESSING

We use personal data to:
a) Provide and maintain the Platform service.
b) Manage user accounts and billing.
c) Improve and personalise the user experience.
d) Communicate service updates and relevant changes.
e) Comply with legal and tax obligations.
f) Train and improve AI models (using only anonymised and aggregated data, never personally identifiable information).

4. LEGAL BASIS FOR PROCESSING

- Contract performance (Art. 6.1.b GDPR): for providing the contracted service.
- Legitimate interest (Art. 6.1.f GDPR): for service improvements and security.
- Consent (Art. 6.1.a GDPR): for optional commercial communications.
- Legal obligation (Art. 6.1.c GDPR): for compliance with tax and commercial regulations.

5. DATA RECIPIENTS

Data may be shared with:
- Stripe Inc.: payment processing (compliant with Privacy Shield and GDPR).
- Cloud infrastructure providers: server hosting within the European Union.
- AI providers: queries sent to AI models are processed without personally identifiable end-client data.
- Competent authorities: when there is a legal obligation.

We do not sell or share personal data with third parties for commercial purposes.

6. INTERNATIONAL TRANSFERS

In the event of data transfers outside the European Economic Area, appropriate safeguards are ensured in accordance with Article 46 of the GDPR, including Standard Contractual Clauses approved by the European Commission.

7. DATA RETENTION

- Active account data: for the duration of the contractual relationship.
- Data after cancellation: 30 calendar days to allow recovery, after which they are permanently deleted.
- Billing data: 5 years in accordance with Spanish tax regulations.
- Security logs: 12 months.

8. USER RIGHTS

Under the GDPR, the user has the right to:
a) Access: obtain confirmation and a copy of their personal data.
b) Rectification: request the correction of inaccurate data.
c) Erasure: request the deletion of their data ("right to be forgotten").
d) Restriction: request that processing be restricted in certain circumstances.
e) Portability: receive their data in a structured, commonly used format.
f) Objection: object to processing based on legitimate interest.

To exercise these rights, the user may contact: privacy@lyrium.es

The user also has the right to lodge a complaint with the Spanish Data Protection Agency (www.aepd.es).

9. SECURITY

We implement the following security measures:
- SSL/TLS encryption on all communications.
- AES-256 encryption for data at rest.
- Role-based access controls.
- Regular security audits.
- Daily encrypted backups.

10. MODIFICATIONS

We reserve the right to update this privacy policy. Significant changes will be notified by email or through a visible notice on the Platform.
`;

const cookiesContentES = `
1. ¿QUÉ SON LAS COOKIES?

Las cookies son pequeños archivos de texto que se almacenan en el dispositivo del usuario al visitar un sitio web. Permiten que el sitio recuerde información sobre la visita, como preferencias de idioma y otros ajustes.

2. ¿QUÉ COOKIES UTILIZAMOS?

2.1. Cookies estrictamente necesarias
Estas cookies son esenciales para el funcionamiento de la Plataforma. Sin ellas, servicios como la autenticación y la seguridad no podrían funcionar.
- Cookie de sesión: mantiene la sesión del usuario activa.
- Cookie de seguridad CSRF: protege contra ataques de falsificación de solicitudes.
- Cookie de preferencias de cookies: almacena su elección sobre el uso de cookies.

2.2. Cookies funcionales
Permiten recordar las preferencias del usuario para ofrecer una experiencia personalizada.
- Preferencia de idioma: recuerda el idioma seleccionado.
- Preferencia de tema: recuerda si el usuario prefiere modo claro u oscuro.

2.3. Cookies analíticas
Nos ayudan a entender cómo los usuarios interactúan con la Plataforma, permitiéndonos mejorar su funcionamiento.
- Datos de uso anonimizados: páginas visitadas, tiempo de permanencia, flujos de navegación.

3. BASE LEGAL

El uso de cookies estrictamente necesarias se basa en nuestro interés legítimo en proporcionar un servicio funcional y seguro (art. 6.1.f RGPD).

Para las cookies funcionales y analíticas, solicitamos el consentimiento del usuario (art. 6.1.a RGPD), conforme a la Ley 34/2002 de Servicios de la Sociedad de la Información y Comercio Electrónico (LSSI-CE).

4. GESTIÓN DE COOKIES

El usuario puede gestionar sus preferencias de cookies:
a) A través del banner de cookies que aparece al visitar la Plataforma por primera vez.
b) A través de la configuración del navegador, desactivando o eliminando cookies.

Nota: desactivar cookies estrictamente necesarias puede afectar al funcionamiento de la Plataforma.

5. COOKIES DE TERCEROS

- Stripe: utiliza cookies necesarias para procesar pagos de forma segura. Consulte la política de cookies de Stripe en https://stripe.com/cookies-policy.

6. PERÍODO DE CONSERVACIÓN

- Cookies de sesión: se eliminan al cerrar el navegador.
- Cookies persistentes: se conservan entre 30 días y 12 meses según su finalidad.
- Cookies analíticas: máximo 12 meses.

7. ACTUALIZACIONES

Esta política de cookies puede actualizarse periódicamente. Los cambios serán reflejados en esta página con la fecha de la última actualización.

8. CONTACTO

Para cualquier consulta relacionada con el uso de cookies, puede contactar con nosotros en: privacidad@lyrium.es
`;

const cookiesContentEN = `
1. WHAT ARE COOKIES?

Cookies are small text files stored on the user's device when visiting a website. They allow the site to remember information about the visit, such as language preferences and other settings.

2. WHAT COOKIES DO WE USE?

2.1. Strictly necessary cookies
These cookies are essential for the Platform to function. Without them, services such as authentication and security would not work.
- Session cookie: keeps the user session active.
- CSRF security cookie: protects against cross-site request forgery attacks.
- Cookie preferences cookie: stores your choice regarding cookie usage.

2.2. Functional cookies
Allow remembering user preferences to offer a personalised experience.
- Language preference: remembers the selected language.
- Theme preference: remembers whether the user prefers light or dark mode.

2.3. Analytical cookies
Help us understand how users interact with the Platform, allowing us to improve its performance.
- Anonymised usage data: pages visited, time spent, navigation flows.

3. LEGAL BASIS

The use of strictly necessary cookies is based on our legitimate interest in providing a functional and secure service (Art. 6.1.f GDPR).

For functional and analytical cookies, we request user consent (Art. 6.1.a GDPR), in accordance with the Spanish Law 34/2002 on Information Society Services and Electronic Commerce (LSSI-CE).

4. COOKIE MANAGEMENT

The user can manage their cookie preferences:
a) Through the cookie banner that appears when visiting the Platform for the first time.
b) Through browser settings, by disabling or deleting cookies.

Note: disabling strictly necessary cookies may affect the functioning of the Platform.

5. THIRD-PARTY COOKIES

- Stripe: uses necessary cookies to process payments securely. See Stripe's cookie policy at https://stripe.com/cookies-policy.

6. RETENTION PERIOD

- Session cookies: deleted when the browser is closed.
- Persistent cookies: retained between 30 days and 12 months depending on their purpose.
- Analytical cookies: maximum 12 months.

7. UPDATES

This cookie policy may be updated periodically. Changes will be reflected on this page with the date of the last update.

8. CONTACT

For any queries related to the use of cookies, you may contact us at: privacy@lyrium.es
`;

const contentMap: Record<string, { es: string; en: string }> = {
  "/terminos": { es: termsContentES, en: termsContentEN },
  "/privacidad": { es: privacyContentES, en: privacyContentEN },
  "/cookies": { es: cookiesContentES, en: cookiesContentEN },
};

const titleKeyMap: Record<string, string> = {
  "/terminos": "legal.termsTitle",
  "/privacidad": "legal.privacyTitle",
  "/cookies": "legal.cookiesTitle",
};

const LegalPage = () => {
  const { t, i18n } = useTranslation();
  const { pathname } = useLocation();

  const lang = i18n.language?.startsWith("es") ? "es" : "en";
  const content = contentMap[pathname]?.[lang] ?? contentMap["/terminos"][lang];
  const titleKey = titleKeyMap[pathname] ?? "legal.termsTitle";

  return (
    <div className="min-h-screen bg-[#080808] text-white">
      {/* Header */}
      <header className="border-b border-white/5 px-4 md:px-8 py-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-white/40" />
            <span className="text-base font-semibold text-white/80">Lyrium</span>
          </div>
          <a
            href="/landing"
            className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("legal.backToHome")}
          </a>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 md:px-8 py-16">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
          {t(titleKey)}
        </h1>
        <p className="text-sm text-white/30 mb-12">{t("legal.lastUpdated")}</p>

        <div className="prose prose-invert prose-sm max-w-none">
          {content.split("\n").map((line, i) => {
            const trimmed = line.trim();
            if (!trimmed) return null;

            // Main section headers (numbered: "1. TITLE")
            if (/^\d+\.\s+[A-ZÁÉÍÓÚÑÜ¿]/.test(trimmed)) {
              return (
                <h2
                  key={i}
                  className="text-lg font-semibold text-white/90 mt-10 mb-4 border-b border-white/5 pb-2"
                >
                  {trimmed}
                </h2>
              );
            }

            // Sub-items (e.g. "3.1.", "a)", "- Item")
            if (/^\d+\.\d+\./.test(trimmed) || /^[a-f]\)/.test(trimmed)) {
              return (
                <p key={i} className="text-sm text-white/50 mb-2 pl-4">
                  {trimmed}
                </p>
              );
            }

            if (trimmed.startsWith("- ")) {
              return (
                <p key={i} className="text-sm text-white/50 mb-2 pl-4 flex gap-2">
                  <span className="text-white/20">•</span>
                  <span>{trimmed.slice(2)}</span>
                </p>
              );
            }

            return (
              <p key={i} className="text-sm text-white/50 mb-3 leading-relaxed">
                {trimmed}
              </p>
            );
          })}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 px-4 md:px-8">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 text-white/20">
            <Scale className="h-4 w-4" />
            <span className="text-sm font-medium">Lyrium</span>
          </div>
          <p className="text-xs text-white/15">© 2025 Lyrium. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default LegalPage;
