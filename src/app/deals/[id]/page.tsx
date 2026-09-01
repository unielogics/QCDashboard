"use client";

// /deals/[id] — the agent's working file. Mirrors /loans/[id]'s
// structure (slim header, tab strip, panel below) but with
// realtor-side content. Pre-promotion: agent's primary surface for
// listing/buyer-search work. Post-promotion: same surface continues,
// with a read-only Funding tab showing the linked loan's progress.

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { StageBadge } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { Btn, BtnLink, Callout, CellChip, Sub, Tag, cx } from "@/components/ds";
import { ActiveAgentStrip } from "@/components/ActiveAgentStrip";
import {
  useClient,
  useClientAiFollowUp,
  useCurrentUser,
  useDeal,
  useLoan,
  useMarkDealReadyForLending,
  useUnifiedOperatorFile,
  type MarkReadyResponse,
} from "@/hooks/useApi";
import { partitionFieldFill } from "./tabs/fieldFillRequirements";
import { AiStatusBadge } from "@/components/AiStatusBadge";
import { useActiveProfile } from "@/store/role";
import { Role } from "@/lib/enums.generated";
import { PropertyTab } from "./tabs/PropertyTab";
import { AISecretaryTab } from "./tabs/AISecretaryTab";
import { DocumentsTab } from "./tabs/DocumentsTab";
import { ScheduleTab } from "./tabs/ScheduleTab";
import { TasksTab } from "./tabs/TasksTab";
import { ActivityTab } from "./tabs/ActivityTab";
import { FundingTab } from "./tabs/FundingTab";
import { LoanOverviewTab } from "./tabs/LoanOverviewTab";
import { LoanChatTab } from "@/app/loans/[id]/components/LoanChatTab";
import { DealAgentChatTab } from "./components/DealAgentChatTab";
import { DealNotesFloatingButton, DealNotesPanel } from "@/components/DealNotesFloating";
import { PageActionMenu } from "@/components/ds/PageActionMenu";
import { Drawer } from "@/components/ds/Drawer";
import { BucketIntakeLinkDrawer } from "@/components/operator/UnifiedOperator";
import { UnifiedFileWorkspace } from "@/components/operator/UnifiedFileWorkspace";
import { ApplicationVerificationWorkspace } from "@/components/application/ApplicationVerificationWorkspace";

const TAB_ORDER = [
  { id: "file", label: "File", icon: "layers" as const },
  { id: "verification", label: "Verification", icon: "shieldChk" as const },
  { id: "property", label: "Property", icon: "home" as const },
  { id: "ai", label: "Elara", icon: "spark" as const },
  { id: "chat", label: "Chat", icon: "chat" as const },
  { id: "tasks", label: "Tasks", icon: "doc" as const },
  { id: "schedule", label: "Schedule", icon: "cal" as const },
  { id: "docs", label: "Documents", icon: "doc" as const },
  { id: "activity", label: "Activity", icon: "trend" as const },
];
// Notes is no longer a tab — it's the floating bottom-right widget
// (DealNotesFloatingButton + DealNotesPanel) mounted on this page.

export default function DealPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const profile = useActiveProfile();

  const { data: deal } = useDeal(params.id);
  const { data: unifiedDetail } = useUnifiedOperatorFile("deal", params.id);
  const { data: client } = useClient(deal?.client_id ?? null);
  const { data: loan } = useLoan(deal?.promoted_loan_id ?? null);
  // Needed by LoanChatTab for the broker composer + bubble alignment.
  const { data: currentUser } = useCurrentUser();
  // Field-fill counts: same view AISecretaryTab uses (react-query
  // dedups by key), filtered through partitionFieldFill so the tab
  // strip can badge Property + Loan Overview with the open count.
  const { data: secretaryView } = useClientAiFollowUp({
    clientId: deal?.client_id ?? "",
    dealId: deal?.promoted_loan_id ? null : deal?.id ?? null,
    loanId: deal?.promoted_loan_id ?? null,
  });
  const fieldFill = useMemo(() => {
    if (!secretaryView) return { property: [], borrower: [], credit: [] };
    const { fieldFill } = partitionFieldFill(secretaryView.left);
    return fieldFill;
  }, [secretaryView]);
  const propertyFieldCount = fieldFill.property.length;
  const borrowerPlusCreditCount = fieldFill.borrower.length + fieldFill.credit.length;

  const initialTab = searchParams?.get("tab") || "file";
  const [tab, setTab] = useState<string>(initialTab);
  const [busy, setBusy] = useState(false);
  const [handoffResult, setHandoffResult] = useState<MarkReadyResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [promoteReviewOpen, setPromoteReviewOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const markReady = useMarkDealReadyForLending(deal?.client_id ?? "");

  if (!deal) {
    return (
      <div className="content">
        <Sub>Loading…</Sub>
      </div>
    );
  }

  const isPromoted = !!deal.promoted_loan_id;
  const canPromote =
    profile.role === Role.BROKER ||
    profile.role === Role.SUPER_ADMIN ||
    profile.role === Role.LOAN_EXEC;
  const tabs = isPromoted
    ? [
        ...TAB_ORDER,
        { id: "loan", label: "Loan Overview", icon: "sliders" as const },
        { id: "funding", label: "Funding", icon: "file" as const },
      ]
    : TAB_ORDER;
  const activeTab = tabs.find((x) => x.id === tab)?.id ?? tabs[0].id;

  function onTabChange(next: string) {
    setTab(next);
    const sp = new URLSearchParams(searchParams?.toString() || "");
    sp.set("tab", next);
    router.replace(`?${sp.toString()}`, { scroll: false });
  }

  async function onMarkReady() {
    if (!deal || !canPromote) return;
    setPromoteReviewOpen(true);
  }

  async function confirmPromotion() {
    if (!deal || !canPromote) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await markReady.mutateAsync({ dealId: deal.id });
      setHandoffResult(r);
      setPromoteReviewOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't promote");
    } finally {
      setBusy(false);
    }
  }

  const headerSubLine = [
    deal.address || (client?.city ? `${client?.name} · ${client.city}` : client?.name),
    client?.fico ? `FICO ${client.fico}` : null,
    deal.list_price ? `List $${Number(deal.list_price).toLocaleString()}` : null,
    deal.target_price ? `Target $${Number(deal.target_price).toLocaleString()}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="ckhead">
        <div className="ckrow">
          <h1>{deal.title}</h1>
          <CellChip tone="mut" className="num">{unifiedDetail?.file.ref || deal.id.slice(0, 8)}</CellChip>
          <CellChip tone="acc">{unifiedDetail?.file.vertical_label || dealTypeLabel(deal.deal_type)}</CellChip>
          {unifiedDetail?.file.rep_name ? <CellChip tone="gold">{unifiedDetail.file.rep_name}</CellChip> : null}
          <CellChip tone={isPromoted ? "ok" : unifiedDetail?.gate.ready ? "acc" : "warn"}>{isPromoted ? "In funding" : unifiedDetail?.file.stage.label || deal.status}</CellChip>
          <span className="sp" />
          <span className="sub">{headerSubLine}</span>
          {isPromoted && loan ? <BtnLink href={`/loans/${loan.id}`} size="sm">Open funding workbench</BtnLink> : canPromote ? <Btn variant="pri" size="sm" onClick={onMarkReady} disabled={busy}>{busy ? "Promoting..." : "Ready for funding"}</Btn> : null}
          <PageActionMenu label="File actions" items={[
            { label: "Back to pipeline", href: "/pipeline" },
            { label: "Open client record", href: `/clients/${deal.client_id}` },
            { label: "Manage linked evidence", onSelect: () => setLinkOpen(true), hidden: !unifiedDetail?.file.bucket_id && !unifiedDetail?.file.intake_id },
          ]} />
        </div>
        <div className="cktabs" role="tablist" aria-label="Deal sections">
          {tabs.map((x) => {
            const isActive = activeTab === x.id;
            const badge =
              x.id === "property"
                ? propertyFieldCount
                : x.id === "loan"
                ? borrowerPlusCreditCount
                : 0;
            return (
              <button
                key={x.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={isActive ? "on" : undefined}
                onClick={() => onTabChange(x.id)}
              >
                {x.label}
                {badge > 0 ? <span className="tag">{badge}</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      {err ? <div className="warnline">{err}</div> : null}
      {handoffResult ? (
        <Callout tone="acc" icon={<Icon name="bolt" size={14} />}>
          <b style={{ fontSize: 13 }}>Funding file created</b>
          {handoffResult.handoff_summary ? (
            <div style={{ whiteSpace: "pre-wrap", fontSize: 12.5, margin: "4px 0" }}>
              {handoffResult.handoff_summary}
            </div>
          ) : null}
          {handoffResult.missing_lending_items.length > 0 ? (
            <Sub>
              <strong>Still needed:</strong>{" "}
              {handoffResult.missing_lending_items.slice(0, 5).join(", ")}
            </Sub>
          ) : null}
        </Callout>
      ) : null}

      {activeTab === "file" && unifiedDetail ? <UnifiedFileWorkspace detail={unifiedDetail} onManageEvidence={() => setLinkOpen(true)} /> : null}
      {activeTab === "file" && !unifiedDetail ? <div className="empty">Loading logical file...</div> : null}
      {activeTab === "verification" ? <ApplicationVerificationWorkspace sourceKind="deal" sourceId={deal.id} /> : null}

      {activeTab === "property" ? (
        <PropertyTab deal={deal} requiredFieldRows={fieldFill.property} />
      ) : null}
      {activeTab === "ai" ? (
        <AISecretaryTab
          clientId={deal.client_id}
          dealId={deal.id}
          loanId={deal.promoted_loan_id}
          onJumpToTab={(next) => onTabChange(next)}
        />
      ) : null}
      {activeTab === "docs" ? (
        <DocumentsTab clientId={deal.client_id} loanId={deal.promoted_loan_id} />
      ) : null}
      {activeTab === "chat" && currentUser ? (
        <div className="grid" style={{ gap: 16 }}>
          {/* (A) Agent thread — always present on a deal. Broker + client
              + AI converge here pre-funding and continue here for ongoing
              nurture post-funding. */}
          <DealAgentChatTab dealId={deal.id} user={currentUser} />
          {/* (L) Loan workspace — created on promotion, used by the
              funding/lending team. Surfaces alongside (A) so the broker
              can see both at a glance. */}
          {isPromoted && deal.promoted_loan_id ? (
            <LoanChatTab loanId={deal.promoted_loan_id} user={currentUser} />
          ) : (
            <PromoteHint
              canPromote={canPromote}
              isPending={busy}
              onMarkReady={onMarkReady}
            />
          )}
        </div>
      ) : null}
      {activeTab === "tasks" ? <TasksTab deal={deal} /> : null}
      {activeTab === "schedule" ? <ScheduleTab clientId={deal.client_id} dealId={deal.id} /> : null}
      {activeTab === "activity" ? <ActivityTab clientId={deal.client_id} /> : null}
      {activeTab === "loan" && loan ? (
        <LoanOverviewTab
          loan={loan}
          pendingBorrowerRows={fieldFill.borrower}
          pendingCreditRows={fieldFill.credit}
        />
      ) : null}
      {activeTab === "funding" && loan ? <FundingTab loan={loan} clientId={deal.client_id} /> : null}

      <Drawer
        open={promoteReviewOpen}
        onClose={() => setPromoteReviewOpen(false)}
        title="Review before running"
        sub="Ready for funding"
        width="md"
        closeOnBackdrop={!busy}
        footer={<><Btn onClick={() => setPromoteReviewOpen(false)} disabled={busy}>Cancel</Btn><span className="sp" /><Btn variant="pri" onClick={confirmPromotion} disabled={busy}>{busy ? "Creating funding file..." : "Send to funding"}</Btn></>}
      >
        <div className="grid">
          <div className="hintbox"><b>Effects</b><div className="sub">Creates the canonical funding file and preserves this real-estate deal as its source lineage.</div></div>
          <div className="kv"><span>File</span><b>{deal.title}</b></div>
          <div className="kv"><span>Actor</span><b>Current signed-in operator</b></div>
          <div className="kv"><span>Execution</span><b>Immediately after confirmation</b></div>
          <div className="kv"><span>Reversible</span><b>No · lineage remains in audit history</b></div>
          {err ? <div className="warnline">{err}</div> : null}
        </div>
      </Drawer>
      <BucketIntakeLinkDrawer open={linkOpen} onClose={() => setLinkOpen(false)} initialBucketId={unifiedDetail?.file.bucket_id} initialIntakeId={unifiedDetail?.file.intake_id} />

      {/* Floating Notes — bottom-right button + side panel */}
      <DealNotesFloatingButton dealId={deal.id} />
      <DealNotesPanel />
    </div>
  );
}

function PromoteHint({
  canPromote,
  isPending,
  onMarkReady,
}: {
  canPromote: boolean;
  isPending: boolean;
  onMarkReady: () => void;
}) {
  return (
    <div className="hintbox">
      <span className="hintbox-i">
        <Icon name="bolt" size={16} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <b style={{ fontSize: 13 }}>(L) Loan chat appears after funding handoff</b>
        <Sub>
          The funding-team thread is created on promotion and seeded with a summary of the (A) chat
          above so lending picks up where you left off.
        </Sub>
      </div>
      {canPromote ? (
        <Btn variant="pri" onClick={onMarkReady} disabled={isPending}>
          {isPending ? "Promoting…" : "Mark Ready"}
        </Btn>
      ) : null}
    </div>
  );
}

function dealTypeLabel(t: string): string {
  return ({ buyer: "Buyer Deal", seller: "Seller Deal", investor: "Investor Deal", borrower: "Borrower" } as Record<string, string>)[t] ?? t;
}

function aiStateOf(s: string): "deployed" | "paused" | "idle" {
  if (s === "active") return "deployed";
  if (s === "paused") return "paused";
  return "idle";
}

function loanStageIndex(stage: string): number {
  const order = ["prequalified", "collecting_docs", "lender_connected", "processing", "closing", "funded"];
  const idx = order.indexOf(stage);
  return idx < 0 ? 0 : idx;
}
