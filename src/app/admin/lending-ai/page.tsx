"use client";

// Super Admin / UW → Lending AI Settings landing.
// Four tiles: Lending Playbooks · Document Verification · Borrower Follow-Up · Audit Log.

import Link from "next/link";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { LendingAIHeader } from "@/components/LendingAIHeader";

interface Tile {
  href: string;
  title: string;
  subtitle: string;
  icon: string;
  outcome: string;
  legacy?: boolean;
}

const TILES: Tile[] = [
  {
    href: "/admin/lending-ai/identity",
    title: "AI Identity & Global Rules",
    subtitle: "The AI's name, voice, and the hard rules it follows on every conversation (never quote rates, always identify itself, etc.).",
    icon: "spark",
    outcome: "Applies to every funding-side AI response.",
  },
  {
    href: "/admin/lending-ai/playbooks",
    title: "Lending Playbooks",
    subtitle: "What the AI collects per loan product, organized by stage (Prequal · Term Sheet · Underwriting · Closing).",
    icon: "layers",
    outcome: "Drives loan requirements, requested documents, and stage blockers.",
  },
  {
    href: "/admin/lending-ai/verification",
    title: "Document Verification",
    subtitle: "What the AI checks on each document type before accepting it.",
    icon: "docCheck",
    outcome: "Controls evidence checks before a document is treated as usable.",
  },
  {
    href: "/admin/lending-ai/cadence",
    title: "Borrower Follow-Up",
    subtitle: "When the AI nudges the borrower. Draft-first by default.",
    icon: "bell",
    outcome: "Creates drafts, underwriter approvals, or follow-up tasks.",
  },
  {
    href: "/admin/lending-ai/audit",
    title: "Audit Log",
    subtitle: "Every AI-behavior-changing event, searchable.",
    icon: "audit",
    outcome: "Shows who changed AI behavior and when.",
  },
  // Legacy items — kept reachable from this umbrella since they
  // belong to the AI/loan domain, but tagged so admins know the
  // canonical home is the new tiles above.
  {
    href: "/settings?section=checklists&from=lending-ai",
    title: "Doc Checklists",
    subtitle: "Per loan-type doc list that pre-populates loans.required_docs at loan creation. The new playbooks (above) drive the AI; this drives the legacy non-AI reminder pipeline.",
    icon: "doc",
    outcome: "Legacy reminder pipeline only.",
    legacy: true,
  },
  {
    href: "/settings?section=cadence&from=lending-ai",
    title: "AI Cadence (preset)",
    subtitle: "Gentle / Standard / Aggressive preset that times the legacy job_doc_reminders. The new Borrower Follow-Up rules (above) drive the AI; this only feeds the older reminder cadence.",
    icon: "sliders",
    outcome: "Legacy timing preset only.",
    legacy: true,
  },
];

export default function LendingAILanding() {
  const { t } = useTheme();
  return (
    <div style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <LendingAIHeader
        title="Lending AI Settings"
        subtitle="Configure what the funding-side AI collects, how it follows up, and what it accepts as verified evidence. Funding-required items agents cannot waive."
        backHref="/settings"
        backLabel="Settings"
      />

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 10,
        marginBottom: 18,
      }}>
        <FlowStep icon="arrowR" label="1. Handoff" body="Agent confirms a buyer is ready. Seller-only work is not sent into lending." />
        <FlowStep icon="layers" label="2. Playbook" body="Funding rules resolve the loan-side facts and documents to collect." />
        <FlowStep icon="cal" label="3. Execution" body="Requested docs get due dates; internal items become AI tasks; follow-ups route through approvals." />
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        gap: 12,
      }}>
        {TILES.map(t2 => (
          <Link key={t2.href} href={t2.href} style={{ textDecoration: "none" }}>
            <Card pad={16} style={{ borderRadius: 8, minHeight: 154 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                marginBottom: 4,
              }}>
                <span style={{ color: t.petrol, display: "inline-flex" }}>
                  <Icon name={t2.icon} size={16} />
                </span>
                <div style={{ fontSize: 14, fontWeight: 700, color: t.ink, flex: 1 }}>
                  {t2.title}
                </div>
                {t2.legacy ? (
                  <span style={{
                    fontSize: 9, fontWeight: 800, padding: "2px 6px",
                    borderRadius: 3, background: t.warnBg, color: t.warn,
                    letterSpacing: 0.5,
                  }}>
                    LEGACY
                  </span>
                ) : null}
              </div>
              <div style={{ fontSize: 12, color: t.ink3 }}>
                {t2.subtitle}
              </div>
              <div style={{
                marginTop: 12,
                paddingTop: 10,
                borderTop: `1px solid ${t.line}`,
                fontSize: 11,
                color: t.ink2,
                fontWeight: 700,
              }}>
                {t2.outcome}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

function FlowStep({ icon, label, body }: { icon: string; label: string; body: string }) {
  const { t } = useTheme();
  return (
    <div style={{
      display: "flex",
      gap: 10,
      padding: 12,
      borderRadius: 8,
      border: `1px solid ${t.line}`,
      background: t.surface2,
    }}>
      <span style={{ color: t.petrol, display: "inline-flex", paddingTop: 1 }}>
        <Icon name={icon} size={16} />
      </span>
      <div>
        <div style={{ fontSize: 12, fontWeight: 800, color: t.ink, marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: 12, color: t.ink3, lineHeight: 1.45 }}>{body}</div>
      </div>
    </div>
  );
}
