import { APP_ORIGIN, CAPITAL_APP_ORIGIN } from "./appUrl";

export const MCA_ROOM_STORAGE_KEY = "qc.mcaFunding.room";
export type McaIntakeLocale = "en" | "es";
export type McaIntakeAnswers = {
  full_name: string; business_name: string; email: string; phone: string;
  active_mca_count: string; has_modified_mca: string; last_year_tax_earnings: string;
  requested_amount: string; monthly_revenue: string; time_in_business: string;
};
export const emptyMcaIntakeAnswers: McaIntakeAnswers = {
  full_name: "", business_name: "", email: "", phone: "", active_mca_count: "",
  has_modified_mca: "", last_year_tax_earnings: "", requested_amount: "",
  monthly_revenue: "", time_in_business: "",
};
export function mcaPriorTaxYear(now = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: "America/New_York" }).format(now)) - 1;
}
export function mcaDeclarationDoesNotFit(answers: Pick<McaIntakeAnswers, "active_mca_count" | "has_modified_mca" | "last_year_tax_earnings">): boolean {
  return answers.active_mca_count === "3_plus" || /^\d+$/.test(answers.active_mca_count) && Number(answers.active_mca_count) > 2 || answers.has_modified_mca === "yes" || answers.last_year_tax_earnings === "negative";
}
export function mcaPublicAttribution(search: string, locale: McaIntakeLocale) {
  const params = new URLSearchParams(search);
  const paths = ["/", "/programs", "/main-street", "/business-funding", "/merchant-cash-advance", "/mca-funding-intake", "/programs/main-street", "/programs/merchant-cash-advance", "/industries/main-street", "/working-capital-loans", "/manufacturing-business-loans", "/medical-practice-financing", "/grocery-store-financing"];
  const allowedPages = new Set([...paths, ...paths.map((path) => path === "/" ? "/es" : `/es${path}`), "/es/"]);
  const incomingPage = params.get("page")?.trim() || "";
  const page = allowedPages.has(incomingPage) ? incomingPage : locale === "es" ? "/es/merchant-cash-advance" : "/merchant-cash-advance";
  const result: Record<string, string> = { source: "public_site", page, entry_page: page, vertical: "main_street", program: "merchant_cash_advance", funding_intent: "merchant_cash_advance", profile: "main_street_v1" };
  for (const key of ["campaign", "cta"]) {
    const value = (params.get(key) || (key === "campaign" ? params.get("utm_campaign") : ""))?.trim();
    if (value && /^[A-Za-z0-9_-]{1,80}$/.test(value)) result[key] = value;
  }
  result.campaign ||= "mca_funding";
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "gbraid", "wbraid"]) {
    const value = params.get(key)?.trim();
    if (value) result[key] = value.slice(0, 256);
  }
  return result;
}
/** Unknown declarations remain null; only reviewed source evidence can qualify. */
export function mcaIntakeRequest(answers: McaIntakeAnswers, pin: string, locale: McaIntakeLocale, idempotencyKey: string, search: string) {
  return {
    ...answers, full_name: answers.full_name.trim(), business_name: answers.business_name.trim(),
    email: answers.email.trim(), phone: answers.phone.trim(),
    active_mca_count: ["0", "1", "2"].includes(answers.active_mca_count) ? Number(answers.active_mca_count) : null,
    has_modified_mca: answers.has_modified_mca === "yes" ? true : answers.has_modified_mca === "no" ? false : null,
    monthly_revenue: answers.monthly_revenue === "unknown" ? null : answers.monthly_revenue,
    time_in_business: answers.time_in_business === "unknown" ? null : answers.time_in_business,
    tax_year: mcaPriorTaxYear(), secure_room_pin: pin, locale, idempotency_key: idempotencyKey,
    consent: true, consent_version: "mca-ai-intake-v3", terms_accepted: true, privacy_accepted: true,
    attribution: mcaPublicAttribution(search, locale), website: "",
  };
}
/** Only a QC PIN-room route may be opened; never retain a PIN from a pasted link. */
export function safeMcaRoomUrl(value: unknown, currentOrigin: string): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value, currentOrigin);
    if (![currentOrigin, APP_ORIGIN, CAPITAL_APP_ORIGIN].includes(url.origin)
      || !/^\/buckets\/request\/[^/]+\/?$/.test(url.pathname) || url.username || url.password) return null;
    const result = new URL(url.pathname, url.origin);
    result.searchParams.set("tab", "ai-review");
    return result.toString();
  } catch { return null; }
}

export type McaRoomReview = {
  funding_intent: "merchant_cash_advance"; business_name: string | null;
  preferred_language?: "en" | "es";
  payment_methods_enabled?: boolean;
  status: "not_started" | "queued" | "running" | "completed" | "failed";
  progress: { stage: string; label: string; percent: number | null; files_total: number; files_done: number };
  messages: Array<{ id: string; role: string; content: string; created_at: string; sender_kind?: string | null; author_name?: string | null }>;
  summary: string | null;
  requirements: Array<{ key: string; label: string; status: string; received: number; required: number; unit: string }>;
  actions: Array<{ kind: "upload" | "debt_schedule" | "application"; label: string }>;
  policy_status: "pending_review" | "needs_information" | "not_eligible" | "ready_for_staff_review";
};
