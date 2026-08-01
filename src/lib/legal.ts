// Single source of truth for the in-app legal documents (Terms +
// Privacy + Funding/AI/Communications/Platform Disclosure).
//
// When the documents are revised:
//   1. Bump TERMS_VERSION / PRIVACY_VERSION / DISCLOSURE_VERSION to the
//      new effective date.
//   2. Replace the body copy below.
//   3. Update the sibling QCWeb file `src/lib/legal-content.ts` in
//      lockstep — the marketing site duplicates this prose by design.
//   4. Existing user acceptances stay attached to the version they
//      accepted — the AppShell will re-prompt them (future work) when
//      version > their latest accepted row from /legal/acceptance.
//
// v1.0 (Effective 2026-05-19) is the first deploy of the finalized
// post-counsel prose. Approved by Jonathan Franco, Executive Partner.

export const TERMS_VERSION = "2026-05-19";
export const PRIVACY_VERSION = "2026-05-19";
export const DISCLOSURE_VERSION = "2026-05-19";
// Dealer partner ("broker") NDA / non-solicitation agreement. Kept in sync
// with app/services/broker_nda.py's BROKER_NDA_DOCUMENT_VERSION on the
// backend -- bump both together if the text changes.
export const BROKER_NDA_VERSION = "2026-07-31-1";

// Short legal entity name surfaced in UI strings (consent checkbox label, etc.)
export const COMPANY_NAME = "Qualified Commercial LLC";

// Documents are stored as section arrays so the UI can render them with
// consistent typography and so future updates don't require re-templating.
export interface LegalSection {
  heading?: string;
  paragraphs: string[];
}

export interface LegalDocument {
  title: string;
  effectiveDate: string;
  preamble?: string;
  sections: LegalSection[];
}

// ---------------------------------------------------------------------------
// Privacy Policy and Financial Privacy Notice — v1.0 (Effective 2026-05-19)
// ---------------------------------------------------------------------------

export const PRIVACY_POLICY: LegalDocument = {
  title: "Privacy Policy and Financial Privacy Notice",
  effectiveDate: "May 19, 2026",
  preamble:
    'Qualified Commercial LLC ("Qualified Commercial", "we", "us", or "our") — a New Jersey limited liability company. Mailing address: 14 53rd St #408N, Brooklyn, NY 11232. Contact: support@qualifiedcommercial.com. Version 1.0, approved by Jonathan Franco, Executive Partner.',
  sections: [
    {
      heading: "Plain-English Summary",
      paragraphs: [
        "Qualified Commercial LLC does not sell lead information or borrower information. We use information to operate the platform, communicate about accounts and funding files, conduct internal file review, prepare lender packages, support AI-assisted workflows, and submit validated packages to selected lending companies or authorized service providers. Certain advertising and analytics tools may be considered targeted advertising or sharing under some privacy laws; opt-out options are described below.",
      ],
    },
    {
      heading: "1. Scope",
      paragraphs: [
        "This Privacy Policy and Financial Privacy Notice explains how Qualified Commercial LLC collects, uses, protects, retains, and discloses information through the QualifiedCommercial website, web portal, mobile applications, messaging tools, e-signature flows, AI-assisted funding tools, agent/realtor workflows, and related services. It applies to borrowers, business owners, guarantors, real estate professionals, brokers, agents, internal users, and other users of the platform.",
        "This policy is intended to cover personal information, financial information, nonpublic personal information, documents uploaded to a funding file, communications, consent records, device data, and related operational records. It should be read together with the Terms and Conditions, Funding/AI/Communications Disclosure, and Signature Authorization Packet.",
      ],
    },
    {
      heading: "2. Information We Collect",
      paragraphs: [
        "Account information, including name, business name, email address, phone number, role, login information, contact preferences, and account status.",
        "Funding file information, including property address, loan purpose, requested amount, estimated values, bank statements, entity documents, tax documents, financial documents, credit-related information, identity information, real estate documents, and other information supplied by a user, agent, realtor, broker, or authorized representative.",
        "Credit authorization and underwriting information, including consent records, credit pull authorization status, internal file review results, AI-generated observations, underwriting notes, lender package status, and lender responses.",
        "Payment and credit card authorization information, including authorized amount, payment purpose, card brand, last four digits, expiration month/year, payment token or processor reference, billing information, and authorization/audit records. We do not intentionally store CVV/CVC codes and should not store full raw card numbers in the QualifiedCommercial database.",
        "Communications information, including emails, SMS/text messages, mobile push notifications, in-app messages, chat transcripts, call notes, support tickets, delivery statuses, opt-in and opt-out records, and campaign/notification logs.",
        "Device and usage information, including IP address, browser, operating system, mobile device type, app version, time zone, pages/screens viewed, session data, clicks, consent events, and system logs.",
        "Advertising and analytics information, including cookie identifiers, pixel events, ad interactions, source/medium/campaign data, retargeting audiences, conversion events, and aggregated analytics from tools such as Meta/Facebook, Google Ads, and similar platforms.",
        "Real estate professional lead/client information uploaded by a realtor, broker, or agent, including lead/contact details, client notes, task status, file stage, communications, and delegated AI pipeline instructions.",
        "E-signature records, including document version, signer identity, signature method, checkbox confirmations, IP address, device data, timestamp, audit trail, final PDF, certificate of completion, and document hash or integrity record.",
      ],
    },
    {
      heading: "3. How We Use Information",
      paragraphs: [
        "To create, maintain, and secure user accounts and funding files.",
        "To verify identity, authority, consent, and eligibility to use the platform.",
        "To conduct internal file review, AI-assisted analysis, document validation, scenario review, and preliminary funding assessment.",
        "To prepare, organize, and submit validated lender packages to selected third-party lending companies, funding partners, processors, underwriters, and service providers for real underwriting and funding review.",
        "To obtain, document, and retain authorizations for credit card payments, hard credit pulls, file sharing, electronic signatures, electronic records, SMS/email/push communications, and related account notices.",
        "To communicate by email, SMS/text message, phone, push notification, in-app message, and other channels about accounts, pending files, document requests, signatures, funding updates, platform activity, and service announcements.",
        "To support realtor, broker, and agent workflows, including AI pipeline delegation, task tracking, client engagement, and file preparation.",
        "To provide customer support, troubleshooting, security monitoring, fraud prevention, compliance review, and audit records.",
        "To improve the platform, train internal workflows, measure performance, analyze conversion activity, debug errors, and develop new features.",
        "To run advertising, retargeting, measurement, attribution, and audience management through tools such as Meta/Facebook and Google Ads, subject to opt-out rights and applicable law.",
        "To comply with law, enforce agreements, respond to lawful requests, protect rights, investigate misuse, and defend claims.",
      ],
    },
    {
      heading: "4. AI Underwriting and Automated Assistance",
      paragraphs: [
        "QualifiedCommercial uses AI-assisted tools to review files, identify missing information, produce observations, support underwriting preparation, help agents manage pipelines, and generate internal or borrower-facing communications. AI output may be incomplete, inaccurate, delayed, inconsistent, or based on limited information. AI output is not a final loan approval, final underwriting decision, legal advice, tax advice, appraisal, valuation, commitment to lend, or servicing instruction.",
        "Final lending decisions, loan terms, approvals, denials, credit conditions, rate locks, document conditions, and post-closing servicing are controlled by the applicable lender, funding company, servicer, or other third party. Qualified Commercial LLC does not represent that every projection, scenario, internal term, prequalification, or AI-generated recommendation will close as projected.",
      ],
    },
    {
      heading: "5. How We Share Information",
      paragraphs: [
        "We do not sell borrower, lead, or realtor-uploaded client information for money. We do not use realtor-uploaded leads to independently solicit or compete for that client outside the relationship and file purpose provided to us by the realtor, broker, or agent, except where the client independently contacts us, law requires action, or the realtor/client relationship has been separately authorized.",
        "We may disclose information as follows:",
        "To selected lending companies, funding partners, processors, underwriters, credit/reporting vendors, and service providers when a funding package is validated, authorized, or ready for underwriting review.",
        "To service providers that help operate the platform, including cloud hosting, AWS infrastructure, Twilio messaging, email delivery, payment processing, analytics, identity verification, document generation, e-signature, customer support, and security vendors.",
        "To Meta/Facebook, Google Ads, and similar advertising/analytics platforms for retargeting, conversion tracking, analytics, and campaign measurement. These activities may be considered targeted advertising or sharing under some privacy laws even though we do not sell information for money.",
        "To realtors, brokers, agents, or authorized representatives associated with a client file, when needed to manage the file, complete tasks, communicate with the client, or process a funding request.",
        "To comply with law, legal process, regulatory inquiry, lender or investor review, fraud/security investigation, dispute resolution, or rights enforcement.",
        "In connection with a merger, financing, reorganization, sale, assignment, or transfer of business assets, subject to reasonable confidentiality and legal requirements.",
      ],
    },
    {
      heading: "6. Financial Privacy Notice",
      paragraphs: [
        "Because the platform supports commercial and real estate financing workflows, we treat financial and nonpublic personal information with heightened care.",
        "Everyday business purposes (operating accounts, processing funding files, preparing lender packages, responding to authorized requests, maintaining records): Yes, we share. You cannot limit this sharing where it is needed to provide the service, complete the funding workflow, comply with law, or protect the platform.",
        "With selected lenders, funding partners, credit/reporting vendors, processors, underwriters, and service providers for underwriting and funding review: Yes, when authorized or needed for a file. You may stop using the service or withdraw consent before submission when possible, but withdrawal may prevent funding review.",
        "For our own marketing, retargeting, conversion measurement, and platform improvement: Yes, limited to permitted uses. You may opt out of marketing emails, SMS marketing, push notifications, cookies, and targeted advertising as described below.",
        "With nonaffiliated companies for their independent marketing unrelated to your funding request: No.",
        "Realtor-uploaded leads or client contacts sold to unrelated third parties: No — we do not sell those leads or contacts.",
      ],
    },
    {
      heading: "7. Communications, SMS, Email, and Push Notifications",
      paragraphs: [
        "When a user signs up, creates an account, provides a phone number, initiates a funding file, is invited by an authorized realtor/broker/agent, or otherwise uses the platform, the user agrees to receive account-related and funding-file-related communications by email, SMS/text message, phone, mobile push notification, and in-app message. These may include login/security messages, document requests, signature requests, file status updates, lender package updates, missing information alerts, AI workflow messages, and service notices.",
        "Text messages may be sent using Twilio or another messaging provider. Message frequency varies. Message and data rates may apply. A user can opt out of nonessential SMS by replying STOP where supported, and can request help by replying HELP where supported. Opting out may limit our ability to provide time-sensitive account, funding, or document communications. Separate consent may be requested for marketing/promotional text messages where required.",
        "Users may unsubscribe from marketing emails using the unsubscribe link or by contacting us. Transactional and account-related emails may continue as necessary. Mobile push notifications may be controlled through device or app settings.",
      ],
    },
    {
      heading: "8. Cookies, Pixels, Retargeting, and Advertising",
      paragraphs: [
        "We may use cookies, pixels, SDKs, tags, and similar technologies from Meta/Facebook, Google Ads, analytics providers, and other partners to measure traffic, understand use of the platform, improve campaigns, attribute conversions, and show retargeting ads. Retargeting ads may appear in a user's social media feed, search results, display placements, or other digital channels after interacting with QualifiedCommercial.",
        "These technologies may process device identifiers, IP address, browser information, event data, pages/screens visited, and campaign identifiers. We do not use these tools to sell lead information or realtor-uploaded client lists. Users can control cookies through browser settings, device settings, platform opt-outs, ad preference tools, or by contacting us at the email listed in this policy.",
      ],
    },
    {
      heading: "9. Security and Encryption",
      paragraphs: [
        "We use administrative, technical, and physical safeguards designed to protect information, including encryption in transit and at rest where appropriate, access controls, role-based permissions, authentication controls, logging, monitoring, backups, and vendor review. No system can be guaranteed completely secure. Users are responsible for protecting their login credentials, devices, email accounts, and phone numbers.",
        "We may use AWS and other infrastructure providers. The platform may experience downtime, latency, interrupted access, data delays, message delays, or degraded performance due to AWS outages, third-party vendor issues, maintenance, cybersecurity events, internet outages, mobile carrier issues, or other conditions beyond our control.",
      ],
    },
    {
      heading: "10. Sensitive Data and Data Minimization",
      paragraphs: [
        "We seek to minimize sensitive information where possible. However, funding files, credit authorizations, bank statements, tax records, identity documents, entity documents, property documents, and other uploaded records may contain sensitive information needed to evaluate, prepare, or submit a funding package. We use encryption and access controls for such records and limit access to authorized personnel, representatives, service providers, and selected lending parties who need the information for the funding workflow.",
        "Payment card data should be handled through tokenized or hosted payment providers when possible. We do not intentionally store CVV/CVC codes after authorization and should not store full raw card numbers in platform databases or signed PDFs.",
      ],
    },
    {
      heading: "11. Data Retention",
      paragraphs: [
        "We retain information for as long as reasonably necessary to operate the platform, maintain account and funding records, comply with legal and regulatory obligations, support lender or investor review, document authorizations, resolve disputes, enforce agreements, prevent fraud, and maintain audit trails. Retention periods may vary by record type, lender requirement, law, and business need.",
      ],
    },
    {
      heading: "12. User Choices and Rights",
      paragraphs: [
        "Access or correction requests may be sent to support@qualifiedcommercial.com.",
        "Users may request deletion of certain account information, subject to legal, security, transactional, funding, audit, lender, regulatory, and record-retention requirements.",
        "Users may opt out of marketing emails through unsubscribe links where provided.",
        "Users may opt out of nonessential SMS messages by replying STOP where supported.",
        "Users may control mobile push notifications through device or app settings.",
        "Users may manage cookies and retargeting through browser/device settings and ad platform preference tools.",
        "Withdrawal of consent may prevent us from continuing a funding file, communicating about documents, submitting a package to lenders, or providing certain platform features.",
      ],
    },
    {
      heading: "13. Children",
      paragraphs: [
        "The platform is intended for business, real estate, funding, and professional use by adults. It is not directed to children under 13, and we do not knowingly collect personal information from children under 13.",
      ],
    },
    {
      heading: "14. Changes to This Policy",
      paragraphs: [
        "We may update this policy from time to time. The version and effective date above identify the current policy. Continued use of the platform after an update means the user accepts the updated policy, except where additional notice or consent is required by law.",
      ],
    },
    {
      heading: "15. Contact",
      paragraphs: [
        "Questions, requests, opt-out instructions, or privacy concerns may be sent to Qualified Commercial LLC, 14 53rd St #408N, Brooklyn, NY 11232, email: support@qualifiedcommercial.com.",
      ],
    },
  ],
};

// TODO(compliance-review-es): Spanish translation of the Privacy Policy —
// AI-assisted translation, NOT YET reviewed by a native-Spanish-speaking
// compliance reviewer. Do not treat as legally equivalent to the English
// version until reviewed and this TODO is removed.
export const PRIVACY_POLICY_ES: LegalDocument = {
  title: "Política de Privacidad y Aviso de Privacidad Financiera",
  effectiveDate: "19 de mayo de 2026",
  preamble:
    'Qualified Commercial LLC ("Qualified Commercial", "nosotros" o "nuestro") — una sociedad de responsabilidad limitada de Nueva Jersey. Dirección postal: 14 53rd St #408N, Brooklyn, NY 11232. Contacto: support@qualifiedcommercial.com. Versión 1.0, aprobada por Jonathan Franco, Socio Ejecutivo.',
  sections: [
    {
      heading: "Resumen en lenguaje sencillo",
      paragraphs: [
        "Qualified Commercial LLC no vende información de leads ni información de prestatarios. Usamos la información para operar la plataforma, comunicarnos sobre cuentas y expedientes de financiamiento, realizar revisiones internas de expedientes, preparar paquetes para prestamistas, apoyar flujos de trabajo asistidos por IA y enviar paquetes validados a compañías de préstamo seleccionadas o proveedores de servicios autorizados. Ciertas herramientas de publicidad y análisis pueden considerarse publicidad dirigida o compartición de datos bajo algunas leyes de privacidad; las opciones de exclusión se describen a continuación.",
      ],
    },
    {
      heading: "1. Alcance",
      paragraphs: [
        "Esta Política de Privacidad y Aviso de Privacidad Financiera explica cómo Qualified Commercial LLC recopila, usa, protege, retiene y divulga información a través del sitio web de QualifiedCommercial, el portal web, las aplicaciones móviles, las herramientas de mensajería, los flujos de firma electrónica, las herramientas de financiamiento asistidas por IA, los flujos de trabajo de agentes/agentes inmobiliarios y servicios relacionados. Se aplica a prestatarios, propietarios de negocios, garantes, profesionales inmobiliarios, corredores, agentes, usuarios internos y otros usuarios de la plataforma.",
        "Esta política tiene el propósito de cubrir información personal, información financiera, información personal no pública, documentos subidos a un expediente de financiamiento, comunicaciones, registros de consentimiento, datos del dispositivo y registros operativos relacionados. Debe leerse junto con los Términos y Condiciones, la Divulgación de Financiamiento/IA/Comunicaciones y el Paquete de Autorización de Firma.",
      ],
    },
    {
      heading: "2. Información que recopilamos",
      paragraphs: [
        "Información de cuenta, incluyendo nombre, nombre del negocio, dirección de correo electrónico, número de teléfono, rol, información de inicio de sesión, preferencias de contacto y estado de la cuenta.",
        "Información del expediente de financiamiento, incluyendo dirección de la propiedad, propósito del préstamo, monto solicitado, valores estimados, estados de cuenta bancarios, documentos de la entidad, documentos fiscales, documentos financieros, información relacionada con el crédito, información de identidad, documentos inmobiliarios y otra información proporcionada por un usuario, agente, agente inmobiliario, corredor o representante autorizado.",
        "Información de autorización de crédito y suscripción, incluyendo registros de consentimiento, estado de autorización de consulta de crédito, resultados de revisión interna del expediente, observaciones generadas por IA, notas de suscripción, estado del paquete para el prestamista y respuestas del prestamista.",
        "Información de pago y autorización de tarjeta de crédito, incluyendo monto autorizado, propósito del pago, marca de la tarjeta, últimos cuatro dígitos, mes/año de vencimiento, token de pago o referencia del procesador, información de facturación y registros de autorización/auditoría. No almacenamos intencionalmente los códigos CVV/CVC y no debemos almacenar números de tarjeta completos en la base de datos de QualifiedCommercial.",
        "Información de comunicaciones, incluyendo correos electrónicos, mensajes SMS/texto, notificaciones push móviles, mensajes dentro de la aplicación, transcripciones de chat, notas de llamadas, tickets de soporte, estados de entrega, registros de aceptación y exclusión, y registros de campañas/notificaciones.",
        "Información del dispositivo y de uso, incluyendo dirección IP, navegador, sistema operativo, tipo de dispositivo móvil, versión de la aplicación, zona horaria, páginas/pantallas vistas, datos de sesión, clics, eventos de consentimiento y registros del sistema.",
        "Información de publicidad y análisis, incluyendo identificadores de cookies, eventos de píxeles, interacciones con anuncios, datos de fuente/medio/campaña, audiencias de remarketing, eventos de conversión y análisis agregados de herramientas como Meta/Facebook, Google Ads y plataformas similares.",
        "Información de leads/clientes de profesionales inmobiliarios subida por un agente inmobiliario, corredor o agente, incluyendo detalles de leads/contactos, notas del cliente, estado de tareas, etapa del expediente, comunicaciones e instrucciones delegadas del pipeline de IA.",
        "Registros de firma electrónica, incluyendo versión del documento, identidad del firmante, método de firma, confirmaciones de casillas, dirección IP, datos del dispositivo, fecha y hora, pista de auditoría, PDF final y certificado de finalización o registro de integridad del documento.",
      ],
    },
    {
      heading: "3. Cómo usamos la información",
      paragraphs: [
        "Para crear, mantener y proteger cuentas de usuario y expedientes de financiamiento.",
        "Para verificar identidad, autoridad, consentimiento y elegibilidad para usar la plataforma.",
        "Para realizar revisión interna del expediente, análisis asistido por IA, validación de documentos, revisión de escenarios y evaluación preliminar de financiamiento.",
        "Para preparar, organizar y enviar paquetes validados para prestamistas a compañías de préstamo, socios de financiamiento, procesadores, suscriptores y proveedores de servicios de terceros seleccionados para suscripción y revisión de financiamiento real.",
        "Para obtener, documentar y retener autorizaciones para pagos con tarjeta de crédito, consultas de crédito estrictas, compartición de archivos, firmas electrónicas, registros electrónicos y comunicaciones por SMS/correo electrónico/push, y avisos de cuenta relacionados.",
        "Para comunicarnos por correo electrónico, SMS/mensaje de texto, teléfono, notificación push, mensaje dentro de la aplicación y otros canales sobre cuentas, expedientes pendientes, solicitudes de documentos, firmas, actualizaciones de financiamiento, actividad de la plataforma y anuncios de servicio.",
        "Para apoyar los flujos de trabajo de agentes inmobiliarios, corredores y agentes, incluyendo la delegación del pipeline de IA, el seguimiento de tareas, la participación del cliente y la preparación del expediente.",
        "Para brindar soporte al cliente, resolución de problemas, monitoreo de seguridad, prevención de fraude, revisión de cumplimiento y registros de auditoría.",
        "Para mejorar la plataforma, entrenar flujos de trabajo internos, medir el rendimiento, analizar la actividad de conversión, depurar errores y desarrollar nuevas funciones.",
        "Para ejecutar publicidad, remarketing, medición, atribución y gestión de audiencias a través de herramientas como Meta/Facebook y Google Ads, sujeto a derechos de exclusión y la ley aplicable.",
        "Para cumplir con la ley, hacer cumplir acuerdos, responder a solicitudes legales, proteger derechos, investigar el mal uso y defender reclamaciones.",
      ],
    },
    {
      heading: "4. Suscripción con IA y asistencia automatizada",
      paragraphs: [
        "QualifiedCommercial utiliza herramientas asistidas por IA para revisar expedientes, identificar información faltante, producir observaciones, apoyar la preparación de la suscripción, ayudar a los agentes a gestionar pipelines y generar comunicaciones internas o dirigidas al prestatario. El resultado de la IA puede ser incompleto, inexacto, tardío, inconsistente o basado en información limitada. El resultado de la IA no es una aprobación final del préstamo, una decisión final de suscripción, asesoría legal, asesoría fiscal, una tasación, una valoración, un compromiso de prestar ni una instrucción de servicio.",
        "Las decisiones finales de préstamo, los términos del préstamo, las aprobaciones, los rechazos, las condiciones de crédito, los bloqueos de tasa, las condiciones de documentos y el servicio posterior al cierre están controlados por el prestamista, la compañía de financiamiento, el administrador de préstamos u otro tercero aplicable. Qualified Commercial LLC no representa que cada proyección, escenario, término interno, precalificación o recomendación generada por IA se cerrará según lo proyectado.",
      ],
    },
    {
      heading: "5. Cómo compartimos información",
      paragraphs: [
        "No vendemos información de prestatarios, leads o clientes subidos por agentes inmobiliarios a cambio de dinero. No usamos leads subidos por agentes inmobiliarios para solicitar o competir independientemente por ese cliente fuera de la relación y el propósito del expediente proporcionado por el agente inmobiliario, corredor o agente, excepto cuando el cliente nos contacte de manera independiente, la ley requiera acción, o la relación agente inmobiliario/cliente haya sido autorizada por separado.",
        "Podemos divulgar información de la siguiente manera:",
        "A compañías de préstamo, socios de financiamiento, procesadores, suscriptores y proveedores de servicios de crédito/reportes seleccionados cuando un paquete de financiamiento sea validado, autorizado o esté listo para revisión de suscripción.",
        "A proveedores de servicios que ayudan a operar la plataforma, incluyendo alojamiento en la nube, infraestructura de AWS, mensajería de Twilio, entrega de correo electrónico, procesamiento de pagos, análisis, verificación de identidad, generación de documentos, firma electrónica, soporte al cliente y proveedores de seguridad.",
        "A Meta/Facebook, Google Ads y plataformas de publicidad/análisis similares para remarketing, seguimiento de conversiones, análisis y medición de campañas. Estas actividades pueden considerarse publicidad dirigida o compartición bajo algunas leyes de privacidad, aunque no vendamos información a cambio de dinero.",
        "A agentes inmobiliarios, corredores, agentes o representantes autorizados asociados con un expediente de cliente, cuando sea necesario para gestionar el expediente, completar tareas, comunicarse con el cliente o procesar una solicitud de financiamiento.",
        "Para cumplir con la ley, procesos legales, investigación regulatoria, revisión del prestamista o inversor, investigación de fraude/seguridad, resolución de disputas o cumplimiento de derechos.",
        "En relación con una fusión, financiamiento, reorganización, venta, cesión o transferencia de activos comerciales, sujeto a requisitos razonables de confidencialidad y legales.",
      ],
    },
    {
      heading: "6. Aviso de Privacidad Financiera",
      paragraphs: [
        "Debido a que la plataforma apoya flujos de trabajo de financiamiento comercial e inmobiliario, tratamos la información financiera y personal no pública con mayor cuidado.",
        "Propósitos comerciales habituales (operar cuentas, procesar expedientes de financiamiento, preparar paquetes para prestamistas, responder a solicitudes autorizadas, mantener registros): Sí, compartimos. No puede limitar esta compartición cuando sea necesaria para prestar el servicio, completar el flujo de financiamiento, cumplir con la ley o proteger la plataforma.",
        "Con prestamistas, socios de financiamiento, proveedores de crédito/reportes, procesadores, suscriptores y proveedores de servicios seleccionados para suscripción y revisión de financiamiento: Sí, cuando esté autorizado o sea necesario para un expediente. Puede dejar de usar el servicio o retirar el consentimiento antes del envío cuando sea posible, pero el retiro puede impedir la revisión de financiamiento.",
        "Para nuestra propia mercadotecnia, remarketing, medición de conversiones y mejora de la plataforma: Sí, limitado a usos permitidos. Puede optar por no recibir correos de mercadotecnia, SMS de mercadotecnia, notificaciones push, cookies y publicidad dirigida como se describe a continuación.",
        "Con compañías no afiliadas para su mercadotecnia independiente no relacionada con su solicitud de financiamiento: No.",
        "Leads o contactos de clientes subidos por agentes inmobiliarios vendidos a terceros no relacionados: No — no vendemos esos leads o contactos.",
      ],
    },
    {
      heading: "7. Comunicaciones, SMS, correo electrónico y notificaciones push",
      paragraphs: [
        "Cuando un usuario se registra, crea una cuenta, proporciona un número de teléfono, inicia un expediente de financiamiento, es invitado por un agente inmobiliario/corredor/agente autorizado, o de otro modo usa la plataforma, el usuario acepta recibir comunicaciones relacionadas con la cuenta y el expediente de financiamiento por correo electrónico, SMS/mensaje de texto, teléfono, notificación push móvil y mensaje dentro de la aplicación. Estas pueden incluir mensajes de inicio de sesión/seguridad, solicitudes de documentos, solicitudes de firma, actualizaciones del estado del expediente, actualizaciones del paquete para el prestamista, alertas de información faltante, mensajes del flujo de trabajo de IA y avisos de servicio.",
        "Los mensajes de texto pueden enviarse usando Twilio u otro proveedor de mensajería. La frecuencia de los mensajes varía. Pueden aplicarse tarifas de mensajes y datos. Un usuario puede optar por no recibir SMS no esenciales respondiendo STOP donde esté disponible, y puede solicitar ayuda respondiendo HELP donde esté disponible. Optar por no participar puede limitar nuestra capacidad de proporcionar comunicaciones oportunas sobre la cuenta, el financiamiento o los documentos. Puede solicitarse un consentimiento separado para mensajes de texto de mercadotecnia/promocionales cuando la ley lo requiera.",
        "Los usuarios pueden cancelar la suscripción a correos de mercadotecnia usando el enlace de cancelación o contactándonos. Los correos transaccionales y relacionados con la cuenta pueden continuar según sea necesario. Las notificaciones push móviles pueden controlarse a través de la configuración del dispositivo o la aplicación.",
      ],
    },
    {
      heading: "8. Cookies, píxeles, remarketing y publicidad",
      paragraphs: [
        "Podemos usar cookies, píxeles, SDKs, etiquetas y tecnologías similares de Meta/Facebook, Google Ads, proveedores de análisis y otros socios para medir el tráfico, entender el uso de la plataforma, mejorar campañas, atribuir conversiones y mostrar anuncios de remarketing. Los anuncios de remarketing pueden aparecer en el feed de redes sociales de un usuario, resultados de búsqueda, ubicaciones de display u otros canales digitales después de interactuar con QualifiedCommercial.",
        "Estas tecnologías pueden procesar identificadores de dispositivo, dirección IP, información del navegador, datos de eventos, páginas/pantallas visitadas e identificadores de campaña. No usamos estas herramientas para vender información de leads o listas de clientes subidas por agentes inmobiliarios. Los usuarios pueden controlar las cookies a través de la configuración del navegador, la configuración del dispositivo, las opciones de exclusión de la plataforma, las herramientas de preferencias de anuncios, o contactándonos al correo electrónico listado en esta política.",
      ],
    },
    {
      heading: "9. Seguridad y encriptación",
      paragraphs: [
        "Usamos salvaguardas administrativas, técnicas y físicas diseñadas para proteger la información, incluyendo encriptación en tránsito y en reposo cuando corresponda, controles de acceso, permisos basados en roles, controles de autenticación, registro, monitoreo, respaldos y revisión de proveedores. Ningún sistema puede garantizarse completamente seguro. Los usuarios son responsables de proteger sus credenciales de inicio de sesión, dispositivos, cuentas de correo electrónico y números de teléfono.",
        "Podemos usar AWS y otros proveedores de infraestructura. La plataforma puede experimentar tiempo de inactividad, latencia, acceso interrumpido, retrasos de datos, retrasos de mensajes o rendimiento degradado debido a interrupciones de AWS, problemas de proveedores externos, mantenimiento, eventos de ciberseguridad, interrupciones de internet, problemas de operadores móviles u otras condiciones fuera de nuestro control.",
      ],
    },
    {
      heading: "10. Datos sensibles y minimización de datos",
      paragraphs: [
        "Buscamos minimizar la información sensible cuando sea posible. Sin embargo, los expedientes de financiamiento, las autorizaciones de crédito, los estados de cuenta bancarios, los registros fiscales, los documentos de identidad, los documentos de la entidad, los documentos de la propiedad y otros registros subidos pueden contener información sensible necesaria para evaluar, preparar o enviar un paquete de financiamiento. Usamos encriptación y controles de acceso para dichos registros y limitamos el acceso a personal autorizado, representantes, proveedores de servicios y partes prestamistas seleccionadas que necesiten la información para el flujo de financiamiento.",
        "Los datos de tarjetas de pago deben manejarse a través de proveedores de pago tokenizados u hospedados cuando sea posible. No almacenamos intencionalmente los códigos CVV/CVC después de la autorización y no debemos almacenar números de tarjeta completos en bases de datos de la plataforma o PDFs firmados.",
      ],
    },
    {
      heading: "11. Retención de datos",
      paragraphs: [
        "Retenemos la información durante el tiempo que sea razonablemente necesario para operar la plataforma, mantener registros de cuentas y financiamiento, cumplir con obligaciones legales y regulatorias, apoyar la revisión del prestamista o inversor, documentar autorizaciones, resolver disputas, hacer cumplir acuerdos y mantener pistas de auditoría. Los períodos de retención pueden variar según el tipo de registro, el requisito del prestamista, la ley y la necesidad comercial.",
      ],
    },
    {
      heading: "12. Opciones y derechos del usuario",
      paragraphs: [
        "Las solicitudes de acceso o corrección pueden enviarse a support@qualifiedcommercial.com.",
        "Los usuarios pueden solicitar la eliminación de cierta información de la cuenta, sujeto a requisitos legales, de seguridad, transaccionales, de financiamiento, de auditoría, del prestamista, regulatorios y de retención de registros.",
        "Los usuarios pueden optar por no recibir correos de mercadotecnia a través de enlaces de cancelación donde se proporcionen.",
        "Los usuarios pueden optar por no recibir mensajes SMS no esenciales respondiendo STOP donde esté disponible.",
        "Los usuarios pueden controlar las notificaciones push móviles a través de la configuración del dispositivo o la aplicación.",
        "Los usuarios pueden gestionar las cookies y el remarketing a través de la configuración del navegador/dispositivo y las herramientas de preferencias de las plataformas de anuncios.",
        "El retiro del consentimiento puede impedirnos continuar un expediente de financiamiento, comunicarnos sobre documentos, enviar un paquete a prestamistas o proporcionar ciertas funciones de la plataforma.",
      ],
    },
    {
      heading: "13. Menores",
      paragraphs: [
        "La plataforma está destinada para uso comercial, inmobiliario, de financiamiento y profesional por adultos. No está dirigida a menores de 13 años, y no recopilamos a sabiendas información personal de menores de 13 años.",
      ],
    },
    {
      heading: "14. Cambios a esta política",
      paragraphs: [
        "Podemos actualizar esta política periódicamente. La versión y fecha de vigencia anteriores identifican la política actual. El uso continuado de la plataforma después de una actualización significa que el usuario acepta la política actualizada, excepto cuando la ley requiera aviso o consentimiento adicional.",
      ],
    },
    {
      heading: "15. Contacto",
      paragraphs: [
        "Las preguntas, solicitudes, instrucciones de exclusión o inquietudes de privacidad pueden enviarse a Qualified Commercial LLC, 14 53rd St #408N, Brooklyn, NY 11232, correo electrónico: support@qualifiedcommercial.com.",
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Terms and Conditions — v1.0 (Effective 2026-05-19)
// ---------------------------------------------------------------------------

export const TERMS_AND_CONDITIONS: LegalDocument = {
  title: "Terms and Conditions",
  effectiveDate: "May 19, 2026",
  preamble:
    "Qualified Commercial LLC — formed in New Jersey. Mailing address: 14 53rd St #408N, Brooklyn, NY 11232. Contact: support@qualifiedcommercial.com. Version 1.0, approved by Jonathan Franco, Executive Partner. These Terms contain limitations of liability, user responsibility requirements, electronic communication consent, AI limitations, payment authorization terms, service availability limits, arbitration, and class action waiver provisions. Please read them carefully before using the platform.",
  sections: [
    {
      heading: "1. Acceptance of Terms",
      paragraphs: [
        "These Terms and Conditions are a binding agreement between the user and Qualified Commercial LLC. By creating an account, accessing the platform, using the mobile application, inviting a client, uploading a document, delegating tasks to AI, signing electronically, authorizing communications, submitting a funding file, or otherwise using QualifiedCommercial, the user agrees to these Terms.",
        "If a user acts on behalf of a company, borrower, client, guarantor, realtor, broker, agent, or other organization, the user represents that they have authority to bind that person or organization and to provide information, consents, documents, and instructions through the platform.",
      ],
    },
    {
      heading: "2. Description of Services",
      paragraphs: [
        "QualifiedCommercial provides a technology platform for commercial and real estate funding workflows. The platform may include client intake, document collection, AI-assisted file review, internal file audit, task management, realtor/broker/agent pipeline tools, mobile notifications, e-signature workflows, payment authorization workflows, communication tools, lender package preparation, and submission of validated packages to selected third-party lending companies or funding partners.",
        "Unless a separate written agreement states otherwise, Qualified Commercial LLC is not the lender, loan servicer, credit bureau, consumer reporting agency, appraiser, title company, settlement agent, insurance provider, tax advisor, attorney, CPA, or post-closing loan servicing customer support provider.",
      ],
    },
    {
      heading: "3. Eligibility and Account Responsibility",
      paragraphs: [
        "Users must provide accurate, current, and complete information.",
        "Users must maintain the confidentiality of login credentials, devices, email accounts, and phone numbers used for verification.",
        "Users must promptly update account information and funding file information if it changes.",
        "Users may not impersonate another person, upload unauthorized information, misuse the platform, interfere with security, or attempt to access files without permission.",
        "Users are responsible for activity under their accounts, including activity by employees, assistants, team members, contractors, or authorized representatives.",
      ],
    },
    {
      heading: "4. Funding Files, Lender Packages, and No Guarantee of Approval",
      paragraphs: [
        "Funding projections, estimated loan terms, AI-generated observations, internal underwriting scenarios, payment estimates, rate assumptions, leverage estimates, HUD estimates, DSCR/LTV/LTC calculations, and similar outputs are preliminary and informational. They are not final approvals, commitments to lend, rate locks, binding term sheets, appraisals, valuations, legal opinions, tax advice, or guarantees of closing.",
        "Final approval, pricing, conditions, credit decisions, documentation requirements, valuation treatment, rate locks, exceptions, funding, and servicing are controlled by the applicable lender, lending company, funding partner, servicer, investor, or third-party provider. Loan projections and internal terms may not close as projected due to market changes, credit changes, collateral issues, rate changes, lender overlays, property conditions, third-party delays, document delays, borrower delays, human delays to lock rates, or other factors.",
      ],
    },
    {
      heading: "5. AI Assistance and User Supervision",
      paragraphs: [
        "QualifiedCommercial may use AI-assisted systems to analyze information, identify missing documents, help prepare packages, draft communications, support underwriting review, summarize files, manage workflow, and assist realtors/brokers/agents. AI can make mistakes. AI may produce incomplete, inaccurate, outdated, inconsistent, or inappropriate results. Users must review AI output before relying on it, sending it, submitting it, or using it in a funding file.",
        "AI does not replace human review, lender underwriting, legal review, tax review, professional judgment, or user responsibility. Users remain responsible for verifying information, supervising delegated tasks, correcting errors, confirming consents, and determining whether a file is ready for lender submission.",
      ],
    },
    {
      heading: "6. Realtor, Broker, Agent, and Professional User Obligations",
      paragraphs: [
        "Realtors, brokers, agents, and other professional users are responsible for maintaining their client relationships, securing authority to upload client information, obtaining required consents, supervising the AI pipeline, reviewing delegated tasks, verifying communications, and ensuring that their use of the platform complies with real estate, lending, advertising, privacy, professional, and consumer protection obligations that apply to them.",
        "QualifiedCommercial will not sell realtor-uploaded leads or client contacts, and will not attempt to make business with those clients outside the relationship provided by the realtor, broker, or agent, except where the client independently contacts QualifiedCommercial, a separate authorization is provided, the relationship is no longer applicable, or law requires action. QualifiedCommercial may communicate with such clients as needed to operate the platform, complete tasks delegated by the professional user, obtain documents/signatures, process funding files, and submit authorized lender packages.",
      ],
    },
    {
      heading: "7. Communications Consent",
      paragraphs: [
        "By signing up, providing contact information, initiating or participating in a funding file, accepting an invitation, or using the platform, users consent to receive account-related and funding-file-related communications from QualifiedCommercial and its service providers by email, SMS/text message, phone, mobile push notification, in-app message, and similar channels. Communications may include document requests, missing information reminders, e-signature requests, file updates, AI workflow messages, account alerts, security messages, lender package notices, and service notices.",
        "SMS/text messages may be sent through Twilio or similar providers. Message frequency varies. Message and data rates may apply. Users may reply STOP to opt out where supported and HELP for help where supported. Opting out may affect the ability to receive time-sensitive file updates. Marketing/promotional messages may require separate consent where required by law.",
      ],
    },
    {
      heading: "8. Electronic Records and E-Signatures",
      paragraphs: [
        "Users consent to conduct transactions electronically, receive electronic records, sign documents electronically, and receive copies through the platform or email. Electronic signatures, checkbox acknowledgments, typed names, drawn signatures, click-to-sign actions, OTP confirmations, and similar actions may be treated as signatures, consents, authorizations, and records.",
        "The platform may capture signer name, email, phone, user ID, IP address, device/browser, timestamp, consent language, document version, signature method, audit trail, and final document hash. Users may request paper copies or withdraw electronic consent by contacting QualifiedCommercial, but withdrawal may delay or prevent continued platform use, signature completion, credit authorization, payment authorization, or lender package submission.",
      ],
    },
    {
      heading: "9. Credit Pulls, File Review, and Lender Sharing",
      paragraphs: [
        "Internal file review may include reviewing information supplied by the user, realtor, broker, agent, borrower, guarantor, or authorized representative. Internal file review is not necessarily a hard credit inquiry. A hard credit pull requires a separate authorization. When a user authorizes a hard credit pull, the user authorizes QualifiedCommercial, its credit/reporting provider, and selected lending parties to obtain consumer reports, credit reports, and related credit information for funding review, underwriting, processing, placement, servicing, or related permissible purposes. A hard credit inquiry may appear on a credit report and may affect a credit score.",
        "When a funding file is validated and ready for real underwriting, QualifiedCommercial may submit the lending package, documents, and related information to selected third-party lenders, lending companies, funding partners, processors, underwriters, credit/reporting vendors, and service providers as authorized or necessary for the funding workflow.",
      ],
    },
    {
      heading: "10. Payment and Credit Card Authorization",
      paragraphs: [
        "If a user provides payment information or signs a credit card authorization, the user authorizes QualifiedCommercial or its payment processor to charge the authorized payment method for the amounts, purposes, timing, and terms disclosed in the applicable authorization or platform screen. Payment card data should be processed using tokenized or hosted payment methods where possible. QualifiedCommercial does not intentionally store CVV/CVC codes and should not store full raw card numbers in platform databases or signed PDFs.",
        "Users are responsible for ensuring that payment information is accurate and that they are authorized to use the payment method. Fees, refunds, reversals, chargebacks, and cancellations are governed by the applicable payment authorization, platform terms, and any separate written agreement.",
      ],
    },
    {
      heading: "11. Privacy, Data Protection, and Advertising",
      paragraphs: [
        "Use of the platform is subject to the Privacy Policy and Financial Privacy Notice. QualifiedCommercial does not sell borrower information or realtor-uploaded lead information for money. QualifiedCommercial may use service providers such as AWS, Twilio, email providers, payment processors, e-signature/document tools, Meta/Facebook, Google Ads, analytics providers, and similar vendors to operate, secure, communicate, advertise, retarget, measure, and improve the platform.",
        "Retargeting ads may appear in a user's social media feed, search results, display placements, or other digital channels. Some privacy laws may treat certain retargeting or analytics activities as sharing or targeted advertising even when no information is sold for money. Users can review opt-out choices in the Privacy Policy.",
      ],
    },
    {
      heading: "12. Service Availability and Third-Party Systems",
      paragraphs: [
        "The platform may rely on AWS, internet service providers, mobile carriers, SMS providers, email providers, payment processors, app stores, AI providers, credit/reporting providers, lenders, and other third parties. QualifiedCommercial does not guarantee uninterrupted, error-free, secure, or real-time availability. The platform may experience downtime, delays, outages, message failures, data sync issues, degraded performance, or loss of access due to maintenance, vendor outage, AWS outage, cyber event, carrier issue, internet failure, software defect, or circumstances beyond QualifiedCommercial's control.",
      ],
    },
    {
      heading: "13. Prohibited Uses",
      paragraphs: [
        "Submitting false, misleading, unauthorized, incomplete, or fraudulent information.",
        "Uploading client, borrower, guarantor, or lead information without proper authority or consent.",
        "Using the platform to make unlawful credit, lending, housing, advertising, or discriminatory decisions.",
        "Bypassing security, scraping data, reverse engineering, disrupting operations, or attempting unauthorized access.",
        "Using AI output without appropriate human review where the result affects a client, borrower, funding file, lender package, payment, or legal/compliance obligation.",
        "Sending spam, unlawful texts, unlawful calls, deceptive communications, or messages without required consent.",
      ],
    },
    {
      heading: "14. Intellectual Property",
      paragraphs: [
        "QualifiedCommercial, its software, workflow design, AI pipeline features, templates, interfaces, text, graphics, branding, logos, and platform materials are owned by Qualified Commercial LLC or its licensors. Users receive a limited, revocable, nonexclusive, nontransferable right to use the platform for authorized purposes only.",
      ],
    },
    {
      heading: "15. Disclaimers",
      paragraphs: [
        'The platform is provided on an "as is" and "as available" basis. To the maximum extent permitted by law, QualifiedCommercial disclaims warranties of merchantability, fitness for a particular purpose, title, non-infringement, uninterrupted access, error-free operation, accuracy of AI output, funding approval, rate availability, lender acceptance, closing, profitability, valuation accuracy, or post-closing servicing support.',
      ],
    },
    {
      heading: "16. Limitation of Liability",
      paragraphs: [
        "To the maximum extent permitted by law, QualifiedCommercial will not be liable for indirect, incidental, special, consequential, exemplary, punitive, lost profit, lost revenue, lost opportunity, loss of goodwill, data loss, business interruption, financing denial, loan delay, rate change, servicing issue, third-party lender decision, AI error, messaging delay, or outage damages. QualifiedCommercial's total liability for any claim will not exceed the amount paid by the user to QualifiedCommercial for the service giving rise to the claim during the three months before the event, or one hundred dollars if no amount was paid, unless a different limit is required by law.",
      ],
    },
    {
      heading: "17. Indemnification",
      paragraphs: [
        "Users agree to defend, indemnify, and hold harmless QualifiedCommercial, its owners, officers, employees, contractors, service providers, and affiliates from claims, losses, liabilities, damages, costs, and expenses arising from user content, unauthorized uploads, inaccurate information, misuse of the platform, violation of these Terms, violation of law, client disputes, consent failures, professional obligations, payment disputes, or reliance on AI output without proper review.",
      ],
    },
    {
      heading: "18. Governing Law, Arbitration, and Class Action Waiver",
      paragraphs: [
        "These Terms are governed by the laws of New Jersey, without regard to conflict-of-law rules. Before filing a claim, the parties agree to attempt informal resolution by written notice sent to support@qualifiedcommercial.com or the mailing address listed above.",
        "Except for small claims, intellectual property, injunctive relief, or claims that cannot legally be arbitrated, disputes will be resolved by binding individual arbitration administered by the American Arbitration Association or a comparable arbitration provider selected by QualifiedCommercial if AAA is unavailable. Arbitration will occur on an individual basis only. Class actions, class arbitrations, representative actions, private attorney general actions, and jury trials are waived to the maximum extent permitted by law.",
      ],
    },
    {
      heading: "19. Termination",
      paragraphs: [
        "QualifiedCommercial may suspend or terminate access, remove content, disable features, or refuse service if a user violates these Terms, creates risk, fails to pay authorized fees, misuses communications, uploads unauthorized information, threatens platform integrity, or if continued service is not commercially, legally, or operationally appropriate. Termination does not eliminate payment obligations, record retention, audit rights, disclaimers, limitations, arbitration provisions, indemnity, or obligations that by nature should survive.",
      ],
    },
    {
      heading: "20. Contact",
      paragraphs: [
        "Questions about these Terms may be sent to Qualified Commercial LLC, 14 53rd St #408N, Brooklyn, NY 11232, email: support@qualifiedcommercial.com.",
      ],
    },
  ],
};

// TODO(compliance-review-es): Spanish translation of the Terms and
// Conditions — AI-assisted translation, NOT YET reviewed by a native-
// Spanish-speaking compliance reviewer. Do not treat as legally equivalent
// to the English version until reviewed and this TODO is removed.
export const TERMS_AND_CONDITIONS_ES: LegalDocument = {
  title: "Términos y Condiciones",
  effectiveDate: "19 de mayo de 2026",
  preamble:
    "Qualified Commercial LLC — formada en Nueva Jersey. Dirección postal: 14 53rd St #408N, Brooklyn, NY 11232. Contacto: support@qualifiedcommercial.com. Versión 1.0, aprobada por Jonathan Franco, Socio Ejecutivo. Estos Términos contienen limitaciones de responsabilidad, requisitos de responsabilidad del usuario, consentimiento de comunicación electrónica, limitaciones de IA, términos de autorización de pago, límites de disponibilidad del servicio, arbitraje y disposiciones de renuncia a acciones colectivas. Por favor léalos cuidadosamente antes de usar la plataforma.",
  sections: [
    {
      heading: "1. Aceptación de los Términos",
      paragraphs: [
        "Estos Términos y Condiciones son un acuerdo vinculante entre el usuario y Qualified Commercial LLC. Al crear una cuenta, acceder a la plataforma, usar la aplicación móvil, invitar a un cliente, subir un documento, delegar tareas a la IA, firmar electrónicamente, autorizar comunicaciones, enviar un expediente de financiamiento o de otro modo usar QualifiedCommercial, el usuario acepta estos Términos.",
        "Si un usuario actúa en nombre de una empresa, prestatario, cliente, garante, agente inmobiliario, corredor, agente u otra organización, el usuario declara que tiene autoridad para vincular a esa persona u organización y para proporcionar información, consentimientos, documentos e instrucciones a través de la plataforma.",
      ],
    },
    {
      heading: "2. Descripción de los servicios",
      paragraphs: [
        "QualifiedCommercial proporciona una plataforma tecnológica para flujos de trabajo de financiamiento comercial e inmobiliario. La plataforma puede incluir admisión de clientes, recopilación de documentos, revisión de expedientes asistida por IA, auditoría interna de expedientes, gestión de tareas, herramientas de pipeline para agentes inmobiliarios/corredores/agentes, notificaciones móviles, flujos de firma electrónica, flujos de autorización de pago, herramientas de comunicación, preparación de paquetes para prestamistas y envío de paquetes validados a compañías de préstamo o socios de financiamiento externos seleccionados.",
        "A menos que un acuerdo escrito separado indique lo contrario, Qualified Commercial LLC no es el prestamista, el administrador del préstamo, la agencia de informes de crédito, la agencia de calificación crediticia, el tasador, la compañía de títulos, el agente de liquidación, el proveedor de seguros, el asesor fiscal, el abogado, el contador público o el proveedor de soporte al cliente de servicio de préstamos posterior al cierre.",
      ],
    },
    {
      heading: "3. Elegibilidad y responsabilidad de la cuenta",
      paragraphs: [
        "Los usuarios deben proporcionar información precisa, actual y completa.",
        "Los usuarios deben mantener la confidencialidad de las credenciales de inicio de sesión, dispositivos, cuentas de correo electrónico y números de teléfono usados para verificación.",
        "Los usuarios deben actualizar rápidamente la información de la cuenta y del expediente de financiamiento si cambia.",
        "Los usuarios no pueden hacerse pasar por otra persona, subir información no autorizada, hacer un mal uso de la plataforma, interferir con la seguridad o intentar acceder a expedientes sin permiso.",
        "Los usuarios son responsables de la actividad bajo sus cuentas, incluyendo la actividad de empleados, asistentes, miembros del equipo, contratistas o representantes autorizados.",
      ],
    },
    {
      heading: "4. Expedientes de financiamiento, paquetes para prestamistas y sin garantía de aprobación",
      paragraphs: [
        "Las proyecciones de financiamiento, los términos de préstamo estimados, las observaciones generadas por IA, los escenarios de suscripción internos, las estimaciones de pago, las suposiciones de tasa, las estimaciones de apalancamiento, las estimaciones HUD, los cálculos de DSCR/LTV/LTC y resultados similares son preliminares e informativos. No son aprobaciones finales, compromisos de prestar, bloqueos de tasa, hojas de términos vinculantes, tasaciones, valoraciones, opiniones legales, asesoría fiscal ni garantías de cierre.",
        "La aprobación final, precios, condiciones, decisiones de crédito, requisitos de documentación, tratamiento de valoración, bloqueos de tasa, excepciones, financiamiento y servicio están controlados por el prestamista, la compañía de préstamo, el socio de financiamiento, el administrador, el inversor o el proveedor externo aplicable. Las proyecciones de préstamo y los términos internos pueden no cerrarse según lo proyectado debido a cambios del mercado, cambios de crédito, problemas de garantía, cambios de tasa, sobrecargas del prestamista, condiciones de la propiedad, retrasos de terceros, retrasos de documentos, retrasos del prestatario, retrasos humanos para bloquear tasas u otros factores.",
      ],
    },
    {
      heading: "5. Asistencia de IA y supervisión del usuario",
      paragraphs: [
        "QualifiedCommercial puede usar sistemas asistidos por IA para analizar información, identificar documentos faltantes, ayudar a preparar paquetes, redactar comunicaciones, apoyar la revisión de suscripción, resumir expedientes, gestionar flujos de trabajo y ayudar a agentes inmobiliarios/corredores/agentes. La IA puede cometer errores. La IA puede producir resultados incompletos, inexactos, obsoletos, inconsistentes o inapropiados. Los usuarios deben revisar el resultado de la IA antes de confiar en él, enviarlo, presentarlo o usarlo en un expediente de financiamiento.",
        "La IA no reemplaza la revisión humana, la suscripción del prestamista, la revisión legal, la revisión fiscal, el juicio profesional ni la responsabilidad del usuario. Los usuarios permanecen responsables de verificar la información, supervisar las tareas delegadas, corregir errores, confirmar consentimientos y determinar si un expediente está listo para el envío al prestamista.",
      ],
    },
    {
      heading: "6. Obligaciones de agentes inmobiliarios, corredores, agentes y usuarios profesionales",
      paragraphs: [
        "Los agentes inmobiliarios, corredores, agentes y otros usuarios profesionales son responsables de mantener sus relaciones con clientes, asegurar autoridad para subir información de clientes, obtener los consentimientos requeridos, supervisar el pipeline de IA, revisar las tareas delegadas, verificar las comunicaciones y asegurar que su uso de la plataforma cumpla con las obligaciones inmobiliarias, de préstamo, publicidad, privacidad, profesionales y de protección al consumidor que les apliquen.",
        "QualifiedCommercial no venderá leads o contactos de clientes subidos por agentes inmobiliarios, y no intentará hacer negocios con esos clientes fuera de la relación proporcionada por el agente inmobiliario, corredor o agente, excepto cuando el cliente contacte a QualifiedCommercial de manera independiente, se proporcione una autorización separada, la relación ya no sea aplicable, o la ley requiera acción. QualifiedCommercial puede comunicarse con dichos clientes según sea necesario para operar la plataforma, completar tareas delegadas por el usuario profesional, obtener documentos/firmas, procesar expedientes de financiamiento y enviar paquetes autorizados a prestamistas.",
      ],
    },
    {
      heading: "7. Consentimiento de comunicaciones",
      paragraphs: [
        "Al registrarse, proporcionar información de contacto, iniciar o participar en un expediente de financiamiento, aceptar una invitación o usar la plataforma, los usuarios consienten recibir comunicaciones relacionadas con la cuenta y el expediente de financiamiento de QualifiedCommercial y sus proveedores de servicios por correo electrónico, SMS/mensaje de texto, teléfono, notificación push móvil, mensaje dentro de la aplicación y canales similares. Las comunicaciones pueden incluir solicitudes de documentos, recordatorios de información faltante, solicitudes de firma electrónica, actualizaciones del expediente, mensajes del flujo de trabajo de IA, alertas de cuenta, mensajes de seguridad, avisos del paquete para el prestamista y avisos de servicio.",
        "Los mensajes SMS/de texto pueden enviarse a través de Twilio o proveedores similares. La frecuencia de los mensajes varía. Pueden aplicarse tarifas de mensajes y datos. Los usuarios pueden responder STOP para optar por no participar donde esté disponible y HELP para obtener ayuda donde esté disponible. Optar por no participar puede afectar la capacidad de recibir actualizaciones oportunas del expediente. Los mensajes de mercadotecnia/promocionales pueden requerir un consentimiento separado cuando la ley lo requiera.",
      ],
    },
    {
      heading: "8. Registros electrónicos y firmas electrónicas",
      paragraphs: [
        "Los usuarios consienten realizar transacciones electrónicamente, recibir registros electrónicos, firmar documentos electrónicamente y recibir copias a través de la plataforma o correo electrónico. Las firmas electrónicas, confirmaciones de casillas, nombres escritos, firmas dibujadas, acciones de clic para firmar, confirmaciones OTP y acciones similares pueden tratarse como firmas, consentimientos, autorizaciones y registros.",
        "La plataforma puede capturar el nombre del firmante, correo electrónico, teléfono, ID de usuario, dirección IP, dispositivo/navegador, fecha y hora, idioma de consentimiento, versión del documento, método de firma, pista de auditoría y hash del documento final. Los usuarios pueden solicitar copias en papel o retirar el consentimiento electrónico contactando a QualifiedCommercial, pero el retiro puede retrasar o impedir el uso continuado de la plataforma, la finalización de la firma, la autorización de crédito, la autorización de pago o el envío del paquete al prestamista.",
      ],
    },
    {
      heading: "9. Consultas de crédito, revisión de expedientes y compartición con el prestamista",
      paragraphs: [
        "La revisión interna del expediente puede incluir la revisión de información proporcionada por el usuario, agente inmobiliario, corredor, agente, prestatario, garante o representante autorizado. La revisión interna del expediente no necesariamente crea una consulta de crédito estricta. Una consulta de crédito estricta requiere una autorización separada. Cuando un usuario autoriza una consulta estricta, el usuario autoriza a QualifiedCommercial, su proveedor de crédito/reportes y las partes prestamistas seleccionadas a obtener reportes de consumidor, reportes de crédito e información de crédito relacionada para revisión de financiamiento, suscripción, procesamiento, colocación, servicio u otro propósito permisible relacionado. Una consulta de crédito estricta puede aparecer en el reporte de crédito del usuario y puede afectar su puntaje de crédito.",
        "Cuando un expediente de financiamiento sea validado y esté listo para suscripción real, QualifiedCommercial puede enviar el paquete de préstamo, los documentos y la información relacionada a compañías de préstamo, socios de financiamiento, procesadores, suscriptores, proveedores de crédito/reportes y proveedores de servicios de terceros seleccionados según sea autorizado o necesario para el flujo de financiamiento.",
      ],
    },
    {
      heading: "10. Autorización de pago y tarjeta de crédito",
      paragraphs: [
        "Si un usuario proporciona información de pago o firma una autorización de tarjeta de crédito, el usuario autoriza a QualifiedCommercial o a su procesador de pagos a cobrar al método de pago autorizado por los montos, propósitos, plazos y términos divulgados en la autorización aplicable o la pantalla de la plataforma. Los datos de tarjetas de pago deben procesarse usando métodos de pago tokenizados u hospedados cuando sea posible. QualifiedCommercial no almacena intencionalmente los códigos CVV/CVC y no debe almacenar números de tarjeta completos en las bases de datos de la plataforma ni en PDFs firmados.",
        "Los usuarios son responsables de asegurar que la información de pago sea precisa y que estén autorizados para usar el método de pago. Las tarifas, reembolsos, reversiones, contracargos y cancelaciones están regidos por la autorización de pago aplicable, los términos de la plataforma y cualquier acuerdo escrito separado.",
      ],
    },
    {
      heading: "11. Privacidad, protección de datos y publicidad",
      paragraphs: [
        "El uso de la plataforma está sujeto a la Política de Privacidad y al Aviso de Privacidad Financiera. QualifiedCommercial no vende información de prestatarios ni información de leads subidos por agentes inmobiliarios a cambio de dinero. QualifiedCommercial puede usar proveedores de servicios como AWS, Twilio, proveedores de correo electrónico, procesadores de pago, herramientas de firma electrónica/documentos, Meta/Facebook, Google Ads, proveedores de análisis y proveedores similares para operar, proteger, comunicar, anunciar, remercadear, medir y mejorar la plataforma.",
        "Los anuncios de remarketing pueden aparecer en el feed de redes sociales de un usuario, resultados de búsqueda, ubicaciones de display u otros canales digitales. Algunas leyes de privacidad pueden tratar ciertas actividades de remarketing o análisis como compartición o publicidad dirigida, incluso cuando no se vende información a cambio de dinero. Los usuarios pueden revisar las opciones de exclusión en la Política de Privacidad.",
      ],
    },
    {
      heading: "12. Disponibilidad del servicio y sistemas de terceros",
      paragraphs: [
        "La plataforma puede depender de AWS, proveedores de servicios de internet, operadores móviles, proveedores de SMS, proveedores de correo electrónico, procesadores de pago, tiendas de aplicaciones, proveedores de IA, proveedores de crédito/reportes, prestamistas y otros terceros. QualifiedCommercial no garantiza disponibilidad ininterrumpida, libre de errores, segura o en tiempo real. La plataforma puede experimentar tiempo de inactividad, retrasos, interrupciones, fallas de mensajes, problemas de sincronización de datos, rendimiento degradado o pérdida de acceso debido a mantenimiento, interrupción de proveedores, interrupción de AWS, evento cibernético, problema de operador, falla de internet, defecto de software o circunstancias fuera del control de QualifiedCommercial.",
      ],
    },
    {
      heading: "13. Usos prohibidos",
      paragraphs: [
        "Enviar información falsa, engañosa, no autorizada, incompleta o fraudulenta.",
        "Subir información de clientes, prestatarios, garantes o leads sin la autoridad o el consentimiento adecuados.",
        "Usar la plataforma para tomar decisiones de crédito, préstamo, vivienda, publicidad o discriminatorias no permitidas por la ley.",
        "Evadir la seguridad, extraer datos, realizar ingeniería inversa, interrumpir operaciones o intentar acceso no autorizado.",
        "Usar el resultado de la IA sin la revisión humana apropiada cuando el resultado afecte a un cliente, prestatario, expediente de financiamiento, paquete para el prestamista, pago u obligación legal/de cumplimiento.",
        "Enviar spam, mensajes de texto ilegales, llamadas ilegales, comunicaciones engañosas o mensajes sin el consentimiento requerido.",
      ],
    },
    {
      heading: "14. Propiedad intelectual",
      paragraphs: [
        "QualifiedCommercial, su software, diseño de flujo de trabajo, funciones del pipeline de IA, plantillas, interfaces, texto, gráficos, marca, logotipos y materiales de la plataforma son propiedad de Qualified Commercial LLC o sus licenciantes. Los usuarios reciben un derecho limitado, revocable, no exclusivo y no transferible para usar la plataforma solo para propósitos autorizados.",
      ],
    },
    {
      heading: "15. Renuncias de responsabilidad",
      paragraphs: [
        'La plataforma se proporciona "tal como está" y "según disponibilidad". En la máxima medida permitida por la ley, QualifiedCommercial renuncia a garantías de comerciabilidad, idoneidad para un propósito particular, título, no infracción, acceso ininterrumpido, operación libre de errores, precisión del resultado de la IA, aprobación de financiamiento, disponibilidad de tasa, aceptación del prestamista, cierre, rentabilidad, precisión de valoración o soporte de servicio posterior al cierre.',
      ],
    },
    {
      heading: "16. Limitación de responsabilidad",
      paragraphs: [
        "En la máxima medida permitida por la ley, QualifiedCommercial no será responsable por daños indirectos, incidentales, especiales, consecuentes, ejemplares, punitivos, pérdida de ganancias, pérdida de ingresos, pérdida de oportunidad, pérdida de reputación, pérdida de datos, interrupción del negocio, negación de financiamiento, retraso del préstamo, cambio de tasa, problema de servicio, decisión del prestamista externo, error de IA, retraso de mensajería o daños por interrupción. La responsabilidad total de QualifiedCommercial por cualquier reclamación no excederá el monto pagado por el usuario a QualifiedCommercial por el servicio que dio origen a la reclamación durante los tres meses anteriores al evento, o cien dólares si no se pagó ningún monto, a menos que la ley requiera un límite diferente.",
      ],
    },
    {
      heading: "17. Indemnización",
      paragraphs: [
        "Los usuarios acuerdan defender, indemnizar y mantener indemne a QualifiedCommercial, sus propietarios, funcionarios, empleados, contratistas, proveedores de servicios y afiliados de reclamaciones, pérdidas, responsabilidades, daños, costos y gastos que surjan del contenido del usuario, cargas no autorizadas, información inexacta, mal uso de la plataforma, violación de estos Términos, violación de la ley, disputas de clientes, fallas de consentimiento, obligaciones profesionales, disputas de pago o confianza en el resultado de la IA sin la revisión adecuada.",
      ],
    },
    {
      heading: "18. Ley aplicable, arbitraje y renuncia a acciones colectivas",
      paragraphs: [
        "Estos Términos se rigen por las leyes de Nueva Jersey, sin considerar reglas de conflicto de leyes. Antes de presentar una reclamación, las partes acuerdan intentar una resolución informal mediante notificación escrita enviada a support@qualifiedcommercial.com o a la dirección postal mencionada anteriormente.",
        "Excepto para reclamaciones de menor cuantía, propiedad intelectual, medidas cautelares o reclamaciones que legalmente no puedan arbitrarse, las disputas se resolverán mediante arbitraje individual vinculante administrado por la Asociación Americana de Arbitraje o un proveedor de arbitraje comparable seleccionado por QualifiedCommercial si la AAA no está disponible. El arbitraje se realizará únicamente de forma individual. Las acciones colectivas, arbitrajes colectivos, acciones representativas, acciones de fiscal general privado y juicios con jurado se renuncian en la máxima medida permitida por la ley.",
      ],
    },
    {
      heading: "19. Terminación",
      paragraphs: [
        "QualifiedCommercial puede suspender o terminar el acceso, eliminar contenido, deshabilitar funciones o negar el servicio si un usuario viola estos Términos, crea riesgo, no paga tarifas autorizadas, hace mal uso de las comunicaciones, sube información no autorizada, amenaza la integridad de la plataforma, o si el servicio continuado no es comercial, legal u operativamente apropiado. La terminación no elimina las obligaciones de pago, la retención de registros, los derechos de auditoría, las renuncias de responsabilidad, las limitaciones, las disposiciones de arbitraje, la indemnización u obligaciones que por su naturaleza deban sobrevivir.",
      ],
    },
    {
      heading: "20. Contacto",
      paragraphs: [
        "Las preguntas sobre estos Términos pueden enviarse a Qualified Commercial LLC, 14 53rd St #408N, Brooklyn, NY 11232, correo electrónico: support@qualifiedcommercial.com.",
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Funding, AI, Communications, and Platform Disclosure — v1.0 (2026-05-19)
// ---------------------------------------------------------------------------

export const FUNDING_AI_DISCLOSURE: LegalDocument = {
  title: "Funding, AI, Communications, and Platform Disclosure",
  effectiveDate: "May 19, 2026",
  preamble:
    "Qualified Commercial LLC — formed in New Jersey. Mailing address: 14 53rd St #408N, Brooklyn, NY 11232. Contact: support@qualifiedcommercial.com. Version 1.0, approved by Jonathan Franco, Executive Partner. This disclosure explains important limitations and consents related to funding projections, AI underwriting support, internal file audits, lender package submission, communications, e-signatures, payment authorization, advertising, data security, downtime, and post-closing servicing.",
  sections: [
    {
      heading: "1. QualifiedCommercial Is a Technology and Funding Workflow Platform",
      paragraphs: [
        "QualifiedCommercial helps users collect information, organize documents, prepare funding files, obtain authorizations, manage communications, and submit validated packages to selected third-party lending companies or funding partners. Unless a separate written agreement says otherwise, Qualified Commercial LLC does not itself provide the final loan, service the loan after closing, guarantee approval, guarantee closing, guarantee rate locks, or act as post-closing customer support for the lender or servicer.",
      ],
    },
    {
      heading: "2. AI Underwriter and AI Pipeline Disclosure",
      paragraphs: [
        "QualifiedCommercial uses AI-assisted underwriting and workflow tools. The AI may review uploaded documents, identify missing items, summarize files, generate internal observations, estimate scenarios, assist with communications, and help realtors/brokers/agents manage delegated pipeline tasks. AI can make mistakes. AI may produce inaccurate, incomplete, delayed, inconsistent, outdated, or unsupported results.",
        "AI-generated outputs are not final underwriting decisions, final lender decisions, legal advice, tax advice, appraisals, valuations, credit approvals, commitments to lend, rate locks, or guarantees. Human users, professional users, and lenders must review and validate information before using it for real underwriting, communications, payment authorization, signature requests, lender submission, or business decisions.",
      ],
    },
    {
      heading: "3. Internal File Audit and Hard Credit Pull Distinction",
      paragraphs: [
        "QualifiedCommercial may conduct an internal file audit using information supplied by the user, realtor, broker, agent, borrower, guarantor, or authorized representative. This internal audit may evaluate document completeness, funding fit, property information, financial information, user-supplied credit-related information, and potential lender-package readiness. An internal audit alone does not necessarily create a hard credit inquiry.",
        "A hard credit pull requires a separate authorization. If a user authorizes a hard pull, the user authorizes QualifiedCommercial, its credit/reporting provider, selected lending partners, funding partners, processors, underwriters, and related service providers to obtain consumer reports, credit reports, and related credit information for a permissible funding, underwriting, processing, placement, servicing, or related purpose. A hard credit inquiry may appear on the user's credit report and may affect the user's credit score.",
      ],
    },
    {
      heading: "4. Lender Package Submission and Third-Party Underwriting",
      paragraphs: [
        "When a file is validated and ready for real underwriting, QualifiedCommercial may push or transmit the lending package, documents, data, and related information to selected third-party lending companies, funding partners, processors, underwriters, credit/reporting vendors, and service providers. No unrelated party receives the information for independent marketing or lead sale purposes. Information is shared for the funding workflow, underwriting, processing, servicing, compliance, security, or legally required purposes described in the Privacy Policy.",
        "The lending company, funding partner, investor, underwriter, or servicer may impose additional requirements, request additional documents, adjust terms, decline the file, modify conditions, or make final decisions independently. QualifiedCommercial does not control every lender requirement or post-submission result.",
      ],
    },
    {
      heading: "5. Loan Projections, Terms, and Market Risk",
      paragraphs: [
        "Not all loan projections, scenarios, estimated HUDs, payment amounts, internal underwriting terms, AI findings, prequalification indicators, or expected lender terms close as projected. Results may change because of market changes, rate changes, lender overlays, credit information, property valuation, appraisal results, title issues, insurance issues, borrower delay, document delay, human delay to lock rates, third-party processing time, lender conditions, servicing requirements, or other factors.",
        "Users should not rely on preliminary projections as a guarantee of profitability, affordability, approval, rate, funding amount, closing date, or final lender acceptance.",
      ],
    },
    {
      heading: "6. Realtor, Broker, and Agent Responsibility",
      paragraphs: [
        "Realtors, brokers, agents, and professional users are responsible for supervising the AI pipeline, reviewing delegated tasks, maintaining proper authority from their clients, obtaining client consents, verifying documents, checking communications before sending, and ensuring that their use of QualifiedCommercial complies with professional, advertising, real estate, lending, privacy, and consumer protection obligations.",
        "QualifiedCommercial will not sell realtor-uploaded leads or client contacts and will not attempt to make business with those clients outside the relationship provided by the realtor, broker, or agent, except where the client independently contacts QualifiedCommercial, a separate authorization is provided, the relationship is no longer applicable, or law requires action. QualifiedCommercial may communicate with those clients as needed to complete authorized file tasks, signatures, document requests, AI workflow messages, and lender package processing.",
      ],
    },
    {
      heading: "7. Communications Consent",
      paragraphs: [
        "By signing up, creating an account, accepting an invitation, providing a phone number, starting a file, participating in a file, or using the platform, the user consents to receive account-related and funding-file-related emails, SMS/text messages, phone calls, mobile push notifications, in-app messages, and similar communications from QualifiedCommercial and its service providers.",
        "Messages may relate to account access, identity verification, file updates, document requests, signature requests, missing items, payment authorization, AI workflow tasks, lender package status, reminders, security, service announcements, and support. SMS/text messages may be sent through Twilio or another provider. Message frequency varies. Message and data rates may apply. Reply STOP to opt out where supported and HELP for help where supported. Opting out may prevent timely file processing or reduce platform functionality.",
      ],
    },
    {
      heading: "8. Mobile Application and Push Notifications",
      paragraphs: [
        "The mobile application may send push notifications about account activity, file updates, AI tasks, missing documents, signature requests, lender submission status, security alerts, and service notices. Push notifications can be managed through device or app settings. Disabling push notifications may affect the user's ability to receive timely updates.",
      ],
    },
    {
      heading: "9. E-Signatures and Electronic Records",
      paragraphs: [
        "QualifiedCommercial may present authorizations, disclosures, consents, payment forms, credit pull authorizations, lender package authorizations, and other records electronically. By signing electronically or clicking to accept, the user agrees that electronic signatures, checkboxes, typed names, drawn signatures, click-to-sign actions, OTP confirmations, and similar actions may be legally binding and may be used to document consent.",
        "The platform may capture signer identity, email, phone, IP address, device/browser, timestamp, document version, consent text, audit trail, and final PDF or certificate. Users can request a paper copy or withdraw electronic consent by contacting QualifiedCommercial, but withdrawal may delay or prevent the completion of the file.",
      ],
    },
    {
      heading: "10. Payment and Credit Card Authorization",
      paragraphs: [
        "If a user authorizes a credit card or payment method, the user authorizes the charge or payment according to the amount, purpose, timing, and terms shown in the authorization screen or signed authorization. QualifiedCommercial should use tokenized or hosted payment processing where possible. QualifiedCommercial does not intentionally store CVV/CVC codes and should not store full raw card numbers in its database or signed PDFs. Payment records may show card brand, last four digits, expiration month/year, token/reference ID, authorized amount, purpose, timestamp, and audit record.",
      ],
    },
    {
      heading: "11. Privacy, Advertising, and Retargeting",
      paragraphs: [
        "QualifiedCommercial does not sell borrower information, realtor-uploaded leads, or client contact information for money. QualifiedCommercial may use Meta/Facebook, Google Ads, cookies, pixels, SDKs, and similar tools for analytics, retargeting, conversion measurement, and advertising. Retargeting ads may appear in the user's feed or other digital placements. Some laws may classify certain retargeting or analytics activity as targeted advertising or sharing, even when information is not sold for money. Users can review choices in the Privacy Policy.",
      ],
    },
    {
      heading: "12. Security, Encryption, and Downtime",
      paragraphs: [
        "QualifiedCommercial uses encryption and security controls designed to protect data. However, no system is perfectly secure. The platform may be unavailable, delayed, degraded, or interrupted due to AWS outages, third-party vendor outages, mobile carrier issues, internet failures, maintenance, security events, software defects, or other causes. QualifiedCommercial is not responsible for lender decisions, post-closing servicing support, or third-party outages outside its control.",
      ],
    },
    {
      heading: "13. No Post-Loan Servicing Support",
      paragraphs: [
        "After a loan closes or is transferred to a lending company, servicer, funding partner, or third party, post-closing servicing, payment processing, escrow questions, payoff statements, servicing disputes, modification requests, and lender customer support are handled by the lender, servicer, or applicable third party. QualifiedCommercial does not represent that it is the lender's customer support or servicing department unless a separate written servicing agreement expressly says so.",
      ],
    },
    {
      heading: "14. Contact",
      paragraphs: [
        "Questions about this disclosure may be sent to Qualified Commercial LLC, 14 53rd St #408N, Brooklyn, NY 11232, email: support@qualifiedcommercial.com.",
      ],
    },
  ],
};

// TODO(compliance-review-es): Spanish translation of the Funding, AI,
// Communications, and Platform Disclosure — AI-assisted translation, NOT
// YET reviewed by a native-Spanish-speaking compliance reviewer. Do not
// treat as legally equivalent to the English version until reviewed and
// this TODO is removed.
export const FUNDING_AI_DISCLOSURE_ES: LegalDocument = {
  title: "Divulgación de Financiamiento, IA, Comunicaciones y Plataforma",
  effectiveDate: "19 de mayo de 2026",
  preamble:
    "Qualified Commercial LLC — formada en Nueva Jersey. Dirección postal: 14 53rd St #408N, Brooklyn, NY 11232. Contacto: support@qualifiedcommercial.com. Versión 1.0, aprobada por Jonathan Franco, Socio Ejecutivo. Esta divulgación explica limitaciones y consentimientos importantes relacionados con proyecciones de financiamiento, apoyo de suscripción con IA, auditorías internas de expedientes, envío de paquetes para prestamistas, comunicaciones, firmas electrónicas, autorización de pago, publicidad, seguridad de datos, tiempo de inactividad y servicio posterior al cierre.",
  sections: [
    {
      heading: "1. QualifiedCommercial es una plataforma tecnológica y de flujo de trabajo de financiamiento",
      paragraphs: [
        "QualifiedCommercial ayuda a los usuarios a recopilar información, organizar documentos, preparar expedientes de financiamiento, obtener autorizaciones, gestionar comunicaciones y enviar paquetes validados a compañías de préstamo o socios de financiamiento externos seleccionados. A menos que un acuerdo escrito separado indique lo contrario, Qualified Commercial LLC no proporciona el préstamo final, no da servicio al préstamo después del cierre, no garantiza la aprobación, no garantiza el cierre, no garantiza bloqueos de tasa, ni actúa como soporte al cliente posterior al cierre para el prestamista o administrador.",
      ],
    },
    {
      heading: "2. Divulgación del suscriptor de IA y del pipeline de IA",
      paragraphs: [
        "QualifiedCommercial utiliza herramientas de suscripción y flujo de trabajo asistidas por IA. La IA puede revisar documentos subidos, identificar elementos faltantes, resumir expedientes, generar observaciones internas, estimar escenarios, ayudar con comunicaciones y ayudar a agentes inmobiliarios/corredores/agentes a gestionar tareas de pipeline delegadas. La IA puede cometer errores. La IA puede producir resultados inexactos, incompletos, tardíos, inconsistentes, obsoletos o no respaldados.",
        "Los resultados generados por IA no son decisiones finales de suscripción, decisiones finales del prestamista, asesoría legal, asesoría fiscal, tasaciones, valoraciones, aprobaciones de crédito, compromisos de prestar ni garantías. Los usuarios humanos, los usuarios profesionales y los prestamistas deben revisar y validar la información antes de usarla para suscripción real, comunicaciones, autorización de pago, solicitudes de firma, envío al prestamista o decisiones comerciales.",
      ],
    },
    {
      heading: "3. Distinción entre auditoría interna del expediente y consulta de crédito estricta",
      paragraphs: [
        "QualifiedCommercial puede realizar una auditoría interna del expediente usando información proporcionada por el usuario, agente inmobiliario, corredor, agente, prestatario, garante o representante autorizado. Esta auditoría interna puede evaluar la integridad de los documentos, la idoneidad del financiamiento, la información de la propiedad, la información financiera, la información relacionada con el crédito proporcionada por el usuario y la posible preparación del paquete para el prestamista. Una auditoría interna por sí sola no necesariamente crea una consulta de crédito estricta.",
        "Una consulta de crédito estricta requiere una autorización separada. Si un usuario autoriza una consulta estricta, el usuario autoriza a QualifiedCommercial, su proveedor de crédito/reportes, los socios prestamistas seleccionados, los socios de financiamiento, los procesadores, los suscriptores y los proveedores de servicios relacionados a obtener reportes de consumidor, reportes de crédito e información de crédito relacionada para un propósito permisible de financiamiento, suscripción, procesamiento, colocación, servicio o relacionado. Una consulta de crédito estricta puede aparecer en el reporte de crédito del usuario y puede afectar su puntaje de crédito.",
      ],
    },
    {
      heading: "4. Envío de paquete al prestamista y suscripción de terceros",
      paragraphs: [
        "Cuando un expediente sea validado y esté listo para suscripción real, QualifiedCommercial puede enviar o transmitir el paquete de préstamo, los documentos, los datos y la información relacionada a compañías de préstamo, socios de financiamiento, procesadores, suscriptores, proveedores de crédito/reportes y proveedores de servicios de terceros seleccionados. Ninguna parte no relacionada recibe la información para propósitos de mercadotecnia independiente o venta de leads. La información se comparte para el flujo de financiamiento, la suscripción, el procesamiento, el servicio, el cumplimiento o los propósitos legalmente requeridos descritos en la Política de Privacidad.",
        "La compañía de préstamo, el socio de financiamiento, el inversor, el suscriptor o el administrador puede imponer requisitos adicionales, solicitar documentos adicionales, ajustar términos, rechazar el expediente, modificar condiciones o tomar decisiones finales de manera independiente. QualifiedCommercial no controla cada requisito del prestamista ni cada resultado posterior al envío.",
      ],
    },
    {
      heading: "5. Proyecciones de préstamo, términos y riesgo de mercado",
      paragraphs: [
        "No todas las proyecciones de préstamo, escenarios, HUDs estimados, montos de pago, términos internos de suscripción, hallazgos de IA, indicadores de precalificación o términos esperados del prestamista se cierran según lo proyectado. Los resultados pueden cambiar debido a cambios del mercado, cambios de tasa, sobrecargas del prestamista, información de crédito, valoración de la propiedad, resultados de tasación, problemas de título, problemas de seguro, retraso del prestatario, retraso de documentos, retraso humano para bloquear tasas, tiempo de procesamiento de terceros, condiciones del prestamista, requisitos de servicio u otros factores.",
        "Los usuarios no deben confiar en las proyecciones preliminares como una garantía de rentabilidad, asequibilidad, aprobación, tasa, monto de financiamiento, fecha de cierre o aceptación final del prestamista.",
      ],
    },
    {
      heading: "6. Responsabilidad del agente inmobiliario, corredor y agente",
      paragraphs: [
        "Los agentes inmobiliarios, corredores, agentes y usuarios profesionales son responsables de supervisar el pipeline de IA, revisar las tareas delegadas, mantener la autoridad adecuada de sus clientes, obtener los consentimientos del cliente, verificar documentos, revisar las comunicaciones antes de enviarlas, y asegurar que su uso de QualifiedCommercial cumpla con las obligaciones profesionales, de publicidad, inmobiliarias, de préstamo, privacidad y protección al consumidor.",
        "QualifiedCommercial no venderá leads o contactos de clientes subidos por agentes inmobiliarios y no intentará hacer negocios con esos clientes fuera de la relación proporcionada por el agente inmobiliario, corredor o agente, excepto cuando el cliente contacte a QualifiedCommercial de manera independiente, se proporcione una autorización separada, la relación ya no sea aplicable, o la ley requiera acción. QualifiedCommercial puede comunicarse con dichos clientes según sea necesario para completar tareas de expediente autorizadas, firmas, solicitudes de documentos, mensajes del flujo de trabajo de IA y procesamiento del paquete para el prestamista.",
      ],
    },
    {
      heading: "7. Consentimiento de comunicaciones",
      paragraphs: [
        "Al registrarse, crear una cuenta, aceptar una invitación, proporcionar un número de teléfono, iniciar un expediente, participar en un expediente o usar la plataforma, el usuario consiente recibir correos electrónicos, mensajes SMS/de texto, llamadas telefónicas, notificaciones push móviles, mensajes dentro de la aplicación y comunicaciones similares relacionadas con la cuenta y el expediente de financiamiento de QualifiedCommercial y sus proveedores de servicios.",
        "Los mensajes pueden relacionarse con acceso a la cuenta, verificación de identidad, actualizaciones del expediente, solicitudes de documentos, solicitudes de firma, elementos faltantes, autorización de pago, tareas del flujo de trabajo de IA, estado del paquete para el prestamista, recordatorios, seguridad, anuncios de servicio y soporte. Los mensajes SMS/de texto pueden enviarse a través de Twilio u otro proveedor. La frecuencia de los mensajes varía. Pueden aplicarse tarifas de mensajes y datos. Responda STOP para optar por no participar donde esté disponible y HELP para obtener ayuda donde esté disponible. Optar por no participar puede impedir el procesamiento oportuno del expediente o reducir la funcionalidad de la plataforma.",
      ],
    },
    {
      heading: "8. Aplicación móvil y notificaciones push",
      paragraphs: [
        "La aplicación móvil puede enviar notificaciones push sobre actividad de la cuenta, actualizaciones del expediente, tareas de IA, documentos faltantes, solicitudes de firma, estado de envío al prestamista, alertas de seguridad y avisos de servicio. Las notificaciones push pueden gestionarse a través de la configuración del dispositivo o la aplicación. Deshabilitar las notificaciones push puede afectar la capacidad del usuario de recibir actualizaciones oportunas.",
      ],
    },
    {
      heading: "9. Firmas electrónicas y registros electrónicos",
      paragraphs: [
        "QualifiedCommercial puede presentar autorizaciones, divulgaciones, consentimientos, formularios de pago, autorizaciones de consulta de crédito, autorizaciones del paquete para el prestamista y otros registros electrónicamente. Al firmar electrónicamente o hacer clic para aceptar, el usuario acepta que las firmas electrónicas, casillas, nombres escritos, firmas dibujadas, acciones de clic para firmar, confirmaciones OTP y acciones similares pueden ser legalmente vinculantes y pueden usarse para documentar el consentimiento.",
        "La plataforma puede capturar la identidad del firmante, correo electrónico, teléfono, dirección IP, dispositivo/navegador, fecha y hora, versión del documento, texto de consentimiento, pista de auditoría y PDF final o certificado. Los usuarios pueden solicitar una copia en papel o retirar el consentimiento electrónico contactando a QualifiedCommercial, pero el retiro puede retrasar o impedir la finalización del expediente.",
      ],
    },
    {
      heading: "10. Autorización de pago y tarjeta de crédito",
      paragraphs: [
        "Si un usuario autoriza una tarjeta de crédito o método de pago, el usuario autoriza el cargo o pago según el monto, propósito, plazo y términos mostrados en la pantalla de autorización o en la autorización firmada. QualifiedCommercial debe usar procesamiento de pagos tokenizado u hospedado cuando sea posible. QualifiedCommercial no almacena intencionalmente los códigos CVV/CVC y no debe almacenar números de tarjeta completos en su base de datos o en PDFs firmados. Los registros de pago pueden mostrar la marca de la tarjeta, los últimos cuatro dígitos, el mes/año de vencimiento, el token/referencia, el monto autorizado, el propósito, la fecha y hora, y el registro de auditoría.",
      ],
    },
    {
      heading: "11. Privacidad, publicidad y remarketing",
      paragraphs: [
        "QualifiedCommercial no vende información de prestatarios, leads subidos por agentes inmobiliarios ni información de contacto de clientes a cambio de dinero. QualifiedCommercial puede usar Meta/Facebook, Google Ads, cookies, píxeles, SDKs y herramientas similares para análisis, remarketing, medición de conversiones y publicidad. Los anuncios de remarketing pueden aparecer en el feed del usuario u otras ubicaciones digitales. Algunas leyes pueden clasificar cierta actividad de remarketing o análisis como publicidad dirigida o compartición, incluso cuando la información no se vende a cambio de dinero. Los usuarios pueden revisar las opciones en la Política de Privacidad.",
      ],
    },
    {
      heading: "12. Seguridad, encriptación y tiempo de inactividad",
      paragraphs: [
        "QualifiedCommercial usa encriptación y controles de seguridad diseñados para proteger los datos. Sin embargo, ningún sistema es perfectamente seguro. La plataforma puede no estar disponible, retrasarse, degradarse o interrumpirse debido a interrupciones de AWS, interrupciones de proveedores externos, problemas de operadores móviles, fallas de internet, mantenimiento, eventos de seguridad, defectos de software u otras causas. QualifiedCommercial no es responsable de las decisiones del prestamista, el soporte de servicio posterior al cierre ni las interrupciones de terceros fuera de su control.",
      ],
    },
    {
      heading: "13. Sin soporte de servicio posterior al préstamo",
      paragraphs: [
        "Después de que un préstamo se cierre o se transfiera a una compañía de préstamo, administrador, socio de financiamiento o tercero, el servicio posterior al cierre, el procesamiento de pagos, las preguntas de fideicomiso, las declaraciones de liquidación, las disputas de servicio, las solicitudes de modificación y el soporte al cliente del prestamista son gestionados por el prestamista, el administrador o el tercero aplicable. QualifiedCommercial no representa que sea el departamento de soporte al cliente o servicio del prestamista a menos que un acuerdo de servicio escrito separado lo indique expresamente.",
      ],
    },
    {
      heading: "14. Contacto",
      paragraphs: [
        "Las preguntas sobre esta divulgación pueden enviarse a Qualified Commercial LLC, 14 53rd St #408N, Brooklyn, NY 11232, correo electrónico: support@qualifiedcommercial.com.",
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Dealer Partner NDA / Non-Solicitation Agreement — v2026-07-31-1
//
// TODO(legal-review): drafted by an engineer from the business's plain-
// English requirements, NOT by counsel. Must be reviewed by an attorney
// before being relied on in an actual dispute. This English text must stay
// byte-for-byte identical to app/services/broker_nda.py's
// broker_nda_document_text() -- the backend computes the SHA-256 document
// hash from ITS copy, and the certificate PDF embeds that hash as evidence
// of exactly what the signer agreed to. If either copy changes, update both
// and bump BROKER_NDA_VERSION / BROKER_NDA_DOCUMENT_VERSION together.
// ---------------------------------------------------------------------------

export const BROKER_NDA_DOCUMENT: LegalDocument = {
  title: "Dealer Partner Non-Disclosure and Non-Solicitation Agreement",
  effectiveDate: "July 31, 2026",
  preamble:
    'This Agreement is entered into between Qualified Commercial LLC ("QC", "Company") and the individual or entity identified below ("Partner", "you") in connection with Partner\'s access to the QC platform as a dealer partner / broker.',
  sections: [
    {
      heading: "1. Confidential Information",
      paragraphs: [
        "Partner acknowledges that in the course of using the QC platform, Partner will have access to QC's proprietary business model, underwriting processes, technology, pricing, and its relationships with banks, lenders, and other capital sources (collectively, \"Confidential Information\"). Partner agrees to hold all Confidential Information in strict confidence and not to disclose it to any third party, except as required by law.",
      ],
    },
    {
      heading: "2. Non-Solicitation and Non-Circumvention",
      paragraphs: [
        "Partner agrees not to use Confidential Information to build, operate, or assist a competing brokerage, lending, or underwriting business modeled on QC's business, processes, or technology. Any transaction, communication, or relationship Partner has with a bank, lender, or capital source that Partner is introduced to, or otherwise engages through, the QC platform must be processed exclusively through QC's brokerage/fintech entity or its designated executives. Partner will not contact, negotiate with, or transact directly with any such bank, lender, or capital source outside of the QC platform in connection with any deal originated on or through the platform.",
      ],
    },
    {
      heading: "3. Prior Relationships Disclosure",
      paragraphs: [
        "Partner may disclose, at the time of signing this Agreement, any pre-existing relationships with lenders, dealers, or other parties that Partner wishes to exclude from the scope of Section 2. Any relationship not disclosed at signing is presumed to be within the scope of this Agreement. QC reserves the right to dispute the scope or validity of any disclosed relationship.",
      ],
    },
    {
      heading: "4. Term and Survival",
      paragraphs: [
        "This Agreement is effective immediately upon signature and remains in effect for the duration of Partner's use of the QC platform. The obligations in Sections 1 and 2 survive for two (2) years following the termination of Partner's access to the QC platform or the end of Partner's relationship with QC, whichever occurs later.",
      ],
    },
    {
      heading: "5. Remedies",
      paragraphs: [
        "Partner acknowledges that a breach of this Agreement may cause QC irreparable harm for which monetary damages alone may be an inadequate remedy, and that QC is entitled to seek injunctive relief in addition to any other remedies available at law or in equity.",
      ],
    },
    {
      heading: "6. Electronic Signature",
      paragraphs: [
        "Partner consents to use electronic records and electronic signatures under the U.S. E-SIGN Act and UETA. Partner understands that their typed legal name, checkbox acknowledgment, drawn signature, any prior-relationships disclosure submitted, timestamp, IP address, and device/browser information will be retained by QC as evidence of this Agreement and may be used in connection with any dispute arising from it. Partner may request a copy of this signed record at any time.",
      ],
    },
  ],
};
