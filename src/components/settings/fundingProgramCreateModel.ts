import type { FundingProgramVertical } from "@/lib/fundingPrograms";

/**
 * Pure rules for adding a program to the funding catalog.
 *
 * Both identifiers are unique across the whole catalog, retired programs
 * included, so a collision is named here rather than surfacing as a 409 after
 * the operator has typed everything.
 */

export type FundingProgramDraftInput = {
  name: string;
  program_key: string;
  public_slug: string;
  short_description: string;
  display_order: number;
  verticals: FundingProgramVertical[];
  reason: string;
};

/** Catalog keys are snake_case. */
export function programKeyFrom(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64);
}

/** Public slugs are hyphenated; they address the marketing program page. */
export function publicSlugFrom(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
}

export function draftIssues(
  draft: FundingProgramDraftInput,
  takenKeys: string[],
  takenSlugs: string[],
): string[] {
  const issues: string[] = [];
  if (draft.name.trim().length < 2) issues.push("Give the program a name.");
  if (draft.program_key.length < 2) issues.push("The program key must be at least two characters.");
  if (draft.public_slug.length < 2) issues.push("The public slug must be at least two characters.");
  if (!draft.verticals.length) issues.push("Choose at least one workspace, or the program can never match a file.");
  if (draft.reason.trim().length < 8) issues.push("Record why this program is being added (at least eight characters).");
  if (takenKeys.includes(draft.program_key)) issues.push(`The key "${draft.program_key}" already belongs to another program.`);
  if (takenSlugs.includes(draft.public_slug)) issues.push(`The slug "${draft.public_slug}" already belongs to another program.`);
  return issues;
}

/** Programs sort by display order; a new one goes after everything present. */
export function nextDisplayOrder(orders: Array<number | undefined>): number {
  return orders.reduce<number>((top, value) => Math.max(top, value ?? 0), 0) + 10;
}
