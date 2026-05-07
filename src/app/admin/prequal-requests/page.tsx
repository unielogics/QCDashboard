"use client";

// Firm-wide pre-qualification queue. Operator-only.
//
// Defaults to PENDING-first (the underwriter inbox) but the column
// headers are sortable and the whole row is clickable to open the
// review panel — no need to find the small Open button.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn } from "@/components/design-system/buttons";
import { QC_FMT } from "@/components/design-system/tokens";
import { useActiveProfile } from "@/store/role";
import { Role } from "@/lib/enums.generated";
import { useAdminPrequalQueue } from "@/hooks/useApi";
import { PrequalReviewModal } from "@/components/PrequalReviewModal";
import { PREQUAL_LOAN_TYPE_LABELS, type PrequalRequest, type PrequalStatus } from "@/lib/types";

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
  const [filter, setFilter] = useState<FilterId>("pending");
  const [sortKey, setSortKey] = useState<SortKey>("closing");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selected, setSelected] = useState<PrequalRequest | null>(null);

  // Always pull "all" from the server then filter client-side. Lets the
  // count chips show all-status counts at once.
  const { data: allRequests = [], isLoading } = useAdminPrequalQueue();

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
            The pre-qualification queue is for underwriters. Borrowers should submit
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
      <div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: t.ink, letterSpacing: -0.4 }}>Pre-Qualification Queue</h1>
        <div style={{ fontSize: 13, color: t.ink3, marginTop: 4 }}>
          Click any row to open the review panel. Headers sort the queue.
          Pending always groups to the top regardless of sort direction.
        </div>
      </div>

      {/* Count chips */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <CountChip t={t} label="Pending" value={counts.pending} accent={t.warn} bg={t.warnBg} />
        <CountChip t={t} label="Approved" value={counts.approved} accent={t.profit} bg={t.profitBg} />
        <CountChip t={t} label="Loan opened" value={counts.offer_accepted} accent={t.brand} bg={t.brandSoft} />
        <CountChip t={t} label="Closed" value={counts.offer_declined} accent={t.ink3} bg={t.surface2} />
        <CountChip t={t} label="Rejected" value={counts.rejected} accent={t.danger} bg={t.dangerBg} />
      </div>

      {/* Filter pills */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              style={{
                all: "unset",
                cursor: "pointer",
                padding: "8px 14px",
                borderRadius: 9,
                background: active ? t.ink : t.surface2,
                color: active ? t.inverse : t.ink2,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {f.label}
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
            />
          ))}
        </Card>
      )}

      <PrequalReviewModal
        open={!!selected}
        onClose={() => setSelected(null)}
        request={selected}
      />
    </div>
  );
}

const GRID_COLS = "110px minmax(0, 2fr) minmax(0, 1fr) 120px 120px 80px 100px 110px";

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
        gap: 10,
        padding: "12px 16px",
        borderBottom: `1px solid ${t.line}`,
        background: t.surface2,
      }}
    >
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

function CountChip({
  t,
  label,
  value,
  accent,
  bg,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  value: number;
  accent: string;
  bg: string;
}) {
  return (
    <div style={{ background: bg, borderRadius: 10, padding: "10px 14px", minWidth: 110 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: t.ink3, letterSpacing: 0.8, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function Row({
  req,
  t,
  onOpen,
}: {
  req: PrequalRequest;
  t: ReturnType<typeof useTheme>["t"];
  onOpen: () => void;
}) {
  const purchase = Number(req.purchase_price);
  const requested = Number(req.requested_loan_amount);
  const approved = req.approved_loan_amount != null ? Number(req.approved_loan_amount) : null;
  // Show LTV based on approved when present (more honest for the operator)
  // and on requested when still pending.
  const ltvBase = approved ?? requested;
  const ltv = purchase > 0 ? (ltvBase / purchase) * 100 : 0;

  const s = statusInfo(t, req.status);
  const submittedAt = new Date(req.created_at);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      style={{
        display: "grid",
        gridTemplateColumns: GRID_COLS,
        gap: 10,
        padding: "14px 16px",
        borderBottom: `1px solid ${t.line}`,
        alignItems: "center",
        fontSize: 13,
        color: t.ink,
        cursor: "pointer",
        transition: "background 0.12s",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = t.surface2; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
    >
      <div>
        <Pill bg={s.bg} color={s.fg}>{s.label}</Pill>
        {req.quote_number ? (
          <div style={{ fontSize: 10, color: t.ink3, fontWeight: 600, marginTop: 4, fontFeatureSettings: '"tnum"' }}>
            {req.quote_number}
          </div>
        ) : null}
      </div>
      <div style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        <div style={{ fontWeight: 700 }}>{req.target_property_address}</div>
        <div style={{ fontSize: 10.5, color: t.ink3, fontWeight: 600, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.6 }}>
          {PREQUAL_LOAN_TYPE_LABELS[req.loan_type]?.title ?? req.loan_type}
        </div>
      </div>
      <div style={{ fontSize: 12, color: req.borrower_entity ? t.ink2 : t.ink4, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {req.borrower_entity ?? "TBD"}
      </div>
      <div style={{ fontSize: 12, fontFeatureSettings: '"tnum"' }}>{QC_FMT.usd(requested, 0)}</div>
      <div style={{ fontSize: 12, fontFeatureSettings: '"tnum"' }}>
        {approved != null ? (
          <span style={{ color: approved !== requested ? t.profit : t.ink, fontWeight: approved !== requested ? 700 : 400 }}>
            {QC_FMT.usd(approved, 0)}
          </span>
        ) : (
          <span style={{ color: t.ink3 }}>—</span>
        )}
      </div>
      <div style={{ fontSize: 12, fontFeatureSettings: '"tnum"' }}>{ltv.toFixed(1)}%</div>
      <div style={{ fontSize: 12, color: t.ink2 }}>
        {req.expected_closing_date
          ? new Date(req.expected_closing_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
          : <span style={{ color: t.ink4 }}>—</span>}
      </div>
      <div style={{ fontSize: 11.5, color: t.ink3, fontFeatureSettings: '"tnum"' }}>
        {submittedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        <Icon name="arrowR" size={11} />
      </div>
    </div>
  );
}
