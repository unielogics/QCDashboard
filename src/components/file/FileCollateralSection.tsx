"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn, Callout } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useAuthedApi } from "@/hooks/useApi";
import type { InvestorCollateral } from "@/lib/investorCollateral";
import { InvestorCollateralEditor } from "./InvestorCollateralEditor";
import styles from "./InvestorPackageDetails.module.css";

/** Every financing surface reads this file record. Open edits retain their own revision. */
export function FileCollateralSection({ profileId, disabled, onSaved, compact = false, title = "Loan collateral", actions }: {
  profileId: string; disabled?: boolean; onSaved?: () => Promise<unknown> | void; compact?: boolean; title?: string; actions?: ReactNode;
}) {
  const api = useAuthedApi(), queryClient = useQueryClient();
  const [open, setOpen] = useState(false), [initialEnabled, setInitialEnabled] = useState<boolean | undefined>();
  useEffect(() => { setOpen(false); setInitialEnabled(undefined); }, [profileId]);
  const load = useCallback(() => api<InvestorCollateral>(`/application-profiles/${profileId}/collateral`), [api, profileId]);
  const query = useQuery({ queryKey: ["file-collateral", profileId], queryFn: load, enabled: !!profileId, staleTime: 15_000 });
  const collateral = query.data;
  const edit = (enabled?: boolean) => { setInitialEnabled(enabled); setOpen(true); };
  const propertyCount = collateral?.properties.length ?? 0, assetCount = collateral?.assets?.length ?? 0;
  const label = collateral?.enabled
    ? `${propertyCount} propert${propertyCount === 1 ? "y" : "ies"} · ${assetCount} other asset${assetCount === 1 ? "" : "s"} · revision ${collateral.revision}`
    : "Optional security · retained entries are excluded from the current proposal";
  return <>
    <section className={styles.summary} aria-label={title} data-compact={compact || undefined}>
      <div><strong>{title}</strong><small>{query.isPending ? "Loading saved details…" : collateral ? label : "Collateral details are unavailable"}</small>{!compact && collateral ? <small>Shared with Coverage plan and Underwriting. Saved terms PDFs retain their recorded collateral.</small> : null}</div>
      <div className={styles.summaryActions}>{collateral ? <><label className={styles.toggle}><input type="checkbox" aria-label="Collateral available" checked={collateral.enabled} disabled={disabled || query.isPending || !collateral.can_edit} onChange={event => edit(event.target.checked)} />Available</label><Btn size="sm" disabled={disabled || query.isPending} onClick={() => edit()}><Icon name="bldg" size={14} />{collateral.can_edit ? "Manage collateral" : "View collateral"}</Btn></> : <Btn size="sm" disabled={query.isFetching || disabled} onClick={() => void query.refetch()}>{query.isFetching ? "Loading…" : "Retry collateral"}</Btn>}{actions}</div>
    </section>
    {query.error ? <Callout tone="warn">{query.error instanceof Error ? query.error.message : "Collateral details are unavailable."}</Callout> : null}
    {collateral ? <InvestorCollateralEditor key={profileId} open={open} data={collateral} initialEnabled={initialEnabled} load={load} save={input => api<InvestorCollateral>(`/application-profiles/${profileId}/collateral`, { method: "PATCH", body: JSON.stringify(input) })} onSaved={async next => {
      queryClient.setQueryData(["file-collateral", profileId], next);
      await Promise.all(["financial-cockpit", "application-profile", "application-program-readiness", "application-client-terms", "application-underwriting"].map(key => queryClient.invalidateQueries({ queryKey: [key, profileId] })));
      await onSaved?.();
    }} onClose={() => setOpen(false)} /> : null}
  </>;
}
