import type { ApplicationRequirement, RoomRequestResult } from "./applicationProfile";
import type { AuthedApi } from "./worksheetApi";

export function isUseOfProceedsRequirement(requirement: Pick<ApplicationRequirement, "requirement_key" | "canonical_key">): boolean {
  return (requirement.canonical_key || requirement.requirement_key) === "use_of_proceeds";
}

export function readUseOfFundsCollectionSummary(requirement: Pick<ApplicationRequirement, "collection_completion">) {
  const collection = requirement.collection_completion;
  if (collection?.source !== "use_of_funds" || !collection.summary) return null;
  const summary = collection.summary;
  const money = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount);
  return {
    ...summary,
    allocation: summary.requested_amount === null ? `${money(summary.allocated_amount)} allocated` : `${money(summary.allocated_amount)} of ${money(summary.requested_amount)} allocated`,
    detail: summary.item_count ? `${summary.item_count} planned ${summary.item_count === 1 ? "use" : "uses"} · ${summary.complete ? "Allocation balanced" : "Allocation incomplete"}` : "No planned uses yet",
  };
}

export function supportingUseOfFundsReviewIds(requirement: Pick<ApplicationRequirement, "evidence_files" | "qualification_review">): string[] {
  const needsCurrentAllocationReview = requirement.qualification_review?.status === "pending";
  return (requirement.evidence_files ?? []).filter((file) => (!file.verified || needsCurrentAllocationReview) && !file.is_password_protected && (
    file.ai_decision === "accepted" || file.ai_decision === "needs_more" && file.ai_reason_code === "document_review_pending"
  )).map((file) => file.file_id);
}

/** Prepare the existing PIN-protected room link without sending a message. */
export async function prepareUseOfFundsLink(api: AuthedApi, profileId: string): Promise<string> {
  const result = await api<RoomRequestResult>(`/application-profiles/${encodeURIComponent(profileId)}/room/reminders`, {
    method: "POST",
    body: JSON.stringify({ purpose: "use_of_funds", email_room_link: false, sms_reminder: false }),
  });
  let url: URL;
  try { url = new URL(result.room_url); }
  catch { throw new Error("The client use-of-proceeds link is unavailable. Try preparing the link again."); }
  if (!["https:", "http:"].includes(url.protocol) || !/^\/buckets\/request\/[^/]+$/.test(url.pathname) || url.searchParams.get("tab") !== "budget") {
    throw new Error("The client use-of-proceeds link is unavailable. Try preparing the link again.");
  }
  return result.room_url;
}
