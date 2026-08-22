"use client";

// Restyled onto the plain-CSS design system. The only inline values left are
// the two accents chosen from the numbers themselves — the DSCR band and the
// two totals the operator is meant to land on.
//
// In-page terms-sheet preview. Mirrors the PDF rendered by the backend
// term_sheet_pdf service — every section the operator will see in the
// PDF also appears here, driven by the current draft (no save required).
// The PDF is rendered from saved state, so when there are unsaved edits
// the TermsTab shows a hint to save before downloading.

import { CellChip, KpiRow, Panel } from "@/components/ds";
import { QC_FMT } from "@/lib/fmt";
import type { AmortizationStyle, EntityType, ExitStrategy, ExperienceTier, LoanPurpose, LoanType, PrepayPenalty, PropertyType } from "@/lib/enums.generated";
import { AmortizationStyleOptions, ExitStrategyOptions, EntityTypeOptions, ExperienceTierOptions, LoanPurposeOptions, LoanTypeOptions, PrepayPenaltyOptions, PropertyTypeOptions } from "@/lib/enums.generated";
import type { RecalcResponse } from "@/lib/types";

export interface TermsSheetSnapshot {
  // Loan structure
  loan_type: LoanType;
  purpose: LoanPurpose | null;
  property_type: PropertyType | null;
  term_months: number | null;
  amortization_style: AmortizationStyle | null;
  prepay_penalty: PrepayPenalty | null;
  // Pricing
  loan_amount: number;
  base_rate: number | null;
  final_rate: number | null;
  discount_points: number;
  origination_pct: number | null;
  lender_fees: number | null;
  monthly_pi: number | null;
  monthly_interest: number | null;
  // Collateral & sizing
  arv: number | null;
  brv: number | null;
  rehab_budget: number | null;
  payoff: number | null;
  ltv: number | null;
  ltc: number | null;
  arv_ltv: number | null;
  // Carrying
  annual_taxes: number;
  annual_insurance: number;
  monthly_hoa: number;
  reserves_required: number | null;
  // Income / DSCR
  monthly_rent: number | null;
  vacancy_pct: number | null;
  expense_ratio_pct: number | null;
  dscr: number | null;
  effective_rent: number | null;
  effective_pitia: number | null;
  // Borrower
  fico_override: number | null;
  entity_type: EntityType | null;
  experience_tier: ExperienceTier | null;
  // Type-specific
  construction_holdback_pct: number | null;
  draw_count: number | null;
  exit_strategy: ExitStrategy | null;
  cash_to_borrower: number | null;
  seasoning_months: number | null;
  property_count: number | null;
  // Cash to close
  total_cash_to_close: number | null;
  hud_total: number | null;
}

export function LoanTermsSheet({
  snapshot,
  unsaved,
}: {
  snapshot: TermsSheetSnapshot;
  unsaved: boolean;
}) {
  const r = snapshot;
  const monthlyTax = r.annual_taxes / 12;
  const monthlyIns = r.annual_insurance / 12;
  const pitia = (r.monthly_pi ?? 0) + monthlyTax + monthlyIns + r.monthly_hoa;
  const isIO = r.amortization_style === "interest_only";

  return (
    <Panel
      title="Loan terms sheet (live preview)"
      actions={
        unsaved ? (
          <CellChip tone="warn">Unsaved edits — save to refresh PDF</CellChip>
        ) : (
          <CellChip tone="ok">In sync with saved loan</CellChip>
        )
      }
      bodyClass="grid"
    >
      <KpiRow>
        <Hero label="Loan amount" value={QC_FMT.usd(r.loan_amount, 0)} />
        <Hero label={isIO ? "Monthly interest" : "Monthly P&I"} value={r.monthly_pi != null ? QC_FMT.usd(r.monthly_pi, 0) : "—"} />
        <Hero label="Final rate" value={r.final_rate != null ? `${(r.final_rate * 100).toFixed(3)}%` : "—"} />
        <Hero label="Term" value={r.term_months != null ? `${r.term_months} mo` : "—"} />
      </KpiRow>

      <Section title="Loan structure">
        <Row k="Product" v={labelFor(LoanTypeOptions, r.loan_type)} />
        <Row k="Purpose" v={labelFor(LoanPurposeOptions, r.purpose)} />
        <Row k="Property type" v={labelFor(PropertyTypeOptions, r.property_type)} />
        <Row k="Amortization" v={labelFor(AmortizationStyleOptions, r.amortization_style)} />
        <Row k="Prepay penalty" v={labelFor(PrepayPenaltyOptions, r.prepay_penalty)} />
      </Section>

      <Section title="Pricing">
        <Row k="Base rate" v={r.base_rate != null ? `${(r.base_rate * 100).toFixed(3)}%` : "—"} />
        <Row k="Discount points" v={r.discount_points.toFixed(2)} />
        <Row k="Origination" v={r.origination_pct != null ? `${(r.origination_pct * 100).toFixed(2)}%` : "—"} />
        <Row k="Lender fees" v={r.lender_fees ? QC_FMT.usd(r.lender_fees, 0) : "—"} />
      </Section>

      <Section title="Sizing & ratios">
        <Row k="ARV / appraised value" v={r.arv ? QC_FMT.usd(r.arv, 0) : "—"} />
        <Row k="BRV / purchase price" v={r.brv ? QC_FMT.usd(r.brv, 0) : "—"} />
        <Row k="Rehab budget" v={r.rehab_budget ? QC_FMT.usd(r.rehab_budget, 0) : "—"} />
        <Row k="LTV" v={r.ltv != null ? `${(r.ltv * 100).toFixed(1)}%` : "—"} />
        <Row k="LTC" v={r.ltc != null ? `${(r.ltc * 100).toFixed(1)}%` : "—"} />
        <Row k="ARV LTV" v={r.arv_ltv != null ? `${(r.arv_ltv * 100).toFixed(1)}%` : "—"} />
      </Section>

      <Section title="Monthly carry (PITIA)">
        <Row k={isIO ? "Interest payment" : "Principal & interest"} v={r.monthly_pi != null ? QC_FMT.usd(r.monthly_pi, 2) : "—"} />
        <Row k="Property taxes (monthly)" v={QC_FMT.usd(monthlyTax, 2)} />
        <Row k="Insurance (monthly)" v={QC_FMT.usd(monthlyIns, 2)} />
        <Row k="HOA (monthly)" v={QC_FMT.usd(r.monthly_hoa, 2)} />
        <Row k="Total PITIA" v={QC_FMT.usd(pitia, 2)} accent="var(--accent)" />
      </Section>

      {(r.monthly_rent || r.dscr != null) ? (
        <Section title="Rental income & DSCR">
          <Row k="Gross monthly rent" v={r.monthly_rent ? QC_FMT.usd(r.monthly_rent, 0) : "—"} />
          <Row k="Vacancy" v={r.vacancy_pct != null ? `${(r.vacancy_pct * 100).toFixed(1)}%` : "—"} />
          <Row k="Operating expense ratio" v={r.expense_ratio_pct != null ? `${(r.expense_ratio_pct * 100).toFixed(1)}%` : "—"} />
          <Row k="Effective rent" v={r.effective_rent ? QC_FMT.usd(r.effective_rent, 0) : "—"} />
          <Row k="Effective PITIA" v={r.effective_pitia ? QC_FMT.usd(r.effective_pitia, 0) : "—"} />
          <Row
            k="DSCR"
            v={r.dscr != null ? r.dscr.toFixed(2) : "—"}
            accent={(r.dscr ?? 0) >= 1.25 ? "var(--ok)" : (r.dscr ?? 0) >= 1.0 ? "var(--warn)" : "var(--danger)"}
          />
        </Section>
      ) : null}

      <Section title="Borrower">
        <Row k="Entity" v={labelFor(EntityTypeOptions, r.entity_type)} />
        <Row k="Experience" v={labelFor(ExperienceTierOptions, r.experience_tier)} />
        <Row k="FICO (UW override)" v={r.fico_override ? String(r.fico_override) : "—"} />
      </Section>

      {(r.construction_holdback_pct || r.draw_count || r.exit_strategy || r.cash_to_borrower || r.seasoning_months || r.property_count) ? (
        <Section title="Type-specific terms">
          {r.construction_holdback_pct != null ? (
            <Row k="Construction holdback" v={`${(r.construction_holdback_pct * 100).toFixed(2)}%`} />
          ) : null}
          {r.draw_count != null ? <Row k="Construction draws" v={String(r.draw_count)} /> : null}
          {r.exit_strategy ? <Row k="Exit strategy" v={labelFor(ExitStrategyOptions, r.exit_strategy)} /> : null}
          {r.cash_to_borrower != null ? (
            <Row k="Cash to borrower" v={QC_FMT.usd(r.cash_to_borrower, 0)} />
          ) : null}
          {r.seasoning_months != null ? <Row k="Seasoning" v={`${r.seasoning_months} mo`} /> : null}
          {r.property_count != null ? <Row k="Property count" v={String(r.property_count)} /> : null}
        </Section>
      ) : null}

      <Section title="Cash to close">
        <Row k="Reserves required" v={r.reserves_required ? QC_FMT.usd(r.reserves_required, 0) : "—"} />
        <Row k="HUD total" v={r.hud_total != null ? QC_FMT.usd(r.hud_total, 0) : "—"} />
        <Row k="Total cash to close" v={r.total_cash_to_close != null ? QC_FMT.usd(r.total_cash_to_close, 0) : "—"} accent="var(--accent)" />
      </Section>
    </Panel>
  );
}

// Builds the snapshot consumed by LoanTermsSheet from the live draft +
// the most recent recalc response. Exported so TermsTab can keep its
// rendering thin.
export function buildTermsSnapshot({
  loan,
  draft,
  recalc,
}: {
  loan: { type: LoanType; property_type: PropertyType };
  draft: Partial<TermsSheetSnapshot>;
  recalc: RecalcResponse | undefined;
}): TermsSheetSnapshot {
  return {
    loan_type: loan.type,
    property_type: loan.property_type,
    purpose: (draft.purpose ?? null) as LoanPurpose | null,
    term_months: draft.term_months ?? null,
    amortization_style: (draft.amortization_style ?? null) as AmortizationStyle | null,
    prepay_penalty: (draft.prepay_penalty ?? null) as PrepayPenalty | null,
    loan_amount: recalc?.loan_amount ?? draft.loan_amount ?? 0,
    base_rate: draft.base_rate ?? null,
    final_rate: recalc?.final_rate ?? draft.final_rate ?? null,
    discount_points: draft.discount_points ?? 0,
    origination_pct: draft.origination_pct ?? null,
    lender_fees: draft.lender_fees ?? null,
    monthly_pi: recalc?.monthly_pi ?? null,
    monthly_interest: recalc?.monthly_interest ?? null,
    arv: draft.arv ?? null,
    brv: draft.brv ?? null,
    rehab_budget: draft.rehab_budget ?? null,
    payoff: draft.payoff ?? null,
    ltv: recalc?.sizing?.ltv ?? draft.ltv ?? null,
    ltc: recalc?.sizing?.ltc ?? draft.ltc ?? null,
    arv_ltv: recalc?.sizing?.arv_ltv ?? null,
    annual_taxes: draft.annual_taxes ?? 0,
    annual_insurance: draft.annual_insurance ?? 0,
    monthly_hoa: draft.monthly_hoa ?? 0,
    reserves_required: draft.reserves_required ?? null,
    monthly_rent: draft.monthly_rent ?? null,
    vacancy_pct: draft.vacancy_pct ?? null,
    expense_ratio_pct: draft.expense_ratio_pct ?? null,
    dscr: recalc?.dscr ?? null,
    effective_rent: recalc?.effective_rent ?? null,
    effective_pitia: recalc?.effective_pitia ?? null,
    fico_override: draft.fico_override ?? null,
    entity_type: (draft.entity_type ?? null) as EntityType | null,
    experience_tier: (draft.experience_tier ?? null) as ExperienceTier | null,
    construction_holdback_pct: draft.construction_holdback_pct ?? null,
    draw_count: draft.draw_count ?? null,
    exit_strategy: (draft.exit_strategy ?? null) as ExitStrategy | null,
    cash_to_borrower: draft.cash_to_borrower ?? null,
    seasoning_months: draft.seasoning_months ?? null,
    property_count: draft.property_count ?? null,
    total_cash_to_close: recalc?.total_cash_to_close ?? null,
    hud_total: recalc?.hud_total ?? null,
  };
}

function Hero({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  // `.kpi` markup rather than the `Kpi` component: the figure is the accent
  // colour here, and `Kpi` only tones its delta chip. `.kpi .knum` owns
  // everything but colour.
  return (
    <div className="kpi">
      <div className="lbl">{label}</div>
      <div className="knum num" style={{ color: "var(--accent)" }}>{value}</div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="lbl mb">{title}</div>
      <div className="card">{children}</div>
    </div>
  );
}

function Row({
  k,
  v,
  accent,
}: {
  k: string;
  v: string;
  accent?: string;
}) {
  // `.kv` is the sheet's label-left / value-right row, hairline included.
  return (
    <div className="kv">
      <span>{k}</span>
      {/* Data-derived: an accent marks a figure the operator is meant to land
          on (the two totals) or a DSCR that has crossed a band. */}
      <b className="num" style={accent ? { color: accent } : undefined}>{v}</b>
    </div>
  );
}

function labelFor<T extends { value: string; label: string }>(
  options: readonly T[],
  value: string | null | undefined,
): string {
  if (!value) return "—";
  const match = options.find((o) => o.value === value);
  return match ? match.label : value;
}
