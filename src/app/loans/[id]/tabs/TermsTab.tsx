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

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/design-system/Icon";
import { Btn, CellChip, Kpi, StatusLine, WarnLine, cx, type ChipTone } from "@/components/ds";
import { useClient, useCurrentCredit, useDownloadTermSheet, useParsedReport, useRecalc, useUpdateClient, useUpdateLoan } from "@/hooks/useApi";
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
  // Data-derived: the completion figure and its bar share one tone.
  const completionTone =
    criteriaCompletion >= 80 ? "var(--ok)" : criteriaCompletion >= 60 ? "var(--warn)" : "var(--accent)";

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
    <div className="grid">
      <div
        className="card"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 320px auto",
          gap: 14,
          alignItems: "center",
        }}
      >
        <div>
          <div className="lbl">Underwriter workbench</div>
          <h3>Build and fine-tune the loan math</h3>
        </div>
        <div>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="lbl">Criteria completion</span>
            <span className="num" style={{ fontWeight: 800, color: completionTone }}>
              {criteriaCompletion}%
            </span>
          </div>
          <div className="track mt">
            <div className="fill" style={{ width: `${criteriaCompletion}%`, background: completionTone }} />
          </div>
        </div>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <DownloadTermSheetButton loan={loan} unsaved={hasUnsavedEdits} />
          <Btn onClick={() => setDraft(fromLoan(loan))}>Reset</Btn>
          <Btn
            variant="pri"
            onClick={saveCriteria}
            disabled={updateLoan.isPending || !numbers.amount || !numbers.baseRate}
            style={{ whiteSpace: "nowrap", cursor: updateLoan.isPending ? "wait" : undefined }}
          >
            <Icon name="check" size={13} />
            {updateLoan.isPending ? "Saving..." : "Save Criteria"}
          </Btn>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 420px", gap: 14, alignItems: "start" }}>
        <div className="grid" style={{ minWidth: 0 }}>
          <WorkbenchPanel eyebrow="Structure" title="Loan structure">
            <div className="cg">
              <Field className="s4" label="Loan type">
                <ReadOnlyChip value={prettify(loan.type)} />
              </Field>
              <Field className="s4" label="Purpose">
                <select className="field" value={draft.purpose} onChange={(e) => setDraftField(setDraft, "purpose", e.target.value)}>
                  <option value="">—</option>
                  {LoanPurposeOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
              <Field className="s4" label="Property type">
                <select className="field" value={draft.propertyType} onChange={(e) => setDraftField(setDraft, "propertyType", e.target.value)}>
                  {PropertyTypeOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
              <Field className="s4" label="Term (months)">
                <NumberInput value={draft.termMonths} onChange={(v) => setDraftField(setDraft, "termMonths", v)} />
              </Field>
              <Field className="s4" label="Amortization">
                <select className="field" value={draft.amortizationStyle} onChange={(e) => setDraftField(setDraft, "amortizationStyle", e.target.value)}>
                  <option value="">—</option>
                  {AmortizationStyleOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
              <Field className="s4" label="Prepay penalty">
                <select className="field" value={draft.prepayPenalty} onChange={(e) => setDraftField(setDraft, "prepayPenalty", e.target.value)}>
                  <option value="">—</option>
                  {PrepayPenaltyOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
            </div>
          </WorkbenchPanel>

          <WorkbenchPanel eyebrow="Pricing" title="Rate, points & fees">
            <div className="cg">
              <MoneyField className="s4" label="Requested amount" value={draft.amount} onChange={(v) => setDraftField(setDraft, "amount", v)} />
              <Field className="s4" label="Base rate">
                <NumberInput suffix="%" value={draft.baseRatePct} onChange={(v) => setDraftField(setDraft, "baseRatePct", v)} />
              </Field>
              <Field className="s4" label="Discount points">
                <NumberInput value={draft.points} step="0.25" onChange={(v) => setDraftField(setDraft, "points", v)} />
              </Field>
              <Field className="s4" label="Origination">
                <NumberInput suffix="%" value={draft.originationPct} onChange={(v) => setDraftField(setDraft, "originationPct", v)} />
              </Field>
              <MoneyField className="s4" label="Lender fees (flat)" value={draft.lenderFees} onChange={(v) => setDraftField(setDraft, "lenderFees", v)} />
              <MoneyField className="s4" label="Payoff" value={draft.payoff} onChange={(v) => setDraftField(setDraft, "payoff", v)} />
            </div>
          </WorkbenchPanel>

          <WorkbenchPanel eyebrow="Collateral" title="Property & rehab">
            <div className="cg">
              <MoneyField className="s4" label="ARV / value" value={draft.arv} onChange={(v) => setDraftField(setDraft, "arv", v)} />
              <MoneyField className="s4" label="BRV / purchase price" value={draft.brv} onChange={(v) => setDraftField(setDraft, "brv", v)} />
              <MoneyField className="s4" label="Rehab budget" value={draft.rehabBudget} onChange={(v) => setDraftField(setDraft, "rehabBudget", v)} />
            </div>
          </WorkbenchPanel>

          {showsRentalIncome(loan.type) ? (
            <WorkbenchPanel eyebrow="Income" title="Rental income & DSCR inputs">
              <div className="cg">
                <MoneyField className="s4" label="Gross monthly rent" value={draft.monthlyRent} onChange={(v) => setDraftField(setDraft, "monthlyRent", v)} />
                <Field className="s4" label="Vacancy %">
                  <NumberInput suffix="%" value={draft.vacancyPct} onChange={(v) => setDraftField(setDraft, "vacancyPct", v)} />
                </Field>
                <Field className="s4" label="Operating expense ratio">
                  <NumberInput suffix="%" value={draft.expenseRatioPct} onChange={(v) => setDraftField(setDraft, "expenseRatioPct", v)} />
                </Field>
              </div>
              {result?.effective_rent != null ? (
                <div className="sub mt">
                  Effective rent after vacancy & expenses: <strong>${result.effective_rent.toLocaleString()}</strong>
                </div>
              ) : null}
            </WorkbenchPanel>
          ) : null}

          <WorkbenchPanel eyebrow="Carrying costs" title="Taxes, insurance & reserves">
            <div className="cg">
              <MoneyField className="s3" label="Annual taxes" value={draft.annualTaxes} onChange={(v) => setDraftField(setDraft, "annualTaxes", v)} />
              <MoneyField className="s3" label="Annual insurance" value={draft.annualInsurance} onChange={(v) => setDraftField(setDraft, "annualInsurance", v)} />
              <MoneyField className="s3" label="Monthly HOA" value={draft.monthlyHoa} onChange={(v) => setDraftField(setDraft, "monthlyHoa", v)} />
              <MoneyField className="s3" label="Reserves required" value={draft.reservesRequired} onChange={(v) => setDraftField(setDraft, "reservesRequired", v)} />
            </div>
          </WorkbenchPanel>

          <CreditPanel
            clientId={loan.client_id}
            ficoOverride={draft.ficoOverride}
            onOverrideChange={(v) => setDraftField(setDraft, "ficoOverride", v)}
          />

          <WorkbenchPanel eyebrow="Borrower" title="Entity & experience">
            <div className="cg">
              <Field className="s6" label="Entity type">
                <select className="field" value={draft.entityType} onChange={(e) => setDraftField(setDraft, "entityType", e.target.value)}>
                  <option value="">—</option>
                  {EntityTypeOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
              <Field className="s6" label="Experience tier">
                <select className="field" value={draft.experienceTier} onChange={(e) => setDraftField(setDraft, "experienceTier", e.target.value)}>
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

          <div className="cg">
            <RuleTile className="s4" icon="calc" label="Math path" value={recalc.isPending ? "Calculating" : "Backend recalc"} />
            <RuleTile className="s4" icon="shield" label="Warnings" value={result?.warnings.length ? `${result.warnings.length} open` : "Clear"} tone={result?.warnings.length ? "watch" : "ready"} />
            <RuleTile className="s4" icon="docCheck" label="Save state" value={saved ? "Saved" : saveError ? "Error" : hasUnsavedEdits ? "Unsaved edits" : "In sync"} tone={saved ? "ready" : saveError ? "danger" : hasUnsavedEdits ? "watch" : "ready"} />
          </div>
        </div>

        <div style={{ position: "sticky", top: 96 }}>
          <WorkbenchPanel eyebrow="Live terms" title="Underwriting output" action={recalc.isPending ? "Calculating" : "Live"}>
            <Kpi label="Sized loan amount" value={`$${Math.round(sizedAmount).toLocaleString()}`} />

            <div className="cg mt">
              <ResultMetric className="s6" label="Final rate" value={finalRate ? `${(finalRate * 100).toFixed(3)}%` : "Missing"} tone={finalRate ? "neutral" : "watch"} />
              <ResultMetric className="s6" label={amortStyle === "interest_only" ? "Monthly interest" : "Monthly P&I"} value={result ? `$${Math.round(result.monthly_pi).toLocaleString()}` : "..."} />
              <ResultMetric className="s6" label="DSCR" value={result?.dscr != null ? result.dscr.toFixed(2) : loan.dscr != null ? loan.dscr.toFixed(2) : "N/A"} tone={(result?.dscr ?? loan.dscr ?? 0) >= 1.25 ? "ready" : (result?.dscr ?? loan.dscr ?? 0) > 0 ? "watch" : "neutral"} />
              <ResultMetric className="s6" label="Total cash to close" value={result?.total_cash_to_close != null ? `$${Math.round(result.total_cash_to_close).toLocaleString()}` : "..."} />
            </div>

            <div className="card mt">
              <div className="row">
                <div>
                  <b>Sizing result</b>
                  <div className="sub">
                    {hasSizing
                      ? `${constraintLabel(result.sizing!.binding_constraint)} cap $${Math.round(result.sizing!.max_allowed).toLocaleString()}`
                      : "No sizing constraint returned"}
                  </div>
                </div>
                <span className="sp" />
                {hasSizing ? (
                  <CellChip tone={result.sizing!.clamped ? "warn" : "ok"}>
                    {result.sizing!.clamped ? "Clamped" : "Within cap"}
                  </CellChip>
                ) : null}
              </div>
              <div className="cg mt">
                <SmallRatio className="s4" label="LTV" value={ltv != null ? `${(ltv * 100).toFixed(1)}%` : "N/A"} />
                <SmallRatio className="s4" label="LTC" value={ltc != null ? `${(ltc * 100).toFixed(1)}%` : "N/A"} />
                <SmallRatio className="s4" label="ARV LTV" value={result?.sizing?.arv_ltv != null ? `${(result.sizing.arv_ltv * 100).toFixed(1)}%` : "N/A"} />
              </div>
            </div>

            {result?.warnings.length ? (
              <div className="grid mt">
                {result.warnings.map((warning) => (
                  <WarnLine key={`${warning.code}-${warning.message}`}>
                    <Icon name="alert" size={14} /> {warning.message}
                  </WarnLine>
                ))}
              </div>
            ) : (
              <div className="note">
                <Icon name="check" size={14} />
                No current sizing or pricing warnings.
              </div>
            )}

            {/* Sentences, not words: a chip would be clipped by the panel. */}
            {saveError ? <StatusLine className="mt" tone="bad">{saveError}</StatusLine> : null}
            {saved ? <StatusLine className="mt" tone="ok">Criteria saved to loan file.</StatusLine> : null}
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

/**
 * A labelled control. Stays a <label> wrapping its input: clicking the caption
 * focuses the field, which is the affordance a div would silently drop.
 */
function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={className} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span className="lbl">{label}</span>
      {children}
    </label>
  );
}

function MoneyField({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <Field label={label} className={className}>
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
  return (
    <div style={{ position: "relative" }}>
      {prefix ? <span style={inputAdorn("left")}>{prefix}</span> : null}
      <input
        className="field"
        value={value}
        inputMode="decimal"
        step={step}
        onChange={(event) => onChange(event.target.value.replace(/[^0-9.]/g, ""))}
        // Width and the adornment gutters only: the rest of the input is `.field`.
        style={{ width: "100%", paddingLeft: prefix ? 28 : undefined, paddingRight: suffix ? 30 : undefined }}
      />
      {suffix ? <span style={inputAdorn("right")}>{suffix}</span> : null}
    </div>
  );
}

/** Field-shaped, muted: reads as a value you cannot edit, not a control. */
function ReadOnlyChip({ value }: { value: string }) {
  return <div className="field c-mut">{value}</div>;
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
  return (
    // scrollMarginTop keeps an #id-anchored section clear of the sticky cockpit bar.
    <section id={id} className="panel" style={{ scrollMarginTop: 120 }}>
      <div className="panel-h">
        <div>
          <div className="lbl">{eyebrow}</div>
          <h3>{title}</h3>
        </div>
        {action ? (
          <>
            <span className="sp" />
            <CellChip tone="mut">{action}</CellChip>
          </>
        ) : null}
      </div>
      <div className="panel-b">{children}</div>
    </section>
  );
}

function RuleTile({
  icon,
  label,
  value,
  tone = "neutral",
  className,
}: {
  icon: string;
  label: string;
  value: string;
  tone?: "ready" | "watch" | "danger" | "neutral";
  className?: string;
}) {
  const chipTone: ChipTone = tone === "ready" ? "ok" : tone === "watch" ? "warn" : tone === "danger" ? "bad" : "mut";
  return (
    <div className={cx("kpi", className)}>
      <div className="lbl row">
        <Icon name={icon} size={14} />
        {label}
      </div>
      <div className="kdelta">
        <CellChip tone={chipTone}>{value}</CellChip>
      </div>
    </div>
  );
}

function ResultMetric({
  label,
  value,
  tone = "neutral",
  className,
}: {
  label: string;
  value: string;
  tone?: "ready" | "watch" | "neutral";
  className?: string;
}) {
  const color = tone === "ready" ? "var(--ok)" : tone === "watch" ? "var(--warn)" : undefined;
  return (
    <div className={cx("kpi", className)}>
      <div className="lbl">{label}</div>
      {/* colour is tone-derived; `.knum` owns the type and the nowrap. */}
      <div className="knum num" style={{ color, overflow: "hidden", textOverflow: "ellipsis" }}>
        {value}
      </div>
    </div>
  );
}

function SmallRatio({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <div className="lbl">{label}</div>
      <div className="num"><b>{value}</b></div>
    </div>
  );
}

function inputAdorn(side: "left" | "right"): React.CSSProperties {
  return {
    position: "absolute",
    top: 0,
    bottom: 0,
    [side]: 10,
    display: "inline-flex",
    alignItems: "center",
    color: "var(--muted)",
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
  const dl = useDownloadTermSheet();
  const [error, setError] = useState<string | null>(null);
  const handle = async () => {
    setError(null);
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
      setError("Could not generate the term sheet. Confirm that rate and term are saved.");
    }
  };
  return (
    <div className="grid g4">
      <Btn
        onClick={handle}
        disabled={dl.isPending}
        title={unsaved
          ? "Save criteria first — the PDF renders from saved state, not the in-page preview."
          : "Download a PDF term sheet + amortization schedule. Shareable with the borrower."}
        style={{ whiteSpace: "nowrap", cursor: dl.isPending ? "wait" : undefined }}
      >
        <Icon name="doc" size={12} />
        {dl.isPending ? "Generating…" : unsaved ? "PDF (saved state)" : "Download PDF"}
      </Btn>
      {error ? <StatusLine tone="bad">{error}</StatusLine> : null}
    </div>
  );
}


// Borrower credit panel — shows the iSoftPull score + last-pull age
// next to the underwriter's optional override. Compact by default;
// "Show details" expands the parsed-report summary (tradelines,
// inquiries, collections, public records, fraud flags).
//
// Effective FICO = override when set, else pulled. The expanded view
// makes the precedence explicit so an underwriter can see when their
// override is masking a different pulled value.

function CreditPanel({
  clientId,
  ficoOverride,
  onOverrideChange,
}: {
  clientId: string;
  ficoOverride: string;
  onOverrideChange: (value: string) => void;
}) {
  const credit = useCurrentCredit(clientId);
  const client = useClient(clientId);
  const updateClient = useUpdateClient();
  const [expanded, setExpanded] = useState(false);
  // When the operator types an override they often also want it to
  // update the borrower's master record — opt-in checkbox so we don't
  // surprise them.
  const [syncToBorrower, setSyncToBorrower] = useState(false);

  // Pulled = the most-recent iSoftPull on file (most authoritative
  // because it has a parsed report). Manual = the operator-set value
  // on Client.fico (typically entered during intake before any pull).
  // Override = per-loan override the underwriter set on this deal.
  // Precedence for "effective" score: override → pulled → manual.
  const pulled: number | null = credit.data?.fico ?? null;
  const pulledAt = credit.data?.pulled_at ? new Date(credit.data.pulled_at) : null;
  const manual: number | null = client.data?.fico ?? null;
  const overrideNum = ficoOverride.trim() ? parseInt(ficoOverride, 10) : null;
  const effective =
    Number.isFinite(overrideNum) && overrideNum
      ? overrideNum
      : pulled !== null
        ? pulled
        : manual;
  const effectiveSource: "override" | "pulled" | "manual" | "none" =
    overrideNum
      ? "override"
      : pulled !== null
        ? "pulled"
        : manual !== null
          ? "manual"
          : "none";

  const ageDays = pulledAt
    ? Math.max(0, Math.floor((Date.now() - pulledAt.getTime()) / 86_400_000))
    : null;
  const ageLabel = ageDays === null ? "no pull on file" : ageDays === 0 ? "today" : `${ageDays}d ago`;

  // Mirror the override to the client record on blur if the operator
  // opted in. Fires once per distinct value to keep churn low.
  const lastSyncedRef = useRef<number | null>(null);
  const syncOverrideToClient = () => {
    if (!syncToBorrower || !overrideNum || !Number.isFinite(overrideNum)) return;
    if (lastSyncedRef.current === overrideNum) return;
    lastSyncedRef.current = overrideNum;
    updateClient.mutate({ clientId, fico: overrideNum });
  };

  const tierLabel = effective === null
    ? null
    : effective >= 760 ? "Excellent"
    : effective >= 720 ? "Strong"
    : effective >= 680 ? "Good"
    : effective >= 660 ? "Acceptable"
    : effective >= 620 ? "Subprime"
    : "Below floor";
  const tierTone: ChipTone = effective === null
    ? "mut"
    : effective >= 720 ? "ok"
    : effective >= 660 ? "mut"
    : "warn";

  // Lazy-fetch parsed report only when the details panel is open —
  // keeps the criteria tab cheap on initial render.
  const parsed = useParsedReport(expanded ? credit.data?.id ?? null : null);
  const counts = parsed.data ? {
    tradelines: parsed.data.trade_accounts?.length ?? null,
    inquiries: parsed.data.inquiries?.length ?? null,
    collections: parsed.data.collections?.length ?? null,
    public_records: parsed.data.public_records?.length ?? null,
  } : null;

  return (
    <WorkbenchPanel eyebrow="Borrower" title="Credit">
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 14, alignItems: "center" }}>
        <div>
          <div className="lbl">Effective FICO</div>
          <div className="row">
            <span className="big">{effective ?? "—"}</span>
            {tierLabel ? <CellChip tone={tierTone}>{tierLabel}</CellChip> : null}
          </div>
          <div className="sub">
            {effectiveSource === "override"
              ? "Source: underwriter override"
              : effectiveSource === "pulled"
                ? `Source: iSoftPull · pulled ${ageLabel}`
                : effectiveSource === "manual"
                  ? "Source: borrower record (manual entry)"
                  : "No score on file"}
          </div>
        </div>

        <div style={{ paddingLeft: 14, borderLeft: "1px solid var(--line)" }}>
          <div className="lbl">Underwriter override</div>
          <div className="row">
            <input
              className="field"
              type="number"
              inputMode="numeric"
              value={ficoOverride}
              onChange={(e) => onOverrideChange(e.target.value)}
              onBlur={syncOverrideToClient}
              placeholder={pulled !== null ? String(pulled) : manual !== null ? String(manual) : "Enter score"}
              style={{ width: 110 }}
            />
            <div>
              <div className="sub">
                {pulled !== null
                  ? `iSoftPull: ${pulled}`
                  : "No iSoftPull on file"}
              </div>
              {manual !== null && manual !== pulled ? (
                <div className="sub">Borrower record: {manual}</div>
              ) : null}
              {pulled === null && manual === null ? (
                <div className="sub"><em>Leave blank or enter manually</em></div>
              ) : null}
            </div>
          </div>
          {overrideNum ? (
            <label className="pick mt">
              <input
                type="checkbox"
                checked={syncToBorrower}
                onChange={(e) => setSyncToBorrower(e.target.checked)}
              />
              <span className="sub">
                Also save to borrower record (used across all their loans)
                {updateClient.isPending ? " · saving…" : null}
              </span>
            </label>
          ) : null}
        </div>

        <Btn size="sm" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Hide details" : "Show details"}
        </Btn>
      </div>

      {expanded ? (
        <div className="card mt">
          {credit.isLoading || parsed.isLoading ? (
            <div className="sub">Loading credit details…</div>
          ) : credit.data && parsed.data ? (
            <div className="cg">
              <DetailStat className="s3" label="Tradelines" value={counts?.tradelines} />
              <DetailStat className="s3" label="Recent inquiries" value={counts?.inquiries} />
              <DetailStat className="s3" label="Collections" value={counts?.collections} />
              <DetailStat className="s3" label="Public records" value={counts?.public_records} />
            </div>
          ) : credit.data ? (
            <div className="sub">
              Detailed report not available yet. The score above is still authoritative.
            </div>
          ) : (
            <div className="sub">
              No credit pull on file yet. Run a pull from the Credit tab or set an override above.
            </div>
          )}
        </div>
      ) : null}
    </WorkbenchPanel>
  );
}


function DetailStat({
  label, value, className,
}: {
  label: string;
  value: number | null | undefined;
  className?: string;
}) {
  return (
    <div className={cx("kpi", className)}>
      <div className="lbl">{label}</div>
      <div className="knum num">
        {value === null || value === undefined ? "—" : value}
      </div>
    </div>
  );
}
