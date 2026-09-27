"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Icon } from "@/components/design-system/Icon";
import { useConfirmAction } from "@/components/design-system/ConfirmationProvider";
import { Btn, Callout, CellChip, Field, Input, Select, Textarea, cx } from "@/components/ds";
import { api, ApiError } from "@/lib/api";
import type { FundingProgramBaseline, FundingProgramCatalogItem, FundingProgramScope, FundingProgramVertical, FundingProgramVersion } from "@/lib/fundingPrograms";
import { FundingProgramCriteriaEditor } from "./FundingProgramCriteriaEditor";
import { FundingProgramScopeEditor } from "./FundingProgramScopeEditor";
import { applySharedIndustryExclusions, baselineNoteGroups, baselineReferenceFromRules, industryPrefixes, jsonEquivalent, sharedIndustryExclusions, validateEditorContent } from "./fundingProgramEditorModel";
import styles from "./FundingProgramEditor.module.css";

const VERTICALS: Array<{ key: FundingProgramVertical; label: string }> = [
  { key: "dealer", label: "Auto dealerships" },
  { key: "main_street", label: "Main Street businesses" },
  { key: "real_estate", label: "Real estate" },
  { key: "mca", label: "MCA refinance" },
];
type CatalogDraft = { name: string; description: string; order: string; scopes: FundingProgramScope[] };
type VersionDraft = { rules: string; requirements: string };
function message(error: unknown): string { return error instanceof ApiError || error instanceof Error ? error.message : "Funding program settings could not be updated."; }
function copyScope(scope: FundingProgramScope): FundingProgramScope { return { ...scope, scope_key: scope.scope_key || "default", intake_variants: [...(scope.intake_variants ?? [])], intent_keys: [...(scope.intent_keys ?? [])], naics_prefixes: [...(scope.naics_prefixes ?? [])], excluded_naics_prefixes: [...(scope.excluded_naics_prefixes ?? [])], industry_keys: [...(scope.industry_keys ?? [])], required_fact_keys: [...(scope.required_fact_keys ?? [])] }; }
function catalogDraft(program: FundingProgramCatalogItem): CatalogDraft {
  return { name: program.name, description: program.short_description || "", order: String(program.display_order), scopes: program.scopes.map(copyScope) };
}
function versionDraft(version?: FundingProgramVersion | null): VersionDraft {
  return { rules: JSON.stringify(version?.rules || {}, null, 2), requirements: JSON.stringify(version?.requirements || [], null, 2) };
}

export function FundingProgramsSection() {
  const { getToken } = useAuth();
  const confirmAction = useConfirmAction();
  const [rows, setRows] = useState<FundingProgramCatalogItem[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const hydratedKey = useRef("");
  const [query, setQuery] = useState("");
  const [vertical, setVertical] = useState<FundingProgramVertical | "all">("all");
  const [catalog, setCatalog] = useState<CatalogDraft | null>(null);
  const [version, setVersion] = useState<VersionDraft>(() => versionDraft());
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState("");
  const [suggestedBaseline, setSuggestedBaseline] = useState<FundingProgramBaseline | null>(null);

  const call = useCallback(async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await getToken();
    return api<T>(path, { ...init, authToken: token ?? undefined });
  }, [getToken]);

  const load = useCallback(async () => {
    setBusy("load"); setError(null);
    try { const next = await call<FundingProgramCatalogItem[]>("/admin/funding-programs"); setRows(next); setSelectedKey((current) => current || next[0]?.program_key || ""); }
    catch (cause) { setError(message(cause)); }
    finally { setBusy(""); }
  }, [call]);
  useEffect(() => { void load(); }, [load]);
  const selected = rows.find((item) => item.program_key === selectedKey) || null;
  useEffect(() => {
    // Catalog responses must not discard unsaved eligibility/document edits.
    if (!selected || hydratedKey.current === selected.program_key) return;
    hydratedKey.current = selected.program_key;
    setCatalog(catalogDraft(selected));
    const current = selected.draft_versions[0] || selected.published_version;
    setSelectedVersionId(current?.playbook_id || ""); setVersion(versionDraft(current)); setReason(""); setSuccess(""); setError(null); setSuggestedBaseline(null);
  }, [selected]);

  const savedVersion = selected?.draft_versions.find((item) => item.playbook_id === selectedVersionId)
    || (selected?.published_version?.playbook_id === selectedVersionId ? selected.published_version : null);
  const baseline = versionDraft(savedVersion);
  const criteriaDirty = !jsonEquivalent(version.rules, baseline.rules) || !jsonEquivalent(version.requirements, baseline.requirements);
  const catalogDirty = Boolean(selected && catalog && !jsonEquivalent(JSON.stringify(catalog), JSON.stringify(catalogDraft(selected))));
  const dirty = criteriaDirty || catalogDirty;
  const contentError = validateEditorContent(version.rules, version.requirements);
  const catalogError = catalog && (catalog.name.trim().length < 2 ? "Give the program a name." : !catalog.scopes.length ? "Choose at least one workspace." : !Number.isInteger(Number(catalog.order)) || Number(catalog.order) < 0 || Number(catalog.order) > 10000 ? "Display order must be a whole number from 0 to 10,000." : catalog.scopes.some((scope) => !scope.scope_key.trim() || [...scope.naics_prefixes, ...(scope.excluded_naics_prefixes ?? [])].some((code) => !industryPrefixes(code).length) || (scope.excluded_naics_prefixes ?? []).length > 30) ? "Review the routing reference and industry codes. Each list supports up to 30 valid industry codes." : null);
  const reviewReady = reason.trim().length >= 8;
  useEffect(() => { if (!dirty) return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((item) => (vertical === "all" || item.scopes.some((scope) => scope.vertical === vertical && scope.is_active !== false)) && (!needle || [item.name, item.program_key, item.public_slug, ...item.aliases].join(" ").toLowerCase().includes(needle)));
  }, [query, rows, vertical]);

  async function chooseProgram(key: string) {
    if (busy || key === selectedKey) return;
    if (dirty && !await confirmAction({ title: "Discard unsaved program changes?", body: "The changes on this screen have not been saved. Switching programs will discard them.", confirmLabel: "Discard and switch" })) return;
    setSelectedKey(key);
  }
  async function chooseVersion(playbookId: string) {
    if (!selected || busy) return;
    if (criteriaDirty && !await confirmAction({ title: "Discard unsaved criteria changes?", body: "The current eligibility checks and document edits have not been saved.", confirmLabel: "Discard and switch" })) return;
    const next = selected.draft_versions.find((item) => item.playbook_id === playbookId) || (selected.published_version?.playbook_id === playbookId ? selected.published_version : null);
    setSelectedVersionId(playbookId); setVersion(versionDraft(next)); setSuccess(""); setError(null); setSuggestedBaseline(null);
  }
  function updateScope(index: number, patch: Partial<FundingProgramScope>) { setCatalog((current) => current ? { ...current, scopes: current.scopes.map((scope, i) => i === index ? { ...scope, ...patch } : scope) } : current); }
  function toggleVertical(next: FundingProgramVertical, enabled: boolean) {
    setCatalog((current) => {
      if (!current) return current;
      if (enabled) return current.scopes.some((scope) => scope.vertical === next) ? current : { ...current, scopes: [...current.scopes, { vertical: next, scope_key: "default", intake_variants: [], intent_keys: [], naics_prefixes: [], excluded_naics_prefixes: sharedIndustryExclusions(current.scopes).codes, industry_keys: [], required_fact_keys: [] }] };
      return { ...current, scopes: current.scopes.filter((scope) => scope.vertical !== next) };
    });
  }
  async function loadSuggestedBaseline() {
    if (!selected || !catalog || busy) return;
    setBusy("baseline"); setError(null); setSuccess("");
    try {
      const next = await call<FundingProgramBaseline>(`/admin/funding-programs/${selected.program_key}/baseline`);
      if (next.program_key !== selected.program_key || !Array.isArray(next.scopes) || !next.scopes.length) throw new Error("The suggested baseline does not include valid availability for this program.");
      const validation = validateEditorContent(JSON.stringify(next.rules), JSON.stringify(next.requirements));
      if (validation) throw new Error(`The suggested baseline needs correction: ${validation}`);
      const sourceSummary = next.source_notes.slice(0, 4).join("\n");
      if (!await confirmAction({ title: `Load suggested baseline for ${selected.name}?`, body: `This replaces the eligibility checks, document requirements, and workspace routing currently shown with an editable suggestion. Your program name and description are preserved. Nothing is saved or published. Review website facts and proposed QC policies before saving.\n\n${sourceSummary}`, confirmLabel: "Load editable suggestion" })) return;
      setCatalog((current) => current ? { ...current, scopes: next.scopes.map(copyScope) } : current);
      setSelectedVersionId(""); setVersion({ rules: JSON.stringify(next.rules, null, 2), requirements: JSON.stringify(next.requirements, null, 2) }); setSuggestedBaseline(next);
      setSuccess("Suggested baseline loaded as unsaved edits. Review the source notes, adjust the checks, then save and publish when ready.");
    } catch (cause) { setError(message(cause)); } finally { setBusy(""); }
  }
  async function saveCatalog() {
    if (!selected || !catalog || !reviewReady || catalogError || !catalogDirty || busy) return;
    if (!await confirmAction({ title: "Save program details and availability?", body: `This updates where ${catalog.name} appears. Eligibility and document edits are saved separately as a draft.`, confirmLabel: "Save program" })) return;
    setBusy("catalog"); setError(null); setSuccess("");
    try {
      const next = await call<FundingProgramCatalogItem[]>(`/admin/funding-programs/${selected.program_key}`, { method: "PATCH", body: JSON.stringify({ name: catalog.name.trim(), short_description: catalog.description.trim() || null, display_order: Number(catalog.order), scopes: catalog.scopes.map(({ id: _id, is_active: _active, ...scope }) => scope), reason: reason.trim(), confirmed: true }) });
      setRows(next); const updated = next.find((item) => item.program_key === selected.program_key); if (updated) setCatalog(catalogDraft(updated)); setSuccess("Program details and availability saved. Eligibility and document edits remain on this screen.");
    } catch (cause) { setError(message(cause)); } finally { setBusy(""); }
  }
  async function createVersion() {
    if (!selected || !reviewReady || busy || contentError) return;
    if (!await confirmAction({ title: "Save a new criteria draft?", body: "This saves your eligibility checks and document requirements. Review and publish the saved draft when it is ready for use.", confirmLabel: "Save draft" })) return;
    setBusy("version"); setError(null); setSuccess("");
    try {
      const next = await call<FundingProgramCatalogItem[]>(`/admin/funding-programs/${selected.program_key}/versions`, { method: "POST", body: JSON.stringify({ rules: JSON.parse(version.rules), requirements: JSON.parse(version.requirements), reason: reason.trim(), confirmed: true }) });
      setRows(next); const updated = next.find((item) => item.program_key === selected.program_key); const draft = updated?.draft_versions[0]; setSelectedVersionId(draft?.playbook_id || ""); setVersion(versionDraft(draft)); setSuccess(`Draft v${draft?.version ?? ""} saved. It is not live until you publish it.`);
    } catch (cause) { setError(message(cause)); } finally { setBusy(""); }
  }
  async function publishDraft() {
    if (!selected || savedVersion?.status !== "draft" || !savedVersion.rules.fit || !reviewReady || dirty || contentError || busy) return;
    if (!await confirmAction({ title: `Publish criteria v${savedVersion.version}?`, body: "New program selections will use these saved eligibility checks and document requirements. Existing files keep their pinned criteria version.", confirmLabel: "Publish criteria" })) return;
    setBusy("publish"); setError(null); setSuccess("");
    try {
      const next = await call<FundingProgramCatalogItem[]>(`/admin/funding-programs/${selected.program_key}/versions/${savedVersion.playbook_id}/publish`, { method: "POST", body: JSON.stringify({ reason: reason.trim(), confirmed: true }) });
      setRows(next); const published = next.find((item) => item.program_key === selected.program_key)?.published_version; setSelectedVersionId(published?.playbook_id || ""); setVersion(versionDraft(published)); setSuccess(`Criteria v${published?.version ?? ""} published for new program selections.`);
    } catch (cause) { setError(message(cause)); } finally { setBusy(""); }
  }
  async function setRetired(retired: boolean) {
    if (!selected || !reviewReady || busy) return;
    if (!await confirmAction({ title: `${retired ? "Retire" : "Restore"} ${selected.name}?`, body: retired ? "The program will be unavailable for new selections. Existing files retain their program history." : "The program returns to the catalog. Published eligibility checks are needed for fit recommendations.", confirmLabel: retired ? "Retire program" : "Restore program", tone: retired ? "danger" : "default" })) return;
    setBusy("retire"); setError(null); setSuccess("");
    try { setRows(await call<FundingProgramCatalogItem[]>(`/admin/funding-programs/${selected.program_key}/retire`, { method: "POST", body: JSON.stringify({ retired, reason: reason.trim(), confirmed: true }) })); setSuccess(retired ? "Program retired." : "Program restored."); }
    catch (cause) { setError(message(cause)); } finally { setBusy(""); }
  }

  const publishedHasFit = Boolean(selected?.published_version?.rules.fit);
  const baselineReference = suggestedBaseline ?? baselineReferenceFromRules(version.rules);
  const baselineNotes = baselineNoteGroups(baselineReference?.source_notes ?? []);
  return <div className={cx("funding-program-settings", styles.root)}>
    <header><div><h2>Funding programs</h2><p>Choose a program, set its eligibility checks, and define the documents your team needs.</p></div><CellChip tone="acc">{rows.filter((item) => item.status === "active").length} active</CellChip></header>
    {error ? <Callout tone="bad">{error}</Callout> : null}
    {success ? <div role="status"><Callout tone="ok">{success}</Callout></div> : null}
    <div className="funding-program-toolbar"><Input aria-label="Search funding programs" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search funding programs" /><Select aria-label="Filter programs by workspace" value={vertical} onChange={(event) => setVertical(event.target.value as FundingProgramVertical | "all")}><option value="all">All workspaces</option>{VERTICALS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</Select></div>
    <div className="funding-program-layout">
      <aside className="funding-program-list" aria-label="Funding programs">{filtered.map((item) => <button key={item.program_key} type="button" disabled={Boolean(busy)} aria-pressed={selectedKey === item.program_key} className={cx(selectedKey === item.program_key && "on")} onClick={() => void chooseProgram(item.program_key)}><span><strong>{item.name}</strong><small>{[...new Set(item.scopes.map((scope) => VERTICALS.find((row) => row.key === scope.vertical)?.label))].join(" · ")}</small></span><CellChip tone={item.status === "retired" ? "mut" : item.published_version?.rules.fit ? "ok" : "warn"}>{item.status === "retired" ? "Retired" : item.published_version?.rules.fit ? "Published" : "Setup needed"}</CellChip></button>)}{!filtered.length ? <div className="empty">{busy === "load" ? "Loading programs…" : "No programs match these filters."}</div> : null}</aside>
      <fieldset className="funding-program-editor" disabled={Boolean(busy)} aria-label="Edit funding program">{selected && catalog ? <>
        <section><div className="funding-program-section-head"><div><span className="lbl">1 · Program details</span><h3>{selected.name}</h3></div><CellChip tone={selected.status === "active" ? "ok" : "mut"}>{selected.status === "active" ? "Active" : "Retired"}</CellChip></div>
          <div className={styles.status}><Icon name="spark" size={18} /><div><strong>{selected.status === "retired" ? "Retired from new selections" : publishedHasFit ? `Published v${selected.published_version?.version} · eligibility checks in use` : selected.published_version ? `Published v${selected.published_version.version} · eligibility checks still needed` : "No published criteria yet"}</strong><p>{selected.status === "retired" ? "Existing selections remain available in file history." : publishedHasFit ? "Program matching applies the published eligibility checks. Document instructions guide AI review. Existing files retain their selected version." : "The program can be listed, but its description and document list alone do not establish eligibility. Configure checks, save a draft, then publish it."}</p></div></div>
          <div className="fldgrid two"><Field label="Program name"><Input value={catalog.name} maxLength={160} onChange={(event) => setCatalog({ ...catalog, name: event.target.value })} /></Field><Field label="Display order"><Input type="number" min={0} max={10000} value={catalog.order} onChange={(event) => setCatalog({ ...catalog, order: event.target.value })} /></Field></div><Field label="Short description"><Textarea rows={2} maxLength={1000} value={catalog.description} onChange={(event) => setCatalog({ ...catalog, description: event.target.value })} placeholder="Describe the program in plain language. Eligibility is configured below." /></Field>
        </section>
        <section><div className="funding-program-section-head"><div><span className="lbl">2 · Availability</span><h3>Which businesses can see this program?</h3><p>Choose the workspaces, then add any prohibited industries. Specialized routing is optional.</p></div></div><div className="funding-program-verticals">{VERTICALS.map((item) => <label key={item.key}><input type="checkbox" checked={catalog.scopes.some((scope) => scope.vertical === item.key)} onChange={(event) => toggleVertical(item.key, event.target.checked)} />{item.label}</label>)}</div><FundingProgramScopeEditor key={selected.program_key} scopes={catalog.scopes} onScopeChange={updateScope} onExclusionsChange={(codes) => setCatalog((current) => current ? { ...current, scopes: applySharedIndustryExclusions(current.scopes, codes) } : current)} call={call} /></section>
        <section><div className="funding-program-section-head"><div><span className="lbl">3 · Eligibility and documents</span><h3>What does the client need to qualify?</h3><p>{criteriaDirty ? "Unsaved changes · save a new draft to preserve these edits." : savedVersion?.status === "draft" ? `Saved draft v${savedVersion.version} · not published` : savedVersion?.status === "published" ? `Viewing published v${savedVersion.version} · edits create a new draft` : "New criteria · not saved"}</p></div><Select aria-label="Criteria version" value={selectedVersionId} onChange={(event) => void chooseVersion(event.target.value)}><option value="">Start with blank criteria</option>{selected.draft_versions.map((item) => <option key={item.playbook_id} value={item.playbook_id}>Draft v{item.version}</option>)}{selected.published_version ? <option value={selected.published_version.playbook_id}>Published v{selected.published_version.version}</option> : null}</Select></div>
          <div className={styles.row}><Btn onClick={() => void loadSuggestedBaseline()}><Icon name="spark" size={15} />{busy === "baseline" ? "Loading suggestion…" : "Load suggested baseline"}</Btn><span className={styles.muted}>Editable starting point from website references and proposed QC policy. Never published automatically.</span></div>
          {baselineReference ? <details className={styles.details}><summary className={styles.baselineSummary}><span>Baseline reference · {baselineReference.version}</span><CellChip tone="warn">Review before publishing</CellChip></summary><div className={styles.baseline}>{baselineNotes.website.length ? <><strong>Website facts</strong><ul>{baselineNotes.website.map((note, index) => <li key={index}>{note}</li>)}</ul></> : null}{baselineNotes.proposed.length ? <><strong>Proposed QC policy · editable</strong><ul>{baselineNotes.proposed.map((note, index) => <li key={index}>{note}</li>)}</ul></> : null}{baselineNotes.review.length ? <><strong>Items needing review</strong><ul>{baselineNotes.review.map((note, index) => <li key={index}>{note}</li>)}</ul></> : null}<div className={styles.row}>{baselineReference.source_urls.filter((url) => /^https?:\/\//i.test(url)).map((url, index) => <a key={url} href={url} target="_blank" rel="noopener noreferrer">Website reference {index + 1}</a>)}</div></div></details> : null}
          <FundingProgramCriteriaEditor rules={version.rules} requirements={version.requirements} onRules={(rules) => setVersion((current) => ({ ...current, rules }))} onRequirements={(requirements) => setVersion((current) => ({ ...current, requirements }))} /></section>
        <section className={styles.actions}>
          <Field label="Review note"><Textarea aria-label="Program review note" rows={2} maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Briefly explain what changed and why (at least 8 characters)." /></Field>
          {catalogError || contentError ? <Callout tone="warn">{catalogError || contentError}</Callout> : null}
          <p className={styles.muted}>{!reviewReady ? "Add a short review note to save or publish." : dirty ? "Save program details and your criteria draft before publishing. Publishing only uses the saved version." : savedVersion?.status === "draft" ? savedVersion.rules.fit ? "Your selected draft is saved. Publish when the criteria are ready." : "Add at least one approved eligibility check before publishing this draft." : "Program details save immediately. Criteria changes must be saved as a draft and then published."}</p>
          <div className={styles.actionRow}>
            <Btn onClick={() => void saveCatalog()} disabled={!reviewReady || !catalogDirty || Boolean(catalogError)}><Icon name="check" size={14} />{busy === "catalog" ? "Saving…" : "Save details & availability"}</Btn>
            <Btn onClick={() => void createVersion()} disabled={!reviewReady || Boolean(contentError)}><Icon name="plus" size={14} />{busy === "version" ? "Saving…" : "Save criteria as draft"}</Btn>
            {savedVersion?.status === "draft" ? <Btn variant="pri" onClick={() => void publishDraft()} disabled={!reviewReady || dirty || !savedVersion.rules.fit || Boolean(contentError)}>{busy === "publish" ? "Publishing…" : `Publish draft v${savedVersion.version}`}</Btn> : null}
            <Btn className={selected.status === "active" ? "danger" : undefined} onClick={() => void setRetired(selected.status === "active")} disabled={!reviewReady}>{selected.status === "active" ? "Retire program" : "Restore program"}</Btn>
          </div>
        </section>
      </> : <div className="empty">Select a funding program to get started.</div>}</fieldset>
    </div>
  </div>;
}
