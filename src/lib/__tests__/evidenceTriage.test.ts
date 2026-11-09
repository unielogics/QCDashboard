import { describe, expect, it } from "vitest";
import { groupRequirements, requirementIsComplete, triageCounts, triageRequirement, triageSummary, type TriageInput } from "@/lib/evidenceTriage";

type Decision = "accepted" | "needs_more" | "rejected" | "failed" | "processing";

function file(decision: Decision, extra: Record<string, unknown> = {}) {
  return { ai_decision: decision, ai_explanation: null as string | null, verified: false, decision_actor: "ai" as const, ...extra };
}

function requirement(overrides: Partial<TriageInput> & Record<string, unknown> = {}): TriageInput {
  return {
    status: "received_unverified",
    verification_required: false,
    state_reason: null,
    source_program_keys: [],
    program_overrides: {},
    required_level: "required",
    last_requested_at: null,
    evidence_files: [],
    coverage: { current: 1, required: 1, unit: "documents" },
    verified_coverage: { current: 0, required: 1, unit: "documents" },
    ...overrides,
  } as TriageInput;
}

// The four requirements on the Earthly Inc file, shaped the way the API returned them.
const BANK_STATEMENTS = requirement({
  status: "verified",
  state_reason: "Accepted by automatic AI evidence review",
  coverage: { current: 6, required: 6, unit: "months" },
  verified_coverage: { current: 6, required: 6, unit: "months" },
  evidence_files: [
    file("accepted", { verified: true }), file("accepted", { verified: true }), file("accepted", { verified: true }),
    file("accepted", { verified: true }), file("accepted", { verified: true }), file("accepted", { verified: true }),
    file("needs_more", { ai_explanation: "Possible different document" }),
  ],
});
const CREDIT_AUTHORIZATION = requirement({
  status: "verified",
  verification_required: true,
  state_reason: "Accepted by automatic AI evidence review",
  coverage: { current: 1, required: 1, unit: "documents" },
  verified_coverage: { current: 1, required: 1, unit: "documents" },
  evidence_files: [file("accepted", { verified: true })],
});
const ADVANCE_TERMS = requirement({
  state_reason: "AI accepted 0 of 1 required documents; some evidence needs attention",
  coverage: { current: 2, required: 1, unit: "documents" },
  verified_coverage: { current: 0, required: 1, unit: "documents" },
  evidence_files: [
    file("needs_more", { ai_explanation: "The document type could not be validated with high confidence" }),
    file("needs_more", { ai_explanation: "Possible different document" }),
  ],
});
const DEBT_SCHEDULE = requirement({
  verification_required: true,
  state_reason: "AI accepted 0 of 1 required documents",
  coverage: { current: 1, required: 1, unit: "documents" },
  verified_coverage: { current: 0, required: 1, unit: "documents" },
  evidence_files: [file("accepted")],
});

describe("who acts next on a requirement", () => {
  it("sends a received owner report without a bucket-file row to staff with its source coverage and exact review reason", () => {
    const reason = "Existing TransUnion FICO 4 report is linked; Equifax FICO 9 is not established. Staff review is required.";
    const result = triageRequirement(requirement({ status: "received_unverified", evidence_files: [], coverage: { current: 1, required: 1, unit: "owner reports" }, verified_coverage: { current: 0, required: 1, unit: "owner reports" }, state_reason: reason }));
    expect(result).toMatchObject({ group: "you", owner: "you", kind: "review", label: "Needs your review", next: reason });
    expect(result.progress?.text).toBe("1 of 1 owner reports");
    expect(result.next).not.toContain("client needs to send");
  });
  it("calls an accepted, fully covered requirement complete, and says who accepted it", () => {
    const bank = triageRequirement(BANK_STATEMENTS);
    expect(bank).toMatchObject({ group: "done", kind: "complete", label: "Complete", tone: "ok", next: "Accepted by the AI." });
    expect(bank.progress?.text).toBe("6 of 6 months");
    expect(triageRequirement(CREDIT_AUTHORIZATION).next).toBe("Accepted by the AI.");
  });

  it("names a person's sign-off and an override differently from the AI's acceptance", () => {
    const signed = requirement({ status: "verified", verification_required: true, evidence_files: [file("accepted", { verified: true, decision_actor: "staff" })] });
    expect(triageRequirement(signed).next).toBe("Signed off by a person.");
    const overridden = requirement({ status: "verified", state_reason: "Accepted by underwriting override", evidence_files: [file("accepted", { verified: true, decision_actor: "staff" })] });
    expect(triageRequirement(overridden).next).toBe("Accepted by your team as an override.");
  });

  it("puts a file the AI could not accept in front of the underwriter, with the AI's reason", () => {
    const result = triageRequirement(ADVANCE_TERMS);
    expect(result).toMatchObject({ group: "you", kind: "review", label: "Needs your review", owner: "you" });
    expect(result.next).toContain("could not accept 2 of the 2 files");
    expect(result.next).toContain("could not be validated with high confidence.");
    expect(result.progress?.text).toBe("0 of 1 document");
  });

  it("does not leave a file the team already rejected waiting on the team: the client owes a new one", () => {
    // The Earthly debt schedule: staff rejected the PDF ("too many missing columns") and asked for another copy.
    const rejected = requirement({
      verification_required: true,
      coverage: { current: 1, required: 1, unit: "documents" },
      verified_coverage: { current: 0, required: 1, unit: "documents" },
      evidence_files: [file("rejected", { decision_actor: "staff", ai_explanation: "too many missing columns that are important for refinancing" })],
    });
    const result = triageRequirement(rejected);
    expect(result).toMatchObject({ group: "client", kind: "replace", label: "New file needed", owner: "client" });
    expect(result.next).toBe("Your team rejected this file. too many missing columns that are important for refinancing. The client needs to send another, or you can fill it in yourself.");
    expect(result.short).toBe("Your team asked for another copy");
  });

  it("tells the underwriter to fill in the table when a schedule was read and answers are missing, whatever the PDF's own status", () => {
    const rejected = requirement({ evidence_files: [file("rejected", { decision_actor: "staff" })] });
    const result = triageRequirement(rejected, { fillTable: { read: 7, onSchedule: 0, missing: 38 } });
    expect(result).toMatchObject({ group: "you", kind: "fill", label: "Fill in the table", owner: "you" });
    expect(result.short).toBe("We read 7 lines from the file · 38 answers missing");
    expect(result.next).toContain("Fill in the cells marked needed");
    const onSchedule = triageRequirement(requirement({ evidence_files: [file("accepted")] }), { fillTable: { read: 0, onSchedule: 5, missing: 2 } });
    expect(onSchedule.short).toBe("On the schedule: 5 lines · 2 answers missing");
  });

  it("asks staff to save a completed draft instead of claiming its empty original PDF has missing answers", () => {
    const result = triageRequirement(requirement({ evidence_files: [file("needs_more")] }), { fillTable: { read: 5, onSchedule: 5, missing: 0, draftReady: true, publishNeeded: true } });
    expect(result).toMatchObject({ group: "you", kind: "fill", label: "Save completed schedule", owner: "you" });
    expect(result.short).toContain("5 obligations");
    expect(result.next).toContain("Save version");
    expect(result.short).not.toContain("missing");
    expect(triageRequirement(requirement({ status: "verified" }), { fillTable: { read: 0, onSchedule: 5, missing: 0, draftReady: true, publishNeeded: true } }).group).toBe("done");
  });

  it("leaves a complete requirement, a file still being read, and an empty table alone", () => {
    expect(triageRequirement(requirement({ status: "verified", evidence_files: [file("accepted", { verified: true })] }), { fillTable: { read: 3, onSchedule: 0, missing: 4 } }).group).toBe("done");
    expect(triageRequirement(requirement({ evidence_files: [file("processing")] }), { fillTable: { read: 3, onSchedule: 0, missing: 4 } }).kind).toBe("reading");
    expect(triageRequirement(requirement({ status: "requested", evidence_files: [] }), { fillTable: { read: 0, onSchedule: 0, missing: 0 } }).kind).toBe("waiting");
  });

  it("counts a debt schedule with table work as needing the underwriter", () => {
    const rows = [DEBT_SCHEDULE, BANK_STATEMENTS];
    const counts = triageCounts(rows, (row) => (row === DEBT_SCHEDULE ? { fillTable: { read: 7, onSchedule: 0, missing: 38 } } : undefined));
    expect(counts).toEqual({ you: 1, client: 0, ai: 0, done: 1, total: 2 });
  });

  it("still asks the underwriter to look when the AI flagged a file, even if a person rejected another", () => {
    const mixed = requirement({ evidence_files: [file("needs_more"), file("rejected", { decision_actor: "staff" })] });
    expect(triageRequirement(mixed)).toMatchObject({ group: "you", kind: "review" });
    expect(triageRequirement(mixed).next).toContain("could not accept one of the files");
  });

  it("says ready for sign-off — not 'partly received' — when the AI accepted the file and only a person is missing", () => {
    // The live bug: the old label read the sign-off count (0 of 1) as a shortfall of documents.
    const result = triageRequirement(DEBT_SCHEDULE);
    expect(result).toMatchObject({ group: "you", kind: "signoff", label: "Ready for your sign-off" });
    expect(result.progress?.text).toBe("1 of 1 document");
    expect(result.next).not.toMatch(/0 of 1/);
  });

  it("waits on the client when the accepted files cover only part of what is required", () => {
    const partial = requirement({
      coverage: { current: 4, required: 6, unit: "months" },
      verified_coverage: { current: 4, required: 6, unit: "months" },
      evidence_files: [file("accepted"), file("accepted"), file("accepted"), file("accepted")],
    });
    const result = triageRequirement(partial);
    expect(result).toMatchObject({ group: "client", kind: "partial", label: "Waiting on the client", owner: "client" });
    expect(result.progress?.text).toBe("4 of 6 months");
    expect(result.next).toContain("4 of 6 months accepted so far");
  });

  it("puts a flagged file ahead of a shortfall: the underwriter acts first", () => {
    const mixed = requirement({
      coverage: { current: 4, required: 6, unit: "months" },
      verified_coverage: { current: 3, required: 6, unit: "months" },
      evidence_files: [file("accepted"), file("needs_more")],
    });
    expect(triageRequirement(mixed).group).toBe("you");
  });

  it("says the AI is reading while any file is still processing, even if another was flagged", () => {
    const reading = requirement({ evidence_files: [file("processing"), file("needs_more")] });
    expect(triageRequirement(reading)).toMatchObject({ group: "ai", kind: "reading", label: "AI is reading" });
    expect(triageRequirement(reading).next).toContain("reading 1 file now");
  });

  it("separates 'asked, nothing yet' from 'never asked'", () => {
    const asked = requirement({ status: "requested", last_requested_at: "2026-11-03T15:00:00Z", evidence_files: [] });
    expect(triageRequirement(asked)).toMatchObject({ group: "client", kind: "waiting", label: "Waiting on the client" });
    expect(triageRequirement(asked).next).toMatch(/^Asked Nov 3\./);
    const never = requirement({ status: "missing", evidence_files: [] });
    expect(triageRequirement(never)).toMatchObject({ group: "client", kind: "not_asked", label: "Not asked yet" });
  });

  it("asks for a fresh copy when what arrived is out of date", () => {
    expect(triageRequirement(requirement({ status: "stale", evidence_files: [file("accepted")] }))).toMatchObject({ group: "client", kind: "out_of_date", label: "Out of date" });
  });

  it("treats waived, not-applicable and program-overridden items as not needed", () => {
    expect(triageRequirement(requirement({ status: "waived" }))).toMatchObject({ group: "done", kind: "not_needed", label: "Not needed" });
    expect(triageRequirement(requirement({ status: "not_applicable" })).group).toBe("done");
    const overridden = requirement({ source_program_keys: ["a", "b"], program_overrides: { a: "waived", b: "not_applicable" } });
    expect(requirementIsComplete(overridden)).toBe(true);
    expect(triageRequirement(overridden)).toMatchObject({ group: "done", kind: "overridden" });
    expect(requirementIsComplete(requirement({ source_program_keys: ["a", "b"], program_overrides: { a: "waived" } }))).toBe(false);
  });

  it("says the review has not run when the file is in and its checks never did", () => {
    const notRun = requirement({ state_reason: "Run AI review to verify the published document checks with source-page references", evidence_files: [file("accepted")] });
    expect(triageRequirement(notRun)).toMatchObject({ group: "you", kind: "not_run", label: "AI review not run" });
  });

  it("never produces the retired 'Received · AI checking' wording", () => {
    const all = [BANK_STATEMENTS, CREDIT_AUTHORIZATION, ADVANCE_TERMS, DEBT_SCHEDULE, requirement({ evidence_files: [file("accepted")] })];
    for (const item of all) expect(triageRequirement(item).label).not.toMatch(/AI checking|Received/);
  });
});

describe("the four groups", () => {
  const all = [BANK_STATEMENTS, CREDIT_AUTHORIZATION, ADVANCE_TERMS, DEBT_SCHEDULE];

  it("counts the Earthly file as two needing the underwriter and two complete", () => {
    expect(triageCounts(all)).toEqual({ you: 2, client: 0, ai: 0, done: 2, total: 4 });
    expect(triageSummary(triageCounts(all))).toBe("2 items need you. 2 of 4 complete.");
  });

  it("orders groups you → client → ai → done, drops empty ones, and puts the most urgent first", () => {
    const sections = groupRequirements([
      { ...DEBT_SCHEDULE, label: "Business debt schedule" },
      { ...BANK_STATEMENTS, label: "Bank statements" },
      { ...ADVANCE_TERMS, label: "Advance terms" },
      { ...requirement({ status: "requested", evidence_files: [] }), label: "Tax returns" },
    ]);
    expect(sections.map((section) => section.group)).toEqual(["you", "client", "done"]);
    expect(sections[0].items.map((item) => item.requirement.label)).toEqual(["Advance terms", "Business debt schedule"]);
    expect(sections[0].items[0].triage.kind).toBe("review");
  });

  it("sorts required items ahead of optional ones inside a group", () => {
    const sections = groupRequirements([
      { ...requirement({ status: "requested", required_level: "optional", evidence_files: [] }), label: "Optional thing" },
      { ...requirement({ status: "requested", required_level: "required", evidence_files: [] }), label: "Required thing" },
    ]);
    expect(sections[0].items.map((item) => item.requirement.label)).toEqual(["Required thing", "Optional thing"]);
  });

  it("writes a one-line summary that names who has to act", () => {
    expect(triageSummary({ you: 0, client: 2, ai: 1, done: 3, total: 6 })).toBe("2 items are waiting on the client, the AI is working on 1. 3 of 6 complete.");
    expect(triageSummary({ you: 0, client: 0, ai: 0, done: 4, total: 4 })).toBe("All 4 items are complete.");
    expect(triageSummary({ you: 1, client: 0, ai: 0, done: 0, total: 1 })).toBe("1 item needs you. 0 of 1 complete.");
    expect(triageSummary({ you: 0, client: 0, ai: 0, done: 0, total: 0 })).toBe("Nothing is required on this file yet.");
  });
});

describe("collection and qualification are separate", () => {
  const collection = { complete: false, can_complete: true, fingerprint: "a".repeat(64), reason: null, eligible_file_ids: ["business-2025"], suggested_file_ids: ["business-2025"], source: "files" as const };
  it("offers completion for staff-reviewed evidence instead of saying AI rejected the program earnings checks", () => {
    const result = triageRequirement({ ...requirement({ evidence_files: [file("needs_more")], state_reason: "Published documentary checks explicitly require staff verification" }), collection_completion: collection });
    expect(result).toMatchObject({ group: "you", kind: "signoff", label: "Ready to complete" });
    expect(result.next).toContain("Mark complete");
    expect(result.short).not.toContain("AI could not accept");
  });
  it("keeps completed collection in Complete even when source program checks still need review", () => {
    const item = { ...requirement({ evidence_files: [file("needs_more")] }), collection_completion: { ...collection, complete: true, can_complete: false } };
    expect(requirementIsComplete(item)).toBe(true);
    expect(triageRequirement(item)).toMatchObject({ group: "done", kind: "complete", short: "Document collection complete" });
  });
});
