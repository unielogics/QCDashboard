// Finding a client on the Clients page: what the search box reads, the filters
// beside it, and how both are kept in the page address.
//
// Kept apart from the page so it can be checked as plain data.

import type { ClientStage, ProductAccountType } from "@/lib/types";
import type { UnifiedVertical } from "@/lib/unifiedOperator";

export type AuthorizationState = "ready" | "partial" | "none";

export type FinderVertical = "all" | UnifiedVertical;
export type FinderStage = "all" | ClientStage;
/** `agent:<broker id>` narrows to one agent's clients. */
export type FinderDesk = "all" | "unassigned" | `agent:${string}`;
export type FinderAccess = "all" | "has" | "funding" | "audit" | "none";
export type FinderAuthorization = "all" | AuthorizationState;

export type ClientFinderState = {
  q: string;
  vertical: FinderVertical;
  stage: FinderStage;
  desk: FinderDesk;
  access: FinderAccess;
  authorization: FinderAuthorization;
};

export type FinderFacet = keyof ClientFinderState;

export const EMPTY_FINDER: ClientFinderState = {
  q: "",
  vertical: "all",
  stage: "all",
  desk: "all",
  access: "all",
  authorization: "all",
};

/** What the finder reads off a client. The page builds these once per row. */
export interface FinderSubject {
  /** Everything the search box reads, already folded by `searchText`. */
  _search: string;
  /** Every phone number on record, digits only. */
  _phones: string[];
  _stage: ClientStage;
  _verticals: UnifiedVertical[];
  broker_id: string | null;
  /** The products this person can sign in to. Empty when there is no access. */
  _access: ProductAccountType[];
  _authorization: AuthorizationState;
}

const ACCENTS = /[̀-ͯ]/g;

/** Lower case, accents removed: "Peña" and "pena" are the same search. */
export function fold(value: string): string {
  return value.normalize("NFD").replace(ACCENTS, "").toLowerCase();
}

/**
 * One searchable text from a client's separate fields.
 *
 * The fields are kept on separate lines, so a word can only match inside one
 * field and never across the end of one and the start of the next.
 */
export function searchText(parts: Array<string | null | undefined>): string {
  return parts
    .filter((part): part is string => typeof part === "string" && part.trim() !== "")
    .map((part) => fold(part.trim()))
    .join("\n");
}

export function digitsOf(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/** Digits with the separators people put in a phone number, and nothing else. */
const PHONE_LIKE = /^[\d\s().+\-]+$/;

function phoneMatches(phones: string[], typed: string): boolean {
  const digits = digitsOf(typed);
  if (digits.length < 3) return false;
  // A number stored without the country code still matches one typed with it.
  const withoutCountry = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : null;
  return phones.some(
    (phone) => phone.includes(digits) || (withoutCountry !== null && phone.includes(withoutCountry)),
  );
}

/**
 * Does this client match what was typed?
 *
 * Every word has to be found somewhere on the client, in any order, so
 * "ruiz harbor" finds Dana Ruiz of Harbor Auto Detail. A phone number matches
 * however it is punctuated, whole or in part.
 */
export function matchesQuery(subject: Pick<FinderSubject, "_search" | "_phones">, query: string): boolean {
  const typed = fold(query).trim();
  if (!typed) return true;
  if (PHONE_LIKE.test(typed) && phoneMatches(subject._phones, typed)) return true;
  return typed
    .split(/\s+/)
    .every(
      (word) =>
        subject._search.includes(word) || (PHONE_LIKE.test(word) && phoneMatches(subject._phones, word)),
    );
}

const TESTS: Record<FinderFacet, (subject: FinderSubject, state: ClientFinderState) => boolean> = {
  q: (subject, state) => matchesQuery(subject, state.q),
  vertical: (subject, state) => state.vertical === "all" || subject._verticals.includes(state.vertical),
  stage: (subject, state) => state.stage === "all" || subject._stage === state.stage,
  desk: (subject, state) => {
    if (state.desk === "all") return true;
    if (state.desk === "unassigned") return !subject.broker_id;
    return subject.broker_id === state.desk.slice("agent:".length);
  },
  access: (subject, state) => {
    if (state.access === "all") return true;
    if (state.access === "has") return subject._access.length > 0;
    if (state.access === "none") return subject._access.length === 0;
    return subject._access.includes(state.access);
  },
  authorization: (subject, state) =>
    state.authorization === "all" || subject._authorization === state.authorization,
};

const FACETS = Object.keys(TESTS) as FinderFacet[];

/** The clients that pass the search and every filter, leaving out `except`. */
export function findClients<T extends FinderSubject>(
  rows: readonly T[],
  state: ClientFinderState,
  except?: FinderFacet,
): T[] {
  const facets = FACETS.filter((facet) => facet !== except);
  return rows.filter((row) => facets.every((facet) => TESTS[facet](row, state)));
}

/**
 * How many clients each choice of one filter would show, given the search and
 * the other filters as they stand. This is the number printed beside a choice,
 * so it always says what picking that choice will give.
 */
export function facetCounts<T extends FinderSubject, F extends Exclude<FinderFacet, "q">>(
  rows: readonly T[],
  state: ClientFinderState,
  facet: F,
  values: ReadonlyArray<ClientFinderState[F]>,
): Record<string, number> {
  const pool = findClients(rows, state, facet);
  const counts: Record<string, number> = {};
  for (const value of values) {
    const candidate = { ...state, [facet]: value } as ClientFinderState;
    counts[value] = pool.filter((row) => TESTS[facet](row, candidate)).length;
  }
  return counts;
}

export function isFinderActive(state: ClientFinderState): boolean {
  return FACETS.some((facet) => (facet === "q" ? state.q.trim() !== "" : state[facet] !== EMPTY_FINDER[facet]));
}

// ── the page address ────────────────────────────────────────────────────────
// The search and filters ride in the query string, so opening a client and
// coming back returns to the same list, and a narrowed list can be linked to.

const VERTICALS: readonly FinderVertical[] = ["all", "real_estate", "main_street", "dealer", "mca"];
const STAGES: readonly FinderStage[] = [
  "all",
  "lead",
  "contacted",
  "verified",
  "ready_for_lending",
  "processing",
  "funded",
  "lost",
];
const ACCESS: readonly FinderAccess[] = ["all", "has", "funding", "audit", "none"];
const AUTHORIZATIONS: readonly FinderAuthorization[] = ["all", "ready", "partial", "none"];

/** The address uses `auth` for the authorization filter; the rest use their own names. */
const PARAM: Record<FinderFacet, string> = {
  q: "q",
  vertical: "vertical",
  stage: "stage",
  desk: "desk",
  access: "access",
  authorization: "auth",
};

function oneOf<T extends string>(allowed: readonly T[], value: string | null, fallback: T): T {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function deskFrom(value: string | null): FinderDesk {
  if (value === "unassigned") return "unassigned";
  if (value !== null && value.startsWith("agent:") && value.length > "agent:".length) {
    return value as FinderDesk;
  }
  return "all";
}

/** Read the finder from a query string. Anything unrecognised is ignored. */
export function finderFromQuery(search: string): ClientFinderState {
  const params = new URLSearchParams(search);
  return {
    q: (params.get(PARAM.q) ?? "").slice(0, 200),
    vertical: oneOf(VERTICALS, params.get(PARAM.vertical), "all"),
    stage: oneOf(STAGES, params.get(PARAM.stage), "all"),
    desk: deskFrom(params.get(PARAM.desk)),
    access: oneOf(ACCESS, params.get(PARAM.access), "all"),
    authorization: oneOf(AUTHORIZATIONS, params.get(PARAM.authorization), "all"),
  };
}

/**
 * Write the finder into a query string, keeping whatever else is in it.
 * Returns the string without a leading "?", empty when nothing is left.
 */
export function finderToQuery(state: ClientFinderState, existing = ""): string {
  const params = new URLSearchParams(existing);
  for (const facet of FACETS) {
    const value = facet === "q" ? state.q.trim() : state[facet];
    if (value && value !== EMPTY_FINDER[facet]) params.set(PARAM[facet], value);
    else params.delete(PARAM[facet]);
  }
  return params.toString();
}
