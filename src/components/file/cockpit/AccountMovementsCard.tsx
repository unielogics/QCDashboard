"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Btn, CellChip } from "@/components/ds";
import {
  accountMovementView, linkMovements, movementCurrencies, movementLayout, movementLinkPath,
  movementMoney, movementStatusLabel, resolveMovementScope, uniqueMovementEvidence,
  type AccountMovementLink, type AccountMovements, type MovementEvidence,
  type MovementNodeView, type MovementScope,
} from "@/lib/accountMovements";
import { monthShort } from "@/lib/financialCockpit";
import { ChartCard, type ChartTable } from "./CockpitCharts";
import styles from "./AccountMovementsCard.module.css";

type Selection = { kind: "account"; key: string } | { kind: "link" | "movement"; id: string } | null;
type Props = {
  data: AccountMovements | null | undefined;
  accountKey?: string | null;
  onOpenEvidence?: (fileId?: string, page?: number | null) => void;
};

const reasonLabel = (value: string) => value.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase());
const coverageLabel = (value: string | undefined) => value === "complete" ? "Detail available" : value === "partial" ? "Incomplete detail" : "Detail missing";
const accountShort = (label: string) => {
  const suffix = label.match(/[•*x]{2,}\s*(\d{4})\b/i);
  return suffix ? `••${suffix[1]}` : label;
};

function EvidenceRows({ rows, onOpenEvidence }: { rows: MovementEvidence[]; onOpenEvidence?: Props["onOpenEvidence"] }) {
  if (!rows.length) return <p className={styles.note}>This preview has no source transactions. Open the evidence room to inspect the original statements.</p>;
  return <ul className={styles.evidence} aria-label="Source transactions">
    {rows.slice(0, 6).map((row, index) => <li key={`${row.file_id}-${row.row}-${index}`}>
      <div className={styles.evidenceTop}><span>{row.date || "Date unknown"} · {row.direction === "in" ? "Credit" : row.direction === "out" ? "Debit" : "Direction unknown"}</span><strong>{movementMoney(row.amount, row.currency ?? null)}</strong></div>
      <p>{row.description || "No transaction description"}</p>
      <button type="button" className={styles.source} onClick={() => onOpenEvidence?.(row.file_id, row.page)} disabled={!onOpenEvidence}>
        {row.file_name || "Source statement"}{row.page != null ? ` · page ${row.page}` : ""}{row.row != null ? ` · row ${row.row}` : ""}
      </button>
    </li>)}
  </ul>;
}

function AccountFacts({ node, currency }: { node: MovementNodeView; currency: string | null }) {
  return <div className={styles.nodeFacts}>
    <span><small>Received</small><b>{movementMoney(node.facts?.internal_in, currency)}</b></span>
    <span><small>Sent</small><b>{movementMoney(node.facts?.internal_out, currency)}</b></span>
    <span><small>Transfer net</small><b>{movementMoney(node.facts?.internal_net, currency)}</b></span>
  </div>;
}

export function AccountMovementsCard({ data, accountKey, onOpenEvidence }: Props) {
  const id = useId().replace(/:/g, "");
  const [periodChoice, setPeriod] = useState("");
  const [scope, setScope] = useState<MovementScope>(accountKey || "counted");
  const [currencyChoice, setCurrency] = useState<string | null | undefined>(undefined);
  const [selection, setSelection] = useState<Selection>(null);
  const inspectorHeading = useRef<HTMLHeadingElement>(null);
  const inspectorTrigger = useRef<HTMLElement | SVGElement | null>(null);
  useEffect(() => { setScope(accountKey || "counted"); setSelection(null); }, [accountKey]);
  useEffect(() => { if (selection) inspectorHeading.current?.focus(); }, [selection]);
  const periods = useMemo(() => [...new Set(data?.periods ?? [])].sort().reverse(), [data?.periods]);
  const period = periods.includes(periodChoice) ? periodChoice : periods[0] ?? "";
  const currencies = useMemo(() => data ? movementCurrencies(data, period) : [], [data, period]);
  const currency = currencyChoice !== undefined && currencies.includes(currencyChoice) ? currencyChoice : currencies[0] ?? null;
  const currentScope = data ? resolveMovementScope(data, scope) : scope;
  const view = useMemo(() => data ? accountMovementView(data, period, currentScope, currency) : null, [data, period, currentScope, currency]);
  const layout = useMemo(() => movementLayout(view?.nodes.map((node) => node.key) ?? []), [view?.nodes]);
  const positions = new Map(layout.positions.map((node) => [node.key, node]));
  const labels = new Map(data?.nodes.map((node) => [node.key, node.label]) ?? []);
  const name = (key: string | null) => key ? labels.get(key) ?? "Unidentified account" : "Unidentified account";
  const matchedLinks = view?.links.filter((link) => link.status === "supported") ?? [];
  const matchedCount = view?.matchedAmount != null ? matchedLinks.reduce((count, link) => count + link.transaction_count, 0) : null;
  const selectedNode = selection?.kind === "account" ? view?.nodes.find((node) => node.key === selection.key) : undefined;
  const selectedLink = selection?.kind === "link" ? view?.links.find((link) => link.id === selection.id) : undefined;
  const selectedMovement = selection?.kind === "movement" ? view?.movements.find((movement) => movement.id === selection.id) : undefined;
  const detailMovements = selectedLink ? linkMovements(selectedLink, data?.movements ?? []) : selectedMovement ? [selectedMovement] : [];
  const evidence = uniqueMovementEvidence(detailMovements);
  const unmatched = view?.movements.filter((movement) => movement.status === "unmatched" || movement.status === "review" && (!movement.from_account || !movement.to_account)) ?? [];
  const resetSelection = () => setSelection(null);
  const select = (next: Selection) => {
    inspectorTrigger.current = document.activeElement instanceof HTMLElement || document.activeElement instanceof SVGElement ? document.activeElement : null;
    setSelection(next);
  };
  const closeInspector = () => { setSelection(null); if (inspectorTrigger.current?.isConnected) inspectorTrigger.current.focus(); };
  const chooseLink = (link: AccountMovementLink) => select({ kind: "link", id: link.id });
  const chooseNode = (node: MovementNodeView) => select({ kind: "account", key: node.key });
  const graphDescription = `${view?.scopedAccounts ?? 0} selected accounts. Solid arrows are matched transaction pairs; dashed arrows need review. Select an account or arrow for its evidence.`;

  const table: ChartTable | null = view?.nodes.length ? {
    caption: `Account movements for ${monthShort(period)}. Account rows show closing balances; connection rows show transfer amounts.`,
    cols: ["Account / connection", "Evidence", "Closing / amount", "Matched in", "Matched out", "Net influence", "Details"],
    rows: [
      ...view.nodes.map((node) => ({ key: `node:${node.key}`, muted: !node.inScope,
        cells: [<span key="name">{node.label}{!node.inScope ? " · outside selected scope" : ""}</span>, coverageLabel(node.facts?.coverage_status),
          movementMoney(node.facts?.ending_balance, currency), movementMoney(node.facts?.internal_in, currency),
          movementMoney(node.facts?.internal_out, currency), movementMoney(node.facts?.internal_net, currency),
          <Btn key="inspect" size="sm" onClick={() => chooseNode(node)} aria-label={`Inspect ${node.label}`}>Inspect</Btn>] })),
      ...view.links.map((link) => ({ key: `link:${link.id}`, cells: [`${name(link.from_account)} → ${name(link.to_account)}`,
        movementStatusLabel(link.status), movementMoney(link.amount, link.currency), "—", "—", "—",
        <Btn key="inspect" size="sm" onClick={() => chooseLink(link)} aria-label={`Inspect ${name(link.from_account)} to ${name(link.to_account)}`}>Inspect</Btn>] })),
      ...unmatched.slice(0, 6).map((movement) => ({ key: `movement:${movement.id}`, cells: [`${name(movement.account_key)} · ${movement.direction === "in" ? "credit" : movement.direction === "out" ? "debit" : "movement"}`,
        movementStatusLabel(movement.status), movementMoney(movement.amount, movement.currency), "—", "—", "—",
        <Btn key="inspect" size="sm" onClick={() => select({ kind: "movement", id: movement.id })}>Inspect</Btn>] })),
    ],
  } : null;

  const inspector = selectedNode || selectedLink || selectedMovement ? <section className={styles.inspector} aria-labelledby={`${id}-inspector`}>
    <div className={styles.inspectorHead}>
      <div><h5 id={`${id}-inspector`} ref={inspectorHeading} tabIndex={-1}>{selectedNode ? selectedNode.label : `${name(selectedLink?.from_account ?? selectedMovement?.from_account ?? null)} → ${name(selectedLink?.to_account ?? selectedMovement?.to_account ?? null)}`}</h5>
        <span>{selectedNode ? "Statement balance bridge" : movementStatusLabel((selectedLink ?? selectedMovement)!.status)}</span></div>
      <Btn size="sm" onClick={closeInspector} aria-label="Close account movement inspector">Close</Btn>
    </div>
    {selectedNode ? <>
      {selectedNode.facts?.balance_period_start || selectedNode.facts?.balance_period_end ? <p className={styles.note}>Statement period {selectedNode.facts.balance_period_start || "start unknown"} to {selectedNode.facts.balance_period_end || "end unknown"}.</p> : null}
      <dl className={styles.bridge}>
        {([
          ["Beginning balance", selectedNode.facts?.beginning_balance],
          ["Read credits", selectedNode.facts?.observed_in], ["Read debits", selectedNode.facts?.observed_out],
          ["Change explained by read transactions", selectedNode.facts?.explained_change],
          ["Closing balance", selectedNode.facts?.ending_balance],
          ["Change in statement balances", selectedNode.facts?.observed_balance_change],
          ["Unexplained difference", selectedNode.facts?.unexplained_change],
        ] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{movementMoney(value, currency)}</dd></div>)}
      </dl>
      <p className={styles.note}>{coverageLabel(selectedNode.facts?.coverage_status)}. This bridge uses statement balances and read transactions; it does not estimate daily balances.</p>
      {selectedNode.facts?.reason_codes.length ? <ul className={styles.reasons}>{selectedNode.facts.reason_codes.map((reason) => <li key={reason}>{reasonLabel(reason)}</li>)}</ul> : null}
      <div className={styles.sources}>{selectedNode.facts?.source_file_ids.map((fileId, index) => <button key={fileId} type="button" className={styles.source} disabled={!onOpenEvidence} onClick={() => onOpenEvidence?.(fileId)}>Open source statement {index + 1}</button>)}</div>
      <EvidenceRows rows={uniqueMovementEvidence((view?.movements ?? []).filter((movement) => [movement.account_key, movement.from_account, movement.to_account].includes(selectedNode.key)))} onOpenEvidence={onOpenEvidence} />
    </> : <>
      <div className={styles.detailAmount}><strong>{movementMoney((selectedLink ?? selectedMovement)?.amount, currency)}</strong><span>{selectedLink ? `${selectedLink.transaction_count} transaction pair${selectedLink.transaction_count === 1 ? "" : "s"}` : "Single movement"}</span></div>
      {detailMovements.some((movement) => (movement.periods?.length ?? 0) > 1) ? <p className={styles.note}>This pair crosses statement periods. Each account’s balance influence uses its own posting date.</p> : null}
      {detailMovements.some((movement) => movement.status !== "supported") ? <p className={styles.note}>This relationship needs review. It is excluded from matched transfer totals and balance influence.</p> : <p className={styles.note}>Matched using the source transactions below. Moving money between accounts does not create business income.</p>}
      <ul className={styles.reasons}>{[...new Set(detailMovements.flatMap((movement) => movement.reason_codes))].map((reason) => <li key={reason}>{reasonLabel(reason)}</li>)}</ul>
      <EvidenceRows rows={evidence} onOpenEvidence={onOpenEvidence} />
      {detailMovements.some((movement) => movement.lag_days != null && movement.lag_days > 0) ? <p className={styles.note}>Debit and credit dates differ; the source dates are shown above.</p> : null}
    </>}
    <p className={styles.preview}>Evidence preview: up to six source transactions. Open a source statement for the full record.</p>
  </section> : null;

  return <div className={styles.root}>
    <ChartCard title="Movement between accounts" wide table={table}
      sub="Follow money between the business’s accounts and inspect how it affects each account’s balance."
      chart={<>
        {view?.nodes.length ? <>
          <div className={styles.flowSummary}>
            <div><span className={styles.eyebrow}>Moved between accounts · {monthShort(period)}</span><strong>{movementMoney(view.matchedAmount, currency)}</strong></div>
            <div className={styles.flowSummaryContext}><b>{matchedCount == null ? "Transfer detail needed" : `${matchedCount} matched transfer${matchedCount === 1 ? "" : "s"}`}</b><span>Each transfer counted once · select a route for dated transactions</span></div>
          </div>
          <div className={styles.graphScroll} tabIndex={0} role="region" aria-label="Account relationship graph, scroll horizontally if needed">
            <div className={styles.graph} style={{ width: layout.width, height: layout.height }}>
              <svg className={styles.edges} viewBox={`0 0 ${layout.width} ${layout.height}`} aria-label={graphDescription} role="group">
                <defs><marker id={`${id}-matched`} viewBox="0 0 12 12" refX="11" refY="6" markerWidth="18" markerHeight="18" markerUnits="userSpaceOnUse" orient="auto"><path d="M 0 0 L 12 6 L 0 12 Z" fill="var(--accent)" /></marker>
                  <marker id={`${id}-review`} viewBox="0 0 12 12" refX="11" refY="6" markerWidth="16" markerHeight="16" markerUnits="userSpaceOnUse" orient="auto"><path d="M 0 0 L 12 6 L 0 12 Z" fill="var(--fc-series-2, var(--warn))" /></marker></defs>
                {view.links.map((link) => {
                  const from = positions.get(link.from_account), to = positions.get(link.to_account);
                  if (!from || !to) return null;
                  const path = movementLinkPath(from, to, link.status === "review" ? 150 : 76);
                  const active = selectedLink?.id === link.id;
                  const description = `${name(link.from_account)} to ${name(link.to_account)}: ${movementMoney(link.amount, currency)}, ${link.transaction_count} transfer${link.transaction_count === 1 ? "" : "s"}, ${movementStatusLabel(link.status)}`;
                  return <g key={link.id} className={`${styles.connection} ${link.status === "review" ? styles.possible : ""} ${active ? styles.activeConnection : ""}`}
                    tabIndex={0} role="button" aria-pressed={active} aria-label={description}
                    onClick={() => chooseLink(link)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); chooseLink(link); } }}>
                    <title>{description}</title>
                    <path className={styles.line} d={path.path} markerEnd={`url(#${id}-${link.status === "supported" ? "matched" : "review"})`} />
                    <path className={styles.linkHit} d={path.path} />
                    <g className={styles.linkLabel} transform={`translate(${path.x} ${path.y})`} aria-hidden="true"><rect x="-112" y="-34" width="224" height="68" rx="12" />
                      <text textAnchor="middle" y="-12" className={styles.routeCaption}>{accountShort(name(link.from_account))} → {accountShort(name(link.to_account))}</text>
                      <text textAnchor="middle" y="10" className={styles.routeAmount}>{movementMoney(link.amount, currency)}</text>
                      <text textAnchor="middle" y="26" className={styles.routeCount}>{link.transaction_count} transfer{link.transaction_count === 1 ? "" : "s"}{link.status === "review" ? " · needs review" : " · matched"}</text>
                    </g>
                  </g>;
                })}
              </svg>
              {view.nodes.map((node) => {
                const position = positions.get(node.key)!;
                return <button type="button" key={node.key} className={`${styles.node} ${!node.inScope ? styles.boundary : ""} ${selectedNode?.key === node.key ? styles.activeNode : ""}`}
                  style={{ left: position.x, top: position.y }} onClick={() => chooseNode(node)} aria-pressed={selectedNode?.key === node.key}
                  aria-label={`${node.label}. Closing balance ${movementMoney(node.facts?.ending_balance, currency)}. ${coverageLabel(node.facts?.coverage_status)}. Inspect balance and evidence.`}>
                  <span className={styles.nodeTitle}>{node.label}</span><small className={styles.balanceLabel}>Closing balance</small><span className={styles.nodeBalance}>{movementMoney(node.facts?.ending_balance, currency)}</span>
                  <AccountFacts node={node} currency={currency} />
                  <span className={styles.nodeCoverage}>{!node.inScope ? "Outside selected scope · " : !node.counted ? "Not counted · " : ""}{coverageLabel(node.facts?.coverage_status)}</span>
                </button>;
              })}
            </div>
          </div>
          <div className={styles.mobileList} aria-label="Accounts and directed movements">
            {view.nodes.map((node) => <button key={node.key} type="button" className={styles.mobileAccount} onClick={() => chooseNode(node)}><b>{node.label}</b><span>Closing {movementMoney(node.facts?.ending_balance, currency)}</span><AccountFacts node={node} currency={currency} /><small>{coverageLabel(node.facts?.coverage_status)}{!node.inScope ? " · outside selected scope" : ""}</small></button>)}
          </div>
          {view.links.length ? <div className={styles.routes} aria-label="Transfer routes">
            {view.links.map((link) => <button type="button" key={link.id} className={`${styles.route} ${link.status === "review" ? styles.reviewRoute : ""}`} onClick={() => chooseLink(link)} aria-pressed={selectedLink?.id === link.id}>
              <span className={styles.routeAccount}><small>From</small><b>{name(link.from_account)}</b></span>
              <span className={styles.routeFlow}><strong>{movementMoney(link.amount, currency)}</strong><span className={styles.directionArrow} aria-hidden="true" /><small>{link.transaction_count} transfer{link.transaction_count === 1 ? "" : "s"} · {link.status === "supported" ? "matched" : "needs review"}</small></span>
              <span className={styles.routeAccount}><small>To</small><b>{name(link.to_account)}</b></span>
              <span className={styles.routeInspect}>View transactions <span aria-hidden="true">↗</span></span>
            </button>)}
          </div> : <div className={styles.noRoutes}>{view.matchedAmount == null ? "Transfer directions will appear when dated statement transactions are available." : "No matched transfers between these accounts in this period."}</div>}
        </> : <div className="fc-empty">{currentScope === "counted" && data?.nodes.length ? "No counted accounts have evidence for this period. Choose all accounts to inspect the available evidence." : "No account-level evidence is available for this period."}</div>}
        <div className={styles.legend}><span><i /> Matched pair</span><span><i className={styles.dashed} /> Possible match · excluded from totals</span><span>Arrows show direction. Select an account or connection to inspect it.</span></div>
      </>}
      actions={data?.periods.length ? <div className={styles.filters}>
        <label>Period<select value={period} onChange={(event) => { setPeriod(event.target.value); resetSelection(); }} aria-label="Account movement period">{periods.map((value) => <option key={value} value={value}>{monthShort(value)}</option>)}</select></label>
        <label>Accounts<select value={currentScope} onChange={(event) => { setScope(event.target.value); resetSelection(); }} aria-label="Account movement account scope"><option value="counted">Counted accounts</option><option value="all">All accounts</option>{data.nodes.map((node) => <option key={node.key} value={node.key}>{node.label}{!node.counted ? " · not counted" : ""}</option>)}</select></label>
        {currencies.length > 1 ? <label>Currency<select value={currency ?? "unknown"} onChange={(event) => { setCurrency(event.target.value === "unknown" ? null : event.target.value); resetSelection(); }} aria-label="Account movement currency">{currencies.map((value) => <option key={value ?? "unknown"} value={value ?? "unknown"}>{value || "Unspecified"}</option>)}</select></label> : null}
      </div> : null} />
    <div className={styles.support}>
      {data && view ? <div className={styles.summary}><CellChip tone="acc">Matched evidence {movementMoney(view.matchedAmount, currency)}</CellChip><CellChip tone="mut">{view.scopedAccounts} account{view.scopedAccounts === 1 ? "" : "s"} in scope</CellChip>
        {view.links.some((link) => link.status === "review") ? <CellChip tone="warn">Possible {movementMoney(view.possibleAmount, currency)}</CellChip> : null}
        {data.coverage.files_missing_detail.length ? <CellChip tone="warn">{data.coverage.files_missing_detail.length} source file{data.coverage.files_missing_detail.length === 1 ? "" : "s"} without transaction detail</CellChip> : null}
        {data.coverage.truncated ? <CellChip tone="warn">Evidence coverage is limited</CellChip> : null}</div> : null}
      {!data || data.status === "no_transaction_evidence" ? <p className={styles.note}>Statement transactions are needed to connect accounts. Similar recurring totals alone do not establish a transfer.{onOpenEvidence ? <button type="button" className={styles.source} onClick={() => onOpenEvidence()}>Open the evidence room</button> : null}</p> : null}
      {view?.incompleteCoverage && data?.status !== "no_transaction_evidence" ? <p className={styles.note}>Transaction coverage is incomplete for the selected scope. Matched amounts show supported pairs in the available evidence; they are not a complete account history.</p> : null}
      {unmatched.length ? <div className={styles.unmatched}><span>Unmatched evidence preview</span>{unmatched.slice(0, 6).map((movement) => <button type="button" key={movement.id} onClick={() => select({ kind: "movement", id: movement.id })}>{name(movement.account_key)} · {movementMoney(movement.amount, currency)} <small>{movementStatusLabel(movement.status)}</small></button>)}</div> : null}
      {data && (data.pagination.next_offset != null || unmatched.length > 6) ? <p className={styles.preview}>Showing a bounded evidence preview; graph totals use the available movement analysis. Open source statements for complete activity.</p> : null}
      {data?.notes.length ? <details className={styles.evidenceNotes}><summary>About this evidence</summary>{data.notes.map((note, index) => <p key={index} className={styles.note}>{note}</p>)}</details> : null}
      {inspector}
    </div>
  </div>;
}
