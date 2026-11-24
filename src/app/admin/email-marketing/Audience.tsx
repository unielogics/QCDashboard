"use client";

import { Btn, Input, Select, StatusLine } from "@/components/ds";
import RecordMarketingConsent from "./RecordMarketingConsent";
import PermissionRequests from "./PermissionRequests";
import { fields, none, recipients, type Contact, type Directory, type Eligibility, type Filters, type Options, type Selection } from "./campaign";
import styles from "./page.module.css";

export type View = { search: string; eligibility: Eligibility; page: number; pageSize: number };
export const initialView: View = { search: "", eligibility: "all", page: 1, pageSize: 100 };
export function firstView(): View {
  if (typeof window === "undefined") return initialView;
  const params = new URLSearchParams(window.location.search);
  return { ...initialView, search: (params.get("search") ?? "").trim().slice(0, 200),
    eligibility: params.get("eligibility") === "requestable" ? "requestable" : "all" };
}
type Props = {
  scope: string; options?: Options; filters: Filters; selectFilters: (filters: Filters) => void;
  view: View; setView: (view: View) => void; data?: Directory; loading: boolean; error: boolean; refresh: () => void;
  selection: Selection; select: (s: Selection) => void; next: () => void;
};
const labels = { eligible: "Eligible", requestable: "Needs permission", blocked: "Held" };

function ContactStatus({row}:{row:Contact}) {
  let label = labels[row.status];
  if (row.reason === "Permission request already queued") label = "Invite pending";
  else if (row.reason?.startsWith("Previous permission request:")) label = row.permission_status === "sent" ? "Invite sent" : "Prior invitation";
  else if (row.reason === "Unsubscribed") label = "Unsubscribed";
  else if (row.reason === "Permission request declined") label = "Declined";
  else if (row.status === "requestable" && row.permission_status === "task_only") label = "Follow-up task";
  const tone = row.eligible ? styles.eligible : row.status === "requestable" ? styles.requestable : styles.ineligible;
  if (!row.reason || row.reason === label) return <span className={tone}>{label}</span>;
  return <details className={styles.reason}><summary className={tone} title={row.reason}>{label}</summary>
    <small>{row.reason}</small>
  </details>;
}

export default function Audience({ scope, options, filters, selectFilters, view, setView, data, loading, error, refresh, selection, select, next }: Props) {
  const rows = data?.rows ?? [];
  const selected = data?.selected_count ?? 0;
  const eligible = data?.selected_eligible_count ?? 0;
  const requestable = data?.selected_requestable_count ?? 0;
  const blocked = data?.selected_blocked_count ?? 0;
  const pages = Math.max(1, Math.ceil((data?.total_count ?? 0) / view.pageSize));
  const from = (view.page - 1) * view.pageSize;
  function toggle(row: Contact) {
    const email = row.email.toLowerCase().trim();
    const included = new Set(selection.included_emails);
    const excluded = new Set(selection.excluded_emails);
    if (row.selected) {
      included.delete(email);
      if (selection.mode === "all") excluded.add(email);
    } else {
      excluded.delete(email);
      included.add(email);
    }
    select({ ...selection, included_emails: [...included], excluded_emails: [...excluded] });
  }
  function addPage() {
    const emails = new Set(rows.map(row => row.email.toLowerCase().trim()));
    select({
      ...selection, included_emails: [...new Set([...selection.included_emails, ...emails])],
      excluded_emails: selection.excluded_emails.filter(email => !emails.has(email)),
    });
  }
  return <section className={styles.panel} aria-labelledby="audience-heading">
    <div className={styles.sectionHead}><h2 id="audience-heading">Audience</h2></div>
    <div className={styles.filters}>
      {fields.map(field => <label key={field.key}><span>{field.label}</span><Select value={filters[field.key] ?? ""} disabled={!options}
        onChange={event => {
          const updated = { ...filters };
          if (event.target.value) updated[field.key] = event.target.value;
          else delete updated[field.key];
          selectFilters(updated);
        }}>
        <option value="">{field.all}</option>{options?.[field.options].map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
      </Select></label>)}
    </div>
    <div className={styles.search}>
      <label><span>Search contacts</span><Input type="search" maxLength={200} placeholder="Name, business or email" value={view.search} onChange={e=>setView({...view, search:e.target.value,page:1})}/></label>
      <label><span>Show eligibility</span><Select value={view.eligibility} onChange={e=>setView({...view, eligibility:e.target.value as Eligibility,page:1})}>
        <option value="all">All contacts</option><option value="eligible">Eligible only</option><option value="requestable">Need permission</option>
        <option value="blocked">Held only</option><option value="ineligible">All ineligible</option>
      </Select></label>
      <label><span>Rows per page</span><Select value={view.pageSize} onChange={e=>setView({...view,pageSize:Number(e.target.value),page:1})}>
        <option value="50">50</option><option value="100">100</option>
      </Select></label>
    </div>
    <div className={styles.toolbar}>
      <Btn size="sm" disabled={error || loading || !rows.some(row=>!row.selected)} onClick={addPage}>Select this page</Btn>
      <Btn size="sm" disabled={error || loading || !data?.total_count} onClick={()=>select({...none,mode:"all",search:view.search.trim(),eligibility:view.eligibility})}>Select all matching</Btn>
      <Btn size="sm" disabled={selection.mode === "explicit" && !selection.included_emails.length} onClick={()=>select(none)}>Clear selection</Btn>
    </div>
    <dl aria-label="Selection counts" aria-live="polite" className={styles.selectionCounts}>
      <div><dt>Selected</dt><dd>{selected.toLocaleString()}</dd></div><div><dt>Eligible</dt><dd>{eligible.toLocaleString()}</dd></div>
      <div><dt>Need permission</dt><dd>{requestable.toLocaleString()}</dd></div><div><dt>Held</dt><dd>{blocked.toLocaleString()}</dd></div>
    </dl>
    {error ? <StatusLine tone="bad">The contact directory could not be loaded. <Btn onClick={refresh}>Retry</Btn></StatusLine>
      : <div className={styles.directory} role="region" aria-label="Contact directory" tabIndex={0} aria-busy={loading}><table>
        <thead><tr><th scope="col">Select</th><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Source</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead>
        <tbody>{rows.map(row=><tr key={row.email} data-selected={row.selected}>
          <td><input type="checkbox" aria-label={"Select "+row.email} checked={row.selected} disabled={loading} onChange={()=>toggle(row)}/></td>
          <td className={styles.nameCell}><span title={row.name ?? undefined}>{row.name || "—"}</span></td>
          <td className={styles.emailCell}><span title={row.email}>{row.email}</span></td>
          <td className={styles.sourceCell}><span title={row.source}>{row.source}</span></td>
          <td><ContactStatus row={row}/></td>
          <td className={styles.actionCell}>{row.can_record_consent && <RecordMarketingConsent email={row.email} onSaved={refresh}/>}</td>
        </tr>)}</tbody>
      </table>{!rows.length && <p className={styles.empty}>{loading ? "Loading contacts…" : "No contacts match this search."}</p>}</div>}
    <div className={styles.pagination}><span>{rows.length ? `${from+1}–${from+rows.length} of ${data?.total_count.toLocaleString()} contacts` : "0 contacts"}</span>
      <div><Btn size="sm" disabled={loading || view.page<=1} onClick={()=>setView({...view,page:view.page-1})}>Previous</Btn><span>{view.page} / {pages}</span>
      <Btn size="sm" disabled={loading || view.page>=pages} onClick={()=>setView({...view,page:view.page+1})}>Next page</Btn></div>
    </div>
    <div className={styles.actions}><div className={styles.modes}>
      <PermissionRequests scope={scope} filters={filters} selection={selection} count={requestable} disabled={error || loading} refresh={refresh}/>
    </div><div className={styles.modes}>
      <span className="sub">{recipients(eligible)} eligible for this campaign</span>
      {!error && !loading && !eligible && <Btn onClick={next}>Draft with an example contact</Btn>}
      <Btn variant="pri" disabled={error || loading || !eligible} onClick={next}>Next: Compose</Btn>
    </div></div>
  </section>;
}
