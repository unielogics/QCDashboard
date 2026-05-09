"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { QC_FMT } from "@/components/design-system/tokens";
import { useRecalc, useUpdateLoan } from "@/hooks/useApi";
import { LoanPurpose, LoanPurposeOptions } from "@/lib/enums.generated";
import type { Loan } from "@/lib/types";

type Draft = {
  amount: string;
  baseRatePct: string;
  points: string;
  purpose: string;
  termMonths: string;
  arv: string;
  brv: string;
  rehabBudget: string;
  payoff: string;
  monthlyRent: string;
  annualTaxes: string;
  annualInsurance: string;
  monthlyHoa: string;
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
  }, [loan.id]);

  const numbers = useMemo(() => {
    const amount = money(draft.amount);
    const baseRate = pctToRate(draft.baseRatePct);
    const points = number(draft.points);
    const termMonths = intValue(draft.termMonths);
    const arv = optionalMoney(draft.arv);
    const brv = optionalMoney(draft.brv);
    const rehabBudget = optionalMoney(draft.rehabBudget);
    const payoff = optionalMoney(draft.payoff);
    const monthlyRent = optionalMoney(draft.monthlyRent);
    const annualTaxes = money(draft.annualTaxes);
    const annualInsurance = money(draft.annualInsurance);
    const monthlyHoa = money(draft.monthlyHoa);
    return {
      amount,
      baseRate,
      points,
      termMonths,
      arv,
      brv,
      rehabBudget,
      payoff,
      monthlyRent,
      annualTaxes,
      annualInsurance,
      monthlyHoa,
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
        purpose: draft.purpose as LoanPurpose,
        arv: numbers.arv,
        brv: numbers.brv,
        rehab_budget: numbers.rehabBudget,
        payoff: numbers.payoff,
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [
    loan.id,
    draft.purpose,
    numbers.amount,
    numbers.baseRate,
    numbers.points,
    numbers.annualTaxes,
    numbers.annualInsurance,
    numbers.monthlyHoa,
    numbers.arv,
    numbers.brv,
    numbers.rehabBudget,
    numbers.payoff,
  ]);

  const result = recalc.data;
  const sizedAmount = Number(result?.loan_amount ?? numbers.amount ?? loan.amount);
  const finalRate = result?.final_rate ?? loan.final_rate;
  const ltv = result?.sizing?.ltv ?? (numbers.arv ? sizedAmount / numbers.arv : loan.ltv);
  const ltc = result?.sizing?.ltc ?? loan.ltc;
  const hasSizing = !!result?.sizing;

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
        dscr: result?.dscr ?? loan.dscr ?? null,
        purpose: draft.purpose as LoanPurpose,
        term_months: numbers.termMonths,
        arv: numbers.arv,
        ltv,
        ltc,
        monthly_rent: numbers.monthlyRent,
        annual_taxes: numbers.annualTaxes,
        annual_insurance: numbers.annualInsurance,
        monthly_hoa: numbers.monthlyHoa,
      });
      setSaved(true);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save loan criteria.");
    }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 380px", gap: 18 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Card pad={18}>
          <SectionLabel>Loan Criteria</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            <MoneyField label="Requested amount" value={draft.amount} onChange={(value) => setDraftField(setDraft, "amount", value)} />
            <Field label="Base rate">
              <NumberInput suffix="%" value={draft.baseRatePct} onChange={(value) => setDraftField(setDraft, "baseRatePct", value)} />
            </Field>
            <Field label="Discount points">
              <NumberInput value={draft.points} step="0.25" onChange={(value) => setDraftField(setDraft, "points", value)} />
            </Field>
            <Field label="Purpose">
              <select
                value={draft.purpose}
                onChange={(event) => setDraftField(setDraft, "purpose", event.target.value)}
                style={inputStyle(t)}
              >
                {LoanPurposeOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Term months">
              <NumberInput value={draft.termMonths} onChange={(value) => setDraftField(setDraft, "termMonths", value)} />
            </Field>
            <MoneyField label="Payoff" value={draft.payoff} onChange={(value) => setDraftField(setDraft, "payoff", value)} />
          </div>
        </Card>

        <Card pad={18}>
          <SectionLabel>Property, Income, and Sizing Inputs</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            <MoneyField label="ARV / value" value={draft.arv} onChange={(value) => setDraftField(setDraft, "arv", value)} />
            <MoneyField label="BRV / purchase price" value={draft.brv} onChange={(value) => setDraftField(setDraft, "brv", value)} />
            <MoneyField label="Rehab budget" value={draft.rehabBudget} onChange={(value) => setDraftField(setDraft, "rehabBudget", value)} />
            <MoneyField label="Monthly rent" value={draft.monthlyRent} onChange={(value) => setDraftField(setDraft, "monthlyRent", value)} />
            <MoneyField label="Annual taxes" value={draft.annualTaxes} onChange={(value) => setDraftField(setDraft, "annualTaxes", value)} />
            <MoneyField label="Annual insurance" value={draft.annualInsurance} onChange={(value) => setDraftField(setDraft, "annualInsurance", value)} />
            <MoneyField label="Monthly HOA" value={draft.monthlyHoa} onChange={(value) => setDraftField(setDraft, "monthlyHoa", value)} />
          </div>
        </Card>

        <Card pad={18}>
          <SectionLabel>Criteria Notes</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            <CriteriaNote t={t} icon="calc" title="Single math path" body="Pricing, DSCR, HUD totals, and sizing warnings come from the backend recalc endpoint." />
            <CriteriaNote t={t} icon="shield" title="Underwriting prep" body="Save only once the file has a defendable amount, rate basis, purpose, and property value." />
            <CriteriaNote t={t} icon="docCheck" title="Conditions" body="Document conditions stay in Documents and Conditions. This tab controls the numbers." />
          </div>
        </Card>
      </div>

      <Card pad={18}>
        <SectionLabel action={recalc.isPending ? "Calculating..." : "Live backend recalc"}>Approved Terms</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <SummaryMetric t={t} label="Sized loan amount" value={QC_FMT.usd(sizedAmount, 0)} />
          <SummaryMetric t={t} label="Final rate" value={finalRate ? `${(finalRate * 100).toFixed(3)}%` : "Missing"} accent={t.brand} />
          <SummaryMetric t={t} label="Monthly P&I" value={result ? QC_FMT.usd(result.monthly_pi, 0) : "..."} />
          <SummaryMetric
            t={t}
            label="DSCR"
            value={result?.dscr != null ? result.dscr.toFixed(2) : loan.dscr != null ? loan.dscr.toFixed(2) : "N/A"}
            accent={(result?.dscr ?? loan.dscr ?? 0) >= 1.25 ? t.profit : (result?.dscr ?? loan.dscr ?? 0) > 0 ? t.warn : undefined}
          />
          <SummaryMetric t={t} label="Cash to close pricing" value={result ? QC_FMT.usd(result.cash_to_close_pricing, 0) : "..."} />
          <SummaryMetric t={t} label="HUD total" value={result ? QC_FMT.usd(result.hud_total, 0) : "..."} />
        </div>

        <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: t.surface2, border: `1px solid ${t.line}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 12, color: t.ink, fontWeight: 800 }}>Sizing result</div>
              <div style={{ marginTop: 3, fontSize: 12, color: t.ink3 }}>
                {hasSizing
                  ? `${constraintLabel(result.sizing!.binding_constraint)} cap ${QC_FMT.usd(result.sizing!.max_allowed, 0)}`
                  : "No sizing constraint returned for this product."}
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
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
            {result.warnings.map((warning) => (
              <div key={`${warning.code}-${warning.message}`} style={{ display: "flex", gap: 8, padding: "9px 10px", borderRadius: 10, background: t.warnBg, color: t.warn, fontSize: 12.5, fontWeight: 750 }}>
                <Icon name="alert" size={14} />
                {warning.message}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ marginTop: 14, color: t.profit, display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 800 }}>
            <Icon name="check" size={14} />
            No current sizing or pricing warnings.
          </div>
        )}

        {saveError ? <div style={{ marginTop: 12, color: t.danger, fontSize: 12, fontWeight: 800 }}>{saveError}</div> : null}
        {saved ? <div style={{ marginTop: 12, color: t.profit, fontSize: 12, fontWeight: 800 }}>Criteria saved to loan file.</div> : null}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
          <button onClick={() => setDraft(fromLoan(loan))} style={qcBtn(t)}>
            Reset
          </button>
          <button
            onClick={saveCriteria}
            disabled={updateLoan.isPending || !numbers.amount || !numbers.baseRate}
            style={{
              ...qcBtnPrimary(t),
              opacity: updateLoan.isPending || !numbers.amount || !numbers.baseRate ? 0.6 : 1,
              cursor: updateLoan.isPending ? "wait" : "pointer",
            }}
          >
            <Icon name="check" size={13} />
            {updateLoan.isPending ? "Saving..." : "Save Criteria"}
          </button>
        </div>
      </Card>
    </div>
  );
}

function fromLoan(loan: Loan): Draft {
  return {
    amount: rounded(loan.amount),
    baseRatePct: loan.base_rate ? (loan.base_rate * 100).toFixed(3) : "7.000",
    points: String(loan.discount_points ?? 0),
    purpose: loan.purpose ?? LoanPurpose.PURCHASE,
    termMonths: loan.term_months ? String(loan.term_months) : "",
    arv: rounded(loan.arv),
    brv: "",
    rehabBudget: "",
    payoff: "",
    monthlyRent: rounded(loan.monthly_rent),
    annualTaxes: rounded(loan.annual_taxes),
    annualInsurance: rounded(loan.annual_insurance),
    monthlyHoa: rounded(loan.monthly_hoa),
  };
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

function SummaryMetric({
  t,
  label,
  value,
  accent,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div style={{ padding: 12, borderRadius: 12, background: t.surface2, border: `1px solid ${t.line}` }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: t.ink3, letterSpacing: 1.1, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ marginTop: 5, fontSize: 21, fontWeight: 850, color: accent ?? t.ink, fontFeatureSettings: '"tnum"' }}>
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

function CriteriaNote({
  t,
  icon,
  title,
  body,
}: {
  t: ReturnType<typeof useTheme>["t"];
  icon: string;
  title: string;
  body: string;
}) {
  return (
    <div style={{ border: `1px solid ${t.line}`, borderRadius: 12, padding: 13, background: t.surface2 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: t.ink, fontSize: 13, fontWeight: 850 }}>
        <Icon name={icon} size={15} style={{ color: t.petrol }} />
        {title}
      </div>
      <div style={{ marginTop: 8, color: t.ink3, fontSize: 12.3, lineHeight: 1.45 }}>{body}</div>
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
