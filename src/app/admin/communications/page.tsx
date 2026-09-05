"use client";

// Every message this platform sent, and the activity that caused it.
//
// Two tabs over two different questions. Messages unions the new
// `message_sends` ledger with `sms_messages`, which has held every text since
// 0169 and is left where it is; Activity unions the audit trails. They are
// joined by `request_id` — the id a request or a scheduler tick binds — which
// is what makes "which user activity triggered what" a link rather than a
// guess about timestamps.
//
// Access is enforced by the API, not here: everyone sees their own, a super
// admin sees everything, and `scope` in the response says which you got.
//
// The body preview is the one genuinely new thing in this app. Nothing here
// has ever rendered untrusted HTML — there is no sanitizer in the tree and
// `dangerouslySetInnerHTML` appears nowhere — so the default view is the text
// body in `.pretext`, exactly as every other message body is shown, and the
// HTML view goes into an iframe with an EMPTY sandbox. No scripts, no
// same-origin, no forms. That needs no sanitizer because nothing in it can run.

import { useMemo, useState } from "react";
import { Btn, CellChip, Empty, Input, Loading, PageHeader, Panel, Row, Select, StatusLine, Sub } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { Tabs } from "@/components/design-system/Tabs";
import { Role } from "@/lib/enums.generated";
import {
  useCommsActivity,
  useCommsMessage,
  useCommsMessages,
  useCurrentUser,
  type CommsMessageRow,
} from "@/hooks/useApi";

const LIMIT = 50;
const MSG_COLS = "minmax(150px,1.1fr) minmax(180px,1.4fr) 120px 130px minmax(140px,1fr)";
const ACT_COLS = "minmax(160px,1.2fr) minmax(220px,2fr) 130px 150px";

type ChipTone = "ok" | "warn" | "bad" | "mut" | "acc";

// Deliberately the same vocabulary SmsThreadTab already uses, so a status
// means the same thing wherever it is read.
const STATUS_TONE: Record<string, ChipTone> = {
  delivered: "ok", sent: "acc", queued: "mut", received: "acc",
  opened: "ok", bounced: "bad", complained: "bad", failed: "bad", blocked: "warn",
};

const CHANNELS = [
  { value: "all", label: "Every channel" },
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
];

const STATUSES = [
  { value: "all", label: "Any outcome" },
  { value: "delivered", label: "Delivered" },
  { value: "sent", label: "Sent, not yet confirmed" },
  { value: "bounced,complained,failed", label: "Did not arrive" },
  { value: "blocked", label: "Refused before sending" },
];

const SOURCES = [
  { value: "all", label: "Every trail" },
  { value: "evidence", label: "Files and AI" },
  { value: "dealer_os", label: "Dealer desk" },
  { value: "funding", label: "Funding" },
];

function when(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function label(value: string): string {
  return value ? value.replace(/[_.]/g, " ") : "—";
}

/** What the row's outcome actually means, in words rather than a status code. */
function outcome(row: CommsMessageRow): string {
  if (row.status === "blocked") return row.detail || "Refused before sending";
  if (row.status === "bounced") return row.detail || "Bounced";
  if (row.status === "failed") return row.detail || "Failed";
  if (row.opened_at) return `Opened ${when(row.opened_at)}`;
  if (row.delivered_at) return `Delivered ${when(row.delivered_at)}`;
  return row.status === "sent" ? "Accepted by the provider" : label(row.status);
}

export default function CommunicationsAuditPage() {
  const { data: me } = useCurrentUser();
  const [tab, setTab] = useState<"messages" | "activity">("messages");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [context, setContext] = useState("all");
  const [source, setSource] = useState("all");
  const [offset, setOffset] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [asHtml, setAsHtml] = useState(false);

  const operator = me?.role === Role.SUPER_ADMIN || me?.role === Role.LOAN_EXEC;
  const messages = useCommsMessages(
    { q: search, channel, status_filter: statusFilter, context, limit: LIMIT, offset },
    { enabled: operator && tab === "messages" },
  );
  const activity = useCommsActivity(
    { q: search, source, limit: LIMIT, offset },
    { enabled: operator && tab === "activity" },
  );
  const detail = useCommsMessage(openId);

  const contexts = useMemo(
    () => [{ value: "all", label: "Every kind" }, ...(messages.data?.contexts ?? []).map((c) => ({ value: c, label: label(c) }))],
    [messages.data?.contexts],
  );

  if (me && !operator) return null;

  const rows = messages.data?.rows ?? [];
  const acts = activity.data?.rows ?? [];
  const total = (tab === "messages" ? messages.data?.total : activity.data?.total) ?? 0;
  const loading = tab === "messages" ? messages.isLoading : activity.isLoading;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setOffset(0);
    setSearch(q.trim());
  };
  const move = (next: number) => setOffset(Math.max(0, next));
  const swap = (next: "messages" | "activity") => { setTab(next); setOffset(0); };

  return (
    <div className="grid">
      <PageHeader
        title="Communications"
        lede="Every message this platform sent — what it said, whether it arrived, and which action set it off."
      />

      <Tabs
        value={tab}
        onChange={swap}
        variant="underline"
        options={[
          { id: "messages", label: "Messages" },
          { id: "activity", label: "Activity" },
        ]}
      />

      {messages.data?.scope === "own" ? (
        <StatusLine tone="mut">
          You are seeing messages you sent or that belong to your files. A super admin sees every message.
        </StatusLine>
      ) : null}

      <Panel>
        <form
          onSubmit={submit}
          style={{ display: "grid", gridTemplateColumns: "minmax(220px,1fr) 190px 190px 190px auto", gap: 10, alignItems: "center" }}
        >
          <Input
            aria-label="Search messages"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder={tab === "messages" ? "Search recipient or subject" : "Search action"}
          />
          {tab === "messages" ? (
            <>
              <Select aria-label="Channel" value={channel} onChange={(e) => { setOffset(0); setChannel(e.target.value); }}>
                {CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Select>
              <Select aria-label="Outcome" value={statusFilter} onChange={(e) => { setOffset(0); setStatusFilter(e.target.value); }}>
                {STATUSES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Select>
              <Select aria-label="Kind" value={context} onChange={(e) => { setOffset(0); setContext(e.target.value); }}>
                {contexts.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Select>
            </>
          ) : (
            <>
              <Select aria-label="Trail" value={source} onChange={(e) => { setOffset(0); setSource(e.target.value); }}>
                {SOURCES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Select>
              <span />
              <span />
            </>
          )}
          <Btn variant="pri" type="submit">Search</Btn>
        </form>
      </Panel>

      <Panel noPad>
        {tab === "messages" ? (
          <>
            <div className="gridhd" style={{ gridTemplateColumns: MSG_COLS }}>
              <span>Sent</span>
              <span>To</span>
              <span>Channel</span>
              <span>Outcome</span>
              <span>By</span>
            </div>
            {loading ? (
              <div className="panel-b"><Loading>Reading the log…</Loading></div>
            ) : rows.length === 0 ? (
              <div className="panel-b">
                <Empty title="Nothing sent yet">
                  Messages appear here from the moment they are sent. Anything sent before this log
                  existed was never recorded, so it is deliberately not shown.
                </Empty>
              </div>
            ) : rows.map((row) => (
              <button
                key={row.id}
                type="button"
                className="gridrow act"
                style={{ gridTemplateColumns: MSG_COLS, textAlign: "left", width: "100%", background: "none", border: 0 }}
                onClick={() => { setOpenId(row.id); setAsHtml(false); }}
              >
                <div>
                  <div className="trunc"><strong>{when(row.occurred_at)}</strong></div>
                  <Sub>{label(row.context)}</Sub>
                </div>
                <div>
                  <div className="trunc">{row.to || "—"}</div>
                  <div className="trunc sub">{row.subject || (row.channel === "sms" ? "Text message" : "No subject")}</div>
                </div>
                <div><CellChip tone="mut">{row.channel}</CellChip></div>
                <div>
                  <CellChip tone={STATUS_TONE[row.status] ?? "mut"}>{label(row.status)}</CellChip>
                  <div className="trunc sub">{outcome(row)}</div>
                </div>
                <div>
                  <div className="trunc">{row.actor_name || (row.actor_label === "cron" ? "Scheduled" : "—")}</div>
                  <Sub>{row.job ? label(row.job.replace(/^job_/, "")) : label(row.actor_label)}</Sub>
                </div>
              </button>
            ))}
          </>
        ) : (
          <>
            <div className="gridhd" style={{ gridTemplateColumns: ACT_COLS }}>
              <span>When</span>
              <span>What happened</span>
              <span>Trail</span>
              <span>Who</span>
            </div>
            {loading ? (
              <div className="panel-b"><Loading>Reading the trails…</Loading></div>
            ) : acts.length === 0 ? (
              <div className="panel-b"><Empty title="No activity matched" /></div>
            ) : acts.map((row) => (
              <div key={row.id} className="gridrow" style={{ gridTemplateColumns: ACT_COLS }}>
                <Sub>{when(row.occurred_at)}</Sub>
                <div>
                  <div className="trunc"><strong>{label(row.action)}</strong></div>
                  <div className="trunc sub">{row.summary}</div>
                </div>
                <div><CellChip tone="mut">{label(row.source)}</CellChip></div>
                <div className="trunc">{row.actor_name || label(row.actor_role || "—")}</div>
              </div>
            ))}
          </>
        )}

        <div className="panel-h">
          <Sub>{total ? `${offset + 1}-${Math.min(offset + LIMIT, total)} of ${total}` : "Nothing to show"}</Sub>
          <span className="sp" />
          <Btn disabled={offset === 0 || loading} onClick={() => move(offset - LIMIT)}>Previous</Btn>
          <Btn disabled={offset + LIMIT >= total || loading} onClick={() => move(offset + LIMIT)}>Next</Btn>
        </div>
      </Panel>

      <Drawer
        open={Boolean(openId)}
        onClose={() => setOpenId(null)}
        width="lg"
        title={detail.data?.subject || (detail.data?.channel === "sms" ? "Text message" : "Message")}
        sub={detail.data ? `${label(detail.data.context)} · ${when(detail.data.occurred_at)}` : undefined}
      >
        {detail.isLoading ? (
          <Loading>Opening…</Loading>
        ) : !detail.data ? (
          <Empty title="That message could not be opened" />
        ) : (
          <div className="grid" style={{ gap: 12 }}>
            <div className="grid" style={{ gap: 4 }}>
              <Row><span className="lbl">To</span><span className="sp" /><span>{detail.data.to || "—"}</span></Row>
              {detail.data.cc.length ? (
                <Row><span className="lbl">Cc</span><span className="sp" /><span>{detail.data.cc.join(", ")}</span></Row>
              ) : null}
              <Row>
                <span className="lbl">Outcome</span><span className="sp" />
                <CellChip tone={STATUS_TONE[detail.data.status] ?? "mut"}>{label(detail.data.status)}</CellChip>
              </Row>
              <Row><span className="lbl">Detail</span><span className="sp" /><Sub>{outcome(detail.data)}</Sub></Row>
              {detail.data.attachments.length ? (
                <Row><span className="lbl">Attached</span><span className="sp" /><Sub>{detail.data.attachments.join(", ")}</Sub></Row>
              ) : null}
            </div>

            {detail.data.secrets_masked ? (
              <StatusLine tone="warn">
                This copy has had a one-time link or code removed. The message the client received
                carried the real one — the log deliberately cannot open it.
              </StatusLine>
            ) : null}

            {!detail.data.has_body ? (
              <StatusLine tone="mut">
                No copy of this message was kept. It was sent before the log recorded bodies.
              </StatusLine>
            ) : (
              <>
                {detail.data.body_html ? (
                  <Row>
                    <Btn size="sm" onClick={() => setAsHtml(false)} variant={asHtml ? "default" : "pri"}>Text</Btn>
                    <Btn size="sm" onClick={() => setAsHtml(true)} variant={asHtml ? "pri" : "default"}>HTML</Btn>
                  </Row>
                ) : null}
                {asHtml && detail.data.body_html ? (
                  // Empty sandbox: no scripts, no same-origin, no forms. This is
                  // the only place in the app that renders stored markup, and it
                  // renders it inert.
                  <iframe
                    title="Message body"
                    sandbox=""
                    srcDoc={detail.data.body_html}
                    style={{ width: "100%", minHeight: 320, border: "1px solid var(--line)", borderRadius: 9, background: "#fff" }}
                  />
                ) : (
                  <div className="pretext">{detail.data.body_text || "(no text body)"}</div>
                )}
              </>
            )}

            <div className="grid" style={{ gap: 6 }}>
              <span className="lbl">What set this off</span>
              {detail.data.caused_by.length === 0 ? (
                <Sub>
                  Nothing recorded. Either this was sent before actions and messages shared an id,
                  or the action that sent it wrote no audit row.
                </Sub>
              ) : detail.data.caused_by.map((cause) => (
                <div key={cause.id} className="filerow">
                  <div className="trunc"><strong>{label(cause.action)}</strong> — {cause.summary}</div>
                  <span className="sp" />
                  <Sub>{cause.actor_name || label(cause.actor_role || "")} · {when(cause.occurred_at)}</Sub>
                </div>
              ))}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
