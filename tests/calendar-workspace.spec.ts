import { expect, test, type Page } from "@playwright/test";

const BASE_URL = process.env.QC_E2E_BASE_URL ?? "http://localhost:3100";
const USER_ID = "10000000-0000-0000-0000-000000000001";
const EVENT_ID = "20000000-0000-0000-0000-000000000001";
const APPOINTMENT_ID = "30000000-0000-0000-0000-000000000001";

test.beforeEach(async ({ context, page }) => {
  await context.addCookies([{
    name: "qc_visual_qa_user",
    value: "admin@qualifiedcommercial.com",
    url: BASE_URL,
  }]);
  await mockCalendarApis(page);
});

test("appointment click opens the CRM workspace with join-call and notes actions", async ({ page }) => {
  await page.goto("/calendar", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Program intro: Robert", { exact: true })).toBeVisible();

  await page.getByText("Program intro: Robert", { exact: true }).click();

  const dialog = page.getByRole("dialog", { name: /Appointment workspace for Robert/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Join meeting" })).toHaveAttribute("href", "https://meet.google.com/abc-defg-hij");
  await expect(dialog.getByRole("tab", { name: /Overview/ })).toBeVisible();
  await expect(dialog.getByRole("tab", { name: /CRM/ })).toBeVisible();
  await expect(dialog.getByRole("tab", { name: /Application/ })).toBeVisible();
  await expect(dialog.getByRole("tab", { name: /Delivery/ })).toBeVisible();

  await dialog.getByRole("tab", { name: /CRM/ }).click();
  await expect(dialog.getByLabel("Internal note")).toBeVisible();
  await dialog.getByLabel("Internal note").fill("Reviewed requested amount and next steps.");
  await expect(dialog.getByRole("button", { name: "Add note" })).toBeEnabled();
  await assertNoHorizontalOverflow(page, ".appointment-workspace");
});

test("booking settings add a recurring break to selected weekdays", async ({ page }) => {
  await page.goto("/settings?section=booking", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Blocked times" })).toBeVisible();
  await expect(page.getByText("0 scheduled", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Add blocked time" }).click();

  await expect(page.getByText("5 scheduled", { exact: true })).toBeVisible();
  for (const weekday of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]) {
    await expect(page.getByText(weekday, { exact: true })).toBeVisible();
  }
  await expect(page.getByLabel("Start").nth(1)).toHaveValue("14:00");
  await expect(page.getByLabel("End").nth(1)).toHaveValue("16:00");
  await assertNoHorizontalOverflow(page, ".booking-block-editor");
});

async function mockCalendarApis(page: Page) {
  const startsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const updatedAt = new Date().toISOString();
  const appointment = {
    id: APPOINTMENT_ID,
    dealer_id: null,
    owner_user_id: USER_ID,
    calendar_event_id: EVENT_ID,
    contact_id: null,
    kind: "program_intro",
    title: "Program intro: Robert",
    starts_at: startsAt,
    duration_min: 20,
    timezone: "America/New_York",
    invitee_name: "Robert",
    invitee_email: "robert@example.com",
    invitee_phone: "2015550188",
    company: "Blue Moon Spa",
    program_key: "general_funding_discussion",
    program_name: "General funding discussion",
    requested_amount: "25000",
    full_address: "45 West Pleasant Avenue, Maywood NJ 07607",
    join_url: "https://meet.google.com/abc-defg-hij",
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
    crm_status: "scheduled",
    follow_up_at: null,
    crm_updated_at: updatedAt,
    crm_updated_by_user_id: USER_ID,
    confirmation_email_status: "sent",
    confirmation_sms_status: "failed",
    email_reminder_status: "pending",
    sms_reminder_status: "pending",
    google_sync_status: "connected",
    rep_notification_status: "sent",
    rep_reminder_status: "pending",
    delivery_error: "SMS provider is not available in this test.",
    notification_results: {},
    created_at: updatedAt,
    updated_at: updatedAt,
  };
  const bookingSettings = {
    id: "40000000-0000-0000-0000-000000000001",
    user_id: USER_ID,
    enabled: true,
    slug: "visual-qa",
    title: "Book a meeting",
    intro: "Choose a time.",
    primary_color: "#1b4b9e",
    background_color: "#ffffff",
    duration_min: 20,
    buffer_before_min: 5,
    buffer_after_min: 5,
    confirmation_email_enabled: true,
    confirmation_sms_enabled: true,
    reminder_email_enabled: true,
    reminder_email_minutes_before: 1440,
    reminder_email_minutes: [1440],
    reminder_sms_enabled: true,
    reminder_sms_minutes_before: 120,
    reminder_sms_minutes: [120],
    google_meet_enabled: true,
    timezone: "America/New_York",
    available_days: [1, 2, 3, 4, 5],
    blocked_intervals: [],
    start_time: "09:00",
    end_time: "17:00",
    logo_s3_key: null,
    profile_photo_s3_key: null,
    logo_url: null,
    profile_photo_url: null,
    created_at: updatedAt,
    updated_at: updatedAt,
  };

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/v1/, "");
    let body: unknown = {};

    if (path === "/auth/me") {
      body = {
        id: USER_ID,
        clerk_id: "visual-qa",
        email: "admin@qualifiedcommercial.com",
        name: "Visual QA",
        role: "super_admin",
        account_types: ["funding", "audit"],
        account_status: "active",
        can_access_funding: true,
        can_access_audit: true,
      };
    } else if (path === "/calendar") {
      body = [{
        id: EVENT_ID,
        loan_id: null,
        kind: "call",
        title: appointment.title,
        description: appointment.notes,
        who: "Robert <robert@example.com>",
        starts_at: startsAt,
        duration_min: 20,
        status: "pending",
        source: "manual",
        owner_user_id: USER_ID,
      }];
    } else if (path === "/calendar/activity") {
      body = [];
    } else if (path === "/dealer-os/appointments") {
      body = [appointment];
    } else if (path === `/dealer-os/appointments/${APPOINTMENT_ID}/workspace`) {
      body = {
        appointment,
        activities: [{
          id: "50000000-0000-0000-0000-000000000001",
          appointment_id: APPOINTMENT_ID,
          event_type: "appointment_created",
          body: "Appointment created",
          actor_user_id: USER_ID,
          actor_name: "Visual QA",
          before: null,
          after: { crm_status: "scheduled" },
          created_at: updatedAt,
        }],
        application: null,
        application_candidates: [],
        capabilities: {
          can_edit: true,
          can_add_notes: true,
          can_manage_crm: true,
          can_start_application: true,
          can_retry_delivery: true,
        },
      };
    } else if (path === "/me/booking-settings") {
      body = bookingSettings;
    } else if (path === "/me/booking-link") {
      body = { enabled: true, slug: "visual-qa", url: `${BASE_URL}/book/visual-qa` };
    } else if (path === "/google/connection") {
      body = { connected: true, oauth_configured: true, google_email: "admin@qualifiedcommercial.com", gmail_connected: true, calendar_connected: true, drive_connected: true, scopes: [] };
    } else if (["/clients", "/ai-tasks", "/documents", "/loans"].includes(path)) {
      body = [];
    } else if (path === "/contracts/platform-access/status") {
      body = { required: false };
    } else if (path === "/settings") {
      body = { data: {} };
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

async function assertNoHorizontalOverflow(page: Page, scopeSelector: string) {
  const geometry = await page.evaluate((selector) => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    clipped: Array.from(document.querySelector(selector)?.querySelectorAll<HTMLElement>("button, input, select, textarea") ?? [])
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return !element.closest(".seg")
          && rect.width > 0
          && rect.left < document.documentElement.clientWidth
          && rect.right > document.documentElement.clientWidth + 1;
      })
      .map((element) => element.getAttribute("aria-label") || element.textContent?.trim() || element.tagName)
      .slice(0, 8),
  }), scopeSelector);
  expect(geometry.document).toBeLessThanOrEqual(geometry.viewport + 1);
  expect(geometry.clipped).toEqual([]);
}
