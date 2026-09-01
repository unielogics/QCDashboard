import { expect, test, type Page } from "@playwright/test";

const BASE_URL = process.env.QC_E2E_BASE_URL ?? "http://localhost:3100";
const USER_ID = "10000000-0000-0000-0000-000000000001";
const EVENT_ID = "20000000-0000-0000-0000-000000000001";
const APPOINTMENT_ID = "30000000-0000-0000-0000-000000000001";
const OUTCOME_ID = "40000000-0000-0000-0000-000000000001";

test.beforeEach(async ({ context, page }) => {
  await context.addCookies([{
    name: "qc_visual_qa_user",
    value: "admin@qualifiedcommercial.com",
    url: BASE_URL,
  }]);
  await mockCalendarV2Apis(page);
});

test("renders month, week, and list views with appointment-first controls", async ({ page }) => {
  await page.goto("/calendar-v2", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Calendar", exact: true })).toBeVisible();
  await expect(page.getByText("Program intro: Robert", { exact: true })).toBeVisible();
  await expect(page.getByText("1 appointments", { exact: true })).toBeVisible();
  await expect(page.getByText("1 awaiting outcome", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Week", exact: true }).click();
  await expect(page.locator(".fc-timeGridWeek-view")).toBeVisible();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.locator(".fc-listMonth-view")).toBeVisible();
  await page.getByRole("button", { name: "Month", exact: true }).click();
  await expect(page.locator(".fc-dayGridMonth-view")).toBeVisible();
  await assertNoHorizontalOverflow(page, ".calendar-v2-page");
});

test("opens the full-screen CRM, joins the call, and records notes", async ({ page }) => {
  await page.goto(`/calendar-v2?appointment=${APPOINTMENT_ID}`, { waitUntil: "domcontentloaded" });
  const dialog = page.getByRole("dialog", { name: "Program intro: Robert" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Join meeting" })).toHaveAttribute("href", "https://meet.google.com/abc-defg-hij");
  await expect(dialog.getByRole("button", { name: "Overview", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Notes", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Outcome", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "File", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Edit", exact: true })).toBeVisible();

  await dialog.getByRole("button", { name: "Notes", exact: true }).click();
  await dialog.getByLabel("Note").fill("Reviewed requested amount, timeline, and missing evidence.");
  await dialog.getByRole("button", { name: "Add note" }).click();
  await expect(dialog.getByText("Reviewed requested amount, timeline, and missing evidence.")).toBeVisible();
  await assertNoHorizontalOverflow(page, ".calendar-v2-workspace");
});

test("edits recurring breaks and one-date exceptions from Calendar V2 settings", async ({ page }) => {
  await page.goto("/calendar-v2", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Calendar settings" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Hours" }).click();
  await dialog.getByRole("button", { name: "Add break" }).click();
  await dialog.getByRole("button", { name: "Add exception" }).click();
  await expect(dialog.locator('input[value="14:00"]')).toBeVisible();
  await expect(dialog.locator('input[value="16:00"]')).toBeVisible();
  await expect(dialog.locator('input[value="Unavailable"]')).toBeVisible();
  await assertNoHorizontalOverflow(page, ".calendar-v2-settings");
});

test("dragging an appointment sends a reviewed reschedule and keeps the event on success", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-390", "Touch users reschedule from the Edit tab; pointer drag is validated at desktop widths.");
  await page.goto("/calendar-v2", { waitUntil: "domcontentloaded" });
  const event = page.locator(".fc-daygrid-event").filter({ hasText: "Program intro: Robert" }).first();
  await expect(event).toBeVisible();
  const box = await event.boundingBox();
  const sourceCell = event.locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' fc-daygrid-day ')]").first();
  const sourceDate = await sourceCell.getAttribute("data-date");
  expect(sourceDate).toBeTruthy();
  const targetDate = new Date(`${sourceDate}T12:00:00`);
  targetDate.setDate(targetDate.getDate() - 1);
  const targetDateKey = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, "0")}-${String(targetDate.getDate()).padStart(2, "0")}`;
  const targetCell = page.locator(`.fc-daygrid-day[data-date="${targetDateKey}"]`);
  const targetBox = await targetCell.boundingBox();
  expect(box).not.toBeNull();
  expect(targetBox).not.toBeNull();
  const requestPromise = page.waitForRequest((request) => (
    request.method() === "PATCH" && request.url().includes(`/dealer-os/appointments/${APPOINTMENT_ID}`)
  ));
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(150);
  await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + 42, { steps: 20 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  const request = await requestPromise;
  const payload = request.postDataJSON() as { starts_at: string; duration_min: number };
  expect(payload.starts_at).toBeTruthy();
  expect(payload.duration_min).toBe(30);
  await expect(page.getByText("Appointment updated and calendar synchronization completed.")).toBeVisible();
});

async function mockCalendarV2Apis(page: Page) {
  const now = new Date();
  const startsAtDate = new Date(now.getFullYear(), now.getMonth(), 15, 10, 0, 0, 0);
  const startsAt = startsAtDate.toISOString();
  const endsAt = new Date(startsAtDate.getTime() + 30 * 60_000).toISOString();
  const updatedAt = now.toISOString();
  let activities = [{
    id: "50000000-0000-0000-0000-000000000001",
    appointment_id: APPOINTMENT_ID,
    event_type: "appointment_created",
    body: "Appointment created",
    actor_user_id: USER_ID,
    actor_name: "Visual QA",
    before: null,
    after: { crm_status: "scheduled" },
    created_at: updatedAt,
  }];
  const appointment = {
    id: APPOINTMENT_ID,
    dealer_id: null,
    owner_user_id: USER_ID,
    calendar_event_id: EVENT_ID,
    contact_id: null,
    kind: "intro_call",
    title: "Program intro: Robert",
    starts_at: startsAt,
    duration_min: 30,
    timezone: "America/New_York",
    invitee_name: "Robert",
    invitee_email: "robert@example.com",
    invitee_phone: "+12015550188",
    company: "Blue Moon Spa",
    program_key: "general_funding_discussion",
    program_name: "General funding discussion",
    requested_amount: "25000",
    full_address: "45 West Pleasant Avenue, Maywood NJ 07607",
    join_url: "https://meet.google.com/abc-defg-hij",
    meeting_mode: "video",
    location: null,
    notes: "Client wants to review funding options.",
    status: "pending",
    client_rsvp_status: "needs_action",
    client_rsvp_at: null,
    rsvp_checked_at: null,
    booked_by_user_id: USER_ID,
    outcome: null,
    outcome_note: null,
    outcome_at: null,
    archived_at: null,
    cancellation_reason: null,
    conversion_target: null,
    converted_dealer_id: null,
    converted_intake_id: null,
    linked_loan_id: null,
    crm_status: "scheduled",
    follow_up_at: null,
    crm_updated_at: updatedAt,
    crm_updated_by_user_id: USER_ID,
    workflow_outcome_definition_id: null,
    workflow_outcome_label: null,
    workflow_outcome_effects: null,
    workflow_outcome_results: null,
    workflow_outcome_applied_at: null,
    workflow_outcome_by_user_id: null,
    confirmation_email_status: "sent",
    confirmation_sms_status: "disabled",
    email_reminder_status: "pending",
    sms_reminder_status: "disabled",
    google_sync_status: "connected",
    rep_notification_status: "sent",
    rep_reminder_status: "pending",
    delivery_error: null,
    notification_results: {},
    created_at: updatedAt,
    updated_at: updatedAt,
  };
  const bookingSettings = {
    id: "60000000-0000-0000-0000-000000000001",
    user_id: USER_ID,
    enabled: true,
    slug: "visual-qa",
    title: "Book a meeting",
    intro: "Choose a time.",
    primary_color: "#1b4b9e",
    background_color: "#ffffff",
    duration_min: 30,
    buffer_before_min: 5,
    buffer_after_min: 5,
    confirmation_email_enabled: true,
    confirmation_sms_enabled: false,
    reminder_email_enabled: true,
    reminder_email_minutes_before: 1440,
    reminder_email_minutes: [1440],
    reminder_sms_enabled: false,
    reminder_sms_minutes_before: 120,
    reminder_sms_minutes: [120],
    google_meet_enabled: true,
    timezone: "America/New_York",
    available_days: [1, 2, 3, 4, 5],
    blocked_intervals: [],
    booking_questions: { business_name: true, phone: true, requested_amount: true, bank_statement: false },
    no_show_follow_up_enabled: true,
    morning_digest_enabled: true,
    missing_outcome_reminder_hours: 48,
    start_time: "09:00",
    end_time: "17:00",
    logo_s3_key: null,
    profile_photo_s3_key: null,
    logo_url: null,
    profile_photo_url: null,
    created_at: updatedAt,
    updated_at: updatedAt,
  };
  const event = {
    id: `appointment:${APPOINTMENT_ID}`,
    event_type: "appointment",
    appointment_id: APPOINTMENT_ID,
    calendar_event_id: EVENT_ID,
    loan_id: null,
    title: appointment.title,
    kind: "intro_call",
    starts_at: startsAt,
    ends_at: endsAt,
    status: "pending",
    crm_status: "scheduled",
    invitee_name: "Robert",
    company: "Blue Moon Spa",
    meeting_mode: "video",
    join_url: appointment.join_url,
    has_outcome: false,
    color: "blue",
    can_edit: true,
  };

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/v1/, "");
    let body: unknown = {};

    if (path === "/auth/me") {
      body = { id: USER_ID, clerk_id: "visual-qa", email: "admin@qualifiedcommercial.com", name: "Visual QA", role: "super_admin", account_types: ["funding", "audit"], account_status: "active", can_access_funding: true, can_access_audit: true };
    } else if (path === "/calendar/workspace") {
      body = {
        range_start: url.searchParams.get("from"),
        range_end: url.searchParams.get("to"),
        timezone: "America/New_York",
        events: [event],
        metrics: { appointments: 1, outcome_logged: 0, awaiting_outcome: 1, files_created: 0 },
        appointment_types: [
          { key: "intro_call", label: "Intro call", count: 1 },
          { key: "underwriting_review", label: "Underwriting review", count: 0 },
          { key: "document_review", label: "Document review", count: 0 },
          { key: "signing", label: "Signing", count: 0 },
          { key: "lender_call", label: "Lender call", count: 0 },
        ],
        capabilities: { can_create: true, can_manage_all: true, can_drag: true, can_create_funding_loan: true },
      };
    } else if (path === `/dealer-os/appointments/${APPOINTMENT_ID}/workspace`) {
      body = {
        appointment,
        activities,
        application: null,
        funding_file: null,
        application_candidates: [],
        capabilities: { can_edit: true, can_add_notes: true, can_manage_crm: true, can_start_application: true, can_retry_delivery: true, can_manage_outcomes: true, can_link_files: true, can_create_funding_loan: true },
      };
    } else if (path === `/dealer-os/appointments/${APPOINTMENT_ID}/notes` && request.method() === "POST") {
      const payload = request.postDataJSON() as { body: string };
      const row = { ...activities[0], id: crypto.randomUUID(), event_type: "note_added", body: payload.body, created_at: new Date().toISOString() };
      activities = [row, ...activities];
      body = row;
    } else if (path === `/dealer-os/appointments/${APPOINTMENT_ID}` && request.method() === "PATCH") {
      const payload = request.postDataJSON() as { starts_at?: string; duration_min?: number };
      if (payload.starts_at) appointment.starts_at = payload.starts_at;
      if (payload.duration_min) appointment.duration_min = payload.duration_min;
      body = appointment;
    } else if (path === "/calendar/outcomes") {
      body = [{ id: OUTCOME_ID, owner_user_id: USER_ID, name: "Qualified", description: "Create or update the client file.", color: "green", target_crm_status: "converted", effects: ["log_activity", "file_action"], active: true, sort_order: 0, created_at: updatedAt, updated_at: updatedAt }];
    } else if (path === "/me/booking-settings") {
      body = request.method() === "PATCH" ? { ...bookingSettings, ...(request.postDataJSON() as object) } : bookingSettings;
    } else if (path.endsWith("/file-options") || path === "/dealer-os/calendar/file-options") {
      body = { items: [] };
    } else if (path === "/contracts/platform-access/status") {
      body = { required: false };
    } else if (["/clients", "/ai-tasks", "/documents", "/loans"].includes(path)) {
      body = [];
    } else if (path === "/google/connection") {
      body = {
        connected: true,
        oauth_configured: true,
        google_email: "admin@qualifiedcommercial.com",
        gmail_connected: true,
        calendar_connected: true,
        drive_connected: true,
        scopes: [],
      };
    } else if (path === "/admin/ai-underwriter-leads/messages") {
      body = { items: [], total_unread: 0 };
    } else if (path === "/notifications") {
      body = [];
    } else if (path === "/settings") {
      body = { data: {} };
    }

    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
}

async function assertNoHorizontalOverflow(page: Page, scopeSelector: string) {
  const geometry = await page.evaluate((selector) => {
    const scope = document.querySelector<HTMLElement>(selector);
    return {
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      scopeClient: scope?.clientWidth ?? 0,
      scopeScroll: scope?.scrollWidth ?? 0,
    };
  }, scopeSelector);
  expect(geometry.document).toBeLessThanOrEqual(geometry.viewport + 1);
  expect(geometry.scopeScroll).toBeLessThanOrEqual(geometry.scopeClient + 1);
}
