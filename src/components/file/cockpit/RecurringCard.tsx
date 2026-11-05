"use client";

// Who the statements pay again and again, and who pays in: every recurring
// debit or credit rolled up across the months the AI read, classified
// without a model, shown by payee or as a month-by-month table. Statements
// analyzed before this extraction existed can be re-read from here; the
// queue takes a minute or two and the card refreshes itself while it waits.

import { useEffect, useMemo, useState } from "react";
import { Btn, CellChip, StatusLine, cx } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { errorMessage } from "@/components/marketplace/shared";
import { useRereadStatements } from "@/hooks/useApi";
import { cadenceLabel, compactMoney, money, monthShort, payeeKindTone, type FinancialCockpit as Cockpit, type PayeeKind, type RecurringPayee } from "@/lib/financialCockpit";

type Side = "debits" | "credits";
type View = "payees" | "months";
type Filter = "all" | "debt" | "cards" | "operating" | "income" | "funding" | "transfers";
const DEBIT_FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "All" },
  { value: "debt", label: "Advances and loans" },
  { value: "cards", label: "Cards" },
  { value: "operating", label: "Operating" },
];
const CREDIT_FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "All" },
  { value: "income", label: "Customers and cards" },
  { value: "funding", label: "Funding received" },
  { value: "transfers", label: "Transfers" },
];
const OPERATING: PayeeKind[] = ["payroll", "rent", "tax", "insurance", "utilities", "merchant_services", "bank_fees", "vendor", "other", "owner_draw", "transfer"];

function matches(p: RecurringPayee, filter: Filter): boolean {
  switch (filter) {
    case "debt":
      return p.is_debt;
    case "cards":
      return p.is_card;
    case "operating":
      return OPERATING.includes(p.kind);
    case "income":
      return p.kind === "customer" || p.kind === "card_settlement";
    case "funding":
      return p.kind === "advance_funding" || p.kind === "loan_proceeds";
    case "transfers":
      return p.kind === "transfer" || p.kind === "owner_contribution";
    default:
      return true;
  }
}

export function RecurringCard({ profileId, cockpit, canEdit, onRefresh, accountLabel }: { profileId: string; cockpit: Cockpit; canEdit: boolean; onRefresh: () => Promise<unknown> | void; accountLabel: string | null }) {
  const [side, setSide] = useState<Side>("debits");
  const [view, setView] = useState<View>("payees");
  const [filter, setFilter] = useState<Filter>("all");
  const data = side === "debits" ? cockpit.bank.recurring : cockpit.bank.recurring_credits;
  const needReread = cockpit.coverage.statements_need_reread;
  const reread = useRereadStatements(profileId);
  const [queued, setQueued] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (queued == null || needReread === 0) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      void onRefresh();
      if (tries >= 12) window.clearInterval(timer);
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [queued, needReread, onRefresh]);

  const rows = useMemo(
    () => data.payees.filter((p) => matches(p, filter) && (!accountLabel || p.accounts.includes(accountLabel))),
    [data.payees, filter, accountLabel],
  );
  const monthsRead = data.months_read;
  const columnTotals = useMemo(() => monthsRead.map((m) => rows.reduce((sum, p) => sum + (p.monthly[m] ?? 0), 0)), [monthsRead, rows]);

  const queue = async () => {
    setError(null);
    try {
      const result = await reread.mutateAsync();
      setQueued(result.queued);
    } catch (e) {
      setError(errorMessage(e, "The statements could not be queued."));
    }
  };
  const filters = side === "debits" ? DEBIT_FILTERS : CREDIT_FILTERS;
  const switchSide = (next: Side) => {
    setSide(next);
    setFilter("all");
  };

  return (
    <section className="fc-card fc-wide">
      <div className="fc-card-h">
        <div>
          <h4>Recurring {side === "debits" ? "payments out of" : "money into"} the statements</h4>
          <div className="sub">
            {side === "debits" ? "Every payee the statements debit repeatedly, with who they are: advances against banks against cards." : "Every payer the statements credit repeatedly: customers, card settlements, transfers in, funding received."} Monthly averages spread the total over the {monthsRead.length} month{monthsRead.length === 1 ? "" : "s"} read{monthsRead.length ? ` (${monthShort(monthsRead[0])} to ${monthShort(monthsRead[monthsRead.length - 1])})` : ""}{accountLabel ? ` · ${accountLabel}` : ""}.
          </div>
        </div>
        <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {needReread > 0 && canEdit ? (
            <Btn size="sm" variant="pri" onClick={() => void queue()} disabled={reread.isPending || queued != null}>
              <Icon name="refresh" size={13} /> {queued != null ? `Re-reading ${queued} statement${queued === 1 ? "" : "s"}…` : `Re-read ${needReread} statement${needReread === 1 ? "" : "s"}`}
            </Btn>
          ) : null}
          <div className="fc-toggle" role="tablist" aria-label="Direction">
            <button type="button" role="tab" aria-selected={side === "debits"} className={cx(side === "debits" && "on")} onClick={() => switchSide("debits")}>Withdrawals</button>
            <button type="button" role="tab" aria-selected={side === "credits"} className={cx(side === "credits" && "on")} onClick={() => switchSide("credits")}>Deposits</button>
          </div>
          <div className="fc-toggle" role="tablist" aria-label="View">
            <button type="button" role="tab" aria-selected={view === "payees"} className={cx(view === "payees" && "on")} onClick={() => setView("payees")}>By payee</button>
            <button type="button" role="tab" aria-selected={view === "months"} className={cx(view === "months" && "on")} onClick={() => setView("months")}>By month</button>
          </div>
          <div className="fc-toggle" role="tablist" aria-label="Payee filter">
            {filters.map((f) => (
              <button key={f.value} type="button" role="tab" aria-selected={filter === f.value} className={cx(filter === f.value && "on")} onClick={() => setFilter(f.value)}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {error ? <StatusLine tone="bad">{error}</StatusLine> : null}
      {queued != null && needReread > 0 ? <StatusLine tone="acc">Queued. The AI re-reads each statement in the background; this card refreshes itself for a few minutes.</StatusLine> : null}
      {side === "debits" ? (
        <div className="fc-stat-list">
          <div className="fc-stat"><span>Going to advance funders each month</span><strong>{money(data.observed_mca_monthly)}</strong></div>
          <div className="fc-stat"><span>Going to loans and leases each month</span><strong>{money(data.observed_loan_monthly)}</strong></div>
          <div className="fc-stat"><span>Card payments each month (not counted as debt service)</span><strong>{money(data.observed_card_monthly)}</strong></div>
          <div className="fc-stat"><span>All recurring payments each month</span><strong>{money(data.total_monthly)}</strong></div>
        </div>
      ) : (
        <div className="fc-stat-list">
          <div className="fc-stat"><span>From customers and card settlements each month</span><strong>{money(data.payees.filter((p) => p.kind === "customer" || p.kind === "card_settlement").reduce((s, p) => s + (p.monthly_average ?? 0), 0) || null)}</strong></div>
          <div className="fc-stat"><span>Funding received (advances, loans), total</span><strong>{money(data.payees.filter((p) => p.kind === "advance_funding" || p.kind === "loan_proceeds").reduce((s, p) => s + (p.total ?? 0), 0) || null)}</strong></div>
          <div className="fc-stat"><span>All recurring deposits each month</span><strong>{money(data.total_monthly)}</strong></div>
        </div>
      )}
      {!rows.length ? (
        <div className="fc-empty">
          {monthsRead.length ? "No recurring payees in this group." : needReread > 0 ? "These statements were read before payees were extracted. Re-read them to see who is being paid." : "No bank statement on file yet."}
        </div>
      ) : view === "payees" ? (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>{side === "debits" ? "Payee" : "Payer"}</th>
                <th>Kind</th>
                <th>Cadence</th>
                <th className="r">Typical amount</th>
                <th className="r">Times</th>
                <th className="r">Months seen</th>
                <th className="r">Per month</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.key} className={cx(!p.accepted && "is-muted")}>
                  <td>
                    <strong>{p.payee}</strong>
                    <small className="sub" style={{ display: "block" }}>{p.rationale}{p.accounts.length > 1 ? ` · ${p.accounts.join(", ")}` : ""}</small>
                  </td>
                  <td><CellChip tone={payeeKindTone(p.kind)}>{p.kind_label}</CellChip></td>
                  <td>{cadenceLabel(p.cadence)}{p.same_amount ? " · fixed" : ""}</td>
                  <td className="r num">{money(p.average_amount)}</td>
                  <td className="r num">{p.occurrences}</td>
                  <td className="r num">{p.months_seen}</td>
                  <td className="r num"><strong>{compactMoney(p.monthly_average)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl fc-pivot">
            <thead>
              <tr>
                <th>{side === "debits" ? "Payee" : "Payer"}</th>
                <th>Kind</th>
                {monthsRead.map((m) => (
                  <th key={m} className="r">{monthShort(m)}</th>
                ))}
                <th className="r">Per month</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.key} className={cx(!p.accepted && "is-muted")}>
                  <td><strong>{p.payee}</strong></td>
                  <td><CellChip tone={payeeKindTone(p.kind)}>{p.kind_label}</CellChip></td>
                  {monthsRead.map((m) => (
                    <td key={m} className="r num">{p.monthly[m] != null ? compactMoney(p.monthly[m]) : "—"}</td>
                  ))}
                  <td className="r num"><strong>{compactMoney(p.monthly_average)}</strong></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td><strong>Total</strong></td>
                <td />
                {monthsRead.map((m, i) => (
                  <td key={m} className="r num"><strong>{compactMoney(columnTotals[i])}</strong></td>
                ))}
                <td className="r num"><strong>{compactMoney(rows.reduce((s, p) => s + (p.monthly_average ?? 0), 0))}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
