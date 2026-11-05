// Words for the first screen of every AI application beyond the contact
// fields each page already carries: the business website and description, and
// the three consent choices. One copy for all of them so the pages say the same
// thing in the same way.
//
// The wording of the SMS and legal consents themselves is NOT here. It comes
// from qcbackend (GET /public/sms-disclosure) because what is stored as proof
// has to be the exact text that was on screen. The Spanish tree below only
// labels the boxes around that text, which stays in English until a reviewed
// translation exists.

import type { Lang } from "@/lib/businessProfile";

export type OnboardingCopy = {
  fieldWebsite: string;
  fieldWebsitePlaceholder: string;
  fieldWebsiteHint: string;
  fieldDescription: string;
  fieldDescriptionPlaceholder: string;
  fieldDescriptionHint: string;
  consentLegalTitle: string;
  consentRequired: string;
  consentOptional: string;
  consentAppTitle: string;
  consentMarketingTitle: string;
  consentEnglishNote: string;
};

const en: OnboardingCopy = {
  fieldWebsite: "Business website",
  fieldWebsitePlaceholder: "example.com, or N/A",
  fieldWebsiteHint: "Type N/A if the business does not have one.",
  fieldDescription: "What does your business do?",
  fieldDescriptionPlaceholder: "A sentence or two, for example: We repair commercial HVAC systems for restaurants in Atlanta.",
  fieldDescriptionHint: "Brief is fine. It helps us match the right funding faster.",
  consentLegalTitle: "Terms and privacy",
  consentRequired: "Required",
  consentOptional: "Optional",
  consentAppTitle: "Application messages",
  consentMarketingTitle: "Marketing messages",
  consentEnglishNote: "",
};

const es: OnboardingCopy = {
  fieldWebsite: "Sitio web del negocio",
  fieldWebsitePlaceholder: "ejemplo.com, o N/A",
  fieldWebsiteHint: "Escriba N/A si el negocio no tiene uno.",
  fieldDescription: "¿A qué se dedica su negocio?",
  fieldDescriptionPlaceholder: "Una o dos frases, por ejemplo: Reparamos sistemas de aire acondicionado comerciales para restaurantes en Atlanta.",
  fieldDescriptionHint: "Algo breve es suficiente. Nos ayuda a encontrar el financiamiento adecuado más rápido.",
  consentLegalTitle: "Términos y privacidad",
  consentRequired: "Obligatorio",
  consentOptional: "Opcional",
  consentAppTitle: "Mensajes sobre la solicitud",
  consentMarketingTitle: "Mensajes promocionales",
  consentEnglishNote: "El texto completo de estos consentimientos se muestra en inglés.",
};

export function onboardingCopy(language: Lang | null | undefined): OnboardingCopy {
  return language === "es" ? es : en;
}
