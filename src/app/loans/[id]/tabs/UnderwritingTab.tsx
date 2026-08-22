"use client";

// UnderwritingTab — risk model, borrower financials, validation warnings and
// the underwriting metric stack.
//
// Styling lives in globals.css / app-extras.css. The score dial is `.gauge`,
// which is the sheet's own ring-with-a-number-in-it (the arc length is
// data-derived and stays inline); metrics are `.kv` rows.

import { useEffect } from "react";
import { Icon } from "@/components/design-system/Icon";
import { useClient, useRecalc } from "@/hooks/useApi";
import { QC_FMT } from "@/lib/fmt";
import { Callout, Kpi, KpiRow, Panel } from "@/components/ds";
import type { Loan } from "@/lib/types";

// `.gauge` is a 148px square; the ring is drawn to fit it.
const GAUGE = 148;
const R = 62;
const C = 2 * Math.PI * R;

export function UnderwritingTab({ loan }: { loan: Loan }) {
  const recalc = useRecalc();
  const { data: client } = useClient(loan.client_id);

  // Auto-recalc on mount so we can show warnings
  useEffect(() => {
    if (!recalc.data && !recalc.isPending) {
      recalc.mutate({
        loanId: loan.id,
        discount_points: loan.discount_points || 0,
        loan_amount: loan.amount,
        base_rate: loan.base_rate ?? undefined,
        annual_taxes: loan.annual_taxes,
        annual_insurance: loan.annual_insurance,
        monthly_hoa: loan.monthly_hoa,
        term_months: loan.term_months,
        monthly_rent: loan.monthly_rent,
        purpose: loan.purpose,
        arv: loan.arv,
        ltv: loan.ltv ?? undefined,
      });
    }
  }, [loan.id]);

  const score = loan.risk_score ?? 0;
  // Ring colour and arc length are both computed from the score, so both stay
  // at the site. The palette values are the sheet's variables, not a second
  // copy of the numbers.
  const ringColor = score >= 80 ? "var(--ok)" : score >= 70 ? "var(--warn)" : "var(--danger)";
  const dash = `${C * (score / 100)} ${C}`;

  return (
    <div className="cg">
      <Panel className="s6" title="Risk model">
        <div className="row">
          <div className="gauge">
            <svg width={GAUGE} height={GAUGE}>
              <circle cx={GAUGE / 2} cy={GAUGE / 2} r={R} fill="none" stroke="var(--line)" strokeWidth={10} />
              <circle
                cx={GAUGE / 2} cy={GAUGE / 2} r={R} fill="none"
                stroke={ringColor} strokeWidth={10}
                strokeDasharray={dash} strokeLinecap="round"
                transform={`rotate(-90 ${GAUGE / 2} ${GAUGE / 2})`}
              />
            </svg>
            <div className="val">
              <b>{loan.risk_score ?? "—"}</b>
              <span>Risk</span>
            </div>
          </div>
          <div className="grow">
            {score >= 80 ? "Auto-approve eligible. Strong borrower, clean comps." :
              score >= 70 ? "Manual review required." :
                "High-touch UW required. Multiple risk factors detected."}
          </div>
        </div>
      </Panel>

      <Panel className="s6" title="Borrower financials">
        <KpiRow>
          <Kpi label="FICO" value={client?.fico ?? "—"} />
          <Kpi label="Funded total" value={client ? QC_FMT.short(Number(client.funded_total)) : "—"} />
          <Kpi label="Funded count" value={client?.funded_count ?? "—"} />
          <Kpi label="Tier" value={client?.tier ?? "—"} />
        </KpiRow>
      </Panel>

      <Panel className="s6" title="Validation warnings">
        {recalc.isPending && <span className="sub">Running…</span>}
        {recalc.data?.warnings && recalc.data.warnings.length > 0 ? (
          <div className="grid g8">
            {recalc.data.warnings.map((w) => (
              <Callout
                key={w.code}
                tone={w.severity === "block" ? "bad" : "warn"}
                icon={<Icon name="bell" size={14} stroke={2.5} />}
              >
                <div><strong>{w.message}</strong></div>
                <div className="sub mono">{w.code} · {w.severity}</div>
              </Callout>
            ))}
          </div>
        ) : (
          <span className="sub">No validation warnings — clean against lender matrix.</span>
        )}
      </Panel>

      <Panel className="s6" title="Underwriting metrics">
        <KvRow label="LTV" value={loan.ltv ? `${(loan.ltv * 100).toFixed(1)}%` : "—"} />
        {loan.ltc && <KvRow label="LTC" value={`${(loan.ltc * 100).toFixed(1)}%`} />}
        {loan.arv && <KvRow label="ARV" value={QC_FMT.usd(Number(loan.arv))} />}
        <KvRow label="DSCR" value={loan.dscr ? loan.dscr.toFixed(2) : "—"} />
        {loan.monthly_rent && <KvRow label="Monthly rent" value={QC_FMT.usd(Number(loan.monthly_rent))} />}
        <KvRow label="Annual taxes" value={QC_FMT.usd(Number(loan.annual_taxes))} />
        <KvRow label="Annual insurance" value={QC_FMT.usd(Number(loan.annual_insurance))} />
      </Panel>
    </div>
  );
}

function KvRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="kv">
      <span className="lbl">{label}</span>
      <b className="num">{value}</b>
    </div>
  );
}
