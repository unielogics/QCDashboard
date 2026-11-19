"use client";

// The desk's home: every AI intake file, and what is happening on them.
//
// The page this replaces led with the files and then spent most of its length
// on things that are not files: a Field Desk card, a loan funding band, market
// rates, a by-vertical table, and a queue of loan tasks nobody had written to
// since June. What the desk works is the intake files under Files, so this
// page is those files and nothing else — how many there are and where they
// stand, which ones are stuck, which moved most recently, what happened on
// them, and what their AI is waiting to be told. Money and readiness stay,
// because both are read off the same files, and the money leads: the deal
// economics strip is the first thing under the greeting.
//
// Only open files are worked here. A file that was lost, denied, withdrawn or
// archived drops out of every count, the queue, the suggestions and the
// activity feed (the API filters each; the suggestions on it close).

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Btn, BtnLink, CellChip, Empty, Loading, Panel, Seg, Table, Td, WarnLine, type Col } from "@/components/ds";
import { PageActionMenu } from "@/components/ds/PageActionMenu";
import { Icon } from "@/components/design-system/Icon";
import { FileCommunicationCounts } from "@/components/communications/FileCommunicationCounts";
import { lastActivityAt, sinceLabel } from "@/components/client/ClientFilesAndMessages";
import { intakeStatusPresentation, variantLabel, type LeadPage, type LeadRow } from "@/components/file/leadFile";
import { AiSuggestionsPanel } from "@/components/operator/AiSuggestionsPanel";
import { CapitalReadinessOverview } from "@/components/operator/CapitalReadinessOverview";
import { DeskAttentionQueue } from "@/components/operator/DeskAttentionQueue";
import { PipelineEconomicsStrip } from "@/components/operator/PipelineEconomicsStrip";
import {
  useAttentionQueue,
  useAuthedApi,
  useClients,
  useCurrentUser,
  useDevUser,
  useFileActivity,
  useIntakeCommunicationUnreadBatch,
  useIntakeDeskSummary,
  useProposedActionItems,
  useUnifiedOperatorFiles,
  type FileActivityGroup,
  type FileActivityItem,
} from "@/hooks/useApi";
import { MARKETING_URL } from "@/lib/appUrl";
import { Role } from "@/lib/enums.generated";
import { fileHref } from "@/lib/fileRoutes";
import { resolveIntakeWorkspaceState } from "@/lib/intakeWorkspace";
import type { CalendarEvent } from "@/lib/types";
import { PIPELINE_LIFECYCLE } from "@/lib/unifiedOperator";
import styles from "./OperatorFilesDesk.module.css";

const FILES_HREF = "/admin/ai-underwriter-leads";
const RECENT_FILES = 10;

/** The files that moved most recently, in the directory's own rows. */
function useRecentFiles(limit: number) {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  const params = new URLSearchParams({
    limit: String(limit),
    offset: "0",
    status_filter: "all",
    probability_status: "all",
    variant_filter: "all",
    archived_filter: "active",
  });
  return useQuery({
    queryKey: ["desk-recent-files", limit, devUser],
    queryFn: () => apiCall<LeadPage>(`${FILES_HREF}?${params}`),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function stageLabel(key: string): string {
  return PIPELINE_LIFECYCLE.find((item) => item.key === key)?.label ?? key.replace(/_/g, " ");
}

export function stageHint(key: string): string {
  return PIPELINE_LIFECYCLE.find((item) => item.key === key)?.sub ?? "";
}

/** "3 files in flight · 1 needs attention · 2 new this week", with only the parts that are known. */
export function deskHeadline(parts: { active?: number; attention?: number; newThisWeek?: number }): string {
  const out: string[] = [];
  if (parts.active != null) out.push(`${parts.active} ${parts.active === 1 ? "file" : "files"} in flight`);
  if (parts.attention != null) out.push(`${parts.attention} ${parts.attention === 1 ? "needs" : "need"} attention`);
  if (parts.newThisWeek != null) out.push(`${parts.newThisWeek} new this week`);
  return out.join(" · ");
}

export function OperatorFilesDesk({
  firstName,
  greeting,
  locale,
  events,
}: {
  firstName: string | null;
  greeting: string;
  locale: "en" | "es";
  events: CalendarEvent[];
}) {
  const { data: me } = useCurrentUser();
  const canCreate = me?.role === Role.SUPER_ADMIN;
  const summary = useIntakeDeskSummary();
  // Same arguments the queue panel below starts with, so the two share one request.
  const attention = useAttentionQueue(true, { limit: 5, offset: 0, view: "active" });
  const suggestions = useProposedActionItems(true);
  const { data: unified, isLoading: unifiedLoading } = useUnifiedOperatorFiles({ limit: 500 });
  const unifiedRows = unified?.items ?? [];
  const now = new Date();
  const todayEvents = events.filter((event) => isSameDay(new Date(event.starts_at), now) && event.status !== "cancelled");
  const dateline = now.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  const time = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const headline = deskHeadline({
    active: summary.data?.active,
    attention: attention.data?.total,
    newThisWeek: summary.data?.new_7d,
  });
  const withoutClient = summary.data?.without_client ?? 0;

  return (
    <div>
      <div className="pagehead dashboard-head">
        <div className="ckrow">
          <div>
            <span className="lbl" style={{ color: "var(--petrol)" }}>{dateline} · {time} ET</span>
            <h1 className="dashboard-greeting">{firstName ? `${greeting}, ${firstName}.` : `${greeting}.`}</h1>
          </div>
          <span className="sp" />
          {headline ? <span className="sub">{headline}</span> : null}
          {canCreate ? <BtnLink href={`${FILES_HREF}?new=1`} size="sm" className="pri"><Icon name="plus" size={13} /> New file</BtnLink> : null}
          <BtnLink href={FILES_HREF} size="sm"><Icon name="spark" size={13} /> All files</BtnLink>
          <PageActionMenu label="Dashboard actions" items={[
            { label: "Open clients", href: "/clients" },
            { label: "Open messages", href: "/messages" },
            { label: "Open documents", href: "/admin/buckets" },
            { label: "Open pipeline", href: "/pipeline" },
            { label: "Open Marketing", href: MARKETING_URL },
          ]} />
        </div>
        <div className="pagebar" style={{ paddingTop: 2 }}>
          <span className="sub">Every intake file under Files: where each stands, what is stuck, and what happened last.</span>
        </div>
      </div>

      <PipelineEconomicsStrip economics={unified?.rollup?.pipeline_economics} rows={unifiedRows} loading={unifiedLoading} />

      <section className={`${styles.tiles} mt`} aria-label="Files at a glance">
        <Link href={FILES_HREF} className={styles.tile}>
          <span className="lbl">Active files</span>
          <strong className="num">{summary.data ? summary.data.active : "—"}</strong>
          <small>Open on the desk right now</small>
        </Link>
        <Link href={FILES_HREF} className={styles.tile}>
          <span className="lbl">New this week</span>
          <strong className="num">{summary.data ? summary.data.new_7d : "—"}</strong>
          <small>Opened in the last 7 days</small>
        </Link>
        <a href="#desk-attention" className={styles.tile}>
          <span className="lbl">Need attention</span>
          <strong className="num">{attention.data ? attention.data.total : "—"}</strong>
          <small>Stalled files in the queue below</small>
        </a>
        <Link href={FILES_HREF} className={styles.tile}>
          <span className="lbl">No documents yet</span>
          <strong className="num">{summary.data ? summary.data.no_documents : "—"}</strong>
          <small>Active files with nothing uploaded</small>
        </Link>
        <a href="#ai-suggestions" className={styles.tile}>
          <span className="lbl">AI suggestions</span>
          <strong className="num">{suggestions.data ? suggestions.data.length : "—"}</strong>
          <small>Waiting for a decision on open files</small>
        </a>
        {withoutClient > 0 ? (
          <div className={`${styles.tile} ${styles.tileWarn}`} role="status">
            <span className="lbl">Without a client</span>
            <strong className="num">{withoutClient}</strong>
            <small>Each is given its client record automatically within 30 minutes</small>
          </div>
        ) : null}
      </section>
      {summary.isError ? (
        <WarnLine className="mt">
          The file counts could not be loaded.{" "}
          <button type="button" className="linky" onClick={() => void summary.refetch()}>Try again</button>
        </WarnLine>
      ) : null}

      {summary.data ? (
        <Panel className="mt" title="Where files stand" sub="Active files by underwriting stage">
          <div className={styles.stages}>
            {summary.data.stages.map((stage) => (
              <div key={stage.key} className={styles.stage}>
                <span className="lbl">{stageLabel(stage.key)}</span>
                <b className="num">{stage.count}</b>
                <small>{stageHint(stage.key)}</small>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      {/* The files themselves get the full width: six columns do not fit in
          half of a 1290px screen without the file's own name wrapping away. */}
      <div className="mt"><FilesInMotion /></div>

      <div className={`${styles.columns} mt`}>
        <div className={styles.column}>
          <div id="desk-attention"><DeskAttentionQueue /></div>
          <AiSuggestionsPanel id="ai-suggestions" />
        </div>
        <div className={styles.column}>
          <FileActivityPanel />
          <Panel title="On the calendar" actions={<Link className="linky" href="/calendar">Calendar</Link>}>
            {todayEvents.slice(0, 4).map((event) => (
              <div className="calendar-brief" key={event.id}>
                <b className="num">{new Date(event.starts_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</b>
                <span><strong>{event.title}</strong><small>{event.who || event.kind}</small></span>
              </div>
            ))}
            {!todayEvents.length ? <div className="empty">Nothing is scheduled today.</div> : null}
          </Panel>
        </div>
      </div>

      <CapitalReadinessOverview rows={unifiedRows} locale={locale} />
    </div>
  );
}

// ── the files that moved most recently ──────────────────────────────────────

const MOTION_COLS: Col[] = [
  { label: "File" },
  { label: "Client", width: 170 },
  { label: "Status", width: 150 },
  { label: "Documents", width: 130 },
  { label: "New messages", width: 160 },
  { label: "Last activity", width: 110 },
];

function FilesInMotion() {
  const recent = useRecentFiles(RECENT_FILES);
  const rows = useMemo(() => recent.data?.items ?? [], [recent.data]);
  const { data: clients = [] } = useClients();
  const clientNames = useMemo(() => new Map(clients.map((client) => [client.id, client.name])), [clients]);
  const unread = useIntakeCommunicationUnreadBatch(rows.map((row) => row.id), { enabled: rows.length > 0 });
  const unreadByFile = useMemo(
    () => new Map((unread.data?.items ?? []).map((item) => [item.intake_id, item])),
    [unread.data],
  );

  return (
    <Panel
      title="Files in motion"
      sub="The files that changed most recently"
      noPad={rows.length > 0}
      actions={<Link className="linky" href={FILES_HREF}>All {recent.data?.total ?? ""} files</Link>}
    >
      {recent.isLoading ? <Loading>Loading files…</Loading> : null}
      {recent.isError ? (
        <WarnLine>
          The files could not be loaded.{" "}
          <button type="button" className="linky" onClick={() => void recent.refetch()}>Try again</button>
        </WarnLine>
      ) : null}
      {!recent.isLoading && !recent.isError && rows.length === 0 ? (
        <Empty icon="spark" title="No active files">A file opened from an intake form or from the desk appears here.</Empty>
      ) : null}
      {rows.length > 0 ? (
        <Table cols={MOTION_COLS} caption="Files that changed most recently" focusable={false}>
          {rows.map((row) => <MotionRow key={row.id} row={row} clientName={row.client_id ? clientNames.get(row.client_id) : undefined} unread={unreadByFile.get(row.id)} unreadLoading={unread.isLoading} unreadUnavailable={unread.isError} />)}
        </Table>
      ) : null}
    </Panel>
  );
}

function MotionRow({ row, clientName, unread, unreadLoading, unreadUnavailable }: {
  row: LeadRow;
  clientName?: string;
  unread?: { sms: number; email: number };
  unreadLoading: boolean;
  unreadUnavailable: boolean;
}) {
  const title = row.business_name || row.full_name;
  const workspaceState = resolveIntakeWorkspaceState({
    workspaceState: row.workspace_state,
    workspaceStateReason: row.workspace_state_reason,
    archivedAt: row.archived_at,
    underwritingStatus: row.underwriting_status,
    outcomeStatus: row.outcome_status,
    intakeStatus: row.status,
  });
  const status = intakeStatusPresentation(row.status, row.underwriting_status, row.outcome_status, workspaceState, row.workspace_state_reason);
  const last = lastActivityAt(row);
  return (
    <tr>
      <Td>
        {/* A floor for the name: on a narrow screen the table scrolls rather than stacking it a word a line. */}
        <div style={{ minWidth: 170 }}>
          <Link href={fileHref(row.id)} className="linky" style={{ fontWeight: 800 }}>{title}</Link>
          <span className="sub subline">{variantLabel(row.variant)}</span>
        </div>
      </Td>
      <Td>
        {row.client_id ? (
          <Link href={`/clients/${row.client_id}`} className="linky">{clientName ?? row.full_name}</Link>
        ) : (
          <span className="sub" title="This file is given its client record automatically within 30 minutes.">Not linked yet</span>
        )}
      </Td>
      <Td><CellChip tone={status.tone}>{status.label}</CellChip></Td>
      <Td>
        <Link href={fileHref(row.id, "documents")} className="linky">
          {row.file_count === 1 ? "1 document" : `${row.file_count} documents`}
        </Link>
        {row.missing_required_count > 0 ? <span className="sub subline">{row.missing_required_count} still needed</span> : null}
      </Td>
      <Td>
        <FileCommunicationCounts intakeId={row.id} name={title} counts={unread} loading={unreadLoading} unavailable={unreadUnavailable} />
      </Td>
      <Td>
        <span className="sub" title={new Date(last).toLocaleString()}>{sinceLabel(last)}</span>
        {row.unseen_activity_count ? <span className="sub subline">{row.unseen_activity_count} new since you looked</span> : null}
      </Td>
    </tr>
  );
}

// ── what happened on the files ──────────────────────────────────────────────

type ActivityFilter = FileActivityGroup | "all";

const ACTIVITY_ICON: Record<FileActivityItem["group"], string> = {
  documents: "doc",
  messages: "chat",
  status: "check",
  other: "spark",
};

const ACTIVITY_STEP = 12;

function FileActivityPanel() {
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [limit, setLimit] = useState(ACTIVITY_STEP);
  const activity = useFileActivity(filter, { limit });
  const items = activity.data?.items ?? [];

  return (
    <Panel
      title="Activity"
      sub="What happened on the files, newest first"
      actions={
        <Seg<ActivityFilter>
          as="filter"
          ariaLabel="Kind of activity"
          value={filter}
          onChange={(next) => { setFilter(next); setLimit(ACTIVITY_STEP); }}
          options={[
            { value: "all", label: "All" },
            { value: "documents", label: "Documents" },
            { value: "messages", label: "Messages" },
            { value: "status", label: "Status" },
          ]}
        />
      }
    >
      {activity.isLoading ? <Loading>Loading activity…</Loading> : null}
      {activity.isError ? (
        <WarnLine>
          Activity could not be loaded.{" "}
          <button type="button" className="linky" onClick={() => void activity.refetch()}>Try again</button>
        </WarnLine>
      ) : null}
      {!activity.isLoading && !activity.isError && items.length === 0 ? (
        <Empty icon="bell" title={filter === "all" ? "Nothing yet" : "Nothing of this kind yet"}>
          Documents received or asked for, messages, status changes and reviews on any file appear here as they happen.
        </Empty>
      ) : null}
      {items.map((item) => (
        <div key={item.id} className={styles.event}>
          <span className={styles.eventIcon}><Icon name={ACTIVITY_ICON[item.group] ?? "spark"} size={13} /></span>
          <div className={styles.eventBody}>
            <b>{item.title}</b>
            <span className="sub">
              <Link href={fileHref(item.intake_id, item.group === "messages" ? "communications" : item.group === "documents" ? "documents" : "timeline")} className="linky">{item.file_title}</Link>
              {item.client_id && item.client_name && item.client_name !== item.file_title ? (
                <> · <Link href={`/clients/${item.client_id}`} className="linky">{item.client_name}</Link></>
              ) : null}
              {item.actor_label ? ` · ${item.actor_label}` : ""}
            </span>
          </div>
          <span className={styles.eventTime} title={new Date(item.occurred_at).toLocaleString()}>{sinceLabel(item.occurred_at)}</span>
        </div>
      ))}
      {activity.data?.next_before ? (
        <div className="row mt" style={{ justifyContent: "center" }}>
          <Btn size="sm" disabled={activity.isFetching} onClick={() => setLimit((current) => Math.min(200, current + ACTIVITY_STEP * 2))}>
            {activity.isFetching ? "Loading…" : "Show more"}
          </Btn>
        </div>
      ) : null}
    </Panel>
  );
}
