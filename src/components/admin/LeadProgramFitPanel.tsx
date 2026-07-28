"use client";

// Admin-only, read-only "Program fit" panel on a dealer AI Underwriter Lead —
// shows the deterministic (non-AI) screen for SBA / real-estate-backed /
// reinsurance-backed / jumbo-DSCR programs. Never shown to the borrower; the
// AI itself is instructed never to name these programs or quote pricing in
// chat. Purely a re-fetch of a backend-computed signal — no admin action
// required, unlike the Credit panel's request/run buttons.

import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { useLeadProgramFit } from "@/hooks/useApi";
import type { LeadProgramFitProgram } from "@/lib/types";

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

  return (
    <Card pad={20}>
      <SectionLabel>Program fit</SectionLabel>
      <p style={{ margin: "0 0 12px", color: t.ink2, fontSize: 13, lineHeight: 1.5 }}>
        Deterministic screen computed from uploaded evidence and stated facts — not a lending decision. Never
        surfaced to the borrower; confirm with an underwriter before quoting.
      </p>
      <div style={{ display: "grid", gap: 10 }}>
        <ProgramRow t={t} label="SBA" subtitle="Default path — complete enriched baseline" program={data.sba} />
        <ProgramRow t={t} label="Real-estate-backed" subtitle={String(data.real_estate_backed?.note || "")} program={data.real_estate_backed} />
        <ProgramRow
          t={t}
          label="Reinsurance-backed"
          subtitle={reinsuranceSubtitle(data.reinsurance_backed)}
          program={data.reinsurance_backed}
        />
        <ProgramRow t={t} label="Jumbo / DSCR" subtitle={jumboSubtitle(data.jumbo_dscr)} program={data.jumbo_dscr} />
      </div>
    </Card>
  );
}

function reinsuranceSubtitle(program: LeadProgramFitProgram | null | undefined): string {
  if (!program) return "";
  const parts: string[] = [];
  if (typeof program.rate_percent === "number") parts.push(`Indicative rate ${program.rate_percent}%`);
  else if (program.custom_priced_5mm_plus) parts.push("Custom-priced (≥$5MM)");
  if (typeof program.doc_tier === "string") parts.push(`Docs: ${program.doc_tier.replace(/_/g, " ")}`);
  if (typeof program.maturity_years === "number") parts.push(`${program.maturity_years}-yr maturity`);
  if (program.trading_platform) parts.push(`Platform: ${program.trading_platform}`);
  return parts.join(" · ");
}

function jumboSubtitle(program: LeadProgramFitProgram | null | undefined): string {
  if (!program) return "";
  const parts: string[] = [];
  if (typeof program.revenue === "number") parts.push(`Revenue $${program.revenue.toLocaleString()}`);
  if (typeof program.dscr === "number") parts.push(`DSCR ${program.dscr.toFixed(2)}`);
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
