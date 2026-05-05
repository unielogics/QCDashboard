"use client";

// Inline-editable HUD-1 line items. Edits go through PATCH /loans/{id}/hud/{lineId}.
// Only operator-team roles can edit; clients see read-only.

import { useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useUpdateHudLine } from "@/hooks/useApi";
import { QC_FMT } from "@/components/design-system/tokens";
import type { HudLine } from "@/lib/types";

interface Props {
  loanId: string;
  lines: HudLine[];
  canEdit: boolean;
}

export function HudPreview({ loanId, lines, canEdit }: Props) {
  const { t } = useTheme();
  const update = useUpdateHudLine();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const total = lines.reduce((s, l) => s + Number(l.amount), 0);

  const commit = (line: HudLine) => {
    const raw = drafts[line.id];
    if (raw == null) return;
    const n = Number(raw);
    if (!Number.isFinite(n) || n === Number(line.amount)) {
      setDrafts((d) => {
        const next = { ...d };
        delete next[line.id];
        return next;
      });
      return;
    }
    update.mutate(
      { loanId, lineId: line.id, amount: n },
      {
        onSuccess: () =>
          setDrafts((d) => {
            const next = { ...d };
            delete next[line.id];
            return next;
          }),
      },
    );
  };

  return (
    <Card pad={0}>
      <div
        style={{
          padding: "12px 16px",
          borderBottom: `1px solid ${t.line}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <SectionLabel>HUD-1 Draft</SectionLabel>
          <Pill>{lines.length} lines</Pill>
        </div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 800,
            color: t.ink,
            fontFeatureSettings: '"tnum"',
          }}
        >
          {QC_FMT.usd(total)}
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "80px minmax(0, 1fr) 130px 100px",
          padding: "10px 16px",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: t.ink3,
          borderBottom: `1px solid ${t.line}`,
          background: t.surface2,
        }}
      >
        <div>Code</div>
        <div>Label</div>
        <div style={{ textAlign: "right" }}>Amount</div>
        <div style={{ textAlign: "right" }}>Category</div>
      </div>
      {lines.length === 0 && (
        <div style={{ padding: 16, fontSize: 13, color: t.ink3 }}>
          No HUD lines yet. They populate when the loan reaches the Closing stage.
        </div>
      )}
      {lines.map((line) => {
        const isEditing = drafts[line.id] != null;
        const editable = canEdit && line.editable;
        return (
          <div
            key={line.id}
            style={{
              display: "grid",
              gridTemplateColumns: "80px minmax(0, 1fr) 130px 100px",
              padding: "10px 16px",
              borderBottom: `1px solid ${t.line}`,
              alignItems: "center",
              fontSize: 13,
              color: t.ink,
            }}
          >
            <div style={{ fontFamily: "ui-monospace, SF Mono, monospace", fontSize: 11, color: t.ink3, fontWeight: 700 }}>
              {line.code}
            </div>
            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {line.label}
            </div>
            <div style={{ textAlign: "right" }}>
              {editable ? (
                <input
                  type="number"
                  step="100"
                  value={isEditing ? drafts[line.id] : Number(line.amount)}
                  onChange={(e) => setDrafts((d) => ({ ...d, [line.id]: e.target.value }))}
                  onBlur={() => commit(line)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") {
                      setDrafts((d) => {
                        const next = { ...d };
                        delete next[line.id];
                        return next;
                      });
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  style={{
                    width: "100%",
                    padding: "4px 8px",
                    borderRadius: 6,
                    background: isEditing ? t.warnBg : t.surface2,
                    border: `1px solid ${isEditing ? t.warn : t.line}`,
                    color: t.ink,
                    fontSize: 13,
                    fontFamily: "inherit",
                    fontFeatureSettings: '"tnum"',
                    textAlign: "right",
                    outline: "none",
                  }}
                />
              ) : (
                <span style={{ fontFeatureSettings: '"tnum"', fontWeight: 600 }}>
                  {QC_FMT.usd(Number(line.amount))}
                </span>
              )}
            </div>
            <div style={{ textAlign: "right" }}>
              <Pill>{line.category}</Pill>
            </div>
          </div>
        );
      })}
      {update.error && (
        <div
          style={{
            padding: "8px 16px",
            background: t.dangerBg,
            color: t.danger,
            fontSize: 11.5,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Icon name="alert" size={12} />
          Save failed: {update.error instanceof Error ? update.error.message : "unknown"}
        </div>
      )}
    </Card>
  );
}
