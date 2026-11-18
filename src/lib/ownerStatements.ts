// A personal financial statement for each owner.
//
// The backend ties each statement to its owner and keeps a version history per
// person (app/services/owner_statements.py). This is the desk's reading of it:
// the types, the words for each state, and the calls. A statement is one
// person's, so nothing here adds two owners' figures together.

import type { ApplicationRequirement } from "@/lib/applicationProfile";
import type { AuthedApi } from "@/lib/worksheetApi";

export type OwnerStatementFigures = {
  statement_date: string | null;
  total_assets: number | null;
  total_liabilities: number | null;
  net_worth: number | null;
  liquid_assets: number | null;
};

export type OwnerStatementVersion = {
  id: string;
  family_id: string;
  version_number: number;
  created_at: string | null;
  /** form: typed in online. original: an uploaded document. legacy_baseline: filed before versions were kept. */
  source: string | null;
  /** filed, published (saved by the desk, not filed) or original. */
  status: string | null;
  actor_name: string | null;
  by_staff: boolean;
  has_pdf: boolean;
  is_current: boolean;
  awaiting_review: boolean;
  figures: OwnerStatementFigures | null;
};

export type OwnerStatementLink = {
  sent_at: string | null;
  sent_to: string | null;
  opened_at: string | null;
  use_count: number;
  completed_at: string | null;
  expires_at: string | null;
};

export type OwnerStatement = {
  family_id: string;
  label: string;
  applicant_name: string | null;
  received: boolean;
  received_version: OwnerStatementVersion | null;
  draft_in_progress: boolean;
  draft_updated_at: string | null;
  figures: OwnerStatementFigures | null;
  versions: OwnerStatementVersion[];
  link: OwnerStatementLink | null;
};

export type OwnerStatementStatus = "received" | "in_progress" | "opened" | "sent" | "not_started" | "not_needed" | "not_required";

export type OwnerStatementRow = {
  owner_id: string;
  full_name: string;
  first_name: string;
  last_name: string;
  email: string | null;
  ownership_pct: number | null;
  is_primary: boolean;
  required: boolean;
  reason: "ownership" | "requested" | "not_needed" | "under_threshold";
  request_note: string | null;
  request_by: string | null;
  request_at: string | null;
  status: OwnerStatementStatus;
  /** How the statement came to be this owner's. Anything but "assigned" is the system's reading, for the desk to check. */
  matched_by: "assigned" | "name" | "only_owner" | "primary" | null;
  joint_with: string[];
  statement: OwnerStatement | null;
  other_statements: OwnerStatement[];
};

export type LooseStatementFile = {
  file_id: string;
  file_name: string;
  uploaded_at: string | null;
  applicant_name: string | null;
  figures: OwnerStatementFigures | null;
};

export type OwnerStatementsRead = {
  profile_id: string;
  threshold_pct: number;
  required_count: number;
  received_count: number;
  complete: boolean;
  missing_owner_ids: string[];
  owners: OwnerStatementRow[];
  /** Statements with something in them that are tied to no owner on the file. */
  unassigned: OwnerStatement[];
  on_checklist: boolean;
  /** Uploaded statements that belong to no statement at all. */
  loose_files: LooseStatementFile[];
};

export type OwnerStatementSend = { owner_id: string; owner_name: string; sent: boolean; detail: string | null };

export type Tone = "ok" | "warn" | "mut" | "acc" | "bad";

const root = (profileId: string) => `/application-profiles/${encodeURIComponent(profileId)}/owner-statements`;

export const ownerStatementsKey = (profileId: string) => ["owner-statements", profileId] as const;

export function readOwnerStatements(api: AuthedApi, profileId: string) {
  return api<OwnerStatementsRead>(root(profileId));
}
export function openOwnerStatement(api: AuthedApi, profileId: string, ownerId: string) {
  return api<{ family_id: string; label: string }>(`${root(profileId)}/${encodeURIComponent(ownerId)}/open`, { method: "POST" });
}
export function mintOwnerStatementLink(api: AuthedApi, profileId: string, ownerId: string) {
  return api<{ url: string; expires_at: string | null }>(`${root(profileId)}/${encodeURIComponent(ownerId)}/link`, { method: "POST" });
}
export function emailOwnerStatementLink(api: AuthedApi, profileId: string, ownerId: string) {
  return api<OwnerStatementSend>(`${root(profileId)}/${encodeURIComponent(ownerId)}/email-link`, { method: "POST" });
}
export function emailMissingOwnerStatements(api: AuthedApi, profileId: string) {
  return api<{ items: OwnerStatementSend[] }>(`${root(profileId)}/email-missing`, { method: "POST", body: JSON.stringify({}) });
}
export function setOwnerStatementRequirement(api: AuthedApi, profileId: string, ownerId: string, required: boolean, reason?: string) {
  return api<OwnerStatementsRead>(`${root(profileId)}/${encodeURIComponent(ownerId)}/requirement`, { method: "PUT", body: JSON.stringify({ required, reason: reason ?? null }) });
}
/**
 * Say whose statement it is. No owners takes it off whoever had it and leaves it
 * waiting to be assigned; with `setAside` it is no owner's on this file and is
 * no longer listed.
 */
export function assignStatementOwners(api: AuthedApi, profileId: string, familyId: string, ownerIds: string[], setAside = false) {
  return api<OwnerStatementsRead>(`${root(profileId)}/statements/${encodeURIComponent(familyId)}/owners`, { method: "PUT", body: JSON.stringify({ owner_ids: ownerIds, set_aside: setAside && !ownerIds.length }) });
}
export function assignStatementFile(api: AuthedApi, profileId: string, fileId: string, ownerId: string) {
  return api<OwnerStatementsRead>(`${root(profileId)}/files/${encodeURIComponent(fileId)}/assign`, { method: "POST", body: JSON.stringify({ owner_id: ownerId }) });
}

const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const DAY_YEAR = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const MONEY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** "Nov 18", with the year once it is not this one. Empty for a date that cannot be read. */
export function shortDay(value: string | null | undefined, now: Date = new Date()): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return (date.getFullYear() === now.getFullYear() ? DAY : DAY_YEAR).format(date);
}

export function moneyWords(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? MONEY.format(value) : "Not stated";
}

/** The chip on an owner's row. */
export function statementStatusWords(row: OwnerStatementRow): { label: string; tone: Tone } {
  switch (row.status) {
    case "received":
      return row.statement?.received_version?.awaiting_review
        ? { label: "Uploaded · needs review", tone: "acc" }
        : { label: row.required ? "Received" : "Received · not required", tone: "ok" };
    case "in_progress":
      return { label: "In progress", tone: "acc" };
    case "opened":
      return { label: "Link opened", tone: "acc" };
    case "sent":
      return { label: "Link sent", tone: "mut" };
    case "not_needed":
      return { label: "Not needed", tone: "mut" };
    case "not_required":
      return { label: "Not required", tone: "mut" };
    default:
      return { label: "Not sent yet", tone: "warn" };
  }
}

/** Why this owner does or does not owe a statement. */
export function requirementWords(row: OwnerStatementRow, thresholdPct: number): string {
  const line = `${thresholdPct.toFixed(2)}%`;
  if (row.reason === "not_needed") return `Marked not needed${row.request_by ? ` by ${row.request_by}` : ""}${row.request_note ? `: ${row.request_note}` : ""}`;
  if (row.reason === "requested") return `Under ${line}, asked by your team`;
  if (row.reason === "ownership") return `Owns ${line} or more`;
  return `Under ${line}, so not required`;
}

/** One saved version, in words: how it arrived and who saved it. */
export function versionWords(version: OwnerStatementVersion): string {
  if (version.source === "original") return version.awaiting_review ? "Uploaded statement · waiting for review" : "Uploaded statement";
  if (version.source === "legacy_baseline") return "Filed before versions were kept";
  if (version.status === "published") return "Saved by your team · not filed";
  return version.by_staff ? "Filled in by your team" : "Filled in online by the owner";
}

/** The owner's statement in one line. */
export function statementWords(row: OwnerStatementRow, now: Date = new Date()): string {
  const statement = row.statement;
  const received = statement?.received_version;
  if (received) return `v${received.version_number} · ${versionWords(received)}${shortDay(received.created_at, now) ? ` · ${shortDay(received.created_at, now)}` : ""}`;
  if (statement?.draft_in_progress) return `Draft in progress${shortDay(statement.draft_updated_at, now) ? ` · edited ${shortDay(statement.draft_updated_at, now)}` : ""}`;
  const saved = statement?.versions[0];
  if (saved) return `v${saved.version_number} · ${versionWords(saved)}`;
  return "None yet";
}

/** Where the owner's private link stands. */
export function linkWords(row: OwnerStatementRow, now: Date = new Date()): string {
  const link = row.statement?.link;
  if (!link) return "No link sent";
  const sent = shortDay(link.sent_at, now);
  const opened = shortDay(link.opened_at, now);
  const parts = [sent ? `Sent ${sent}` : "Sent"];
  if (opened) parts.push(`opened ${opened}`);
  else parts.push("not opened");
  return parts.join(" · ");
}

/** The system's own reading of whose statement this is, when nobody assigned it. Empty when the desk did. */
export function matchWords(row: OwnerStatementRow): string {
  if (!row.statement) return "";
  if (row.matched_by === "name") return "Matched by the name on the statement";
  if (row.matched_by === "primary") return "No name on it, so taken as the primary owner's";
  if (row.matched_by === "only_owner") return "Taken as theirs: the only owner who owes one";
  return "";
}

/** Every saved version this owner has, across however their statements arrived, newest first. */
export function historyOf(row: OwnerStatementRow): OwnerStatementVersion[] {
  const all = [row.statement, ...row.other_statements].flatMap((statement) => statement?.versions ?? []);
  return [...all].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "") || b.version_number - a.version_number);
}

/** "1 of 2 statements received". */
export function summaryWords(read: Pick<OwnerStatementsRead, "required_count" | "received_count">): string {
  if (!read.required_count) return "No owner owes a statement";
  return `${read.received_count} of ${read.required_count} ${read.required_count === 1 ? "statement" : "statements"} received`;
}

/** The owners "Send missing links" would email, and the ones it cannot reach. */
export function missingOwners(read: OwnerStatementsRead): { reachable: OwnerStatementRow[]; noEmail: OwnerStatementRow[] } {
  const missing = read.owners.filter((row) => read.missing_owner_ids.includes(row.owner_id));
  return { reachable: missing.filter((row) => Boolean(row.email)), noEmail: missing.filter((row) => !row.email) };
}

/** What a batch of sends did, as one sentence. */
export function sendWords(items: OwnerStatementSend[]): string {
  if (!items.length) return "Nobody is waiting on a link.";
  const sent = items.filter((item) => item.sent);
  const failed = items.filter((item) => !item.sent);
  const parts: string[] = [];
  if (sent.length) parts.push(`Emailed ${listOf(sent.map((item) => item.owner_name))} their own link.`);
  for (const item of failed) parts.push(`${item.owner_name}: ${item.detail || "the email could not be sent"}.`);
  return parts.join(" ");
}

export function listOf(values: string[]): string {
  if (values.length <= 1) return values.join("");
  return `${values.slice(0, -1).join(", ")} and ${values[values.length - 1]}`;
}

/** Who can send links and decide whose statement is whose: the same roles that underwrite. */
export function canDecideOwnerStatements(role: string | null | undefined): boolean {
  return role === "super_admin" || role === "loan_exec";
}

export const OWNER_STATEMENT_REQUIREMENT_KEY = "owner_personal_financial_statement";

/** What the checklist row carries once the file has an owner who owes a statement. */
export type RequirementOwnerStatements = {
  source: "owner_statements";
  required_owner_count: number;
  received_owner_count: number;
  accepted_owner_count: number;
  complete: boolean;
  accepted_complete: boolean;
  missing: string[];
  unassigned_count: number;
  owners: Array<{ owner_id: string; name: string; received: boolean; accepted: boolean; family_id: string | null; reason: string }>;
};

/** The per-owner coverage on a requirement, or null on a row that does not track owners. */
export function requirementOwnerStatements(requirement: Pick<ApplicationRequirement, "provenance">): RequirementOwnerStatements | null {
  const value = requirement.provenance?.owner_statements;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Partial<RequirementOwnerStatements>;
  if (item.source !== "owner_statements" || !Array.isArray(item.owners) || !Number.isInteger(item.required_owner_count)) return null;
  return item as RequirementOwnerStatements;
}
