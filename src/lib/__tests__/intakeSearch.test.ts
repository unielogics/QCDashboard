import { describe, expect, it } from "vitest";
import { nonIntakeClientLeadsFromGlobalSearch } from "@/lib/intakeSearch";

const groups = [
  {
    client_id: "101",
    client_name: "101 Motors",
    items: [
      { kind: "client", id: "101", title: "101 Motors" },
      { kind: "loan", id: "loan-1", title: "Existing loan" },
    ],
  },
  {
    client_id: "202",
    client_name: "Daniel's Other Company",
    items: [{ kind: "message", id: "message-1", title: "Daniel asked a question" }],
  },
];

describe("AI Intake client-lead fallback search", () => {
  it("returns only explicit client hits from the scoped global search", () => {
    expect(nonIntakeClientLeadsFromGlobalSearch(groups)).toEqual([{ id: "101", name: "101 Motors" }]);
  });

  it("does not mistake a loan, document, or message result for a general lead", () => {
    expect(nonIntakeClientLeadsFromGlobalSearch([groups[1]])).toEqual([]);
  });

  it("deduplicates client hits and respects the display limit", () => {
    const repeated = [
      ...groups,
      { client_id: "101", client_name: "101 Motors", items: [{ kind: "client", id: "101", title: "101 Motors" }] },
      { client_id: "303", client_name: "Third Client", items: [{ kind: "client", id: "303", title: "Third Client" }] },
    ];
    expect(nonIntakeClientLeadsFromGlobalSearch(repeated, 1)).toEqual([{ id: "101", name: "101 Motors" }]);
  });

  it("returns no visible data when the result limit is disabled", () => {
    expect(nonIntakeClientLeadsFromGlobalSearch(groups, 0)).toEqual([]);
  });
});
