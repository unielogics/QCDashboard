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

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useTheme } from "@/components/design-system/ThemeProvider";
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

export default function PublicHudSharePage() {
  const { t } = useTheme();
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
    return <CenteredCard t={t}>Loading…</CenteredCard>;
  }
  if (status === "error") {
    return (
      <CenteredCard t={t}>
        <h1 style={{ fontSize: 18, fontWeight: 900, color: t.ink, marginBottom: 8 }}>Link not active</h1>
        <p style={{ fontSize: 13, color: t.ink3 }}>{error || "Could not open the share link. Ask whoever sent it to mint a new one."}</p>
      </CenteredCard>
    );
  }
  if (status === "expired" || status === "revoked") {
    return (
      <CenteredCard t={t}>
        <h1 style={{ fontSize: 18, fontWeight: 900, color: t.ink, marginBottom: 8 }}>
          Link {status === "revoked" ? "revoked" : "expired"}
        </h1>
        <p style={{ fontSize: 13, color: t.ink3 }}>
          The party that sent you this link has {status === "revoked" ? "revoked" : "let it expire"}.
          Ask them for a fresh URL.
        </p>
      </CenteredCard>
    );
  }
  if (!view) return null;

  return (
    <div style={{ minHeight: "100vh", background: t.bg, padding: "32px 16px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <header style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: t.brand, letterSpacing: 1.2, textTransform: "uppercase" }}>
            HUD Submission
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: t.ink, margin: "4px 0 4px" }}>
            {view.loan_address || "Loan settlement statement"}
          </h1>
          <div style={{ fontSize: 12.5, color: t.ink3 }}>
            File {view.loan_label}
            {view.invitee_label ? ` · inviting ${view.invitee_label}` : ""}
            {view.invitee_role ? ` · ${view.invitee_role}` : ""}
          </div>
        </header>

        <div style={{
          padding: 14,
          marginBottom: 18,
          borderRadius: 10,
          background: t.surface2,
          border: `1px solid ${t.line}`,
          fontSize: 13, color: t.ink2, lineHeight: 1.5,
        }}>
          Add the line items you&apos;re responsible for below. Click any field to edit — your changes save automatically. The operator who invited you will see everything you submit alongside their own HUD lines.
        </div>

        <section style={{
          background: t.surface,
          borderRadius: 12,
          border: `1px solid ${t.line}`,
          overflow: "hidden",
          marginBottom: 18,
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "12px 16px",
            borderBottom: `1px solid ${t.line}`,
          }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: t.ink }}>
              Your line items
            </span>
            <span style={{
              fontSize: 11, fontWeight: 700, color: t.ink3,
              padding: "2px 8px", borderRadius: 999, background: t.surface2,
            }}>
              {myLines.length} entered
            </span>
            <div style={{ flex: 1 }} />
            <button
              onClick={addLine}
              disabled={busy}
              style={{
                padding: "7px 14px",
                borderRadius: 9,
                background: t.brand,
                color: t.inverse,
                border: "none",
                fontSize: 12.5,
                fontWeight: 900,
                cursor: busy ? "wait" : "pointer",
                fontFamily: "inherit",
                opacity: busy ? 0.6 : 1,
              }}
            >
              + Add line item
            </button>
          </div>

          {myLines.length === 0 ? (
            <div style={{ padding: 28, fontSize: 13, color: t.ink3, textAlign: "center" }}>
              Click <strong>Add line item</strong> to start.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: t.surface2 }}>
                  <Th t={t}>Item</Th>
                  <Th t={t}>Payee</Th>
                  <Th t={t} width={130}>Category</Th>
                  <Th t={t} width={140} align="right">Amount</Th>
                  <Th t={t} width={48}>&nbsp;</Th>
                </tr>
              </thead>
              <tbody>
                {myLines.map((line) => (
                  <PublicHudRow
                    key={line.id}
                    line={line}
                    onUpdate={(patch) => updateLine(line.id, patch)}
                    onDelete={() => deleteLine(line.id)}
                  />
                ))}
              </tbody>
            </table>
          )}

          {myLines.length > 0 ? (
            <div style={{
              padding: "12px 16px",
              borderTop: `1px solid ${t.line}`,
              display: "flex", justifyContent: "space-between",
              fontSize: 13, fontWeight: 800, color: t.ink,
            }}>
              <span>Your subtotal</span>
              <span style={{ fontFeatureSettings: '"tnum"' }}>{QC_FMT.usd(myTotal)}</span>
            </div>
          ) : null}
        </section>

        <p style={{ fontSize: 11, color: t.ink3, textAlign: "center", lineHeight: 1.6 }}>
          Powered by Qualified Commercial. The operator who invited you receives all submissions in real time — no email back-and-forth needed.
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
  const { t } = useTheme();
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <tr style={{ borderTop: `1px solid ${t.line}` }}>
      <Td t={t}>
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
      <Td t={t}>
        <InlineEdit
          value={line.payee ?? ""}
          onCommit={(v) => onUpdate({ payee: v || null })}
          placeholder="—"
        />
      </Td>
      <Td t={t}>
        <select
          value={line.category}
          onChange={(e) => onUpdate({ category: e.target.value })}
          style={{
            padding: "5px 8px",
            borderRadius: 6,
            border: `1px solid ${t.line}`,
            background: t.surface,
            color: t.ink,
            fontSize: 12,
            fontFamily: "inherit",
            cursor: "pointer",
          }}
        >
          {CATEGORY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </Td>
      <Td t={t} align="right">
        <CurrencyEdit value={Number(line.amount)} onCommit={(v) => onUpdate({ amount: v })} />
      </Td>
      <Td t={t} align="right">
        {confirmDelete ? (
          <button
            onClick={async () => { await onDelete(); setConfirmDelete(false); }}
            style={{
              background: t.dangerBg, color: t.danger, border: `1px solid ${t.danger}`,
              fontSize: 11, fontWeight: 800, padding: "3px 8px", borderRadius: 6,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Sure?
          </button>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            onBlur={() => setConfirmDelete(false)}
            style={{
              all: "unset", cursor: "pointer", color: t.ink3, fontSize: 18, lineHeight: 1,
              padding: "4px 8px", borderRadius: 6,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = t.danger; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = t.ink3; }}
            title="Remove this line"
          >
            ×
          </button>
        )}
      </Td>
    </tr>
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
  const { t } = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { setEditing(false); if (draft !== value) onCommit(draft); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { setEditing(false); if (draft !== value) onCommit(draft); }
          if (e.key === "Escape") { setEditing(false); setDraft(value); }
        }}
        style={{
          width: "100%",
          padding: "3px 6px",
          borderRadius: 5,
          border: `1px solid ${t.brand}`,
          background: t.surface,
          color: t.ink,
          fontSize: small ? 11 : 12.5,
          fontFamily: "inherit",
          outline: "none",
        }}
      />
    );
  }
  return (
    <span
      onClick={() => { setDraft(value); setEditing(true); }}
      style={{
        display: "inline-block",
        padding: "1px 4px",
        borderRadius: 4,
        cursor: "text",
        color: value ? t.ink : t.ink3,
        fontSize: small ? 11 : 12.5,
        fontStyle: value ? "normal" : "italic",
      }}
    >
      {value || placeholder || "—"}
    </span>
  );
}


function CurrencyEdit({ value, onCommit }: { value: number; onCommit: (next: number) => void }) {
  const { t } = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value === 0 ? "" : String(value));
  if (editing) {
    return (
      <input
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
        style={{
          width: "100%",
          padding: "3px 6px",
          borderRadius: 5,
          border: `1px solid ${t.brand}`,
          background: t.surface,
          color: t.ink,
          fontSize: 12.5,
          textAlign: "right",
          fontFamily: "inherit",
          fontFeatureSettings: '"tnum"',
          outline: "none",
        }}
      />
    );
  }
  return (
    <span
      onClick={() => { setDraft(value === 0 ? "" : String(value)); setEditing(true); }}
      style={{
        display: "inline-block",
        padding: "1px 4px",
        borderRadius: 4,
        cursor: "text",
        color: t.ink,
        fontFeatureSettings: '"tnum"',
        fontWeight: 700,
      }}
    >
      {QC_FMT.usd(value)}
    </span>
  );
}


function Th({
  children, t, width, align,
}: {
  children: React.ReactNode;
  t: ReturnType<typeof useTheme>["t"];
  width?: number;
  align?: "left" | "right" | "center";
}) {
  return (
    <th style={{
      fontSize: 10, fontWeight: 900, letterSpacing: 0.8,
      textTransform: "uppercase", color: t.ink3,
      padding: "10px 12px",
      textAlign: align || "left",
      width,
    }}>
      {children}
    </th>
  );
}


function Td({
  children, t, align,
}: {
  children: React.ReactNode;
  t: ReturnType<typeof useTheme>["t"];
  align?: "left" | "right" | "center";
}) {
  return (
    <td style={{
      padding: "10px 12px",
      textAlign: align || "left",
      verticalAlign: "top",
      color: t.ink,
      fontSize: 12.5,
    }}>
      {children}
    </td>
  );
}


function CenteredCard({ children, t }: { children: React.ReactNode; t: ReturnType<typeof useTheme>["t"] }) {
  return (
    <div style={{
      minHeight: "100vh",
      background: t.bg,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    }}>
      <div style={{
        background: t.surface,
        border: `1px solid ${t.line}`,
        borderRadius: 12,
        padding: 28,
        maxWidth: 440,
        width: "100%",
        textAlign: "center",
      }}>
        {children}
      </div>
    </div>
  );
}
