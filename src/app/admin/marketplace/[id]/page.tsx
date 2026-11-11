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
import dynamic from "next/dynamic";
import { Btn, Card, CellChip, Field, Input, Loading, PageHeader, Panel, Seg, Select, StatusLine, Table, Td, Textarea, Tr } from "@/components/ds";
import { useConfirmAction } from "@/components/design-system/ConfirmationProvider";
import {
  useCpListing, useCpListingAction, useCpPatchListing, useCpPatchParticipation, useCpSupersedeDocument, useCpUploadDocument,
  type CpDocumentKind, type CpListing, type CpListingPatch, type CpParticipation, type CpServicerStatus, type CpSubscription,
} from "@/hooks/useCapitalPartners";
import { DOC_KINDS, FREQ_LABEL, LIEN_LABEL, LISTING_TONE, SERVICER_TONE, SUB_TONE, Status, SuperAdminOnly, VERTICAL_LABEL, day, errorMessage, label, money, pct, when } from "@/components/marketplace/shared";
import { SourceSnapshotCard } from "@/components/marketplace/SourceSnapshotCard";
import { MarketplacePublishStrip } from "@/components/marketplace/MarketplacePublishStrip";
import { MarketplaceOfferLink } from "@/components/marketplace/MarketplaceOfferLink";
import { DealBudgetSection } from "@/components/file/DealBudgetSection";
import { useDealBudget } from "@/hooks/useDealBudget";
import { useAuthedApi } from "@/hooks/useApi";
import { MarketplaceIssues } from "@/components/marketplace/MarketplaceIssues";
import guidanceStyles from "@/components/marketplace/MarketplaceIssues.module.css";
import { dedupeMarketplaceIssues, marketplaceApiIssues, marketplaceFieldId, marketplaceOwnerHref, marketplacePublishIssues, unknownIssue, type MarketplaceField, type MarketplaceIssue } from "@/lib/marketplaceIssues";
import { focusMarketplaceControl } from "@/lib/marketplaceGuidanceFocus";
import { LoanDateFields } from "@/components/application/LoanDateFields";
import { LOAN_DATE_NOTE, resolveLoanDates } from "@/lib/loanDates";
import { MarketplaceFileInventory } from "@/components/marketplace/MarketplaceFileInventory";
import { useMarketplaceDocumentLink } from "@/hooks/useMarketplaceDocumentLink";
import editorStyles from "@/components/marketplace/MarketplaceEditor.module.css";
const MarketplacePpmWorkspace = dynamic(() => import("@/components/marketplace/MarketplacePpmWorkspace").then(module => module.MarketplacePpmWorkspace), { ssr: false, loading: () => <p className="sub" role="status">Loading PPM workspace…</p> });

export default function ListingEditorPage() {
  const params = useParams<{ id: string }>();
  return (
    <SuperAdminOnly>
      <Editor key={params?.id ?? ""} />
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
  const [documentsVisited, setDocumentsVisited] = useState(false);
  const [ppmReadinessPending, setPpmReadinessPending] = useState(false);
  const [ppmOwnsIssues, setPpmOwnsIssues] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const confirm = useConfirmAction();
  const act = useCpListingAction();
  const api = useAuthedApi();
  const [actionIssues, setActionIssues] = useState<MarketplaceIssue[]>([]);
  const issueOrigin = useRef<"publish" | "terms" | "documents" | "snapshot" | null>(null);
  const [navigation, setNavigation] = useState<{ issue: MarketplaceIssue; sequence: number } | null>(null);
  const [openingOwner, setOpeningOwner] = useState(false);
  const ownerRequest = useRef<{ controller: AbortController; popup: Window } | null>(null);
  const appliedQuery = useRef<string | null>(null);
  const context = { linked: Boolean(listing?.profile_id) };
  const issues = dedupeMarketplaceIssues([...actionIssues, ...(listing?.status === "draft" ? marketplacePublishIssues(listing.publish_blockers, listing.publish_issues, context) : [])]);
  const requestNavigation = (issue: MarketplaceIssue) => {
    if (["ppm", "upload", "document-type"].includes(issue.target?.kind ?? "")) setTab("documents");
    else if (["field", "budget"].includes(issue.target?.kind ?? "")) setTab("terms");
    setNavigation(current => ({ issue, sequence: (current?.sequence ?? 0) + 1 }));
  };
  const showFailure = (error: unknown, action: "publish" | "terms" | "documents" | "snapshot") => {
    const next = marketplaceApiIssues(error, { ...context, action });
    issueOrigin.current = action;
    setMsg(null); setActionIssues(next);
    requestNavigation(next.find(issue => ["ppm", "field", "upload", "document-type", "budget"].includes(issue.target?.kind ?? "")) ?? { ...next[0], target: undefined });
  };
  const clearResolvedIssues = (action: "publish" | "terms" | "documents" | "snapshot") => setActionIssues(current => {
    if (issueOrigin.current === action) return [];
    return current.filter(issue => action === "documents" ? !["upload", "document-type"].includes(issue.target?.kind ?? "") : action === "snapshot" ? issue.target?.kind !== "snapshot" : true);
  });
  useEffect(() => () => { ownerRequest.current?.controller.abort(); ownerRequest.current?.popup.close(); ownerRequest.current = null; }, []);
  useEffect(() => { if (tab === "documents") setDocumentsVisited(true); }, [tab]);
  useEffect(() => {
    if (!navigation) return;
    const target = navigation.issue.target;
    let budgetOpened = false;
    return focusMarketplaceControl(() => {
      if (target?.kind === "field") return document.getElementById(marketplaceFieldId(target.field));
      if (target?.kind === "ppm") return document.getElementById("marketplace-ppm-heading");
      if (target?.kind === "upload") return document.getElementById("marketplace-document-upload");
      if (target?.kind === "document-type") return document.getElementById("marketplace-document-kind");
      if (target?.kind === "budget") {
        const control = document.querySelector<HTMLElement>('[aria-label="Deal budget editor"] [aria-label="Funding format"]:not(:disabled)');
        if (control) return control;
        if (!budgetOpened) {
          const opener = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-marketplace-budget] button")).find(button => button.textContent?.trim() === "Edit deal budget" && !button.disabled);
          if (opener) { budgetOpened = true; opener.click(); }
        }
        return null;
      }
      return document.getElementById("marketplace-issues");
    }, guidanceStyles.highlight);
  }, [navigation]);
  useEffect(() => {
    if (!listing) return;
    const requested = new URLSearchParams(window.location.search).get("fix");
    if (!requested || appliedQuery.current === `${listing.id}:${requested}`) return;
    appliedQuery.current = `${listing.id}:${requested}`;
    const issue = issues.find(item => item.key === requested);
    if (!issue?.target) return;
    // Deep links reveal local controls. Owner navigation remains a deliberate click.
    requestNavigation(["ppm", "field", "upload", "document-type", "budget"].includes(issue.target.kind) ? issue : { ...issue, target: undefined });
  });

  if (isLoading || !listing) return <Card><Loading>{isLoading ? "Loading listing…" : "Listing not found."}</Loading></Card>;

  const run = async (path: string, body?: unknown, okText?: string) => {
    setMsg(null);
    try {
      await act.mutateAsync({ listingId: listing.id, path, body });
      clearResolvedIssues(path.endsWith("/publish") ? "publish" : "snapshot");
      if (okText) setMsg({ tone: "ok", text: okText });
    } catch (e) {
      showFailure(e, path.endsWith("/publish") ? "publish" : "snapshot");
    }
  };

  const publish = async () => {
    if (ppmReadinessPending || act.isPending) return;
    if (listing.publish_blockers.length) {
      setMsg(null); setActionIssues([]);
      const first = marketplacePublishIssues(listing.publish_blockers, listing.publish_issues, context);
      requestNavigation(first.find(issue => issue.target?.kind === "ppm") ?? first.find(issue => ["field", "budget"].includes(issue.target?.kind ?? "")) ?? { ...first[0], target: undefined });
      return;
    }
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
    await run(`/capital/admin/listings/${listing.id}/publish`, { reason: "Published after reviewing the current marketplace offer", confirmed: true }, "Published. Members past their waiting period can see it now.");
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
  const fixIssue = async (issue: MarketplaceIssue) => {
    if (issue.target?.kind === "snapshot") { await run(`/capital/admin/listings/${listing.id}/refresh-snapshot`, {}, "Saved file figures refreshed. Review the listing before publishing."); return; }
    if (issue.target?.kind !== "file") { requestNavigation(issue); return; }
    if (!listing.profile_id || openingOwner || ownerRequest.current) { if (!listing.profile_id) setActionIssues([unknownIssue("This listing has no linked application profile. Review its source loan or contact the file team.")]); return; }
    const popup = window.open("about:blank", "_blank");
    if (!popup) { setActionIssues(current => dedupeMarketplaceIssues([unknownIssue("The file tab was blocked by your browser. Allow a new tab and click the Fix action again; your listing edits are retained."), issue, ...current])); return; }
    popup.opener = null;
    popup.document.title = "Opening linked financial editor";
    popup.document.body.textContent = "Reading the linked file…";
    const controller = new AbortController(); ownerRequest.current = { controller, popup }; setOpeningOwner(true);
    try {
      const profile = await api<{ intake_id: string | null }>(`/application-profiles/${encodeURIComponent(listing.profile_id)}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (popup.closed) throw new Error("The file tab was closed. Click the Fix action again to reopen it.");
      if (!profile.intake_id) throw new Error("This source has no intake file. Review its original loan workspace or contact the file team; your listing edits remain here.");
      popup.location.replace(marketplaceOwnerHref(profile.intake_id, issue.target.action));
      ownerRequest.current = null;
    } catch (error) { popup.close(); if (!controller.signal.aborted) setActionIssues(current => dedupeMarketplaceIssues([unknownIssue(errorMessage(error)), issue, ...current])); }
    finally { if (ownerRequest.current?.controller === controller) ownerRequest.current = null; if (!controller.signal.aborted) setOpeningOwner(false); }
  };

  return (
    <div className={`grid ${editorStyles.root}`}>
      <PageHeader
        title={`${listing.ref} · ${listing.name}`}
        lede={`${VERTICAL_LABEL[listing.vertical]} · ${listing.program_label}${listing.place ? ` · ${listing.place}` : ""} · ${money(listing.committed_amount, true)} of ${money(listing.offered_amount, true)} committed (${listing.pct_committed}%) · ${listing.investor_count} investor${listing.investor_count === 1 ? "" : "s"}${listing.first_sale_at ? ` · first sale ${day(listing.first_sale_at)}` : ""}`}
        actions={
          <div className="row">
            <Status value={listing.status} tones={LISTING_TONE} />
            {listing.status === "draft" && !(tab === "documents" && ppmOwnsIssues) ? <Btn variant="pri" onClick={() => void publish()} disabled={act.isPending || ppmReadinessPending}>Publish offer</Btn> : null}
            {(next[listing.status] ?? []).map((s) => (
              <Btn key={s} size="sm" onClick={() => void setStatus(s)} disabled={act.isPending}>{label(s)}</Btn>
            ))}
            {!["funded", "repaid", "workout", "withdrawn"].includes(listing.status) ? <Btn size="sm" className="danger" onClick={() => void withdraw()} disabled={act.isPending}>Withdraw</Btn> : null}
            <Btn size="sm" onClick={() => router.push("/admin/marketplace")}>All listings</Btn>
          </div>
        }
      />
      <MarketplaceOfferLink listing={listing} />
      <Panel title="Listing cockpit" sub="Saved financing, document readiness and controlled source-document access."><div className="grid cols-auto"><div><span className="sub">Capital to raise</span><strong style={{ display: "block" }}>{money(listing.offered_amount)}</strong></div><div><span className="sub">Offering PDFs ready</span><strong style={{ display: "block" }}>{listing.documents.filter(document => document.status === "ready").length}</strong></div><div><span className="sub">Publication readiness</span><strong style={{ display: "block" }}>{listing.publish_blockers.length ? `${listing.publish_blockers.length} items need review` : "No current publication blockers"}</strong></div><div><span className="sub">File snapshot</span><strong style={{ display: "block" }}>{listing.sync?.up_to_date ? "Up to date" : listing.profile_id ? "Review / refresh saved file" : "Standalone listing"}</strong></div></div><div className="row mt"><Btn size="sm" onClick={() => setTab("documents")}>Review offering documents</Btn></div></Panel>
      {listing.profile_id ? <MarketplaceFileInventory key={listing.id} listingId={listing.id} /> : null}
      {msg ? <StatusLine tone={msg.tone}>{msg.text}</StatusLine> : null}
      <MarketplaceIssues id="marketplace-issues" issues={issues.filter(issue => !(tab === "documents" && ppmOwnsIssues && issue.target?.kind === "ppm"))} onFix={issue => void fixIssue(issue)} busy={openingOwner || act.isPending} />
      <Seg as="tabs" className={editorStyles.tabs} ariaLabel="Listing sections" value={tab} onChange={setTab} options={[
        { value: "terms", label: "Terms and narrative" },
        { value: "documents", label: <>Documents <span className="num">{listing.documents.filter((d) => d.status === "ready").length}</span></> },
        { value: "subscriptions", label: <>Subscriptions <span className="num">{listing.subscriptions.length}</span></> },
        { value: "participations", label: <>Participations <span className="num">{listing.participations.length}</span></> },
        { value: "events", label: "Events" },
      ]} />
      <div hidden={tab !== "terms"}><TermsForm key={listing.id} listing={listing} onMessage={message => { setMsg(message); if (message?.tone === "ok") clearResolvedIssues("terms"); }} onError={error => showFailure(error, "terms")} issues={issues} onFix={issue => void fixIssue(issue)} onSnapshotError={error => showFailure(error, "snapshot")} onSnapshotSuccess={() => clearResolvedIssues("snapshot")} /></div>
      {documentsVisited || tab === "documents" ? <div hidden={tab !== "documents"}><Documents listing={listing} active={tab === "documents"} onMessage={message => { setMsg(message); if (message?.tone === "ok") clearResolvedIssues("documents"); }} onError={error => showFailure(error, "documents")} guidance={navigation} onFix={issue => void fixIssue(issue)} onSnapshotError={error => showFailure(error, "snapshot")} onSnapshotSuccess={() => clearResolvedIssues("snapshot")} onPpmApproved={() => setActionIssues(current => current.filter(issue => issue.target?.kind !== "ppm"))} onPublish={() => void publish()} publishBusy={act.isPending} onPpmReadinessPending={setPpmReadinessPending} onOwnsPpmIssues={setPpmOwnsIssues} /></div> : null}
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
  valuation_source: string; title_status: string; servicer_label: string; expected_funding_date: string; maturity_date: string; maturity_date_mode: string; closes_at: string;
};

function toDraft(l: CpListing): Draft {
  const s = (v: string | number | null | undefined) => (v == null ? "" : String(v));
  return {
    vertical: l.vertical, program_label: l.program_label, name: l.name, summary: s(l.summary), city: s(l.city), state: s(l.state), collateral_type: s(l.collateral_type),
    lien_position: l.lien_position, note_rate_pct: s(l.note_rate_pct), term_months: s(l.term_months), ltv_pct: s(l.ltv_pct), ltv_kind: l.ltv_kind,
    loan_amount: s(l.loan_amount), offered_amount: s(l.offered_amount), minimum_investment: s(l.minimum_investment), payment_frequency: l.payment_frequency,
    personal_guarantee: l.personal_guarantee, guarantee_text: s(l.guarantee_text), borrower_track_record: s(l.borrower_track_record), exit_plan: s(l.exit_plan),
    valuation_amount: s(l.valuation_amount), valuation_source: s(l.valuation_source), title_status: s(l.title_status), servicer_label: s(l.servicer_label),
    expected_funding_date: s(l.expected_funding_date), maturity_date: s(l.maturity_date), maturity_date_mode: l.maturity_date_mode ?? (l.maturity_date ? "manual" : "automatic"), closes_at: l.closes_at ? l.closes_at.slice(0, 16) : "",
  };
}

type TextDraftKey = Exclude<keyof Draft, "personal_guarantee">;

// Keep the component type stable as its controlled value changes so native
// focus, selection and partially entered numeric strings stay in the input.
function ListingField({ k, label, type = "text", hint, draft, onChange, readOnly, linkedProfile, issues }: {
  k: TextDraftKey; label: string; type?: string; hint?: string;
  draft: Draft; onChange: (key: TextDraftKey, value: string) => void; readOnly: boolean; linkedProfile: boolean; issues: Partial<Record<MarketplaceField, MarketplaceIssue>>;
}) {
  const issue = issues[k];
  const errorId = `${marketplaceFieldId(k)}-error`;
  return <Field label={label} hint={hint} error={issue ? <span id={errorId}>{issue.message} {issue.instruction}</span> : undefined}>
    <Input id={marketplaceFieldId(k)} aria-label={label} aria-invalid={issue ? true : undefined} aria-describedby={issue ? errorId : undefined} type={type} value={String(draft[k] ?? "")} onChange={event => onChange(k, event.target.value)} disabled={readOnly || linkedProfile && ["loan_amount", "note_rate_pct", "term_months", "offered_amount", "minimum_investment"].includes(k)} className={type === "number" ? "num" : undefined} />
  </Field>;
}

function TermsForm({ listing, onMessage, onError, issues, onFix, onSnapshotError, onSnapshotSuccess }: { listing: CpListing; onMessage: (m: { tone: "ok" | "bad"; text: string } | null) => void; onError: (error: unknown) => void; issues: MarketplaceIssue[]; onFix: (issue: MarketplaceIssue) => void; onSnapshotError: (error: unknown) => void; onSnapshotSuccess: () => void }) {
  const budget = useDealBudget(listing.profile_id ?? "");
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
      title_status: d.title_status || null, servicer_label: d.servicer_label || null, ...(!listing.profile_id ? (() => { const dates = resolveLoanDates({ expected_funding_date: d.expected_funding_date, maturity_date: d.maturity_date, maturity_date_mode: d.maturity_date_mode as "automatic" | "manual" }, d.term_months ? Number(d.term_months) : null); return { ...dates, expected_funding_date: dates.expected_funding_date || null, maturity_date: dates.maturity_date || null }; })() : {}), closes_at: d.closes_at ? new Date(d.closes_at).toISOString() : null,
    };
    try {
      if (listing.profile_id) body.expected_deal_budget_revision = await budget.verifyRevision();
      await patch.mutateAsync({ id: listing.id, ...body });
      dirtyRef.current = false;
      onMessage({ tone: "ok", text: "Saved." });
    } catch (e) {
      onError(e);
    }
  };

  const fieldIssues: Partial<Record<MarketplaceField, MarketplaceIssue>> = {};
  for (const issue of issues) if (issue.target?.kind === "field") fieldIssues[issue.target.field] = issue;
  const binding = (field: MarketplaceField) => ({ id: marketplaceFieldId(field), "aria-invalid": fieldIssues[field] ? true as const : undefined, "aria-describedby": fieldIssues[field] ? `${marketplaceFieldId(field)}-error` : undefined });
  const inlineError = (field: MarketplaceField) => fieldIssues[field] ? <span id={`${marketplaceFieldId(field)}-error`}>{fieldIssues[field]!.message} {fieldIssues[field]!.instruction}</span> : undefined;
  const fieldProps = { draft: d, onChange: set, readOnly, linkedProfile: Boolean(listing.profile_id), issues: fieldIssues };

  return (
    <div className="grid">
      {listing.profile_id ? <div data-marketplace-budget><DealBudgetSection profileId={listing.profile_id} disabled={readOnly} compact={false} existingFunding={{ capital: listing.offered_amount == null ? null : Number(listing.offered_amount), minimum: listing.minimum_investment == null ? null : Number(listing.minimum_investment) }} /></div> : null}
      <Panel title="Terms" bodyClass="grid cols-auto">
        <Field label="Vertical" error={inlineError("vertical")}><Select {...binding("vertical")} aria-label="Vertical" value={d.vertical} onChange={(e) => set("vertical", e.target.value)} disabled={readOnly}><option value="real_estate">Real estate</option><option value="auto">Auto</option><option value="business">Business</option></Select></Field>
        <ListingField {...fieldProps} k="program_label" label="Program label" hint="What members see: Bridge, Fix and flip, Floorplan, Equipment…" />
        <ListingField {...fieldProps} k="name" label="Deal title" hint="Describes the financing proposal and location." />
        <ListingField {...fieldProps} k="city" label="City" />
        <ListingField {...fieldProps} k="state" label="State (2 letters)" />
        <ListingField {...fieldProps} k="collateral_type" label="Collateral type" hint="Multifamily, Residential 1-4, Vehicle inventory, Equipment, Receivables…" />
        <Field label="Lien position" error={inlineError("lien_position")}><Select {...binding("lien_position")} aria-label="Lien position" value={d.lien_position} onChange={(e) => set("lien_position", e.target.value)} disabled={readOnly}><option value="first">1st</option><option value="second">2nd</option></Select></Field>
        <ListingField {...fieldProps} k="note_rate_pct" label="Note rate, % paid to participants" type="number" />
        <ListingField {...fieldProps} k="term_months" label="Term, months" type="number" />
        <ListingField {...fieldProps} k="ltv_pct" label="LTV / LTC / CLTV, %" type="number" />
        <Field label="Ratio kind" error={inlineError("ltv_kind")}><Select {...binding("ltv_kind")} aria-label="Ratio kind" value={d.ltv_kind} onChange={(e) => set("ltv_kind", e.target.value)} disabled={readOnly}><option value="ltv">LTV</option><option value="ltc">LTC</option><option value="cltv">CLTV</option></Select></Field>
        <ListingField {...fieldProps} k="loan_amount" label="Loan amount, $" type="number" />
        <ListingField {...fieldProps} k="offered_amount" label="Capital to raise from investors, $" type="number" hint={listing.profile_id ? "Set once in the shared deal budget above; defaults to full loan funding." : "Investor capital funding this loan."} />
        <ListingField {...fieldProps} k="minimum_investment" label="Smallest investor contribution, $" type="number" hint="One investor contributes the full amount unless multiple investors are configured." />
        <Field label="Payment frequency" error={inlineError("payment_frequency")}><Select {...binding("payment_frequency")} aria-label="Payment frequency" value={d.payment_frequency} onChange={(e) => set("payment_frequency", e.target.value)} disabled={readOnly}><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="at_maturity">At maturity</option></Select></Field>
        <ListingField {...fieldProps} k="closes_at" label="Subscriptions close" type="datetime-local" hint="Drives the members' days-left counter." />
        <label className="pick" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><input {...binding("personal_guarantee")} type="checkbox" checked={d.personal_guarantee} onChange={(e) => set("personal_guarantee", e.target.checked)} disabled={readOnly} /><span>Personal guarantee</span></label>{inlineError("personal_guarantee")}
      </Panel>
      <Panel title="Estimated loan dates">{listing.profile_id ? <div className="grid g10"><div className="grid cols-auto"><div><span className="sub">Estimated funding date</span><strong style={{ display: "block" }}>{day(listing.expected_funding_date)}</strong></div><div><span className="sub">Estimated maturity date</span><strong style={{ display: "block" }}>{day(listing.maturity_date)}</strong></div><div><span className="sub">Maturity calculation</span><strong style={{ display: "block" }}>{listing.maturity_date_mode === "manual" ? "Manual date override" : "Automatic from funding + term"}</strong></div></div><p className="sub">{listing.date_note || LOAN_DATE_NOTE} Dates follow the linked file’s shared coverage loan.</p><div><Btn size="sm" onClick={() => onFix({ key: "owner:coverage", message: "Review estimated loan dates on the linked file.", instruction: "Save the shared coverage loan, then refresh this listing.", target: { kind: "file", action: "coverage" } })}>Edit loan dates on linked file</Btn></div></div> : <LoanDateFields value={{ expected_funding_date: d.expected_funding_date, maturity_date: d.maturity_date, maturity_date_mode: d.maturity_date_mode as "automatic" | "manual" }} ids={{ expected_funding_date: marketplaceFieldId("expected_funding_date"), maturity_date: marketplaceFieldId("maturity_date"), maturity_date_mode: marketplaceFieldId("maturity_date_mode") }} errors={{ expected_funding_date: fieldIssues.expected_funding_date?.message, maturity_date: fieldIssues.maturity_date?.message, maturity_date_mode: fieldIssues.maturity_date_mode?.message }} termMonths={d.term_months ? Number(d.term_months) : null} disabled={readOnly} onChange={dates => { dirtyRef.current = true; setD(current => ({ ...current, ...dates })); }} />}</Panel>
      {listing.products?.length ? (
        <Panel title="Products offered" sub="Edited from the file's Financials tab (Send the file to capital partners). The primary product supplies the headline rate, term and amount above.">
          <Table caption="Products" cols={[{ label: "Product" }, { label: "Amount", align: "r" }, { label: "Rate", align: "r" }, { label: "Term", align: "r" }, { label: "Payment / mo", align: "r" }, { label: "Coverage", align: "r" }]}>
            {listing.products.map((product, index) => (
              <Tr key={`${product.program_key ?? "p"}-${index}`}>
                <Td>{product.label}{product.primary ? <CellChip tone="acc">Primary</CellChip> : null}{product.notes ? <div className="sub">{product.notes}</div> : null}</Td>
                <Td className="num" align="r">{money(product.amount)}</Td>
                <Td className="num" align="r">{product.factor_rate ? `${Number(product.factor_rate).toFixed(2)} factor` : product.rate_pct != null ? `${product.rate_pct}%` : "—"}</Td>
                <Td className="num" align="r">{product.term_months ?? "—"} mo</Td>
                <Td className="num" align="r">{money(product.monthly_payment)}</Td>
                <Td className="num" align="r">{product.dscr != null ? `${Number(product.dscr).toFixed(2)}x` : "—"}</Td>
              </Tr>
            ))}
          </Table>
        </Panel>
      ) : null}
      <Panel title="Narrative" bodyClass="grid g10">
        <Field label="Summary" error={inlineError("summary")}><Textarea {...binding("summary")} aria-label="Summary" rows={3} value={d.summary} onChange={(e) => set("summary", e.target.value)} disabled={readOnly} /></Field>
        <div className="grid cols-auto">
          <ListingField {...fieldProps} k="guarantee_text" label="Guarantee, as shown" hint="Full personal guarantee from principals / Non-recourse with standard carve-outs" />
          <ListingField {...fieldProps} k="borrower_track_record" label="Borrower track record" hint="Count, not names: 7 completed projects / 12 years in operation" />
        </div>
        <Field label="Exit plan" error={inlineError("exit_plan")}><Textarea {...binding("exit_plan")} aria-label="Exit plan" rows={3} value={d.exit_plan} onChange={(e) => set("exit_plan", e.target.value)} disabled={readOnly} /></Field>
      </Panel>
      <Panel title="Collateral and valuation" bodyClass="grid cols-auto">
        <ListingField {...fieldProps} k="valuation_amount" label="Valuation, $" type="number" />
        <ListingField {...fieldProps} k="valuation_source" label="Valuation source" hint="Third-party appraisal, Inventory audit, Equipment appraisal…" />
        <ListingField {...fieldProps} k="title_status" label="Title" hint="Lien search clear…" />
        <ListingField {...fieldProps} k="servicer_label" label="Servicer, as shown" />
      </Panel>
      {listing.profile_id ? <MarketplacePublishStrip listing={listing} packageInSync canPublish onFixIssue={onFix} onActionError={onSnapshotError} onActionSuccess={onSnapshotSuccess} /> : null}
      <SourceSnapshotCard snapshot={listing.source_snapshot} />
      {!readOnly ? <div className="row"><Btn variant="pri" onClick={() => void save()} disabled={patch.isPending}>{patch.isPending ? "Saving…" : "Save"}</Btn><span className="sub">Saving a published listing changes what members see at once.</span></div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

function Documents({ listing, active, onMessage, onError, guidance, onFix, onSnapshotError, onSnapshotSuccess, onPpmApproved, onPublish, publishBusy, onPpmReadinessPending, onOwnsPpmIssues }: { listing: CpListing; active: boolean; onMessage: (m: { tone: "ok" | "bad"; text: string } | null) => void; onError: (error: unknown) => void; guidance: { issue: MarketplaceIssue; sequence: number } | null; onFix: (issue: MarketplaceIssue) => void; onSnapshotError: (error: unknown) => void; onSnapshotSuccess: () => void; onPpmApproved: () => void; onPublish: () => void; publishBusy: boolean; onPpmReadinessPending: (pending: boolean) => void; onOwnsPpmIssues: (owns: boolean) => void }) {
  const upload = useCpUploadDocument();
  const supersede = useCpSupersedeDocument();
  const confirm = useConfirmAction();
  const [kind, setKind] = useState<CpDocumentKind>("ppm");
  const fileRef = useRef<HTMLInputElement>(null);
  const links = useMarketplaceDocumentLink(listing.id);
  useEffect(() => { const target = guidance?.issue.target; if (target?.kind === "upload" && target.documentKind === "ppm") setKind("ppm"); }, [guidance]);

  const send = async (file: File) => {
    onMessage(null);
    try {
      await upload.mutateAsync({ listingId: listing.id, kind, file });
      onMessage({ tone: "ok", text: `${file.name} uploaded as ${DOC_KINDS.find((k) => k.value === kind)?.label}.` });
    } catch (e) {
      onError(e);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const remove = async (docId: string, name: string) => {
    if (!(await confirm({ title: `Supersede ${name}?`, body: "Members stop seeing it. The file itself is kept for the record.", confirmLabel: "Supersede", tone: "danger", reversible: false }))) return;
    try { await supersede.mutateAsync({ listingId: listing.id, documentId: docId }); } catch (e) { onError(e); }
  };

  return (
    <div className="grid">
      <MarketplacePpmWorkspace listing={listing} active={active} onFix={onFix} onApproved={onPpmApproved} onPublish={onPublish} publishBusy={publishBusy} onReadinessPending={onPpmReadinessPending} onOwnsPpmIssues={onOwnsPpmIssues} />
      {listing.profile_id ? <MarketplacePublishStrip listing={listing} packageInSync canPublish onFixIssue={onFix} onActionError={onSnapshotError} onActionSuccess={() => { onSnapshotSuccess(); onMessage({ tone: "ok", text: "The listing package was updated from the saved file." }); }} /> : null}
      <p className="sub">Offering PDFs below are attached to this listing. Review the PPM in the workspace above. Source originals use the separate engagement controls in the file document cockpit.</p>
      <Panel title="Upload an existing document" bodyClass="row">
        <Select id="marketplace-document-kind" aria-label="Document type" value={kind} onChange={(e) => setKind(e.target.value as CpDocumentKind)}>{DOC_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</Select>
        <input id="marketplace-document-upload" aria-label="Upload document PDF" ref={fileRef} type="file" accept="application/pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) void send(f); }} disabled={upload.isPending} />
        <span className="sub">{upload.isPending ? "Uploading…" : "A new file of the same kind supersedes the previous one. The private placement memorandum is required before publishing."}</span>
      </Panel>
      {listing.documents.length === 0 ? (
        <Card><span className="sub">No documents yet.</span></Card>
      ) : (
        <Panel noPad>
          <Table caption="Offering documents" cols={[{ label: "Kind" }, { label: "Name" }, { label: "Origin" }, { label: "Version", align: "r" }, { label: "Size", align: "r" }, { label: "Status" }, { label: "Actions" }]}>
            {listing.documents.map((doc) => (
              <Tr key={doc.id}>
                <Td>{doc.kind_label}</Td>
                <Td>{doc.name}</Td>
                <Td>{doc.source === "generated_ppm" ? "Managed PPM" : doc.source === "generated_package" ? "Generated listing package" : "Uploaded offering document"}</Td>
                <Td className="num" align="r">v{doc.version}</Td>
                <Td className="num" align="r">{doc.size_bytes ? `${Math.round(doc.size_bytes / 1024)} KB` : "—"}</Td>
                <Td><CellChip tone={doc.status === "ready" ? "ok" : doc.status === "pending" ? "warn" : "mut"}>{doc.status}</CellChip></Td>
                <Td><div className="row">{doc.status === "ready" ? [false, true].map(download => <Btn size="sm" key={String(download)} disabled={links.busy} onClick={() => void links.open(`/capital/admin/listings/${listing.id}/documents/${doc.id}/url?download=${download}`).catch(onError)}>{download ? "Download PDF" : "View PDF"}</Btn>) : null}{doc.status !== "superseded" ? <Btn size="sm" className="danger" onClick={() => void remove(doc.id, doc.name)} disabled={supersede.isPending}>Supersede</Btn> : null}</div></Td>
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
