"use client";

// AI Follow-Up — Agent's standing-task workspace. The full engine ships in
// P1 (playbooks, agent_document_request stage-gating, auto-send envelope for
// safe reminders). For P0A this is a placeholder page so the sidebar entry
// resolves and Agents can see where the surface is going to live.

import Link from "next/link";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";

export default function AiTasksPage() {
  const { t } = useTheme();
  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionLabel>AI Follow-Up</SectionLabel>
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 16, fontWeight: 700, color: t.ink }}>
            <Icon name="spark" size={18} />
            Standing AI tasks for your book — coming in P1
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: t.ink2 }}>
            This workspace will let you configure standing AI tasks scoped to your leads,
            deals, and borrowers — playbooks like "New Buyer Lead," "Prequalified Buyer,"
            "Under Contract," and "Stale Lead Revival." Each task respects an{" "}
            <code style={{ background: t.chip, padding: "2px 6px", borderRadius: 4 }}>
              ai_send_mode
            </code>{" "}
            so the AI never sends sensitive content without your approval, and prompts
            enforce the firm's compliance policy.
          </div>
          <div style={{ fontSize: 13, color: t.ink3 }}>
            Until then, your Next Best Actions and AI drafts live in the{" "}
            <Link href="/ai-inbox" style={{ color: t.petrol, textDecoration: "none", fontWeight: 600 }}>
              AI Inbox →
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}
