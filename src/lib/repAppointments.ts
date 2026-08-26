export type RepAppointmentOutcome = "not_converted" | "did_not_show" | "converted";
export type ClientRsvpStatus = "needs_action" | "accepted" | "tentative" | "declined" | "unknown";

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
  join_url: string | null;
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
  conversion_target: "field_desk" | "ai_intake" | null;
  converted_dealer_id: string | null;
  converted_intake_id: string | null;
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
