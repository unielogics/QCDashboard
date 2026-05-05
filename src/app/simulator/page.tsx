"use client";

// Standalone Simulator — two modes:
//   - "Free calc"   : punch in the loan parameters; no loan record required
//                     (POST /loans/calc). Default for fresh users.
//   - "From loan"   : pick an existing loan from your pipeline and tweak
//                     its terms (POST /loans/{id}/recalc). Behaves like the
//                     loan-scoped simulator inside the Deal Workspace tab.

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { useFreeCalc, useLoans, useRecalc, useSettings } from "@/hooks/useApi";
import { LoanType, PropertyType } from "@/lib/enums.generated";
import { QC_FMT } from "@/components/design-system/tokens";
import type { RecalcResponse, SimulatorSettings } from "@/lib/types";

const DEFAULT_SIM: SimulatorSettings = {
  points_min: 0,
  points_max: 3,
  points_step: 0.5,
  amount_min: 100_000,
  amount_max: 5_000_000,
  amount_step: 25_000,
  ltv_min: 0.5,
  ltv_max: 0.9,
  ltv_step: 0.05,
  advanced_mode_enabled: true,
  show_taxes: true,
  show_insurance: true,
  show_hoa: true,
  show_ltv_toggle: true,
};

const LOAN_TYPE_OPTIONS: { value: LoanType; label: string }[] = [
  { value: LoanType.DSCR, label: "DSCR Rental (30-yr)" },
  { value: LoanType.FIX_AND_FLIP, label: "Fix & Flip (12-mo)" },
  { value: LoanType.GROUND_UP, label: "Ground Up (18-mo)" },
  { value: LoanType.BRIDGE, label: "Bridge (24-mo)" },
];

type Mode = "free" | "loan";

export default function SimulatorPage() {
  const { t } = useTheme();
  const { data: loans = [] } = useLoans();
  const { data: settings } = useSettings();
  const sim: SimulatorSettings = settings?.data?.simulator ?? DEFAULT_SIM;

  const [mode, setMode] = useState<Mode>("free");

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: t.ink, letterSpacing: -0.4 }}>Simulate</h1>
          <div style={{ fontSize: 13, color: t.ink3, marginTop: 4 }}>
            Run pricing math from scratch or against any loan in your pipeline. Operators set the
            allowed ranges in Settings → Simulator.
          </div>
        </div>
        <div style={{ display: "inline-flex", gap: 4 }}>
          <ModeButton t={t} active={mode === "free"} onClick={() => setMode("free")}>
            <Icon name="calc" size={12} /> Free calculation
          </ModeButton>
          <ModeButton t={t} active={mode === "loan"} onClick={() => setMode("loan")}>
            <Icon name="layers" size={12} /> From a loan
          </ModeButton>
        </div>
      </div>

      {mode === "free" ? <FreeCalcMode t={t} sim={sim} /> : <FromLoanMode t={t} sim={sim} loans={loans} />}
    </div>
  );
}

// ── Free-calc mode (no loan record) ────────────────────────────────────────

function FreeCalcMode({ t, sim }: { t: ReturnType<typeof useTheme>["t"]; sim: SimulatorSettings }) {
  const calc = useFreeCalc();
  const [type, setType] = useState<LoanType>(LoanType.DSCR);
  const [propertyType, setPropertyType] = useState<PropertyType>(PropertyType.SFR);
  const [amount, setAmount] = useState(500_000);
  const [baseRate, setBaseRate] = useState(0.0775);
  const [points, setPoints] = useState(0);
  const [annualTaxes, setAnnualTaxes] = useState(6000);
  const [annualInsurance, setAnnualInsurance] = useState(1800);
  const [monthlyHoa, setMonthlyHoa] = useState(0);
  const [monthlyRent, setMonthlyRent] = useState(4500);

  const isDscr = type === LoanType.DSCR;

  const pointsOptions = useMemo(() => {
    const out: number[] = [];
    for (let p = sim.points_min; p <= sim.points_max + 1e-9; p += sim.points_step) {
      out.push(+p.toFixed(2));
    }
    return out;
  }, [sim.points_min, sim.points_max, sim.points_step]);

  const submit = () => {
    calc.mutate({
      type,
      property_type: propertyType,
      loan_amount: amount,
      base_rate: baseRate,
      discount_points: points,
      annual_taxes: annualTaxes,
      annual_insurance: annualInsurance,
      monthly_hoa: monthlyHoa,
      monthly_rent: isDscr ? monthlyRent : null,
    });
  };

  return (
    <>
      <Card pad={16}>
        <SectionLabel>Loan parameters</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
          <Field t={t} label="Loan type">
            <select value={type} onChange={(e) => setType(e.target.value as LoanType)} style={inputStyle(t)}>
              {LOAN_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field t={t} label="Property type">
            <select
              value={propertyType}
              onChange={(e) => setPropertyType(e.target.value as PropertyType)}
              style={inputStyle(t)}
            >
              <option value={PropertyType.SFR}>Single family</option>
              <option value={PropertyType.UNITS_2_4}>2-4 units</option>
              <option value={PropertyType.UNITS_5_8}>5-8 units</option>
              <option value={PropertyType.MIXED_USE}>Mixed use</option>
              <option value={PropertyType.COMMERCIAL}>Commercial</option>
            </select>
          </Field>
          <Field t={t} label={`Loan amount · ${QC_FMT.usd(amount)}`}>
            <input
              type="range"
              min={sim.amount_min}
              max={sim.amount_max}
              step={sim.amount_step}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              style={{ width: "100%", accentColor: t.petrol }}
            />
          </Field>
          <Field t={t} label={`Base rate · ${(baseRate * 100).toFixed(3)}%`}>
            <input
              type="range"
              min={0.04}
              max={0.15}
              step={0.001}
              value={baseRate}
              onChange={(e) => setBaseRate(Number(e.target.value))}
              style={{ width: "100%", accentColor: t.petrol }}
            />
          </Field>
        </div>

        <div style={{ height: 12 }} />
        <SectionLabel>Discount points</SectionLabel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {pointsOptions.map((p) => {
            const active = points === p;
            return (
              <button
                key={p}
                onClick={() => setPoints(p)}
                style={{
                  ...qcBtn(t),
                  minWidth: 60,
                  justifyContent: "center",
                  padding: "5px 10px",
                  fontSize: 12,
                  background: active ? t.petrol : t.surface,
                  color: active ? "#fff" : t.ink2,
                  border: active ? "none" : `1px solid ${t.lineStrong}`,
                  fontFeatureSettings: '"tnum"',
                }}
              >
                {p.toFixed(2)}
              </button>
            );
          })}
        </div>

        <div style={{ height: 14 }} />
        <SectionLabel>Carrying costs (monthly P&I and DSCR)</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {sim.show_taxes && (
            <NumberField t={t} label="Annual taxes ($)" value={annualTaxes} onChange={setAnnualTaxes} step={100} />
          )}
          {sim.show_insurance && (
            <NumberField t={t} label="Annual insurance ($)" value={annualInsurance} onChange={setAnnualInsurance} step={100} />
          )}
          {sim.show_hoa && (
            <NumberField t={t} label="Monthly HOA ($)" value={monthlyHoa} onChange={setMonthlyHoa} step={25} />
          )}
          {isDscr && (
            <NumberField t={t} label="Monthly rent ($)" value={monthlyRent} onChange={setMonthlyRent} step={50} />
          )}
        </div>
      </Card>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={submit} disabled={calc.isPending} style={qcBtnPrimary(t)}>
          <Icon name="refresh" size={13} /> {calc.isPending ? "Calculating…" : "Calculate"}
        </button>
      </div>

      {calc.error && (
        <Pill bg={t.dangerBg} color={t.danger}>
          {calc.error instanceof Error ? calc.error.message : "Calculation failed"}
        </Pill>
      )}
      {calc.data && <ResultsCard t={t} result={calc.data} />}
    </>
  );
}

// ── From-loan mode (existing pipeline loan) ────────────────────────────────

function FromLoanMode({
  t,
  sim,
  loans,
}: {
  t: ReturnType<typeof useTheme>["t"];
  sim: SimulatorSettings;
  loans: ReturnType<typeof useLoans>["data"];
}) {
  const recalc = useRecalc();
  const [activeLoanId, setActiveLoanId] = useState<string | null>(null);
  const [points, setPoints] = useState(0);

  const activeLoan = useMemo(() => loans?.find((l) => l.id === activeLoanId) ?? null, [loans, activeLoanId]);

  useEffect(() => {
    if (activeLoan) setPoints(Number(activeLoan.discount_points ?? 0));
  }, [activeLoan]);

  const pointsOptions = useMemo(() => {
    const out: number[] = [];
    for (let p = sim.points_min; p <= sim.points_max + 1e-9; p += sim.points_step) {
      out.push(+p.toFixed(2));
    }
    return out;
  }, [sim.points_min, sim.points_max, sim.points_step]);

  const submit = () => {
    if (!activeLoanId) return;
    recalc.mutate({ loanId: activeLoanId, discount_points: points });
  };

  return (
    <>
      <Card pad={16}>
        <SectionLabel>Pick a loan</SectionLabel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {(loans ?? []).length === 0 && (
            <div style={{ fontSize: 13, color: t.ink3 }}>
              No loans yet. Switch to <strong>Free calculation</strong> above, or create one from
              the <strong>Pipeline</strong> page.
            </div>
          )}
          {(loans ?? []).map((l) => {
            const active = activeLoanId === l.id;
            return (
              <button
                key={l.id}
                onClick={() => setActiveLoanId(l.id)}
                style={{
                  ...qcBtn(t),
                  background: active ? t.ink : t.surface,
                  color: active ? t.inverse : t.ink2,
                  border: active ? "none" : `1px solid ${t.lineStrong}`,
                }}
              >
                {l.deal_id} · {l.type.replace("_", " ")}
              </button>
            );
          })}
        </div>
      </Card>

      {activeLoan && (
        <Card pad={16}>
          <SectionLabel>Discount points</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {pointsOptions.map((p) => {
              const active = points === p;
              return (
                <button
                  key={p}
                  onClick={() => setPoints(p)}
                  style={{
                    ...qcBtn(t),
                    minWidth: 60,
                    justifyContent: "center",
                    padding: "5px 10px",
                    fontSize: 12,
                    background: active ? t.petrol : t.surface,
                    color: active ? "#fff" : t.ink2,
                    border: active ? "none" : `1px solid ${t.lineStrong}`,
                    fontFeatureSettings: '"tnum"',
                  }}
                >
                  {p.toFixed(2)}
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {activeLoan && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={submit} disabled={recalc.isPending} style={qcBtnPrimary(t)}>
            <Icon name="refresh" size={13} /> {recalc.isPending ? "Recalculating…" : "Recalculate"}
          </button>
        </div>
      )}

      {recalc.error && (
        <Pill bg={t.dangerBg} color={t.danger}>
          {recalc.error instanceof Error ? recalc.error.message : "Recalc failed"}
        </Pill>
      )}
      {recalc.data && <ResultsCard t={t} result={recalc.data} />}
    </>
  );
}

// ── Shared bits ────────────────────────────────────────────────────────────

function ResultsCard({ t, result }: { t: ReturnType<typeof useTheme>["t"]; result: RecalcResponse }) {
  return (
    <Card pad={20}>
      <SectionLabel>Results</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <ResultStat t={t} label="Final rate" value={`${(result.final_rate * 100).toFixed(3)}%`} />
        <ResultStat t={t} label="Monthly P&I" value={QC_FMT.usd(result.monthly_pi)} />
        {result.dscr != null ? (
          <ResultStat t={t} label="DSCR" value={result.dscr.toFixed(2)} />
        ) : (
          <div />
        )}
        <ResultStat t={t} label="Cash to close" value={QC_FMT.usd(result.cash_to_close_pricing)} />
        <ResultStat t={t} label="HUD-1 total" value={QC_FMT.usd(result.hud_total)} />
      </div>
      {result.warnings && result.warnings.length > 0 && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          {result.warnings.map((w, i) => {
            const isBlock = w.severity === "block";
            return (
              <Pill
                key={(w.code ?? `w-${i}`) as string}
                bg={isBlock ? t.dangerBg : t.warnBg}
                color={isBlock ? t.danger : t.warn}
              >
                {w.message}
              </Pill>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function ModeButton({
  t,
  active,
  onClick,
  children,
}: {
  t: ReturnType<typeof useTheme>["t"];
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        all: "unset",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 14px",
        borderRadius: 9,
        background: active ? t.ink : t.surface,
        color: active ? t.inverse : t.ink2,
        border: active ? "none" : `1px solid ${t.lineStrong}`,
        fontSize: 12.5,
        fontWeight: 700,
      }}
    >
      {children}
    </button>
  );
}

function ResultStat({ t, label, value }: { t: ReturnType<typeof useTheme>["t"]; label: string; value: string }) {
  return (
    <div
      style={{
        background: t.surface2,
        border: `1px solid ${t.line}`,
        borderRadius: 10,
        padding: 14,
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          color: t.ink3,
          letterSpacing: 1.2,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: t.ink, marginTop: 4, fontFeatureSettings: '"tnum"' }}>
        {value}
      </div>
    </div>
  );
}

function Field({ t, label, children }: { t: ReturnType<typeof useTheme>["t"]; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          color: t.ink3,
          letterSpacing: 1.0,
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function NumberField({
  t,
  label,
  value,
  onChange,
  step,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  value: number;
  onChange: (n: number) => void;
  step: number;
}) {
  return (
    <Field t={t} label={label}>
      <input
        type="number"
        value={value}
        step={step}
        min={0}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        style={inputStyle(t)}
      />
    </Field>
  );
}

function inputStyle(t: ReturnType<typeof useTheme>["t"]): React.CSSProperties {
  return {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 9,
    background: t.surface2,
    border: `1px solid ${t.line}`,
    color: t.ink,
    fontSize: 13,
    fontFamily: "inherit",
    outline: "none",
    fontFeatureSettings: '"tnum"',
  };
}
