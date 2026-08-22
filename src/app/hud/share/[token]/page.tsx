"use client";

// Public HUD share page — token-resolved, no auth required.
//
// The operator generates a link from a loan's HUD tab and shares it
// with a title / escrow / insurance contact. Opening the URL lets the
// invitee:
//   • see the loan address + their invitation context
//   • add new HUD line items tagged to their share link
//   • edit / delete the lines THEY added (not the operator's)
//
// Everything mounted under /hud/share/* is bare-layout (no AppShell,
// no auth gates) — middleware.ts + AppShell.tsx both opt-out this
// path. The backend validates the token; we just render against it.
//
// Styling only: migrated off the inline `t.*` token objects onto the plain-CSS
// design system. Because this page is bare, `.bareshell` (see AppShell) is the
// only chrome it gets — it supplies the page background and the 100vh floor, so
// nothing here declares either. Everything else is the same vocabulary the
// signed-in console uses, which is the point: an escrow officer with no account
// should see the same product an operator does. Behaviour, endpoints, the
// two-step delete, and the Enter/Escape/blur commit rules are unchanged.

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  Btn,
  Callout,
  Card,
  CellChip,
  IconBtn,
  Input,
  PageHeader,
  Panel,
  Select,
  Table,
  Td,
  Tr,
  type Col,
} from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { api, ApiError } from "@/lib/api";
import { QC_FMT } from "@/components/design-system/tokens";
import { parseUSD } from "@/lib/formCoerce";
import type { HudLine, PublicHudView } from "@/lib/types";

const CATEGORY_OPTIONS = [
  { value: "fixed", label: "Fixed" },
  { value: "variable", label: "Variable" },
  { value: "reserves", label: "Reserves" },
  { value: "third_party", label: "Third party" },
];

const COLS: Col[] = [
  { label: "Item" },
  { label: "Payee" },
  { label: "Category", width: 130 },
  { label: "Amount", align: "r", width: 140 },
  { label: "", width: 56 },
];

export default function PublicHudSharePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;

  const [view, setView] = useState<PublicHudView | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "expired" | "revoked">("loading");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    if (!token) return;
    try {
      const data = await api<PublicHudView>(`/public/hud/${token}`);
      if (data.expired) setStatus("expired");
      else if (data.revoked) setStatus("revoked");
      else setStatus("ready");
      setView(data);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 410) {
          setStatus("expired");
          setError("This link is no longer active.");
        } else if (e.status === 404) {
          setStatus("error");
          setError("Link not found.");
        } else {
          setStatus("error");
          setError(e.message);
        }
      } else {
        setStatus("error");
        setError("Failed to load HUD.");
      }
    }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);

  const addLine = async () => {
    if (!token) return;
    setBusy(true);
    try {
      await api<HudLine>(`/public/hud/${token}/lines`, {
        method: "POST",
        body: JSON.stringify({ label: "New line item", amount: 0, category: "variable", code: "vendor" }),
      });
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const updateLine = async (lineId: string, patch: Partial<HudLine>) => {
    if (!token) return;
    await api<HudLine>(`/public/hud/${token}/lines/${lineId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    await reload();
  };

  const deleteLine = async (lineId: string) => {
    if (!token) return;
    await api<void>(`/public/hud/${token}/lines/${lineId}`, { method: "DELETE" });
    await reload();
  };

  const myLines = useMemo(
    () => view?.lines.filter((l) => l.created_by_share_link_id) ?? [],
    [view],
  );

  const myTotal = useMemo(
    () => myLines.reduce((acc, l) => acc + Number(l.amount || 0), 0),
    [myLines],
  );

  if (status === "loading") {
    return <CenteredCard><span className="sub">Loading…</span></CenteredCard>;
  }
  if (status === "error") {
    return (
      <CenteredCard>
        <h1>Link not active</h1>
        <p className="sub" style={{ marginTop: 8 }}>
          {error || "Could not open the share link. Ask whoever sent it to mint a new one."}
        </p>
      </CenteredCard>
    );
  }
  if (status === "expired" || status === "revoked") {
    return (
      <CenteredCard>
        <h1>Link {status === "revoked" ? "revoked" : "expired"}</h1>
        <p className="sub" style={{ marginTop: 8 }}>
          The party that sent you this link has {status === "revoked" ? "revoked" : "let it expire"}.
          Ask them for a fresh URL.
        </p>
      </CenteredCard>
    );
  }
  if (!view) return null;

  return (
    // Bespoke: a standalone reading column. `.content` is the signed-in shell's
    // measure and this page never mounts inside it.
    <div style={{ padding: "32px 16px" }}>
      <div className="grid" style={{ maxWidth: 900, margin: "0 auto" }}>
        <header>
          <div className="lbl">HUD Submission</div>
          <PageHeader
            title={view.loan_address || "Loan settlement statement"}
            lede={
              `File ${view.loan_label}` +
              (view.invitee_label ? ` · inviting ${view.invitee_label}` : "") +
              (view.invitee_role ? ` · ${view.invitee_role}` : "")
            }
          />
        </header>

        <Callout tone="acc">
          Add the line items you&apos;re responsible for below. Click any field to edit — your changes save
          automatically. The operator who invited you will see everything you submit alongside their own HUD lines.
        </Callout>

        <Panel
          title="Your line items"
          noPad
          actions={
            <>
              <CellChip tone="mut">{myLines.length} entered</CellChip>
              <Btn variant="pri" size="sm" onClick={addLine} disabled={busy}>
                + Add line item
              </Btn>
            </>
          }
        >
          {myLines.length === 0 ? (
            // `.panel-b` supplies the padding the `noPad` panel gave up.
            <div className="panel-b sub" style={{ textAlign: "center" }}>
              Click <strong>Add line item</strong> to start.
            </div>
          ) : (
            <Table cols={COLS} caption="Line items you have entered on this share link">
              {myLines.map((line) => (
                <PublicHudRow
                  key={line.id}
                  line={line}
                  onUpdate={(patch) => updateLine(line.id, patch)}
                  onDelete={() => deleteLine(line.id)}
                />
              ))}
            </Table>
          )}

          {myLines.length > 0 ? (
            // A `.panel-h` in last position is the sheet's footer bar — the
            // rule in app-extras drops its hairline there, and the table's own
            // last-row border already draws the divide.
            <div className="panel-h" style={{ justifyContent: "space-between" }}>
              <b>Your subtotal</b>
              <b className="num">{QC_FMT.usd(myTotal)}</b>
            </div>
          ) : null}
        </Panel>

        <p className="sub" style={{ textAlign: "center", lineHeight: 1.6 }}>
          Powered by Qualified Commercial. The operator who invited you receives all submissions in real time — no
          email back-and-forth needed.
        </p>
      </div>
    </div>
  );
}


function PublicHudRow({
  line, onUpdate, onDelete,
}: {
  line: HudLine;
  onUpdate: (patch: Partial<HudLine>) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <Tr>
      <Td>
        <InlineEdit value={line.label} onCommit={(v) => onUpdate({ label: v })} />
        <div style={{ marginTop: 2 }}>
          <InlineEdit
            value={line.note ?? ""}
            onCommit={(v) => onUpdate({ note: v || null })}
            placeholder="+ note (optional)"
            small
          />
        </div>
      </Td>
      <Td>
        <InlineEdit
          value={line.payee ?? ""}
          onCommit={(v) => onUpdate({ payee: v || null })}
          placeholder="—"
        />
      </Td>
      <Td>
        <Select
          className="sm"
          value={line.category}
          onChange={(e) => onUpdate({ category: e.target.value })}
          aria-label="Category"
        >
          {CATEGORY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
      </Td>
      <Td align="r">
        <CurrencyEdit value={Number(line.amount)} onCommit={(v) => onUpdate({ amount: v })} />
      </Td>
      <Td align="r">
        {confirmDelete ? (
          // `.btn.tone-bad`, not a bare `.c-bad`: `.btn:hover` out-specifies
          // the chip tone and the button would lose its tint exactly when you
          // point at it.
          <Btn
            size="sm"
            className="tone-bad"
            onClick={async () => { await onDelete(); setConfirmDelete(false); }}
          >
            Sure?
          </Btn>
        ) : (
          <IconBtn
            className="danger"
            onClick={() => setConfirmDelete(true)}
            onBlur={() => setConfirmDelete(false)}
            title="Remove this line"
            aria-label="Remove this line"
          >
            <Icon name="x" />
          </IconBtn>
        )}
      </Td>
    </Tr>
  );
}


function InlineEdit({
  value, onCommit, placeholder, small,
}: {
  value: string;
  onCommit: (next: string) => void;
  placeholder?: string;
  small?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (editing) {
    return (
      <Input
        className="sm"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { setEditing(false); if (draft !== value) onCommit(draft); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { setEditing(false); if (draft !== value) onCommit(draft); }
          if (e.key === "Escape") { setEditing(false); setDraft(value); }
        }}
        // `.field.sm` owns the box; width is the one thing it cannot know.
        style={{ width: "100%" }}
      />
    );
  }
  return (
    <span
      onClick={() => { setDraft(value); setEditing(true); }}
      // Click-to-edit text. The colour and the italic are data-derived — they
      // say "this cell is still empty" — and no class carries the affordance.
      style={{
        display: "inline-block",
        padding: "1px 4px",
        borderRadius: 4,
        cursor: "text",
        color: value ? "var(--ink)" : "var(--muted)",
        fontSize: small ? 11 : 12.5,
        fontStyle: value ? "normal" : "italic",
      }}
    >
      {value || placeholder || "—"}
    </span>
  );
}


function CurrencyEdit({ value, onCommit }: { value: number; onCommit: (next: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value === 0 ? "" : String(value));
  if (editing) {
    return (
      <Input
        className="sm num"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          const next = parseUSD(draft);
          if (next != null && next !== value) onCommit(next);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            setEditing(false);
            const next = parseUSD(draft);
            if (next != null && next !== value) onCommit(next);
          }
          if (e.key === "Escape") { setEditing(false); setDraft(String(value)); }
        }}
        // Bespoke: a money field in a right-aligned column types right-to-left.
        style={{ width: "100%", textAlign: "right" }}
      />
    );
  }
  return (
    <span
      className="num"
      onClick={() => { setDraft(value === 0 ? "" : String(value)); setEditing(true); }}
      // Same click-to-edit affordance as InlineEdit; `.num` owns the figures.
      style={{
        display: "inline-block",
        padding: "1px 4px",
        borderRadius: 4,
        cursor: "text",
        fontWeight: 700,
      }}
    >
      {QC_FMT.usd(value)}
    </span>
  );
}


function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    // Bespoke: a single card centred in the viewport. `.bareshell` around this
    // page already paints the background and holds the 100vh floor.
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <Card style={{ maxWidth: 440, width: "100%", textAlign: "center" }}>{children}</Card>
    </div>
  );
}
