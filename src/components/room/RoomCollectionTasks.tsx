"use client";

import { useCallback, useEffect, useState } from "react";
import { apiBase } from "@/lib/api";
import { clientApiErrorDetail } from "@/lib/clientRoomDocuments";
import { collectionTaskNeedsAnswer, collectionTaskStatus, type CollectionField, type CollectionTask } from "@/lib/applicationCollection";

function AnswerInput({ field, value, onChange }: { field: CollectionField; value: unknown; onChange: (value: unknown) => void }) {
  if (field.value_type === "boolean") return <select value={typeof value === "boolean" ? String(value) : ""} onChange={(event) => onChange(event.target.value === "" ? null : event.target.value === "true")} required={field.required !== false}><option value="">Choose...</option><option value="true">Yes</option><option value="false">No</option></select>;
  if (field.value_type === "enum") return <select value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} required={field.required !== false}><option value="">Choose...</option>{(field.choices ?? []).map((choice) => <option key={choice}>{choice}</option>)}</select>;
  return <input type={field.value_type === "number" || field.value_type === "integer" ? "number" : field.value_type === "date" ? "date" : field.value_type === "email" ? "email" : "text"} step={field.value_type === "integer" ? 1 : "any"} min={field.min} max={field.max} maxLength={field.max_length ?? 10000} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} required={field.required !== false} />;
}

function safeFormUrl(value?: string): string | null {
  if (!value) return null;
  return value.startsWith("/") && !value.startsWith("//") || value.startsWith("https://") ? value : null;
}

function BorrowerTask({ task, save, openForm, busy }: { task: CollectionTask; save: (id: string, body: object) => Promise<void>; openForm: (id: string) => Promise<void>; busy: boolean }) {
  const [value, setValue] = useState<unknown>(task.config.prefill?.value ?? "");
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [granted, setGranted] = useState(false);
  const [signer, setSigner] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const [reason, setReason] = useState("");
  const actionable = collectionTaskNeedsAnswer(task);
  const formUrl = safeFormUrl(task.config.form_url);
  return <article className={task.status === "completed" ? "complete" : "needed"} style={{ display: "block" }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}><b>{task.label}</b><span className="application-room-task-state">{collectionTaskStatus(task)}</span></div>
    {task.description ? <p>{task.description}</p> : null}
    {task.state_reason && ["unavailable", "in_review", "escalated"].includes(task.status) ? <p>{task.state_reason}</p> : null}
    {actionable ? <form onSubmit={(event) => { event.preventDefault(); void save(task.id, unavailable ? { unavailable_reason: reason } : { value: task.action_type === "sign_consent" ? { granted, consenter_name: signer } : task.config.fields?.length ? form : value }); }} style={{ display: "grid", gap: 12, marginTop: 12 }}>
      {unavailable ? <label className="application-room-field"><span>Tell us what is unavailable</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} required minLength={2} maxLength={2000} /></label> : task.action_type === "sign_consent" ? <>
        <div style={{ whiteSpace: "pre-wrap" }}>{task.config.disclosure_text || "The review team is preparing the required disclosure."}</div>
        <label><input type="checkbox" checked={granted} onChange={(event) => setGranted(event.target.checked)} required disabled={!task.config.disclosure_text} /> I have read and agree to this disclosure.</label>
        <label className="application-room-field"><span>Your full name</span><input value={signer} onChange={(event) => setSigner(event.target.value)} required maxLength={160} /></label>
      </> : task.config.fields?.length ? task.config.fields.map((field) => <label className="application-room-field" key={field.key}><span>{field.label || field.key}</span><AnswerInput field={field} value={form[field.key || ""]} onChange={(next) => setForm((current) => ({ ...current, [field.key || ""]: next }))} /></label>) : task.action_type === "complete_form" ? <>{formUrl ? <a className="application-room-secondary" href={formUrl} target="_blank" rel="noreferrer">Open secure form</a> : ["pfs", "debt_schedule", "p_and_l", "balance_sheet"].includes(task.config.form_kind || "") ? <button className="application-room-secondary" type="button" disabled={busy} onClick={() => void openForm(task.id)}>Complete form online</button> : null}<p>Complete the approved form online or add the completed copy in Documents.</p></> : <label className="application-room-field"><span>{task.config.prefill ? "Confirm or correct the information found in your file" : "Your answer"}</span><AnswerInput field={task.config} value={value} onChange={setValue} /></label>}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>{(task.action_type !== "complete_form" || task.config.fields?.length || unavailable) ? <button className="application-room-primary" type="submit" disabled={busy || task.action_type === "sign_consent" && !unavailable && !task.config.disclosure_text}>{busy ? "Saving..." : unavailable ? "Notify review team" : task.config.prefill ? "Confirm information" : "Submit securely"}</button> : null}<button className="application-room-secondary" type="button" onClick={() => setUnavailable(!unavailable)} disabled={busy}>{unavailable ? "Back to answer" : "I cannot provide this"}</button></div>
    </form> : null}
  </article>;
}

export function RoomCollectionTasks({ token, passcode }: { token: string; passcode: string }) {
  const [tasks, setTasks] = useState<CollectionTask[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch(`${apiBase}/api/v1/application-rooms/${token}/collection-tasks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passcode }), cache: "no-store" });
    if (response.status === 404) return;
    if (!response.ok) throw new Error(clientApiErrorDetail(await response.json().catch(() => null), "Collection items could not be loaded.").message);
    const data = await response.json() as { tasks: CollectionTask[] };
    setTasks(data.tasks.filter((task) => task.action_type !== "upload_documents"));
  }, [token, passcode]);
  useEffect(() => { void load().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Collection items could not be loaded.")); }, [load]);
  async function save(id: string, body: object) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`${apiBase}/api/v1/application-rooms/${token}/collection-tasks/${id}/answer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, passcode }) });
      if (!response.ok) throw new Error(clientApiErrorDetail(await response.json().catch(() => null), "Your response could not be saved.").message);
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Your response could not be saved."); }
    finally { setBusy(false); }
  }
  async function openForm(id: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`${apiBase}/api/v1/application-rooms/${token}/collection-tasks/${id}/form-link`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passcode }) });
      if (!response.ok) throw new Error(clientApiErrorDetail(await response.json().catch(() => null), "The form could not be opened.").message);
      const data = await response.json() as { url: string };
      const url = safeFormUrl(data.url);
      if (!url) throw new Error("The form link is unavailable.");
      window.location.assign(url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The form could not be opened."); }
    finally { setBusy(false); }
  }
  if (!tasks.length && !error) return null;
  return <div className="application-room-todo-list" style={{ marginBottom: 16 }} aria-label="Information and forms to complete">{error ? <div className="application-room-alert bad" role="alert">{error}</div> : null}{tasks.map((task) => <BorrowerTask key={`${task.id}:${task.status}`} task={task} save={save} openForm={openForm} busy={busy} />)}</div>;
}
