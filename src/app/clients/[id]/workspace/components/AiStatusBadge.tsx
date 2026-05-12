"use client";

// Single source of truth for the AI status chip. Used in the workspace
// header, deal/funding cards, and pipeline cards.

import { useTheme } from "@/components/design-system/ThemeProvider";
import type { WorkspaceAiState } from "@/lib/types";

const LABELS: Record<WorkspaceAiState, string> = {
  deployed: "AI Deployed",
  paused: "AI Paused",
  draft_first: "Draft First",
  human_only: "Human Only",
  idle: "Idle",
};

export function AiStatusBadge({
  state,
  size = "md",
  tooltip,
}: {
  state: WorkspaceAiState;
  size?: "sm" | "md";
  tooltip?: string;
}) {
  const { t } = useTheme();
  const palette = {
    deployed: { bg: t.brandSoft, fg: t.brand },
    paused: { bg: t.surface2, fg: t.ink3 },
    draft_first: { bg: t.surface2, fg: t.ink2 },
    human_only: { bg: t.chip, fg: t.ink2 },
    idle: { bg: t.surface2, fg: t.ink3 },
  } as const;
  const c = palette[state];
  const pad = size === "sm" ? "1px 6px" : "2px 8px";
  const font = size === "sm" ? 10 : 11;
  return (
    <span
      title={tooltip}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: pad,
        borderRadius: 999,
        background: c.bg,
        color: c.fg,
        fontSize: font,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 0.3,
      }}
    >
      {LABELS[state]}
    </span>
  );
}
