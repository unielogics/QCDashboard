"use client";

// HudTab — editable HUD settlement statement.
//
// Replaces the read-only Hud1Tab. Now a real table:
//   • Operator can add / edit / delete line items
//   • Inline edit on label / payee / amount / category / note
//   • "Share" opens a drawer that mints a public token + URL the
//     operator can drop on title / escrow / insurance contacts so they
//     can fill their own line items without an account.
//   • Active share links are listed with revoke + last-used info.
//
// Totals + categorization rolled up at the bottom.
//
// Styling lives in globals.css / app-extras.css. The two-pane shape is
// `.withrail` (main surface + sticky 320px rail); the share dialog is
// ds/Drawer, which carries Escape, backdrop click, body-scroll lock and focus
// restore — none of which the hand-rolled overlay this replaced had.

import { useMemo, useState } from "react";
import { Icon } from "@/components/design-system/Icon";
import { QC_FMT } from "@/components/design-system/tokens";
import {
  Btn,
  Card,
  CellChip,
  Field,
  IconBtn,
  Input,
  Lbl,
  Linky,
  Panel,
  Select,
  StatusLine,
  Table,
  Tag,
  Td,
  Tr,
} from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
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

const MONO = "ui-monospace, SFMono-Regular, SF Mono, Menlo, monospace";

export function HudTab({ loan }: { loan: Loan }) {
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
    <div className="withrail">
      <Panel
        title="HUD Settlement Statement"
        sub={<Tag>{lines.length} line{lines.length === 1 ? "" : "s"}</Tag>}
        actions={
          <>
            <Btn onClick={() => setShareOpen(true)}>
              <Icon name="send" size={12} /> Share / invite
            </Btn>
            <Btn variant="pri" onClick={addNewLine} disabled={create.isPending}>
              <Icon name="add" size={12} /> Add row
            </Btn>
          </>
        }
        noPad
      >
        {isLoading ? (
          <div className="panel-b sub">Loading HUD lines…</div>
        ) : lines.length === 0 ? (
          <div className="panel-b sub">
            No HUD lines yet. Click <strong>Add row</strong> to start, or use <strong>Share / invite</strong> to let a title / escrow / insurance contact fill theirs in.
          </div>
        ) : (
          <HudTable
            lines={lines}
            onUpdate={(lineId, patch) => update.mutate({ loanId: loan.id, lineId, ...patch })}
            onDelete={(lineId) => remove.mutate(lineId)}
          />
        )}
      </Panel>

      {/* Not `.side`: that class belongs to the app shell (height:100vh,
          border-right, surface background) and `.withrail > .side` only
          overrides position/display, so the shell's leftovers leak in. The
          rail is simply the second grid column. */}
      <div className="grid">
        <Card>
          <Lbl>Totals</Lbl>
          <div className="mt">
            <SumRow label="Fixed costs" value={fixedTotal} />
            <SumRow label="Variable" value={variableTotal} />
            <SumRow label="Reserves" value={reservesTotal} />
            <SumRow label="Third-party" value={thirdPartyTotal} />
          </div>
          {/* The grand total is the figure the closer reads off this tab, so it
              gets the headline treatment rather than a fifth identical row. */}
          <div className="mt">
            <Lbl>Total fees + reserves</Lbl>
            <div className="big num">{QC_FMT.usd(total)}</div>
          </div>
        </Card>

        <ShareLinksCard loanId={loan.id} />
      </div>

      {/* Kept as a conditional mount, not a permanently-mounted `open={…}`
          drawer: the form and the minted-token state must reset each time the
          operator opens it. */}
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
  return (
    <Table
      caption="HUD settlement line items"
      cols={[
        { label: "Code", width: 140 },
        { label: "Item" },
        { label: "Payee", width: 180 },
        { label: "Category", width: 140 },
        { label: "Amount", align: "r", width: 140 },
        { label: <span className="sr-only">Row actions</span>, width: 48 },
      ]}
    >
      {lines.map((line) => (
        <HudRow
          key={line.id}
          line={line}
          onUpdate={(patch) => onUpdate(line.id, patch)}
          onDelete={() => onDelete(line.id)}
        />
      ))}
    </Table>
  );
}


function HudRow({
  line, onUpdate, onDelete,
}: {
  line: HudLine;
  onUpdate: (patch: Partial<HudLine>) => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <Tr>
      <Td>
        <span className="row">
          <span className="mlbl">{line.code}</span>
          {line.created_by_share_link_id ? (
            <CellChip tone="acc" title="Added via share link">↩ shared</CellChip>
          ) : null}
        </span>
      </Td>
      <Td>
        <InlineEdit
          value={line.label}
          editable={line.editable}
          onCommit={(v) => onUpdate({ label: v })}
        />
        {line.note ? (
          <div className="sub">
            <InlineEdit
              value={line.note ?? ""}
              editable={line.editable}
              onCommit={(v) => onUpdate({ note: v || null })}
              placeholder="(no note — click to add)"
            />
          </div>
        ) : (
          <div className="sub">
            <InlineEdit
              value=""
              editable={line.editable}
              onCommit={(v) => onUpdate({ note: v || null })}
              placeholder="+ note"
            />
          </div>
        )}
      </Td>
      <Td>
        <InlineEdit
          value={line.payee ?? ""}
          editable={line.editable}
          onCommit={(v) => onUpdate({ payee: v || null })}
          placeholder="—"
        />
      </Td>
      <Td>
        <Select
          value={line.category}
          disabled={!line.editable}
          onChange={(e) => onUpdate({ category: e.target.value })}
          aria-label="Category"
        >
          {CATEGORY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
      </Td>
      <Td align="r">
        <CurrencyEdit
          value={Number(line.amount)}
          editable={line.editable}
          onCommit={(v) => onUpdate({ amount: v })}
        />
      </Td>
      <Td align="r">
        {line.editable ? (
          confirmDelete ? (
            <Btn
              size="sm"
              className="c-bad"
              onClick={() => { onDelete(); setConfirmDelete(false); }}
              title="Click again to confirm"
            >
              Sure?
            </Btn>
          ) : (
            <IconBtn
              onClick={() => setConfirmDelete(true)}
              onBlur={() => setConfirmDelete(false)}
              title="Remove this line"
              aria-label="Remove this line"
            >
              ×
            </IconBtn>
          )
        ) : (
          <span className="sub" title="Locked line">🔒</span>
        )}
      </Td>
    </Tr>
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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (!editable) {
    return <span>{value || placeholder || "—"}</span>;
  }
  if (editing) {
    return (
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { setEditing(false); if (draft !== value) onCommit(draft); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { setEditing(false); if (draft !== value) onCommit(draft); }
          if (e.key === "Escape") { setEditing(false); setDraft(value); }
        }}
        // Genuinely layout-dependent: the control has to fill whatever cell it
        // lands in, and .field deliberately does not set a width.
        style={{ width: "100%" }}
      />
    );
  }
  return (
    <span
      onClick={() => { setDraft(value); setEditing(true); }}
      className={value ? undefined : "sub"}
      // Bespoke click-to-edit affordance: a text cell that is also a target.
      style={{ display: "inline-block", minHeight: 18, padding: "1px 4px", borderRadius: 4, cursor: "text" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--sunken2)"; }}
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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value === 0 ? "" : String(value));
  if (!editable) {
    return <span className="num">{QC_FMT.usd(value)}</span>;
  }
  if (editing) {
    return (
      <Input
        autoFocus
        className="align-r num"
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
        style={{ width: "100%" }}
      />
    );
  }
  return (
    <span
      onClick={() => { setDraft(value === 0 ? "" : String(value)); setEditing(true); }}
      className="num"
      style={{ display: "inline-block", padding: "1px 4px", borderRadius: 4, cursor: "text", fontWeight: 700 }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--sunken2)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      {QC_FMT.usd(value)}
    </span>
  );
}


function SumRow({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className="kv">
      {bold ? <b>{label}</b> : <span>{label}</span>}
      <b className="num">{QC_FMT.usd(value)}</b>
    </div>
  );
}


// ── Share links ────────────────────────────────────────────────────────


function ShareLinksCard({ loanId }: { loanId: string }) {
  const { data: shares = [], isLoading } = useHudShareLinks(loanId);
  const revoke = useRevokeHudShareLink(loanId);
  const active = shares.filter((s) => !s.revoked_at);

  if (isLoading) {
    return (
      <Card>
        <Lbl>Share links</Lbl>
        <div className="sub mt">Loading…</div>
      </Card>
    );
  }
  if (active.length === 0) return null;

  return (
    <Card>
      <Lbl>Active share links</Lbl>
      <div className="mt">
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
    <div className="itemrow">
      <div className="grow grid g6">
        <div className="row">
          <b>{share.label || share.invitee_email || share.invitee_role || "Untitled link"}</b>
          <span className="sp" />
          <Linky onClick={onRevoke} title="Revoke this link">Revoke</Linky>
        </div>
        {share.invitee_role || share.invitee_email ? (
          <div className="sub">
            {share.invitee_role || "—"}{share.invitee_email ? ` · ${share.invitee_email}` : ""}
          </div>
        ) : null}
        <div className="row">
          <Input
            grow
            readOnly
            value={url}
            aria-label="Share link URL"
            onFocus={(e) => e.currentTarget.select()}
            // A token URL is read character by character when someone is
            // checking it — monospace is the point, not decoration.
            style={{ fontFamily: MONO }}
          />
          <Btn size="sm" className={copied ? "c-ok" : undefined} onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </Btn>
        </div>
        {share.last_used_at ? (
          <div className="sub">Last used {new Date(share.last_used_at).toLocaleString()}</div>
        ) : (
          <div className="sub">Not opened yet</div>
        )}
      </div>
    </div>
  );
}


function ShareLinkModal({ loanId, onClose }: { loanId: string; onClose: () => void }) {
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

  const copyCreated = async () => {
    if (!createdUrl) return;
    try {
      await navigator.clipboard.writeText(createdUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { /* ignore */ }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      width="md"
      ariaLabel="Invite to fill HUD"
      title={<><Icon name="send" size={14} /> Invite to fill HUD</>}
      footer={
        createdUrl ? (
          <>
            <Btn variant="pri" onClick={copyCreated}>
              <Icon name="copy" size={12} /> {copied ? "Copied" : "Copy link"}
            </Btn>
            <Btn onClick={onClose}>Done</Btn>
          </>
        ) : (
          <>
            <span className="sp" />
            <Btn onClick={onClose}>Cancel</Btn>
            <Btn variant="pri" onClick={submit} disabled={create.isPending}>
              {create.isPending ? "Generating…" : "Generate link"}
            </Btn>
          </>
        )
      }
    >
      {createdUrl ? (
        <div className="grid">
          <StatusLine tone="ok">
            Link minted. Share the URL below with the invitee — anyone with this link can add HUD lines without logging in.
          </StatusLine>
          <div className="field" style={{ fontFamily: MONO, wordBreak: "break-all" }}>
            {createdUrl}
          </div>
        </div>
      ) : (
        <div className="grid">
          <div className="sub">
            Generate a public URL for a title, escrow, or insurance contact to add their settlement line items directly to this loan&apos;s HUD.
          </div>
          <Field label="Label (shown in your share-links list)">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Title — First American"
            />
          </Field>
          <div className="fldgrid two">
            <Field label="Invitee role (optional)">
              <Select
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                <option value="">—</option>
                <option value="title">Title</option>
                <option value="escrow">Escrow</option>
                <option value="insurance">Insurance</option>
                <option value="appraiser">Appraiser</option>
                <option value="lender">Lender</option>
                <option value="other">Other</option>
              </Select>
            </Field>
            <Field label="Invitee email (optional)">
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contact@title-co.com"
              />
            </Field>
          </div>
        </div>
      )}
    </Drawer>
  );
}
