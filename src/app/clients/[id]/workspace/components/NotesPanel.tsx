"use client";

// Notes tab — extracted from the original inline implementation
// in workspace/page.tsx.

import { useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/components/design-system/primitives";
import { useAddAgentNote } from "@/hooks/useApi";
import type { Client } from "@/lib/types";

export function NotesPanel({ clientId, client }: { clientId: string; client: Client }) {
  const { t } = useTheme();
  const addNote = useAddAgentNote(clientId);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const profile = client.realtor_profile as Record<string, unknown> | null | undefined;
  const facts = ((profile?.known_facts as Array<Record<string, unknown>> | undefined) || []).filter(
    (f) => f.source === "agent",
  );

  async function save() {
    if (!draft.trim()) return;
    setErr(null);
    try {
      await addNote.mutateAsync({ text: draft.trim() });
      setDraft("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save note.");
    }
  }

  return (
    <Card pad={16}>
      <SectionLabel>Agent notes</SectionLabel>
      <div style={{ fontSize: 12, color: t.ink3, margin: "6px 0 14px" }}>
        Free-form notes about this client. Anything you write here flows into the AI&apos;s memory
        on the next chat turn — when you ask the AI about this client tomorrow, it will reference
        these.
      </div>

      <div style={{ marginBottom: 16 }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder='e.g. "Marcus mentioned his preferred lender is Chase. Wants to close before Aug 1."'
          style={{
            width: "100%",
            padding: 10,
            fontSize: 13,
            borderRadius: 8,
            border: `1px solid ${t.line}`,
            background: t.surface,
            color: t.ink,
            fontFamily: "inherit",
            resize: "vertical",
          }}
        />
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
          <button
            onClick={save}
            disabled={!draft.trim() || addNote.isPending}
            style={{
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 6,
              border: "none",
              background: t.brand,
              color: t.inverse,
              cursor: "pointer",
              opacity: draft.trim() && !addNote.isPending ? 1 : 0.5,
            }}
          >
            {addNote.isPending ? "Saving…" : "Save note"}
          </button>
          {err ? <span style={{ fontSize: 12, color: t.danger }}>{err}</span> : null}
        </div>
      </div>

      {facts.length === 0 ? (
        <div style={{ fontSize: 13, color: t.ink3 }}>No notes yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {facts
            .slice()
            .reverse()
            .map((f, i) => (
              <div
                key={i}
                style={{
                  padding: 12,
                  borderRadius: 8,
                  background: t.surface2,
                  border: `1px solid ${t.line}`,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: t.ink3,
                    marginBottom: 4,
                    textTransform: "uppercase",
                  }}
                >
                  {String(f.field || "note")}
                </div>
                <div style={{ fontSize: 13, color: t.ink, whiteSpace: "pre-wrap" }}>
                  {String(f.value || "")}
                </div>
                {f.captured_at ? (
                  <div style={{ fontSize: 11, color: t.ink3, marginTop: 4 }}>
                    {new Date(String(f.captured_at)).toLocaleString()}
                  </div>
                ) : null}
              </div>
            ))}
        </div>
      )}
    </Card>
  );
}
