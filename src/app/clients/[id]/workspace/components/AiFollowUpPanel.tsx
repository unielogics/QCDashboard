"use client";

// AI Follow-Up tab — drag-drop workbench scoped to the selected
// deal / funding file. Phase 5 mounts DealSecretaryPicker inline
// via WorkspaceAiWorkbench. Phase 2 shows the placeholder + the
// scope selector preview so the tab is reachable.

import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/components/design-system/primitives";
import type { WorkspaceData } from "@/lib/types";

export function AiFollowUpPanel({ data }: { data: WorkspaceData }) {
  const { t } = useTheme();
  return (
    <Card pad={20}>
      <SectionLabel>AI Follow-Up</SectionLabel>
      <div style={{ marginTop: 8, fontSize: 13, color: t.ink3 }}>
        The drag-and-drop AI Workbench mounts here, scoped to the selected deal
        or funding file. Drag a requirement into the AI column to have the AI
        Secretary chase it; drag back to return to manual.
      </div>
      <div style={{ marginTop: 14, padding: 12, borderRadius: 8, background: t.surface2, border: `1px solid ${t.line}` }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: t.ink2 }}>
          {data.ai_summary.outstanding_followups} outstanding follow-up
          {data.ai_summary.outstanding_followups === 1 ? "" : "s"}
        </div>
        {data.ai_summary.next_best_question ? (
          <div style={{ marginTop: 6, fontSize: 13, color: t.ink }}>
            Next: {data.ai_summary.next_best_question}
          </div>
        ) : null}
      </div>
      <div style={{ marginTop: 12, fontSize: 11, color: t.ink3, fontStyle: "italic" }}>
        Inline drag-drop workbench lands in Phase 5. For now use the
        Advanced Workbench link on any funding file card.
      </div>
    </Card>
  );
}
