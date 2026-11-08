import type { CockpitBankSummary, CockpitMonth, FinancialCockpit, FinancialPlanWrite } from "./financialCockpit";
import { balanceRiskMonths, riskCountLabel, riskTotals } from "./balanceRisk";
import { evaluatePlanLocally } from "./cockpitSimulation";
import { metricAmountLabel, metricCurrency, ebitdaKpi, type MetricCalculation, type MetricSourceRef } from "./financialMetrics";
import { adoptRecordedLoan, recordedLoanCadence, recordedRetainedAnnual } from "./loanTermsSync";
import { scheduleCashFlows } from "./loanSchedule";
import { roundEbitdaMoney as moneyRound } from "./ebitdaRefinance";

export type FinancialKpiKey = "deposits" | "cash_flow" | "average_balance" | "nsf_overdrafts" | "dscr" | "ebitda" | "net_profit";
export type FinancialKpiProjection = { value: number | null; valueLabel: string; status: "projected" | "partial" | "unchanged" | "unavailable"; basis: string; formula: string; notes: string[]; inputs: Array<{ label: string; value: number | null; unit: "currency" | "ratio" | "number" }>; source: "working_plan" | "saved_plan" | "filed_offer" | "none" };
export type FinancialKpiEntry = { key: FinancialKpiKey; title: string; currentValue: number | null; valueLabel: string; subLabel: string; unit: "currency" | "ratio" | "number"; currency: string | null; formula: string; calculationKeys: string[]; inputKeys: string[]; sourceRefs: MetricSourceRef[]; notes: string[]; projection: FinancialKpiProjection; canEditScope: boolean; scopeLabel: string; calculation?: MetricCalculation };
export type FinancialKpiOptions = { months: CockpitMonth[]; summary: CockpitBankSummary; accountKey: string; label: string; plan?: FinancialPlanWrite | null; dirty?: boolean };

const valid = (value: number | null | undefined) => value != null && Number.isFinite(value) ? value : null;
const mean = (values: Array<number | null | undefined>) => { const known = values.filter((v): v is number => valid(v) != null); return known.length ? moneyRound(known.reduce((a, b) => a + b, 0) / known.length) : null; };
const TITLES: Record<FinancialKpiKey, string> = { deposits: "Average monthly deposits", cash_flow: "Net cash flow per month", average_balance: "Average balance", nsf_overdrafts: "NSF and overdrafts", dscr: "Debt service coverage", ebitda: "EBITDA", net_profit: "Net profit" };

function fromRecord(cockpit: FinancialCockpit): FinancialPlanWrite {
  const r = cockpit.plan.record;
  return { retire: [...(r.retire ?? [])], exclude: [...(r.exclude ?? [])], new_payment_monthly: r.new_payment_monthly ?? null, new_payment_source: r.new_payment_source as FinancialPlanWrite["new_payment_source"], new_loan_amount: r.new_loan_amount ?? null, new_loan_rate_pct: r.new_loan_rate_pct ?? null, new_loan_term_months: r.new_loan_term_months ?? null, new_loan_structure: r.new_loan_structure ?? null, new_loan_interest_only: r.new_loan_interest_only ?? false, new_loan_interest_only_months: r.new_loan_interest_only_months ?? null, new_loan_repayment_config: r.new_loan_repayment_config ?? null, new_loan_payments_per_year: recordedLoanCadence(r, cockpit.plan.terms_link?.recorded), add_backs: (r.add_backs ?? []).map((row) => ({ ...row })), overrides: r.overrides ?? null, terms_ref: r.terms_ref ?? null, note: r.note ?? null, expected_updated_at: r.updated_at ?? null };
}

function projectionPlan(cockpit: FinancialCockpit, options: FinancialKpiOptions) {
  let plan = options.plan ?? fromRecord(cockpit);
  let source: FinancialKpiProjection["source"] = options.dirty ? "working_plan" : "saved_plan";
  const hasLoan = plan.new_loan_amount != null || plan.new_payment_monthly != null;
  const recorded = cockpit.plan.terms_link?.recorded;
  if (!hasLoan && !options.dirty && recorded) { plan = adoptRecordedLoan(plan, recorded); source = "filed_offer"; }
  else if (!hasLoan && !options.dirty && cockpit.proposed_terms?.amount != null) {
    const offer = cockpit.proposed_terms;
    plan = { ...plan, new_loan_amount: offer.amount, new_loan_rate_pct: offer.rate_pct, new_loan_term_months: offer.term_months, new_loan_structure: offer.structure as FinancialPlanWrite["new_loan_structure"], new_loan_interest_only: offer.interest_only, new_loan_interest_only_months: offer.interest_only_months, new_loan_repayment_config: offer.repayment_config ?? null, new_loan_payments_per_year: offer.payments_per_year ?? 12, new_payment_monthly: offer.monthly_payment, new_payment_source: "manual_terms" };
    source = "filed_offer";
  }
  const active = plan.new_loan_amount != null || plan.new_payment_monthly != null || plan.retire.length > 0 || plan.add_backs.length > 0 || plan.overrides != null || plan.exclude.length > 0;
  return { plan, source: active ? source : "none" as const, active };
}

function uniqueSources(sources: MetricSourceRef[]) {
  const seen = new Set<string>();
  return sources.filter((source) => { const key = JSON.stringify([source.file_id, source.analysis_id, source.version_id, source.pages, source.citations]); if (seen.has(key)) return false; seen.add(key); return true; });
}

/** One source/formula/projection mapping for the cards and their expanded review. */
export function metricEntries(cockpit: FinancialCockpit, options: FinancialKpiOptions): FinancialKpiEntry[] {
  const { plan, source, active } = projectionPlan(cockpit, options);
  const evaluation = evaluatePlanLocally(cockpit, plan, options.months);
  const review = cockpit.metric_review;
  const allCalcs = review?.calculations ?? [];
  const headline = cockpit.dscr.headline;
  const earnings = cockpit.ebitda?.headline;
  const profit = cockpit.net_profit.conclusion;
  const period = options.summary.first_month && options.summary.last_month ? `${options.summary.first_month} – ${options.summary.last_month}` : "Reporting period unknown";
  const counted = options.accountKey === "counted";
  const fileIds = new Set(options.months.flatMap((month) => month.file_ids));
  const knownBankSources = (review?.inputs ?? []).flatMap((input) => input.source_refs).filter((ref) => ref.file_id && fileIds.has(ref.file_id));
  const bankSources = uniqueSources([...knownBankSources, ...options.months.flatMap((month) => month.file_ids.filter((id) => !knownBankSources.some((ref) => ref.file_id === id)).map((file_id) => ({ file_id, file_name: null, pages: month.risk_sources?.filter((r) => r.file_id === file_id && r.page).map((r) => r.page!) ?? [] } as MetricSourceRef)))]);
  const risks = riskTotals(balanceRiskMonths(options.months));
  const loanMonths = new Map<number, { cash: number; interest: number }>();
  const actualCashFlows = evaluation.schedule ? scheduleCashFlows(evaluation.schedule) : [];
  if (evaluation.schedule) evaluation.schedule.rows.forEach((row, index) => { const month = Math.max(1, Math.ceil(row.month - 1e-9)); const current = loanMonths.get(month) ?? { cash: 0, interest: 0 }; loanMonths.set(month, { cash: current.cash + actualCashFlows[index], interest: current.interest + row.interest }); });
  const cashPriced = !!evaluation.schedule || plan.new_payment_source === "manual" && plan.new_payment_monthly != null;
  const firstYearCash = cashPriced ? moneyRound(Array.from({ length: 12 }, (_, i) => evaluation.schedule ? loanMonths.get(i + 1)?.cash ?? 0 : plan.new_payment_monthly ?? 0).reduce((a, b) => a + b, 0)) : null;
  const firstYearInterest = evaluation.schedule ? moneyRound(Array.from({ length: 12 }, (_, i) => loanMonths.get(i + 1)?.interest ?? 0).reduce((a, b) => a + b, 0)) : null;
  const selectedDebts = cockpit.debt.obligations.filter((row) => plan.retire.includes(row.id) && row.in_debt_service);
  const refinancing = plan.retire.length > 0 || plan.terms_ref?.treatment === "refinance";
  const reviewedRetainedAnnual = recordedRetainedAnnual(plan);
  const serviceBaseline = valid(cockpit.debt.service.monthly);
  const aggregateRetirementKnown = reviewedRetainedAnnual != null && serviceBaseline != null;
  const retirementKnown = aggregateRetirementKnown || (!refinancing || plan.retire.length > 0) && selectedDebts.every((row) => valid(row.monthly) != null) && plan.retire.every((id) => cockpit.debt.obligations.some((row) => row.id === id));
  const removedMonthly = aggregateRetirementKnown ? moneyRound(serviceBaseline! - reviewedRetainedAnnual! / 12) : retirementKnown ? moneyRound(selectedDebts.reduce((sum, row) => sum + row.monthly!, 0)) : null;
  const cashChange = removedMonthly != null && firstYearCash != null ? moneyRound(removedMonthly - firstYearCash / 12) : null;
  const commonNotes = [source === "filed_offer" ? "Filed-offer illustration only. This does not adopt the offer or change the saved plan." : options.dirty ? "Unsaved working scenario." : "Saved scenario.", ...(source === "saved_plan" && cockpit.plan.terms_link?.state === "differs" ? ["The saved scenario differs from the filed client terms. This illustration uses the saved scenario; review the terms before relying on it."] : []), "Illustrative first 12 loan months against the historical monthly baseline; no calendar commencement date is assumed. Financing proceeds are excluded from recurring deposits. Actual loan payments and DSCR's peak-year coverage burden are separate measures.", "Selected old payments are held at their current monthly run-rate; their remaining contractual maturity is not assumed to be known."];
  return (Object.keys(TITLES) as FinancialKpiKey[]).map((key): FinancialKpiEntry => {
    const bankMetric = ["deposits", "cash_flow", "average_balance", "nsf_overdrafts"].includes(key);
    const mapped = key === "deposits" ? ["bank.deposits"] : key === "cash_flow" ? ["bank.net_cash_flow"] : key === "average_balance" ? ["bank.average_balance"] : key === "nsf_overdrafts" ? ["bank.nsf_overdrafts"] : key === "dscr" ? [`dscr.${headline?.key ?? evaluation.candidates[0]?.key ?? "bank_cash_flow"}`] : key === "ebitda" ? earnings ? [earnings.key] : [] : profit ? [`net_profit.${profit.key}`] : [];
    const aggregateCalculation = allCalcs.find((row) => mapped.includes(row.key));
    const calculation = bankMetric && !counted ? undefined : aggregateCalculation;
    const raw = key === "deposits" ? options.summary.avg_deposits : key === "cash_flow" ? options.summary.avg_net : key === "average_balance" ? options.summary.average_balance : key === "nsf_overdrafts" ? risks.fees.value : key === "dscr" ? headline?.value : key === "ebitda" ? ebitdaKpi(earnings).value : profit?.value;
    const recipe = calculation?.recipe;
    const reviewedEbitda = key === "ebitda" && recipe?.current_event?.action === "compose" && !recipe.stale;
    const current = valid(reviewedEbitda ? recipe!.reviewed_value == null ? null : recipe!.reviewed_value * (earnings?.annualization_factor ?? 1) : bankMetric && counted && calculation ? calculation.value : raw);
    const unit = key === "dscr" ? "ratio" as const : key === "nsf_overdrafts" ? "number" as const : "currency" as const;
    const inputKeys = [...new Set([...(calculation?.input_keys ?? (key === "ebitda" ? earnings?.input_keys ?? [] : key === "cash_flow" ? ["bank.avg_net"] : [])), ...(calculation?.recipe?.denominator ? [calculation.recipe.denominator.input_key] : [])])];
    const metricSources = [...((bankMetric ? aggregateCalculation : calculation)?.source_refs ?? (key === "ebitda" ? earnings?.source_refs ?? [] : [])), ...(review?.inputs ?? []).filter((input) => inputKeys.includes(input.key)).flatMap((input) => input.source_refs)];
    const sources = bankMetric ? uniqueSources([...metricSources.filter((ref) => ref.file_id && fileIds.has(ref.file_id)), ...bankSources.filter((ref) => !metricSources.some((specific) => specific.file_id === ref.file_id)).map(({ pages: _pages, citations: _citations, fact_key: _factKey, ...metadata }) => metadata)]) : uniqueSources(metricSources);
    const sourceCurrency = calculation && "currency" in calculation ? calculation.currency : key === "ebitda" ? earnings?.currency : undefined;
    const currency = unit !== "currency" ? null : metricCurrency(sourceCurrency, sources);
    const format = (value: number | null) => value == null ? "Unavailable" : unit === "ratio" ? `${value.toFixed(2)}x` : unit === "number" ? value.toLocaleString() : metricAmountLabel(value, currency, 0, true);
    const currentLabel = key === "nsf_overdrafts" ? riskCountLabel({ ...risks.fees, value: current, complete: counted && calculation?.details?.complete !== undefined ? calculation.details.complete : risks.fees.complete }) : key === "dscr" && cockpit.dscr.no_debt ? "No debt" : format(current);
    const projection: FinancialKpiProjection = { value: null, valueLabel: "No loan scenario", status: "unavailable", basis: "First 12 loan months · illustration", formula: "", notes: active ? [...commonNotes] : ["Enter loan terms or file a lending offer to compare a scenario."], inputs: [], source };
    const setAfter = (value: number | null, status: FinancialKpiProjection["status"], formula: string, notes: string[] = []) => { projection.value = value; projection.valueLabel = format(value); projection.status = value == null ? "unavailable" : status; projection.formula = formula; projection.notes.push(...notes); };
    if (active) {
      if (key === "deposits") setAfter(current, "unchanged", "Recurring historical deposits unchanged by financing", ["Loan proceeds are not operating revenue or recurring deposits."]);
      if (key === "dscr") { setAfter(evaluation.headlineAfter, "projected", "Reviewed annual earnings ÷ modeled annual debt service", [evaluation.coverageUnavailableReason ?? "Configured loans use peak rolling twelve-month actual cash due, including balloons."]); projection.basis = "Annual underwriting coverage"; if (evaluation.serviceAfterAnnual === 0 && !evaluation.coverageUnavailableReason) { projection.valueLabel = "No debt service"; projection.status = "projected"; projection.notes.push("With no modeled debt-service denominator, DSCR is undefined; the earnings baseline remains visible in the calculation."); } }
      if (key === "ebitda") { setAfter(current, "unchanged", reviewedEbitda ? earnings?.kind === "tax_estimate" ? "Staff-adjusted tax earnings estimate unchanged by financing" : "Staff-adjusted EBITDA unchanged by financing" : "Source earnings before = source earnings after financing", ["Interest, principal and financing proceeds do not change source EBITDA. Identified operating assumptions belong in separately labeled Adjusted EBITDA."]); projection.basis = earnings?.period ?? "Source reporting period"; }
      if (key === "cash_flow") { const after = counted && currency === "USD" && current != null && cashChange != null ? moneyRound(current + cashChange) : null; setAfter(after, "projected", "Historical monthly net + selected old monthly payments − actual first-year loan cash / 12", [!counted ? "The loan scenario spans counted accounts. No arbitrary payment allocation is made to a single account." : currency !== "USD" ? "Confirm that the selected bank baseline is denominated in USD before combining it with USD loan payments." : !retirementKnown ? "Review unknown or unresolved payments selected for payoff." : !cashPriced ? "Complete the loan schedule or enter a reviewed monthly payment." : "Operating deposits and non-financing withdrawals are held constant."]); }
      if (key === "average_balance") { let carried = 0; const shifts: number[] = []; const endingProxy = options.summary.average_balance_basis?.includes("ending"); if (counted && currency === "USD" && retirementKnown && cashPriced) for (let i = 0; i < 12; i++) { const delta = removedMonthly! - (evaluation.schedule ? loanMonths.get(i + 1)?.cash ?? 0 : plan.new_payment_monthly ?? 0); shifts.push(carried + delta * (endingProxy ? 1 : 0.5)); carried += delta; } const shift = mean(shifts); setAfter(current != null && shift != null ? moneyRound(current + shift) : null, "projected", endingProxy ? "Historical ending-balance proxy + mean(prior cash retained + current-month payment relief), first 12 loan months" : "Historical average balance + mean(prior cash retained + half of current-month payment relief), first 12 loan months", [endingProxy ? "Ending-balance sensitivity model: each month's full financing cash change affects its closing-balance proxy. The source does not establish a daily ledger average." : "Illustrative midpoint timing model: payment changes are spread uniformly through each modeled loan month against the historical average baseline. This is not a reported daily ledger average or a dated bank-balance forecast.", ...(!counted ? ["No arbitrary balance effect is assigned to a single account."] : currency !== "USD" ? ["A confirmed USD bank baseline is required for a USD loan-payment illustration."] : [])]); }
      if (key === "nsf_overdrafts") { setAfter(current, "unchanged", "Historical NSF and overdraft incidents remain historical", ["No future incident count is inferred from monthly totals. A prospective count requires a complete dated daily-balance replay."]); projection.valueLabel = currentLabel; projection.basis = "Historical incidents · no prospective count"; }
      if (key === "net_profit") {
        if (profit?.key === "bank_cash_flow") setAfter(counted && currency === "USD" && current != null && cashChange != null ? moneyRound(current + cashChange * 12) : null, "projected", "Annualized bank cash-retained proxy + first-year payment relief", ["This is a cash-retained proxy, not accounting net profit."]);
        else if (currency !== "USD") setAfter(null, "unavailable", "Annual profit estimate − new first-year interest + reviewed retired interest", ["Confirm USD source earnings before combining them with USD loan interest. No currency conversion is assumed."]);
        else if (current != null && firstYearInterest != null) setAfter(moneyRound(current - firstYearInterest), refinancing ? "partial" : "projected", "Historical annual profit estimate − actual first-year new-loan interest", ["Financing principal is not a profit expense. This estimate does not recalculate taxes or fees.", ...(refinancing ? ["Partial effect: the interest portion of retired payments is not established, so possible removed-interest relief is not included. This is not the complete refinance profit estimate."] : [])]);
        else setAfter(null, "unavailable", "Annual profit estimate − new first-year interest + reviewed retired interest", ["A priced principal/interest schedule and comparable profit baseline are required."]);
      }
    }
    if (active && ["cash_flow", "average_balance"].includes(key)) projection.inputs = [{ label: aggregateRetirementKnown ? "Replaced payment run-rate from current service minus reviewed retained service" : "Selected old monthly payment run-rate", value: removedMonthly, unit: "currency" }, { label: "New first-year actual cash due", value: firstYearCash, unit: "currency" }];
    if (key === "net_profit" && active) projection.inputs = [{ label: "New first-year interest", value: firstYearInterest, unit: "currency" }, { label: "Interest removed with payoffs", value: refinancing ? null : 0, unit: "currency" }];
    return { key, title: reviewedEbitda ? earnings?.kind === "tax_estimate" ? "Staff-adjusted tax earnings estimate" : "Staff-adjusted EBITDA" : TITLES[key], currentValue: current, valueLabel: currentLabel, subLabel: bankMetric ? `${options.label} · ${period}` : key === "ebitda" ? `${reviewedEbitda ? "Staff-adjusted calculation" : earnings?.label ?? "EBITDA"} · ${earnings?.period ?? "Unknown period"}` : key === "dscr" ? headline?.label ?? "No current earnings basis" : profit?.label ?? "No income source", unit, currency, formula: calculation?.formula ?? (key === "deposits" ? "Mean of available monthly deposits" : key === "cash_flow" ? "Mean(monthly deposits − withdrawals)" : key === "average_balance" ? "Mean reported monthly average balances; ending balances only when disclosed as fallback" : key === "nsf_overdrafts" ? "Reported NSF and overdraft incidents, preserving incomplete counts" : key === "dscr" ? "Annual earnings ÷ annual debt service" : key === "ebitda" ? earnings?.formula ?? "Net income + interest + income taxes + depreciation and amortization" : "Selected source net-income or cash-retained estimate"), calculationKeys: mapped, inputKeys, sourceRefs: sources, notes: [...(calculation?.notes ?? []), ...(bankMetric && !counted ? ["Selected-account inspection is read only. Reviewed aggregate changes apply to the exact counted-account cohort; switch to Counted accounts to edit."] : [])], projection, canEditScope: !bankMetric || counted, scopeLabel: bankMetric ? options.label : "Business financial file", calculation };
  });
}

export function metricEntry(cockpit: FinancialCockpit, key: FinancialKpiKey, options: FinancialKpiOptions) { return metricEntries(cockpit, options).find((entry) => entry.key === key)!; }
