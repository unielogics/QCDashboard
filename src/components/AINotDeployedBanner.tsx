"use client";

// Renders when the AI Playbooks / Lending AI backend routes 404 —
// i.e. qcbackend hasn't been deployed past commit 6a68467 yet, or
// alembic 0032/0033 haven't run.
//
// Drops every AI config page into a friendly read-only state instead
// of broken loading spinners + retry storms.

import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card } from "@/components/design-system/primitives";

interface Props {
  /** What the user was trying to reach (used in the message). */
  surface: "AI Assistant" | "Lending AI" | "Client AI Plan";
}


export function AINotDeployedBanner({ surface }: Props) {
  const { t } = useTheme();
  return (
    <Card pad={20} style={{
      borderLeft: `3px solid ${t.warn}`,
      background: t.warnBg,
    }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: t.ink, marginBottom: 6 }}>
        ⚠ {surface} backend not deployed yet
      </div>
      <div style={{ fontSize: 13, color: t.ink2, lineHeight: 1.6, marginBottom: 10 }}>
        The configuration endpoints for {surface} aren&apos;t live on the
        production API yet. You&apos;re seeing this banner because the
        frontend is calling routes the backend doesn&apos;t recognize
        (HTTP 404).
      </div>
      <div style={{
        fontSize: 12, color: t.ink3, lineHeight: 1.6,
        background: t.surface, padding: 12, borderRadius: 6,
        border: `1px solid ${t.line}`, fontFamily: "ui-monospace, SF Mono, monospace",
      }}>
        To fix:
        <br />1. Deploy the latest qcbackend commit (Phases 1–7 introduce
        these routes).
        <br />2. SSH to the API host and run:{" "}
        <code style={{ background: t.surface2, padding: "1px 4px", borderRadius: 3 }}>
          alembic upgrade head
        </code>{" "}
        (this creates the playbook tables + seeds platform defaults).
        <br />3. Refresh this page.
      </div>
    </Card>
  );
}
