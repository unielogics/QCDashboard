import { expect, test, type Page } from "@playwright/test";

const BASE_URL = process.env.QC_E2E_BASE_URL ?? "http://localhost:3100";
const INTAKE_ID = "20000000-0000-0000-0000-000000000001";
const PROFILE_ID = "20000000-0000-0000-0000-000000000002";
const LOAN_ID = "20000000-0000-0000-0000-000000000003";

type MoveBody = { target_status: string; expected_status?: string };
const SAVED_ECONOMICS = {
  accepted_amount: 95_000, funded_amount: 80_000,
  forecast_fee_points: 2, forecast_consulting_fee: 500,
  estimated_close_date: "2026-12-01", reviewer_notes: "Keep the saved reviewer notes.",
};

async function mockFile(page: Page, options: { updates?: boolean } = {}) {
  const state = {
    status: "submitted",
    moves: [] as MoveBody[],
    detailReads: [] as string[],
    timelineReads: 0,
    underwritingReads: 0,
    underwritingPatches: [] as Record<string, unknown>[],
    economics: { ...SAVED_ECONOMICS } as Record<string, unknown>,
    audit: [] as Record<string, unknown>[],
    changedName: false,
    raceNextMove: false,
  };
  const name = () => state.changedName ? `Status refresh file · ${state.status}` : "Status refresh file";
  const underwriting = () => ({
    profile_id: PROFILE_ID, source_kind: "intake", source_id: INTAKE_ID,
    loan_id: LOAN_ID, underwriting_status: state.status,
    approved_amount: null, term_sheet_amount: null, current_dscr: null,
    target_dscr: null, approved_dscr: null, close_outcome: null,
    updated_by_user_id: null, updated_at: null,
    ...state.economics,
  });

  await page.context().addCookies([{ name: "qc_visual_qa_user", value: "franco@qualifiedcommercial.com", url: BASE_URL }]);
  await page.route(/\/api\/v1\//, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/\/+$/, "");
    let status = 200;
    let body: unknown = [];
    if (path.endsWith("/auth/me")) {
      body = {
        id: "10000000-0000-0000-0000-000000000001", clerk_id: "visual-qa",
        email: "franco@qualifiedcommercial.com", name: "Visual QA", role: "super_admin",
      };
    } else if (path.endsWith(`/admin/ai-underwriter-leads/${INTAKE_ID}`)) {
      state.detailReads.push(state.status);
      body = {
        application_profile_id: PROFILE_ID,
        intake: {
          id: INTAKE_ID, variant: "real_estate_dscr_v1", bucket_id: "test-bucket",
          bucket_name: "Client application", full_name: "Jane Client",
          business_name: name(), email: "jane@example.com", phone: null,
          status: state.status === "closed_lost" || state.status === "denied" ? "denied" : "collecting",
          underwriting_status: state.status,
          outcome_status: state.status === "closed_lost" ? "closed" : state.status === "denied" ? "denied" : "submitted",
          preferred_language: "en", booking_recommended: false, call_booked: false,
          file_count: 0, missing_required_count: 0, requested_loan_amount: 100_000,
          created_at: "2026-11-09T15:00:00Z", updated_at: "2026-11-09T15:00:00Z",
        },
        files: [], requested_documents: [], messages: [], artifacts: [], notes: [], email_sends: [],
      };
    } else if (path.endsWith("/application-profiles/resolve")) {
      body = { id: PROFILE_ID, intake_id: INTAKE_ID, loan_id: LOAN_ID, vertical: "real_estate", underwriting_status: state.status };
    } else if (path.endsWith(`/application-profiles/${PROFILE_ID}/underwriting`)) {
      if (request.method() === "PATCH") {
        const patch = request.postDataJSON() as Record<string, unknown>;
        state.underwritingPatches.push(patch);
        Object.assign(state.economics, patch);
      } else {
        state.underwritingReads += 1;
      }
      body = underwriting();
    } else if (path.endsWith(`/operator-files/intake/${INTAKE_ID}/pipeline-move`)) {
      const move = request.postDataJSON() as MoveBody;
      state.moves.push(move);
      if (state.raceNextMove) {
        state.raceNextMove = false;
        state.status = "denied";
        state.changedName = true;
      }
      if (move.expected_status !== state.status) {
        status = 409;
        body = { detail: `File moved from ${move.expected_status} to ${state.status}; refresh and try again` };
      } else {
        state.status = move.target_status;
        state.changedName = true;
        state.audit.unshift({
          id: `move-${state.moves.length}`, source: "application_profile",
          summary: `Moved to ${state.status}`, actor_name: "Visual QA", actor_role: "super_admin",
          occurred_at: "2026-11-12T15:00:00Z",
        });
        body = {
          source_kind: "intake", source_id: INTAKE_ID, profile_id: PROFILE_ID,
          underwriting_status: state.status, loan_id: LOAN_ID, loan_stage: "underwriting",
          created_loan: false, audit_id: null,
        };
      }
    } else if (path.endsWith(`/application-profiles/${PROFILE_ID}/audit`)) {
      body = state.audit;
    } else if (path.endsWith(`/application-profiles/${PROFILE_ID}/timeline`)) {
      state.timelineReads += 1;
      body = {
        tier: "desk", unread_count: state.audit.length,
        events: state.audit.map((event) => ({
          schema: "file_event.v1", id: event.id, profile_id: PROFILE_ID,
          kind: "status.changed", visibility: "client", title: event.summary,
          body: null, actor_label: "Visual QA", target_type: "application_profile",
          target_id: PROFILE_ID, meta: {}, created_at: event.occurred_at,
        })),
      };
    } else if (path.endsWith(`/application-profiles/${PROFILE_ID}/program-readiness`)) {
      body = { profile_id: PROFILE_ID, programs: [], selections: [], requirements: [], required_documents: [], missing_documents: [], can_advance: false, automation: { enabled: false, eligible: false, next_requirement_key: null, stop_reason: null } };
    } else if (path.endsWith("/operator-files/link-options")) {
      body = { buckets: [], intakes: [] };
    } else if (path.endsWith("/operator-files")) {
      body = { items: [], rollup: { total: 0, needs_attention: 0, promoted: 0 }, limit: 500, filters: {} };
    } else if (path.endsWith("/settings")) {
      body = { data: {} };
    } else if (path.endsWith("/me/booking-link")) {
      body = { enabled: false, slug: null, url: null };
    }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto(`/files/${INTAKE_ID}?section=${options.updates ? "communications&channel=updates" : "timeline"}`, { waitUntil: "domcontentloaded" });
  const select = page.getByRole("combobox", { name: "Underwriting lifecycle status" });
  await expect(select).toBeEnabled();
  await expect(select).toHaveValue("submitted");
  return { state, select };
}

test("uses the latest status and immediately refreshes the file after consecutive changes", async ({ page }) => {
  const { state, select } = await mockFile(page);
  await expect(page.getByText("No audited file activity yet.")).toBeVisible();
  // The factual header has the canonical status before lazy underwriting loads.
  expect(state.underwritingReads).toBe(0);

  // Another operation has moved the file after this page's initial read.
  state.status = "collecting_docs";
  const initialReads = state.detailReads.length;
  await select.selectOption("in_underwriting");

  await expect(select).toBeEnabled();
  await expect(select).toHaveValue("in_underwriting");
  expect(state.moves).toHaveLength(1);
  expect(state.moves[0]).toMatchObject({ target_status: "in_underwriting", expected_status: "collecting_docs" });
  expect(state.underwritingPatches).toHaveLength(0);
  expect(state.economics).toEqual(SAVED_ECONOMICS);
  await expect(page.getByRole("heading", { name: "Status refresh file · in_underwriting", exact: true })).toBeVisible();
  expect(state.detailReads.length).toBeGreaterThan(initialReads);
  expect(state.detailReads.at(-1)).toBe("in_underwriting");
  await expect(page.getByText("Moved to in_underwriting", { exact: true })).toBeVisible();

  await select.selectOption("closed_lost");
  await expect(select).toBeEnabled();
  await expect(select).toHaveValue("closed_lost");
  expect(state.moves).toHaveLength(2);
  expect(state.moves[1]).toMatchObject({ target_status: "closed_lost", expected_status: "in_underwriting" });
  await expect(page.getByRole("heading", { name: "Status refresh file · closed_lost", exact: true })).toBeVisible();
  expect(state.detailReads.at(-1)).toBe("closed_lost");
  await expect(page.getByText("Moved to closed_lost", { exact: true })).toBeVisible();
  expect(state.underwritingPatches).toHaveLength(0);
  expect(state.economics).toEqual(SAVED_ECONOMICS);
});

test("refreshes a racing conflict to the canonical status without retrying the move", async ({ page }) => {
  const { state, select } = await mockFile(page);
  state.raceNextMove = true;
  const initialReads = state.detailReads.length;
  await select.selectOption("collecting_docs");

  await expect(select).toBeEnabled();
  await expect(select).toHaveValue("denied");
  await expect(page.getByRole("heading", { name: "Status refresh file · denied", exact: true })).toBeVisible();
  expect(state.detailReads.length).toBeGreaterThan(initialReads);
  expect(state.detailReads.at(-1)).toBe("denied");
  expect(state.moves).toEqual([expect.objectContaining({ target_status: "collecting_docs", expected_status: "submitted" })]);
  await expect(page.getByText(/File moved from submitted to denied; refresh and try again/).first()).toBeVisible();
  expect(state.economics).toEqual(SAVED_ECONOMICS);

  // Recovering a lazy first-open conflict must not leave an empty economics
  // draft that clears persisted figures on the next legitimate change.
  await select.selectOption("closed_lost");
  await expect(select).toBeEnabled();
  await expect(select).toHaveValue("closed_lost");
  expect(state.moves).toHaveLength(2);
  expect(state.moves[1]).toMatchObject({ target_status: "closed_lost", expected_status: "denied" });
  expect(state.underwritingPatches).toHaveLength(0);
  expect(state.economics).toEqual(SAVED_ECONOMICS);
});

test("refreshes the open Updates timeline as soon as the status is saved", async ({ page }) => {
  const { state, select } = await mockFile(page, { updates: true });
  await expect(page.getByText("Nothing on this file yet.")).toBeVisible();
  const initialReads = state.timelineReads;

  await select.selectOption("in_underwriting");

  // The timeline normally polls every 30 seconds; this must arrive on save.
  await expect(page.getByText("Moved to in_underwriting", { exact: true })).toBeVisible();
  await expect(select).toBeEnabled();
  expect(state.timelineReads).toBeGreaterThan(initialReads);
  await expect(page.getByRole("tab", { name: "Updates", exact: true })).toHaveAttribute("aria-selected", "true");
});
