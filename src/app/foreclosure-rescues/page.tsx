"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthedApi, useCurrentUser } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import { Btn, Callout, CellChip, Input, Select, cx } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { PinRowButton, TableWorkspace } from "@/components/ds/TableWorkspace";
import { Icon } from "@/components/design-system/Icon";
import { usePinnedRows } from "@/lib/tablePinning";
import { ForeclosureRescueCreateDrawer } from "./ForeclosureRescueCreateDrawer";

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
  const [createOpen, setCreateOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [urgencyFilter, setUrgencyFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const isPartner = user?.role === Role.PROFESSIONAL_REFERRAL_PARTNER;
  const canOperate = user?.role === Role.SUPER_ADMIN || user?.role === Role.LOAN_EXEC;

  const load = useCallback(async (): Promise<Rescue[]> => {
    if (!user) return [];
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
      return rescueRows;
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Rescue queue could not be loaded."); return []; }
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

  const counts = useMemo(() => ({
    total: visible.length,
    critical: visible.filter((row) => row.urgency.key === "critical").length,
    ready: visible.filter((row) => row.status === "ready_for_initial_review" || row.status === "in_underwriting").length,
    missing: visible.reduce((sum, row) => sum + row.documents.filter((document) => document.required && ["missing", "requested"].includes(document.status)).length, 0),
  }), [visible]);
  const rescueTableStorageKey = user?.id ? `foreclosure-rescues:${user.id}` : null;
  const {
    rows: orderedVisible,
    pinnedIds: pinnedRescueIds,
    isPinned: isRescuePinned,
    togglePin: toggleRescuePin,
    clearPins: clearRescuePins,
  } = usePinnedRows({
    rows: visible,
    getId: (row) => row.id,
    storageKey: rescueTableStorageKey,
  });

  async function createdRescue(created: { id: string }) {
    const updated = await load();
    setSelected(updated.find((row) => row.id === created.id) ?? null);
    setCreateOpen(false);
  }

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

  return <>
    <div className={cx("ai-intake-list-shell", selected && "workspace-hidden")} style={{ maxWidth: 1480, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12, minHeight: "calc(100dvh - 95px - var(--pad-y))" }}>
      <div className="ckhead" style={{ flexShrink: 0 }}>
        <div className="ckrow"><h1>Foreclosure rescues</h1><CellChip tone="mut">{rows.length} files</CellChip><span className="sp" /><span className="sub">Deadline-first underwriting for commercial payoff files.</span><Btn variant="pri" size="sm" onClick={() => setCreateOpen(true)}><Icon name="plus" size={13} /> Create rescue</Btn></div>
        <div className="cktabs" role="tablist" aria-label="Rescue status"><button type="button" role="tab" aria-selected={filter === "all"} className={filter === "all" ? "on" : undefined} onClick={() => setFilter("all")}>All files</button>{STATUSES.slice(0, 5).map(([key, label]) => <button type="button" role="tab" aria-selected={filter === key} className={filter === key ? "on" : undefined} key={key} onClick={() => setFilter(key)}>{label}</button>)}</div>
      </div>

      <div className="kpis" style={{ flexShrink: 0 }}><div className="kpi"><div className="lbl">Matching files</div><div className="knum num">{counts.total}</div><div className="sub">current filters</div></div><div className="kpi"><div className="lbl">Critical deadlines</div><div className="knum num">{counts.critical}</div><div className="sub">passed or within 7 days</div></div><div className="kpi"><div className="lbl">Active review</div><div className="knum num">{counts.ready}</div><div className="sub">ready or in underwriting</div></div><div className="kpi"><div className="lbl">Missing requirements</div><div className="knum num">{counts.missing}</div><div className="sub">across visible files</div></div></div>

      <div className="panel" style={{ flexShrink: 0 }}><div className="panel-h" style={{ display: "grid", gridTemplateColumns: "minmax(260px,1fr) 190px 240px", gap: 10 }}><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search property, entity, firm, or submitter" aria-label="Search rescue files" /><Select value={urgencyFilter} onChange={(event) => setUrgencyFilter(event.target.value)} aria-label="Urgency"><option value="all">All urgency</option><option value="critical">Critical</option><option value="urgent">Urgent</option><option value="time_sensitive">Time Sensitive</option><option value="standard">Standard</option></Select><Select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Rescue status"><option value="all">All rescue statuses</option>{STATUSES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></div></div>
      {error ? <Callout tone="bad">{error}</Callout> : null}

      {canOperate && applications.length ? <div className="panel" style={{ flexShrink: 0, maxHeight: 190, overflow: "auto" }}><div className="panel-h"><strong>Professional partner applications</strong><CellChip tone="warn">{applications.length} pending</CellChip></div><div className="panel-b grid g8">{applications.map((application) => <div className="line" key={application.id}><div><strong>{application.company_name}</strong><div className="sub">{application.contact_name} · {application.contact_email} · {application.firm_type.replaceAll("_", " ")}</div>{application.notes ? <div className="sub">{application.notes}</div> : null}</div><span className="sp" /><Btn size="sm" onClick={() => void decide(application, "denied")}>Deny</Btn><Btn variant="pri" size="sm" onClick={() => void decide(application, "approved")}>Approve & invite</Btn></div>)}</div></div> : null}
      {isPartner && user.referral_partner_company_admin ? <div className="panel" style={{ flexShrink: 0, maxHeight: 190, overflow: "auto" }}><div className="panel-h"><strong>Firm members</strong><span className="sub">{firmMembers.filter((member) => member.active).length} active</span><span className="sp" /><Btn size="sm" onClick={() => void inviteFirmMember()}><Icon name="plus" size={12} /> Invite colleague</Btn></div><div className="panel-b grid g8">{firmMembers.map((member) => <div className="line" key={member.id}><div><strong>{member.name}</strong><div className="sub">{member.email}{member.is_company_admin ? " · Firm administrator" : ""}</div></div><span className="sp" /><CellChip tone={member.active ? "ok" : "mut"}>{member.active ? "Active" : "Inactive"}</CellChip>{member.active && member.id !== user.id ? <Btn size="sm" onClick={() => void deactivateFirmMember(member)}>Deactivate</Btn> : null}</div>)}</div></div> : null}

      <TableWorkspace
        title="Foreclosure rescue files"
        description="Scroll the page to give the deadline queue more room, or focus the table for full-screen review."
        storageKey={rescueTableStorageKey ?? undefined}
        actions={pinnedRescueIds.length ? <Btn size="sm" onClick={clearRescuePins}>Clear pinned ({pinnedRescueIds.length})</Btn> : null}
      >
        <div className="tblwrap">
          <table className="tbl">
            <caption className="sr-only">Foreclosure rescue files</caption>
            <thead>
              <tr><th>File</th><th>Deadline</th><th>Urgency</th><th className="r">Payoff</th><th className="r">Value / LTV</th><th>Status</th><th>Documents</th><th>Assigned</th><th className="r">Actions</th></tr>
            </thead>
            <tbody>
              {orderedVisible.map((row) => {
                const received = row.documents.filter((document) => ["uploaded", "received_unverified", "verified", "waived", "not_applicable"].includes(document.status)).length;
                const urgencyTone = row.urgency.key === "critical" ? "bad" : row.urgency.key === "urgent" || row.urgency.key === "time_sensitive" ? "warn" : "mut";
                const pinned = isRescuePinned(row.id);
                return (
                  <tr
                    key={row.id}
                    onClick={() => setSelected(row)}
                    className={cx(selected?.id === row.id && "tone-acc", pinned && "table-row-pinned")}
                    data-pinned={pinned || undefined}
                  >
                    <td><button type="button" className="linky" onClick={(event) => { event.stopPropagation(); setSelected(row); }}>{row.holding_entity || row.borrower_name}</button><div className="sub">{row.property_addresses.join(" · ") || "Address pending"}</div><div className="sub num">{row.id.slice(0, 8)}</div></td>
                    <td><strong>{date(row.sale_date)}</strong>{row.urgency.days_remaining != null ? <div className="sub num">{row.urgency.days_remaining < 0 ? `${Math.abs(row.urgency.days_remaining)} days past` : `${row.urgency.days_remaining} days left`}</div> : <div className="sub">Date required</div>}</td>
                    <td><CellChip tone={urgencyTone}>{row.urgency.label}</CellChip></td>
                    <td className="r num">{money.format(row.payoff_balance)}</td>
                    <td className="r"><strong className="num">{money.format(row.estimated_market_value)}</strong><div className="sub num">{row.calculated_ltv_pct.toFixed(1)}% LTV</div></td>
                    <td><CellChip tone={row.status === "funded" ? "ok" : row.status === "declined" || row.status === "withdrawn_expired" ? "bad" : row.status === "new_rescue" ? "warn" : "acc"}>{row.status_label}</CellChip></td>
                    <td><CellChip tone={received === row.documents.length ? "ok" : "pet"}>{received}/{row.documents.length}</CellChip></td>
                    <td>{row.assigned_underwriter_name || "Unassigned"}</td>
                    <td className="r">
                      <span className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap", gap: 6 }}>
                        <PinRowButton pinned={pinned} onToggle={() => toggleRescuePin(row.id)} label={row.holding_entity || row.borrower_name} />
                        <Btn size="sm" onClick={(event) => { event.stopPropagation(); setSelected(row); }}>Open</Btn>
                      </span>
                    </td>
                  </tr>
                );
              })}
              {!orderedVisible.length ? <tr><td colSpan={9}><div className="empty">No rescue files match these filters.</div></td></tr> : null}
            </tbody>
          </table>
        </div>
      </TableWorkspace>
    </div>

    {createOpen ? <ForeclosureRescueCreateDrawer user={user} isPartner={isPartner} onClose={() => setCreateOpen(false)} onCreated={createdRescue} /> : null}
    {selected ? <Drawer open onClose={() => setSelected(null)} width="xl" title={selected.holding_entity || selected.borrower_name} sub={`Rescue file ${selected.id.slice(0, 8)} · ${selected.status_label}`} headerActions={<>{isPartner ? <><Btn variant="pri" size="sm" onClick={() => void openPartnerUpload(selected)}>Upload documents</Btn><Btn size="sm" onClick={() => void sendPartnerMessage(selected)}>Message underwriting</Btn></> : null}{canOperate ? <Btn variant="pri" size="sm" onClick={() => void issueTermSheet(selected)}>Issue 12.99% terms</Btn> : null}</>}>
      <div className="grid g12"><div className="kpis"><div className="kpi"><div className="lbl">Requested</div><div className="knum num">{money.format(selected.requested_loan_amount)}</div><div className="sub">payoff-only proceeds</div></div><div className="kpi"><div className="lbl">Payoff</div><div className="knum num">{money.format(selected.payoff_balance)}</div><div className="sub">entered obligation</div></div><div className="kpi"><div className="lbl">Estimated value</div><div className="knum num">{money.format(selected.estimated_market_value)}</div><div className="sub">{selected.calculated_ltv_pct.toFixed(1)}% payoff LTV</div></div><div className="kpi"><div className="lbl">Sale deadline</div><div className="knum num">{date(selected.sale_date)}</div><div className="sub">{selected.urgency.label}</div></div></div>
        <div className="panel"><div className="panel-h"><strong>File control</strong><span className="sp" /><CellChip tone={selected.client_contact_suppressed ? "warn" : "ok"}>{selected.client_contact_suppressed ? "Client contact suppressed" : "Owner contact authorized"}</CellChip></div><div className="panel-b"><div className="fldgrid two">{canOperate ? <><label><span className="lbl">Rescue status</span><Select value={selected.status} onChange={(event) => void changeStatus(selected, event.target.value)}>{STATUSES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></label><label><span className="lbl">Assigned underwriter</span><Select value={selected.assigned_underwriter_user_id || ""} onChange={(event) => void assign(selected, event.target.value)}><option value="">Unassigned queue</option>{team.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</Select></label></> : null}</div><div className="line mt"><span className="sub">Submitted by</span><strong>{selected.submitter_name}{selected.firm_name ? ` · ${selected.firm_name}` : ""} · {selected.submitter_email}</strong></div></div></div>
        {(["Initial Review", "Due Diligence & Closing"] as const).map((group) => <div className="panel" key={group}><div className="panel-h"><strong>{group}</strong><span className="sp" /><CellChip tone="mut">{selected.documents.filter((document) => document.category === group).length} requirements</CellChip></div><div>{selected.documents.filter((document) => document.category === group).map((document) => <div className="line" style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)" }} key={document.id}><div><strong>{document.name}</strong><div className="sub">{document.required ? "Required when applicable" : "If available"}</div></div><span className="sp" />{canOperate ? <Select value={document.status} onChange={(event) => void changeDocument(selected, document, event.target.value)}><option value="missing">Missing</option><option value="requested">Requested</option><option value="received_unverified">Received — unverified</option><option value="verified">Verified</option><option value="waived">Waived</option><option value="not_applicable">Not applicable</option></Select> : <CellChip tone={document.status === "verified" ? "ok" : "mut"}>{document.status.replaceAll("_", " ")}</CellChip>}</div>)}</div></div>)}
        {selected.messages.length ? <div className="panel"><div className="panel-h"><strong>Firm correspondence</strong></div><div className="panel-b grid g8">{selected.messages.map((message) => <div className="callout c-mut" key={message.id}><div><strong>{message.author_name}</strong><div>{message.content}</div></div></div>)}</div></div> : null}
      </div>
    </Drawer> : null}
  </>;
}
