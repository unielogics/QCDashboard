import { MAIN_STREET_INDUSTRIES } from "@/lib/intakeIndustries";
import { US_STATES } from "@/lib/usStates";

// New applications collect the business location, an explicitly selected
// industry, website (or "N/A"), and a description for industry classification.
// The older two-answer helpers remain available for historical/partial edits.
//
// The website rule mirrors qcbackend `app/services/business_profile.py`, which
// is the authority: it normalises what is sent and refuses what is not a web
// address. This copy exists so a page can say so before the request, in the
// client's language. Change both.

export type Lang = "en" | "es";

export const DESCRIPTION_MIN = 10;
export const DESCRIPTION_MAX = 1000;

// Address capture follows backend clean_address. A valid mailing state/code
// does not establish geographic eligibility for a particular lending program.
export const BUSINESS_STATES = [...US_STATES, ...["AS", "GU", "MP", "PR", "VI", "AA", "AE", "AP"].map((code) => ({ code, name: code }))];
export const BUSINESS_STATE_CODES = new Set(BUSINESS_STATES.map((state) => state.code));

const NONE_WORDS = new Set([
  "n/a", "na", "n.a", "n a", "none", "no", "nope", "not applicable", "no website", "no site", "none yet", "-", "--",
  "dont have one", "don't have one", "do not have one", "no tengo", "ninguno", "ninguna", "no aplica",
]);

const HOST = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}(?::\d{2,5})?$/i;

export type WebsiteAnswer =
  | { kind: "blank" }
  | { kind: "none" }
  | { kind: "site"; website: string }
  | { kind: "invalid" };

const squash = (value: string) => value.trim().replace(/\s+/g, " ");

/** What the client typed in the website box, read the way the server reads it. */
export function readWebsite(raw: string): WebsiteAnswer {
  const text = squash(raw);
  if (!text) return { kind: "blank" };
  const folded = text.toLowerCase();
  if (NONE_WORDS.has(folded) || NONE_WORDS.has(folded.replace(/[ .]+$/g, ""))) return { kind: "none" };
  const scheme = /^(https?):\/\//i.exec(text);
  const rest = scheme ? text.slice(scheme[0].length) : text;
  if (rest.includes(" ") || text.length > 255) return { kind: "invalid" };
  const [host, ...path] = rest.split("/");
  if (!HOST.test(host)) return { kind: "invalid" };
  const tail = path.join("/");
  // A bare trailing slash is nothing; a real path is kept exactly as typed.
  const keep = tail.replace(/\//g, "") === "" ? "" : `/${tail}`;
  const protocol = scheme ? scheme[1].toLowerCase() : "https";
  return { kind: "site", website: `${protocol}://${host.toLowerCase()}${keep}` };
}

const MESSAGES: Record<Lang, { website: string; websiteRequired: string; description: string; descriptionRequired: string }> = {
  en: {
    website: "Enter your website address (like example.com), or N/A if the business does not have one.",
    websiteRequired: "Enter the business website, or N/A if it does not have one.",
    description: `Describe the business in a sentence or two (at least ${DESCRIPTION_MIN} characters).`,
    descriptionRequired: "Tell us briefly what the business does.",
  },
  es: {
    website: "Escriba la dirección de su sitio web (por ejemplo, ejemplo.com), o N/A si el negocio no tiene uno.",
    websiteRequired: "Escriba el sitio web del negocio, o N/A si no tiene uno.",
    description: `Describa el negocio en una o dos frases (al menos ${DESCRIPTION_MIN} caracteres).`,
    descriptionRequired: "Cuéntenos brevemente a qué se dedica el negocio.",
  },
};

/** The first thing wrong with the two answers, in the client's language, or null. */
export function businessProfileProblem(
  answers: { website: string; description: string },
  language: Lang = "en",
): string | null {
  const words = MESSAGES[language] ?? MESSAGES.en;
  const website = readWebsite(answers.website);
  if (website.kind === "blank") return words.websiteRequired;
  if (website.kind === "invalid") return words.website;
  const description = squash(answers.description);
  if (!description) return words.descriptionRequired;
  if (description.length < DESCRIPTION_MIN) return words.description;
  return null;
}

/** The two fields as the start request carries them. The server normalises the
 *  address and keeps "N/A" as "no website". */
export function businessProfileBody(answers: { website: string; description: string }) {
  return {
    business_website: squash(answers.website),
    business_description: squash(answers.description),
  };
}

export interface NewBusinessProfile {
  business_street: string;
  business_city: string;
  business_state: string;
  business_zip: string;
  industry: string;
  business_website: string;
  business_description: string;
}

export const emptyBusinessProfile = (): NewBusinessProfile => ({
  business_street: "", business_city: "", business_state: "", business_zip: "",
  industry: "", business_website: "", business_description: "",
});

export type BusinessProfileField = "street" | "city" | "state" | "zip" | "industry" | "website" | "description";

/** Validate one explicit answer. Partial editors may omit untouched fields. */
export function businessProfileFieldProblem(field: BusinessProfileField, raw: string, language: Lang = "en"): string | null {
  const value = squash(raw);
  const es = language === "es";
  switch (field) {
    case "street": return !value || value.length > 255 ? (es ? "Escriba la dirección del negocio (máximo 255 caracteres)." : "Enter the business street address (up to 255 characters).") : null;
    case "city": return !value || value.length > 120 ? (es ? "Escriba la ciudad del negocio (máximo 120 caracteres)." : "Enter the business city (up to 120 characters).") : null;
    case "state": return !BUSINESS_STATE_CODES.has(value.toUpperCase()) ? (es ? "Seleccione el estado del negocio." : "Select the business state.") : null;
    case "zip": return !/^\d{5}(?:-\d{4})?$/.test(value) ? (es ? "Escriba un código postal de 5 dígitos o ZIP+4." : "Enter a 5-digit ZIP code or ZIP+4.") : null;
    case "industry": return !MAIN_STREET_INDUSTRIES.some((item) => item.slug === value) ? (es ? "Seleccione la industria del negocio." : "Select the business industry.") : null;
    case "website": {
      const website = readWebsite(raw);
      return website.kind === "blank" ? MESSAGES[language].websiteRequired : website.kind === "invalid" ? MESSAGES[language].website : null;
    }
    case "description": return !value ? MESSAGES[language].descriptionRequired : value.length < DESCRIPTION_MIN ? MESSAGES[language].description : value.length > DESCRIPTION_MAX ? (es ? `Limite la descripción a ${DESCRIPTION_MAX} caracteres.` : `Keep the business description within ${DESCRIPTION_MAX} characters.`) : null;
  }
}

/** Required only for NEW intake creation; never apply to historical reads. */
export function newBusinessProfileProblem(answers: NewBusinessProfile, language: Lang = "en"): string | null {
  const fields: [BusinessProfileField, string][] = [
    ["street", answers.business_street], ["city", answers.business_city],
    ["state", answers.business_state], ["zip", answers.business_zip],
    ["industry", answers.industry], ["website", answers.business_website],
    ["description", answers.business_description],
  ];
  for (const [field, value] of fields) {
    const problem = businessProfileFieldProblem(field, value, language);
    if (problem) return problem;
  }
  return null;
}

export function newBusinessProfileBody(answers: NewBusinessProfile): NewBusinessProfile {
  return {
    business_street: squash(answers.business_street), business_city: squash(answers.business_city),
    business_state: squash(answers.business_state).toUpperCase(), business_zip: squash(answers.business_zip),
    industry: squash(answers.industry),
    ...businessProfileBody({ website: answers.business_website, description: answers.business_description }),
  };
}
