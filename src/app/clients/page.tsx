"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { useSort } from "@/components/design-system/primitives";
import {
  Btn,
  CellChip,
  Input,
  Linky,
  Panel,
  PinRowButton,
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
  useClientAccessDirectory,
  useClients,
  useCurrentUser,
  useLoans,
  useUnifiedOperatorFiles,
  useUpdateClient,
} from "@/hooks/useApi";
import { MultiLoanReassignModal } from "@/components/MultiLoanReassignModal";
import { Role } from "@/lib/enums.generated";
import type { Broker, Client, ClientAccessDirectoryRow, ClientStage, PaymentAuthorizationClientSummaryRead } from "@/lib/types";
import { QC_FMT } from "@/lib/fmt";
import { AgentLeadModal } from "@/app/pipeline/components/AgentLeadModal";
import { PageActionMenu } from "@/components/ds/PageActionMenu";
import { VERTICAL_OPTIONS, verticalTone } from "@/lib/unifiedOperator";
import { usePinnedRows } from "@/lib/tablePinning";
import {
  EMPTY_FINDER,
  digitsOf,
  facetCounts,
  findClients,
  finderFromQuery,
  finderToQuery,
  isFinderActive,
  searchText,
  type AuthorizationState,
  type ClientFinderState,
  type FinderAccess,
  type FinderAuthorization,
  type FinderDesk,
  type FinderFacet,
  type FinderStage,
} from "@/lib/clientFinder";

// Stages-as-filter-chips shown above the table.
const STAGE_CHIPS: { value: FinderStage; label: string }[] = [
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
  { label: "Authorizations", width: 142, key: "_authorization_rank" },
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

const ACCESS_CHOICES: { value: FinderAccess; label: string }[] = [
  { value: "all", label: "All" },
  { value: "has", label: "Has access" },
  { value: "funding", label: "Funding" },
  { value: "audit", label: "Audit" },
  { value: "none", label: "No access" },
];

const AUTHORIZATION_CHOICES: { value: FinderAuthorization; label: string }[] = [
  { value: "all", label: "All" },
  { value: "ready", label: "Ready" },
  { value: "partial", label: "In progress" },
  { value: "none", label: "Not started" },
];

const AUTHORIZATION_RANK: Record<AuthorizationState, number> = { none: 0, partial: 1, ready: 2 };

function authorizationParts(row: PaymentAuthorizationClientSummaryRead | null) {
  const signed = !!row?.signed_at || row?.authorization_status === "active";
  const card = row?.card_status === "active" && !!row.card_last4;
  return { signed, card, ready: !!row?.authorized };
}

function authorizationState(row: PaymentAuthorizationClientSummaryRead | null): AuthorizationState {
  const { signed, card, ready } = authorizationParts(row);
  return ready ? "ready" : signed || card ? "partial" : "none";
}

/** What the Access column says for a client; also what that column sorts by. */
function accessLabel(row: ClientAccessDirectoryRow | null): string {
  if (!row) return "No login";
  const products = row.account_types.map((item) => (item === "funding" ? "Funding" : "Audit"));
  return products.length ? products.join(" + ") : "No access";
}

/** Each business once, however many of the client's files name it. */
function distinctNames(names: Array<string | null | undefined>): string[] {
  const seen = new Map<string, string>();
  for (const name of names) {
    const trimmed = name?.trim();
    if (trimmed && !seen.has(trimmed.toLowerCase())) seen.set(trimmed.toLowerCase(), trimmed);
  }
  return [...seen.values()];
}

export default function ClientsPage() {
  const { data: user } = useCurrentUser();
  const { data: clients = [], isLoading: clientsLoading, isError: clientsFailed, refetch: reloadClients } = useClients();
  const { data: loans = [] } = useLoans();
  const { data: unifiedFiles } = useUnifiedOperatorFiles({ limit: 500 });
  const [finder, setFinder] = useState<ClientFinderState>(EMPTY_FINDER);
  const [addressRead, setAddressRead] = useState(false);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const canCreate = user?.role !== Role.CLIENT;
  const isSuperAdmin = user?.role === Role.SUPER_ADMIN;
  // Only super_admin / loan_exec see the Agent column + assign picker.
  // Brokers operate within their own scope; clients are read-only.
  const isInternal = user?.role === Role.SUPER_ADMIN || user?.role === Role.LOAN_EXEC;
  const { data: authRows = [] } = useClientPaymentAuthorizationSummaries({ enabled: isInternal });
  const { data: accessDirectory } = useClientAccessDirectory(
    { page_size: 200 },
    { enabled: isSuperAdmin },
  );

  // The search and filters ride in the page address, so opening a client and
  // coming back returns to the same list. Read them once on arrival…
  useEffect(() => {
    setFinder(finderFromQuery(window.location.search));
    setAddressRead(true);
  }, []);
  // …and write them back shortly after they change. Browsers limit how often
  // an address may be rewritten, so typing is not written a letter at a time.
  useEffect(() => {
    if (!addressRead) return;
    const timer = window.setTimeout(() => {
      const query = finderToQuery(finder, window.location.search);
      const next = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
      if (next === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
      try {
        window.history.replaceState(null, "", next);
      } catch {
        // The list is already narrowed; only the address is left behind.
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [finder, addressRead]);

  const setFacet = <F extends FinderFacet>(facet: F, value: ClientFinderState[F]) =>
    setFinder((current) => ({ ...current, [facet]: value }));
  const clearFinder = () => {
    setFinder(EMPTY_FINDER);
    searchRef.current?.focus();
  };

  // A filter this role is not shown cannot be left on by an address.
  const applied = useMemo<ClientFinderState>(
    () => ({
      ...finder,
      desk: isInternal ? finder.desk : "all",
      access: isSuperAdmin ? finder.access : "all",
      authorization: isInternal ? finder.authorization : "all",
    }),
    [finder, isInternal, isSuperAdmin],
  );
  const finderActive = isFinderActive(applied);

  const accessByClient = useMemo(() => {
    const map = new Map<string, NonNullable<typeof accessDirectory>["items"][number]>();
    for (const row of accessDirectory?.items ?? []) {
      if (row.client_id) map.set(row.client_id, row);
    }
    return map;
  }, [accessDirectory]);

  const authByClient = useMemo(() => {
    const map = new Map<string, PaymentAuthorizationClientSummaryRead>();
    for (const row of authRows) map.set(row.client_id, row);
    return map;
  }, [authRows]);

  // Compute exposure + active loans per client from the loans list, plus an
  // effective-stage value used for filtering and rendering, and what the
  // finder reads off each client.
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
      const access = accessByClient.get(c.id) ?? null;
      const verticals = [...new Set(files.map((file) => file.vertical))];
      const businesses = distinctNames(files.map((file) => file.business_name));
      const logicalExposure = files.reduce((sum, file) => sum + Number(file.amount ?? 0), 0);
      const authorization = authorizationState(authByClient.get(c.id) ?? null);
      return {
        ...c,
        broker_id: c.broker_id ?? null,
        active_loans,
        exposure: files.length ? logicalExposure : exposureByClient.get(c.id) ?? Number(c.funded_total),
        _stage: inferredStage(c, active_loans),
        _record_shape: businesses.length ? "Person + business" : "Person",
        _businesses: businesses,
        _verticals: verticals,
        _vertical_label: verticals.length === 1 ? files[0]?.vertical_label ?? "Unassigned" : verticals.length > 1 ? "Mixed" : "Unassigned",
        file_count: files.length,
        // The agent's name is left out on purpose: the Desk filter narrows by
        // agent, and a search for "john" should find people called John.
        _search: searchText([
          c.name,
          c.email,
          c.phone,
          c.city,
          c.address,
          ...businesses,
          ...files.map((file) => file.principal),
        ]),
        _phones: [c.phone, access?.phone, ...files.map((file) => file.phone)].map(digitsOf).filter(Boolean),
        _access: access?.account_types ?? [],
        _access_label: accessLabel(access),
        _authorization: authorization,
        _authorization_rank: AUTHORIZATION_RANK[authorization],
      };
    });
  }, [clients, loans, unifiedFiles, accessByClient, authByClient]);

  // The number beside every choice is what picking it would show, given the
  // search and the other filters as they stand.
  const stageCounts = useMemo(
    () => facetCounts(enriched, applied, "stage", STAGE_CHIPS.map((chip) => chip.value)),
    [enriched, applied],
  );
  const verticalChoices = useMemo(() => {
    const counts = facetCounts(enriched, applied, "vertical", VERTICAL_OPTIONS.map((option) => option.value));
    return VERTICAL_OPTIONS.map((option) =>
      option.value === "all" ? { value: option.value, label: "All" } : { ...option, count: counts[option.value] },
    );
  }, [enriched, applied]);
  const deskChoices = useMemo(() => {
    const agents = new Map<string, string>();
    for (const c of enriched) {
      if (c.broker_id) agents.set(c.broker_id, c.broker_name?.trim() || "Unnamed agent");
    }
    const listed = [...agents.entries()]
      .sort((a, b) => a[1].localeCompare(b[1], undefined, { sensitivity: "base" }))
      .map(([id, label]) => ({ value: `agent:${id}` as FinderDesk, label }));
    // An address can name an agent who no longer has clients here.
    if (applied.desk.startsWith("agent:") && !listed.some((choice) => choice.value === applied.desk)) {
      listed.push({ value: applied.desk, label: "An agent with no clients here" });
    }
    const values: FinderDesk[] = ["unassigned", ...listed.map((choice) => choice.value)];
    const counts = facetCounts(enriched, applied, "desk", values);
    return [
      { value: "all" as FinderDesk, label: "All" },
      { value: "unassigned" as FinderDesk, label: "Unassigned", count: counts.unassigned },
      ...listed.map((choice) => ({ ...choice, count: counts[choice.value] })),
    ];
  }, [enriched, applied]);
  const accessChoices = useMemo(() => {
    const counts = facetCounts(enriched, applied, "access", ACCESS_CHOICES.map((choice) => choice.value));
    return ACCESS_CHOICES.map((choice) => (choice.value === "all" ? choice : { ...choice, count: counts[choice.value] }));
  }, [enriched, applied]);
  const authorizationChoices = useMemo(() => {
    const counts = facetCounts(enriched, applied, "authorization", AUTHORIZATION_CHOICES.map((choice) => choice.value));
    return AUTHORIZATION_CHOICES.map((choice) => (choice.value === "all" ? choice : { ...choice, count: counts[choice.value] }));
  }, [enriched, applied]);

  const filtered = useMemo(() => findClients(enriched, applied), [enriched, applied]);

  const { sort, onSort, compare } = useSort("exposure", "desc");
  const sorted = useMemo(() => [...filtered].sort(compare), [filtered, compare]);
  const {
    rows: orderedClients,
    pinnedIds,
    isPinned,
    togglePin,
    clearPins,
  } = usePinnedRows({
    rows: sorted,
    getId: (client) => client.id,
    storageKey: user?.id ? `clients:${user.id}` : null,
  });

  const visibleClientCols: ClientCol[] = isSuperAdmin
    ? [...CLIENT_COLS.slice(0, 5), { label: "Access", width: 176, key: "_access_label" }, ...CLIENT_COLS.slice(5)]
    : CLIENT_COLS;
  const cols: Col[] = visibleClientCols.map((c) => ({
    label: <SortLabel label={c.label} colKey={c.key} sortKey={sort.key} dir={sort.dir} onSort={onSort} />,
    align: c.align,
    width: c.width,
  }));

  const typed = applied.q.trim();
  const onlySearching = typed !== "" && !isFinderActive({ ...applied, q: "" });

  return (
    <div className="grid">
      <div className="ckhead client-finder__head">
        <div className="ckrow">
          <h1>Clients</h1>
          <span className="sub" aria-live="polite">· {filtered.length} of {enriched.length}</span>
          <span className="sp" />
          {canCreate ? <Btn variant="pri" size="sm" onClick={() => setIntakeOpen(true)}><Icon name="plus" size={14} /> New client</Btn> : null}
          {pinnedIds.length ? <Btn size="sm" onClick={clearPins}>Clear pinned ({pinnedIds.length})</Btn> : null}
          <PageActionMenu items={[
            { label: "Open pipeline", href: "/pipeline" },
            { label: "Open prequalifications", href: "/admin/prequal-requests" },
          ]} label="Client book actions" />
        </div>
        <div className="client-finder" role="search" aria-label="Find a client">
          <label className="field box client-finder__search">
            <Icon name="search" size={15} />
            <input
              ref={searchRef}
              value={finder.q}
              onChange={(event) => setFacet("q", event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && finder.q) {
                  event.preventDefault();
                  setFacet("q", "");
                }
              }}
              placeholder="Search name, email, phone, business or city"
              aria-label="Search clients"
              autoComplete="off"
              spellCheck={false}
              maxLength={200}
            />
            {finder.q ? (
              <button
                type="button"
                aria-label="Clear search"
                title="Clear search"
                onClick={() => {
                  setFacet("q", "");
                  searchRef.current?.focus();
                }}
              >
                <Icon name="x" size={12} />
              </button>
            ) : null}
          </label>
          {/* One group, so that when the bar is too narrow for everything the
              filters drop to a second line together and the search box keeps
              the first line to itself. */}
          <div className="client-finder__filters">
            <FinderSelect label="Vertical" value={applied.vertical} onChange={(value) => setFacet("vertical", value)} options={verticalChoices} />
            {isInternal ? <FinderSelect label="Desk" value={applied.desk} onChange={(value) => setFacet("desk", value)} options={deskChoices} /> : null}
            {isSuperAdmin ? <FinderSelect label="Access" value={applied.access} onChange={(value) => setFacet("access", value)} options={accessChoices} /> : null}
            {isInternal ? <FinderSelect label="Authorizations" value={applied.authorization} onChange={(value) => setFacet("authorization", value)} options={authorizationChoices} /> : null}
            <Btn onClick={clearFinder} disabled={!finderActive} title="Clear the search and every filter">Clear</Btn>
          </div>
        </div>
        <div className="cktabs" role="tablist" aria-label="Client stage">
          {STAGE_CHIPS.map((chip) => (
            <button key={chip.value} type="button" role="tab" aria-selected={applied.stage === chip.value} className={applied.stage === chip.value ? "on" : undefined} onClick={() => setFacet("stage", chip.value)}>
              {chip.label} <span className="tag">{stageCounts[chip.value] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      <Panel noPad>
        <Table cols={cols} caption="Clients">
          {orderedClients.map((c) => {
            const pinned = isPinned(c.id);
            // Under the name: the business the client's files are opened for,
            // then how the client is reached. One line, cut short if it must be.
            const contact = c.email || c.city;
            const business = c._businesses.length
              ? `${c._businesses[0]}${c._businesses.length > 1 ? ` +${c._businesses.length - 1} more` : ""}`
              : null;
            const whoInFull = [...c._businesses, contact].filter(Boolean).join(" · ");
            return (
            <Tr key={c.id} onClick={() => (window.location.href = `/clients/${c.id}`)} className={pinned ? "table-row-pinned" : undefined}>
              <Td>
                <div className="row client-finder__cell" style={{ gap: 8, flexWrap: "nowrap" }}>
                  <PinRowButton pinned={pinned} onToggle={() => togglePin(c.id)} label={c.name} />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <Linky
                      style={{ display: "block", textAlign: "left", fontWeight: 800 }}
                      onClick={(event) => {
                        event.stopPropagation();
                        window.location.href = `/clients/${c.id}`;
                      }}
                    >
                      {c.name}
                    </Linky>
                    <span className="sub client-finder__who" title={whoInFull || undefined}>
                      {business || contact ? (
                        <>
                          {business ? <b>{business}</b> : null}
                          {business && contact ? " · " : null}
                          {contact}
                        </>
                      ) : (
                        c.id
                      )}
                    </span>
                  </span>
                </div>
              </Td>
              <Td>
                <CellChip tone={c._record_shape === "Person + business" ? "acc" : "mut"}>{c._record_shape}</CellChip>
              </Td>
              <Td>
                <CellChip tone={c._verticals.length === 1 ? verticalTone(c._verticals[0]) : "mut"}>{c._vertical_label}</CellChip>
              </Td>
              <Td><CellChip tone={STAGE_TONE[c._stage]}>{STAGE_LABEL[c._stage]}</CellChip></Td>
              <Td><BillingAuthPill row={authByClient.get(c.id) ?? null} /></Td>
              {isSuperAdmin ? (
                <Td>
                  <button
                    type="button"
                    className="linky"
                    onClick={(event) => {
                      event.stopPropagation();
                      window.location.href = `/settings?section=client_access&client_id=${c.id}`;
                    }}
                  >
                    <ClientAccessPill row={accessByClient.get(c.id) ?? null} />
                  </button>
                </Td>
              ) : null}
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
            );
          })}
          {orderedClients.length === 0 && (
            <tr>
              <td colSpan={visibleClientCols.length} style={{ textAlign: "center", padding: 24 }}>
                {clientsFailed ? (
                  // Said plainly: an empty list here once hid a failing request for days.
                  <span role="alert">
                    <span className="sub">The client list could not be loaded.</span>{" "}
                    <button type="button" className="linky" onClick={() => void reloadClients()}>
                      Try again
                    </button>
                  </span>
                ) : clientsLoading ? (
                  <span className="sub">Loading clients…</span>
                ) : finderActive ? (
                  <>
                    <span className="sub">
                      {onlySearching ? `No clients match “${typed}”.` : "No clients match this search and these filters."}
                    </span>{" "}
                    <button type="button" className="linky" onClick={clearFinder}>
                      {onlySearching ? "Clear the search" : "Clear the search and filters"}
                    </button>
                  </>
                ) : (
                  <>
                    <span className="sub">No clients yet.</span>
                    {canCreate ? (
                      <>
                        {" "}
                        <button type="button" className="linky" onClick={() => setIntakeOpen(true)}>
                          Start a deal →
                        </button>
                      </>
                    ) : null}
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

// One filter in the find bar: its name, then the choice, in one box. The name
// stays visible once something is picked, so "Ready" is never ambiguous.
function FinderSelect<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; count?: number }>;
}) {
  return (
    <label className={cx("field box client-finder__pick", value !== "all" && "on")}>
      <span>{label}</span>
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.count === undefined ? option.label : `${option.label} (${option.count})`}
          </option>
        ))}
      </select>
    </label>
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
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  // Click-outside closer for the dropdown.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!anchorRef.current) return;
      if (!anchorRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
    };
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
  const navigateMenu = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!menuRef.current || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = Array.from(
      menuRef.current.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])'),
    );
    if (!items.length) return;
    event.preventDefault();
    event.stopPropagation();
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home"
      ? 0
        : event.key === "End"
          ? items.length - 1
          : event.key === "ArrowDown"
            ? current < 0 ? 0 : (current + 1) % items.length
            : current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  return (
    <div ref={anchorRef} className="popwrap">
      <button
        ref={triggerRef}
        type="button"
        className={cx("cellchip", assigned ? "c-mut" : "c-warn")}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
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
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={assigned ? "Reassign agent" : "Assign agent"}
          className="popmenu"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={navigateMenu}
          style={{ width: 260 }}
        >
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
                    role="menuitem"
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
              role="menuitem"
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
  const { signed, card, ready } = authorizationParts(row);
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

function ClientAccessPill({ row }: { row: ClientAccessDirectoryRow | null }) {
  if (!row) return <CellChip tone="mut">{accessLabel(null)}</CellChip>;
  const tone: ChipTone = row.login_state === "suspended" || row.login_state === "invite_failed"
    ? "bad"
    : row.login_state === "active"
      ? "ok"
      : "warn";
  return <CellChip tone={tone}>{accessLabel(row)}</CellChip>;
}
