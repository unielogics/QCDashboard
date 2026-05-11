"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Pill, StageBadge } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useDocuments, useLoan, useLoanActivity, useRecalc, useStageTransition } from "@/hooks/useApi";
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
import { Hud1Tab } from "./tabs/Hud1Tab";
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
  { id: "hud", label: "HUD-1", icon: "file" as const },
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
  const [stageNote, setStageNote] = useState("");
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

  if (!loan) return <div style={{ color: t.ink3 }}>Loading…</div>;

  const isInternal = profile.role === Role.SUPER_ADMIN || profile.role === Role.LOAN_EXEC;
  const isAgent = profile.role === Role.BROKER;
  const tabs = isInternal ? INTERNAL_TABS : isAgent ? AGENT_TABS : CLIENT_TABS;
  const activeTab = tabs.some((item) => item.id === tab) ? tab : tabs[0].id;
  const completion = getFileCompletion(loan, docs);
  const stageIndex = completion.stage.index;
  // Blockers data for the popup that the file-completion strip opens.
  const warnings = recalc.data?.warnings ?? [];
  const missingCriteria = useMemo(
    () => getCriteriaItems(loan).filter((item) => !item.ready),
    [loan],
  );
  const flaggedDocs = useMemo(() => docs.filter((doc) => doc.status === "flagged"), [docs]);
  const openDocs = useMemo(() => docs.filter((doc) => doc.status !== "verified"), [docs]);
  const totalBlockers = warnings.length + missingCriteria.length + flaggedDocs.length;
  const canTransitionStage = isInternal;
  const canRequestDoc = isInternal;
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

        {/* Visual stage stepper — replaces the thin-bar version that
            used to live here. Numbered dots, checkmarks for done stages,
            brand-colored active dot with halo. Same row, same height,
            but reads as a real pipeline at a glance. */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${FILE_STAGE_KEYS.length}, 1fr)`,
            borderTop: `1px solid ${t.line}`,
            padding: "14px 14px 12px",
            background: t.surface2,
          }}
        >
          {FILE_STAGE_KEYS.map((_stage, i) => {
            const done = i < stageIndex;
            const active = i === stageIndex;
            const dotBg = done ? t.profit : active ? t.brand : t.surface;
            const dotColor = done || active ? t.inverse : t.ink3;
            const dotBorder = done ? t.profit : active ? t.brand : t.line;
            return (
              <div
                key={_stage}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  minWidth: 0,
                  position: "relative",
                }}
              >
                {i > 0 ? (
                  <div style={{
                    position: "absolute", top: 14, left: 0, width: "50%",
                    height: 3, background: done ? t.profit : active ? t.brand : t.line,
                  }} />
                ) : null}
                {i < FILE_STAGE_KEYS.length - 1 ? (
                  <div style={{
                    position: "absolute", top: 14, right: 0, width: "50%",
                    height: 3, background: done ? t.profit : t.line,
                  }} />
                ) : null}
                <div style={{
                  position: "relative", zIndex: 1,
                  width: 30, height: 30, borderRadius: 999,
                  background: dotBg, color: dotColor,
                  border: `2px solid ${dotBorder}`,
                  display: "grid", placeItems: "center",
                  fontSize: 12.5, fontWeight: 900,
                  boxShadow: active ? `0 0 0 4px ${t.brandSoft}` : "none",
                }}>
                  {done ? "✓" : i + 1}
                </div>
                <div style={{
                  marginTop: 6,
                  fontSize: 10.5,
                  fontWeight: 900,
                  color: active ? t.brand : done ? t.ink : t.ink3,
                  letterSpacing: 0.3,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "100%",
                  textAlign: "center",
                }}>
                  {FILE_STAGE_LABELS[i]}
                </div>
                {active ? (
                  <div style={{ marginTop: 1, fontSize: 9, fontWeight: 800, color: t.brand, letterSpacing: 0.5, textTransform: "uppercase" }}>
                    Current
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {canTransitionStage && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "180px minmax(220px, 1fr) auto",
              gap: 10,
              padding: 12,
              borderTop: `1px solid ${t.line}`,
              alignItems: "center",
            }}
          >
            <select
              value=""
              onChange={(e) => {
                const next = e.target.value;
                if (!next) return;
                stageMut.mutate({
                  loanId: loan.id,
                  new_stage: next as typeof LoanStageOptions[number]["value"],
                  note: stageNote.trim() || null,
                });
                setStageNote("");
              }}
              disabled={stageMut.isPending}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                background: t.surface,
                border: `1px solid ${t.lineStrong}`,
                color: t.ink,
                fontSize: 12,
                fontFamily: "inherit",
              }}
            >
              <option value="">Move file stage</option>
              {LoanStageOptions
                .filter((o) => o.value !== loan.stage)
                .map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <input
              value={stageNote}
              onChange={(e) => setStageNote(e.target.value)}
              placeholder="Stage note before moving"
              style={{
                minWidth: 0,
                padding: "8px 10px",
                borderRadius: 8,
                background: t.surface,
                border: `1px solid ${t.line}`,
                color: t.ink,
                fontSize: 12,
                fontFamily: "inherit",
                outline: "none",
              }}
            />
            <button
              onClick={() => setAiOpen(true)}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                background: t.petrolSoft,
                color: t.petrol,
                fontSize: 12.5,
                fontWeight: 800,
                border: `1px solid ${t.petrol}40`,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              <Icon name="sparkles" size={13} /> Co-pilot
            </button>
            {stageMut.isError && (
              <span style={{ gridColumn: "1 / -1", fontSize: 11, color: t.danger, fontWeight: 800 }}>
                {stageMut.error instanceof Error ? stageMut.error.message : "Failed to move stage"}
              </span>
            )}
            {stageMut.isPending && <span style={{ gridColumn: "1 / -1", fontSize: 11, color: t.ink3, fontWeight: 700 }}>Moving stage...</span>}
          </div>
        )}
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
      {activeTab === "hud" && <Hud1Tab loan={loan} />}
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

function HeaderStat({ label, value }: { label: string; value: string | number }) {
  const { t } = useTheme();
  return (
    <div style={{ border: `1px solid ${t.line}`, borderRadius: 8, padding: "6px 8px", background: t.surface }}>
      <div style={{ fontSize: 9.5, fontWeight: 800, color: t.ink3, letterSpacing: 0.8, textTransform: "uppercase" }}>{label}</div>
      <div style={{ marginTop: 2, fontSize: 13, fontWeight: 900, color: t.ink, fontFeatureSettings: '"tnum"' }}>{value}</div>
    </div>
  );
}
