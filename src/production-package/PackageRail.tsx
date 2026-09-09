// The left rail: what this is, where it stands, the five steps and their
// states, and — for the desk — which lens the page is being viewed through.
import { FIELDS, PAGES, fieldRequiredNow, isBlank, pageFor } from "./schema";
import { IconCheck, IconLock } from "./icons";
import { PChip, Picks } from "./ui";
import type { Arrangement, AttentionItem, PageKey, ProductionPackage } from "./types";

export type ViewAs = "rep" | "underwriting";
const VIEWS: Array<[ViewAs, string]> = [["rep", "Rep"], ["underwriting", "Underwriting"]];

/** A page is done when nothing on it needs attention and every field it requires now carries a value. */
export function pageDone(page: PageKey, pkg: ProductionPackage, draft: Arrangement, attention: AttentionItem[]): boolean {
  if (attention.some((a) => pageFor(a) === page)) return false;
  const scope = pkg.stage === 2 ? "stage_two" : "stage_one";
  return FIELDS.every((d) => d.page !== page || !fieldRequiredNow(d, scope) || !isBlank(d, draft[d.key]));
}

export function PackageRail({ pkg, draft, page, attention, saving, dirty, onPage, viewAs, onViewAs }: {
  pkg: ProductionPackage; draft: Arrangement; page: PageKey; attention: AttentionItem[]; saving: boolean; dirty: boolean;
  onPage: (p: PageKey) => void;
  /** The desk's lens. Absent for everyone else — a rep never sees a control implying they could become underwriting. */
  viewAs?: ViewAs; onViewAs?: (v: ViewAs) => void;
}) {
  const counts = attention.reduce<Record<string, number>>((acc, a) => { const p = pageFor(a); acc[p] = (acc[p] ?? 0) + 1; return acc; }, {});
  const done = PAGES.filter((p) => pageDone(p.key, pkg, draft, attention)).length;
  const status = pkg.status;
  const two = pkg.stage === 2;
  const ref = pkg.agreement_no || `QC-${two ? "AA" : "PA"}-${pkg.id.slice(0, 8).toUpperCase()}`;
  return (
    <aside className="pp-rail-l">
      <div className="pp-rail-head">
        <div className="pp-eyebrow">Production arrangement</div>
        <div className="pp-rail-name">{pkg.business_name || String(draft.dealer_name || "") || "New arrangement"}</div>
        <div className="pp-rail-ref">{ref} · {done} of {PAGES.length} steps complete</div>
        <div className="pp-rail-meta">
          {status !== "draft" ? <PChip tone={status === "executed" ? "ok" : status === "void" ? "mut" : "warn"}><IconLock />{status === "executed" ? "Executed" : status === "void" ? "Voided" : pkg.execution_pending ? "Signed · bundle pending" : "Locked · sent for signature"}</PChip> : null}
          {two ? <PChip tone="gold">Final</PChip> : null}
          {pkg.access_via === "share_link" ? <PChip tone="acc">Shared link</PChip> : null}
          {pkg.mode === "partner" ? <PChip tone="acc">Your lead</PChip> : null}
          {!two && pkg.final_package_id ? <PChip tone={pkg.final_status === "executed" ? "ok" : "acc"}>Final · {pkg.final_status === "out_for_signature" ? "out for signature" : pkg.final_status ?? "drafted"}</PChip> : null}
          <span className="pp-save">{saving ? "Saving…" : dirty ? "Unsaved" : "Saved"}</span>
        </div>
      </div>
      <nav className="pp-stps" aria-label="Steps">
        {PAGES.map((p, i) => {
          const isDone = !counts[p.key] && pageDone(p.key, pkg, draft, attention);
          const cls = `pp-stp${page === p.key ? " on" : ""}${isDone ? " done" : ""}${counts[p.key] ? " flag" : ""}`;
          return (
            <button key={p.key} type="button" className={cls} onClick={() => onPage(p.key)} aria-current={page === p.key ? "step" : undefined}
              title={counts[p.key] ? `${counts[p.key]} open` : isDone ? "Complete" : undefined}>
              <span className="pp-stp-n">{isDone && page !== p.key ? <IconCheck /> : i + 1}</span>
              <span className="pp-stp-l">{p.label}</span>
              {counts[p.key] ? <span className="pp-stp-dot" aria-label={`${counts[p.key]} open`} /> : null}
            </button>
          );
        })}
      </nav>
      {viewAs && onViewAs ? (
        <div className="pp-rail-foot">
          <div className="pp-eyebrow">Viewing as</div>
          <Picks options={VIEWS} value={viewAs} onChange={onViewAs} />
          <div className="pp-hint">A preview of what a rep sees. It changes nothing on the package.</div>
        </div>
      ) : null}
    </aside>
  );
}
