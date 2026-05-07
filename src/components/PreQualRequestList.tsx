"use client";

// Borrower-side list of their pre-qualification requests. Status badges:
//   pending  — amber "Under review"
//   approved — green "Ready" + Download Letter button
//   rejected — red "Returned" + reviewer notes shown italicized
//
// Used inside the simulator's My Loans tab AND the borrower view of the
// loan detail page.

import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtnPrimary } from "@/components/design-system/buttons";
import { QC_FMT } from "@/components/design-system/tokens";
import type { PrequalRequest } from "@/lib/types";

export function PreQualRequestList({
  requests,
  isLoading,
  emptyState,
}: {
  requests: PrequalRequest[];
  isLoading?: boolean;
  emptyState?: React.ReactNode;
}) {
  const { t } = useTheme();

  if (isLoading) {
    return (
      <Card pad={20}>
        <div style={{ fontSize: 12.5, color: t.ink3 }}>Loading requests…</div>
      </Card>
    );
  }

  if (requests.length === 0) {
    return (
      <Card pad={20}>
        <div style={{ fontSize: 13, color: t.ink2, lineHeight: 1.5 }}>
          {emptyState ?? "No pre-qualification requests yet."}
        </div>
      </Card>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {requests.map((r) => (
        <RequestRow key={r.id} req={r} />
      ))}
    </div>
  );
}

function RequestRow({ req }: { req: PrequalRequest }) {
  const { t } = useTheme();
  const statusInfo = (() => {
    if (req.status === "approved") return { label: "Ready", bg: t.profitBg, fg: t.profit, icon: "check" as const };
    if (req.status === "rejected") return { label: "Returned", bg: t.dangerBg, fg: t.danger, icon: "x" as const };
    return { label: "Under review", bg: t.warnBg, fg: t.warn, icon: "audit" as const };
  })();

  const requestedAmount = Number(req.requested_loan_amount);
  const approvedAmount = req.approved_loan_amount != null ? Number(req.approved_loan_amount) : null;
  const showApproved = approvedAmount != null && approvedAmount !== requestedAmount;
  const programLabel = req.loan_type === "dscr" ? "DSCR Rental (30-yr fixed)" : "Bridge / Purchase";

  return (
    <Card pad={16}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Pill bg={statusInfo.bg} color={statusInfo.fg}>
              <Icon name={statusInfo.icon} size={11} stroke={3} /> {statusInfo.label}
            </Pill>
            <Pill>{programLabel}</Pill>
            {req.expected_closing_date ? (
              <span style={{ fontSize: 11, color: t.ink3 }}>
                Close {new Date(req.expected_closing_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </span>
            ) : null}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.ink, marginTop: 6, letterSpacing: -0.2 }}>
            {req.target_property_address}
          </div>
          <div style={{ fontSize: 12, color: t.ink2, marginTop: 4, fontFeatureSettings: '"tnum"' }}>
            Requested {QC_FMT.usd(requestedAmount, 0)} of {QC_FMT.usd(Number(req.purchase_price), 0)}
            {showApproved ? (
              <span style={{ color: t.profit, fontWeight: 700 }}>
                {" "}· approved at {QC_FMT.usd(approvedAmount as number, 0)}
              </span>
            ) : null}
          </div>
          {req.admin_notes ? (
            <div
              style={{
                marginTop: 10,
                padding: "8px 12px",
                borderLeft: `3px solid ${req.status === "rejected" ? t.danger : t.petrol}`,
                background: t.surface2,
                fontSize: 12,
                fontStyle: "italic",
                color: t.ink2,
                lineHeight: 1.45,
              }}
            >
              <strong style={{ fontStyle: "normal", color: t.ink }}>Underwriter notes:</strong>{" "}
              {req.admin_notes}
            </div>
          ) : null}
        </div>

        {req.status === "approved" && req.pdf_url ? (
          <a
            href={req.pdf_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              ...qcBtnPrimary(t),
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              flexShrink: 0,
            }}
          >
            <Icon name="docCheck" size={13} /> Download Letter
          </a>
        ) : null}
      </div>
    </Card>
  );
}
