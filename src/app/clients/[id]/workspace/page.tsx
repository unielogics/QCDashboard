"use client";

// Unified Client Workspace orchestrator (Phase 2+).
//
// Reads tab/dealId/fundingFileId/loanId from the URL, asks the server
// for the aggregate WorkspaceData (which carries role_permissions +
// recommended_tab), then renders ClientWorkspaceHeader + tab strip +
// the active panel.
//
// When NEXT_PUBLIC_WORKSPACE_V2 is off, falls back to today's 5-tab
// layout (Overview / Properties / Activity / Documents / Notes) so
// intermediate phases never break existing behavior.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { useUI } from "@/store/ui";
import { Card } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import {
  useClient,
  useClientWorkspace,
  useCurrentUser,
  useFindOrCreateChatThread,
  useMarkClientFinanceReady,
  useRequestPrequalification,
} from "@/hooks/useApi";
import { StageStepper } from "@/components/StageStepper";
import { FollowUpRhythmModal } from "./components/FollowUpRhythmModal";
import { ClientWorkspaceHeader } from "./components/ClientWorkspaceHeader";
import { ClientWorkspaceTabs, type TabSpec } from "./components/ClientWorkspaceTabs";
import { OverviewPanel } from "./components/OverviewPanel";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { ActivityPanel } from "./components/ActivityPanel";
import { DocumentsPanel } from "./components/DocumentsPanel";
import { NotesPanel } from "./components/NotesPanel";
import { DealsPanel } from "./components/DealsPanel";
import { FundingPanel } from "./components/FundingPanel";
import { TasksPanel } from "./components/TasksPanel";
import { AiFollowUpPanel } from "./components/AiFollowUpPanel";
import type { FollowUpSettings } from "@/components/FollowUpEditor";
import type { ClientStage } from "@/lib/enums.generated";
import type { WorkspaceTabId } from "@/lib/types";
import { isWorkspaceV2 } from "@/lib/featureFlags";

const V2_TABS: TabSpec[] = [
  { id: "overview", label: "Overview", icon: "home" },
  { id: "deals", label: "Deals", icon: "vault" },
  { id: "funding", label: "Funding", icon: "file" },
  { id: "tasks", label: "Tasks", icon: "doc" },
  { id: "ai-follow-up", label: "AI Follow-Up", icon: "spark" },
  { id: "documents", label: "Documents", icon: "doc" },
  { id: "activity", label: "Activity", icon: "trend" },
  { id: "notes", label: "Notes", icon: "chat" },
];

const LEGACY_TABS: TabSpec[] = [
  { id: "overview", label: "Overview", icon: "home" },
  { id: "properties", label: "Properties", icon: "vault" },
  { id: "activity", label: "Activity", icon: "trend" },
  { id: "documents", label: "Documents", icon: "doc" },
  { id: "notes", label: "Notes", icon: "chat" },
];

function extractFollowUp(raw: unknown): FollowUpSettings | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const fu = r.follow_up;
  if (!fu || typeof fu !== "object") return null;
  return fu as FollowUpSettings;
}

export default function ClientWorkspacePage() {
  const { t } = useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { id } = useParams<{ id: string }>();
  const v2 = isWorkspaceV2();

  const queryParams = useMemo(
    () => ({
      tab: searchParams.get("tab") ?? undefined,
      dealId: searchParams.get("dealId") ?? undefined,
      fundingFileId: searchParams.get("fundingFileId") ?? undefined,
      loanId: searchParams.get("loanId") ?? undefined,
    }),
    [searchParams],
  );

  const { data: client } = useClient(id);
  const { data: workspace } = useClientWorkspace(v2 ? id : null, queryParams);
  const { data: currentUser } = useCurrentUser();

  const findOrCreate = useFindOrCreateChatThread();
  const requestPrequal = useRequestPrequalification();
  const markReady = useMarkClientFinanceReady();
  const setAiOpen = useUI((s) => s.setAiOpen);
  const [busy, setBusy] = useState<string | null>(null);
  const [followUpOpen, setFollowUpOpen] = useState(false);

  const tabs = v2 ? V2_TABS : LEGACY_TABS;
  const role = currentUser?.role;

  const defaultTab = useMemo<WorkspaceTabId>(() => {
    // URL wins.
    const urlTab = queryParams.tab;
    if (urlTab && tabs.some((x) => x.id === (urlTab as WorkspaceTabId))) {
      return urlTab as WorkspaceTabId;
    }
    // Server recommendation, when it matches an enabled tab.
    const recommended = workspace?.selected_context.recommended_tab;
    if (recommended && tabs.some((x) => x.id === (recommended as WorkspaceTabId))) {
      return recommended as WorkspaceTabId;
    }
    // Role-derived fallback (v2 only — legacy keeps overview).
    if (!v2) return "overview";
    if (role === "super_admin" || role === "loan_exec") {
      return workspace && workspace.funding_files.length > 0 ? "funding" : "documents";
    }
    if (role === "broker") {
      if ((workspace?.ai_summary.outstanding_followups ?? 0) > 0) return "ai-follow-up";
      if ((workspace?.deals.length ?? 0) > 0) return "deals";
      if ((workspace?.funding_files.length ?? 0) > 0) return "funding";
      return "overview";
    }
    return "overview";
  }, [queryParams.tab, workspace, role, tabs, v2]);

  const [tab, setTab] = useState<WorkspaceTabId>(defaultTab);

  // Hydrate tab once workspace data arrives so the role-aware fallback
  // kicks in. Subsequent user clicks overwrite this via onChangeTab.
  useEffect(() => {
    setTab(defaultTab);
  }, [defaultTab]);

  function onChangeTab(next: WorkspaceTabId) {
    setTab(next);
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("tab", next);
    router.replace(`?${sp.toString()}`, { scroll: false });
  }

  if (!client) {
    return <div style={{ padding: 24, color: t.ink3, fontSize: 13 }}>Loading…</div>;
  }

  async function openChat() {
    setBusy("chat");
    try {
      await findOrCreate.mutateAsync({ client_id: id, loan_id: null });
      setAiOpen(true);
    } finally {
      setBusy(null);
    }
  }

  async function onMarkReady() {
    if (!confirm("Mark this client as ready for lending? The funding team will pick it up.")) return;
    setBusy("ready");
    try {
      await markReady.mutateAsync(id);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <Link
          href="/pipeline"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            fontWeight: 600,
            color: t.ink3,
            textDecoration: "none",
            padding: "4px 8px",
            borderRadius: 6,
            border: `1px solid ${t.line}`,
            background: t.surface,
          }}
        >
          <Icon name="chevL" size={11} /> Pipeline
        </Link>
      </div>

      {v2 && workspace ? (
        <ClientWorkspaceHeader
          data={workspace}
          busy={busy}
          onMarkReady={onMarkReady}
          onOpenChat={openChat}
          onConfigureFollowUp={() => setFollowUpOpen(true)}
        />
      ) : (
        // Legacy header — slimmed fallback for when v2 is off or the
        // workspace endpoint hasn't loaded yet.
        <Card pad={20}>
          <div style={{ fontSize: 22, fontWeight: 800, color: t.ink }}>{client.name}</div>
          <div style={{ fontSize: 13, color: t.ink3, marginTop: 4 }}>
            {client.email ?? "No email"} · {client.phone ?? "No phone"}
          </div>
        </Card>
      )}

      <FollowUpRhythmModal
        open={followUpOpen}
        onClose={() => setFollowUpOpen(false)}
        clientId={id}
        value={extractFollowUp(client.ai_cadence_override)}
        cadenceOverride={(client.ai_cadence_override ?? null) as Record<string, unknown> | null}
      />

      <StageStepper clientId={id} currentStage={client.stage as ClientStage} />

      <ClientWorkspaceTabs
        tabs={tabs}
        active={tab}
        onChange={onChangeTab}
        counts={workspace?.tab_counts}
      />

      {tab === "overview" ? <OverviewPanel clientId={id} client={client} /> : null}
      {tab === "properties" ? <PropertiesPanel clientId={id} client={client} /> : null}
      {tab === "deals" && workspace ? <DealsPanel clientId={id} data={workspace} /> : null}
      {tab === "funding" && workspace ? (
        <FundingPanel
          data={workspace}
          onSelect={(id) => onChangeTab("funding")}
        />
      ) : null}
      {tab === "tasks" && workspace ? <TasksPanel clientId={id} data={workspace} /> : null}
      {tab === "ai-follow-up" && workspace ? (
        <AiFollowUpPanel
          clientId={id}
          data={workspace}
          initialScope={{
            dealId: queryParams.dealId ?? null,
            loanId: queryParams.loanId ?? queryParams.fundingFileId ?? null,
          }}
        />
      ) : null}
      {tab === "documents" ? <DocumentsPanel clientId={id} /> : null}
      {tab === "activity" ? <ActivityPanel clientId={id} /> : null}
      {tab === "notes" ? <NotesPanel clientId={id} client={client} /> : null}
    </div>
  );
}
