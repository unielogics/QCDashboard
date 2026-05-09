"use client";

// Super Admin / UW → Lending AI Settings landing.
// Four tiles: Lending Playbooks · Document Verification · Borrower Follow-Up · Audit Log.

import Link from "next/link";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card } from "@/components/design-system/primitives";
import { LendingAIHeader } from "@/components/LendingAIHeader";

const TILES = [
  {
    href: "/admin/lending-ai/identity",
    title: "AI Identity & Global Rules",
    subtitle: "The AI's name, voice, and the hard rules it follows on every conversation (never quote rates, always identify itself, etc.).",
  },
  {
    href: "/admin/lending-ai/playbooks",
    title: "Lending Playbooks",
    subtitle: "What the AI collects per loan product, organized by stage (Prequal · Term Sheet · Underwriting · Closing).",
  },
  {
    href: "/admin/lending-ai/verification",
    title: "Document Verification",
    subtitle: "What the AI checks on each document type before accepting it.",
  },
  {
    href: "/admin/lending-ai/cadence",
    title: "Borrower Follow-Up",
    subtitle: "When the AI nudges the borrower. Draft-first by default.",
  },
  {
    href: "/admin/lending-ai/audit",
    title: "Audit Log",
    subtitle: "Every AI-behavior-changing event, searchable.",
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
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        gap: 12,
      }}>
        {TILES.map(t2 => (
          <Link key={t2.href} href={t2.href} style={{ textDecoration: "none" }}>
            <Card pad={16}>
              <div style={{ fontSize: 14, fontWeight: 700, color: t.ink, marginBottom: 4 }}>
                {t2.title}
              </div>
              <div style={{ fontSize: 12, color: t.ink3 }}>
                {t2.subtitle}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
