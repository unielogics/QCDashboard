"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Btn, CellChip, Empty, Input, Loading, PageHeader, Select } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { usePaymentsQueue } from "@/hooks/usePayments";
import { paymentMoney, type PaymentPlanKind, type PaymentsQueueFilters, type PaymentsQueueItem } from "@/lib/payments";

const ORIGINATION_STATUS_OPTIONS = [
  ["all", "All statuses"],
  ["awaiting_authorization", "Awaiting client authorization"],
  ["ready_for_funding_confirmation", "Ready for funding confirmation"],
  ["ready_for_release", "Ready for staff release"],
  ["processing", "Processing"],
  ["funds_available", "Funds available"],
  ["externally_reconciled", "External fees reconciled"],
  ["action_required", "Returned / action required"],
  ["refunded", "Refunded"],
  ["bank_direct_outstanding", "Bank-direct receipt outstanding"],
] as const;

const PRIVATE_STATUS_OPTIONS = [
  ["all", "All statuses"],
  ["draft", "Draft"],
  ["awaiting_authorization", "Awaiting client authorization"],
  ["authorized", "Authorized"],
  ["processing", "Processing"],
  ["action_required", "Returned / action required"],
  ["active", "Active"],
  ["paused", "Paused"],
  ["completed", "Completed"],
  ["cancelled", "Cancelled"],
  ["superseded", "Replaced"],
] as const;

const PAGE_SIZE = 50;

export default function PaymentsPage() {
  const [queue, setQueue] = useState<"origination_fees" | "private_funding">("origination_fees");
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [ownerId, setOwnerId] = useState("all");
  const [page, setPage] = useState(1);
  const statusOptions = queue === "origination_fees" ? ORIGINATION_STATUS_OPTIONS : PRIVATE_STATUS_OPTIONS;
  const filters: PaymentsQueueFilters = { queue, status, q: submittedQuery, owner_id: ownerId === "all" ? undefined : ownerId, page, page_size: PAGE_SIZE };
  const result = usePaymentsQueue(filters);
  // Owner discovery is intentionally limited to the currently loaded queue
  // page. Once chosen, owner_id is applied by the server across the full queue.
  const ownerOptions = useMemo(() => {
    const owners = new Map<string, string>();
    for (const item of result.data?.items ?? []) {
      if (item.owner_id) owners.set(item.owner_id, item.owner_name || "Assigned owner");
    }
    return [...owners].sort((left, right) => left[1].localeCompare(right[1]));
  }, [result.data?.items]);
  const totalPages = Math.max(1, Math.ceil((result.data?.total ?? 0) / PAGE_SIZE));

  // A record can leave the selected queue while this page is open. Keep the
  // operator on the last valid page after that server-side transition.
  useEffect(() => {
    if (result.data && page > totalPages) setPage(totalPages);
  }, [page, result.data, totalPages]);

  function submit(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setSubmittedQuery(query.trim());
  }

  function changeQueue(next: "origination_fees" | "private_funding") {
    setQueue(next);
    setStatus("all");
    setOwnerId("all");
    setPage(1);
  }

  return (
    <div className="payments-page">
      <PageHeader
        eyebrow="Money operations"
        title="Payments"
        lede="Origination-fee ACH first; privately funded fixed schedules are kept separate."
        actions={<Btn onClick={() => result.refetch()} disabled={result.isFetching}><Icon name="refresh" size={14} />{result.isFetching ? "Refreshing…" : "Refresh"}</Btn>}
      />

      {result.data ? <OperationsMetrics totals={result.data.totals} /> : null}

      <div className="payments-queue-tabs" role="tablist" aria-label="Payment queues">
        <button type="button" role="tab" aria-selected={queue === "origination_fees"} className={queue === "origination_fees" ? "on" : undefined} onClick={() => changeQueue("origination_fees")}><Icon name="dollar" size={17} /><span><b>Origination fees</b><small>ACH authorization, funding and release</small></span></button>
        <button type="button" role="tab" aria-selected={queue === "private_funding"} className={queue === "private_funding" ? "on" : undefined} onClick={() => changeQueue("private_funding")}><Icon name="cal" size={17} /><span><b>Private-funding schedules</b><small>Fixed business payment schedules only</small></span></button>
      </div>

      <form className="payments-filterbar" onSubmit={submit}>
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search client, business, file, reference, or owner" aria-label="Search payments" />
        <Select value={ownerId} onChange={(event) => { setOwnerId(event.target.value); setPage(1); }} aria-label="Payment owner" title="Owner choices are discovered from the loaded results; selection filters the full queue."><option value="all">All owners</option>{ownerOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Select>
        <Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} aria-label="Payment status">{statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
        <Btn variant="pri" type="submit">Search</Btn>
      </form>

      {result.isLoading ? <Loading>Loading payment operations…</Loading> : result.isError ? (
        <Empty icon="alert" title="Payments queue could not be loaded" action={<Btn onClick={() => result.refetch()}>Try again</Btn>}>No payment action was changed.</Empty>
      ) : result.data && result.data.items.length ? (
        <>
          <div className="payments-operations-table" role="table" aria-label={queue === "origination_fees" ? "Origination fee operations" : "Private funding payment operations"}>
            <div className="payments-operations-head" role="row"><span>Client / file</span><span>Owner</span><span>Amount</span><span>Status</span><span>Next action</span><span>Due</span><span aria-label="Open" /></div>
            {result.data.items.map((item) => <PaymentQueueRow key={item.id} item={item} />)}
          </div>
          <nav className="tablepager" aria-label="Payments queue pages">
            <span>Page {page} of {totalPages} · {result.data.total} record{result.data.total === 1 ? "" : "s"}</span>
            <div>
              <Btn disabled={page <= 1 || result.isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Btn>
              <Btn disabled={page >= totalPages || result.isFetching} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Next</Btn>
            </div>
          </nav>
        </>
      ) : (
        <Empty icon="dollar" title="No payments match these filters">Change the queue or status, or clear the search.</Empty>
      )}
    </div>
  );
}

function OperationsMetrics({ totals }: { totals: NonNullable<ReturnType<typeof usePaymentsQueue>["data"]>["totals"] }) {
  const metrics = [
    ["Awaiting authorization", totals.awaiting_authorization, "Client action"],
    ["Ready for funding", totals.ready_for_funding_confirmation, "Staff verification"],
    ["Ready to release", totals.ready_for_release, "Final staff action"],
    ["Processing", totals.processing, "Not yet collected"],
    ["Funds available", totals.funds_available, "Collected and available"],
    ["Externally reconciled", totals.externally_reconciled, "Bank/manual fees complete"],
    ["Action required", totals.action_required, "Failed or returned"],
    ["Refunded", totals.refunded, "Refund activity"],
    ["Bank direct outstanding", totals.bank_direct_outstanding, "Awaiting reconciliation"],
    ["Upcoming installments", totals.upcoming_private_installments, "Private funding"],
  ] as const;
  return <section className="payment-operations-metrics" aria-label="Payment operations summary">{metrics.map(([label, count, detail]) => <div key={label}><span>{label}</span><strong>{count}</strong><small>{detail}</small></div>)}</section>;
}

function PaymentQueueRow({ item }: { item: PaymentsQueueItem & { kind: PaymentPlanKind } }) {
  const href = item.loan_id
    ? `/loans/${item.loan_id}?tab=payments`
    : item.intake_id
      ? `/admin/ai-underwriter-leads?lead=${item.intake_id}&view=payments`
      : `/payments?queue=${item.kind === "private_funding" ? "private_funding" : "origination_fees"}`;
  return <div className="payments-operations-row" role="row"><span><b>{item.display_name}</b><small>{item.reference || item.profile_id}</small><CellChip tone="mut">{item.kind === "origination_fee" ? "Origination fee" : "Private schedule"}</CellChip></span><span data-label="Owner">{item.owner_name || "Unassigned"}</span><span data-label="Amount"><b>{paymentMoney(item.amount)}</b><small>{paymentMoney(item.outstanding_amount)} outstanding</small></span><span data-label="Status"><CellChip tone={paymentStatusTone(item.status)}>{humanize(item.status)}</CellChip></span><span data-label="Next action">{item.next_action}</span><span data-label="Due">{dateTimeLabel(item.next_due_at)}</span><span><Link className="btn sm" href={href}>Open <Icon name="arrowR" size={13} /></Link></span></div>;
}

function humanize(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function dateTimeLabel(value: string | null) {
  if (!value) return "—";
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
}
function paymentStatusTone(status: string): "ok" | "bad" | "warn" | "acc" | "mut" { return ["funds_available", "completed", "collected"].includes(status) ? "ok" : ["failed", "returned", "action_required"].includes(status) ? "bad" : status === "ready_for_release" ? "acc" : ["awaiting_authorization", "processing", "pending"].includes(status) ? "warn" : "mut"; }
