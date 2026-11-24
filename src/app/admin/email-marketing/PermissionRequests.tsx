"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn, Loading, Select, StatusLine } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { useAuthedApi } from "@/hooks/useApi";
import { ApiError } from "@/lib/api";
import { ROOT, type Filters, type Selection } from "./campaign";
import styles from "./page.module.css";

type Action = "create_tasks" | "send_requests";
type Result = { id: string; requested_count: number; already_queued_count: number; task_count: number };
type Task = { id: string; email: string; status: string; created_at: string; expires_at: string | null; reminder_at: string | null; task_event_id: string | null; task_status: string | null };
type Review = { filters: Filters; selection: Selection; count: number };
const endpoint = ROOT + "/permission-requests";

export default function PermissionRequests({ scope, filters, selection, count, disabled, refresh }: {
  scope: string; filters: Filters; selection: Selection; count: number; disabled: boolean; refresh: () => void;
}) {
  const api = useAuthedApi();
  const cache = useQueryClient();
  const [review, setReview] = useState<Review | null>(null);
  const [action, setAction] = useState<Action>("create_tasks");
  const [locale, setLocale] = useState<"en" | "es">("en");
  const [expected, setExpected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const submitting = useRef(false);
  const previous = useRef<{ key: string; id: string } | null>(null);

  function open() {
    setAction("create_tasks");
    setLocale(filters.locale === "es" ? "es" : "en");
    setExpected(false);
    setError("");
    setNotice("");
    setReview({ filters, selection, count });
  }
  function close() {
    if (!submitting.current) setReview(null);
  }
  async function submit() {
    if (!review || !review.count || submitting.current || (action === "send_requests" && !expected)) return;
    const payload = {
      filters: review.filters, selection: review.selection, expected_recipient_count: review.count, action, confirmed: true,
      ...(action === "send_requests" ? { expected_by_contacts: true, locale } : {}),
    };
    const key = JSON.stringify(payload);
    if (previous.current?.key !== key) previous.current = { key, id: crypto.randomUUID() };
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api<Result>(endpoint, { method: "POST", body: JSON.stringify({ ...payload, id: previous.current.id }) });
      setNotice(action === "create_tasks"
        ? `${result.task_count} follow-up ${result.task_count === 1 ? "task" : "tasks"} on file. No emails were queued.`
        : `${result.requested_count} opt-in ${result.requested_count === 1 ? "request" : "requests"} queued. ${result.already_queued_count} already queued.`);
      previous.current = null;
      setReview(null);
      refresh();
      void cache.invalidateQueries({ queryKey: [ROOT, scope, "permission-tasks"] });
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409 && /audience|selection|count/i.test(reason.message)) {
        setReview(null);
        setNotice("Eligibility changed. Review the refreshed selection before confirming.");
        refresh();
      } else {
        setError(reason instanceof Error ? reason.message : "The request could not be confirmed. Retry this request to check its status.");
      }
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  }

  return <>
    <Btn size="sm" disabled={disabled || !count} onClick={open}>Request opt-in</Btn>
    {notice && <span role="status" className="sub">{notice}</span>}
    <Drawer open={Boolean(review)} onClose={close} closeOnBackdrop={!busy} width="md" title="Request opt-in"
      sub={review ? review.count.toLocaleString()+" selected contacts need permission" : undefined}
      footer={<><Btn disabled={busy} onClick={close}>Cancel</Btn><span className="sp"/>
        <Btn variant="pri" disabled={busy || (action === "send_requests" && !expected)} onClick={()=>void submit()}>
          {busy ? "Submitting…" : action === "create_tasks" ? "Create tasks" : "Queue opt-in requests"}
        </Btn></>}>
      <div className={styles.detail}>
        <fieldset disabled={busy} className={styles.permissionChoices}><legend>Follow-up action</legend>
          <label><input type="radio" name="opt-in-action" aria-label="Create follow-up tasks" aria-describedby="permission-task-description" value="create_tasks" checked={action==="create_tasks"} onChange={()=>{setAction("create_tasks");setExpected(false);}}/>
            <span><b>Create follow-up tasks</b><small id="permission-task-description">Assign staff a task and reminder to verify permission. No email is sent.</small></span></label>
          <label><input type="radio" name="opt-in-action" aria-label="Send opt-in emails" aria-describedby="permission-send-description" value="send_requests" checked={action==="send_requests"} onChange={()=>setAction("send_requests")}/>
            <span><b>Send opt-in emails</b><small id="permission-send-description">Queue a one-time invitation to confirm email preferences and create a staff follow-up.</small></span></label>
        </fieldset>
        {action === "send_requests" && <div>
          <label htmlFor="permission-language">Invitation language for contacts without a preference</label>
          <Select id="permission-language" aria-describedby="permission-language-hint" disabled={busy} value={locale}
            onChange={event => setLocale(event.target.value === "es" ? "es" : "en")}>
            <option value="en">English</option>
            <option value="es">Spanish</option>
          </Select>
          <p className="sub" id="permission-language-hint">Contacts with a recorded preference receive the invitation in their preferred language.</p>
        </div>}
        {action === "send_requests" && <label className={styles.attest}><input type="checkbox" checked={expected} disabled={busy} onChange={e=>setExpected(e.target.checked)}/>
          <span>I confirm these contacts asked for or expect one email about their email preferences.</span></label>}
        {error && <div role="alert"><StatusLine tone="bad">{error}</StatusLine></div>}
      </div>
    </Drawer>
  </>;
}

const taskLabels:Record<string,string> = {
  task_only:"Staff follow-up", queued:"Invitation queued", sent:"Invitation sent", accepted:"Opted in", expired:"Invitation expired",
};
function statusLabel(status:string) {
  return taskLabels[status] ?? status.replaceAll("_", " ");
}
export function FollowUpTasks({scope}:{scope:string}) {
  const [open,setOpen] = useState(false);
  const api=useAuthedApi();
  const tasks=useQuery({
    queryKey:[ROOT,scope,"permission-tasks"],enabled:open,
    queryFn:({signal})=>api<{rows:Task[]}>(endpoint+"?limit=25",{signal}),
  });
  return <details className={styles.disclosure} onToggle={e=>setOpen(e.currentTarget.open)}>
    <summary>Permission follow-up tasks</summary>
    {open && <div className={styles.detail}>
      <div><Btn size="sm" disabled={tasks.isFetching} onClick={()=>void tasks.refetch()}>Refresh tasks</Btn></div>
      {tasks.isLoading ? <Loading/> : tasks.isError ? <StatusLine tone="bad">Follow-up tasks could not be loaded.</StatusLine>
        : !tasks.data?.rows.length ? <small>No permission follow-ups have been created.</small> : <ul className={styles.taskList}>{tasks.data.rows.map(task=>
          <li key={task.id}><b>{task.email}</b><span>{statusLabel(task.status)}{task.task_status ? " · Task "+statusLabel(task.task_status) : ""}</span>
            {task.reminder_at && <small>Reminder {new Date(task.reminder_at).toLocaleString()}</small>}</li>)}</ul>}
    </div>}
  </details>;
}
