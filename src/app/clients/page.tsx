"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSort } from "@/components/design-system/primitives";
import {
  Btn,
  CellChip,
  Input,
  PageHeader,
  Panel,
  Row,
  Seg,
  Table,
  Td,
  Tr,
  cx,
  type ChipTone,
  type Col,
} from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useBrokers, useClientPaymentAuthorizationSummaries, useClients, useCurrentUser, useLoans, useUpdateClient } from "@/hooks/useApi";
import { MultiLoanReassignModal } from "@/components/MultiLoanReassignModal";
import { Role } from "@/lib/enums.generated";
import type { Broker, Client, ClientStage, PaymentAuthorizationClientSummaryRead } from "@/lib/types";
import { QC_FMT } from "@/lib/fmt";
import { AgentLeadModal } from "@/app/pipeline/components/AgentLeadModal";

// Stages-as-filter-chips shown above the table.
type StageFilter = "all" | ClientStage;

const STAGE_CHIPS: { value: StageFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "lead", label: "Leads" },
  { value: "contacted", label: "Nurturing" },
  { value: "verified", label: "Ready" },
  { value: "ready_for_lending", label: "Ready for Lending" },
  { value: "processing", label: "Processing" },
  { value: "funded", label: "Funded" },
  { value: "lost", label: "Lost" },
];

const STAGE_LABEL: Record<ClientStage, string> = {
  lead: "Lead",
  contacted: "Nurturing",
  verified: "Ready",
  ready_for_lending: "Ready",
  processing: "Processing",
  funded: "Funded",
  lost: "Lost",
};

// Colour by lifecycle group: leads/early-funnel = neutral; lending stages =
// petrol/brand; funded = profit-green; lost = muted. Same split the palette
// map carried, now expressed as chip tones.
const STAGE_TONE: Record<ClientStage, ChipTone> = {
  lead: "mut",
  contacted: "warn",
  verified: "pet",
  ready_for_lending: "acc",
  processing: "acc",
  funded: "ok",
  lost: "mut",
};

type ClientCol = Col & { key?: string };

// Internal users (super_admin / loan_exec) see an Agent column they can
// click to assign or reassign the broker on each client. Brokers don't
// see this column — they only own their own clients and don't need to
// reassign anything.
const INTERNAL_COLS: ClientCol[] = [
  { label: "Client",                            key: "name" },
  { label: "Stage",       width: 130,           key: "_stage" },
  { label: "Billing auth", width: 140,          key: "_billing_auth" },
  { label: "Type",        width: 90,            key: "_type" },
  { label: "Agent",       width: 160,           key: "broker_name" },
  { label: "FICO",        width: 70,  align: "r", key: "fico" },
  { label: "Loans",       width: 60,  align: "r", key: "active_loans" },
  { label: "Exposure",    width: 100, align: "r", key: "exposure" },
  { label: "City",        width: 120,           key: "city" },
  { label: "Since",       width: 80,            key: "since" },
];
const BROKER_COLS: ClientCol[] = [
  { label: "Client",                            key: "name" },
  { label: "Stage",       width: 130,           key: "_stage" },
  { label: "Type",        width: 90,            key: "_type" },
  { label: "FICO",        width: 70,  align: "r", key: "fico" },
  { label: "Loans",       width: 60,  align: "r", key: "active_loans" },
  { label: "Exposure",    width: 100, align: "r", key: "exposure" },
  { label: "City",        width: 120,           key: "city" },
  { label: "Since",       width: 80,            key: "since" },
];

// Best-effort stage inference for legacy Client rows that don't yet carry the
// new `stage` field. Once the backend stamps stage on every row this is dead
// code — it just keeps the Clients page meaningful during the migration window.
function inferredStage(c: Client, activeLoans: number): ClientStage {
  if (c.stage) return c.stage;
  if (c.funded_count > 0) return "funded";
  if (activeLoans > 0) return "processing";
  return "lead";
}

// Header cell that carries the sort. `.tbl th` owns the type; this only adds
// the click target and the direction caret.
function SortLabel({
  label,
  colKey,
  sortKey,
  dir,
  onSort,
}: {
  label: ReactNode;
  colKey?: string;
  sortKey: string;
  dir: "asc" | "desc";
  onSort: (key: string) => void;
}) {
  if (!colKey) return <>{label}</>;
  const active = sortKey === colKey;
  // No class and no style on purpose: a bare button inside `.tbl th` inherits
  // the header's type, colour and letter-spacing, so the sort target looks
  // exactly like the label it replaced. The caret carries the active state.
  return (
    <button type="button" onClick={() => onSort(colKey)} aria-label={`Sort by ${String(label)}`}>
      {label}
      {active ? (dir === "asc" ? " ▲" : " ▼") : ""}
    </button>
  );
}

export default function ClientsPage() {
  const { data: user } = useCurrentUser();
  const { data: clients = [] } = useClients();
  const { data: loans = [] } = useLoans();
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");
  const [dealerOnly, setDealerOnly] = useState(false);
  const [intakeOpen, setIntakeOpen] = useState(false);

  const canCreate = user?.role !== Role.CLIENT;
  // Only super_admin / loan_exec see the Agent column + assign picker.
  // Brokers operate within their own scope; clients are read-only.
  const isInternal = user?.role === Role.SUPER_ADMIN || user?.role === Role.LOAN_EXEC;
  const { data: authRows = [] } = useClientPaymentAuthorizationSummaries({ enabled: isInternal });
  const COLS = isInternal ? INTERNAL_COLS : BROKER_COLS;

  const authByClient = useMemo(() => {
    const map = new Map<string, PaymentAuthorizationClientSummaryRead>();
    for (const row of authRows) map.set(row.client_id, row);
    return map;
  }, [authRows]);

  // Compute exposure + active loans per client from the loans list, plus an
  // effective-stage value used for filtering and rendering.
  const enriched = useMemo(() => {
    const activeByClient = new Map<string, number>();
    const exposureByClient = new Map<string, number>();
    for (const l of loans) {
      if (l.stage !== "funded") {
        activeByClient.set(l.client_id, (activeByClient.get(l.client_id) ?? 0) + 1);
        exposureByClient.set(
          l.client_id,
          (exposureByClient.get(l.client_id) ?? 0) + Number(l.amount),
        );
      }
    }
    return clients.map((c) => {
      const active_loans = activeByClient.get(c.id) ?? 0;
      return {
        ...c,
        active_loans,
        exposure: exposureByClient.get(c.id) ?? Number(c.funded_total),
        _stage: inferredStage(c, active_loans),
        _type: c.client_type ?? null,
      };
    });
  }, [clients, loans]);

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { all: enriched.length };
    for (const c of enriched) counts[c._stage] = (counts[c._stage] ?? 0) + 1;
    return counts;
  }, [enriched]);

  const filtered = useMemo(() => {
    let rows = enriched;
    if (stageFilter !== "all") rows = rows.filter((c) => c._stage === stageFilter);
    if (dealerOnly) rows = rows.filter((c) => c.source_channel === "dealer_ai_intake");
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.email ?? "").toLowerCase().includes(q) ||
          (c.city ?? "").toLowerCase().includes(q),
      );
    }
    return rows;
  }, [enriched, stageFilter, search, dealerOnly]);

  const { sort, onSort, compare } = useSort("exposure", "desc");
  const sorted = useMemo(() => [...filtered].sort(compare), [filtered, compare]);

  const cols: Col[] = COLS.map((c) => ({
    label: <SortLabel label={c.label} colKey={c.key} sortKey={sort.key} dir={sort.dir} onSort={onSort} />,
    align: c.align,
    width: c.width,
  }));

  return (
    <div className="grid">
      <PageHeader
        title="Clients"
        lede={`· ${filtered.length} of ${enriched.length}`}
        actions={
          <>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, city…"
              aria-label="Search clients"
              style={{ width: 240 }}
            />
            {canCreate && (
              // Clients tab owns person/contact creation only — the slim
              // AgentLeadModal mirrors the mobile single-page New Client
              // form. Loan-file creation lives on /pipeline.
              <Btn variant="pri" onClick={() => setIntakeOpen(true)}>
                <Icon name="plus" size={14} /> New client
              </Btn>
            )}
          </>
        }
      />

      {/* Stage filter chips. Single-select, click again to clear (back to All). */}
      <Row>
        <Seg<StageFilter>
          value={stageFilter}
          onChange={setStageFilter}
          ariaLabel="Stage filter"
          options={STAGE_CHIPS.map((chip) => ({
            value: chip.value,
            label: (
              <>
                {chip.label} <span className="tag">{stageCounts[chip.value] ?? 0}</span>
              </>
            ),
          }))}
        />
        <Btn
          size="sm"
          variant={dealerOnly ? "pri" : "default"}
          aria-pressed={dealerOnly}
          onClick={() => setDealerOnly((v) => !v)}
          title="Show only clients created from a dealer AI intake"
        >
          Dealer AI intake
        </Btn>
      </Row>

      <Panel noPad>
        <Table cols={cols} caption="Clients">
          {sorted.map((c) => (
            <Tr key={c.id} onClick={() => (window.location.href = `/clients/${c.id}`)}>
              <Td>
                <Row>
                  <b>{c.name}</b>
                  {c.source_channel === "dealer_ai_intake" ? <CellChip tone="acc">Dealer AI</CellChip> : null}
                </Row>
                <div className="sub">{c.email}</div>
              </Td>
              <Td>
                <CellChip tone={STAGE_TONE[c._stage]}>{STAGE_LABEL[c._stage]}</CellChip>
              </Td>
              {isInternal && (
                <Td>
                  <BillingAuthPill row={authByClient.get(c.id) ?? null} />
                </Td>
              )}
              <Td>
                {c._type ? (
                  <CellChip tone={c._type === "buyer" ? "acc" : "warn"}>
                    {c._type === "buyer" ? "Buyer" : "Seller"}
                  </CellChip>
                ) : (
                  <span className="sub">—</span>
                )}
              </Td>
              {isInternal && (
                <Td>
                  <AssignBrokerCell client={c} />
                </Td>
              )}
              <Td align="r">
                <span className="num">{c.fico ?? "—"}</span>
              </Td>
              <Td align="r">
                <span className="num">{c.active_loans}</span>
              </Td>
              <Td align="r">
                <b className="num">{QC_FMT.short(c.exposure)}</b>
              </Td>
              <Td>
                <span className="sub">{c.city ?? "—"}</span>
              </Td>
              <Td>
                <span className="sub">{c.since ? new Date(c.since).getFullYear() : "—"}</span>
              </Td>
            </Tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={COLS.length} style={{ textAlign: "center", padding: 24 }}>
                <span className="sub">
                  {search || stageFilter !== "all"
                    ? "No clients match the current filters."
                    : "No clients yet."}
                </span>
                {canCreate && !search && stageFilter === "all" && (
                  <>
                    {" "}
                    <button type="button" className="linky" onClick={() => setIntakeOpen(true)}>
                      Start a deal →
                    </button>
                  </>
                )}
              </td>
            </tr>
          )}
        </Table>
      </Panel>
      <AgentLeadModal open={intakeOpen} onClose={() => setIntakeOpen(false)} />
    </div>
  );
}

// Agent assignment cell — clickable for super_admin / loan_exec. Shows
// the current broker's display_name (or "Unassigned"), and on click
// opens a small picker with search to (re)assign. Hits the existing
// PATCH /clients/{id} endpoint which already supports broker_id
// updates for non-broker roles.
function AssignBrokerCell({ client }: { client: Client & { broker_id?: string | null; broker_name?: string | null } }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sweepBroker, setSweepBroker] = useState<Broker | null>(null);
  const { data: brokers = [], isLoading } = useBrokers();
  const update = useUpdateClient();
  const anchorRef = useRef<HTMLDivElement | null>(null);

  // Click-outside closer for the dropdown.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!anchorRef.current) return;
      if (!anchorRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return brokers;
    return brokers.filter((b: Broker) => b.display_name.toLowerCase().includes(q));
  }, [brokers, query]);

  async function pick(broker: Broker | null) {
    setBusyId(broker?.id ?? "__unassign__");
    try {
      await update.mutateAsync({ clientId: client.id, broker_id: broker?.id ?? null });
      setOpen(false);
      setQuery("");
      if (broker) setSweepBroker(broker);
    } finally {
      setBusyId(null);
    }
  }

  const assigned = !!client.broker_id;
  return (
    <div ref={anchorRef} className="popwrap">
      <button
        type="button"
        className={cx("cellchip", assigned ? "c-mut" : "c-warn")}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title={assigned ? "Reassign agent" : "Assign an agent"}
        style={{ maxWidth: 150 }}
      >
        <Icon name={assigned ? "user" : "alert"} size={11} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {assigned ? client.broker_name ?? "Assigned" : "Unassigned"}
        </span>
        <Icon name="chevR" size={9} />
      </button>
      {open ? (
        <div className="popmenu" onClick={(e) => e.stopPropagation()} style={{ width: 260 }}>
          <div style={{ padding: "4px 6px 8px" }}>
            <div className="lbl" style={{ marginBottom: 5 }}>
              {assigned ? "Reassign agent" : "Assign agent"}
            </div>
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search agents…"
              aria-label="Search agents"
              style={{ width: "100%" }}
            />
          </div>
          <div style={{ maxHeight: 240, overflowY: "auto" }}>
            {isLoading ? (
              <div className="sub" style={{ padding: "8px 10px" }}>Loading agents…</div>
            ) : filtered.length === 0 ? (
              <div className="sub" style={{ padding: "8px 10px" }}>No matches.</div>
            ) : (
              filtered.map((b: Broker) => {
                const isCurrent = b.id === client.broker_id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    className="mi"
                    onClick={() => pick(b)}
                    disabled={isCurrent || busyId !== null}
                  >
                    <span className="row">
                      <Icon name="user" size={11} />
                      <span style={{ flex: 1 }}>{b.display_name}</span>
                      {isCurrent ? (
                        <span className="cellchip c-acc">Current</span>
                      ) : busyId === b.id ? (
                        <span className="sub">Saving…</span>
                      ) : null}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          {assigned ? (
            <button
              type="button"
              className="mi"
              onClick={() => pick(null)}
              disabled={busyId !== null}
              style={{ color: "var(--danger)" }}
            >
              {busyId === "__unassign__" ? "Unassigning…" : "Unassign agent"}
            </button>
          ) : null}
        </div>
      ) : null}
      {sweepBroker ? (
        <MultiLoanReassignModal
          clientId={client.id}
          newBroker={sweepBroker}
          brokerName={sweepBroker.display_name}
          onClose={() => setSweepBroker(null)}
        />
      ) : null}
    </div>
  );
}


function BillingAuthPill({ row }: { row: PaymentAuthorizationClientSummaryRead | null }) {
  const signed = !!row?.signed_at || row?.authorization_status === "active";
  const card = row?.card_status === "active" && !!row.card_last4;
  const ready = !!row?.authorized;
  const label = ready ? "Ready" : signed && !card ? "Card missing" : !signed && card ? "Signature missing" : "Not started";
  const tone: ChipTone = ready ? "ok" : signed || card ? "warn" : "mut";
  const title = ready && row
    ? `${row.card_brand ?? "Card"} ending ${row.card_last4}; signed ${row.completed_at ? new Date(row.completed_at).toLocaleDateString() : "complete"}`
    : "Client must complete payment pre-authorization before credit actions are unlocked.";
  return (
    <span className={`cellchip c-${tone}`} title={title}>
      <span className="repdot" style={{ background: "currentColor" }} />
      {label}
    </span>
  );
}
