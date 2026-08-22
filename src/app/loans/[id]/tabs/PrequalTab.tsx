"use client";

// Per-loan pre-qualification tab. Operator drill-down from the loan
// detail page — shows the requests scoped to this single loan + the
// same review modal the firm-wide queue uses.
//
// Styling lives in globals.css / app-extras.css. The list is a real
// `<table class="tbl">` now: the rows used to be `role="button"` divs, and a
// table row cannot be focused or Enter-activated, so the row's keyboard
// affordance moved onto a real button on the property cell (the row keeps its
// click and its right-click). The cursor-anchored menu is `.popmenu.atcursor`.

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/design-system/Icon";
import { QC_FMT } from "@/components/design-system/tokens";
import { useLoanPrequalRequests } from "@/hooks/useApi";
import { PrequalReviewModal } from "@/components/PrequalReviewModal";
import { PREQUAL_LOAN_TYPE_LABELS, type Loan, type PrequalRequest } from "@/lib/types";
import { CellChip, Linky, Panel, Table, Td, cx, type ChipTone } from "@/components/ds";

export function PrequalTab({ loan }: { loan: Loan }) {
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
    <div className="grid">
      <Panel
        title="Pre-qualification requests for this loan"
        actions={pendingCount > 0 ? <CellChip tone="warn">{pendingCount} pending</CellChip> : undefined}
      >
        <h2>{requests.length} {requests.length === 1 ? "request" : "requests"}</h2>
        <p className="sub">
          The borrower-submitted pre-qual requests tied to this loan. Click a row
          to review, override the approved purchase price or loan amount, leave
          notes the borrower will see, and either approve (PDF rendered) or
          reject (with reason).
        </p>
      </Panel>

      {isLoading ? (
        <Panel>
          <span className="sub">Loading…</span>
        </Panel>
      ) : requests.length === 0 ? (
        <Panel>
          <span className="sub">No pre-qualification requests on this loan yet.</span>
        </Panel>
      ) : (
        <Panel noPad>
          <Table
            caption="Pre-qualification requests on this loan"
            cols={[
              { label: "Status", width: 130 },
              { label: "Property" },
              { label: "Requested", width: 130 },
              { label: "Approved", width: 130 },
              { label: "LTV", width: 100 },
              { label: "Closing", width: 100 },
            ]}
          >
            {requests.map((r) => (
              <PrequalRow
                key={r.id}
                req={r}
                onOpen={() => setSelected(r)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ req: r, x: e.clientX, y: e.clientY });
                }}
              />
            ))}
          </Table>
        </Panel>
      )}

      <PrequalReviewModal
        open={!!selected}
        onClose={() => setSelected(null)}
        request={selected}
      />

      {menu ? (
        <TabContextMenu
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
  x,
  y,
  req,
  head,
  onOpen,
  onOpenLatest,
  onPrintLatest,
}: {
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
      className="popmenu atcursor"
      onMouseDown={(e) => e.stopPropagation()}
      // Measured geometry: the menu opens where the pointer is, clamped to the
      // viewport. `.atcursor` hands `left`/`top`/`width` to the caller precisely
      // so these three can live here and nothing else has to.
      style={{ left, top, width: MENU_W }}
    >
      <div className="mhd">
        <div className="lbl">
          {req.quote_number ?? "Pre-qualification"}
          {(req.version_num ?? 1) > 1 ? <> · v{req.version_num}</> : null}
        </div>
        <div className="trunc"><strong>{req.target_property_address}</strong></div>
      </div>
      <hr className="hr" />
      <TabMenuItem icon="docCheck" label={isSuperseded ? "Open this version" : "Open"} onClick={onOpen} />
      {isSuperseded ? (
        <TabMenuItem icon="arrowR" label={`Open latest (v${head.version_num})`} onClick={onOpenLatest} />
      ) : null}
      <TabMenuItem
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
  icon,
  label,
  sublabel,
  onClick,
  disabled,
}: {
  icon: React.ComponentProps<typeof Icon>["name"];
  label: string;
  sublabel?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className="mi"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      <span className="row">
        <Icon name={icon} size={14} />
        {label}
      </span>
      {sublabel ? <small>{sublabel}</small> : null}
    </button>
  );
}

function PrequalRow({
  req,
  onOpen,
  onContextMenu,
}: {
  req: PrequalRequest;
  onOpen: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const purchase = Number(req.purchase_price);
  const requested = Number(req.requested_loan_amount);
  const approved = req.approved_loan_amount != null ? Number(req.approved_loan_amount) : null;
  const ltv = purchase > 0 ? (requested / purchase) * 100 : 0;
  const isSuperseded = req.superseded_by_id != null;
  const isRevision = (req.version_num ?? 1) > 1;
  const status: { label: string; tone: ChipTone } =
    req.status === "approved" ? { label: "Approved", tone: "ok" }
      : req.status === "rejected" ? { label: "Rejected", tone: "bad" }
        : { label: "Pending", tone: "warn" };

  return (
    // `.done` dims a superseded row the way `.rung.done` dims a completed
    // ladder step — it is still openable and still printable, just retired.
    // The row keeps its click and right-click; the KEYBOARD path is the real
    // button on the property cell, because a <tr> cannot carry one.
    <tr
      className={cx(isSuperseded && "done")}
      onClick={onOpen}
      onContextMenu={onContextMenu}
      style={{ cursor: "pointer" }}
    >
      <Td>
        <CellChip tone={status.tone}>{status.label}</CellChip>
        {isRevision || isSuperseded ? (
          <div className="row">
            {req.quote_number ? (
              isSuperseded
                ? <s className="sub num">{req.quote_number}</s>
                : <span className="sub num">{req.quote_number}</span>
            ) : null}
            {isRevision ? <CellChip tone="pet">v{req.version_num}</CellChip> : null}
          </div>
        ) : null}
      </Td>
      <Td>
        <Linky
          className="trunc"
          onClick={(e) => { e.stopPropagation(); onOpen(); }}
        >
          {req.target_property_address}
        </Linky>
        <div className="lbl">
          {PREQUAL_LOAN_TYPE_LABELS[req.loan_type]?.title ?? req.loan_type}
        </div>
      </Td>
      <Td className="num">{QC_FMT.usd(requested, 0)}</Td>
      <Td className="num">
        {approved != null ? QC_FMT.usd(approved, 0) : <span className="sub">—</span>}
      </Td>
      <Td className="num">{ltv.toFixed(1)}%</Td>
      <Td>
        {req.expected_closing_date
          ? new Date(req.expected_closing_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
          : <span className="sub">—</span>}
      </Td>
    </tr>
  );
}
