"use client";

import { Btn, Input, Select } from "@/components/ds";
import type { DealBudgetCalculation, DealBudgetWrite, DealCostRow, DealInvestorScenario, DealPayoffTerms } from "@/lib/dealBudget";
import { investorAmount, investorFeeStatus, investorMissingAssumption, investorMoney } from "@/lib/investorEconomics";
import styles from "./InvestorEconomicsPanel.module.css";

function Scenario({ title, scenario, rows, currency, pending }: { title: string; scenario?: DealInvestorScenario; rows: DealCostRow[]; currency: string; pending: boolean }) {
  const net = pending ? null : investorAmount(scenario?.net_income);
  const roi = pending ? null : investorAmount(scenario?.net_roi_pct);
  const display = (value: unknown) => pending ? "Calculating…" : investorMoney(value, currency);
  const fees = rows.filter(row => row.enabled && row.payer === "investor");
  return <article className={styles.scenario} aria-label={title} aria-busy={pending}>
    <header><h4>{title}</h4><p className={styles.note}>{scenario?.horizon_months != null ? `${scenario.horizon_months} months · ` : ""}{pending ? "Calculating current inputs…" : scenario ? scenario.status.replaceAll("_", " ") : "Scenario not available yet"}</p></header>
    <div className={styles.net}><span>Investor NET profit</span><strong className={net == null ? undefined : net < 0 ? styles.negative : styles.positive}>{display(net)}</strong><span>NET ROI over this scenario: <b>{pending ? "Calculating…" : roi == null ? "Not established" : `${roi.toFixed(2)}%`}</b></span></div>
    <dl className={styles.metrics}>
      <div><dt>Initial investor outlay</dt><dd>{display(scenario?.initial_outlay)}</dd></div>
      <div><dt>Principal returned</dt><dd>{display(scenario?.principal_returned)}</dd></div>
      <div><dt>Gross interest</dt><dd>{display(scenario?.gross_interest)}</dd></div>
      <div><dt>Investor fees / deductions</dt><dd>{display(scenario?.total_fees)}</dd></div>
      <div><dt>Minimum-interest charge included</dt><dd>{display(scenario?.minimum_interest_charge)}</dd></div>
      <div><dt>Payoff charge paid to investor</dt><dd>{display(scenario?.payoff_charge_income)}</dd></div>
      <div><dt>Investor reserve released</dt><dd>{display(scenario?.reserve_released)}</dd></div>
      <div><dt>Investor reserve still held</dt><dd>{display(scenario?.reserve_held)}</dd></div>
      <div><dt>Net cash received, including principal</dt><dd>{display(scenario?.net_cash_received)}</dd></div>
      <div><dt>Cash profit after initial outlay</dt><dd>{display(scenario?.net_cash_profit)}</dd></div>
    </dl>
    <p className={styles.note}>Returned principal is capital repaid, not profit. Reserve assets are separate from net profit; cash profit can be lower while a reserve remains held. ROI is for this scenario, not an annualized yield.</p>
    {!pending && scenario?.missing_assumptions?.length ? <div role="status"><strong>Confirm before relying on net results</strong><ul className={styles.list}>{scenario.missing_assumptions.map((message, index) => <li key={index}>{investorMissingAssumption(message)}</li>)}</ul></div> : null}
    {fees.length ? <details><summary>Investor fee deductions · {fees.length} rows</summary><div className={styles.charges}>{fees.map(row => {
      const calculated = scenario?.rows?.find(item => item.id === row.id);
      const status = investorFeeStatus(row, calculated, pending);
      return <div className={styles.charge} key={row.id}><div><span>{row.label || row.category}</span><b>{status ?? display(calculated?.total_amount)}</b></div><small>{row.method === "percent" ? `${row.value == null ? "Unknown rate" : `${row.value}%`} · ${row.basis.replaceAll("_", " ")}` : "Fixed amount"} · {row.timing === "closing" ? "at closing" : row.timing} · {row.settlement === "separate" ? "paid separately" : "deducted from distributions"}</small></div>;
    })}</div></details> : null}
    {!pending && scenario?.assumptions?.length ? <details><summary>Scenario assumptions</summary><ul className={styles.list}>{scenario.assumptions.map((message, index) => <li key={index}>{message}</li>)}</ul></details> : null}
  </article>;
}

export function InvestorEconomicsPanel({ value, calculation, pending, disabled, onChange }: { value: DealBudgetWrite; calculation?: DealBudgetCalculation; pending: boolean; disabled: boolean; onChange: (patch: Partial<DealBudgetWrite>) => void }) {
  const payoff: DealPayoffTerms = { interest_policy: "unknown", minimum_interest_months: null, charge_amount: null, charge_recipient: "unknown", reserve_release: "unknown", ...value.payoff_terms };
  const changePayoff = (patch: Partial<DealPayoffTerms>) => onChange({ payoff_terms: { ...payoff, ...patch } });
  return <section className={styles.section} aria-label="Investor net return comparison">
    <div><h3>Investor NET returns</h3><p className={styles.note}>Compare a full payoff at six months with payments through the full contractual term. The saved loan schedule, investor participation and applicable fee rows supply these illustrations. Defaults, delays and unrecorded charges can change actual returns.</p></div>
    <section className={styles.setup} aria-label="Early payoff assumptions">
      <div><h4>Confirm early payoff terms</h4><p className={styles.note}>Use the contracted payoff treatment. Unknown terms leave the early-payoff NET result unconfirmed.</p></div>
      <div className={styles.fields}>
        <label className={styles.field}>Interest due at early payoff<Select aria-label="Early payoff interest policy" value={payoff.interest_policy} disabled={disabled} onChange={event => changePayoff({ interest_policy: event.target.value as DealPayoffTerms["interest_policy"] })}><option value="unknown">Not confirmed</option><option value="accrued_only">Accrued interest only</option><option value="minimum_months">Contractual minimum interest months</option></Select></label>
        {payoff.interest_policy === "minimum_months" ? <label className={styles.field}>Minimum interest months<Input aria-label="Minimum interest months at payoff" type="number" min={1} step={1} value={payoff.minimum_interest_months ?? ""} disabled={disabled} onChange={event => changePayoff({ minimum_interest_months: event.target.value === "" ? null : Number(event.target.value) })} /></label> : null}
        <label className={styles.field}>Additional payoff charge, {value.currency}<Input aria-label="Additional early payoff charge" type="number" min={0} step="0.01" placeholder="Unknown · enter 0 if none" value={payoff.charge_amount ?? ""} disabled={disabled} onChange={event => changePayoff({ charge_amount: event.target.value === "" ? null : Number(event.target.value) })} /></label>
        <label className={styles.field}>Payoff charge recipient<Select aria-label="Early payoff charge recipient" value={payoff.charge_recipient} disabled={disabled} onChange={event => changePayoff({ charge_recipient: event.target.value as DealPayoffTerms["charge_recipient"] })}><option value="unknown">Not confirmed</option><option value="investor">Investor</option><option value="company">Company</option><option value="third_party">Third party</option></Select></label>
        <label className={styles.field}>Investor reserve release<Select aria-label="Investor reserve release at payoff" value={payoff.reserve_release} disabled={disabled} onChange={event => changePayoff({ reserve_release: event.target.value as DealPayoffTerms["reserve_release"] })}><option value="unknown">Not confirmed</option><option value="at_payoff">Release at early payoff</option><option value="contract_maturity">Hold until contractual maturity</option></Select></label>
      </div>
      <div><Btn size="sm" disabled={disabled} onClick={() => changePayoff({ charge_amount: 0 })}>Confirm no additional payoff charge</Btn></div>
    </section>
    <div className={styles.scenarios}><Scenario title="Six-month full payoff" scenario={calculation?.investor_scenarios?.six_month_payoff} rows={value.rows} currency={value.currency} pending={pending} /><Scenario title="Full contractual term" scenario={calculation?.investor_scenarios?.full_term} rows={value.rows} currency={value.currency} pending={pending} /></div>
    <p className={styles.note}>If the loan matures before month six, the payoff scenario ends at that earlier maturity. The server calculates the remaining principal and accrued charges; future interest is not assumed unless a confirmed minimum-interest provision applies.</p>
  </section>;
}
