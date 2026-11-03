"use client";

// Marketplace > Listing editor: terms, narrative, documents, publish, run.
//
//   GET   /capital/admin/listings/{id}            PATCH /capital/admin/listings/{id}
//   POST  /capital/admin/listings/{id}/publish    {reason, confirmed: true}
//   POST  /capital/admin/listings/{id}/status     {status, outcome, reason, effective_at}
//   POST  /capital/admin/listings/{id}/withdraw   {reason, confirmed: true}
//   POST  /capital/admin/listings/{id}/documents/upload-init | upload-complete; DELETE .../documents/{doc}
//   POST  /capital/admin/subscriptions/{id}/send-documents | mark-signed | mark-funded | cancel | decline
//   PATCH /capital/admin/participations/{id}
//
// Publishing is the one irreversible-looking step (members can see the
// listing afterwards), so it goes through the confirmation dialog with a
// summary of what members will see. Marking a subscription signed starts the
// Form D clock on the server; the Compliance screen shows the rows it creates.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { Btn, Card, CellChip, Field, Input, Loading, PageHeader, Panel, Seg, Select, StatusLine, Table, Td, Textarea, Tr } from "@/components/ds";
import { useConfirmAction } from "@/components/design-system/ConfirmationProvider";
import {
  useCpListing, useCpListingAction, useCpPatchListing, useCpPatchParticipation, useCpSupersedeDocument, useCpUploadDocument,
  type CpDocumentKind, type CpListing, type CpListingPatch, type CpParticipation, type CpServicerStatus, type CpSubscription,
} from "@/hooks/useCapitalPartners";
import { DOC_KINDS, FREQ_LABEL, LIEN_LABEL, LISTING_TONE, SERVICER_TONE, SUB_TONE, Status, SuperAdminOnly, VERTICAL_LABEL, day, errorMessage, label, money, pct, when } from "@/components/marketplace/shared";
import { SourceSnapshotCard } from "@/components/marketplace/SourceSnapshotCard";

export default function ListingEditorPage() {
  return (
    <SuperAdminOnly>
      <Editor />
    </SuperAdminOnly>
  );
}

type Tab = "terms" | "documents" | "subscriptions" | "participations" | "events";

function Editor() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const { data: listing, isLoading } = useCpListing(id || null);
  const [tab, setTab] = useState<Tab>("terms");
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const confirm = useConfirmAction();
  const act = useCpListingAction();

  if (isLoading || !listing) return <Card><Loading>{isLoading ? "Loading listing…" : "Listing not found."}</Loading></Card>;

  const run = async (path: string, body?: unknown, okText?: string) => {
    setMsg(null);
    try {
      await act.mutateAsync({ listingId: listing.id, path, body });
      if (okText) setMsg({ tone: "ok", text: okText });
    } catch (e) {
      setMsg({ tone: "bad", text: errorMessage(e) });
    }
  };

  const publish = async () => {
    if (listing.publish_blockers.length) {
      setMsg({ tone: "bad", text: `Before publishing: ${listing.publish_blockers.join("; ")}.` });
      return;
    }
    const reason = window.prompt("Reason for the record (who approved, why now):", "Desk approved for the member marketplace");
    if (reason === null) return;
    const ok = await confirm({
      title: `Publish ${listing.ref} to members?`,
      body: (
        <div className="grid g6">
          <p>Approved members past their waiting period will see this listing with exactly these figures:</p>
          <ul>
            <li>{listing.name} · {VERTICAL_LABEL[listing.vertical]} · {listing.program_label} · {LIEN_LABEL[listing.lien_position]} lien</li>
            <li>Note rate {pct(listing.note_rate_pct)} · term {listing.term_months} months · {listing.ltv_kind.toUpperCase()} {pct(listing.ltv_pct, 1)}</li>
            <li>Offered {money(listing.offered_amount)} · minimum {money(listing.minimum_investment)} · {FREQ_LABEL[listing.payment_frequency]} payments</li>
            <li>{listing.documents.filter((d) => d.status === "ready").length} documents ready</li>
          </ul>
          <p>Nothing is shown to the public site. The listing opens now and the Form D clock starts at the first binding subscription.</p>
        </div>
      ),
      confirmLabel: "Publish",
    });
    if (!ok) return;
    await run(`/capital/admin/listings/${listing.id}/publish`, { reason: reason.trim() || "Published", confirmed: true }, "Published. Members past their waiting period can see it now.");
  };

  const setStatus = async (status: string) => {
    const outcome = status === "repaid" ? (window.prompt("Outcome: repaid_in_full or repaid_after_extension", "repaid_in_full") ?? "") : null;
    if (status === "repaid" && !outcome) return;
    const reason = window.prompt(`Move ${listing.ref} to ${label(status)}. Note for the record (optional):`, "") ?? null;
    if (reason === null) return;
    await run(`/capital/admin/listings/${listing.id}/status`, { status, outcome, reason: reason || null }, `Now ${label(status)}.`);
  };

  const withdraw = async () => {
    const reason = window.prompt("Why is this listing withdrawn? (recorded on the listing)", "");
    if (!reason) return;
    const ok = await confirm({ title: `Withdraw ${listing.ref}?`, body: "Members lose access to it immediately. Signed subscriptions must be cancelled or funded first; the server refuses otherwise.", confirmLabel: "Withdraw", tone: "danger" });
    if (!ok) return;
    await run(`/capital/admin/listings/${listing.id}/withdraw`, { reason, confirmed: true }, "Withdrawn.");
  };

  const next: Record<string, string[]> = { open: ["closing", "fully_subscribed", "funded"], closing: ["open", "fully_subscribed", "funded"], fully_subscribed: ["open", "funded"], funded: ["repaid", "workout"], workout: ["repaid", "funded"] };

  return (
    <div className="grid">
      <PageHeader
        title={`${listing.ref} · ${listing.name}`}
        lede={`${VERTICAL_LABEL[listing.vertical]} · ${listing.program_label}${listing.place ? ` · ${listing.place}` : ""} · ${money(listing.committed_amount, true)} of ${money(listing.offered_amount, true)} committed (${listing.pct_committed}%) · ${listing.investor_count} investor${listing.investor_count === 1 ? "" : "s"}${listing.first_sale_at ? ` · first sale ${day(listing.first_sale_at)}` : ""}`}
        actions={
          <div className="row">
            <Status value={listing.status} tones={LISTING_TONE} />
            {listing.status === "draft" ? <Btn variant="pri" onClick={() => void publish()} disabled={act.isPending}>Publish</Btn> : null}
            {(next[listing.status] ?? []).map((s) => (
              <Btn key={s} size="sm" onClick={() => void setStatus(s)} disabled={act.isPending}>{label(s)}</Btn>
            ))}
            {!["funded", "repaid", "workout", "withdrawn"].includes(listing.status) ? <Btn size="sm" className="danger" onClick={() => void withdraw()} disabled={act.isPending}>Withdraw</Btn> : null}
            <Btn size="sm" onClick={() => router.push("/admin/marketplace")}>All listings</Btn>
          </div>
        }
      />
      {msg ? <StatusLine tone={msg.tone}>{msg.text}</StatusLine> : null}
      {listing.status === "draft" && listing.publish_blockers.length ? <StatusLine tone="warn">Before publishing: {listing.publish_blockers.join("; ")}.</StatusLine> : null}
      <Seg as="tabs" ariaLabel="Listing sections" value={tab} onChange={setTab} options={[
        { value: "terms", label: "Terms and narrative" },
        { value: "documents", label: <>Documents <span className="num">{listing.documents.filter((d) => d.status === "ready").length}</span></> },
        { value: "subscriptions", label: <>Subscriptions <span className="num">{listing.subscriptions.length}</span></> },
        { value: "participations", label: <>Participations <span className="num">{listing.participations.length}</span></> },
        { value: "events", label: "Events" },
      ]} />
      {tab === "terms" ? <TermsForm listing={listing} onMessage={setMsg} /> : null}
      {tab === "documents" ? <Documents listing={listing} onMessage={setMsg} /> : null}
      {tab === "subscriptions" ? <Subscriptions listing={listing} onRun={run} busy={act.isPending} /> : null}
      {tab === "participations" ? <Participations listing={listing} onMessage={setMsg} /> : null}
      {tab === "events" ? <Events listing={listing} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Terms
// ---------------------------------------------------------------------------

type Draft = {
  vertical: string; program_label: string; name: string; summary: string; city: string; state: string; collateral_type: string; lien_position: string;
  note_rate_pct: string; term_months: string; ltv_pct: string; ltv_kind: string; loan_amount: string; offered_amount: string; minimum_investment: string;
  payment_frequency: string; personal_guarantee: boolean; guarantee_text: string; borrower_track_record: string; exit_plan: string; valuation_amount: string;
  valuation_source: string; title_status: string; servicer_label: string; maturity_date: string; closes_at: string;
};

function toDraft(l: CpListing): Draft {
  const s = (v: string | number | null | undefined) => (v == null ? "" : String(v));
  return {
    vertical: l.vertical, program_label: l.program_label, name: l.name, summary: s(l.summary), city: s(l.city), state: s(l.state), collateral_type: s(l.collateral_type),
    lien_position: l.lien_position, note_rate_pct: s(l.note_rate_pct), term_months: s(l.term_months), ltv_pct: s(l.ltv_pct), ltv_kind: l.ltv_kind,
    loan_amount: s(l.loan_amount), offered_amount: s(l.offered_amount), minimum_investment: s(l.minimum_investment), payment_frequency: l.payment_frequency,
    personal_guarantee: l.personal_guarantee, guarantee_text: s(l.guarantee_text), borrower_track_record: s(l.borrower_track_record), exit_plan: s(l.exit_plan),
    valuation_amount: s(l.valuation_amount), valuation_source: s(l.valuation_source), title_status: s(l.title_status), servicer_label: s(l.servicer_label),
    maturity_date: s(l.maturity_date), closes_at: l.closes_at ? l.closes_at.slice(0, 16) : "",
  };
}

function TermsForm({ listing, onMessage }: { listing: CpListing; onMessage: (m: { tone: "ok" | "bad"; text: string } | null) => void }) {
  const [d, setD] = useState<Draft>(() => toDraft(listing));
  const dirtyRef = useRef(false);
  useEffect(() => { if (!dirtyRef.current) setD(toDraft(listing)); }, [listing]);
  const patch = useCpPatchListing();
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => { dirtyRef.current = true; setD((p) => ({ ...p, [k]: v })); };
  const readOnly = listing.status === "repaid" || listing.status === "withdrawn";
  const num = (v: string) => (v.trim() === "" ? null : v.trim());

  const save = async () => {
    onMessage(null);
    const body: CpListingPatch = {
      vertical: d.vertical as CpListingPatch["vertical"], program_label: d.program_label, name: d.name, summary: d.summary || null, city: d.city || null,
      state: d.state ? d.state.toUpperCase() : null, collateral_type: d.collateral_type || null, lien_position: d.lien_position as CpListingPatch["lien_position"],
      note_rate_pct: num(d.note_rate_pct), term_months: d.term_months ? Number(d.term_months) : null, ltv_pct: num(d.ltv_pct), ltv_kind: d.ltv_kind as CpListingPatch["ltv_kind"],
      loan_amount: num(d.loan_amount), offered_amount: num(d.offered_amount), minimum_investment: num(d.minimum_investment),
      payment_frequency: d.payment_frequency as CpListingPatch["payment_frequency"], personal_guarantee: d.personal_guarantee, guarantee_text: d.guarantee_text || null,
      borrower_track_record: d.borrower_track_record || null, exit_plan: d.exit_plan || null, valuation_amount: num(d.valuation_amount), valuation_source: d.valuation_source || null,
      title_status: d.title_status || null, servicer_label: d.servicer_label || null, maturity_date: d.maturity_date || null, closes_at: d.closes_at ? new Date(d.closes_at).toISOString() : null,
    };
    try {
      await patch.mutateAsync({ id: listing.id, ...body });
      dirtyRef.current = false;
      onMessage({ tone: "ok", text: "Saved." });
    } catch (e) {
      onMessage({ tone: "bad", text: errorMessage(e, "Save failed.") });
    }
  };

  const F = ({ k, label: l, type = "text", hint }: { k: keyof Draft; label: string; type?: string; hint?: string }) => (
    <Field label={l} hint={hint}>
      <Input type={type} value={String(d[k] ?? "")} onChange={(e) => set(k, e.target.value as never)} disabled={readOnly} className={type === "number" ? "num" : undefined} />
    </Field>
  );

  return (
    <div className="grid">
      <Panel title="Terms" bodyClass="grid cols-auto">
        <Field label="Vertical"><Select value={d.vertical} onChange={(e) => set("vertical", e.target.value)} disabled={readOnly}><option value="real_estate">Real estate</option><option value="auto">Auto</option><option value="business">Business</option></Select></Field>
        <F k="program_label" label="Program label" hint="What members see: Bridge, Fix and flip, Floorplan, Equipment…" />
        <F k="name" label="Listing name" hint="Describes the loan, never the borrower by name." />
        <F k="city" label="City" />
        <F k="state" label="State (2 letters)" />
        <F k="collateral_type" label="Collateral type" hint="Multifamily, Residential 1-4, Vehicle inventory, Equipment, Receivables…" />
        <Field label="Lien position"><Select value={d.lien_position} onChange={(e) => set("lien_position", e.target.value)} disabled={readOnly}><option value="first">1st</option><option value="second">2nd</option></Select></Field>
        <F k="note_rate_pct" label="Note rate, % paid to participants" type="number" />
        <F k="term_months" label="Term, months" type="number" />
        <F k="ltv_pct" label="LTV / LTC / CLTV, %" type="number" />
        <Field label="Ratio kind"><Select value={d.ltv_kind} onChange={(e) => set("ltv_kind", e.target.value)} disabled={readOnly}><option value="ltv">LTV</option><option value="ltc">LTC</option><option value="cltv">CLTV</option></Select></Field>
        <F k="loan_amount" label="Loan amount, $" type="number" />
        <F k="offered_amount" label="Offered to members, $" type="number" hint="The part of the loan members may fund." />
        <F k="minimum_investment" label="Minimum subscription, $" type="number" />
        <Field label="Payment frequency"><Select value={d.payment_frequency} onChange={(e) => set("payment_frequency", e.target.value)} disabled={readOnly}><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="at_maturity">At maturity</option></Select></Field>
        <F k="maturity_date" label="Maturity date" type="date" />
        <F k="closes_at" label="Subscriptions close" type="datetime-local" hint="Drives the members' days-left counter." />
        <label className="pick" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={d.personal_guarantee} onChange={(e) => set("personal_guarantee", e.target.checked)} disabled={readOnly} /><span>Personal guarantee</span></label>
      </Panel>
      <Panel title="Narrative" bodyClass="grid g10">
        <Field label="Summary"><Textarea rows={3} value={d.summary} onChange={(e) => set("summary", e.target.value)} disabled={readOnly} /></Field>
        <div className="grid cols-auto">
          <F k="guarantee_text" label="Guarantee, as shown" hint="Full personal guarantee from principals / Non-recourse with standard carve-outs" />
          <F k="borrower_track_record" label="Borrower track record" hint="Count, not names: 7 completed projects / 12 years in operation" />
        </div>
        <Field label="Exit plan"><Textarea rows={3} value={d.exit_plan} onChange={(e) => set("exit_plan", e.target.value)} disabled={readOnly} /></Field>
      </Panel>
      <Panel title="Collateral and valuation" bodyClass="grid cols-auto">
        <F k="valuation_amount" label="Valuation, $" type="number" />
        <F k="valuation_source" label="Valuation source" hint="Third-party appraisal, Inventory audit, Equipment appraisal…" />
        <F k="title_status" label="Title" hint="Lien search clear…" />
        <F k="servicer_label" label="Servicer, as shown" />
      </Panel>
      <SourceSnapshotCard snapshot={listing.source_snapshot} />
      {!readOnly ? <div className="row"><Btn variant="pri" onClick={() => void save()} disabled={patch.isPending}>{patch.isPending ? "Saving…" : "Save"}</Btn><span className="sub">Saving a published listing changes what members see at once.</span></div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

function Documents({ listing, onMessage }: { listing: CpListing; onMessage: (m: { tone: "ok" | "bad"; text: string } | null) => void }) {
  const upload = useCpUploadDocument();
  const supersede = useCpSupersedeDocument();
  const confirm = useConfirmAction();
  const [kind, setKind] = useState<CpDocumentKind>("ppm");
  const fileRef = useRef<HTMLInputElement>(null);

  const send = async (file: File) => {
    onMessage(null);
    try {
      await upload.mutateAsync({ listingId: listing.id, kind, file });
      onMessage({ tone: "ok", text: `${file.name} uploaded as ${DOC_KINDS.find((k) => k.value === kind)?.label}.` });
    } catch (e) {
      onMessage({ tone: "bad", text: errorMessage(e, "Upload failed.") });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const remove = async (docId: string, name: string) => {
    if (!(await confirm({ title: `Supersede ${name}?`, body: "Members stop seeing it. The file itself is kept for the record.", confirmLabel: "Supersede", tone: "danger", reversible: false }))) return;
    try { await supersede.mutateAsync({ listingId: listing.id, documentId: docId }); } catch (e) { onMessage({ tone: "bad", text: errorMessage(e) }); }
  };

  return (
    <div className="grid">
      <Panel title="Upload" bodyClass="row">
        <Select value={kind} onChange={(e) => setKind(e.target.value as CpDocumentKind)}>{DOC_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</Select>
        <input ref={fileRef} type="file" accept="application/pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) void send(f); }} disabled={upload.isPending} />
        <span className="sub">{upload.isPending ? "Uploading…" : "A new file of the same kind supersedes the previous one. The private placement memorandum is required before publishing."}</span>
      </Panel>
      {listing.documents.length === 0 ? (
        <Card><span className="sub">No documents yet.</span></Card>
      ) : (
        <Panel noPad>
          <Table caption="Offering documents" cols={[{ label: "Kind" }, { label: "Name" }, { label: "Version", align: "r" }, { label: "Size", align: "r" }, { label: "Status" }, { label: "" }]}>
            {listing.documents.map((doc) => (
              <Tr key={doc.id}>
                <Td>{doc.kind_label}</Td>
                <Td>{doc.name}</Td>
                <Td className="num" align="r">v{doc.version}</Td>
                <Td className="num" align="r">{doc.size_bytes ? `${Math.round(doc.size_bytes / 1024)} KB` : "—"}</Td>
                <Td><CellChip tone={doc.status === "ready" ? "ok" : doc.status === "pending" ? "warn" : "mut"}>{doc.status}</CellChip></Td>
                <Td>{doc.status !== "superseded" ? <Btn size="sm" className="danger" onClick={() => void remove(doc.id, doc.name)} disabled={supersede.isPending}>Supersede</Btn> : null}</Td>
              </Tr>
            ))}
          </Table>
        </Panel>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

function Subscriptions({ listing, onRun, busy }: { listing: CpListing; onRun: (path: string, body?: unknown, okText?: string) => Promise<void>; busy: boolean }) {
  const confirm = useConfirmAction();
  const action = async (sub: CpSubscription, what: "send-documents" | "mark-signed" | "mark-funded" | "cancel" | "decline") => {
    const who = sub.member_name ?? sub.member_email ?? "the member";
    const body: Record<string, unknown> = {};
    if (what === "mark-signed") {
      if (!(await confirm({ title: `Mark ${who}'s subscription signed?`, body: `This is the binding moment for ${money(sub.amount)} in ${listing.ref}. If it is the first binding subscription, the Form D clock starts today and a state notice row is created for ${sub.member_state ?? "the member's state"}.`, confirmLabel: "Mark signed" }))) return;
    }
    if (what === "mark-funded") {
      const amt = window.prompt("Funded amount (blank = the subscription amount):", String(sub.amount));
      if (amt === null) return;
      if (amt.trim()) body.funded_amount = amt.trim();
    }
    if (what === "cancel" || what === "decline") {
      const reason = window.prompt(`Reason to ${what} (recorded):`, "");
      if (reason === null) return;
      body.reason = reason || null;
    }
    const labels = { "send-documents": "Subscription documents sent.", "mark-signed": "Marked signed.", "mark-funded": "Marked funded; the participation is in the member's portfolio.", cancel: "Cancelled.", decline: "Declined." };
    await onRun(`/capital/admin/subscriptions/${sub.id}/${what}`, body, labels[what]);
  };
  if (listing.subscriptions.length === 0) return <Card><span className="sub">No subscriptions yet.</span></Card>;
  return (
    <Panel noPad>
      <Table caption="Subscriptions" cols={[{ label: "Member" }, { label: "Entity" }, { label: "Amount", align: "r" }, { label: "Status" }, { label: "Requested" }, { label: "Documents" }, { label: "Signed" }, { label: "Funded" }, { label: "" }]}>
        {listing.subscriptions.map((s) => (
          <Tr key={s.id}>
            <Td><div className="grid g4"><span>{s.member_name ?? "—"}</span><span className="sub">{s.member_email}{s.member_state ? ` · ${s.member_state}` : ""}</span></div></Td>
            <Td>{s.entity_name ?? "—"}</Td>
            <Td className="num" align="r">{money(s.amount)}{s.funded_amount && s.funded_amount !== s.amount ? <span className="sub"> funded {money(s.funded_amount)}</span> : null}</Td>
            <Td><Status value={s.status} tones={SUB_TONE} /></Td>
            <Td className="num">{when(s.requested_at)}</Td>
            <Td className="num">{when(s.documents_sent_at)}</Td>
            <Td className="num">{when(s.signed_at)}</Td>
            <Td className="num">{when(s.funded_at)}</Td>
            <Td>
              <div className="row">
                {s.status === "requested" ? <Btn size="sm" variant="pri" disabled={busy} onClick={() => void action(s, "send-documents")}>Send documents</Btn> : null}
                {s.status === "requested" || s.status === "documents_sent" ? <Btn size="sm" disabled={busy} onClick={() => void action(s, "mark-signed")}>Mark signed</Btn> : null}
                {s.status === "signed" ? <Btn size="sm" variant="pri" disabled={busy} onClick={() => void action(s, "mark-funded")}>Mark funded</Btn> : null}
                {s.status === "requested" || s.status === "documents_sent" ? <Btn size="sm" className="danger" disabled={busy} onClick={() => void action(s, "decline")}>Decline</Btn> : null}
                {s.status === "signed" ? <Btn size="sm" className="danger" disabled={busy} onClick={() => void action(s, "cancel")}>Cancel</Btn> : null}
              </div>
            </Td>
          </Tr>
        ))}
      </Table>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Participations (servicer status)
// ---------------------------------------------------------------------------

function Participations({ listing, onMessage }: { listing: CpListing; onMessage: (m: { tone: "ok" | "bad"; text: string } | null) => void }) {
  const patch = useCpPatchParticipation();
  const [edit, setEdit] = useState<CpParticipation | null>(null);
  const [form, setForm] = useState({ principal_outstanding: "", interest_received_ytd: "", interest_received_total: "", next_payment_on: "", servicer_status: "current" as CpServicerStatus, status_as_of: "" });
  const open = (p: CpParticipation) => {
    setEdit(p);
    setForm({ principal_outstanding: p.principal_outstanding, interest_received_ytd: p.interest_received_ytd, interest_received_total: p.interest_received_total, next_payment_on: p.next_payment_on ?? "", servicer_status: p.servicer_status, status_as_of: p.status_as_of ?? new Date().toISOString().slice(0, 10) });
  };
  const save = async () => {
    if (!edit) return;
    onMessage(null);
    try {
      await patch.mutateAsync({ id: edit.id, listingId: listing.id, principal_outstanding: form.principal_outstanding, interest_received_ytd: form.interest_received_ytd, interest_received_total: form.interest_received_total, next_payment_on: form.next_payment_on || null, servicer_status: form.servicer_status, status_as_of: form.status_as_of || null });
      setEdit(null);
      onMessage({ tone: "ok", text: "Servicer status updated." });
    } catch (e) {
      onMessage({ tone: "bad", text: errorMessage(e) });
    }
  };
  if (listing.participations.length === 0) return <Card><span className="sub">No funded participations yet. Mark a signed subscription funded to create one.</span></Card>;
  return (
    <div className="grid">
      <Panel noPad>
        <Table caption="Participations" cols={[{ label: "Member" }, { label: "Entity" }, { label: "Invested", align: "r" }, { label: "Outstanding", align: "r" }, { label: "Interest YTD", align: "r" }, { label: "Next payment" }, { label: "Servicer status" }, { label: "As of" }, { label: "" }]}>
          {listing.participations.map((p) => (
            <Tr key={p.id}>
              <Td><div className="grid g4"><span>{p.member_name ?? "—"}</span><span className="sub">{p.member_email}</span></div></Td>
              <Td>{p.entity_name ?? "—"}</Td>
              <Td className="num" align="r">{money(p.invested_amount)}</Td>
              <Td className="num" align="r">{money(p.principal_outstanding)}</Td>
              <Td className="num" align="r">{money(p.interest_received_ytd)}</Td>
              <Td className="num">{day(p.next_payment_on)}</Td>
              <Td><Status value={p.servicer_status} tones={SERVICER_TONE} /></Td>
              <Td className="num">{day(p.status_as_of)}</Td>
              <Td><Btn size="sm" onClick={() => open(p)}>Update</Btn></Td>
            </Tr>
          ))}
        </Table>
      </Panel>
      {edit ? (
        <Panel title={`Servicer report: ${edit.member_name ?? edit.member_email}`} bodyClass="grid g10">
          <div className="grid cols-auto">
            <Field label="Principal outstanding, $"><Input type="number" className="num" value={form.principal_outstanding} onChange={(e) => setForm((f) => ({ ...f, principal_outstanding: e.target.value }))} /></Field>
            <Field label="Interest received YTD, $"><Input type="number" className="num" value={form.interest_received_ytd} onChange={(e) => setForm((f) => ({ ...f, interest_received_ytd: e.target.value }))} /></Field>
            <Field label="Interest received total, $"><Input type="number" className="num" value={form.interest_received_total} onChange={(e) => setForm((f) => ({ ...f, interest_received_total: e.target.value }))} /></Field>
            <Field label="Next payment"><Input type="date" value={form.next_payment_on} onChange={(e) => setForm((f) => ({ ...f, next_payment_on: e.target.value }))} /></Field>
            <Field label="Servicer status"><Select value={form.servicer_status} onChange={(e) => setForm((f) => ({ ...f, servicer_status: e.target.value as CpServicerStatus }))}><option value="current">Current</option><option value="late">Late</option><option value="paid_in_full">Paid in full</option><option value="in_workout">In workout</option></Select></Field>
            <Field label="As of"><Input type="date" value={form.status_as_of} onChange={(e) => setForm((f) => ({ ...f, status_as_of: e.target.value }))} /></Field>
          </div>
          <div className="row"><Btn variant="pri" onClick={() => void save()} disabled={patch.isPending}>Save</Btn><Btn onClick={() => setEdit(null)}>Cancel</Btn></div>
        </Panel>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function Events({ listing }: { listing: CpListing }) {
  const rows = useMemo(() => listing.events, [listing.events]);
  if (rows.length === 0) return <Card><span className="sub">No events yet.</span></Card>;
  return (
    <Panel noPad>
      <Table caption="Events" cols={[{ label: "When" }, { label: "Event" }, { label: "Detail" }]}>
        {rows.map((e) => (
          <Tr key={e.id}>
            <Td className="num">{when(e.occurred_at)}</Td>
            <Td>{e.kind}</Td>
            <Td><span className="sub" style={{ wordBreak: "break-word" }}>{Object.entries(e.detail).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ") || "—"}</span></Td>
          </Tr>
        ))}
      </Table>
    </Panel>
  );
}

export type { ReactNode };
