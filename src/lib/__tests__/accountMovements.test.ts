import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccountMovementsCard } from "@/components/file/cockpit/AccountMovementsCard";
import {
  accountMovementView, linkMovements, movementCurrencies, movementLayout, movementLinkPath, movementMoney,
  movementOccursIn, movementStatusLabel, resolveMovementScope, uniqueMovementEvidence,
  type AccountMovement, type AccountMovementNode, type AccountMovementPeriod, type AccountMovements,
} from "@/lib/accountMovements";

export function movementPeriod(period: string, values: Partial<AccountMovementPeriod> = {}): AccountMovementPeriod {
  return { period, currency: "USD", observed_in: 0, observed_out: 0, observed_net: 0,
    internal_in: 0, internal_out: 0, internal_net: 0, beginning_balance: 0, ending_balance: 0,
    observed_balance_change: 0, explained_change: 0, unexplained_change: 0, coverage_status: "complete",
    source_file_ids: ["source-a"], reason_codes: [], ...values };
}
export function movementNode(key: string, label: string, values: Partial<AccountMovementNode> = {}): AccountMovementNode {
  return { key, label, counted: true, currencies: ["USD"], periods: [movementPeriod("2026-05")], ...values };
}
export function movementRecord(values: Partial<AccountMovement> = {}): AccountMovement {
  return { id: "pair-one", period: "2026-05", periods: ["2026-05", "2026-06"], from_account: "checking", to_account: "savings",
    account_key: "checking", direction: "out", amount: 100, currency: "USD", out_on: "2026-05-31", in_on: "2026-06-01", lag_days: 1,
    status: "supported", reason_codes: ["matching_transfer_reference"], evidence: [
      { file_id: "source-a", file_name: "Checking May.pdf", page: 2, row: 5, date: "2026-05-31", description: "Online transfer to savings · reference T123", direction: "out", amount: 100, currency: "USD" },
      { file_id: "source-b", file_name: "Savings June.pdf", page: 1, row: 7, date: "2026-06-01", description: "Transfer from checking · reference T123", direction: "in", amount: 100, currency: "USD" },
    ], ...values };
}
export function accountMovementFixture(): AccountMovements {
  const pair = movementRecord();
  return {
    schema_version: "qc_account_movements.v1", status: "partial", periods: ["2026-05", "2026-06"],
    nodes: [
      movementNode("checking", "Business checking · 1234", { periods: [
        movementPeriod("2026-05", { beginning_balance: 100, ending_balance: 0, observed_out: 100, observed_net: -100, internal_out: 100, internal_net: -100, observed_balance_change: -100, explained_change: -100 }),
        movementPeriod("2026-06", { beginning_balance: 0, ending_balance: 0 }),
      ] }),
      movementNode("savings", "Business savings · 5678", { periods: [
        movementPeriod("2026-05", { beginning_balance: 500, ending_balance: 500 }),
        movementPeriod("2026-06", { beginning_balance: 500, ending_balance: 600, internal_in: 100, internal_net: 100, observed_in: 100, observed_net: 100, observed_balance_change: 100, explained_change: 100 }),
      ] }),
      movementNode("reserve", "Tax reserve · 9012", { counted: false, periods: [movementPeriod("2026-05", { ending_balance: null, coverage_status: "partial", internal_in: null, internal_out: null, internal_net: null })] }),
    ],
    links: [
      { id: "link-pair", from_account: "checking", to_account: "savings", currency: "USD", period: pair.period, periods: [pair.period], amount: 100, transaction_count: 1, status: "supported", sample_movements: [pair] },
      { id: "link-pair-june", from_account: "checking", to_account: "savings", currency: "USD", period: "2026-06", periods: ["2026-06"], amount: 100, transaction_count: 1, status: "supported", sample_movements: [pair] },
      { id: "link-possible", from_account: "savings", to_account: "reserve", currency: "USD", period: "2026-05", periods: ["2026-05"], amount: 50, transaction_count: 1, status: "review", sample_movements: [] },
    ],
    movements: [pair, movementRecord({ id: "unmatched", periods: ["2026-05"], from_account: "checking", to_account: null, amount: 30, in_on: null, lag_days: null, status: "unmatched", reason_codes: ["missing_counterpart"], evidence: [] })],
    coverage: { transaction_records: 4, files_with_detail: ["source-a", "source-b"], files_missing_detail: ["source-c"], ignored_summary_records: 3, truncated: false },
    pagination: { offset: 0, limit: 50, total: 2, next_offset: null },
    notes: ["Only dated transaction evidence establishes account relationships."],
  };
}

describe("account movement evidence and selection", () => {
  it("falls back to counted accounts when a selected key disappears after an alias merge", () => {
    const data = accountMovementFixture();
    expect(resolveMovementScope(data, "retired-account")).toBe("counted");
    expect(resolveMovementScope(data, "all")).toBe("all");
    const recovered = accountMovementView(data, "2026-05", "retired-account", "USD");
    expect(recovered.nodes).toEqual(accountMovementView(data, "2026-05", "counted", "USD").nodes);
    expect(recovered.scopedAccounts).toBe(2);
  });
  it("keeps matched and possible evidence separate and includes boundary accounts without counting them", () => {
    const view = accountMovementView(accountMovementFixture(), "2026-05", "counted", "USD");
    expect(view.matchedAmount).toBe(100);
    expect(view.possibleAmount).toBe(50);
    expect(view.scopedAccounts).toBe(2);
    expect(view.nodes.find((node) => node.key === "reserve")?.inScope).toBe(false);
    expect(view.nodes.find((node) => node.key === "checking")?.facts?.ending_balance).toBe(0);
  });

  it("shows both posting periods for a cross-month pair without moving either account’s balance influence", () => {
    const data = accountMovementFixture();
    const may = accountMovementView(data, "2026-05", "all", "USD");
    const june = accountMovementView(data, "2026-06", "all", "USD");
    expect(may.links.filter((link) => link.id === "link-pair")).toHaveLength(1);
    expect(june.links.filter((link) => link.id === "link-pair-june")).toHaveLength(1);
    expect(may.matchedAmount).toBe(100);
    expect(june.matchedAmount).toBe(100);
    expect(may.nodes.find((node) => node.key === "savings")?.facts?.internal_in).toBe(0);
    expect(june.nodes.find((node) => node.key === "savings")?.facts?.internal_in).toBe(100);
    expect(june.nodes.find((node) => node.key === "checking")?.facts?.internal_out).toBe(0);
    expect(movementOccursIn({ period: "2026-05" }, "2026-06")).toBe(false);
  });

  it("does not turn a legacy period into zero transfers because another period has transaction detail", () => {
    const data = accountMovementFixture();
    data.status = "available";
    data.links.forEach((link) => { link.periods = [link.period]; });
    data.movements.forEach((movement) => { movement.periods = ["2026-05"]; });
    data.nodes.forEach((node) => node.periods.push(movementPeriod("2026-07", { internal_in: null, internal_out: null, internal_net: null, coverage_status: "missing", ending_balance: 0 })));
    const view = accountMovementView(data, "2026-07", "counted", "USD");
    expect(view.links).toEqual([]);
    expect(view.matchedAmount).toBeNull();
    expect(view.possibleAmount).toBeNull();
    expect(view.incompleteCoverage).toBe(true);
    expect(view.nodes[0].facts?.ending_balance).toBe(0);
  });

  it("keeps zero known balances distinct from unknown and unspecified currency distinct from dollars", () => {
    expect(movementMoney(0, "USD")).toBe("$0.00");
    expect(movementMoney(null, "USD")).toBe("Unknown");
    expect(movementMoney(50, null)).toBe("50 · currency unknown");
    const data = accountMovementFixture();
    data.links.push({ ...data.links[2], id: "unknown-currency", currency: null, amount: 700 });
    expect(movementCurrencies(data, "2026-05")).toEqual(["USD", null]);
    expect(accountMovementView(data, "2026-05", "all", "USD").possibleAmount).toBe(50);
    expect(accountMovementView(data, "2026-05", "all", null).possibleAmount).toBe(700);
  });

  it("does not fabricate a relationship from summary figures or infer an unknown link amount", () => {
    const data = accountMovementFixture();
    data.status = "no_transaction_evidence"; data.links = []; data.movements = [];
    data.nodes.forEach((node) => node.periods.forEach((period) => { period.coverage_status = "missing"; period.internal_in = null; period.internal_out = null; }));
    expect(accountMovementView(data, "2026-05", "all", "USD").matchedAmount).toBeNull();
    expect(accountMovementView(data, "2026-05", "all", "USD").links).toEqual([]);
    data.links.push({ ...accountMovementFixture().links[0], amount: null });
    expect(accountMovementView(data, "2026-05", "all", "USD").matchedAmount).toBeNull();
  });

  it("preserves both direction and account scope instead of attributing unrelated transfers to a selected account", () => {
    const data = accountMovementFixture();
    const view = accountMovementView(data, "2026-05", "checking", "USD");
    expect(view.links.map((link) => link.id)).toEqual(["link-pair"]);
    expect(view.nodes.map((node) => node.key)).toEqual(["checking", "savings"]);
    expect(view.nodes.find((node) => node.key === "savings")?.inScope).toBe(false);
    expect(view.scopedAccounts).toBe(1);
  });

  it("retains samples for links outside the first movement page and bounds the inspector evidence", () => {
    const sample = movementRecord();
    const link = accountMovementFixture().links[0];
    const records = linkMovements(link, []);
    expect(records.map((row) => row.id)).toEqual([sample.id]);
    const many = Array.from({ length: 15 }, (_, index) => movementRecord({ id: `pair-${index}`, evidence: sample.evidence.map((row) => ({ ...row, row: index })) }));
    expect(linkMovements(link, many)).toHaveLength(6);
    expect(uniqueMovementEvidence([...records, ...records])).toHaveLength(2);
    expect(uniqueMovementEvidence(many)).toHaveLength(6);
  });

  it("does not carry May-only transfers into the June aggregate or June evidence preview", () => {
    const data = accountMovementFixture();
    const mayOnly = movementRecord({ id: "may-only", periods: ["2026-05"], out_on: "2026-05-10", in_on: "2026-05-10" });
    data.movements.push(mayOnly);
    data.links[0].amount = 200;
    data.links[0].transaction_count = 2;
    data.links[0].sample_movements = [];
    data.links[1].sample_movements = [];
    expect(accountMovementView(data, "2026-05", "counted", "USD").matchedAmount).toBe(200);
    expect(accountMovementView(data, "2026-06", "counted", "USD").matchedAmount).toBe(100);
    expect(linkMovements(data.links[1], data.movements).map((movement) => movement.id)).toEqual(["pair-one"]);
  });

  it("lays out unique account keys consistently and ends the arrow at account boundaries", () => {
    expect(movementLayout(["b", "a", "a"])).toEqual(movementLayout(["a", "b"]));
    expect(movementLayout(["a", "b"]).height).toBe(280);
    expect(movementLayout(["a", "b", "c"]).height).toBe(450);
    const layout = movementLayout(Array.from({ length: 16 }, (_, index) => `account-${index}`));
    expect(layout.positions).toHaveLength(16);
    expect(new Set(layout.positions.map((node) => `${node.x},${node.y}`)).size).toBe(16);
    const curve = movementLinkPath({ key: "a", x: 170, y: 195 }, { key: "b", x: 590, y: 195 });
    expect(curve.path).toContain("M 275 195");
    expect(curve.path).toContain("485 195");
    expect(movementStatusLabel("review")).toBe("Possible match");
  });

  it("renders keyboard graph controls and table/mobile equivalents with truthful limited coverage", () => {
    const data = accountMovementFixture(); data.periods = ["2026-05"];
    const html = renderToStaticMarkup(createElement(AccountMovementsCard, { data }));
    expect(html).toContain("Movement between accounts");
    expect(html).toContain('aria-label="Account movement period"');
    expect(html).toContain('role="button"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain("Possible match · excluded from totals");
    expect(html).toContain('aria-label="Accounts and directed movements"');
    expect(html).toContain("Table");
    expect(html).toContain("$0.00");
    expect(html).toContain("Unknown");
    expect(html).toContain("without transaction detail");
    expect(html).toContain("About this evidence");
    expect(html.match(/<details[^>]*>/)?.[0]).not.toContain("open");
  });
});
