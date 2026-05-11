"use client";

// Firm-wide pre-qualification queue. Operator-only.
//
// Defaults to PENDING-first (the underwriter inbox) but the column
// headers are sortable and the whole row is clickable to open the
// review panel — no need to find the small Open button.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { QC_FMT } from "@/components/design-system/tokens";
import { useActiveProfile } from "@/store/role";
import { Role } from "@/lib/enums.generated";
import { useAdminPrequalQueue } from "@/hooks/useApi";
import { PrequalReviewModal } from "@/components/PrequalReviewModal";
import { AdminPrequalCreateModal } from "@/components/AdminPrequalCreateModal";
import { PREQUAL_LOAN_TYPE_LABELS, PREQUAL_LTV_CAPS, type PrequalRequest, type PrequalStatus } from "@/lib/types";

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

function statusInfo(t: ReturnType<typeof useTheme>["t"], s: PrequalStatus) {
  if (s === "approved") return { label: "Approved", bg: t.profitBg, fg: t.profit };
  if (s === "offer_accepted") return { label: "Loan opened", bg: t.brandSoft, fg: t.brand };
  if (s === "offer_declined") return { label: "Closed", bg: t.surface2, fg: t.ink3 };
  if (s === "rejected") return { label: "Rejected", bg: t.dangerBg, fg: t.danger };
  return { label: "Pending", bg: t.warnBg, fg: t.warn };
}

export default function AdminPrequalQueuePage() {
  const { t } = useTheme();
  const profile = useActiveProfile();
  const router = useRouter();
  // Default to "all" so admin lands on a populated queue regardless of
  // status. Pending floats to the top (STATUS_RANK), so the action
  // bias is preserved without hiding approved / loan-opened rows from
  // an admin who might want to edit a previously-issued letter.
  const [filter, setFilter] = useState<FilterId>("all");
  const [sortKey, setSortKey] = useState<SortKey>("closing");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selected, setSelected] = useState<PrequalRequest | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  // Right-click context menu state. The row that fired the menu plus
  // viewport coordinates so we can render at the cursor without an extra
  // library. Cleared on any document click / Escape — see effect below.
  const [menu, setMenu] = useState<{ req: PrequalRequest; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!menu) return;
    const dismiss = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(null); };
    // Mousedown (not click) so right-clicking another row immediately
    // re-opens the menu at the new position rather than first dismissing.
    window.addEventListener("mousedown", dismiss);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", dismiss);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

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

  // Borrower-only or unknown role → kick to home.
  if (profile.role === Role.CLIENT) {
    return (
      <div style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
        <Card pad={28}>
          <div style={{ fontSize: 16, fontWeight: 800, color: t.ink }}>Operator-only</div>
          <div style={{ fontSize: 13, color: t.ink2, marginTop: 6, lineHeight: 1.5 }}>
            Prequalifications are for underwriters. Borrowers should submit
            requests from the Simulator&apos;s My Loans tab.
          </div>
          <button onClick={() => router.push("/")} style={{ ...qcBtn(t), marginTop: 14 }}>
            Back to dashboard
          </button>
        </Card>
      </div>
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
    <div style={{ padding: 24, maxWidth: 1500, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: t.ink, letterSpacing: -0.4 }}>Prequalifications</h1>
          <div style={{ fontSize: 13, color: t.ink3, marginTop: 4 }}>
            Click a row to open the review panel. Right-click for quick actions
            (open, print the latest letter). Headers sort the queue; pending
            always groups to the top.
          </div>
        </div>
        {profile.role === Role.SUPER_ADMIN ? (
          <button
            onClick={() => setCreateOpen(true)}
            style={{ ...qcBtnPrimary(t), display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}
          >
            <Icon name="plus" size={13} stroke={3} />
            Create prequalification
          </button>
        ) : null}
      </div>

      {/* Filter bar — counts live inside each pill so the toolbar carries
          both navigation and status-at-a-glance without duplicating chrome.
          Active pill: full status accent fill; inactive: subdued surface. */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {FILTERS.map((f) => {
          const active = filter === f.id;
          const count = f.id === "all" ? allRequests.length : (counts[f.id as PrequalStatus] ?? 0);
          const accent = (() => {
            if (f.id === "approved") return { fg: t.profit, bg: t.profitBg };
            if (f.id === "pending") return { fg: t.warn, bg: t.warnBg };
            if (f.id === "offer_accepted") return { fg: t.brand, bg: t.brandSoft };
            if (f.id === "rejected") return { fg: t.danger, bg: t.dangerBg };
            if (f.id === "offer_declined") return { fg: t.ink3, bg: t.surface2 };
            return { fg: t.ink, bg: t.surface2 };
          })();
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              style={{
                all: "unset",
                cursor: "pointer",
                padding: "8px 14px",
                borderRadius: 999,
                background: active ? accent.bg : "transparent",
                border: `1px solid ${active ? accent.fg + "30" : t.line}`,
                color: active ? accent.fg : t.ink2,
                fontSize: 12,
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                transition: "background .12s, color .12s, border-color .12s",
              }}
            >
              <span>{f.label}</span>
              <span style={{
                fontSize: 10.5,
                fontWeight: 800,
                fontFeatureSettings: '"tnum"',
                padding: "1px 6px",
                borderRadius: 999,
                background: active ? accent.fg + "22" : t.surface2,
                color: active ? accent.fg : t.ink3,
                minWidth: 18,
                textAlign: "center",
              }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      {isLoading ? (
        <Card pad={28}>
          <div style={{ fontSize: 12.5, color: t.ink3 }}>Loading queue…</div>
        </Card>
      ) : visible.length === 0 ? (
        <Card pad={28}>
          <div style={{ fontSize: 13, color: t.ink2 }}>
            No requests in this status. {filter !== "all" && "Try changing the filter."}
          </div>
        </Card>
      ) : (
        <Card pad={0}>
          <HeaderRow t={t} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
          {visible.map((r) => (
            <Row
              key={r.id}
              req={r}
              t={t}
              onOpen={() => setSelected(r)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ req: r, x: e.clientX, y: e.clientY });
              }}
            />
          ))}
        </Card>
      )}

      <PrequalReviewModal
        open={!!selected}
        onClose={() => setSelected(null)}
        request={selected}
      />

      <AdminPrequalCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />

      {menu ? (
        <ContextMenu
          t={t}
          x={menu.x}
          y={menu.y}
          req={menu.req}
          head={findChainHead(menu.req)}
          onOpen={() => { setSelected(menu.req); setMenu(null); }}
          onOpenLatest={() => { setSelected(findChainHead(menu.req)); setMenu(null); }}
          onPrintLatest={() => { onPrintLatest(menu.req); setMenu(null); }}
        />
      ) : null}
    </div>
  );
}

// Context menu (right-click on a row). Rendered as a portal-less fixed
// container at the cursor — dismiss is handled by the document-level
// mousedown listener in the parent. The menu items are status-aware so
// the operator never sees an action that won't work on this row.
function ContextMenu({
  t,
  x,
  y,
  req,
  head,
  onOpen,
  onOpenLatest,
  onPrintLatest,
}: {
  t: ReturnType<typeof useTheme>["t"];
  x: number;
  y: number;
  req: PrequalRequest;
  head: PrequalRequest;
  onOpen: () => void;
  onOpenLatest: () => void;
  onPrintLatest: () => void;
}) {
  const isSuperseded = req.superseded_by_id != null;
  // Clamp position so the menu doesn't fall off the right / bottom edge
  // of the viewport. Width 240px, ~5 items × 36px tall + padding.
  const MENU_W = 240;
  const MENU_H = 230;
  const left = typeof window !== "undefined" ? Math.min(x, window.innerWidth - MENU_W - 8) : x;
  const top = typeof window !== "undefined" ? Math.min(y, window.innerHeight - MENU_H - 8) : y;

  return (
    <div
      role="menu"
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        left,
        top,
        width: MENU_W,
        background: t.surface,
        border: `1px solid ${t.line}`,
        borderRadius: 10,
        boxShadow: t.shadowLg,
        zIndex: 300,
        padding: 6,
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <MenuHeader t={t} req={req} />
      <MenuItem t={t} icon="docCheck" label={isSuperseded ? "Open this version" : "Open"} onClick={onOpen} />
      {isSuperseded ? (
        <MenuItem t={t} icon="arrowR" label={`Open latest (v${head.version_num})`} onClick={onOpenLatest} />
      ) : null}
      <MenuItem
        t={t}
        icon="docCheck"
        label="Print latest letter"
        sublabel={head.pdf_url ? head.quote_number ?? undefined : "no PDF yet"}
        disabled={!head.pdf_url}
        onClick={onPrintLatest}
      />
    </div>
  );
}

function MenuHeader({ t, req }: { t: ReturnType<typeof useTheme>["t"]; req: PrequalRequest }) {
  return (
    <div style={{
      padding: "6px 10px 8px",
      borderBottom: `1px solid ${t.line}`,
      marginBottom: 4,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase" }}>
        {req.quote_number ?? "Pre-qualification"}
        {(req.version_num ?? 1) > 1 ? <span style={{ color: t.petrol, marginLeft: 6 }}>· v{req.version_num}</span> : null}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: t.ink, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {req.target_property_address}
      </div>
    </div>
  );
}

function MenuItem({
  t,
  icon,
  label,
  sublabel,
  onClick,
  disabled,
}: {
  t: ReturnType<typeof useTheme>["t"];
  icon: React.ComponentProps<typeof Icon>["name"];
  label: string;
  sublabel?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      role="menuitem"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        all: "unset",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 600,
        color: disabled ? t.ink3 : t.ink,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
      }}
      onMouseEnter={(e) => { if (!disabled) (e.currentTarget as HTMLButtonElement).style.background = t.surface2; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
    >
      <Icon name={icon} size={14} />
      <span style={{ flex: 1 }}>{label}</span>
      {sublabel ? <span style={{ fontSize: 10.5, color: t.ink3, fontWeight: 600 }}>{sublabel}</span> : null}
    </button>
  );
}

// 4px color stripe + status column + the rest. Each row's first column
// is a colored stripe per status; the legend stays inside the Status
// pill so the stripe carries the at-a-glance signal.
const GRID_COLS = "4px 110px minmax(0, 2fr) minmax(0, 1fr) 130px 130px 110px 100px 90px";

function statusStripe(t: ReturnType<typeof useTheme>["t"], s: PrequalStatus): string {
  if (s === "approved") return t.profit;
  if (s === "offer_accepted") return t.brand;
  if (s === "rejected") return t.danger;
  if (s === "offer_declined") return t.ink4;
  return t.warn;
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
  return target.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function HeaderRow({
  t,
  sortKey,
  sortDir,
  onSort,
}: {
  t: ReturnType<typeof useTheme>["t"];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const cell = (label: string, key: SortKey) => {
    const active = sortKey === key;
    return (
      <button
        onClick={() => onSort(key)}
        style={{
          all: "unset",
          cursor: "pointer",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: active ? t.brand : t.ink3,
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {label}
        {active ? <span style={{ fontSize: 9 }}>{sortDir === "asc" ? "▲" : "▼"}</span> : null}
      </button>
    );
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: GRID_COLS,
        gap: 12,
        padding: "12px 16px 12px 12px",
        borderBottom: `1px solid ${t.line}`,
        background: t.surface2,
      }}
    >
      <div />
      <div>{cell("Status", "status")}</div>
      <div>{cell("Property", "address")}</div>
      <div>{cell("Issued to", "entity")}</div>
      <div>{cell("Requested", "requested")}</div>
      <div>{cell("Approved", "approved")}</div>
      <div>{cell("LTV", "ltv")}</div>
      <div>{cell("Closing", "closing")}</div>
      <div>{cell("Submitted", "submitted")}</div>
    </div>
  );
}

function Row({
  req,
  t,
  onOpen,
  onContextMenu,
}: {
  req: PrequalRequest;
  t: ReturnType<typeof useTheme>["t"];
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
  // Green well within cap, amber close, red over.
  const ltvColor = ltv > ltvCap + 0.05
    ? t.danger
    : ltv > ltvCap * 0.92
      ? t.warn
      : t.profit;

  const s = statusInfo(t, req.status);
  const isSuperseded = req.superseded_by_id != null;
  const isRevision = (req.version_num ?? 1) > 1;
  const stripe = isSuperseded ? t.ink4 : statusStripe(t, req.status);
  const closingRel = relativeDays(req.expected_closing_date);
  const submittedRel = relativeDays(req.created_at);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onContextMenu={onContextMenu}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      style={{
        display: "grid",
        gridTemplateColumns: GRID_COLS,
        gap: 12,
        padding: "16px 16px 16px 12px",
        borderBottom: `1px solid ${t.line}`,
        alignItems: "center",
        fontSize: 13,
        color: isSuperseded ? t.ink3 : t.ink,
        cursor: "pointer",
        transition: "background 0.12s",
        opacity: isSuperseded ? 0.55 : 1,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = t.surface2; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
    >
      {/* Status stripe — colored left border. Carries the status signal
          even when the operator is scanning quickly without reading pills. */}
      <div style={{ alignSelf: "stretch", background: stripe, borderRadius: 2 }} />

      <div>
        <Pill bg={s.bg} color={s.fg}>{s.label}</Pill>
        {req.quote_number ? (
          <div style={{ fontSize: 10, color: t.ink3, fontWeight: 600, marginTop: 6, fontFeatureSettings: '"tnum"', display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ textDecoration: isSuperseded ? "line-through" : undefined }}>
              {req.quote_number}
            </span>
            {isRevision ? (
              <span style={{
                fontSize: 9,
                fontWeight: 800,
                color: t.petrol,
                background: t.petrolSoft,
                padding: "1px 5px",
                borderRadius: 4,
                letterSpacing: 0.4,
              }}>
                v{req.version_num}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 14.5,
          fontWeight: 700,
          color: isSuperseded ? t.ink3 : t.ink,
          letterSpacing: -0.1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {req.target_property_address}
        </div>
        <div style={{ fontSize: 10.5, color: t.ink3, fontWeight: 600, marginTop: 3, textTransform: "uppercase", letterSpacing: 0.7 }}>
          {PREQUAL_LOAN_TYPE_LABELS[req.loan_type]?.title ?? req.loan_type}
        </div>
      </div>

      <div style={{ fontSize: 12, color: req.borrower_entity ? t.ink2 : t.ink4, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontStyle: req.borrower_entity ? "normal" : "italic" }}>
        {req.borrower_entity ?? "Entity TBD"}
      </div>

      <div style={{ fontSize: 13, fontFeatureSettings: '"tnum"', color: t.ink2 }}>
        {QC_FMT.usd(requested, 0)}
      </div>

      <div style={{ fontSize: 13, fontFeatureSettings: '"tnum"' }}>
        {approved != null ? (
          <span style={{
            color: approved !== requested ? t.profit : t.ink,
            fontWeight: approved !== requested ? 800 : 600,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}>
            {approved > requested ? <Icon name="arrowR" size={11} /> : null}
            {QC_FMT.usd(approved, 0)}
          </span>
        ) : (
          <span style={{ color: t.ink4 }}>—</span>
        )}
      </div>

      {/* LTV bar — width is share of the matrix cap; color stages green→amber→red. */}
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 11.5,
          fontWeight: 700,
          fontFeatureSettings: '"tnum"',
          color: ltvColor,
          marginBottom: 4,
        }}>
          {ltv.toFixed(1)}%
        </div>
        <div style={{
          height: 5,
          width: "100%",
          background: t.surface2,
          borderRadius: 3,
          overflow: "hidden",
        }}>
          <div style={{
            height: "100%",
            width: `${Math.max(2, Math.round(ltvPctOfCap * 100))}%`,
            background: ltvColor,
            transition: "width .25s ease, background .25s",
          }} />
        </div>
      </div>

      <div style={{ minWidth: 0 }}>
        {req.expected_closing_date ? (
          <>
            <div style={{ fontSize: 12, color: t.ink2, fontWeight: 700 }}>
              {closingRel ?? new Date(req.expected_closing_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </div>
            <div style={{ fontSize: 10.5, color: t.ink3, marginTop: 2, fontFeatureSettings: '"tnum"' }}>
              {new Date(req.expected_closing_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </div>
          </>
        ) : (
          <span style={{ color: t.ink4 }}>—</span>
        )}
      </div>

      <div style={{ fontSize: 12, color: t.ink3, fontFeatureSettings: '"tnum"' }}>
        {submittedRel ?? "—"}
      </div>
    </div>
  );
}
