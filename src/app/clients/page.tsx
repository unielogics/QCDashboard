"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSort } from "@/components/design-system/primitives";
import {
  Btn,
  CellChip,
  Input,
  Panel,
  Table,
  Td,
  Tr,
  cx,
  type ChipTone,
  type Col,
} from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import {
  useBrokers,
  useClientPaymentAuthorizationSummaries,
  useClients,
  useCurrentUser,
  useLoans,
  useUnifiedOperatorFiles,
  useUpdateClient,
} from "@/hooks/useApi";
import { MultiLoanReassignModal } from "@/components/MultiLoanReassignModal";
import { Role } from "@/lib/enums.generated";
import type { Broker, Client, ClientStage, PaymentAuthorizationClientSummaryRead } from "@/lib/types";
import { QC_FMT } from "@/lib/fmt";
import { AgentLeadModal } from "@/app/pipeline/components/AgentLeadModal";
import { PageActionMenu } from "@/components/ds/PageActionMenu";
import { VERTICAL_OPTIONS, verticalTone, type UnifiedVertical } from "@/lib/unifiedOperator";

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

const CLIENT_COLS: ClientCol[] = [
  { label: "Client", key: "name" },
  { label: "Record", width: 126, key: "_record_shape" },
  { label: "Vertical", width: 126, key: "_vertical_label" },
  { label: "Stage", width: 122, key: "_stage" },
  { label: "Authorizations", width: 142, key: "_billing_auth" },
  { label: "Desk", width: 156, key: "broker_name" },
  { label: "Credit", width: 72, align: "r", key: "fico" },
  { label: "Files", width: 62, align: "r", key: "file_count" },
  { label: "Exposure", width: 108, align: "r", key: "exposure" },
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
  const { data: unifiedFiles } = useUnifiedOperatorFiles({ limit: 500 });
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");
  const [verticalFilter, setVerticalFilter] = useState<UnifiedVertical | "all">("all");
  const [intakeOpen, setIntakeOpen] = useState(false);

  const canCreate = user?.role !== Role.CLIENT;
  // Only super_admin / loan_exec see the Agent column + assign picker.
  // Brokers operate within their own scope; clients are read-only.
  const isInternal = user?.role === Role.SUPER_ADMIN || user?.role === Role.LOAN_EXEC;
  const { data: authRows = [] } = useClientPaymentAuthorizationSummaries({ enabled: isInternal });

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
    const filesByClient = new Map<string, NonNullable<typeof unifiedFiles>["items"]>();
    for (const file of unifiedFiles?.items ?? []) {
      if (!file.client_id) continue;
      filesByClient.set(file.client_id, [...(filesByClient.get(file.client_id) ?? []), file]);
    }
    return clients.map((c) => {
      const active_loans = activeByClient.get(c.id) ?? 0;
      const files = filesByClient.get(c.id) ?? [];
      const verticals = [...new Set(files.map((file) => file.vertical))];
      const businesses = files.filter((file) => file.business_name).map((file) => file.business_name as string);
      const logicalExposure = files.reduce((sum, file) => sum + Number(file.amount ?? 0), 0);
      return {
        ...c,
        active_loans,
        exposure: files.length ? logicalExposure : exposureByClient.get(c.id) ?? Number(c.funded_total),
        _stage: inferredStage(c, active_loans),
        _record_shape: businesses.length ? "Person + business" : "Person",
        _businesses: businesses,
        _verticals: verticals,
        _vertical_label: verticals.length === 1 ? files[0]?.vertical_label ?? "Unassigned" : verticals.length > 1 ? "Mixed" : "Unassigned",
        file_count: files.length,
      };
    });
  }, [clients, loans, unifiedFiles]);

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { all: enriched.length };
    for (const c of enriched) counts[c._stage] = (counts[c._stage] ?? 0) + 1;
    return counts;
  }, [enriched]);

  const filtered = useMemo(() => {
    let rows = enriched;
    if (stageFilter !== "all") rows = rows.filter((c) => c._stage === stageFilter);
    if (verticalFilter !== "all") rows = rows.filter((c) => c._verticals.includes(verticalFilter));
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
  }, [enriched, stageFilter, search, verticalFilter]);

  const { sort, onSort, compare } = useSort("exposure", "desc");
  const sorted = useMemo(() => [...filtered].sort(compare), [filtered, compare]);

  const cols: Col[] = CLIENT_COLS.map((c) => ({
    label: <SortLabel label={c.label} colKey={c.key} sortKey={sort.key} dir={sort.dir} onSort={onSort} />,
    align: c.align,
    width: c.width,
  }));

  return (
    <div className="grid">
      <div className="ckhead">
        <div className="ckrow">
          <h1>Clients</h1>
          <span className="sub">· {filtered.length} of {enriched.length}</span>
          <span className="sp" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, EIN, city..."
            aria-label="Search clients"
            style={{ width: 260 }}
          />
          {canCreate ? <Btn variant="pri" size="sm" onClick={() => setIntakeOpen(true)}><Icon name="plus" size={14} /> New client</Btn> : null}
          <PageActionMenu items={[
            { label: "Open pipeline", href: "/pipeline" },
            { label: "Open prequalifications", href: "/admin/prequal-requests" },
          ]} label="Client book actions" />
        </div>
        <div className="vfilter">
          {VERTICAL_OPTIONS.map((vertical) => (
            <button key={vertical.value} type="button" className={verticalFilter === vertical.value ? "on" : undefined} onClick={() => setVerticalFilter(vertical.value)}>
              {vertical.label}
            </button>
          ))}
        </div>
        <div className="cktabs" role="tablist" aria-label="Client stage">
          {STAGE_CHIPS.map((chip) => (
            <button key={chip.value} type="button" role="tab" aria-selected={stageFilter === chip.value} className={stageFilter === chip.value ? "on" : undefined} onClick={() => setStageFilter(chip.value)}>
              {chip.label} <span className="tag">{stageCounts[chip.value] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      <Panel noPad>
        <Table cols={cols} caption="Clients">
          {sorted.map((c) => (
            <Tr key={c.id} onClick={() => (window.location.href = `/clients/${c.id}`)}>
              <Td>
                <b>{c.name}</b>
                <div className="sub">{c.email || c.city || c.id}</div>
              </Td>
              <Td>
                <CellChip tone={c._record_shape === "Person + business" ? "acc" : "mut"}>{c._record_shape}</CellChip>
              </Td>
              <Td>
                <CellChip tone={c._verticals.length === 1 ? verticalTone(c._verticals[0]) : "mut"}>{c._vertical_label}</CellChip>
              </Td>
              <Td><CellChip tone={STAGE_TONE[c._stage]}>{STAGE_LABEL[c._stage]}</CellChip></Td>
              <Td><BillingAuthPill row={authByClient.get(c.id) ?? null} /></Td>
              <Td>{isInternal ? <AssignBrokerCell client={c} /> : <span className="sub">{c.broker_name || "My desk"}</span>}</Td>
              <Td align="r">
                <span className="num">{c.fico ?? "—"}</span>
              </Td>
              <Td align="r">
                <span className="num">{c.file_count}</span>
              </Td>
              <Td align="r">
                <b className="num">{QC_FMT.short(c.exposure)}</b>
              </Td>
            </Tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={CLIENT_COLS.length} style={{ textAlign: "center", padding: 24 }}>
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
