"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, StageBadge } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useDocuments, useLoan, useLoanActivity, useStageTransition } from "@/hooks/useApi";
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
import { UnderwritingTab } from "./tabs/UnderwritingTab";
import { PropertyTab } from "./tabs/PropertyTab";
import { WireClosingTab } from "./tabs/WireClosingTab";
import { ActivityTab } from "./tabs/ActivityTab";
import { DealWorkspaceTab } from "./tabs/DealWorkspaceTab";
import { PrequalTab } from "./tabs/PrequalTab";
import { DealHealthPill } from "./components/DealHealthPill";
import { LenderConnectCard } from "./components/LenderConnectCard";
import { ParticipantsCard } from "./components/ParticipantsCard";
import { EmailDraftsCard } from "./components/EmailDraftsCard";

const INTERNAL_TABS = [
  { id: "file", label: "Funding File", icon: "file" as const },
  { id: "terms", label: "Criteria", icon: "sliders" as const },
  { id: "property", label: "Property", icon: "building2" as const },
  { id: "docs", label: "Documents", icon: "doc" as const },
  { id: "workflow", label: "Conditions", icon: "cal" as const },
  { id: "prequal", label: "Pre-Qual", icon: "docCheck" as const },
  { id: "uw", label: "Underwriting", icon: "shield" as const },
  { id: "workspace", label: "AI Workspace", icon: "ai" as const },
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

const STAGE_KEYS = ["prequalified", "collecting_docs", "lender_connected", "processing", "closing", "funded"];

export default function LoanDetailPage() {
  const params = useParams<{ id: string }>();
  const { t } = useTheme();
  const profile = useActiveProfile();
  const setAiOpen = useUI((s) => s.setAiOpen);
  const { data: loan } = useLoan(params.id);
  const { data: docs = [] } = useDocuments(params.id);
  const { data: activity = [], isLoading: activityLoading } = useLoanActivity(params.id);
  const stageMut = useStageTransition();
  const [tab, setTab] = useState<string>(
    profile.role === Role.CLIENT ? "overview" : profile.role === Role.BROKER ? "agent" : "file",
  );
  const [stageNote, setStageNote] = useState("");

  // Subscribe to live message updates so the AI rail / messages are realtime
  useDealChannel(params.id, loan?.deal_id ?? null);

  if (!loan) return <div style={{ color: t.ink3 }}>Loading…</div>;

  const isInternal = profile.role === Role.SUPER_ADMIN || profile.role === Role.LOAN_EXEC;
  const isAgent = profile.role === Role.BROKER;
  const tabs = isInternal ? INTERNAL_TABS : isAgent ? AGENT_TABS : CLIENT_TABS;
  const activeTab = tabs.some((item) => item.id === tab) ? tab : tabs[0].id;
  const stageIndex = STAGE_KEYS.indexOf(loan.stage);
  const canTransitionStage = isInternal;
  const canRequestDoc = isInternal;
  const docsReceived = docs.filter((d) => d.status === "received" || d.status === "verified").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Hero */}
      <Card pad={20}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: t.ink3, letterSpacing: 1.4, fontFamily: "ui-monospace, SF Mono, monospace" }}>{loan.deal_id}</span>
              <StageBadge stage={stageIndex} />
              <Pill>{loan.type.replace("_", " ")}</Pill>
              <DealHealthPill health={loan.deal_health} />
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: t.ink, margin: "6px 0 4px", letterSpacing: -0.6 }}>
              {loan.address}
            </h1>
            <div style={{ fontSize: 13, color: t.ink2 }}>
              {loan.city ?? "—"} · {QC_FMT.short(Number(loan.amount))} ·{" "}
              {loan.close_date ? `Close ${new Date(loan.close_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "—"}
            </div>
          </div>

          {/* Right rail summary card */}
          <div style={{ width: 320, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{
              border: `1px solid ${t.line}`, borderRadius: 12, padding: 14, background: t.surface2,
            }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase" }}>Loan amount</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: t.ink, marginTop: 2, fontFeatureSettings: '"tnum"' }}>{QC_FMT.usd(Number(loan.amount))}</div>
              {isInternal ? (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 12 }}>
                    <Mini t={t} label="Rate" value={loan.final_rate ? `${(loan.final_rate * 100).toFixed(3)}%` : "—"} />
                    <Mini t={t} label="LTV" value={loan.ltv ? `${(loan.ltv * 100).toFixed(0)}%` : "—"} />
                    <Mini t={t} label="Points" value={loan.discount_points.toFixed(2)} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 8 }}>
                    <Mini t={t} label="Term" value={loan.term_months ? `${loan.term_months}mo` : "—"} />
                    <Mini t={t} label="Close" value={loan.close_date ? new Date(loan.close_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"} />
                    <Mini t={t} label="Risk" value={loan.risk_score ?? "—"} accent={loan.risk_score && loan.risk_score >= 80 ? t.profit : t.warn} />
                  </div>
                </>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 12 }}>
                  <Mini t={t} label="Docs" value={`${docsReceived}/${docs.length || 0}`} />
                  <Mini t={t} label="Close" value={loan.close_date ? new Date(loan.close_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"} />
                  <Mini t={t} label="Stage" value={stageIndex >= 0 ? `${stageIndex + 1}/6` : "—"} />
                </div>
              )}
            </div>
            <button onClick={() => setAiOpen(true)} style={{
              padding: "10px 14px", borderRadius: 10, background: t.petrolSoft, color: t.petrol,
              fontSize: 13, fontWeight: 700,
              border: `1px solid ${t.petrol}40`, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
              cursor: "pointer",
            }}>
              <Icon name="sparkles" size={14} /> Ask co-pilot about this loan
            </button>
          </div>
        </div>

        {/* Stage stepper */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6, marginTop: 18 }}>
          {STAGE_KEYS.map((s, i) => (
            <div key={s} style={{
              height: 6, borderRadius: 3,
              background: i <= stageIndex ? t.brand : t.line,
            }} />
          ))}
        </div>

        {/* Stage transition control */}
        {canTransitionStage && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, paddingTop: 14, borderTop: `1px dashed ${t.line}`, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: t.ink3 }}>Move stage</span>
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
                padding: "8px 10px", borderRadius: 8, background: t.surface2,
                border: `1px solid ${t.line}`, color: t.ink, fontSize: 12, fontFamily: "inherit",
              }}
            >
              <option value="">Select target stage…</option>
              {LoanStageOptions
                .filter((o) => o.value !== loan.stage)
                .map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <input
              value={stageNote}
              onChange={(e) => setStageNote(e.target.value)}
              placeholder="Note (optional)"
              style={{
                flex: 1, minWidth: 200, padding: "8px 10px", borderRadius: 8, background: t.surface2,
                border: `1px solid ${t.line}`, color: t.ink, fontSize: 12, fontFamily: "inherit", outline: "none",
              }}
            />
            {stageMut.isError && (
              <span style={{ fontSize: 11, color: t.danger, fontWeight: 700 }}>
                {stageMut.error instanceof Error ? stageMut.error.message : "Failed"}
              </span>
            )}
            {stageMut.isPending && <span style={{ fontSize: 11, color: t.ink3, fontWeight: 600 }}>Moving…</span>}
          </div>
        )}
      </Card>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${t.line}`, overflowX: "auto" }}>
        {tabs.map((tabDef) => {
          const active = activeTab === tabDef.id;
          const isDocs = tabDef.id === "docs";
          return (
            <button
              key={tabDef.id}
              onClick={() => setTab(tabDef.id)}
              style={{
                padding: "10px 14px",
                borderBottom: `2px solid ${active ? t.brand : "transparent"}`,
                color: active ? t.ink : t.ink3,
                fontSize: 13, fontWeight: 700,
                background: "transparent", border: "none", cursor: "pointer",
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

      {activeTab === "file" && <FundingFileTab loan={loan} docs={docs} activity={activity} />}
      {activeTab === "agent" && <AgentLoanMirror loan={loan} docs={docs} activity={activity} />}
      {activeTab === "overview" && <OverviewTab loan={loan} docs={docs} activity={activity} />}
      {activeTab === "terms" &&
        (profile.role === Role.CLIENT ? <LoanSimulator loan={loan} /> : <TermsTab loan={loan} />)}
      {activeTab === "hud" && <Hud1Tab loan={loan} />}
      {activeTab === "docs" && <DocsTab loan={loan} canRequest={canRequestDoc} />}
      {activeTab === "workflow" && <WorkflowTab loan={loan} canEdit={canRequestDoc} />}
      {activeTab === "uw" && <UnderwritingTab loan={loan} />}
      {activeTab === "property" && <PropertyTab loan={loan} canEdit={canTransitionStage} />}
      {activeTab === "wire" && <WireClosingTab loan={loan} />}
      {activeTab === "prequal" && <PrequalTab loan={loan} />}
      {activeTab === "workspace" && <DealWorkspaceTab loanId={loan.id} />}
      {activeTab === "thread" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <LenderConnectCard loan={loan} />
          <ParticipantsCard loanId={loan.id} />
          <EmailDraftsCard loanId={loan.id} />
        </div>
      )}
      {activeTab === "activity" && <ActivityTab activity={activity} isLoading={activityLoading} />}
    </div>
  );
}

function Mini({ t, label, value, accent }: { t: ReturnType<typeof useTheme>["t"]; label: string; value: string | number; accent?: string }) {
  return (
    <div>
      <div style={{ fontSize: 9.5, fontWeight: 700, color: t.ink3, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color: accent ?? t.ink, marginTop: 2, fontFeatureSettings: '"tnum"' }}>{value}</div>
    </div>
  );
}
