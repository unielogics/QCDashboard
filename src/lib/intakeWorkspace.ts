export type IntakeWorkspaceState = "active" | "closed" | "archived";

export type IntakeWorkspaceRecord = {
  workspaceState?: string | null;
  workspaceStateReason?: string | null;
  archivedAt?: string | null;
  underwritingStatus?: string | null;
  outcomeStatus?: string | null;
  intakeStatus?: string | null;
};

const TERMINAL_NEGATIVE_STATUSES = new Set([
  "cancelled",
  "closed",
  "closed_lost",
  "declined",
  "denied",
  "disqualified",
  "lost",
  "not_qualified",
  "rejected",
  "withdrawn",
  "withdrawn_expired",
]);

const FUNDED_STATUSES = new Set(["closed_won", "funded"]);

export function normalizeIntakeLifecycleStatus(value?: string | null): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function isTerminalNegativeIntakeStatus(value?: string | null): boolean {
  return TERMINAL_NEGATIVE_STATUSES.has(normalizeIntakeLifecycleStatus(value));
}

export function isFundedIntakeStatus(value?: string | null): boolean {
  return FUNDED_STATUSES.has(normalizeIntakeLifecycleStatus(value));
}

/**
 * Resolve the workspace visibility without conflating an AI review finishing
 * with a loan funding. A concrete manual archive timestamp wins, followed by
 * the API's explicit workspace state. The fallback keeps older responses
 * usable during a rolling deployment.
 */
export function resolveIntakeWorkspaceState(record: IntakeWorkspaceRecord): IntakeWorkspaceState {
  if (record.archivedAt) return "archived";
  const explicit = normalizeIntakeLifecycleStatus(record.workspaceState);
  if (explicit === "active" || explicit === "closed" || explicit === "archived") return explicit;

  // A verified funding lifecycle is authoritative. A legacy intake status of
  // "completed" is only review/workflow completion and is deliberately not
  // included here.
  if (isFundedIntakeStatus(record.underwritingStatus)) return "active";

  if (
    isTerminalNegativeIntakeStatus(record.underwritingStatus)
    || isTerminalNegativeIntakeStatus(record.outcomeStatus)
    || isTerminalNegativeIntakeStatus(record.intakeStatus)
  ) return "closed";

  return "active";
}

/** Pick the status operators should see on the badge. */
export function resolveIntakeDisplayStatus(record: IntakeWorkspaceRecord): string {
  const workspaceState = resolveIntakeWorkspaceState(record);
  const explicitWorkspaceState = normalizeIntakeLifecycleStatus(record.workspaceState);
  const reason = normalizeIntakeLifecycleStatus(record.workspaceStateReason);
  const underwriting = normalizeIntakeLifecycleStatus(record.underwritingStatus);
  const outcome = normalizeIntakeLifecycleStatus(record.outcomeStatus);
  const intake = normalizeIntakeLifecycleStatus(record.intakeStatus);

  if (workspaceState === "closed") {
    return [reason, outcome, underwriting, intake].find(isTerminalNegativeIntakeStatus) || "closed";
  }
  if (isFundedIntakeStatus(underwriting)) return underwriting;
  if (explicitWorkspaceState === "active") {
    // The API has already reconciled canonical underwriting, foreclosure, and
    // legacy fields. Do not let an old `outcome_status=closed` turn an active
    // review-complete record into a red loss badge.
    return [underwriting, intake, outcome]
      .find((status) => status && !isTerminalNegativeIntakeStatus(status)) || "submitted";
  }
  if (isTerminalNegativeIntakeStatus(outcome)) return outcome;
  if (isTerminalNegativeIntakeStatus(underwriting)) return underwriting;
  if (underwriting) return underwriting;
  if (isTerminalNegativeIntakeStatus(intake)) return intake;
  return intake || (outcome !== "submitted" ? outcome : "") || "submitted";
}
