"use client";

// One financial form, opened by a link, by someone who is not signed in.
//
// Three things make this page different from the rest of the app.
//
// It must never send an Authorization header. `api<T>()` injects Clerk's token
// and a dev-user header; a visitor here has neither and the backend route takes
// no user at all, so this hand-writes fetch against apiBase the same way
// buckets/request/[token] does. Using the wrapper would not fail loudly — it
// would just quietly attach the wrong identity.
//
// It carries its own visual world. The console's palette puts the page ground
// at #f5f7fa, cards at #ffffff and field fills at #eef1f6 — three neutrals
// within a few percent of each other, which is legible once you know the
// software and tiring when you do not. A borrower gets one visit and a long
// form, so the surfaces here separate properly: a real ground under real cards,
// fields that read as fields, and one accent that only ever means "press this".
//
// And it ends. The borrower presses Save once, and the page says thank you and
// tells them they can close the window, which is the whole interaction. It does
// not bounce them somewhere or leave them wondering whether it went through.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { apiBase } from "@/lib/api";
import { Pfs413Form, type PfsBody, type PfsSchema } from "@/components/application/Pfs413Form";
import { DebtScheduleForm, type DebtBody } from "@/components/application/DebtScheduleForm";
import { debtRowProblems, describeDebtProblems, focusFirstProblem } from "@/lib/debtTypes";
import { FormReview } from "@/components/application/FormReview";
import { RealEstateScheduleForm } from "@/components/application/RealEstateScheduleForm";
import { PublicFormVersionNotice } from "@/components/application/PublicFormVersionNotice";
import { PublicFinancialFormError, PublicFinancialFormWriter, publicFinancialBody, publicFinancialResponse, type PublicFinancialReply, type PublicFinancialVersion } from "@/lib/publicFinancialForms";
import type { RealEstateBody, RealEstateSchema } from "@/lib/realEstateSchedule";
import { useDocumentWindow } from "@/hooks/useDocumentWindow";
import { operatingNumericProblems, operatingPlanContentKey } from "@/lib/operatingPlanFeedback";
import { OperatingPlanForm } from "@/components/application/OperatingPlanForm";
import type { OperatingSuggestionClient, OperatingSuggestionReply, OperatingSuggestionApplied } from "@/lib/operatingSuggestions";
import type { OperatingGoalRead } from "@/lib/operatingGoal";
import { operatingPlanSubmissionIssues } from "@/lib/operatingPlannerIssues";
import type { OperatingPlanBody, OperatingPlanSchema } from "@/lib/operatingPlan";
import { type OperatingGuidanceReply } from "@/lib/operatingGuidance";
import { BucketFileReviewPanel, type BucketFileReview } from "@/components/buckets/BucketFileReviewPanel";
import {
  BusinessStatementForm,
  type StatementBody,
  type StatementSchema,
} from "@/components/application/BusinessStatementForm";

type Prefill = {
  business_name: string | null;
  owner_name: string | null;
  home_address: string | null;
  business_phone: string | null;
  owner_count: number;
};

type FormBody = PfsBody & DebtBody & StatementBody & RealEstateBody & OperatingPlanBody;

// The schema is whichever the kind calls for; the two business statements
// share one shape and one component, the way the 413 has its own.
type FormState = PublicFinancialReply & {
  completed: boolean;
  business_name: string | null;
  prefill?: Prefill;
  body: FormBody;
  goal?: OperatingGoalRead;
} & (
  | { kind: "pfs" | "debt_schedule"; schema: PfsSchema }
  | { kind: "p_and_l" | "balance_sheet"; schema: StatementSchema }
  | { kind: "real_estate_schedule"; schema: RealEstateSchema }
  | { kind: "operating_plan"; schema: OperatingPlanSchema }
);

const TITLES = {
  debt_schedule: "Business Debt Schedule",
  pfs: "Personal Financial Statement",
  p_and_l: "Profit and Loss Statement",
  balance_sheet: "Balance Sheet",
  real_estate_schedule: "Real Estate Schedule",
  operating_plan: "Operating Expenses and Earnings Plan",
} as const;

const INTROS = {
  debt_schedule:
    "List every loan, line of credit, card, lease or advance the business is currently paying. Anything we already know is filled in — check it and correct what has changed.",
  pfs: "This follows the standard SBA Form 413 that lenders ask for. Leave anything that does not apply blank.",
  p_and_l:
    "Enter the figures for the period at the top — year to date, the last fiscal year, or the months you have. Totals are worked out as you type. Leave any line that does not apply blank.",
  balance_sheet:
    "Enter what the business owns and owes as of one date. If you do not have equity broken out, leave that section blank and it is taken as assets less liabilities.",
  real_estate_schedule: "List your real estate, current estimated values, rental income, expenses, and mortgages. Active mortgages create a request for their latest statement after you send this schedule.",
  operating_plan: "Disclose the costs of running your business, then propose changes to prices, product costs or expenses. Include amounts, timing and supporting evidence. Your team will review the proposal before using it in a financial projection.",
} as const;

const RECEIVED = {
  debt_schedule: "Your debt schedule has been received and added to your file.",
  pfs: "Your financial statement has been received and added to your file.",
  p_and_l: "Your profit and loss statement has been received and added to your file.",
  balance_sheet: "Your balance sheet has been received and added to your file.",
  real_estate_schedule: "Your real estate schedule has been received. Check your account to-dos for any requested mortgage statements.",
  operating_plan: "Your operating expenses and earnings plan has been saved as a dated version for your team's review.",
} as const;

export default function FinancialFormPage() {
  const params = useParams<{ kind: string; token: string }>();
  const token = params?.token ?? "";

  const [state, setState] = useState<FormState | null>(null);
  const [body, setBody] = useState<FormBody>({});
  // "review" sits between typing and sending: the borrower reads back what
  // they entered before it becomes the answer we hand a lender.
  const [status, setStatus] = useState<
    "loading" | "ready" | "preparing" | "review" | "saving" | "done" | "gone" | "goal_waiting"
  >("loading");
  const [error, setError] = useState<string | null>(null);
  const [goalWaiting, setGoalWaiting] = useState(false);
  const [loadRetry, setLoadRetry] = useState(0);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pendingDrafts = useRef(0);
  const [draftError, setDraftError] = useState("");
  const [draftConflict, setDraftConflict] = useState(false);
  const [previewAt, setPreviewAt] = useState<string | null>(null);
  // Once a submit has been tried, the schedule outlines the required answers
  // still missing. Off while drafting: a half-typed row is not shouted at.
  const [showProblems, setShowProblems] = useState(false);
  const [savedVersion, setSavedVersion] = useState<PublicFinancialVersion | null>(null);
  const [operatingPreview, setOperatingPreview] = useState<OperatingGuidanceReply | null>(null);
  const [operatingEvaluating, setOperatingEvaluating] = useState(false);
  const [operatingPreviewError, setOperatingPreviewError] = useState("");
  const [operatingSourceError, setOperatingSourceError] = useState("");
  const lastOperatingSource = useRef<string | null>(null);
  const [operatingPreviewRetry, setOperatingPreviewRetry] = useState(0);
  const [sourcePreviewId, setSourcePreviewId] = useState<string | null>(null);
  const [operatingGuided, setOperatingGuided] = useState(true);
  const [guidedStepRequest, setGuidedStepRequest] = useState<{ index: number; key: number } | null>(null);
  const previewRequest = useRef(0);
  const previewBody = useRef("");
  const visiblePreviewBody = useRef("");
  const contentKey = operatingPlanContentKey(body), contentKeyRef = useRef(contentKey); contentKeyRef.current = contentKey;
  const writer = useRef<PublicFinancialFormWriter | null>(null);
  const bodyRef = useRef(body);
  const loadedBody = useRef("");
  const statusRef = useRef(status);
  statusRef.current = status;
  const canEdit = !goalWaiting && state?.can_edit !== false && state?.permission !== "view";
  const changeBody = useCallback((next: FormBody) => {
    const stable = publicFinancialBody(next);
    bodyRef.current = stable;
    setBody(stable);
    setSavedVersion(null);
  }, []);

  // `apiBase` is the bare origin — `api<T>()` appends /api/v1 itself, and every
  // hand-written fetch in this app has to add it too. This one did not, so every
  // link minted for a borrower 404'd on load while the token behind it was fine.
  const base = `${apiBase}/api/v1/application-profiles/public/financial-forms/${encodeURIComponent(token)}`;
  const activeBase = useRef(base); activeBase.current = base;
  const sourceWindow = useDocumentWindow(base);
  const suggestionClient = useMemo<OperatingSuggestionClient>(() => ({ scope: base, suggest: async (body, expenseId, signal) => publicFinancialResponse<OperatingSuggestionReply>(await fetch(`${base}/suggestions`, { method: "POST", headers: { "Content-Type": "application/json" }, signal, body: JSON.stringify({ body: publicFinancialBody(body), expense_row_id: expenseId }) })), apply: async (body, expenseId, suggestionId, contextStamp, signal) => publicFinancialResponse<OperatingSuggestionApplied>(await fetch(`${base}/suggestions/apply`, { method: "POST", headers: { "Content-Type": "application/json" }, signal, body: JSON.stringify({ body: publicFinancialBody(body), expense_row_id: expenseId, suggestion_id: suggestionId, context_stamp: contextStamp }) })) }), [base]);
  const openOperatingSource = (fileId: string) => { lastOperatingSource.current = fileId; setOperatingSourceError(""); void sourceWindow.open(async signal => { const reply = await publicFinancialResponse<Omit<BucketFileReview, "annotations">>(await fetch(`${base}/evidence/${encodeURIComponent(fileId)}`, { signal })); if (reply.file.id !== fileId || !reply.preview_url) throw new Error("This source document is not available. Refresh the source list or ask your team for help."); return reply.preview_url; }).catch(reason => setOperatingSourceError(reason instanceof Error ? reason.message : "The source document could not be opened.")); };

  useEffect(() => {
    if (!token) return;
    statusRef.current = "loading"; setStatus("loading"); setState(null); setGoalWaiting(false); writer.current = null;
    bodyRef.current = {}; setBody({}); loadedBody.current = ""; previewBody.current = ""; visiblePreviewBody.current = ""; setOperatingPreview(null); setOperatingPreviewError("");
    setSourcePreviewId(null); setOperatingSourceError(""); lastOperatingSource.current = null;
    setOperatingGuided(true); setGuidedStepRequest(null); setDraftError(""); setDraftConflict(false); setSavedAt(null); pendingDrafts.current = 0; setSaving(false); setPreviewAt(null);
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(base);
        if (!response.ok) {
          if (response.status === 409) { const failure = await response.json().catch(() => null); if (!cancelled && failure?.detail?.code === "operating_goal_required") { setGoalWaiting(true); setStatus("goal_waiting"); return; } }
          if (!cancelled) setStatus("gone");
          return;
        }
        const data = (await response.json()) as FormState;
        if (cancelled) return;
        setState(data);
        setOperatingPreview(data.operating_plan ?? null);
        const next = publicFinancialBody(data.body ?? {});
        bodyRef.current = next;
        setBody(next);
        loadedBody.current = JSON.stringify(next);
        previewBody.current = data.operating_plan ? operatingPlanContentKey(next) : "";
        visiblePreviewBody.current = data.operating_plan?.evaluation ? `${base}:${previewBody.current}` : "";
        writer.current = new PublicFinancialFormWriter(base, data.workspace);
        setStatus(data.completed && !data.workspace?.dirty && data.can_edit !== false && data.permission !== "view" ? "done" : "ready");
      } catch {
        if (!cancelled) setStatus("gone");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [base, token, loadRetry]);

  useEffect(() => {
    const sequence = ++previewRequest.current;
    if (state?.kind !== "operating_plan" || status !== "ready" || !canEdit) { setOperatingEvaluating(false); return; }
    const sent = publicFinancialBody(bodyRef.current);
    const fingerprint = contentKey;
    if (operatingNumericProblems(sent).length) { visiblePreviewBody.current = ""; setOperatingEvaluating(false); setOperatingPreviewError(""); return; }
    if (fingerprint === previewBody.current && visiblePreviewBody.current === `${base}:${fingerprint}`) { setOperatingEvaluating(false); setOperatingPreviewError(""); return; }
    const controller = new AbortController();
    visiblePreviewBody.current = "";
    setOperatingEvaluating(true); setOperatingPreviewError("");
    setOperatingPreview(current => current ? { ...current, evaluation: null } : current);
    const timer = window.setTimeout(() => {
      void fetch(`${base}/evaluate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: sent }), signal: controller.signal })
        .then(response => publicFinancialResponse<OperatingGuidanceReply>(response))
        .then(reply => { if (!controller.signal.aborted && activeBase.current === base && contentKeyRef.current === fingerprint && sequence === previewRequest.current) { setPreviewAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })); previewBody.current = fingerprint; visiblePreviewBody.current = reply.evaluation ? `${base}:${fingerprint}` : ""; setOperatingPreview(reply); } })
        .catch(reason => { if (!controller.signal.aborted && sequence === previewRequest.current) setOperatingPreviewError(reason instanceof Error ? reason.message : "The preview could not be refreshed. Your entries are retained."); })
        .finally(() => { if (!controller.signal.aborted && sequence === previewRequest.current) setOperatingEvaluating(false); });
    }, 180);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [base, contentKey, canEdit, operatingPreviewRetry, state?.kind, status]);

  const loadOperatingSource = useCallback(async (): Promise<BucketFileReview> => {
    if (!sourcePreviewId) throw new Error("Choose a source document.");
    const reply = await publicFinancialResponse<Omit<BucketFileReview, "annotations">>(await fetch(`${base}/evidence/${encodeURIComponent(sourcePreviewId)}`));
    if (reply.file.id !== sourcePreviewId) throw new Error("This source does not match the requested document.");
    return { ...reply, annotations: [] };
  }, [base, sourcePreviewId]);

  const acceptReply = useCallback((reply: PublicFinancialReply, sent: FormBody) => {
    if (activeBase.current !== base) return;
    setState((current) => current ? { ...current, ...reply } as FormState : current);
    if (reply.operating_plan && bodyRef.current === sent) {
      setOperatingPreview(reply.operating_plan);
      previewBody.current = operatingPlanContentKey(reply.body ?? sent);
      visiblePreviewBody.current = reply.operating_plan.evaluation ? `${base}:${previewBody.current}` : "";
    }
    loadedBody.current = JSON.stringify(sent);
    // A canonical response must not erase typing that happened while it saved.
    if (reply.body && bodyRef.current === sent) {
      const next = reply.body as FormBody;
      bodyRef.current = next;
      setBody(next);
      loadedBody.current = JSON.stringify(next);
    }
    if (reply.saved_version) setSavedVersion(reply.saved_version);
  }, [base]);

  const saveDraft = useCallback(async (sent: FormBody = bodyRef.current) => {
    const activeWriter = writer.current;
    if (!activeWriter || !canEdit || JSON.stringify(sent) === loadedBody.current) return;
    pendingDrafts.current += 1; setSaving(true);
    try {
      if (state?.kind === "operating_plan" && operatingNumericProblems(sent).length) throw new Error("Finish the numeric entry before saving. Your entry is retained.");
      const reply = await activeWriter.write("draft", sent);
      if (activeBase.current !== base || writer.current !== activeWriter) return;
      acceptReply(reply, sent);
      setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
      if (state?.kind === "operating_plan") { setDraftError(""); setDraftConflict(false); } else setError(null);
    } catch (reason) {
      if (activeBase.current !== base || writer.current !== activeWriter) return;
      const message = reason instanceof Error ? reason.message : "Your progress could not be saved. Please try again.";
      if (state?.kind === "operating_plan") { setDraftError(message); if (reason instanceof PublicFinancialFormError && reason.status === 409) setDraftConflict(true); } else setError(message);
      throw reason;
    } finally { if (activeBase.current === base && writer.current === activeWriter) { pendingDrafts.current = Math.max(0, pendingDrafts.current - 1); setSaving(pendingDrafts.current > 0); } }
  }, [acceptReply, base, canEdit, state?.kind]);

  useEffect(() => {
    if (status !== "ready" || !canEdit || draftConflict || JSON.stringify(body) === loadedBody.current || state?.kind === "operating_plan" && operatingNumericProblems(body).length) return;
    const timer = window.setTimeout(() => {
      if (statusRef.current === "ready") void saveDraft().catch(() => undefined);
    }, state?.kind === "operating_plan" ? 800 : 4000);
    return () => window.clearTimeout(timer);
  }, [body, canEdit, draftConflict, saveDraft, state?.kind, status]);

  const review = async () => {
    if (!canEdit || !writer.current) return;
    setError(null);
    if (state?.kind === "operating_plan" && operatingGuided) {
      const required = operatingPlanSubmissionIssues(bodyRef.current, operatingPreview?.evaluation, operatingPreview?.guidance, { serverCurrent: visiblePreviewBody.current === `${base}:${operatingPlanContentKey(bodyRef.current)}` });
      if (required.length) {
        setError(required[0].label);
        setGuidedStepRequest(current => ({ index: required[0].step, key: (current?.key ?? 0) + 1 }));
        requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-label="Guided operating expenses and earnings plan"] h4')?.scrollIntoView({ block: "start", behavior: "smooth" }));
        return;
      }
    }
    if (state?.kind === "debt_schedule") {
      const problems = debtRowProblems(bodyRef.current.debts ?? [], !!state.workspace);
      if (problems.length) {
        setShowProblems(true);
        setError(describeDebtProblems(problems));
        focusFirstProblem(problems);
        return;
      }
      setShowProblems(false);
    }
    statusRef.current = "preparing";
    setStatus("preparing");
    try {
      await saveDraft();
      await writer.current.flush();
      setStatus("review");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch { setStatus("ready"); }
  };

  const edit = () => {
    setError(null);
    setStatus("ready");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async () => {
    if (!canEdit || !writer.current) return;
    setStatus("saving");
    setError(null);
    const sent = bodyRef.current, activeWriter = writer.current;
    try {
      const reply = await activeWriter.write("submit", sent);
      if (activeBase.current !== base || writer.current !== activeWriter) return;
      acceptReply(reply, sent);
      setStatus("done");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (reason) {
      if (activeBase.current !== base || writer.current !== activeWriter) return;
      setError(reason instanceof Error ? reason.message : "We could not save this version. Your answers are still here.");
      setStatus(state?.kind === "operating_plan" ? "ready" : "review");
    }
  };

  const saveOperatingPlanVersion = async () => {
    if (!canEdit || !writer.current || statusRef.current !== "ready") return;
    setError(null);
    const activeWriter = writer.current;
    const sent = bodyRef.current;
    const fingerprint = operatingPlanContentKey(sent);
    statusRef.current = "preparing"; setStatus("preparing");
    try {
      // Validate the exact body being saved; a pending preview belongs to an earlier edit.
      let currentPreview = operatingPreview;
      if (operatingEvaluating || visiblePreviewBody.current !== `${base}:${fingerprint}` || !currentPreview?.evaluation) {
        currentPreview = await publicFinancialResponse<OperatingGuidanceReply>(await fetch(`${base}/evaluate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: sent }) }));
        if (writer.current !== activeWriter || bodyRef.current !== sent) throw new Error("The form changed. Review the current plan before saving.");
        setOperatingPreview(currentPreview);
        previewBody.current = fingerprint;
        visiblePreviewBody.current = currentPreview.evaluation ? `${base}:${fingerprint}` : "";
      }
      if (!currentPreview?.evaluation) throw new Error("The current preview is unavailable. Retry the financial preview before saving.");
      const required = operatingPlanSubmissionIssues(sent, currentPreview.evaluation, currentPreview.guidance);
      if (required.length) {
        setGuidedStepRequest(current => ({ index: required[0].step, key: (current?.key ?? 0) + 1 }));
        throw new Error(required[0].label);
      }
      await saveDraft(sent);
      // An earlier failed submit remains the writer tail; retry the same intent after the current draft is saved.
      await activeWriter.flush().catch(() => undefined);
      if (writer.current !== activeWriter) throw new Error("The form changed. Review the current plan before saving.");
      await submit();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The version could not be saved. Your entries are retained."); setStatus("ready"); }
  };

  const title = state ? TITLES[state.kind] : "";

  // Which identity fields came off the file, so the page says so once rather
  // than decorating every input with a badge.
  const seeded = useMemo(() => {
    const pre = state?.prefill;
    if (!pre) return [] as string[];
    const out: string[] = [];
    if (pre.business_name) out.push("business name");
    if (pre.owner_name) out.push("owner name");
    if (pre.home_address) out.push("address");
    if (pre.business_phone) out.push("phone");
    return out;
  }, [state]);

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
          <span className="fp-sr">Loading your form</span>
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

  if (status === "goal_waiting") return <div className="fp"><header className="fp-header"><div className="fp-header-inner"><span className="fp-mark">Qualified Commercial</span></div></header><main className="fp-main fp-centered"><section className="fp-card"><h1>Your team is setting the annual NOI goal</h1><p>The goal needs to be saved before your operating plan can be opened. Your team will confirm it with you.</p><button type="button" onClick={() => setLoadRetry(count => count + 1)}>Check again</button></section></main></div>;
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

  if (status === "review" || (status === "saving" && state && state.kind !== "operating_plan")) {
    return (
      <div className="fp">
        <header className="fp-header">
          <div className="fp-header-inner">
            <span className="fp-mark">Qualified Commercial</span>
            <h1>Check this over</h1>
            <p className="fp-for">
              {title}
              {state?.business_name ? ` · ${state.business_name}` : ""}
            </p>
          </div>
        </header>

        <main className="fp-main">
          <div className="fp-intro">
            <p>
              This is everything you entered. Read it back once — a figure typed into the row
              above it is the kind of thing nobody notices while filling a form in and everybody
              notices while reading one. A dated PDF version is created when you save and send below.
            </p>
          </div>

          <div className="fp-card fpr">
            {state ? (
              <FormReview kind={state.kind} schema={state.schema} body={body} />
            ) : null}
          </div>

          {error ? (
            <p className="fp-error" role="alert">
              {error}
            </p>
          ) : null}
        </main>

        <div className="fp-actions">
          <div className="fp-actions-inner">
            <button
              type="button"
              className="fp-submit"
              disabled={!canEdit || status === "saving"}
              onClick={submit}
            >
              {status === "saving" ? (
                <>
                  <span className="fp-spinner" aria-hidden="true" /> Sending…
                </>
              ) : (
                "Save version and send"
              )}
            </button>
            <button
              type="button"
              className="fp-secondary"
              disabled={!canEdit || status === "saving"}
              onClick={edit}
            >
              Go back and edit
            </button>
            <span className="fp-autosave">Your progress is a working draft until you save this version.</span>
          </div>
        </div>
      </div>
    );
  }

  if (status === "done") {
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
            <p>
              {state ? RECEIVED[state.kind] : RECEIVED.pfs}
            </p>
            <p className="fp-quiet">
              If you spot a mistake, this link still works. Correcting a figure now is far
              easier than correcting it after a lender has read it.
            </p>
            {/* The sentence above used to be the whole offer, and "reopen it"
                meant finding the email again. The way back belongs here. */}
            {canEdit ? <button type="button" className="fp-secondary" onClick={edit}>Edit my answers</button> : null}
            <PublicFormVersionNotice workspace={state?.workspace} savedVersion={savedVersion} canEdit={canEdit} />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="fp">
      <header className="fp-header">
        <div className="fp-header-inner">
          <span className="fp-mark">Qualified Commercial</span>
          <h1>{title}</h1>
          {state?.business_name ? <p className="fp-for">For {state.business_name}</p> : null}
        </div>
      </header>

      <main className="fp-main">
        <div className="fp-intro">
          <p>
            {state ? INTROS[state.kind] : ""}
          </p>
          {seeded.length > 0 ? (
            <p className="fp-note">
              <span aria-hidden="true">✎</span>
              <span>
                We filled in the {listOf(seeded)} from your file. Type over anything that is
                wrong — what you enter is what we use.
              </span>
            </p>
          ) : null}
          {state?.kind === "pfs" && (state.prefill?.owner_count ?? 0) > 1 ? (
            <p className="fp-note">
              <span aria-hidden="true">◆</span>
              <span>
                This file has more than one owner. A financial statement belongs to one person —
                fill this in for yourself, and each other owner gets a link of their own.
              </span>
            </p>
          ) : null}
        </div>

        <PublicFormVersionNotice workspace={state?.workspace} savedVersion={savedVersion} canEdit={canEdit} />
        <div className="fp-card">
          {state?.kind === "debt_schedule" ? (
            <DebtScheduleForm value={body} onChange={changeBody} disabled={!canEdit || status === "saving" || status === "preparing"} showProblems={showProblems} scheduleCompletion={!!state.workspace} />
          ) : state?.kind === "p_and_l" || state?.kind === "balance_sheet" ? (
            <BusinessStatementForm
              schema={state.schema}
              value={body}
              onChange={changeBody}
              disabled={!canEdit || status === "saving" || status === "preparing"}
            />
          ) : state?.kind === "real_estate_schedule" ? (
            <RealEstateScheduleForm schema={state.schema} value={body} onChange={(next) => changeBody(next as FormBody)} disabled={!canEdit || status === "saving" || status === "preparing"} />
          ) : state?.kind === "operating_plan" ? (
            <><OperatingPlanForm saveStatus={{ state: draftError ? "error" : saving ? "saving" : JSON.stringify(body) !== loadedBody.current ? "unsaved" : "saved", at: savedAt, error: draftError, retry: draftConflict ? undefined : () => { void saveDraft().catch(() => undefined); }, reload: draftConflict ? () => { if (window.confirm("Reload the saved draft and replace the entries in this window?")) setLoadRetry(value => value + 1); } : undefined }} calculationStatus={{ pending: operatingEvaluating || visiblePreviewBody.current !== `${base}:${contentKey}` && !operatingPreviewError && !operatingNumericProblems(body).length, at: previewAt, error: operatingPreviewError, retry: () => setOperatingPreviewRetry(value => value + 1), invalid: operatingNumericProblems(body) }} suggestionClient={suggestionClient} goal={operatingPreview?.goal ?? state.goal} sourceMessage={operatingSourceError ? <div role="alert"><p>{operatingSourceError}</p><button type="button" onClick={() => { if (lastOperatingSource.current) openOperatingSource(lastOperatingSource.current); }}>Retry source document</button></div> : null} onSaveVersion={saveOperatingPlanVersion} saveVersionBusy={status === "preparing" || status === "saving"} saveVersionDisabled={!canEdit || status === "preparing" || status === "saving"} saveVersionLabel="Save version for your team" key={token} value={body} releasedCashFlow={state.released_cash_flow ?? state.completion?.released_cash_flow} onChange={changeBody} disabled={!canEdit || status === "saving" || status === "preparing"} guidedDefault onGuidedModeChange={setOperatingGuided} guidedStepRequest={guidedStepRequest} guidance={operatingPreview?.guidance} evidence={operatingPreview?.evidence} sources={operatingPreview?.evidence.files} evaluation={visiblePreviewBody.current === `${base}:${contentKey}` ? operatingPreview?.evaluation : null} evaluating={operatingEvaluating || visiblePreviewBody.current !== `${base}:${contentKey}` && !operatingPreviewError && !operatingNumericProblems(body).length} onPreviewSource={openOperatingSource} /></>
          ) : state?.kind === "pfs" ? (
            <Pfs413Form
              schema={state.schema}
              value={body}
              onChange={changeBody}
              disabled={!canEdit || status === "saving" || status === "preparing"}
            />
          ) : null}
        </div>

        {error ? (
          <p className="fp-error" role="alert">
            {error}
          </p>
        ) : null}
      </main>

      {sourcePreviewId && state?.kind === "operating_plan" ? <BucketFileReviewPanel title="Operating plan source document" reviewKey={`operating-source:${token}:${sourcePreviewId}`} loadReview={loadOperatingSource} activeFileId={sourcePreviewId} annotationsEnabled={false} onClose={() => setSourcePreviewId(null)} /> : null}
      {state?.kind !== "operating_plan" ? <div className="fp-actions">
        <div className="fp-actions-inner">
          {canEdit ? <button type="button" className="fp-submit" disabled={status === "preparing"} onClick={() => void review()}>
            {status === "preparing" ? "Saving draft…" : "Review and save version"}
          </button> : <span>This form link allows viewing only.</span>}
          <span className="fp-autosave" aria-live="polite">
            {error ? "Please check the save message above." : saving ? (
              <>
                <span className="fp-pulse" aria-hidden="true" /> Saving your progress…
              </>
            ) : savedAt ? (
              `Progress saved at ${savedAt}.`
            ) : (
              "Your progress saves as you type."
            )}
          </span>
        </div>
      </div> : null}
    </div>
  );
}

/** "business name, owner name and address" — read once, so the serial comma is
 *  not worth the extra character. */
function listOf(items: string[]): string {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
