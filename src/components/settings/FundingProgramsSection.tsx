"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Icon } from "@/components/design-system/Icon";
import { useConfirmAction } from "@/components/design-system/ConfirmationProvider";
import { Btn, Callout, CellChip, Field, Input, Select, Textarea, cx } from "@/components/ds";
import { api, ApiError } from "@/lib/api";
import type { FundingProgramCatalogItem, FundingProgramScope, FundingProgramVertical, FundingProgramVersion } from "@/lib/fundingPrograms";

const VERTICALS: Array<{ key: FundingProgramVertical; label: string }> = [
  { key: "real_estate", label: "Real Estate" },
  { key: "dealer", label: "Dealer" },
  { key: "main_street", label: "Main Street" },
  { key: "mca", label: "MCA intake" },
];

type CatalogDraft = { name: string; description: string; order: string; scopes: FundingProgramScope[]; reason: string };
type VersionDraft = { rules: string; requirements: string; reason: string };

function message(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : "Funding program settings could not be updated.";
}

function csv(value: string[]): string { return value.join(", "); }
function list(value: string): string[] { return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))]; }

function catalogDraft(program: FundingProgramCatalogItem): CatalogDraft {
  return {
    name: program.name,
    description: program.short_description || "",
    order: String(program.display_order),
    scopes: program.scopes.map((scope) => ({ ...scope, intake_variants: [...scope.intake_variants], intent_keys: [...scope.intent_keys], naics_prefixes: [...scope.naics_prefixes], industry_keys: [...scope.industry_keys], required_fact_keys: [...scope.required_fact_keys] })),
    reason: "",
  };
}

function versionDraft(version?: FundingProgramVersion | null): VersionDraft {
  return {
    rules: JSON.stringify(version?.rules || { priority: 0, fit: { all: [] } }, null, 2),
    requirements: JSON.stringify(version?.requirements || [], null, 2),
    reason: "",
  };
}

export function FundingProgramsSection() {
  const { getToken } = useAuth();
  const confirmAction = useConfirmAction();
  const [rows, setRows] = useState<FundingProgramCatalogItem[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [query, setQuery] = useState("");
  const [vertical, setVertical] = useState<FundingProgramVertical | "all">("all");
  const [catalog, setCatalog] = useState<CatalogDraft | null>(null);
  const [version, setVersion] = useState<VersionDraft>(() => versionDraft());
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<string | null>(null);

  const call = useCallback(async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await getToken();
    return api<T>(path, { ...init, authToken: token ?? undefined });
  }, [getToken]);

  const load = useCallback(async (preferredKey?: string) => {
    setBusy("load");
    setError(null);
    try {
      const next = await call<FundingProgramCatalogItem[]>("/admin/funding-programs");
      setRows(next);
      setSelectedKey((current) => preferredKey || current || next[0]?.program_key || "");
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy("");
    }
  }, [call]);

  useEffect(() => { void load(); }, [load]);
  const selected = rows.find((item) => item.program_key === selectedKey) || null;
  useEffect(() => {
    if (!selected) return;
    setCatalog(catalogDraft(selected));
    const latestDraft = selected.draft_versions[0] || null;
    setSelectedDraftId(latestDraft?.playbook_id || null);
    setSelectedVersionId(latestDraft?.playbook_id || selected.published_version?.playbook_id || "");
    setVersion(versionDraft(latestDraft || selected.published_version));
  }, [selected]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((item) => {
      if (vertical !== "all" && !item.scopes.some((scope) => scope.vertical === vertical && scope.is_active !== false)) return false;
      return !needle || [item.name, item.program_key, item.public_slug, ...item.aliases].join(" ").toLowerCase().includes(needle);
    });
  }, [query, rows, vertical]);

  function updateScope(index: number, patch: Partial<FundingProgramScope>) {
    setCatalog((current) => current ? { ...current, scopes: current.scopes.map((scope, scopeIndex) => scopeIndex === index ? { ...scope, ...patch } : scope) } : current);
  }

  function toggleVertical(next: FundingProgramVertical, enabled: boolean) {
    setCatalog((current) => {
      if (!current) return current;
      if (enabled) return current.scopes.some((scope) => scope.vertical === next)
        ? current
        : { ...current, scopes: [...current.scopes, { vertical: next, scope_key: "default", intake_variants: [], intent_keys: [], naics_prefixes: [], industry_keys: [], required_fact_keys: [] }] };
      return { ...current, scopes: current.scopes.filter((scope) => scope.vertical !== next) };
    });
  }

  async function saveCatalog() {
    if (!selected || !catalog || catalog.reason.trim().length < 8 || !catalog.scopes.length) return;
    const confirmed = await confirmAction({
      title: "Update catalog scope?",
      body: `This changes where ${selected.name} can appear before fit evaluation. Existing pinned decisions remain auditable. Reason: ${catalog.reason.trim()}`,
      confirmLabel: "Update program",
    });
    if (!confirmed) return;
    setBusy("catalog"); setError(null);
    try {
      const next = await call<FundingProgramCatalogItem[]>(`/admin/funding-programs/${selected.program_key}`, { method: "PATCH", body: JSON.stringify({ name: catalog.name.trim(), short_description: catalog.description.trim() || null, display_order: Number(catalog.order), scopes: catalog.scopes.map(({ id: _id, is_active: _active, ...scope }) => scope), reason: catalog.reason.trim(), confirmed: true }) });
      setRows(next);
      setCatalog(catalogDraft(next.find((item) => item.program_key === selected.program_key)!));
    } catch (reason) { setError(message(reason)); } finally { setBusy(""); }
  }

  async function createVersion() {
    if (!selected || version.reason.trim().length < 8) return;
    let rules: Record<string, unknown>;
    let requirements: Array<Record<string, unknown>>;
    try {
      rules = JSON.parse(version.rules) as Record<string, unknown>;
      requirements = JSON.parse(version.requirements) as Array<Record<string, unknown>>;
      if (!Array.isArray(requirements)) throw new Error("Requirements must be a JSON array.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Rules and requirements must be valid JSON.");
      return;
    }
    const confirmed = await confirmAction({ title: "Create a draft criteria version?", body: "The draft is not used for underwriting until a separate reviewed publish action.", confirmLabel: "Create draft" });
    if (!confirmed) return;
    setBusy("version"); setError(null);
    try {
      const next = await call<FundingProgramCatalogItem[]>(`/admin/funding-programs/${selected.program_key}/versions`, { method: "POST", body: JSON.stringify({ rules, requirements, reason: version.reason.trim(), confirmed: true }) });
      setRows(next);
      const updated = next.find((item) => item.program_key === selected.program_key)!;
      const draft = updated.draft_versions[0];
      setSelectedDraftId(draft?.playbook_id || null);
      setSelectedVersionId(draft?.playbook_id || "");
      setVersion(versionDraft(draft));
    } catch (reason) { setError(message(reason)); } finally { setBusy(""); }
  }

  async function publishDraft() {
    if (!selected || !selectedDraftId || version.reason.trim().length < 8) return;
    const confirmed = await confirmAction({ title: "Publish this underwriting version?", body: "New selections pin this version. Existing files keep their currently pinned version.", confirmLabel: "Publish version" });
    if (!confirmed) return;
    setBusy("publish"); setError(null);
    try {
      const next = await call<FundingProgramCatalogItem[]>(`/admin/funding-programs/${selected.program_key}/versions/${selectedDraftId}/publish`, { method: "POST", body: JSON.stringify({ reason: version.reason.trim(), confirmed: true }) });
      setRows(next);
    } catch (reason) { setError(message(reason)); } finally { setBusy(""); }
  }

  async function setRetired(retired: boolean) {
    if (!selected || !catalog || catalog.reason.trim().length < 8) return;
    const confirmed = await confirmAction({ title: `${retired ? "Retire" : "Restore"} ${selected.name}?`, body: retired ? "The product disappears from new catalog and fit results. Existing pinned files remain intact." : "The product returns to the catalog; it still requires published criteria to be eligible.", confirmLabel: retired ? "Retire program" : "Restore program", tone: retired ? "danger" : "default" });
    if (!confirmed) return;
    setBusy("retire"); setError(null);
    try {
      const next = await call<FundingProgramCatalogItem[]>(`/admin/funding-programs/${selected.program_key}/retire`, { method: "POST", body: JSON.stringify({ retired, reason: catalog.reason.trim(), confirmed: true }) });
      setRows(next);
    } catch (reason) { setError(message(reason)); } finally { setBusy(""); }
  }

  function chooseVersion(playbookId: string) {
    if (!selected) return;
    if (!playbookId) {
      setSelectedDraftId(null);
      setSelectedVersionId("");
      setVersion(versionDraft());
      return;
    }
    const draft = selected.draft_versions.find((item) => item.playbook_id === playbookId) || null;
    setSelectedDraftId(draft?.playbook_id || null);
    setSelectedVersionId(playbookId);
    setVersion(versionDraft(draft || selected.published_version));
  }

  return <div className="funding-program-settings">
    <header><div><h2>Funding programs</h2><p>Canonical products, hard scope, versioned criteria, and evidence requirements. Draft criteria never affect a file until published.</p></div><CellChip tone="acc">{rows.filter((item) => item.status === "active").length} active</CellChip></header>
    {error ? <Callout tone="bad">{error}</Callout> : null}
    <div className="funding-program-toolbar"><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search programs, keys, or aliases" /><Select value={vertical} onChange={(event) => setVertical(event.target.value as FundingProgramVertical | "all")}><option value="all">All verticals</option>{VERTICALS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</Select></div>
    <div className="funding-program-layout">
      <aside className="funding-program-list" aria-label="Funding program catalog">{filtered.map((item) => <button key={item.program_key} type="button" className={cx(selectedKey === item.program_key && "on")} onClick={() => setSelectedKey(item.program_key)}><span><strong>{item.name}</strong><small>{item.scopes.map((scope) => scope.vertical.replaceAll("_", " ")).filter((value, index, values) => values.indexOf(value) === index).join(" · ")}</small></span><CellChip tone={item.status === "retired" ? "mut" : item.published_version ? "ok" : "warn"}>{item.status === "retired" ? "Retired" : item.published_version ? `v${item.published_version.version}` : "No criteria"}</CellChip></button>)}{!filtered.length ? <div className="empty">No programs match these filters.</div> : null}</aside>
      <main className="funding-program-editor">{busy === "load" && !selected ? <div className="empty">Loading catalog...</div> : selected && catalog ? <>
        <section><div className="funding-program-section-head"><div><span className="lbl">Catalog</span><h3>{selected.name}</h3><p>{selected.program_key} · /{selected.public_slug}</p></div><CellChip tone={selected.status === "active" ? "ok" : "mut"}>{selected.status}</CellChip></div><div className="fldgrid two"><Field label="Public name"><Input value={catalog.name} onChange={(event) => setCatalog({ ...catalog, name: event.target.value })} /></Field><Field label="Display order"><Input inputMode="numeric" value={catalog.order} onChange={(event) => setCatalog({ ...catalog, order: event.target.value })} /></Field></div><Field label="Public description"><Textarea rows={3} value={catalog.description} onChange={(event) => setCatalog({ ...catalog, description: event.target.value })} /></Field></section>
        <section><div className="funding-program-section-head"><div><span className="lbl">Hard scope</span><h3>Where this product may appear</h3><p>Out-of-scope products are removed before fit evaluation.</p></div></div><div className="funding-program-verticals">{VERTICALS.map((item) => <label key={item.key}><input type="checkbox" checked={catalog.scopes.some((scope) => scope.vertical === item.key)} onChange={(event) => toggleVertical(item.key, event.target.checked)} />{item.label}</label>)}</div>{catalog.scopes.map((scope, index) => <div className="funding-program-scope" key={`${scope.vertical}:${scope.scope_key}:${index}`}><div><strong>{VERTICALS.find((item) => item.key === scope.vertical)?.label}</strong><Input value={scope.scope_key} onChange={(event) => updateScope(index, { scope_key: event.target.value })} aria-label="Scope key" /></div><Field label="Intake variants"><Input value={csv(scope.intake_variants)} onChange={(event) => updateScope(index, { intake_variants: list(event.target.value) })} placeholder="dealer_ai_intake" /></Field><Field label="Intent keys"><Input value={csv(scope.intent_keys)} onChange={(event) => updateScope(index, { intent_keys: list(event.target.value) })} /></Field><Field label="NAICS prefixes"><Input value={csv(scope.naics_prefixes)} onChange={(event) => updateScope(index, { naics_prefixes: list(event.target.value) })} /></Field><Field label="Industry keys"><Input value={csv(scope.industry_keys)} onChange={(event) => updateScope(index, { industry_keys: list(event.target.value) })} /></Field><Field label="Required facts"><Input value={csv(scope.required_fact_keys)} onChange={(event) => updateScope(index, { required_fact_keys: list(event.target.value) })} /></Field></div>)}</section>
        <section><div className="funding-program-section-head"><div><span className="lbl">Criteria versions</span><h3>Rules and evidence requirements</h3><p>Use the validated rules DSL. Publishing is a separate reviewed action.</p></div><Select value={selectedVersionId} onChange={(event) => chooseVersion(event.target.value)}><option value="">New draft</option>{selected.draft_versions.map((item) => <option key={item.playbook_id} value={item.playbook_id}>Draft v{item.version}</option>)}{selected.published_version ? <option value={selected.published_version.playbook_id}>Published v{selected.published_version.version}</option> : null}</Select></div><Field label="Validated fit rules JSON"><Textarea className="funding-program-json" rows={12} value={version.rules} onChange={(event) => setVersion({ ...version, rules: event.target.value })} /></Field><Field label="Evidence requirements JSON"><Textarea className="funding-program-json" rows={12} value={version.requirements} onChange={(event) => setVersion({ ...version, requirements: event.target.value })} /></Field></section>
        <section className="funding-program-actions"><Field label="Required review reason"><Textarea rows={2} value={catalog.reason || version.reason} onChange={(event) => { setCatalog({ ...catalog, reason: event.target.value }); setVersion({ ...version, reason: event.target.value }); }} placeholder="Explain the catalog, criteria, publish, or retirement decision" /></Field><div><Btn onClick={() => void saveCatalog()} disabled={Boolean(busy) || catalog.reason.trim().length < 8 || !catalog.scopes.length}><Icon name="check" size={14} />Save catalog and scope</Btn><Btn onClick={() => void createVersion()} disabled={Boolean(busy) || version.reason.trim().length < 8}><Icon name="plus" size={14} />Create draft version</Btn>{selectedDraftId ? <Btn variant="pri" onClick={() => void publishDraft()} disabled={Boolean(busy) || version.reason.trim().length < 8}>Publish selected draft</Btn> : null}<Btn className={selected.status === "active" ? "danger" : undefined} onClick={() => void setRetired(selected.status === "active")} disabled={Boolean(busy) || catalog.reason.trim().length < 8}>{selected.status === "active" ? "Retire" : "Restore"}</Btn></div></section>
      </> : <div className="empty">Select a program to manage its scope and criteria.</div>}</main>
    </div>
  </div>;
}
