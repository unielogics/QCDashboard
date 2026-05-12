"use client";

// Criteria tab — underwriter calculator.
//
// Manual inputs only (no sliders). Sections are organized like an
// underwriter's worksheet: loan structure, pricing, collateral, income
// (DSCR), carrying costs, borrower, and any loan-type-specific extras.
// Edits run a live debounced /recalc; "Save Criteria" persists to the
// loan record. The PDF term sheet is rendered from saved state, so an
// "Unsaved edits — save to refresh PDF" pill warns the operator when
// the in-page preview is ahead of the saved loan.

import { useEffect, useMemo, useState } from "react";
import { Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { useDownloadTermSheet, useRecalc, useUpdateLoan } from "@/hooks/useApi";
import {
  AmortizationStyle,
  AmortizationStyleOptions,
  EntityType,
  EntityTypeOptions,
  ExitStrategy,
  ExperienceTier,
  ExperienceTierOptions,
  LoanPurpose,
  LoanPurposeOptions,
  LoanType,
  PrepayPenalty,
  PrepayPenaltyOptions,
  PropertyType,
  PropertyTypeOptions,
} from "@/lib/enums.generated";
import type { Loan } from "@/lib/types";
import { AmortizationTable } from "../components/AmortizationTable";
import { LoanTermsSheet, buildTermsSnapshot } from "../components/LoanTermsSheet";
import { LoanTypeFields, type TypeFieldsValue } from "../components/LoanTypeFields";

type Draft = {
  // Loan structure
  purpose: string;
  propertyType: string;
  termMonths: string;
  amortizationStyle: string;
  prepayPenalty: string;
  // Pricing
  amount: string;
  baseRatePct: string;
  points: string;
  originationPct: string;
  lenderFees: string;
  // Collateral
  arv: string;
  brv: string;
  rehabBudget: string;
  payoff: string;
  // Income
  monthlyRent: string;
  vacancyPct: string;
  expenseRatioPct: string;
  // Carrying costs
  annualTaxes: string;
  annualInsurance: string;
  monthlyHoa: string;
  reservesRequired: string;
  // Borrower
  ficoOverride: string;
  entityType: string;
  experienceTier: string;
  // Type-specific
  constructionHoldbackPct: string;
  drawCount: string;
  exitStrategy: string;
  cashToBorrower: string;
  seasoningMonths: string;
  propertyCount: string;
};

export function TermsTab({ loan }: { loan: Loan }) {
  const { t } = useTheme();
  const recalc = useRecalc();
  const updateLoan = useUpdateLoan();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => fromLoan(loan));

  useEffect(() => {
    setDraft(fromLoan(loan));
    setSaved(false);
  }, [loan.id]);

  const numbers = useMemo(() => {
    return {
      amount: money(draft.amount),
      baseRate: pctToRate(draft.baseRatePct),
      points: number(draft.points),
      originationPct: pctToRate(draft.originationPct),
      lenderFees: optionalMoney(draft.lenderFees),
      termMonths: intValue(draft.termMonths),
      arv: optionalMoney(draft.arv),
      brv: optionalMoney(draft.brv),
      rehabBudget: optionalMoney(draft.rehabBudget),
      payoff: optionalMoney(draft.payoff),
      monthlyRent: optionalMoney(draft.monthlyRent),
      vacancyPct: pctToRate(draft.vacancyPct),
      expenseRatioPct: pctToRate(draft.expenseRatioPct),
      annualTaxes: money(draft.annualTaxes),
      annualInsurance: money(draft.annualInsurance),
      monthlyHoa: money(draft.monthlyHoa),
      reservesRequired: optionalMoney(draft.reservesRequired),
      ficoOverride: intValue(draft.ficoOverride),
      constructionHoldbackPct: pctToRate(draft.constructionHoldbackPct),
      drawCount: intValue(draft.drawCount),
      cashToBorrower: optionalMoney(draft.cashToBorrower),
      seasoningMonths: intValue(draft.seasoningMonths),
      propertyCount: intValue(draft.propertyCount),
    };
  }, [draft]);

  useEffect(() => {
    if (!numbers.amount || !numbers.baseRate) return;
    const timer = window.setTimeout(() => {
      recalc.mutate({
        loanId: loan.id,
        discount_points: numbers.points,
        loan_amount: numbers.amount,
        base_rate: numbers.baseRate,
        annual_taxes: numbers.annualTaxes,
        annual_insurance: numbers.annualInsurance,
        monthly_hoa: numbers.monthlyHoa,
        term_months: numbers.termMonths,
        monthly_rent: numbers.monthlyRent,
        purpose: draft.purpose as LoanPurpose,
        arv: numbers.arv,
        brv: numbers.brv,
        rehab_budget: numbers.rehabBudget,
        payoff: numbers.payoff,
        amortization_style: (draft.amortizationStyle || null) as AmortizationStyle | null,
        origination_pct: numbers.originationPct || null,
        vacancy_pct: numbers.vacancyPct || null,
        expense_ratio_pct: numbers.expenseRatioPct || null,
        reserves_required: numbers.reservesRequired,
        lender_fees: numbers.lenderFees,
        construction_holdback_pct: numbers.constructionHoldbackPct || null,
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [
    loan.id,
    draft.purpose,
    draft.amortizationStyle,
    numbers.amount,
    numbers.baseRate,
    numbers.points,
    numbers.originationPct,
    numbers.lenderFees,
    numbers.annualTaxes,
    numbers.annualInsurance,
    numbers.monthlyHoa,
    numbers.reservesRequired,
    numbers.termMonths,
    numbers.monthlyRent,
    numbers.vacancyPct,
    numbers.expenseRatioPct,
    numbers.arv,
    numbers.brv,
    numbers.rehabBudget,
    numbers.payoff,
    numbers.constructionHoldbackPct,
  ]);

  const result = recalc.data;
  const sizedAmount = Number(result?.loan_amount ?? numbers.amount ?? loan.amount);
  const finalRate = result?.final_rate ?? loan.final_rate;
  const ltv = result?.sizing?.ltv ?? (numbers.arv ? sizedAmount / numbers.arv : loan.ltv);
  const ltc = result?.sizing?.ltc ?? loan.ltc;
  const hasSizing = !!result?.sizing;

  const criteriaReady = [
    numbers.amount > 0,
    numbers.baseRate > 0,
    !!draft.purpose,
    !!draft.amortizationStyle,
    numbers.termMonths != null,
    numbers.arv != null && numbers.arv > 0,
    loan.type !== "dscr" || (numbers.monthlyRent != null && numbers.monthlyRent > 0),
    finalRate != null,
    !!result && result.warnings.length === 0,
  ].filter(Boolean).length;
  const criteriaCompletion = Math.round((criteriaReady / 9) * 100);

  // Unsaved-edits detection — compares the current draft against the
  // saved loan's mirror. Cheap: just stringify both.
  const savedDraft = useMemo(() => JSON.stringify(fromLoan(loan)), [loan]);
  const currentDraft = useMemo(() => JSON.stringify(draft), [draft]);
  const hasUnsavedEdits = savedDraft !== currentDraft;

  const saveCriteria = async () => {
    setSaveError(null);
    setSaved(false);
    try {
      await updateLoan.mutateAsync({
        loanId: loan.id,
        amount: sizedAmount,
        base_rate: numbers.baseRate,
        discount_points: numbers.points,
        final_rate: finalRate ?? null,
        origination_pct: numbers.originationPct || undefined,
        dscr: result?.dscr ?? loan.dscr ?? null,
        purpose: draft.purpose as LoanPurpose,
        property_type: (draft.propertyType || loan.property_type) as PropertyType,
        term_months: numbers.termMonths,
        arv: numbers.arv,
        ltv,
        ltc,
        monthly_rent: numbers.monthlyRent,
        annual_taxes: numbers.annualTaxes,
        annual_insurance: numbers.annualInsurance,
        monthly_hoa: numbers.monthlyHoa,
        // Underwriter fine-tuning fields.
        amortization_style: (draft.amortizationStyle || null) as AmortizationStyle | null,
        prepay_penalty: (draft.prepayPenalty || null) as PrepayPenalty | null,
        vacancy_pct: numbers.vacancyPct || null,
        expense_ratio_pct: numbers.expenseRatioPct || null,
        reserves_required: numbers.reservesRequired,
        lender_fees: numbers.lenderFees,
        fico_override: numbers.ficoOverride,
        entity_type: (draft.entityType || null) as EntityType | null,
        experience_tier: (draft.experienceTier || null) as ExperienceTier | null,
        construction_holdback_pct: numbers.constructionHoldbackPct || null,
        draw_count: numbers.drawCount,
        exit_strategy: (draft.exitStrategy || null) as ExitStrategy | null,
        cash_to_borrower: numbers.cashToBorrower,
        seasoning_months: numbers.seasoningMonths,
        property_count: numbers.propertyCount,
      });
      setSaved(true);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save loan criteria.");
    }
  };

  const typeFieldsValue: TypeFieldsValue = {
    vacancyPct: draft.vacancyPct,
    expenseRatioPct: draft.expenseRatioPct,
    constructionHoldbackPct: draft.constructionHoldbackPct,
    drawCount: draft.drawCount,
    exitStrategy: (draft.exitStrategy || "") as TypeFieldsValue["exitStrategy"],
    cashToBorrower: draft.cashToBorrower,
    seasoningMonths: draft.seasoningMonths,
    propertyCount: draft.propertyCount,
  };

  // For the AmortizationTable: use the IO style only when explicitly
  // selected. Default to fully amortizing.
  const amortStyle = (draft.amortizationStyle || "fully_amortizing") as AmortizationStyle;
  const amortTerm = numbers.termMonths || loan.term_months || (amortStyle === "interest_only" ? 12 : 360);
  const monthlyPI = result?.monthly_pi ?? 0;

  const termsSnapshot = buildTermsSnapshot({
    loan: { type: loan.type, property_type: loan.property_type },
    draft: {
      purpose: (draft.purpose || null) as LoanPurpose | null,
      term_months: numbers.termMonths,
      amortization_style: amortStyle,
      prepay_penalty: (draft.prepayPenalty || null) as PrepayPenalty | null,
      loan_amount: sizedAmount,
      base_rate: numbers.baseRate || null,
      final_rate: finalRate ?? null,
      discount_points: numbers.points,
      origination_pct: numbers.originationPct || null,
      lender_fees: numbers.lenderFees,
      arv: numbers.arv,
      brv: numbers.brv,
      rehab_budget: numbers.rehabBudget,
      payoff: numbers.payoff,
      ltv,
      ltc,
      annual_taxes: numbers.annualTaxes,
      annual_insurance: numbers.annualInsurance,
      monthly_hoa: numbers.monthlyHoa,
      reserves_required: numbers.reservesRequired,
      monthly_rent: numbers.monthlyRent,
      vacancy_pct: numbers.vacancyPct || null,
      expense_ratio_pct: numbers.expenseRatioPct || null,
      fico_override: numbers.ficoOverride,
      entity_type: (draft.entityType || null) as EntityType | null,
      experience_tier: (draft.experienceTier || null) as ExperienceTier | null,
      construction_holdback_pct: numbers.constructionHoldbackPct || null,
      draw_count: numbers.drawCount,
      exit_strategy: (draft.exitStrategy || null) as ExitStrategy | null,
      cash_to_borrower: numbers.cashToBorrower,
      seasoning_months: numbers.seasoningMonths,
      property_count: numbers.propertyCount,
    },
    recalc: result,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div
        style={{
          border: `1px solid ${t.line}`,
          borderRadius: 16,
          background: t.surface,
          boxShadow: t.shadow,
          padding: 14,
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 320px auto",
          gap: 14,
          alignItems: "center",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 900, color: t.ink3, letterSpacing: 1.4, textTransform: "uppercase" }}>
            Underwriter workbench
          </div>
          <div style={{ marginTop: 4, fontSize: 20, fontWeight: 950, color: t.ink, letterSpacing: 0 }}>
            Build and fine-tune the loan math
          </div>
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 900, color: t.ink3, letterSpacing: 1.1, textTransform: "uppercase" }}>Criteria completion</span>
            <span style={{ fontSize: 12, fontWeight: 950, color: criteriaCompletion >= 80 ? t.profit : criteriaCompletion >= 60 ? t.warn : t.brand }}>
              {criteriaCompletion}%
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: t.line, overflow: "hidden", marginTop: 8 }}>
            <div
              style={{
                width: `${criteriaCompletion}%`,
                height: "100%",
                borderRadius: 999,
                background: criteriaCompletion >= 80 ? t.profit : criteriaCompletion >= 60 ? t.warn : t.brand,
              }}
            />
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <DownloadTermSheetButton loan={loan} unsaved={hasUnsavedEdits} />
          <button onClick={() => setDraft(fromLoan(loan))} style={{ ...qcBtn(t), padding: "8px 11px", borderRadius: 8 }}>
            Reset
          </button>
          <button
            onClick={saveCriteria}
            disabled={updateLoan.isPending || !numbers.amount || !numbers.baseRate}
            style={{
              ...qcBtnPrimary(t),
              padding: "8px 12px",
              borderRadius: 8,
              opacity: updateLoan.isPending || !numbers.amount || !numbers.baseRate ? 0.6 : 1,
              cursor: updateLoan.isPending ? "wait" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            <Icon name="check" size={13} />
            {updateLoan.isPending ? "Saving..." : "Save Criteria"}
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 420px", gap: 14, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <WorkbenchPanel eyebrow="Structure" title="Loan structure">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
              <Field label="Loan type">
                <ReadOnlyChip value={prettify(loan.type)} />
              </Field>
              <Field label="Purpose">
                <select value={draft.purpose} onChange={(e) => setDraftField(setDraft, "purpose", e.target.value)} style={inputStyle(t)}>
                  <option value="">—</option>
                  {LoanPurposeOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Property type">
                <select value={draft.propertyType} onChange={(e) => setDraftField(setDraft, "propertyType", e.target.value)} style={inputStyle(t)}>
                  {PropertyTypeOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Term (months)">
                <NumberInput value={draft.termMonths} onChange={(v) => setDraftField(setDraft, "termMonths", v)} />
              </Field>
              <Field label="Amortization">
                <select value={draft.amortizationStyle} onChange={(e) => setDraftField(setDraft, "amortizationStyle", e.target.value)} style={inputStyle(t)}>
                  <option value="">—</option>
                  {AmortizationStyleOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Prepay penalty">
                <select value={draft.prepayPenalty} onChange={(e) => setDraftField(setDraft, "prepayPenalty", e.target.value)} style={inputStyle(t)}>
                  <option value="">—</option>
                  {PrepayPenaltyOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
            </div>
          </WorkbenchPanel>

          <WorkbenchPanel eyebrow="Pricing" title="Rate, points & fees">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
              <MoneyField label="Requested amount" value={draft.amount} onChange={(v) => setDraftField(setDraft, "amount", v)} />
              <Field label="Base rate">
                <NumberInput suffix="%" value={draft.baseRatePct} onChange={(v) => setDraftField(setDraft, "baseRatePct", v)} />
              </Field>
              <Field label="Discount points">
                <NumberInput value={draft.points} step="0.25" onChange={(v) => setDraftField(setDraft, "points", v)} />
              </Field>
              <Field label="Origination">
                <NumberInput suffix="%" value={draft.originationPct} onChange={(v) => setDraftField(setDraft, "originationPct", v)} />
              </Field>
              <MoneyField label="Lender fees (flat)" value={draft.lenderFees} onChange={(v) => setDraftField(setDraft, "lenderFees", v)} />
              <MoneyField label="Payoff" value={draft.payoff} onChange={(v) => setDraftField(setDraft, "payoff", v)} />
            </div>
          </WorkbenchPanel>

          <WorkbenchPanel eyebrow="Collateral" title="Property & rehab">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
              <MoneyField label="ARV / value" value={draft.arv} onChange={(v) => setDraftField(setDraft, "arv", v)} />
              <MoneyField label="BRV / purchase price" value={draft.brv} onChange={(v) => setDraftField(setDraft, "brv", v)} />
              <MoneyField label="Rehab budget" value={draft.rehabBudget} onChange={(v) => setDraftField(setDraft, "rehabBudget", v)} />
            </div>
          </WorkbenchPanel>

          {showsRentalIncome(loan.type) ? (
            <WorkbenchPanel eyebrow="Income" title="Rental income & DSCR inputs">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
                <MoneyField label="Gross monthly rent" value={draft.monthlyRent} onChange={(v) => setDraftField(setDraft, "monthlyRent", v)} />
                <Field label="Vacancy %">
                  <NumberInput suffix="%" value={draft.vacancyPct} onChange={(v) => setDraftField(setDraft, "vacancyPct", v)} />
                </Field>
                <Field label="Operating expense ratio">
                  <NumberInput suffix="%" value={draft.expenseRatioPct} onChange={(v) => setDraftField(setDraft, "expenseRatioPct", v)} />
                </Field>
              </div>
              {result?.effective_rent != null ? (
                <div style={{ marginTop: 10, fontSize: 12, color: t.ink3 }}>
                  Effective rent after vacancy & expenses: <strong style={{ color: t.ink }}>${result.effective_rent.toLocaleString()}</strong>
                </div>
              ) : null}
            </WorkbenchPanel>
          ) : null}

          <WorkbenchPanel eyebrow="Carrying costs" title="Taxes, insurance & reserves">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
              <MoneyField label="Annual taxes" value={draft.annualTaxes} onChange={(v) => setDraftField(setDraft, "annualTaxes", v)} />
              <MoneyField label="Annual insurance" value={draft.annualInsurance} onChange={(v) => setDraftField(setDraft, "annualInsurance", v)} />
              <MoneyField label="Monthly HOA" value={draft.monthlyHoa} onChange={(v) => setDraftField(setDraft, "monthlyHoa", v)} />
              <MoneyField label="Reserves required" value={draft.reservesRequired} onChange={(v) => setDraftField(setDraft, "reservesRequired", v)} />
            </div>
          </WorkbenchPanel>

          <WorkbenchPanel eyebrow="Borrower" title="Credit & entity">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
              <Field label="FICO override">
                <NumberInput value={draft.ficoOverride} onChange={(v) => setDraftField(setDraft, "ficoOverride", v)} />
              </Field>
              <Field label="Entity type">
                <select value={draft.entityType} onChange={(e) => setDraftField(setDraft, "entityType", e.target.value)} style={inputStyle(t)}>
                  <option value="">—</option>
                  {EntityTypeOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Experience tier">
                <select value={draft.experienceTier} onChange={(e) => setDraftField(setDraft, "experienceTier", e.target.value)} style={inputStyle(t)}>
                  <option value="">—</option>
                  {ExperienceTierOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
            </div>
          </WorkbenchPanel>

          <WorkbenchPanel eyebrow={typeSpecificEyebrow(loan.type)} title={typeSpecificTitle(loan.type)}>
            <LoanTypeFields
              loanType={loan.type}
              value={typeFieldsValue}
              onChange={(key, value) => {
                const map: Record<keyof TypeFieldsValue, keyof Draft> = {
                  vacancyPct: "vacancyPct",
                  expenseRatioPct: "expenseRatioPct",
                  constructionHoldbackPct: "constructionHoldbackPct",
                  drawCount: "drawCount",
                  exitStrategy: "exitStrategy",
                  cashToBorrower: "cashToBorrower",
                  seasoningMonths: "seasoningMonths",
                  propertyCount: "propertyCount",
                };
                setDraftField(setDraft, map[key], value);
              }}
            />
          </WorkbenchPanel>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
            <RuleTile icon="calc" label="Math path" value={recalc.isPending ? "Calculating" : "Backend recalc"} />
            <RuleTile icon="shield" label="Warnings" value={result?.warnings.length ? `${result.warnings.length} open` : "Clear"} tone={result?.warnings.length ? "watch" : "ready"} />
            <RuleTile icon="docCheck" label="Save state" value={saved ? "Saved" : saveError ? "Error" : hasUnsavedEdits ? "Unsaved edits" : "In sync"} tone={saved ? "ready" : saveError ? "danger" : hasUnsavedEdits ? "watch" : "ready"} />
          </div>
        </div>

        <div style={{ position: "sticky", top: 96 }}>
          <WorkbenchPanel eyebrow="Live terms" title="Underwriting output" action={recalc.isPending ? "Calculating" : "Live"}>
            <div style={{ padding: 14, borderRadius: 14, background: t.brandSoft, border: `1px solid ${t.lineStrong}` }}>
              <div style={{ fontSize: 10.5, fontWeight: 900, color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase" }}>Sized loan amount</div>
              <div style={{ marginTop: 5, fontSize: 32, fontWeight: 950, color: t.brand, fontFeatureSettings: '"tnum"', letterSpacing: 0 }}>
                ${Math.round(sizedAmount).toLocaleString()}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginTop: 10 }}>
              <ResultMetric label="Final rate" value={finalRate ? `${(finalRate * 100).toFixed(3)}%` : "Missing"} tone={finalRate ? "neutral" : "watch"} />
              <ResultMetric label={amortStyle === "interest_only" ? "Monthly interest" : "Monthly P&I"} value={result ? `$${Math.round(result.monthly_pi).toLocaleString()}` : "..."} />
              <ResultMetric label="DSCR" value={result?.dscr != null ? result.dscr.toFixed(2) : loan.dscr != null ? loan.dscr.toFixed(2) : "N/A"} tone={(result?.dscr ?? loan.dscr ?? 0) >= 1.25 ? "ready" : (result?.dscr ?? loan.dscr ?? 0) > 0 ? "watch" : "neutral"} />
              <ResultMetric label="Total cash to close" value={result?.total_cash_to_close != null ? `$${Math.round(result.total_cash_to_close).toLocaleString()}` : "..."} />
            </div>

            <div style={{ marginTop: 12, padding: 12, borderRadius: 13, background: t.surface2, border: `1px solid ${t.line}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 12, color: t.ink, fontWeight: 900 }}>Sizing result</div>
                  <div style={{ marginTop: 3, fontSize: 11.5, color: t.ink3, textTransform: "capitalize" }}>
                    {hasSizing
                      ? `${constraintLabel(result.sizing!.binding_constraint)} cap $${Math.round(result.sizing!.max_allowed).toLocaleString()}`
                      : "No sizing constraint returned"}
                  </div>
                </div>
                {hasSizing ? (
                  <Pill bg={result.sizing!.clamped ? t.warnBg : t.profitBg} color={result.sizing!.clamped ? t.warn : t.profit}>
                    {result.sizing!.clamped ? "Clamped" : "Within cap"}
                  </Pill>
                ) : null}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 10 }}>
                <SmallRatio t={t} label="LTV" value={ltv != null ? `${(ltv * 100).toFixed(1)}%` : "N/A"} />
                <SmallRatio t={t} label="LTC" value={ltc != null ? `${(ltc * 100).toFixed(1)}%` : "N/A"} />
                <SmallRatio t={t} label="ARV LTV" value={result?.sizing?.arv_ltv != null ? `${(result.sizing.arv_ltv * 100).toFixed(1)}%` : "N/A"} />
              </div>
            </div>

            {result?.warnings.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                {result.warnings.map((warning) => (
                  <div key={`${warning.code}-${warning.message}`} style={{ display: "flex", gap: 8, padding: "9px 10px", borderRadius: 10, background: t.warnBg, color: t.warn, fontSize: 12.5, fontWeight: 800 }}>
                    <Icon name="alert" size={14} />
                    {warning.message}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ marginTop: 12, color: t.profit, display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 850 }}>
                <Icon name="check" size={14} />
                No current sizing or pricing warnings.
              </div>
            )}

            {saveError ? <div style={{ marginTop: 12, color: t.danger, fontSize: 12, fontWeight: 850 }}>{saveError}</div> : null}
            {saved ? <div style={{ marginTop: 12, color: t.profit, fontSize: 12, fontWeight: 850 }}>Criteria saved to loan file.</div> : null}
          </WorkbenchPanel>
        </div>
      </div>

      {/* Inline terms sheet — mirror of the PDF, lives below the form
          and updates live with every input change. The PDF is rendered
          from the persisted loan, so the pill warns when the preview
          is ahead of saved state. */}
      <LoanTermsSheet snapshot={termsSnapshot} unsaved={hasUnsavedEdits} />

      {/* Full amortization schedule. Renders only when we have enough
          inputs to compute monthly payments — otherwise it would just
          show zeros. */}
      {sizedAmount > 0 && finalRate ? (
        <AmortizationTable
          loanAmount={sizedAmount}
          annualRate={finalRate}
          termMonths={amortTerm}
          monthlyPI={monthlyPI}
          style={amortStyle}
        />
      ) : null}
    </div>
  );
}

function fromLoan(loan: Loan): Draft {
  return {
    purpose: loan.purpose ?? LoanPurpose.PURCHASE,
    propertyType: loan.property_type ?? PropertyType.SFR,
    termMonths: loan.term_months ? String(loan.term_months) : "",
    amortizationStyle: loan.amortization_style ?? defaultAmortStyle(loan.type),
    prepayPenalty: loan.prepay_penalty ?? "",
    amount: rounded(loan.amount),
    baseRatePct: loan.base_rate ? (loan.base_rate * 100).toFixed(3) : "",
    points: String(loan.discount_points ?? 0),
    originationPct: loan.origination_pct ? (loan.origination_pct * 100).toFixed(2) : "",
    lenderFees: rounded(loan.lender_fees),
    arv: rounded(loan.arv),
    brv: "",
    rehabBudget: "",
    payoff: "",
    monthlyRent: rounded(loan.monthly_rent),
    vacancyPct: loan.vacancy_pct != null ? (loan.vacancy_pct * 100).toFixed(1) : "",
    expenseRatioPct: loan.expense_ratio_pct != null ? (loan.expense_ratio_pct * 100).toFixed(1) : "",
    annualTaxes: rounded(loan.annual_taxes),
    annualInsurance: rounded(loan.annual_insurance),
    monthlyHoa: rounded(loan.monthly_hoa),
    reservesRequired: rounded(loan.reserves_required),
    ficoOverride: loan.fico_override ? String(loan.fico_override) : "",
    entityType: loan.entity_type ?? "",
    experienceTier: loan.experience_tier ?? "",
    constructionHoldbackPct: loan.construction_holdback_pct != null ? (loan.construction_holdback_pct * 100).toFixed(2) : "",
    drawCount: loan.draw_count ? String(loan.draw_count) : "",
    exitStrategy: loan.exit_strategy ?? "",
    cashToBorrower: rounded(loan.cash_to_borrower),
    seasoningMonths: loan.seasoning_months ? String(loan.seasoning_months) : "",
    propertyCount: loan.property_count ? String(loan.property_count) : "",
  };
}

function defaultAmortStyle(type: LoanType): AmortizationStyle {
  if (type === LoanType.FIX_AND_FLIP || type === LoanType.GROUND_UP || type === LoanType.BRIDGE) {
    return AmortizationStyle.INTEREST_ONLY;
  }
  return AmortizationStyle.FULLY_AMORTIZING;
}

function showsRentalIncome(type: LoanType): boolean {
  return type === LoanType.DSCR || type === LoanType.PORTFOLIO || type === LoanType.CASH_OUT_REFI;
}

function typeSpecificEyebrow(type: LoanType): string {
  switch (type) {
    case LoanType.DSCR: return "DSCR tuning";
    case LoanType.FIX_AND_FLIP: return "Fix & flip";
    case LoanType.GROUND_UP: return "Ground-up construction";
    case LoanType.BRIDGE: return "Bridge";
    case LoanType.PORTFOLIO: return "Portfolio";
    case LoanType.CASH_OUT_REFI: return "Cash-out refi";
    default: return "Type-specific";
  }
}

function typeSpecificTitle(type: LoanType): string {
  switch (type) {
    case LoanType.DSCR: return "Income tuning (DSCR)";
    case LoanType.FIX_AND_FLIP:
    case LoanType.GROUND_UP: return "Construction & exit";
    case LoanType.BRIDGE: return "Exit strategy";
    case LoanType.PORTFOLIO: return "Portfolio & expenses";
    case LoanType.CASH_OUT_REFI: return "Refi specifics";
    default: return "Loan-type fine tuning";
  }
}

function setDraftField(setDraft: React.Dispatch<React.SetStateAction<Draft>>, key: keyof Draft, value: string) {
  setDraft((current) => ({ ...current, [key]: value }));
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { t } = useTheme();
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 10.5, fontWeight: 800, color: t.ink3, letterSpacing: 1.1, textTransform: "uppercase" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function MoneyField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <NumberInput prefix="$" value={value} onChange={onChange} />
    </Field>
  );
}

function NumberInput({
  value,
  onChange,
  prefix,
  suffix,
  step,
}: {
  value: string;
  onChange: (value: string) => void;
  prefix?: string;
  suffix?: string;
  step?: string;
}) {
  const { t } = useTheme();
  return (
    <div style={{ position: "relative" }}>
      {prefix ? <span style={inputAdorn(t, "left")}>{prefix}</span> : null}
      <input
        value={value}
        inputMode="decimal"
        step={step}
        onChange={(event) => onChange(event.target.value.replace(/[^0-9.]/g, ""))}
        style={{
          ...inputStyle(t),
          paddingLeft: prefix ? 28 : 12,
          paddingRight: suffix ? 30 : 12,
        }}
      />
      {suffix ? <span style={inputAdorn(t, "right")}>{suffix}</span> : null}
    </div>
  );
}

function ReadOnlyChip({ value }: { value: string }) {
  const { t } = useTheme();
  return (
    <div
      style={{
        ...inputStyle(t),
        background: t.chip,
        color: t.ink2,
        fontWeight: 900,
        letterSpacing: 0.2,
      }}
    >
      {value}
    </div>
  );
}

function WorkbenchPanel({
  id,
  eyebrow,
  title,
  action,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  action?: string;
  children: React.ReactNode;
}) {
  const { t } = useTheme();
  return (
    <section id={id} style={{ border: `1px solid ${t.line}`, borderRadius: 16, background: t.surface, boxShadow: t.shadow, padding: 16, minWidth: 0, scrollMarginTop: 120 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 13 }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 900, color: t.ink3, letterSpacing: 1.4, textTransform: "uppercase" }}>{eyebrow}</div>
          <div style={{ marginTop: 3, fontSize: 17, fontWeight: 950, color: t.ink, letterSpacing: 0 }}>{title}</div>
        </div>
        {action ? (
          <Pill bg={t.chip} color={t.ink2} style={{ fontWeight: 850 }}>
            {action}
          </Pill>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function RuleTile({
  icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: string;
  label: string;
  value: string;
  tone?: "ready" | "watch" | "danger" | "neutral";
}) {
  const { t } = useTheme();
  const color = tone === "ready" ? t.profit : tone === "watch" ? t.warn : tone === "danger" ? t.danger : t.ink;
  const bg = tone === "ready" ? t.profitBg : tone === "watch" ? t.warnBg : tone === "danger" ? t.dangerBg : t.surface;
  return (
    <div style={{ border: `1px solid ${t.line}`, borderRadius: 14, background: bg, padding: 13, boxShadow: t.shadow }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color, fontSize: 12, fontWeight: 950 }}>
        <Icon name={icon} size={15} />
        {label}
      </div>
      <div style={{ marginTop: 8, fontSize: 17, color: t.ink, fontWeight: 950, fontFeatureSettings: '"tnum"' }}>{value}</div>
    </div>
  );
}

function ResultMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "ready" | "watch" | "neutral";
}) {
  const { t } = useTheme();
  const color = tone === "ready" ? t.profit : tone === "watch" ? t.warn : t.ink;
  return (
    <div style={{ padding: 12, borderRadius: 12, background: t.surface2, border: `1px solid ${t.line}`, minWidth: 0 }}>
      <div style={{ fontSize: 10.5, fontWeight: 900, color: t.ink3, letterSpacing: 1.1, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ marginTop: 5, fontSize: 20, fontWeight: 950, color, fontFeatureSettings: '"tnum"', overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {value}
      </div>
    </div>
  );
}

function SmallRatio({ t, label, value }: { t: ReturnType<typeof useTheme>["t"]; label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 9.5, fontWeight: 800, color: t.ink3, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ marginTop: 2, fontSize: 13, color: t.ink, fontWeight: 850, fontFeatureSettings: '"tnum"' }}>{value}</div>
    </div>
  );
}

function inputStyle(t: ReturnType<typeof useTheme>["t"]): React.CSSProperties {
  return {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    background: t.surface2,
    border: `1px solid ${t.line}`,
    color: t.ink,
    fontSize: 13,
    fontFamily: "inherit",
    outline: "none",
    fontFeatureSettings: '"tnum"',
  };
}

function inputAdorn(t: ReturnType<typeof useTheme>["t"], side: "left" | "right"): React.CSSProperties {
  return {
    position: "absolute",
    top: 0,
    bottom: 0,
    [side]: 10,
    display: "inline-flex",
    alignItems: "center",
    color: t.ink3,
    fontSize: 12,
    fontWeight: 800,
    pointerEvents: "none",
  };
}

function rounded(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return "";
  return String(Math.round(Number(value)));
}

function money(value: string) {
  return Number(value.replace(/[^0-9.]/g, "")) || 0;
}

function optionalMoney(value: string) {
  const parsed = money(value);
  return parsed > 0 ? parsed : null;
}

function number(value: string) {
  return Number(value.replace(/[^0-9.]/g, "")) || 0;
}

function intValue(value: string) {
  const parsed = Number.parseInt(value.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function pctToRate(value: string) {
  const parsed = number(value);
  return parsed > 0 ? parsed / 100 : 0;
}

function constraintLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function prettify(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

function DownloadTermSheetButton({ loan, unsaved }: { loan: Loan; unsaved: boolean }) {
  const { t } = useTheme();
  const dl = useDownloadTermSheet();
  const handle = async () => {
    try {
      const blob = await dl.mutateAsync({ loanId: loan.id });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `term-sheet-${loan.deal_id || loan.id.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (err) {
      console.error("Term sheet PDF failed", err);
      alert("Could not generate term sheet. Check that the loan has a rate and term configured.");
    }
  };
  return (
    <button
      onClick={handle}
      disabled={dl.isPending}
      title={unsaved
        ? "Save criteria first — the PDF renders from saved state, not the in-page preview."
        : "Download a PDF term sheet + amortization schedule. Shareable with the borrower."}
      style={{
        ...qcBtn(t),
        padding: "8px 11px",
        borderRadius: 8,
        opacity: dl.isPending ? 0.6 : unsaved ? 0.85 : 1,
        cursor: dl.isPending ? "wait" : "pointer",
        whiteSpace: "nowrap",
        position: "relative",
      }}
    >
      <Icon name="doc" size={12} />
      {dl.isPending ? "Generating…" : unsaved ? "PDF (saved state)" : "Download PDF"}
    </button>
  );
}
