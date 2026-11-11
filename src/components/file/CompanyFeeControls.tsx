"use client";

import { Btn, Input, Select, Textarea } from "@/components/ds";
import { DEAL_COST_BASES, DEAL_COST_CATEGORIES, type DealBudgetCalculation, type DealBudgetWrite, type DealCostRow, type DealInvestorScenarioRow, type DealSoftwareMonitoring } from "@/lib/dealBudget";
import { COMPANY_FEE_CATEGORIES, investorFeeStatus, investorMoney, isCompanyFee, newCompanyFee } from "@/lib/investorEconomics";
import styles from "./InvestorEconomicsPanel.module.css";

export function CompanyFeeControls({ value, calculation, pending, disabled, onChange, onRowChange }: { value: DealBudgetWrite; calculation?: DealBudgetCalculation; pending: boolean; disabled: boolean; onChange: (patch: Partial<DealBudgetWrite>) => void; onRowChange: (id: string, patch: Partial<DealCostRow>) => void }) {
  const setup: DealSoftwareMonitoring = { software_status: "not_set", monitoring_status: "not_set", ...value.software_monitoring };
  const calculatedRows = (Array.isArray(calculation?.rows) ? calculation.rows : []) as DealInvestorScenarioRow[];
  const rows = value.rows.filter(isCompanyFee);
  return <section className={styles.section} aria-label="Company fees and loan setup">
    <div><h3>Company fees and loan setup</h3><p className={styles.note}>Choose who manages servicing, then enter the actual fees. Percentage fees use the selected basis and timing; investor-paid charges reduce investor net profit.</p></div>
    <label className={styles.field}>Servicing arrangement<Select aria-label="Servicing arrangement" value={value.servicing_mode ?? "not_set"} disabled={disabled} onChange={event => onChange({ servicing_mode: event.target.value as DealBudgetWrite["servicing_mode"] })}><option value="not_set">Choose servicing arrangement</option><option value="company_managed">Company-managed servicing</option><option value="transferred">Servicing transferred</option></Select></label>
    <div className={styles.actions}>{COMPANY_FEE_CATEGORIES.map(category => <Btn key={category} size="sm" disabled={disabled} onClick={() => onChange({ rows: [...value.rows, newCompanyFee(category)] })}>Add {DEAL_COST_CATEGORIES[category].toLowerCase()} fee</Btn>)}</div>
    {!rows.length ? <p className={styles.note}>No company fees entered. Add the applicable charges, or confirm no additional fees under Costs reviewed below.</p> : rows.map((row, index) => {
      const calculated = calculatedRows.find(item => item.id === row.id), status = investorFeeStatus(row, calculated, pending);
      const label = `Company fee ${index + 1}`;
      return <article key={row.id} className={styles.fee} aria-label={`${label}: ${row.label || DEAL_COST_CATEGORIES[row.category]}`}>
        <div className={styles.feeHead}><label className={styles.check}><input type="checkbox" aria-label={`${label} included`} checked={row.enabled} disabled={disabled} onChange={event => onRowChange(row.id, { enabled: event.target.checked })} />Include {DEAL_COST_CATEGORIES[row.category].toLowerCase()} fee</label><strong aria-label={`${label} full-term amount`}>{status ?? investorMoney(calculated?.total_amount, value.currency)}<small> · full term</small></strong></div>
        <div className={styles.fields}>
          <label className={styles.field}>Public fee label<Input aria-label={`${label} label`} value={row.label} disabled={disabled} onChange={event => onRowChange(row.id, { label: event.target.value })} /></label>
          <label className={styles.field}>Paid by<Select aria-label={`${label} payer`} value={row.payer} disabled={disabled} onChange={event => onRowChange(row.id, { payer: event.target.value as DealCostRow["payer"] })}><option value="investor">Investor · deduct from investor return</option><option value="borrower">Borrower</option><option value="sponsor">Sponsor / company</option></Select></label>
          <label className={styles.field}>Charge method<Select aria-label={`${label} method`} value={row.method} disabled={disabled} onChange={event => onRowChange(row.id, { method: event.target.value as DealCostRow["method"] })}><option value="fixed">Fixed amount</option><option value="percent">Percentage</option></Select></label>
          <label className={styles.field}>{row.method === "percent" ? "Rate, %" : `Amount, ${value.currency}`}<Input aria-label={`${label} value`} type="number" min={0} step="any" placeholder="Unknown" value={row.value ?? ""} disabled={disabled} onChange={event => onRowChange(row.id, { value: event.target.value === "" ? null : Number(event.target.value) })} /></label>
          <label className={styles.field}>Percentage basis<Select aria-label={`${label} basis`} value={row.basis} disabled={disabled || row.method === "fixed"} onChange={event => onRowChange(row.id, { basis: event.target.value as DealCostRow["basis"] })}>{Object.entries(DEAL_COST_BASES).map(([key, title]) => <option key={key} value={key}>{title}</option>)}</Select></label>
          <label className={styles.field}>When charged<Select aria-label={`${label} timing`} value={row.timing} disabled={disabled} onChange={event => onRowChange(row.id, { timing: event.target.value as DealCostRow["timing"] })}><option value="closing">Once at closing</option><option value="monthly">Monthly, accrued with payments</option><option value="annual">Annual, accrued with payments</option></Select></label>
          <label className={styles.field}>Applies when<Select aria-label={`${label} applicability`} value={row.applicability ?? "all"} disabled={disabled} onChange={event => onRowChange(row.id, { applicability: event.target.value as DealCostRow["applicability"] })}><option value="all">Either servicing arrangement</option><option value="company_managed">Company-managed only</option><option value="transferred">Transferred servicing only</option></Select></label>
          <label className={styles.field}>Fee recipient<Select aria-label={`${label} recipient role`} value={row.recipient_role ?? "platform"} disabled={disabled} onChange={event => onRowChange(row.id, { recipient_role: event.target.value as DealCostRow["recipient_role"] })}><option value="platform">Company / platform</option><option value="lender">Lender</option><option value="third_party">Third party</option><option value="escrow">Escrow / reserve custodian</option></Select></label>
        </div>
        <p className={styles.note}>The full cost table below also controls collection, cash-flow treatment and private recipient notes for this fee.</p>
      </article>;
    })}
    <section className={styles.setup} aria-label="Software and monitoring setup">
      <div><h4>Software and monitoring · every loan</h4><p className={styles.note}>Track setup separately from its fees. These are staff-recorded statuses; they do not verify an external connection or provision a service.</p></div>
      <div className={styles.fields}>{(["software_status", "monitoring_status"] as const).map(key => <label key={key} className={styles.field}>{key === "software_status" ? "Software setup" : "Monitoring setup"}<Select aria-label={key === "software_status" ? "Software setup status" : "Monitoring setup status"} value={setup[key]} disabled={disabled} onChange={event => onChange({ software_monitoring: { ...setup, [key]: event.target.value } })}><option value="not_set">Needs setup</option><option value="planned">Planned</option><option value="in_progress">In progress</option><option value="configured">Configured · staff recorded</option></Select></label>)}<label className={styles.field}>Provider / system<Input aria-label="Software and monitoring provider" value={setup.provider ?? ""} disabled={disabled} onChange={event => onChange({ software_monitoring: { ...setup, provider: event.target.value } })} /></label></div>
      <label className={styles.field}>Setup notes<Textarea aria-label="Software and monitoring setup notes" rows={2} value={setup.notes ?? ""} disabled={disabled} onChange={event => onChange({ software_monitoring: { ...setup, notes: event.target.value } })} /></label>
    </section>
  </section>;
}
