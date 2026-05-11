"use client";

import { useEffect, useMemo, useState } from "react";
import { Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { QC_FMT } from "@/components/design-system/tokens";
import { useRecalc, useUpdateLoan, useDealWorkspace } from "@/hooks/useApi";
import { LoanPurpose, LoanPurposeOptions } from "@/lib/enums.generated";
import type { Loan } from "@/lib/types";
// LoanScenarioSimulator lives natively on the Criteria tab now — moved
// out of the AI Workspace tab where it had no business being.
import { LoanScenarioSimulator } from "../components/LoanScenarioSimulator";

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
  // Pull saved scenarios for the simulator block at the bottom. The hook
  // is cached per-loan, so this is shared with any other tab that also
  // reads workspace state — no double-fetch penalty.
  const { data: workspace } = useDealWorkspace(loan.id);
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
  const criteriaReady = [
    numbers.amount > 0,
    numbers.baseRate > 0,
    !!draft.purpose,
    numbers.arv != null && numbers.arv > 0,
    loan.type !== "dscr" || (numbers.monthlyRent != null && numbers.monthlyRent > 0),
    numbers.termMonths != null,
    finalRate != null,
    result ? result.warnings.length === 0 : true,
  ].filter(Boolean).length;
  const criteriaCompletion = Math.round((criteriaReady / 8) * 100);

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
            Criteria workbench
          </div>
          <div style={{ marginTop: 4, fontSize: 20, fontWeight: 950, color: t.ink, letterSpacing: 0 }}>
            Build the loan math for underwriting
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
          <WorkbenchPanel eyebrow="Request" title="Product and pricing inputs">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
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
          </WorkbenchPanel>

          <WorkbenchPanel eyebrow="Collateral" title="Value, cost, and income">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
              <MoneyField label="ARV / value" value={draft.arv} onChange={(value) => setDraftField(setDraft, "arv", value)} />
              <MoneyField label="BRV / purchase price" value={draft.brv} onChange={(value) => setDraftField(setDraft, "brv", value)} />
              <MoneyField label="Rehab budget" value={draft.rehabBudget} onChange={(value) => setDraftField(setDraft, "rehabBudget", value)} />
              <MoneyField label="Monthly rent" value={draft.monthlyRent} onChange={(value) => setDraftField(setDraft, "monthlyRent", value)} />
              <MoneyField label="Annual taxes" value={draft.annualTaxes} onChange={(value) => setDraftField(setDraft, "annualTaxes", value)} />
              <MoneyField label="Annual insurance" value={draft.annualInsurance} onChange={(value) => setDraftField(setDraft, "annualInsurance", value)} />
              <MoneyField label="Monthly HOA" value={draft.monthlyHoa} onChange={(value) => setDraftField(setDraft, "monthlyHoa", value)} />
            </div>
          </WorkbenchPanel>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
            <RuleTile icon="calc" label="Math path" value={recalc.isPending ? "Calculating" : "Backend recalc"} />
            <RuleTile icon="shield" label="Warnings" value={result?.warnings.length ? `${result.warnings.length} open` : "Clear"} tone={result?.warnings.length ? "watch" : "ready"} />
            <RuleTile icon="docCheck" label="Save state" value={saved ? "Saved" : saveError ? "Error" : "Unsaved edits"} tone={saved ? "ready" : saveError ? "danger" : "neutral"} />
          </div>
        </div>

        <WorkbenchPanel eyebrow="Live terms" title="Underwriting output" action={recalc.isPending ? "Calculating" : "Live"}>
          <div style={{ padding: 14, borderRadius: 14, background: t.brandSoft, border: `1px solid ${t.lineStrong}` }}>
            <div style={{ fontSize: 10.5, fontWeight: 900, color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase" }}>Sized loan amount</div>
            <div style={{ marginTop: 5, fontSize: 32, fontWeight: 950, color: t.brand, fontFeatureSettings: '"tnum"', letterSpacing: 0 }}>
              {QC_FMT.usd(sizedAmount, 0)}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginTop: 10 }}>
            <ResultMetric label="Final rate" value={finalRate ? `${(finalRate * 100).toFixed(3)}%` : "Missing"} tone={finalRate ? "neutral" : "watch"} />
            <ResultMetric label="Monthly P&I" value={result ? QC_FMT.usd(result.monthly_pi, 0) : "..."} />
            <ResultMetric label="DSCR" value={result?.dscr != null ? result.dscr.toFixed(2) : loan.dscr != null ? loan.dscr.toFixed(2) : "N/A"} tone={(result?.dscr ?? loan.dscr ?? 0) >= 1.25 ? "ready" : (result?.dscr ?? loan.dscr ?? 0) > 0 ? "watch" : "neutral"} />
            <ResultMetric label="HUD total" value={result ? QC_FMT.usd(result.hud_total, 0) : "..."} />
          </div>

          <div style={{ marginTop: 12, padding: 12, borderRadius: 13, background: t.surface2, border: `1px solid ${t.line}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 12, color: t.ink, fontWeight: 900 }}>Sizing result</div>
                <div style={{ marginTop: 3, fontSize: 11.5, color: t.ink3, textTransform: "capitalize" }}>
                  {hasSizing
                    ? `${constraintLabel(result.sizing!.binding_constraint)} cap ${QC_FMT.usd(result.sizing!.max_allowed, 0)}`
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

      {/* Scenario simulator — moved here from the old AI Workspace tab.
          Sits at the bottom of Criteria so operators can sweep what-if
          scenarios against the saved baseline above. */}
      {workspace?.scenarios ? (
        <LoanScenarioSimulator loan={loan} scenarios={workspace.scenarios} />
      ) : null}
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

function WorkbenchPanel({
  eyebrow,
  title,
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  action?: string;
  children: React.ReactNode;
}) {
  const { t } = useTheme();
  return (
    <section style={{ border: `1px solid ${t.line}`, borderRadius: 16, background: t.surface, boxShadow: t.shadow, padding: 16, minWidth: 0 }}>
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
