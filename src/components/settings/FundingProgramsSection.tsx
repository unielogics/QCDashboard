"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Icon } from "@/components/design-system/Icon";
import { useConfirmAction } from "@/components/design-system/ConfirmationProvider";
import { Btn, Callout, CellChip, Input, Select, Textarea, cx } from "@/components/ds";
import { ProgramValidationContext, SectionAttention, ValidatedField as Field, ValidationSummary, ValidationTarget } from "./FundingProgramValidation";
import { catalogValidationIssues, criteriaValidationIssues, currentProgramDraft, describeValidationIssue, publishValidationIssues, requirementsEquivalentForRecovery, serverValidationIssues, type ProgramValidationAction, type ProgramValidationIssue } from "./fundingProgramValidationModel";
import { api, ApiError } from "@/lib/api";
import type { FundingProgramBaseline, FundingProgramCatalogItem, FundingProgramScope, FundingProgramVertical, FundingProgramVersion } from "@/lib/fundingPrograms";
import { FundingProgramCriteriaEditor } from "./FundingProgramCriteriaEditor";
import { FundingProgramScopeEditor } from "./FundingProgramScopeEditor";
import { FundingProgramEffectSummary } from "./FundingProgramEffectSummary";
import { FundingProgramLogicWarnings } from "./FundingProgramLogicWarnings";
import { programLogicWarnings, type ProgramLogicAction } from "./fundingProgramConsistencyModel";
import { fundingProgramStatusBadges, programSaveEffect, summarizeProgramEffects } from "./fundingProgramSummaryModel";
import { applySharedIndustryExclusions, baselineNoteGroups, baselineReferenceFromRules, industryPrefixes, jsonEquivalent, sharedIndustryExclusions, validateEditorContent } from "./fundingProgramEditorModel";
import styles from "./FundingProgramEditor.module.css";
import summaryStyles from "./FundingProgramSummary.module.css";

const VERTICALS: Array<{ key: FundingProgramVertical; label: string }> = [
  { key: "dealer", label: "Auto dealerships" },
  { key: "main_street", label: "Main Street businesses" },
  { key: "real_estate", label: "Real estate" },
  { key: "mca", label: "MCA refinance" },
];
function workspaceNames(program: FundingProgramCatalogItem): string {
  return [...new Set(program.scopes.filter((scope) => scope.is_active !== false).map((scope) => VERTICALS.find((row) => row.key === scope.vertical)?.label || scope.vertical))].join(" · ");
}
type CatalogDraft = { name: string; description: string; order: string; scopes: FundingProgramScope[] };
type VersionDraft = { rules: string; requirements: string };
function message(error: unknown): string { return error instanceof ApiError || error instanceof Error ? error.message : "Funding program settings could not be updated."; }
function copyScope(scope: FundingProgramScope): FundingProgramScope { return { ...scope, scope_key: scope.scope_key || "default", intake_variants: [...(scope.intake_variants ?? [])], intent_keys: [...(scope.intent_keys ?? [])], naics_prefixes: [...(scope.naics_prefixes ?? [])], excluded_naics_prefixes: [...(scope.excluded_naics_prefixes ?? [])], industry_keys: [...(scope.industry_keys ?? [])], required_fact_keys: [...(scope.required_fact_keys ?? [])] }; }
function catalogDraft(program: FundingProgramCatalogItem): CatalogDraft {
  return { name: program.name, description: program.short_description || "", order: String(program.display_order), scopes: program.scopes.filter((scope) => scope.is_active !== false).map(copyScope) };
}
function versionDraft(version?: FundingProgramVersion | null): VersionDraft {
  return { rules: JSON.stringify(version?.rules || {}, null, 2), requirements: JSON.stringify(version?.requirements || [], null, 2) };
}
function comparableCatalog(draft: CatalogDraft) {
  const references = (values: string[]) => [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))].sort();
  const codes = (values: string[]) => [...new Set(values.flatMap(industryPrefixes))].sort();
  const scopes = draft.scopes.map((scope) => ({
    vertical: scope.vertical, scope_key: scope.scope_key.trim(),
    intake_variants: references(scope.intake_variants), intent_keys: references(scope.intent_keys),
    industry_keys: references(scope.industry_keys), required_fact_keys: references(scope.required_fact_keys),
    naics_prefixes: codes(scope.naics_prefixes), excluded_naics_prefixes: codes(scope.excluded_naics_prefixes ?? []),
  })).sort((a, b) => `${a.vertical}:${a.scope_key}`.localeCompare(`${b.vertical}:${b.scope_key}`));
  return { name: draft.name.trim(), description: draft.description.trim(), order: Number(draft.order), scopes };
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
  const [validationAction, setValidationAction] = useState<ProgramValidationAction | null>(null);
  const [requestedRoute, setRequestedRoute] = useState<{ index: number; sequence: number } | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const saveInFlight = useRef(false);
  const [saveUncertain, setSaveUncertain] = useState(false);
  const uncertainEnable = useRef(false);
  const [serverValidation, setServerValidation] = useState<{ fingerprint: string; issues: ProgramValidationIssue[] } | null>(null);
  const pendingFocus = useRef<ProgramValidationIssue | null>(null);

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
    const current = currentProgramDraft(selected) || selected.published_version;
    setSelectedVersionId(current?.playbook_id || ""); setVersion(versionDraft(current)); setReason(""); setSuccess(""); setError(null); setSuggestedBaseline(null); setValidationAction(null); setServerValidation(null);
  }, [selected]);

  const savedVersion = selected?.draft_versions.find((item) => item.playbook_id === selectedVersionId)
    || (selected?.published_version?.playbook_id === selectedVersionId ? selected.published_version : null);
  const baseline = versionDraft(savedVersion);
  const criteriaDirty = !jsonEquivalent(version.rules, baseline.rules) || !jsonEquivalent(version.requirements, baseline.requirements);
  const catalogDirty = Boolean(selected && catalog && !jsonEquivalent(JSON.stringify(catalog), JSON.stringify(catalogDraft(selected))));
  const dirty = criteriaDirty || catalogDirty;
  const effectSummary = useMemo(() => summarizeProgramEffects(catalog?.scopes || [], version.rules, version.requirements), [catalog?.scopes, version.rules, version.requirements]);
  const logicWarnings = useMemo(() => programLogicWarnings({ programKey: selectedKey, rulesText: version.rules, requirementsText: version.requirements, scopes: catalog?.scopes || [], catalog: rows }), [selectedKey, version.rules, version.requirements, catalog?.scopes, rows]);
  const publishedHasFit = Boolean(selected?.published_version?.rules.fit);
  const criteriaIssues = criteriaValidationIssues(version.rules, version.requirements);
  const catalogIssues = catalog ? catalogValidationIssues(catalog) : [];
  const publicationIssues = publishValidationIssues({ rules: version.rules });
  const publicationInProgress = selected?.status === "active" && (!publishedHasFit || savedVersion?.status === "draft" || criteriaDirty);
  const reviewIssues: ProgramValidationIssue[] = reason.length > 2000 ? [{ target: "Program review note", message: "Keep the optional review note within 2,000 characters.", area: "review" }] : [];
  const fingerprint = JSON.stringify({ selectedKey, catalog, version, reason });
  const fingerprintRef = useRef(fingerprint);
  fingerprintRef.current = fingerprint;
  const visibleIssues = [...catalogIssues, ...criteriaIssues, ...reviewIssues, ...(validationAction === "publish" || publicationInProgress ? publicationIssues : []), ...(serverValidation?.fingerprint === fingerprint ? serverValidation.issues : [])]
    .filter((issue, index, issues) => issues.findIndex((other) => other.target === issue.target && other.message === issue.message) === index)
    .map((issue) => describeValidationIssue(issue, version.requirements));
  const issueTargets = visibleIssues.map((issue) => issue.target).join("|");
  useEffect(() => {
    const targets = new Set(issueTargets.split("|"));
    editorRef.current?.querySelectorAll<HTMLElement>("[data-guided-focus]").forEach((element) => {
      if (!targets.has(element.dataset.validationTarget || "")) delete element.dataset.guidedFocus;
    });
  }, [issueTargets]);
  function actionIssues(action: ProgramValidationAction): ProgramValidationIssue[] {
    return [...(action === "status" ? [] : [...catalogIssues, ...criteriaIssues]), ...reviewIssues, ...(action === "publish" ? publicationIssues : [])];
  }
  const focusIssue = useCallback((issue: ProgramValidationIssue) => {
    if (issue.routeIndex !== undefined) setRequestedRoute((current) => ({ index: issue.routeIndex!, sequence: (current?.sequence ?? 0) + 1 }));
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const target = Array.from(editorRef.current?.querySelectorAll<HTMLElement>("[data-validation-target]") ?? []).find((element) => element.dataset.validationTarget === issue.target);
      if (!target) return;
      for (let parent = target.parentElement; parent; parent = parent.parentElement) if (parent instanceof HTMLDetailsElement) parent.open = true;
      if (target instanceof HTMLDetailsElement) target.open = true;
      const nestedSection = target.querySelector("details");
      if (nestedSection) nestedSection.open = true;
      editorRef.current?.querySelectorAll<HTMLElement>("[data-guided-focus]").forEach((element) => delete element.dataset.guidedFocus);
      target.dataset.guidedFocus = "true";
      const control = target.matches("button,input,select,textarea,[tabindex]") ? target : target.querySelector<HTMLElement>("input:not(:disabled),select:not(:disabled),textarea:not(:disabled),button:not(:disabled),[tabindex]") || target;
      control.focus({ preventScroll: true });
      control.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    }));
  }, []);
  useEffect(() => {
    if (!busy && pendingFocus.current) { const issue = pendingFocus.current; pendingFocus.current = null; focusIssue(issue); }
  }, [busy, serverValidation, selectedKey, version.rules, version.requirements, focusIssue]);
  function checkAction(action: ProgramValidationAction): boolean {
    setSuccess(""); setError(null); setServerValidation(null);
    setValidationAction(action);
    const issues = actionIssues(action);
    if (issues.length) { focusIssue(issues[0]); return false; }
    return true;
  }
  useEffect(() => { if (!dirty) return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((item) => (vertical === "all" || item.scopes.some((scope) => scope.vertical === vertical && scope.is_active !== false)) && (!needle || [item.name, item.program_key, item.public_slug, ...item.aliases].join(" ").toLowerCase().includes(needle)));
  }, [query, rows, vertical]);

  async function chooseProgram(key: string, focusTarget?: string) {
    if (busy || saveUncertain || key === selectedKey) return;
    if (dirty && !await confirmAction({ title: "Discard unsaved program changes?", body: "The changes on this screen have not been saved. Switching programs will discard them.", confirmLabel: "Discard and switch" })) return;
    if (focusTarget) pendingFocus.current = { target: focusTarget, message: "", area: "criteria" };
    setSelectedKey(key);
  }
  async function chooseVersion(playbookId: string) {
    if (!selected || busy) return;
    if (criteriaDirty && !await confirmAction({ title: "Discard unsaved criteria changes?", body: "The current eligibility checks and document edits have not been saved.", confirmLabel: "Discard and switch" })) return;
    const next = selected.draft_versions.find((item) => item.playbook_id === playbookId) || (selected.published_version?.playbook_id === playbookId ? selected.published_version : null);
    setSelectedVersionId(playbookId); setVersion(versionDraft(next)); setSuccess(""); setError(null); setSuggestedBaseline(null); setValidationAction(null); setServerValidation(null);
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
  async function reconcileSavedState(enable: boolean) {
    if (!selected || !catalog) throw new Error("Select a program before verifying its saved state.");
    const next = await call<FundingProgramCatalogItem[]>("/admin/funding-programs");
    const updated = next.find((item) => item.program_key === selected.program_key);
    if (!updated) throw new Error("The program was not found. Contact an administrator before retrying.");
    setRows(next);
    const catalogMatches = jsonEquivalent(JSON.stringify(comparableCatalog(catalog)), JSON.stringify(comparableCatalog(catalogDraft(updated))));
    if (catalogMatches) setCatalog(catalogDraft(updated));
    const candidates = [updated.published_version, ...[...updated.draft_versions].sort((a, b) => b.version - a.version)];
    const match = candidates.find((item) => item && jsonEquivalent(version.rules, JSON.stringify(item.rules)) && requirementsEquivalentForRecovery(version.requirements, JSON.stringify(item.requirements)));
    if (match) { setSelectedVersionId(match.playbook_id); setVersion(versionDraft(match)); }
    const complete = catalogMatches && Boolean(match) && (!enable || (match?.status === "published" && updated.status === "active"));
    return { complete, match };
  }
  async function verifySavedState() {
    if (busy || saveInFlight.current) return;
    setBusy("verify");
    try {
      const recovered = await reconcileSavedState(uncertainEnable.current);
      setSaveUncertain(false); setError(null);
      setSuccess(recovered.complete ? "Saved state verified. Your changes are saved; no duplicate version was created." : "Saved state verified. Remaining edits are preserved. You can safely continue saving.");
    } catch { setError("The saved state could not be verified. Saving is paused to avoid duplicate versions. Your edits are preserved; try Verify saved state when the connection returns."); }
    finally { setBusy(""); }
  }
  async function saveProgram(enable: boolean) {
    if (!selected || !catalog || busy || saveUncertain || saveInFlight.current || !checkAction(enable ? "publish" : "save")) return;
    saveInFlight.current = true;
    let completed = "";
    let step = "save program details";
    try {
      if (!dirty && savedVersion && (!enable || (savedVersion.status === "published" && selected.status === "active"))) {
        setSuccess(savedVersion.status === "draft" ? `All changes are saved in draft v${savedVersion.version}. Choose Save & enable to make these criteria live.` : "All changes are saved. Published criteria are already live.");
        return;
      }
      const olderDraftWarning = savedVersion?.status === "draft" && selected.published_version && savedVersion.version < selected.published_version.version && !criteriaDirty ? ` You selected older draft v${savedVersion.version}. Publishing it will replace live v${selected.published_version.version} with these older criteria.` : "";
      if (enable && !await confirmAction({ title: `Save and enable ${catalog.name}?`, body: <div className={summaryStyles.confirmation}><p>{programSaveEffect("enable", selected.status === "retired")}</p>{olderDraftWarning ? <Callout tone="warn">{olderDraftWarning.trim()}</Callout> : null}<FundingProgramLogicWarnings warnings={logicWarnings} /><FundingProgramEffectSummary title="Review what becomes live" effects={effectSummary} expanded /></div>, confirmLabel: "Save & enable" })) return;
      setBusy(enable ? "enable" : "save"); setError(null); setSuccess("");
      const path = `/admin/funding-programs/${selected.program_key}`;
      if (catalogDirty) {
        const next = await call<FundingProgramCatalogItem[]>(path, { method: "PATCH", body: JSON.stringify({ name: catalog.name.trim(), short_description: catalog.description.trim() || null, display_order: Number(catalog.order), scopes: catalog.scopes.map(({ id: _id, is_active: _active, ...scope }) => scope), reason: reason.trim(), confirmed: true }) });
        setRows(next); const updated = next.find((item) => item.program_key === selected.program_key);
        if (!updated) throw new Error("The server did not return the updated program. Refresh to check its saved state.");
        setCatalog(catalogDraft(updated)); completed = "Program details and availability were saved. ";
      }
      let candidate = savedVersion;
      if (criteriaDirty || !candidate) {
        step = "save the eligibility checks and document instructions";
        const next = await call<FundingProgramCatalogItem[]>(`${path}/versions`, { method: "POST", body: JSON.stringify({ rules: JSON.parse(version.rules), requirements: JSON.parse(version.requirements), reason: reason.trim(), confirmed: true }) });
        setRows(next); candidate = next.find((item) => item.program_key === selected.program_key)?.draft_versions[0] ?? null;
        if (!candidate) throw new Error("The server did not return the saved draft. Refresh before creating another version.");
        setSelectedVersionId(candidate.playbook_id); setVersion(versionDraft(candidate));
        completed += `Draft v${candidate.version} was saved. `;
      }
      if (enable && candidate.status === "draft") {
        step = "enable the saved criteria";
        const next = await call<FundingProgramCatalogItem[]>(`${path}/versions/${candidate.playbook_id}/publish`, { method: "POST", body: JSON.stringify({ reason: reason.trim(), confirmed: true }) });
        setRows(next); const published = next.find((item) => item.program_key === selected.program_key)?.published_version;
        if (!published) throw new Error("The server did not return the published version. Refresh to check its live state.");
        candidate = published; setSelectedVersionId(candidate.playbook_id); setVersion(versionDraft(candidate));
        completed += `Criteria v${candidate.version} were published. `;
      }
      if (enable && selected.status === "retired") {
        step = "restore the program to the catalog";
        setRows(await call<FundingProgramCatalogItem[]>(`${path}/retire`, { method: "POST", body: JSON.stringify({ retired: false, reason: reason.trim(), confirmed: true }) }));
      }
      setValidationAction(null); setSuggestedBaseline(null);
      setSuccess(enable ? `Program enabled. Criteria v${candidate.version} are live for new selections.` : candidate.status === "draft" ? `All changes saved. Draft v${candidate.version} is ready for review. Choose Save & enable when you want these criteria live.` : `All changes saved. Published criteria v${candidate.version} remain live.`);
    } catch (cause) {
      if (!(cause instanceof ApiError) || cause.status >= 500 || cause.status === 409) {
        try {
          const recovered = await reconcileSavedState(enable);
          if (recovered.complete) {
            setError(null); setValidationAction(null);
            setSuccess(enable ? `Program enabled. Criteria v${recovered.match?.version} are live; the saved state was verified after an interrupted response.` : "All changes saved. The saved state was verified after an interrupted response; no duplicate draft was created.");
            return;
          }
        } catch {
          setSaveUncertain(true); uncertainEnable.current = enable;
          setError("The save response was interrupted and the saved state could not be verified. Saving is paused to avoid duplicate versions. Your edits are preserved.");
          return;
        }
      }
      const issues = cause instanceof ApiError ? serverValidationIssues(cause.body, catalog.scopes) : [];
      if (issues.length) { setServerValidation({ fingerprint: fingerprintRef.current, issues }); pendingFocus.current = issues[0]; }
      setError(`${completed}Could not ${step}. ${issues.length ? "The fields needing attention are highlighted below. Your remaining edits are still on this screen." : message(cause)}`);
    } finally { setBusy(""); saveInFlight.current = false; }
  }
  async function setRetired(retired: boolean) {
    if (!selected || busy || !checkAction("status")) return;
    if (!await confirmAction({ title: `${retired ? "Retire" : "Restore"} ${selected.name}?`, body: retired ? "The program will be unavailable for new selections. Existing files retain their program history." : "The program returns to the catalog. Published eligibility checks are needed for fit recommendations.", confirmLabel: retired ? "Retire program" : "Restore program", tone: retired ? "danger" : "default" })) return;
    setBusy("retire"); setError(null); setSuccess("");
    try { setRows(await call<FundingProgramCatalogItem[]>(`/admin/funding-programs/${selected.program_key}/retire`, { method: "POST", body: JSON.stringify({ retired, reason: reason.trim(), confirmed: true }) })); setSuccess(retired ? "Program retired." : "Program restored."); }
    catch (cause) { setError(message(cause)); } finally { setBusy(""); }
  }

  const baselineReference = suggestedBaseline ?? baselineReferenceFromRules(version.rules);
  function selectLogicAction(action: ProgramLogicAction) {
    if (action.programKey && action.programKey !== selectedKey) { void chooseProgram(action.programKey, action.target); return; }
    focusIssue({ target: action.target, message: "", area: "criteria" });
  }
  const baselineNotes = baselineNoteGroups(baselineReference?.source_notes ?? []);
  const actionGuidance = `${programSaveEffect("save", selected?.status === "retired")} Choose Save & enable to publish changed criteria. A review note is optional.`;
  const sectionClass = (section: ProgramValidationIssue["section"]) => visibleIssues.some((issue) => issue.section === section) ? styles.sectionInvalid : undefined;
  return <ProgramValidationContext.Provider value={visibleIssues}><div ref={editorRef} className={cx("funding-program-settings", styles.root)}>
    <header><div><h2>Funding programs</h2><p>Choose a program, set its eligibility checks, and define the documents your team needs.</p></div><CellChip tone="acc">{rows.filter((item) => item.status === "active").length} active</CellChip></header>
    {error ? <Callout tone="bad">{error}</Callout> : null}
    {saveUncertain ? <Btn disabled={Boolean(busy)} onClick={() => void verifySavedState()}>{busy === "verify" ? "Verifying…" : "Verify saved state"}</Btn> : null}
    {success ? <><div role="status"><Callout tone="ok">{success}</Callout></div>{!dirty && !saveUncertain && !error && selected && savedVersion ? <FundingProgramEffectSummary title={`Saved criteria v${savedVersion.version} · ${savedVersion.status === "published" ? selected.status === "retired" ? "published, program retired" : "published" : "draft, not live"}`} effects={summarizeProgramEffects(selected.scopes, JSON.stringify(savedVersion.rules), JSON.stringify(savedVersion.requirements))} note={savedVersion.status === "draft" ? `This saved draft has not replaced ${selected.published_version?.rules.fit ? `published v${selected.published_version.version}` : "the live criteria"}. Program details and availability are saved separately and may already affect the active catalog.` : selected.status === "retired" ? "This version is saved, but the program is retired from new selections." : "These are the saved rules and document instructions used for new program selections."} /> : null}</> : null}
    {selected && catalog ? <ValidationSummary issues={visibleIssues} onSelect={focusIssue} /> : null}
    <div className="funding-program-toolbar"><Input aria-label="Search funding programs" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search funding programs" /><Select aria-label="Filter programs by workspace" value={vertical} onChange={(event) => setVertical(event.target.value as FundingProgramVertical | "all")}><option value="all">All workspaces</option>{VERTICALS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</Select></div>
    <div className="funding-program-layout">
      <aside className="funding-program-list" aria-label="Funding programs">{filtered.map((item) => <button key={item.program_key} type="button" disabled={Boolean(busy)} aria-pressed={selectedKey === item.program_key} className={cx(selectedKey === item.program_key && "on")} onClick={() => void chooseProgram(item.program_key)}><span><strong>{item.name}</strong><small>{workspaceNames(item)}</small></span><span className={summaryStyles.sidebarBadges}>{fundingProgramStatusBadges(item, selectedKey === item.program_key && dirty).map((badge) => <CellChip key={badge.label} tone={badge.tone}>{badge.label}</CellChip>)}</span></button>)}{!filtered.length ? <div className="empty">{busy === "load" ? "Loading programs…" : "No programs match these filters."}</div> : null}</aside>
      <fieldset className="funding-program-editor" disabled={Boolean(busy) || saveUncertain} aria-label="Edit funding program">{selected && catalog ? <>
        <div className={styles.workspaceActions}><div><div className={summaryStyles.badges}>{fundingProgramStatusBadges(selected, dirty).map((badge) => <CellChip key={badge.label} tone={badge.tone}>{badge.label}</CellChip>)}</div><p>{dirty ? "Save changes keeps changed criteria in draft. Save & enable makes them live." : savedVersion?.status === "draft" ? "Review the saved draft, then enable when ready." : "Changes to published criteria are saved in a new version."}</p></div><div className={styles.actionRow}><Btn onClick={() => void saveProgram(false)}>{busy === "save" ? "Saving…" : "Save changes"}</Btn><Btn variant="pri" onClick={() => void saveProgram(true)}>{busy === "enable" ? "Enabling…" : "Save & enable"}</Btn></div></div>
        <FundingProgramEffectSummary title="What these settings do" effects={effectSummary} note={actionGuidance} />
        <FundingProgramLogicWarnings warnings={logicWarnings} onSelect={selectLogicAction} />
        <section className={sectionClass("details")}><div className="funding-program-section-head"><div><span className="lbl">1 · Program details</span><h3>{selected.name}</h3><SectionAttention section="details" onSelect={focusIssue} /></div><CellChip tone={selected.status === "active" ? "ok" : "mut"}>{selected.status === "active" ? "Catalog active" : "Retired"}</CellChip></div>
          <div className={styles.status}><Icon name="spark" size={18} /><div><strong>{selected.status === "retired" ? "Retired from new selections" : publishedHasFit ? `Published v${selected.published_version?.version} · eligibility checks in use` : "Criteria are not live yet"}</strong><p>{selected.status === "retired" ? "Existing selections remain available in file history. Save & enable restores this program with the criteria shown." : publishedHasFit ? "Program matching applies the published eligibility checks. Document instructions guide AI review. Existing files retain their selected version." : "Review eligibility checks and each document’s instructions below, then choose Save & enable. Saving alone keeps a draft; it does not make new criteria live."}</p></div></div>
          <div className="fldgrid two"><Field label="Program name"><Input aria-label="Program name" value={catalog.name} maxLength={160} onChange={(event) => setCatalog({ ...catalog, name: event.target.value })} /></Field><Field label="Display order"><Input aria-label="Display order" type="number" min={0} max={10000} value={catalog.order} onChange={(event) => setCatalog({ ...catalog, order: event.target.value })} /></Field></div><Field label="Short description"><Textarea aria-label="Short description" rows={2} maxLength={1000} value={catalog.description} onChange={(event) => setCatalog({ ...catalog, description: event.target.value })} placeholder="Describe the program in plain language. Eligibility is configured below." /></Field>
        </section>
        <section className={sectionClass("availability")}><div className="funding-program-section-head"><div><span className="lbl">2 · Availability</span><h3>Which businesses can see this program?</h3><p>Choose the workspaces, then add any prohibited industries. Specialized routing is optional.</p><SectionAttention section="availability" onSelect={focusIssue} /></div></div><ValidationTarget target="Program workspaces"><div className="funding-program-verticals">{VERTICALS.map((item) => <label key={item.key}><input type="checkbox" checked={catalog.scopes.some((scope) => scope.vertical === item.key)} onChange={(event) => toggleVertical(item.key, event.target.checked)} />{item.label}</label>)}</div></ValidationTarget><FundingProgramScopeEditor key={selected.program_key} scopes={catalog.scopes} requestedRoute={requestedRoute} onScopeChange={updateScope} onExclusionsChange={(codes) => setCatalog((current) => current ? { ...current, scopes: applySharedIndustryExclusions(current.scopes, codes) } : current)} call={call} /></section>
        <section className={sectionClass("criteria")}><div className="funding-program-section-head"><div><span className="lbl">3 · Eligibility and documents</span><h3>What does the client need to qualify?</h3><p>{criteriaDirty ? "Unsaved changes · use Save changes or Save & enable above." : savedVersion?.status === "draft" ? `Saved draft v${savedVersion.version} · not enabled yet` : savedVersion?.status === "published" ? `Viewing published v${savedVersion.version} · edits create a new draft` : "New criteria · not saved"}</p><SectionAttention section="criteria" onSelect={focusIssue} /></div><Select aria-label="Criteria version" value={selectedVersionId} onChange={(event) => void chooseVersion(event.target.value)}><option value="">Start with blank criteria</option>{selected.draft_versions.map((item) => <option key={item.playbook_id} value={item.playbook_id}>{selected.published_version && item.version < selected.published_version.version ? "Older draft" : "Draft"} v{item.version}</option>)}{selected.published_version ? <option value={selected.published_version.playbook_id}>Published v{selected.published_version.version}</option> : null}</Select></div>
          <div className={styles.row}><Btn onClick={() => void loadSuggestedBaseline()}><Icon name="spark" size={15} />{busy === "baseline" ? "Loading suggestion…" : "Load suggested baseline"}</Btn><span className={styles.muted}>Editable starting point from website references and proposed QC policy. Never published automatically.</span></div>
          {selected.program_key === "sba_express" ? <p className={styles.muted}>SBA Express has a published maximum of $500,000. A $350,000 maximum would be a stricter QC policy, not the SBA program limit. Set only the approved limit you want to enforce; this guidance does not change your checks. <a href="https://www.sba.gov/sba-lenders/" target="_blank" rel="noopener noreferrer">Review SBA terms</a>.</p> : null}
          {baselineReference ? <details className={styles.details}><summary className={styles.baselineSummary}><span>Baseline reference · {baselineReference.version}</span><CellChip tone="warn">Review before publishing</CellChip></summary><div className={styles.baseline}>{baselineNotes.website.length ? <><strong>Website facts</strong><ul>{baselineNotes.website.map((note, index) => <li key={index}>{note}</li>)}</ul></> : null}{baselineNotes.proposed.length ? <><strong>Proposed QC policy · editable</strong><ul>{baselineNotes.proposed.map((note, index) => <li key={index}>{note}</li>)}</ul></> : null}{baselineNotes.review.length ? <><strong>Items needing review</strong><ul>{baselineNotes.review.map((note, index) => <li key={index}>{note}</li>)}</ul></> : null}<div className={styles.row}>{baselineReference.source_urls.filter((url) => /^https?:\/\//i.test(url)).map((url, index) => <a key={url} href={url} target="_blank" rel="noopener noreferrer">Website reference {index + 1}</a>)}</div></div></details> : null}
          <FundingProgramCriteriaEditor rules={version.rules} requirements={version.requirements} onRules={(rules) => setVersion((current) => ({ ...current, rules }))} onRequirements={(requirements) => setVersion((current) => ({ ...current, requirements }))} /></section>
        <section className={cx(styles.actions, sectionClass("review"))}>
          <SectionAttention section="review" onSelect={focusIssue} />
          <Field label="Review note (optional)"><Textarea aria-label="Program review note" rows={2} maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Optional context for the audit history." /></Field>
          <p className={styles.muted}>{actionGuidance}</p>
          <div className={styles.actionRow}>
            <Btn className={selected.status === "active" ? "danger" : undefined} onClick={() => void setRetired(selected.status === "active")}>{selected.status === "active" ? "Retire program" : "Restore program"}</Btn>
          </div>
          <p id="program-action-help" className={styles.muted}>If an action needs more information, select it to jump to the first item that needs attention. No changes are submitted until all its checks pass.</p>
        </section>
      </> : <div className="empty">Select a funding program to get started.</div>}</fieldset>
    </div>
  </div></ProgramValidationContext.Provider>;
}
