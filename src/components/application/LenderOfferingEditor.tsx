"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Btn, Callout, Field, Input, Row, Select, Sub, Textarea } from "@/components/ds";
import { useAuthedApi, useCurrentUser } from "@/hooks/useApi";
import { LENDER_PRODUCT_LABEL } from "@/lib/lenderProducts";
import type { OfferingRequirement } from "@/lib/submissionBatches";

interface Requirement extends OfferingRequirement {
  canonical_key?: string;
  visibility: "client" | "internal";
  collection_config: Record<string, unknown>;
}
interface Offering {
  id: string;
  program_key: string;
  version: number;
  status: string;
  source_reference: string | null;
  checklist_confirmed: boolean;
  official_forms_required: boolean;
  official_form_file_ids: string[];
  fit_rules: object;
  requirements: Requirement[];
}

export function LenderOfferingEditor({ lenderId }: { lenderId: string }) {
  const api = useAuthedApi();
  const { data: user } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [program, setProgram] = useState("*");
  const [source, setSource] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [formsRequired, setFormsRequired] = useState(false);
  const [formIds, setFormIds] = useState("");
  const [rules, setRules] = useState("{}");
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [configurationErrors, setConfigurationErrors] = useState<Record<number, boolean>>({});
  const versions = useQuery({ queryKey: ["lender-offerings", lenderId], queryFn: () => api<Offering[]>(`/lenders/${lenderId}/offerings`), enabled: open && user?.role === "super_admin" });
  const catalog = useQuery({ queryKey: ["lender-offering-program-catalog"], queryFn: () => api<{ program_key: string; name: string }[]>("/admin/funding-programs"), enabled: open && user?.role === "super_admin" });
  if (user?.role !== "super_admin") return null;
  const change = (index: number, updates: Partial<Requirement>) => setRequirements((old) => old.map((item, position) => position === index ? { ...item, ...updates } : item));
  const load = (value: Offering) => {
    setProgram(value.program_key); setSource(value.source_reference ?? ""); setConfirmed(value.checklist_confirmed);
    setFormsRequired(value.official_forms_required); setFormIds(value.official_form_file_ids.join(", "));
    setRequirements(value.requirements); setRules(JSON.stringify(value.fit_rules, null, 2)); setMessage(""); setError("");
    setConfigurationErrors({});
  };
  const save = async () => {
    setBusy(true); setError(""); setMessage("");
    try {
      const fitRules = JSON.parse(rules);
      const result = await api<Offering>(`/lenders/${lenderId}/offerings`, { method: "POST", body: JSON.stringify({ program_key: program, checklist_confirmed: confirmed, source_reference: source || null, official_forms_required: formsRequired, official_form_file_ids: formIds.split(/[,\s]+/).filter(Boolean), fit_rules: fitRules, requirements }) });
      await versions.refetch(); setMessage(`Saved checklist version ${result.version}. Existing prepared packages retain their original version and must be prepared again before sending.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Checklist could not be saved"); }
    finally { setBusy(false); }
  };
  return <section style={{ borderTop: "1px solid var(--line)", marginTop: 16, paddingTop: 16 }}>
    <Btn onClick={() => setOpen(!open)}>{open ? "Close" : "Configure"} lender requirements and forms</Btn>
    {open ? <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
      <Sub>Confirm requirements from the institution’s checklist. Saving creates a version; AI collects confirmed items and keeps unconfirmed proposals internal.</Sub>
      {error || versions.error ? <Callout tone="bad">{error || (versions.error as Error)?.message}</Callout> : null}
      {message ? <Callout tone="ok">{message}</Callout> : null}
      {(versions.data?.length ?? 0) > 0 ? <Field label="Start from a saved version"><Select defaultValue="" onChange={(event) => { const version = versions.data?.find((item) => item.id === event.target.value); if (version) load(version); }}><option value="">Select a version</option>{versions.data?.map((item) => <option value={item.id} key={item.id}>{LENDER_PRODUCT_LABEL.get(item.program_key) ?? item.program_key} · v{item.version} · {item.status}</option>)}</Select></Field> : null}
      <Field label="Product"><Select value={program} onChange={(event) => setProgram(event.target.value)}><option value="*">All applicable selected products</option>{catalog.data?.map((item) => <option value={item.program_key} key={item.program_key}>{item.name}</option>)}{program !== "*" && !catalog.data?.some((item) => item.program_key === program) ? <option value={program}>{LENDER_PRODUCT_LABEL.get(program) ?? program}</option> : null}</Select></Field>
      <Field label="Checklist source or written confirmation"><Input value={source} onChange={(event) => setSource(event.target.value)} placeholder="Document reference or institution confirmation" /></Field>
      <label><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> The institution’s current checklist is confirmed.</label>
      {requirements.map((requirement, index) => <fieldset key={index} style={{ border: "1px solid var(--line)", padding: 12 }}>
        <legend>Requirement {index + 1}</legend>
        <Field label="Request label"><Input value={requirement.label} onChange={(event) => change(index, { label: event.target.value })} /></Field>
        <Field label="Shared requirement key" hint="Use the same key for the same item across institutions, for example annual_revenue."><Input value={requirement.requirement_key} onChange={(event) => change(index, { requirement_key: event.target.value })} /></Field>
        <Row><Field label="Action"><Select value={requirement.requirement_kind} onChange={(event) => change(index, { requirement_kind: event.target.value as Requirement["requirement_kind"], visibility: event.target.value === "human_review" ? "internal" : "client" })}>{["field", "document", "form", "consent", "human_review"].map((kind) => <option key={kind} value={kind}>{kind.replaceAll("_", " ")}</option>)}</Select></Field>
        <Field label="Required level"><Select value={requirement.required_level} onChange={(event) => change(index, { required_level: event.target.value as Requirement["required_level"] })}>{["required", "recommended", "optional"].map((level) => <option key={level} value={level}>{level}</option>)}</Select></Field></Row>
        {requirement.requirement_kind === "field" ? <Row><Field label="Canonical field"><Input value={String(requirement.collection_config.field_key ?? requirement.requirement_key)} onChange={(event) => change(index, { collection_config: { ...requirement.collection_config, field_key: event.target.value } })} /></Field><Field label="Answer type"><Select value={String(requirement.collection_config.value_type ?? "text")} onChange={(event) => change(index, { collection_config: { ...requirement.collection_config, value_type: event.target.value } })}>{["text", "number", "boolean", "date", "email"].map((type) => <option key={type}>{type}</option>)}</Select></Field></Row> : null}
        {requirement.requirement_kind === "document" ? <Field label="Evidence configuration" hint={'Optional JSON: evidence_classes, required_months, required_years, minimum_count, expiration_days, subject and period.'}><EvidenceConfiguration value={requirement.collection_config} onChange={(config) => change(index, { collection_config: config })} onValidity={(valid) => setConfigurationErrors((previous) => ({ ...previous, [index]: !valid }))} /></Field> : null}
        {requirement.requirement_kind === "form" ? <Field label="Form kind" hint="pfs, debt_schedule, pnl or balance_sheet uses the existing secure financial forms."><Input value={String(requirement.collection_config.form_kind ?? "")} onChange={(event) => change(index, { collection_config: { ...requirement.collection_config, form_kind: event.target.value } })} /></Field> : null}
        {requirement.requirement_kind === "consent" ? <><Field label="Disclosure text"><Textarea value={String(requirement.collection_config.disclosure_text ?? "")} onChange={(event) => change(index, { collection_config: { ...requirement.collection_config, disclosure_text: event.target.value } })} /></Field><Field label="Disclosure version"><Input value={String(requirement.collection_config.disclosure_version ?? "")} onChange={(event) => change(index, { collection_config: { ...requirement.collection_config, disclosure_version: event.target.value } })} /></Field></> : null}
        <label><input type="checkbox" checked={Boolean(requirement.verification_required)} onChange={(event) => change(index, { verification_required: event.target.checked })} /> Staff verification is required before this item is complete.</label>
        <Row><label><input type="checkbox" checked={requirement.waivable} onChange={(event) => change(index, { waivable: event.target.checked })} /> Institution permits a documented waiver</label><Btn size="sm" onClick={() => { setRequirements((old) => old.filter((_, position) => position !== index)); setConfigurationErrors({}); }}>Remove</Btn></Row>
      </fieldset>)}
      <Btn onClick={() => setRequirements((old) => [...old, { requirement_key: "", label: "", requirement_kind: "document", required_level: "required", waivable: false, visibility: "client", collection_config: {} }])}>Add requirement</Btn>
      <label><input type="checkbox" checked={formsRequired} onChange={(event) => setFormsRequired(event.target.checked)} /> Official institution forms must be included.</label>
      <Field label="Official form file IDs" hint="Use files already uploaded to the private document store; separate IDs with commas."><Input value={formIds} onChange={(event) => setFormIds(event.target.value)} /></Field>
      <details><summary>Published fit criteria</summary><Sub>Use the existing catalog rule format. Empty criteria produces a clarification result and still allows selection.</Sub><Textarea rows={6} value={rules} onChange={(event) => setRules(event.target.value)} /></details>
      <Btn variant="pri" disabled={busy || Object.values(configurationErrors).some(Boolean)} onClick={() => void save()}>{busy ? "Saving…" : "Save a new checklist version"}</Btn>
    </div> : null}
  </section>;
}

function EvidenceConfiguration({ value, onChange, onValidity }: { value: Record<string, unknown>; onChange: (value: Record<string, unknown>) => void; onValidity: (valid: boolean) => void }) {
  const serialized = JSON.stringify(value, null, 2);
  const [raw, setRaw] = useState(serialized);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => { setRaw(serialized); setInvalid(false); }, [serialized]);
  return <><Textarea value={raw} rows={5} onChange={(event) => {
    const text = event.target.value; setRaw(text);
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Use an object");
      onChange(parsed); setInvalid(false); onValidity(true);
    } catch { setInvalid(true); onValidity(false); }
  }} />{invalid ? <Sub>Enter a valid JSON object before saving.</Sub> : null}</>;
}
