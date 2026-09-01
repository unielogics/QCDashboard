"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Pill, StageBadge } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { Btn, CellChip, Chip, IconBtn, Kpi, KpiRow, Seg, type ChipTone } from "@/components/ds";
import { useClient, useCurrentUser, useDocuments, useLoan, useLoanActivity, useRecalc, useSendClientEmail, useStageTransition, useUpdateLoan } from "@/hooks/useApi";
import { EmailComposer } from "@/components/email/EmailComposer";
import { EmailsBreadcrumbTab } from "@/components/email/EmailsBreadcrumbTab";
import { FileBlockersPopup } from "@/components/FileBlockersPopup";
import { getCriteriaItems } from "./fileReadiness";
import { useDealChannel } from "@/hooks/useDealChannel";
import { QC_FMT } from "@/lib/fmt";
import { useUI } from "@/store/ui";
import { useActiveProfile } from "@/store/role";
import { LoanStageOptions, Role } from "@/lib/enums.generated";
import { LoanSimulator } from "@/components/LoanSimulator";
import { OverviewTab } from "./tabs/OverviewTab";
import { FundingFileTab } from "./tabs/FundingFileTab";
import { AgentLoanMirror } from "./tabs/AgentLoanMirror";
import { TermsTab } from "./tabs/TermsTab";
import { HudTab } from "./tabs/HudTab";
import { DocsTab } from "./tabs/DocsTab";
import { WorkflowTab } from "./tabs/WorkflowTab";
// Underwriting tab folded into Funding File — UW sizing + warnings live there now.
// PropertyTab is no longer a standalone tab — its content is embedded
// inside FundingFileTab, which owns the import now.
import { WireClosingTab } from "./tabs/WireClosingTab";
import { ActivityTab } from "./tabs/ActivityTab";
import { DealWorkspaceTab } from "./tabs/DealWorkspaceTab";
import { PrequalTab } from "./tabs/PrequalTab";
import { DealHealthPill } from "./components/DealHealthPill";
import { LenderConnectCard } from "./components/LenderConnectCard";
import { FILE_STAGE_KEYS, FILE_STAGE_LABELS, getFileCompletion } from "./fileReadiness";
import { LoanAgentPicker } from "@/components/LoanAgentPicker";
import { ClientLoanChatTab } from "./components/ClientLoanChatTab";
import { ClientTodoTab } from "./tabs/ClientTodoTab";
import { LoanChatTab } from "./components/LoanChatTab";
import { PageActionMenu } from "@/components/ds/PageActionMenu";
import { ApplicationVerificationWorkspace } from "@/components/application/ApplicationVerificationWorkspace";

const INTERNAL_TABS = [
  // Property tab merged into Funding File — property details now sit
  // inside the funding file alongside the rest of the deal foundation.
  // Underwriting tab also folded into Funding File since the UW
  // sizing + warnings panel is already part of the file-readiness view.
  { id: "file", label: "Funding File", icon: "file" as const },
  { id: "verification", label: "Verification", icon: "shieldChk" as const },
  { id: "terms", label: "Criteria", icon: "sliders" as const },
  { id: "docs", label: "Documents", icon: "doc" as const },
  { id: "workflow", label: "Conditions", icon: "cal" as const },
  { id: "prequal", label: "Pre-Qual", icon: "docCheck" as const },
  { id: "hud", label: "HUD", icon: "file" as const },
  { id: "workspace", label: "Elara", icon: "ai" as const },
  { id: "thread", label: "Lender", icon: "chat" as const },
  { id: "emails", label: "Emails", icon: "mail" as const },
  { id: "activity", label: "Activity", icon: "audit" as const },
] as const;

const AGENT_TABS = [
  { id: "agent", label: "Client Status", icon: "clients" as const },
  { id: "verification", label: "Verification", icon: "shieldChk" as const },
  // Broker access to the 4-mode loan chat (Live Chat / Ask Elara /
  // Suggest / Instruct) — same surface super_admin gets, rendered
  // inline as a tab rather than via the slide-out.
  { id: "loan_chat", label: "Chat", icon: "chat" as const },
  { id: "docs", label: "Documents", icon: "doc" as const },
  { id: "emails", label: "Emails", icon: "mail" as const },
  { id: "activity", label: "Updates", icon: "audit" as const },
] as const;

const CLIENT_TABS = [
  // Phase 7.5 — Messages is the default tab for clients because that's
  // where operator / broker / AI messages on this loan land. Without
  // this tab, desktop clients had no chat surface and operator messages
  // were invisible on desktop.
  { id: "messages", label: "Messages", icon: "chat" as const },
  { id: "overview", label: "Overview", icon: "home" as const },
  { id: "terms", label: "Simulator", icon: "sliders" as const },
  { id: "docs", label: "Documents", icon: "doc" as const },
  // Parity with mobile: clients get "To Do" instead of the raw
  // activity feed (scoped to their own loan; filterable).
  { id: "todo", label: "To Do", icon: "audit" as const },
] as const;

export default function LoanDetailPage() {
  const params = useParams<{ id: string }>();
  const profile = useActiveProfile();
  // Needed for the inline Loan-chat tab (passed through to DealChatInput).
  const { data: currentUser } = useCurrentUser();
  const setAiOpen = useUI((s) => s.setAiOpen);
  const { data: loan } = useLoan(params.id);
  // Borrower (natural person) FICO + display name come from the client
  // record. We don't always need it elsewhere on the page, but the
  // header strip shows it next to the LLC + address.
  const { data: client } = useClient(loan?.client_id ?? null);
  const { data: docs = [] } = useDocuments(params.id);
  const { data: activity = [], isLoading: activityLoading } = useLoanActivity(params.id);
  const stageMut = useStageTransition();
  const recalc = useRecalc();
  // Post-creation redirects (SmartIntakeModal, prequal accept) can deep-
  // link with `?tab=workspace` so the operator lands directly on the
  // Elara tab to configure the new file before doing anything
  // else. Honored once at mount; subsequent tab switches are user-driven.
  const searchParams = useSearchParams();
  const initialTabHint = searchParams?.get("tab") || null;
  const [tab, setTab] = useState<string>(
    initialTabHint ||
    (profile.role === Role.CLIENT ? "messages" : profile.role === Role.BROKER ? "agent" : "file"),
  );
  const [showBlockers, setShowBlockers] = useState(false);
  // Agent assignment picker — opens from the AGENT chip in the header.
  // Super_admin / loan_exec only.
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  // Email-the-client composer (operator/broker only).
  const [emailClientOpen, setEmailClientOpen] = useState(false);
  const sendClientEmail = useSendClientEmail();
  const canEmailClient = !!client?.email && (profile.role === Role.SUPER_ADMIN || profile.role === Role.LOAN_EXEC || profile.role === Role.BROKER);

  // Trigger recalc whenever loan numerics change so the warnings list
  // is fresh for the BlockersPopup, regardless of which tab the user
  // is on. Cheap — same effect that used to live in FundingFileTab.
  useEffect(() => {
    if (!loan) return;
    recalc.mutate({
      loanId: loan.id,
      discount_points: loan.discount_points,
      loan_amount: loan.amount,
      base_rate: loan.base_rate ?? undefined,
      annual_taxes: loan.annual_taxes,
      annual_insurance: loan.annual_insurance,
      monthly_hoa: loan.monthly_hoa,
      term_months: loan.term_months,
      monthly_rent: loan.monthly_rent,
      purpose: loan.purpose,
      arv: loan.arv,
      ltv: loan.ltv ?? undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loan?.id, loan?.amount, loan?.base_rate, loan?.discount_points, loan?.annual_taxes, loan?.annual_insurance, loan?.monthly_hoa, loan?.term_months, loan?.monthly_rent, loan?.purpose, loan?.arv, loan?.ltv]);

  // Subscribe to live message updates so the AI rail / messages are realtime
  useDealChannel(params.id, loan?.deal_id ?? null);

  // ⚠️ Hooks must run on every render — keep all useMemo calls BEFORE
  // the early `if (!loan)` return. Previously these three useMemos
  // sat after the return and triggered React error #310 (rendered
  // more hooks than during the previous render) on the first paint
  // when loan was undefined.
  const missingCriteria = useMemo(
    () => loan ? getCriteriaItems(loan).filter((item) => !item.ready) : [],
    [loan],
  );
  const flaggedDocs = useMemo(() => docs.filter((doc) => doc.status === "flagged"), [docs]);
  const openDocs = useMemo(() => docs.filter((doc) => doc.status !== "verified"), [docs]);

  if (!loan) return <div className="sub">Loading…</div>;

  const isInternal = profile.role === Role.SUPER_ADMIN || profile.role === Role.LOAN_EXEC;
  const isAgent = profile.role === Role.BROKER;
  const tabs = isInternal ? INTERNAL_TABS : isAgent ? AGENT_TABS : CLIENT_TABS;
  const activeTab = tabs.some((item) => item.id === tab) ? tab : tabs[0].id;
  const completion = getFileCompletion(loan, docs);
  const stageIndex = completion.stage.index;
  // Blockers data for the popup that the file-completion strip opens.
  const warnings = recalc.data?.warnings ?? [];
  const totalBlockers = warnings.length + missingCriteria.length + flaggedDocs.length;
  const canTransitionStage = isInternal;
  // Docs + workflow edits are open to BROKER too — agents need to
  // request docs, mark complete, and upload-on-behalf on their own
  // files. The backend's per-document endpoints (PATCH /documents/{id},
  // POST /mark-verified, upload-init) already enforce loan-scope via
  // _scope_loan, so brokers can only touch their own deals.
  const canRequestDoc = isInternal || isAgent;
  const docsReceived = completion.docs.received;
  const openLoanArea = (nextTab: string, targetId?: string) => {
    setTab(nextTab);
    if (!targetId || typeof window === "undefined") return;
    window.setTimeout(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 90);
  };

  return (
    <div>
      <div className="ckhead">
        <div className="ckrow">
          <h1>{loan.address}</h1>
          <CellChip tone="mut" className="num">{loan.deal_id}</CellChip>
          <CellChip tone="acc">{FILE_STAGE_LABELS[stageIndex] ?? loan.stage}</CellChip>
          <CellChip tone={completion.score >= 80 ? "ok" : completion.score >= 60 ? "warn" : "bad"}>{completion.label}</CellChip>
          <span className="sp" />
          <span className="sub">{loan.entity_name || client?.name || loan.client_name} · {loan.type.replaceAll("_", " ")} · {QC_FMT.short(Number(loan.amount))}</span>
          <Btn variant="pri" size="sm" onClick={() => setShowBlockers(true)}>
            <Icon name="docCheck" size={13} /> Review readiness{totalBlockers ? ` (${totalBlockers})` : ""}
          </Btn>
          <PageActionMenu
            label="Funding file actions"
            items={[
              { label: "Email client", onSelect: () => setEmailClientOpen(true), hidden: !canEmailClient },
              { label: loan.broker_id ? "Reassign desk" : "Assign desk", onSelect: () => setAgentPickerOpen(true), hidden: !isInternal },
              { label: "Open Elara", onSelect: () => setAiOpen(true) },
              { label: "Open lender chat", onSelect: () => setTab("thread"), hidden: !isInternal },
            ]}
          />
          {agentPickerOpen ? (
            <span className="popwrap">
              <LoanAgentPicker loan={loan} onClose={() => setAgentPickerOpen(false)} />
            </span>
          ) : null}
        </div>
        <div className="cktabs">
          <Seg
            as="tabs"
            ariaLabel="Loan sections"
            value={activeTab}
            onChange={(next) => openLoanArea(next)}
            options={tabs.map((tabDef) => ({
              value: tabDef.id as string,
              label: (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Icon name={tabDef.icon} size={13} />
                  {tabDef.label}
                  {tabDef.id === "docs" && docs.length > 0 ? (
                    <span className="tag num">{docsReceived}/{docs.length}</span>
                  ) : null}
                </span>
              ),
            }))}
          />
        </div>
      </div>

      {activeTab === "file" && (
        <FundingFileTab loan={loan} docs={docs} activity={activity} canEdit={canTransitionStage} onOpenTab={openLoanArea} />
      )}
      {activeTab === "verification" && <ApplicationVerificationWorkspace sourceKind="loan" sourceId={loan.id} />}
      {activeTab === "agent" && <AgentLoanMirror loan={loan} docs={docs} activity={activity} />}
      {activeTab === "messages" && currentUser && (
        <ClientLoanChatTab loanId={loan.id} user={currentUser} />
      )}
      {activeTab === "overview" && <OverviewTab loan={loan} docs={docs} activity={activity} />}
      {activeTab === "terms" &&
        (profile.role === Role.CLIENT ? <LoanSimulator loan={loan} /> : <TermsTab loan={loan} />)}
      {activeTab === "hud" && <HudTab loan={loan} />}
      {activeTab === "docs" && <DocsTab loan={loan} canRequest={canRequestDoc} />}
      {activeTab === "workflow" && <WorkflowTab loan={loan} canEdit={canRequestDoc} />}
      {/* "uw" tab removed — Underwriting content lives in Funding File. */}
      {/* Property tab removed — content now embedded in FundingFileTab. */}
      {activeTab === "wire" && <WireClosingTab loan={loan} />}
      {activeTab === "prequal" && <PrequalTab loan={loan} />}
      {activeTab === "workspace" && <DealWorkspaceTab loanId={loan.id} onOpenTab={openLoanArea} />}
      {activeTab === "loan_chat" && currentUser && (
        <LoanChatTab loanId={loan.id} user={currentUser} />
      )}
      {activeTab === "thread" && (
        <div>
          {/* Thread participants + Pending drafts now render INSIDE
              LenderConnectCard's right column (LenderThread), so the
              whole lender file lives in a single section. */}
          <LenderConnectCard loan={loan} />
        </div>
      )}
      {activeTab === "emails" && (
        <EmailsBreadcrumbTab
          rows={activity.map((a) => ({ id: a.id, kind: a.kind, summary: a.summary, payload: a.payload, occurredAt: a.occurred_at }))}
          isLoading={activityLoading}
        />
      )}
      {activeTab === "activity" && <ActivityTab activity={activity} isLoading={activityLoading} />}
      {activeTab === "todo" && <ClientTodoTab loanId={loan.id} />}

      {showBlockers ? (
        <FileBlockersPopup
          onClose={() => setShowBlockers(false)}
          warnings={warnings}
          missingCriteria={missingCriteria}
          flaggedDocs={flaggedDocs}
          openDocs={openDocs}
          onOpenTab={(targetTab, _targetId) => openLoanArea(targetTab)}
          onCriteriaJump={() => openLoanArea("terms")}
        />
      ) : null}
      {loan ? (
        <EmailComposer
          open={emailClientOpen}
          onClose={() => setEmailClientOpen(false)}
          title="Email the client"
          defaultTo={client?.email || ""}
          toReadonly
          defaultSubject={loan.deal_id ? `Update on your file [QC-${loan.deal_id}]` : "Update on your file"}
          helpText="Sends from your connected Gmail (firm email fallback). Replies thread back into this loan. Logged on the loan and client record."
          onSend={async (payload) => {
            const res = await sendClientEmail.mutateAsync({
              loanId: loan.id,
              subject: payload.subject,
              body: payload.body,
              cc_emails: payload.cc_emails,
            });
            return { ok: res.ok, detail: res.detail };
          }}
        />
      ) : null}
    </div>
  );
}

function CompletionDial({ score, label }: { score: number; label: string }) {
  // The sweep angle and its tone are the data — they stay inline. Everything
  // else the dial needs is a token.
  const color = score >= 80 ? "var(--ok)" : score >= 60 ? "var(--warn)" : "var(--accent)";
  return (
    <div
      title={label}
      style={{
        width: 68,
        height: 68,
        borderRadius: 999,
        background: `conic-gradient(${color} ${score * 3.6}deg, var(--line) 0deg)`,
        display: "grid",
        placeItems: "center",
        boxShadow: "inset 0 0 0 1px var(--line)",
      }}
    >
      <div
        className="num"
        style={{
          width: 52,
          height: 52,
          borderRadius: 999,
          background: "var(--surface)",
          display: "grid",
          placeItems: "center",
          color,
          fontSize: 18,
          fontWeight: 900,
        }}
      >
        {score}%
      </div>
    </div>
  );
}

// Borrower presence pill — green dot when the client has signed into
// the app recently (last_seen_at within ONLINE_WINDOW_SEC), gray dot
// with relative time otherwise. NULL = "Never signed in" so the
// operator knows the borrower portal hasn't been opened yet.
const ONLINE_WINDOW_SEC = 5 * 60; // 5-minute "online" window

function PresencePill({ lastSeenAt }: { lastSeenAt: string | null }) {
  if (lastSeenAt === null) {
    return (
      <Chip dotColor="var(--faint)" title="Borrower hasn't opened the app yet">
        Not signed in
      </Chip>
    );
  }
  const last = new Date(lastSeenAt);
  const ageSec = Math.max(0, Math.round((Date.now() - last.getTime()) / 1000));
  const online = ageSec < ONLINE_WINDOW_SEC;
  const relative = formatPresenceAge(ageSec);
  return (
    <Chip
      dotColor={online ? "var(--ok)" : "var(--faint)"}
      title={`Last seen ${last.toLocaleString()}`}
    >
      {online ? "Online" : `${relative} ago`}
    </Chip>
  );
}


function formatPresenceAge(seconds: number): string {
  if (seconds < 60) return "just now";
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return `${Math.floor(d / 30)}mo`;
}


function HeaderStat({ label, value }: { label: string; value: string | number }) {
  // Same three tiles, now a real `.kpi` — the header stat and the KPI band
  // elsewhere in the console were always the same object drawn twice.
  return <Kpi label={label} value={value} />;
}


// ── Compact stage strip + auto-status pill + completion actions ───────
//
// Replaces the wide 6-dot stepper and the manual "Move file stage"
// dropdown. The status auto-derives from observable file state:
//
//   • Collecting docs   — docs/conditions still outstanding
//   • Processing        — docs done, no lender yet
//   • Lender connected  — loan.lender_id present
//   • Closing / Funded  — stage manually flipped past lender_connected
//
// Once a lender is assigned, the strip swaps to two big action buttons:
// "Mark Funded" + "Did not process" — the only two ways a deal really
// ends. "Did not process" prompts for a reason before flipping the
// stage so the audit trail captures why.

import type { Document as DocumentType, Loan as LoanType } from "@/lib/types";
type StageMutation = ReturnType<typeof useStageTransition>;
type StageValue = typeof LoanStageOptions[number]["value"];

// The auto-status tones map onto the shared chip vocabulary rather than a
// second private palette — "this is fine / watch it / it is broken" has to be
// the same word here as it is in a table cell.
const STATUS_TONE: Record<"ready" | "watch" | "danger" | "brand" | "muted", ChipTone> = {
  ready: "ok",
  watch: "warn",
  danger: "bad",
  brand: "acc",
  muted: "mut",
};

// Wrapper that owns the updateLoan mutation for the "Did not process"
// path — separate from CompactStageStrip so the stage hook stays
// decoupled from the outcome path.
function CompactStageStripWrapper(props: {
  loan: LoanType;
  completion: ReturnType<typeof import("./fileReadiness").getFileCompletion>;
  docs: DocumentType[];
  stageIndex: number;
  canEdit: boolean;
  stageMut: StageMutation;
  onCopilot: () => void;
  onOpenLoanChat: () => void;
}) {
  const updateLoan = useUpdateLoan();
  return <CompactStageStrip {...props} updateLoan={updateLoan} />;
}

function CompactStageStrip({
  loan, completion, docs, stageIndex, canEdit, stageMut, updateLoan, onCopilot, onOpenLoanChat,
}: {
  loan: LoanType;
  completion: ReturnType<typeof import("./fileReadiness").getFileCompletion>;
  docs: DocumentType[];
  stageIndex: number;
  canEdit: boolean;
  stageMut: StageMutation;
  updateLoan: ReturnType<typeof useUpdateLoan>;
  onOpenLoanChat: () => void;
  onCopilot: () => void;
}) {
  void docs;

  // Auto-derive what the file *is* doing right now. Stage on the loan
  // is the source of truth for closing/funded; everything before that
  // is recomputed from observable state so it stays honest even when
  // the operator hasn't manually pushed the file forward.
  const autoStatus = deriveAutoStatus(loan, completion);

  // Convenience for the "Did not process" reason prompt.
  const markFunded = () => {
    if (!canEdit) return;
    stageMut.mutate({ loanId: loan.id, new_stage: "funded" as StageValue, note: "Marked funded from header" });
  };
  const markDidNotProcess = () => {
    if (!canEdit) return;
    const reason = window.prompt("Reason this loan did not process (required for audit):") ?? "";
    if (!reason.trim()) return;
    // No dedicated "lost" stage in the canonical pipeline — we capture
    // the operator's reason in status_summary so the activity log + the
    // pipeline header both reflect it. Promoting this to a real outcome
    // column is a follow-up.
    updateLoan.mutate({ loanId: loan.id, status_summary: `Did not process — ${reason.trim()}` });
  };

  const tone = autoStatus.tone;
  const showCompletionActions = !!loan.lender_id && (loan.stage === "lender_connected" || loan.stage === "closing");

  return (
    <div className="row mt">
      {/* Live status pill */}
      <CellChip tone={STATUS_TONE[tone]}>
        <span
          className="repdot"
          style={{
            background: "currentColor",
            animation: autoStatus.pulse ? "qcPulse 1.6s ease-in-out infinite" : undefined,
          }}
        />
        {autoStatus.label}
      </CellChip>
      <span className="sp sub">{autoStatus.hint}</span>

      {/* Mini stage strip — 6 tiny dots, current one labeled. The dot
          colours are the data (done / current / not reached), so they stay
          inline; only the palette moved onto tokens. */}
      <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {FILE_STAGE_KEYS.map((s, i) => {
          const done = i < stageIndex;
          const active = i === stageIndex;
          const color = done ? "var(--ok)" : active ? "var(--accent)" : "var(--line2)";
          return (
            <Fragment key={s}>
              <span
                title={FILE_STAGE_LABELS[i]}
                style={{
                  width: active ? 9 : 7, height: active ? 9 : 7,
                  borderRadius: 999, background: color,
                  boxShadow: active ? "0 0 0 3px var(--accent-100)" : "none",
                }}
              />
              {i < FILE_STAGE_KEYS.length - 1 ? (
                <span style={{ width: 14, height: 2, background: done ? "var(--ok)" : "var(--line2)", borderRadius: 999 }} />
              ) : null}
            </Fragment>
          );
        })}
        <span className="lbl">{FILE_STAGE_LABELS[stageIndex]}</span>
      </div>

      <div className="pgacts">
        {showCompletionActions && canEdit ? (
          <>
            <Btn onClick={markDidNotProcess} disabled={stageMut.isPending}>
              Did not process
            </Btn>
            <Btn variant="pri" onClick={markFunded} disabled={stageMut.isPending}>
              <Icon name="check" size={12} /> Mark Funded
            </Btn>
          </>
        ) : null}
        <IconBtn
          onClick={onOpenLoanChat}
          title="Open the chat (AI ↔ borrower) on this file"
          aria-label="Open chat"
        >
          <Icon name="chat" size={14} stroke={2.2} />
        </IconBtn>
        <Btn onClick={onCopilot}>
          <Icon name="sparkles" size={12} /> Elara
        </Btn>
      </div>

      {stageMut.isError ? (
        // width:100% is the flex-row line break — the message has to own its
        // own line, and `.statusline` carries the tone.
        <div className="statusline c-bad" style={{ width: "100%" }}>
          {stageMut.error instanceof Error ? stageMut.error.message : "Failed to update stage"}
        </div>
      ) : null}

      <style jsx>{`
        @keyframes qcPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.35); opacity: 0.55; }
        }
      `}</style>
    </div>
  );
}


function deriveAutoStatus(
  loan: LoanType,
  completion: ReturnType<typeof import("./fileReadiness").getFileCompletion>,
): { label: string; hint: string; tone: "ready" | "watch" | "danger" | "brand" | "muted"; pulse: boolean } {
  // Terminal states first — operator-set, take precedence.
  if (loan.stage === "funded") {
    return { label: "Funded", hint: "Loan funded — celebration noises.", tone: "ready", pulse: false };
  }
  // Did-not-process is captured via status_summary (no dedicated stage
  // in the canonical pipeline). If the operator wrote that summary we
  // surface it as terminal here.
  if (loan.status_summary?.startsWith("Did not process")) {
    return { label: "Did not process", hint: loan.status_summary, tone: "muted", pulse: false };
  }
  if (loan.stage === "closing") {
    return { label: "Closing", hint: "Lender connected — wire + closing docs in flight.", tone: "brand", pulse: true };
  }

  // Lender phase — strongest signal is the lender_id on the loan.
  if (loan.lender_id) {
    return {
      label: "Lender connected",
      hint: "Lender has the file. Ready to mark Funded or report did-not-process.",
      tone: "brand",
      pulse: true,
    };
  }

  // Doc + criteria readiness — the trigger that moves us out of
  // collection. completion.docs gives total/verified counts; criteria
  // gives ready/total. Both must be at full coverage to count as
  // "ready for lender."
  const docsReady = completion.docs.total > 0
    && completion.docs.verified >= completion.docs.total;
  const criteriaReady = completion.criteria.total > 0
    && completion.criteria.ready >= completion.criteria.total;

  if (docsReady && criteriaReady) {
    return {
      label: "Processing",
      hint: "Docs + criteria complete. Pick a lender on the Lender tab to advance.",
      tone: "watch",
      pulse: true,
    };
  }

  // Default — we're still collecting.
  const remainingDocs = Math.max(0, (completion.docs.total || 0) - completion.docs.verified);
  const remainingCrit = Math.max(0, (completion.criteria.total || 0) - completion.criteria.ready);
  const parts: string[] = [];
  if (remainingCrit) parts.push(`${remainingCrit} criteria`);
  if (remainingDocs) parts.push(`${remainingDocs} docs`);
  return {
    label: "Collecting docs",
    hint: parts.length ? `Waiting on ${parts.join(" + ")}. Status flips to Processing when both reach zero.` : "Waiting on borrower uploads.",
    tone: "watch",
    pulse: true,
  };
}
