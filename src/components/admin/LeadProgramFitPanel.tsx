"use client";

// Admin-only, read-only "Program fit" panel on a dealer AI Underwriter Lead —
// shows the deterministic (non-AI) screen across all programs in the
// backend's PROGRAM_LABELS map (app/routers/dealer_ai_intake.py). Never
// shown to the borrower; the AI itself is instructed never to name these
// programs or quote pricing in chat. Purely a re-fetch of a backend-computed
// signal — no admin action required, unlike the Credit panel's request/run
// buttons. Loops generically over data.programs so adding a program on the
// backend (PROGRAM_LABELS + _compute_loan_program_fit) needs no matching
// change here.

import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { useLeadProgramFit } from "@/hooks/useApi";
import type { LeadProgramFitProgram } from "@/lib/types";

// Mirrors the backend's PROGRAM_LABELS (app/routers/dealer_ai_intake.py) —
// keep both in sync when adding a program. Order here drives display order.
const PROGRAM_LABELS: Record<string, string> = {
  sba: "SBA",
  real_estate_backed: "Real-estate-backed",
  reinsurance_backed: "Reinsurance-backed",
  jumbo_dscr: "Jumbo / DSCR",
  term_loan_10_year: "10-Year Term Loan",
  term_loan_3_5_year: "3-5 Year Term Loan",
  term_loan_loc_hybrid: "Term Loan / LOC Hybrid",
  line_of_credit: "Line of Credit",
  equipment_financing: "Equipment Financing",
  merchant_processing: "Merchant Processing",
  transportation_factoring: "Transportation Factoring",
  debt_consulting: "Debt Consulting",
};

export function LeadProgramFitPanel({ intakeId }: { intakeId: string }) {
  const { t } = useTheme();
  const fit = useLeadProgramFit(intakeId);

  if (fit.isLoading) {
    return (
      <Card pad={20}>
        <SectionLabel>Program fit</SectionLabel>
        <span style={{ color: t.ink3, fontSize: 13 }}>Loading program fit…</span>
      </Card>
    );
  }

  const data = fit.data;
  if (!data?.computed) {
    return (
      <Card pad={20}>
        <SectionLabel>Program fit</SectionLabel>
        <span style={{ color: t.ink3, fontSize: 13 }}>Not applicable — this screen is dealer-lead only.</span>
      </Card>
    );
  }

  const programs = data.programs || {};

  return (
    <Card pad={20}>
      <SectionLabel>Program fit</SectionLabel>
      <p style={{ margin: "0 0 12px", color: t.ink2, fontSize: 13, lineHeight: 1.5 }}>
        Deterministic screen computed from uploaded evidence and stated facts — not a lending decision. Never
        surfaced to the borrower; confirm with an underwriter before quoting.
      </p>
      <div style={{ display: "grid", gap: 10 }}>
        {Object.entries(PROGRAM_LABELS).map(([key, label]) => {
          const program = programs[key];
          if (!program) return null;
          return <ProgramRow key={key} t={t} label={label} subtitle={programSubtitle(key, program)} program={program} />;
        })}
      </div>
    </Card>
  );
}

// Program-specific one-line subtitle. Falls back to a generic revenue/DSCR/
// cash-flow/deposits summary for any program without bespoke formatting, so
// a newly-added backend program key never needs a matching branch here.
function programSubtitle(key: string, program: LeadProgramFitProgram): string {
  if (key === "sba") return "Default path — complete enriched baseline";
  if (key === "real_estate_backed") return String(program.note || "");
  if (key === "reinsurance_backed") {
    const parts: string[] = [];
    if (typeof program.rate_percent === "number") parts.push(`Indicative rate ${program.rate_percent}%`);
    else if (program.custom_priced_5mm_plus) parts.push("Custom-priced (≥$5MM)");
    if (typeof program.doc_tier === "string") parts.push(`Docs: ${program.doc_tier.replace(/_/g, " ")}`);
    if (typeof program.maturity_years === "number") parts.push(`${program.maturity_years}-yr maturity`);
    if (program.trading_platform) parts.push(`Platform: ${program.trading_platform}`);
    return parts.join(" · ");
  }
  const parts: string[] = [];
  if (typeof program.revenue === "number") parts.push(`Revenue $${program.revenue.toLocaleString()}`);
  if (typeof program.dscr === "number") parts.push(`DSCR ${program.dscr.toFixed(2)}`);
  if (typeof program.annualized_deposits === "number") parts.push(`Deposits $${program.annualized_deposits.toLocaleString()}`);
  if (typeof program.cash_flow === "number") parts.push(`Cash flow $${program.cash_flow.toLocaleString()}`);
  if (typeof program.estimated_debt_burden === "number") parts.push(`Debt burden $${program.estimated_debt_burden.toLocaleString()}`);
  return parts.join(" · ");
}

function ProgramRow({
  t,
  label,
  subtitle,
  program,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  subtitle: string;
  program: LeadProgramFitProgram | null | undefined;
}) {
  const eligible = Boolean(program?.eligible);
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        border: `1px solid ${t.line}`,
        borderRadius: 10,
        padding: "10px 12px",
        background: t.surface2,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ color: t.ink, fontWeight: 700, fontSize: 13 }}>{label}</div>
        {subtitle ? <div style={{ color: t.ink3, fontSize: 12, marginTop: 2 }}>{subtitle}</div> : null}
      </div>
      <Pill bg={eligible ? t.profitBg : t.surface} color={eligible ? t.profit : t.ink3}>
        {eligible ? "Eligible" : "Not yet eligible"}
      </Pill>
    </div>
  );
}
