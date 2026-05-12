"use client";

// /deals/[id] — the agent's working file. Mirrors /loans/[id]'s
// structure (slim header, tab strip, panel below) but with
// realtor-side content. Pre-promotion: agent's primary surface for
// listing/buyer-search work. Post-promotion: same surface continues,
// with a read-only Funding tab showing the linked loan's progress.

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Pill, StageBadge } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import {
  useClient,
  useDeal,
  useLoan,
  useMarkDealReadyForLending,
  type MarkReadyResponse,
} from "@/hooks/useApi";
import { AiStatusBadge } from "@/components/AiStatusBadge";
import { useActiveProfile } from "@/store/role";
import { Role } from "@/lib/enums.generated";
import { PropertyTab } from "./tabs/PropertyTab";
import { AISecretaryTab } from "./tabs/AISecretaryTab";
import { DocumentsTab } from "./tabs/DocumentsTab";
import { ScheduleTab } from "./tabs/ScheduleTab";
import { NotesTab } from "./tabs/NotesTab";
import { ActivityTab } from "./tabs/ActivityTab";
import { FundingTab } from "./tabs/FundingTab";

const TAB_ORDER = [
  { id: "property", label: "Property", icon: "home" as const },
  { id: "ai", label: "AI Secretary", icon: "spark" as const },
  { id: "docs", label: "Documents", icon: "doc" as const },
  { id: "schedule", label: "Schedule", icon: "cal" as const },
  { id: "notes", label: "Notes", icon: "chat" as const },
  { id: "activity", label: "Activity", icon: "trend" as const },
];

export default function DealPage() {
  const { t } = useTheme();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const profile = useActiveProfile();

  const { data: deal } = useDeal(params.id);
  const { data: client } = useClient(deal?.client_id ?? null);
  const { data: loan } = useLoan(deal?.promoted_loan_id ?? null);

  const initialTab = searchParams?.get("tab") || "property";
  const [tab, setTab] = useState<string>(initialTab);
  const [busy, setBusy] = useState(false);
  const [handoffResult, setHandoffResult] = useState<MarkReadyResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const markReady = useMarkDealReadyForLending(deal?.client_id ?? "");

  if (!deal) {
    return <div style={{ padding: 24, color: t.ink3, fontSize: 13 }}>Loading…</div>;
  }

  const isPromoted = !!deal.promoted_loan_id;
  const canPromote =
    profile.role === Role.BROKER ||
    profile.role === Role.SUPER_ADMIN ||
    profile.role === Role.LOAN_EXEC;
  const tabs = isPromoted
    ? [...TAB_ORDER, { id: "funding", label: "Funding", icon: "file" as const }]
    : TAB_ORDER;
  const activeTab = tabs.find((x) => x.id === tab)?.id ?? tabs[0].id;

  function onTabChange(next: string) {
    setTab(next);
    const sp = new URLSearchParams(searchParams?.toString() || "");
    sp.set("tab", next);
    router.replace(`?${sp.toString()}`, { scroll: false });
  }

  async function onMarkReady() {
    if (!deal || !canPromote) return;
    if (!confirm(`Promote "${deal.title}" to a funding file? The lending team will pick it up.`)) {
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await markReady.mutateAsync({ dealId: deal.id });
      setHandoffResult(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't promote");
    } finally {
      setBusy(false);
    }
  }

  const headerSubLine = [
    deal.address || (client?.city ? `${client?.name} · ${client.city}` : client?.name),
    client?.fico ? `FICO ${client.fico}` : null,
    deal.list_price ? `List $${Number(deal.list_price).toLocaleString()}` : null,
    deal.target_price ? `Target $${Number(deal.target_price).toLocaleString()}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Slim summary header — modeled on /loans/[id] header pattern. */}
      <div
        style={{
          border: `1px solid ${t.line}`,
          borderRadius: 16,
          background: `linear-gradient(180deg, ${t.surface}, ${t.surface2})`,
          boxShadow: t.shadow,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) auto",
            gap: 18,
            padding: "14px 16px 12px",
            alignItems: "center",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Link
                href="/pipeline"
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: t.ink3,
                  letterSpacing: 1.2,
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Icon name="chevL" size={10} /> PIPELINE
              </Link>
              <Pill bg={t.brandSoft} color={t.brand}>
                {dealTypeLabel(deal.deal_type)}
              </Pill>
              <Pill>{deal.status}</Pill>
              {isPromoted && loan ? <StageBadge stage={loanStageIndex(loan.stage)} /> : null}
              <AiStatusBadge state={aiStateOf(deal.ai_status)} size="sm" />
            </div>
            <h1
              style={{
                fontSize: 21,
                fontWeight: 850,
                color: t.ink,
                margin: "5px 0 3px",
                letterSpacing: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {deal.title}
            </h1>
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                flexWrap: "wrap",
                fontSize: 12.5,
                color: t.ink2,
              }}
            >
              {client?.name ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <Icon name="user" size={11} stroke={2.2} />
                  <strong style={{ color: t.ink }}>{client.name}</strong>
                </span>
              ) : null}
              {headerSubLine ? <span style={{ color: t.ink4 }}>·</span> : null}
              {headerSubLine ? <span>{headerSubLine}</span> : null}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {!isPromoted && canPromote ? (
              <button
                onClick={onMarkReady}
                disabled={busy}
                style={{
                  padding: "8px 14px",
                  fontSize: 12,
                  fontWeight: 800,
                  borderRadius: 8,
                  border: "none",
                  background: t.brand,
                  color: t.inverse,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  opacity: busy ? 0.6 : 1,
                }}
              >
                <Icon name="bolt" size={12} /> {busy ? "Promoting…" : "Ready for Funding"}
              </button>
            ) : null}
            {isPromoted && loan ? (
              <Link
                href={`/loans/${loan.id}`}
                style={{
                  padding: "8px 14px",
                  fontSize: 12,
                  fontWeight: 700,
                  borderRadius: 8,
                  border: `1px solid ${t.line}`,
                  background: t.surface,
                  color: t.ink,
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                Open funding workbench <Icon name="chevR" size={11} />
              </Link>
            ) : null}
          </div>
        </div>

        {/* Tab strip. */}
        <div
          style={{
            display: "flex",
            gap: 4,
            borderTop: `1px solid ${t.line}`,
            paddingLeft: 8,
            background: t.surface,
            overflowX: "auto",
          }}
        >
          {tabs.map((x) => {
            const isActive = activeTab === x.id;
            return (
              <button
                key={x.id}
                onClick={() => onTabChange(x.id)}
                style={{
                  padding: "10px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  border: "none",
                  background: "transparent",
                  color: isActive ? t.ink : t.ink3,
                  borderBottom: `2px solid ${isActive ? t.petrol : "transparent"}`,
                  cursor: "pointer",
                  marginBottom: -1,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  whiteSpace: "nowrap",
                }}
              >
                <Icon name={x.icon} size={13} />
                {x.label}
              </button>
            );
          })}
        </div>
      </div>

      {err ? (
        <div style={{ padding: 10, borderRadius: 8, background: t.warnBg, color: t.warn, fontSize: 12 }}>
          {err}
        </div>
      ) : null}
      {handoffResult ? (
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            background: t.surface2,
            border: `1px solid ${t.brand}`,
            fontSize: 12,
            color: t.ink2,
          }}
        >
          <div style={{ fontWeight: 700, color: t.brand, marginBottom: 4 }}>
            <Icon name="bolt" size={11} /> Funding file created
          </div>
          {handoffResult.handoff_summary ? (
            <div style={{ whiteSpace: "pre-wrap", marginBottom: 4 }}>{handoffResult.handoff_summary}</div>
          ) : null}
          {handoffResult.missing_lending_items.length > 0 ? (
            <div>
              <strong>Still needed:</strong>{" "}
              {handoffResult.missing_lending_items.slice(0, 5).join(", ")}
            </div>
          ) : null}
        </div>
      ) : null}

      {activeTab === "property" ? <PropertyTab deal={deal} /> : null}
      {activeTab === "ai" ? (
        <AISecretaryTab clientId={deal.client_id} dealId={deal.id} loanId={deal.promoted_loan_id} />
      ) : null}
      {activeTab === "docs" ? (
        <DocumentsTab clientId={deal.client_id} loanId={deal.promoted_loan_id} />
      ) : null}
      {activeTab === "schedule" ? <ScheduleTab clientId={deal.client_id} dealId={deal.id} /> : null}
      {activeTab === "notes" ? <NotesTab deal={deal} /> : null}
      {activeTab === "activity" ? <ActivityTab clientId={deal.client_id} /> : null}
      {activeTab === "funding" && loan ? <FundingTab loan={loan} clientId={deal.client_id} /> : null}
    </div>
  );
}

function dealTypeLabel(t: string): string {
  return ({ buyer: "Buyer Deal", seller: "Seller Deal", investor: "Investor Deal", borrower: "Borrower" } as Record<string, string>)[t] ?? t;
}

function aiStateOf(s: string): "deployed" | "paused" | "idle" {
  if (s === "active") return "deployed";
  if (s === "paused") return "paused";
  return "idle";
}

function loanStageIndex(stage: string): number {
  const order = ["prequalified", "collecting_docs", "lender_connected", "processing", "closing", "funded"];
  const idx = order.indexOf(stage);
  return idx < 0 ? 0 : idx;
}
