"use client";

// Tasks tab — agent-side CRM tasks. Phase 7 lands the AgentTask
// model + full filter chips + AgentTaskModal + AI promotion CTA.
// Phase 2 shows the placeholder so the tab is reachable.

import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/components/design-system/primitives";

export function TasksPanel() {
  const { t } = useTheme();
  return (
    <Card pad={20}>
      <SectionLabel>Agent tasks</SectionLabel>
      <div style={{ marginTop: 8, fontSize: 13, color: t.ink3 }}>
        CRM-style tasks live here: open houses, showings, CMA prep, photography,
        listing prep, follow-ups. Each task can be assigned to you, a teammate,
        or promoted to the AI Follow-Up workbench.
      </div>
      <div style={{ marginTop: 12, fontSize: 11, color: t.ink3, fontStyle: "italic" }}>
        Agent task management lands in Phase 7.
      </div>
    </Card>
  );
}
