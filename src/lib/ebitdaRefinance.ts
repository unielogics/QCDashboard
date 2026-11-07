import { ADD_BACK_KINDS, type FinancialCockpit, type FinancialPlanWrite } from "./financialCockpit";
import type { MetricResult, MetricSourceRef } from "./financialMetrics";

export type EbitdaAdjustment = { id: string | null; kind: string; label: string | null; note: string | null; source: string | null; amount_monthly: number | null; amount_annual: number | null; status: "hypothetical_unverified" | "not_applied"; reason?: string };
export type RefinanceEbitda = {
  before: number | null; after: number | null; change: number | null; value_basis: "period_ebitda";
  annual_before: number | null; annual_after: number | null; annual_change: number | null;
  status: "projected_unchanged" | "tax_estimate_only" | "unavailable";
  label: string; after_label: string; source_kind: string | null; period: string | null; months_covered: number | null; annualization_factor: number | null;
  currency: string | null; basis: string | null; provisional: boolean; source_refs: MetricSourceRef[];
  baseline: MetricResult | null; tax_estimate: MetricResult | null;
  adjusted_annual: { before: number | null; after: number | null; change: number | null; status: "hypothetical_adjusted" | "unchanged" | "unavailable"; verified: false; label: string; currency: string | null; adjustments: EbitdaAdjustment[]; excluded_adjustments: EbitdaAdjustment[] };
  debt_service_savings_monthly: number | null; cash_flow_change_monthly: number | null;
  replacement_payment_missing?: boolean; debt_service_savings_status?: "before_replacement_payment" | "hypothetical_override" | "projected"; debt_service_override_applied?: boolean;
  debt_service_savings_currency?: string; cash_flow_currency?: string | null; cash_flow_currency_status?: string; notes: string[];
};

/** Match Python's monetary rounding, including exact binary ties, for preview/save parity. */
export function roundEbitdaMoney(value: number): number {
  if (!Number.isFinite(value) || !value) return value;
  const buffer = new DataView(new ArrayBuffer(8)); buffer.setFloat64(0, Math.abs(value));
  const bits = buffer.getBigUint64(0), rawExponent = Number((bits >> 52n) & 2047n);
  const mantissa = (bits & ((1n << 52n) - 1n)) + (rawExponent ? 1n << 52n : 0n);
  const exponent = (rawExponent || 1) - 1023 - 52;
  const numerator = mantissa * 100n * (exponent > 0 ? 1n << BigInt(exponent) : 1n);
  const denominator = exponent < 0 ? 1n << BigInt(-exponent) : 1n;
  const quotient = numerator / denominator, remainder = numerator % denominator;
  const rounded = quotient + (remainder * 2n > denominator || remainder * 2n === denominator && quotient % 2n === 1n ? 1n : 0n);
  return Math.sign(value) * Number(rounded) / 100;
}

/** Eligibility is a server decision; only the scenario's operating assumptions are replayed here. */
export function evaluateRefinanceEbitda(cockpit: FinancialCockpit, plan: FinancialPlanWrite, context: { serviceAfter: number | null; netBefore: number | null; netAfter: number | null; retiredCount: number; newPayment: number | null }): RefinanceEbitda | undefined {
  const baseline = cockpit.plan.evaluation.ebitda ?? cockpit.plan.impact?.ebitda;
  if (!baseline) return undefined;
  const eligible = baseline.adjusted_annual.before;
  const included: EbitdaAdjustment[] = [], excluded: EbitdaAdjustment[] = [], usedIds = new Set<string>();
  const normalized = (plan.add_backs ?? []).map((row, index) => ({ ...row, id: String(row.id || `${row.kind}:${index}`).slice(0, 60), label: String(row.label || ADD_BACK_KINDS[row.kind]).slice(0, 120), source: String(row.source || "desk").slice(0, 40), note: String(row.note || "").slice(0, 300) || null })).filter((row) => Number.isFinite(row.amount_monthly) && row.amount_monthly > 0).slice(0, 20);
  for (const row of normalized) {
    const monthly = roundEbitdaMoney(row.amount_monthly);
    const adjustment = { id: row.id, kind: row.kind, label: row.label, note: row.note, source: row.source, amount_monthly: monthly, amount_annual: roundEbitdaMoney(monthly * 12) };
    let reason: string | undefined;
    if (["interest_refinanced", "depreciation"].includes(row.kind)) reason = "Interest and depreciation/amortization are already excluded from EBITDA; adding them again would double count.";
    else if (!["owner_salary", "one_time_expense", "rent_to_owner"].includes(row.kind)) reason = "A generic DSCR addback is not an identified operating adjustment to EBITDA.";
    else if (monthly <= 0) reason = "A positive, finite operating adjustment amount is required.";
    else if (!row.note?.trim() || !row.source.trim()) reason = "Describe the operating assumption and its source before including it in hypothetical Adjusted EBITDA.";
    else if (usedIds.has(row.id)) reason = "This adjustment identity is already included; it is not counted twice.";
    else if (eligible == null) reason = "No comparable, source-supported annual P&L EBITDA baseline is available.";
    if (reason) excluded.push({ ...adjustment, reason, status: "not_applied" });
    else { usedIds.add(row.id); included.push({ ...adjustment, status: "hypothetical_unverified" }); }
  }
  const adjustment = roundEbitdaMoney(included.reduce((total, row) => total + (row.amount_annual ?? 0), 0));
  const replacementMissing = context.retiredCount > 0 && context.newPayment == null;
  const notes = baseline.notes.filter((note) => !/^(Operating addbacks are staff hypotheses|The generic DSCR income override|Excluding transfers or other bank payees|Projected savings include a hypothetical DSCR|Debt-service savings are shown before adding)/.test(note));
  if (included.length) notes.push("Operating addbacks are staff hypotheses, not verified facts or lender-accepted adjustments. They change hypothetical Adjusted EBITDA only.");
  if (plan.overrides?.income_annual != null) notes.push("The generic DSCR income override does not replace source EBITDA or create an EBITDA adjustment.");
  if (plan.exclude.length) notes.push("Excluding transfers or other bank payees changes the bank cash-flow proxy only, not EBITDA.");
  if (plan.overrides?.debt_service_monthly != null) notes.push("Projected savings include a hypothetical DSCR debt-service override; the published current debt service is unchanged.");
  if (replacementMissing) notes.push("Debt-service savings are shown before adding a replacement payment; replacement loan terms have not been provided.");
  return { ...baseline,
    adjusted_annual: { ...baseline.adjusted_annual, after: eligible == null ? null : roundEbitdaMoney(eligible + adjustment), change: eligible == null ? null : adjustment, status: eligible == null ? "unavailable" : included.length ? "hypothetical_adjusted" : "unchanged", adjustments: included, excluded_adjustments: excluded },
    debt_service_savings_monthly: cockpit.debt.service.monthly == null || context.serviceAfter == null ? null : roundEbitdaMoney(cockpit.debt.service.monthly - context.serviceAfter),
    cash_flow_change_monthly: context.netBefore == null || context.netAfter == null ? null : roundEbitdaMoney(context.netAfter - context.netBefore),
    replacement_payment_missing: replacementMissing, debt_service_override_applied: plan.overrides?.debt_service_monthly != null,
    debt_service_savings_status: replacementMissing ? "before_replacement_payment" : plan.overrides?.debt_service_monthly != null ? "hypothetical_override" : "projected", notes,
  };
}
