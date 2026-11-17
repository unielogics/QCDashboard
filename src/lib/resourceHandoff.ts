import { apiBase } from "@/lib/api";
import type { PublicIntakeAttribution } from "@/lib/publicIntakeAttribution";

export type ResourceGoal = "mca_refinance" | "merchant_cash_advance" | "term_loan";
export type ResourceHandoff = {
  goal: ResourceGoal;
  contact: { name: string; business_name: string; email: string; phone: string };
  answers: Record<string, unknown>;
  attribution: PublicIntakeAttribution;
  locale: "en" | "es";
};

/** Consume credentials before any network request, analytics, or history navigation. */
export function consumeResourceToken(location: Pick<Location, "hash" | "pathname" | "search">, history: Pick<History, "replaceState">): string | null {
  const fragment = new URLSearchParams(location.hash.replace(/^#/, ""));
  const raw = fragment.get("resource");
  if (raw === null) return null;
  fragment.delete("resource");
  const remainder = fragment.toString();
  history.replaceState(null, "", `${location.pathname}${location.search}${remainder ? `#${remainder}` : ""}`);
  return /^[A-Za-z0-9_.~-]{16,4096}$/.test(raw) ? raw : null;
}

/** Resource and Academy paths are a narrow attribution boundary, never arbitrary URLs. */
export function isResourceSourcePage(value: string): boolean {
  return /^(?:\/es)?\/(?:business-funding-check|funding-check|resources)(?:\/[a-z0-9-]+)?\/?$/.test(value)
    || /^(?:\/es)?\/academy(?:\/(?:category\/)?[a-z0-9-]+)?\/?$/.test(value);
}

export async function loadResourceHandoff(resourceToken: string, expectedGoal: ResourceGoal): Promise<ResourceHandoff> {
  const response = await fetch(`${apiBase}/api/v1/public/resources/handoff`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resource_token: resourceToken }), cache: "no-store",
  });
  if (!response.ok) throw new Error("Your resource result could not be loaded. You can complete the application below.");
  const value: unknown = await response.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("The resource result is unavailable.");
  const data = value as Partial<ResourceHandoff>;
  if (data.goal !== expectedGoal || !data.contact || ["name", "business_name", "email", "phone"].some((key) => typeof data.contact?.[key as keyof ResourceHandoff["contact"]] !== "string")) {
    throw new Error("This resource result belongs to a different funding review. Complete the application below to continue.");
  }
  return { goal: expectedGoal, contact: data.contact, answers: data.answers && typeof data.answers === "object" && !Array.isArray(data.answers) ? data.answers : {}, attribution: data.attribution ?? {}, locale: data.locale === "es" ? "es" : "en" };
}

export function resourceAnswerNumber(answers: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = answers[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

export function resourceTokenForEmail(token: string | null, handoff: ResourceHandoff | null, email: string): string | undefined {
  return token && handoff && email.trim().toLowerCase() === handoff.contact.email.trim().toLowerCase() ? token : undefined;
}

export function resourceAmountBand(value: number | null): string {
  return value === null ? "" : value < 25_000 ? "under_25k" : value < 50_000 ? "25k_50k" : value < 100_000 ? "50k_100k" : value < 250_000 ? "100k_250k" : "250k_plus";
}

export function resourceBusinessAgeBand(value: number | null): string {
  return value === null ? "" : value < .5 ? "under_6_months" : value < 1 ? "6_12_months" : value < 2 ? "1_2_years" : "2_plus_years";
}
