import { describe, expect, it } from "vitest";

import {
  EMPTY_FINDER,
  digitsOf,
  facetCounts,
  findClients,
  finderFromQuery,
  finderToQuery,
  isFinderActive,
  matchesQuery,
  searchText,
  type ClientFinderState,
  type FinderSubject,
} from "@/lib/clientFinder";

// Made-up people throughout.
type Row = FinderSubject & { id: string };

function row(id: string, fields: Array<string | null>, extra: Partial<FinderSubject> & { phones?: string[] } = {}): Row {
  const { phones = [], ...rest } = extra;
  return {
    id,
    _search: searchText(fields),
    _phones: phones.map(digitsOf),
    _stage: "lead",
    _verticals: [],
    broker_id: null,
    _access: [],
    _authorization: "none",
    ...rest,
  };
}

const dana = row("dana", ["Dana Ruiz", "dana@harborautodetail.example", "Las Vegas", "Harbor Auto Detail LLC"], {
  phones: ["+17025550101"],
  _verticals: ["main_street"],
  broker_id: "agent-1",
  _access: ["funding"],
  _authorization: "ready",
  _stage: "processing",
});
const ines = row("ines", ["Inés Peña", "ines@example.com", "Reno", "Peña Trucking"], {
  phones: ["(775) 555-0144"],
  _verticals: ["dealer", "mca"],
  _access: ["funding", "audit"],
  _authorization: "partial",
});
const omar = row("omar", ["Omar Haddad", "omar@example.com", null, "Sunrise Equipment Rental"], {
  _verticals: ["dealer"],
  broker_id: "agent-2",
});
const lena = row("lena", ["Lena Park", null, "Henderson"], { phones: ["702-555-0199"] });
const BOOK = [dana, ines, omar, lena];

const ids = (rows: Row[]) => rows.map((item) => item.id);
const find = (state: Partial<ClientFinderState>) => ids(findClients(BOOK, { ...EMPTY_FINDER, ...state }));

describe("searching", () => {
  it("finds a client by any part of the name, in any case", () => {
    expect(find({ q: "ruiz" })).toEqual(["dana"]);
    expect(find({ q: "DANA" })).toEqual(["dana"]);
    expect(find({ q: "  park " })).toEqual(["lena"]);
  });

  it("finds a client by email, city and business", () => {
    expect(find({ q: "harborautodetail" })).toEqual(["dana"]);
    expect(find({ q: "reno" })).toEqual(["ines"]);
    expect(find({ q: "sunrise equipment" })).toEqual(["omar"]);
  });

  it("treats accented and plain spellings as the same", () => {
    expect(find({ q: "pena" })).toEqual(["ines"]);
    expect(find({ q: "Inés" })).toEqual(["ines"]);
    expect(find({ q: "ines pena" })).toEqual(["ines"]);
  });

  it("needs every word, in any order, anywhere on the client", () => {
    expect(find({ q: "harbor ruiz" })).toEqual(["dana"]);
    expect(find({ q: "ruiz reno" })).toEqual([]);
  });

  it("does not match across two fields", () => {
    // "Ruiz" ends the name and "dana@" starts the email: together they are not a word.
    expect(matchesQuery(dana, "ruizdana")).toBe(false);
    expect(matchesQuery(lena, "parkhenderson")).toBe(false);
  });

  it("finds a phone number however it is typed", () => {
    for (const typed of ["7025550101", "702-555-0101", "(702) 555-0101", "702 555 0101", "+1 702 555 0101", "1 (702) 555-0101", "0101"]) {
      expect(find({ q: typed }), typed).toEqual(["dana"]);
    }
    // Stored without a country code, typed with one.
    expect(find({ q: "+1 775 555 0144" })).toEqual(["ines"]);
    // An area code alone lists everyone in it.
    expect(find({ q: "702" })).toEqual(["dana", "lena"]);
  });

  it("mixes a name with part of a phone number", () => {
    expect(find({ q: "park 0199" })).toEqual(["lena"]);
    expect(find({ q: "park 0101" })).toEqual([]);
  });

  it("does not treat one or two digits as a phone number", () => {
    expect(find({ q: "70" })).toEqual([]);
  });

  it("shows everyone when nothing is typed", () => {
    expect(find({ q: "" })).toEqual(ids(BOOK));
    expect(find({ q: "   " })).toEqual(ids(BOOK));
  });
});

describe("filters", () => {
  it("narrows by vertical, counting a client with files in two verticals under both", () => {
    expect(find({ vertical: "dealer" })).toEqual(["ines", "omar"]);
    expect(find({ vertical: "mca" })).toEqual(["ines"]);
    expect(find({ vertical: "real_estate" })).toEqual([]);
  });

  it("narrows by stage", () => {
    expect(find({ stage: "processing" })).toEqual(["dana"]);
    expect(find({ stage: "lead" })).toEqual(["ines", "omar", "lena"]);
  });

  it("narrows by desk: one agent, or nobody yet", () => {
    expect(find({ desk: "unassigned" })).toEqual(["ines", "lena"]);
    expect(find({ desk: "agent:agent-2" })).toEqual(["omar"]);
    expect(find({ desk: "agent:someone-else" })).toEqual([]);
  });

  it("narrows by access", () => {
    expect(find({ access: "has" })).toEqual(["dana", "ines"]);
    expect(find({ access: "audit" })).toEqual(["ines"]);
    expect(find({ access: "funding" })).toEqual(["dana", "ines"]);
    expect(find({ access: "none" })).toEqual(["omar", "lena"]);
  });

  it("narrows by authorization", () => {
    expect(find({ authorization: "ready" })).toEqual(["dana"]);
    expect(find({ authorization: "partial" })).toEqual(["ines"]);
    expect(find({ authorization: "none" })).toEqual(["omar", "lena"]);
  });

  it("applies the search and every filter together", () => {
    expect(find({ q: "example.com", vertical: "dealer", desk: "unassigned" })).toEqual(["ines"]);
    expect(find({ q: "example.com", vertical: "dealer", desk: "unassigned", access: "none" })).toEqual([]);
  });
});

describe("the number beside each choice", () => {
  it("counts what picking that choice would show", () => {
    const counts = facetCounts(BOOK, EMPTY_FINDER, "stage", ["all", "lead", "processing", "funded"]);
    expect(counts).toEqual({ all: 4, lead: 3, processing: 1, funded: 0 });
  });

  it("follows the search and the other filters, but not its own", () => {
    const state: ClientFinderState = { ...EMPTY_FINDER, q: "@", stage: "processing" };
    // Three people have an email address; the stage filter in force does not
    // shrink the stage counts, or every other tab would read zero.
    expect(facetCounts(BOOK, state, "stage", ["all", "lead", "processing"])).toEqual({ all: 3, lead: 2, processing: 1 });
    // The desk counts do follow the stage filter.
    expect(facetCounts(BOOK, state, "desk", ["unassigned", "agent:agent-1", "agent:agent-2"])).toEqual({
      unassigned: 0,
      "agent:agent-1": 1,
      "agent:agent-2": 0,
    });
  });
});

describe("knowing whether anything is narrowing the list", () => {
  it("is off for an empty finder and for a search of only spaces", () => {
    expect(isFinderActive(EMPTY_FINDER)).toBe(false);
    expect(isFinderActive({ ...EMPTY_FINDER, q: "   " })).toBe(false);
  });

  it("is on for a search or any one filter", () => {
    expect(isFinderActive({ ...EMPTY_FINDER, q: "ruiz" })).toBe(true);
    expect(isFinderActive({ ...EMPTY_FINDER, desk: "unassigned" })).toBe(true);
    expect(isFinderActive({ ...EMPTY_FINDER, stage: "funded" })).toBe(true);
  });
});

describe("the page address", () => {
  it("round-trips a search and every filter", () => {
    const state: ClientFinderState = {
      q: "harbor & sons",
      vertical: "main_street",
      stage: "ready_for_lending",
      desk: "agent:7f1c",
      access: "audit",
      authorization: "partial",
    };
    const query = finderToQuery(state);
    expect(query).toBe("q=harbor+%26+sons&vertical=main_street&stage=ready_for_lending&desk=agent%3A7f1c&access=audit&auth=partial");
    expect(finderFromQuery(`?${query}`)).toEqual(state);
  });

  it("writes nothing for an empty finder", () => {
    expect(finderToQuery(EMPTY_FINDER)).toBe("");
    expect(finderToQuery({ ...EMPTY_FINDER, q: "  " })).toBe("");
  });

  it("keeps whatever else is in the address, and drops a filter that was cleared", () => {
    expect(finderToQuery({ ...EMPTY_FINDER, desk: "unassigned" }, "?tour=1&stage=funded")).toBe("tour=1&desk=unassigned");
  });

  it("ignores values it does not know", () => {
    expect(finderFromQuery("?vertical=crypto&stage=won&desk=agent:&access=root&auth=maybe")).toEqual(EMPTY_FINDER);
    expect(finderFromQuery("?desk=agent")).toEqual(EMPTY_FINDER);
    expect(finderFromQuery("")).toEqual(EMPTY_FINDER);
  });

  it("caps an over-long search", () => {
    expect(finderFromQuery(`?q=${"a".repeat(500)}`).q).toHaveLength(200);
  });
});
