"use client";

// Firm-wide pre-qualification queue. Operator-only.
//
// Defaults to PENDING-first (the underwriter inbox) but the column
// headers are sortable and the whole row is clickable to open the
// review panel — no need to find the small Open button.
//
// Styling migrated off the inline token objects onto the plain-CSS design
// system (globals.css + app-extras.css) via the wrappers in @/components/ds.
// Every role gate, sort key, keyboard affordance, context-menu item and empty
// state survives; only the surface vocabulary moved:
//   hand-rolled filter pills → Seg as="filter" (it narrows the list; it does
//                              not switch which view you are on)
//   CSS-grid faux table      → `.gridhd` / `.gridrow`, which is exactly what
//                              those classes are for. The ten-column track is
//                              data, so it stays inline (rule 3). The property
//                              name is the keyboard-accessible open control;
//                              the row also keeps click and right-click actions.
//   JS mouseenter/mouseleave → `.gridrow.act`
//   hand-rolled cursor menu  → `.popmenu.atcursor` + `.mhd` + `.mi`
//   status Pill + stripe     → CellChip tone; the stripe keeps its computed
//                              colour inline (rule 2)
// The page no longer sets its own padding or max-width — the shell's
// `.content` owns both.

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Btn, CellChip, cx, Loading, PageHeader, Panel, Row, Seg, Sub, type ChipTone } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { QC_FMT } from "@/lib/fmt";
import { useActiveProfile } from "@/store/role";
import { Role } from "@/lib/enums.generated";
import { useAdminPrequalQueue, useCurrentUser } from "@/hooks/useApi";
import { PrequalReviewModal } from "@/components/PrequalReviewModal";
import { AdminPrequalCreateModal } from "@/components/AdminPrequalCreateModal";
import { PREQUAL_LOAN_TYPE_LABELS, PREQUAL_LTV_CAPS, type PrequalRequest, type PrequalStatus } from "@/lib/types";
import { PageActionMenu } from "@/components/ds/PageActionMenu";
import { PinRowButton, TableWorkspace } from "@/components/ds/TableWorkspace";
import { usePinnedRows } from "@/lib/tablePinning";
import { ContextMenu, useContextMenu, type ContextMenuItem } from "@/components/ContextMenu";

type FilterId = PrequalStatus | "all";
const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "offer_accepted", label: "Loan opened" },
  { id: "offer_declined", label: "Closed" },
  { id: "rejected", label: "Rejected" },
];

type SortKey = "status" | "address" | "entity" | "requested" | "approved" | "ltv" | "closing" | "submitted";
type SortDir = "asc" | "desc";

// Status sort priority — pending first, then approved, then everything
// else. Keeps the inbox feel even when sorting by other columns
// secondarily.
const STATUS_RANK: Record<PrequalStatus, number> = {
  pending: 0,
  approved: 1,
  offer_accepted: 2,
  rejected: 3,
  offer_declined: 4,
};

/** Status → the chip vocabulary. Was a palette lookup off the theme object. */
function statusInfo(s: PrequalStatus): { label: string; tone: ChipTone } {
  if (s === "approved") return { label: "Approved", tone: "ok" };
  if (s === "offer_accepted") return { label: "Loan opened", tone: "acc" };
  if (s === "offer_declined") return { label: "Closed", tone: "mut" };
  if (s === "rejected") return { label: "Rejected", tone: "bad" };
  return { label: "Pending", tone: "warn" };
}

export default function AdminPrequalQueuePage() {
  const profile = useActiveProfile();
  const { data: currentUser } = useCurrentUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Default to "all" so admin lands on a populated queue regardless of
  // status. Pending floats to the top (STATUS_RANK), so the action
  // bias is preserved without hiding approved / loan-opened rows from
  // an admin who might want to edit a previously-issued letter.
  const [filter, setFilter] = useState<FilterId>("all");
  const [sortKey, setSortKey] = useState<SortKey>("closing");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selected, setSelected] = useState<PrequalRequest | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const canUnderwrite =
    profile.role === Role.SUPER_ADMIN || profile.role === Role.LOAN_EXEC;
  const canCreatePrequal =
    profile.role === Role.BROKER || profile.role === Role.SUPER_ADMIN || profile.role === Role.LOAN_EXEC;
  const rowMenu = useContextMenu<PrequalRequest>();

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    const status = searchParams?.get("status") as FilterId | null;
    if (status && FILTERS.some((f) => f.id === status)) {
      setFilter(status);
    }
  }, [searchParams]);

  // Always pull "all" from the server then filter client-side. Lets the
  // count chips show all-status counts at once.
  const { data: allRequests = [], isLoading } = useAdminPrequalQueue();

  // Walk superseded_by → ... → head so "Print latest letter" always
  // resolves to the most recent issued PDF in the chain, even when the
  // operator right-clicks an older version row.
  const requestById = useMemo(() => {
    const m = new Map<string, PrequalRequest>();
    for (const r of allRequests) m.set(r.id, r);
    return m;
  }, [allRequests]);

  const findChainHead = (req: PrequalRequest): PrequalRequest => {
    let cur = req;
    const seen = new Set<string>([cur.id]);
    while (cur.superseded_by_id) {
      const next = requestById.get(cur.superseded_by_id);
      if (!next || seen.has(next.id)) break;
      seen.add(next.id);
      cur = next;
    }
    return cur;
  };

  const onPrintLatest = (req: PrequalRequest) => {
    const head = findChainHead(req);
    if (head.pdf_url) {
      window.open(head.pdf_url, "_blank", "noopener,noreferrer");
    } else {
      // Head has no PDF (pending revision still rendering, or a status
      // without a letter). Fall back to opening the head in the modal.
      setSelected(head);
    }
  };

  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, rejected: 0, offer_accepted: 0, offer_declined: 0 } as Record<PrequalStatus, number>;
    for (const r of allRequests) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [allRequests]);

  const visible = useMemo(() => {
    const filtered = filter === "all" ? allRequests : allRequests.filter((r) => r.status === filter);
    const dir = sortDir === "asc" ? 1 : -1;
    const sorted = [...filtered].sort((a, b) => {
      // Status grouping always wins as a stable secondary key so pending
      // floats even when sorting by closing date.
      const groupA = STATUS_RANK[a.status] ?? 99;
      const groupB = STATUS_RANK[b.status] ?? 99;

      const cmp = (() => {
        switch (sortKey) {
          case "status":
            return groupA - groupB;
          case "address":
            return a.target_property_address.localeCompare(b.target_property_address);
          case "entity":
            return (a.borrower_entity ?? "").localeCompare(b.borrower_entity ?? "");
          case "requested":
            return Number(a.requested_loan_amount) - Number(b.requested_loan_amount);
          case "approved": {
            const va = a.approved_loan_amount != null ? Number(a.approved_loan_amount) : -1;
            const vb = b.approved_loan_amount != null ? Number(b.approved_loan_amount) : -1;
            return va - vb;
          }
          case "ltv": {
            const la = Number(a.purchase_price) > 0 ? Number(a.requested_loan_amount) / Number(a.purchase_price) : 0;
            const lb = Number(b.purchase_price) > 0 ? Number(b.requested_loan_amount) / Number(b.purchase_price) : 0;
            return la - lb;
          }
          case "closing": {
            // Nulls last regardless of asc/desc.
            const da = a.expected_closing_date ? new Date(a.expected_closing_date).getTime() : null;
            const db = b.expected_closing_date ? new Date(b.expected_closing_date).getTime() : null;
            if (da == null && db == null) return 0;
            if (da == null) return 1;
            if (db == null) return -1;
            return da - db;
          }
          case "submitted":
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        }
      })();

      if (cmp !== 0) return cmp * dir;
      // Tiebreak: status group, then submitted-newest first.
      if (groupA !== groupB) return groupA - groupB;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return sorted;
  }, [allRequests, filter, sortKey, sortDir]);

  const prequalTableStorageKey = currentUser?.id ? `admin-prequal-requests:${currentUser.id}` : null;
  const {
    rows: orderedVisible,
    pinnedIds,
    isPinned,
    togglePin,
    clearPins,
  } = usePinnedRows({
    rows: visible,
    getId: (request) => request.id,
    storageKey: prequalTableStorageKey,
  });

  // Borrower-only or unknown role → kick to home.
  if (profile.role === Role.CLIENT) {
    return (
      <Panel title="Operator-only">
        <Sub>
          Prequalifications are for agents and the funding team. Borrowers should submit
          requests from their file view.
        </Sub>
        <Row className="mt">
          <Btn onClick={() => router.push("/")}>Back to dashboard</Btn>
        </Row>
      </Panel>
    );
  }

  const onSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Sensible defaults: numeric keys default to descending (largest first),
      // dates and strings default to ascending.
      setSortDir(["requested", "approved", "ltv"].includes(key) ? "desc" : "asc");
    }
  };

  return (
    <div className="grid">
      <PageHeader
        title="Prequalifications"
        lede={
          canUnderwrite
            ? "Click a row to open the review panel. Right-click for quick actions (open, print the latest letter). Headers sort the queue; pending always groups to the top."
            : "Create and track pending prequalification requests for your clients. The funding team reviews and issues letters."
        }
        actions={
          <>
            {canCreatePrequal ? (
              <Btn variant="pri" onClick={() => setCreateOpen(true)}>
                <Icon name="plus" size={13} stroke={3} /> Create prequalification
              </Btn>
            ) : null}
            <PageActionMenu items={[{ label: "Open pipeline", href: "/pipeline" }, { label: "Open vault", href: "/vault" }]} />
          </>
        }
      />

      {/* Filter bar — counts live inside each segment so the toolbar carries
          both navigation and status-at-a-glance without duplicating chrome. */}
      <Row>
        <Seg
          as="filter"
          ariaLabel="Filter by status"
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((f) => ({
            value: f.id,
            label: (
              <>
                {f.label}{" "}
                <span className="num">
                  {f.id === "all" ? allRequests.length : (counts[f.id as PrequalStatus] ?? 0)}
                </span>
              </>
            ),
          }))}
        />
      </Row>

      <TableWorkspace
        title="Prequalification queue"
        description="Pin active requests to keep them at the top of the current queue."
        storageKey={prequalTableStorageKey ?? undefined}
        ariaLabel="Prequalification requests"
        actions={pinnedIds.length ? <Btn size="sm" onClick={clearPins}>Clear pins</Btn> : null}
      >
        {isLoading ? (
          <div className="panel-b"><Loading>Loading queue…</Loading></div>
        ) : orderedVisible.length === 0 ? (
          <div className="panel-b">
            <Sub>
              No requests in this status. {filter !== "all" && "Try changing the filter."}
            </Sub>
          </div>
        ) : (
          <>
            <HeaderRow sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            {orderedVisible.map((r) => (
              <QueueRow
                key={r.id}
                req={r}
                hydrated={hydrated}
                pinned={isPinned(r.id)}
                onTogglePin={() => togglePin(r.id)}
                onOpen={() => {
                  if (canUnderwrite) setSelected(r);
                }}
                onContextMenu={(e) => {
                  if (canUnderwrite) rowMenu.open(e, r);
                }}
              />
            ))}
          </>
        )}
        <ContextMenu
          state={rowMenu.state}
          onClose={rowMenu.close}
          items={(req): ContextMenuItem[] => {
            const head = findChainHead(req);
            const isSuperseded = req.superseded_by_id != null;
            return [
              {
                label: isSuperseded ? "Open this version" : "Open",
                icon: "docCheck",
                onSelect: () => setSelected(req),
              },
              ...(isSuperseded ? [{
                label: `Open latest (v${head.version_num})`,
                icon: "arrowR",
                onSelect: () => setSelected(head),
              }] : []),
              {
                label: head.pdf_url ? "Print latest letter" : "Print latest letter · no PDF yet",
                icon: "docCheck",
                disabled: !head.pdf_url,
                onSelect: () => onPrintLatest(req),
              },
            ];
          }}
        />
      </TableWorkspace>

      {canUnderwrite ? (
        <PrequalReviewModal
          open={!!selected}
          onClose={() => setSelected(null)}
          request={selected}
        />
      ) : null}

      <AdminPrequalCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />

    </div>
  );
}

// 4px color stripe + status column + the rest. Each row's first column
// is a colored stripe per status; the legend stays inside the Status
// pill so the stripe carries the at-a-glance signal.
const GRID_COLS = "4px 110px minmax(0, 2fr) minmax(0, 1fr) 130px 130px 110px 100px 90px 40px";

/** Stripe colour per status. A discrete lookup, but it paints a bare 4px
 *  column that no class owns, so it is passed inline (rule 2). */
function statusStripe(s: PrequalStatus): string {
  if (s === "approved") return "var(--ok)";
  if (s === "offer_accepted") return "var(--accent)";
  if (s === "rejected") return "var(--danger)";
  if (s === "offer_declined") return "var(--faint)";
  return "var(--warn)";
}

// Friendly short relative-time. "in 8 days" / "today" / "2 wks ago".
// Pure formatting — does NOT change the semantic date column.
function relativeDays(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  // Whole-day delta in the user's local timezone — matches the date
  // they'd read off the row's secondary text.
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(target) - startOfDay(now)) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days > 0 && days < 14) return `in ${days}d`;
  if (days < 0 && days > -14) return `${-days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks > 0 && weeks < 8) return `in ${weeks} wks`;
  if (weeks < 0 && weeks > -8) return `${-weeks} wks ago`;
  return shortDateLabel(iso);
}

function shortDateLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const datePart = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  if (datePart) {
    const monthIdx = Number(datePart[2]) - 1;
    const day = Number(datePart[3]);
    if (months[monthIdx] && Number.isFinite(day)) return `${months[monthIdx]} ${day}`;
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${months[parsed.getUTCMonth()]} ${parsed.getUTCDate()}`;
}

function HeaderRow({
  sortKey,
  sortDir,
  onSort,
}: {
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const cell = (label: string, key: SortKey) => {
    const active = sortKey === key;
    return (
      <button
        type="button"
        className={cx("gridhd-c", active && "on")}
        onClick={() => onSort(key)}
        aria-label={`Sort by ${label}`}
      >
        {label}
        {active ? (
          <span className="sortarr" aria-hidden="true">{sortDir === "asc" ? "▲" : "▼"}</span>
        ) : null}
      </button>
    );
  };

  return (
    // Bespoke ten-column track (rule 3); `.gridhd` owns everything else.
    <div className="gridhd" style={{ gridTemplateColumns: GRID_COLS }}>
      <div />
      <div>{cell("Status", "status")}</div>
      <div>{cell("Property", "address")}</div>
      <div>{cell("Issued to", "entity")}</div>
      <div>{cell("Requested", "requested")}</div>
      <div>{cell("Approved", "approved")}</div>
      <div>{cell("LTV", "ltv")}</div>
      <div>{cell("Closing", "closing")}</div>
      <div>{cell("Submitted", "submitted")}</div>
      <div aria-label="Pinned" />
    </div>
  );
}

function QueueRow({
  req,
  hydrated,
  pinned,
  onTogglePin,
  onOpen,
  onContextMenu,
}: {
  req: PrequalRequest;
  hydrated: boolean;
  pinned: boolean;
  onTogglePin: () => void;
  onOpen: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const purchase = Number(req.purchase_price);
  const requested = Number(req.requested_loan_amount);
  const approved = req.approved_loan_amount != null ? Number(req.approved_loan_amount) : null;
  // Show LTV based on approved when present (more honest for the operator)
  // and on requested when still pending.
  const ltvBase = approved ?? requested;
  const ltv = purchase > 0 ? (ltvBase / purchase) * 100 : 0;
  const ltvCap = PREQUAL_LTV_CAPS[req.loan_type] * 100;
  const ltvPctOfCap = ltvCap > 0 ? Math.min(1, ltv / ltvCap) : 0;
  // Green well within cap, amber close, red over. A tone chosen from a
  // number — inline, per rule 2.
  const ltvColor = ltv > ltvCap + 0.05
    ? "var(--danger)"
    : ltv > ltvCap * 0.92
      ? "var(--warn)"
      : "var(--ok)";

  const s = statusInfo(req.status);
  const isSuperseded = req.superseded_by_id != null;
  const isRevision = (req.version_num ?? 1) > 1;
  const stripe = isSuperseded ? "var(--faint)" : statusStripe(req.status);
  const closingRel = hydrated ? relativeDays(req.expected_closing_date) : null;
  const closingAbs = shortDateLabel(req.expected_closing_date);
  const submittedRel = hydrated ? relativeDays(req.created_at) : null;
  const submittedAbs = shortDateLabel(req.created_at);

  return (
    <div
      // The row remains pointer-clickable and right-clickable. Its property
      // button below is the keyboard-accessible open control, which avoids
      // nesting the pin button inside another element with button semantics.
      onClick={onOpen}
      onContextMenu={onContextMenu}
      className={cx("gridrow", "act", isSuperseded && "done", pinned && "table-row-pinned")}
      data-pinned={pinned ? "true" : undefined}
      // Bespoke ten-column track (rule 3).
      style={{ gridTemplateColumns: GRID_COLS }}
    >
      {/* Status stripe — colored left border. Carries the status signal
          even when the operator is scanning quickly without reading pills.
          Colour is computed per row, so it is inline (rule 2). */}
      {/* Bespoke 4px rail spanning the row's height (rule 3) plus a computed
          colour (rule 2). No class owns either. */}
      <div style={{ alignSelf: "stretch", borderRadius: 2, background: stripe }} />

      <div>
        <CellChip tone={s.tone}>{s.label}</CellChip>
        {req.quote_number ? (
          <Row>
            <span className="sub num">
              {isSuperseded ? <s>{req.quote_number}</s> : req.quote_number}
            </span>
            {isRevision ? <CellChip tone="pet">v{req.version_num}</CellChip> : null}
          </Row>
        ) : null}
      </div>

      <div>
        <div className="trunc">
          <button
            type="button"
            className="linky"
            onClick={(event) => {
              event.stopPropagation();
              onOpen();
            }}
          >
            {req.target_property_address || req.borrower_entity || "Open request"}
          </button>
        </div>
        <div className="lbl">
          {PREQUAL_LOAN_TYPE_LABELS[req.loan_type]?.title ?? req.loan_type}
        </div>
      </div>

      <div className="trunc">
        {req.borrower_entity ?? <Sub><em>Entity TBD</em></Sub>}
      </div>

      <div className="num">{QC_FMT.usd(requested, 0)}</div>

      <div className="num">
        {approved != null ? (
          approved !== requested ? (
            // Differs from what was asked for — worth the eye stopping on it.
            <CellChip tone="ok">
              {approved > requested ? <Icon name="arrowR" size={11} /> : null}
              {QC_FMT.usd(approved, 0)}
            </CellChip>
          ) : (
            QC_FMT.usd(approved, 0)
          )
        ) : (
          <Sub>—</Sub>
        )}
      </div>

      {/* LTV bar — width is share of the matrix cap; colour stages
          green→amber→red. Both are computed from the number (rule 2). */}
      <div>
        <div className="num" style={{ color: ltvColor }}>{ltv.toFixed(1)}%</div>
        <div className="track">
          <div
            className="fill"
            style={{
              width: `${Math.max(2, Math.round(ltvPctOfCap * 100))}%`,
              background: ltvColor,
            }}
          />
        </div>
      </div>

      <div>
        {req.expected_closing_date ? (
          <>
            <b>{closingRel ?? closingAbs}</b>
            <div className="sub num">{closingAbs}</div>
          </>
        ) : (
          <Sub>—</Sub>
        )}
      </div>

      <div className="sub num">{submittedRel ?? submittedAbs ?? "—"}</div>

      <div
        onClick={(event) => event.stopPropagation()}
      >
        <PinRowButton
          pinned={pinned}
          onToggle={onTogglePin}
          label={req.target_property_address || req.borrower_entity || "prequalification request"}
        />
      </div>
    </div>
  );
}
