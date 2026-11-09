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
  return task.assignee !== "internal" && ["open", "requested", "escalated"].includes(task.status) && ["answer_fields", "complete_form", "sign_consent"].includes(task.action_type);
}

export function collectionTaskStatus(task: CollectionTask): string {
  if (task.assignee === "internal" && ["open", "requested", "in_review", "unavailable", "escalated"].includes(task.status)) return "Team review";
  return ({ open: "Waiting on client", requested: "Asked · waiting on client", completed: "Complete", in_review: "Received · under review", paused: "Paused", unavailable: "Staff follow-up", escalated: "Staff follow-up", cancelled: "No longer needed" })[task.status];
}

/** A scope/review update can change to-dos without changing a raw requirement status. */
export function collectionTaskReadModelKey(requirements: Array<{ requirement_key: string; status: string; complete?: boolean; state_reason?: string | null; program_overrides?: Record<string, string>; source_program_keys?: string[]; coverage?: unknown; verified_coverage?: unknown; provenance?: Record<string, unknown> }>, context: unknown[] = []): string {
  return JSON.stringify([requirements.map((item) => [item.requirement_key, item.status, item.complete, item.state_reason, item.program_overrides, item.source_program_keys, item.coverage, item.verified_coverage, item.provenance?.credit_collection]), context]);
}
