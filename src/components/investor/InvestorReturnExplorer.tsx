"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { returnExitForMonth, returnMoney, returnNumber, returnPercent, returnPlot, returnRequirement, returnTone, sameReturnRequest, selectReturnMonth, type InvestorHoldingRow, type InvestorProjectionLoader, type InvestorProjectionRequest, type InvestorReturnProjection, type ReturnChartPoint, type ReturnNumber } from "./investorReturnModel";
import styles from "./InvestorReturnExplorer.module.css";

type ExplorerProps = { sourceKey: string; sourceLabel: string; loadProjection: InvestorProjectionLoader; initialMonth?: number; preview?: boolean; stale?: boolean; onReviewAssumptions?: (missing: string[]) => void; onProjectionChange?: (value: InvestorReturnProjection | null) => void };

function Metric({ label, value, currency }: { label: string; value: ReturnNumber; currency: string | null }) {
  return <div><dt>{label}</dt><dd>{returnMoney(value, currency)}</dd></div>;
}

function Chart({ points, selectedMonth, onSelect, currency, label, cash = false, hoverDetails }: { points: ReturnChartPoint[]; selectedMonth: number; onSelect: (month: number) => void; currency: string | null; label: string; cash?: boolean; hoverDetails: (month: number) => Array<{ label: string; value: string }> }) {
  const id = useId().replace(/:/g, "");
  const plot = useMemo(() => returnPlot(points), [points]);
  const [hovered, setHovered] = useState<number | null>(null);
  const selected = selectReturnMonth(plot.points, selectedMonth);
  const shown = selectReturnMonth(plot.points, hovered ?? selectedMonth);
  const first = plot.points[0]?.month ?? 0, last = plot.points.at(-1)?.month ?? first;
  const pointAt = (clientX: number, target: SVGSVGElement) => {
    const rect = target.getBoundingClientRect();
    const x = (clientX - rect.left) / (rect.width || 1) * 720;
    return selectReturnMonth(plot.points, first + (x - 14) / 692 * (last - first));
  };
  return <figure className={styles.figure} aria-label={`${label} chart`}>
    <div className={styles.plotLabel}><span>{label}</span><strong className={cash ? undefined : styles[returnTone(selected?.value)]}>{returnMoney(selected?.value, currency)}</strong></div>
    {plot.paths.length ? <div className={styles.plot}>
      <svg viewBox="0 0 720 220" preserveAspectRatio="none" aria-hidden="true" onPointerMove={event => { if (event.pointerType !== "touch") setHovered(pointAt(event.clientX, event.currentTarget)?.month ?? null); }} onPointerLeave={() => setHovered(null)} onPointerDown={event => { if (event.button !== 0) return; const point = pointAt(event.clientX, event.currentTarget); if (point) onSelect(point.month); }}>
        <defs><clipPath id={`${id}positive`}><rect x="0" y="0" width="720" height={plot.zeroY} /></clipPath><clipPath id={`${id}negative`}><rect x="0" y={plot.zeroY} width="720" height={220 - plot.zeroY} /></clipPath></defs>
        {[14, 110, 206].map(y => <line key={y} x1="14" x2="706" y1={y} y2={y} className={styles.gridLine} />)}
        <line x1="14" x2="706" y1={plot.zeroY} y2={plot.zeroY} className={styles.zeroLine} />
        {plot.paths.map((path, index) => cash ? <path key={index} d={path} className={styles.cashStroke} /> : <g key={index}><path d={path} className={styles.positiveStroke} clipPath={`url(#${id}positive)`} /><path d={path} className={styles.negativeStroke} clipPath={`url(#${id}negative)`} /></g>)}
        {shown ? <line x1={shown.x} x2={shown.x} y1="14" y2="206" className={styles.marker} /> : null}
        {shown?.y != null ? <circle cx={shown.x} cy={shown.y} r="4" className={styles.dot} /> : null}
      </svg>
      {hovered != null && shown ? <div className={styles.tooltip} style={{ right: 8 }} aria-hidden="true"><span>Month {shown.month} after funding</span>{hoverDetails(shown.month).map(detail => <div key={detail.label} className={styles.tooltipRow}><span>{detail.label}</span><b>{detail.value}</b></div>)}</div> : null}
    </div> : <div className={styles.placeholder}>Confirmed amounts are not available for this plot.</div>}
    <div className={styles.axis}><span>Month {first}</span><span>Month {last} · maturity</span></div>
    <figcaption className={styles.note}>Hover for a point, or tap and use the month controls to select it.{plot.paths.length ? <> Range: {returnMoney(plot.minimum, currency)} to {returnMoney(plot.maximum, currency)}.</> : " Confirm the missing inputs to establish this plot."}</figcaption>
  </figure>;
}

function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "The projection could not be loaded. Try again.";
}

function MonthlyTable({ points, selectedMonth, ready, pending, currency, onSelect }: { points: InvestorHoldingRow[]; selectedMonth: number; ready: boolean; pending: boolean; currency: string | null; onSelect: (month: number) => void }) {
  const [page, setPage] = useState(0);
  const pageSize = 36, pages = Math.max(1, Math.ceil(points.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const money = (value: ReturnNumber) => ready ? returnMoney(value, currency) : pending ? "Updating…" : "Not confirmed";
  return <><div className={styles.controls}><button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous months</button><span className={styles.note}>Page {currentPage + 1} of {pages}</span><button type="button" disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)}>Next months</button></div><div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Monthly investor figures"><table className={styles.table}><thead><tr><th>Month after funding</th><th>Interest</th><th>Investor fees</th><th>Principal returned</th><th>Net distribution</th><th>Cumulative net profit</th><th>Cash after initial outlay</th></tr></thead><tbody>{points.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map(point => <tr key={point.month} aria-selected={selectedMonth === point.month}><td><button type="button" aria-pressed={selectedMonth === point.month} onClick={() => onSelect(point.month)}>Month {point.month}</button></td><td>{money(point.interest)}</td><td>{money(point.fees)}</td><td>{money(point.principal_returned)}</td><td>{money(point.net_distribution)}</td><td className={ready ? styles[returnTone(point.cumulative_net_profit)] : undefined}>{money(point.cumulative_net_profit)}</td><td>{money(point.cumulative_net_cash_flow)}</td></tr>)}</tbody></table></div></>;
}

/** The same portable, server-priced explorer is used by staff and member applications. */
export function InvestorReturnExplorer({ sourceKey, sourceLabel, loadProjection, initialMonth = 6, preview = false, stale = false, onReviewAssumptions, onProjectionChange }: ExplorerProps) {
  const initialExitMonth = Number.isFinite(initialMonth) && initialMonth > 0 ? initialMonth : 6;
  const [projection, setProjection] = useState<InvestorReturnProjection | null>(null);
  const [projectionScope, setProjectionScope] = useState<string | null>(null);
  const [month, setMonth] = useState(initialMonth);
  const [mode, setMode] = useState<"holding" | "payoff">("holding");
  const [cash, setCash] = useState(false);
  const [stake, setStake] = useState(false);
  const [stakeText, setStakeText] = useState("");
  const [pending, setPending] = useState<"initial" | "amount" | "exit" | null>("initial");
  const [error, setError] = useState("");
  const [sourceChanged, setSourceChanged] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const loader = useRef(loadProjection); loader.current = loadProjection;
  const projectionSink = useRef(onProjectionChange); projectionSink.current = onProjectionChange;
  const notifyProjection = useCallback((value: InvestorReturnProjection | null) => projectionSink.current?.(value), []);
  const currentScope = useRef(sourceKey); currentScope.current = sourceKey;
  const currentProjection = useRef(projection); currentProjection.current = projection;
  const operation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const fingerprint = useRef<string | null>(null);
  const currentMonth = useRef(month); currentMonth.current = month;
  const amount = stake ? returnNumber(stakeText) : null;
  const validAmount = !stake || amount != null && amount > 0 && (projection?.offering_investor_capital == null || amount <= projection.offering_investor_capital);
  const desiredAmount = useRef<number | null>(amount); desiredAmount.current = amount;
  const amountMatches = projection != null && validAmount && projection.request.investment_amount === amount;

  const execute = useCallback(async (request: InvestorProjectionRequest, resetSource = false) => {
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    const sequence = ++operation.current, scope = currentScope.current;
    const previous = currentProjection.current;
    notifyProjection(null);
    setPending(!previous ? "initial" : previous.request.investment_amount !== request.investment_amount ? "amount" : "exit");
    setError("");
    try {
      const result = await loader.current(request, abort.signal);
      if (abort.signal.aborted || sequence !== operation.current || currentScope.current !== scope) return;
      if (request.investment_amount !== desiredAmount.current) return;
      if (!sameReturnRequest(result.request, request)) throw new Error("The response does not match the selected month or investment amount. Reload the projection.");
      if (!resetSource && fingerprint.current && result.source.fingerprint !== fingerprint.current) {
        currentProjection.current = null; setProjection(null); setSourceChanged(true);
        throw new Error("Saved inputs changed. Reload the projection to see current figures.");
      }
      fingerprint.current = result.source.fingerprint;
      currentProjection.current = result; setProjection(result); setProjectionScope(scope); setSourceChanged(false); notifyProjection(result.status === "unavailable" ? null : result);
      setMonth(current => current === request.exit_month ? selectReturnMonth(result.holding, current)?.month ?? current : current);
    } catch (reason) {
      if (!abort.signal.aborted && sequence === operation.current && currentScope.current === scope) {
        currentProjection.current = null; setProjection(null); setProjectionScope(null); setError(errorText(reason)); notifyProjection(null);
      }
    } finally {
      if (!abort.signal.aborted && sequence === operation.current && currentScope.current === scope) setPending(null);
    }
  }, [notifyProjection]);
  const cancelOperation = useCallback(() => { operation.current++; controller.current?.abort(); notifyProjection(null); }, [notifyProjection]);

  useEffect(() => {
    cancelOperation(); fingerprint.current = null; currentProjection.current = null;
    desiredAmount.current = null; currentMonth.current = initialMonth;
    setProjection(null); setProjectionScope(null); setMonth(initialMonth); setMode("holding"); setCash(false); setStake(false); setStakeText(""); setSourceChanged(false); setError(""); setTableOpen(false);
    void execute({ exit_month: initialExitMonth, investment_amount: null }, true);
    return cancelOperation;
  }, [sourceKey, initialMonth, initialExitMonth, execute, cancelOperation]);

  useEffect(() => {
    notifyProjection(null);
    if (!validAmount) return;
    if (!currentProjection.current) {
      if (!stake || sourceChanged) return;
      const timer = window.setTimeout(() => { void execute({ exit_month: currentMonth.current > 0 ? currentMonth.current : initialExitMonth, investment_amount: amount }); }, 500);
      return () => window.clearTimeout(timer);
    }
    if (currentProjection.current.request.investment_amount === amount) { cancelOperation(); setPending(null); notifyProjection(currentProjection.current.status === "unavailable" ? null : currentProjection.current); return; }
    const timer = window.setTimeout(() => { void execute({ exit_month: currentMonth.current > 0 ? currentMonth.current : initialExitMonth, investment_amount: amount }); }, 500);
    return () => window.clearTimeout(timer);
  }, [stake, stakeText, validAmount, amount, sourceKey, sourceChanged, initialExitMonth, execute, cancelOperation, notifyProjection]);

  const row = projection ? selectReturnMonth(projection.holding, month) : undefined;
  const selectedMonth = row?.month ?? month;
  const exit = projection ? returnExitForMonth(projection, selectedMonth) : null;
  useEffect(() => {
    if (mode !== "payoff" || !projection || !amountMatches || selectedMonth <= 0 || exit || sourceChanged) return;
    const timer = window.setTimeout(() => { void execute({ exit_month: selectedMonth, investment_amount: desiredAmount.current }); }, 200);
    return () => window.clearTimeout(timer);
  }, [mode, projection, amountMatches, selectedMonth, exit, sourceChanged, execute]);

  const ready = amountMatches && projection?.status !== "unavailable" && !sourceChanged && pending !== "initial" && pending !== "amount";
  const exitReady = ready && mode === "payoff" && exit != null && pending !== "exit";
  const currency = projection?.currency ?? null;
  const holding = projection?.holding ?? [];
  const choices = mode === "payoff" ? holding.filter(point => point.month > 0) : holding;
  const choiceIndex = Math.max(0, choices.findIndex(point => point.month === selectedMonth));
  const plotPoints = useMemo<ReturnChartPoint[]>(() => {
    if (!ready || !projection) return [];
    if (mode === "holding") return projection.holding.map(point => ({ month: point.month, value: cash ? point.cumulative_net_cash_flow : point.cumulative_net_profit }));
    return projection.payoff_curve.map(point => ({ month: point.payoff_month ?? point.month, value: cash ? point.net_cash_profit : point.net_income }));
  }, [ready, projection, mode, cash]);
  const net = mode === "holding" ? ready ? row?.cumulative_net_profit : null : exitReady ? exit?.net_income : null;
  const roi = mode === "holding" ? ready ? row?.cumulative_net_roi_pct : null : exitReady ? exit?.net_roi_pct : null;
  const cashBalance = mode === "holding" ? ready ? row?.cumulative_net_cash_flow : null : exitReady ? exit?.net_cash_profit : null;
  const selectMonth = (value: number) => { if (value <= 0) setMode("holding"); setMonth(value); setError(""); };
  const missing = mode === "payoff" && exitReady ? exit?.missing_assumptions ?? [] : projection?.missing_inputs ?? [];
  const hoverDetails = (value: number) => {
    if (mode === "payoff") {
      const point = projection?.payoff_curve.find(item => (item.payoff_month ?? item.month) === value);
      return [{ label: "NET profit", value: returnMoney(point?.net_income, currency) }, { label: "Cumulative NET ROI", value: returnPercent(point?.net_roi_pct) }, { label: "Principal returned", value: returnMoney(point?.principal_returned, currency) }, { label: "Investor fees", value: returnMoney(point?.total_fees, currency) }];
    }
    const point = holding.find(item => item.month === value);
    return [{ label: "Net distribution", value: returnMoney(point?.net_distribution, currency) }, { label: "Investor fees", value: returnMoney(point?.fees, currency) }, { label: "Cumulative NET profit", value: returnMoney(point?.cumulative_net_profit, currency) }, { label: "Cumulative NET ROI", value: returnPercent(point?.cumulative_net_roi_pct) }];
  };

  if (projection && projectionScope !== sourceKey) return <section className={styles.root} aria-label="Monthly investor returns" aria-busy="true"><div className={styles.placeholder}>Loading the current source…</div></section>;
  if (projection?.status === "unavailable") return <section className={styles.root} aria-label="Monthly investor returns"><header><h3>Monthly investor returns</h3><p className={styles.note}>{preview ? "Unsaved editor preview" : sourceLabel}</p></header><div className={styles.notice}><strong>Projection unavailable</strong><ul>{projection.missing_inputs.map((item, index) => <li key={index}>{returnRequirement(item)}</li>)}</ul>{onReviewAssumptions ? <button type="button" onClick={() => onReviewAssumptions(projection.missing_inputs)}>Review fees / payoff assumptions</button> : null}<button type="button" onClick={() => void execute({ exit_month: initialExitMonth, investment_amount: null }, true)}>Reload projection</button></div><p className={styles.note}>No return quote is shown until the saved inputs are confirmed.</p></section>;

  return <section className={styles.root} aria-label="Monthly investor returns" aria-busy={pending != null}>
    <header className={styles.header}><div><h3>Monthly investor returns</h3><p className={styles.note}>{preview ? "Unsaved editor preview" : sourceLabel}{projection?.source.budget_revision != null ? ` · budget revision ${projection.source.budget_revision}` : ""}</p></div>{projection ? <p className={styles.note}>{projection.basis === "pro_rata_illustration" ? "Illustrated pro-rata stake" : "Full offering investor capital"}: {ready ? returnMoney(projection.investment_amount, currency) : "Updating illustration…"}</p> : null}</header>
    {preview ? <p className={styles.notice}>These working figures may include unsaved loan or fee changes. Saving remains a separate action in the editor.</p> : null}
    {stale ? <p className={styles.notice}>The saved offering may need an update. This view is an illustration of the saved source, not new or realized collections.</p> : null}
    {error ? <div className={styles.notice} role="alert"><p>{error}</p><button type="button" onClick={() => void execute({ exit_month: selectedMonth > 0 ? selectedMonth : initialExitMonth, investment_amount: validAmount ? amount : null }, true)}>{sourceChanged ? "Reload current projection" : "Retry projection"}</button></div> : null}
    <div className={styles.controls} aria-label="Illustration amount"><button type="button" aria-pressed={!stake} onClick={() => { if (stake) notifyProjection(null); setStake(false); }}>Full offering</button><button type="button" aria-pressed={stake} onClick={() => { if (!stake) notifyProjection(null); setStake(true); }}>Illustrated investment</button>{stake ? <label className={styles.slider}>Investment amount{currency ? `, ${currency}` : " · currency not confirmed"}<input aria-label="Illustrated investment amount" type="number" min="0" step="any" value={stakeText} aria-invalid={!validAmount || undefined} onChange={event => { notifyProjection(null); setStakeText(event.target.value); }} /></label> : null}</div>
    {stake && !validAmount ? <p className={styles.notice}>Enter a positive illustrated amount up to the offering’s investor capital. This does not place an investment.</p> : null}
    <div className={styles.controls} aria-label="Return scenario"><button type="button" aria-pressed={mode === "holding"} onClick={() => setMode("holding")}>Scheduled holding</button><button type="button" aria-pressed={mode === "payoff"} onClick={() => { setMode("payoff"); setMonth(current => current <= 0 ? selectReturnMonth(holding.filter(point => point.month > 0), initialMonth)?.month ?? initialMonth : current); }}>Full payoff at selected month</button></div>
    <div className={styles.controls} aria-label="Chart measure"><button type="button" aria-pressed={!cash} onClick={() => setCash(false)}>Cumulative net profit</button><button type="button" aria-pressed={cash} onClick={() => setCash(true)}>Cash balance after initial outlay</button></div>
    {pending === "initial" || !ready ? <div className={styles.placeholder}>{pending ? "Loading the server-calculated illustration…" : "A matching confirmed projection is not available yet."}</div> : mode === "payoff" && projection?.payoff_curve_status !== "complete" ? <div className={styles.notice}>Payoff results are calculated for the selected month. Choose a month below; no other exit values are estimated.</div> : <Chart points={plotPoints} selectedMonth={selectedMonth} onSelect={selectMonth} currency={currency} label={cash ? "Cash balance after initial outlay" : mode === "payoff" ? "Net profit if fully repaid" : "Cumulative net profit"} cash={cash} hoverDetails={hoverDetails} />}
    {choices.length ? <>
      <div className={styles.quick} aria-label="Select return month">{[6, 7, 8, 9].filter(value => choices.some(point => point.month === value)).map(value => <button type="button" key={value} aria-pressed={selectedMonth === value} onClick={() => selectMonth(value)}>Month {value}</button>)}<button type="button" aria-pressed={selectedMonth === choices.at(-1)?.month} onClick={() => selectMonth(choices.at(-1)!.month)}>Full term · month {choices.at(-1)?.month}</button></div>
      <label className={styles.slider}>Selected month · {selectedMonth} after funding<input type="range" min="0" max={choices.length - 1} step="1" value={choiceIndex} aria-label="Selected return month" aria-valuetext={`Month ${selectedMonth} after funding`} onChange={event => selectMonth(choices[Number(event.target.value)].month)} /></label>
    </> : null}
    {ready && projection?.full_term ? <p className={styles.notice}>Full-term comparison · month {projection.full_term.payoff_month ?? projection.full_term.month}: <strong className={styles[returnTone(projection.full_term.net_income)]}>{returnMoney(projection.full_term.net_income, currency)}</strong> NET profit · {returnPercent(projection.full_term.net_roi_pct)} cumulative ROI.</p> : null}
    <article className={styles.selected} aria-label={`Selected month ${selectedMonth} returns`}>
      <header className={styles.selectedHeader}><h4>{mode === "payoff" ? "Full payoff" : "Scheduled holding"} · Month {selectedMonth}</h4><span className={styles.note}>{mode === "payoff" && pending === "exit" ? "Calculating this payoff…" : "After funding"}</span></header>
      <div className={styles.readouts}><div className={styles.readout}><small>{mode === "payoff" ? "Net profit if fully repaid" : "Net profit earned to date"}</small><strong className={styles[returnTone(net)]}>{returnMoney(net, currency)}</strong><span>NET ROI over this period: {returnPercent(roi)}</span></div><div className={styles.readout}><small>Cash balance after initial outlay</small><strong>{returnMoney(cashBalance, currency)}</strong><span>Cash received less initial outlay. Outstanding principal and reserve assets are separate.</span></div><div className={styles.readout}><small>{mode === "payoff" ? "Principal returned at payoff" : "Principal returned to date"}</small><strong>{returnMoney(mode === "payoff" ? exitReady ? exit?.principal_returned : null : ready ? row?.cumulative_principal_returned : null, currency)}</strong><span>Returned capital is not profit.</span></div></div>
      {mode === "holding" ? <><h5 className={styles.subheading}>This month</h5><dl className={styles.metrics}><Metric label="Interest received" value={ready ? row?.interest : null} currency={currency} /><Metric label="Investor fees / deductions" value={ready ? row?.fees : null} currency={currency} /><Metric label="Principal returned" value={ready ? row?.principal_returned : null} currency={currency} /><Metric label="Reserve released" value={ready ? row?.reserve_release : null} currency={currency} /><Metric label="Net cash distribution" value={ready ? row?.net_distribution : null} currency={currency} /><Metric label="Outstanding principal" value={ready ? row?.outstanding_principal : null} currency={currency} /></dl><h5 className={styles.subheading}>From funding through this month</h5><dl className={styles.metrics}><Metric label="Interest received to date" value={ready ? row?.cumulative_interest : null} currency={currency} /><Metric label="Investor fees to date" value={ready ? row?.cumulative_fees : null} currency={currency} /><Metric label="Initial investor outlay" value={ready ? projection?.initial_outlay : null} currency={currency} /></dl></> : <dl className={styles.metrics}><Metric label="Gross interest through payoff" value={exitReady ? exit?.gross_interest : null} currency={currency} /><Metric label="Investor fees / deductions" value={exitReady ? exit?.total_fees : null} currency={currency} /><Metric label="Minimum-interest charge included" value={exitReady ? exit?.minimum_interest_charge : null} currency={currency} /><Metric label="Payoff charge paid to investor" value={exitReady ? exit?.payoff_charge_income : null} currency={currency} /><Metric label="Reserve released" value={exitReady ? exit?.reserve_released : null} currency={currency} /><Metric label="Reserve still held" value={exitReady ? exit?.reserve_held : null} currency={currency} /><Metric label="Net cash received, including principal" value={exitReady ? exit?.net_cash_received : null} currency={currency} /><Metric label="Initial investor outlay" value={exitReady ? exit?.initial_outlay : null} currency={currency} /></dl>}
      {missing.length ? <div className={styles.notice}><strong>Needs confirmation</strong><ul>{missing.map((message, index) => <li key={index}>{returnRequirement(message)}</li>)}</ul>{onReviewAssumptions ? <button type="button" onClick={() => onReviewAssumptions(missing)}>Review fees / payoff assumptions</button> : null}</div> : null}
    </article>
    {holding.length ? <details className={styles.details} open={tableOpen} onToggle={event => setTableOpen(event.currentTarget.open)}><summary>Monthly figures table</summary>{tableOpen ? <MonthlyTable points={holding} selectedMonth={selectedMonth} ready={ready} pending={pending != null} currency={currency} onSelect={selectMonth} /> : null}</details> : null}
    <p className={styles.note}>Scheduled illustration, not realized collections or a market valuation. ROI is cumulative over the selected period, not annualized. Principal and reserve assets are separate from profit; defaults, delays and unrecorded costs can change actual results.</p>
    {projection?.assumptions.length ? <details className={styles.details}><summary>Source and assumptions</summary><p className={styles.note}>{sourceLabel} · {projection.source.kind.replaceAll("_", " ")}{projection.source.terms_version != null ? ` · terms v${projection.source.terms_version}` : ""}. Offering investor capital: {returnMoney(projection.offering_investor_capital, currency)}.</p><ul className={styles.note}>{projection.assumptions.map((note, index) => <li key={index}>{note}</li>)}</ul></details> : null}
  </section>;
}
