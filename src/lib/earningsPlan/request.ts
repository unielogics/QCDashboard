import type { FileRequestItem } from "@/lib/fileRequestsApi";

/**
 * What the business is asked for when staff request its earnings plan: the same words from the File page's plan card
 * and from inside the plan. Building it sends nothing; the request dialog does that.
 */
export function earningsPlanRequest(businessName: string): FileRequestItem {
  return {
    document_type: "operating_plan", name: "Operating expenses and earnings plan", quantity: 1, unit: "files", subject: businessName.trim() || "business", period: "current",
    instructions: "Confirm the costs on your return, describe how your revenue is made, and propose any price, volume or cost changes with amounts, timing and the reason each will work.",
  };
}
