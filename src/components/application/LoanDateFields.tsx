"use client";

import { Field, Input, Select } from "@/components/ds";
import { LOAN_DATE_NOTE, resolveLoanDates, type LoanDates } from "@/lib/loanDates";

export function LoanDateFields({ value, termMonths, onChange, disabled = false, ids, errors }: {
  value: LoanDates; termMonths: number | null | undefined; onChange: (value: LoanDates) => void; disabled?: boolean;
  ids?: Partial<Record<keyof LoanDates, string>>; errors?: Partial<Record<keyof LoanDates, string>>;
}) {
  const dates = resolveLoanDates(value, termMonths);
  const error = (key: keyof LoanDates) => errors?.[key] ? <span id={ids?.[key] ? `${ids[key]}-error` : undefined}>{errors[key]}</span> : undefined;
  const binding = (key: keyof LoanDates) => ({ id: ids?.[key], "aria-invalid": errors?.[key] ? true as const : undefined, "aria-describedby": errors?.[key] && ids?.[key] ? `${ids[key]}-error` : undefined });
  return <section aria-label="Estimated loan dates" className="grid g8">
    <div className="grid cols-auto">
      <Field label="Estimated funding date" error={error("expected_funding_date")}><Input {...binding("expected_funding_date")} type="date" aria-label="Estimated funding date" disabled={disabled} value={dates.expected_funding_date} onChange={event => onChange(resolveLoanDates({ ...dates, expected_funding_date: event.target.value }, termMonths))} /></Field>
      <Field label="Maturity calculation" error={error("maturity_date_mode")}><Select {...binding("maturity_date_mode")} aria-label="Maturity calculation" disabled={disabled} value={dates.maturity_date_mode} onChange={event => onChange(resolveLoanDates({ ...dates, maturity_date_mode: event.target.value as LoanDates["maturity_date_mode"] }, termMonths))}><option value="automatic">Automatic from funding + term</option><option value="manual">Manual date override</option></Select></Field>
      <Field label="Estimated maturity date" error={error("maturity_date")}><Input {...binding("maturity_date")} type="date" aria-label="Estimated maturity date" disabled={disabled || dates.maturity_date_mode === "automatic"} value={dates.maturity_date} onChange={event => onChange({ ...dates, maturity_date: event.target.value })} /></Field>
    </div>
    <small className="sub">{LOAN_DATE_NOTE} {dates.maturity_date_mode === "automatic" ? "Maturity follows the estimated funding date and contractual term." : "A staff-entered maturity date is in use."}</small>
  </section>;
}
