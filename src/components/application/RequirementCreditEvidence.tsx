"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Btn, Callout, CellChip } from "@/components/ds";
import { useAuthedApi } from "@/hooks/useApi";
import type { FileOwner } from "@/lib/applicationProfile";
import type { RequirementCreditCollection } from "@/lib/requirementCredit";
import { OwnerCreditReportDrawer } from "./OwnerCreditReportDrawer";

export function RequirementCreditEvidence({ profileId, credit, onRefresh }: { profileId: string; credit: RequirementCreditCollection; onRefresh?: () => Promise<unknown> | void }) {
  const api = useAuthedApi();
  const owners = useQuery({ queryKey: ["application-profile-owners", profileId], queryFn: () => api<FileOwner[]>(`/application-profiles/${encodeURIComponent(profileId)}/owners`), enabled: credit.owners.length > 0 });
  const [reportOwnerId, setReportOwnerId] = useState<string | null>(null);
  const selectedSource = credit.owners.find((owner) => owner.owner_id === reportOwnerId);
  const selectedOwner = owners.data?.find((owner) => owner.id === reportOwnerId && owner.credit_pull_id === selectedSource?.credit_pull_id) ?? null;
  const reasons = credit.staff_review_reasons ?? [];
  const concreteReasons = reasons.filter((reason) => !reason.startsWith("Staff must verify each required owner"));
  const shownReasons = concreteReasons.length ? concreteReasons : reasons;
  return <section className="grid g8" aria-label="Linked owner credit reports"><strong>{credit.collected_owner_count} of {credit.required_owner_count} owner {credit.required_owner_count === 1 ? "report" : "reports"} linked</strong><p className="sub">Review the report’s bureau, score model, and score against the selected program.</p>{!credit.ownership_complete ? <Callout tone="warn">The ownership list needs review before owner-report coverage is final.</Callout> : null}{shownReasons.length ? <ul className="sub">{shownReasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul> : null}
    {credit.owners.map((source, index) => {
      const owner = owners.data?.find((item) => item.id === source.owner_id && item.credit_pull_id === source.credit_pull_id);
      return <div className="grid g6" key={source.owner_id}><div className="row g8"><b>{owner?.full_name || `Owner ${index + 1}`}</b><CellChip tone={source.status === "collected" ? "acc" : "warn"}>{source.status === "collected" ? "Report linked" : source.status.replaceAll("_", " ")}</CellChip>{source.backfill_needs_review ? <CellChip tone="warn">Import review</CellChip> : null}</div>{source.status !== "collected" && source.reason ? <p className="sub">{source.reason}</p> : null}<p className="sub">{source.score_models?.length ? source.score_models.map((model) => `${model.bureau && !model.model.toLowerCase().includes(model.bureau.toLowerCase()) ? `${model.bureau} · ` : ""}${model.model}: ${model.score ?? "not supplied"}`).join(" · ") : source.score != null ? `Linked score ${source.score} · model not established` : "Score/model details not established"}{source.required_score_model ? ` · Required ${source.required_score_model}: ${source.required_score_model_present ? "present in source" : "not established"}` : ""}</p>{source.credit_pull_id ? <div><Btn size="sm" disabled={!owner || owners.isFetching} onClick={() => setReportOwnerId(source.owner_id)}>{owners.isFetching ? "Loading linked report…" : "View linked credit report"}</Btn>{!owners.isFetching && !owner ? <small className="sub">The owner/report link changed. Refresh before opening this source.</small> : null}</div> : null}</div>;
    })}
    {owners.error ? <Callout tone="warn">Linked report navigation could not be loaded. Refresh the owner credit section to inspect the current report.</Callout> : null}
    <OwnerCreditReportDrawer key={`${profileId}:${reportOwnerId ?? "closed"}`} profileId={profileId} owner={selectedOwner} onClose={() => setReportOwnerId(null)} onImported={async () => { await owners.refetch(); await onRefresh?.(); }} />
  </section>;
}
