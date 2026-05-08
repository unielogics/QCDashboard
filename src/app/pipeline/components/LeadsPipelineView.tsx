"use client";

// Leads view of the Pipeline. Mirrors the Funding view's table/kanban shape
// but is driven by clients in the early-funnel stages (lead, contacted,
// verified). Click any card → /clients/[id], where the Agent finds the
// Start Funding action that promotes the client into the Funding view.

import Link from "next/link";
import { useMemo } from "react";
import { Card, Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { useClients } from "@/hooks/useApi";
import { LEAD_STAGES, type Client, type ClientStage } from "@/lib/types";

const LEAD_STAGE_LABELS: Record<(typeof LEAD_STAGES)[number], string> = {
  lead: "Lead",
  contacted: "Nurturing",
  verified: "Ready",
};

function isLeadStage(s: ClientStage): s is (typeof LEAD_STAGES)[number] {
  return (LEAD_STAGES as readonly ClientStage[]).includes(s);
}

interface Props {
  view: "kanban" | "table";
  search: string;
}

export function LeadsPipelineView({ view, search }: Props) {
  const { t } = useTheme();
  // Scope to the calling broker's book. Backend's _scope filter on
  // /clients does the actual gating; we still pass `scope="mine"`
  // so super-admins viewing the leads view see firm-wide instead.
  const { data: clients = [] } = useClients("mine");

  // alembic 0024 backfilled every existing client with a real `stage`
  // value, and new clients default to 'lead' on creation. Use the
  // column directly — the previous `inferStage()` hack from when
  // the column didn't exist is gone.
  const enriched = useMemo(() => {
    return clients
      .filter((c): c is Client & { stage: ClientStage } =>
        Boolean(c.stage) && isLeadStage(c.stage as ClientStage),
      )
      .map((c) => ({ ...c, _stage: c.stage }));
  }, [clients]);

  const visible = useMemo(() => {
    if (!search.trim()) return enriched;
    const q = search.trim().toLowerCase();
    return enriched.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.city ?? "").toLowerCase().includes(q),
    );
  }, [enriched, search]);

  // The lead-creation entry point lives in the parent pipeline page header
  // ("+ New deal") — single source of truth for deal creation across the
  // leads + funding views.
  const header = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
      <div style={{ fontSize: 12, color: t.ink3 }}>
        {visible.length} {visible.length === 1 ? "lead" : "leads"}
        {search ? ` matching "${search}"` : ""}
      </div>
    </div>
  );

  if (view === "table") {
    return (
      <>
      {header}
      <Card pad={0}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 2fr) 110px 90px 100px 130px",
            padding: "12px 16px",
            fontSize: 11,
            fontWeight: 700,
            color: t.ink3,
            textTransform: "uppercase",
            letterSpacing: 1.2,
            borderBottom: `1px solid ${t.line}`,
          }}
        >
          <div>Client</div>
          <div>Stage</div>
          <div>Type</div>
          <div>FICO</div>
          <div>City</div>
        </div>
        {visible.map((c) => (
          <Link
            key={c.id}
            href={`/clients/${c.id}`}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 2fr) 110px 90px 100px 130px",
              padding: "12px 16px",
              borderBottom: `1px solid ${t.line}`,
              alignItems: "center",
              fontSize: 13,
              color: t.ink,
              textDecoration: "none",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {c.name}
              </div>
              <div style={{ fontSize: 11.5, color: t.ink3 }}>{c.email ?? "—"}</div>
            </div>
            <StagePill t={t} stage={c._stage as (typeof LEAD_STAGES)[number]} />
            {c.client_type ? (
              <Pill bg={c.client_type === "buyer" ? t.brandSoft : t.warnBg} color={c.client_type === "buyer" ? t.brand : t.warn}>
                {c.client_type === "buyer" ? "Buyer" : "Seller"}
              </Pill>
            ) : (
              <span style={{ color: t.ink3 }}>—</span>
            )}
            <span style={{ fontFeatureSettings: '"tnum"', color: t.ink2 }}>{c.fico ?? "—"}</span>
            <span style={{ color: t.ink3 }}>{c.city ?? "—"}</span>
          </Link>
        ))}
        {visible.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: t.ink3 }}>
            {search ? `No leads match "${search}".` : "No leads in the funnel right now."}
          </div>
        )}
      </Card>
      </>
    );
  }

  // Kanban — 3 columns, one per lead stage.
  return (
    <>
    {header}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
      {LEAD_STAGES.map((s) => {
        const stageClients = visible.filter((c) => c._stage === s);
        return (
          <div
            key={s}
            style={{
              background: t.surface2,
              padding: 12,
              borderRadius: 12,
              border: `1px solid ${t.line}`,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <StagePill t={t} stage={s} />
              <div style={{ fontSize: 12, fontWeight: 700, color: t.ink3 }}>{stageClients.length}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {stageClients.map((c) => (
                <Link
                  key={c.id}
                  href={`/clients/${c.id}`}
                  style={{
                    background: t.surface,
                    padding: 10,
                    borderRadius: 10,
                    border: `1px solid ${t.line}`,
                    textDecoration: "none",
                    color: t.ink,
                    display: "block",
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: t.ink }}>{c.name}</div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
                    {c.client_type ? (
                      <Pill bg={c.client_type === "buyer" ? t.brandSoft : t.warnBg} color={c.client_type === "buyer" ? t.brand : t.warn}>
                        {c.client_type === "buyer" ? "Buyer" : "Seller"}
                      </Pill>
                    ) : null}
                    {c.email && (
                      <span
                        style={{
                          fontSize: 11,
                          color: t.ink3,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          minWidth: 0,
                          flex: 1,
                        }}
                      >
                        {c.email}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
              {stageClients.length === 0 && (
                <div style={{ fontSize: 12, color: t.ink3, padding: "8px 0", textAlign: "center" }}>
                  Empty
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
    </>
  );
}

function StagePill({
  t,
  stage,
}: {
  t: ReturnType<typeof useTheme>["t"];
  stage: (typeof LEAD_STAGES)[number];
}) {
  const palette: Record<(typeof LEAD_STAGES)[number], { bg: string; fg: string }> = {
    lead:      { bg: t.chip,       fg: t.ink2 },
    contacted: { bg: t.warnBg,     fg: t.warn },
    verified:  { bg: t.petrolSoft, fg: t.petrol },
  };
  const { bg, fg } = palette[stage];
  return <Pill bg={bg} color={fg}>{LEAD_STAGE_LABELS[stage]}</Pill>;
}
