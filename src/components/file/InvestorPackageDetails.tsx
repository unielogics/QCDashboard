"use client";

import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Btn, Callout } from "@/components/ds";

import { Icon } from "@/components/design-system/Icon";

import { useAuthedApi } from "@/hooks/useApi";
import { type InvestorCollateral, type InvestorReferenceManifest } from "@/lib/investorCollateral";
import type { Artifact } from "./leadFile";
import { InvestorCollateralEditor } from "./InvestorCollateralEditor";
import { InvestorSourceReferences } from "./InvestorSourceReferences";
import styles from "./InvestorPackageDetails.module.css";

export function InvestorReportReferenceButton({ intakeId, artifact, onOpenEvidence, compact = false }: { intakeId: string; artifact: Artifact; onOpenEvidence?: () => void; compact?: boolean }) {
  const api = useAuthedApi();
  const [selection, setSelection] = useState<Artifact | null>(null);
  const selected = selection ?? artifact;
  const load = useCallback(() => api<InvestorReferenceManifest>(`/admin/ai-underwriter-leads/${intakeId}/package-readiness/references?artifact_id=${encodeURIComponent(selected.id)}`), [api, intakeId, selected.id]);
  return <><Btn size="sm" aria-label={compact ? `Source references for investor report version ${artifact.version ?? "saved"}` : "Source references"} onClick={() => setSelection(artifact)}><Icon name="file" size={14} />{compact ? "Sources" : "Source references"}</Btn><InvestorSourceReferences open={selection != null} artifact={selected} load={load} onClose={() => setSelection(null)} onOpenEvidence={onOpenEvidence} /></>;
}

/** Collateral is a saved file proposal; the source register is a saved report snapshot. */
export function InvestorPackageDetails({ profileId, intakeId, report, disabled, onSaved, onOpenEvidence }: {
  profileId: string; intakeId: string; report: Artifact | null; disabled?: boolean; onSaved?: () => Promise<unknown> | void; onOpenEvidence?: () => void;
}) {
  const api = useAuthedApi(), queryClient = useQueryClient();
  const [collateral, setCollateral] = useState<InvestorCollateral | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState("");
  const [open, setOpen] = useState(false), [initialEnabled, setInitialEnabled] = useState<boolean | undefined>();
  const load = useCallback(() => api<InvestorCollateral>(`/application-profiles/${profileId}/collateral`), [api, profileId]);
  const refresh = useCallback(async () => { setLoading(true); setError(""); try { setCollateral(await load()); } catch (reason) { setError(reason instanceof Error ? reason.message : "Collateral details are unavailable."); } finally { setLoading(false); } }, [load]);
  useEffect(() => {
    let active = true; setCollateral(null); setLoading(true); setError(""); setOpen(false);
    void load().then(answer => { if (active) setCollateral(answer); }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Collateral details are unavailable."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load]);
  const edit = (enabled?: boolean) => { setInitialEnabled(enabled); setOpen(true); };
  return <>
    <section className={styles.summary} aria-label="Investor report details">
      <div><strong>Real estate collateral</strong><small>{loading ? "Loading saved details…" : collateral ? collateral.enabled ? `${collateral.properties.length} proposed propert${collateral.properties.length === 1 ? "y" : "ies"} · amounts and title subject to review` : "Optional property security · saved entries are retained when excluded" : "Save optional property security on this file"}</small></div>
      <div className={styles.summaryActions}>{collateral ? <><label className={styles.toggle}><input type="checkbox" aria-label="Real estate collateral available" checked={collateral.enabled} disabled={disabled || loading || !collateral.can_edit} onChange={event => edit(event.target.checked)} />Available</label><Btn size="sm" disabled={disabled || loading} onClick={() => edit()}><Icon name="bldg" size={14} />{collateral.can_edit ? "Manage collateral" : "View collateral"}</Btn></> : <Btn size="sm" disabled={loading || disabled} onClick={() => void refresh()}>{loading ? "Loading…" : "Retry collateral"}</Btn>}
      {report ? <InvestorReportReferenceButton intakeId={intakeId} artifact={report} onOpenEvidence={onOpenEvidence} /> : <Btn size="sm" disabled><Icon name="file" size={14} />Source references</Btn>}</div>
    </section>
    {error ? <Callout tone="warn">{error}</Callout> : null}
    {collateral ? <InvestorCollateralEditor open={open} data={collateral} initialEnabled={initialEnabled} load={load} save={input => api<InvestorCollateral>(`/application-profiles/${profileId}/collateral`, { method: "PATCH", body: JSON.stringify(input) })} onSaved={async next => {
      setCollateral(next);
      for (const key of ["financial-cockpit", "application-profile", "application-program-readiness"]) void queryClient.invalidateQueries({ queryKey: [key, profileId] });
      await onSaved?.();
    }} onClose={() => setOpen(false)} /> : null}
  </>;
}
