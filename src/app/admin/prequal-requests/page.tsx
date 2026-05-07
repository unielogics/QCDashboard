"use client";

// Firm-wide pre-qualification queue. Operator-only. Sort: pending first,
// then by expected closing date (urgent ones float). Click a row → review
// modal opens.

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
import type { PrequalRequest, PrequalStatus } from "@/lib/types";

const FILTERS: { id: PrequalStatus | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

export default function AdminPrequalQueuePage() {
  const { t } = useTheme();
  const profile = useActiveProfile();
  const router = useRouter();
  const [filter, setFilter] = useState<PrequalStatus | "all">("pending");
  const [selected, setSelected] = useState<PrequalRequest | null>(null);

  const { data: requests = [], isLoading } = useAdminPrequalQueue(
    filter === "all" ? undefined : filter,
  );

  const counts = useMemo(() => {
    const c: Record<PrequalStatus, number> = { pending: 0, approved: 0, rejected: 0 };
    for (const r of requests) c[r.status]++;
    return c;
  }, [requests]);

  // Borrower-only or unknown role → kick to home.
  if (profile.role === Role.CLIENT) {
    return (
      <div style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
        <Card pad={28}>
          <div style={{ fontSize: 16, fontWeight: 800, color: t.ink }}>Operator-only</div>
          <div style={{ fontSize: 13, color: t.ink2, marginTop: 6, lineHeight: 1.5 }}>
            The pre-qualification queue is for underwriters. Borrowers should submit
            requests from the Simulator's My Loans tab.
          </div>
          <button onClick={() => router.push("/")} style={{ ...qcBtn(t), marginTop: 14 }}>
            Back to dashboard
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 1500, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: t.ink, letterSpacing: -0.4 }}>Pre-Qualification Queue</h1>
        <div style={{ fontSize: 13, color: t.ink3, marginTop: 4 }}>
          Borrower requests pending underwriter review. Sorted with the closest
          closing dates on top so urgent deals float.
        </div>
      </div>

      {/* Count chips */}
      <div style={{ display: "flex", gap: 12 }}>
        <CountChip t={t} label="Pending" value={counts.pending} accent={t.warn} bg={t.warnBg} />
        <CountChip t={t} label="Approved" value={counts.approved} accent={t.profit} bg={t.profitBg} />
        <CountChip t={t} label="Rejected" value={counts.rejected} accent={t.danger} bg={t.dangerBg} />
      </div>

      {/* Filter pills */}
      <div style={{ display: "flex", gap: 6 }}>
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
      ) : requests.length === 0 ? (
        <Card pad={28}>
          <div style={{ fontSize: 13, color: t.ink2 }}>
            No requests in this status. {filter !== "all" && "Try changing the filter."}
          </div>
        </Card>
      ) : (
        <Card pad={0}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "120px minmax(0, 2fr) 130px 130px 110px 110px 80px",
              gap: 10,
              padding: "12px 16px",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: t.ink3,
              borderBottom: `1px solid ${t.line}`,
              background: t.surface2,
            }}
          >
            <div>Status</div>
            <div>Property</div>
            <div>Requested</div>
            <div>Approved</div>
            <div>LTV</div>
            <div>Closing</div>
            <div>Action</div>
          </div>
          {requests.map((r) => (
            <Row
              key={r.id}
              req={r}
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

function Row({ req, onOpen }: { req: PrequalRequest; onOpen: () => void }) {
  const { t } = useTheme();
  const purchase = Number(req.purchase_price);
  const requested = Number(req.requested_loan_amount);
  const approved = req.approved_loan_amount != null ? Number(req.approved_loan_amount) : null;
  const ltv = purchase > 0 ? (requested / purchase) * 100 : 0;

  const statusInfo = (() => {
    if (req.status === "approved") return { label: "Approved", bg: t.profitBg, fg: t.profit };
    if (req.status === "rejected") return { label: "Rejected", bg: t.dangerBg, fg: t.danger };
    return { label: "Pending", bg: t.warnBg, fg: t.warn };
  })();

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "120px minmax(0, 2fr) 130px 130px 110px 110px 80px",
        gap: 10,
        padding: "14px 16px",
        borderBottom: `1px solid ${t.line}`,
        alignItems: "center",
        fontSize: 13,
        color: t.ink,
      }}
    >
      <div>
        <Pill bg={statusInfo.bg} color={statusInfo.fg}>{statusInfo.label}</Pill>
      </div>
      <div style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 700 }}>
        {req.target_property_address}
        <div style={{ fontSize: 10.5, color: t.ink3, fontWeight: 600, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.6 }}>
          {req.loan_type === "dscr" ? "DSCR rental" : "Bridge"}
        </div>
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
      <div>
        <button
          onClick={onOpen}
          style={{
            all: "unset",
            cursor: "pointer",
            padding: "6px 12px",
            borderRadius: 7,
            background: t.brandSoft,
            color: t.brand,
            fontSize: 11.5,
            fontWeight: 700,
          }}
        >
          Open <Icon name="arrowR" size={11} />
        </button>
      </div>
    </div>
  );
}
