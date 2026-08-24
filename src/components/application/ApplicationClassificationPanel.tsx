"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/design-system/Icon";
import { SearchableCombobox, type ComboboxOption } from "@/components/application/SearchableCombobox";
import { Btn, Callout, Field, IconBtn, Input, Panel, Row } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { useAuthedApi, useCurrentUser } from "@/hooks/useApi";
import type { ApplicationProfile, ApplicationSourceKind, ClassificationPatch, ClassificationPreview, FundingCategory, TaxonomyEntry, TaxonomySearch } from "@/lib/applicationProfile";

const VERTICALS: Array<[ApplicationProfile["vertical"], string]> = [["real_estate", "Real estate"], ["main_street", "Main Street"], ["dealer", "Dealer"], ["mca", "MCA"]];
const ENTITY_TYPES = ["LLC", "Corporation", "S corporation", "Partnership", "Sole proprietor", "Nonprofit", "Trust"];

function useDebouncedValue(value: string, wait = 220) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const timer = window.setTimeout(() => setDebounced(value), wait); return () => window.clearTimeout(timer); }, [value, wait]);
  return debounced;
}
function editableValues(profile: ApplicationProfile): ClassificationPatch { return { vertical: profile.vertical, funding_category: profile.funding_category, entity_type: profile.entity_type, industry: profile.industry, subindustry: profile.subindustry, naics_code: profile.naics_code, naics_label: profile.naics_label, custom_industry: profile.custom_industry, industry_entry_id: profile.industry_entry_id, subindustry_entry_id: profile.subindustry_entry_id, activity_entry_id: profile.activity_entry_id }; }
function valueLabel(value: string | null | undefined) { return value?.trim() || "Not set"; }
function DetailLine({ label, value }: { label: string; value: string }) { return <div className="line"><span className="sub">{label}</span><strong>{value}</strong></div>; }
function option(entry: TaxonomyEntry): ComboboxOption { return { id: entry.id, label: entry.label, code: entry.code, meta: entry.source.replaceAll("_", " "), pending: entry.status === "pending" }; }

export function ApplicationClassificationPanel({ sourceKind, sourceId }: { sourceKind: ApplicationSourceKind; sourceId: string }) {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  const currentUser = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [reviewEntry, setReviewEntry] = useState<TaxonomyEntry | null>(null);
  const [reviewLabel, setReviewLabel] = useState("");
  const [reviewCode, setReviewCode] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [canonicalQuery, setCanonicalQuery] = useState("");
  const [canonicalEntry, setCanonicalEntry] = useState<ComboboxOption | null>(null);
  const [draft, setDraft] = useState<ClassificationPatch | null>(null);
  const [preview, setPreview] = useState<ClassificationPreview | null>(null);
  const [error, setError] = useState("");
  const [queries, setQueries] = useState({ funding: "", industry: "", subindustry: "", activity: "" });
  const [custom, setCustom] = useState<{ level: 2 | 3 | 6; label: string; code: string } | null>(null);
  const queryKey = ["application-profile", sourceKind, sourceId] as const;
  const profile = useQuery({ queryKey, queryFn: () => apiCall<ApplicationProfile>("/application-profiles/resolve", { method: "POST", body: JSON.stringify({ source_kind: sourceKind, source_id: sourceId }) }), enabled: Boolean(sourceId) });

  useEffect(() => { if (profile.data && !open) setDraft(editableValues(profile.data)); }, [profile.data, open]);
  const profileId = profile.data?.id;
  const fundingQuery = useDebouncedValue(queries.funding);
  const industryQuery = useDebouncedValue(queries.industry);
  const subindustryQuery = useDebouncedValue(queries.subindustry);
  const activityQuery = useDebouncedValue(queries.activity);
  const canonicalSearch = useDebouncedValue(canonicalQuery);
  const funding = useQuery({ queryKey: ["funding-categories", draft?.vertical, fundingQuery], enabled: open && Boolean(draft), queryFn: () => apiCall<FundingCategory[]>(`/application-profiles/funding-categories?vertical=${draft?.vertical}&q=${encodeURIComponent(fundingQuery)}`) });
  function taxonomy(level: 2 | 3 | 6, query: string, parentId?: string | null) { const params = new URLSearchParams({ level: String(level), q: query, page_size: "60" }); if (parentId) params.set("parent_id", parentId); if (profileId) params.set("profile_id", profileId); return apiCall<TaxonomySearch>(`/application-profiles/taxonomy/search?${params}`); }
  const industries = useQuery({ queryKey: ["taxonomy", profileId, 2, industryQuery], enabled: open && Boolean(profileId), queryFn: () => taxonomy(2, industryQuery) });
  const subindustries = useQuery({ queryKey: ["taxonomy", profileId, 3, draft?.industry_entry_id, subindustryQuery], enabled: open && Boolean(profileId && draft?.industry_entry_id), queryFn: () => taxonomy(3, subindustryQuery, draft?.industry_entry_id) });
  const activities = useQuery({ queryKey: ["taxonomy", profileId, 6, draft?.subindustry_entry_id, activityQuery], enabled: open && Boolean(profileId && draft?.subindustry_entry_id), queryFn: () => taxonomy(6, activityQuery, draft?.subindustry_entry_id) });
  const reviewQueue = useQuery({ queryKey: ["taxonomy-review-queue"], enabled: queueOpen && currentUser.data?.role === "super_admin", queryFn: () => apiCall<TaxonomySearch>("/application-profiles/taxonomy/review-queue?page_size=100") });
  const canonicalResults = useQuery({ queryKey: ["taxonomy-canonical-map", reviewEntry?.level, canonicalSearch], enabled: Boolean(queueOpen && reviewEntry && canonicalSearch.trim()), queryFn: () => apiCall<TaxonomySearch>(`/application-profiles/taxonomy/search?level=${reviewEntry?.level}&q=${encodeURIComponent(canonicalSearch)}&page_size=50`) });

  const review = useMutation({ mutationFn: (body: ClassificationPatch) => apiCall<ClassificationPreview>(`/application-profiles/${profileId}/classification/preview`, { method: "POST", body: JSON.stringify(body) }), onSuccess: (data) => { setPreview(data); setError(""); }, onError: (reason) => setError(reason instanceof Error ? reason.message : "Classification could not be reviewed.") });
  const confirm = useMutation({ mutationFn: () => apiCall<ApplicationProfile>(`/application-profiles/${profileId}/classification/confirm`, { method: "POST", body: JSON.stringify({ ...draft, expected_revision: preview?.current_revision }) }), onSuccess: async (updated) => { qc.setQueryData(queryKey, updated); await qc.invalidateQueries({ queryKey: ["application-profile-audit", updated.id] }); setOpen(false); setPreview(null); setError(""); }, onError: (reason) => setError(reason instanceof Error ? reason.message : "Classification could not be changed.") });
  const contribution = useMutation({ mutationFn: (body: { level: 2 | 3 | 6; label: string; code?: string; parent_id?: string | null }) => apiCall<TaxonomyEntry>(`/application-profiles/${profileId}/taxonomy/contributions`, { method: "POST", body: JSON.stringify(body) }), onSuccess: (entry) => { const map = { 2: ["industry_entry_id", "industry"], 3: ["subindustry_entry_id", "subindustry"], 6: ["activity_entry_id", "naics_label"] } as const; const [idField, labelField] = map[entry.level]; setDraft((current) => current ? { ...current, [idField]: entry.id, [labelField]: entry.label, ...(entry.level === 6 ? { naics_code: entry.code } : {}) } : current); setCustom(null); setError(""); void qc.invalidateQueries({ queryKey: ["taxonomy", profileId] }); }, onError: (reason) => setError(reason instanceof Error ? reason.message : "The custom classification could not be added.") });
  const createFunding = useMutation({ mutationFn: (label: string) => apiCall<FundingCategory>("/application-profiles/funding-categories", { method: "POST", body: JSON.stringify({ vertical: draft?.vertical, label }) }), onSuccess: (row) => { update("funding_category", row.label); setQueries((current) => ({ ...current, funding: row.label })); void funding.refetch(); }, onError: (reason) => setError(reason instanceof Error ? reason.message : "The funding category could not be created.") });
  const taxonomyReview = useMutation({ mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => apiCall<TaxonomyEntry>(`/application-profiles/taxonomy/${id}/review`, { method: "POST", body: JSON.stringify(body) }), onSuccess: async () => { setReviewEntry(null); setCanonicalEntry(null); setCanonicalQuery(""); setReviewNote(""); await qc.invalidateQueries({ queryKey: ["taxonomy-review-queue"] }); await qc.invalidateQueries({ queryKey: ["taxonomy"] }); }, onError: (reason) => setError(reason instanceof Error ? reason.message : "The taxonomy review could not be completed.") });

  const current = profile.data;
  function startEdit() { if (!current) return; setDraft(editableValues(current)); setPreview(null); setError(""); setCustom(null); setOpen(true); }
  function close() { if (review.isPending || confirm.isPending) return; setOpen(false); setPreview(null); setCustom(null); setError(""); }
  function update<K extends keyof ClassificationPatch>(key: K, value: ClassificationPatch[K]) { setDraft((row) => row ? { ...row, [key]: value } : row); setPreview(null); }
  function selected(id: string | null | undefined, label: string | null | undefined, code?: string | null): ComboboxOption | null { return id && label ? { id, label, code, pending: current?.classification_provenance?.status === "pending" } : null; }
  function chooseReview(entry: TaxonomyEntry) { setReviewEntry(entry); setReviewLabel(entry.label); setReviewCode(entry.code || ""); setReviewNote(""); setCanonicalEntry(null); setCanonicalQuery(""); setError(""); }
  function submitReview(action: "approve" | "edit" | "reject" | "map") { if (!reviewEntry) return; taxonomyReview.mutate({ id: reviewEntry.id, body: { action, note: reviewNote.trim() || null, ...(action === "edit" ? { label: reviewLabel.trim(), code: reviewCode.trim() || null } : {}), ...(action === "map" ? { canonical_entry_id: canonicalEntry?.id } : {}) } }); }
  const verticalOptions = VERTICALS.map(([id, label]) => ({ id, label }));
  const entityOptions = ENTITY_TYPES.map((label) => ({ id: label.toLocaleLowerCase().replaceAll(" ", "_"), label }));
  const fundingOptions = (funding.data ?? []).map((row) => ({ id: row.id, label: row.label, meta: row.status === "needs_configuration" ? "Needs program configuration" : null }));
  const fundingValue = draft?.funding_category ? fundingOptions.find((row) => row.label === draft.funding_category) ?? { id: draft.funding_category, label: draft.funding_category } : null;

  return <>
    <Panel title="Classification" actions={<Row>{currentUser.data?.role === "super_admin" ? <Btn onClick={() => { setQueueOpen(true); setError(""); }}>Taxonomy queue</Btn> : null}<IconBtn onClick={startEdit} aria-label="Edit file classification" title="Edit file classification" disabled={!current}><Icon name="pencil" size={14} /></IconBtn></Row>}>
      {profile.isLoading ? <div className="sub">Loading classification...</div> : profile.isError ? <Callout tone="bad">Classification is unavailable.</Callout> : <><DetailLine label="Vertical" value={valueLabel(VERTICALS.find(([value]) => value === current?.vertical)?.[1])} /><DetailLine label="Funding category" value={valueLabel(current?.funding_category)} /><DetailLine label="Entity type" value={valueLabel(current?.entity_type)} /><DetailLine label="Industry" value={valueLabel(current?.industry)} /><DetailLine label="Subindustry" value={valueLabel(current?.subindustry)} /><DetailLine label="NAICS / PBA" value={valueLabel(current?.naics_code ? `${current.naics_code} · ${current.naics_label || "Unlabeled activity"}` : null)} />{current?.classification_provenance?.status === "pending" ? <Callout tone="warn">Custom classification · Pending administrator review</Callout> : null}<DetailLine label="Revision" value={String(current?.classification_revision ?? 1)} /></>}
    </Panel>
    <Drawer open={open} onClose={close} title={preview ? "Review classification change" : "Edit file classification"} sub={preview ? "Confirm the operational effects before changing the file." : "Search the controlled taxonomy or add a file-scoped classification for review."} width="md" closeOnBackdrop={!review.isPending && !confirm.isPending} footer={preview ? <><Btn onClick={() => setPreview(null)} disabled={confirm.isPending}>Back</Btn><span className="sp" /><Btn onClick={close} disabled={confirm.isPending}>Cancel</Btn><Btn variant="pri" onClick={() => confirm.mutate()} disabled={confirm.isPending}>{confirm.isPending ? "Applying..." : "Confirm and queue review"}</Btn></> : <><span className="sp" /><Btn onClick={close} disabled={review.isPending}>Cancel</Btn><Btn variant="pri" onClick={() => draft && review.mutate(draft)} disabled={!draft || review.isPending}>{review.isPending ? "Preparing review..." : "Review changes"}</Btn></>}>
      {error ? <Callout tone="bad" icon={<Icon name="alert" size={16} />}>{error}</Callout> : null}
      {preview ? <div className="grid"><Callout tone="warn" icon={<Icon name="alert" size={16} />}>Evidence and credit history remain intact. Requirements and AI conclusions will be recalculated.</Callout><div className="review-effects">{preview.effects.map((effect) => <div key={effect} className="review-effect"><Icon name="check" size={15} /><span>{effect}</span></div>)}</div><div className="panel compact"><DetailLine label="Vertical" value={valueLabel(preview.after.vertical)} /><DetailLine label="Funding category" value={valueLabel(preview.after.funding_category)} /><DetailLine label="Entity type" value={valueLabel(preview.after.entity_type)} /><DetailLine label="Industry" value={valueLabel(preview.after.industry)} /><DetailLine label="Subindustry" value={valueLabel(preview.after.subindustry)} /><DetailLine label="NAICS" value={valueLabel(preview.after.naics_code ? `${preview.after.naics_code} · ${preview.after.naics_label || ""}` : null)} /></div></div> : draft ? <div className="fldgrid two">
        <Field label="Vertical"><SearchableCombobox value={verticalOptions.find((row) => row.id === draft.vertical) ?? null} options={verticalOptions} onChange={(row) => { if (row) setDraft({ ...draft, vertical: row.id as ApplicationProfile["vertical"], funding_category: null }); }} /></Field>
        <Field label="Funding category"><SearchableCombobox value={fundingValue} options={fundingOptions} loading={funding.isFetching} allowAdd={currentUser.data?.role === "super_admin"} addLabel={queries.funding.trim() ? `Create “${queries.funding.trim()}”` : undefined} onQueryChange={(value) => setQueries((row) => ({ ...row, funding: value }))} onChange={(row) => update("funding_category", row?.label ?? null)} onAdd={(label) => createFunding.mutate(label)} placeholder="Search funding categories" /></Field>
        <Field label="Entity type"><SearchableCombobox value={draft.entity_type ? { id: draft.entity_type, label: draft.entity_type } : null} options={entityOptions} onChange={(row) => update("entity_type", row?.label ?? null)} placeholder="Search entity types" /></Field>
        <Field label="Industry"><SearchableCombobox value={selected(draft.industry_entry_id, draft.industry)} options={(industries.data?.items ?? []).map(option)} loading={industries.isFetching} allowAdd onQueryChange={(value) => setQueries((row) => ({ ...row, industry: value }))} onChange={(row) => setDraft({ ...draft, industry_entry_id: row?.id ?? null, industry: row?.label ?? null, subindustry_entry_id: null, subindustry: null, activity_entry_id: null, naics_code: null, naics_label: null })} onAdd={(label) => setCustom({ level: 2, label, code: "" })} placeholder="Search industries" /></Field>
        <Field label="Subindustry"><SearchableCombobox value={selected(draft.subindustry_entry_id, draft.subindustry)} options={(subindustries.data?.items ?? []).map(option)} loading={subindustries.isFetching} disabled={!draft.industry_entry_id} allowAdd onQueryChange={(value) => setQueries((row) => ({ ...row, subindustry: value }))} onChange={(row) => setDraft({ ...draft, subindustry_entry_id: row?.id ?? null, subindustry: row?.label ?? null, activity_entry_id: null, naics_code: null, naics_label: null })} onAdd={(label) => setCustom({ level: 3, label, code: "" })} placeholder={draft.industry_entry_id ? "Search subindustries" : "Select an industry first"} /></Field>
        <Field label="NAICS / IRS activity"><SearchableCombobox value={selected(draft.activity_entry_id, draft.naics_label, draft.naics_code)} options={(activities.data?.items ?? []).map(option)} loading={activities.isFetching} disabled={!draft.subindustry_entry_id} allowAdd onQueryChange={(value) => setQueries((row) => ({ ...row, activity: value }))} onChange={(row) => setDraft({ ...draft, activity_entry_id: row?.id ?? null, naics_code: row?.code ?? null, naics_label: row?.label ?? null })} onAdd={(query) => setCustom({ level: 6, code: /^\d{6}$/.test(query) ? query : "", label: /^\d{6}$/.test(query) ? "" : query })} placeholder={draft.subindustry_entry_id ? "Search code or activity" : "Select a subindustry first"} /></Field>
        {custom ? <div className="classification-contribution"><Callout tone="warn">This entry applies to this file immediately and remains pending until an administrator reviews it.</Callout>{custom.level === 6 ? <Field label="Six-digit code"><Input value={custom.code} inputMode="numeric" maxLength={6} onChange={(event) => setCustom({ ...custom, code: event.target.value.replace(/\D/g, "").slice(0, 6) })} /></Field> : null}<Field label={custom.level === 6 ? "Activity label" : custom.level === 3 ? "Subindustry label" : "Industry label"}><Input autoFocus value={custom.label} onChange={(event) => setCustom({ ...custom, label: event.target.value })} /></Field><div className="row"><Btn onClick={() => setCustom(null)}>Cancel</Btn><Btn variant="pri" disabled={!custom.label.trim() || (custom.level === 6 && custom.code.length !== 6) || contribution.isPending} onClick={() => contribution.mutate({ level: custom.level, label: custom.label.trim(), code: custom.level === 6 ? custom.code : undefined, parent_id: custom.level === 3 ? draft.industry_entry_id : custom.level === 6 ? draft.subindustry_entry_id : null })}>{contribution.isPending ? "Adding..." : "Use custom entry"}</Btn></div></div> : null}
      </div> : null}
    </Drawer>
    <Drawer open={queueOpen} onClose={() => { if (!taxonomyReview.isPending) { setQueueOpen(false); setReviewEntry(null); setError(""); } }} title="Taxonomy review queue" sub="Approve new classifications, edit them before publication, map duplicates, or reject them." width="lg" closeOnBackdrop={!taxonomyReview.isPending}>
      {error ? <Callout tone="bad" icon={<Icon name="alert" size={16} />}>{error}</Callout> : null}
      {!reviewEntry ? <div className="taxonomy-review-list">
        {reviewQueue.isLoading ? <div className="empty">Loading pending classifications...</div> : (reviewQueue.data?.items ?? []).map((entry) => <button key={entry.id} type="button" onClick={() => chooseReview(entry)}><span><b>{entry.label}</b><small>Level {entry.level}{entry.code ? ` · ${entry.code}` : ""} · {entry.source.replaceAll("_", " ")}</small></span><Icon name="chevR" size={15} /></button>)}
        {!reviewQueue.isLoading && !reviewQueue.data?.items.length ? <div className="empty">No taxonomy contributions need review.</div> : null}
      </div> : <div className="grid g12">
        <Btn onClick={() => setReviewEntry(null)} disabled={taxonomyReview.isPending}><Icon name="chevL" size={14} />Back to queue</Btn>
        <Callout tone="warn">This value is already active on its originating file. Publishing makes it available across the system.</Callout>
        <div className="fldgrid two"><Field label="Label"><Input value={reviewLabel} onChange={(event) => setReviewLabel(event.target.value)} /></Field><Field label="Code"><Input value={reviewCode} disabled={reviewEntry.level !== 6} inputMode="numeric" maxLength={6} onChange={(event) => setReviewCode(event.target.value.replace(/\D/g, "").slice(0, 6))} /></Field></div>
        <Field label="Map to an existing classification"><SearchableCombobox value={canonicalEntry} options={(canonicalResults.data?.items ?? []).filter((entry) => entry.id !== reviewEntry.id).map(option)} loading={canonicalResults.isFetching} onQueryChange={setCanonicalQuery} onChange={setCanonicalEntry} placeholder="Search canonical code or label" /></Field>
        <Field label="Administrator note"><Input value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Reason, correction, or mapping note" /></Field>
        <div className="taxonomy-review-actions"><Btn className="danger" disabled={taxonomyReview.isPending} onClick={() => submitReview("reject")}>Reject</Btn><span className="sp" /><Btn disabled={taxonomyReview.isPending || !canonicalEntry} onClick={() => submitReview("map")}>Map to existing</Btn><Btn disabled={taxonomyReview.isPending || !reviewLabel.trim() || (reviewEntry.level === 6 && reviewCode.length !== 6)} onClick={() => submitReview("edit")}>Save and approve</Btn><Btn variant="pri" disabled={taxonomyReview.isPending} onClick={() => submitReview("approve")}>Approve as submitted</Btn></div>
      </div>}
    </Drawer>
  </>;
}
