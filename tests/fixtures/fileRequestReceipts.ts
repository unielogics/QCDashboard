import type { FileRequestDelivery, FileRequestItem, FileRequestRead } from "../../src/lib/fileRequestsApi";

export const REQUEST_PROFILE = "95000000-0000-4000-8000-000000000001";
export function syntheticRequestDelivery(status: "sent" | "failed"): FileRequestDelivery {
  return { id: status === "sent" ? "95000000-0000-4000-8000-000000000002" : "95000000-0000-4000-8000-000000000003", status, channel: "email", created_at: "2027-01-01T12:00:00Z", recipient_email: "owner@example.test", detail: status === "sent" ? "Accepted by synthetic provider" : "Synthetic delivery failure" };
}
export function syntheticFileRequest(requestId: string, items: FileRequestItem[], delivery: FileRequestDelivery | null): FileRequestRead {
  return { request_id: requestId, created_at: "2027-01-01T12:00:00Z", deliveries: delivery ? [delivery] : [], items: items.map((item, index) => ({ ...item, label: item.name, requirement_key: `staff_request_${requestId}_${index}`, requested_document_id: `95000000-0000-4000-8000-${String(100 + index).padStart(12, "0")}`, status: "requested", coverage: { current: 0, required: item.quantity, unit: item.unit, complete: false }, verified_coverage: { current: 0, required: item.quantity, complete: false }, task_id: null, task_status: null, next_reminder_at: null })) };
}
