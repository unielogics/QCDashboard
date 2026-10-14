export type CollectionField = {
  key?: string; label?: string; value_type?: "text" | "number" | "integer" | "boolean" | "date" | "email" | "enum";
  required?: boolean; choices?: string[]; min?: number; max?: number; max_length?: number;
};

export type CollectionTask = {
  id: string; label: string; description: string | null;
  action_type: "answer_fields" | "upload_documents" | "complete_form" | "sign_consent" | "internal_review";
  status: "open" | "requested" | "completed" | "in_review" | "paused" | "unavailable" | "escalated" | "cancelled";
  assignee: "borrower" | "internal"; state_reason: string | null;
  config: CollectionField & {
    fields?: CollectionField[]; requirement_kind?: string; form_url?: string; form_kind?: string;
    disclosure_text?: string; disclosure_version?: string; requested_document_ids?: string[];
    prefill?: { value: unknown; source: string }; response?: { id: string; value: { answer?: unknown }; review_state: string };
  };
  requirement_keys?: string[]; automation_approved?: boolean;
  attempts?: number; max_attempts?: number; assigned_user_id?: string | null;
};

export function collectionTaskNeedsAnswer(task: CollectionTask): boolean {
  return ["open", "requested", "escalated"].includes(task.status) && ["answer_fields", "complete_form", "sign_consent"].includes(task.action_type);
}

export function collectionTaskStatus(task: CollectionTask): string {
  return ({ open: "Needed", requested: "Requested", completed: "Complete", in_review: "Received · in review", paused: "Paused", unavailable: "Staff follow-up", escalated: "Staff follow-up", cancelled: "No longer needed" })[task.status];
}
