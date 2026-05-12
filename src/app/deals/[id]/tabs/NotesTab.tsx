"use client";

// Notes tab — private agent notes on the Deal. The handoff visibility
// filter excludes this from baseline_profile_snapshot at promotion,
// so funding never sees it. Pure free-text persisted on
// Deal.notes_text (alembic 0052).

import { useEffect, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useUpdateDealById } from "@/hooks/useApi";
import type { Deal } from "@/lib/types";

export function NotesTab({ deal }: { deal: Deal }) {
  const { t } = useTheme();
  const update = useUpdateDealById();
  const [draft, setDraft] = useState(deal.notes_text ?? "");
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty) setDraft(deal.notes_text ?? "");
  }, [deal.notes_text, dirty]);

  async function save() {
    setErr(null);
    try {
      await update.mutateAsync({
        clientId: deal.client_id,
        dealId: deal.id,
        body: { notes_text: draft.trim() || null },
      });
      setDirty(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save");
    }
  }

  return (
    <Card pad={16}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <SectionLabel>Private notes</SectionLabel>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "1px 6px",
            borderRadius: 4,
            background: t.surface2,
            color: t.ink3,
            textTransform: "uppercase",
            letterSpacing: 0.4,
          }}
        >
          <Icon name="lock" size={9} /> Agent only
        </span>
      </div>
      <div style={{ fontSize: 12, color: t.ink3, marginBottom: 10 }}>
        Free-form notes for your eyes only. Excluded from the funding handoff packet by the
        visibility filter — funding never sees this.
      </div>
      <textarea
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setDirty(true);
        }}
        rows={12}
        placeholder='e.g. "Buyer prefers Westside, will tour Sat. Seller still considering counter-offer at $X. Pre-approval letter pending from Chase."'
        style={{
          width: "100%",
          padding: 12,
          fontSize: 13,
          fontFamily: "inherit",
          borderRadius: 8,
          border: `1px solid ${t.line}`,
          background: t.surface,
          color: t.ink,
          resize: "vertical",
          lineHeight: 1.5,
        }}
      />
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
        <button
          onClick={save}
          disabled={!dirty || update.isPending}
          style={{
            padding: "8px 14px",
            fontSize: 13,
            fontWeight: 700,
            borderRadius: 6,
            border: "none",
            background: t.brand,
            color: t.inverse,
            cursor: "pointer",
            opacity: !dirty || update.isPending ? 0.5 : 1,
          }}
        >
          {update.isPending ? "Saving…" : "Save notes"}
        </button>
        {dirty ? <span style={{ fontSize: 12, color: t.warn }}>Unsaved changes</span> : null}
        {err ? <span style={{ fontSize: 12, color: t.danger }}>{err}</span> : null}
      </div>
    </Card>
  );
}
