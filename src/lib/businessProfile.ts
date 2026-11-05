// The two answers every AI application asks for on its first screen: the
// business's website (or "N/A") and a short description of what it does.
//
// The website rule mirrors qcbackend `app/services/business_profile.py`, which
// is the authority: it normalises what is sent and refuses what is not a web
// address. This copy exists so a page can say so before the request, in the
// client's language. Change both.

export type Lang = "en" | "es";

export const DESCRIPTION_MIN = 10;
export const DESCRIPTION_MAX = 600;

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
