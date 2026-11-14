/**
 * The Earnings Plan design's sample plan as a plan body, for the TypeScript
 * engine. The backend builds the same body in app/tests/earnings_plan_fixture.py
 * and asks the same numbers of the Python engine.
 *
 * Amounts stay as the design holds them (text, as typed), so the engine is
 * exercised on the working copy's shape, not only on saved numbers.
 */
import reference from "./earningsPlanReference.json";
import type {
  EarningsPlanBody, PlanBaseline, PlanChange, PlanGoal, PlanItemFields, PlanQuestion, PlanTarget, PlanWorkspace, StreamType,
} from "@/lib/earningsPlan/types";

export const REFERENCE = reference;
export const QUESTIONS: PlanQuestion[] = [{ key: "ptx", label: "Payroll taxes" }, { key: "trn", label: "Transportation" }];

type DesignRow = { start: string; setup?: string; setupCad?: string; note?: string; evid?: string; owner?: string; on?: boolean; status?: string };

function common(id: string, row: DesignRow): PlanItemFields {
  return {
    id,
    start_month: Number(row.start),
    setup_cost: row.setup ?? "",
    setup_cadence: row.setupCad === "mo" ? "monthly" : "one_time",
    note: row.note ?? "",
    evidence_note: row.evid ?? "",
    owner: row.owner ?? "",
    included: row.on !== false,
    source_file_ids: [],
    status: (row.status ?? "proposed") as PlanItemFields["status"],
  };
}

function target(key: string): PlanTarget {
  if (key === "pricing") return { kind: "pricing" };
  const [kind, first, second] = key.split(":");
  if (kind === "f") return { kind: "factor", stream_id: first, factor_id: `f${second}` };
  if (kind === "l") return { kind: "line", line_id: first };
  return { kind: "group", group: first };
}

export function referenceBaseline(): PlanBaseline {
  const source = REFERENCE.baseline;
  return {
    available: true,
    revenue: source.revenue, cogs: source.cogs, operating_expenses: source.operating_expenses, noi: source.noi, ebitda: source.ebitda,
    debt_service_current: source.debt_service_current, debt_service_with_terms: source.debt_service_with_terms,
    debt_service_current_monthly: source.debt_service_current / 12, debt_service_with_terms_monthly: source.debt_service_with_terms / 12,
    released_monthly: 50_000, source_name: "IRS",
    terms_label: "Client terms v3",
    statement: { label: "P&L · Jan–Sep 2026", months_covered: 9, annualized: true },
    source: { kind: "tax_return", label: "IRS 1120-S · 2025", form: "1120S", year: 2025, period_start: "2025-01-01", period_end: "2025-12-31", currency: "USD", basis: "accrual", accepted: true, selected_by: "rule" },
    groups: source.groups.map(row => ({ key: row.key, label: row.label, amount: row.return_amount, statement_amount: row.statement_amount })),
  };
}

/** The design's plan. Item ids are the design's own keys ("f:s1:1", "gr:g1", "na:a1"). */
export function referenceBody(): EarningsPlanBody {
  const plan = REFERENCE.plan;
  return {
    schema_version: "operating-plan-v2",
    business_name: "Harbor Auto Detail LLC",
    period_start: "2025-01-01",
    period_end: "2025-12-31",
    currency: "USD",
    plan_start: plan.plan_start,
    source: { stamp: null, confirmations: Object.fromEntries(Object.entries(plan.confirmations).filter(([, value]) => value).map(([key]) => [key, "confirmed" as const])), corrections: {} },
    streams: plan.streams.map(stream => ({
      id: stream.id, name: stream.name, type: stream.type as StreamType, added: false,
      factors: stream.f.map((factor, index) => ({ id: `f${index}`, label: factor.l, value: factor.v, unit: factor.u, volume: Boolean((factor as { vol?: number }).vol), custom: false })),
    })),
    lines: plan.lines.map(line => ({ id: line.id, group: line.g, label: line.l, base: line.base, behavior: line.beh as "fixed" | "unit" | "pct", link: line.link, added: false })),
    category_answers: {},
    changes: Object.entries(plan.changes).map(([key, change]): PlanChange => ({
      ...common(key, change), target: target(key), direction: change.dir as "up" | "down", mode: change.mode === "pct" ? "percent" : "amount", value: change.val,
    })),
    growth: plan.growth.map(row => ({
      ...common(`gr:${row.id}`, row), name: row.name, monthly_spend: row.spend, stream_id: row.stream, factor_id: `f${row.factor}`, added_per_month: row.add,
    })),
    activities: plan.activities.map(row => ({ ...common(`na:${row.id}`, row), name: row.name, monthly_amount: row.amt })),
    allocations: plan.allocations.map(row => ({ id: `alloc:${row.id}`, label: row.label, purpose: row.purpose as "existing" | "planned" | "reserve" | "other", monthly_amount: row.amt, notes: "" })),
    carried_over: [],
    attestation: false,
    notes: "",
  };
}

export const REFERENCE_GOAL: PlanGoal = { status: "set", metric: "annual_noi", amount: REFERENCE.plan.noi_goal, currency: "USD", revision: 1, updated_at: "2026-11-10T15:00:00+00:00" };

export const STREAM_TEMPLATES: PlanWorkspace["stream_templates"] = {
  units: { label: "Units sold", unit_word: "unit", factors: [["Units sold", "units / mo", true], ["Price per unit", "$", false]] },
  hourly: { label: "Hourly fees", unit_word: "billable hour", factors: [["Billable staff", "people", true], ["Hours each", "hrs / mo", true], ["Utilization", "%", true], ["Hourly rate", "$", false]] },
  services: { label: "Professional services", unit_word: "engagement", factors: [["Engagements", "per mo", true], ["Average fee", "$", false]] },
  recurring: { label: "Recurring contracts", unit_word: "contract-month", factors: [["Active clients", "clients", true], ["Retention", "%", true], ["Monthly fee", "$", false]] },
  rental: { label: "Rental or occupancy", unit_word: "occupied unit-month", factors: [["Rentable units", "units", true], ["Occupancy", "%", true], ["Monthly rent", "$", false]] },
  commission: { label: "Commission or % of volume", unit_word: "dollar processed", factors: [["Processed volume", "dollars / mo", true], ["Take rate", "%", false]] },
  custom: { label: "Custom metrics", unit_word: "unit", factors: [["Metric", "count", true], ["Value per metric", "$", false]] },
};

/** What the plan screens load for the design's file. */
export function referenceWorkspace(overrides: Partial<PlanWorkspace> = {}): PlanWorkspace {
  return {
    kind: "operating_plan",
    model: "operating-plan-v2",
    origin: "saved",
    family_id: "11111111-1111-4111-8111-111111111111",
    body: referenceBody(),
    evaluation: {
      context_stamp: "c".repeat(64),
      plan: { baseline: referenceBaseline(), questions: QUESTIONS, source_stamp: null, source_changed: false, stale_reviews: [], warnings: [] },
    },
    goal: REFERENCE_GOAL,
    context_stamp: "c".repeat(64),
    stream_templates: STREAM_TEMPLATES,
    draft: { revision: 7, base_version_id: "22222222-2222-4222-8222-222222222222", updated_at: "2026-11-11T16:42:00+00:00", stored_model: "operating-plan-v2", dirty: true },
    current_version_id: "22222222-2222-4222-8222-222222222222",
    versions: [{ id: "22222222-2222-4222-8222-222222222222", version_number: 1, created_at: "2026-11-11T21:05:00+00:00", actor_name: "Dana Whitfield", source: "form", status: "published", pdf_file_id: "33333333-3333-4333-8333-333333333333" }],
    ...overrides,
  };
}
