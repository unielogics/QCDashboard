"use client";

// Per-loan pre-qualification tab. Operator drill-down from the loan
// detail page — shows the requests scoped to this single loan + the
// same review modal the firm-wide queue uses.

import { useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtnPrimary } from "@/components/design-system/buttons";
import { QC_FMT } from "@/components/design-system/tokens";
import { useLoanPrequalRequests } from "@/hooks/useApi";
import { PrequalReviewModal } from "@/components/PrequalReviewModal";
import { PREQUAL_LOAN_TYPE_LABELS, type Loan, type PrequalRequest } from "@/lib/types";

export function PrequalTab({ loan }: { loan: Loan }) {
  const { t } = useTheme();
  const { data: requests = [], isLoading } = useLoanPrequalRequests(loan.id);
  const [selected, setSelected] = useState<PrequalRequest | null>(null);

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
              gridTemplateColumns: "120px minmax(0, 2fr) 130px 130px 100px 90px 90px",
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
            <Row key={r.id} req={r} onOpen={() => setSelected(r)} />
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
        gridTemplateColumns: "120px minmax(0, 2fr) 130px 130px 100px 90px 90px",
        gap: 10,
        padding: "14px 16px",
        borderBottom: `1px solid ${t.line}`,
        alignItems: "center",
        fontSize: 13,
        color: t.ink,
      }}
    >
      <div><Pill bg={statusInfo.bg} color={statusInfo.fg}>{statusInfo.label}</Pill></div>
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
      <div>
        {req.status === "approved" && req.pdf_url ? (
          <a
            href={req.pdf_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...qcBtnPrimary(t), padding: "6px 10px", fontSize: 11, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            <Icon name="docCheck" size={11} /> PDF
          </a>
        ) : (
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
            Review
          </button>
        )}
      </div>
    </div>
  );
}
