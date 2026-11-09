"use client";

import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn, Callout, CellChip } from "@/components/ds";
import { useAuthedApi, useCurrentUser } from "@/hooks/useApi";
import type { FileOwner } from "@/lib/applicationProfile";
import { creditReviewLabel, requirementCreditScoreWords, type RequirementCreditCollection, type RequirementCreditOwner } from "@/lib/requirementCredit";
import { OwnerCreditReportDrawer } from "./OwnerCreditReportDrawer";
import { CreditPullLinkDrawer } from "./CreditPullLinkDrawer";
import { OwnerImportReview, canReviewOwnerCredit } from "./OwnerImportReview";
import { CreditRequirementReview } from "./CreditRequirementReview";
import styles from "./RequirementCreditEvidence.module.css";

export function RequirementCreditEvidence({ profileId, credit, requirementKey, programNames = [], onRefresh, onOpenPrograms, omitOwnerIds = [], collectionActions }: {
  profileId: string; credit: RequirementCreditCollection; requirementKey?: string; programNames?: string[];
  onRefresh?: () => Promise<unknown> | void; onOpenPrograms?: () => void;
  omitOwnerIds?: string[];
  collectionActions?: (owner: FileOwner, source: RequirementCreditOwner) => ReactNode;
}) {
  const api = useAuthedApi();
  const queryClient = useQueryClient();
  const user = useCurrentUser();
  const canReview = canReviewOwnerCredit(user.data?.role);
  const owners = useQuery({ queryKey: ["application-profile-owners", profileId], queryFn: () => api<FileOwner[]>(`/application-profiles/${encodeURIComponent(profileId)}/owners`), enabled: credit.owners.length > 0 });
  const [reportOwnerId, setReportOwnerId] = useState<string | null>(null);
  const [reviewOwnerId, setReviewOwnerId] = useState<string | null>(null);
  const [linkOwnerId, setLinkOwnerId] = useState<string | null>(null);
  const [reviewSnapshot, setReviewSnapshot] = useState<RequirementCreditCollection | null>(null);
  const [refreshError, setRefreshError] = useState("");
  const selectedSource = credit.owners.find((owner) => owner.owner_id === reportOwnerId);
  const selectedOwner = owners.data?.find((owner) => owner.id === reportOwnerId && owner.credit_pull_id === selectedSource?.credit_pull_id) ?? null;
  const reasons = credit.staff_review_reasons ?? [];
  const concreteReasons = reasons.filter((reason) => !reason.startsWith("Staff must verify each required owner"));
  const currentReview = credit.last_review?.current ? credit.last_review : null;
  const shownReasons = currentReview?.decision === "met" ? [] : credit.review_blockers ?? (concreteReasons.length ? concreteReasons : reasons);
  const requiredModel = credit.required_score_model || credit.owners.find((owner) => owner.required_score_model)?.required_score_model;
  const required = requiredModel ? `${requiredModel}${credit.required_minimum_score != null ? ` · minimum ${credit.required_minimum_score}` : ""}` : credit.required_minimum_score != null ? `Minimum ${credit.required_minimum_score} · score model not established` : "Review selected program criteria";
  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["application-profile-owners", profileId] }),
      queryClient.invalidateQueries({ queryKey: ["application-profile-verification", profileId] }),
      queryClient.invalidateQueries({ queryKey: ["application-evidence-workspace", profileId] }),
    ]);
    await onRefresh?.();
  }
  return <section className={styles.panel} aria-label="Linked owner credit reports">
    <div className={styles.summary}><strong>{credit.collected_owner_count} of {credit.required_owner_count} owner {credit.required_owner_count === 1 ? "report" : "reports"} linked</strong><CellChip tone={credit.complete ? "ok" : "warn"}>{credit.complete ? "Reports received" : "Reports still needed"}</CellChip><CellChip tone={currentReview?.decision === "met" ? "ok" : "warn"}>{currentReview ? creditReviewLabel(currentReview.decision) : "Program review pending"}</CellChip></div>
    {credit.complete ? <p className={styles.reviewNote}>Credit collection is complete. One current linked bureau report per required owner is accepted; a three-bureau report is not required for collection.</p> : null}
    {!credit.ownership_complete ? <Callout tone="warn">The ownership list needs review before owner-report coverage is final.</Callout> : null}
    <div className={styles.facts}><div className={styles.fact}><span>Selected program{programNames.length === 1 ? "" : "s"}</span><strong>{programNames.length ? programNames.join(" · ") : "Program or evidence policy on this file"}</strong></div><div className={styles.fact}><span>Separate program score condition</span><strong>{required}</strong></div></div>
    {credit.owners.filter((source) => !omitOwnerIds.includes(source.owner_id)).map((source, index) => {
      const owner = owners.data?.find((item) => item.id === source.owner_id && item.credit_pull_id === source.credit_pull_id);
      return <div className={styles.owner} key={source.owner_id}>
        <div className={styles.ownerHeading}><b>{owner?.full_name || `Owner ${index + 1}`}</b><CellChip tone={source.status === "collected" ? "acc" : "warn"}>{source.status === "collected" ? "Report linked" : source.status.replaceAll("_", " ")}</CellChip>{source.backfill_needs_review ? <CellChip tone="warn">Owner confirmation needed</CellChip> : null}</div>
        <div className={styles.facts}><div className={styles.fact}><span>Reported score</span><strong>{requirementCreditScoreWords(source)}</strong></div><div className={styles.fact}><span>Required score evidence</span><strong>{source.required_score_model ? `${source.required_score_model}: ${source.required_score_model_present ? "present in source" : "not established"}` : "Review published program criteria"}</strong></div></div>
        {source.backfill_needs_review ? <p className={styles.reviewNote}>Confirm {owner ? `${owner.full_name}'s` : "this owner's"} name, actual ownership{owner?.ownership_pct != null ? ` (${owner.ownership_pct.toFixed(2)}% on file)` : " percentage"}, guarantor status and report association.</p> : null}
        {source.required_score_model && !source.required_score_model_present ? <p className={styles.reviewNote}>The linked report counts toward collection. This program's exact score condition is a separate underwriting check; the reported bureau and score model stay unchanged.</p> : null}
        {source.status !== "collected" && source.reason ? <p className={styles.reviewNote}>{source.reason}</p> : null}
        <div className={styles.actions}>
          {source.backfill_needs_review && canReview ? <Btn size="sm" variant="pri" disabled={!owner || owners.isFetching} onClick={() => setReviewOwnerId(source.owner_id)}>Review owner details</Btn> : null}
          {source.credit_pull_id ? <Btn size="sm" disabled={!owner || owners.isFetching} onClick={() => setReportOwnerId(source.owner_id)}>{owners.isFetching ? "Loading linked report…" : "View linked credit report"}</Btn> : null}
          {canReview ? <Btn size="sm" disabled={!owner || owners.isFetching} onClick={() => setLinkOwnerId(source.owner_id)}>Choose another existing report</Btn> : null}
          {owner && collectionActions ? collectionActions(owner, source) : null}
        </div>
        {!owners.isFetching && !owner ? <small className="sub">The owner/report link changed. Refresh before opening this source.</small> : null}
      </div>;
    })}
    <div className={styles.actions}>
      {canReview && requirementKey ? <Btn variant="pri" size="sm" disabled={!credit.review_fingerprint} onClick={() => setReviewSnapshot(credit)}>Review program credit conditions</Btn> : null}
      {onOpenPrograms ? <Btn size="sm" onClick={onOpenPrograms}>Review selected program</Btn> : null}
      <Btn size="sm" disabled={owners.isFetching} onClick={() => { setRefreshError(""); void refresh().catch((problem) => setRefreshError(problem instanceof Error ? problem.message : "The current review could not refresh.")); }}>Refresh review</Btn>
    </div>
    {currentReview ? <p className={styles.reviewNote}><strong>Last review · {creditReviewLabel(currentReview.decision)}:</strong> {currentReview.reason}</p> : credit.last_review ? <p className={styles.reviewNote}>The previous review predates the current owner or report evidence. Review the current details again.</p> : null}
    {shownReasons.length ? <details><summary className="sub">Program and owner review details</summary><ul className={styles.reasons}>{shownReasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul></details> : null}
    {owners.error ? <Callout tone="warn">Linked report navigation could not be loaded. Refresh the review to inspect the current owner and report.</Callout> : null}
    {refreshError ? <Callout tone="warn">{refreshError}</Callout> : null}
    <OwnerImportReview profileId={profileId} owner={owners.data?.find((owner) => owner.id === reviewOwnerId) ?? null} owners={owners.data ?? []} onClose={() => setReviewOwnerId(null)} onSaved={refresh} onViewReport={(owner) => setReportOwnerId(owner.id)} />
    <OwnerCreditReportDrawer key={`${profileId}:${reportOwnerId ?? "closed"}`} profileId={profileId} owner={selectedOwner} onClose={() => setReportOwnerId(null)} onImported={refresh} />
    <CreditPullLinkDrawer key={`${profileId}:${linkOwnerId ?? "closed"}`} profileId={profileId} owner={owners.data?.find((owner) => owner.id === linkOwnerId) ?? null} open={Boolean(linkOwnerId)} onClose={() => setLinkOwnerId(null)} onLinked={refresh} />
    {reviewSnapshot && requirementKey ? <CreditRequirementReview key={`${profileId}:${requirementKey}`} profileId={profileId} requirementKey={requirementKey} credit={reviewSnapshot} owners={owners.data ?? []} programNames={programNames} onRefresh={refresh} onClose={() => setReviewSnapshot(null)} /> : null}
  </section>;
}
