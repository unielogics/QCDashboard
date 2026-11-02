"use client";

// Marketplace > Members: the access-request queue and the member review.
//
//   GET  /capital/admin/access-requests        POST .../{id}/contacted | decline | invite
//   POST /capital/admin/members/invite         {email, name}
//   GET  /capital/admin/members[?status_filter=&q=]   GET .../{id}
//   POST /capital/admin/members/{id}/review    {decision, notes, relationship_established_at, waiting_period_days, accreditation_basis}
//
// Approval stamps the relationship date and starts the waiting period
// (default from the issuer settings). The server, not this screen, decides
// when a member may see offerings.

import { useMemo, useState, type ReactNode } from "react";
import { Btn, Card, CellChip, Empty, Field, Input, Loading, PageHeader, Panel, Seg, StatusLine, Table, Td, Textarea, Tr } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import {
  useCpAccessRequestAction, useCpAccessRequests, useCpInviteByEmail, useCpMember, useCpMembers, useCpReviewMember,
  type CpAccessRequest, type CpMember, type CpMemberStatus,
} from "@/hooks/useCapitalPartners";
import { MEMBER_TONE, Status, SuperAdminOnly, day, errorMessage, label, when } from "@/components/marketplace/shared";

type Tab = "requests" | "members";
type MemberFilter = CpMemberStatus | "all";

export default function MembersPage() {
  return (
    <SuperAdminOnly>
      <Members />
    </SuperAdminOnly>
  );
}

function Members() {
  const [tab, setTab] = useState<Tab>("requests");
  return (
    <div className="grid">
      <PageHeader
        title="Capital partners"
        lede="Introduction requests from the public page, and the members behind the portal. A member sees offerings only after you approve the accreditation questionnaire and the waiting period has run."
        actions={<Seg as="tabs" ariaLabel="Section" value={tab} onChange={setTab} options={[{ value: "requests", label: "Access requests" }, { value: "members", label: "Members" }]} />}
      />
      {tab === "requests" ? <AccessRequests /> : <MemberList />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Access requests
// ---------------------------------------------------------------------------

function AccessRequests() {
  const [filter, setFilter] = useState<"new" | "contacted" | "invited" | "declined" | "all">("new");
  const { data: rows = [], isLoading } = useCpAccessRequests();
  const act = useCpAccessRequestAction();
  const invite = useCpInviteByEmail();
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [direct, setDirect] = useState({ email: "", name: "" });
  const visible = useMemo(() => (filter === "all" ? rows : rows.filter((r) => r.status === filter)), [rows, filter]);
  const counts = useMemo(() => rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), { all: rows.length }), [rows]);

  const run = async (row: CpAccessRequest, action: "contacted" | "decline" | "invite") => {
    setMsg(null);
    try {
      const out = await act.mutateAsync({ id: row.id, action });
      if (action === "invite" && out && "message" in out) setMsg({ tone: out.invitation_sent ? "ok" : "bad", text: out.message });
    } catch (e) {
      setMsg({ tone: "bad", text: errorMessage(e) });
    }
  };
  const inviteDirect = async () => {
    setMsg(null);
    try {
      const out = await invite.mutateAsync({ email: direct.email.trim(), name: direct.name.trim() });
      setMsg({ tone: out.invitation_sent ? "ok" : "bad", text: out.message });
      setDirect({ email: "", name: "" });
    } catch (e) {
      setMsg({ tone: "bad", text: errorMessage(e) });
    }
  };

  return (
    <div className="grid">
      <div className="row">
        <Seg as="filter" ariaLabel="Request status" value={filter} onChange={setFilter} options={(["new", "contacted", "invited", "declined", "all"] as const).map((s) => ({ value: s, label: (<>{label(s)} <span className="num">{counts[s] ?? 0}</span></>) }))} />
      </div>
      <Panel title="Invite by email" bodyClass="row">
        <Input placeholder="Email" value={direct.email} onChange={(e) => setDirect((d) => ({ ...d, email: e.target.value }))} />
        <Input placeholder="Name" value={direct.name} onChange={(e) => setDirect((d) => ({ ...d, name: e.target.value }))} />
        <Btn variant="pri" disabled={!direct.email.includes("@") || invite.isPending} onClick={() => void inviteDirect()}>Invite</Btn>
        <span className="sub">Creates the capital-partner login and sends the portal invitation. A borrower or staff address is refused.</span>
      </Panel>
      {msg ? <StatusLine tone={msg.tone}>{msg.text}</StatusLine> : null}
      {isLoading ? (
        <Card><Loading>Loading requests…</Loading></Card>
      ) : visible.length === 0 ? (
        <Empty title="No requests in this status">Requests arrive from the public page at /capital-partners.</Empty>
      ) : (
        <Panel noPad>
          <Table caption="Access requests" cols={[{ label: "Status" }, { label: "Name" }, { label: "Contact" }, { label: "Investing as" }, { label: "Band" }, { label: "Source" }, { label: "Received" }, { label: "" }]}>
            {visible.map((r) => (
              <Tr key={r.id}>
                <Td><CellChip tone={r.status === "new" ? "warn" : r.status === "invited" ? "ok" : r.status === "declined" ? "bad" : "acc"}>{label(r.status)}</CellChip></Td>
                <Td>
                  <div className="grid g4">
                    <span>{r.full_name}</span>
                    {r.entity_name ? <span className="sub">{r.entity_name}</span> : null}
                    {r.note ? <span className="sub" style={{ maxWidth: 320, whiteSpace: "pre-wrap" }}>{r.note}</span> : null}
                  </div>
                </Td>
                <Td><div className="grid g4"><a href={`mailto:${r.email}`}>{r.email}</a><span className="sub">{r.phone} · {r.locale.toUpperCase()}</span></div></Td>
                <Td>{label(r.investing_as)}</Td>
                <Td className="num">{r.capital_band}</Td>
                <Td>{r.source}</Td>
                <Td className="num">{when(r.created_at)}</Td>
                <Td>
                  <div className="row">
                    {r.status === "new" ? <Btn size="sm" onClick={() => void run(r, "contacted")} disabled={act.isPending}>Contacted</Btn> : null}
                    {r.status !== "invited" && r.status !== "declined" ? <Btn size="sm" variant="pri" onClick={() => void run(r, "invite")} disabled={act.isPending}>Invite</Btn> : null}
                    {r.status !== "invited" && r.status !== "declined" ? <Btn size="sm" className="danger" onClick={() => void run(r, "decline")} disabled={act.isPending}>Decline</Btn> : null}
                  </div>
                </Td>
              </Tr>
            ))}
          </Table>
        </Panel>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

const MEMBER_FILTERS: MemberFilter[] = ["under_review", "waiting", "approved", "requested", "questionnaire", "suspended", "all"];

function MemberList() {
  const [filter, setFilter] = useState<MemberFilter>("under_review");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const { data: rows = [], isLoading } = useCpMembers({ q: q.trim() || undefined });
  const visible = useMemo(() => (filter === "all" ? rows : rows.filter((r) => r.status === filter)), [rows, filter]);
  const counts = useMemo(() => rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), { all: rows.length }), [rows]);
  return (
    <div className="grid">
      <div className="row">
        <Seg as="filter" ariaLabel="Member status" value={filter} onChange={setFilter} options={MEMBER_FILTERS.map((s) => ({ value: s, label: (<>{label(s)} <span className="num">{counts[s] ?? 0}</span></>) }))} />
        <Input placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {isLoading ? (
        <Card><Loading>Loading members…</Loading></Card>
      ) : visible.length === 0 ? (
        <Empty title="No members in this status">Members appear once they sign up on the portal or accept an invitation.</Empty>
      ) : (
        <Panel noPad>
          <Table caption="Members" cols={[{ label: "Status" }, { label: "Member" }, { label: "Investing as" }, { label: "State" }, { label: "Relationship" }, { label: "Waiting ends" }, { label: "Approved" }, { label: "Activity" }]}>
            {visible.map((m) => (
              <Tr key={m.id} onClick={() => setOpenId(m.id)}>
                <Td><Status value={m.status} tones={MEMBER_TONE} /></Td>
                <Td><div className="grid g4"><button type="button" className="linky" onClick={(e) => { e.stopPropagation(); setOpenId(m.id); }}>{m.display_name || m.name}</button><span className="sub">{m.email}</span></div></Td>
                <Td>{label(m.investing_as)}</Td>
                <Td>{m.state_of_residence ?? "—"}</Td>
                <Td className="num">{day(m.relationship_established_at)}</Td>
                <Td className="num">{day(m.waiting_period_ends_at)}</Td>
                <Td className="num">{day(m.approved_at)}</Td>
                <Td className="num">{m.subscriptions_count} subs · {m.participations_count} held</Td>
              </Tr>
            ))}
          </Table>
        </Panel>
      )}
      {openId ? <MemberDrawer id={openId} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}

function Fld({ label: l, value }: { label: string; value: ReactNode }) {
  return <Field label={l}><div style={{ wordBreak: "break-word" }}>{value ?? <span className="sub">—</span>}</div></Field>;
}

function MemberDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: m, isLoading } = useCpMember(id);
  const review = useCpReviewMember();
  const [notes, setNotes] = useState("");
  const [relDate, setRelDate] = useState("");
  const [waitDays, setWaitDays] = useState("");
  const [basis, setBasis] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const fire = async (decision: "approve" | "needs_changes" | "suspend" | "reinstate") => {
    if (!m) return;
    setErr(null);
    try {
      await review.mutateAsync({
        id: m.id, decision, notes: notes.trim() || null,
        relationship_established_at: decision === "approve" && relDate ? new Date(relDate).toISOString() : null,
        waiting_period_days: decision === "approve" && waitDays !== "" ? Number(waitDays) : null,
        accreditation_basis: decision === "approve" && basis.trim() ? basis.trim() : null,
      });
      setNotes("");
    } catch (e) {
      setErr(errorMessage(e, "Review failed."));
    }
  };

  const q = m?.latest_questionnaire;
  return (
    <Drawer open onClose={onClose} width="lg" ariaLabel="Capital partner member" title={m?.display_name || m?.name || (isLoading ? "Loading…" : "—")} sub={m ? `${m.email} · ${label(m.status)}` : "Member"}>
      {!m ? (
        <span className="sub">{isLoading ? "Loading member…" : "Not found"}</span>
      ) : (
        <div className="grid">
          <StatusLine tone={m.status === "approved" ? "ok" : m.status === "suspended" ? "bad" : "warn"}>
            <b>{label(m.status)}</b>
            {m.gate.waiting_days_left != null ? ` · ${m.gate.waiting_days_left} days of waiting period left` : ""}
            {m.gate.cleared ? " · offerings visible" : " · offerings hidden"}
          </StatusLine>
          <Panel title="Gate" bodyClass="grid g6">
            {m.gate.steps.map((s, i) => (
              <div key={s.key} className="row">
                <CellChip tone={s.state === "done" ? "ok" : s.state === "now" ? "acc" : "mut"}>{i + 1}</CellChip>
                <span>{s.title}</span>
                <span className="sub">{s.state === "done" ? "done" : s.state === "now" ? "in progress" : "locked"}</span>
              </div>
            ))}
          </Panel>
          <Panel title="Profile" bodyClass="grid cols-auto">
            <Fld label="Investing as" value={label(m.investing_as)} />
            <Fld label="Phone" value={m.phone} />
            <Fld label="State of residence" value={m.state_of_residence} />
            <Fld label="Capital band" value={m.capital_band} />
            <Fld label="Source" value={m.source} />
            <Fld label="Accreditation basis" value={m.accreditation_basis} />
            <Fld label="Relationship established" value={m.relationship_established_at ? when(m.relationship_established_at) : null} />
            <Fld label="Waiting period" value={m.waiting_period_days != null ? `${m.waiting_period_days} days, ends ${day(m.waiting_period_ends_at)}` : null} />
            <Fld label="Invited" value={m.invited_at ? when(m.invited_at) : null} />
            <Fld label="Signed up" value={when(m.created_at)} />
          </Panel>
          <Panel title="Investing entities" bodyClass="grid g6">
            {m.entities.length === 0 ? <span className="sub">None yet.</span> : m.entities.map((e) => (
              <div key={e.id} className="row"><span>{e.name}</span><CellChip tone="mut">{label(e.kind)}</CellChip>{e.state ? <span className="sub">{e.state}</span> : null}{e.is_default ? <CellChip tone="acc">default</CellChip> : null}</div>
            ))}
          </Panel>
          <Panel title={q ? `Questionnaire v${q.version} · ${label(q.outcome)}` : "Questionnaire"} bodyClass="grid cols-auto">
            {!q ? <span className="sub">Not submitted yet.</span> : (
              <>
                <Fld label="Submitted" value={when(q.submitted_at)} />
                <Fld label="Basis" value={q.basis} />
                <Fld label="Investing as" value={label(q.investing_as)} />
                <Fld label="State" value={q.state_of_residence} />
                {Object.entries(q.answers).map(([k, v]) => (
                  <Fld key={k} label={k.replace(/_/g, " ")} value={typeof v === "object" ? JSON.stringify(v) : String(v)} />
                ))}
                {q.review_notes ? <Fld label="Review notes" value={q.review_notes} /> : null}
              </>
            )}
          </Panel>
          {m.review_notes ? <Panel title="Desk notes"><div className="msg-b">{m.review_notes}</div></Panel> : null}
          <Panel title="Decision" bodyClass="grid g10">
            <label className="grid g6"><span className="lbl">Notes (sent to the member on Request changes; internal otherwise)</span><Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
            {m.status !== "suspended" ? (
              <div className="grid cols-auto">
                <Field label="Relationship established (blank = now)"><Input type="datetime-local" value={relDate} onChange={(e) => setRelDate(e.target.value)} /></Field>
                <Field label="Waiting period, days (blank = issuer default)"><Input type="number" min={0} max={365} value={waitDays} onChange={(e) => setWaitDays(e.target.value)} /></Field>
                <Field label="Accreditation basis"><Input placeholder="income, net_worth, entity_assets, family_office" value={basis} onChange={(e) => setBasis(e.target.value)} /></Field>
              </div>
            ) : null}
            {err ? <StatusLine tone="bad">{err}</StatusLine> : null}
            <div className="row">
              {m.status !== "suspended" ? <Btn variant="pri" disabled={review.isPending} onClick={() => void fire("approve")}>{m.status === "approved" || m.status === "waiting" ? "Re-approve" : "Approve"}</Btn> : null}
              {m.status !== "suspended" ? <Btn disabled={review.isPending} onClick={() => void fire("needs_changes")}>Request changes</Btn> : null}
              {m.status !== "suspended" ? <Btn className="danger" disabled={review.isPending} onClick={() => void fire("suspend")}>Suspend</Btn> : <Btn variant="pri" disabled={review.isPending} onClick={() => void fire("reinstate")}>Reinstate</Btn>}
              <Btn onClick={onClose}>Close</Btn>
            </div>
          </Panel>
        </div>
      )}
    </Drawer>
  );
}

export type { CpMember };
