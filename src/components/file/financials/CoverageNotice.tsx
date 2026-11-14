"use client";

// Coverage after the saved terms, in one sentence beside the terms on the
// Underwriting tab: on documented earnings and with the earnings plan. The
// Financials tab works the sentence out from the same cockpit and plan summary
// as its strip and hands it over, so the two tabs cannot print different figures.

import { Btn, Callout } from "@/components/ds";
import { FileWorkspaceLink, useFileWorkspace } from "@/components/file/FileWorkspaceContext";

export type CoverageNoticeValue = { text: string; tone: "ok" | "acc" | "warn" };

export function CoverageNotice({ notice, onOpenPlan }: { notice: CoverageNoticeValue | null | undefined; onOpenPlan?: () => void }) {
  const fileWorkspace = useFileWorkspace();
  if (!notice) return null;
  return (
    <Callout tone={notice.tone}>
      <div className="row" style={{ justifyContent: "space-between", gap: 12, flexWrap: "wrap" }} role="status" aria-label="Coverage after these terms">
        <span>{notice.text}</span>
        {fileWorkspace && !fileWorkspace.pageMode ? (
          <FileWorkspaceLink tool="operating-plan" className="btn sm">Open earnings plan</FileWorkspaceLink>
        ) : onOpenPlan ? (
          <Btn size="sm" onClick={onOpenPlan}>Open earnings plan</Btn>
        ) : null}
      </div>
    </Callout>
  );
}
