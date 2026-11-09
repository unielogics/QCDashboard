import type { ApplicationProgramReadiness, ApplicationRequirement, FileOwner, FileOwnerRequirementState } from "./applicationProfile";
import { requirementCreditCollection, type RequirementCreditCollection } from "./requirementCredit";
import { requirementIsComplete } from "./evidenceTriage";

export type CreditRequirementReceipt = { requirement: ApplicationRequirement; credit: RequirementCreditCollection; programNames: string[] };

/** Both steps read the same selected-program receipts; the score is not a collection predicate. */
export function creditRequirementReceipts(readiness: ApplicationProgramReadiness | null | undefined): CreditRequirementReceipt[] {
  const seen = new Set<string>();
  return (readiness?.requirements ?? []).flatMap((requirement) => {
    const credit = requirementCreditCollection(requirement);
    if (!credit || seen.has(requirement.requirement_key)) return [];
    seen.add(requirement.requirement_key);
    return [{ requirement, credit, programNames: requirement.source_program_keys.map((key) => readiness?.selections.find((item) => item.program_key === key)?.program_name || key) }];
  });
}

export function ownerReportCollection(owner: FileOwner): { status: NonNullable<FileOwner["credit_collection_status"]>; label: string; tone: "ok" | "warn" | "mut" } {
  const status = owner.credit_collection_status ?? (!owner.credit_pull_id ? "missing" : owner.credit_report_import_status === "pending" ? "processing" : owner.credit_complete && owner.credit_report_available ? "collected" : "needs_review");
  return { status, label: status === "collected" ? "Report received" : status === "processing" ? "Report processing" : status === "stale" ? "Current report needed" : status === "needs_review" ? "Report source needs review" : owner.invite_sent_at ? "Authorization sent" : "Report needed", tone: status === "collected" ? "ok" : status === "missing" && !owner.invite_sent_at ? "mut" : "warn" };
}

export function ownerStepReportCollection(owner: FileOwner, receipts: CreditRequirementReceipt[]) {
  const sources = receipts.flatMap((receipt) => receipt.credit.owners).filter((source) => source.owner_id === owner.id);
  if (!sources.length) return ownerReportCollection(owner);
  const samePull = sources.every((source) => source.credit_pull_id === owner.credit_pull_id);
  const status = !samePull ? "needs_review" : sources.every((source) => source.status === "collected") ? "collected" : sources.some((source) => source.status === "stale") ? "stale" : sources.some((source) => source.status === "needs_review") ? "needs_review" : sources.some((source) => source.status === "processing") ? "processing" : "missing";
  return ownerReportCollection({ ...owner, credit_collection_status: status });
}

export function creditStepCollection(owners: FileOwner[], receipts: CreditRequirementReceipt[]) {
  const sources = receipts.flatMap((receipt) => receipt.credit.owners);
  const coveredOwnerIds = new Set(sources.map((source) => source.owner_id));
  const ids = new Set([...coveredOwnerIds, ...owners.filter((owner) => owner.credit_required).map((owner) => owner.id)]);
  const receivedOwnerIds: string[] = [];
  const missingOwnerIds: string[] = [];
  for (const id of ids) {
    const owner = owners.find((item) => item.id === id);
    const applicable = sources.filter((source) => source.owner_id === id);
    if (applicable.length) {
      if (owner && applicable.every((source) => source.status === "collected" && source.credit_pull_id && source.credit_pull_id === owner.credit_pull_id)) receivedOwnerIds.push(id);
      if (owner && !owner.credit_pull_id && applicable.every((source) => source.status === "missing" && !source.credit_pull_id)) missingOwnerIds.push(id);
    } else if (owner) {
      const collection = ownerReportCollection(owner);
      if (collection.status === "collected") receivedOwnerIds.push(id);
      if (collection.status === "missing" && !owner.credit_pull_id) missingOwnerIds.push(id);
    }
  }
  const required = Math.max(ids.size, ...receipts.map((receipt) => receipt.credit.required_owner_count), 0);
  return { required, received: receivedOwnerIds.length, coveredOwnerIds, missingOwnerIds, complete: required > 0 && receivedOwnerIds.length === required };
}

/** A visual step state only. It never changes navigation or collection eligibility. */
export function creditStepProgress(state: FileOwnerRequirementState | null | undefined, readiness: ApplicationProgramReadiness | null | undefined): { status: "not-started" | "partial" | "complete"; sub: string } {
  if (!state?.owner_count) return { status: "not-started", sub: "Owners and report collection" };
  if (!readiness) return { status: "partial", sub: "Checking report collection and program review" };
  const receipts = creditRequirementReceipts(readiness);
  const collectionComplete = receipts.length ? receipts.every((receipt) => receipt.credit.complete) : state.owner_credit_complete;
  if (!collectionComplete) return { status: "partial", sub: "Current owner reports still needed" };
  if (receipts.some((receipt) => !requirementIsComplete(receipt.requirement))) return { status: "partial", sub: "Reports received · program review pending" };
  if (!state.ready_for_step_2) return { status: "partial", sub: "Reports received · owner details need review" };
  return { status: "complete", sub: "Owners and credit requirements reviewed" };
}
