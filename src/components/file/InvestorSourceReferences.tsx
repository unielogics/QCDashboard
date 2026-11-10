"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Btn, Callout, Input } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { Icon } from "@/components/design-system/Icon";
import { PreparationProgress } from "@/components/design-system/PreparationProgress";
import { investorReferenceLabel, type InvestorReferenceManifest } from "@/lib/investorCollateral";
import type { Artifact } from "./leadFile";
import styles from "./InvestorPackageDetails.module.css";
export function InvestorSourceReferences({ open, artifact, load, onClose, onOpenEvidence }: {
  open: boolean; artifact: Artifact; load: () => Promise<InvestorReferenceManifest>; onClose: () => void; onOpenEvidence?: () => void;
}) {
  const [manifest, setManifest] = useState<InvestorReferenceManifest | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState("");
  const [search, setSearch] = useState(""), [page, setPage] = useState(0);
  const [view, setView] = useState<"sources" | "notes">("sources");
  const request = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++request.current; setLoading(true); setError("");
    try { const answer = await load(); if (id === request.current) setManifest(answer); }
    catch (reason) { if (id === request.current) setError(reason instanceof Error ? reason.message : "The saved source register could not be opened."); }
    finally { if (id === request.current) setLoading(false); }
  }, [load]);
  useEffect(() => {
    setManifest(null); setSearch(""); setPage(0); setError(""); setView("sources");
    if (open) void refresh();
    return () => { request.current += 1; };
  }, [open, artifact.id, refresh]);
  const all = manifest?.references ?? [];
  const query = search.trim().toLowerCase();
  const matches = all.filter(row => [row.id, investorReferenceLabel(row), row.kind, row.period, row.status, ...(row.metric_keys ?? [])].join(" ").toLowerCase().includes(query));
  const notes = manifest?.analysis_notes ?? [];
  const matchedNotes = notes.filter(row => [row.section, row.label, row.text].join(" ").toLowerCase().includes(query));
  const count = view === "sources" ? matches.length : matchedNotes.length;
  const perPage = 25, lastPage = Math.max(0, Math.ceil(count / perPage) - 1), currentPage = Math.min(page, lastPage);
  return <Drawer open={open} onClose={onClose} title="Investor report source references" sub={`Saved report v${artifact.version ?? "—"} · ${new Date(artifact.created_at).toLocaleString()}`} width="lg" footer={<><Btn onClick={onClose}>Close</Btn><span className="sp" />{onOpenEvidence ? <Btn onClick={() => { onClose(); onOpenEvidence(); }}>Open file evidence <Icon name="arrowR" size={14} /></Btn> : null}</>}>
    <div className={styles.references}>
      <p className={styles.hint}>This register belongs to the selected generated report. Source versions, cited pages and calculation uses remain tied to that generation.</p>
      {loading ? <PreparationProgress compact title="Opening saved source references" description="Loading the immutable register for this report version." /> : error ? <Callout tone="bad"><span role="alert">{error}</span><Btn onClick={() => void refresh()}>Retry source references</Btn></Callout> : manifest?.available === false ? <Callout tone="warn">{manifest.reason || "Regenerate the investor report to create its source reference register."}</Callout> : manifest ? <>
        <div className={styles.referenceTabs} role="tablist" aria-label="Report reference views"><button type="button" role="tab" aria-selected={view === "sources"} onClick={() => { setView("sources"); setSearch(""); setPage(0); }}>Sources ({all.length})</button><button type="button" role="tab" aria-selected={view === "notes"} onClick={() => { setView("notes"); setSearch(""); setPage(0); }}>Analysis &amp; assumptions ({notes.length})</button></div>
        <Input aria-label={view === "sources" ? "Search report source references" : "Search saved report analysis"} placeholder={view === "sources" ? "Search source, period, metric or reference…" : "Search saved expenses, actions, assumptions or conditions…"} value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} />
        <div className="row"><span className="sub">{count} of {view === "sources" ? all.length : notes.length} {view === "sources" ? "references" : "analysis notes"}</span><span className="sp" /><Btn size="sm" disabled={currentPage === 0} onClick={() => setPage(value => Math.max(0, value - 1))}>Previous</Btn><span className="sub">{currentPage + 1} / {lastPage + 1}</span><Btn size="sm" disabled={currentPage === lastPage} onClick={() => setPage(value => value + 1)}>Next</Btn></div>
        {view === "sources" ? <div className={styles.referenceList} aria-label="Saved report references">{matches.slice(currentPage * perPage, (currentPage + 1) * perPage).map(row => <article className={styles.reference} key={row.id}>
          <header><span className={styles.refId}>[{row.id}]</span><strong>{investorReferenceLabel(row)}</strong>{row.status ? <small>{row.status.replaceAll("_", " ")}</small> : null}</header>
          <dl>
            <dt>Source type</dt><dd>{row.kind?.replaceAll("_", " ") || "Not supplied"}</dd>
            <dt>Period</dt><dd>{row.period || "Not supplied"}</dd>
            <dt>Version / pages</dt><dd>{row.version_number != null ? `v${row.version_number}` : "Version not supplied"}{row.pages?.length ? ` · pages ${row.pages.join(", ")}` : " · page location not supplied"}</dd>
            <dt>Used for</dt><dd>{row.metric_keys?.length ? row.metric_keys.map(key => key.replaceAll("_", " ")).join(" · ") : "Source evidence"}</dd>
            {row.content_hash ? <><dt>Content hash</dt><dd><code>{row.content_hash}</code></dd></> : null}
          </dl>
        </article>)}</div> : <div className={styles.referenceList} aria-label="Saved report analysis">{matchedNotes.slice(currentPage * perPage, (currentPage + 1) * perPage).map((row, index) => <article className={styles.reference} key={`${currentPage}:${index}`}><small className="lbl">{row.section.replaceAll("_", " ")}</small><strong>{row.label}</strong><p className={styles.analysisText}>{row.text}</p></article>)}</div>}
        {!count ? <div className="empty">{view === "sources" ? all.length ? "No references match this search." : "No source references were supplied in this report generation." : notes.length ? "No saved analysis matches this search." : "No additional analysis notes were supplied in this generation."}</div> : null}
      </> : null}
    </div>
  </Drawer>;
}

