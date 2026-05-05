"use client";

// Simulator — borrower scenario calculator. Ports qcmobile/app/(tabs)/simulator.tsx
// and adds an "Advanced" toggle that exposes taxes / insurance / HOA / LTV
// overrides, all clamped to the super-admin SimulatorSettings ranges.

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { useLoans, useRecalc, useSettings } from "@/hooks/useApi";
import { QC_FMT } from "@/components/design-system/tokens";
import type { SimulatorSettings } from "@/lib/types";

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

export default function SimulatorPage() {
  const { t } = useTheme();
  const { data: loans = [] } = useLoans();
  const { data: settings } = useSettings();
  const recalc = useRecalc();
  const sim: SimulatorSettings = settings?.data?.simulator ?? DEFAULT_SIM;

  const [activeLoanId, setActiveLoanId] = useState<string | null>(null);
  const [points, setPoints] = useState(0);
  const [advanced, setAdvanced] = useState(false);
  const [loanAmount, setLoanAmount] = useState<number | "">("");
  const [annualTaxes, setAnnualTaxes] = useState<number | "">("");
  const [annualInsurance, setAnnualInsurance] = useState<number | "">("");
  const [monthlyHoa, setMonthlyHoa] = useState<number | "">("");
  const [ltv, setLtv] = useState<number | "">("");

  const activeLoan = useMemo(() => loans.find((l) => l.id === activeLoanId) ?? null, [loans, activeLoanId]);

  // When the active loan changes, seed the advanced inputs from its current values.
  useEffect(() => {
    if (!activeLoan) return;
    setLoanAmount(Number(activeLoan.amount));
    setAnnualTaxes(Number(activeLoan.annual_taxes ?? 0));
    setAnnualInsurance(Number(activeLoan.annual_insurance ?? 0));
    setMonthlyHoa(Number(activeLoan.monthly_hoa ?? 0));
    setLtv(activeLoan.ltv != null ? Number(activeLoan.ltv) : "");
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
    recalc.mutate({
      loanId: activeLoanId,
      discount_points: points,
      ...(advanced && loanAmount !== "" ? { loan_amount: clamp(Number(loanAmount), sim.amount_min, sim.amount_max) } : {}),
      ...(advanced && annualTaxes !== "" ? { annual_taxes: Number(annualTaxes) } : {}),
      ...(advanced && annualInsurance !== "" ? { annual_insurance: Number(annualInsurance) } : {}),
      ...(advanced && monthlyHoa !== "" ? { monthly_hoa: Number(monthlyHoa) } : {}),
      ...(advanced && ltv !== "" && sim.show_ltv_toggle
        ? { ltv: clamp(Number(ltv), sim.ltv_min, sim.ltv_max) }
        : {}),
    });
  };

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: t.ink, letterSpacing: -0.4 }}>Simulate</h1>
          <div style={{ fontSize: 13, color: t.ink3, marginTop: 4 }}>
            Run a what-if against any loan in your pipeline. Operators set the allowed ranges in Settings → Simulator.
          </div>
        </div>
        {sim.advanced_mode_enabled && (
          <button
            onClick={() => setAdvanced((v) => !v)}
            style={{
              ...qcBtn(t),
              background: advanced ? t.ink : t.surface,
              color: advanced ? t.inverse : t.ink2,
              border: advanced ? "none" : `1px solid ${t.lineStrong}`,
            }}
          >
            <Icon name="sliders" size={13} /> {advanced ? "Advanced ON" : "Advanced mode"}
          </button>
        )}
      </div>

      <Card pad={16}>
        <SectionLabel>Pick a loan</SectionLabel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {loans.length === 0 && (
            <div style={{ fontSize: 13, color: t.ink3 }}>No loans available.</div>
          )}
          {loans.map((l) => {
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
          <SectionLabel>Discount points (buy down)</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {pointsOptions.map((p) => {
              const active = points === p;
              return (
                <button
                  key={p}
                  onClick={() => setPoints(p)}
                  style={{
                    ...qcBtn(t),
                    minWidth: 64,
                    justifyContent: "center",
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
          <div style={{ fontSize: 11, color: t.ink3, marginTop: 8 }}>
            Range: {sim.points_min.toFixed(2)} → {sim.points_max.toFixed(2)} (step {sim.points_step.toFixed(2)})
          </div>
        </Card>
      )}

      {activeLoan && advanced && (
        <Card pad={16}>
          <SectionLabel>Advanced inputs</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
            <NumberField
              t={t}
              label={`Loan amount (${QC_FMT.short(sim.amount_min)} – ${QC_FMT.short(sim.amount_max)})`}
              value={loanAmount}
              onChange={setLoanAmount}
              step={sim.amount_step}
              min={sim.amount_min}
              max={sim.amount_max}
            />
            {sim.show_ltv_toggle && (
              <NumberField
                t={t}
                label={`LTV (${(sim.ltv_min * 100).toFixed(0)}% – ${(sim.ltv_max * 100).toFixed(0)}%)`}
                value={ltv}
                onChange={setLtv}
                step={sim.ltv_step}
                min={sim.ltv_min}
                max={sim.ltv_max}
                hint="As a decimal (e.g. 0.75 = 75%)"
              />
            )}
            {sim.show_taxes && (
              <NumberField t={t} label="Annual taxes ($)" value={annualTaxes} onChange={setAnnualTaxes} step={100} min={0} />
            )}
            {sim.show_insurance && (
              <NumberField
                t={t}
                label="Annual insurance ($)"
                value={annualInsurance}
                onChange={setAnnualInsurance}
                step={100}
                min={0}
              />
            )}
            {sim.show_hoa && (
              <NumberField t={t} label="Monthly HOA ($)" value={monthlyHoa} onChange={setMonthlyHoa} step={25} min={0} />
            )}
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

      {recalc.data && (
        <Card pad={20}>
          <SectionLabel>Results</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
            <ResultStat t={t} label="Final rate" value={`${(recalc.data.final_rate * 100).toFixed(3)}%`} />
            <ResultStat t={t} label="Monthly P&I" value={QC_FMT.usd(recalc.data.monthly_pi)} />
            {recalc.data.dscr != null && <ResultStat t={t} label="DSCR" value={recalc.data.dscr.toFixed(2)} />}
            <ResultStat t={t} label="Cash to close" value={QC_FMT.usd(recalc.data.cash_to_close_pricing)} />
            <ResultStat t={t} label="HUD-1 total" value={QC_FMT.usd(recalc.data.hud_total)} />
          </div>
          {recalc.data.warnings && recalc.data.warnings.length > 0 && (
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              {recalc.data.warnings.map((w, i) => {
                const severity = (w.severity ?? "warn") as string;
                const isBlock = severity === "block";
                return (
                  <div
                    key={(w.code ?? `w-${i}`) as string}
                    style={{
                      padding: 10,
                      borderRadius: 9,
                      background: isBlock ? t.dangerBg : t.warnBg,
                      color: isBlock ? t.danger : t.warn,
                      fontSize: 12.5,
                      fontWeight: 700,
                    }}
                  >
                    {(w.message ?? JSON.stringify(w)) as string}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {recalc.error && (
        <Pill bg={t.dangerBg} color={t.danger}>
          {recalc.error instanceof Error ? recalc.error.message : "Recalc failed"}
        </Pill>
      )}
    </div>
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

function NumberField({
  t,
  label,
  value,
  onChange,
  step,
  min,
  max,
  hint,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  value: number | "";
  onChange: (v: number | "") => void;
  step?: number;
  min?: number;
  max?: number;
  hint?: string;
}) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.0, textTransform: "uppercase", marginBottom: 6 }}>
        {label}
      </div>
      <input
        type="number"
        value={value === "" ? "" : value}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") return onChange("");
          const n = Number(raw);
          if (!Number.isFinite(n)) return;
          onChange(n);
        }}
        step={step}
        min={min}
        max={max}
        style={{
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
        }}
      />
      {hint && <div style={{ fontSize: 11, color: t.ink3, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}
