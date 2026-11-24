"use client";

import { Btn, Input, Select, StatusLine } from "@/components/ds";
import RecordMarketingConsent from "./RecordMarketingConsent";
import { fields, none, recipients, type Contact, type Directory, type Filters, type Options, type Selection } from "./campaign";
import styles from "./page.module.css";

export type View = { search: string; eligibility: "all" | "eligible" | "ineligible"; page: number; };
export const initialView: View = { search: "", eligibility: "all", page: 1 };

type Props = {
  options?: Options; filters: Filters; selectFilters: (filters: Filters) => void;
  view: View; setView: (view: View) => void; data?: Directory; loading: boolean; error: boolean; refresh: () => void;
  selection: Selection; select: (s: Selection) => void; next: () => void;
};
export default function Audience({ options, filters, selectFilters, view, setView, data, loading, error, refresh, selection, select, next }: Props) {
  const rows = data?.rows ?? [];
  const selected = data?.selected_count ?? 0;
  const pageSize = data?.page_size ?? 25;
  const pages = Math.max(1, Math.ceil((data?.total_count ?? 0) / pageSize));
  function toggle(row: Contact) {
    if (!row.id || !row.eligible) return;
    const id = row.id;
    const included = new Set(selection.included_ids);
    const excluded = new Set(selection.excluded_ids);
    if (row.selected) {
      included.delete(id);
      if (selection.mode === "all") excluded.add(id);
    } else {
      excluded.delete(id);
      included.add(id);
    }
    select({ ...selection, included_ids: [...included], excluded_ids: [...excluded] });
  }
  function addPage() {
    const ids = rows.filter(row => row.eligible && row.id).map(row => row.id!);
    select({
      ...selection, included_ids: [...new Set([...selection.included_ids, ...ids])],
      excluded_ids: selection.excluded_ids.filter(id => !ids.includes(id))
    });
  }
  return <section className={styles.panel} aria-labelledby="audience-heading">
    <div className={styles.sectionHead}><h2 id="audience-heading">Audience</h2><strong aria-live="polite">{selected.toLocaleString()} selected</strong></div>
    <div className={styles.filters}>
      {fields.map(field => <label key={field.key}><span>{field.label}</span><Select value={filters[field.key] ?? ""} disabled={!options}
        onChange={e => { const updated = { ...filters }; if (e.target.value) updated[field.key] = e.target.value; else delete updated[field.key]; selectFilters(updated); }}>
        <option value="">{field.all}</option>{options?.[field.options].map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
      </Select></label>)}
    </div>
    <div className={styles.search}>
      <label><span>Search contacts</span><Input type="search" placeholder="Name, business or email" value={view.search} onChange={e => setView({ ...view, search: e.target.value, page: 1 })} /></label>
      <label><span>Show eligibility</span><Select value={view.eligibility} onChange={e => setView({ ...view, eligibility: e.target.value as View["eligibility"], page: 1 })}>
        <option value="all">All contacts</option><option value="eligible">Eligible only</option><option value="ineligible">Ineligible only</option>
      </Select></label>
    </div>
    <div className={styles.toolbar}>
      <Btn size="sm" disabled={loading || !rows.some(r => r.eligible && !r.selected)} onClick={addPage}>Select eligible on this page</Btn>
      <Btn size="sm" disabled={loading || !data?.eligible_count || view.eligibility === "ineligible"} onClick={() => select({ ...none, mode: "all", search: view.search.trim() })}>Select all matching</Btn>
      <Btn size="sm" disabled={selection.mode === "explicit" && !selection.included_ids.length} onClick={() => select(none)}>Clear selection</Btn>
    </div>
    {error ? <StatusLine tone="bad">The contact directory could not be loaded. <Btn onClick={refresh}>Retry</Btn></StatusLine>
      : <div className={styles.directory} aria-busy={loading}><table>
        <thead><tr><th scope="col">Select</th><th scope="col">Contact</th><th scope="col">Source</th><th scope="col">Email eligibility</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.email} data-selected={row.selected}>
          <td><input type="checkbox" aria-label={"Select " + row.email} checked={row.selected} disabled={!row.eligible || !row.id || loading} onChange={() => toggle(row)} /></td>
          <td>{row.name && <b>{row.name}</b>}<span>{row.email}</span></td><td>{row.source}</td>
          <td><span className={row.eligible ? styles.eligible : styles.ineligible}>{row.eligible ? "Eligible" : "Ineligible"}</span>
            {row.reason && <small>{row.reason}</small>}{row.can_record_consent && <RecordMarketingConsent email={row.email} onSaved={refresh} />}</td>
        </tr>)}</tbody>
      </table>{!rows.length && <p className={styles.empty}>{loading ? "Loading contacts…" : "No contacts match this search."}</p>}</div>}
    <div className={styles.pagination}><span>{(data?.total_count ?? 0).toLocaleString()} contacts · {(data?.eligible_count ?? 0).toLocaleString()} eligible</span>
      <div><Btn size="sm" disabled={loading || view.page <= 1} onClick={() => setView({ ...view, page: view.page - 1 })}>Previous</Btn><span>{view.page} / {pages}</span>
        <Btn size="sm" disabled={loading || view.page >= pages} onClick={() => setView({ ...view, page: view.page + 1 })}>Next page</Btn></div>
    </div>
    <div className={styles.actions}><span>{recipients(selected)} selected for this campaign</span>
      <div className={styles.modes}>
        {!error && !loading && !selected && <Btn onClick={next}>Draft with an example contact</Btn>}
        <Btn variant="pri" disabled={error || loading || !selected} onClick={next}>Next: Compose</Btn>
      </div>
    </div>
  </section>;
}
