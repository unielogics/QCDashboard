"use client";

// HudTab — editable HUD settlement statement.
//
// Replaces the read-only Hud1Tab. Now a real table:
//   • Operator can add / edit / delete line items
//   • Inline edit on label / payee / amount / category / note
//   • "Share" opens a modal that mints a public token + URL the
//     operator can drop on title / escrow / insurance contacts so they
//     can fill their own line items without an account.
//   • Active share links are listed with revoke + last-used info.
//
// Totals + categorization rolled up at the bottom.

import { useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, SectionLabel, Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { QC_FMT } from "@/components/design-system/tokens";
import {
  useCreateHudLine,
  useCreateHudShareLink,
  useDeleteHudLine,
  useHudLines,
  useHudShareLinks,
  useRevokeHudShareLink,
  useUpdateHudLine,
} from "@/hooks/useApi";
import type { HudLine, HudShareLink, Loan } from "@/lib/types";
import { parseUSD } from "@/lib/formCoerce";

const CATEGORY_OPTIONS = [
  { value: "fixed", label: "Fixed" },
  { value: "variable", label: "Variable" },
  { value: "reserves", label: "Reserves" },
  { value: "third_party", label: "Third party" },
];

export function HudTab({ loan }: { loan: Loan }) {
  const { t } = useTheme();
  const { data: lines = [], isLoading } = useHudLines(loan.id);
  const create = useCreateHudLine(loan.id);
  const update = useUpdateHudLine();
  const remove = useDeleteHudLine(loan.id);
  const [shareOpen, setShareOpen] = useState(false);

  const total = useMemo(() => lines.reduce((acc, l) => acc + Number(l.amount || 0), 0), [lines]);
  const fixedTotal = lines.filter((l) => l.category === "fixed").reduce((a, l) => a + Number(l.amount || 0), 0);
  const variableTotal = lines.filter((l) => l.category === "variable").reduce((a, l) => a + Number(l.amount || 0), 0);
  const reservesTotal = lines.filter((l) => l.category === "reserves").reduce((a, l) => a + Number(l.amount || 0), 0);
  const thirdPartyTotal = lines.filter((l) => l.category === "third_party").reduce((a, l) => a + Number(l.amount || 0), 0);

  const addNewLine = async () => {
    await create.mutateAsync({
      label: "New line item",
      amount: 0,
      category: "variable",
      code: "custom",
    });
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 18 }}>
      <Card pad={0}>
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 16px", borderBottom: `1px solid ${t.line}`,
        }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: t.ink }}>
            HUD Settlement Statement
          </span>
          <Pill bg={t.surface2} color={t.ink3}>{lines.length} line{lines.length === 1 ? "" : "s"}</Pill>
          <div style={{ flex: 1 }} />
          <button onClick={() => setShareOpen(true)} style={qcBtn(t)}>
            <Icon name="send" size={12} /> Share / invite
          </button>
          <button onClick={addNewLine} disabled={create.isPending} style={qcBtnPrimary(t)}>
            <Icon name="add" size={12} /> Add row
          </button>
        </div>

        {isLoading ? (
          <div style={{ padding: 24, fontSize: 13, color: t.ink3 }}>Loading HUD lines…</div>
        ) : lines.length === 0 ? (
          <div style={{ padding: 24, fontSize: 13, color: t.ink3 }}>
            No HUD lines yet. Click <strong>Add row</strong> to start, or use <strong>Share / invite</strong> to let a title / escrow / insurance contact fill theirs in.
          </div>
        ) : (
          <HudTable
            lines={lines}
            onUpdate={(lineId, patch) => update.mutate({ loanId: loan.id, lineId, ...patch })}
            onDelete={(lineId) => remove.mutate(lineId)}
          />
        )}
      </Card>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Card pad={16}>
          <SectionLabel>Totals</SectionLabel>
          <SumRow label="Fixed costs" value={fixedTotal} t={t} />
          <SumRow label="Variable" value={variableTotal} t={t} />
          <SumRow label="Reserves" value={reservesTotal} t={t} />
          <SumRow label="Third-party" value={thirdPartyTotal} t={t} />
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `2px solid ${t.line}` }}>
            <SumRow label="Total fees + reserves" value={total} t={t} bold />
          </div>
        </Card>

        <ShareLinksCard loanId={loan.id} />
      </div>

      {shareOpen ? (
        <ShareLinkModal
          loanId={loan.id}
          onClose={() => setShareOpen(false)}
        />
      ) : null}
    </div>
  );
}


function HudTable({
  lines, onUpdate, onDelete,
}: {
  lines: HudLine[];
  onUpdate: (lineId: string, patch: Partial<HudLine>) => void;
  onDelete: (lineId: string) => void;
}) {
  const { t } = useTheme();
  return (
    <div style={{ overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead>
          <tr style={{ background: t.surface2 }}>
            <Th t={t} width={140}>Code</Th>
            <Th t={t}>Item</Th>
            <Th t={t} width={180}>Payee</Th>
            <Th t={t} width={140}>Category</Th>
            <Th t={t} width={140} align="right">Amount</Th>
            <Th t={t} width={48}>&nbsp;</Th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <HudRow
              key={line.id}
              line={line}
              onUpdate={(patch) => onUpdate(line.id, patch)}
              onDelete={() => onDelete(line.id)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}


function HudRow({
  line, onUpdate, onDelete,
}: {
  line: HudLine;
  onUpdate: (patch: Partial<HudLine>) => void;
  onDelete: () => void;
}) {
  const { t } = useTheme();
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <tr style={{ borderTop: `1px solid ${t.line}` }}>
      <Td t={t}>
        <span style={{
          fontSize: 10, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase",
          padding: "2px 6px", borderRadius: 4,
          background: t.chip, color: t.ink3,
        }}>
          {line.code}
        </span>
        {line.created_by_share_link_id ? (
          <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: t.brand }} title="Added via share link">↩ shared</span>
        ) : null}
      </Td>
      <Td t={t}>
        <InlineEdit
          value={line.label}
          editable={line.editable}
          onCommit={(v) => onUpdate({ label: v })}
        />
        {line.note ? (
          <div style={{ marginTop: 2, fontSize: 11, color: t.ink3, fontStyle: "italic" }}>
            <InlineEdit
              value={line.note ?? ""}
              editable={line.editable}
              onCommit={(v) => onUpdate({ note: v || null })}
              placeholder="(no note — click to add)"
            />
          </div>
        ) : (
          <div style={{ marginTop: 2 }}>
            <InlineEdit
              value=""
              editable={line.editable}
              onCommit={(v) => onUpdate({ note: v || null })}
              placeholder="+ note"
            />
          </div>
        )}
      </Td>
      <Td t={t}>
        <InlineEdit
          value={line.payee ?? ""}
          editable={line.editable}
          onCommit={(v) => onUpdate({ payee: v || null })}
          placeholder="—"
        />
      </Td>
      <Td t={t}>
        <select
          value={line.category}
          disabled={!line.editable}
          onChange={(e) => onUpdate({ category: e.target.value })}
          style={{
            padding: "5px 7px",
            borderRadius: 6,
            border: `1px solid ${t.line}`,
            background: t.surface,
            color: t.ink,
            fontSize: 12,
            fontFamily: "inherit",
            cursor: line.editable ? "pointer" : "not-allowed",
          }}
        >
          {CATEGORY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </Td>
      <Td t={t} align="right">
        <CurrencyEdit
          value={Number(line.amount)}
          editable={line.editable}
          onCommit={(v) => onUpdate({ amount: v })}
        />
      </Td>
      <Td t={t} align="right">
        {line.editable ? (
          confirmDelete ? (
            <button
              onClick={() => { onDelete(); setConfirmDelete(false); }}
              style={{
                background: t.dangerBg, color: t.danger, border: `1px solid ${t.danger}`,
                fontSize: 11, fontWeight: 800, padding: "3px 8px", borderRadius: 6,
                cursor: "pointer", fontFamily: "inherit",
              }}
              title="Click again to confirm"
            >
              Sure?
            </button>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              onBlur={() => setConfirmDelete(false)}
              style={{
                all: "unset", cursor: "pointer", color: t.ink3, fontSize: 16, lineHeight: 1,
                padding: "4px 8px", borderRadius: 6,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = t.danger; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = t.ink3; }}
              title="Remove this line"
            >
              ×
            </button>
          )
        ) : (
          <span title="Locked line" style={{ color: t.ink3, fontSize: 10 }}>🔒</span>
        )}
      </Td>
    </tr>
  );
}


function InlineEdit({
  value, editable, onCommit, placeholder,
}: {
  value: string;
  editable: boolean;
  onCommit: (next: string) => void;
  placeholder?: string;
}) {
  const { t } = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (!editable) {
    return <span style={{ color: t.ink2 }}>{value || placeholder || "—"}</span>;
  }
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
          fontSize: 12.5,
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
        minHeight: 18,
        padding: "1px 4px",
        borderRadius: 4,
        cursor: "text",
        color: value ? t.ink : t.ink3,
        fontStyle: value ? "normal" : "italic",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = t.surface2; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      {value || placeholder || "—"}
    </span>
  );
}


function CurrencyEdit({
  value, editable, onCommit,
}: {
  value: number;
  editable: boolean;
  onCommit: (next: number) => void;
}) {
  const { t } = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value === 0 ? "" : String(value));
  if (!editable) {
    return <span style={{ color: t.ink2, fontFeatureSettings: '"tnum"' }}>{QC_FMT.usd(value)}</span>;
  }
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
      onMouseEnter={(e) => { e.currentTarget.style.background = t.surface2; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
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
      padding: "9px 10px",
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
      padding: "8px 10px",
      textAlign: align || "left",
      verticalAlign: "top",
      color: t.ink,
      fontSize: 12.5,
    }}>
      {children}
    </td>
  );
}


function SumRow({ label, value, t, bold }: { label: string; value: number; t: ReturnType<typeof useTheme>["t"]; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
      <span style={{ fontSize: 12.5, color: bold ? t.ink : t.ink2, fontWeight: bold ? 800 : 600 }}>{label}</span>
      <span style={{
        fontSize: bold ? 16 : 13,
        fontWeight: bold ? 900 : 700,
        color: t.ink,
        fontFeatureSettings: '"tnum"',
      }}>
        {QC_FMT.usd(value)}
      </span>
    </div>
  );
}


// ── Share links ────────────────────────────────────────────────────────


function ShareLinksCard({ loanId }: { loanId: string }) {
  const { t } = useTheme();
  const { data: shares = [], isLoading } = useHudShareLinks(loanId);
  const revoke = useRevokeHudShareLink(loanId);
  const active = shares.filter((s) => !s.revoked_at);

  if (isLoading) {
    return (
      <Card pad={16}>
        <SectionLabel>Share links</SectionLabel>
        <div style={{ fontSize: 12, color: t.ink3 }}>Loading…</div>
      </Card>
    );
  }
  if (active.length === 0) return null;

  return (
    <Card pad={16}>
      <SectionLabel>Active share links</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {active.map((s) => (
          <ShareLinkRow
            key={s.id}
            share={s}
            onRevoke={() => revoke.mutate(s.id)}
          />
        ))}
      </div>
    </Card>
  );
}


function ShareLinkRow({ share, onRevoke }: { share: HudShareLink; onRevoke: () => void }) {
  const { t } = useTheme();
  const [copied, setCopied] = useState(false);
  const url = `${typeof window !== "undefined" ? window.location.origin : ""}/hud/share/${share.token}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore — fall back to manual select
    }
  };

  return (
    <div style={{
      padding: 10,
      borderRadius: 9,
      border: `1px solid ${t.line}`,
      background: t.surface2,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: t.ink, flex: 1 }}>
          {share.label || share.invitee_email || share.invitee_role || "Untitled link"}
        </span>
        <button
          onClick={onRevoke}
          title="Revoke this link"
          style={{
            all: "unset", cursor: "pointer",
            padding: "2px 6px", borderRadius: 4,
            color: t.ink3, fontSize: 11, fontWeight: 700,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = t.danger; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = t.ink3; }}
        >
          Revoke
        </button>
      </div>
      {share.invitee_role || share.invitee_email ? (
        <div style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>
          {share.invitee_role || "—"}{share.invitee_email ? ` · ${share.invitee_email}` : ""}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          style={{
            flex: 1,
            padding: "4px 7px",
            borderRadius: 5,
            border: `1px solid ${t.line}`,
            background: t.surface,
            color: t.ink2,
            fontSize: 11,
            fontFamily: "ui-monospace, SF Mono, monospace",
            outline: "none",
          }}
        />
        <button
          onClick={copy}
          style={{
            padding: "4px 10px",
            borderRadius: 5,
            background: copied ? t.profitBg : t.surface,
            color: copied ? t.profit : t.ink2,
            border: `1px solid ${t.line}`,
            fontSize: 11, fontWeight: 800,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {share.last_used_at ? (
        <div style={{ fontSize: 10, color: t.ink3, marginTop: 4 }}>
          Last used {new Date(share.last_used_at).toLocaleString()}
        </div>
      ) : (
        <div style={{ fontSize: 10, color: t.ink3, marginTop: 4 }}>Not opened yet</div>
      )}
    </div>
  );
}


function ShareLinkModal({ loanId, onClose }: { loanId: string; onClose: () => void }) {
  const { t } = useTheme();
  const create = useCreateHudShareLink(loanId);
  const [label, setLabel] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const createdUrl = createdToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/hud/share/${createdToken}`
    : null;

  const submit = async () => {
    const link = await create.mutateAsync({
      label: label.trim() || null,
      invitee_email: email.trim() || null,
      invitee_role: role.trim() || null,
    });
    setCreatedToken(link.token);
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.32)", zIndex: 80,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: "min(520px, 96vw)",
        background: t.surface,
        borderRadius: 14,
        border: `1px solid ${t.line}`,
        boxShadow: "0 24px 48px rgba(0,0,0,0.22)",
        display: "flex", flexDirection: "column",
      }}>
        <header style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "14px 18px", borderBottom: `1px solid ${t.line}`,
        }}>
          <Icon name="send" size={14} />
          <span style={{ fontSize: 14, fontWeight: 900, color: t.ink }}>Invite to fill HUD</span>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} aria-label="Close" style={{
            all: "unset", cursor: "pointer", color: t.ink3, fontSize: 18, fontWeight: 900,
            lineHeight: 1, padding: 4, borderRadius: 4,
          }}>×</button>
        </header>

        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          {createdUrl ? (
            <>
              <div style={{
                padding: 14, borderRadius: 10,
                background: t.profitBg, color: t.profit,
                fontSize: 12.5, fontWeight: 700, lineHeight: 1.45,
              }}>
                Link minted. Share the URL below with the invitee — anyone with this link can add HUD lines without logging in.
              </div>
              <div style={{
                padding: 10, borderRadius: 8,
                background: t.surface2,
                border: `1px solid ${t.line}`,
                fontFamily: "ui-monospace, SF Mono, monospace",
                fontSize: 12, color: t.ink,
                wordBreak: "break-all",
              }}>
                {createdUrl}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(createdUrl);
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 1800);
                    } catch { /* ignore */ }
                  }}
                  style={qcBtnPrimary(t)}
                >
                  <Icon name="copy" size={12} /> {copied ? "Copied" : "Copy link"}
                </button>
                <button onClick={onClose} style={qcBtn(t)}>Done</button>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 12.5, color: t.ink2, lineHeight: 1.5 }}>
                Generate a public URL for a title, escrow, or insurance contact to add their settlement line items directly to this loan&apos;s HUD.
              </div>
              <Field label="Label (shown in your share-links list)" t={t}>
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Title — First American"
                  style={modalInput(t)}
                />
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Invitee role (optional)" t={t}>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    style={modalInput(t)}
                  >
                    <option value="">—</option>
                    <option value="title">Title</option>
                    <option value="escrow">Escrow</option>
                    <option value="insurance">Insurance</option>
                    <option value="appraiser">Appraiser</option>
                    <option value="lender">Lender</option>
                    <option value="other">Other</option>
                  </select>
                </Field>
                <Field label="Invitee email (optional)" t={t}>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="contact@title-co.com"
                    style={modalInput(t)}
                  />
                </Field>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
                <button onClick={onClose} style={qcBtn(t)}>Cancel</button>
                <button onClick={submit} disabled={create.isPending} style={qcBtnPrimary(t)}>
                  {create.isPending ? "Generating…" : "Generate link"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


function Field({ label, children, t }: { label: string; children: React.ReactNode; t: ReturnType<typeof useTheme>["t"] }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: t.ink3, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 5 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function modalInput(t: ReturnType<typeof useTheme>["t"]): React.CSSProperties {
  return {
    width: "100%",
    padding: "8px 11px",
    borderRadius: 8,
    border: `1px solid ${t.line}`,
    background: t.surface2,
    color: t.ink,
    fontSize: 13,
    fontFamily: "inherit",
    outline: "none",
  };
}
