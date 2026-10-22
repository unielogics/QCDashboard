import { describe, expect, it } from "vitest";
import {
  isTerminalNegativeIntakeStatus,
  resolveIntakeDisplayStatus,
  resolveIntakeWorkspaceState,
} from "@/lib/intakeWorkspace";

describe("AI Intake workspace lifecycle", () => {
  it.each(["denied", "disqualified", "lost", "closed_lost", "withdrawn", "withdrawn_expired", "not qualified"])(
    "classifies %s as terminal and closed",
    (status) => {
      expect(isTerminalNegativeIntakeStatus(status)).toBe(true);
      expect(resolveIntakeWorkspaceState({ outcomeStatus: status })).toBe("closed");
    },
  );

  it("keeps verified funded files active", () => {
    expect(resolveIntakeWorkspaceState({ underwritingStatus: "closed_won", intakeStatus: "completed" })).toBe("active");
    expect(resolveIntakeDisplayStatus({ underwritingStatus: "closed_won", intakeStatus: "completed" })).toBe("closed_won");
    expect(resolveIntakeWorkspaceState({ underwritingStatus: "closed_won", outcomeStatus: "denied" })).toBe("active");
  });

  it("does not treat legacy intake completion as funding", () => {
    expect(resolveIntakeWorkspaceState({ intakeStatus: "completed" })).toBe("active");
    expect(resolveIntakeDisplayStatus({ intakeStatus: "completed" })).toBe("completed");
  });

  it("keeps an API-classified active legacy completion out of the loss badge", () => {
    const record = {
      workspaceState: "active",
      intakeStatus: "completed",
      outcomeStatus: "closed",
    };
    expect(resolveIntakeWorkspaceState(record)).toBe("active");
    expect(resolveIntakeDisplayStatus(record)).toBe("completed");
  });

  it("shows an explicit denied outcome instead of a stale workflow status", () => {
    const record = {
      intakeStatus: "completed",
      underwritingStatus: "in_underwriting",
      outcomeStatus: "denied",
    };
    expect(resolveIntakeWorkspaceState(record)).toBe("closed");
    expect(resolveIntakeDisplayStatus(record)).toBe("denied");
  });

  it("keeps manual archive distinct from a closed lifecycle", () => {
    expect(resolveIntakeWorkspaceState({ archivedAt: "2026-10-22T12:00:00Z" })).toBe("archived");
    expect(resolveIntakeWorkspaceState({ workspaceState: "active", archivedAt: "2026-10-22T12:00:00Z" })).toBe("archived");
    expect(resolveIntakeWorkspaceState({ workspaceState: "closed", archivedAt: null })).toBe("closed");
  });

  it("trusts the API workspace classification during rolling lifecycle changes", () => {
    expect(resolveIntakeWorkspaceState({ workspaceState: "closed", intakeStatus: "reviewed" })).toBe("closed");
    expect(resolveIntakeDisplayStatus({ workspaceState: "closed", workspaceStateReason: "withdrawn" })).toBe("withdrawn");
  });
});
