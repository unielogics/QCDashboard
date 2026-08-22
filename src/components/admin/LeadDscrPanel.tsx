"use client";

// Admin-only, read-only "DSCR potential" panel on a real-estate AI Underwriter
// Lead — the deterministic (non-AI) DSCR/LTV/max-loan math computed by the
// backend (_compute_dscr_potential in app/routers/dealer_ai_intake.py). The
// real-estate counterpart of LeadProgramFitPanel: purely a re-fetch of a
// backend-computed signal, never surfaced to the borrower, and the numbers
// come from arithmetic over stated + document-extracted facts, not the model.

import { CellChip, ItemRow, Lbl, Panel, Row, Sub } from "@/components/ds";
import { useLeadDscrPotential } from "@/hooks/useApi";

function money(value: unknown): string {
  return typeof value === "number" ? `$${Math.round(value).toLocaleString()}` : "—";
}

function pct(value: unknown, digits = 1): string {
  return typeof value === "number" ? `${(value * 100).toFixed(digits)}%` : "—";
}

export function LeadDscrPanel({ intakeId }: { intakeId: string }) {
  const query = useLeadDscrPotential(intakeId);

  if (query.isLoading) {
    return (
      <Panel title="DSCR potential">
        <Sub>Computing DSCR potential…</Sub>
      </Panel>
    );
  }

  const potential = query.data?.potential;
  if (!potential) {
    return (
      <Panel title="DSCR potential">
        <Sub>Not applicable — this screen is real-estate-lead only.</Sub>
      </Panel>
    );
  }

  if (!potential.computed) {
    return (
      <Panel title="DSCR potential">
        <p className="sub mb">
          Not enough facts yet to run the deterministic DSCR screen. Still needed:
        </p>
        <ul className="sub" style={{ paddingLeft: 18 }}>
          {(potential.missing ?? []).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Panel>
    );
  }

  const inputs = potential.inputs ?? {};
  const scenarios = potential.scenarios ?? [];
  const maxLoans = potential.max_loan_at_target_dscr ?? {};
  const requiredRents = potential.required_monthly_rent_at_requested ?? {};
  const dscr = potential.dscr_at_requested;
  // Data-derived tone: the chip colour is chosen from the computed DSCR, not
  // from a fixed variant. Stays a value, but it is a class name, not a style.
  const dscrTone = typeof dscr === "number" ? (dscr >= 1.25 ? "ok" : dscr >= 1.0 ? "mut" : "bad") : "mut";

  return (
    <Panel title="DSCR potential">
      <p className="sub mb">
        Deterministic screen from stated facts and uploaded evidence — assumptions shown below, not a quote.
        Never surfaced to the borrower.
      </p>

      <Row className="mb">
        <CellChip tone={dscrTone}>
          DSCR at requested: {typeof dscr === "number" ? dscr.toFixed(2) : "—"}
        </CellChip>
        <CellChip>LTV: {pct(potential.ltv)}</CellChip>
        <CellChip>Rent: {money(inputs.monthly_rent)}/mo ({String(inputs.monthly_rent_source ?? "")})</CellChip>
        <CellChip>Value: {money(inputs.property_value)}</CellChip>
        <CellChip>Requested: {money(inputs.requested_loan_amount)}</CellChip>
      </Row>

      <div>
        <div className="fldsec">
          <Lbl>DSCR at the requested amount, by rate band</Lbl>
          <div className="grid g6">
            {scenarios.map((row) => (
              <ItemRow
                key={row.annual_rate}
                right={
                  <CellChip tone={typeof row.dscr === "number" && row.dscr >= 1 ? "ok" : "bad"}>
                    DSCR {typeof row.dscr === "number" ? row.dscr.toFixed(2) : "—"}
                  </CellChip>
                }
              >
                {pct(row.annual_rate, 2)} · P&I {money(row.monthly_principal_interest)} · PITIA{" "}
                {money(row.monthly_pitia)}
              </ItemRow>
            ))}
          </div>
        </div>

        <div className="fldsec">
          <Lbl>Max supportable loan by DSCR target</Lbl>
          <div className="grid g6">
            {Object.entries(maxLoans).map(([target, row]) => (
              <ItemRow
                key={target}
                right={
                  <strong>
                    {money(row.max_loan)} ({pct(row.implied_ltv)} LTV)
                  </strong>
                }
              >
                DSCR ≥ {target} — needs rent {money(requiredRents[target])}/mo at the requested amount
              </ItemRow>
            ))}
          </div>
        </div>

        <div className="sub mt">
          Assumptions: {potential.assumptions?.amortization_months ?? 360}-month amortization at{" "}
          {(potential.assumptions?.rate_bands ?? []).map((r) => pct(r, 2)).join(" / ")} · taxes+insurance{" "}
          {money(inputs.monthly_tax_insurance_hoa)}/mo ({String(inputs.tax_insurance_source ?? "")}).{" "}
          {potential.assumptions?.note ?? ""}
        </div>
      </div>
    </Panel>
  );
}
