"use client";

import { useQuery } from "@tanstack/react-query";
import { Btn, CellChip, Panel, Table, Td, Tr } from "@/components/ds";
import { useAuthedApi, useCurrentUser } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import { useMarketplaceDocumentLink } from "@/hooks/useMarketplaceDocumentLink";
import type { MarketplaceFileDocuments } from "@/lib/marketplaceFileDocuments";
import { investorMoney } from "@/lib/investorEconomics";
import { useState } from "react";
import { MarketplaceDocumentGrants } from "./MarketplaceDocumentGrants";
import layoutStyles from "./MarketplaceEditor.module.css";

const change = (value: number | null) => value == null ? "Not established" : `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;

export function MarketplaceFileInventory({ listingId }: { listingId: string }) {
  const api = useAuthedApi(), links = useMarketplaceDocumentLink(listingId), [error, setError] = useState("");
  const staff = useCurrentUser(), staffId = staff.data?.id ?? null;
  const enabled = staff.authReady !== false && staff.data?.role === Role.SUPER_ADMIN && Boolean(staffId);
  const [grantsOpen, setGrantsOpen] = useState(false);
  const query = useQuery({ queryKey: ["cp-file-documents", listingId, staff.authScope ?? staffId], queryFn: () => api<MarketplaceFileDocuments>(`/capital/admin/listings/${listingId}/file-documents`), enabled, retry: false });
  const data = enabled ? query.data : undefined;
  return <Panel title="File document cockpit" sub="Documents on the financing file are separate from offering PDFs. Investors receive source documents only after explicit engagement approval.">
    {!enabled || query.isPending ? <p className="sub">Loading file inventory and aggregate summaries…</p> : query.isError ? <div role="alert">The file inventory could not be loaded. <Btn size="sm" onClick={() => void query.refetch()}>Retry file inventory</Btn></div> : data ? <div className={`grid g10 ${layoutStyles.stack}`}>
      <div className="row"><CellChip tone="acc">Staff preview</CellChip><span className="sub">{data.groups.reduce((sum, group) => sum + group.file_count, 0)} source files on file · original documents remain controlled separately from the listing package.</span></div>
      {data.groups.length ? <Table caption="Source document inventory" cols={[{ label: "Category" }, { label: "Year" }, { label: "On file", align: "r" }, { label: "Eligible for approval", align: "r" }]}>{data.groups.map((group, index) => <Tr key={`${group.category}:${group.year}:${index}`}><Td>{group.label}</Td><Td>{group.year ?? "Period not established"}</Td><Td align="r">{group.file_count}</Td><Td align="r">{group.releasable_count}</Td></Tr>)}</Table> : <p className="sub">No eligible source-document inventory is recorded for this listing.</p>}
      {data.summaries.bank_activity.length ? <details><summary>Aggregate bank activity · {data.summaries.bank_activity.length} months</summary><Table caption="Aggregate bank activity" cols={[{ label: "Month" }, { label: "Deposits", align: "r" }, { label: "Withdrawals", align: "r" }, { label: "Net", align: "r" }]}>{data.summaries.bank_activity.map((row, index) => <Tr key={`${row.month}:${index}`}><Td>{row.month}</Td><Td align="r">{investorMoney(row.deposits, row.currency)}</Td><Td align="r">{investorMoney(row.withdrawals, row.currency)}</Td><Td align="r">{investorMoney(row.net, row.currency)}</Td></Tr>)}</Table><p className="sub">Period totals only. Transaction details, account identifiers and counterparties are not shown here.</p></details> : <p className="sub">Aggregate bank activity has not been supplied.</p>}
      {data.summaries.tax_years.length ? <details><summary>Year-over-year business tax summary</summary><Table caption="Business tax year comparison" cols={[{ label: "Year" }, { label: "Gross receipts", align: "r" }, { label: "Income", align: "r" }, { label: "Deductions", align: "r" }, { label: "Receipts change", align: "r" }, { label: "Income change", align: "r" }]}>{data.summaries.tax_years.map(row => <Tr key={row.year}><Td>{row.year}</Td><Td align="r">{investorMoney(row.gross_receipts, row.currency)}</Td><Td align="r">{investorMoney(row.income, row.currency)}</Td><Td align="r">{investorMoney(row.total_deductions, row.currency)}</Td><Td align="r">{change(row.gross_receipts_change_pct)}</Td><Td align="r">{change(row.income_change_pct)}</Td></Tr>)}</Table></details> : <p className="sub">A comparable business-tax summary has not been supplied.</p>}
      <details><summary>Staff source-document preview · {data.originals.length}</summary>{data.originals.length ? <Table caption="Original file documents — staff only" cols={[{ label: "Source document" }, { label: "Period / version" }, { label: "Release eligibility" }, { label: "Actions" }]}>{data.originals.map(row => <Tr key={row.file_id}><Td>{row.file_name}</Td><Td>{row.year ?? "Year not established"} · v{row.version}</Td><Td>{row.releasable ? "Eligible for explicit approval" : "Not eligible for release"}</Td><Td><div className="row">{[false, true].map(download => <Btn size="sm" key={String(download)} disabled={links.busy || row.previewable === false} onClick={() => { setError(""); void links.open(`/capital/admin/listings/${listingId}/file-documents/${row.file_id}/url?download=${download}`).catch(reason => setError(reason instanceof Error ? reason.message : "The source document could not be opened.")); }}>{download ? "Download" : "View"}</Btn>)}</div></Td></Tr>)}</Table> : <p className="sub">No source files available for staff preview.</p>}</details>
      {error ? <p role="alert">{error}</p> : null}
      <details onToggle={event => setGrantsOpen(event.currentTarget.open)}><summary>Engagement approval and investor access</summary>{grantsOpen ? <MarketplaceDocumentGrants key={listingId} listingId={listingId} /> : null}</details>
    </div> : null}
  </Panel>;
}
