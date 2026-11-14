/**
 * The Financials tab as one grid of read-only cards. Each function here turns
 * the cockpit into what one card prints, so the cards hold no arithmetic and
 * the same figures can be checked without a browser.
 *
 * "Before" is always the cockpit baseline: the selected earnings source read
 * as one ladder (app/services/financial_baseline.py). "After" is the saved
 * earnings plan where it has changes, and the saved loan terms for what only
 * the terms move. A side that cannot be computed says why; it is never blank.
 */

import { balanceRiskMonths, riskCountLabel, riskTotals } from "./balanceRisk";
import {
  cadenceLabel,
  monthShort,
  type BaselineMetrics,
  type CockpitBankSummary,
  type CockpitMonth,
  type FinancialCockpit,
} from "./financialCockpit";
import type { OperatingGoalRead } from "./operatingGoal";
import { operatingLabel, type OperatingEvaluation, type OperatingMetricValues } from "./operatingPlan";

export type OverviewTone = "ok" | "bad" | "warn" | "mut" | "acc";
export type OverviewTag = { label: string; tone: OverviewTone | "outline" };
export type OverviewCell = { text: string; tone?: OverviewTone };
export type OverviewRow = { key: string; cells: OverviewCell[]; strong?: boolean; muted?: boolean };
export type OverviewTable = { head: string[]; rows: OverviewRow[] };

/** GET /application-profiles/{id}/operating-plan/summary. */
export type PlanSummary = {
  /** "operating-plan-v2" once the plan has been saved from the four-step Earnings Plan. */
  model?: string;
  goal?: OperatingGoalRead;
  has_plan: boolean;
  state?: string;
  expense_count: number;
  action_count: number;
  reviewed_action_count: number;
  missing_count: number;
  version_number?: number | null;
  updated_at?: string | null;
  pdf_file_id?: string | null;
  /** The saved version the PDF belongs to. */
  version_id?: string | null;
  cost_mix: Array<{ category: string; annual_amount: number | null; missing_count: number; count: number }>;
  evaluation?: OperatingEvaluation | null;
};

// ---------------------------------------------------------------------------
// Formatting: a real minus sign, and a dash where there is no figure
// ---------------------------------------------------------------------------

const DASH = "—";
const MINUS = "−";
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const grouped = (value: number, digits = 0) => value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** −$22,377 */
export function usd(value: number | null | undefined, digits = 0): string {
  if (!finite(value)) return DASH;
  const text = grouped(Math.abs(value), digits);
  return `${value < 0 && Number(text.replace(/,/g, "")) !== 0 ? MINUS : ""}$${text}`;
}

/** +$89,616 · −$14,400 · $0 */
export function signedUsd(value: number | null | undefined): string {
  if (!finite(value)) return DASH;
  const text = grouped(Math.abs(value));
  if (Number(text.replace(/,/g, "")) === 0) return "$0";
  return `${value > 0 ? "+" : MINUS}$${text}`;
}

/** −0.03x */
export function times(value: number | null | undefined): string {
  if (!finite(value)) return DASH;
  const text = Math.abs(value).toFixed(2);
  return `${value < 0 && Number(text) !== 0 ? MINUS : ""}${text}x`;
}

/** +0.50x · −0.08x */
export function signedTimes(value: number | null | undefined): string {
  if (!finite(value)) return DASH;
  const text = Math.abs(value).toFixed(2);
  if (Number(text) === 0) return "0.00x";
  return `${value > 0 ? "+" : MINUS}${text}x`;
}

/** −2.5% (the value is already a percentage). */
export function percent(value: number | null | undefined, digits = 1): string {
  if (!finite(value)) return DASH;
  const text = Math.abs(value).toFixed(digits);
  return `${value < 0 && Number(text) !== 0 ? MINUS : ""}${text}%`;
}

/** +4.2% · −5.0% */
export function signedPercent(value: number | null | undefined, digits = 1): string {
  if (!finite(value)) return DASH;
  const text = Math.abs(value).toFixed(digits);
  if (Number(text) === 0) return `${text}%`;
  return `${value > 0 ? "+" : MINUS}${text}%`;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-30" → "Sep 30, 2026"; anything else is returned as it came. */
export function dayLabel(value: string | null | undefined): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ""));
  if (!match || !MONTH_NAMES[Number(match[2]) - 1]) return value ? String(value) : null;
  return `${MONTH_NAMES[Number(match[2]) - 1]} ${Number(match[3])}, ${match[1]}`;
}

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
const titled = (value: string) => value.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase());

// ---------------------------------------------------------------------------
// The six metrics, before and after
// ---------------------------------------------------------------------------

export type StripKey = keyof BaselineMetrics;
export type StripCell = {
  key: StripKey;
  label: string;
  /** Today, from the baseline. */
  value: string;
  /** A loss, a margin below zero or coverage under 1.00x. */
  negative: boolean;
  /** The figure with the plan and the terms, or null where there is none. */
  after: string | null;
  /** What the after figure assumes, or why there is none. */
  note: string;
  tone: OverviewTone;
  before: number | null;
  afterValue: number | null;
};

const STRIP: Array<[StripKey, string, keyof OperatingMetricValues]> = [
  ["ebitda", "EBITDA", "earnings"],
  ["noi", "NOI", "noi"],
  ["dscr", "DSCR", "dscr"],
  ["free_cash_flow", "Free cash flow", "cash_after_debt"],
  ["operating_margin", "Operating margin", "operating_margin"],
  ["debt_service", "Debt service", "debt_service"],
];

function formatMetric(key: StripKey, value: number | null | undefined): string {
  return key === "dscr" ? times(value) : key === "operating_margin" ? percent(value) : usd(value);
}

/** The baseline's six figures; the cockpit headlines stand in if the baseline block is missing. */
export function currentMetrics(cockpit: FinancialCockpit): Partial<BaselineMetrics> {
  const current = cockpit.baseline?.metrics?.current;
  if (current && Object.values(current).some((value) => value != null)) return current;
  const headline = cockpit.ebitda?.headline;
  const ebitda = headline?.annualized_value ?? headline?.value ?? null;
  const noiHeadline = cockpit.noi?.headline;
  const noi = noiHeadline?.annualized_value ?? noiHeadline?.value ?? null;
  const debt = cockpit.debt?.service?.annual ?? cockpit.dscr?.annual_debt_service ?? null;
  return {
    ebitda,
    noi,
    dscr: cockpit.dscr?.headline?.value ?? (finite(ebitda) && finite(debt) && debt > 0 ? Math.round((ebitda / debt) * 100) / 100 : null),
    free_cash_flow: finite(ebitda) && finite(debt) ? ebitda - debt : null,
    operating_margin: null,
    debt_service: debt,
  };
}

/** Plan changes that count: not excluded and not rejected. */
export function planChanges(evaluation: OperatingEvaluation | null | undefined) {
  return (evaluation?.actions ?? []).filter((row) => row.review_state !== "excluded" && row.review_state !== "rejected");
}

export function metricStrip(cockpit: FinancialCockpit, evaluation?: OperatingEvaluation | null): StripCell[] {
  const current = currentMetrics(cockpit);
  const terms = cockpit.baseline?.metrics?.with_terms ?? null;
  const comparison = evaluation?.comparison;
  const changes = planChanges(evaluation).length;
  const planOnTerms = comparison?.loan_basis === "saved_terms";
  const noSource = current.ebitda == null && current.noi == null;
  return STRIP.map(([key, label, planKey]) => {
    const before = finite(current[key]) ? (current[key] as number) : null;
    const debtSide = key === "dscr" || key === "free_cash_flow";
    const planned = changes > 0 && finite(comparison?.proposed?.[planKey]) ? (comparison!.proposed[planKey] as number) : null;
    let afterValue: number | null = null;
    let note: string;
    if (key === "debt_service") {
      afterValue = finite(terms?.debt_service) ? terms!.debt_service : null;
      note = afterValue != null ? "with terms" : "No loan terms saved";
    } else if (planned != null) {
      afterValue = planned;
      note = debtSide && planOnTerms ? "with plan and terms" : "with plan";
    } else if (debtSide && finite(terms?.[key])) {
      afterValue = terms![key] as number;
      note = "with terms";
    } else if (noSource) {
      note = "No earnings source yet";
    } else if (key === "dscr" && before == null && cockpit.dscr?.no_debt) {
      note = "No debt to cover";
    } else if (changes > 0) {
      note = "Plan needs inputs";
    } else {
      note = debtSide ? "No plan or terms yet" : "No plan changes yet";
    }
    const better = before == null || afterValue == null ? 0 : key === "debt_service" ? before - afterValue : afterValue - before;
    return {
      key,
      label,
      value: formatMetric(key, before),
      negative: before != null && key !== "debt_service" && (key === "dscr" ? before < 1 : before < 0),
      after: afterValue == null ? null : formatMetric(key, afterValue),
      note,
      tone: afterValue == null || Math.abs(better) < 0.005 ? "mut" : better > 0 ? "ok" : "bad",
      before,
      afterValue,
    };
  });
}

/**
 * Coverage after the saved terms in one sentence, on documented earnings and
 * with the earnings plan. The Underwriting tab prints it beside the terms, so
 * it reads the same figures as the strip above.
 */
export function coverageNotice(cockpit: FinancialCockpit, evaluation?: OperatingEvaluation | null): { text: string; tone: "ok" | "acc" | "warn" } | null {
  const dscr = metricStrip(cockpit, evaluation).find((cell) => cell.key === "dscr")!;
  if (dscr.before == null) return null;
  const terms = cockpit.baseline?.metrics?.with_terms?.dscr;
  const withTerms = finite(terms) ? terms : null;
  const withPlan = dscr.afterValue != null && dscr.note.includes("plan") ? dscr.afterValue : null;
  const documented = withTerms != null ? `Coverage after these terms is ${times(withTerms)} on documented earnings` : `Coverage today is ${dscr.value} on documented earnings`;
  const plan = withPlan != null
    ? ` and ${times(withPlan)} with the earnings plan.`
    : planChanges(evaluation).length ? ". The earnings plan needs inputs before it can be counted." : ". The earnings plan has no changes yet.";
  const best = withPlan ?? withTerms ?? dscr.before;
  return { text: `${documented}${plan}${withTerms == null ? " Save the loan terms to see coverage after them." : ""}`, tone: best >= 1.25 ? "ok" : best >= 1 ? "acc" : "warn" };
}

// ---------------------------------------------------------------------------
// Operating expenses and earnings plan
// ---------------------------------------------------------------------------

/** One step of the mini waterfall on the plan thumbnail, as percentages of its width. */
export type WaterfallBar = { left: number; right: number; tone: "bad" | "ok" | "acc" };
export type PlanCardModel = {
  chip: OverviewTag;
  /** The five rows printed on the thumbnail. */
  metrics: Array<{ key: StripKey; label: string; before: string; after: string }>;
  bars: WaterfallBar[];
  pdfCaption: string;
  earnings: { before: string; after: string };
  coverage: { before: string; after: string };
  gap: { value: string; met: boolean };
  rows: Array<{ key: string; label: string; ebitda: string; dscr: string; muted?: boolean; ebitdaTone?: OverviewTone }>;
  empty: string | null;
  footer: string[];
  costsTitle: string;
  costs: Array<{ key: string; label: string; amount: string; share: number }>;
  facts: Array<{ label: string; value: string }>;
};

/** What a plan in the current model (`operating-plan-v2`) adds to its evaluation: the engine's own result. */
type EnginePlan = {
  bridge?: { proposed?: Array<{ key: number; label: string; value: number }> };
  items?: Array<{ id: string; area: number; label: string; included: boolean }>;
};

/** How the saved plan's changes are grouped on the file page, in the plan's own order. */
const PLAN_SECTIONS: Array<{ key: string; label: string; kinds: string[] }> = [
  { key: "pricing", label: "Pricing", kinds: ["price_change"] },
  { key: "revenue", label: "Revenue drivers", kinds: ["unit_volume", "revenue_change"] },
  { key: "growth", label: "Growth", kinds: ["marketing_investment"] },
  { key: "cogs", label: "Cost of goods sold", kinds: ["product_cost_change"] },
  { key: "opex", label: "Operating expenses", kinds: ["expense_reduction", "expense_increase", "processing_cost_change"] },
  { key: "one_time", label: "One-time adjustments", kinds: ["one_time_adjustment"] },
];

/** Baseline, each step and the total as bars on one shared scale. */
export function waterfall(baseline: number | null, deltas: number[], total: number | null): WaterfallBar[] {
  if (baseline == null) return [];
  const points = [baseline];
  for (const delta of deltas) points.push(points[points.length - 1] + delta);
  const end = total ?? points[points.length - 1];
  const low = Math.min(0, end, ...points);
  const high = Math.max(0, end, ...points);
  const span = high - low || 1;
  const at = (value: number) => ((value - low) / span) * 100;
  const bar = (from: number, to: number, tone: WaterfallBar["tone"]): WaterfallBar => {
    let left = Math.min(at(from), at(to));
    let right = 100 - Math.max(at(from), at(to));
    // A step too small to see still gets a sliver, so the row is not empty.
    const short = 2 - (100 - left - right);
    if (short > 0) {
      if (right >= short) right -= short;
      else left = Math.max(0, left - short);
    }
    return { left: Math.round(left * 10) / 10, right: Math.round(right * 10) / 10, tone };
  };
  return [
    bar(0, baseline, baseline < 0 ? "bad" : "acc"),
    ...deltas.map((delta, index) => bar(points[index], points[index + 1], delta < 0 ? "bad" : "ok")),
    bar(0, end, end < 0 ? "bad" : "acc"),
  ];
}

export function planCard(cockpit: FinancialCockpit, summary: PlanSummary | null | undefined, fallback?: OperatingEvaluation | null): PlanCardModel {
  const evaluation = summary?.evaluation ?? fallback ?? null;
  const strip = metricStrip(cockpit, evaluation);
  const cell = (key: StripKey) => strip.find((row) => row.key === key)!;
  const debt = cockpit.baseline?.debt_service ?? {};
  const current = currentMetrics(cockpit);
  const terms = cockpit.baseline?.metrics?.with_terms ?? null;
  const debtAfter = finite(debt.with_terms_annual) ? debt.with_terms_annual : finite(debt.current_annual) ? debt.current_annual : finite(current.debt_service) ? current.debt_service : null;
  const ebitdaAfter = cell("ebitda").afterValue ?? cell("ebitda").before;
  const gap = ebitdaAfter != null && debtAfter != null && debtAfter > 0 ? Math.max(0, 1.25 * debtAfter - ebitdaAfter) : null;

  const rows: PlanCardModel["rows"] = [];
  if (finite(debt.with_terms_monthly) && finite(debt.current_monthly)) {
    rows.push({
      key: "terms",
      label: `${debt.terms?.label || "Loan terms"} · payments ${usd(debt.current_monthly)} → ${usd(debt.with_terms_monthly)} / month`,
      ebitda: "no change",
      dscr: `${times(current.dscr)} → ${times(terms?.dscr)}`,
      muted: true,
    });
  }
  const changes = planChanges(evaluation);
  const deltas: number[] = [];
  const joined = (names: string[]) => (names.length === 1 ? names[0] : names.length === 2 ? names.join(", ") : `${names[0]} and ${names.length - 1} more`);
  // A plan in the current model carries its own bridge: the sections applied in a fixed order, each on top of the ones
  // above, so the rows add up exactly to the plan figure. (A change's own effect does not: changes interact.)
  const engine = (evaluation as { plan?: EnginePlan } | null)?.plan;
  const bridge = engine?.bridge?.proposed ?? null;
  for (const step of bridge ?? []) {
    const members = (engine?.items ?? []).filter((item) => item.included && item.area === step.key);
    if (!members.length || !finite(step.value)) continue;
    deltas.push(step.value);
    rows.push({
      key: `step-${step.key}`,
      label: `${step.label} · ${joined(members.map((item) => item.label))}`,
      ebitda: signedUsd(step.value),
      dscr: debtAfter != null && debtAfter > 0 ? signedTimes(step.value / debtAfter) : DASH,
      ebitdaTone: step.value < 0 ? "bad" : undefined,
    });
  }
  const sections = bridge ? [] : [...PLAN_SECTIONS, { key: "other", label: "Other changes", kinds: [] as string[] }];
  const placed = new Set<string>();
  for (const section of sections) {
    const members = changes.filter((row) => (section.key === "other" ? !placed.has(row.id) : section.kinds.includes(row.kind)));
    if (!members.length) continue;
    for (const row of members) placed.add(row.id);
    const counted = members.filter((row) => row.proposed_math_valid !== false && finite(row.net_annual_impact));
    const total = counted.reduce((sum, row) => sum + (row.net_annual_impact as number), 0);
    const detail = joined(members.map((row) => row.label || operatingLabel(row.kind)));
    const waiting = members.length - counted.length;
    if (counted.length) deltas.push(total);
    rows.push({
      key: section.key,
      label: `${section.label} · ${detail}`,
      ebitda: counted.length ? `${signedUsd(total)}${waiting ? ` · ${waiting} need inputs` : ""}` : "Needs inputs",
      dscr: counted.length && debtAfter != null && debtAfter > 0 ? signedTimes(total / debtAfter) : DASH,
      ebitdaTone: !counted.length ? "warn" : total < 0 ? "bad" : undefined,
    });
  }

  const footer: string[] = [];
  if (summary?.has_plan) {
    footer.push(`${plural(summary.expense_count, "cost line")} · ${plural(summary.action_count, "change")} · ${summary.reviewed_action_count} reviewed`);
    if (summary.missing_count) footer.push(`${plural(summary.missing_count, "item")} to finish`);
  }
  if (evaluation && !evaluation.baseline?.currency) footer.push("Currency unconfirmed");

  // Costs: what the plan discloses, else the lines of the earnings source.
  const disclosed = (summary?.cost_mix ?? []).filter((row) => finite(row.annual_amount) && row.annual_amount > 0).sort((a, b) => (b.annual_amount as number) - (a.annual_amount as number)).slice(0, 5);
  const groups = [...(cockpit.baseline?.groups?.rows ?? [])].filter((row) => finite(row.amount) && row.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 5);
  // A plan in the current model lists its costs under the source's own group keys; name them as the source does.
  const sourceLabels = new Map((cockpit.baseline?.groups?.rows ?? []).map((row) => [row.key, row.derived ? "Other" : row.label]));
  const costRows = disclosed.length
    ? disclosed.map((row) => ({ key: row.category, label: `${row.category === "cogs" ? "COGS" : sourceLabels.get(row.category) ?? operatingLabel(row.category)}${row.missing_count ? " · known" : ""}`, value: row.annual_amount as number }))
    : groups.map((row) => ({ key: row.key, label: row.derived ? "Other" : row.label, value: row.amount }));
  const largest = Math.max(1, ...costRows.map((row) => row.value));

  const figures = cockpit.baseline?.figures;
  const facts: PlanCardModel["facts"] = evaluation
    ? [
        { label: "Known operating cash costs", value: `${usd(evaluation.disclosure?.operating_cash_monthly)} / mo` },
        { label: "Known COGS", value: `${usd(evaluation.disclosure?.cogs_monthly)} / mo` },
        { label: "Reviewed earnings change", value: `${signedUsd(evaluation.totals?.approved?.annual_impact ?? 0)} / yr` },
      ]
    : figures
      ? [
          { label: "Operating expenses on the source", value: `${usd(finite(figures.operating_expenses) ? figures.operating_expenses / 12 : null)} / mo` },
          { label: "Cost of goods sold on the source", value: `${usd(finite(figures.cogs) ? figures.cogs / 12 : null)} / mo` },
        ]
      : [];

  const version = summary?.version_number ?? cockpit.operating_plan?.version_number ?? null;
  const saved = dayLabel(summary?.updated_at ?? cockpit.operating_plan?.saved_at ?? null);
  const chip: OverviewTag = !summary
    ? { label: version ? `v${version}` : "Reading the plan…", tone: "mut" }
    : !summary.has_plan
      ? { label: "No plan yet", tone: "mut" }
      : summary.state === "published"
        ? { label: `Published v${version ?? DASH}`, tone: "acc" }
        : summary.state === "client_submitted"
          ? { label: "Client submitted · review needed", tone: "warn" }
          : { label: "Working draft", tone: "mut" };

  return {
    chip,
    metrics: strip.slice(0, 5).map((row) => ({ key: row.key, label: row.key === "operating_margin" ? "Margin" : row.label, before: row.value, after: row.after ?? DASH })),
    bars: waterfall(cell("ebitda").before, deltas, cell("ebitda").afterValue),
    pdfCaption: summary?.pdf_file_id ? ["Latest PDF", version ? `v${version}` : null, saved].filter(Boolean).join(" · ") : "Save a version to create the plan PDF",
    earnings: { before: cell("ebitda").value, after: cell("ebitda").after ?? DASH },
    coverage: { before: cell("dscr").value, after: cell("dscr").after ?? DASH },
    gap: { value: gap == null ? DASH : gap === 0 ? "Met" : `${usd(gap)} / year`, met: gap === 0 },
    rows,
    empty: changes.length ? null : summary && !summary.has_plan ? "No plan yet. Open the earnings plan to confirm current costs and add the changes that lift earnings." : "No changes in the plan yet. Add proposed changes to see what each one does to earnings and coverage.",
    footer,
    costsTitle: disclosed.length ? "Largest disclosed annual costs" : "Largest annual costs on the source",
    costs: costRows.map((row) => ({ key: row.key, label: row.label, amount: usd(row.value), share: Math.max(2, Math.round((row.value / largest) * 100)) })),
    facts,
  };
}

// ---------------------------------------------------------------------------
// Debt service coverage and the plan · Debt schedule
// ---------------------------------------------------------------------------

export type CoverageModel = {
  today: { value: string; sub: string };
  plan: { value: string; sub: string };
  released: { value: string; sub: string; tone: OverviewTone };
  bars: { today: string; todayShare: number; plan: string | null; planShare: number };
  coverage: { before: string; after: string | null };
  hasTerms: boolean;
  /** Why coverage cannot be worked out, or the coverage in words. */
  note: string;
};

export function coverageCard(cockpit: FinancialCockpit): CoverageModel {
  const debt = cockpit.baseline?.debt_service ?? {};
  const service = cockpit.debt?.service;
  const todayMonthly = finite(debt.current_monthly) ? debt.current_monthly : service?.monthly ?? null;
  const todayAnnual = finite(debt.current_annual) ? debt.current_annual : service?.annual ?? null;
  const obligations = debt.obligations ?? (cockpit.debt?.obligations ?? []).filter((row) => row.in_debt_service).length;
  const hasTerms = finite(debt.with_terms_monthly) || finite(debt.with_terms_annual);
  const remaining = hasTerms && debt.retired != null ? Math.max(0, obligations - debt.retired) + 1 : null;
  const released = finite(debt.released_monthly) ? debt.released_monthly : null;
  const scale = Math.max(todayAnnual ?? 0, debt.with_terms_annual ?? 0) || 1;
  const noDebt = Boolean(cockpit.dscr?.no_debt);
  const reason = cockpit.plan?.evaluation?.coverage_unavailable_reason ?? null;
  const before = currentMetrics(cockpit).dscr;
  const after = hasTerms ? cockpit.baseline?.metrics?.with_terms?.dscr : null;
  const words = finite(before) ? `Coverage ${times(before)} today${finite(after) ? `, ${times(after)} with the saved terms` : ""}; annual debt service on the bars.` : "Annual debt service on the bars.";
  return {
    today: { value: usd(todayMonthly), sub: noDebt ? "No debt on the business" : obligations ? `/ month · ${plural(obligations, "obligation")}` : "No obligations on file" },
    plan: { value: hasTerms ? usd(debt.with_terms_monthly) : DASH, sub: hasTerms ? `/ month${remaining != null ? ` · ${plural(remaining, "loan")}` : ""}` : "No loan terms saved" },
    released: { value: released == null ? DASH : usd(released), sub: released == null ? "Set the loan terms" : released < 0 ? "/ month more" : "/ month", tone: released == null ? "mut" : released > 0 ? "ok" : released < 0 ? "bad" : "mut" },
    bars: {
      today: usd(todayAnnual),
      todayShare: todayAnnual ? Math.max(2, Math.round((todayAnnual / scale) * 100)) : 0,
      plan: hasTerms ? usd(debt.with_terms_annual) : null,
      planShare: finite(debt.with_terms_annual) ? Math.max(debt.with_terms_annual > 0 ? 2 : 0, Math.round((debt.with_terms_annual / scale) * 100)) : 0,
    },
    coverage: { before: times(before), after: hasTerms ? times(after) : null },
    hasTerms,
    note: reason || words,
  };
}

export type DebtScheduleModel = {
  tag: OverviewTag;
  table: OverviewTable | null;
  more: number;
  empty: string | null;
};

const DEBT_ROWS = 8;

export function debtSchedule(cockpit: FinancialCockpit): DebtScheduleModel {
  const debt = cockpit.debt;
  const schedule = debt?.schedule;
  const obligations = (debt?.obligations ?? []).filter((row) => row.in_debt_service || row.kind === "row");
  const labels = new Map((debt?.rows ?? []).map((row) => [`row:${row.id}`, row.category_label || null]));
  const retired = new Set(cockpit.plan?.evaluation?.retired_ids ?? []);
  const paidOffCount = obligations.filter((row) => retired.has(row.id)).length;
  // When the plan pays off every row the tag says so once; row by row only when some stay.
  const partial = paidOffCount > 0 && paidOffCount < obligations.length;
  const rows: OverviewRow[] = obligations.map((row) => {
    const type = labels.get(row.id) || (row.is_mca ? "Advance" : titled(row.category || "loan"));
    const paidOff = partial && retired.has(row.id);
    return {
      key: row.id,
      muted: !row.in_debt_service,
      cells: [
        { text: row.lender },
        { text: `${type}${row.kind === "payee" ? " · seen in statements" : row.kind === "row" ? "" : " · document"}${paidOff ? " · paid off by plan" : ""}${row.in_debt_service ? "" : " · not counted"}` },
        { text: usd(row.balance) },
        { text: usd(row.monthly) },
      ],
    };
  });
  const paidOff = paidOffCount;
  if (schedule?.voided) {
    return { tag: { label: "No debt · declared by the desk", tone: "ok" }, table: null, more: 0, empty: `No debt on the business${schedule.voided.reason ? `: ${schedule.voided.reason}` : "."}` };
  }
  if (!rows.length) {
    const waiting = schedule?.status === "requested" || schedule?.status === "received";
    return {
      tag: { label: schedule?.label || "Not requested yet", tone: waiting ? "warn" : "mut" },
      table: null,
      more: 0,
      empty: waiting ? "Waiting on the borrower's schedule. If they gave the terms verbally, enter them and the coverage reads them." : "Nothing on the schedule yet. Enter it, ask the borrower for it, or record that the business carries no debt.",
    };
  }
  return {
    tag: { label: `${plural(rows.length, "row")}${paidOff ? (paidOff === rows.length ? " · all paid off by plan" : ` · ${paidOff} paid off by plan`) : ""}`, tone: "mut" },
    table: { head: ["Lender", "Type", "Balance", "Monthly"], rows: rows.slice(0, DEBT_ROWS) },
    more: Math.max(0, rows.length - DEBT_ROWS),
    empty: null,
  };
}

// ---------------------------------------------------------------------------
// Tax returns · Profit and loss · Balance sheet
// ---------------------------------------------------------------------------

export type StatementModel = { tag: OverviewTag | null; table: OverviewTable | null; footer: string | null; empty: string | null };

const signed = (value: number | null | undefined): OverviewCell => ({ text: usd(value), tone: finite(value) && value < 0 ? "bad" : undefined });

export function taxReturns(cockpit: FinancialCockpit): StatementModel {
  const all = cockpit.tax?.years ?? [];
  if (!all.length) return { tag: null, table: null, footer: null, empty: "No tax return analyzed yet. Until one lands, EBITDA, DSCR and net profit lean on the P&L or the statements." };
  const years = all.slice(-3);
  const source = cockpit.baseline?.source;
  const leads = source?.kind === "tax_return";
  const form = leads && source?.label ? source.label.replace(/^IRS\s+/, "").split(" · ")[0] : "Line";
  const line = (key: string, label: string, pick: (year: (typeof years)[number]) => number | null | undefined): OverviewRow => ({ key, cells: [{ text: label }, ...years.map((year) => signed(pick(year)))] });
  const latest = years[years.length - 1];
  const prior = years.length > 1 ? years[years.length - 2] : null;
  const change = latest.gross_receipts_change_pct;
  return {
    tag: leads ? { label: "Primary source", tone: "acc" } : { label: source?.kind === "profit_and_loss" ? "P&L in use instead" : "Not in use", tone: "mut" },
    table: {
      head: [form, ...years.map((year) => `${year.year}${year.accepted ? "" : " · not accepted"}`)],
      rows: [
        line("gross_receipts", "Gross receipts", (year) => year.gross_receipts),
        line("cogs", "Cost of goods sold", (year) => year.cost_of_goods_sold),
        line("deductions", "Total deductions", (year) => year.total_deductions),
        line("income", latest.income_basis ? titled(latest.income_basis) : "Ordinary income", (year) => year.income ?? year.ordinary_business_income),
      ],
    },
    footer: prior && finite(change) ? `Revenue ${prior.year} → ${latest.year} · ${change > 0 ? "up" : change < 0 ? "down" : "flat"} · ${signedPercent(change)}` : source?.period_assumed && leads ? `Tax year ${latest.year} is read as the full calendar year.` : null,
    empty: null,
  };
}

export function profitAndLoss(cockpit: FinancialCockpit): StatementModel {
  const statement = cockpit.profit_and_loss;
  const readable = statement && [statement.gross_revenue, statement.total_operating_expenses, statement.operating_income, statement.net_income].some(finite);
  if (!statement || !readable) return { tag: null, table: null, footer: null, empty: statement ? "The profit-and-loss file on the file has no readable figures yet." : "No profit-and-loss statement has been analyzed yet." };
  const months = statement.months_covered;
  const factor = finite(months) && months > 0 ? 12 / months : null;
  const annual = (value: number | null | undefined, known?: number | null) => (finite(known) ? known : finite(value) && factor != null ? value * factor : null);
  const line = (key: string, label: string, value: number | null | undefined, known?: number | null): OverviewRow => ({ key, cells: [{ text: label }, signed(value), signed(annual(value, known))] });
  const inUse = cockpit.baseline?.source?.kind === "profit_and_loss";
  return {
    tag: { label: `${statement.period_label ?? "Period unconfirmed"}${finite(months) ? ` · ${months} mo` : ""}`, tone: "outline" },
    table: {
      head: ["Line", "Period", "Annualized"],
      rows: [
        line("revenue", "Revenue", statement.gross_revenue, statement.annualized_revenue),
        line("cogs", "Cost of goods sold", statement.cost_of_goods_sold),
        line("opex", "Operating expenses", statement.total_operating_expenses, statement.annualized_operating_expenses),
        line("operating_income", "Operating income", statement.operating_income),
      ],
    },
    footer: `${inUse ? "In use as the earnings source: no filed business return leads this file." : "Labelled fallback where the return does not print a line."}${statement.accepted ? "" : " Not yet accepted."}`,
    empty: null,
  };
}

export function balanceSheet(cockpit: FinancialCockpit): StatementModel {
  const sheet = cockpit.balance_sheet;
  const readable = sheet && [sheet.cash, sheet.total_assets, sheet.total_liabilities, sheet.total_equity].some(finite);
  if (!sheet || !readable) return { tag: null, table: null, footer: null, empty: sheet ? "The balance-sheet file on the file has no readable figures yet." : "No balance sheet has been analyzed yet." };
  const line = (key: string, label: string, value: number | null | undefined): OverviewRow => ({ key, cells: [{ text: label }, signed(value)] });
  const ratios = [finite(sheet.current_ratio) ? `Current ratio ${times(sheet.current_ratio)}` : null, finite(sheet.debt_to_equity) ? `debt to equity ${times(sheet.debt_to_equity)}` : null].filter(Boolean).join(" · ");
  return {
    tag: { label: sheet.as_of_date ? `As of ${dayLabel(sheet.as_of_date)}` : "Date unconfirmed", tone: "outline" },
    table: {
      head: ["Line", "Amount"],
      rows: [line("cash", "Cash", sheet.cash), line("assets", "Total assets", sheet.total_assets), line("liabilities", "Total liabilities", sheet.total_liabilities), line("equity", "Equity", sheet.total_equity)],
    },
    footer: [sheet.basis ? `${titled(sheet.basis)} basis.` : null, ratios ? `${ratios}.` : null, sheet.accepted ? null : "Not yet accepted."].filter(Boolean).join(" ") || null,
    empty: null,
  };
}

// ---------------------------------------------------------------------------
// DSCR and earnings potential · Revenue trend · Earnings sources
// ---------------------------------------------------------------------------

export type PotentialModel = { tag: OverviewTag | null; table: OverviewTable | null; footer: string; empty: string | null };

export function earningsPotential(cockpit: FinancialCockpit): PotentialModel {
  const baseline = cockpit.baseline;
  const current = currentMetrics(cockpit);
  const revenue = baseline?.figures?.revenue ?? null;
  const margin = cockpit.ebitda?.potential?.baseline?.margin_pct ?? (finite(current.ebitda) && finite(revenue) && revenue > 0 ? (current.ebitda / revenue) * 100 : null);
  const needed = (value: number | null | undefined): OverviewCell => (!finite(value) ? { text: DASH } : value <= 0 ? { text: "Met", tone: "ok" } : { text: `+${usd(value)}` });
  const targets = baseline?.targets ?? [];
  const footer = "Annual earnings improvement needed at the latest revenue baseline. A target is not a forecast or an accepted add-back.";
  if (!targets.length || targets.every((row) => row.current_debt == null && row.with_terms == null)) {
    return {
      tag: finite(margin) ? { label: `${percent(margin)} baseline margin`, tone: margin < 0 ? "bad" : "mut" } : null,
      table: null,
      footer,
      empty: current.ebitda == null ? baseline?.reason || "An earnings source is needed before coverage targets can be worked out." : "No debt service on file, so there is no coverage target to reach.",
    };
  }
  return {
    tag: finite(margin) ? { label: `${percent(margin)} baseline margin`, tone: margin < 0 ? "bad" : "mut" } : null,
    table: {
      head: ["Coverage goal", "Current debt", "Saved loan plan"],
      rows: targets.map((row) => ({ key: String(row.ratio), cells: [{ text: times(row.ratio) }, needed(row.current_debt), needed(row.with_terms)] })),
    },
    footer,
    empty: null,
  };
}

export type TrendModel = {
  tag: OverviewTag | null;
  bars: Array<{ key: string; label: string; share: number; latest: boolean }>;
  footer: string | null;
  empty: string | null;
};

export function revenueTrend(cockpit: FinancialCockpit): TrendModel {
  const trend = cockpit.ebitda?.revenue_trend;
  const periods = (trend?.periods ?? []).filter((row) => finite(row.revenue)).map((row) => ({ year: String(row.year), revenue: row.revenue as number }));
  const fromReturns = (cockpit.tax?.years ?? []).filter((year) => finite(year.gross_receipts)).map((year) => ({ year: year.year, revenue: year.gross_receipts as number }));
  const rows = (periods.length ? periods : fromReturns).slice(-3);
  if (!rows.length) return { tag: null, bars: [], footer: null, empty: "Revenue from a tax return or a profit-and-loss statement is needed to show a trend." };
  const comparison = trend?.comparison;
  const comparable = comparison?.comparable === true && finite(comparison.change_pct);
  const fallbackChange = !comparison && rows.length > 1 && rows[rows.length - 2].revenue > 0 ? ((rows[rows.length - 1].revenue - rows[rows.length - 2].revenue) / rows[rows.length - 2].revenue) * 100 : null;
  const change = comparable ? (comparison!.change_pct as number) : fallbackChange;
  const tag: OverviewTag | null = finite(change)
    ? { label: `${comparable ? comparison!.prior_year : rows[rows.length - 2].year} → ${comparable ? comparison!.current_year : rows[rows.length - 1].year} · ${signedPercent(change)}`, tone: change < 0 ? "warn" : change > 0 ? "ok" : "mut" }
    : rows.length > 1
      ? { label: "Comparable revenue needed", tone: "mut" }
      : { label: "One period on file", tone: "mut" };
  const largest = Math.max(1, ...rows.map((row) => row.revenue));
  const forecast = trend?.forecast;
  const method = forecast?.method === "p_and_l_run_rate" ? "P&L run-rate" : forecast?.method === "reviewed_assumptions" ? "reviewed-assumptions" : "historical-growth";
  const footer =
    forecast?.status === "illustration" && finite(forecast.projected_revenue)
      ? `${forecast.target_year ?? "Next period"} ${method} illustration: ${usd(forecast.projected_revenue)}. Historical growth is not repeated automatically; the earnings plan carries explicit assumptions.`
      : comparison && !comparable && comparison.reason
        ? comparison.reason
        : "Historical growth is not repeated automatically; the earnings plan carries explicit assumptions.";
  return {
    tag,
    bars: rows.map((row, index) => ({ key: `${row.year}:${index}`, label: `${row.year} · ${usd(row.revenue)}`, share: Math.max(3, Math.round((row.revenue / largest) * 100)), latest: index === rows.length - 1 })),
    footer,
    empty: null,
  };
}

export type SourcesModel = { tag: OverviewTag; table: OverviewTable | null; footer: string; empty: string | null };

export function earningsSources(cockpit: FinancialCockpit): SourcesModel {
  const baseline = cockpit.baseline;
  const source = baseline?.source;
  const tag: OverviewTag = source?.kind === "tax_return"
    ? { label: `IRS ${source.year ?? ""} selected`.replace("  ", " "), tone: "acc" }
    : source?.kind === "profit_and_loss"
      ? { label: "P&L selected · fallback", tone: "warn" }
      : { label: "No source selected", tone: "mut" };
  const adjusted = (baseline?.staff_adjustments ?? []).length > 0;
  const unread = baseline?.figures?.unread ?? [];
  const footer = [
    "A filed return comes first, the P&L is the labelled fallback, bank cash is a proxy.",
    adjusted ? "A staff review adjusts the selected figures." : "No add-backs applied.",
    unread.length ? `Not read from the source and counted as zero: ${unread.map((name) => (name === "interest" ? "interest" : "depreciation and amortization")).join(", ")}.` : null,
    source?.selected_by === "staff" ? "The source was chosen by the desk." : null,
  ].filter(Boolean).join(" ");
  const sources = baseline?.sources ?? [];
  if (sources.length) {
    return {
      tag,
      table: { head: ["Source", "Net profit", "EBITDA"], rows: sources.map((row) => ({ key: row.key, strong: row.selected, cells: [{ text: row.label }, signed(row.net_profit), signed(row.ebitda)] })) },
      footer,
      empty: null,
    };
  }
  const candidates = cockpit.net_profit?.candidates ?? [];
  if (!candidates.length) return { tag, table: null, footer, empty: baseline?.reason || "No income figure yet. A tax return, a profit-and-loss statement or three months of bank statements gives one." };
  const lead = cockpit.net_profit?.conclusion?.key;
  return {
    tag,
    table: { head: ["Source", "Net profit", "EBITDA"], rows: candidates.map((row) => ({ key: row.key, strong: row.key === lead, cells: [{ text: `${row.label}${row.period && row.key !== "tax_return" ? ` · ${row.period}` : ""}` }, signed(row.value), { text: DASH }] })) },
    footer,
    empty: null,
  };
}

// ---------------------------------------------------------------------------
// Expenses · Overdrafts · Account movement
// ---------------------------------------------------------------------------

export type ExpensesModel = { tag: OverviewTag | null; table: OverviewTable | null; footer: string | null; empty: string | null };

const EXPENSE_ROWS = 4;

export function trackedExpenses(cockpit: FinancialCockpit, summary: CockpitBankSummary | null | undefined): ExpensesModel {
  const baseline = cockpit.baseline;
  const groups = baseline?.groups;
  const source = baseline?.source;
  const short = source?.kind === "tax_return" ? `IRS ${source.year ?? ""}`.trim() : source?.kind === "profit_and_loss" ? "P&L" : "Source";
  const service = cockpit.debt?.service?.monthly ?? baseline?.debt_service?.current_monthly ?? null;
  const scale = [finite(summary?.avg_withdrawals) ? `Bank outflows ${usd(summary!.avg_withdrawals)} / month` : null, finite(service) ? `debt service ${usd(service)} / month` : null].filter(Boolean);
  const footer = scale.length ? `${scale.join(" and ").replace(/^./, (letter) => letter.toUpperCase())} sit beside these for scale.` : null;
  if (groups?.rows?.length) {
    // The largest named lines, then everything else as one line: the column adds up to the total.
    const named = groups.rows.filter((row) => !row.derived).sort((a, b) => b.amount - a.amount);
    const rest = [...named.slice(EXPENSE_ROWS), ...groups.rows.filter((row) => row.derived)];
    const rows: OverviewRow[] = named.slice(0, EXPENSE_ROWS).map((row) => ({ key: row.key, cells: [{ text: row.label }, { text: short }, { text: usd(row.amount) }] }));
    if (rest.length) {
      const only = rest.length === 1 ? rest[0] : null;
      rows.push({ key: "rest", muted: true, cells: [{ text: only ? (only.derived ? "Other (rest of the source's total)" : only.label) : `${rest.length} more lines` }, { text: only?.derived ? "Derived" : short }, { text: usd(rest.reduce((sum, row) => sum + row.amount, 0)) }] });
    }
    const listed = groups.rows.reduce((sum, row) => sum + row.amount, 0);
    rows.push({ key: "total", strong: true, cells: [{ text: "Total" }, { text: "" }, { text: usd(listed) }] });
    return {
      tag: groups.status === "reconciled" ? { label: "Adds up to the source", tone: "ok" } : groups.status === "lines_exceed_total" ? { label: "Lines exceed the source's total", tone: "warn" } : { label: "Total not read", tone: "mut" },
      table: { head: ["Line", "Source", "Annual"], rows },
      footer,
      empty: null,
    };
  }
  const lines = (cockpit.expenses?.lines ?? []).filter((line) => finite(line.annualized ?? line.amount));
  if (!lines.length) return { tag: null, table: null, footer, empty: "No expense lines yet: a tax return or a profit-and-loss statement fills this in." };
  return {
    tag: null,
    table: {
      head: ["Line", "Source", "Annual"],
      rows: lines.slice(0, EXPENSE_ROWS + 1).map((line) => ({ key: line.key, cells: [{ text: line.label }, { text: line.source === "tax_return" ? "Return" : line.source === "profit_and_loss" ? "P&L" : titled(line.source || "source") }, { text: usd(line.annualized ?? line.amount) }] })),
    },
    footer,
    empty: null,
  };
}

export type OverdraftModel = {
  tag: OverviewTag;
  stats: Array<{ label: string; value: string; tone?: OverviewTone }>;
  footer: string;
  empty: string | null;
};

export function overdrafts(months: CockpitMonth[]): OverdraftModel {
  if (!months.length) return { tag: { label: "No statements", tone: "mut" }, stats: [], footer: "", empty: "No bank statement has been analyzed yet." };
  const risk = balanceRiskMonths(months);
  const totals = riskTotals(risk);
  const negative = totals.negative.value ?? 0;
  const affected = risk.filter((month) => (month.negativeDays ?? 0) > 0 || (month.nsf ?? 0) > 0 || (month.returned ?? 0) > 0 || (month.lowest != null && month.lowest < 0)).length;
  const unit = totals.accountDays ? "negative account-day" : "negative day";
  const quiet = !negative && !(totals.fees.value ?? 0) && !(totals.returned.value ?? 0) && !(totals.lowest != null && totals.lowest < 0);
  return {
    tag: negative ? { label: `${riskCountLabel(totals.negative)} ${negative === 1 ? unit : `${unit}s`}`, tone: "bad" } : quiet ? { label: totals.negative.complete ? "No negative days" : "None reported", tone: totals.negative.complete ? "ok" : "mut" } : { label: "Fee or low-balance activity", tone: "warn" },
    stats: [
      { label: "NSF / overdraft fees", value: riskCountLabel(totals.fees) },
      { label: "Lowest balance", value: usd(totals.lowest), tone: totals.lowest != null && totals.lowest < 0 ? "bad" : undefined },
      { label: "Months affected", value: `${affected} of ${risk.length}` },
    ],
    footer: `Statement events are dated and linked to their source pages.${(totals.returned.value ?? 0) > 0 ? ` ${plural(totals.returned.value as number, "returned item")}.` : ""}`,
    empty: null,
  };
}

export type MovementModel = { table: OverviewTable | null; footer: string; empty: string | null };

export function accountMovement(cockpit: FinancialCockpit): MovementModel {
  const data = cockpit.bank?.account_movements;
  const footer = "Transfers and owner draws are not operating spend and are excluded from deposits and withdrawals.";
  const draws = (cockpit.bank?.recurring?.payees ?? []).filter((row) => row.kind === "owner_draw" && finite(row.total)).reduce((sum, row) => sum + (row.total as number), 0);
  const names = new Map((data?.nodes ?? []).map((node) => [node.key, node.label]));
  // Both directions between two accounts are one line.
  const pairs = new Map<string, { a: string; b: string; amount: number; both: boolean; review: boolean; first: string }>();
  for (const link of data?.links ?? []) {
    if (!finite(link.amount)) continue;
    const [a, b] = [link.from_account, link.to_account].sort();
    const key = `${a}|${b}`;
    const pair = pairs.get(key) ?? { a, b, amount: 0, both: false, review: false, first: link.from_account };
    pair.amount += link.amount;
    pair.both = pair.both || link.from_account !== pair.first;
    pair.review = pair.review || link.status === "review";
    pairs.set(key, pair);
  }
  const name = (key: string) => names.get(key) ?? key;
  const rows: OverviewRow[] = [...pairs.values()].sort((x, y) => y.amount - x.amount).slice(0, 4).map((pair) => {
    const from = pair.first, to = pair.first === pair.a ? pair.b : pair.a;
    return { key: `${pair.a}|${pair.b}`, cells: [{ text: `${name(from)} ${pair.both ? "↔" : "→"} ${name(to)}${pair.review ? " · to review" : ""}` }, { text: usd(pair.amount) }] };
  });
  if (draws > 0) rows.push({ key: "owner_draws", cells: [{ text: "Owner draws" }, { text: usd(draws) }] });
  if (!rows.length) {
    const unread = !data || data.status === "no_transaction_evidence";
    return { table: null, footer, empty: unread ? "Transfers between accounts appear here once the statements are read with their transaction detail." : "No transfers between the file's accounts were found in the statements." };
  }
  const periods = data?.periods?.length || cockpit.bank?.recurring?.months_read?.length || 0;
  return { table: { head: ["Between", periods ? plural(periods, "month") : "Period"], rows }, footer, empty: null };
}

// ---------------------------------------------------------------------------
// Bank trends · Statement payments
// ---------------------------------------------------------------------------

export type BankTrendModel = {
  sub: string;
  columns: Array<{ key: string; label: string; title: string; deposits: number; withdrawals: number; muted: boolean }>;
  stats: Array<{ label: string; value: string; tone?: OverviewTone }>;
  empty: string | null;
};

const BANK_MONTHS = 12;

export function bankTrends(months: CockpitMonth[], summary: CockpitBankSummary | null | undefined, accountLabel?: string | null): BankTrendModel {
  if (!months.length) return { sub: "No statements yet", columns: [], stats: [], empty: "No bank statement has been analyzed yet. Upload or request statements and the months fill in here." };
  const shown = months.slice(-BANK_MONTHS);
  const largest = Math.max(1, ...shown.flatMap((month) => [month.deposits ?? 0, month.withdrawals ?? 0]));
  const share = (value: number | null) => (finite(value) && value > 0 ? Math.max(2, Math.round((value / largest) * 100)) : 0);
  const totals = riskTotals(balanceRiskMonths(months));
  const net = summary?.avg_net ?? null;
  return {
    sub: `${plural(months.length, "statement month")} · deposits and withdrawals${accountLabel ? ` · ${accountLabel}` : ""}`,
    columns: shown.map((month) => ({
      key: month.month,
      label: monthShort(month.month).split(" ")[0],
      title: `${month.label}: deposits ${usd(month.deposits)}, withdrawals ${usd(month.withdrawals)}${month.accepted ? "" : " (not yet accepted)"}`,
      deposits: share(month.deposits),
      withdrawals: share(month.withdrawals),
      muted: !month.accepted,
    })),
    stats: [
      { label: "Avg deposits", value: usd(summary?.avg_deposits) },
      { label: "Avg withdrawals", value: usd(summary?.avg_withdrawals) },
      { label: "Net", value: finite(net) ? `${usd(net)} / mo` : DASH, tone: finite(net) && net < 0 ? "bad" : undefined },
      { label: totals.accountDays ? "Negative account-days" : "Negative days", value: riskCountLabel(totals.negative) },
    ],
    empty: null,
  };
}

export type PaymentsModel = { tag: OverviewTag | null; table: OverviewTable | null; footer: string; empty: string | null };

const PAYEE_ROWS = 6;

export function statementPayments(cockpit: FinancialCockpit, months: CockpitMonth[]): PaymentsModel {
  const payees = (cockpit.bank?.recurring?.payees ?? []).filter((row) => row.is_debt || row.kind === "merchant_cash_advance").sort((a, b) => (b.monthly_average ?? 0) - (a.monthly_average ?? 0));
  const fees = riskTotals(balanceRiskMonths(months)).fees.value ?? 0;
  const footer = `Observed activity stays separate from the debt schedule.${fees ? ` ${plural(fees, "overdraft fee")} in the period.` : ""}`;
  const reread = cockpit.coverage?.statements_need_reread ?? 0;
  if (!payees.length) {
    return {
      tag: null,
      table: null,
      footer,
      empty: reread ? `${plural(reread, "statement")} must be read again before recurring payments can be listed.` : months.length ? "No lender or funder payments were seen in the statements." : "No bank statement has been analyzed yet.",
    };
  }
  const advances = payees.filter((row) => row.kind === "merchant_cash_advance").length;
  return {
    tag: advances ? { label: `${plural(advances, "active advance")}`, tone: "warn" } : { label: `${plural(payees.length, "lender payment")}`, tone: "mut" },
    table: {
      head: ["Observed payee", "Cadence", "Per debit", "Monthly"],
      rows: payees.slice(0, PAYEE_ROWS).map((row) => ({ key: row.key, cells: [{ text: row.payee }, { text: cadenceLabel(row.cadence) }, { text: usd(row.average_amount) }, { text: usd(row.monthly_average) }] })),
    },
    footer: `${payees.length > PAYEE_ROWS ? `${plural(payees.length - PAYEE_ROWS, "more payee")} in the statement review. ` : ""}${footer}`,
    empty: null,
  };
}
