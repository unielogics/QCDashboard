export type IntakeGlobalSearchItem = {
  kind: string;
  id: string;
  title: string;
};

export type IntakeGlobalSearchGroup = {
  client_id: string;
  client_name: string;
  items: readonly IntakeGlobalSearchItem[];
};

export type NonIntakeClientLead = {
  id: string;
  name: string;
};

/**
 * Extract only explicit client rows from the existing role-scoped global
 * search. Loan, document, and message hits must not be presented as proof
 * that a general client lead exists.
 */
export function nonIntakeClientLeadsFromGlobalSearch(
  groups: readonly IntakeGlobalSearchGroup[],
  limit = 5,
): NonIntakeClientLead[] {
  if (limit <= 0) return [];
  const seen = new Set<string>();
  const matches: NonIntakeClientLead[] = [];

  for (const group of groups) {
    for (const item of group.items) {
      if (item.kind !== "client" || seen.has(item.id)) continue;
      seen.add(item.id);
      matches.push({ id: item.id, name: item.title.trim() || group.client_name || "Client lead" });
      if (matches.length >= limit) return matches;
    }
  }
  return matches;
}
