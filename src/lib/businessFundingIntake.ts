import { isResourceSourcePage } from "@/lib/resourceHandoff";
import type { PublicIntakeAttribution } from "@/lib/publicIntakeAttribution";

export const BUSINESS_ROOM_STORAGE_KEY = "qc.businessFunding.room";

export function businessFundingAttribution(search: string, locale: "en" | "es", resource: PublicIntakeAttribution = {}): Record<string, string> {
  const params = new URLSearchParams(search);
  const incomingPage = resource.page || params.get("page") || "";
  const page = isResourceSourcePage(incomingPage) || ["/business-funding", "/main-street", "/working-capital-loans", "/business-funding-intake"].includes(incomingPage)
    ? incomingPage : locale === "es" ? "/es/business-funding-intake" : "/business-funding-intake";
  const result: Record<string, string> = { source: "public_site", page, entry_page: page, program: "term_loan", funding_intent: "working_capital", vertical: "main_street", profile: "main_street_v1" };
  for (const key of ["campaign", "cta"] as const) {
    const value = resource[key] || params.get(key) || (key === "campaign" ? params.get("utm_campaign") : "");
    if (value && /^[A-Za-z0-9_-]{1,80}$/.test(value)) result[key] = value;
  }
  result.campaign ||= "business_funding";
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "gbraid", "wbraid"]) {
    const value = params.get(key)?.trim();
    if (value) result[key] = value.slice(0, 256);
  }
  return result;
}

/** Unknown stays null; never infer a precise credit score from a credit band. */
export function optionalBusinessAmount(raw: string): number | null {
  const text = raw.trim().replace(/[$,]/g, "");
  if (!text || !/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) && value > 0 && value <= 100_000_000 ? value : null;
}
