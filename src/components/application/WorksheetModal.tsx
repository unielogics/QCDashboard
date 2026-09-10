"use client";

// The worksheet over the file, and the dialog that shares part of it.
//
// Two things the desk does with the same four sheets:
//
//   **Open worksheet** — the grid, full width over the file, saving per cell
//   through the staff endpoints. This is the screen the owner described: *"a
//   digital version … that allows us to work on the file directly from our
//   system like a google sheet type of interface."* It is not another editor
//   beside the four stacked forms in `FinancialFormsPanel`; it is the same
//   figures, read through one call and written a cell at a time, so two people
//   on the file are editing rather than overwriting each other.
//
//   **Share worksheet** — a link for somebody with no login. Its token is
//   drawn on its own and what it opens is stored as rows, so "this link opens
//   the P&L and the balance sheet" is a fact rather than a description. Two
//   things in that dialog are deliberate and should not be softened:
//
//     · **The 413 is unticked by default**, with the reason on screen. It
//       carries a home address, a net worth and every personal liability, and
//       the person picking sheets to send an accountant is not thinking about
//       that in the two seconds the dialog is open. The default has to think
//       about it for them.
//     · **View only is the default permission.** An edit link is a
//       continuously writable credential with a month's life that is designed
//       to be forwarded — the strongest thing this system hands out. It should
//       be chosen, not arrived at.
//
// The PIN comes back exactly once, on the mint, and only its hash is stored: a
// lost PIN is reset, never read. So the dialog says so, in those words, beside
// the number.

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Btn, CellChip, Row, StatusLine } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { useAuthedApi } from "@/hooks/useApi";
import type { SheetKind } from "@/components/sheet/types";
import {
  mintWorksheetLink,
  readStaffWorksheet,
  revokeWorksheetLink,
  writeStaffCells,
  writeStaffRow,
  type MintedWorksheetLink,
  type WorksheetCellEdit,
  type WorksheetPayload,
  type WorksheetRowOp,
} from "@/lib/worksheetApi";

const Worksheet = dynamic(() => import("@/components/sheet/Worksheet").then((m) => m.Worksheet), {
  ssr: false,
  loading: () => <div className="sub">Opening the worksheet…</div>,
});

/** The four tabs, in the order the desk reads them: the business first, the
 *  owner last. */
export const SHEET_ORDER: SheetKind[] = ["p_and_l", "balance_sheet", "debt_schedule", "pfs"];

export const SHEET_LABELS: Record<SheetKind, string> = {
  p_and_l: "Profit & loss",
  balance_sheet: "Balance sheet",
  debt_schedule: "Debt schedule",
  pfs: "Personal financial statement",
};

const DEFAULT_TTL_DAYS = 30;

const shortDate = (iso: string | null) => {
  if (!iso) return "no expiry";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

const message = (reason: unknown, fallback: string) =>
  reason instanceof Error && reason.message ? reason.message : fallback;

// ---------------------------------------------------------------------------
// the grid over the file
// ---------------------------------------------------------------------------

export function WorksheetModal({
  open,
  onClose,
  profileId,
  businessName,
}: {
  open: boolean;
  onClose: () => void;
  profileId: string;
  businessName?: string | null;
}) {
  const api = useAuthedApi();
  const [payload, setPayload] = useState<WorksheetPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPayload(await readStaffWorksheet(api, profileId));
    } catch (reason) {
      setError(message(reason, "The worksheet could not be opened."));
    }
  }, [api, profileId]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [load, open]);

  const onSave = useCallback(
    async (edits: WorksheetCellEdit[]) => {
      if (edits.length === 0) return;
      setSaving(true);
      setError(null);
      try {
        const baseRev: Record<string, number> = {};
        for (const sheet of payload?.sheets ?? []) {
          if (typeof sheet.rev === "number") baseRev[sheet.kind] = sheet.rev;
        }
        const result = await writeStaffCells(api, profileId, edits, baseRev);
        setPayload((current) => {
          if (!current) return current;
          return {
            ...current,
            sheets: current.sheets.map((sheet) => {
              const mine = edits.filter((edit) => edit.sheet === sheet.kind);
              const values = { ...sheet.values };
              for (const edit of mine) values[edit.key] = edit.value;
              return {
                ...sheet,
                values,
                rev: result.rev?.[sheet.kind] ?? sheet.rev,
                computed: result.computed?.[sheet.kind] ?? sheet.computed,
              };
            }),
          };
        });
        // The server said this sheet's stored value is not what was sent —
        // somebody else's write landed between the read and this one. Refetch
        // rather than showing a figure nobody entered.
        if ((result.resync ?? []).length > 0) await load();
        setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
      } catch (reason) {
        setError(message(reason, "That change was not saved."));
      } finally {
        setSaving(false);
      }
    },
    [api, load, payload, profileId],
  );

  const onRowOp = useCallback(
    async (op: WorksheetRowOp) => {
      setError(null);
      try {
        const result = await writeStaffRow(api, profileId, op);
        setPayload((current) => {
          if (!current) return current;
          return {
            ...current,
            sheets: current.sheets.map((sheet) =>
              sheet.kind === op.sheet
                ? {
                    ...sheet,
                    rows: result.rows,
                    row_meta: result.row_meta,
                    rev: result.rev?.[sheet.kind] ?? sheet.rev,
                  }
                : sheet,
            ),
          };
        });
        return result;
      } catch (reason) {
        setError(message(reason, "That row could not be changed."));
        return undefined;
      }
    },
    [api, profileId],
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      fullscreen
      title={`Worksheet${businessName ? ` — ${businessName}` : ""}`}
      sub="The four financial forms as one workbook. Figures save a cell at a time."
      ariaLabel="Financial worksheet"
      headerActions={
        <span className="sub">
          {saving ? "Saving…" : savedAt ? `Saved at ${savedAt}` : "Saves as you type"}
        </span>
      }
      footer={<Btn onClick={onClose}>Close</Btn>}
    >
      {error ? <StatusLine tone="bad">{error}</StatusLine> : null}
      {payload ? (
        <Worksheet
          sheets={payload.sheets}
          scope={payload.scope}
          onSave={onSave}
          onRowOp={onRowOp}
        />
      ) : error ? null : (
        <div className="sub">Opening the worksheet…</div>
      )}
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// the share dialog
// ---------------------------------------------------------------------------

/** A link the desk has minted in this sitting. The URL and the PIN are held
 *  only here, in memory: the URL is a bearer credential and the PIN is
 *  unrecoverable, so neither is written anywhere this page could read back. */
type MintedRow = MintedWorksheetLink & { label: string | null; invitee_email: string | null };

export function ShareWorksheetDialog({
  open,
  onClose,
  profileId,
}: {
  open: boolean;
  onClose: () => void;
  profileId: string;
}) {
  const api = useAuthedApi();
  const [worksheetId, setWorksheetId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  // The first three ticked, the 413 not. See the header comment.
  const [chosen, setChosen] = useState<Record<SheetKind, boolean>>({
    p_and_l: true,
    balance_sheet: true,
    debt_schedule: true,
    pfs: false,
  });
  const [permission, setPermission] = useState<"edit" | "view">("view");
  const [label, setLabel] = useState("");
  const [email, setEmail] = useState("");
  const [ttl, setTtl] = useState(String(DEFAULT_TTL_DAYS));
  const [minted, setMinted] = useState<MintedRow[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    // The worksheet row is created by the read if the file has none, so this
    // both fetches the id and guarantees there is something to join a link to.
    void (async () => {
      try {
        const payload = await readStaffWorksheet(api, profileId);
        setWorksheetId(payload.worksheet_id);
      } catch (reason) {
        setError(message(reason, "The worksheet could not be prepared."));
      }
    })();
  }, [api, open, profileId]);

  const sheets = SHEET_ORDER.filter((kind) => chosen[kind]);
  // Mirrors `worksheet_links.pin_required_for`: an edit link, or any link that
  // opens the 413, gets a second factor. Said before the mint so nobody is
  // surprised by a PIN they then have to pass on.
  const willHavePin = permission === "edit" || chosen.pfs;

  const mint = async () => {
    if (!worksheetId || sheets.length === 0) return;
    setBusy("mint");
    setError(null);
    try {
      const days = Math.min(Math.max(Number.parseInt(ttl, 10) || DEFAULT_TTL_DAYS, 1), 365);
      const link = await mintWorksheetLink(api, profileId, worksheetId, {
        permission,
        sheets,
        ttl_days: days,
        label: label.trim() || null,
        invitee_email: email.trim() || null,
      });
      setMinted((current) => [
        { ...link, label: label.trim() || null, invitee_email: email.trim() || null },
        ...current,
      ]);
      try {
        await navigator.clipboard.writeText(link.url);
        setCopied(link.link_id);
        window.setTimeout(() => setCopied(null), 4000);
      } catch {
        // Left on screen to select by hand. `navigator.clipboard` refuses in
        // ways nobody can diagnose from the outside — an unfocused document is
        // enough — and a link that was minted but never reached the clipboard
        // leaves someone certain the feature is broken.
      }
    } catch (reason) {
      setError(message(reason, "That link could not be made."));
    } finally {
      setBusy("");
    }
  };

  const revoke = async (linkId: string) => {
    setBusy(`revoke:${linkId}`);
    setError(null);
    try {
      await revokeWorksheetLink(api, profileId, linkId);
      setMinted((current) => current.filter((one) => one.link_id !== linkId));
    } catch (reason) {
      setError(message(reason, "That link could not be closed."));
    } finally {
      setBusy("");
    }
  };

  const copy = async (link: MintedRow) => {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(link.link_id);
      window.setTimeout(() => setCopied(null), 4000);
    } catch {
      /* the URL is on screen */
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="md"
      title="Share the worksheet"
      sub="A link for somebody with no login — the borrower, or their accountant."
      footer={
        <Row>
          <Btn
            variant="pri"
            disabled={!worksheetId || sheets.length === 0 || busy !== ""}
            onClick={() => void mint()}
          >
            {busy === "mint" ? "Making the link…" : "Make the link"}
          </Btn>
          <Btn onClick={onClose}>Done</Btn>
        </Row>
      }
    >
      <div className="grid g10">
        {error ? <StatusLine tone="bad">{error}</StatusLine> : null}

        <div className="grid g4">
          <strong>Which sheets it opens</strong>
          <span className="sub">
            A sheet that is not ticked is not on the wire at all — the link never receives its
            figures, rather than receiving them and hiding them.
          </span>
          {SHEET_ORDER.map((kind) => (
            <label key={kind} className="row" style={{ gap: 8, alignItems: "flex-start" }}>
              <input
                type="checkbox"
                checked={chosen[kind]}
                onChange={(event) =>
                  setChosen((current) => ({ ...current, [kind]: event.target.checked }))
                }
              />
              <span className="grow">
                <b>{SHEET_LABELS[kind]}</b>
                {kind === "pfs" ? (
                  <>
                    {" "}
                    <CellChip tone="warn">Personal</CellChip>
                    <div className="sub">
                      This one carries the owner&apos;s home address, their net worth and every
                      personal liability. Leave it off unless the person receiving the link needs
                      it — and it forces a PIN when it is on.
                    </div>
                  </>
                ) : null}
              </span>
            </label>
          ))}
        </div>

        <div className="grid g4">
          <strong>What they can do</strong>
          <label className="row" style={{ gap: 8 }}>
            <input
              type="radio"
              name="sg-permission"
              checked={permission === "view"}
              onChange={() => setPermission("view")}
            />
            <span className="grow">
              <b>View only</b>
              <div className="sub">
                They read the sheets and watch them change. Nothing they do reaches the file.
              </div>
            </span>
          </label>
          <label className="row" style={{ gap: 8 }}>
            <input
              type="radio"
              name="sg-permission"
              checked={permission === "edit"}
              onChange={() => setPermission("edit")}
            />
            <span className="grow">
              <b>Edit</b>
              <div className="sub">
                They type into the sheets you ticked. Every change is recorded against this link.
              </div>
            </span>
          </label>
        </div>

        <div className="fldgrid two">
          <div className="grid g4">
            <span className="lbl">Who it is for (optional)</span>
            <input
              className="field"
              value={label}
              placeholder="Their accountant"
              onChange={(event) => setLabel(event.target.value)}
            />
          </div>
          <div className="grid g4">
            <span className="lbl">Their email (optional)</span>
            <input
              className="field"
              type="email"
              value={email}
              placeholder="name@firm.com"
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="grid g4">
            <span className="lbl">Expires in</span>
            <select className="field" value={ttl} onChange={(event) => setTtl(event.target.value)}>
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
            </select>
          </div>
        </div>

        {willHavePin ? (
          <StatusLine tone="warn">
            This link gets a six-digit PIN. It is shown once, here, when the link is made — only
            its hash is stored, so a lost PIN is reset rather than read back. Send it separately
            from the link.
          </StatusLine>
        ) : null}

        {minted.length > 0 ? (
          <div className="grid g10">
            <strong>Links made just now</strong>
            {minted.map((link) => (
              <div key={link.link_id} className="filerow">
                <div className="grow grid g4">
                  <div className="row">
                    <b>{link.label || link.invitee_email || "Shared worksheet"}</b>
                    <CellChip tone={link.permission === "edit" ? "warn" : "mut"}>
                      {link.permission === "edit" ? "Can edit" : "View only"}
                    </CellChip>
                    <CellChip tone="mut">Expires {shortDate(link.expires_at)}</CellChip>
                  </div>
                  <span className="sub">
                    {link.sheets.map((kind) => SHEET_LABELS[kind]).join(" · ")}
                  </span>
                  <input
                    className="field"
                    readOnly
                    value={link.url}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                  {link.pin ? (
                    <span className="sub">
                      <b>PIN {link.pin}</b> — shown once and never recoverable. Send it separately
                      from the link.
                    </span>
                  ) : null}
                </div>
                <Btn size="sm" disabled={busy !== ""} onClick={() => void copy(link)}>
                  {copied === link.link_id ? "Copied" : "Copy"}
                </Btn>
                <Btn size="sm" disabled={busy !== ""} onClick={() => void revoke(link.link_id)}>
                  {busy === `revoke:${link.link_id}` ? "Closing…" : "Revoke"}
                </Btn>
              </div>
            ))}
            <span className="sub">
              Only links made in this sitting are listed — the URL is a bearer credential and the
              PIN is unrecoverable, so neither is stored anywhere this screen could read back.
            </span>
          </div>
        ) : null}
      </div>
    </Drawer>
  );
}
