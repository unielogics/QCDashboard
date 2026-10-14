"use client";

import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn, Callout, CellChip, Input, Panel, Row, Sub } from "@/components/ds";
import { useAuthedApi, useCurrentUser } from "@/hooks/useApi";
import { useConsoleAuth, visualQaUser } from "@/lib/consoleAuth";
import { apiBase } from "@/lib/api";
import { canDispatchSubmission, submissionSelection, type LenderOption, type SubmissionBatch } from "@/lib/submissionBatches";

interface Assessment {
  assessed_at?: string;
  products?: { program_key: string; program_name?: string; status: string; reasons?: string[]; missing_items?: string[]; conflicts?: { explanation: string }[]; failed_rules?: { explanation: string }[] }[];
  file_completeness?: { status?: string; satisfied?: number; total?: number };
  document_usability?: Record<string, number>;
  explanation?: string;
}

const label = (value: string) => value.replaceAll("_", " ");

export function ApplicationLenderSubmissions({ profileId }: { profileId: string }) {
  const api = useAuthedApi();
  const { data: user } = useCurrentUser();
  const { getToken } = useConsoleAuth();
  const queryClient = useQueryClient();
  const allowed = user?.role === "super_admin" || user?.role === "loan_exec";
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<SubmissionBatch | null>(null);
  const options = useQuery({ queryKey: ["application-lender-options", profileId], queryFn: () => api<{ lenders: LenderOption[] }>(`/application-profiles/${profileId}/lender-options`), enabled: allowed && expanded });
  const batches = useQuery({ queryKey: ["application-submission-batches", profileId], queryFn: () => api<SubmissionBatch[]>(`/application-profiles/${profileId}/submission-batches`), enabled: allowed && expanded, refetchInterval: expanded ? 5000 : false });
  const assessment = useQuery({ queryKey: ["application-assessment", profileId], queryFn: () => api<Assessment>(`/application-profiles/${profileId}/assessment`), enabled: allowed && expanded });

  const act = useCallback(async (action: () => Promise<void>) => {
    setBusy(true); setError(""); setNotice("");
    try { await action(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "The action could not be completed."); }
    finally { setBusy(false); }
  }, []);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["application-submission-batches", profileId] }),
      queryClient.invalidateQueries({ queryKey: ["application-lender-options", profileId] }),
      queryClient.invalidateQueries({ queryKey: ["application-evidence-workspace", profileId] }),
      queryClient.invalidateQueries({ queryKey: ["application-collection-tasks", profileId] }),
    ]);
  };
  const request = () => ({ idempotency_key: crypto.randomUUID(), targets: submissionSelection(options.data?.lenders ?? [], selected, acknowledged) });
  const current = preview ? batches.data?.find((batch) => batch.id === preview.id) ?? preview : batches.data?.[0];
  const allOptions = options.data?.lenders ?? [];
  const visible = allOptions.filter((lender) => `${lender.name} ${lender.submission_email ?? ""}`.toLowerCase().includes(search.toLowerCase()));

  if (!allowed) return null;
  return <Panel title="Lender review and submission" actions={<Btn size="sm" onClick={() => setExpanded(!expanded)}>{expanded ? "Close" : "Choose lenders"}</Btn>}>
    <Sub>AI suggestions explain fit. Choose any active institutions and prepare a separate package for each.</Sub>
    {expanded ? <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
      {error || options.error || batches.error ? <Callout tone="bad">{error || (options.error as Error)?.message || (batches.error as Error)?.message}</Callout> : null}
      {notice ? <Callout tone="ok">{notice}</Callout> : null}
      {assessment.data?.explanation ? <Callout tone="acc">{assessment.data.explanation}</Callout> : null}
      {assessment.data?.file_completeness ? <Sub>File: {label(assessment.data.file_completeness.status ?? "not assessed")} · {assessment.data.file_completeness.satisfied ?? 0} of {assessment.data.file_completeness.total ?? 0} requirements complete. Documents: {Object.entries(assessment.data.document_usability ?? {}).map(([status, count]) => `${count} ${label(status)}`).join(" · ") || "none uploaded"}.</Sub> : null}
      {assessment.data?.products?.length ? <details><summary>Product assessment</summary><div className="table-scroll"><table className="tbl"><thead><tr><th>Product</th><th>Assessment</th><th>Reasons</th></tr></thead><tbody>{assessment.data.products.map((product) => <tr key={product.program_key}><td>{product.program_name ?? label(product.program_key)}</td><td>{label(product.status)}</td><td>{[...(product.reasons ?? []), ...(product.failed_rules ?? []).map((rule) => rule.explanation), ...(product.conflicts ?? []).map((rule) => rule.explanation), ...(product.missing_items ?? []).map((item) => `Missing ${label(item)}`)].join(" · ") || "See published criteria"}</td></tr>)}</tbody></table></div></details> : null}
      <Input aria-label="Search all active lenders" placeholder="Search all active lenders" value={search} onChange={(event) => setSearch(event.target.value)} />
      {options.isLoading ? <Sub>Loading active institutions…</Sub> : null}
      <div className="table-scroll"><table className="tbl"><thead><tr><th>Select</th><th>Institution</th><th>Fit</th><th>Requirements</th></tr></thead><tbody>{visible.map((lender) => <tr key={lender.id}>
        <td><input type="checkbox" aria-label={`Select ${lender.name}`} checked={selected.has(lender.id)} onChange={(event) => setSelected((old) => { const next = new Set(old); if (event.target.checked) next.add(lender.id); else next.delete(lender.id); return next; })} /></td>
        <td><strong>{lender.name}</strong><Sub>{lender.submission_email || "Submission email needed"}</Sub>{!lender.configuration_complete ? <CellChip tone="warn">Checklist pending</CellChip> : null}</td>
        <td><CellChip tone={lender.fit.status === "recommended" ? "ok" : "warn"}>{label(lender.fit.status)}</CellChip><Sub>{lender.fit.reasons.join(" · ")}</Sub>{selected.has(lender.id) && lender.fit.status !== "recommended" ? <label style={{ display: "block", marginTop: 8 }}><input type="checkbox" checked={acknowledged.has(lender.id)} onChange={(event) => setAcknowledged((old) => { const next = new Set(old); if (event.target.checked) next.add(lender.id); else next.delete(lender.id); return next; })} /> I reviewed this fit warning and want to include this institution.</label> : null}</td>
        <td>{lender.requirements.length ? <details><summary>{lender.requirements.filter((item) => ["verified", "waived", "not_applicable"].includes(item.status ?? "")).length} / {lender.requirements.length} collected</summary>{lender.requirements.map((item) => <p key={item.requirement_key}>{item.label} · {item.requirement_kind} · {label(item.status ?? "missing")}</p>)}</details> : "Awaiting lender requirements"}</td>
      </tr>)}</tbody></table></div>
      {!options.isLoading && !visible.length ? <Sub>No active institutions match your search. Add institutions through the Lenders roster.</Sub> : null}
      <Row>
        <Btn disabled={!selected.size || busy} onClick={() => void act(async () => { await api(`/application-profiles/${profileId}/lender-collection`, { method: "POST", body: JSON.stringify(request()) }); await refresh(); setNotice("Shared fields, documents, forms, and sharing authorizations were added to collection tasks."); })}>Collect missing for selected lenders</Btn>
        <Btn variant="pri" disabled={!selected.size || busy} onClick={() => void act(async () => { const result = await api<SubmissionBatch>(`/application-profiles/${profileId}/submission-batches`, { method: "POST", body: JSON.stringify(request()) }); setPreview(result); await refresh(); })}>{busy ? "Working…" : `Prepare ${selected.size || "selected"} package${selected.size === 1 ? "" : "s"}`}</Btn>
      </Row>
      {current ? <div>
        <Row><strong>Batch review</strong><CellChip>{label(current.status)}</CellChip></Row>
        <Sub>Each institution receives its own secure link and only the documents listed below. Missing items must be collected before approval.</Sub>
        {current.submissions.map((submission) => <div key={submission.id} style={{ borderTop: "1px solid var(--line)", padding: "14px 0" }}>
          <Row><strong>{submission.lender_name}</strong><CellChip>{label(submission.status)}</CellChip><span>Package v{submission.version}</span></Row>
          <Sub>{submission.recipient_email ?? "No recipient configured"}</Sub>
          {submission.blockers.length ? <Callout tone="warn">{submission.blockers.map((blocker) => blocker.message).join(" · ")}</Callout> : null}
          {submission.last_error ? <Callout tone="bad">{submission.last_error}</Callout> : null}
          <details><summary>Files and requirements ({submission.manifest.files.length} files)</summary><ul>{submission.manifest.files.map((file) => <li key={file.id}>{file.name}</li>)}</ul>{submission.requirements_snapshot.map((item) => <p key={item.key}>{item.label} · {label(item.status)}</p>)}</details>
          <Row><Btn size="sm" disabled={busy} onClick={() => void act(async () => {
            const token = await getToken();
            const response = await fetch(`${apiBase}/api/v1/application-profiles/${profileId}/submission-batches/${current.id}/${submission.id}/export`, { headers: token ? { Authorization: `Bearer ${token}` } : { "X-Dev-User": visualQaUser(user?.email ?? "") } });
            if (!response.ok) { const failure = await response.json().catch(() => null); throw new Error(typeof failure?.detail === "string" ? failure.detail : "Package export failed"); }
            const url = URL.createObjectURL(await response.blob()); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `lender-package-${submission.id}.zip`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
          })}>Export {submission.blockers.length ? "internal preview" : "ZIP"}</Btn>
          <Btn size="sm" disabled={busy || submission.status === "revoked"} onClick={() => void act(async () => { await api(`/application-profiles/${profileId}/submission-batches/${current.id}/${submission.id}/revoke`, { method: "POST" }); await refresh(); })}>Revoke this recipient</Btn></Row>
        </div>)}
        <Btn variant="pri" disabled={busy || !current.submissions.some(canDispatchSubmission)} onClick={() => void act(async () => { const next = await api<SubmissionBatch>(`/application-profiles/${profileId}/submission-batches/${current.id}/approve`, { method: "POST", body: JSON.stringify({ confirmed: true, submission_ids: current.submissions.filter(canDispatchSubmission).map((submission) => submission.id) }) }); setPreview(next); await refresh(); setNotice("Ready packages were queued for separate delivery. Other recipients remain unsent."); })}>Approve and send ready packages</Btn>
        {current.submissions.some((submission) => submission.status === "package_stale") ? <Sub>This file changed after preparation. Prepare fresh packages to include the latest information.</Sub> : null}
      </div> : null}
      {(batches.data?.length ?? 0) > 1 ? <details><summary>Previous batches</summary>{batches.data?.map((batch) => <p key={batch.id}><button type="button" className="btn sm" onClick={() => setPreview(batch)}>{new Date(batch.created_at).toLocaleString()} · {label(batch.status)}</button></p>)}</details> : null}
    </div> : null}
  </Panel>;
}
