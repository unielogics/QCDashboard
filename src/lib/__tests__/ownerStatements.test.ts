import { describe, expect, it } from "vitest";
import {
  canDecideOwnerStatements,
  historyOf,
  linkWords,
  listOf,
  matchWords,
  missingOwners,
  moneyWords,
  requirementOwnerStatements,
  requirementWords,
  sendWords,
  shortDay,
  statementStatusWords,
  statementWords,
  summaryWords,
  versionWords,
  type OwnerStatement,
  type OwnerStatementRow,
  type OwnerStatementVersion,
  type OwnerStatementsRead,
} from "@/lib/ownerStatements";

// Every person here is made up.
const NOW = new Date("2026-11-18T15:00:00Z");

function version(changes: Partial<OwnerStatementVersion> = {}): OwnerStatementVersion {
  return {
    id: "version-1", family_id: "family-1", version_number: 1, created_at: "2026-11-16T14:00:00Z", source: "form", status: "filed",
    actor_name: "Jordan Sample", by_staff: false, has_pdf: true, is_current: true, awaiting_review: false,
    figures: { statement_date: "2026-11-01", total_assets: 700000, total_liabilities: 190000, net_worth: 510000, liquid_assets: 42000 },
    ...changes,
  };
}

function statement(changes: Partial<OwnerStatement> = {}): OwnerStatement {
  const saved = version();
  return {
    family_id: "family-1", label: "Personal financial statement · Jordan Sample", applicant_name: "Jordan Sample", received: true,
    received_version: saved, draft_in_progress: false, draft_updated_at: null, figures: saved.figures, versions: [saved], link: null,
    ...changes,
  };
}

function row(changes: Partial<OwnerStatementRow> = {}): OwnerStatementRow {
  return {
    owner_id: "owner-1", full_name: "Jordan Sample", first_name: "Jordan", last_name: "Sample", email: "jordan@example.com",
    ownership_pct: 50, is_primary: true, required: true, reason: "ownership", request_note: null, request_by: null, request_at: null,
    status: "received", matched_by: "assigned", joint_with: [], statement: statement(), other_statements: [],
    ...changes,
  };
}

const waiting = row({
  owner_id: "owner-2", full_name: "Alex Rivera", first_name: "Alex", last_name: "Rivera", email: "alex@example.com", is_primary: false,
  status: "not_started", matched_by: null, statement: null,
});

function read(changes: Partial<OwnerStatementsRead> = {}): OwnerStatementsRead {
  return {
    profile_id: "profile-1", threshold_pct: 20, required_count: 2, received_count: 1, complete: false, missing_owner_ids: ["owner-2"],
    owners: [row(), waiting], unassigned: [], on_checklist: true, loose_files: [],
    ...changes,
  };
}

describe("an owner's statement, in the desk's words", () => {
  it("names each state once: not sent, sent, opened, in progress, received", () => {
    expect(statementStatusWords(waiting)).toEqual({ label: "Not sent yet", tone: "warn" });
    expect(statementStatusWords(row({ status: "sent" })).label).toBe("Link sent");
    expect(statementStatusWords(row({ status: "opened" })).label).toBe("Link opened");
    expect(statementStatusWords(row({ status: "in_progress" })).label).toBe("In progress");
    expect(statementStatusWords(row())).toEqual({ label: "Received", tone: "ok" });
  });

  it("says an upload still needs review, and that a statement nobody asked for is not required", () => {
    const upload = version({ source: "original", status: "original", awaiting_review: true });
    expect(statementStatusWords(row({ statement: statement({ received_version: upload, versions: [upload] }) }))).toEqual({ label: "Uploaded · needs review", tone: "acc" });
    expect(statementStatusWords(row({ required: false, reason: "under_threshold" })).label).toBe("Received · not required");
    expect(statementStatusWords(row({ status: "not_required", required: false })).label).toBe("Not required");
    expect(statementStatusWords(row({ status: "not_needed", required: false })).label).toBe("Not needed");
  });

  it("says why an owner does or does not owe one", () => {
    expect(requirementWords(row(), 20)).toBe("Owns 20.00% or more");
    expect(requirementWords(row({ reason: "requested" }), 20)).toBe("Under 20.00%, asked by your team");
    expect(requirementWords(row({ reason: "under_threshold" }), 20)).toBe("Under 20.00%, so not required");
    expect(requirementWords(row({ reason: "not_needed", request_by: "Sam Desk", request_note: "Silent partner, lender waived it" }), 20))
      .toBe("Marked not needed by Sam Desk: Silent partner, lender waived it");
  });

  it("says how each version arrived and who saved it", () => {
    expect(versionWords(version())).toBe("Filled in online by the owner");
    expect(versionWords(version({ by_staff: true }))).toBe("Filled in by your team");
    expect(versionWords(version({ status: "published", by_staff: true }))).toBe("Saved by your team · not filed");
    expect(versionWords(version({ source: "original", status: "original" }))).toBe("Uploaded statement");
    expect(versionWords(version({ source: "original", status: "original", awaiting_review: true }))).toBe("Uploaded statement · waiting for review");
    expect(versionWords(version({ source: "legacy_baseline", status: "original" }))).toBe("Filed before versions were kept");
  });

  it("reads the statement and the link in one line each", () => {
    expect(statementWords(row(), NOW)).toBe("v1 · Filled in online by the owner · Nov 16");
    expect(statementWords(waiting, NOW)).toBe("None yet");
    expect(statementWords(row({ status: "in_progress", statement: statement({ received: false, received_version: null, versions: [], draft_in_progress: true, draft_updated_at: "2026-11-17T09:00:00Z" }) }), NOW))
      .toBe("Draft in progress · edited Nov 17");
    expect(linkWords(waiting, NOW)).toBe("No link sent");
    const link = { sent_at: "2026-11-15T10:00:00Z", sent_to: "alex@example.com", opened_at: null, use_count: 0, completed_at: null, expires_at: "2026-12-15T10:00:00Z" };
    expect(linkWords(row({ statement: statement({ link }) }), NOW)).toBe("Sent Nov 15 · not opened");
    expect(linkWords(row({ statement: statement({ link: { ...link, opened_at: "2026-11-16T08:00:00Z", use_count: 2 } }) }), NOW)).toBe("Sent Nov 15 · opened Nov 16");
  });

  it("flags a tie the system made itself, and stays quiet about one the desk made", () => {
    expect(matchWords(row())).toBe("");
    expect(matchWords(row({ matched_by: "name" }))).toBe("Matched by the name on the statement");
    expect(matchWords(row({ matched_by: "primary" }))).toBe("No name on it, so taken as the primary owner's");
    expect(matchWords(row({ matched_by: "only_owner" }))).toBe("Taken as theirs: the only owner who owes one");
    expect(matchWords(waiting)).toBe("");
  });

  it("keeps one history per owner across however their statements arrived, newest first", () => {
    const upload = version({ id: "version-0", family_id: "family-0", source: "original", status: "original", created_at: "2026-10-02T12:00:00Z", is_current: false });
    const second = version({ id: "version-2", version_number: 2, created_at: "2026-11-18T09:00:00Z" });
    const history = historyOf(row({ statement: statement({ versions: [second, version({ is_current: false })] }), other_statements: [statement({ family_id: "family-0", versions: [upload] })] }));
    expect(history.map((item) => item.id)).toEqual(["version-2", "version-1", "version-0"]);
  });
});

describe("the file as a whole", () => {
  it("counts statements received out of owners who owe one", () => {
    expect(summaryWords(read())).toBe("1 of 2 statements received");
    expect(summaryWords({ required_count: 1, received_count: 1 })).toBe("1 of 1 statement received");
    expect(summaryWords({ required_count: 0, received_count: 0 })).toBe("No owner owes a statement");
  });

  it("splits the missing owners into those a link can reach and those with no email", () => {
    const noEmail = { ...waiting, owner_id: "owner-3", full_name: "Riley Chen", email: null };
    const result = missingOwners(read({ owners: [row(), waiting, noEmail], missing_owner_ids: ["owner-2", "owner-3"] }));
    expect(result.reachable.map((item) => item.full_name)).toEqual(["Alex Rivera"]);
    expect(result.noEmail.map((item) => item.full_name)).toEqual(["Riley Chen"]);
  });

  it("reports a batch of sends as one sentence, naming who could not be reached", () => {
    expect(sendWords([])).toBe("Nobody is waiting on a link.");
    expect(sendWords([
      { owner_id: "owner-2", owner_name: "Alex Rivera", sent: true, detail: null },
      { owner_id: "owner-4", owner_name: "Morgan Lee", sent: true, detail: null },
      { owner_id: "owner-3", owner_name: "Riley Chen", sent: false, detail: "No personal email on file for this owner" },
    ])).toBe("Emailed Alex Rivera and Morgan Lee their own link. Riley Chen: No personal email on file for this owner.");
  });

  it("reads the per-owner coverage off the checklist row, and nothing off a row without it", () => {
    const coverage = { source: "owner_statements", required_owner_count: 2, received_owner_count: 1, accepted_owner_count: 1, complete: false, accepted_complete: false, missing: ["Alex Rivera"], unassigned_count: 0, owners: [] };
    expect(requirementOwnerStatements({ provenance: { owner_statements: coverage } })?.missing).toEqual(["Alex Rivera"]);
    expect(requirementOwnerStatements({ provenance: {} })).toBeNull();
    expect(requirementOwnerStatements({ provenance: { owner_statements: { source: "something_else" } } })).toBeNull();
  });

  it("lets only the underwriting roles send links and decide whose statement is whose", () => {
    expect(canDecideOwnerStatements("super_admin")).toBe(true);
    expect(canDecideOwnerStatements("loan_exec")).toBe(true);
    expect(canDecideOwnerStatements("broker")).toBe(false);
    expect(canDecideOwnerStatements(undefined)).toBe(false);
  });
});

describe("small words", () => {
  it("writes a day without the year until the year differs", () => {
    expect(shortDay("2026-11-16T14:00:00Z", NOW)).toBe("Nov 16");
    expect(shortDay("2025-03-04T14:00:00Z", NOW)).toBe("Mar 4, 2025");
    expect(shortDay(null, NOW)).toBe("");
    expect(shortDay("not a date", NOW)).toBe("");
  });

  it("writes money whole, and says so when a figure was not stated", () => {
    expect(moneyWords(510000)).toBe("$510,000");
    expect(moneyWords(null)).toBe("Not stated");
  });

  it("joins names the way a sentence does", () => {
    expect(listOf([])).toBe("");
    expect(listOf(["Alex Rivera"])).toBe("Alex Rivera");
    expect(listOf(["Alex Rivera", "Riley Chen"])).toBe("Alex Rivera and Riley Chen");
    expect(listOf(["Alex Rivera", "Riley Chen", "Morgan Lee"])).toBe("Alex Rivera, Riley Chen and Morgan Lee");
  });
});
