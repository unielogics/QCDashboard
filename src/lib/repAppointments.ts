export type RepAppointmentOutcome = "not_converted" | "did_not_show" | "converted";
export type ClientRsvpStatus = "needs_action" | "accepted" | "tentative" | "declined" | "unknown";
export type AppointmentCrmStatus =
  | "scheduled"
  | "confirmed"
  | "completed"
  | "follow_up"
  | "no_show"
  | "not_qualified"
  | "converted"
  | "cancelled";

export interface RepAppointment {
  id: string;
  dealer_id: string | null;
  owner_user_id: string | null;
  calendar_event_id: string | null;
  contact_id: string | null;
  kind: string;
  title: string;
  starts_at: string;
  duration_min: number;
  timezone: string;
  invitee_name: string;
  invitee_email: string | null;
  invitee_phone: string | null;
  company: string | null;
  program_key: string | null;
  program_name: string | null;
  requested_amount: string | null;
  full_address: string | null;
  /** The address as typed; full_address is the joined display string. */
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  join_url: string | null;
  meeting_mode: "video" | "phone" | "in_person";
  location: string | null;
  notes: string | null;
  status: "pending" | "confirmed" | "cancelled" | "done";
  client_rsvp_status: ClientRsvpStatus;
  client_rsvp_at: string | null;
  rsvp_checked_at: string | null;
  booked_by_user_id: string | null;
  outcome: RepAppointmentOutcome | null;
  outcome_note: string | null;
  outcome_at: string | null;
  archived_at: string | null;
  cancellation_reason: string | null;
  conversion_target: "field_desk" | "ai_intake" | "funding_loan" | null;
  /** Where the booking came from: field_desk | calendar | public | intake; null before origins existed. */
  origin: string | null;
  /** Pre-call prep on the draft file this booking opened; null before the feature or when disabled. */
  precall: AppointmentPrecall | null;
  room_url: string | null;
  /** Plaintext only on the create response that minted it. */
  room_passcode: string | null;
  converted_dealer_id: string | null;
  converted_intake_id: string | null;
  linked_loan_id: string | null;
  crm_status: AppointmentCrmStatus;
  follow_up_at: string | null;
  crm_updated_at: string | null;
  crm_updated_by_user_id: string | null;
  workflow_outcome_definition_id: string | null;
  workflow_outcome_label: string | null;
  workflow_outcome_effects: string[] | null;
  workflow_outcome_results: Record<string, unknown> | null;
  workflow_outcome_applied_at: string | null;
  workflow_outcome_by_user_id: string | null;
  confirmation_email_status: string | null;
  confirmation_sms_status: string | null;
  email_reminder_status: string | null;
  sms_reminder_status: string | null;
  google_sync_status: string | null;
  rep_notification_status: string | null;
  rep_reminder_status: string | null;
  delivery_error: string | null;
  notification_results: Record<string, string> | null;
  created_at: string;
  updated_at: string;
}

export interface AppointmentActivity {
  id: string;
  appointment_id: string;
  event_type: string;
  body: string | null;
  actor_user_id: string | null;
  actor_name: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
}

export interface AppointmentApplicationSummary {
  intake_id: string;
  profile_id: string | null;
  loan_id: string | null;
  vertical: string;
  underwriting_status: string;
  is_draft: boolean;
  ready_for_step_2: boolean;
  unlocked: boolean;
  blockers: string[];
}

export interface AppointmentApplicationCandidate {
  intake_id: string;
  variant: string;
  business_name: string | null;
  full_name: string;
  email: string;
  status: string;
  created_at: string;
}

export interface AppointmentFundingSummary {
  loan_id: string;
  deal_id: string;
  client_id: string;
  stage: string;
  amount: number | null;
  entity_name: string | null;
  address: string | null;
}

export interface AppointmentBookingDataReview {
  field: string;
  label: string;
  current_value: string | null;
  proposed_value: string | null;
  status: "matches" | "missing_in_file" | "conflict" | "file_only" | "empty" | "unlinked";
  target_kind: "intake" | "loan" | null;
}

export interface AppointmentPrecallReadiness {
  ownership_complete: boolean;
  ownership_total: number;
  contact_complete: boolean;
  bank_complete: boolean;
  bank_detail: string;
  credit_complete: boolean;
  credit_required: number;
  credit_done: number;
  complete: boolean;
  done_count: number;
  missing: string[];
}

export interface AppointmentPrecallStep {
  id: string;
  step_key: string | null;
  channel: string;
  due_at: string;
  status: string;
  sent_at: string | null;
  detail: string | null;
  rendered_body: string | null;
}

export interface AppointmentPrecall {
  status: "in_progress" | "complete" | "stopped" | "disabled";
  dealer_id: string | null;
  case_ref: string | null;
  lifecycle: string | null;
  room_url: string | null;
  pin_delivered_via: string | null;
  completed_at: string | null;
  stopped_at: string | null;
  stop_reason: string | null;
  next_step_at: string | null;
  readiness: AppointmentPrecallReadiness | null;
  steps: AppointmentPrecallStep[];
}

export interface AppointmentDraftFile {
  dealer_id: string;
  case_ref: string | null;
  name: string;
  lifecycle: string;
  status: string;
  draft_source: string | null;
  href: string;
}

export interface AppointmentWorkspace {
  appointment: RepAppointment;
  activities: AppointmentActivity[];
  application: AppointmentApplicationSummary | null;
  funding_file: AppointmentFundingSummary | null;
  application_candidates: AppointmentApplicationCandidate[];
  booking_data_review: AppointmentBookingDataReview[];
  draft_file: AppointmentDraftFile | null;
  capabilities: {
    can_edit: boolean;
    can_add_notes: boolean;
    can_manage_crm: boolean;
    can_start_application: boolean;
    can_retry_delivery: boolean;
    can_manage_outcomes: boolean;
    can_manage_outcome_catalog: boolean;
    can_link_files: boolean;
    can_create_funding_loan: boolean;
    can_manage_precall: boolean;
  };
}

export type CalendarWorkspaceEventType = "appointment" | "internal";
export type CalendarAppointmentKind =
  | "intro_call"
  | "underwriting_review"
  | "document_review"
  | "signing"
  | "lender_call";

export interface CalendarWorkspaceEvent {
  id: string;
  event_type: CalendarWorkspaceEventType;
  appointment_id: string | null;
  calendar_event_id: string | null;
  loan_id: string | null;
  title: string;
  kind: string;
  starts_at: string;
  ends_at: string;
  status: string;
  crm_status: AppointmentCrmStatus | null;
  invitee_name: string | null;
  company: string | null;
  meeting_mode: string | null;
  join_url: string | null;
  has_outcome: boolean;
  color: string;
  can_edit: boolean;
}

export interface CalendarWorkspace {
  range_start: string;
  range_end: string;
  timezone: string;
  events: CalendarWorkspaceEvent[];
  metrics: {
    appointments: number;
    outcome_logged: number;
    awaiting_outcome: number;
    files_created: number;
  };
  appointment_types: Array<{ key: CalendarAppointmentKind; label: string; count: number }>;
  capabilities: {
    can_create: boolean;
    can_manage_all: boolean;
    can_drag: boolean;
    can_create_funding_loan: boolean;
    can_manage_appointment_crm: boolean;
    can_apply_outcomes: boolean;
    can_manage_outcome_catalog: boolean;
  };
}

export type AppointmentOutcomeEffect =
  | "log_activity"
  | "file_action"
  | "schedule_follow_up"
  | "request_documents"
  | "send_no_show_rebooking"
  | "close_enquiry";

export interface AppointmentOutcomeDefinition {
  id: string;
  owner_user_id: string | null;
  scope: "personal" | "shared";
  name: string;
  description: string | null;
  color: string;
  target_crm_status: AppointmentCrmStatus;
  effects: AppointmentOutcomeEffect[];
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type AppointmentFileAction =
  | "none"
  | "update_linked"
  | "link_existing"
  | "create_ai_intake"
  | "create_funding_loan"
  | "promote_draft";

export interface AppointmentFileOption {
  kind: "intake" | "loan" | "dealer";
  id: string;
  label: string;
  subtitle: string | null;
  status: string;
  href: string;
}

export interface ApplyAppointmentOutcomeRequest {
  outcome_definition_id: string;
  note?: string | null;
  follow_up_at?: string | null;
  idempotency_key: string;
  confirm: boolean;
  file_action: AppointmentFileAction;
  existing_file_kind?: "intake" | "loan" | "dealer" | null;
  existing_file_id?: string | null;
  variant?: "dealer" | "real_estate" | "main_street" | "mca_refinance" | null;
  secure_room_pin?: string | null;
  notify_client: boolean;
  apply_booking_data: boolean;
  requested_document_keys: string[];
}

export interface AppointmentActionResult {
  action: string;
  status: "completed" | "skipped" | "failed" | "pending";
  detail: string | null;
  href: string | null;
}

export interface ApplyAppointmentOutcomeResult {
  appointment_id: string;
  outcome_definition_id: string;
  outcome_label: string;
  crm_status: AppointmentCrmStatus;
  idempotent_replay: boolean;
  actions: AppointmentActionResult[];
  workspace: AppointmentWorkspace;
  attempted_at: string;
}

export interface AppointmentApplicationStartRequest {
  variant: "dealer" | "real_estate" | "main_street" | "mca_refinance";
  secure_room_pin?: string | null;
  notify_client: boolean;
  existing_intake_id?: string | null;
}

export interface AppointmentApplicationStartResult {
  intake_id: string;
  profile_id: string;
  loan_id: string | null;
  created: boolean;
  linked_existing: boolean;
  href: string;
  room_delivery_status: string | null;
  room_delivery_detail: string | null;
}

export function appointmentCrmLabel(status: AppointmentCrmStatus): string {
  return {
    scheduled: "Scheduled",
    confirmed: "Confirmed",
    completed: "Completed",
    follow_up: "Follow-up",
    no_show: "No-show",
    not_qualified: "Not qualified",
    converted: "Converted",
    cancelled: "Cancelled",
  }[status];
}

export function appointmentRsvpLabel(
  appointment: Pick<RepAppointment, "status" | "client_rsvp_status">,
): string {
  if (appointment.status === "cancelled") return "Cancelled";
  if (appointment.client_rsvp_status === "accepted") return "Confirmed";
  if (appointment.client_rsvp_status === "needs_action") return "Invitation sent - awaiting response";
  if (appointment.client_rsvp_status === "tentative") return "Tentative";
  if (appointment.client_rsvp_status === "declined") return "Declined";
  return "Confirmation unknown";
}

export function appointmentRsvpTone(
  appointment: Pick<RepAppointment, "status" | "client_rsvp_status">,
): "ok" | "warn" | "acc" | "bad" | "mut" {
  if (appointment.status === "cancelled") return "mut";
  if (appointment.client_rsvp_status === "accepted") return "ok";
  if (appointment.client_rsvp_status === "needs_action") return "warn";
  if (appointment.client_rsvp_status === "tentative") return "acc";
  if (appointment.client_rsvp_status === "declined") return "bad";
  return "mut";
}

export function outcomeLabel(outcome: RepAppointmentOutcome | null): string | null {
  if (outcome === "not_converted") return "Not converted";
  if (outcome === "did_not_show") return "Did not show";
  if (outcome === "converted") return "Converted";
  return null;
}
