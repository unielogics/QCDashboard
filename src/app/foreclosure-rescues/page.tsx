"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthedApi, useCurrentUser } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";

type RescueDocument = { id: string; name: string; category: string | null; required: boolean; status: string };
type Rescue = {
  id: string; status: string; status_label: string; urgency: { key: string; label: string; days_remaining: number | null; warning: string | null };
  sale_date: string | null; property_addresses: string[]; property_type: string; payoff_balance: number; estimated_market_value: number;
  calculated_ltv_pct: number; requested_loan_amount: number; submitter_type: string; submitter_name: string; submitter_email: string;
  firm_name: string | null; borrower_name: string; holding_entity: string; assigned_underwriter_user_id: string | null;
  assigned_underwriter_name: string | null; client_contact_suppressed: boolean; documents: RescueDocument[];
  messages: Array<{ id: string; author_name: string; content: string; created_at: string }>;
  created_at: string; updated_at: string;
};
type TeamMember = { id: string; name: string; role: string };
type FirmMember = { id: string; name: string; email: string; phone: string | null; is_company_admin: boolean; active: boolean };
type PartnerApplication = { id: string; company_name: string; firm_type: string; specialties: string[]; geographic_states: string[]; estimated_annual_referrals: number | null; contact_name: string; contact_email: string; contact_phone: string; notes: string | null; status: string; created_at: string };

const STATUSES = [
  ["new_rescue", "New Rescue"], ["initial_docs_pending", "Initial Docs Pending"],
  ["ready_for_initial_review", "Ready for Initial Review"], ["in_underwriting", "In Underwriting"],
  ["term_sheet_issued", "Term Sheet Issued"], ["closing_docs_pending", "Closing Docs Pending"],
  ["clear_to_close", "Clear to Close"], ["funded", "Funded"], ["declined", "Declined"],
  ["withdrawn_expired", "Withdrawn / Deadline Passed"],
] as const;

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const date = (value: string | null) => value ? new Date(`${value}T00:00:00`).toLocaleDateString() : "Not provided";

export default function ForeclosureRescuesPage() {
  const api = useAuthedApi();
  const { data: user } = useCurrentUser();
  const [rows, setRows] = useState<Rescue[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [applications, setApplications] = useState<PartnerApplication[]>([]);
  const [firmMembers, setFirmMembers] = useState<FirmMember[]>([]);
  const [selected, setSelected] = useState<Rescue | null>(null);
  const [filter, setFilter] = useState("all");
  const [urgencyFilter, setUrgencyFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const isPartner = user?.role === Role.PROFESSIONAL_REFERRAL_PARTNER;
  const canOperate = user?.role === Role.SUPER_ADMIN || user?.role === Role.LOAN_EXEC;

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const path = isPartner ? "/professional/foreclosure-rescues" : "/foreclosure-rescues";
      const rescueRows = await api<Rescue[]>(path);
      setRows(rescueRows);
      if (selected) setSelected(rescueRows.find((row) => row.id === selected.id) ?? null);
      if (isPartner) setFirmMembers(await api<FirmMember[]>("/professional/foreclosure-rescues/members"));
      if (canOperate) {
        const [members, apps] = await Promise.all([
          api<TeamMember[]>("/users/team"),
          api<PartnerApplication[]>("/foreclosure-rescues/partner-applications?application_status=pending"),
        ]);
        setTeam(members.filter((member) => member.role === Role.LOAN_EXEC || member.role === Role.SUPER_ADMIN));
        setApplications(apps);
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Rescue queue could not be loaded."); }
    finally { setLoading(false); }
  }, [api, canOperate, isPartner, selected, user]);

  useEffect(() => { void load(); }, [user?.id, isPartner]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter !== "all" && row.status !== filter) return false;
      if (urgencyFilter !== "all" && row.urgency.key !== urgencyFilter) return false;
      if (!needle) return true;
      return [row.holding_entity, row.borrower_name, row.submitter_name, row.submitter_email, row.firm_name, ...row.property_addresses]
        .filter(Boolean).some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [filter, query, rows, urgencyFilter]);

  async function changeStatus(row: Rescue, next: string) {
    let reason: string | null = null;
    if (next === "declined" || next === "withdrawn_expired") {
      reason = window.prompt("Reason required for this terminal status:")?.trim() || null;
      if (!reason) return;
    }
    await api(`/foreclosure-rescues/${row.id}/status`, { method: "PATCH", body: JSON.stringify({ status: next, reason }) });
    await load();
  }

  async function assign(row: Rescue, assignee: string) {
    await api(`/foreclosure-rescues/${row.id}/assignment`, { method: "PATCH", body: JSON.stringify({ assigned_underwriter_user_id: assignee || null }) });
    await load();
  }

  async function decide(application: PartnerApplication, decision: "approved" | "denied") {
    const notes = window.prompt(decision === "approved" ? "Optional approval note:" : "Reason for denial:") || null;
    await api(`/foreclosure-rescues/partner-applications/${application.id}/decision`, { method: "POST", body: JSON.stringify({ decision, review_notes: notes }) });
    await load();
  }

  async function changeDocument(row: Rescue, document: RescueDocument, next: string) {
    let reason: string | null = null;
    if (next === "waived" || next === "not_applicable") {
      reason = window.prompt(next === "waived" ? "Waiver reason:" : "Why is this not applicable?")?.trim() || null;
      if (!reason) return;
    }
    await api(`/foreclosure-rescues/${row.id}/documents/${document.id}`, {
      method: "PATCH", body: JSON.stringify({ status: next, reason }),
    });
    await load();
  }

  async function issueTermSheet(row: Rescue) {
    const entered = window.prompt("Approved payoff amount for the fixed 12.99% term sheet:", String(row.requested_loan_amount));
    if (!entered) return;
    const approvedAmount = Number(entered.replaceAll(",", "").replace("$", ""));
    if (!Number.isFinite(approvedAmount) || approvedAmount <= 0) return;
    const conditions = window.prompt("Conditions (one per line, optional):")?.split("\n").map((value) => value.trim()).filter(Boolean) || [];
    await api(`/foreclosure-rescues/${row.id}/term-sheet`, { method: "POST", body: JSON.stringify({ approved_amount: approvedAmount, conditions }) });
    await load();
  }

  async function openPartnerUpload(row: Rescue) {
    const result = await api<{ url: string; passcode: string }>(`/professional/foreclosure-rescues/${row.id}/upload-link`, { method: "POST" });
    window.alert(`Secure-room passcode: ${result.passcode}\n\nCopy this code, then enter it in the room.`);
    window.open(result.url, "_blank", "noopener,noreferrer");
  }

  async function sendPartnerMessage(row: Rescue) {
    const content = window.prompt("Message to the QC underwriting team:")?.trim();
    if (!content) return;
    await api(`/professional/foreclosure-rescues/${row.id}/messages`, { method: "POST", body: JSON.stringify({ content }) });
    await load();
  }

  async function inviteFirmMember() {
    const name = window.prompt("Colleague name:")?.trim();
    if (!name) return;
    const email = window.prompt("Colleague email:")?.trim();
    if (!email) return;
    const phone = window.prompt("Colleague phone (optional):")?.trim() || null;
    await api("/professional/foreclosure-rescues/members", { method: "POST", body: JSON.stringify({ name, email, phone }) });
    await load();
  }

  async function deactivateFirmMember(member: FirmMember) {
    if (!window.confirm(`Deactivate ${member.name}?`)) return;
    await api(`/professional/foreclosure-rescues/members/${member.id}`, { method: "DELETE" });
    await load();
  }

  if (!user || loading) return <div className="card"><span className="sub">Loading foreclosure rescue queue…</span></div>;
  if (!canOperate && !isPartner) return <div className="card">This workspace is limited to underwriting and approved professional partners.</div>;

  return <div className="grid g12">
    <div className="page-head"><div><span className="eyebrow">Deadline desk</span><h1>Foreclosure rescues</h1><p className="sub">12.99% note rate · 24-month term · 480-month amortization · payoff-only proceeds</p></div><a className="btn pri" href="https://qualifiedcommercial.com/foreclosure-bailout#rescue-intake" target="_blank" rel="noreferrer">New rescue</a></div>
    {error ? <div className="callout bad">{error}</div> : null}

    {canOperate && applications.length ? <section className="card"><div className="row"><div><span className="eyebrow">Enrollment</span><h2>Professional partner applications</h2></div><span className="pill warn">{applications.length} pending</span></div><div className="grid g12 mt">{applications.map((application) => <div className="card inset" key={application.id}><div className="row"><div><strong>{application.company_name}</strong><div className="sub">{application.contact_name} · {application.contact_email} · {application.contact_phone}</div></div><div className="row"><button className="btn" onClick={() => void decide(application, "denied")}>Deny</button><button className="btn pri" onClick={() => void decide(application, "approved")}>Approve & invite</button></div></div><p className="sub">{application.firm_type.replaceAll("_", " ")} · {application.specialties.join(", ")} · {application.geographic_states.join(", ")}{application.estimated_annual_referrals != null ? ` · ${application.estimated_annual_referrals} estimated annual referrals` : ""}</p>{application.notes ? <p>{application.notes}</p> : null}</div>)}</div></section> : null}

    {isPartner && user.referral_partner_company_admin ? <section className="card"><div className="row"><div><span className="eyebrow">Firm workspace</span><h2>Colleagues</h2></div><button className="btn" onClick={() => void inviteFirmMember()}>Invite colleague</button></div><div className="grid g12 mt">{firmMembers.map((member) => <div className="row card inset" key={member.id}><div><strong>{member.name}</strong><div className="sub">{member.email}{member.is_company_admin ? " · Firm administrator" : ""}</div></div><div className="row"><span className={`pill ${member.active ? "ok" : ""}`}>{member.active ? "Active" : "Inactive"}</span>{member.active && member.id !== user.id ? <button className="btn" onClick={() => void deactivateFirmMember(member)}>Deactivate</button> : null}</div></div>)}</div></section> : null}

    <section className="card"><div className="row"><div><span className="eyebrow">Queue</span><h2>{isPartner ? "Firm matters" : "Underwriting queue"}</h2></div><div className="row"><input aria-label="Search rescue files" placeholder="Search property, firm, or submitter" value={query} onChange={(event) => setQuery(event.target.value)} /><select value={urgencyFilter} onChange={(event) => setUrgencyFilter(event.target.value)}><option value="all">All urgency</option><option value="critical">Critical</option><option value="urgent">Urgent</option><option value="time_sensitive">Time Sensitive</option><option value="standard">Standard</option></select><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All rescue statuses</option>{STATUSES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div></div>
      {!visible.length ? <div className="empty">No rescue files match this view.</div> : <div className="grid g12 mt">{visible.map((row) => { const received = row.documents.filter((document) => ["uploaded", "received_unverified", "verified", "waived", "not_applicable"].includes(document.status)).length; return <button type="button" className="card inset text-left" key={row.id} onClick={() => setSelected(row)}><div className="row"><div><strong>{row.holding_entity || row.borrower_name}</strong><div className="sub">{row.property_addresses.join(" · ") || "Address pending"}</div></div><div className="row"><span className={`pill ${row.urgency.key === "critical" ? "bad" : row.urgency.key === "urgent" ? "warn" : ""}`}>{row.urgency.label}</span><span className="pill">{row.status_label}</span></div></div><div className="kpis mt"><div><span className="lbl">Sale date</span><b>{date(row.sale_date)}</b></div><div><span className="lbl">Payoff / value</span><b>{money.format(row.payoff_balance)} / {money.format(row.estimated_market_value)}</b></div><div><span className="lbl">Payoff LTV</span><b>{row.calculated_ltv_pct.toFixed(1)}%</b></div><div><span className="lbl">Documents</span><b>{received}/{row.documents.length}</b></div></div>{row.urgency.warning ? <div className="callout warn mt">{row.urgency.warning}</div> : null}</button>; })}</div>}
    </section>

    {selected ? <section className="card"><div className="row"><div><span className="eyebrow">Rescue file</span><h2>{selected.holding_entity}</h2><p className="sub">Submitted by {selected.submitter_name}{selected.firm_name ? ` · ${selected.firm_name}` : ""} · {selected.submitter_email}</p></div><button className="btn" onClick={() => setSelected(null)}>Close</button></div>
      <div className="kpis mt"><div><span className="lbl">Request</span><b>{money.format(selected.requested_loan_amount)}</b></div><div><span className="lbl">Payoff</span><b>{money.format(selected.payoff_balance)}</b></div><div><span className="lbl">Value</span><b>{money.format(selected.estimated_market_value)}</b></div><div><span className="lbl">Client contact</span><b>{selected.client_contact_suppressed ? "Suppressed" : "Owner consented"}</b></div></div>
      {canOperate ? <><div className="grid two mt"><label><span className="lbl">Rescue status</span><select value={selected.status} onChange={(event) => void changeStatus(selected, event.target.value)}>{STATUSES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label><span className="lbl">Assigned underwriter</span><select value={selected.assigned_underwriter_user_id || ""} onChange={(event) => void assign(selected, event.target.value)}><option value="">Unassigned queue</option>{team.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label></div><div className="row mt"><button className="btn pri" onClick={() => void issueTermSheet(selected)}>Issue locked 12.99% terms</button></div></> : null}
      {isPartner ? <div className="row mt"><button className="btn pri" onClick={() => void openPartnerUpload(selected)}>Upload documents</button><button className="btn" onClick={() => void sendPartnerMessage(selected)}>Message underwriting</button></div> : null}
      {(["Initial Review", "Due Diligence & Closing"] as const).map((group) => <div className="mt" key={group}><h3>{group}</h3><div className="grid g12">{selected.documents.filter((document) => document.category === group).map((document) => <div className="row card inset" key={document.id}><div><strong>{document.name}</strong><div className="sub">{document.required ? "Required when applicable" : "If available"}</div></div>{canOperate ? <select value={document.status} onChange={(event) => void changeDocument(selected, document, event.target.value)}><option value="missing">Missing</option><option value="requested">Requested</option><option value="received_unverified">Received — unverified</option><option value="verified">Verified</option><option value="waived">Waived</option><option value="not_applicable">Not applicable</option></select> : <span className="pill">{document.status.replaceAll("_", " ")}</span>}</div>)}</div></div>)}
      {selected.messages.length ? <div className="mt"><h3>Firm correspondence</h3><div className="grid g12">{selected.messages.map((message) => <div className="card inset" key={message.id}><strong>{message.author_name}</strong><p className="mb-0">{message.content}</p></div>)}</div></div> : null}
    </section> : null}
  </div>;
}
