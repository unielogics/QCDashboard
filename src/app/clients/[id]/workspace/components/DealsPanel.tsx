"use client";

// Deals tab. Lists every Deal on this client (multi-deal support is
// the whole point — one client can carry buyer + seller + investor
// deals simultaneously) and lets the agent create new ones.
//
// The "Mark Ready for Lending" CTA on DealCard lands in Phase 4 once
// the promote_deal_to_loan service ships.

import { useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, KPI, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import {
  useCreateDeal,
  useMarkDealReadyForLending,
  type DealCreateBody,
  type MarkReadyResponse,
} from "@/hooks/useApi";
import type { Deal, DealType, RolePermissions, WorkspaceData } from "@/lib/types";
import { AiStatusBadge } from "./AiStatusBadge";

const DEAL_TYPE_LABELS: Record<DealType, string> = {
  buyer: "Buyer",
  seller: "Seller",
  investor: "Investor",
  borrower: "Borrower",
};

export function DealsPanel({ clientId, data }: { clientId: string; data: WorkspaceData }) {
  const { t } = useTheme();
  const [createOpen, setCreateOpen] = useState(false);

  const canCreate = data.role_permissions.can_create_deals;

  if (data.deals.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Card pad={20}>
          <SectionLabel>Deals</SectionLabel>
          <div style={{ marginTop: 8, fontSize: 13, color: t.ink3 }}>
            No active deals yet. A client can carry multiple deal paths simultaneously —
            buyer search, seller listing, investor purchase, refinance — each handed off
            to the funding team as its own loan when ready.
          </div>
          {canCreate ? (
            <button
              onClick={() => setCreateOpen(true)}
              style={{
                marginTop: 12,
                padding: "8px 14px",
                fontSize: 12,
                fontWeight: 700,
                borderRadius: 8,
                border: "none",
                background: t.brand,
                color: t.inverse,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Icon name="plus" size={12} /> New deal
            </button>
          ) : null}
        </Card>
        {createOpen ? <NewDealModal clientId={clientId} onClose={() => setCreateOpen(false)} /> : null}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <SectionLabel>Deals · {data.deals.length}</SectionLabel>
        {canCreate ? (
          <button
            onClick={() => setCreateOpen(true)}
            style={{
              marginLeft: "auto",
              padding: "8px 14px",
              fontSize: 12,
              fontWeight: 700,
              borderRadius: 8,
              border: "none",
              background: t.brand,
              color: t.inverse,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Icon name="plus" size={12} /> New deal
          </button>
        ) : null}
      </div>
      {data.deals.map((d) => (
        <DealCard key={d.id} clientId={clientId} d={d} role={data.role_permissions} />
      ))}
      {createOpen ? <NewDealModal clientId={clientId} onClose={() => setCreateOpen(false)} /> : null}
    </div>
  );
}

function DealCard({
  clientId,
  d,
  role,
}: {
  clientId: string;
  d: Deal;
  role: RolePermissions;
}) {
  const { t } = useTheme();
  const markReady = useMarkDealReadyForLending(clientId);
  const [result, setResult] = useState<MarkReadyResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const stateMap: Record<string, "deployed" | "paused" | "idle"> = {
    active: "deployed",
    paused: "paused",
    idle: "idle",
  };

  const canPromote =
    role.can_mark_ready_for_lending &&
    d.handoff_status !== "promoted" &&
    d.status !== "promoted" &&
    !d.promoted_loan_id;

  async function onMarkReady() {
    if (!confirm(`Promote "${d.title}" to a funding file? The lending team will pick it up.`)) {
      return;
    }
    setErr(null);
    try {
      const r = await markReady.mutateAsync({ dealId: d.id });
      setResult(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't mark ready");
    }
  }

  return (
    <Card pad={16}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <Pill bg={t.brandSoft} color={t.brand}>{DEAL_TYPE_LABELS[d.deal_type]}</Pill>
        <Pill>{d.status}</Pill>
        <span style={{ fontSize: 14, fontWeight: 700, color: t.ink, flex: 1 }}>{d.title}</span>
        <AiStatusBadge state={stateMap[d.ai_status] ?? "idle"} size="sm" />
        {canPromote ? (
          <button
            onClick={onMarkReady}
            disabled={markReady.isPending}
            style={{
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 700,
              borderRadius: 6,
              border: "none",
              background: t.brand,
              color: t.inverse,
              cursor: "pointer",
              opacity: markReady.isPending ? 0.6 : 1,
            }}
          >
            <Icon name="bolt" size={11} /> {markReady.isPending ? "Promoting…" : "Ready for Lending"}
          </button>
        ) : null}
      </div>
      {d.summary ? (
        <div style={{ fontSize: 12, color: t.ink3, marginBottom: 8 }}>{d.summary}</div>
      ) : null}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8 }}>
        <KPI label="Side" value={d.side} />
        <KPI label="Handoff" value={d.handoff_status} />
        <KPI label="Created" value={new Date(d.created_at).toLocaleDateString()} />
        {d.promoted_loan_id ? <KPI label="Loan" value="Promoted" /> : null}
      </div>
      {err ? <div style={{ marginTop: 8, fontSize: 12, color: t.danger }}>{err}</div> : null}
      {result ? (
        <div
          style={{
            marginTop: 10,
            padding: 12,
            borderRadius: 6,
            background: t.surface2,
            border: `1px solid ${t.brand}`,
            fontSize: 12,
            color: t.ink2,
          }}
        >
          <div style={{ fontWeight: 700, color: t.brand, marginBottom: 4 }}>
            <Icon name="bolt" size={11} /> Funding file created
          </div>
          {result.handoff_summary ? (
            <div style={{ whiteSpace: "pre-wrap" }}>{result.handoff_summary}</div>
          ) : null}
          {result.missing_lending_items.length > 0 ? (
            <div style={{ marginTop: 6 }}>
              <strong>Still needed:</strong> {result.missing_lending_items.slice(0, 4).join(", ")}
              {result.missing_lending_items.length > 4 ? "…" : ""}
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function NewDealModal({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const { t } = useTheme();
  const create = useCreateDeal(clientId);
  const [body, setBody] = useState<DealCreateBody>({
    deal_type: "buyer",
    title: "",
  });
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!body.title.trim()) {
      setErr("Title is required");
      return;
    }
    setErr(null);
    try {
      await create.mutateAsync(body);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't create deal");
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: t.surface,
          border: `1px solid ${t.line}`,
          borderRadius: 10,
          padding: 20,
          minWidth: 400,
          maxWidth: 500,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 800, color: t.ink }}>New deal</div>
        <div>
          <label style={{ fontSize: 12, color: t.ink3, fontWeight: 600 }}>Deal type</label>
          <select
            value={body.deal_type}
            onChange={(e) => setBody({ ...body, deal_type: e.target.value as DealType })}
            style={{
              width: "100%",
              padding: 8,
              fontSize: 13,
              borderRadius: 6,
              border: `1px solid ${t.line}`,
              background: t.surface,
              color: t.ink,
              marginTop: 4,
            }}
          >
            <option value="buyer">Buyer</option>
            <option value="seller">Seller</option>
            <option value="investor">Investor</option>
            <option value="borrower">Borrower</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, color: t.ink3, fontWeight: 600 }}>Title</label>
          <input
            value={body.title}
            onChange={(e) => setBody({ ...body, title: e.target.value })}
            placeholder='e.g. "Buyer search — Westside" or "Sell 123 Main St"'
            style={{
              width: "100%",
              padding: 8,
              fontSize: 13,
              borderRadius: 6,
              border: `1px solid ${t.line}`,
              background: t.surface,
              color: t.ink,
              marginTop: 4,
            }}
          />
        </div>
        <div>
          <label style={{ fontSize: 12, color: t.ink3, fontWeight: 600 }}>Summary (optional)</label>
          <textarea
            value={body.summary ?? ""}
            onChange={(e) => setBody({ ...body, summary: e.target.value })}
            rows={3}
            style={{
              width: "100%",
              padding: 8,
              fontSize: 13,
              borderRadius: 6,
              border: `1px solid ${t.line}`,
              background: t.surface,
              color: t.ink,
              fontFamily: "inherit",
              resize: "vertical",
              marginTop: 4,
            }}
          />
        </div>
        {err ? <div style={{ fontSize: 12, color: t.danger }}>{err}</div> : null}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 6,
              border: `1px solid ${t.line}`,
              background: t.surface,
              color: t.ink,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={create.isPending}
            style={{
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 700,
              borderRadius: 6,
              border: "none",
              background: t.brand,
              color: t.inverse,
              cursor: "pointer",
              opacity: create.isPending ? 0.6 : 1,
            }}
          >
            {create.isPending ? "Creating…" : "Create deal"}
          </button>
        </div>
      </div>
    </div>
  );
}
