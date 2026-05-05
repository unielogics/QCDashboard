"use client";

// Loan-scoped simulator. Pre-loads the loan's terms so the operator can
// run what-ifs in place. Saved scenarios become chips (one click to restore).
// Honors the super-admin SimulatorSettings ranges for sliders/clamps.

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { useDeleteScenario, useRecalc, useSaveScenario, useSettings } from "@/hooks/useApi";
import { QC_FMT } from "@/components/design-system/tokens";
import type { Loan, LoanScenario, SimulatorSettings } from "@/lib/types";

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

interface Props {
  loan: Loan;
  scenarios: LoanScenario[];
}

export function LoanScenarioSimulator({ loan, scenarios }: Props) {
  const { t } = useTheme();
  const recalc = useRecalc();
  const save = useSaveScenario();
  const del = useDeleteScenario();
  const { data: settings } = useSettings();
  const sim: SimulatorSettings = settings?.data?.simulator ?? DEFAULT_SIM;

  // State seeded from the loan's current values.
  const [points, setPoints] = useState(Number(loan.discount_points ?? 0));
  const [amount, setAmount] = useState(Number(loan.amount));
  const [annualTaxes, setAnnualTaxes] = useState(Number(loan.annual_taxes ?? 0));
  const [annualInsurance, setAnnualInsurance] = useState(Number(loan.annual_insurance ?? 0));
  const [monthlyHoa, setMonthlyHoa] = useState(Number(loan.monthly_hoa ?? 0));
  const [ltv, setLtv] = useState<number>(Number(loan.ltv ?? sim.ltv_max));
  const [advanced, setAdvanced] = useState(false);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [scenarioName, setScenarioName] = useState("");

  const pointsOptions = useMemo(() => {
    const out: number[] = [];
    for (let p = sim.points_min; p <= sim.points_max + 1e-9; p += sim.points_step) {
      out.push(+p.toFixed(2));
    }
    return out;
  }, [sim.points_min, sim.points_max, sim.points_step]);

  // Auto-recalc on any input change (debounced by react-query's mutation
  // de-dupe — practical for slider settle).
  useEffect(() => {
    const handle = setTimeout(() => {
      recalc.mutate({
        loanId: loan.id,
        discount_points: points,
        loan_amount: amount,
        ...(advanced ? { annual_taxes: annualTaxes, annual_insurance: annualInsurance, monthly_hoa: monthlyHoa } : {}),
        ...(advanced && sim.show_ltv_toggle ? { ltv } : {}),
      });
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, amount, annualTaxes, annualInsurance, monthlyHoa, ltv, advanced]);

  const restoreScenario = (s: LoanScenario) => {
    setActiveScenarioId(s.id);
    setPoints(Number(s.discount_points));
    if (s.loan_amount != null) setAmount(Number(s.loan_amount));
    if (s.annual_taxes != null) setAnnualTaxes(Number(s.annual_taxes));
    if (s.annual_insurance != null) setAnnualInsurance(Number(s.annual_insurance));
    if (s.monthly_hoa != null) setMonthlyHoa(Number(s.monthly_hoa));
    if (s.ltv != null) {
      setLtv(Number(s.ltv));
      setAdvanced(true);
    }
  };

  const submitSave = async () => {
    if (!scenarioName.trim()) return;
    await save.mutateAsync({
      loanId: loan.id,
      name: scenarioName.trim(),
      discount_points: points,
      loan_amount: amount,
      annual_taxes: advanced ? annualTaxes : null,
      annual_insurance: advanced ? annualInsurance : null,
      monthly_hoa: advanced ? monthlyHoa : null,
      ltv: advanced && sim.show_ltv_toggle ? ltv : null,
    });
    setScenarioName("");
    setSavingName(false);
  };

  return (
    <Card pad={16}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <SectionLabel>Scenario simulator (loan-scoped)</SectionLabel>
        {sim.advanced_mode_enabled && (
          <button
            onClick={() => setAdvanced((v) => !v)}
            style={{
              ...qcBtn(t),
              padding: "5px 10px",
              fontSize: 11.5,
              background: advanced ? t.ink : t.surface,
              color: advanced ? t.inverse : t.ink2,
              border: advanced ? "none" : `1px solid ${t.lineStrong}`,
            }}
          >
            <Icon name="sliders" size={12} /> Advanced {advanced ? "ON" : "OFF"}
          </button>
        )}
      </div>

      {scenarios.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.0, textTransform: "uppercase", marginBottom: 6 }}>
            Saved scenarios
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {scenarios.map((s) => (
              <div
                key={s.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 4px 4px 10px",
                  borderRadius: 999,
                  background: activeScenarioId === s.id ? t.brandSoft : t.surface2,
                  border: `1px solid ${activeScenarioId === s.id ? t.brand : t.line}`,
                  fontSize: 12,
                  color: t.ink,
                }}
              >
                <button
                  onClick={() => restoreScenario(s)}
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  {s.name}
                </button>
                {s.recalc_snapshot?.final_rate != null && (
                  <span style={{ fontSize: 10.5, color: t.ink3, fontFeatureSettings: '"tnum"', marginLeft: 4 }}>
                    {(Number(s.recalc_snapshot.final_rate) * 100).toFixed(2)}%
                  </span>
                )}
                <button
                  onClick={() => del.mutate({ loanId: loan.id, scenarioId: s.id })}
                  aria-label={`Delete ${s.name}`}
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    width: 18,
                    height: 18,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: t.ink4,
                    marginLeft: 2,
                  }}
                >
                  <Icon name="x" size={10} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <FieldLabel t={t} label={`Discount points · ${points.toFixed(2)}`} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {pointsOptions.map((p) => (
            <button
              key={p}
              onClick={() => setPoints(p)}
              style={{
                ...qcBtn(t),
                minWidth: 56,
                justifyContent: "center",
                padding: "5px 8px",
                fontSize: 11.5,
                background: points === p ? t.petrol : t.surface,
                color: points === p ? "#fff" : t.ink2,
                border: points === p ? "none" : `1px solid ${t.lineStrong}`,
                fontFeatureSettings: '"tnum"',
              }}
            >
              {p.toFixed(2)}
            </button>
          ))}
        </div>
      </div>

      <div style={{ height: 12 }} />
      <FieldLabel t={t} label={`Loan amount · ${QC_FMT.usd(amount)}`} />
      <input
        type="range"
        min={sim.amount_min}
        max={sim.amount_max}
        step={sim.amount_step}
        value={amount}
        onChange={(e) => setAmount(Number(e.target.value))}
        style={{ width: "100%", accentColor: t.petrol }}
      />

      {advanced && (
        <>
          {sim.show_ltv_toggle && (
            <>
              <div style={{ height: 12 }} />
              <FieldLabel t={t} label={`LTV · ${(ltv * 100).toFixed(0)}%`} />
              <input
                type="range"
                min={sim.ltv_min}
                max={sim.ltv_max}
                step={sim.ltv_step}
                value={ltv}
                onChange={(e) => setLtv(Number(e.target.value))}
                style={{ width: "100%", accentColor: t.petrol }}
              />
            </>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 12 }}>
            {sim.show_taxes && (
              <NumberInput t={t} label="Annual taxes" value={annualTaxes} onChange={setAnnualTaxes} step={100} />
            )}
            {sim.show_insurance && (
              <NumberInput t={t} label="Annual insurance" value={annualInsurance} onChange={setAnnualInsurance} step={100} />
            )}
            {sim.show_hoa && (
              <NumberInput t={t} label="Monthly HOA" value={monthlyHoa} onChange={setMonthlyHoa} step={25} />
            )}
          </div>
        </>
      )}

      {recalc.data && (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 10,
            background: t.surface2,
            border: `1px solid ${t.line}`,
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr) repeat(2, 1fr)",
            gap: 10,
          }}
        >
          <Stat t={t} label="Final rate" value={`${(recalc.data.final_rate * 100).toFixed(3)}%`} />
          <Stat t={t} label="Monthly P&I" value={QC_FMT.usd(recalc.data.monthly_pi)} />
          {recalc.data.dscr != null ? (
            <Stat t={t} label="DSCR" value={recalc.data.dscr.toFixed(2)} />
          ) : (
            <div />
          )}
          <Stat t={t} label="Cash to close" value={QC_FMT.usd(recalc.data.cash_to_close_pricing)} />
          <Stat t={t} label="HUD-1 total" value={QC_FMT.usd(recalc.data.hud_total)} />
        </div>
      )}

      <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
        {savingName ? (
          <>
            <input
              autoFocus
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitSave();
                if (e.key === "Escape") {
                  setSavingName(false);
                  setScenarioName("");
                }
              }}
              placeholder="Scenario name (e.g. aggressive buydown)"
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                background: t.surface2,
                border: `1px solid ${t.line}`,
                color: t.ink,
                fontSize: 12.5,
                fontFamily: "inherit",
                outline: "none",
                minWidth: 240,
              }}
            />
            <button onClick={submitSave} style={qcBtnPrimary(t)} disabled={!scenarioName.trim() || save.isPending}>
              {save.isPending ? "Saving…" : "Save scenario"}
            </button>
            <button onClick={() => { setSavingName(false); setScenarioName(""); }} style={qcBtn(t)}>
              Cancel
            </button>
          </>
        ) : (
          <button onClick={() => setSavingName(true)} style={qcBtnPrimary(t)}>
            <Icon name="plus" size={12} stroke={2.4} /> Save scenario
          </button>
        )}
      </div>

      {recalc.data?.warnings && recalc.data.warnings.length > 0 && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          {recalc.data.warnings.map((w, i) => (
            <Pill
              key={`${w.code}-${i}`}
              bg={w.severity === "block" ? t.dangerBg : t.warnBg}
              color={w.severity === "block" ? t.danger : t.warn}
            >
              {w.message}
            </Pill>
          ))}
        </div>
      )}
    </Card>
  );
}

function FieldLabel({ t, label }: { t: ReturnType<typeof useTheme>["t"]; label: string }) {
  return (
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
  );
}

function Stat({ t, label, value }: { t: ReturnType<typeof useTheme>["t"]; label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: t.ink3, letterSpacing: 1.0, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 800, color: t.ink, marginTop: 2, fontFeatureSettings: '"tnum"' }}>
        {value}
      </div>
    </div>
  );
}

function NumberInput({
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
    <div>
      <FieldLabel t={t} label={label} />
      <input
        type="number"
        value={value}
        step={step}
        min={0}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        style={{
          width: "100%",
          padding: "8px 10px",
          borderRadius: 8,
          background: t.surface2,
          border: `1px solid ${t.line}`,
          color: t.ink,
          fontSize: 12.5,
          fontFamily: "inherit",
          fontFeatureSettings: '"tnum"',
          outline: "none",
        }}
      />
    </div>
  );
}
