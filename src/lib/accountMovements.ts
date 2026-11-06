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
export const MOVEMENT_ACCOUNT_SIZE = { width: 248, height: 188 } as const;

export function movementLayout(keys: string[]): { width: number; height: number; positions: MovementPosition[] } {
  const sorted = [...new Set(keys)].sort();
  const width = 1040;
  const columns = sorted.length <= 4 ? 2 : 3;
  const height = sorted.length <= 2 ? 380 : sorted.length === 3 ? 560 : Math.ceil(sorted.length / columns) * 320 - 20;
  const positions = sorted.map((key, index) => {
    if (sorted.length === 1) return { key, x: width / 2, y: height / 2 };
    if (sorted.length === 2) return { key, x: index === 0 ? 160 : 880, y: 190 };
    if (sorted.length === 3) return { key, x: [520, 880, 160][index], y: index === 0 ? 120 : 440 };
    const row = Math.floor(index / columns);
    const count = Math.min(columns, sorted.length - row * columns);
    const spacing = columns === 2 ? 720 : 360;
    return { key, x: (width - (count - 1) * spacing) / 2 + (index % columns) * spacing, y: 150 + row * 320 };
  });
  return { width, height, positions };
}

export type MovementLinkOptions = { lane?: number; labelWidth?: number; labelHeight?: number };
export type MovementLinkGeometry = {
  path: string; x: number; y: number;
  start: { x: number; y: number }; end: { x: number; y: number }; control: { x: number; y: number };
};

/** Bend is the midpoint arc offset; positive bends put reverse directions on opposite sides. */
export function movementLinkPath(from: MovementPosition, to: MovementPosition, bend = 24, options: MovementLinkOptions = {}): MovementLinkGeometry {
  const dx = to.x - from.x, dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < .001) return { path: "", x: from.x, y: from.y, start: { x: from.x, y: from.y }, end: { x: to.x, y: to.y }, control: { x: from.x, y: from.y } };
  const normal = { x: -dy / length, y: dx / length };
  const midpoint = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const finiteBend = Number.isFinite(bend) ? bend : 24;
  const side = finiteBend < 0 ? -1 : 1;
  const lane = Number.isFinite(options.lane) ? Math.max(0, Math.floor(options.lane!)) : 0;
  const offset = finiteBend + side * lane * 100;
  const originalControl = { x: midpoint.x + normal.x * offset * 2, y: midpoint.y + normal.y * offset * 2 };
  const point = (t: number) => ({
    x: (1 - t) ** 2 * from.x + 2 * (1 - t) * t * originalControl.x + t ** 2 * to.x,
    y: (1 - t) ** 2 * from.y + 2 * (1 - t) * t * originalControl.y + t ** 2 * to.y,
  });
  const inside = (p: { x: number; y: number }, center: MovementPosition, gap: number) =>
    Math.abs(p.x - center.x) <= MOVEMENT_ACCOUNT_SIZE.width / 2 + gap && Math.abs(p.y - center.y) <= MOVEMENT_ACCOUNT_SIZE.height / 2 + gap;
  // Clip the curve itself rather than its center chord: a strongly bent
  // diagonal can otherwise run through a card corner before its endpoint.
  const boundary = (center: MovementPosition, backwards: boolean, gap: number) => {
    for (let step = 1; step <= 64; step++) {
      const current = backwards ? 1 - step / 64 : step / 64;
      if (inside(point(current), center, gap)) continue;
      let outside = current, within = backwards ? current + 1 / 64 : current - 1 / 64;
      for (let iteration = 0; iteration < 36; iteration++) {
        const middle = (outside + within) / 2;
        if (inside(point(middle), center, gap)) within = middle;
        else outside = middle;
      }
      return (outside + within) / 2;
    }
    return backwards ? 0 : 1;
  };
  const first = boundary(from, false, 0), last = boundary(to, true, 8);
  const start = point(first), end = point(last);
  const control = {
    x: start.x + (last - first) * ((1 - first) * (originalControl.x - from.x) + first * (to.x - originalControl.x)),
    y: start.y + (last - first) * ((1 - first) * (originalControl.y - from.y) + first * (to.y - originalControl.y)),
  };
  const labelWidth = options.labelWidth && options.labelWidth > 0 ? options.labelWidth : 224;
  const labelHeight = options.labelHeight && options.labelHeight > 0 ? options.labelHeight : 68;
  const minimumSeparation = Math.abs(normal.x) * (labelWidth / 2 + 12) + Math.abs(normal.y) * (labelHeight / 2 + 12);
  let labelDistance = Math.max(Math.abs(offset), minimumSeparation);
  let label = { x: midpoint.x + normal.x * side * labelDistance, y: midpoint.y + normal.y * side * labelDistance };
  const labelOverlaps = (center: MovementPosition) => Math.abs(label.x - center.x) < (MOVEMENT_ACCOUNT_SIZE.width + labelWidth) / 2 + 8
    && Math.abs(label.y - center.y) < (MOVEMENT_ACCOUNT_SIZE.height + labelHeight) / 2 + 8;
  for (let attempt = 0; attempt < 64 && (labelOverlaps(from) || labelOverlaps(to)); attempt++) {
    labelDistance += 8;
    label = { x: midpoint.x + normal.x * side * labelDistance, y: midpoint.y + normal.y * side * labelDistance };
  }
  if (first >= last) return { path: "", x: label.x, y: label.y, start, end, control };
  return { path: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`,
    x: label.x, y: label.y, start, end, control };
}
