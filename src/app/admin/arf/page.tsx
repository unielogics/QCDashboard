"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Btn, BtnLink, CellChip, Field, Input, Loading, PageHeader, Panel, Row, Select, Sub, Textarea, WarnLine } from "@/components/ds";
import { useCurrentUser } from "@/hooks/useApi";
import { api, type ApiOptions } from "@/lib/api";
import { useConsoleAuth, visualQaUser } from "@/lib/consoleAuth";
import { Role } from "@/lib/enums.generated";
import type { FundingProgramCatalogItem } from "@/lib/fundingPrograms";
import styles from "./page.module.css";

type Approval = { approved: boolean; evidence_reference: string | null; scope: string | null };
type Channel = {
  channel_key: string; version: number;
  intake_mode: "referral_only" | "partner_hosted_authorized";
  publication_state: "draft_pending_approval" | "published" | "paused";
  approvals: Record<string, Approval>; permitted_fields: string[]; permitted_documents: string[];
  source_version: string; missing_source_artifacts: string[];
};
const GATES = [
  { key: "public_copy", label: "Borrower-facing copy and branding", hint: "Approved marketing copy may publish independently of financial intake." },
  { key: "rule_pack", label: "Current product and industry rules", hint: "Confirm the governing snapshot, conflicts and applicable industry overlays." },
  { key: "geography", label: "Geography and channel availability", hint: "Record the approved geography and availability in the scope." },
  { key: "hosted_intake", label: "Hosted intake permission", hint: "Written permission must identify exactly which fields may be collected." },
  { key: "document_sharing", label: "Document collection and sharing", hint: "Identify the permitted documents, recipients and uses." },
  { key: "credit_pull", label: "Credit authorization and accepted score model", hint: "Credit access is a separate permission; record the accepted bureau and model." },
  { key: "submission_route", label: "Authorized lender submission route", hint: "Confirm the submission process and approved destination." },
];
const splitLines = (value: string) => [...new Set(value.split(/[\n,]/).map((part) => part.trim()).filter(Boolean))];

export default function ArfAdministrationPage() {
  const { data: me, isLoading: userLoading } = useCurrentUser();
  const { getToken } = useConsoleAuth();
  const [draft, setDraft] = useState<Channel | null>(null);
  const [fieldScope, setFieldScope] = useState("");
  const [documentScope, setDocumentScope] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const allowed = me?.role === Role.SUPER_ADMIN;
  const call = useCallback(async <T,>(path: string, options: ApiOptions = {}) => api<T>(path, { ...options, authToken: (await getToken()) ?? undefined, devUser: visualQaUser(me?.email ?? "") }), [getToken, me?.email]);
  const query = useQuery({
    queryKey: ["arf-administration", me?.id], enabled: allowed,
    queryFn: async () => {
      const [configuration, catalog] = await Promise.all([
        call<Channel>("/admin/arf/configuration"), call<FundingProgramCatalogItem[]>("/admin/funding-programs"),
      ]);
      return { configuration, catalog: catalog.filter((item) => item.program_key.startsWith("arf_")) };
    },
  });
  useEffect(() => {
    if (!query.data) return;
    setDraft(query.data.configuration);
    setFieldScope(query.data.configuration.permitted_fields.join("\n"));
    setDocumentScope(query.data.configuration.permitted_documents.join("\n"));
  }, [query.data]);

  function updateApproval(key: string, patch: Partial<Approval>) {
    setDraft((current) => current ? { ...current, approvals: { ...current.approvals, [key]: { ...(current.approvals[key] ?? { approved: false, evidence_reference: null, scope: null }), ...patch } } } : current);
  }
  async function save() {
    if (!draft) return;
    setBusy(true); setNotice(""); setError("");
    try {
      await call<Channel>("/admin/arf/configuration", { method: "PUT", body: JSON.stringify({ intake_mode: draft.intake_mode, publication_state: draft.publication_state, approvals: draft.approvals, permitted_fields: splitLines(fieldScope), permitted_documents: splitLines(documentScope), reason: reason.trim(), confirmed: true }) });
      setNotice("ARF permission evidence and collection scope saved.");
      setReason("");
      await query.refetch();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save the ARF configuration."); }
    finally { setBusy(false); }
  }
  async function importSnapshot() {
    setBusy(true); setNotice(""); setError("");
    try {
      const result = await call<{ created_program_keys: string[] }>("/admin/arf/import-snapshot", { method: "POST" });
      setNotice(result.created_program_keys.length ? `Imported ${result.created_program_keys.length} products as drafts. Review them in Funding programs.` : "The ARF snapshot is already imported. Existing versions were preserved.");
      await query.refetch();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not import the source snapshot."); }
    finally { setBusy(false); }
  }
  if (userLoading) return <Loading />;
  if (!allowed) return <Panel title="Super-admin only"><Sub>ARF channel permissions and catalog imports require super-admin access.</Sub></Panel>;
  return <div className="grid">
    <PageHeader title="ARF business-capital channel" lede="Review source evidence, approved collection scope and public availability for the four ARF products." actions={<BtnLink href="/settings?section=funding_programs">Funding programs</BtnLink>} />
    {(error || query.error) && <WarnLine>{error || (query.error instanceof Error ? query.error.message : "Could not load ARF settings.")}</WarnLine>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    <Panel title="Source snapshot" actions={<Btn disabled={busy} onClick={() => void importSnapshot()}>Import missing draft products</Btn>}>
      <Sub>{draft?.source_version ?? "Supplied ARF product snapshot"}. Imports are idempotent and preserve existing versions. Publication and hosted intake each require their own recorded evidence.</Sub>
      <div className={styles.products}>{(query.data?.catalog ?? []).map((item) => <div className={styles.product} key={item.program_key}><strong>{item.name}</strong><Row><CellChip tone={item.published_version ? "acc" : "mut"}>{item.published_version ? `Published v${item.published_version.version}` : "Draft — review pending"}</CellChip></Row><Sub>{item.draft_versions.length} draft version{item.draft_versions.length === 1 ? "" : "s"}</Sub></div>)}</div>
      {!query.isLoading && !query.data?.catalog.length && <p>No ARF products have been imported yet.</p>}
      <ul className={styles.pending}>{(draft?.missing_source_artifacts ?? []).map((item) => <li key={item}>{item}</li>)}</ul>
    </Panel>
    {query.isLoading && <Loading />}
    {draft && <>
      <Panel title="Operating mode" sub={`Configuration v${draft.version}`}>
        <div className={styles.columns}>
          <Field label="Intake mode"><Select value={draft.intake_mode} onChange={(event) => setDraft({ ...draft, intake_mode: event.target.value as Channel["intake_mode"] })}><option value="referral_only">Referral only — contact handoff</option><option value="partner_hosted_authorized">Authorized hosted intake</option></Select></Field>
          <Field label="Public marketing state"><Select value={draft.publication_state} onChange={(event) => setDraft({ ...draft, publication_state: event.target.value as Channel["publication_state"] })}><option value="draft_pending_approval">Draft — approval pending</option><option value="published">Published approved copy</option><option value="paused">Paused</option></Select></Field>
        </div>
        <Sub>Hosted intake requires a written authorization reference and an explicit field scope. Public pages use only published product versions with approved copy and rules.</Sub>
      </Panel>
      <Panel title="Independent permission evidence">
        <div className={styles.gates}>{GATES.map((gate) => {
          const approval = draft.approvals[gate.key];
          return <div key={gate.key} className={styles.gate}>
            <label className={styles.approval}><input type="checkbox" checked={approval?.approved ?? false} onChange={(event) => updateApproval(gate.key, { approved: event.target.checked })} /><strong>{gate.label}</strong></label>
            <Sub>{gate.hint}</Sub>
            <div className={styles.columns}>
              <Field label="Written evidence reference"><Input aria-label={`${gate.label} evidence reference`} maxLength={2000} value={approval?.evidence_reference ?? ""} onChange={(event) => updateApproval(gate.key, { evidence_reference: event.target.value })} placeholder="Document, agreement or lender confirmation reference" /></Field>
              <Field label="Approved scope"><Textarea aria-label={`${gate.label} approved scope`} rows={2} maxLength={4000} value={approval?.scope ?? ""} onChange={(event) => updateApproval(gate.key, { scope: event.target.value })} /></Field>
            </div>
          </div>;
        })}</div>
      </Panel>
      <Panel title="Permitted hosted collection scope">
        <div className={styles.columns}>
          <Field label="Canonical fields — one per line" hint="For example: annual_revenue, monthly_sales, bank_data, credit_data. Include only fields explicitly covered by written authorization."><Textarea rows={8} value={fieldScope} onChange={(event) => setFieldScope(event.target.value)} /></Field>
          <Field label="Canonical document requirements — one per line" hint="Use the requirement keys shown in the approved funding-program version."><Textarea rows={8} value={documentScope} onChange={(event) => setDocumentScope(event.target.value)} /></Field>
        </div>
        <Field label="Reason for this configuration change"><Input value={reason} minLength={3} maxLength={2000} onChange={(event) => setReason(event.target.value)} /></Field>
        <Row className={styles.save}><Btn variant="pri" disabled={busy || reason.trim().length < 3} onClick={() => void save()}>{busy ? "Saving…" : "Save channel configuration"}</Btn><BtnLink href="/settings?section=funding_programs">Review product rules and required items</BtnLink></Row>
      </Panel>
    </>}
  </div>;
}
