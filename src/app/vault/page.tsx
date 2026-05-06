"use client";

// Vault — borrower's personal document vault. Mirrors qcmobile's Vault tab:
// two sections by Document.category:
//   • Experience      — proof of past deals (HUDs, closings, deeds, prior leases)
//   • Active assets   — currently-owned real estate (bank notes, current leases,
//                       insurance, tax bills)
//
// For operators we keep the same shell — they get a borrower-style view of
// the documents the connected borrower (or themselves) has uploaded.

import Link from "next/link";
import { useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel, VerifiedBadge } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useCurrentUser, useDocuments, useLoans } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import type { Document, Loan } from "@/lib/types";

type VaultTab = "experience" | "active_asset";

// Match the mobile heuristic: docs with no category default to the
// experience tab (where the vault originally lived).
function tabFor(category: string | null | undefined): VaultTab {
  if (category === "active_asset") return "active_asset";
  return "experience";
}

export default function VaultPage() {
  const { t } = useTheme();
  const { data: user } = useCurrentUser();
  const { data: loans = [] } = useLoans();
  const { data: docs = [] } = useDocuments();
  const [tab, setTab] = useState<VaultTab>("experience");

  const isClient = user?.role === Role.CLIENT;

  const tabCounts = useMemo(() => ({
    experience: docs.filter((d) => tabFor(d.category) === "experience").length,
    active_asset: docs.filter((d) => tabFor(d.category) === "active_asset").length,
  }), [docs]);

  const filtered = useMemo(
    () => docs.filter((d) => tabFor(d.category) === tab),
    [docs, tab],
  );

  const loanById = Object.fromEntries(loans.map((l) => [l.id, l] as const));

  return (
    <div style={{ padding: 24, maxWidth: 1500, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: t.ink, letterSpacing: -0.4 }}>Vault</h1>
        <div style={{ fontSize: 13, color: t.ink3, marginTop: 4 }}>
          {isClient
            ? "Your document vault. Experience = proof of past deals. Active assets = real estate you currently own."
            : "Borrower-style document view, split by experience proof vs. active assets."}
        </div>
      </div>

      <div style={{ display: "flex", gap: 4 }}>
        <TabButton t={t} active={tab === "experience"} onClick={() => setTab("experience")}>
          Experience <Pill>{tabCounts.experience}</Pill>
        </TabButton>
        <TabButton t={t} active={tab === "active_asset"} onClick={() => setTab("active_asset")}>
          Active assets <Pill>{tabCounts.active_asset}</Pill>
        </TabButton>
      </div>

      {filtered.length === 0 ? (
        <Card pad={32}>
          <div style={{ textAlign: "center", color: t.ink3, fontSize: 13, lineHeight: 1.55 }}>
            {tab === "experience"
              ? "No experience proof yet. Upload HUDs, closing statements, deeds, or prior leases from past deals to count toward your investor experience tier."
              : "No active assets yet. Upload bank notes, leases, insurance, or tax bills for properties you currently own."}
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
