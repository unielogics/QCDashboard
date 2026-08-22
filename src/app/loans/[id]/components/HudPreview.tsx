"use client";

// Inline-editable HUD-1 line items. Edits go through PATCH /loans/{id}/hud/{lineId}.
// Only operator-team roles can edit; clients see read-only.
//
// Restyled onto the plain-CSS design system. The four-track grid pretending
// to be a table is now a real `<table class="tbl">`, so Code / Label /
// Amount / Category are actual column headers.

import { useState } from "react";
import { CellChip, Empty, Input, Panel, StatusLine, Sub, Table, Td, Tr } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useUpdateHudLine } from "@/hooks/useApi";
import { QC_FMT } from "@/lib/fmt";
import type { HudLine } from "@/lib/types";

interface Props {
  loanId: string;
  lines: HudLine[];
  canEdit: boolean;
}

export function HudPreview({ loanId, lines, canEdit }: Props) {
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
    <Panel
      title="HUD-1 Draft"
      actions={
        <>
          <CellChip>{lines.length} lines</CellChip>
          <strong className="num">{QC_FMT.usd(total)}</strong>
        </>
      }
      noPad
    >
      {lines.length === 0 ? (
        <div className="panel-b">
          <Empty>No HUD lines yet. They populate when the loan reaches the Closing stage.</Empty>
        </div>
      ) : (
        <Table
          caption="HUD-1 draft line items"
          cols={[
            { label: "Code", width: 90 },
            { label: "Label" },
            { label: "Amount", align: "r", width: 140 },
            { label: "Category", align: "r", width: 110 },
          ]}
        >
          {lines.map((line) => {
            const isEditing = drafts[line.id] != null;
            const editable = canEdit && line.editable;
            return (
              <Tr key={line.id}>
                <Td>
                  <code className="mono sub">{line.code}</code>
                </Td>
                <Td className="trunc">{line.label}</Td>
                <Td align="r">
                  {editable ? (
                    <Input
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
                      className="num"
                      aria-label={`${line.label} amount`}
                      // Two things here, both deliberate. Width/alignment are
                      // this cell editor's own geometry. The amber pair is the
                      // UNSAVED marker and DOES override `.field`'s surface —
                      // deliberately, because it is derived from the edit
                      // state, and `.field.bad` is the wrong word for it
                      // (that one means "the requirement engine flagged this").
                      style={
                        isEditing
                          ? {
                              width: "100%",
                              textAlign: "right",
                              background: "var(--warn-tint)",
                              borderColor: "var(--warn)",
                            }
                          : { width: "100%", textAlign: "right" }
                      }
                    />
                  ) : (
                    <span className="num" style={{ fontWeight: 600 }}>
                      {QC_FMT.usd(Number(line.amount))}
                    </span>
                  )}
                </Td>
                <Td align="r">
                  <CellChip>{line.category}</CellChip>
                </Td>
              </Tr>
            );
          })}
        </Table>
      )}
      {update.error && (
        <StatusLine tone="bad">
          <Icon name="alert" size={12} />
          {" "}Save failed: {update.error instanceof Error ? update.error.message : "unknown"}
        </StatusLine>
      )}
    </Panel>
  );
}
