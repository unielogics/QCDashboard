/**
 * The working copy of an earnings plan and its trips to the API.
 *
 * The plan lives here, in the browser. Every edit changes it at once and every
 * figure on the screens is worked out from it (./math), so no number ever waits
 * for the API or blanks while it is asked. Around that:
 *
 * - The draft is saved on a pause in typing. What the API sends back updates
 *   the facts only it knows (the file's baseline, the revision, the versions),
 *   never the words or figures in the working copy.
 * - If the plan was saved somewhere else meanwhile, nothing is overwritten:
 *   saving stops and the screen offers to reload.
 * - A save that fails for an outage is tried again by itself; a refusal of
 *   what was sent waits for the next edit.
 *
 * No React here: the screens subscribe to a session (see
 * components/earnings-plan/useEarningsPlan), and tests drive one directly.
 */
import { isPlanConflict, isPlanIncomplete, PlanError, type DraftFacts, type PlanTransport, type ReviewInput, type VersionReply } from "./api";
import { adoptReviews, newId, settleReviews, toWire, withoutStaleReviews } from "./edit";
import { PLAN_MODEL } from "./types";
import type { EarningsPlanBody, PlanBaseline, PlanGoal, PlanQuestion, PlanServerEvaluation, PlanVersion, PlanWorkspace, StreamTemplate } from "./types";

export const AUTOSAVE_MS = 900;
export const RETRY_MS: readonly number[] = [3_000, 8_000, 20_000];
const CONFLICT = "This plan was changed somewhere else since you opened it. Reload to continue from the saved plan.";

export type PlanFacts = {
  baseline: PlanBaseline;
  questions: PlanQuestion[];
  sourceChanged: boolean;
  staleReviews: string[];
  contextStamp: string;
  goal: PlanGoal | null;
  versions: PlanVersion[];
  currentVersionId: string | null;
  familyId: string | null;
  draft: { revision: number; base_version_id: string | null; dirty: boolean; stored_model?: string | null } | null;
  origin: PlanWorkspace["origin"];
  templates: Record<string, StreamTemplate>;
  canEdit: boolean;
  completed: boolean;
};
export type SaveStatus = { state: "idle" | "unsaved" | "saving" | "saved" | "error" | "conflict"; at: string | null; error: string };
export type PlanBusy = "" | "version" | "review" | "resync" | "reload" | "goal";
export type SessionState = {
  status: "loading" | "ready" | "error";
  loadError: PlanError | null;
  body: EarningsPlanBody | null;
  facts: PlanFacts | null;
  save: SaveStatus;
  busy: PlanBusy;
};

const clock = () => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const words = (error: unknown) => (error instanceof Error && error.message ? error.message : "Something went wrong. What you typed is still here.");

function serverFacts(evaluation: PlanServerEvaluation) {
  const plan = evaluation.plan;
  return { baseline: plan.baseline, questions: plan.questions ?? [], sourceChanged: Boolean(plan.source_changed), staleReviews: plan.stale_reviews ?? [] };
}

function factsOf(workspace: PlanWorkspace, previous?: PlanFacts | null): PlanFacts {
  return {
    ...serverFacts(workspace.evaluation),
    contextStamp: workspace.context_stamp,
    goal: workspace.goal ?? null,
    versions: workspace.versions ?? [],
    currentVersionId: workspace.current_version_id ?? null,
    familyId: workspace.family_id ?? null,
    draft: workspace.draft ?? null,
    origin: workspace.origin,
    templates: workspace.stream_templates ?? previous?.templates ?? {},
    // The staff routes do not say; a client link says on every reply.
    canEdit: workspace.can_edit ?? previous?.canEdit ?? true,
    completed: workspace.completed ?? previous?.completed ?? false,
  };
}

export class PlanSession {
  private state: SessionState = { status: "loading", loadError: null, body: null, facts: null, save: { state: "idle", at: null, error: "" }, busy: "" };
  private readonly listeners = new Set<() => void>();
  /** Edits made, and edits the API holds. Equal means nothing is waiting to be saved. */
  private changed = 0;
  private persisted = 0;
  private conflict = false;
  private inFlight: Promise<void> | null = null;
  /** A version on its way to being saved. It moves the revision a draft save is checked against, so no draft save runs beside it. */
  private publishing: Promise<unknown> | null = null;
  private publishKey: string | null = null;
  private retries = 0;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  /** Bumped on dispose and on every load: a reply that belongs to an earlier life of the session is dropped. */
  private life = 0;

  constructor(private readonly transport: PlanTransport) {}

  // ---------------------------------------------------------------- store
  getState = (): SessionState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private set(patch: Partial<SessionState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  private get facts(): PlanFacts { return this.state.facts!; }

  /** True while something typed has not reached the API. */
  get unsaved(): boolean { return !this.conflict && (this.changed !== this.persisted || this.inFlight !== null); }

  // ----------------------------------------------------------------- life
  /** Load the plan. Safe to call again after `dispose` (React mounts effects twice in development). */
  start = (): void => {
    const life = ++this.life;
    this.clearTimers();
    this.changed = 0; this.persisted = 0; this.conflict = false;
    this.set({ status: "loading", loadError: null, body: null, facts: null, busy: "", save: { state: "idle", at: null, error: "" } });
    this.transport.load().then(workspace => { if (life === this.life) this.accept(workspace); }).catch(error => {
      if (life === this.life) this.set({ status: "error", loadError: error instanceof PlanError ? error : new PlanError(0, words(error)) });
    });
  };

  /**
   * The screen is going away. Anything typed in the last moment still goes out, behind whatever is already on its
   * way (so it is checked against the right revision); after that the session is over and later replies are dropped.
   */
  dispose = (): void => {
    this.clearTimers();
    const life = this.life;
    const end = () => { if (life === this.life) { this.life += 1; this.clearTimers(); } };
    const { body, facts } = this.state;
    const owed = body && facts?.canEdit && !this.conflict && (this.inFlight || this.publishing || this.changed !== this.persisted);
    if (owed) void this.flush().catch(() => undefined).finally(end);
    else end();
  };

  private clearTimers() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.saveTimer = this.retryTimer = null;
  }

  /**
   * Whatever is on its way that moves the draft's revision: a draft save, or a version being saved. Only one goes at
   * a time. Callers wait with `while (this.trip) await …` in their own body, so that seeing the way clear and setting
   * off happen in one step: two callers waiting behind the same trip then go one after the other, never together.
   */
  private get trip(): Promise<unknown> | null { return this.inFlight ?? this.publishing; }

  /** Something typed is still waiting and no save is due: start the pause again. */
  private resume() {
    if (!this.conflict && !this.saveTimer && !this.retryTimer && !this.inFlight && this.changed !== this.persisted) this.schedule();
  }

  /** Open a plan as loaded: the working copy starts over from what the API holds. */
  private accept(workspace: PlanWorkspace) {
    const facts = factsOf(workspace);
    this.changed = 0; this.persisted = 0; this.conflict = false; this.publishKey = null; this.retries = 0;
    this.clearTimers();
    this.set({
      status: "ready", loadError: null, facts, body: withoutStaleReviews(workspace.body, facts.staleReviews),
      save: { state: workspace.draft && workspace.origin === "saved" ? "saved" : "idle", at: null, error: "" },
    });
  }

  /** What only the API knows, refreshed without touching what is being typed. */
  private absorb(workspace: PlanWorkspace) {
    const facts = factsOf(workspace, this.state.facts);
    const body = this.state.body && facts.staleReviews.length ? withoutStaleReviews(this.state.body, facts.staleReviews) : this.state.body;
    this.set({ facts, body });
  }

  private draftFacts(): DraftFacts {
    const facts = this.state.facts;
    return { familyId: facts?.familyId ?? null, revision: facts?.draft?.revision ?? null, baseVersionId: facts?.draft?.base_version_id ?? null };
  }

  private stop(): void {
    this.conflict = true;
    this.clearTimers();
    this.set({ save: { state: "conflict", at: null, error: CONFLICT } });
  }

  // ---------------------------------------------------------------- edits
  /** Change the plan. Reviews follow the figures: see `settleReviews`. Returns false when nothing changed. */
  edit = (change: (body: EarningsPlanBody) => EarningsPlanBody): boolean => {
    const { body, facts, busy } = this.state;
    if (!body || !facts?.canEdit || this.conflict || busy === "review" || busy === "reload" || busy === "resync") return false;
    const next = settleReviews(body, change(body));
    if (next === body) return false;
    this.changed += 1; this.publishKey = null; this.retries = 0;
    this.set({ body: next, save: { ...this.state.save, state: "unsaved", error: "" } });
    this.schedule();
    return true;
  };

  /** Save after a pause in typing; each edit starts the pause again. */
  private schedule() {
    this.clearTimers();
    const life = this.life;
    this.saveTimer = setTimeout(() => { this.saveTimer = null; if (life === this.life) void this.flush().catch(() => undefined); }, AUTOSAVE_MS);
  }

  /** Save the draft if anything changed (or, when `first`, if the API still holds the earlier model or nothing at all). */
  flush = async (first = false): Promise<void> => {
    while (this.trip) await this.trip.catch(() => undefined);
    const life = this.life;
    if (!this.state.body || !this.state.facts?.canEdit) return;
    if (this.conflict) throw new PlanError(409, CONFLICT, "financial_draft_conflict");
    const stored = this.facts.draft;
    const neverSaved = !stored || stored.stored_model !== PLAN_MODEL;
    if (this.persisted === this.changed && !(first && neverSaved)) return;
    const work = async () => {
      this.clearTimers();
      this.set({ save: { ...this.state.save, state: "saving", error: "" } });
      try {
        do {
          const sent = this.changed;
          const reply = await this.transport.saveDraft(toWire(this.state.body!), this.draftFacts());
          if (life !== this.life) return;
          this.persisted = sent;
          this.absorb(reply);
        } while (this.persisted !== this.changed);
        this.retries = 0;
        this.set({ save: { state: "saved", at: clock(), error: "" } });
      } catch (error) {
        if (life !== this.life) return;
        if (isPlanConflict(error)) this.stop();
        else {
          this.set({ save: { state: "error", at: null, error: words(error) } });
          const outage = !(error instanceof PlanError) || error.status === 0 || error.status >= 500;
          if (outage && this.retries < RETRY_MS.length) {
            this.retryTimer = setTimeout(() => { this.retryTimer = null; if (life === this.life) void this.flush().catch(() => undefined); }, RETRY_MS[this.retries]);
            this.retries += 1;
          }
        }
        throw error;
      }
    };
    const promise = work();
    this.inFlight = promise;
    try { await promise; } finally { if (this.inFlight === promise) this.inFlight = null; }
  };

  // ------------------------------------------------------------- the API
  private async hold<T>(busy: PlanBusy, work: () => Promise<T>): Promise<T | undefined> {
    if (this.state.busy) return undefined;
    this.set({ busy });
    try { return await work(); } finally { this.set({ busy: "" }); }
  }

  /** Start over from what the API holds: after a conflict, or on request. Replaces the working copy. */
  reload = async (): Promise<void> => {
    while (this.trip) await this.trip.catch(() => undefined);
    const life = this.life;
    await this.hold("reload", async () => {
      // Nothing is saved while the plan is being replaced.
      this.clearTimers();
      try {
        const workspace = await this.transport.load();
        if (life === this.life) this.accept(workspace);
      } catch (error) {
        // A plan that never opened shows why; one that is open keeps what it has, and goes on saving it.
        if (life === this.life && this.state.status !== "ready") this.set({ status: "error", loadError: error instanceof PlanError ? error : new PlanError(0, words(error)) });
        else if (life === this.life) this.resume();
        throw error;
      }
    });
  };

  /** Refresh the API's facts and keep the working copy, unless the plan moved on without it. */
  refresh = async (): Promise<void> => {
    while (this.trip) await this.trip.catch(() => undefined);
    const life = this.life, persisted = this.persisted;
    const workspace = await this.transport.load();
    if (life !== this.life || !this.state.facts) return;
    // A save of our own went out meanwhile: its reply carries newer facts than this read, and a revision it moved is not a conflict.
    if (this.inFlight || persisted !== this.persisted) return;
    if ((workspace.draft?.revision ?? null) !== (this.facts.draft?.revision ?? null)) this.stop();
    else this.absorb(workspace);
  };

  /** Take the review state of each change as the API now holds it; what is typed stays as typed. */
  private async syncReviews(): Promise<void> {
    const life = this.life, persisted = this.persisted;
    const workspace = await this.transport.load();
    if (life !== this.life || !this.state.body || this.inFlight || persisted !== this.persisted) return;
    if ((workspace.draft?.revision ?? null) !== (this.facts.draft?.revision ?? null)) return;
    this.absorb(workspace);
    this.set({ body: adoptReviews(this.state.body!, workspace.body) });
  }

  /**
   * Save a version and its PDF. The caller makes sure the to-finish list is empty first.
   * Resolves with the saved version, or undefined when another operation was running and nothing was saved.
   */
  saveVersion = async (): Promise<PlanVersion | null | undefined> => {
    return this.hold("version", async () => {
      try {
        await this.flush(true);
        this.publishKey ??= newId();
        const life = this.life;
        const publish = this.transport.saveVersion(toWire(this.state.body!), this.draftFacts(), this.publishKey);
        this.publishing = publish;
        let reply: VersionReply;
        try { reply = await publish; } finally { if (this.publishing === publish) this.publishing = null; }
        if (life !== this.life) return undefined;
        this.publishKey = null;
        // Anything typed while the version was being saved is not in it: it stays here and is saved as a draft next.
        const typedSince = this.changed !== this.persisted;
        this.set({
          facts: {
            ...this.facts, versions: reply.versions, currentVersionId: reply.current_version_id, completed: true,
            draft: { revision: reply.draft.revision, base_version_id: reply.draft.base_version_id, dirty: false, stored_model: PLAN_MODEL },
          },
          save: typedSince ? { state: "unsaved", at: null, error: "" } : { state: "saved", at: clock(), error: "" },
        });
        this.resume();
        // A plan the business submits goes back to staff as proposed: show its changes that way without a reload.
        if (this.transport.viewer === "client") await this.syncReviews().catch(() => undefined);
        return reply.saved_version ?? reply.versions.find(version => version.id === reply.current_version_id) ?? null;
      } catch (error) {
        if (isPlanConflict(error)) this.stop();
        // The API knows something this page had not heard yet (the file's source moved, say): catch up.
        else if (isPlanIncomplete(error)) await this.refresh().catch(() => undefined);
        throw error;
      }
    });
  };

  /** Bring the plan onto the file's current source figures. Replaces lines and clears confirmations; saved like any edit. */
  resync = async (): Promise<void> => {
    if (!this.state.body) return;
    await this.hold("resync", async () => {
      // A save that lands after the reply would report the old figures as still changed; let it finish first.
      while (this.trip) await this.trip.catch(() => undefined);
      this.clearTimers();
      const life = this.life;
      try {
        const reply = await this.transport.resync(toWire(this.state.body!), this.draftFacts());
        if (life !== this.life) return;
        this.changed += 1; this.publishKey = null;
        this.set({
          facts: { ...this.facts, ...serverFacts(reply.evaluation), contextStamp: reply.context_stamp },
          body: withoutStaleReviews(reply.body, reply.evaluation.plan.stale_reviews ?? []),
          save: { ...this.state.save, state: "unsaved", error: "" },
        });
      } finally {
        if (life === this.life) this.resume();
      }
    });
  };

  /** Record a staff decision on some changes. The draft is saved first, so the decision is on what is on screen. */
  review = async (input: Omit<ReviewInput, "contextStamp" | "key">): Promise<void> => {
    const send = this.transport.review;
    if (!send) return;
    await this.hold("review", async () => {
      try {
        await this.flush(true);
        const reply = await send({ ...input, contextStamp: this.facts.contextStamp, key: newId() }, this.draftFacts());
        const facts = this.facts;
        this.set({
          facts: {
            ...facts, contextStamp: reply.context_stamp ?? facts.contextStamp,
            staleReviews: reply.evaluation?.plan?.stale_reviews ?? facts.staleReviews.filter(id => !input.itemIds.includes(id)),
            draft: { ...(facts.draft ?? { dirty: true }), revision: reply.draft.revision, base_version_id: reply.draft.base_version_id, dirty: true, stored_model: PLAN_MODEL },
          },
          body: adoptReviews(this.state.body!, reply.body),
        });
      } catch (error) {
        if (isPlanConflict(error)) this.stop();
        // The file's evidence or loan inputs moved while this was open: take the new facts so the next try stands on them.
        else if (error instanceof PlanError && error.status === 409) {
          await this.refresh().catch(() => undefined);
          throw new PlanError(409, "The file's figures changed while this plan was open, so nothing was recorded. They have been refreshed here: check the changes against them, then choose again.", error.code, error.detail);
        }
        throw error;
      }
    });
  };

  setGoal = async (amount: number): Promise<void> => {
    const send = this.transport.setGoal;
    if (!send) return;
    await this.hold("goal", async () => {
      const goal = await send(amount, this.facts.goal?.currency || this.state.body?.currency || "USD", this.facts.goal, newId());
      this.set({ facts: { ...this.facts, goal } });
      await this.refresh().catch(() => undefined);
    });
  };
}
