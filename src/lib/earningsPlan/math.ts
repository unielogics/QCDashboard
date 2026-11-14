/**
 * The earnings plan's arithmetic in the browser: one revenue model, costs that
 * follow it, and what each change does to earnings.
 *
 * The TypeScript twin of app/services/earnings_plan_math.py in the backend.
 * Both are ports of the Earnings Plan design's engine and both must reproduce
 * src/lib/__tests__/fixtures/earningsPlanReference.json; the plan screens use
 * this one so every figure follows the keyboard, and the API uses the other
 * for what is saved. Pure: no network, no clock, no React.
 *
 * The model
 * ---------
 * - A revenue stream is a set of factors. Volume factors multiply into the
 *   business units sold in a month; the others multiply into the price of one
 *   unit. Annual revenue is units x price x 12.
 * - A cost line is fixed, a dollar amount per unit of one stream, or a percent
 *   of a stream's (or all) revenue. Its rate is read off today's figures, so
 *   with no changes the model reproduces the source exactly.
 * - A change raises or lowers one thing by an amount or a percent: overall
 *   pricing, a stream factor, a cost line, or a whole cost group. A growth
 *   activity spends each month to add volume to a factor; a new activity is a
 *   cost that does not exist today.
 * - The plan figure is the baseline plus what the model moves. The baseline's
 *   own NOI and EBITDA are never recomputed here.
 *
 * Two breakdowns, both from the design: the bridge applies the sections in a
 * fixed order and adds up exactly to the plan figure; a change's own effect,
 * and a section's own total, is what the plan loses without it, and those do
 * not add up because changes interact.
 */
import { decimalInput } from "@/lib/decimalInput";
import type {
  EarningsPlanBody, LineBehavior, PlanActivity, PlanBaseline, PlanBridgeStep, PlanChange, PlanEffect, PlanGrowth, PlanItemKind,
  PlanItemRow, PlanLine, PlanMonth, PlanQuestion, PlanResult, PlanScenario, PlanSixMetrics, PlanStream, PlanTarget, PlanView, ToFinishItem,
} from "./types";

export const AREAS = ["Pricing", "Revenue drivers", "Growth", "Cost of goods sold", "Operating expenses", "New activities"] as const;
export const SECTIONS: ReadonlyArray<{ key: string; label: string; areas: number[] }> = [
  { key: "revenue", label: "Revenue drivers", areas: [0, 1] },
  { key: "growth", label: "Growth activities", areas: [2] },
  { key: "cogs", label: "Cost of goods sold", areas: [3] },
  { key: "opex", label: "Operating expenses", areas: [4] },
  { key: "activities", label: "New activities", areas: [5] },
];
export const COGS_GROUP = "cogs";
export const ALL = "all";
export const TARGET_DSCR = 1.25;
export const RECONCILE_TOLERANCE = 1;

export type Predicate = (itemId: string) => boolean;
export type PlanItem = { id: string; kind: PlanItemKind; key: string; row: PlanItemRow; area: number };
type RevenueModel = { volume: Record<string, number>; revenue: Record<string, number>; total: number; factors: Record<string, number[]> };
type Command = Pick<PlanChange, "direction" | "mode" | "value">;

/** A figure as the model counts it: a saved number, or the text being typed. Anything unreadable is zero. */
export function number(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  return decimalInput(value) ?? 0;
}

const sign = (change: Command) => (change.direction === "up" ? 1 : -1);

/** Raise or lower a figure by the change's amount or percent. */
function apply(base: number, change: Command): number {
  const value = number(change.value);
  return change.mode === "percent" ? base * (1 + (sign(change) * value) / 100) : base + sign(change) * value;
}

/** Where a change lands: one change per place. */
export function changeKey(change: { target?: PlanTarget | null }): string {
  const target = change.target;
  if (target?.kind === "pricing") return "pricing";
  if (target?.kind === "factor") return `f:${target.stream_id}:${target.factor_id}`;
  if (target?.kind === "line") return `l:${target.line_id}`;
  return `g:${target?.group}`;
}

export function startMonth(row: { start_month?: unknown }): number {
  const month = Math.trunc(Number(row.start_month ?? 1)) || 1;
  return Math.min(12, Math.max(1, month));
}

/** A plan body indexed for the engine. */
export class Plan {
  readonly streams: PlanStream[];
  readonly lines: PlanLine[];
  readonly changes: PlanChange[];
  readonly growth: PlanGrowth[];
  readonly activities: PlanActivity[];
  readonly streamById = new Map<string, PlanStream>();
  readonly lineById = new Map<string, PlanLine>();
  readonly groupLabels = new Map<string, string>();
  /** One change per place; a later duplicate is ignored rather than stacked. */
  readonly changeAt = new Map<string, PlanChange>();
  readonly items: PlanItem[] = [];
  readonly itemById = new Map<string, PlanItem>();
  readonly model: RevenueModel;
  readonly rates: Record<string, number> = {};

  constructor(readonly body: EarningsPlanBody, readonly baseline: PlanBaseline) {
    this.streams = body.streams ?? [];
    this.lines = body.lines ?? [];
    this.changes = body.changes ?? [];
    this.growth = body.growth ?? [];
    this.activities = body.activities ?? [];
    for (const row of this.streams) this.streamById.set(row.id, row);
    for (const row of this.lines) this.lineById.set(row.id, row);
    for (const row of baseline.groups ?? []) this.groupLabels.set(row.key, row.label || row.key);
    for (const change of this.changes) {
      const key = changeKey(change);
      if (!this.changeAt.has(key)) this.changeAt.set(key, change);
    }
    for (const [key, change] of this.changeAt) this.items.push({ id: String(change.id), kind: "change", key, row: change, area: this.changeArea(key) });
    for (const row of this.growth) this.items.push({ id: String(row.id), kind: "growth", key: `gr:${row.id}`, row, area: 2 });
    for (const row of this.activities) this.items.push({ id: String(row.id), kind: "activity", key: `na:${row.id}`, row, area: 5 });
    for (const item of this.items) this.itemById.set(item.id, item);
    this.model = this.revenue(() => false, 0);
    for (const line of this.lines) {
      const driver = line.behavior === "unit" ? this.model.volume[line.link]
        : line.behavior === "pct" ? (line.link === ALL ? this.model.total : this.model.revenue[line.link])
        : 0;
      this.rates[line.id] = driver ? number(line.base) / driver : 0;
    }
  }

  // ------------------------------------------------------------------ items
  private changeArea(key: string): number {
    if (key === "pricing") return 0;
    if (key.startsWith("f:")) return 1;
    if (key.startsWith("g:")) return key.slice(2) === COGS_GROUP ? 3 : 4;
    return this.lineById.get(key.slice(2))?.group === COGS_GROUP ? 3 : 4;
  }

  /** Counted in the working plan: switched on and not rejected. */
  proposed = (itemId: string): boolean => {
    const item = this.itemById.get(itemId);
    return Boolean(item) && item!.row.included !== false && item!.row.status !== "rejected";
  };

  /** Counted in the reviewed plan: switched on and approved. */
  reviewed = (itemId: string): boolean => {
    const item = this.itemById.get(itemId);
    return Boolean(item) && item!.row.included !== false && item!.row.status === "approved";
  };

  label(itemId: string): string {
    const item = this.itemById.get(itemId);
    if (!item) return "Change";
    if (item.kind !== "change") return (item.row as PlanGrowth | PlanActivity).name || (item.kind === "growth" ? "Growth activity" : "New activity");
    const target = (item.row as PlanChange).target;
    if (target?.kind === "pricing") return "Overall pricing";
    if (target?.kind === "factor") {
      const stream = this.streamById.get(String(target.stream_id));
      if (!stream) return "Metric";
      const factor = (stream.factors ?? []).find(row => row.id === target.factor_id);
      return `${stream.name || "Revenue stream"} · ${factor?.label || "metric"}`;
    }
    if (target?.kind === "line") return this.lineById.get(String(target.line_id))?.label || "Cost";
    return `Whole group: ${this.groupLabels.get(String(target?.group)) ?? target?.group}`;
  }

  // ---------------------------------------------------------------- revenue
  revenue(on: Predicate, baseTotal: number): RevenueModel {
    const volume: Record<string, number> = {};
    const revenue: Record<string, number> = {};
    const factors: Record<string, number[]> = {};
    let total = 0;
    for (const stream of this.streams) {
      const rows = stream.factors ?? [];
      const values = rows.map(factor => {
        const change = this.changeAt.get(`f:${stream.id}:${factor.id}`);
        const current = number(factor.value);
        return change && on(String(change.id)) ? Math.max(0, apply(current, change)) : current;
      });
      for (const activity of this.growth) {
        if (activity.stream_id !== stream.id || !on(String(activity.id))) continue;
        const at = rows.findIndex(factor => factor.id === activity.factor_id);
        if (at >= 0) values[at] += number(activity.added_per_month);
      }
      let units = 1;
      let price = 1;
      rows.forEach((factor, index) => {
        const scaled = factor.unit === "%" ? values[index] / 100 : values[index];
        if (factor.volume) units *= scaled;
        else price *= scaled;
      });
      volume[stream.id] = units * 12;
      revenue[stream.id] = units * price * 12;
      factors[stream.id] = values;
      total += revenue[stream.id];
    }
    const pricing = this.changeAt.get("pricing");
    if (pricing && on(String(pricing.id)) && baseTotal) {
      const lift = pricing.mode === "percent" ? 1 + (sign(pricing) * number(pricing.value)) / 100 : 1 + (sign(pricing) * number(pricing.value)) / baseTotal;
      for (const key of Object.keys(revenue)) revenue[key] *= lift;
      total *= lift;
    }
    return { volume, revenue, total, factors };
  }

  /** A line whose driver is zero today is held fixed. */
  behavior(line: PlanLine): LineBehavior {
    const chosen = line.behavior || "fixed";
    return chosen !== "fixed" && !this.rates[line.id] ? "fixed" : chosen;
  }

  // --------------------------------------------------------------- scenario
  scenario(on: Predicate): PlanScenario {
    const model = this.revenue(on, this.model.total);
    const amounts: Record<string, number> = {};
    for (const line of this.lines) {
      const change = this.changeAt.get(`l:${line.id}`);
      const active = change !== undefined && on(String(change.id));
      const behavior = this.behavior(line);
      const base = number(line.base);
      const rate = this.rates[line.id];
      const link = line.link;
      let value: number;
      if (behavior === "fixed") value = active ? apply(base, change!) : base;
      else if (behavior === "unit") value = (active ? apply(rate, change!) : rate) * (model.volume[link] || 0);
      else {
        // A percent-of-revenue line moves by a percent of itself, or by points of revenue.
        let share = rate;
        if (active) share = change!.mode === "percent" ? apply(rate, change!) : rate + (sign(change!) * number(change!.value)) / 100;
        value = share * (link === ALL ? model.total : model.revenue[link] || 0);
      }
      amounts[line.id] = Math.max(0, value);
    }
    for (const [key, change] of this.changeAt) {
      if (!key.startsWith("g:") || !on(String(change.id))) continue;
      const members = this.lines.filter(line => line.group === key.slice(2));
      const subtotal = members.reduce((sum, line) => sum + amounts[line.id], 0);
      const factor = change.mode === "percent" ? 1 + (sign(change) * number(change.value)) / 100
        : subtotal ? 1 + (sign(change) * number(change.value)) / subtotal : 1;
      for (const line of members) amounts[line.id] = Math.max(0, amounts[line.id] * factor);
    }
    let extra = 0;
    for (const row of this.growth) {
      if (on(String(row.id))) extra += number(row.monthly_spend) * 12 + (row.setup_cadence === "monthly" ? number(row.setup_cost) * 12 : 0);
    }
    for (const row of this.activities) {
      if (on(String(row.id))) extra += number(row.monthly_amount) * 12 + (row.setup_cadence === "monthly" ? number(row.setup_cost) * 12 : 0);
    }
    for (const change of this.changeAt.values()) {
      if (on(String(change.id)) && change.setup_cadence === "monthly") extra += number(change.setup_cost) * 12;
    }
    const revenueDelta = model.total - this.model.total;
    let cogsDelta = 0;
    let opexDelta = 0;
    for (const line of this.lines) {
      if (line.group === COGS_GROUP) cogsDelta += amounts[line.id] - number(line.base);
      else opexDelta += amounts[line.id] - number(line.base);
    }
    opexDelta += extra;
    const base = this.baseline;
    const noi = number(base.noi) + revenueDelta - cogsDelta - opexDelta;
    return {
      revenue: number(base.revenue) + revenueDelta,
      cogs: number(base.cogs) + cogsDelta,
      opex: number(base.operating_expenses) + opexDelta,
      noi,
      ebitda: noi + number(base.ebitda) - number(base.noi),
      activity_spend: extra,
      lines: amounts,
      stream_revenue: model.revenue,
      stream_volume: model.volume,
      factors: model.factors,
    };
  }

  // ------------------------------------------------------------------ timing
  months(included: Predicate): PlanMonth[] {
    const rows: PlanMonth[] = [];
    for (let month = 1; month <= 12; month += 1) {
      const live = this.scenario(itemId => {
        const item = this.itemById.get(itemId);
        return included(itemId) && item !== undefined && startMonth(item.row) <= month;
      });
      let oneTime = 0;
      for (const item of this.items) {
        if (included(item.id) && startMonth(item.row) === month && item.row.setup_cadence !== "monthly") oneTime += number(item.row.setup_cost);
      }
      rows.push({ ebitda: live.ebitda / 12 - oneTime, noi: live.noi / 12 - oneTime });
    }
    return rows;
  }

  /** What the plan gains or loses with this one change, whether or not it is switched on. */
  effect(itemId: string, proposed?: PlanScenario | null): PlanEffect {
    const item = this.itemById.get(itemId)!;
    const withIt = proposed && this.proposed(itemId) ? proposed : this.scenario(other => this.proposed(other) || other === itemId);
    const without = this.scenario(other => this.proposed(other) && other !== itemId);
    const delta = withIt.ebitda - without.ebitda;
    const oneTime = item.row.setup_cadence === "monthly" ? 0 : number(item.row.setup_cost);
    const moves: PlanEffect["moves"] = [];
    if (Math.abs(withIt.revenue - without.revenue) >= 1) moves.push({ label: "Revenue", amount: withIt.revenue - without.revenue });
    for (const line of this.lines) {
      const moved = withIt.lines[line.id] - without.lines[line.id];
      if (Math.abs(moved) >= 1) moves.push({ label: line.label || "Cost", amount: moved });
    }
    if (Math.abs(withIt.activity_spend - without.activity_spend) >= 1) {
      moves.push({ label: "Activity spend", amount: withIt.activity_spend - without.activity_spend });
    }
    return {
      ebitda: delta,
      noi: withIt.noi - without.noi,
      revenue: withIt.revenue - without.revenue,
      first_year: (delta * (13 - startMonth(item.row))) / 12 - oneTime,
      one_time: oneTime,
      moves,
    };
  }

  bridge(included: Predicate): PlanBridgeStep[] {
    let previous = number(this.baseline.ebitda);
    return AREAS.map((label, area) => {
      const figure = this.scenario(itemId => included(itemId) && (this.itemById.get(itemId)?.area ?? 99) <= area).ebitda;
      const step = { key: area, label, value: figure - previous };
      previous = figure;
      return step;
    });
  }
}

/** The six figures for one scenario against one debt service. `scenario` null is today. */
export function metrics(baseline: PlanBaseline, scenario: PlanScenario | null, annualDebt: number | null | undefined): PlanSixMetrics {
  const ebitda = scenario ? scenario.ebitda : number(baseline.ebitda);
  const noi = scenario ? scenario.noi : number(baseline.noi);
  const revenue = scenario ? scenario.revenue : number(baseline.revenue);
  return {
    ebitda,
    noi,
    dscr: annualDebt ? ebitda / annualDebt : null,
    free_cash_flow: annualDebt != null ? ebitda - annualDebt : null,
    operating_margin: revenue ? noi / revenue : null,
    debt_service: annualDebt ?? null,
  };
}

/** What stands between this draft and a saved version, as one list, in the steps' order. */
export function toFinish(plan: Plan, questions: readonly PlanQuestion[] = []): ToFinishItem[] {
  const { body, baseline } = plan;
  const confirmed = body.source?.confirmations ?? {};
  const answers = body.category_answers ?? {};
  const name = baseline.source_name || "source";
  const items: ToFinishItem[] = [];
  if (baseline.available === false) {
    // Nothing to confirm or reconcile against yet: the file needs its earnings source first.
    items.push({ code: "no_source", step: 0, label: "Add the file's earnings source: a filed business return or a profit and loss statement" });
  } else {
    for (const group of baseline.groups ?? []) {
      if (!confirmed[group.key]) items.push({ code: "confirm_source", step: 0, key: group.key, label: `Confirm ${group.label || group.key} source amount` });
    }
    if (Math.abs(plan.model.total - number(baseline.revenue)) > RECONCILE_TOLERANCE) {
      items.push({ code: "reconcile_revenue", step: 1, label: `Reconcile the revenue model to ${name} revenue` });
    }
  }
  for (const question of questions) {
    if (!answers[question.key]) items.push({ code: "answer_category", step: 1, key: question.key, label: `Answer ${question.label}: any current cost?` });
  }
  for (const item of plan.items) {
    if (plan.proposed(item.id) && !String(item.row.note ?? "").trim()) {
      items.push({ code: "explain_change", step: 2, item_id: item.id, label: `Explain ${plan.label(item.id)}` });
    }
  }
  if (!body.attestation) items.push({ code: "attest", step: 3, label: "Confirm these disclosures and proposals" });
  return items;
}

export type EvaluateOptions = { targetDscr?: number; goal?: number | null; questions?: readonly PlanQuestion[] };

/**
 * Everything the plan screens need, from one pass.
 *
 * `baseline` carries revenue, cogs, operating_expenses, noi, ebitda, the annual
 * debt service today (`debt_service_current`) and with the saved loan terms
 * (`debt_service_with_terms`, null when there are none), the monthly cash the
 * terms release (`released_monthly`) and the source's expense groups.
 */
export function evaluate(body: EarningsPlanBody, baseline: PlanBaseline, options: EvaluateOptions = {}): PlanResult {
  const targetDscr = options.targetDscr ?? TARGET_DSCR;
  const plan = new Plan(body, baseline);
  const proposed = plan.scenario(plan.proposed);
  const reviewed = plan.scenario(plan.reviewed);
  const months: Record<PlanView, PlanMonth[]> = { proposed: plan.months(plan.proposed), reviewed: plan.months(plan.reviewed) };
  const total = (rows: PlanMonth[]): PlanMonth => ({
    ebitda: rows.reduce((sum, row) => sum + row.ebitda, 0),
    noi: rows.reduce((sum, row) => sum + row.noi, 0),
  });
  const currentDebt = baseline.debt_service_current ?? null;
  const termsDebt = baseline.debt_service_with_terms ?? null;
  const planDebt = termsDebt != null ? termsDebt : currentDebt;
  const effects: Record<string, PlanEffect> = {};
  for (const item of plan.items) effects[item.id] = plan.effect(item.id, proposed);
  const sections = SECTIONS.map(section => {
    const without = plan.scenario(itemId => plan.proposed(itemId) && !section.areas.includes(plan.itemById.get(itemId)?.area ?? -1));
    return {
      key: section.key, label: section.label, areas: [...section.areas], ebitda: proposed.ebitda - without.ebitda,
      items: plan.items.filter(item => section.areas.includes(item.area)).map(item => item.id),
    };
  });
  const views = (scenario: PlanScenario | null) => ({
    current_debt: metrics(baseline, scenario, currentDebt),
    with_terms: termsDebt != null ? metrics(baseline, scenario, termsDebt) : null,
  });
  const released = termsDebt != null ? number(baseline.released_monthly) : 0;
  const allocated = (body.allocations ?? []).reduce((sum, row) => sum + number(row.monthly_amount), 0);
  const goalAmount = options.goal ? number(options.goal) : null;
  const stillToFind = (scenario: PlanScenario) => (planDebt ? Math.max(0, targetDscr * planDebt - scenario.ebitda) : null);
  const difference = plan.model.total - number(baseline.revenue);
  return {
    model: { volume: plan.model.volume, revenue: plan.model.revenue, total: plan.model.total, difference, reconciles: Math.abs(difference) <= RECONCILE_TOLERANCE },
    rates: plan.rates,
    behaviors: Object.fromEntries(plan.lines.map(line => [line.id, plan.behavior(line)])),
    items: plan.items.map(item => ({
      id: item.id, kind: item.kind, key: item.key, area: item.area, label: plan.label(item.id), start_month: startMonth(item.row),
      included: plan.proposed(item.id), reviewed: plan.reviewed(item.id), status: item.row.status || "proposed", on: item.row.included !== false,
    })),
    proposed,
    reviewed,
    months,
    first_year: { proposed: total(months.proposed), reviewed: total(months.reviewed) },
    effects,
    sections,
    bridge: { proposed: plan.bridge(plan.proposed), reviewed: plan.bridge(plan.reviewed) },
    metrics: { today: views(null), proposed: views(proposed), reviewed: views(reviewed) },
    debt_service: { current: currentDebt, with_terms: termsDebt, plan: planDebt },
    target: { ratio: targetDscr, proposed: stillToFind(proposed), reviewed: stillToFind(reviewed) },
    goal: {
      amount: goalAmount,
      proposed_gap: goalAmount != null ? goalAmount - proposed.noi : null,
      reviewed_gap: goalAmount != null ? goalAmount - reviewed.noi : null,
    },
    released: { available_monthly: released, allocated_monthly: allocated, over_allocated: allocated > released, unallocated_monthly: released - allocated },
    to_finish: toFinish(plan, options.questions ?? []),
  };
}
