/**
 * The plan session: what is typed is never lost or replaced, a draft saves on a
 * pause, and a plan saved somewhere else is never overwritten. Driven directly,
 * with a stand-in API and the clock under the test's control.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlanError, type DraftFacts, type PlanTransport, type ReviewInput } from "@/lib/earningsPlan/api";
import { patchItem, setNotes } from "@/lib/earningsPlan/edit";
import { AUTOSAVE_MS, PlanSession, RETRY_MS } from "@/lib/earningsPlan/session";
import type { EarningsPlanBody, PlanWorkspace } from "@/lib/earningsPlan/types";
import { referenceWorkspace } from "./fixtures/earningsPlanReferencePlan";

/** A stand-in API that keeps a revision, trims text as the API does, and can be told to fail or to wait. */
function standIn(start: PlanWorkspace = referenceWorkspace(), viewer: "staff" | "client" = "staff") {
  const api = {
    workspace: structuredClone(start),
    saves: [] as Array<{ body: EarningsPlanBody; facts: DraftFacts }>,
    calls: [] as string[],
    reviews: [] as ReviewInput[],
    fail: null as PlanError | null,
    /** When set, the next draft save waits until `release()` is called. */
    gate: null as null | Promise<void>,
    release: () => undefined as void,
    hold() { api.gate = new Promise<void>(resolve => { api.release = () => { api.gate = null; resolve(); }; }); },
    /** When set, the next version save waits until `releaseVersion()` is called. */
    versionGate: null as null | Promise<void>,
    releaseVersion: () => undefined as void,
    holdVersion() { api.versionGate = new Promise<void>(resolve => { api.releaseVersion = () => { api.versionGate = null; resolve(); }; }); },
  };
  const trimmed = (body: EarningsPlanBody): EarningsPlanBody => JSON.parse(JSON.stringify(body, (_key, value) => (typeof value === "string" ? value.trim() : value)));
  const transport: PlanTransport = {
    scope: "test", viewer,
    load: async () => { api.calls.push("load"); return structuredClone(api.workspace); },
    saveDraft: async (body, facts) => {
      api.calls.push("draft");
      if (api.gate) await api.gate;
      if (api.fail) { const error = api.fail; api.fail = null; throw error; }
      const draft = api.workspace.draft;
      if ((draft?.revision ?? null) !== facts.revision) throw new PlanError(409, "This draft changed. Reload before saving.", "financial_draft_conflict");
      api.saves.push({ body, facts });
      api.workspace = {
        ...api.workspace, origin: "saved", family_id: api.workspace.family_id ?? "family-new", body: trimmed(body),
        draft: { revision: (draft?.revision ?? 0) + 1, base_version_id: draft?.base_version_id ?? null, updated_at: "2026-11-14T15:00:00Z", stored_model: "operating-plan-v2", dirty: true },
      };
      return structuredClone(api.workspace);
    },
    saveVersion: async (_body, facts) => {
      api.calls.push("version");
      // The API checks the revision when it gets to the request: a draft saved meanwhile makes this one stale.
      if (api.versionGate) await api.versionGate;
      if (facts.revision !== api.workspace.draft?.revision) throw new PlanError(409, "This draft changed. Reload before saving.", "financial_draft_conflict");
      const number = api.workspace.versions.length + 1;
      const version = { id: `version-${number}`, version_number: number, created_at: "2026-11-14T15:01:00Z", pdf_file_id: `pdf-${number}` };
      // A plan the business submits carries no staff approval: every change goes back to proposed.
      const stored = structuredClone(api.workspace.body);
      if (viewer === "client") for (const row of [...stored.changes, ...stored.growth, ...stored.activities]) row.status = "proposed";
      api.workspace = { ...api.workspace, body: stored, versions: [version, ...api.workspace.versions], current_version_id: version.id, draft: { ...api.workspace.draft!, base_version_id: version.id, dirty: false } };
      return { draft: api.workspace.draft!, versions: api.workspace.versions, current_version_id: version.id, saved_version: version };
    },
    resync: async body => {
      api.calls.push("resync");
      api.workspace = { ...api.workspace, evaluation: { ...api.workspace.evaluation, plan: { ...api.workspace.evaluation.plan, source_changed: false } } };
      return { body: { ...body, source: { ...body.source, confirmations: {}, stamp: "f".repeat(64) } }, evaluation: api.workspace.evaluation, context_stamp: api.workspace.context_stamp };
    },
    review: async (input, facts) => {
      api.calls.push("review");
      if (facts.revision !== api.workspace.draft?.revision) throw new PlanError(409, "This draft changed. Reload before saving.", "financial_draft_conflict");
      api.reviews.push(input);
      const body = structuredClone(api.workspace.body);
      for (const row of [...body.changes, ...body.growth, ...body.activities]) if (input.itemIds.includes(row.id)) Object.assign(row, { status: input.decision, review_reason: input.reason });
      api.workspace = { ...api.workspace, body, draft: { ...api.workspace.draft!, revision: api.workspace.draft!.revision + 1 } };
      return { body, draft: api.workspace.draft!, context_stamp: api.workspace.context_stamp };
    },
    setGoal: async (amount, currency, goal) => {
      api.calls.push("goal");
      const next = { status: "set" as const, metric: "annual_noi", amount, currency, revision: (goal?.revision ?? 0) + 1 };
      api.workspace = { ...api.workspace, goal: next };
      return next;
    },
    openPdf: async () => undefined,
  };
  return { api, transport };
}

async function opened(start?: PlanWorkspace) {
  const stand = standIn(start);
  const session = new PlanSession(stand.transport);
  session.start();
  await vi.runAllTimersAsync();
  expect(session.getState().status).toBe("ready");
  return { ...stand, session };
}
const note = (session: PlanSession, id: string) => [...session.getState().body!.changes].find(row => row.id === id)!.note;
const pause = () => vi.advanceTimersByTimeAsync(AUTOSAVE_MS);

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("plan session: typing and saving", () => {
  it("opens on what the API holds and saves nothing by itself", async () => {
    const { session, api } = await opened();
    const state = session.getState();
    expect([state.save.state, state.facts!.draft!.revision, state.facts!.canEdit, session.unsaved]).toEqual(["saved", 7, true, false]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(api.calls).toEqual(["load"]);
  });

  it("changes the plan at once and saves one draft after a pause in typing", async () => {
    const { session, api } = await opened();
    for (const text of ["1", "15", "15."]) {
      expect(session.edit(body => patchItem(body, "f:s1:1", { value: text }))).toBe(true);
      // The working copy has the keystroke before anything is sent.
      expect(session.getState().body!.changes[0].value).toBe(text);
      expect(session.getState().save.state).toBe("unsaved");
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS - 100);
    }
    expect(api.saves).toHaveLength(0);
    await pause();
    expect(api.saves).toHaveLength(1);
    // The API was sent a number and the revision it was read at; the field still holds the keystrokes.
    expect([api.saves[0].body.changes[0].value, api.saves[0].facts.revision]).toEqual([15, 7]);
    expect([session.getState().body!.changes[0].value, session.getState().save.state, session.getState().facts!.draft!.revision]).toEqual(["15.", "saved", 8]);
    expect(session.unsaved).toBe(false);
    // A keystroke that changes nothing is not an edit and sends nothing.
    expect(session.edit(body => patchItem(body, "f:s1:1", { value: "15." }))).toBe(false);
    await pause();
    expect(api.saves).toHaveLength(1);
  });

  it("never lets the API's echo replace words that are still being typed", async () => {
    const { session, api } = await opened();
    api.hold();
    session.edit(body => patchItem(body, "f:s2:0", { note: "Two contracts " }));
    await pause();
    expect(session.getState().save.state).toBe("saving");
    // More is typed while the first save is on its way.
    session.edit(body => patchItem(body, "f:s2:0", { note: "Two contracts signed " }));
    api.release();
    await vi.runAllTimersAsync();
    // The first reply did not touch the text; the later keystrokes went out in a second save.
    expect(note(session, "f:s2:0")).toBe("Two contracts signed ");
    expect(api.saves.map(save => save.body.changes.find(row => row.id === "f:s2:0")!.note)).toEqual(["Two contracts ", "Two contracts signed "]);
    expect(api.saves.map(save => save.facts.revision)).toEqual([7, 8]);
    expect(api.workspace.body.changes.find(row => row.id === "f:s2:0")!.note).toBe("Two contracts signed");
    expect([session.getState().save.state, session.unsaved]).toEqual(["saved", false]);
  });

  it("creates the plan on its first save, and carries an earlier plan into the current model before a version", async () => {
    const fresh = referenceWorkspace({ origin: "seeded", draft: null, family_id: null, versions: [], current_version_id: null });
    const { session, api } = await opened(fresh);
    expect(session.getState().save.state).toBe("idle");
    session.edit(body => setNotes(body, "First note"));
    await pause();
    expect([api.saves[0].facts.revision, api.saves[0].facts.familyId, session.getState().facts!.familyId, session.getState().facts!.draft!.revision]).toEqual([null, null, "family-new", 1]);

    const carried = referenceWorkspace({ origin: "carried_over" });
    carried.draft!.stored_model = "operating-plan-v1";
    const other = await opened(carried);
    await other.session.saveVersion();
    // Nothing was edited, yet the draft is saved first so the version is cut from the plan in the current model.
    expect(other.api.calls).toEqual(["load", "draft", "version"]);
    expect(other.session.getState().facts).toMatchObject({ origin: "saved", currentVersionId: "version-2", draft: { dirty: false, stored_model: "operating-plan-v2" } });
  });
});

describe("plan session: when saving cannot go through", () => {
  it("stops, keeps what was typed and overwrites nothing when the plan was saved somewhere else", async () => {
    const { session, api } = await opened();
    api.workspace.draft!.revision = 9;
    api.workspace.body.notes = "Saved from another tab";
    session.edit(body => setNotes(body, "Typed here"));
    await pause();
    const state = session.getState();
    expect([state.save.state, state.body!.notes, api.saves.length, session.unsaved]).toEqual(["conflict", "Typed here", 0, false]);
    expect(state.save.error).toContain("changed somewhere else");
    // No further edits or saves until the plan is reloaded.
    expect(session.edit(body => setNotes(body, "More"))).toBe(false);
    await expect(session.flush()).rejects.toMatchObject({ status: 409 });
    await expect(session.saveVersion()).rejects.toMatchObject({ status: 409 });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(api.saves).toHaveLength(0);
    await session.reload();
    expect([session.getState().body!.notes, session.getState().save.state, session.getState().facts!.draft!.revision]).toEqual(["Saved from another tab", "saved", 9]);
    expect(session.edit(body => setNotes(body, "Continuing"))).toBe(true);
    await pause();
    expect(api.workspace.body.notes).toBe("Continuing");
  });

  it("retries by itself after an outage and keeps every keystroke meanwhile", async () => {
    const { session, api } = await opened();
    api.fail = new PlanError(503, "The service is restarting.");
    session.edit(body => setNotes(body, "Keep this"));
    await pause();
    expect([session.getState().save.state, session.getState().save.error, session.unsaved]).toEqual(["error", "The service is restarting.", true]);
    expect(session.getState().body!.notes).toBe("Keep this");
    await vi.advanceTimersByTimeAsync(RETRY_MS[0]);
    expect([session.getState().save.state, api.saves.length, api.workspace.body.notes]).toEqual(["saved", 1, "Keep this"]);
  });

  it("does not resend what the API refused until the plan changes", async () => {
    const { session, api } = await opened();
    api.fail = new PlanError(422, "Review the earnings plan fields: changes → value: Input should be less than or equal to 1e15");
    session.edit(body => patchItem(body, "l:rent", { value: "9999999999999999" }));
    await pause();
    expect(session.getState().save.state).toBe("error");
    await vi.advanceTimersByTimeAsync(120_000);
    expect(api.calls.filter(call => call === "draft")).toHaveLength(1);
    session.edit(body => patchItem(body, "l:rent", { value: "28805" }));
    await pause();
    expect([session.getState().save.state, api.saves.length]).toEqual(["saved", 1]);
  });

  it("sends the last keystrokes on the way out, and nothing after that", async () => {
    const { session, api } = await opened();
    session.edit(body => setNotes(body, "Typed just before leaving"));
    session.dispose();
    await vi.runAllTimersAsync();
    expect(api.workspace.body.notes).toBe("Typed just before leaving");
    // The session is over: nothing is retried or scheduled.
    expect(api.calls).toEqual(["load", "draft"]);
    session.start();
    await vi.runAllTimersAsync();
    expect([session.getState().status, session.getState().body!.notes]).toEqual(["ready", "Typed just before leaving"]);
  });

  it("still sends what was typed after a save that is on its way when the screen goes", async () => {
    const { session, api } = await opened();
    api.hold();
    session.edit(body => setNotes(body, "First words"));
    await pause();
    expect(session.getState().save.state).toBe("saving");
    session.edit(body => setNotes(body, "First words and the last ones"));
    session.dispose();
    api.release();
    await vi.runAllTimersAsync();
    // The later words went out behind the first save, against the revision it left.
    expect(api.saves.map(save => [save.body.notes, save.facts.revision])).toEqual([["First words", 7], ["First words and the last ones", 8]]);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(api.calls).toEqual(["load", "draft", "draft"]);
  });

  it("sends one save when several are asked for behind a save that fails", async () => {
    const { session, api } = await opened();
    api.hold();
    api.fail = new PlanError(503, "The service is restarting.");
    session.edit(body => setNotes(body, "Once"));
    await pause();
    // The tab is hidden and the way back is clicked while the first save is still out.
    const asked = [session.flush(), session.flush()];
    api.release();
    await Promise.all(asked);
    await vi.runAllTimersAsync();
    // One failed try and one save: a second copy would have been refused as a plan changed somewhere else.
    expect([api.calls.filter(call => call === "draft").length, api.saves.length, session.getState().save.state, session.getState().facts!.draft!.revision]).toEqual([2, 1, "saved", 8]);
  });
});

describe("plan session: versions, reviews, the goal and a changed source", () => {
  it("saves the draft and then the version, and reads the new revision from the reply", async () => {
    const { session, api } = await opened();
    session.edit(body => setNotes(body, "Ready"));
    const version = await session.saveVersion();
    expect(version).toMatchObject({ id: "version-2", version_number: 2 });
    expect(api.calls).toEqual(["load", "draft", "version"]);
    const facts = session.getState().facts!;
    expect([facts.currentVersionId, facts.draft, facts.versions.length, facts.completed]).toEqual(["version-2", { revision: 8, base_version_id: "version-2", dirty: false, stored_model: "operating-plan-v2" }, 2, true]);
    expect(session.getState().busy).toBe("");
    // Editing again afterwards saves against the revision the version left.
    session.edit(body => setNotes(body, "After the version"));
    await pause();
    expect(api.saves[api.saves.length - 1].facts).toEqual({ familyId: facts.familyId, revision: 8, baseVersionId: "version-2" });
  });

  it("keeps what is typed while a version is being saved and saves it afterwards, never beside the version", async () => {
    const { session, api } = await opened();
    api.holdVersion();
    const saving = session.saveVersion();
    await vi.advanceTimersByTimeAsync(0);
    expect([session.getState().busy, api.calls]).toEqual(["version", ["load", "version"]]);
    expect(session.edit(body => setNotes(body, "Typed while the version saves"))).toBe(true);
    // The pause in typing passes several times over; the draft waits for the version.
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS * 4);
    expect([api.calls, session.getState().body!.notes]).toEqual([["load", "version"], "Typed while the version saves"]);
    api.releaseVersion();
    expect(await saving).toMatchObject({ id: "version-2" });
    // The version is saved without the newer words, which are still on screen and go out next as a draft.
    expect([session.getState().facts!.currentVersionId, session.getState().body!.notes]).toEqual(["version-2", "Typed while the version saves"]);
    await vi.runAllTimersAsync();
    expect(api.calls).toEqual(["load", "version", "draft"]);
    expect(api.saves[0].facts).toMatchObject({ revision: 7, baseVersionId: "version-2" });
    expect([session.getState().save.state, api.workspace.body.notes, session.getState().facts!.draft!.dirty, session.unsaved]).toEqual(["saved", "Typed while the version saves", true, false]);
  });

  it("shows a plan the business submitted as proposed again, without replacing what it typed", async () => {
    const stand = standIn(referenceWorkspace({ can_edit: true }), "client");
    const session = new PlanSession(stand.transport);
    session.start();
    await vi.runAllTimersAsync();
    const status = (id: string) => session.getState().body!.changes.find(change => change.id === id)!.status;
    expect(status("l:rent")).toBe("approved");
    session.edit(body => setNotes(body, "Sent for review "));
    await session.saveVersion();
    // Draft, then the version, then one read of what the API now holds.
    expect(stand.api.calls).toEqual(["load", "draft", "version", "load"]);
    expect([status("l:rent"), session.getState().body!.notes, session.getState().facts!.completed, session.unsaved]).toEqual(["proposed", "Sent for review ", true, false]);
  });

  it("records a staff decision on what is on screen and lays it over the working copy", async () => {
    const { session, api } = await opened();
    session.edit(body => patchItem(body, "l:sal", { note: "Front desk moves to part time in February." }));
    await session.review({ itemIds: ["l:sal"], decision: "approved", reason: "Offer letter on file.", treatment: "incremental_to_baseline", reconciliation: "Full-time role is in the 2025 return." });
    // The note was saved before the decision was sent, with the stamp of the figures the reviewer saw.
    expect(api.calls).toEqual(["load", "draft", "review"]);
    expect(api.reviews[0]).toMatchObject({ itemIds: ["l:sal"], decision: "approved", contextStamp: "c".repeat(64) });
    const row = session.getState().body!.changes.find(change => change.id === "l:sal")!;
    expect([row.status, row.review_reason, row.note]).toEqual(["approved", "Offer letter on file.", "Front desk moves to part time in February."]);
    expect(session.getState().facts!.draft!.revision).toBe(9);
    // Its figure changes: the approval no longer applies.
    session.edit(body => patchItem(body, "l:sal", { value: "20000" }));
    expect(session.getState().body!.changes.find(change => change.id === "l:sal")!.status).toBe("proposed");
  });

  it("records nothing when the file's figures moved under the review, and stands on the new ones for the next try", async () => {
    const { session, api, transport } = await opened();
    const review = transport.review!;
    let moved = true;
    transport.review = async (input, facts) => {
      if (moved) { moved = false; api.workspace = { ...api.workspace, context_stamp: "d".repeat(64) }; throw new PlanError(409, "Financial evidence or loan inputs changed. Refresh the preview before reviewing."); }
      return review(input, facts);
    };
    const decision = { itemIds: ["l:sal"], decision: "approved" as const, reason: "Offer letter on file.", treatment: "incremental_to_baseline" as const, reconciliation: "Not in the return." };
    await expect(session.review(decision)).rejects.toThrow(/figures changed while this plan was open/);
    // Not a conflict: the plan is still editable, and it now carries the file's new stamp.
    expect([session.getState().save.state, session.getState().facts!.contextStamp, session.getState().busy]).toEqual(["saved", "d".repeat(64), ""]);
    await session.review(decision);
    expect(api.reviews).toHaveLength(1);
    expect(api.reviews[0].contextStamp).toBe("d".repeat(64));
  });

  it("shows approvals the API no longer counts as proposed", async () => {
    const stale = referenceWorkspace();
    stale.evaluation.plan.stale_reviews = ["l:rent"];
    const { session } = await opened(stale);
    const status = (id: string) => session.getState().body!.changes.find(change => change.id === id)!.status;
    expect([status("l:rent"), status("l:sw")]).toEqual(["proposed", "approved"]);
    // That is the API's reading, not an edit: nothing is waiting to be saved.
    expect(session.unsaved).toBe(false);
  });

  it("sets the goal and takes the API's newer facts without touching the plan", async () => {
    const { session, api } = await opened();
    session.edit(body => setNotes(body, "Typing while the goal is saved"));
    await session.setGoal(180_000);
    expect(session.getState().facts!.goal).toMatchObject({ amount: 180_000, revision: 2 });
    expect([session.getState().body!.notes, session.getState().save.state]).toEqual(["Typing while the goal is saved", "unsaved"]);
    await pause();
    expect([session.getState().save.state, api.workspace.body.notes]).toEqual(["saved", "Typing while the goal is saved"]);
  });

  it("brings the plan onto changed source figures and saves the result like any edit", async () => {
    const changed = referenceWorkspace();
    changed.evaluation.plan.source_changed = true;
    const { session, api } = await opened(changed);
    expect(session.getState().facts!.sourceChanged).toBe(true);
    // Something typed a moment before is carried through the update and saved once, with it.
    session.edit(body => setNotes(body, "Typed just before updating"));
    await session.resync();
    expect([session.getState().facts!.sourceChanged, session.getState().body!.source.confirmations, session.getState().save.state]).toEqual([false, {}, "unsaved"]);
    await pause();
    expect(api.calls).toEqual(["load", "resync", "draft"]);
    expect(api.saves[0].body.source).toMatchObject({ confirmations: {}, stamp: "f".repeat(64) });
    expect(api.saves[0].body.notes).toBe("Typed just before updating");
  });

  it("changes nothing on a view-only link", async () => {
    const { session, api } = await opened(referenceWorkspace({ can_edit: false }));
    expect(session.edit(body => setNotes(body, "x"))).toBe(false);
    await session.flush(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(api.calls).toEqual(["load"]);
  });

  it("says why a plan could not be opened and opens it on retry", async () => {
    const stand = standIn();
    const load = stand.transport.load;
    let fail = true;
    stand.transport.load = async () => { if (fail) throw new PlanError(409, "Your team needs to set the annual NOI goal.", "operating_goal_required"); return load(); };
    const session = new PlanSession(stand.transport);
    session.start();
    await vi.runAllTimersAsync();
    expect([session.getState().status, session.getState().loadError?.code]).toEqual(["error", "operating_goal_required"]);
    await expect(session.reload()).rejects.toMatchObject({ code: "operating_goal_required" });
    fail = false;
    await session.reload();
    expect(session.getState().status).toBe("ready");
  });
});
