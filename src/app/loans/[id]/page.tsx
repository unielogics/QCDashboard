"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Pill, StageBadge } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useClient, useDocuments, useLoan, useLoanActivity, useRecalc, useStageTransition, useUpdateLoan } from "@/hooks/useApi";
import { FileBlockersPopup } from "@/components/FileBlockersPopup";
import { getCriteriaItems } from "./fileReadiness";
import { useDealChannel } from "@/hooks/useDealChannel";
import { QC_FMT } from "@/components/design-system/tokens";
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
import { ParticipantsCard } from "./components/ParticipantsCard";
import { EmailDraftsCard } from "./components/EmailDraftsCard";
import { FILE_STAGE_KEYS, FILE_STAGE_LABELS, getFileCompletion } from "./fileReadiness";

const INTERNAL_TABS = [
  // Property tab merged into Funding File — property details now sit
  // inside the funding file alongside the rest of the deal foundation.
  // Underwriting tab also folded into Funding File since the UW
  // sizing + warnings panel is already part of the file-readiness view.
  { id: "file", label: "Funding File", icon: "file" as const },
  { id: "terms", label: "Criteria", icon: "sliders" as const },
  { id: "docs", label: "Documents", icon: "doc" as const },
  { id: "workflow", label: "Conditions", icon: "cal" as const },
  { id: "prequal", label: "Pre-Qual", icon: "docCheck" as const },
  { id: "hud", label: "HUD", icon: "file" as const },
  { id: "workspace", label: "AI Secretary", icon: "ai" as const },
  { id: "thread", label: "Lender", icon: "chat" as const },
  { id: "activity", label: "Activity", icon: "audit" as const },
] as const;

const AGENT_TABS = [
  { id: "agent", label: "Client Status", icon: "clients" as const },
  { id: "docs", label: "Documents", icon: "doc" as const },
  { id: "activity", label: "Updates", icon: "audit" as const },
] as const;

const CLIENT_TABS = [
  { id: "overview", label: "Overview", icon: "home" as const },
  { id: "terms", label: "Simulator", icon: "sliders" as const },
  { id: "docs", label: "Documents", icon: "doc" as const },
  { id: "activity", label: "Activity", icon: "audit" as const },
] as const;

export default function LoanDetailPage() {
  const params = useParams<{ id: string }>();
  const { t } = useTheme();
  const profile = useActiveProfile();
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
  // AI Secretary tab to configure the new file before doing anything
  // else. Honored once at mount; subsequent tab switches are user-driven.
  const searchParams = useSearchParams();
  const initialTabHint = searchParams?.get("tab") || null;
  const [tab, setTab] = useState<string>(
    initialTabHint ||
    (profile.role === Role.CLIENT ? "overview" : profile.role === Role.BROKER ? "agent" : "file"),
  );
  const [showBlockers, setShowBlockers] = useState(false);

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

  if (!loan) return <div style={{ color: t.ink3 }}>Loading…</div>;

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
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          border: `1px solid ${t.line}`,
          borderRadius: 16,
          background: `linear-gradient(180deg, ${t.surface}, ${t.surface2})`,
          boxShadow: t.shadow,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 430px",
            gap: 18,
            padding: "14px 16px 12px",
            alignItems: "center",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 800,
                  color: t.ink3,
                  letterSpacing: 1.4,
                  fontFamily: "ui-monospace, SF Mono, monospace",
                }}
              >
                {loan.deal_id}
              </span>
              <StageBadge stage={stageIndex} />
              <Pill>{loan.type.replace("_", " ")}</Pill>
              <DealHealthPill health={loan.deal_health} />
            </div>
            <h1
              style={{
                fontSize: 21,
                fontWeight: 850,
                color: t.ink,
                margin: "5px 0 3px",
                letterSpacing: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {loan.address}
            </h1>
            {/* Borrower meta strip — natural person + LLC + FICO. */}
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 12.5, color: t.ink2, marginBottom: 4 }}>
              {client?.name || loan.client_name ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <Icon name="user" size={11} stroke={2.2} />
                  <strong style={{ color: t.ink }}>{client?.name ?? loan.client_name}</strong>
                </span>
              ) : null}
              {loan.entity_name ? (
                <>
                  <span style={{ color: t.ink4 }}>·</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 9, fontWeight: 900, color: t.ink3, letterSpacing: 0.5 }}>LLC</span>
                    <span style={{ color: t.ink }}>{loan.entity_name}</span>
                  </span>
                </>
              ) : null}
              {(() => {
                const fico = loan.fico_override ?? client?.fico ?? null;
                if (fico == null) return null;
                const tone = fico >= 740 ? t.profit : fico >= 680 ? t.warn : t.danger;
                const toneBg = fico >= 740 ? t.profitBg : fico >= 680 ? t.warnBg : t.dangerBg;
                return (
                  <>
                    <span style={{ color: t.ink4 }}>·</span>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      padding: "2px 7px", borderRadius: 999,
                      background: toneBg, color: tone,
                      fontSize: 11, fontWeight: 900,
                    }}>
                      FICO {fico}
                    </span>
                  </>
                );
              })()}
              <PresencePill lastSeenAt={client?.last_seen_at ?? null} />
            </div>
            {/* Contact strip — email + phone with click-to-copy / tel/mailto links. */}
            {(client?.email || client?.phone) ? (
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 11.5, color: t.ink3, marginBottom: 4 }}>
                {client?.email ? (
                  <a
                    href={`mailto:${client.email}`}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      color: t.ink2, textDecoration: "none",
                    }}
                  >
                    <Icon name="mail" size={11} stroke={2.2} />
                    <span>{client.email}</span>
                  </a>
                ) : null}
                {client?.email && client?.phone ? (
                  <span style={{ color: t.ink4 }}>·</span>
                ) : null}
                {client?.phone ? (
                  <a
                    href={`tel:${client.phone.replace(/[^+\d]/g, "")}`}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      color: t.ink2, textDecoration: "none",
                    }}
                  >
                    <Icon name="phone" size={11} stroke={2.2} />
                    <span>{client.phone}</span>
                  </a>
                ) : null}
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 12.5, color: t.ink2 }}>
              <span>{loan.city ?? "No city"}</span>
              <span style={{ color: t.ink4 }}>/</span>
              <span>{QC_FMT.short(Number(loan.amount))}</span>
              <span style={{ color: t.ink4 }}>/</span>
              <span>{loan.close_date ? `Close ${new Date(loan.close_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "No close date"}</span>
              <span style={{ color: t.ink4 }}>/</span>
              <span>{docsReceived}/{docs.length || 0} docs received</span>
            </div>
          </div>

          {/* File completion is now click-to-open: the entire dial +
              progress + tile cluster opens FileBlockersPopup so the
              operator can see exactly what's left and jump to fix it.
              Replaces the separate "File Command + readiness map +
              Blockers column" the user asked us to remove. */}
          <button
            type="button"
            onClick={() => setShowBlockers(true)}
            title={totalBlockers > 0 ? `${totalBlockers} item${totalBlockers === 1 ? "" : "s"} blocking this file — click for details` : "All clear"}
            style={{
              all: "unset",
              cursor: "pointer",
              display: "grid",
              gridTemplateColumns: "72px minmax(0, 1fr)",
              gap: 14,
              alignItems: "center",
              padding: 4,
              margin: -4,
              borderRadius: 12,
            }}
          >
            <CompletionDial score={completion.score} label={completion.label} />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 850, color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase" }}>
                    File completion
                  </span>
                  {totalBlockers > 0 ? (
                    <span style={{
                      fontSize: 10, fontWeight: 900,
                      padding: "2px 6px", borderRadius: 4,
                      background: totalBlockers > 5 ? t.dangerBg : t.warnBg,
                      color: totalBlockers > 5 ? t.danger : t.warn,
                    }}>
                      ⚠ {totalBlockers}
                    </span>
                  ) : null}
                </div>
                <div style={{ fontSize: 12, fontWeight: 850, color: completion.score >= 80 ? t.profit : completion.score >= 60 ? t.warn : t.danger }}>
                  {completion.label}
                </div>
              </div>
              <div style={{ height: 8, borderRadius: 999, background: t.line, overflow: "hidden", marginTop: 8 }}>
                <div
                  style={{
                    width: `${completion.score}%`,
                    height: "100%",
                    borderRadius: 999,
                    background: completion.score >= 80 ? t.profit : completion.score >= 60 ? t.warn : t.brand,
                  }}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 9 }}>
                <HeaderStat label="Criteria" value={`${completion.criteria.ready}/${completion.criteria.total}`} />
                <HeaderStat label="Docs" value={`${completion.docs.verified}/${completion.docs.total || 0}`} />
                <HeaderStat label="Stage" value={`${completion.stage.index + 1}/${completion.stage.total}`} />
              </div>
            </div>
          </button>
        </div>

        {/* Compact stage strip + auto-status pill + action buttons.
            Replaces the fat numbered stepper and the manual "Move file
            stage" dropdown. Stage is now mostly auto-derived from the
            file's own state — operators only override at the very end
            (Funded / Did Not Process). */}
        <CompactStageStripWrapper
          loan={loan}
          completion={completion}
          docs={docs}
          stageIndex={stageIndex}
          canEdit={canTransitionStage}
          stageMut={stageMut}
          onCopilot={() => setAiOpen(true)}
        />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, padding: 6, border: `1px solid ${t.line}`, borderRadius: 14, background: t.surface, boxShadow: t.shadow, overflowX: "auto" }}>
        {tabs.map((tabDef) => {
          const active = activeTab === tabDef.id;
          const isDocs = tabDef.id === "docs";
          return (
            <button
              key={tabDef.id}
              onClick={() => openLoanArea(tabDef.id)}
              style={{
                padding: "9px 12px",
                borderRadius: 9,
                color: active ? t.inverse : t.ink3,
                fontSize: 13, fontWeight: 700,
                background: active ? t.brand : "transparent",
                border: `1px solid ${active ? t.brand : "transparent"}`,
                cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
              }}
            >
              <Icon name={tabDef.icon} size={13} />
              {tabDef.label}
              {isDocs && docs.length > 0 && (
                <span style={{
                  marginLeft: 4, padding: "1px 6px", borderRadius: 999,
                  background: t.chip, color: t.ink3, fontSize: 10, fontWeight: 800, fontFeatureSettings: '"tnum"',
                }}>
                  {docsReceived}/{docs.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeTab === "file" && (
        <FundingFileTab loan={loan} docs={docs} activity={activity} canEdit={canTransitionStage} onOpenTab={openLoanArea} />
      )}
      {activeTab === "agent" && <AgentLoanMirror loan={loan} docs={docs} activity={activity} />}
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
      {activeTab === "thread" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <LenderConnectCard loan={loan} />
          <ParticipantsCard loanId={loan.id} />
          <EmailDraftsCard loanId={loan.id} />
        </div>
      )}
      {activeTab === "activity" && <ActivityTab activity={activity} isLoading={activityLoading} />}

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
    </div>
  );
}

function CompletionDial({ score, label }: { score: number; label: string }) {
  const { t } = useTheme();
  const color = score >= 80 ? t.profit : score >= 60 ? t.warn : t.brand;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div
        title={label}
        style={{
          width: 68,
          height: 68,
          borderRadius: 999,
          background: `conic-gradient(${color} ${score * 3.6}deg, ${t.line} 0deg)`,
          display: "grid",
          placeItems: "center",
          boxShadow: `inset 0 0 0 1px ${t.line}`,
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 999,
            background: t.surface,
            display: "grid",
            placeItems: "center",
            color,
            fontSize: 18,
            fontWeight: 900,
            fontFeatureSettings: '"tnum"',
          }}
        >
          {score}%
        </div>
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
  const { t } = useTheme();
  if (lastSeenAt === null) {
    return (
      <>
        <span style={{ color: t.ink4 }}>·</span>
        <span
          title="Borrower hasn't opened the app yet"
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "2px 7px", borderRadius: 999,
            background: t.surface2, color: t.ink3,
            fontSize: 10.5, fontWeight: 800,
          }}
        >
          <span style={{
            width: 6, height: 6, borderRadius: 999,
            background: t.ink3, opacity: 0.5,
          }} />
          Not signed in
        </span>
      </>
    );
  }
  const last = new Date(lastSeenAt);
  const ageSec = Math.max(0, Math.round((Date.now() - last.getTime()) / 1000));
  const online = ageSec < ONLINE_WINDOW_SEC;
  const relative = formatPresenceAge(ageSec);
  return (
    <>
      <span style={{ color: t.ink4 }}>·</span>
      <span
        title={`Last seen ${last.toLocaleString()}`}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: "2px 8px", borderRadius: 999,
          background: online ? t.profitBg : t.surface2,
          color: online ? t.profit : t.ink3,
          fontSize: 10.5, fontWeight: 850,
        }}
      >
        <span style={{
          width: 7, height: 7, borderRadius: 999,
          background: online ? t.profit : t.ink3,
          boxShadow: online ? `0 0 0 3px ${t.profit}33` : "none",
        }} />
        {online ? "Online" : `${relative} ago`}
      </span>
    </>
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
  const { t } = useTheme();
  return (
    <div style={{ border: `1px solid ${t.line}`, borderRadius: 8, padding: "6px 8px", background: t.surface }}>
      <div style={{ fontSize: 9.5, fontWeight: 800, color: t.ink3, letterSpacing: 0.8, textTransform: "uppercase" }}>{label}</div>
      <div style={{ marginTop: 2, fontSize: 13, fontWeight: 900, color: t.ink, fontFeatureSettings: '"tnum"' }}>{value}</div>
    </div>
  );
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
}) {
  const updateLoan = useUpdateLoan();
  return <CompactStageStrip {...props} updateLoan={updateLoan} />;
}

function CompactStageStrip({
  loan, completion, docs, stageIndex, canEdit, stageMut, updateLoan, onCopilot,
}: {
  loan: LoanType;
  completion: ReturnType<typeof import("./fileReadiness").getFileCompletion>;
  docs: DocumentType[];
  stageIndex: number;
  canEdit: boolean;
  stageMut: StageMutation;
  updateLoan: ReturnType<typeof useUpdateLoan>;
  onCopilot: () => void;
}) {
  const { t } = useTheme();
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
    <div style={{
      display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      padding: "10px 14px",
      borderTop: `1px solid ${t.line}`,
      background: t.surface2,
    }}>
      {/* Live status pill */}
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 7,
        padding: "5px 11px",
        borderRadius: 999,
        background: tone === "ready" ? t.profitBg : tone === "watch" ? t.warnBg : tone === "danger" ? t.dangerBg : tone === "brand" ? t.brandSoft : t.surface,
        color: tone === "ready" ? t.profit : tone === "watch" ? t.warn : tone === "danger" ? t.danger : tone === "brand" ? t.brand : t.ink2,
        fontSize: 11.5, fontWeight: 900, letterSpacing: 0.2,
        whiteSpace: "nowrap",
      }}>
        <span style={{
          width: 7, height: 7, borderRadius: 999,
          background: tone === "ready" ? t.profit : tone === "watch" ? t.warn : tone === "danger" ? t.danger : tone === "brand" ? t.brand : t.ink2,
          animation: autoStatus.pulse ? "qcPulse 1.6s ease-in-out infinite" : undefined,
        }} />
        {autoStatus.label}
      </span>
      <span style={{ fontSize: 11.5, color: t.ink3, lineHeight: 1.3, minWidth: 0, flex: 1 }}>
        {autoStatus.hint}
      </span>

      {/* Mini stage strip — 6 tiny dots, current one labeled. */}
      <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {FILE_STAGE_KEYS.map((s, i) => {
          const done = i < stageIndex;
          const active = i === stageIndex;
          const color = done ? t.profit : active ? t.brand : t.line;
          return (
            <div key={s} title={FILE_STAGE_LABELS[i]} style={{
              display: "inline-flex", alignItems: "center", gap: 4,
            }}>
              <span style={{
                width: active ? 9 : 7, height: active ? 9 : 7,
                borderRadius: 999, background: color,
                boxShadow: active ? `0 0 0 3px ${t.brandSoft}` : "none",
              }} />
              {i < FILE_STAGE_KEYS.length - 1 ? (
                <span style={{ width: 14, height: 2, background: done ? t.profit : t.line, borderRadius: 999 }} />
              ) : null}
            </div>
          );
        })}
        <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 900, color: t.ink, letterSpacing: 0.3 }}>
          {FILE_STAGE_LABELS[stageIndex]}
        </span>
      </div>

      <div style={{ flex: "0 0 auto", display: "inline-flex", gap: 6 }}>
        {showCompletionActions && canEdit ? (
          <>
            <button
              onClick={markDidNotProcess}
              disabled={stageMut.isPending}
              style={{
                padding: "7px 12px", borderRadius: 9,
                background: t.surface, color: t.ink2,
                border: `1px solid ${t.lineStrong}`,
                fontSize: 12, fontWeight: 850,
                cursor: stageMut.isPending ? "wait" : "pointer",
                fontFamily: "inherit",
              }}
            >
              Did not process
            </button>
            <button
              onClick={markFunded}
              disabled={stageMut.isPending}
              style={{
                padding: "7px 12px", borderRadius: 9,
                background: t.profit, color: t.inverse,
                border: "none",
                fontSize: 12, fontWeight: 900,
                cursor: stageMut.isPending ? "wait" : "pointer",
                fontFamily: "inherit",
              }}
            >
              <Icon name="check" size={12} /> Mark Funded
            </button>
          </>
        ) : null}
        <button
          onClick={onCopilot}
          style={{
            padding: "7px 12px", borderRadius: 9,
            background: t.petrolSoft, color: t.petrol,
            border: `1px solid ${t.petrol}40`,
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5,
            fontSize: 12, fontWeight: 800,
            cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
          }}
        >
          <Icon name="sparkles" size={12} /> Co-pilot
        </button>
      </div>

      {stageMut.isError ? (
        <span style={{ width: "100%", fontSize: 11, color: t.danger, fontWeight: 800 }}>
          {stageMut.error instanceof Error ? stageMut.error.message : "Failed to update stage"}
        </span>
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
