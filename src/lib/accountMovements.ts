/** Evidence-backed account relationships. Classification and pairing happen on the server. */
export type MovementStatus = "supported" | "review" | "unmatched";
export type MovementEvidence = {
  file_id: string;
  file_name?: string | null;
  page?: number | null;
  row?: string | number | null;
  date?: string | null;
  description?: string | null;
  direction?: "out" | "in" | null;
  amount?: number | null;
  currency?: string | null;
};
export type AccountMovementPeriod = {
  period: string;
  currency: string | null;
  observed_in: number | null;
  observed_out: number | null;
  observed_net: number | null;
  internal_in: number | null;
  internal_out: number | null;
  internal_net: number | null;
  beginning_balance: number | null;
  ending_balance: number | null;
  observed_balance_change: number | null;
  explained_change: number | null;
  unexplained_change: number | null;
  balance_period_start?: string | null;
  balance_period_end?: string | null;
  coverage_status: string;
  source_file_ids: string[];
  reason_codes: string[];
};
export type AccountMovementNode = { key: string; label: string; counted: boolean; currencies: Array<string | null>; periods: AccountMovementPeriod[] };
export type AccountMovement = {
  id: string;
  period: string;
  periods?: string[];
  from_account: string | null;
  to_account: string | null;
  account_key: string;
  direction: "out" | "in" | null;
  amount: number | null;
  currency: string | null;
  out_on: string | null;
  in_on: string | null;
  lag_days: number | null;
  status: MovementStatus;
  reason_codes: string[];
  evidence: MovementEvidence[];
};
export type AccountMovementLink = {
  id: string;
  from_account: string;
  to_account: string;
  currency: string | null;
  period: string;
  periods?: string[];
  amount: number | null;
  transaction_count: number;
  status: "supported" | "review";
  sample_movements?: AccountMovement[];
};
export type AccountMovements = {
  schema_version: "qc_account_movements.v1";
  status: "available" | "partial" | "no_transaction_evidence";
  nodes: AccountMovementNode[];
  links: AccountMovementLink[];
  movements: AccountMovement[];
  coverage: { transaction_records: number; files_with_detail: string[]; files_missing_detail: string[]; ignored_summary_records: number; truncated: boolean };
  pagination: { offset: number; limit: number; total: number; next_offset: number | null };
  periods: string[];
  notes: string[];
};
export type MovementScope = "counted" | "all" | string;
export type MovementNodeView = AccountMovementNode & { facts: AccountMovementPeriod | null; inScope: boolean };
export type MovementView = {
  nodes: MovementNodeView[];
  links: AccountMovementLink[];
  movements: AccountMovement[];
  matchedAmount: number | null;
  possibleAmount: number | null;
  scopedAccounts: number;
  incompleteCoverage: boolean;
};

export function movementStatusLabel(status: MovementStatus): string {
  return status === "supported" ? "Matched pair" : status === "review" ? "Possible match" : "Unmatched";
}

export function movementOccursIn(movement: { period: string; periods?: string[] }, period: string): boolean {
  return movement.periods?.length ? movement.periods.includes(period) : movement.period === period;
}

export function movementMoney(value: number | null | undefined, currency: string | null = "USD"): string {
  if (value == null || !Number.isFinite(value)) return "Unknown";
  if (!currency || !/^[A-Z]{3}$/.test(currency)) return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)} · currency unknown`;
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value); }
  catch { return `${value.toLocaleString("en-US")} ${currency}`; }
}

export function movementCurrencies(data: AccountMovements, period: string): Array<string | null> {
  const values = new Set<string | null>();
  for (const node of data.nodes) for (const row of node.periods) if (row.period === period) values.add(row.currency ?? null);
  for (const link of data.links) if (link.period === period) values.add(link.currency ?? null);
  for (const movement of data.movements) if (movementOccursIn(movement, period)) values.add(movement.currency ?? null);
  return [...values].sort((a, b) => a === "USD" ? -1 : b === "USD" ? 1 : (a ?? "~").localeCompare(b ?? "~"));
}

export function resolveMovementScope(data: AccountMovements, scope: MovementScope): MovementScope {
  return scope === "all" || scope === "counted" || data.nodes.some((node) => node.key === scope) ? scope : "counted";
}

export function accountMovementView(data: AccountMovements, period: string, scope: MovementScope, currency: string | null): MovementView {
  const byKey = new Map(data.nodes.map((node) => [node.key, node]));
  scope = resolveMovementScope(data, scope);
  const inScope = new Set(data.nodes.filter((node) => scope === "all" || (scope === "counted" ? node.counted : node.key === scope)).map((node) => node.key));
  const links = data.links.filter((link) => link.period === period && (link.currency ?? null) === currency
    && link.from_account !== link.to_account && byKey.has(link.from_account) && byKey.has(link.to_account)
    && (inScope.has(link.from_account) || inScope.has(link.to_account)));
  const connected = new Set(links.flatMap((link) => [link.from_account, link.to_account]));
  const nodes = data.nodes.filter((node) => connected.has(node.key) || inScope.has(node.key) && node.periods.some((row) => row.period === period && (row.currency ?? null) === currency)).map((node) => ({
    ...node, facts: node.periods.find((row) => row.period === period && (row.currency ?? null) === currency) ?? null, inScope: inScope.has(node.key),
  }));
  const movements = data.movements.filter((movement) => movementOccursIn(movement, period) && (movement.currency ?? null) === currency
    && [movement.account_key, movement.from_account, movement.to_account].some((key) => key != null && inScope.has(key)));
  const total = (status: "supported" | "review") => {
    const selected = links.filter((link) => link.status === status);
    const knownDetail = nodes.some((node) => node.inScope && node.facts?.coverage_status !== "missing"
      && node.facts?.internal_in != null && node.facts?.internal_out != null);
    return (!selected.length && !knownDetail) || selected.some((link) => link.amount == null)
      ? null : selected.reduce((sum, link) => sum + (link.amount ?? 0), 0);
  };
  return {
    nodes, links, movements,
    matchedAmount: total("supported"),
    possibleAmount: total("review"),
    scopedAccounts: nodes.filter((node) => node.inScope).length,
    incompleteCoverage: data.coverage.truncated || nodes.filter((node) => node.inScope).some((node) => node.facts?.coverage_status !== "complete"),
  };
}

export function linkMovements(link: AccountMovementLink, movements: AccountMovement[]): AccountMovement[] {
  const available = [...(link.sample_movements ?? []), ...movements].filter((movement) => movementOccursIn(movement, link.period)
    && movement.from_account === link.from_account && movement.to_account === link.to_account
    && movement.currency === link.currency && movement.status === link.status);
  return [...new Map(available.map((movement) => [movement.id, movement])).values()].slice(0, 6);
}

export function uniqueMovementEvidence(movements: AccountMovement[], limit = 6): MovementEvidence[] {
  const unique = new Map<string, MovementEvidence>();
  for (const movement of movements) for (const row of movement.evidence) {
    const key = JSON.stringify([row.file_id, row.page, row.row, row.date, row.description, row.direction, row.amount, row.currency]);
    if (!unique.has(key)) unique.set(key, row);
  }
  return [...unique.values()].slice(0, limit);
}

export type MovementPosition = { key: string; x: number; y: number };
export function movementLayout(keys: string[]): { width: number; height: number; positions: MovementPosition[] } {
  const sorted = [...new Set(keys)].sort();
  const width = sorted.length > 6 ? 1000 : 760;
  const height = sorted.length > 6 ? Math.ceil(sorted.length / 4) * 190 + 55 : sorted.length > 3 ? 510 : sorted.length === 3 ? 450 : 280;
  const positions = sorted.map((key, index) => {
    if (sorted.length === 1) return { key, x: width / 2, y: height / 2 };
    if (sorted.length === 2) return { key, x: 170 + index * 420, y: height / 2 };
    if (sorted.length > 6) return { key, x: 125 + (index % 4) * 250, y: 110 + Math.floor(index / 4) * 190 };
    const angle = -Math.PI / 2 + index * Math.PI * 2 / sorted.length;
    return { key, x: width / 2 + Math.cos(angle) * 270, y: height / 2 + Math.sin(angle) * (height / 2 - 85) };
  });
  return { width, height, positions };
}

/** Curves end at the account card boundary; reverse and possible links stay distinguishable. */
export function movementLinkPath(from: MovementPosition, to: MovementPosition, bend = 24): { path: string; x: number; y: number } {
  const dx = to.x - from.x, dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const edge = (x: number, y: number, direction: number) => {
    const scale = Math.min(105 / Math.max(Math.abs(dx), .001), 71 / Math.max(Math.abs(dy), .001));
    return { x: x + dx * scale * direction, y: y + dy * scale * direction };
  };
  const start = edge(from.x, from.y, 1), end = edge(to.x, to.y, -1);
  const control = { x: (start.x + end.x) / 2 - dy / length * bend, y: (start.y + end.y) / 2 + dx / length * bend };
  return { path: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`,
    x: (start.x + 2 * control.x + end.x) / 4 - dy / length * 22,
    y: (start.y + 2 * control.y + end.y) / 4 + dx / length * 22 };
}
