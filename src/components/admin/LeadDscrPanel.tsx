"use client";

// Admin-only, read-only "DSCR potential" panel on a real-estate AI Underwriter
// Lead — the deterministic (non-AI) DSCR/LTV/max-loan math computed by the
// backend (_compute_dscr_potential in app/routers/dealer_ai_intake.py). The
// real-estate counterpart of LeadProgramFitPanel: purely a re-fetch of a
// backend-computed signal, never surfaced to the borrower, and the numbers
// come from arithmetic over stated + document-extracted facts, not the model.

import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { useLeadDscrPotential } from "@/hooks/useApi";

function money(value: unknown): string {
  return typeof value === "number" ? `$${Math.round(value).toLocaleString()}` : "—";
}

function pct(value: unknown, digits = 1): string {
  return typeof value === "number" ? `${(value * 100).toFixed(digits)}%` : "—";
}

export function LeadDscrPanel({ intakeId }: { intakeId: string }) {
  const { t } = useTheme();
  const query = useLeadDscrPotential(intakeId);

  if (query.isLoading) {
    return (
      <Card pad={20}>
        <SectionLabel>DSCR potential</SectionLabel>
        <span style={{ color: t.ink3, fontSize: 13 }}>Computing DSCR potential…</span>
      </Card>
    );
  }

  const potential = query.data?.potential;
  if (!potential) {
    return (
      <Card pad={20}>
        <SectionLabel>DSCR potential</SectionLabel>
        <span style={{ color: t.ink3, fontSize: 13 }}>Not applicable — this screen is real-estate-lead only.</span>
      </Card>
    );
  }

  if (!potential.computed) {
    return (
      <Card pad={20}>
        <SectionLabel>DSCR potential</SectionLabel>
        <p style={{ margin: "0 0 8px", color: t.ink2, fontSize: 13, lineHeight: 1.5 }}>
          Not enough facts yet to run the deterministic DSCR screen. Still needed:
        </p>
        <ul style={{ margin: 0, paddingLeft: 18, color: t.ink3, fontSize: 13, lineHeight: 1.6 }}>
          {(potential.missing ?? []).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Card>
    );
  }

  const inputs = potential.inputs ?? {};
  const scenarios = potential.scenarios ?? [];
  const maxLoans = potential.max_loan_at_target_dscr ?? {};
  const requiredRents = potential.required_monthly_rent_at_requested ?? {};
  const dscr = potential.dscr_at_requested;
  const dscrTone = typeof dscr === "number" ? (dscr >= 1.25 ? "good" : dscr >= 1.0 ? "mid" : "bad") : "mid";

  return (
    <Card pad={20}>
      <SectionLabel>DSCR potential</SectionLabel>
      <p style={{ margin: "0 0 12px", color: t.ink2, fontSize: 13, lineHeight: 1.5 }}>
        Deterministic screen from stated facts and uploaded evidence — assumptions shown below, not a quote.
        Never surfaced to the borrower.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <Pill
          bg={dscrTone === "good" ? t.profitBg : dscrTone === "bad" ? t.dangerBg : t.surface2}
          color={dscrTone === "good" ? t.profit : dscrTone === "bad" ? t.danger : t.ink2}
        >
          DSCR at requested: {typeof dscr === "number" ? dscr.toFixed(2) : "—"}
        </Pill>
        <Pill bg={t.surface2} color={t.ink2}>LTV: {pct(potential.ltv)}</Pill>
        <Pill bg={t.surface2} color={t.ink2}>Rent: {money(inputs.monthly_rent)}/mo ({String(inputs.monthly_rent_source ?? "")})</Pill>
        <Pill bg={t.surface2} color={t.ink2}>Value: {money(inputs.property_value)}</Pill>
        <Pill bg={t.surface2} color={t.ink2}>Requested: {money(inputs.requested_loan_amount)}</Pill>
      </div>

      <div style={{ display: "grid", gap: 14 }}>
        <div>
          <div style={{ color: t.ink, fontWeight: 700, fontSize: 13, marginBottom: 6 }}>DSCR at the requested amount, by rate band</div>
          <div style={{ display: "grid", gap: 6 }}>
            {scenarios.map((row) => (
              <div
                key={row.annual_rate}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  border: `1px solid ${t.line}`,
                  borderRadius: 10,
                  padding: "8px 12px",
                  background: t.surface2,
                  fontSize: 13,
                }}
              >
                <span style={{ color: t.ink2 }}>{pct(row.annual_rate, 2)} · P&I {money(row.monthly_principal_interest)} · PITIA {money(row.monthly_pitia)}</span>
                <strong style={{ color: typeof row.dscr === "number" && row.dscr >= 1 ? t.profit : t.danger }}>
                  DSCR {typeof row.dscr === "number" ? row.dscr.toFixed(2) : "—"}
                </strong>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={{ color: t.ink, fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Max supportable loan by DSCR target</div>
          <div style={{ display: "grid", gap: 6 }}>
            {Object.entries(maxLoans).map(([target, row]) => (
              <div
                key={target}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  border: `1px solid ${t.line}`,
                  borderRadius: 10,
                  padding: "8px 12px",
                  background: t.surface2,
                  fontSize: 13,
                }}
              >
                <span style={{ color: t.ink2 }}>
                  DSCR ≥ {target} — needs rent {money(requiredRents[target])}/mo at the requested amount
                </span>
                <strong style={{ color: t.ink }}>
                  {money(row.max_loan)} ({pct(row.implied_ltv)} LTV)
                </strong>
              </div>
            ))}
          </div>
        </div>

        <div style={{ color: t.ink3, fontSize: 12, lineHeight: 1.5 }}>
          Assumptions: {potential.assumptions?.amortization_months ?? 360}-month amortization at{" "}
          {(potential.assumptions?.rate_bands ?? []).map((r) => pct(r, 2)).join(" / ")} · taxes+insurance{" "}
          {money(inputs.monthly_tax_insurance_hoa)}/mo ({String(inputs.tax_insurance_source ?? "")}).{" "}
          {potential.assumptions?.note ?? ""}
        </div>
      </div>
    </Card>
  );
}
