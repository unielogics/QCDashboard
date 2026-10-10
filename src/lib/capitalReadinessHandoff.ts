import type { Lang } from "@/lib/intakeCopy";

export type CapitalReadinessDiagnosticAnswers = {
  businessType: "dealer" | "main_street" | "real_estate" | "";
  years: "under_1" | "one_two" | "over_2" | "";
  revenue: string;
  grossProfit: string;
  netIncome: string;
  revenueTrend: "growing" | "stable" | "uneven" | "declining" | "";
  debtBurden: "under_10" | "ten_twenty" | "twenty_thirty" | "over_30" | "";
  cashRunway: "under_1" | "one_two" | "two_three" | "over_3" | "";
  credit: "strong" | "fair" | "rebuilding" | "unknown" | "";
  records: "current" | "partial" | "behind" | "";
  bankingBehavior: "clean" | "occasional" | "frequent" | "unknown" | "";
  collateral: "strong" | "some" | "none" | "unknown" | "";
  fundingPurpose: "working_capital" | "equipment" | "acquisition" | "real_estate" | "debt_refinance" | "mca_refinance" | "other" | "";
  propertyDebtService: string;
  occupancy: string;
};

export type CapitalReadinessDiagnosticResult = {
  band: "insufficient" | "ready_soon" | "three_six" | "six_twelve" | "one_plus";
  score: number | null;
  coverage: number;
  grossMargin: number | null;
  netMargin: number | null;
  propertyDscr: number | null;
  occupancy: number | null;
};

export type CapitalReadinessDiagnosticHandoff = {
  version: 1;
  source: "capital_readiness_diagnostic";
  locale: Lang;
  answers: CapitalReadinessDiagnosticAnswers;
  result: CapitalReadinessDiagnosticResult;
};

export type CapitalReadinessIntakePrefill = CapitalReadinessDiagnosticHandoff & {
  verification_status: "self_reported_unverified";
};

const FRAGMENT_PREFIX = "#capital-readiness=";
const MAX_FRAGMENT_CHARACTERS = 64_000;
export const PENDING_CAPITAL_READINESS_HANDOFF_KEY = "qc.pendingCapitalReadinessDiagnostic";
const PENDING_CAPITAL_READINESS_IDEMPOTENCY_KEY = "qc.pendingCapitalReadinessDiagnostic.idempotencyKey";

/**
 * Read the consented public diagnostic without putting financial answers in a
 * query string. The fragment is erased before decoding or validation, so an
 * invalid payload is also removed from browser history immediately.
 */
export function readCapitalReadinessHandoffFragment(): CapitalReadinessDiagnosticHandoff | null {
  if (typeof window === "undefined") return null;
  const fragment = window.location.hash;
  if (!fragment.startsWith(FRAGMENT_PREFIX)) return null;
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
  if (fragment.length > MAX_FRAGMENT_CHARACTERS) return null;
  try {
    const value = JSON.parse(decodeURIComponent(fragment.slice(FRAGMENT_PREFIX.length)));
    return isDiagnosticHandoff(value) ? value : null;
  } catch {
    return null;
  }
}

export function toCapitalReadinessIntakePrefill(handoff: CapitalReadinessDiagnosticHandoff): CapitalReadinessIntakePrefill {
  return { ...handoff, verification_status: "self_reported_unverified" };
}

export function storePendingCapitalReadinessHandoff(handoff: CapitalReadinessDiagnosticHandoff): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.sessionStorage.removeItem(PENDING_CAPITAL_READINESS_IDEMPOTENCY_KEY);
    window.sessionStorage.setItem(
      PENDING_CAPITAL_READINESS_HANDOFF_KEY,
      JSON.stringify(toCapitalReadinessIntakePrefill(handoff)),
    );
    return true;
  } catch {
    return false;
  }
}

export function readPendingCapitalReadinessHandoff(): CapitalReadinessIntakePrefill | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PENDING_CAPITAL_READINESS_HANDOFF_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as unknown;
    if (isDiagnosticHandoff(value) && (value as Record<string, unknown>).verification_status === "self_reported_unverified") {
      return value as CapitalReadinessIntakePrefill;
    }
    window.sessionStorage.removeItem(PENDING_CAPITAL_READINESS_HANDOFF_KEY);
    return null;
  } catch {
    try { window.sessionStorage.removeItem(PENDING_CAPITAL_READINESS_HANDOFF_KEY); } catch { /* blocked storage */ }
    return null;
  }
}

export function clearPendingCapitalReadinessHandoff(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PENDING_CAPITAL_READINESS_HANDOFF_KEY);
    window.sessionStorage.removeItem(PENDING_CAPITAL_READINESS_IDEMPOTENCY_KEY);
  } catch { /* blocked storage */ }
}

export function pendingCapitalReadinessIdempotencyKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.sessionStorage.getItem(PENDING_CAPITAL_READINESS_IDEMPOTENCY_KEY);
    if (existing) return existing;
    const key = globalThis.crypto?.randomUUID?.() ?? fallbackUuid();
    window.sessionStorage.setItem(PENDING_CAPITAL_READINESS_IDEMPOTENCY_KEY, key);
    return key;
  } catch {
    return null;
  }
}

export function readinessFundingPurposeLabel(value: CapitalReadinessDiagnosticAnswers["fundingPurpose"], locale: Lang): string {
  const labels: Record<Exclude<CapitalReadinessDiagnosticAnswers["fundingPurpose"], "">, [string, string]> = {
    working_capital: ["Working capital", "Capital de trabajo"],
    equipment: ["Equipment", "Equipo"],
    acquisition: ["Business acquisition", "Adquisición de negocio"],
    real_estate: ["Real estate", "Bienes raíces"],
    debt_refinance: ["Debt refinance", "Refinanciamiento de deuda"],
    mca_refinance: ["MCA refinance", "Refinanciamiento de MCA"],
    other: ["Other", "Otro"],
  };
  return value ? labels[value][locale === "es" ? 1 : 0] : "";
}

function isDiagnosticHandoff(value: unknown): value is CapitalReadinessDiagnosticHandoff {
  if (!isRecord(value) || value.version !== 1 || value.source !== "capital_readiness_diagnostic") return false;
  if (value.locale !== "en" && value.locale !== "es") return false;
  if (!isRecord(value.answers) || !isRecord(value.result)) return false;
  const answers = value.answers;
  const result = value.result;
  return isOneOf(answers.businessType, ["dealer", "main_street", "real_estate", ""])
    && isOneOf(answers.years, ["under_1", "one_two", "over_2", ""])
    && areStrings(answers, ["revenue", "grossProfit", "netIncome", "propertyDebtService", "occupancy"])
    && isOneOf(answers.revenueTrend, ["growing", "stable", "uneven", "declining", ""])
    && isOneOf(answers.debtBurden, ["under_10", "ten_twenty", "twenty_thirty", "over_30", ""])
    && isOneOf(answers.cashRunway, ["under_1", "one_two", "two_three", "over_3", ""])
    && isOneOf(answers.credit, ["strong", "fair", "rebuilding", "unknown", ""])
    && isOneOf(answers.records, ["current", "partial", "behind", ""])
    && isOneOf(answers.bankingBehavior, ["clean", "occasional", "frequent", "unknown", ""])
    && isOneOf(answers.collateral, ["strong", "some", "none", "unknown", ""])
    && isOneOf(answers.fundingPurpose, ["working_capital", "equipment", "acquisition", "real_estate", "debt_refinance", "mca_refinance", "other", ""])
    && isOneOf(result.band, ["insufficient", "ready_soon", "three_six", "six_twelve", "one_plus"])
    && isNullableFiniteNumber(result.score)
    && isFiniteNumber(result.coverage)
    && isNullableFiniteNumber(result.grossMargin)
    && isNullableFiniteNumber(result.netMargin)
    && isNullableFiniteNumber(result.propertyDscr)
    && isNullableFiniteNumber(result.occupancy);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function areStrings(value: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((key) => typeof value[key] === "string" && (value[key] as string).length <= 64);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

function fallbackUuid(): string {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (digit) =>
    (Number(digit) ^ Math.floor(Math.random() * 16) >> Number(digit) / 4).toString(16),
  );
}
