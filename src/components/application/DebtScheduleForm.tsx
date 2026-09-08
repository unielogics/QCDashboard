"use client";

// The business debt schedule: one row per obligation.
//
// Four fields, deliberately. A schedule someone abandons halfway is worth less
// than a complete one with fewer columns, and the desk can enrich a row
// afterwards — rate, term and maturity all exist on the record and none of them
// are worth losing an answer over.
//
// The totals are shown as they type because they are what the borrower is
// really being asked to confirm, and because a number that does not look right
// is easier to spot against a running total than by re-reading nine rows.

import { Btn, Field, Input } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";

export type DebtRow = {
  lender?: string;
  balance?: string;
  monthly_payment?: string;
  notes?: string;
};

export type DebtBody = { business_name?: string; debts?: DebtRow[] };

const money = (value: string | undefined) => {
  const parsed = Number.parseFloat(String(value ?? "").replace(/[,$\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const currency = (value: number) =>
  value.toLocaleString(undefined, { style: "currency", currency: "USD" });

export function DebtScheduleForm({
  value,
  onChange,
  disabled = false,
}: {
  value: DebtBody;
  onChange: (next: DebtBody) => void;
  disabled?: boolean;
}) {
  const rows = value.debts ?? [];
  const setRows = (next: DebtRow[]) => onChange({ ...value, debts: next });

  const totalBalance = rows.reduce((sum, row) => sum + money(row.balance), 0);
  const totalMonthly = rows.reduce((sum, row) => sum + money(row.monthly_payment), 0);

  return (
    <div className="grid g14">
      <Field label="Business name">
        <Input
          disabled={disabled}
          value={value.business_name ?? ""}
          onChange={(event) => onChange({ ...value, business_name: event.target.value })}
        />
      </Field>

      {rows.length === 0 ? (
        <div className="empty">
          No obligations listed. Add a row for each loan, line of credit, card or advance the
          business is currently paying.
        </div>
      ) : (
        <div className="tblwrap">
          <table className="tbl pfs-table">
            <thead>
              <tr>
                <th>Lender</th>
                <th>Balance</th>
                <th>Monthly payment</th>
                <th>Notes</th>
                <th aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                // Index-keyed: these rows carry no id, and the only mutations
                // are append and remove-at-index.
                <tr key={index}>
                  <td>
                    <Input
                      aria-label={`Lender, row ${index + 1}`}
                      disabled={disabled}
                      value={row.lender ?? ""}
                      onChange={(event) => {
                        const next = [...rows];
                        next[index] = { ...row, lender: event.target.value };
                        setRows(next);
                      }}
                    />
                  </td>
                  <td>
                    <Input
                      aria-label={`Balance, row ${index + 1}`}
                      inputMode="decimal"
                      disabled={disabled}
                      value={row.balance ?? ""}
                      onChange={(event) => {
                        const next = [...rows];
                        next[index] = { ...row, balance: event.target.value };
                        setRows(next);
                      }}
                    />
                  </td>
                  <td>
                    <Input
                      aria-label={`Monthly payment, row ${index + 1}`}
                      inputMode="decimal"
                      disabled={disabled}
                      value={row.monthly_payment ?? ""}
                      onChange={(event) => {
                        const next = [...rows];
                        next[index] = { ...row, monthly_payment: event.target.value };
                        setRows(next);
                      }}
                    />
                  </td>
                  <td>
                    <Input
                      aria-label={`Notes, row ${index + 1}`}
                      disabled={disabled}
                      value={row.notes ?? ""}
                      onChange={(event) => {
                        const next = [...rows];
                        next[index] = { ...row, notes: event.target.value };
                        setRows(next);
                      }}
                    />
                  </td>
                  <td>
                    <Btn
                      size="sm"
                      disabled={disabled}
                      aria-label={`Remove row ${index + 1}`}
                      onClick={() => setRows(rows.filter((_, at) => at !== index))}
                    >
                      <Icon name="x" size={12} />
                    </Btn>
                  </td>
                </tr>
              ))}
              <tr className="pfs-total">
                <td>Total</td>
                <td className="num">{currency(totalBalance)}</td>
                <td className="num">{currency(totalMonthly)}</td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <Btn size="sm" disabled={disabled} onClick={() => setRows([...rows, {}])}>
        <Icon name="plus" size={12} /> Add an obligation
      </Btn>
    </div>
  );
}
