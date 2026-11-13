"use client";

import { useState } from "react";
import { Btn, Select } from "@/components/ds";
import type { FinancialVersion } from "@/lib/financialWorkspaceApi";
import { operatingReportNeedsUpgrade, selectedOperatingReport } from "@/lib/operatingReport";

export function OperatingPlanReportControls({ scope, versions, currentId, hasDraft, busy = false, onDownload }: {
  scope: string; versions: FinancialVersion[]; currentId: string | null; hasDraft: boolean; busy?: boolean; onDownload: (versionId: string) => void;
}) {
  const [choice, setChoice] = useState<{ scope: string; id: string | null }>({ scope, id: null });
  const selected = selectedOperatingReport(versions, currentId, choice.scope === scope ? choice.id : null);
  return <section aria-label="Saved operating plan report" style={{ display: "grid", gap: 6, paddingBlock: 10 }}>
    <div className="row" style={{ flexWrap: "wrap", gap: 8 }}><strong>Plan report</strong>
      {versions.length ? <><Select aria-label="Report version" disabled={busy} value={selected?.id ?? ""} onChange={event => setChoice({ scope, id: event.target.value === currentId ? null : event.target.value })}>{versions.map(version => <option key={version.id} value={version.id}>v{version.version_number} · {new Date(version.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}{version.id === currentId ? " · Current" : ""}</option>)}</Select><Btn size="sm" disabled={busy || !selected} onClick={() => { if (selected) onDownload(selected.id); }}>Download PDF{selected ? ` v${selected.version_number}` : ""}</Btn></> : <span className="sub">Save a version to download its report.</span>}
    </div>
    {hasDraft ? <small className="sub">Draft changes are not in this PDF. Save version first to include them.</small> : null}
    {selected && operatingReportNeedsUpgrade("operating_plan", selected) ? <small className="sub">{selected.id === currentId ? "This saved PDF uses the earlier format. Save version to create the comparison report." : "Historical PDFs keep their original saved format."}</small> : null}
  </section>;
}
