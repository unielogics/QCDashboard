"use client";

// StageStepper — visual horizontal stage pipeline at the top of
// /clients/[id]/workspace. Click a stage to advance the client.
// Lost is a terminal escape hatch — gets a separate red button.

import { useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { useUpdateClientStage } from "@/hooks/useApi";
import type { ClientStage } from "@/lib/enums.generated";

interface Props {
  clientId: string;
  currentStage: ClientStage;
}


// Forward path. Lost is rendered separately as a destructive escape.
const FORWARD_STAGES: { value: ClientStage; label: string; sub: string }[] = [
  { value: "lead", label: "Lead", sub: "Just came in" },
  { value: "contacted", label: "Contacted", sub: "First touch made" },
  { value: "verified", label: "Verified", sub: "Discovery done" },
  { value: "ready_for_lending", label: "Ready for Lending", sub: "Handed off" },
  { value: "processing", label: "Processing", sub: "Funding working" },
  { value: "funded", label: "Funded", sub: "Closed" },
];


export function StageStepper({ clientId, currentStage }: Props) {
  const { t } = useTheme();
  const update = useUpdateClientStage();
  const [busy, setBusy] = useState<ClientStage | null>(null);

  const isLost = currentStage === "lost";
  const currentIdx = FORWARD_STAGES.findIndex(s => s.value === currentStage);

  async function go(stage: ClientStage) {
    if (stage === currentStage) return;
    if (FORWARD_STAGES.findIndex(s => s.value === stage) < currentIdx) {
      if (!confirm(`Move backwards from "${currentStage}" to "${stage}"? This is unusual.`)) return;
    }
    setBusy(stage);
    try { await update.mutateAsync({ clientId, stage }); }
    catch { /* swallow */ }
    finally { setBusy(null); }
  }

  return (
    <div style={{
      display: "flex", alignItems: "stretch", gap: 4,
      padding: 6, borderRadius: 12, border: `1px solid ${t.line}`,
      background: t.surface,
      flexWrap: "wrap",
    }}>
      {FORWARD_STAGES.map((s, i) => {
        const isCurrent = currentStage === s.value;
        const isPast = !isLost && i < currentIdx;
        const isPending = busy === s.value;
        return (
          <button
            key={s.value}
            onClick={() => go(s.value)}
            disabled={busy !== null || isLost}
            style={{
              flex: "1 1 110px", minWidth: 110,
              padding: "10px 12px",
              borderRadius: 8, border: "none",
              background:
                isCurrent ? t.brand :
                isPast ? t.profitBg :
                "transparent",
              color:
                isCurrent ? t.inverse :
                isPast ? t.profit :
                t.ink3,
              cursor: busy || isLost ? "default" : "pointer",
              textAlign: "left",
              opacity: isLost && !isCurrent ? 0.4 : 1,
              transition: "background 0.12s ease",
            }}
          >
            <div style={{
              fontSize: 11, fontWeight: 800, letterSpacing: 0.4,
              textTransform: "uppercase",
              opacity: isCurrent ? 1 : 0.85,
            }}>
              {isPast ? "✓ " : ""}{isPending ? "…" : s.label}
            </div>
            <div style={{
              fontSize: 11, marginTop: 2,
              opacity: isCurrent ? 0.85 : 0.7,
            }}>
              {s.sub}
            </div>
          </button>
        );
      })}

      {/* Lost — separate escape hatch */}
      <button
        onClick={() => go("lost")}
        disabled={busy !== null}
        style={{
          padding: "10px 14px",
          borderRadius: 8, border: `1px solid ${isLost ? t.danger : t.line}`,
          background: isLost ? t.danger : "transparent",
          color: isLost ? t.inverse : t.ink3,
          cursor: busy ? "default" : "pointer",
          fontSize: 11, fontWeight: 800, letterSpacing: 0.4,
          textTransform: "uppercase",
          alignSelf: "stretch",
          minWidth: 80,
        }}
      >
        {isLost ? "Lost" : "Mark lost"}
      </button>
    </div>
  );
}
