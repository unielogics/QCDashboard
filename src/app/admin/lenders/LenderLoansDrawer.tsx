"use client";

// Right-side drawer surfaced from a lender row on the Lenders tab.
// Lists every loan currently connected to this lender PLUS every
// loan that's connectable (stage in PREQUALIFIED/COLLECTING_DOCS,
// product matches). Each row links into the loan page with a focus
// hint so the LenderConnectCard auto-scrolls into view.

import Link from "next/link";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useLenderLoans } from "@/hooks/useApi";
import type { Lender, LenderLoanSummary } from "@/lib/types";

interface Props {
  lender: Lender | null;
  onClose: () => void;
}

export function LenderLoansDrawer({ lender, onClose }: Props) {
  const { t } = useTheme();
  const { data, isLoading, isError, error } = useLenderLoans(lender?.id ?? null);

  if (!lender) return null;

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(11, 22, 41, 0.45)",
          zIndex: 60,
        }}
      />
      <aside
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(560px, 100vw)",
          background: t.surface,
          borderLeft: `1px solid ${t.line}`,
          zIndex: 61,
          overflowY: "auto",
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: 1.6,
                textTransform: "uppercase",
                color: t.petrol,
              }}
            >
              Lender loans
            </div>
            <h2
              style={{
                margin: "2px 0 0",
                fontSize: 19,
                fontWeight: 800,
                color: t.ink,
                letterSpacing: -0.4,
              }}
            >
              {lender.name}
            </h2>
            {lender.contact_email || lender.submission_email ? (
              <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 2 }}>
                {lender.contact_email || lender.submission_email}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              all: "unset",
              cursor: "pointer",
              padding: 8,
              borderRadius: 8,
              border: `1px solid ${t.line}`,
              color: t.ink2,
            }}
          >
            <Icon name="close" size={12} stroke={3} />
          </button>
        </div>

        {isLoading ? (
          <Card pad={18}>
            <div style={{ fontSize: 12.5, color: t.ink3 }}>Loading loans…</div>
          </Card>
        ) : isError ? (
          <Card pad={18}>
            <div style={{ fontSize: 12.5, color: t.danger }}>
              Couldn’t load loans: {(error as Error)?.message ?? "Unknown error"}
            </div>
          </Card>
        ) : data ? (
          <>
            <Section
              t={t}
              title="Connected"
              hint="Loans where this lender is already on file."
              loans={data.connected}
              emptyText="No loans connected to this lender yet."
            />
            <Section
              t={t}
              title="Connectable"
              hint="Loans in PREQUALIFIED or COLLECTING_DOCS whose product matches this lender."
              loans={data.connectable}
              emptyText="No matching loans waiting for connection."
            />
          </>
        ) : null}
      </aside>
    </>
  );
}

function Section({
  t,
  title,
  hint,
  loans,
  emptyText,
}: {
  t: ReturnType<typeof useTheme>["t"];
  title: string;
  hint: string;
  loans: LenderLoanSummary[];
  emptyText: string;
}) {
  return (
    <Card pad={0}>
      <div
        style={{
          padding: "12px 16px",
          borderBottom: `1px solid ${t.line}`,
        }}
      >
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: 1.4,
            textTransform: "uppercase",
            color: t.ink3,
          }}
        >
          {title} ({loans.length})
        </div>
        <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 4 }}>{hint}</div>
      </div>
      <div>
        {loans.length === 0 ? (
          <div style={{ padding: 16, fontSize: 12.5, color: t.ink4 }}>{emptyText}</div>
        ) : (
          loans.map((l) => (
            <Link
              key={l.id}
              href={`/loans/${l.id}?focus=lender-connect`}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div
                style={{
                  padding: "12px 16px",
                  borderTop: `1px solid ${t.line}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  cursor: "pointer",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, color: t.ink, fontSize: 13 }}>
                    {l.address || l.deal_id}
                  </div>
                  <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 2 }}>
                    {l.deal_id} · {l.type} · {l.stage}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {l.connected ? (
                    <Pill bg={t.profitBg} color={t.profit}>Connected</Pill>
                  ) : (
                    <Pill bg={t.warnBg} color={t.warn}>Connectable</Pill>
                  )}
                  <Icon name="chevR" size={12} stroke={3} />
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </Card>
  );
}
