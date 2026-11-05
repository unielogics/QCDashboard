"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Btn, Callout, Input, Select } from "@/components/ds";
import { useAuthedApi } from "@/hooks/useApi";
import type { FileOwner } from "@/lib/applicationProfile";

type Applicant = { id: string; name: string; status: string; updated: string };
type ExistingReport = { id: string; label: string; pull_type: string };

export function ProviderCreditPicker({ profileId, owner, onLinked }: { profileId: string; owner: FileOwner; onLinked: (owner: FileOwner) => void | Promise<void> }) {
  const api = useAuthedApi();
  const root = `/application-profiles/${profileId}/owners/${owner.id}`;
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [archived, setArchived] = useState(false);
  const [applicant, setApplicant] = useState<Applicant | null>(null);
  const [pullType, setPullType] = useState("soft_pull");
  const [reportId, setReportId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const people = useQuery({ queryKey: ["provider-credit-applicants", profileId, owner.id, query, page, archived], queryFn: () => api<{ items: Applicant[]; has_next: boolean }>(`${root}/provider-applicants?${new URLSearchParams({ query, page: String(page), archived: String(archived) })}`) });
  const reports = useQuery({ queryKey: ["provider-credit-reports", profileId, owner.id, applicant?.id, pullType], enabled: Boolean(applicant), queryFn: () => api<{ items: ExistingReport[] }>(`${root}/provider-applicants/${applicant?.id}/reports?pull_type=${pullType}`) });
  const link = useMutation({ mutationFn: () => api<FileOwner>(`${root}/provider-credit-link`, { method: "POST", body: JSON.stringify({ applicant_id: applicant?.id, report_id: reportId, pull_type: pullType, confirm_identity: confirmed }) }), onSuccess: onLinked });
  const error = people.error || reports.error || link.error;
  return <div className="provider-credit-picker">
    {error ? <Callout tone="bad">{error instanceof Error ? error.message : "Provider access is unavailable."}</Callout> : null}
    <form className="provider-credit-search" onSubmit={(event) => { event.preventDefault(); setQuery(search.trim()); setPage(1); setApplicant(null); }}><Input aria-label="Search iSoftPull applicants" placeholder="Search iSoftPull applicants" value={search} onChange={(event) => setSearch(event.target.value)} /><Select aria-label="Provider archive filter" value={String(archived)} onChange={(event) => { setArchived(event.target.value === "true"); setPage(1); setApplicant(null); }}><option value="false">Active</option><option value="true">Archived</option></Select><Btn type="submit">Search</Btn></form>
    {people.isLoading ? <div className="empty">Loading existing iSoftPull applicants...</div> : null}
    <div className="provider-credit-applicants">{people.data?.items.map((person) => <button type="button" key={person.id} aria-pressed={applicant?.id === person.id} onClick={() => { setApplicant(person); setReportId(""); setConfirmed(false); }}><b>{person.name}</b><span>{person.status} · Updated {person.updated}</span></button>)}</div>
    {!people.isLoading && !people.isError && !people.data?.items.length ? <div className="empty">No applicants match this search.</div> : null}
    <div className="row"><Btn disabled={page <= 1 || people.isFetching} onClick={() => { setPage(page - 1); setApplicant(null); }}>Previous</Btn><span className="sub">Page {page}</span><Btn disabled={!people.data?.has_next || people.isFetching} onClick={() => { setPage(page + 1); setApplicant(null); }}>Next</Btn></div>
    {applicant ? <section className="provider-credit-selection"><h3>{applicant.name}: existing reports</h3><Select aria-label="Existing report type" value={pullType} onChange={(event) => { setPullType(event.target.value); setReportId(""); setConfirmed(false); }}><option value="soft_pull">Existing soft pulls</option><option value="hard_pull">Existing hard pulls</option></Select>
      {reports.isLoading ? <p>Loading reports...</p> : null}
      {reports.data?.items.map((report, index) => <label className="provider-report-option" key={report.id}><input type="radio" name="provider-report" value={report.id} checked={reportId === report.id} onChange={() => { setReportId(report.id); setConfirmed(false); }} /><span><b>Report {index + 1}</b><small>{report.label}</small></span></label>)}
      {!reports.isLoading && !reports.isError && !reports.data?.items.length ? <p>No existing reports of this type are available.</p> : null}
      <label className="provider-credit-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>I verified this report belongs to {owner.full_name} and I am authorized to use it for this file.</span></label>
      <Btn variant="pri" disabled={!reportId || !confirmed || link.isPending} onClick={() => link.mutate()}>{link.isPending ? "Importing existing report..." : "Import and link report"}</Btn>
    </section> : null}
  </div>;
}
