"use client";

// Four financial forms behind one link, for someone who is not signed in.
//
// The desk copies one URL and forwards it to the borrower — or the borrower
// forwards it to their accountant. Behind it are four ordinary form links
// whose tokens derive from this one (`{base}.{kind}`), so this page is the
// single-form page four times over: the same public endpoints, the same
// no-Authorization fetch (see forms/[kind]/[token] for why the `api<T>()`
// wrapper must not be used here), the same four-second autosave and the same
// "Save and send" per form. Nothing new on the server was needed for it.
//
// One form on screen at a time. A P&L, a balance sheet, a debt schedule and a
// 413 stacked on one scrolling page is the spreadsheet this replaces; the rail
// at the top says what is done and what is left, and the page moves to the
// next open form when one is sent.
//
// A packet can be closed from the desk while somebody has it open. Every save
// here treats a non-ok answer as "this link is gone" rather than reporting
// saved — the single-form page can afford to be quiet about a failed
// autosave; a forwarded credential cannot.
//
// ── The worksheet fork ──────────────────────────────────────────────────
// On a screen 760px or wider this page becomes the worksheet grid, and below
// that it stays exactly what it has always been. One URL, two renderers: every
// packet link already in the wild becomes a spreadsheet on a laptop and a
// phone form on a phone, with no link migration and no "which link did I send"
// support tickets.
//
// The stacked branch below is the ENTIRE previous implementation, untouched.
// That is deliberate, and it is what the codebase records twice as a standing
// decision — BusinessStatementForm.tsx:12, "never a table … Nothing scrolls
// sideways", and DebtScheduleForm.tsx:5-13, "Squeezing eleven fields into a
// table meant horizontal scrolling, which on a phone means a borrower filling
// in a column they cannot see the heading of."
//
// The fork is not a media query. Below 760 the grid is never mounted, because
// it installs clipboard listeners, a roving tabindex and an offscreen focus
// catcher that fight iOS Safari — and it is imported with `next/dynamic`, so a
// phone downloads none of its code.

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { apiBase } from "@/lib/api";
import { useMediaQuery, WORKSHEET_MIN_WIDTH } from "@/lib/useMediaQuery";
import {
  readPublicWorksheet,
  writePublicCells,
  writePublicRow,
  writePublicVersion,
  downloadPublicWorksheetVersion,
  type WorksheetCellEdit,
  type WorksheetPayload,
  type WorksheetRowOp,
} from "@/lib/worksheetApi";
import { Pfs413Form, type PfsBody, type PfsSchema } from "@/components/application/Pfs413Form";
import { DebtScheduleForm, type DebtBody } from "@/components/application/DebtScheduleForm";
import { PublicFormVersionNotice } from "@/components/application/PublicFormVersionNotice";
import { PublicWorksheetVersionControls } from "@/components/application/PublicWorksheetVersionControls";
import { PublicWorksheetWriteQueue } from "@/lib/publicWorksheetWriter";
import type { SheetKind } from "@/components/sheet/types";
import { PublicFinancialFormWriter, publicFinancialBody, type PublicFinancialReply, type PublicFinancialVersion } from "@/lib/publicFinancialForms";
import { debtRowProblems, describeDebtProblems, focusFirstProblem } from "@/lib/debtTypes";
import {
  BusinessStatementForm,
  type StatementBody,
  type StatementSchema,
} from "@/components/application/BusinessStatementForm";

type Kind = "p_and_l" | "balance_sheet" | "debt_schedule" | "pfs";

/** The order the desk reads them in: the business first, the owner last. */
const KINDS: Kind[] = ["p_and_l", "balance_sheet", "debt_schedule", "pfs"];

const TITLES: Record<Kind, string> = {
  p_and_l: "Profit & loss",
  balance_sheet: "Balance sheet",
  debt_schedule: "Debt schedule",
  pfs: "Personal financial statement",
};

const INTROS: Record<Kind, string> = {
  p_and_l:
    "Enter the figures for the period at the top — year to date, the last fiscal year, or the months you have. Totals are worked out as you type.",
  balance_sheet:
    "What the business owns and owes as of one date. If you do not have equity broken out, leave that section blank and it is taken as assets less liabilities.",
  debt_schedule:
    "Every loan, line of credit, card, lease or advance the business is currently paying. Anything we already know is filled in — check it and correct what has changed.",
  pfs: "This follows the standard SBA Form 413 that lenders ask for. Leave anything that does not apply blank.",
};

type Prefill = {
  business_name: string | null;
  owner_name: string | null;
  home_address: string | null;
  business_phone: string | null;
  owner_count: number;
};

type FormBody = PfsBody & DebtBody & StatementBody;

type ChildState = PublicFinancialReply & {
  kind: Kind;
  schema: PfsSchema | StatementSchema;
  body: FormBody;
  completed: boolean;
  business_name: string | null;
  prefill?: Prefill;
};

type Child = {
  state: ChildState;
  body: FormBody;
  /** The body as it came off the server, so an untouched form is never autosaved. */
  loaded: FormBody;
  saving: boolean;
  savedAt: string | null;
  submitting: boolean;
  error: string | null;
  /** True once a send of the debt schedule has been refused for missing
   *  answers: the cards outline what is still needed. */
  problems?: boolean;
  savedVersion?: PublicFinancialVersion | null;
};

const NO_STORE: RequestInit = { cache: "no-store" };

const Worksheet = dynamic(() => import("@/components/sheet/Worksheet").then((m) => m.Worksheet), {
  ssr: false,
  loading: () => (
    <div className="fp-card" aria-busy="true">
      <span className="fp-skel fp-skel-line w60" />
      <div className="fp-grid fp-grid-skel">
        {Array.from({ length: 8 }).map((_, index) => (
          <span key={index} className="fp-skel fp-skel-field" />
        ))}
      </div>
    </div>
  ),
});

/** Once per tab: whether this token has already told us it is not a worksheet
 *  link. The worksheet read is throttled per token+address on the server, and
 *  a page somebody reloads six times should not spend six of those attempts
 *  learning the same thing. */
const notAWorksheet = new Set<string>();

/** The desktop branch: the same figures as one grid, if this token opens one.
 *
 *  A packet's four child links are `{base}.{kind}`; a worksheet link is one
 *  opaque token joined to a worksheet row. They are different rows in the same
 *  table, so this asks once and falls back silently — a token that is not a
 *  worksheet link answers the uniform 404 and the stacked forms below carry on
 *  exactly as they did before this branch existed. Nothing is shown to the
 *  visitor about the attempt, because from where they stand nothing happened.
 */
function useWorksheetFork(token: string, wanted: boolean) {
  const [payload, setPayload] = useState<WorksheetPayload | null>(null);
  const asked = useRef<string | null>(null);

  useEffect(() => {
    if (!wanted || !token || asked.current === token || notAWorksheet.has(token)) return;
    asked.current = token;
    let cancelled = false;
    void (async () => {
      try {
        const answer = await readPublicWorksheet(token, null);
        if (!cancelled) setPayload(answer);
      } catch {
        // Not a worksheet link, or one that needs a PIN. Either way this page
        // is the stacked forms, which is what it has always been.
        notAWorksheet.add(token);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, wanted]);

  return payload;
}

export default function FinancialPacketPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";

  const [children, setChildren] = useState<Partial<Record<Kind, Child>>>({});
  const writers = useRef<Partial<Record<Kind, PublicFinancialFormWriter>>>({});
  const childrenRef = useRef(children);
  childrenRef.current = children;
  const [status, setStatus] = useState<"loading" | "ready" | "gone">("loading");
  const [active, setActive] = useState<Kind>("p_and_l");
  // All four sent, and the person has chosen to look at them again.
  const [reviewing, setReviewing] = useState(false);
  const activeRef = useRef(active);
  activeRef.current = active;

  // `null` until the browser has told us — never guessed, because the two
  // branches are different components rather than a different class name and a
  // guess would hydrate a tree Next did not render.
  const wide = useMediaQuery(WORKSHEET_MIN_WIDTH);
  const worksheet = useWorksheetFork(token, wide === true);
  const [gridSaving, setGridSaving] = useState(false);
  const [gridSavedAt, setGridSavedAt] = useState<string | null>(null);
  const [grid, setGridState] = useState<WorksheetPayload | null>(null);
  const gridRef = useRef<WorksheetPayload | null>(null);
  const setGrid = useCallback((update: WorksheetPayload | null | ((current: WorksheetPayload | null) => WorksheetPayload | null)) => {
    const next = typeof update === "function" ? update(gridRef.current) : update;
    gridRef.current = next;
    setGridState(next);
  }, []);
  const gridWrites = useRef(new PublicWorksheetWriteQueue());
  const gridController = useRef<{ flush: () => Promise<void> } | null>(null);
  const [gridIssue, setGridIssue] = useState<string | null>(null);
  const [gridActiveKind, setGridActiveKind] = useState<SheetKind | null>(null);
  const [publishing, setPublishing] = useState(false);
  const versionAttempt = useRef<{ family: string; revision: number; key: string } | null>(null);
  useEffect(() => {
    if (worksheet) setGrid(worksheet);
  }, [setGrid, worksheet]);

  const saveCells = useCallback(async (edits: WorksheetCellEdit[]) => {
    if (!edits.length) return;
    setGridSaving(true);
    setGridIssue(null);
    try {
      await gridWrites.current.run(async () => {
        const baseRev: Record<string, number> = {};
        for (const sheet of gridRef.current?.sheets ?? []) if (typeof sheet.rev === "number") baseRev[sheet.kind] = sheet.rev;
        const result = await writePublicCells(token, null, edits, baseRev);
        setGrid((current) => current ? { ...current, sheets: current.sheets.map((sheet) => {
          const values = { ...sheet.values };
          for (const edit of edits.filter((one) => one.sheet === sheet.kind)) values[edit.key] = edit.value;
          return { ...sheet, values, rev: result.rev?.[sheet.kind] ?? sheet.rev,
            computed: result.computed?.[sheet.kind] ?? sheet.computed,
            workspace: result.workspaces?.[sheet.kind] ?? sheet.workspace };
        }) } : current);
        if (result.resync?.length) setGrid(await readPublicWorksheet(token, null));
        setGridSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
      });
    } catch (reason) {
      setGridIssue(reason instanceof Error ? reason.message : "Your changes could not be saved. Your entries are still here.");
      throw reason;
    } finally { setGridSaving(false); }
  }, [setGrid, token]);

  const rowOp = useCallback(async (op: WorksheetRowOp) => {
    try {
      return await gridWrites.current.run(async () => {
        const result = await writePublicRow(token, null, op);
        setGrid((current) => current ? { ...current, sheets: current.sheets.map((sheet) => sheet.kind === op.sheet
          ? { ...sheet, rows: result.rows, row_meta: result.row_meta, rev: result.rev?.[sheet.kind] ?? sheet.rev,
            workspace: result.workspaces?.[sheet.kind] ?? sheet.workspace } : sheet) } : current);
        return result;
      });
    } catch (reason) {
      setGridIssue(reason instanceof Error ? reason.message : "This row could not be changed. Please try again.");
      throw reason;
    }
  }, [setGrid, token]);

  const publishGrid = async (kind: SheetKind) => {
    if (publishing || !gridRef.current?.scope.can_edit) return;
    setPublishing(true);
    setGridIssue(null);
    try {
      await gridController.current?.flush();
      await gridWrites.current.flush();
      const workspace = gridRef.current.sheets.find((sheet) => sheet.kind === kind)?.workspace;
      if (!workspace) throw new Error("Reload this form before saving a dated version.");
      if (!versionAttempt.current || versionAttempt.current.family !== workspace.family_id || versionAttempt.current.revision !== workspace.revision) {
        versionAttempt.current = { family: workspace.family_id, revision: workspace.revision, key: crypto.randomUUID() };
      }
      const result = await writePublicVersion(token, null, { sheet: kind, expected_revision: workspace.revision,
        base_version_id: workspace.base_version_id, idempotency_key: versionAttempt.current.key });
      setGrid(result);
      versionAttempt.current = null;
    } catch (reason) { setGridIssue(reason instanceof Error ? reason.message : "This version could not be saved. Please try again."); }
    finally { setPublishing(false); }
  };

  const openGridPdf = async (kind: SheetKind, version: PublicFinancialVersion) => {
    try {
      const blob = await downloadPublicWorksheetVersion(token, null, kind, version.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `${kind}-v${version.version_number}.pdf`; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) { setGridIssue(reason instanceof Error ? reason.message : "This PDF could not be opened. Please try again."); }
  };

  // `apiBase` is the bare origin — every hand-written fetch adds /api/v1
  // itself. The child token is `{base}.{kind}`; `secrets.token_urlsafe` never
  // emits a dot, so the join is unambiguous on the server.
  const childUrl = useCallback(
    (kind: Kind) =>
      `${apiBase}/api/v1/application-profiles/public/financial-forms/${encodeURIComponent(`${token}.${kind}`)}`,
    [token],
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const answers = await Promise.all(
          KINDS.map(async (kind) => {
            const response = await fetch(childUrl(kind), NO_STORE);
            if (!response.ok) return null;
            return (await response.json()) as ChildState;
          }),
        );
        if (cancelled) return;
        // One missing child means the packet is closed or expired: the four
        // links share a lifetime and are revoked together.
        if (answers.some((answer) => answer === null)) {
          setStatus("gone");
          return;
        }
        const next: Partial<Record<Kind, Child>> = {};
        answers.forEach((answer, index) => {
          if (!answer) return;
          const kind = KINDS[index];
          const body = publicFinancialBody(answer.body ?? {});
          writers.current[kind] = new PublicFinancialFormWriter(childUrl(kind), answer.workspace);
          next[kind] = {
            state: { ...answer, kind },
            body,
            loaded: body,
            saving: false,
            savedAt: null,
            submitting: false,
            error: null,
          };
        });
        setChildren(next);
        setActive(KINDS.find((kind) => !next[kind]?.state.completed) ?? "p_and_l");
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("gone");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [childUrl, token]);

  const patch = useCallback((kind: Kind, changes: Partial<Child>) => {
    setChildren((current) => {
      const child = current[kind];
      if (!child) return current;
      return { ...current, [kind]: { ...child, ...changes } };
    });
  }, []);

  const setBody = useCallback((kind: Kind, next: FormBody) => {
    patch(kind, { body: publicFinancialBody(next), savedVersion: null });
  }, [patch]);

  const acceptReply = useCallback((kind: Kind, reply: PublicFinancialReply, sent: FormBody) => {
    setChildren((currentChildren) => {
      const currentChild = currentChildren[kind];
      if (!currentChild) return currentChildren;
      const nextBody = reply.body && currentChild.body === sent ? reply.body as FormBody : currentChild.body;
      const next = { ...currentChildren, [kind]: {
        ...currentChild, body: nextBody, loaded: currentChild.body === sent ? nextBody : sent,
        state: { ...currentChild.state, ...reply } as ChildState,
        savedVersion: reply.saved_version ?? currentChild.savedVersion,
      } };
      childrenRef.current = next;
      return next;
    });
  }, []);

  const saveDraft = useCallback(async (kind: Kind, sent: FormBody) => {
    const child = childrenRef.current[kind];
    const writer = writers.current[kind];
    if (!child || !writer || child.state.can_edit === false || child.state.permission === "view" || child.body === child.loaded) return;
    patch(kind, { saving: true });
    try {
      const reply = await writer.write("draft", sent);
      acceptReply(kind, reply, sent);
      patch(kind, { savedAt: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), error: null });
    } catch (reason) {
      patch(kind, { error: reason instanceof Error ? reason.message : "Your changes could not be saved. Your answers are still here." });
      throw reason;
    } finally { patch(kind, { saving: false }); }
  }, [acceptReply, patch]);

  const switchTo = (kind: Kind) => {
    const leaving = childrenRef.current[active];
    if (leaving && leaving.body !== leaving.loaded && !leaving.submitting) void saveDraft(active, leaving.body).catch(() => undefined);
    setActive(kind);
  };

  const current = children[active];
  const currentBody = current?.body;
  const currentLoaded = current?.loaded;
  const currentSubmitting = current?.submitting ?? false;
  const currentCanEdit = current?.state.can_edit !== false && current?.state.permission !== "view";

  useEffect(() => {
    if (status !== "ready" || !currentBody || currentBody === currentLoaded || currentSubmitting || !currentCanEdit) return;
    const kind = activeRef.current;
    const timer = window.setTimeout(() => {
      if (!childrenRef.current[kind]?.submitting) void saveDraft(kind, currentBody).catch(() => undefined);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [currentBody, currentCanEdit, currentLoaded, currentSubmitting, saveDraft, status]);

  const submit = async (kind: Kind) => {
    const child = childrenRef.current[kind];
    const writer = writers.current[kind];
    if (!child || !writer || child.submitting || child.state.can_edit === false || child.state.permission === "view") return;
    if (kind === "debt_schedule") {
      const problems = debtRowProblems(child.body.debts ?? [], !!child.state.workspace);
      if (problems.length) {
        patch(kind, { error: describeDebtProblems(problems), problems: true });
        focusFirstProblem(problems);
        return;
      }
    }
    patch(kind, { submitting: true, error: null, problems: false });
    try {
      const reply = await writer.write("submit", child.body);
      acceptReply(kind, { ...reply, completed: true }, child.body);
      patch(kind, { submitting: false });
      const remaining = KINDS.find((other) => other !== kind && (!childrenRef.current[other]?.state.completed || childrenRef.current[other]?.state.workspace?.dirty));
      if (remaining) {
        setActive(remaining);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (reason) {
      patch(kind, { submitting: false, error: reason instanceof Error ? reason.message : "We could not save this version. Your answers are still here." });
    }
  };

  const businessName =
    KINDS.map((kind) => children[kind]?.state.business_name).find((name) => Boolean(name)) ?? null;
  const doneCount = KINDS.filter((kind) => children[kind]?.state.completed && !children[kind]?.state.workspace?.dirty).length;
  const allDone = status === "ready" && doneCount === KINDS.length;
  /** The grid renders only when the screen is wide *and* this token actually
   *  opens a worksheet. Both halves matter: the first is the standing
   *  phone-first decision, the second is that a packet's child links and a
   *  worksheet link are different rows and only one of them has a layout. */
  const gridActive = wide === true && grid !== null;

  if (status === "loading") {
    return (
      <div className="fp">
        <header className="fp-header">
          <div className="fp-header-inner">
            <span className="fp-mark">Qualified Commercial</span>
            <span className="fp-skel fp-skel-title" />
          </div>
        </header>
        <main className="fp-main" aria-busy="true" aria-live="polite">
          <span className="fp-sr">Loading your forms</span>
          <div className="fp-card">
            <span className="fp-skel fp-skel-line w60" />
            <span className="fp-skel fp-skel-line w90" />
            <div className="fp-grid fp-grid-skel">
              {Array.from({ length: 6 }).map((_, index) => (
                <span key={index} className="fp-skel fp-skel-field" />
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (status === "gone") {
    return (
      <div className="fp">
        <header className="fp-header">
          <div className="fp-header-inner">
            <span className="fp-mark">Qualified Commercial</span>
          </div>
        </header>
        <main className="fp-main fp-centered">
          <div className="fp-card fp-terminal">
            <span className="fp-terminal-glyph" aria-hidden="true">
              ⧗
            </span>
            <h1>This link is no longer available</h1>
            <p>
              It may have expired or been replaced. Ask your contact at Qualified Commercial to
              send you a new one.
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (allDone && !reviewing) {
    return (
      <div className="fp">
        <header className="fp-header">
          <div className="fp-header-inner">
            <span className="fp-mark">Qualified Commercial</span>
          </div>
        </header>
        <main className="fp-main fp-centered">
          <div className="fp-card fp-terminal">
            <span className="fp-check" aria-hidden="true">
              <svg viewBox="0 0 32 32" width="40" height="40">
                <circle className="fp-check-ring" cx="16" cy="16" r="14" />
                <path className="fp-check-tick" d="M9.5 16.5l4.5 4.5 8.5-9" />
              </svg>
            </span>
            <h1>Thank you — you can close this window.</h1>
            <PublicFormVersionNotice workspace={children[active]?.state.workspace} savedVersion={children[active]?.savedVersion} canEdit={children[active]?.state.can_edit !== false && children[active]?.state.permission !== "view"} />
            <p>
              All four forms have been received and added to{" "}
              {businessName ? `the file for ${businessName}` : "your file"}. Nothing else is needed
              from you here.
            </p>
            <p className="fp-quiet">
              If you spot a mistake, this link still works — reopen a form and correct the figure.
            </p>
            <button type="button" className="fp-link-btn" onClick={() => setReviewing(true)}>
              Open the forms again
            </button>
          </div>
        </main>
      </div>
    );
  }

  const child = children[active];
  const ownerCount = child?.state.prefill?.owner_count ?? 0;

  return (
    <div className="fp">
      <header className="fp-header">
        <div className="fp-header-inner">
          <span className="fp-mark">Qualified Commercial</span>
          <h1>Financial package{businessName ? ` for ${businessName}` : ""}</h1>
          <p className="fp-for">
            Four forms, one link. Each one saves as you type and is sent on its own.
          </p>
        </div>
      </header>

      <main className="fp-main">
        <div className="fp-intro">
          <div className="fp-packet-progress">
            <span>
              <strong>
                {doneCount} of {KINDS.length}
              </strong>{" "}
              sent
            </span>
            <span>This link works for 30 days from when it was sent.</span>
          </div>
          <ol className="fp-packet-rail" aria-label="Forms in this package">
            {KINDS.map((kind, index) => {
              const step = children[kind];
              const done = !!step?.state.completed && !step.state.workspace?.dirty;
              const draft = !done && Boolean(step && (step.state.workspace?.dirty || step.savedAt || step.body !== step.loaded));
              return (
                <li key={kind}>
                  <button
                    type="button"
                    className="fp-packet-step"
                    aria-current={kind === active ? "step" : undefined}
                    onClick={() => switchTo(kind)}
                  >
                    <span>Step {index + 1}</span>
                    <strong>{TITLES[kind]}</strong>
                    <span
                      className={
                        done ? "fp-packet-chip is-done" : draft ? "fp-packet-chip is-draft" : "fp-packet-chip"
                      }
                    >
                      {done ? "Sent" : draft ? "Draft" : "To do"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="fp-note">
            <span aria-hidden="true">✎</span>
            <span>
              You can forward this link to your accountant. Open the latest saved version before making changes. If another person updates it, reload before saving.
            </span>
          </p>
          {active === "pfs" && ownerCount > 1 ? (
            <p className="fp-note">
              <span aria-hidden="true">◆</span>
              <span>
                This file has more than one owner. A financial statement belongs to one person —
                fill this in for yourself, and each other owner gets a link of their own.
              </span>
            </p>
          ) : null}
        </div>

        {/* 760 and up, and only when this token opens a worksheet: the four
            forms as one grid. Below that — and on every link that is a packet
            rather than a worksheet — the stacked forms below, unchanged. */}
        {gridActive && grid ? (
          <>
            {gridIssue ? <p className="fp-error" role="alert">{gridIssue}</p> : null}
            <Worksheet sheets={grid.sheets} scope={grid.scope} onSave={saveCells} onRowOp={rowOp} onActiveSheet={setGridActiveKind}
              onController={(controller) => { gridController.current = controller; }} />
            <PublicWorksheetVersionControls sheets={grid.sheets} activeKind={gridActiveKind ?? grid.scope.open_at ?? undefined} canEdit={grid.scope.can_edit} busy={publishing || gridSaving}
              onPublish={publishGrid} onOpenPdf={(kind, version) => void openGridPdf(kind, version)} />
          </>
        ) : child ? (
          <div className="fp-card">
            <div className="fp-packet-form-head">
              <h2>{TITLES[active]}</h2>
              <p>{INTROS[active]}</p>
            </div>
            <PublicFormVersionNotice workspace={child.state.workspace} savedVersion={child.savedVersion} canEdit={child.state.can_edit !== false && child.state.permission !== "view"} />
            {child.state.completed ? (
              <div className="fp-packet-done">
                <b>Sent.</b> You can still correct a figure here — saving again creates a new dated PDF version and keeps the earlier versions.
              </div>
            ) : null}
            {active === "debt_schedule" ? (
              <DebtScheduleForm
                value={child.body}
                onChange={(next) => setBody("debt_schedule", next)}
                disabled={child.submitting || child.state.can_edit === false || child.state.permission === "view"}
                showProblems={Boolean(child.problems)}
                scheduleCompletion={!!child.state.workspace}
              />
            ) : active === "pfs" ? (
              <Pfs413Form
                schema={child.state.schema as PfsSchema}
                value={child.body}
                onChange={(next) => setBody("pfs", next)}
                disabled={child.submitting || child.state.can_edit === false || child.state.permission === "view"}
              />
            ) : (
              <BusinessStatementForm
                schema={child.state.schema as StatementSchema}
                value={child.body}
                onChange={(next) => setBody(active, next)}
                disabled={child.submitting || child.state.can_edit === false || child.state.permission === "view"}
              />
            )}
          </div>
        ) : null}

        {child?.error ? (
          <p className="fp-error" role="alert">
            {child.error}
          </p>
        ) : null}
      </main>

      {/* The grid saves a cell at a time, so there is nothing to press — the
          bar says where the figures stand instead of offering a Send button
          that would mean something different from the one above it. */}
      {gridActive ? (
        <div className="fp-actions">
          <div className="fp-actions-inner">
            <span className="fp-autosave" aria-live="polite">
              {gridSaving ? (
                <>
                  <span className="fp-pulse" aria-hidden="true" /> Saving…
                </>
              ) : gridSavedAt ? (
                `Saved at ${gridSavedAt}.`
              ) : (
                "Working changes save as you type. Save a version to generate its dated PDF."
              )}
            </span>
          </div>
        </div>
      ) : child ? (
        <div className="fp-actions">
          <div className="fp-actions-inner">
            <button
              type="button"
              className="fp-submit"
              disabled={child.submitting || child.state.can_edit === false || child.state.permission === "view"}
              onClick={() => void submit(active)}
            >
              {child.submitting ? (
                <>
                  <span className="fp-spinner" aria-hidden="true" /> Saving…
                </>
              ) : child.state.completed ? (
                "Save a new version and send"
              ) : (
                "Save version and send"
              )}
            </button>
            <span className="fp-autosave" aria-live="polite">
              {child.error ? "Please check the save message above." : child.saving ? (
                <>
                  <span className="fp-pulse" aria-hidden="true" /> Saving your progress…
                </>
              ) : child.savedAt ? (
                `Progress saved at ${child.savedAt}.`
              ) : (
                "Your progress saves as you type."
              )}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
