"use client";

// Who the statements pay again and again: every payee debited repeatedly,
// rolled up across the months the AI read and classified without a model
// (advance funder, loan, card, lease, payroll, ...). Statements analyzed
// before this extraction existed can be re-read from here; the queue takes a
// minute or two and the card refreshes itself while it waits.

import { useEffect, useMemo, useState } from "react";
import { Btn, CellChip, StatusLine, cx } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { errorMessage } from "@/components/marketplace/shared";
import { useRereadStatements } from "@/hooks/useApi";
import { cadenceLabel, compactMoney, money, monthShort, payeeKindTone, type FinancialCockpit as Cockpit, type PayeeKind } from "@/lib/financialCockpit";

type Filter = "all" | "debt" | "cards" | "operating";
const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "All" },
  { value: "debt", label: "Advances and loans" },
  { value: "cards", label: "Cards" },
  { value: "operating", label: "Operating" },
];
const OPERATING: PayeeKind[] = ["payroll", "rent", "tax", "insurance", "utilities", "merchant_services", "bank_fees", "vendor", "other", "owner_draw", "transfer"];

export function RecurringCard({ profileId, cockpit, canEdit, onRefresh }: { profileId: string; cockpit: Cockpit; canEdit: boolean; onRefresh: () => Promise<unknown> | void }) {
  const recurring = cockpit.bank.recurring;
  const needReread = cockpit.coverage.statements_need_reread;
  const reread = useRereadStatements(profileId);
  const [filter, setFilter] = useState<Filter>("all");
  const [queued, setQueued] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // After a re-read is queued, poll the cockpit until the statements carry payees (or give up after ten tries).
  useEffect(() => {
    if (queued == null || needReread === 0) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      void onRefresh();
      if (tries >= 10) window.clearInterval(timer);
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [queued, needReread, onRefresh]);

  const rows = useMemo(() => {
    const all = recurring.payees;
    if (filter === "debt") return all.filter((p) => p.is_debt);
    if (filter === "cards") return all.filter((p) => p.is_card);
    if (filter === "operating") return all.filter((p) => OPERATING.includes(p.kind));
    return all;
  }, [filter, recurring.payees]);

  const queue = async () => {
    setError(null);
    try {
      const result = await reread.mutateAsync();
      setQueued(result.queued);
    } catch (e) {
      setError(errorMessage(e, "The statements could not be queued."));
    }
  };

  const monthsRead = recurring.months_read;
  return (
    <section className="fc-card fc-wide">
      <div className="fc-card-h">
        <div>
          <h4>Recurring payments in the statements</h4>
          <div className="sub">
            Every payee the statements debit repeatedly, with who they are: advances against banks against cards. Monthly averages spread the total over the {monthsRead.length || 0} month{monthsRead.length === 1 ? "" : "s"} read{monthsRead.length ? ` (${monthShort(monthsRead[0])} to ${monthShort(monthsRead[monthsRead.length - 1])})` : ""}.
          </div>
        </div>
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          {needReread > 0 && canEdit ? (
            <Btn size="sm" variant="pri" onClick={() => void queue()} disabled={reread.isPending || queued != null}>
              <Icon name="refresh" size={13} /> {queued != null ? `Re-reading ${queued} statement${queued === 1 ? "" : "s"}…` : `Re-read ${needReread} statement${needReread === 1 ? "" : "s"}`}
            </Btn>
          ) : null}
          <div className="fc-toggle" role="tablist" aria-label="Payee filter">
            {FILTERS.map((f) => (
              <button key={f.value} type="button" role="tab" aria-selected={filter === f.value} className={cx(filter === f.value && "on")} onClick={() => setFilter(f.value)}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {error ? <StatusLine tone="bad">{error}</StatusLine> : null}
      {queued != null && needReread > 0 ? <StatusLine tone="acc">Queued. The AI re-reads each statement in the background; this card refreshes itself for a few minutes.</StatusLine> : null}
      <div className="fc-stat-list">
        <div className="fc-stat"><span>Going to advance funders each month</span><strong>{money(recurring.observed_mca_monthly)}</strong></div>
        <div className="fc-stat"><span>Going to loans and leases each month</span><strong>{money(recurring.observed_loan_monthly)}</strong></div>
        <div className="fc-stat"><span>Card payments each month (not counted as debt service)</span><strong>{money(recurring.observed_card_monthly)}</strong></div>
      </div>
      {rows.length ? (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Payee</th>
                <th>Kind</th>
                <th>Cadence</th>
                <th className="r">Typical debit</th>
                <th className="r">Debits</th>
                <th className="r">Months seen</th>
                <th className="r">Per month</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.key} className={cx(!p.accepted && "is-muted")}>
                  <td>
                    <strong>{p.payee}</strong>
                    <small className="sub" style={{ display: "block" }}>{p.rationale}</small>
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
        <div className="fc-empty">
          {monthsRead.length
            ? "No recurring payees in this group."
            : needReread > 0
              ? "These statements were read before payees were extracted. Re-read them to see who is being paid."
              : "No bank statement on file yet."}
        </div>
      )}
    </section>
  );
}
