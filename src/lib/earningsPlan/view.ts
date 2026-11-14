/**
 * Everything the Earnings Plan screens print, worked out from the plan body,
 * the file's baseline and the engine's result. The components only lay these
 * out, so a figure that drifts from the design fails a test here rather than
 * showing up on a screen.
 */
import { waterfall, type WaterfallBar } from "@/lib/financialsOverview";
import { ALL, COGS_GROUP, Plan, loanOperating, number, startMonth } from "./math";
import { count, factorAmountLabel, factorValue, perWord, periodLabel, plain, planMonthShort, points, ratioPercent, signedTimes, signedUsd, times, usd } from "./format";
import type {
  Amount, CategoryAnswer, ChangeMode, EarningsPlanBody, LineBehavior, PlanActivity, PlanBaseline, PlanChange, PlanFactor, PlanGrowth, PlanItemRow,
  PlanPerUnit, PlanQuestion, PlanResult, PlanSixMetrics, PlanStream, PlanTarget, PlanView, StreamTemplate,
} from "./types";

export type Tone = "ok" | "bad" | "warn" | "mut" | "acc";
export type Tag = { label: string; tone: Tone | "outline" };
export type DebtBasis = "with_terms" | "current_debt";

const DASH = "—";
const available = (baseline: PlanBaseline) => baseline.available !== false;

/** Which debt service the "after" figures are measured against. */
export function debtBasis(baseline: PlanBaseline, applyTerms: boolean): DebtBasis {
  return applyTerms && baseline.debt_service_with_terms != null ? "with_terms" : "current_debt";
}

const after = (result: PlanResult, view: PlanView, basis: DebtBasis): PlanSixMetrics => result.metrics[view][basis] ?? result.metrics[view].current_debt;

/**
 * Said wherever coverage with the saved terms is shown, when the loan brings operating costs of its own.
 * Those costs come off DSCR and free cash flow with the terms; EBITDA and NOI stay as the plan produces them.
 */
export function loanCostsNote(baseline: PlanBaseline, basis: DebtBasis): string | null {
  if (basis !== "with_terms") return null;
  const costs = loanOperating(baseline);
  if (costs > 0) return `The saved loan terms add ${usd(costs)} a year of operating costs. They come off DSCR and free cash flow with the terms, and leave EBITDA and NOI as the plan produces them.`;
  if (baseline.loan_operating_confirmed === false) return "The saved loan terms list a recurring operating cost whose amount is not confirmed. It is counted as zero until the budget is confirmed.";
  return null;
}

/** "IRS 2025", "P&L", or "Source" when the file has none. */
export function sourceShort(baseline: PlanBaseline): string {
  const source = baseline.source ?? {};
  if (source.kind === "tax_return") return source.year ? `IRS ${source.year}` : "IRS return";
  if (source.kind === "profit_and_loss") return "P&L";
  return baseline.source_name && baseline.source_name !== "source" ? baseline.source_name : "Source";
}

// ---------------------------------------------------------------------------
// The step bar
// ---------------------------------------------------------------------------

export function stepSubtitles(body: EarningsPlanBody, baseline: PlanBaseline, result: PlanResult, view: PlanView, basis: DebtBasis): [string, string, string, string] {
  const live = result.items.filter(item => item.included).length;
  const figures = after(result, view, basis);
  return [
    available(baseline) ? `${sourceShort(baseline)} · NOI ${usd(baseline.noi)}` : "No earnings source yet",
    `${count(body.streams.length, "revenue stream")} · ${count(body.lines.length, "cost")}`,
    available(baseline) ? `${count(live, "change")} · ${signedUsd(result.proposed.ebitda - number(baseline.ebitda))}` : count(live, "change"),
    figures.dscr != null && available(baseline) ? `DSCR ${times(figures.dscr)} · goal ${times(result.target.ratio)}` : "No debt to cover",
  ];
}

// ---------------------------------------------------------------------------
// The six metrics, before → after
// ---------------------------------------------------------------------------

export type MetricRow = {
  key: keyof PlanSixMetrics; label: string;
  before: string; after: string; delta: string;
  tone: "ok" | "bad" | "mut";
  /** The "after" figure is negative and should read as a loss. */
  negative: boolean;
  b: number | null; a: number | null;
};

const METRICS: Array<{ key: keyof PlanSixMetrics; label: string; text: (value: number | null) => string; change: (value: number | null) => string; lowerIsBetter?: boolean }> = [
  { key: "ebitda", label: "EBITDA", text: usd, change: signedUsd },
  { key: "noi", label: "NOI", text: usd, change: signedUsd },
  { key: "dscr", label: "DSCR", text: times, change: signedTimes },
  { key: "free_cash_flow", label: "Free cash flow", text: usd, change: signedUsd },
  { key: "operating_margin", label: "Operating margin", text: ratioPercent, change: points },
  { key: "debt_service", label: "Debt service", text: usd, change: signedUsd, lowerIsBetter: true },
];

export function liveMetrics(baseline: PlanBaseline, result: PlanResult, view: PlanView, basis: DebtBasis): MetricRow[] {
  const today = result.metrics.today.current_debt;
  const plan = after(result, view, basis);
  return METRICS.map(({ key, label, text, change, lowerIsBetter }) => {
    const b = available(baseline) || key === "debt_service" ? today[key] : null;
    const a = available(baseline) || key === "debt_service" ? plan[key] : null;
    if (b == null || a == null) return { key, label, before: b == null ? DASH : text(b), after: a == null ? DASH : text(a), delta: DASH, tone: "mut" as const, negative: false, b, a };
    const same = Math.abs(a - b) < 1e-6;
    const good = lowerIsBetter ? a <= b : a >= b;
    return { key, label, before: text(b), after: text(a), delta: change(a - b), tone: same ? "mut" : good ? "ok" : "bad", negative: !lowerIsBetter && a < 0, b, a };
  });
}

export type CompareBar = { label: string; before: string; after: string; beforeWidth: number; afterWidth: number; beforeTone: "bad" | "mut"; afterTone: "bad" | "acc" | "mut" };

/** Baseline against plan, each metric on its own scale. */
export function compareBars(rows: MetricRow[]): CompareBar[] {
  return rows.map(row => {
    const b = row.b ?? 0, a = row.a ?? 0;
    const scale = Math.max(Math.abs(b), Math.abs(a), 1e-9);
    return {
      label: row.label, before: row.before, after: row.after,
      beforeWidth: (Math.abs(b) / scale) * 100, afterWidth: (Math.abs(a) / scale) * 100,
      beforeTone: b < 0 ? "bad" : "mut", afterTone: a < 0 ? "bad" : row.key === "debt_service" ? "mut" : "acc",
    };
  });
}

export type BeforeAfterRow = { label: string; current: string; plan: string; reviewed: string; delta: string; tone: "ok" | "bad" | "mut" };

/** The review step's table: today, the working plan and the reviewed plan side by side. */
export function beforeAfterTable(baseline: PlanBaseline, result: PlanResult, basis: DebtBasis): BeforeAfterRow[] {
  if (!available(baseline)) return [];
  const e0 = number(baseline.ebitda), noi0 = number(baseline.noi);
  const current = baseline.debt_service_current, terms = baseline.debt_service_with_terms;
  const planDebt = basis === "with_terms" ? terms : current;
  // Operating costs the loan itself adds come off what covers the debt once the terms apply, and only there.
  const costs = loanOperating(baseline), planCosts = basis === "with_terms" ? costs : 0;
  const { proposed, reviewed, first_year: first } = result;
  const money = (label: string, now: number, plan: number, rev: number): BeforeAfterRow =>
    ({ label, current: usd(now), plan: usd(plan), reviewed: usd(rev), delta: signedUsd(plan - now), tone: Math.abs(plan - now) < 0.5 ? "mut" : plan >= now ? "ok" : "bad" });
  const ratio = (label: string, debt: number | null, now: number, plan: number, rev: number): BeforeAfterRow | null =>
    (debt ? { label, current: times(now / debt), plan: times(plan / debt), reviewed: times(rev / debt), delta: signedTimes(plan / debt - now / debt), tone: Math.abs(plan - now) < 0.5 ? "mut" : plan >= now ? "ok" : "bad" } : null);
  const rows: Array<BeforeAfterRow | null> = [
    money("Annual NOI", noi0, proposed.noi, reviewed.noi),
    current != null && planDebt != null ? money("Cash after debt / year", e0 - current, proposed.ebitda - planCosts - planDebt, reviewed.ebitda - planCosts - planDebt) : null,
    money("Annual EBITDA", e0, proposed.ebitda, reviewed.ebitda),
    money("First-year EBITDA", e0, first.proposed.ebitda, first.reviewed.ebitda),
    money("First-year NOI", noi0, first.proposed.noi, first.reviewed.noi),
    ratio("DSCR · current debt", current, e0, proposed.ebitda, reviewed.ebitda),
    terms != null ? ratio("DSCR · saved refinance", terms, e0 - costs, proposed.ebitda - costs, reviewed.ebitda - costs) : ratio("First-year DSCR · current debt", current, e0, first.proposed.ebitda, first.reviewed.ebitda),
    terms != null ? ratio("First-year DSCR · saved refinance", terms, e0 - costs, first.proposed.ebitda - costs, first.reviewed.ebitda - costs) : null,
  ];
  return rows.filter((row): row is BeforeAfterRow => row !== null);
}

/** A figure today and with the plan. `after` is null where the plan leaves it as it is, or leaves nothing to divide by. */
export type FromTo = { before: string; after: string | null };
/** What one unit, hour or job brings in and costs, today and with the plan. */
export type PerUnitRow = {
  key: string;
  /** "Detail packages · per unit", "All revenue · per hour (Labor hours)". */
  label: string;
  quantity: FromTo;
  revenue: FromTo; cost: FromTo; noi: FromTo;
  noiTone: Tone;
};

/** Dollars for one of something: cents, or four places when one of it is worth less than a dollar (a dollar processed). */
const each = (value: number) => usd(value, Math.abs(value) >= 1 || Math.abs(value) < 0.00005 ? 2 : 4);
const fromTo = (before: string, after: string | null): FromTo => ({ before, after: after === before ? null : after });

/** The review step's per-unit table: every stream volume and every measure alongside that has something to divide by. */
export function perUnitTable(body: EarningsPlanBody, result: PlanResult, templates: Record<string, StreamTemplate>, view: PlanView): PerUnitRow[] {
  return result.per_unit.map(row => {
    const stream = body.streams.find(item => item.id === row.stream_id);
    const measure = row.factor_id === null ? undefined : stream?.factors.find(factor => factor.id === row.factor_id);
    const word = measure ? perWord(measure.unit) : unitWord(stream, templates);
    const after = row[view];
    return {
      key: `${row.stream_id}:${row.factor_id ?? "volume"}`,
      label: `${stream?.name || "Revenue stream"} · per ${word}${measure ? ` (${measure.label || "measure"})` : ""}`,
      quantity: fromTo(`${plain(row.today.quantity / 12)} a month`, after ? `${plain(after.quantity / 12)} a month` : null),
      revenue: fromTo(each(row.today.revenue), after ? each(after.revenue) : null),
      cost: fromTo(each(row.today.cost), after ? each(after.cost) : null),
      noi: fromTo(each(row.today.noi), after ? each(after.noi) : null),
      noiTone: !after || Math.abs(after.noi - row.today.noi) < 0.005 ? "mut" : after.noi > row.today.noi ? "ok" : "bad",
    };
  });
}

// ---------------------------------------------------------------------------
// Bridge, ramp, coverage scale, goal
// ---------------------------------------------------------------------------

/** `bar` is null for a step that moves nothing: there is nothing to draw. */
export type BridgeRow = { label: string; value: string; total: boolean; bar: WaterfallBar | null; zero: number };

/** Baseline EBITDA, the six steps in their fixed order, and the plan figure. Adds up exactly. */
export function bridgeRows(baseline: PlanBaseline, result: PlanResult, view: PlanView): BridgeRow[] {
  if (!available(baseline)) return [];
  const start = number(baseline.ebitda), end = result[view].ebitda;
  // A step that moves nothing can come out of the arithmetic a hair off zero; it is zero.
  const steps = result.bridge[view].map(step => ({ ...step, value: Math.abs(step.value) < 0.005 ? 0 : step.value }));
  const bars = waterfall(start, steps.map(step => step.value), end);
  let running = start;
  const pointsOnScale = [start, ...steps.map(step => (running += step.value))];
  const low = Math.min(0, end, ...pointsOnScale), high = Math.max(0, end, ...pointsOnScale);
  const zero = ((0 - low) / (high - low || 1)) * 100;
  return [
    { label: "Baseline EBITDA", value: usd(start), total: true, bar: bars[0], zero },
    ...steps.map((step, index) => ({ label: step.label, value: signedUsd(step.value), total: false, bar: step.value === 0 ? null : bars[index + 1], zero })),
    { label: "Plan EBITDA", value: usd(end), total: true, bar: bars[bars.length - 1], zero },
  ];
}

export type Ramp = {
  /** Bar heights as a share of the chart's height above the axis (0–1) and below it (0–0.25). */
  months: Array<{ label: string; up: number; down: number; value: string }>;
  /** Where the monthly payment sits, as a share of the height above the axis; null without debt. */
  payment: number | null;
  paymentText: string | null;
  text: string;
};

export function ramp(baseline: PlanBaseline, result: PlanResult, view: PlanView, basis: DebtBasis, planStart: string | null): Ramp | null {
  if (!available(baseline)) return null;
  const debt = basis === "with_terms" ? baseline.debt_service_with_terms : baseline.debt_service_current;
  const pay = debt ? debt / 12 : null;
  const months = result.months[view];
  const scale = Math.max(pay ?? 0, ...months.map(month => Math.abs(month.ebitda)), 1) * 1.08;
  return {
    months: months.map((month, index) => ({
      label: planMonthShort(planStart, index),
      up: month.ebitda > 0 ? month.ebitda / scale : 0,
      down: month.ebitda < 0 ? Math.min(0.25, -month.ebitda / scale) : 0,
      value: usd(month.ebitda),
    })),
    payment: pay != null ? pay / scale : null,
    paymentText: pay != null ? `Monthly payment ${usd(pay)}` : null,
    text: `First year ${usd(result.first_year[view].ebitda)} · run-rate ${usd(result[view].ebitda)}`,
  };
}

export type CoverageScale = {
  state: Tag;
  one: number; target: number; before: number; after: number; fillLeft: number; fillWidth: number; improved: boolean;
  targetLabel: string; baselineText: string; planText: string; needText: string;
};

/** Where coverage stands against 1.00x and the lender's threshold. Null when there is no debt to cover. */
export function coverageScale(baseline: PlanBaseline, result: PlanResult, view: PlanView, basis: DebtBasis): CoverageScale | null {
  if (!available(baseline)) return null;
  const today = result.metrics.today.current_debt.dscr;
  const plan = after(result, view, basis);
  if (today == null || plan.dscr == null || !plan.debt_service) return null;
  const target = result.target.ratio;
  const low = Math.min(-0.25, today - 0.1, plan.dscr - 0.1);
  const high = Math.max(1.75, today + 0.25, plan.dscr + 0.25, target + 0.25);
  const at = (value: number) => Math.min(100, Math.max(0, ((value - low) / (high - low)) * 100));
  const needed = target * plan.debt_service - (plan.ebitda - (basis === "with_terms" ? loanOperating(baseline) : 0));
  return {
    state: plan.dscr >= target ? { label: "Meets goal", tone: "ok" } : plan.dscr >= 1 ? { label: "Covers debt", tone: "warn" } : plan.dscr > 0 ? { label: "Below 1.00x", tone: "bad" } : { label: "Negative", tone: "bad" },
    one: at(1), target: at(target), before: at(today), after: at(plan.dscr),
    fillLeft: Math.min(at(today), at(plan.dscr)), fillWidth: Math.abs(at(plan.dscr) - at(today)), improved: plan.dscr >= today,
    targetLabel: times(target), baselineText: `Baseline ${times(today)}`, planText: `Plan ${times(plan.dscr)}`,
    needText: needed > 0.5 ? `Needs ${usd(needed)} more EBITDA` : `Clears ${times(target)}`,
  };
}

export type GoalView = {
  percent: string; of: string;
  zero: number; goal: number; current: number; proposed: number; reviewed: number;
  currentText: string; proposedText: string; reviewedText: string; goalText: string;
  gapLabel: string; gapText: string; gapTone: "warn" | "ok";
};

/** Progress toward the annual NOI goal staff set. Null until one is set. */
export function goalView(baseline: PlanBaseline, result: PlanResult, view: PlanView): GoalView | null {
  const goal = result.goal.amount;
  if (!goal || !available(baseline)) return null;
  const noi0 = number(baseline.noi), shown = result[view].noi;
  const values = [noi0, result.proposed.noi, result.reviewed.noi, goal];
  const low = Math.min(0, ...values), high = Math.max(1, ...values);
  const at = (value: number) => 8 + ((value - low) / (high - low)) * 84;
  const gap = goal - shown;
  return {
    percent: `${Math.max(0, Math.round((shown / goal) * 100))}%`, of: `of the ${usd(goal)} goal · ${view}`,
    zero: at(0), goal: at(goal), current: at(noi0), proposed: at(result.proposed.noi), reviewed: at(result.reviewed.noi),
    currentText: usd(noi0), proposedText: usd(result.proposed.noi), reviewedText: usd(result.reviewed.noi), goalText: usd(goal),
    gapLabel: gap > 0 ? "Still to find" : "Above goal by", gapText: usd(Math.abs(gap)), gapTone: gap > 0 ? "warn" : "ok",
  };
}

// ---------------------------------------------------------------------------
// Step 1: the source
// ---------------------------------------------------------------------------

export type SourceGroupRow = {
  key: string; label: string; source: string; statement: string; variance: string;
  state: "open" | "confirmed" | "corrected"; tag: Tag;
  amount: number; correction: { amount: number; reason: string; text: string } | null;
};
export type SourceView = {
  available: boolean;
  primary: string; period: string; currencyBasis: string;
  /** Column headings of the cost table: the source, and the statement shown beside it (null when there is none). */
  sourceColumn: string; statementColumn: string | null;
  confirmedText: string;
  groups: SourceGroupRow[];
  totals: Array<{ label: string; value: string; negative: boolean }>;
  footnote: string | null;
  /** `costs` is what the loan itself adds to operating costs a year, when it adds any. */
  terms: null | { label: string; current: string; next: string; released: string; coverage: string; costs: string | null };
};

export function sourceView(body: EarningsPlanBody, baseline: PlanBaseline, sourceChanged: boolean): SourceView {
  const source = baseline.source ?? {};
  const confirmations = sourceChanged ? {} : body.source?.confirmations ?? {};
  const corrections = body.source?.corrections ?? {};
  const statement = baseline.statement ?? null;
  const hasStatement = Boolean(statement) && (baseline.groups ?? []).some(group => group.statement_amount != null);
  const groups = (baseline.groups ?? []).map((group): SourceGroupRow => {
    const state = confirmations[group.key] === "corrected" ? "corrected" : confirmations[group.key] ? "confirmed" : "open";
    const correction = corrections[group.key];
    const other = group.statement_amount;
    return {
      key: group.key, label: group.label, amount: group.amount, source: usd(group.amount),
      statement: other != null ? usd(other) : DASH, variance: other != null ? signedUsd(other - group.amount) : DASH, state,
      tag: state === "corrected" ? { label: "Correction noted", tone: "warn" } : state === "confirmed" ? { label: "Confirmed", tone: "ok" } : { label: "Not confirmed", tone: "mut" },
      correction: correction ? { amount: number(correction.amount), reason: correction.reason, text: `${usd(number(correction.amount))} against ${usd(group.amount)} on the source` } : null,
    };
  });
  const confirmed = groups.filter(group => group.state !== "open").length;
  const period = periodLabel(source.period_start, source.period_end) ?? (source.year ? `Tax year ${source.year}` : periodLabel(body.period_start, body.period_end) ?? "Period not stated");
  const basis = source.basis ? source.basis.charAt(0).toUpperCase() + source.basis.slice(1) : null;
  const e0 = number(baseline.ebitda), noi0 = number(baseline.noi);
  const current = baseline.debt_service_current, terms = baseline.debt_service_with_terms;
  const ok = available(baseline);
  return {
    available: ok,
    primary: source.label ?? "No earnings source in use",
    period: `${period}${source.period_assumed ? " · calendar year assumed" : ""}${source.annualized ? " · annualized" : ""}`,
    currencyBasis: [source.currency ?? body.currency ?? "USD", basis].filter(Boolean).join(" · "),
    sourceColumn: sourceShort(baseline),
    statementColumn: hasStatement ? `${statement?.label?.split(" · ")[0] ?? "P&L"}${statement?.annualized ? " annualized" : ""}` : null,
    confirmedText: `${confirmed} of ${groups.length} confirmed`,
    groups,
    totals: ok ? [
      { label: "Revenue", value: usd(baseline.revenue), negative: false },
      { label: "NOI", value: usd(noi0), negative: noi0 < 0 },
      { label: "EBITDA", value: usd(e0), negative: e0 < 0 },
      { label: "Annual debt service", value: current != null ? usd(current) : DASH, negative: false },
    ] : [],
    footnote: !ok ? null
      : e0 - noi0 >= 0.5 ? `EBITDA includes ${usd(e0 - noi0)} of other income, depreciation and amortization that NOI excludes. DSCR is EBITDA over annual debt service.`
      : "DSCR is EBITDA over annual debt service.",
    terms: terms != null && current != null ? {
      label: baseline.terms_label || "Saved loan terms",
      current: `${usd(baseline.debt_service_current_monthly ?? current / 12)} / mo`,
      next: `${usd(baseline.debt_service_with_terms_monthly ?? terms / 12)} / mo`,
      released: `${usd(number(baseline.released_monthly))} / mo`,
      coverage: ok && current && terms ? `${times(e0 / current)} → ${times((e0 - loanOperating(baseline)) / terms)}` : DASH,
      costs: loanOperating(baseline) > 0 ? `${usd(loanOperating(baseline))} / yr` : null,
    } : null,
  };
}

// ---------------------------------------------------------------------------
// Step 2: revenue model and cost relationships
// ---------------------------------------------------------------------------

/** The one figure the revenue model starts from, in words: what the source prints, and what that is in an average month. */
export function revenueLead(baseline: PlanBaseline): string {
  if (!available(baseline)) return "The file has no earnings source yet, so there is no revenue to break down.";
  const name = sourceShort(baseline);
  const source = baseline.source ?? {};
  return `${name === "Source" ? "The source" : name} ${source.annualized ? "annualizes to" : "prints"} ${usd(baseline.revenue)} of revenue, which is ${usd(number(baseline.revenue) / 12)} in an average month.`;
}

/** One typed quantity of a measure. `named` is a metric the business added, so it names it and can remove it. */
export type MeasureInput = { id: string; label: string; named: boolean; value: Amount; unit: string };
/**
 * One way a stream's month is counted, with what one of it brings in and costs. The stream's own volume (what
 * revenue follows) is one row, however many metrics multiply into it; each measure alongside is a row of its own.
 */
export type MeasureRow = {
  /** The metric behind a measure alongside; null for the stream's own volume. */
  factorId: string | null;
  role: "volume" | "alongside";
  inputs: MeasureInput[];
  /** Several metrics multiplied into one volume: "= 100 a month". */
  total: string | null;
  /** One of it: "unit", "hour", "billable hour". */
  word: string;
  note: string;
  revenue: string; cost: string; noi: string; noiTone: Tone;
};
export type StreamCard = {
  id: string; name: string; typeLabel: string;
  /** The text in the revenue box. Null for the stream that holds the rest: it has nothing to type. */
  revenueInput: Amount | null;
  monthly: string; annual: string;
  /** How the stream sits in the average month. */
  share: string;
  measures: MeasureRow[];
  /** Said while the stream has nothing to divide by. */
  unmeasured: string | null;
  canMeasure: boolean;
};

const isVolume = (factor: PlanFactor) => Boolean(factor.volume) && !factor.alongside;

/** One of what a stream sells: its kind's own word, or for a stream described freely the unit its volume is counted in. */
export function unitWord(stream: PlanStream | undefined, templates: Record<string, StreamTemplate>): string {
  if (stream && stream.type !== "custom" && templates[stream.type]) return templates[stream.type].unit_word;
  const first = stream?.factors.find(isVolume);
  return first ? perWord(first.unit) : templates.custom?.unit_word ?? "unit";
}

const perUnitCells = (figures: PlanPerUnit | null | undefined): Pick<MeasureRow, "revenue" | "cost" | "noi" | "noiTone"> => (figures
  ? { revenue: each(figures.revenue), cost: each(figures.cost), noi: each(figures.noi), noiTone: Math.abs(figures.noi) < 0.005 ? "mut" : figures.noi > 0 ? "ok" : "bad" }
  : { revenue: DASH, cost: DASH, noi: DASH, noiTone: "mut" });

export function streamCards(body: EarningsPlanBody, baseline: PlanBaseline, result: PlanResult, templates: Record<string, StreamTemplate>): StreamCard[] {
  const source = available(baseline) ? number(baseline.revenue) : 0;
  return body.streams.map(stream => {
    const revenue = result.model.revenue[stream.id] ?? 0, volume = result.model.volume[stream.id] ?? 0;
    const figures = (factorId: string | null) => result.per_unit.find(row => row.stream_id === stream.id && row.factor_id === factorId)?.today;
    const input = (factor: PlanFactor): MeasureInput => ({ id: factor.id, label: factor.label, named: Boolean(factor.custom), value: factor.value, unit: factor.unit });
    const chain = stream.factors.filter(isVolume);
    const measures: MeasureRow[] = [];
    if (chain.length) {
      measures.push({
        factorId: null, role: "volume", inputs: chain.map(input), total: chain.length > 1 ? `= ${plain(volume / 12)} a month` : null,
        word: unitWord(stream, templates), note: "Revenue follows this", ...perUnitCells(figures(null)),
      });
    }
    for (const factor of stream.factors) {
      if (factor.alongside) measures.push({ factorId: factor.id, role: "alongside", inputs: [input(factor)], total: null, word: perWord(factor.unit), note: "Moves with the volume", ...perUnitCells(figures(factor.id)) });
    }
    // A stream described as units times price shows the revenue that made; typing in the box is what turns it into a stated one.
    const revenueInput = stream.remainder ? null : stream.monthly_revenue != null ? stream.monthly_revenue : Math.round((revenue / 12) * 100) / 100;
    return {
      id: stream.id, name: stream.name, typeLabel: templates[stream.type]?.label ?? "Custom metrics", revenueInput,
      annual: usd(revenue), monthly: usd(revenue / 12),
      share: stream.remainder ? (body.streams.length > 1 ? "what the other streams leave" : "the whole average month")
        : source > 0 ? `${ratioPercent(revenue / source)} of the average month` : "",
      measures,
      unmeasured: chain.length ? null : "Not counted yet. Add what an average month has (units, hours, jobs) to see what one of them brings in and costs.",
      canMeasure: stream.factors.length < 12,
    };
  });
}

/** What a per-unit cost can follow: each stream's own volume and each measure alongside it, then all revenue. */
export function costLinks(body: EarningsPlanBody): Array<{ value: string; label: string }> {
  return [
    ...body.streams.flatMap(stream => [
      { value: stream.id, label: stream.name || "Revenue stream" },
      ...stream.factors.filter(factor => factor.alongside).map(factor => ({ value: `${stream.id}|${factor.id}`, label: `${stream.name || "Revenue stream"} · ${factor.label || "measure"}` })),
    ]),
    { value: ALL, label: "All revenue" },
  ];
}

export type Reconciliation = { reconciles: boolean; tag: Tag; text: string; balance: string | null };

export function reconciliation(body: EarningsPlanBody, baseline: PlanBaseline, result: PlanResult): Reconciliation {
  // The same name the to-finish list uses ("Reconcile the revenue model to IRS revenue").
  const name = baseline.source_name || "source";
  if (!available(baseline)) return { reconciles: false, tag: { label: "No source revenue to match yet", tone: "mut" }, text: `Streams total ${usd(result.model.total / 12)} a month`, balance: null };
  const { difference, reconciles } = result.model;
  // A stream that holds the rest keeps the model equal to the source by itself. Without one, what is missing can go into one;
  // streams that state more than the source can only be lowered.
  const holdsTheRest = body.streams.some(stream => stream.remainder);
  const average = usd(number(baseline.revenue) / 12);
  return {
    reconciles,
    tag: reconciles ? { label: `Reconciles to ${name} revenue`, tone: "ok" } : { label: `Differs from ${name} revenue by ${signedUsd(difference)}`, tone: "warn" },
    text: reconciles ? `Streams add up to ${average} a month, the average of ${name} revenue ${usd(baseline.revenue)} a year`
      : difference > 0 ? `Streams state ${usd(result.model.total / 12)} a month against an average of ${average}: ${usd(difference / 12)} a month too much. Lower one of them.`
      : `Streams state ${usd(result.model.total / 12)} a month against an average of ${average}: ${usd(-difference / 12)} a month is not explained.`,
    balance: !reconciles && difference < 0 && !holdsTheRest ? "Put the rest in “Other revenue”" : null,
  };
}

export type CostRow = {
  id: string; label: string; group: string; groupLabel: string; behavior: LineBehavior;
  /** What the cost follows, as `costLinks` names it: a stream, "stream|measure", or all revenue. */
  link: string; fixed: boolean;
  rate: string; base: string; baseValue: Amount; added: boolean;
};

export function costRows(body: EarningsPlanBody, baseline: PlanBaseline, result: PlanResult, templates: Record<string, StreamTemplate>): CostRow[] {
  const labels = new Map((baseline.groups ?? []).map(group => [group.key, group.label]));
  const streams = new Map(body.streams.map(stream => [stream.id, stream]));
  return body.lines.map(line => {
    const effective = result.behaviors[line.id] ?? "fixed", rate = result.rates[line.id] ?? 0;
    const stream = streams.get(line.link);
    const measure = line.behavior === "unit" && line.measure ? stream?.factors.find(factor => factor.id === line.measure && factor.alongside) : undefined;
    return {
      id: line.id, label: line.label, group: line.group, groupLabel: labels.get(line.group) ?? line.group,
      behavior: line.behavior, link: measure ? `${line.link}|${measure.id}` : line.link, fixed: line.behavior === "fixed", added: Boolean(line.added),
      rate: effective === "fixed" ? (line.behavior === "fixed" ? "Fixed amount" : "Nothing counted to follow yet · held fixed")
        : effective === "unit" ? `$${rate.toFixed(2)} per ${measure ? perWord(measure.unit) : unitWord(stream, templates)}` : `${(rate * 100).toFixed(2)}% of revenue`,
      base: usd(number(line.base)), baseValue: line.base,
    };
  });
}

export type CategoryRow = { key: string; label: string; answer: CategoryAnswer | null; tag: Tag };
const ANSWER_LABELS: Record<CategoryAnswer, string> = { included: "Included in another line", not_applicable: "Not applicable", help: "Team will help" };
export const CATEGORY_OPTIONS: Array<{ value: CategoryAnswer; label: string }> = [
  { value: "included", label: "Included in another line" }, { value: "not_applicable", label: "Not applicable" }, { value: "help", label: "Needs help" },
];

export function categoryRows(body: EarningsPlanBody, questions: readonly PlanQuestion[]): CategoryRow[] {
  return questions.map(question => {
    const answer = body.category_answers?.[question.key] ?? null;
    return { key: question.key, label: question.label, answer, tag: { label: answer ? ANSWER_LABELS[answer] : "Not answered", tone: !answer ? "mut" : answer === "help" ? "warn" : "ok" } };
  });
}

// ---------------------------------------------------------------------------
// Step 3: changes
// ---------------------------------------------------------------------------

export type EffectView = {
  chip: Tag; dscr: string; firstYear: string; moves: string;
  /** The twelve plan months: true from the month the change takes effect, while it is counted. */
  spark: boolean[]; positive: boolean;
  status: Tag; needsNote: boolean; dimmed: boolean;
};
export type ChangeRow = {
  /** Stable across edits: the place a change lands, or the activity's own id. */
  rowKey: string;
  kind: "command" | "growth" | "activity";
  itemId: string | null;
  item: PlanItemRow | null;
  target: PlanTarget | null;
  /** How a new change here starts: prices and volumes go up, costs go down. */
  direction: "up" | "down";
  label: string; sub: string; current: string; plan: string; planTone: Tone | null;
  /**
   * The ways a change here can be sized, in the order they are offered. A cost that follows revenue or a stream takes
   * dollars a year first (what it costs on the source's volume), then its own rate ("pts", "$ / unit"), then a percent.
   */
  units: Array<{ value: ChangeMode; label: string }>;
  effect: EffectView | null;
  /** Growth only: the volume metrics of the stream it feeds. */
  factorOptions?: Array<{ value: string; label: string }>;
};
export type ChangeSection = { key: string; title: string; sub: string; total: Tag; rows: ChangeRow[]; add: "growth" | "activity" | null; addLabel: string; canAdd: boolean; empty: string | null };

const SECTION_COPY: Record<string, { sub: string; empty: string | null }> = {
  revenue: { sub: "Change any metric that produces revenue: price, volume, hours, utilization, contracts or occupancy. Costs linked to the stream move with it.", empty: "Describe the revenue streams in step 2 to change them here." },
  growth: { sub: "Spending that drives more activity. The added volume runs through the revenue model, so revenue, linked costs and card fees all follow.", empty: null },
  cogs: { sub: "Direct costs from the source, linked to the streams they serve.", empty: "The source prints no cost of goods sold." },
  opex: { sub: "Each deduction on the source. Lower or raise any line by an amount or a percent.", empty: "The source prints no operating expenses." },
  activities: { sub: "Costs that do not exist today, such as a new hire or a new location.", empty: null },
};

const effectTone = (value: number): Tone => (Math.abs(value) < 1 ? "mut" : value > 0 ? "ok" : "bad");
/** A change sized in the unit of what it changes, or as a percent of it. */
const sizes = (amount: string): ChangeRow["units"] => [{ value: "amount", label: amount }, { value: "percent", label: "%" }];

function effectView(result: PlanResult, item: PlanItemRow, planDebt: number | null): EffectView {
  const effect = result.effects[item.id];
  const summary = result.items.find(row => row.id === item.id);
  const counted = Boolean(summary?.included);
  const start = startMonth(item);
  const needsNote = counted && !String(item.note ?? "").trim();
  const moves = effect?.moves ?? [];
  return {
    chip: { label: `EBITDA ${signedUsd(effect?.ebitda ?? 0)} / yr`, tone: effectTone(effect?.ebitda ?? 0) },
    dscr: planDebt ? `DSCR ${signedTimes((effect?.ebitda ?? 0) / planDebt)}` : "",
    firstYear: `First year ${signedUsd(effect?.first_year ?? 0)}`,
    moves: moves.length ? `Moves ${moves.slice(0, 4).map(move => `${move.label} ${signedUsd(move.amount)}`).join(" · ")}${moves.length > 4 ? ` · ${moves.length - 4} more` : ""}` : "No effect yet",
    spark: Array.from({ length: 12 }, (_unused, index) => counted && index + 1 >= start),
    positive: (effect?.ebitda ?? 0) >= 0,
    status: item.status === "approved" ? { label: "Reviewed", tone: "ok" } : item.status === "rejected" ? { label: "Rejected", tone: "bad" }
      : needsNote ? { label: "Explanation needed", tone: "warn" } : { label: "Proposed", tone: "mut" },
    needsNote,
    dimmed: item.included === false || item.status === "rejected",
  };
}

export function changeSections(body: EarningsPlanBody, baseline: PlanBaseline, result: PlanResult, templates: Record<string, StreamTemplate>, basis: DebtBasis): ChangeSection[] {
  const plan = new Plan(body, baseline);
  const planDebt = basis === "with_terms" ? baseline.debt_service_with_terms : baseline.debt_service_current;
  const labels = new Map((baseline.groups ?? []).map(group => [group.key, group.label]));
  const groupLabel = (key: string) => labels.get(key) ?? key;
  const proposed = result.proposed;
  const withChange = (key: string) => {
    const change = plan.changeAt.get(key) ?? null;
    return { itemId: change?.id ?? null, item: change as PlanChange | null, effect: change ? effectView(result, change, planDebt ?? null) : null };
  };

  // Revenue drivers: overall pricing, then every metric of every stream.
  const pricing = plan.changeAt.get("pricing");
  const priced = pricing ? plan.revenue(id => id === String(pricing.id), plan.model.total).total - plan.model.total : 0;
  const revenueRows: ChangeRow[] = body.streams.length ? [{
    rowKey: "pricing", kind: "command", target: { kind: "pricing" }, direction: "up", ...withChange("pricing"),
    label: "Overall pricing", sub: "All revenue streams · price only, volume unchanged",
    current: `Current ${usd(plan.model.total)} / yr`, plan: Math.abs(priced) >= 0.5 ? `Price effect ${signedUsd(priced)} / yr` : "", planTone: null, units: sizes("$ / yr"),
  }] : [];
  for (const stream of body.streams) {
    stream.factors.forEach((factor, index) => {
      const key = `f:${stream.id}:${factor.id}`;
      // Today's value as the engine reads it: a stream that states its revenue never types its price.
      const now = plan.model.factors[stream.id]?.[index] ?? number(factor.value), then = proposed.factors[stream.id]?.[index] ?? now;
      revenueRows.push({
        rowKey: key, kind: "command", target: { kind: "factor", stream_id: stream.id, factor_id: factor.id }, direction: "up", ...withChange(key),
        label: factor.label || "Metric", sub: `${stream.name || "Revenue stream"}${factor.alongside ? " · counted alongside; costs that follow it move, revenue does not" : ""}`,
        current: `Current ${factorValue(factor, now)}`,
        plan: Math.abs(then - now) > 1e-9 ? `Plan ${factorValue(factor, then)}` : "", planTone: null, units: sizes(factorAmountLabel(factor)),
      });
    });
  }

  const growthRows: ChangeRow[] = body.growth.map((row: PlanGrowth) => {
    const stream = body.streams.find(item => item.id === row.stream_id);
    const spend = number(row.monthly_spend) * 12;
    const effect = result.effects[row.id];
    return {
      rowKey: `gr:${row.id}`, kind: "growth", itemId: row.id, item: row, target: null, direction: "up",
      label: row.name, sub: `Feeds ${stream?.name || "a revenue stream"}`, current: `Spend ${usd(spend)} / yr`,
      plan: `Returns $${(spend ? (effect?.revenue ?? 0) / spend : 0).toFixed(2)} revenue per $1`, planTone: null, units: [],
      effect: effectView(result, row, planDebt ?? null),
      factorOptions: (stream?.factors ?? []).filter(factor => factor.volume).map(factor => ({ value: factor.id, label: factor.label || "Metric" })),
    };
  });

  const lineRow = (lineId: string): ChangeRow => {
    const line = plan.lineById.get(lineId)!;
    const key = `l:${line.id}`;
    const effective = result.behaviors[line.id] ?? "fixed", rate = result.rates[line.id] ?? 0;
    const stream = body.streams.find(item => item.id === line.link);
    const measure = line.measure ? stream?.factors.find(factor => factor.id === line.measure && factor.alongside) : undefined;
    const base = number(line.base), then = proposed.lines[line.id] ?? base;
    const moved = Math.abs(then - base) >= 1;
    const follows = effective === "fixed" ? "fixed"
      : effective === "unit" ? `$${rate.toFixed(2)} per ${measure ? perWord(measure.unit) : unitWord(stream, templates)} of ${stream?.name || "its stream"}`
      : `${(rate * 100).toFixed(1)}% of ${line.link === ALL ? "all revenue" : `${stream?.name || "its stream"} revenue`}`;
    const change = withChange(key);
    return {
      rowKey: key, kind: "command", target: { kind: "line", line_id: line.id }, direction: "down", ...change,
      label: line.label || groupLabel(line.group), sub: `${groupLabel(line.group)} · ${follows}`, current: `Current ${usd(base)} / yr`,
      plan: moved ? `Plan ${usd(then)} / yr${change.itemId ? "" : " · follows its driver"}` : "", planTone: moved ? (then > base ? "bad" : "ok") : null,
      // A cost that follows a driver is sized in dollars a year first: what an owner means by "cut this by $20,000".
      units: effective === "fixed" ? sizes("$ / yr") : [{ value: "annual", label: "$ / yr" }, ...sizes(effective === "unit" ? "$ / unit" : "pts")],
    };
  };
  const groupRow = (group: string): ChangeRow => {
    const members = body.lines.filter(line => line.group === group);
    const now = members.reduce((sum, line) => sum + number(line.base), 0);
    const then = members.reduce((sum, line) => sum + (proposed.lines[line.id] ?? number(line.base)), 0);
    const moved = Math.abs(then - now) >= 1;
    return {
      rowKey: `g:${group}`, kind: "command", target: { kind: "group", group }, direction: "down", ...withChange(`g:${group}`),
      label: `Whole group: ${groupLabel(group)}`, sub: `Applied proportionally to all ${members.length} items`, current: `Current ${usd(now)} / yr`,
      plan: moved ? `Plan ${usd(then)} / yr` : "", planTone: moved ? (then > now ? "bad" : "ok") : null, units: sizes("$ / yr"),
    };
  };
  // A whole-group row appears where a group is split into items, or already carries a group change.
  const groupsWith = (inCogs: boolean) => {
    const keys: string[] = [];
    for (const line of body.lines) if ((line.group === COGS_GROUP) === inCogs && !keys.includes(line.group)) keys.push(line.group);
    return keys.filter(key => body.lines.filter(line => line.group === key).length > 1 || plan.changeAt.has(`g:${key}`));
  };
  const costRowsFor = (inCogs: boolean) => [
    ...body.lines.filter(line => (line.group === COGS_GROUP) === inCogs).map(line => lineRow(line.id)),
    ...groupsWith(inCogs).map(groupRow),
  ];

  const activityRows: ChangeRow[] = body.activities.map((row: PlanActivity) => ({
    rowKey: `na:${row.id}`, kind: "activity", itemId: row.id, item: row, target: null, direction: "up",
    label: row.name, sub: "New operating cost", current: "Current $0", plan: `Plan ${usd(number(row.monthly_amount) * 12)} / yr`, planTone: "bad", units: [],
    effect: effectView(result, row, planDebt ?? null),
  }));

  const rows: Record<string, ChangeRow[]> = { revenue: revenueRows, growth: growthRows, cogs: costRowsFor(true), opex: costRowsFor(false), activities: activityRows };
  const canGrow = body.streams.some(stream => stream.factors.some(factor => factor.volume));
  return result.sections.map(section => ({
    key: section.key, title: section.label, sub: SECTION_COPY[section.key]?.sub ?? "",
    total: { label: `EBITDA ${signedUsd(section.ebitda)} / yr`, tone: effectTone(section.ebitda) },
    rows: rows[section.key] ?? [],
    add: section.key === "growth" ? "growth" : section.key === "activities" ? "activity" : null,
    addLabel: section.key === "growth" ? "Add growth activity" : section.key === "activities" ? "Add new activity" : "",
    canAdd: section.key === "growth" ? canGrow : section.key === "activities",
    empty: (rows[section.key] ?? []).length ? null : section.key === "growth" && !canGrow ? "Count a revenue stream in step 2 (its units, hours or jobs) to plan growth: growth adds to what is counted." : SECTION_COPY[section.key]?.empty ?? null,
  }));
}

/** `effect` says what the refinance itself does to the six figures, so nobody has to wonder whether released cash is counted. */
export type ReleasedView = { text: string; tag: Tag; available: boolean; effect: string | null };

export function releasedView(baseline: PlanBaseline, result: PlanResult, basis: DebtBasis): ReleasedView {
  const applied = basis === "with_terms";
  const cap = applied ? result.released.available_monthly : 0;
  const allocated = result.released.allocated_monthly;
  const current = baseline.debt_service_current, terms = baseline.debt_service_with_terms;
  // What the saved terms alone do to cash after debt: lower payments, less any operating cost the loan itself adds.
  const costs = loanOperating(baseline);
  const gained = applied && current != null && terms != null ? current - terms - costs : null;
  return {
    available: applied && cap > 0,
    effect: gained == null || Math.abs(gained) < 0.5 ? null
      : `The saved loan terms are already counted in the figures: annual debt service goes from ${usd(current)} to ${usd(terms)}, which ${gained > 0 ? "adds" : "takes"} ${usd(Math.abs(gained))} a year ${gained > 0 ? "to" : "from"} free cash flow${costs > 0 ? ` after the ${usd(costs)} a year of operating costs the loan itself adds,` : ""} and moves DSCR with it. It does not change EBITDA or NOI, because loan payments are not operating costs.`,
    text: baseline.debt_service_with_terms == null ? "No loan terms are saved on this file, so there is no released cash to assign."
      : !applied ? "Loan terms are not applied, so there is no released cash to assign."
      : `${baseline.terms_label || "The saved loan terms"} release ${usd(cap)} a month. Assign it to costs the plan relies on, a reserve, or leave it as cash.`,
    tag: allocated > cap ? { label: `Over-allocated by ${usd(allocated - cap)} / mo`, tone: "bad" } : { label: `${usd(cap - allocated)} / mo stays as cash`, tone: "mut" },
  };
}

// ---------------------------------------------------------------------------
// Step 4: review
// ---------------------------------------------------------------------------

export type ReviewRow = { id: string; label: string; status: Tag; effect: string; reviewable: boolean; why: string | null };

/** Every change with its state. One that is switched off, or has no explanation yet, cannot be approved. */
export function reviewRows(body: EarningsPlanBody, result: PlanResult, staleReviews: readonly string[]): ReviewRow[] {
  const stale = new Set(staleReviews);
  const rows = new Map<string, PlanItemRow>([...body.changes, ...body.growth, ...body.activities].map(row => [row.id, row]));
  return result.items.map(item => {
    const row = rows.get(item.id);
    const off = !item.on;
    return {
      id: item.id, label: item.label,
      status: item.status === "approved" ? { label: "Approved", tone: "ok" } : item.status === "rejected" ? { label: "Rejected", tone: "bad" }
        : stale.has(item.id) ? { label: "Review again", tone: "warn" } : { label: "Proposed", tone: "mut" },
      effect: signedUsd(result.effects[item.id]?.ebitda ?? 0),
      reviewable: !off,
      why: off ? "Switched off" : !String(row?.note ?? "").trim() ? "No explanation yet" : null,
    };
  });
}

export type HandoffRow = { key: string; label: string; reason: string };

/** Source corrections the business recorded, for the tax preparer. They never change the plan's figures. */
export function handoffRows(body: EarningsPlanBody, baseline: PlanBaseline): HandoffRow[] {
  const groups = new Map((baseline.groups ?? []).map(group => [group.key, group]));
  return Object.entries(body.source?.corrections ?? {}).map(([key, correction]) => {
    const group = groups.get(key);
    return { key, label: `${group?.label ?? key} · ${usd(number(correction.amount))} against ${group ? usd(group.amount) : DASH} on the source`, reason: correction.reason };
  });
}
