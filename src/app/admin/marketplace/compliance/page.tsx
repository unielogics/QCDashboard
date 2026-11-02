"use client";

// Marketplace > Compliance: the Regulation D tracker and the issuer record.
//
//   GET /capital/admin/filings/summary       GET /capital/admin/filings[?kind=]
//   POST /capital/admin/filings              PATCH /capital/admin/filings/{id}
//   GET /capital/admin/issuer                PUT /capital/admin/issuer
//
// Form D and state-notice rows are created by the server when a subscription
// is marked signed (the first sale); the desk fills in filed dates,
// references and fees. Bad-actor checks are entered here per covered person.
// This tracker supports, and does not replace, review by securities counsel.

import { useMemo, useState } from "react";
import { Btn, Card, Empty, Field, Input, Kpi, KpiRow, Loading, PageHeader, Panel, Select, StatusLine, Table, Td, Textarea, Tr } from "@/components/ds";
import {
  useCpCreateFiling, useCpFilings, useCpFilingsSummary, useCpIssuer, useCpPatchFiling, useCpSaveIssuer,
  type CpFiling, type CpFilingKind, type CpFilingStatus, type CpIssuer,
} from "@/hooks/useCapitalPartners";
import { FILING_TONE, Status, SuperAdminOnly, day, errorMessage, label, money } from "@/components/marketplace/shared";

export default function CompliancePage() {
  return (
    <SuperAdminOnly>
      <Compliance />
    </SuperAdminOnly>
  );
}

const STATUSES: CpFilingStatus[] = ["due", "filed", "not_required", "cleared", "pending"];

function Compliance() {
  const { data: summary } = useCpFilingsSummary();
  const { data: filings = [], isLoading } = useCpFilings();
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const byKind = useMemo(() => {
    const m: Record<CpFilingKind, CpFiling[]> = { form_d: [], form_d_amendment: [], state_notice: [], bad_actor_check: [] };
    for (const f of filings) m[f.kind]?.push(f);
    return m;
  }, [filings]);
  return (
    <div className="grid">
      <PageHeader title="Regulation D filings and checks" lede="Form D within 15 calendar days of the first binding subscription, a notice in each member's state, annual amendments while an offering stays open, and a documented bad-actor check for every covered person. Deadlines and fees vary by state; confirm each with counsel before filing." />
      {summary ? (
        <KpiRow>
          <Kpi label="Form D filings due" value={String(summary.form_d_due)} sub={summary.form_d_next_due ? `Next due ${day(summary.form_d_next_due)}` : "Nothing due"} tone={summary.form_d_due ? "warn" : "ok"} />
          <Kpi label="State notices due" value={String(summary.state_notices_due)} sub={summary.state_notice_next_due ? `Next due ${day(summary.state_notice_next_due)}` : "Nothing due"} tone={summary.state_notices_due ? "warn" : "ok"} />
          <Kpi label="Covered persons cleared" value={`${summary.covered_persons_cleared} of ${summary.covered_persons}`} sub={summary.covered_persons - summary.covered_persons_cleared ? `${summary.covered_persons - summary.covered_persons_cleared} pending` : "All cleared"} tone={summary.covered_persons === summary.covered_persons_cleared ? "ok" : "warn"} />
          <Kpi label="Annual amendment due" value={summary.amendment_next_due ? day(summary.amendment_next_due) : "None"} sub={summary.overdue ? `${summary.overdue} overdue` : "Nothing overdue"} tone={summary.overdue ? "bad" : "ok"} />
        </KpiRow>
      ) : null}
      {msg ? <StatusLine tone={msg.tone}>{msg.text}</StatusLine> : null}
      <div className="grid cols-auto">
        <IssuerCard onMessage={setMsg} />
        <Panel title="No general solicitation: relationship controls" bodyClass="grid g6">
          {(summary?.controls ?? []).map((c) => (
            <div key={c.label} className="row"><span>{c.label}</span><span className="sp" /><span className="sub num">{c.value}</span></div>
          ))}
        </Panel>
      </div>
      {isLoading ? <Card><Loading>Loading filings…</Loading></Card> : null}
      <FilingTable title="SEC Form D" sub="Due 15 calendar days after the first sale, when the first investor is irrevocably committed. Marking one filed schedules the annual amendment." rows={[...byKind.form_d, ...byKind.form_d_amendment]} kind="form_d" onMessage={setMsg} />
      <FilingTable title="State notice filings, NASAA EFD" sub="One row per state where a subscribing member resides, created at that state's first sale. Fees and deadlines vary." rows={byKind.state_notice} kind="state_notice" onMessage={setMsg} />
      <FilingTable title="Bad actor checks, Rule 506(d)" sub="Every covered person: the issuer, its managers, directors and officers, 20%+ owners, promoters and anyone paid to introduce investors." rows={byKind.bad_actor_check} kind="bad_actor_check" onMessage={setMsg} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Issuer record
// ---------------------------------------------------------------------------

function IssuerCard({ onMessage }: { onMessage: (m: { tone: "ok" | "bad"; text: string } | null) => void }) {
  const { data: issuer } = useCpIssuer();
  const save = useCpSaveIssuer();
  const [d, setD] = useState<Partial<CpIssuer> | null>(null);
  const v = d ?? issuer;
  if (!v) return <Card><Loading /></Card>;
  const set = (k: keyof CpIssuer, val: unknown) => setD({ ...(d ?? issuer ?? {}), [k]: val });
  const submit = async () => {
    if (!d) return;
    onMessage(null);
    try {
      await save.mutateAsync({ ...d, notify_emails: (d.notify_emails ?? issuer?.notify_emails ?? []).map((e) => e.trim()).filter(Boolean) });
      setD(null);
      onMessage({ tone: "ok", text: "Issuer record saved." });
    } catch (e) {
      onMessage({ tone: "bad", text: errorMessage(e) });
    }
  };
  return (
    <Panel title="Issuer and EDGAR access" bodyClass="grid g10">
      <div className="grid cols-auto">
        <Field label="Issuer entity"><Input value={v.issuer_name ?? ""} onChange={(e) => set("issuer_name", e.target.value)} placeholder="The entity that issues the participations" /></Field>
        <Field label="CIK"><Input className="num" value={v.cik ?? ""} onChange={(e) => set("cik", e.target.value)} placeholder="EDGAR Central Index Key" /></Field>
        <Field label="EDGAR account status"><Select value={v.edgar_status ?? "not_set"} onChange={(e) => set("edgar_status", e.target.value)}><option value="not_set">Not set up</option><option value="applied">Applied</option><option value="active">Active</option></Select></Field>
        <Field label="Access granted"><Input type="date" value={v.edgar_access_granted_at ?? ""} onChange={(e) => set("edgar_access_granted_at", e.target.value || null)} /></Field>
        <Field label="Account administrators"><Input type="number" className="num" value={String(v.admin_count ?? 0)} onChange={(e) => set("admin_count", Number(e.target.value || 0))} /></Field>
        <Field label="Default waiting period, days" hint="Counted from the relationship date set at approval."><Input type="number" className="num" value={String(v.default_waiting_period_days ?? 30)} onChange={(e) => set("default_waiting_period_days", Number(e.target.value || 0))} /></Field>
        <Field label="Servicer, as shown to members"><Input value={v.servicer_label ?? ""} onChange={(e) => set("servicer_label", e.target.value)} /></Field>
        <Field label="Desk notifications (one email per line)"><Textarea rows={3} value={(v.notify_emails ?? []).join("\n")} onChange={(e) => set("notify_emails", e.target.value.split(/\n|,/))} /></Field>
      </div>
      <Field label="Wiring instructions (confidential; sent only inside the subscription-documents email)"><Textarea rows={4} value={v.wiring_instructions ?? ""} onChange={(e) => set("wiring_instructions", e.target.value)} /></Field>
      <div className="row"><Btn variant="pri" disabled={!d || save.isPending} onClick={() => void submit()}>Save</Btn>{d ? <Btn onClick={() => setD(null)}>Discard</Btn> : null}<span className="sub">SEC filing fee for Form D: none.</span></div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Filing tables
// ---------------------------------------------------------------------------

function FilingTable({ title, sub, rows, kind, onMessage }: { title: string; sub: string; rows: CpFiling[]; kind: CpFilingKind; onMessage: (m: { tone: "ok" | "bad"; text: string } | null) => void }) {
  const patch = useCpPatchFiling();
  const create = useCpCreateFiling();
  const [editing, setEditing] = useState<CpFiling | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<Partial<CpFiling>>({});

  const open = (f: CpFiling) => { setEditing(f); setAdding(false); setForm({ state: f.state, subject: f.subject, subject_role: f.subject_role, due_at: f.due_at, filed_at: f.filed_at, checked_at: f.checked_at, status: f.status, fee_amount: f.fee_amount, reference: f.reference, sources: f.sources, notes: f.notes }); };
  const startAdd = () => { setEditing(null); setAdding(true); setForm({ kind, status: kind === "bad_actor_check" ? "pending" : "due", sources: kind === "bad_actor_check" ? "SEC, FINRA BrokerCheck, state regulators, court records" : null }); };
  const save = async () => {
    onMessage(null);
    try {
      if (editing) await patch.mutateAsync({ id: editing.id, ...form });
      else await create.mutateAsync({ ...form, kind });
      setEditing(null); setAdding(false);
      onMessage({ tone: "ok", text: "Saved." });
    } catch (e) {
      onMessage({ tone: "bad", text: errorMessage(e) });
    }
  };
  const isBadActor = kind === "bad_actor_check";
  const isState = kind === "state_notice";
  const set = (k: keyof CpFiling, val: unknown) => setForm((f) => ({ ...f, [k]: val }));

  return (
    <Panel title={title} bodyClass="grid g10">
      <div className="row"><span className="sub">{sub}</span><span className="sp" /><Btn size="sm" onClick={startAdd}>{isBadActor ? "Add covered person" : isState ? "Add state notice" : "Add Form D row"}</Btn></div>
      {rows.length === 0 ? <Empty title="Nothing here yet">{isBadActor ? "Add each covered person before the first offering opens." : "Rows appear when a subscription is marked signed."}</Empty> : (
        <Table caption={title} cols={isBadActor
          ? [{ label: "Covered person" }, { label: "Role" }, { label: "Last check" }, { label: "Sources" }, { label: "Result" }, { label: "" }]
          : isState
            ? [{ label: "State" }, { label: "Offering" }, { label: "First sale to resident" }, { label: "Due" }, { label: "Fee", align: "r" }, { label: "Status" }, { label: "Reference" }, { label: "" }]
            : [{ label: "Offering" }, { label: "Kind" }, { label: "First sale" }, { label: "Due" }, { label: "Filed" }, { label: "Status" }, { label: "Investors", align: "r" }, { label: "Reference" }, { label: "" }]}>
          {rows.map((f) => (
            <Tr key={f.id}>
              {isBadActor ? (
                <>
                  <Td>{f.subject ?? "—"}</Td>
                  <Td>{f.subject_role ?? "—"}</Td>
                  <Td className="num">{day(f.checked_at)}</Td>
                  <Td><span className="sub">{f.sources ?? "—"}</span></Td>
                  <Td><Status value={f.status} tones={FILING_TONE} /></Td>
                </>
              ) : isState ? (
                <>
                  <Td>{f.state ?? "—"}</Td>
                  <Td><div className="grid g4"><span>{f.listing_name ?? "—"}</span><span className="sub num">{f.listing_ref ?? ""}</span></div></Td>
                  <Td className="num">{day(f.first_sale_at)}</Td>
                  <Td className="num">{day(f.due_at)}</Td>
                  <Td className="num" align="r">{money(f.fee_amount)}</Td>
                  <Td><Status value={f.status} tones={FILING_TONE} /></Td>
                  <Td className="num">{f.reference ?? "—"}</Td>
                </>
              ) : (
                <>
                  <Td><div className="grid g4"><span>{f.listing_name ?? "Program level"}</span><span className="sub num">{f.listing_ref ?? ""}</span></div></Td>
                  <Td>{label(f.kind)}</Td>
                  <Td className="num">{day(f.first_sale_at)}</Td>
                  <Td className="num">{day(f.due_at)}</Td>
                  <Td className="num">{day(f.filed_at)}</Td>
                  <Td><Status value={f.status} tones={FILING_TONE} /></Td>
                  <Td className="num" align="r">{f.investor_count ?? "—"}</Td>
                  <Td className="num">{f.reference ?? "—"}</Td>
                </>
              )}
              <Td><Btn size="sm" onClick={() => open(f)}>Edit</Btn></Td>
            </Tr>
          ))}
        </Table>
      )}
      {editing || adding ? (
        <Panel title={editing ? "Edit row" : "New row"} bodyClass="grid g10">
          <div className="grid cols-auto">
            {isBadActor ? (<>
              <Field label="Covered person"><Input value={form.subject ?? ""} onChange={(e) => set("subject", e.target.value)} /></Field>
              <Field label="Role"><Input value={form.subject_role ?? ""} onChange={(e) => set("subject_role", e.target.value)} placeholder="Executive officer, director, 20%+ owner, promoter, compensated solicitor" /></Field>
              <Field label="Last check"><Input type="date" value={form.checked_at ?? ""} onChange={(e) => set("checked_at", e.target.value || null)} /></Field>
              <Field label="Sources"><Input value={form.sources ?? ""} onChange={(e) => set("sources", e.target.value)} /></Field>
            </>) : (<>
              {isState ? <Field label="State (2 letters)"><Input value={form.state ?? ""} onChange={(e) => set("state", e.target.value.toUpperCase())} maxLength={2} /></Field> : null}
              <Field label="First sale"><Input type="datetime-local" value={form.first_sale_at ? form.first_sale_at.slice(0, 16) : ""} onChange={(e) => set("first_sale_at", e.target.value ? new Date(e.target.value).toISOString() : null)} /></Field>
              <Field label="Due"><Input type="date" value={form.due_at ?? ""} onChange={(e) => set("due_at", e.target.value || null)} /></Field>
              <Field label="Filed"><Input type="date" value={form.filed_at ?? ""} onChange={(e) => set("filed_at", e.target.value || null)} /></Field>
              {isState ? <Field label="Fee, $"><Input type="number" className="num" value={form.fee_amount ?? ""} onChange={(e) => set("fee_amount", e.target.value || null)} /></Field> : null}
              <Field label="Reference" hint="EDGAR accession number or EFD confirmation"><Input value={form.reference ?? ""} onChange={(e) => set("reference", e.target.value)} /></Field>
            </>)}
            <Field label="Status"><Select value={form.status ?? "due"} onChange={(e) => set("status", e.target.value)}>{STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select></Field>
          </div>
          <Field label="Notes"><Textarea rows={2} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></Field>
          <div className="row"><Btn variant="pri" disabled={patch.isPending || create.isPending} onClick={() => void save()}>Save</Btn><Btn onClick={() => { setEditing(null); setAdding(false); }}>Cancel</Btn></div>
        </Panel>
      ) : null}
    </Panel>
  );
}
