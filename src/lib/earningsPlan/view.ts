/**
 * Everything the Earnings Plan screens print, worked out from the plan body,
 * the file's baseline and the engine's result. The components only lay these
 * out, so a figure that drifts from the design fails a test here rather than
 * showing up on a screen.
 */
import { waterfall, type WaterfallBar } from "@/lib/financialsOverview";
import { ALL, COGS_GROUP, Plan, number, startMonth } from "./math";
import { remainderStream } from "./edit";
import { count, factorAmountLabel, factorValue, periodLabel, plain, planMonthShort, points, ratioPercent, signedTimes, signedUsd, times, usd } from "./format";
import type {
  Amount, CategoryAnswer, EarningsPlanBody, LineBehavior, PlanActivity, PlanBaseline, PlanChange, PlanGrowth, PlanItemRow, PlanQuestion,
  PlanResult, PlanSixMetrics, PlanStream, PlanTarget, PlanView, StreamTemplate,
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
  const { proposed, reviewed, first_year: first } = result;
  const money = (label: string, now: number, plan: number, rev: number): BeforeAfterRow =>
    ({ label, current: usd(now), plan: usd(plan), reviewed: usd(rev), delta: signedUsd(plan - now), tone: Math.abs(plan - now) < 0.5 ? "mut" : plan >= now ? "ok" : "bad" });
  const ratio = (label: string, debt: number | null, now: number, plan: number, rev: number): BeforeAfterRow | null =>
    (debt ? { label, current: times(now / debt), plan: times(plan / debt), reviewed: times(rev / debt), delta: signedTimes(plan / debt - now / debt), tone: Math.abs(plan - now) < 0.5 ? "mut" : plan >= now ? "ok" : "bad" } : null);
  const rows: Array<BeforeAfterRow | null> = [
    money("Annual NOI", noi0, proposed.noi, reviewed.noi),
    current != null && planDebt != null ? money("Cash after debt / year", e0 - current, proposed.ebitda - planDebt, reviewed.ebitda - planDebt) : null,
    money("Annual EBITDA", e0, proposed.ebitda, reviewed.ebitda),
    money("First-year EBITDA", e0, first.proposed.ebitda, first.reviewed.ebitda),
    money("First-year NOI", noi0, first.proposed.noi, first.reviewed.noi),
    ratio("DSCR · current debt", current, e0, proposed.ebitda, reviewed.ebitda),
    terms != null ? ratio("DSCR · saved refinance", terms, e0, proposed.ebitda, reviewed.ebitda) : ratio("First-year DSCR · current debt", current, e0, first.proposed.ebitda, first.reviewed.ebitda),
    terms != null ? ratio("First-year DSCR · saved refinance", terms, e0, first.proposed.ebitda, first.reviewed.ebitda) : null,
  ];
  return rows.filter((row): row is BeforeAfterRow => row !== null);
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
  const needed = target * plan.debt_service - plan.ebitda;
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
  terms: null | { label: string; current: string; next: string; released: string; coverage: string };
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
      coverage: ok && current && terms ? `${times(e0 / current)} → ${times(e0 / terms)}` : DASH,
    } : null,
  };
}

// ---------------------------------------------------------------------------
// Step 2: revenue model and cost relationships
// ---------------------------------------------------------------------------

export type StreamCard = {
  id: string; name: string; typeLabel: string; annual: string; monthly: string; volumeText: string;
  factors: Array<{ id: string; label: string; custom: boolean; value: Amount; prefix: string; unit: string }>;
  canAddFactor: boolean;
};

const unitWord = (stream: PlanStream | undefined, templates: Record<string, StreamTemplate>) => templates[stream?.type ?? "custom"]?.unit_word ?? "unit";

export function streamCards(body: EarningsPlanBody, result: PlanResult, templates: Record<string, StreamTemplate>): StreamCard[] {
  return body.streams.map(stream => {
    const revenue = result.model.revenue[stream.id] ?? 0, volume = result.model.volume[stream.id] ?? 0;
    const word = unitWord(stream, templates);
    return {
      id: stream.id, name: stream.name, typeLabel: templates[stream.type]?.label ?? "Custom metrics",
      annual: usd(revenue), monthly: `${usd(revenue / 12)} / month`,
      volumeText: `Business unit: ${word} · ${plain(volume, 0)} a year${volume ? ` · ${usd(revenue / volume, 2)} revenue per ${word}` : ""}`,
      factors: stream.factors.map(factor => ({ id: factor.id, label: factor.label, custom: Boolean(factor.custom), value: factor.value, prefix: factor.unit === "$" ? "$" : "", unit: factor.unit === "$" ? "" : factor.unit })),
      canAddFactor: stream.factors.length < 12,
    };
  });
}

export type Reconciliation = { reconciles: boolean; tag: Tag; text: string; balance: string | null };

export function reconciliation(body: EarningsPlanBody, baseline: PlanBaseline, result: PlanResult): Reconciliation {
  // The same name the to-finish list uses ("Reconcile the revenue model to IRS revenue").
  const name = baseline.source_name || "source";
  if (!available(baseline)) return { reconciles: false, tag: { label: "No source revenue to match yet", tone: "mut" }, text: `Model total ${usd(result.model.total)}`, balance: null };
  const { difference, reconciles } = result.model;
  const remainder = remainderStream(body);
  // Below the source, the rest can go into one stream; above it, only lowering a named stream helps unless a remainder stream is there to shrink.
  const canBalance = !reconciles && (difference < 0 || (remainder !== null && number(remainder.factors[1]?.value) > 0));
  return {
    reconciles,
    tag: reconciles ? { label: `Reconciles to ${name} revenue`, tone: "ok" } : { label: `Differs from ${name} revenue by ${signedUsd(difference)}`, tone: "warn" },
    text: `Model total ${usd(result.model.total)} against ${name} revenue ${usd(baseline.revenue)}`,
    balance: canBalance ? `Put the difference in ${remainder ? `“${remainder.name || "Other revenue"}”` : "“Other revenue”"}` : null,
  };
}

export type CostRow = {
  id: string; label: string; group: string; groupLabel: string; behavior: LineBehavior; link: string; fixed: boolean;
  rate: string; base: string; baseValue: Amount; added: boolean;
};

export function costRows(body: EarningsPlanBody, baseline: PlanBaseline, result: PlanResult, templates: Record<string, StreamTemplate>): CostRow[] {
  const labels = new Map((baseline.groups ?? []).map(group => [group.key, group.label]));
  const streams = new Map(body.streams.map(stream => [stream.id, stream]));
  return body.lines.map(line => {
    const effective = result.behaviors[line.id] ?? "fixed", rate = result.rates[line.id] ?? 0;
    return {
      id: line.id, label: line.label, group: line.group, groupLabel: labels.get(line.group) ?? line.group,
      behavior: line.behavior, link: line.link, fixed: line.behavior === "fixed", added: Boolean(line.added),
      rate: effective === "fixed" ? (line.behavior === "fixed" ? "Fixed amount" : "Driver is zero · held fixed")
        : effective === "unit" ? `$${rate.toFixed(2)} per ${unitWord(streams.get(line.link), templates)}` : `${(rate * 100).toFixed(2)}% of revenue`,
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
  /** What "by an amount" means here: "$ / yr", "$ / unit", "pts", "units". */
  amountLabel: string;
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
    current: `Current ${usd(plan.model.total)} / yr`, plan: Math.abs(priced) >= 0.5 ? `Price effect ${signedUsd(priced)} / yr` : "", planTone: null, amountLabel: "$ / yr",
  }] : [];
  for (const stream of body.streams) {
    stream.factors.forEach((factor, index) => {
      const key = `f:${stream.id}:${factor.id}`;
      const now = number(factor.value), then = proposed.factors[stream.id]?.[index] ?? now;
      revenueRows.push({
        rowKey: key, kind: "command", target: { kind: "factor", stream_id: stream.id, factor_id: factor.id }, direction: "up", ...withChange(key),
        label: factor.label || "Metric", sub: stream.name || "Revenue stream", current: `Current ${factorValue(factor, now)}`,
        plan: Math.abs(then - now) > 1e-9 ? `Plan ${factorValue(factor, then)}` : "", planTone: null, amountLabel: factorAmountLabel(factor),
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
      plan: `Returns $${(spend ? (effect?.revenue ?? 0) / spend : 0).toFixed(2)} revenue per $1`, planTone: null, amountLabel: "",
      effect: effectView(result, row, planDebt ?? null),
      factorOptions: (stream?.factors ?? []).filter(factor => factor.volume).map(factor => ({ value: factor.id, label: factor.label || "Metric" })),
    };
  });

  const lineRow = (lineId: string): ChangeRow => {
    const line = plan.lineById.get(lineId)!;
    const key = `l:${line.id}`;
    const effective = result.behaviors[line.id] ?? "fixed", rate = result.rates[line.id] ?? 0;
    const stream = body.streams.find(item => item.id === line.link);
    const base = number(line.base), then = proposed.lines[line.id] ?? base;
    const moved = Math.abs(then - base) >= 1;
    const follows = effective === "fixed" ? "fixed"
      : effective === "unit" ? `$${rate.toFixed(2)} per ${unitWord(stream, templates)} of ${stream?.name || "its stream"}`
      : `${(rate * 100).toFixed(1)}% of ${line.link === ALL ? "all revenue" : `${stream?.name || "its stream"} revenue`}`;
    const change = withChange(key);
    return {
      rowKey: key, kind: "command", target: { kind: "line", line_id: line.id }, direction: "down", ...change,
      label: line.label || groupLabel(line.group), sub: `${groupLabel(line.group)} · ${follows}`, current: `Current ${usd(base)} / yr`,
      plan: moved ? `Plan ${usd(then)} / yr${change.itemId ? "" : " · follows its driver"}` : "", planTone: moved ? (then > base ? "bad" : "ok") : null,
      amountLabel: effective === "fixed" ? "$ / yr" : effective === "unit" ? "$ / unit" : "pts",
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
      plan: moved ? `Plan ${usd(then)} / yr` : "", planTone: moved ? (then > now ? "bad" : "ok") : null, amountLabel: "$ / yr",
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
    label: row.name, sub: "New operating cost", current: "Current $0", plan: `Plan ${usd(number(row.monthly_amount) * 12)} / yr`, planTone: "bad", amountLabel: "",
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
    empty: (rows[section.key] ?? []).length ? null : section.key === "growth" && !canGrow ? "Add a revenue stream with a volume metric in step 2 to plan growth." : SECTION_COPY[section.key]?.empty ?? null,
  }));
}

export type ReleasedView = { text: string; tag: Tag; available: boolean };

export function releasedView(baseline: PlanBaseline, result: PlanResult, basis: DebtBasis): ReleasedView {
  const applied = basis === "with_terms";
  const cap = applied ? result.released.available_monthly : 0;
  const allocated = result.released.allocated_monthly;
  return {
    available: applied && cap > 0,
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
