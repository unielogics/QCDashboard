"use client";

// A client, read back as what the firm has open with them: their files, and
// every text and email exchanged with them or about those files.
//
// Every file has a client (qcbackend app/services/file_clients.py). The link
// was already in the data for most files and visible nowhere: a file did not
// say whose it was and a client did not list what was theirs. These two panels
// are the client's side of that link. They are a desk view; the routes behind
// them refuse everyone else.

import Link from "next/link";
import { useMemo, useState } from "react";
import { Btn, CellChip, Empty, Loading, Panel, Seg, Table, Td, WarnLine, type ChipTone, type Col } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { Icon } from "@/components/design-system/Icon";
import { FileCommunicationCounts } from "@/components/communications/FileCommunicationCounts";
import { formatMoney, intakeStatusPresentation, variantLabel } from "@/components/file/leadFile";
import {
  useClientCommunications,
  useClientFiles,
  useCommsMessage,
  useIntakeCommunicationUnreadBatch,
  type ClientCommunicationRow,
  type ClientFileRow,
} from "@/hooks/useApi";
import { fileHref } from "@/lib/fileRoutes";

/** "3h ago", "2d ago", then a date. A file list is scanned for what moved lately. */
export function sinceLabel(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const minutes = Math.max(0, Math.floor((now - then) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  if (minutes < 1440 * 14) return `${Math.floor(minutes / 1440)}d ago`;
  return new Date(then).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** The later of a file's last edit and its last message. */
export function lastActivityAt(file: { updated_at: string; last_message_at?: string | null }): string {
  return file.last_message_at && file.last_message_at > file.updated_at ? file.last_message_at : file.updated_at;
}

export function fileTitle(file: Pick<ClientFileRow, "business_name" | "full_name">): string {
  return file.business_name || file.full_name;
}

const FILE_COLS: Col[] = [
  { label: "File" },
  { label: "Status", width: 150 },
  { label: "Documents", width: 170 },
  { label: "Requested", width: 110, align: "r" },
  { label: "New messages", width: 170 },
  { label: "Last activity", width: 110 },
  { label: "", width: 70, align: "r" },
];

export function ClientFilesPanel({ clientId, clientName }: { clientId: string; clientName: string }) {
  const files = useClientFiles(clientId);
  const rows = useMemo(() => files.data ?? [], [files.data]);
  const unread = useIntakeCommunicationUnreadBatch(rows.map((row) => row.id), { enabled: rows.length > 0 });
  const unreadByFile = useMemo(
    () => new Map((unread.data?.items ?? []).map((item) => [item.intake_id, item])),
    [unread.data],
  );
  const live = rows.filter((row) => row.workspace_state === "active").length;
  const summary = rows.length
    ? `${live} open${rows.length - live ? ` · ${rows.length - live} closed or archived` : ""}`
    : undefined;

  return (
    <Panel title="Files" sub={summary} noPad={rows.length > 0} id="client-files">
      {files.isLoading ? <Loading>Loading files…</Loading> : null}
      {files.isError ? (
        <WarnLine>
          This client&apos;s files could not be loaded.{" "}
          <button type="button" className="linky" onClick={() => void files.refetch()}>Try again</button>
        </WarnLine>
      ) : null}
      {!files.isLoading && !files.isError && rows.length === 0 ? (
        <Empty icon="spark" title="No files yet">
          Every file opened for {clientName} is listed here with its status, its documents and its messages.
        </Empty>
      ) : null}
      {rows.length > 0 ? (
        <Table cols={FILE_COLS} caption={`Files for ${clientName}`} focusable={false}>
          {rows.map((file) => {
            const title = fileTitle(file);
            const status = intakeStatusPresentation(
              file.status,
              file.underwriting_status,
              file.outcome_status,
              file.workspace_state,
              file.workspace_state_reason,
            );
            return (
              <tr key={file.id}>
                <Td>
                  {/* A floor for the name: on a narrow screen the table scrolls rather than stacking it a word a line. */}
                  <div style={{ minWidth: 170 }}>
                    <Link href={fileHref(file.id)} className="linky" style={{ fontWeight: 800 }}>{title}</Link>
                    <span className="sub subline">
                      {variantLabel(file.variant)}
                      {file.business_name && file.full_name !== file.business_name ? ` · ${file.full_name}` : ""}
                    </span>
                  </div>
                </Td>
                <Td>
                  <span className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                    <CellChip tone={status.tone}>{status.label}</CellChip>
                    {file.workspace_state === "archived" ? <CellChip tone="mut">Archived</CellChip> : null}
                  </span>
                </Td>
                <Td>
                  <Link href={fileHref(file.id, "documents")} className="linky">
                    {file.file_count === 1 ? "1 document" : `${file.file_count} documents`}
                  </Link>
                  {file.missing_required_count > 0 ? (
                    <span className="sub subline">{file.missing_required_count} still needed</span>
                  ) : null}
                </Td>
                <Td align="r"><span className="num">{formatMoney(file.requested_loan_amount)}</span></Td>
                <Td>
                  <FileCommunicationCounts
                    intakeId={file.id}
                    name={title}
                    counts={unreadByFile.get(file.id)}
                    loading={unread.isLoading}
                    unavailable={unread.isError}
                  />
                </Td>
                <Td><span className="sub" title={new Date(lastActivityAt(file)).toLocaleString()}>{sinceLabel(lastActivityAt(file))}</span></Td>
                <Td align="r"><Link href={fileHref(file.id)} className="btn sm">Open</Link></Td>
              </tr>
            );
          })}
        </Table>
      ) : null}
    </Panel>
  );
}

type ChannelFilter = "all" | "sms" | "email";

const STATUS_TONE: Record<string, ChipTone> = {
  delivered: "ok",
  sent: "acc",
  received: "pet",
  queued: "mut",
  sending: "mut",
  uncertain: "warn",
  failed: "bad",
  bounced: "bad",
  complained: "bad",
  blocked: "bad",
};

const STATUS_LABEL: Record<string, string> = {
  delivered: "Delivered",
  sent: "Sent",
  received: "Received",
  queued: "Queued",
  sending: "Sending",
  uncertain: "Not confirmed",
  failed: "Failed",
  bounced: "Bounced",
  complained: "Marked as spam",
  blocked: "Not sent",
};

/** Why a message existed, in the desk's words; an unknown context is shown as written. */
export function contextLabel(context: string): string | null {
  if (!context) return null;
  const known: Record<string, string> = {
    intake_link: "Intake link",
    room_link: "Room link",
    reengagement: "Re-engagement",
    consent_link: "Consent link",
    reply: "Reply",
    manual: "Sent by the desk",
    file_updates: "File update digest",
  };
  return known[context] ?? context.replace(/[_.]+/g, " ");
}

function when(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const PAGE = 25;

export function ClientMessagesPanel({ clientId, clientName }: { clientId: string; clientName: string }) {
  const messages = useClientCommunications(clientId);
  const [channel, setChannel] = useState<ChannelFilter>("all");
  const [shown, setShown] = useState(PAGE);
  const [reading, setReading] = useState<ClientCommunicationRow | null>(null);
  const all = useMemo(() => messages.data?.items ?? [], [messages.data]);
  const counts = messages.data?.counts ?? { sms: 0, email: 0 };
  const visible = useMemo(() => (channel === "all" ? all : all.filter((item) => item.channel === channel)), [all, channel]);

  return (
    <>
      <Panel
        title="Messages"
        sub={all.length ? "Texts and emails with this client and about their files, newest first" : undefined}
        id="client-messages"
        actions={
          all.length ? (
            <Seg<ChannelFilter>
              as="filter"
              ariaLabel="Message channel"
              value={channel}
              onChange={(next) => { setChannel(next); setShown(PAGE); }}
              options={[
                { value: "all", label: <>All <span className="tag">{all.length}</span></> },
                { value: "sms", label: <>Texts <span className="tag">{counts.sms}</span></> },
                { value: "email", label: <>Email <span className="tag">{counts.email}</span></> },
              ]}
            />
          ) : undefined
        }
      >
        {messages.isLoading ? <Loading>Loading messages…</Loading> : null}
        {messages.isError ? (
          <WarnLine>
            This client&apos;s messages could not be loaded.{" "}
            <button type="button" className="linky" onClick={() => void messages.refetch()}>Try again</button>
          </WarnLine>
        ) : null}
        {!messages.isLoading && !messages.isError && all.length === 0 ? (
          <Empty icon="chat" title="No texts or emails yet">
            Links, reminders, replies and anything the desk sends {clientName} about a file appear here with their delivery state.
          </Empty>
        ) : null}
        {all.length > 0 && visible.length === 0 ? <Empty>Nothing on this channel yet.</Empty> : null}
        {visible.slice(0, shown).map((item) => (
          <MessageRow key={item.id} item={item} onRead={() => setReading(item)} />
        ))}
        {visible.length > shown ? (
          <div className="row mt" style={{ justifyContent: "center" }}>
            <Btn size="sm" onClick={() => setShown((count) => count + PAGE)}>
              Show {Math.min(PAGE, visible.length - shown)} more
            </Btn>
          </div>
        ) : null}
      </Panel>
      <MessageDrawer item={reading} onClose={() => setReading(null)} />
    </>
  );
}

function MessageRow({ item, onRead }: { item: ClientCommunicationRow; onRead: () => void }) {
  const outbound = item.direction === "outbound";
  const context = contextLabel(item.context);
  const failed = item.status === "failed" || item.status === "blocked" || item.status === "bounced";
  const conversationHref = item.intake_id
    ? `${fileHref(item.intake_id, "communications")}&channel=${item.channel === "sms" ? "client" : "email"}`
    : null;
  return (
    <div className="filerow" style={{ alignItems: "flex-start" }}>
      <Icon name={item.channel === "sms" ? "chat" : "mail"} size={15} />
      <div className="grow grid g4" style={{ minWidth: 0 }}>
        <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
          <b style={{ overflowWrap: "anywhere" }}>
            {outbound ? "To" : "From"} {item.counterpart || (item.channel === "sms" ? "unknown number" : "unknown address")}
          </b>
          <CellChip tone={STATUS_TONE[item.status] ?? "mut"} title={item.detail || undefined}>
            {STATUS_LABEL[item.status] ?? item.status}
          </CellChip>
          {item.opened_at ? <CellChip tone="ok" title={`Opened ${when(item.opened_at)}`}>Opened</CellChip> : null}
          {context ? <CellChip tone="mut">{context}</CellChip> : null}
          {item.intake_id && item.file_title ? (
            <Link href={fileHref(item.intake_id)} className="cellchip c-acc" title="Open the file this message belongs to">
              {item.file_title}
            </Link>
          ) : null}
        </div>
        {item.subject ? <span style={{ fontWeight: 700, overflowWrap: "anywhere" }}>{item.subject}</span> : null}
        {item.snippet ? (
          <span className="sub" style={{ overflowWrap: "anywhere" }}>{item.snippet}</span>
        ) : failed && item.detail ? (
          // The reason IS the content for a message that never went.
          <span className="sub" style={{ overflowWrap: "anywhere" }}>{item.detail}</span>
        ) : null}
        <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
          {item.can_open ? <button type="button" className="linky" onClick={onRead}>Read the email</button> : null}
          {conversationHref ? <Link href={conversationHref} className="linky">Open the conversation</Link> : null}
          {item.actor_name && outbound ? <span className="sub">Sent by {item.actor_name}</span> : null}
        </div>
      </div>
      <span className="sub" style={{ whiteSpace: "nowrap" }} title={item.delivered_at ? `Delivered ${when(item.delivered_at)}` : undefined}>
        {when(item.occurred_at)}
      </span>
    </div>
  );
}

/** A sent email, read through the communications log, which decides who may. */
function MessageDrawer({ item, onClose }: { item: ClientCommunicationRow | null; onClose: () => void }) {
  const detail = useCommsMessage(item?.can_open ? item.id : null);
  return (
    <Drawer
      open={item !== null}
      onClose={onClose}
      width="md"
      title={item?.subject || "Email"}
      sub={item ? `To ${item.counterpart ?? "unknown address"} · ${when(item.occurred_at)}` : undefined}
      footer={<><span className="sp" /><Btn onClick={onClose}>Close</Btn></>}
    >
      {detail.isLoading ? <Loading>Loading the email…</Loading> : null}
      {detail.isError ? <WarnLine>This email could not be opened.</WarnLine> : null}
      {detail.data ? (
        <div className="grid g8">
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            <CellChip tone={STATUS_TONE[detail.data.status] ?? "mut"}>{STATUS_LABEL[detail.data.status] ?? detail.data.status}</CellChip>
            {detail.data.secrets_masked ? <CellChip tone="mut" title="Codes and signing links were removed before this copy was stored.">Codes removed</CellChip> : null}
            {detail.data.attachments.length ? <CellChip tone="mut">{detail.data.attachments.length === 1 ? "1 attachment" : `${detail.data.attachments.length} attachments`}</CellChip> : null}
          </div>
          {detail.data.cc.length ? <span className="sub">Cc {detail.data.cc.join(", ")}</span> : null}
          <div className="pretext" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {detail.data.body_text || "(This email has no plain-text copy. Open it in the communications log to see the formatted version.)"}
          </div>
          {detail.data.attachments.length ? (
            <span className="sub">Attached: {detail.data.attachments.join(", ")}</span>
          ) : null}
          <Link href="/admin/communications" className="linky">Open the communications log</Link>
        </div>
      ) : null}
    </Drawer>
  );
}
