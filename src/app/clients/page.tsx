"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SortableTableHead, TableRow, useSort } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useClients, useCurrentUser, useLoans } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import type { Client, ClientStage } from "@/lib/types";
import { QC_FMT } from "@/components/design-system/tokens";

// Stages-as-filter-chips shown above the table.
type StageFilter = "all" | ClientStage;

const STAGE_CHIPS: { value: StageFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "lead", label: "Leads" },
  { value: "contacted", label: "Nurturing" },
  { value: "verified", label: "Ready" },
  { value: "ready_for_lending", label: "Ready for Lending" },
  { value: "processing", label: "Processing" },
  { value: "funded", label: "Funded" },
  { value: "lost", label: "Lost" },
];

const STAGE_LABEL: Record<ClientStage, string> = {
  lead: "Lead",
  contacted: "Nurturing",
  verified: "Ready",
  ready_for_lending: "Ready",
  processing: "Processing",
  funded: "Funded",
  lost: "Lost",
};

const COLS = [
  { label: "Client",   w: "minmax(0, 2fr)", key: "name" },
  { label: "Stage",    w: "130px",          key: "_stage" },
  { label: "Type",     w: "90px",           key: "_type" },
  { label: "FICO",     w: "70px",  align: "right" as const, key: "fico" },
  { label: "Loans",    w: "60px",  align: "right" as const, key: "active_loans" },
  { label: "Exposure", w: "100px", align: "right" as const, key: "exposure" },
  { label: "City",     w: "120px",          key: "city" },
  { label: "Since",    w: "80px",           key: "since" },
];

// Best-effort stage inference for legacy Client rows that don't yet carry the
// new `stage` field. Once the backend stamps stage on every row this is dead
// code — it just keeps the Clients page meaningful during the migration window.
function inferredStage(c: Client, activeLoans: number): ClientStage {
  if (c.stage) return c.stage;
  if (c.funded_count > 0) return "funded";
  if (activeLoans > 0) return "processing";
  return "lead";
}

export default function ClientsPage() {
  const { t } = useTheme();
  const { data: user } = useCurrentUser();
  const { data: clients = [] } = useClients();
  const { data: loans = [] } = useLoans();
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");

  const canCreate = user?.role !== Role.CLIENT;

  // Compute exposure + active loans per client from the loans list, plus an
  // effective-stage value used for filtering and rendering.
  const enriched = useMemo(() => {
    const activeByClient = new Map<string, number>();
    const exposureByClient = new Map<string, number>();
    for (const l of loans) {
      if (l.stage !== "funded") {
        activeByClient.set(l.client_id, (activeByClient.get(l.client_id) ?? 0) + 1);
        exposureByClient.set(
          l.client_id,
          (exposureByClient.get(l.client_id) ?? 0) + Number(l.amount),
        );
      }
    }
    return clients.map((c) => {
      const active_loans = activeByClient.get(c.id) ?? 0;
      return {
        ...c,
        active_loans,
        exposure: exposureByClient.get(c.id) ?? Number(c.funded_total),
        _stage: inferredStage(c, active_loans),
        _type: c.client_type ?? null,
      };
    });
  }, [clients, loans]);

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { all: enriched.length };
    for (const c of enriched) counts[c._stage] = (counts[c._stage] ?? 0) + 1;
    return counts;
  }, [enriched]);

  const filtered = useMemo(() => {
    let rows = enriched;
    if (stageFilter !== "all") rows = rows.filter((c) => c._stage === stageFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.email ?? "").toLowerCase().includes(q) ||
          (c.city ?? "").toLowerCase().includes(q),
      );
    }
    return rows;
  }, [enriched, stageFilter, search]);

  const { sort, onSort, compare } = useSort("exposure", "desc");
  const sorted = useMemo(() => [...filtered].sort(compare), [filtered, compare]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.5, color: t.ink, margin: 0 }}>
          Clients
        </h1>
        <span style={{ color: t.ink3, fontSize: 14 }}>· {filtered.length} of {enriched.length}</span>

        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: t.surface,
              border: `1px solid ${t.line}`,
              borderRadius: 10,
              padding: "6px 10px",
              width: 240,
            }}
          >
            <Icon name="search" size={14} style={{ color: t.ink3 }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, city…"
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                background: "transparent",
                fontSize: 12.5,
                color: t.ink,
                fontFamily: "inherit",
              }}
            />
          </div>
          {canCreate && (
            <Link
              href="/clients/new"
              style={{
                padding: "9px 14px",
                borderRadius: 10,
                background: t.ink,
                color: t.inverse,
                fontSize: 13,
                fontWeight: 700,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
              }}
            >
              <Icon name="plus" size={14} /> New client
            </Link>
          )}
        </div>
      </div>

      {/* Stage filter chips. Single-select, click again to clear (back to All). */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {STAGE_CHIPS.map((chip) => {
          const active = stageFilter === chip.value;
          const count = stageCounts[chip.value] ?? 0;
          return (
            <button
              key={chip.value}
              onClick={() => setStageFilter(chip.value)}
              style={{
                all: "unset",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
                border: `1px solid ${active ? t.petrol : t.line}`,
                background: active ? t.petrolSoft : "transparent",
                color: active ? t.petrol : t.ink2,
              }}
            >
              {chip.label}
              <span style={{ fontSize: 11, color: active ? t.petrol : t.ink3, fontWeight: 600 }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <Card pad={0}>
        <SortableTableHead cols={COLS} sort={sort} onSort={onSort} />
        {sorted.map((c) => (
          <TableRow
            key={c.id}
            cols={COLS}
            onClick={() => (window.location.href = `/clients/${c.id}`)}
            values={[
              <div key="n">
                <div style={{ fontWeight: 700, color: t.ink }}>{c.name}</div>
                <div style={{ fontSize: 11, color: t.ink3 }}>{c.email}</div>
              </div>,
              <StagePill key="st" t={t} stage={c._stage} />,
              c._type ? (
                <Pill key="ty" bg={c._type === "buyer" ? t.brandSoft : t.warnBg} color={c._type === "buyer" ? t.brand : t.warn}>
                  {c._type === "buyer" ? "Buyer" : "Seller"}
                </Pill>
              ) : (
                <span key="ty" style={{ color: t.ink3, fontSize: 12 }}>—</span>
              ),
              <span key="f" style={{ fontFeatureSettings: '"tnum"', color: t.ink2 }}>{c.fico ?? "—"}</span>,
              <span key="l" style={{ fontFeatureSettings: '"tnum"', color: t.ink2 }}>{c.active_loans}</span>,
              <span key="e" style={{ fontWeight: 700, fontFeatureSettings: '"tnum"', color: t.ink }}>{QC_FMT.short(c.exposure)}</span>,
              <span key="c" style={{ color: t.ink3 }}>{c.city ?? "—"}</span>,
              <span key="s" style={{ color: t.ink3 }}>{c.since ? new Date(c.since).getFullYear() : "—"}</span>,
            ]}
          />
        ))}
        {sorted.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: t.ink3 }}>
            {search || stageFilter !== "all"
              ? "No clients match the current filters."
              : "No clients yet."}
            {canCreate && !search && stageFilter === "all" && (
              <>
                {" "}
                <Link href="/clients/new" style={{ color: t.petrol, fontWeight: 700 }}>
                  Create one →
                </Link>
              </>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function StagePill({
  t,
  stage,
}: {
  t: ReturnType<typeof useTheme>["t"];
  stage: ClientStage;
}) {
  // Color by lifecycle group: leads/early-funnel = neutral; lending stages =
  // petrol/brand; funded = profit-green; lost = muted.
  const palette: Record<ClientStage, { bg: string; fg: string }> = {
    lead:               { bg: t.chip,        fg: t.ink2 },
    contacted:          { bg: t.warnBg,      fg: t.warn },
    verified:           { bg: t.petrolSoft,  fg: t.petrol },
    ready_for_lending:  { bg: t.brandSoft,   fg: t.brand },
    processing:         { bg: t.brandSoft,   fg: t.brand },
    funded:             { bg: t.profitBg,    fg: t.profit },
    lost:               { bg: t.surface2,    fg: t.ink3 },
  };
  const { bg, fg } = palette[stage];
  return <Pill bg={bg} color={fg}>{STAGE_LABEL[stage]}</Pill>;
}
