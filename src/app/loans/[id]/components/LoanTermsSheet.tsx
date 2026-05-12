"use client";

// In-page terms-sheet preview. Mirrors the PDF rendered by the backend
// term_sheet_pdf service — every section the operator will see in the
// PDF also appears here, driven by the current draft (no save required).
// The PDF is rendered from saved state, so when there are unsaved edits
// the TermsTab shows a hint to save before downloading.

import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { QC_FMT } from "@/components/design-system/tokens";
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
  const { t } = useTheme();
  const r = snapshot;
  const monthlyTax = r.annual_taxes / 12;
  const monthlyIns = r.annual_insurance / 12;
  const pitia = (r.monthly_pi ?? 0) + monthlyTax + monthlyIns + r.monthly_hoa;
  const isIO = r.amortization_style === "interest_only";

  return (
    <Card pad={16}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <SectionLabel>Loan terms sheet (live preview)</SectionLabel>
        {unsaved ? (
          <Pill bg={t.warnBg} color={t.warn} style={{ fontWeight: 850 }}>
            Unsaved edits — save to refresh PDF
          </Pill>
        ) : (
          <Pill bg={t.profitBg} color={t.profit} style={{ fontWeight: 850 }}>
            In sync with saved loan
          </Pill>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10, marginBottom: 16 }}>
        <Hero t={t} label="Loan amount" value={QC_FMT.usd(r.loan_amount, 0)} />
        <Hero t={t} label={isIO ? "Monthly interest" : "Monthly P&I"} value={r.monthly_pi != null ? QC_FMT.usd(r.monthly_pi, 0) : "—"} />
        <Hero t={t} label="Final rate" value={r.final_rate != null ? `${(r.final_rate * 100).toFixed(3)}%` : "—"} />
        <Hero t={t} label="Term" value={r.term_months != null ? `${r.term_months} mo` : "—"} />
      </div>

      <Section t={t} title="Loan structure">
        <Row t={t} k="Product" v={labelFor(LoanTypeOptions, r.loan_type)} />
        <Row t={t} k="Purpose" v={labelFor(LoanPurposeOptions, r.purpose)} />
        <Row t={t} k="Property type" v={labelFor(PropertyTypeOptions, r.property_type)} />
        <Row t={t} k="Amortization" v={labelFor(AmortizationStyleOptions, r.amortization_style)} />
        <Row t={t} k="Prepay penalty" v={labelFor(PrepayPenaltyOptions, r.prepay_penalty)} />
      </Section>

      <Section t={t} title="Pricing">
        <Row t={t} k="Base rate" v={r.base_rate != null ? `${(r.base_rate * 100).toFixed(3)}%` : "—"} />
        <Row t={t} k="Discount points" v={r.discount_points.toFixed(2)} />
        <Row t={t} k="Origination" v={r.origination_pct != null ? `${(r.origination_pct * 100).toFixed(2)}%` : "—"} />
        <Row t={t} k="Lender fees" v={r.lender_fees ? QC_FMT.usd(r.lender_fees, 0) : "—"} />
      </Section>

      <Section t={t} title="Sizing & ratios">
        <Row t={t} k="ARV / appraised value" v={r.arv ? QC_FMT.usd(r.arv, 0) : "—"} />
        <Row t={t} k="BRV / purchase price" v={r.brv ? QC_FMT.usd(r.brv, 0) : "—"} />
        <Row t={t} k="Rehab budget" v={r.rehab_budget ? QC_FMT.usd(r.rehab_budget, 0) : "—"} />
        <Row t={t} k="LTV" v={r.ltv != null ? `${(r.ltv * 100).toFixed(1)}%` : "—"} />
        <Row t={t} k="LTC" v={r.ltc != null ? `${(r.ltc * 100).toFixed(1)}%` : "—"} />
        <Row t={t} k="ARV LTV" v={r.arv_ltv != null ? `${(r.arv_ltv * 100).toFixed(1)}%` : "—"} />
      </Section>

      <Section t={t} title="Monthly carry (PITIA)">
        <Row t={t} k={isIO ? "Interest payment" : "Principal & interest"} v={r.monthly_pi != null ? QC_FMT.usd(r.monthly_pi, 2) : "—"} />
        <Row t={t} k="Property taxes (monthly)" v={QC_FMT.usd(monthlyTax, 2)} />
        <Row t={t} k="Insurance (monthly)" v={QC_FMT.usd(monthlyIns, 2)} />
        <Row t={t} k="HOA (monthly)" v={QC_FMT.usd(r.monthly_hoa, 2)} />
        <Row t={t} k="Total PITIA" v={QC_FMT.usd(pitia, 2)} accent={t.brand} />
      </Section>

      {(r.monthly_rent || r.dscr != null) ? (
        <Section t={t} title="Rental income & DSCR">
          <Row t={t} k="Gross monthly rent" v={r.monthly_rent ? QC_FMT.usd(r.monthly_rent, 0) : "—"} />
          <Row t={t} k="Vacancy" v={r.vacancy_pct != null ? `${(r.vacancy_pct * 100).toFixed(1)}%` : "—"} />
          <Row t={t} k="Operating expense ratio" v={r.expense_ratio_pct != null ? `${(r.expense_ratio_pct * 100).toFixed(1)}%` : "—"} />
          <Row t={t} k="Effective rent" v={r.effective_rent ? QC_FMT.usd(r.effective_rent, 0) : "—"} />
          <Row t={t} k="Effective PITIA" v={r.effective_pitia ? QC_FMT.usd(r.effective_pitia, 0) : "—"} />
          <Row
            t={t}
            k="DSCR"
            v={r.dscr != null ? r.dscr.toFixed(2) : "—"}
            accent={(r.dscr ?? 0) >= 1.25 ? t.profit : (r.dscr ?? 0) >= 1.0 ? t.warn : t.danger}
          />
        </Section>
      ) : null}

      <Section t={t} title="Borrower">
        <Row t={t} k="Entity" v={labelFor(EntityTypeOptions, r.entity_type)} />
        <Row t={t} k="Experience" v={labelFor(ExperienceTierOptions, r.experience_tier)} />
        <Row t={t} k="FICO (UW override)" v={r.fico_override ? String(r.fico_override) : "—"} />
      </Section>

      {(r.construction_holdback_pct || r.draw_count || r.exit_strategy || r.cash_to_borrower || r.seasoning_months || r.property_count) ? (
        <Section t={t} title="Type-specific terms">
          {r.construction_holdback_pct != null ? (
            <Row t={t} k="Construction holdback" v={`${(r.construction_holdback_pct * 100).toFixed(2)}%`} />
          ) : null}
          {r.draw_count != null ? <Row t={t} k="Construction draws" v={String(r.draw_count)} /> : null}
          {r.exit_strategy ? <Row t={t} k="Exit strategy" v={labelFor(ExitStrategyOptions, r.exit_strategy)} /> : null}
          {r.cash_to_borrower != null ? (
            <Row t={t} k="Cash to borrower" v={QC_FMT.usd(r.cash_to_borrower, 0)} />
          ) : null}
          {r.seasoning_months != null ? <Row t={t} k="Seasoning" v={`${r.seasoning_months} mo`} /> : null}
          {r.property_count != null ? <Row t={t} k="Property count" v={String(r.property_count)} /> : null}
        </Section>
      ) : null}

      <Section t={t} title="Cash to close">
        <Row t={t} k="Reserves required" v={r.reserves_required ? QC_FMT.usd(r.reserves_required, 0) : "—"} />
        <Row t={t} k="HUD total" v={r.hud_total != null ? QC_FMT.usd(r.hud_total, 0) : "—"} />
        <Row t={t} k="Total cash to close" v={r.total_cash_to_close != null ? QC_FMT.usd(r.total_cash_to_close, 0) : "—"} accent={t.brand} />
      </Section>
    </Card>
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
  t,
  label,
  value,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  value: string;
}) {
  return (
    <div style={{ padding: 12, borderRadius: 12, background: t.brandSoft, border: `1px solid ${t.lineStrong}` }}>
      <div style={{ fontSize: 10, fontWeight: 900, color: t.ink3, letterSpacing: 1.1, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ marginTop: 4, fontSize: 22, fontWeight: 950, color: t.brand, fontFeatureSettings: '"tnum"' }}>
        {value}
      </div>
    </div>
  );
}

function Section({
  t,
  title,
  children,
}: {
  t: ReturnType<typeof useTheme>["t"];
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 900, color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ border: `1px solid ${t.line}`, borderRadius: 10, overflow: "hidden" }}>{children}</div>
    </div>
  );
}

function Row({
  t,
  k,
  v,
  accent,
}: {
  t: ReturnType<typeof useTheme>["t"];
  k: string;
  v: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        padding: "8px 12px",
        borderTop: `1px solid ${t.line}`,
        fontSize: 12.5,
        gap: 12,
      }}
    >
      <span style={{ color: t.ink3, fontWeight: 700 }}>{k}</span>
      <span style={{ color: accent ?? t.ink, fontWeight: 850, fontFeatureSettings: '"tnum"' }}>{v}</span>
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
