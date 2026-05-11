"use client";

// Per-loan pre-qualification tab. Operator drill-down from the loan
// detail page — shows the requests scoped to this single loan + the
// same review modal the firm-wide queue uses.

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { QC_FMT } from "@/components/design-system/tokens";
import { useLoanPrequalRequests } from "@/hooks/useApi";
import { PrequalReviewModal } from "@/components/PrequalReviewModal";
import { PREQUAL_LOAN_TYPE_LABELS, type Loan, type PrequalRequest } from "@/lib/types";

export function PrequalTab({ loan }: { loan: Loan }) {
  const { t } = useTheme();
  const { data: requests = [], isLoading } = useLoanPrequalRequests(loan.id);
  const [selected, setSelected] = useState<PrequalRequest | null>(null);
  const [menu, setMenu] = useState<{ req: PrequalRequest; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!menu) return;
    const dismiss = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(null); };
    window.addEventListener("mousedown", dismiss);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", dismiss);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const requestById = useMemo(() => {
    const m = new Map<string, PrequalRequest>();
    for (const r of requests) m.set(r.id, r);
    return m;
  }, [requests]);

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
      setSelected(head);
    }
  };

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card pad={20}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase" }}>
              Pre-qualification requests for this loan
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: t.ink, marginTop: 4 }}>
              {requests.length} {requests.length === 1 ? "request" : "requests"}
              {pendingCount > 0 && (
                <span style={{ marginLeft: 10 }}>
                  <Pill bg={t.warnBg} color={t.warn}>{pendingCount} pending</Pill>
                </span>
              )}
            </div>
            <div style={{ fontSize: 12.5, color: t.ink2, marginTop: 6, lineHeight: 1.5, maxWidth: 560 }}>
              The borrower-submitted pre-qual requests tied to this loan. Click a row
              to review, override the approved purchase price or loan amount, leave
              notes the borrower will see, and either approve (PDF rendered) or
              reject (with reason).
            </div>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <Card pad={28}>
          <div style={{ fontSize: 12.5, color: t.ink3 }}>Loading…</div>
        </Card>
      ) : requests.length === 0 ? (
        <Card pad={28}>
          <div style={{ fontSize: 13, color: t.ink2 }}>
            No pre-qualification requests on this loan yet.
          </div>
        </Card>
      ) : (
        <Card pad={0}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "120px minmax(0, 2fr) 130px 130px 100px 90px",
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
          </div>
          {requests.map((r) => (
            <Row
              key={r.id}
              req={r}
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

      {menu ? (
        <TabContextMenu
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

function TabContextMenu({
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
  const MENU_W = 240;
  const MENU_H = 200;
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
      <div style={{ padding: "6px 10px 8px", borderBottom: `1px solid ${t.line}`, marginBottom: 4 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase" }}>
          {req.quote_number ?? "Pre-qualification"}
          {(req.version_num ?? 1) > 1 ? <span style={{ color: t.petrol, marginLeft: 6 }}>· v{req.version_num}</span> : null}
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: t.ink, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {req.target_property_address}
        </div>
      </div>
      <TabMenuItem t={t} icon="docCheck" label={isSuperseded ? "Open this version" : "Open"} onClick={onOpen} />
      {isSuperseded ? (
        <TabMenuItem t={t} icon="arrowR" label={`Open latest (v${head.version_num})`} onClick={onOpenLatest} />
      ) : null}
      <TabMenuItem
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

function TabMenuItem({
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

function Row({
  req,
  onOpen,
  onContextMenu,
}: {
  req: PrequalRequest;
  onOpen: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const { t } = useTheme();
  const purchase = Number(req.purchase_price);
  const requested = Number(req.requested_loan_amount);
  const approved = req.approved_loan_amount != null ? Number(req.approved_loan_amount) : null;
  const ltv = purchase > 0 ? (requested / purchase) * 100 : 0;
  const isSuperseded = req.superseded_by_id != null;
  const isRevision = (req.version_num ?? 1) > 1;
  const statusInfo = (() => {
    if (req.status === "approved") return { label: "Approved", bg: t.profitBg, fg: t.profit };
    if (req.status === "rejected") return { label: "Rejected", bg: t.dangerBg, fg: t.danger };
    return { label: "Pending", bg: t.warnBg, fg: t.warn };
  })();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onContextMenu={onContextMenu}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      style={{
        display: "grid",
        gridTemplateColumns: "120px minmax(0, 2fr) 130px 130px 100px 90px",
        gap: 10,
        padding: "14px 16px",
        borderBottom: `1px solid ${t.line}`,
        alignItems: "center",
        fontSize: 13,
        color: isSuperseded ? t.ink3 : t.ink,
        opacity: isSuperseded ? 0.6 : 1,
        cursor: "pointer",
        transition: "background 0.12s",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = t.surface2; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
    >
      <div>
        <Pill bg={statusInfo.bg} color={statusInfo.fg}>{statusInfo.label}</Pill>
        {isRevision || isSuperseded ? (
          <div style={{ fontSize: 10, color: t.ink3, fontWeight: 600, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
            {req.quote_number ? (
              <span style={{ textDecoration: isSuperseded ? "line-through" : undefined, fontFeatureSettings: '"tnum"' }}>
                {req.quote_number}
              </span>
            ) : null}
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
      <div style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 700 }}>
        {req.target_property_address}
        <div style={{ fontSize: 10.5, color: t.ink3, fontWeight: 600, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.6 }}>
          {PREQUAL_LOAN_TYPE_LABELS[req.loan_type]?.title ?? req.loan_type}
        </div>
      </div>
      <div style={{ fontSize: 12, fontFeatureSettings: '"tnum"' }}>{QC_FMT.usd(requested, 0)}</div>
      <div style={{ fontSize: 12, fontFeatureSettings: '"tnum"' }}>
        {approved != null ? QC_FMT.usd(approved, 0) : <span style={{ color: t.ink3 }}>—</span>}
      </div>
      <div style={{ fontSize: 12, fontFeatureSettings: '"tnum"' }}>{ltv.toFixed(1)}%</div>
      <div style={{ fontSize: 12, color: t.ink2 }}>
        {req.expected_closing_date
          ? new Date(req.expected_closing_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
          : <span style={{ color: t.ink4 }}>—</span>}
      </div>
    </div>
  );
}
