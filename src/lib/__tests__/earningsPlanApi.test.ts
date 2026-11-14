/** The two ways the plan screens reach the API: what each sends, and how a refusal reads in either. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { clientPlanTransport, isPlanConflict, isPlanIncomplete, PlanError, staffPlanTransport, type DraftFacts } from "@/lib/earningsPlan/api";
import { toWire } from "@/lib/earningsPlan/edit";
import { referenceBody, referenceWorkspace } from "./fixtures/earningsPlanReferencePlan";

const FACTS: DraftFacts = { familyId: "family-1", revision: 7, baseVersionId: "version-1" };
const body = toWire(referenceBody());

function staff(reply: unknown = referenceWorkspace()) {
  const calls: Array<{ path: string; method: string; body: Record<string, unknown> | null }> = [];
  const api = vi.fn(async (path: string, options?: RequestInit) => {
    calls.push({ path, method: String(options?.method ?? "GET"), body: options?.body ? JSON.parse(String(options.body)) : null });
    if (reply instanceof Error) throw reply;
    return reply;
  });
  const transport = staffPlanTransport({ api: api as never, profileId: "profile 1", authScope: "clerk:u1:s1", fetchBlob: async () => ({ blob: new Blob(["%PDF"]), filename: "plan.pdf" }) });
  return { transport, calls };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("staff transport", () => {
  it("is scoped to the signed-in user and the file", () => {
    expect(staff().transport).toMatchObject({ scope: "staff:clerk:u1:s1:profile 1", viewer: "staff" });
  });

  it("loads, saves the draft at the revision it read, and saves a version through the financial workspace", async () => {
    const { transport, calls } = staff({ draft: { revision: 8, base_version_id: "version-2", dirty: false }, versions: [{ id: "version-2", version_number: 2, created_at: "2026-11-14T15:00:00Z" }], current_version_id: "version-2", saved_version: { id: "version-2", version_number: 2, created_at: "2026-11-14T15:00:00Z" } });
    await transport.load();
    await transport.saveDraft(body, FACTS);
    const saved = await transport.saveVersion(body, FACTS, "key-12345678");
    expect(calls.map(call => [call.method, call.path])).toEqual([
      ["GET", "/application-profiles/profile%201/operating-plan/v2"],
      ["PUT", "/application-profiles/profile%201/operating-plan/v2/draft"],
      ["POST", "/application-profiles/profile%201/financial-workspace/versions"],
    ]);
    expect(calls[1].body).toMatchObject({ family_id: "family-1", expected_revision: 7, body: { schema_version: "operating-plan-v2" } });
    // A version is cut from the stored draft: the plan itself is not sent again.
    expect(calls[2].body).toEqual({ kind: "operating_plan", family_id: "family-1", expected_revision: 7, base_version_id: "version-1", idempotency_key: "key-12345678", submit: false });
    expect(saved).toMatchObject({ current_version_id: "version-2", saved_version: { version_number: 2 }, draft: { revision: 8 } });
  });

  it("creates the plan on a first save with no revision", async () => {
    const { transport, calls } = staff();
    await transport.saveDraft(body, { familyId: null, revision: null, baseVersionId: null });
    expect(calls[0].body).toMatchObject({ family_id: null, expected_revision: null });
  });

  it("sends a review with the figures' stamp and sets the goal at its revision", async () => {
    const { transport, calls } = staff({});
    await transport.review!({ itemIds: ["a", "b"], decision: "approved", reason: "On file.", treatment: "incremental_to_baseline", reconciliation: "Not in the return.", contextStamp: "c".repeat(64), key: "review-key-1" }, FACTS);
    await transport.setGoal!(215_000, "USD", { status: "set", amount: 200_000, currency: "USD", revision: 3 }, "goal-key-1234");
    await transport.resync(body, FACTS);
    expect(calls[0]).toMatchObject({ method: "POST", path: "/application-profiles/profile%201/operating-plan/review", body: {
      family_id: "family-1", expected_revision: 7, action_ids: ["a", "b"], decision: "approved", reason: "On file.", context_stamp: "c".repeat(64),
      idempotency_key: "review-key-1", baseline_treatment: "incremental_to_baseline", baseline_reconciliation_note: "Not in the return.",
    } });
    expect(calls[1]).toMatchObject({ method: "PUT", path: "/application-profiles/profile%201/operating-plan/goal", body: { amount: 215_000, currency: "USD", expected_revision: 3, idempotency_key: "goal-key-1234" } });
    expect(calls[2]).toMatchObject({ method: "POST", path: "/application-profiles/profile%201/operating-plan/v2/resync", body: { family_id: "family-1" } });
  });

  it("reads a refusal the same way whatever it was", async () => {
    const conflict = staff(new ApiError(409, "This draft changed. Reload before saving.", { detail: { code: "financial_draft_conflict", current_revision: 9, message: "This draft changed. Reload before saving." } }));
    const error = await conflict.transport.saveDraft(body, FACTS).catch(reason => reason);
    expect(error).toBeInstanceOf(PlanError);
    expect([error.status, error.code, error.message, isPlanConflict(error), isPlanIncomplete(error)]).toEqual([409, "financial_draft_conflict", "This draft changed. Reload before saving.", true, false]);

    const gate = staff(new ApiError(422, "2 items to finish", { detail: { code: "earnings_plan_incomplete", message: "2 items to finish before saving a version. Your working draft is retained.", to_finish: [{ code: "attest" }] } }));
    const held = await gate.transport.saveVersion(body, FACTS, "key-12345678").catch(reason => reason);
    expect([isPlanIncomplete(held), isPlanConflict(held), held.detail.to_finish.length]).toEqual([true, false, 1]);

    // A field the API refused is named, in words.
    const invalid = staff(new ApiError(422, "Review the earnings plan fields", { detail: { message: "Review the earnings plan fields", errors: [{ loc: ["changes", 0, "value"], msg: "Input should be less than or equal to 1000000000000000", type: "less_than_equal" }] } }));
    expect((await invalid.transport.saveDraft(body, FACTS).catch(reason => reason)).message).toBe("Review the earnings plan fields: changes → value: Input should be less than or equal to 1000000000000000");

    // Another 409 (the file's inputs moved under a review) is not a draft conflict.
    const moved = staff(new ApiError(409, "Financial evidence or loan inputs changed. Refresh the preview before reviewing.", { detail: "Financial evidence or loan inputs changed. Refresh the preview before reviewing." }));
    const stale = await moved.transport.review!({ itemIds: ["a"], decision: "rejected", reason: "x", treatment: "unreconciled", reconciliation: "", contextStamp: "c".repeat(64), key: "review-key-2" }, FACTS).catch(reason => reason);
    expect([stale.status, isPlanConflict(stale), stale.message]).toEqual([409, false, "Financial evidence or loan inputs changed. Refresh the preview before reviewing."]);

    // An error from another wrapper that carries a status and the API's body reads the same as the console's own.
    const plain = Object.assign(new Error("This draft changed. Reload before saving."), { status: 409, body: { detail: { code: "financial_draft_conflict", message: "This draft changed. Reload before saving." } } });
    expect(isPlanConflict(await staff(plain).transport.saveDraft(body, FACTS).catch(reason => reason))).toBe(true);

    const offline = staff(new TypeError("Failed to fetch"));
    expect(await offline.transport.load().catch(reason => reason)).toMatchObject({ status: 0, message: "Failed to fetch" });
  });
});

describe("client link transport", () => {
  function link(reply: unknown, status = 200) {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      return { ok: status >= 200 && status < 300, status, json: async () => reply } as Response;
    }));
    return { transport: clientPlanTransport("tok/en 1"), calls };
  }
  const sent = (call: { init: RequestInit }) => JSON.parse(String(call.init.body));

  it("never signs a request and keeps to the link's own routes", async () => {
    const { transport, calls } = link(referenceWorkspace({ can_edit: true }));
    expect(transport).toMatchObject({ scope: "client:tok/en 1", viewer: "client" });
    expect(transport.review).toBeUndefined();
    expect(transport.setGoal).toBeUndefined();
    expect(transport.openSource).toBeUndefined();
    await transport.load();
    await transport.saveDraft(body, FACTS);
    await transport.resync(body, FACTS);
    expect(calls.map(call => [call.init.method ?? "GET", new URL(call.url).pathname])).toEqual([
      ["GET", "/api/v1/application-profiles/public/financial-forms/tok%2Fen%201/plan"],
      ["PUT", "/api/v1/application-profiles/public/financial-forms/tok%2Fen%201/plan/draft"],
      ["POST", "/api/v1/application-profiles/public/financial-forms/tok%2Fen%201/plan/resync"],
    ]);
    for (const call of calls) expect(JSON.stringify(call.init.headers ?? {})).not.toMatch(/authorization|x-dev-user/i);
    expect(sent(calls[1])).toMatchObject({ expected_revision: 7, body: { schema_version: "operating-plan-v2" } });
    expect(Object.keys(sent(calls[2]))).toEqual(["body"]);
  });

  it("submits the plan with the revision, the version it started from and a save key", async () => {
    const { transport, calls } = link({ completed: true, workspace: { family_id: "family-1", revision: 8, base_version_id: "version-2", dirty: false, current_version: { id: "version-2", version_number: 2, created_at: "2026-11-14T15:00:00Z", pdf_url: "/api/v1/application-profiles/public/financial-forms/t/versions/version-2/pdf" }, versions: [{ id: "version-2", version_number: 2, created_at: "2026-11-14T15:00:00Z" }] }, saved_version: { id: "version-2", version_number: 2, created_at: "2026-11-14T15:00:00Z" } });
    const reply = await transport.saveVersion(body, FACTS, "submit-key-1");
    expect(new URL(calls[0].url).pathname).toMatch(/\/submit$/);
    expect(sent(calls[0])).toMatchObject({ expected_revision: 7, base_version_id: "version-1", idempotency_key: "submit-key-1", owners: [], body: { schema_version: "operating-plan-v2" } });
    expect(reply).toMatchObject({ draft: { revision: 8, base_version_id: "version-2", dirty: false }, current_version_id: "version-2", saved_version: { version_number: 2 } });
  });

  it("reads the link's refusals: changed elsewhere, left to finish, goal not set, link gone", async () => {
    const conflict = await link({ detail: { code: "financial_draft_conflict", current_revision: 9, message: "This plan changed or needs to be refreshed. Reload before saving your changes." } }, 409).transport.saveDraft(body, FACTS).catch(reason => reason);
    expect([isPlanConflict(conflict), conflict.message]).toEqual([true, "This plan changed or needs to be refreshed. Reload before saving your changes."]);
    const gate = await link({ detail: { code: "earnings_plan_incomplete", message: "1 item to finish before saving a version. Your working draft is retained.", to_finish: [] } }, 422).transport.saveVersion(body, FACTS, "submit-key-2").catch(reason => reason);
    expect(isPlanIncomplete(gate)).toBe(true);
    const waiting = await link({ detail: { code: "operating_goal_required", message: "Your team needs to set the annual NOI goal before this operating plan can be opened or shared." } }, 409).transport.load().catch(reason => reason);
    expect([waiting.code, isPlanConflict(waiting)]).toEqual(["operating_goal_required", false]);
    const gone = await link({ detail: "This link is no longer available" }, 404).transport.load().catch(reason => reason);
    expect([gone.status, gone.message]).toEqual([404, "This link is no longer available"]);
    const viewOnly = await link({ detail: "This form link is read-only" }, 403).transport.saveDraft(body, FACTS).catch(reason => reason);
    expect(viewOnly.message).toBe("This form link is read-only");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    expect(await clientPlanTransport("t").load().catch(reason => reason)).toMatchObject({ status: 0 });
  });

  it("opens only a PDF link the API issued for this form", async () => {
    const opened: string[] = [];
    vi.stubGlobal("window", { open: (url: string) => { opened.push(url); return {}; } });
    const transport = clientPlanTransport("t");
    await transport.openPdf({ id: "v", version_number: 1, created_at: "", pdf_url: "/api/v1/application-profiles/public/financial-forms/t/versions/v/pdf" });
    expect(opened).toHaveLength(1);
    expect(new URL(opened[0]).pathname).toBe("/api/v1/application-profiles/public/financial-forms/t/versions/v/pdf");
    await expect(transport.openPdf({ id: "v", version_number: 1, created_at: "", pdf_url: "https://elsewhere.example/steal.pdf" })).rejects.toBeInstanceOf(PlanError);
    await expect(transport.openPdf({ id: "v", version_number: 1, created_at: "" })).rejects.toBeInstanceOf(PlanError);
    expect(opened).toHaveLength(1);
  });
});
