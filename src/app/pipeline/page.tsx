"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, StageBadge } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useLoans } from "@/hooks/useApi";
import { QC_FMT } from "@/components/design-system/tokens";
import { SmartIntakeModal } from "./components/SmartIntakeModal";
import { LeadsPipelineView } from "./components/LeadsPipelineView";
import { useActiveProfile } from "@/store/role";

type PipelineMode = "leads" | "funding";

const STAGE_KEYS = ["prequalified", "collecting_docs", "lender_connected", "processing", "closing", "funded"] as const;
const STAGE_LABELS = ["Prequalified", "Collecting Docs", "Lender Connected", "Processing", "Closing", "Funded"];

type SortKey = "deal_id" | "address" | "type" | "amount" | "stage" | "close_date";

export default function PipelinePage() {
  const { t } = useTheme();
  const { data: loans = [] } = useLoans();
  const profile = useActiveProfile();
  // Top-level mode: Leads (Agent funnel) vs Funding (loan stages). Each mode
  // independently picks kanban vs table for layout. Agents see Leads by
  // default; non-Agent operators land on Funding.
  const [mode, setMode] = useState<PipelineMode>(profile.role === "broker" ? "leads" : "funding");
  const [view, setView] = useState<"table" | "kanban">("table");
  const [sortKey, setSortKey] = useState<SortKey>("amount");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [intakeOpen, setIntakeOpen] = useState(false);

  // Clients can't create loans (mirrors backend role gate at qcbackend/app/routers/loans.py).
  const canCreate = profile.role !== "client";

  const sorted = useMemo(() => {
    const filtered = typeFilter === "all" ? loans : loans.filter((l) => l.type === typeFilter);
    return [...filtered].sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * (sortDir === "asc" ? 1 : -1);
      return String(av).localeCompare(String(bv)) * (sortDir === "asc" ? 1 : -1);
    });
  }, [loans, sortKey, sortDir, typeFilter]);

  const setSort = (k: SortKey) => {
    if (k === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  // Search filters down by deal_id or address (case-insensitive).
  const visibleLoans = useMemo(() => {
    if (!search.trim()) return sorted;
    const q = search.trim().toLowerCase();
    return sorted.filter(
      (l) =>
        l.deal_id.toLowerCase().includes(q) ||
        l.address.toLowerCase().includes(q) ||
        (l.city ?? "").toLowerCase().includes(q),
    );
  }, [sorted, search]);

  const totalValue = visibleLoans.reduce((acc, l) => acc + Number(l.amount), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.5, color: t.ink, margin: 0 }}>
          Pipeline
        </h1>

        {/* Mode dropdown — Leads vs Funding. Pipeline does double duty:
            Leads view shows the Agent's early-funnel clients (lead, contacted,
            verified); Funding view shows the lender-stage loans. */}
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as PipelineMode)}
          style={{
            background: t.surface,
            color: t.ink,
            border: `1px solid ${t.line}`,
            borderRadius: 10,
            padding: "8px 10px",
            fontSize: 13,
            fontFamily: "inherit",
            fontWeight: 700,
            cursor: "pointer",
            marginLeft: 4,
          }}
        >
          <option value="leads">Leads</option>
          <option value="funding">Funding</option>
        </select>

        {mode === "funding" ? (
          <span style={{ color: t.ink3, fontSize: 14 }}>
            · {visibleLoans.length} loans · {QC_FMT.short(totalValue)} value
          </span>
        ) : null}

        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
          {/* Search address or ID */}
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
              placeholder="Search address or ID…"
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

          {/* Loan-type filter only applies in Funding mode (Leads don't have a
              loan type yet; that gets locked when Start Funding fires). */}
          {mode === "funding" && (
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{
                background: t.surface,
                color: t.ink2,
                border: `1px solid ${t.line}`,
                borderRadius: 10,
                padding: "8px 10px",
                fontSize: 12.5,
                fontFamily: "inherit",
                cursor: "pointer",
              }}
            >
              <option value="all">All types</option>
              <option value="dscr">DSCR</option>
              <option value="fix_and_flip">Fix &amp; Flip</option>
              <option value="ground_up">Ground Up</option>
              <option value="bridge">Bridge</option>
            </select>
          )}

          {/* Segmented Kanban / Table toggle — design lines 39–44 */}
          <div
            style={{
              display: "inline-flex",
              background: t.surface,
              border: `1px solid ${t.line}`,
              borderRadius: 10,
              padding: 3,
            }}
          >
            <button
              onClick={() => setView("kanban")}
              style={segBtn(t, view === "kanban")}
            >
              <Icon name="layers" size={14} /> Kanban
            </button>
            <button onClick={() => setView("table")} style={segBtn(t, view === "table")}>
              <Icon name="filter" size={14} /> Table
            </button>
          </div>

          {canCreate && (
            // Single entry point regardless of leads/funding mode.
            // Opens the SmartIntakeModal which now provisions a User
            // invite + sets client_experience_mode='guided' on the
            // backend (alembic 0026 / realtor overhaul).
            <button
              onClick={() => setIntakeOpen(true)}
              style={{
                padding: "9px 14px",
                borderRadius: 10,
                background: t.ink,
                color: t.inverse,
                fontSize: 13,
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                cursor: "pointer",
                border: "none",
              }}
            >
              <Icon name="plus" size={14} /> New deal
            </button>
          )}
        </div>
      </div>

      <SmartIntakeModal open={intakeOpen} onClose={() => setIntakeOpen(false)} />

      {mode === "leads" ? (
        <LeadsPipelineView view={view} search={search} />
      ) : view === "table" ? (
        <Card pad={0}>
          <div style={{
            display: "grid", gridTemplateColumns: "80px minmax(0, 2fr) 120px 100px 90px 80px 90px",
            padding: "12px 16px", fontSize: 11, fontWeight: 700, color: t.ink3, textTransform: "uppercase", letterSpacing: 1.2,
            borderBottom: `1px solid ${t.line}`,
          }}>
            <SortHead label="ID" k="deal_id" current={sortKey} dir={sortDir} onClick={setSort} />
            <SortHead label="Property" k="address" current={sortKey} dir={sortDir} onClick={setSort} />
            <SortHead label="Type" k="type" current={sortKey} dir={sortDir} onClick={setSort} />
            <SortHead label="Amount" k="amount" current={sortKey} dir={sortDir} onClick={setSort} align="right" />
            <SortHead label="DSCR" k="amount" current={sortKey} dir={sortDir} onClick={setSort} align="right" />
            <div>Risk</div>
            <SortHead label="Close" k="close_date" current={sortKey} dir={sortDir} onClick={setSort} />
          </div>
          {visibleLoans.map((loan) => (
            <Link key={loan.id} href={`/loans/${loan.id}`} style={{
              display: "grid", gridTemplateColumns: "80px minmax(0, 2fr) 120px 100px 90px 80px 90px",
              padding: "12px 16px", borderBottom: `1px solid ${t.line}`, alignItems: "center",
              fontSize: 13, color: t.ink,
            }}>
              <div style={{ fontWeight: 700, color: t.ink2 }}>{loan.deal_id}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{loan.address}</div>
                <div style={{ fontSize: 11.5, color: t.ink3 }}>{loan.city}</div>
              </div>
              <div><Pill>{loan.type.replace("_", " ")}</Pill></div>
              <div style={{ textAlign: "right", fontWeight: 700, fontFeatureSettings: '"tnum"' }}>{QC_FMT.short(Number(loan.amount))}</div>
              <div style={{ textAlign: "right", color: loan.dscr && loan.dscr >= 1.25 ? t.profit : loan.dscr && loan.dscr >= 1.0 ? t.warn : t.ink3, fontWeight: 700 }}>
                {loan.dscr ? loan.dscr.toFixed(2) : "—"}
              </div>
              <div style={{ color: t.ink3 }}>{loan.risk_score ?? "—"}</div>
              <div style={{ color: t.ink3, fontSize: 12 }}>{loan.close_date ? new Date(loan.close_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</div>
            </Link>
          ))}
        </Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
          {STAGE_KEYS.map((k, i) => {
            const stageLoans = visibleLoans.filter((l) => l.stage === k);
            return (
              <div key={k} style={{ background: t.surface2, padding: 12, borderRadius: 12, border: `1px solid ${t.line}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <StageBadge stage={i} />
                  <div style={{ fontSize: 12, fontWeight: 700, color: t.ink3 }}>{stageLoans.length}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {stageLoans.map((loan) => (
                    <Link key={loan.id} href={`/loans/${loan.id}`} style={{ background: t.surface, padding: 10, borderRadius: 10, border: `1px solid ${t.line}` }}>
                      <div style={{ fontSize: 11, color: t.ink3, fontWeight: 700 }}>{loan.deal_id}</div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: t.ink, marginTop: 2 }}>{loan.address}</div>
                      <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 2 }}>{QC_FMT.short(Number(loan.amount))} · {loan.type.replace("_", " ")}</div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SortHead({
  label, k, current, dir, onClick, align,
}: { label: string; k: SortKey; current: SortKey; dir: "asc" | "desc"; onClick: (k: SortKey) => void; align?: "left" | "right" }) {
  const active = current === k;
  return (
    <button onClick={() => onClick(k)} style={{
      textAlign: align ?? "left", color: active ? "var(--qc-ink)" : "inherit", fontWeight: active ? 800 : 700, fontSize: "inherit",
      letterSpacing: "inherit", textTransform: "inherit",
    }}>
      {label} {active ? (dir === "asc" ? "↑" : "↓") : ""}
    </button>
  );
}

function segBtn(t: ReturnType<typeof useTheme>["t"], active: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px",
    borderRadius: 7,
    border: "none",
    background: active ? t.ink : "transparent",
    color: active ? t.inverse : t.ink2,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  };
}
