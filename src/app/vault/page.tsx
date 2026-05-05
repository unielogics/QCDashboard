"use client";

// Vault — borrower's personal document vault. Distinct from /documents which
// is the operator-side per-loan request queue. Two tabs:
//   • Subject Property — docs tied to the borrower's most-recent loan
//   • REO Schedule — docs tied to all funded (closed) loans
//
// For operators we keep the same shell but group by client so the same route
// works without role-gating in the sidebar.

import Link from "next/link";
import { useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel, VerifiedBadge } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useCurrentUser, useDocuments, useLoans } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import type { Document, Loan } from "@/lib/types";

const TAB_SUBJECT = "subject";
const TAB_REO = "reo";

export default function VaultPage() {
  const { t } = useTheme();
  const { data: user } = useCurrentUser();
  const { data: loans = [] } = useLoans();
  const { data: docs = [] } = useDocuments();
  const [tab, setTab] = useState<typeof TAB_SUBJECT | typeof TAB_REO>(TAB_SUBJECT);

  const isClient = user?.role === Role.CLIENT;

  // Subject = docs tied to the most recent in-flight loan; REO = all funded.
  const inFlight = loans.filter((l) => l.stage !== "funded");
  const funded = loans.filter((l) => l.stage === "funded");
  const subjectLoanIds = new Set(inFlight.map((l) => l.id));
  const reoLoanIds = new Set(funded.map((l) => l.id));

  const filtered = useMemo(() => {
    const ids = tab === TAB_SUBJECT ? subjectLoanIds : reoLoanIds;
    return docs.filter((d) => ids.has(d.loan_id));
  }, [docs, tab, subjectLoanIds, reoLoanIds]);

  const loanById = Object.fromEntries(loans.map((l) => [l.id, l] as const));

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: t.ink, letterSpacing: -0.4 }}>Vault</h1>
        <div style={{ fontSize: 13, color: t.ink3, marginTop: 4 }}>
          {isClient
            ? "Your verified document set. Subject Property = the loan in flight; REO = your closed deals."
            : "Borrower-style document view, grouped by loan."}
        </div>
      </div>

      <div style={{ display: "flex", gap: 4 }}>
        <TabButton t={t} active={tab === TAB_SUBJECT} onClick={() => setTab(TAB_SUBJECT)}>
          Subject Property <Pill>{Array.from(subjectLoanIds).reduce((s, id) => s + docs.filter((d) => d.loan_id === id).length, 0)}</Pill>
        </TabButton>
        <TabButton t={t} active={tab === TAB_REO} onClick={() => setTab(TAB_REO)}>
          REO Schedule <Pill>{Array.from(reoLoanIds).reduce((s, id) => s + docs.filter((d) => d.loan_id === id).length, 0)}</Pill>
        </TabButton>
      </div>

      {filtered.length === 0 ? (
        <Card pad={32}>
          <div style={{ textAlign: "center", color: t.ink3, fontSize: 13 }}>
            {tab === TAB_SUBJECT
              ? "No documents in your subject-property vault yet. Documents requested by your broker show up here."
              : "No closed-loan documents yet. They land here once a loan funds."}
          </div>
        </Card>
      ) : (
        <Card pad={0}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 2fr) 140px 120px 120px 120px",
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
            <div>Document</div>
            <div>Category</div>
            <div>Loan</div>
            <div>Received</div>
            <div>Status</div>
          </div>
          {filtered.map((d) => (
            <DocRow key={d.id} doc={d} loan={loanById[d.loan_id]} />
          ))}
        </Card>
      )}
    </div>
  );
}

function TabButton({
  t,
  active,
  onClick,
  children,
}: {
  t: ReturnType<typeof useTheme>["t"];
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        all: "unset",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 16px",
        borderRadius: 10,
        background: active ? t.ink : t.surface2,
        color: active ? t.inverse : t.ink2,
        fontSize: 13,
        fontWeight: 700,
      }}
    >
      {children}
    </button>
  );
}

function DocRow({ doc, loan }: { doc: Document; loan: Loan | undefined }) {
  const { t } = useTheme();
  const kind = doc.status === "verified"
    ? "verified"
    : doc.status === "flagged"
    ? "flagged"
    : "pending";
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 2fr) 140px 120px 120px 120px",
        gap: 10,
        padding: "12px 16px",
        borderBottom: `1px solid ${t.line}`,
        alignItems: "center",
        fontSize: 13,
        color: t.ink,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: t.brandSoft,
            color: t.brand,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon name="doc" size={14} />
        </div>
        <div style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 700 }}>
          {doc.name}
        </div>
      </div>
      <div>
        <Pill>{doc.category ?? "—"}</Pill>
      </div>
      <div>
        {loan ? (
          <Link
            href={`/loans/${loan.id}`}
            style={{
              color: t.petrol,
              textDecoration: "none",
              fontFamily: "ui-monospace, SF Mono, monospace",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {loan.deal_id}
          </Link>
        ) : (
          <span style={{ color: t.ink3 }}>—</span>
        )}
      </div>
      <div style={{ color: t.ink3, fontSize: 12 }}>
        {doc.received_on ? new Date(doc.received_on).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
      </div>
      <div>
        <VerifiedBadge kind={kind} />
      </div>
    </div>
  );
}
