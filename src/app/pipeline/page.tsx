"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, StageBadge } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useDealSecretarySummary, useDocuments, useLoans, type DSPipelineSummaryItem } from "@/hooks/useApi";
import { QC_FMT } from "@/components/design-system/tokens";
import { loanTypeLabel, type Document } from "@/lib/types";
import { getFileCompletion } from "@/app/loans/[id]/fileReadiness";
import { SmartIntakeModal } from "./components/SmartIntakeModal";
import { LeadsPipelineView } from "./components/LeadsPipelineView";
import { useActiveProfile } from "@/store/role";
import { LoanAgentPicker } from "@/components/LoanAgentPicker";
import type { Loan } from "@/lib/types";

type PipelineMode = "leads" | "funding";

const STAGE_KEYS = ["prequalified", "collecting_docs", "lender_connected", "processing", "closing", "funded"] as const;
const STAGE_LABELS = ["Prequalified", "Collecting Docs", "Lender Connected", "Processing", "Closing", "Funded"];

type SortKey = "deal_id" | "address" | "type" | "amount" | "dscr" | "stage" | "close_date";

export default function PipelinePage() {
  const { t } = useTheme();
  const { data: loans = [] } = useLoans();
  const loanIds = useMemo(() => loans.map((l) => l.id), [loans]);
  const { data: secretarySummaries = [] } = useDealSecretarySummary(loanIds);
  const summaryByLoanId = useMemo(() => {
    const map = new Map<string, DSPipelineSummaryItem>();
    secretarySummaries.forEach((s) => map.set(s.loan_id, s));
    return map;
  }, [secretarySummaries]);
  const profile = useActiveProfile();
  // Top-level mode: Funding Files (loan/deal files keyed on deal_id)
  // vs Agent Relationships (the client funnel). Mirrors the mobile
  // PipelineScreen, which defaults brokers to the "files" view and
  // offers a Files/Relationships toggle. The relationship DETAIL
  // (workflow / property / readiness per client) lives on the
  // Clients tab → /clients/[id], not as the pipeline default.
  const isBroker = profile.role === "broker";
  const isInternal = profile.role === "super_admin" || profile.role === "loan_exec";
  const { data: allDocs = [] } = useDocuments();
  // Everyone now lands on Funding Files (deal-id-focused). Brokers get
  // the same Files/Relationships toggle operators have, matching the
  // mobile pipeline so the desktop experience and available functions
  // line up across surfaces.
  const [mode, setMode] = useState<PipelineMode>("funding");
  const [view, setView] = useState<"table" | "kanban">("table");
  const [sortKey, setSortKey] = useState<SortKey>("amount");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [intakeOpen, setIntakeOpen] = useState(false);
  // Right-click → "Reassign agent…" context menu state. Only super_admin
  // / loan_exec can open this — broker rows don't render the trigger.
  const [reassignTarget, setReassignTarget] = useState<{ loan: Loan; x: number; y: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ loan: Loan; x: number; y: number } | null>(null);

  const canCreateLead = isBroker || profile.role === "super_admin";
  // Brokers now default to (and live in) Funding Files mode, mirroring
  // the mobile pipeline FAB → /agent/loan/new. They must be able to
  // start a file here too — SmartIntakeModal finds-or-creates the
  // client and originates the loan.
  const canCreateDeal = isInternal || isBroker;

  const docsByLoan = useMemo(() => {
    const grouped = new Map<string, Document[]>();
    for (const doc of allDocs) {
      const current = grouped.get(doc.loan_id) ?? [];
      current.push(doc);
      grouped.set(doc.loan_id, current);
    }
    return grouped;
  }, [allDocs]);

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
        (l.city ?? "").toLowerCase().includes(q) ||
        (l.client_name ?? "").toLowerCase().includes(q) ||
        (l.broker_name ?? "").toLowerCase().includes(q),
    );
  }, [sorted, search]);

  const totalValue = visibleLoans.reduce((acc, l) => acc + Number(l.amount), 0);
  const fundingRows = useMemo(() => visibleLoans.map((loan) => {
    const loanDocs = docsByLoan.get(loan.id) ?? [];
    const readiness = getFileCompletion(loan, loanDocs);
    const openDocs = loanDocs.filter((doc) => doc.status !== "verified" && doc.status !== "skipped");
    const flaggedDocs = loanDocs.filter((doc) => doc.status === "flagged");
    const summary = summaryByLoanId.get(loan.id);
    return {
      loan,
      loanDocs,
      readiness,
      openDocs,
      flaggedDocs,
      summary,
      action: getPipelineAction(readiness.score, openDocs.length, flaggedDocs.length, summary),
    };
  }), [visibleLoans, docsByLoan, summaryByLoanId]);
  const underwritingReady = fundingRows.filter((row) => row.readiness.score >= 85 && row.openDocs.length === 0).length;
  const needsStructure = fundingRows.filter((row) => row.readiness.score < 65).length;
  const openConditionCount = fundingRows.reduce((acc, row) => acc + row.openDocs.length, 0);
  const blockedAiCount = fundingRows.filter((row) => row.summary?.state === "blocked").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: 0, color: t.ink, margin: 0 }}>
          {isInternal && mode === "funding" ? "Underwriting CRM" : "Pipeline"}
        </h1>

        {/* Files / Relationships toggle — available to brokers AND
            operators, mirroring the mobile pipeline. "Funding Files"
            is the deal-id-focused loan table (default). "Agent
            Relationships" is the client funnel; per-client detail
            opens from the Clients tab. */}
        <div style={{
          display: "inline-flex",
          background: t.surface,
          border: `1px solid ${t.line}`,
          borderRadius: 10,
          padding: 3,
          gap: 2,
          marginLeft: 4,
        }}>
          <button
            type="button"
            onClick={() => setMode("funding")}
            style={modeSegBtn(t, mode === "funding")}
          >
            <Icon name="file" size={12} stroke={2.2} /> Funding Files
          </button>
          <button
            type="button"
            onClick={() => setMode("leads")}
            style={modeSegBtn(t, mode === "leads")}
          >
            <Icon name="user" size={12} stroke={2.2} /> Agent Relationships
          </button>
        </div>

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
              placeholder={mode === "funding" ? "Search address or ID..." : "Search clients..."}
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

          {(mode === "funding" ? canCreateDeal : canCreateLead) && (
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
              <Icon name="plus" size={14} /> New file
            </button>
          )}
        </div>
      </div>

      {/* Pipeline owns loan-file creation (the funding target the AI
          nurtures), separate from the client/person creation on the
          Clients tab. Both broker and operator open the same
          SmartIntake flow — it finds-or-creates the client by email,
          then originates a Loan with property + ask + AI cadence. */}
      <SmartIntakeModal open={intakeOpen} onClose={() => setIntakeOpen(false)} />

      {mode === "funding" ? (
        <FundingMetricsRow
          totalFiles={fundingRows.length}
          ready={underwritingReady}
          needsStructure={needsStructure}
          openConditions={openConditionCount}
          blockedAi={blockedAiCount}
          totalValue={totalValue}
          rows={fundingRows}
        />
      ) : null}

      {mode === "leads" ? (
        <LeadsPipelineView view={view} search={search} />
      ) : view === "table" ? (
        // Operators (super_admin / loan_exec) get an extra "Agent" column —
        // brokers don't see it because their list is implicitly scoped to
        // themselves. Grid template flexes accordingly so the row layout
        // doesn't shift between roles.
        (() => {
          // Added a 70px Credit column between Amount and DSCR. Reading
          // order matches an UW's mental model: Property → Readiness →
          // Type/Amount → Credit → DSCR → Conditions → Next action.
          const gridCols = isInternal
            ? "78px minmax(0, 1.55fr) 130px 122px 96px 110px 70px 82px 104px 126px"
            : "78px minmax(0, 1.55fr) 122px 96px 110px 70px 82px 104px 126px";
          return (
            <Card pad={0}>
              <div style={{
                display: "grid", gridTemplateColumns: gridCols,
                padding: "12px 16px", fontSize: 11, fontWeight: 700, color: t.ink3, textTransform: "uppercase", letterSpacing: 1.2,
                borderBottom: `1px solid ${t.line}`,
              }}>
                <SortHead label="ID" k="deal_id" current={sortKey} dir={sortDir} onClick={setSort} />
                <SortHead label="Property" k="address" current={sortKey} dir={sortDir} onClick={setSort} />
                {isInternal ? <div>Agent</div> : null}
                <div>Readiness</div>
                <SortHead label="Type" k="type" current={sortKey} dir={sortDir} onClick={setSort} />
                <SortHead label="Amount" k="amount" current={sortKey} dir={sortDir} onClick={setSort} align="right" />
                <div style={{ textAlign: "right" }}>Credit</div>
                <SortHead label="DSCR" k="dscr" current={sortKey} dir={sortDir} onClick={setSort} align="right" />
                <div>Conditions</div>
                <div>Next action</div>
              </div>
              {fundingRows.map(({ loan, loanDocs, readiness, openDocs, flaggedDocs, summary, action }) => {
                return (
                  <Link
                    key={loan.id}
                    href={`/loans/${loan.id}`}
                    onContextMenu={
                      isInternal
                        ? (e) => {
                            // Super_admin / loan_exec → swap the browser's
                            // context menu for our own "Reassign agent…"
                            // popover anchored at the cursor. Brokers fall
                            // through to the browser default.
                            e.preventDefault();
                            e.stopPropagation();
                            setContextMenu({ loan, x: e.clientX, y: e.clientY });
                          }
                        : undefined
                    }
                    style={{
                      display: "grid", gridTemplateColumns: gridCols,
                      padding: "12px 16px", borderBottom: `1px solid ${t.line}`, alignItems: "center",
                      fontSize: 13, color: t.ink,
                    }}>
                    <div style={{ fontWeight: 800, color: t.ink2 }}>{loan.deal_id}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{loan.address}</div>
                      <div style={{ fontSize: 11.5, color: t.ink3, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span>{loan.city}</span>
                        {isInternal && loan.client_name ? (
                          <>
                            <span aria-hidden>/</span>
                            <span style={{ fontWeight: 700 }}>{loan.client_name}</span>
                          </>
                        ) : null}
                        {loan.close_date ? (
                          <>
                            <span aria-hidden>/</span>
                            <span>Close {new Date(loan.close_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                          </>
                        ) : null}
                        <DealSecretaryBadge summary={summary} />
                      </div>
                    </div>
                    {isInternal ? (
                      <div style={{
                        fontSize: 12.5,
                        fontWeight: loan.broker_name ? 800 : 550,
                        color: loan.broker_name ? t.ink2 : t.ink3,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}>
                        {loan.broker_name ?? "Not assigned"}
                      </div>
                    ) : null}
                    <ReadinessCell score={readiness.score} label={readiness.label} />
                    <div><Pill>{loanTypeLabel(loan.type)}</Pill></div>
                    <div style={{ textAlign: "right", fontWeight: 800, fontFeatureSettings: '"tnum"' }}>{QC_FMT.short(Number(loan.amount))}</div>
                    <CreditCell fico={loan.fico_override ?? loan.client_fico ?? null} override={loan.fico_override != null} />
                    <div style={{ textAlign: "right", color: loan.dscr && loan.dscr >= 1.25 ? t.profit : loan.dscr && loan.dscr >= 1.0 ? t.warn : t.ink3, fontWeight: 800 }}>
                      {loan.dscr ? loan.dscr.toFixed(2) : "—"}
                    </div>
                    <ConditionCell open={openDocs.length} flagged={flaggedDocs.length} total={loanDocs.length} />
                    <PipelineActionCell action={action} />
                  </Link>
                );
              })}
            </Card>
          );
        })()
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
          {STAGE_KEYS.map((k, i) => {
            const stageLoans = fundingRows.filter((row) => row.loan.stage === k);
            return (
              <div key={k} style={{ background: t.surface2, padding: 12, borderRadius: 12, border: `1px solid ${t.line}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <StageBadge stage={i} />
                  <div style={{ fontSize: 12, fontWeight: 700, color: t.ink3 }}>{stageLoans.length}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {stageLoans.map(({ loan, readiness, openDocs, action }) => {
                    return (
                      <Link
                        key={loan.id}
                        href={`/loans/${loan.id}`}
                        onContextMenu={
                          isInternal
                            ? (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setContextMenu({ loan, x: e.clientX, y: e.clientY });
                              }
                            : undefined
                        }
                        style={{ background: t.surface, padding: 11, borderRadius: 10, border: `1px solid ${t.line}`, display: "flex", flexDirection: "column", gap: 8 }}>
                        <div>
                          <div style={{ fontSize: 11, color: t.ink3, fontWeight: 800 }}>{loan.deal_id}</div>
                          <div style={{ fontSize: 12.5, fontWeight: 850, color: t.ink, marginTop: 2, lineHeight: 1.25 }}>{loan.address}</div>
                          <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 2 }}>{QC_FMT.short(Number(loan.amount))} / {loanTypeLabel(loan.type)}</div>
                        </div>
                        <ReadinessBar score={readiness.score} label={readiness.label} />
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                          <span style={{ fontSize: 11, color: openDocs.length ? t.warn : t.profit, fontWeight: 850 }}>{openDocs.length} open</span>
                          <span style={{ fontSize: 11, color: loan.dscr && loan.dscr >= 1.25 ? t.profit : loan.dscr ? t.warn : t.ink3, fontWeight: 850 }}>
                            DSCR {loan.dscr ? loan.dscr.toFixed(2) : "—"}
                          </span>
                        </div>
                        <PipelineActionCell action={action} compact />
                        {isInternal && (loan.broker_name || loan.client_name) ? (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {loan.broker_name ? (
                              <span style={{
                                fontSize: 10, fontWeight: 800,
                                padding: "1px 5px", borderRadius: 3,
                                background: t.brandSoft, color: t.brand,
                              }}>
                                {loan.broker_name}
                              </span>
                            ) : null}
                            {loan.client_name ? (
                              <span style={{
                                fontSize: 10, fontWeight: 700,
                                padding: "1px 5px", borderRadius: 3,
                                background: t.surface2, color: t.ink2,
                              }}>
                                {loan.client_name}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {contextMenu ? (
        <PipelineRowContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          loan={contextMenu.loan}
          onReassign={() =>
            setReassignTarget({ loan: contextMenu.loan, x: contextMenu.x, y: contextMenu.y })
          }
          onClose={() => setContextMenu(null)}
        />
      ) : null}
      {reassignTarget ? (
        <LoanAgentPicker
          loan={reassignTarget.loan}
          anchor={{ x: reassignTarget.x, y: reassignTarget.y }}
          onClose={() => {
            setReassignTarget(null);
            setContextMenu(null);
          }}
        />
      ) : null}
    </div>
  );
}

// Right-click context menu for funding-mode pipeline rows. Currently
// only carries the "Reassign agent…" action — kept as a generic
// container so future row-level actions (e.g. open in new tab, copy
// link, archive) can drop in without restructuring.
function PipelineRowContextMenu({
  x,
  y,
  loan,
  onReassign,
  onClose,
}: {
  x: number;
  y: number;
  loan: Loan;
  onReassign: () => void;
  onClose: () => void;
}) {
  const { t } = useTheme();
  // Dismiss on Escape + outside-click. Defer the click handler one
  // tick so the right-click that opened this doesn't immediately
  // close it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onClick = () => onClose();
    window.addEventListener("keydown", onKey);
    const id = window.setTimeout(() => {
      window.addEventListener("click", onClick);
    }, 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClick);
      window.clearTimeout(id);
    };
  }, [onClose]);
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: "fixed",
        top: y,
        left: x,
        zIndex: 80,
        minWidth: 200,
        background: t.surface,
        border: `1px solid ${t.line}`,
        borderRadius: 8,
        boxShadow: "0 14px 32px rgba(0,0,0,0.32)",
        padding: 4,
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <div
        style={{
          padding: "8px 10px 4px",
          fontSize: 10,
          fontWeight: 900,
          color: t.ink3,
          letterSpacing: 0.6,
          textTransform: "uppercase",
        }}
      >
        {loan.deal_id} · {loan.broker_name ?? "Unassigned"}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onReassign();
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          borderRadius: 4,
          border: "none",
          background: "transparent",
          color: t.ink,
          fontSize: 13,
          cursor: "pointer",
          textAlign: "left",
          fontFamily: "inherit",
        }}
        onMouseOver={(e) => ((e.currentTarget as HTMLElement).style.background = t.surface2)}
        onMouseOut={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
      >
        <Icon name="user" size={12} stroke={2.2} />
        {loan.broker_id ? "Reassign agent…" : "Assign agent…"}
      </button>
    </div>
  );
}

// FundingMetricsRow — slim ~30% replacement for the old FundingCommandStrip.
// One row of compact tiles (no big "Funding command" hero copy), paired
// with a Next Closing card that pulls the soonest close_date out of the
// visible loans. The card is the operator's "what does this week look
// like" pulse — what's about to fund, when, and how much.
function FundingMetricsRow({
  totalFiles, ready, needsStructure, openConditions, blockedAi, totalValue, rows,
}: {
  totalFiles: number;
  ready: number;
  needsStructure: number;
  openConditions: number;
  blockedAi: number;
  totalValue: number;
  rows: { loan: import("@/lib/types").Loan }[];
}) {
  const { t } = useTheme();
  // Next closing — earliest close_date in the visible set that hasn't
  // already passed (or, if everything's past, the soonest past one so
  // the operator notices the slipped close).
  const nextClose = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const withDate = rows
      .map((r) => r.loan)
      .filter((l) => !!l.close_date)
      .map((l) => ({ loan: l, ts: new Date(l.close_date as string).getTime() }))
      .sort((a, b) => a.ts - b.ts);
    if (withDate.length === 0) return null;
    const upcoming = withDate.find((x) => x.ts >= today.getTime());
    return upcoming ?? withDate[withDate.length - 1];
  }, [rows]);

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)",
      gap: 10,
      alignItems: "stretch",
    }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
        gap: 8,
        padding: 8,
        borderRadius: 11,
        background: t.surface,
        border: `1px solid ${t.line}`,
      }}>
        <MiniMetric label="Files" value={totalFiles} tone="neutral" />
        <MiniMetric label="UW ready" value={ready} tone={ready ? "ready" : "neutral"} />
        <MiniMetric label="Needs structure" value={needsStructure} tone={needsStructure ? "watch" : "ready"} />
        <MiniMetric label="Open conditions" value={openConditions} tone={openConditions ? "watch" : "ready"} />
        <MiniMetric label="AI blocked" value={blockedAi} tone={blockedAi ? "danger" : "ready"} sub={QC_FMT.short(totalValue)} />
      </div>
      <NextClosingCard item={nextClose} t={t} />
    </div>
  );
}

function MiniMetric({
  label, value, tone = "neutral", sub,
}: {
  label: string;
  value: string | number;
  tone?: "ready" | "watch" | "danger" | "neutral";
  sub?: string;
}) {
  const { t } = useTheme();
  const color = tone === "ready" ? t.profit : tone === "watch" ? t.warn : tone === "danger" ? t.danger : t.ink;
  return (
    <div style={{
      padding: "6px 9px",
      borderRadius: 8,
      background: t.surface2,
      border: `1px solid ${t.line}`,
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
      gap: 1,
    }}>
      <span style={{ fontSize: 9.5, fontWeight: 900, color: t.ink3, letterSpacing: 0.8, textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </span>
      <span style={{ fontSize: 16, fontWeight: 950, color, fontFeatureSettings: '"tnum"', lineHeight: 1.1 }}>
        {value}
      </span>
      {sub ? <span style={{ fontSize: 9.5, fontWeight: 800, color: t.ink3 }}>{sub} total</span> : null}
    </div>
  );
}

function NextClosingCard({
  item, t,
}: {
  item: { loan: import("@/lib/types").Loan; ts: number } | null;
  t: ReturnType<typeof useTheme>["t"];
}) {
  if (item === null) {
    return (
      <div style={{
        padding: 12, borderRadius: 11,
        background: t.surface, border: `1px solid ${t.line}`,
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <Icon name="cal" size={16} style={{ color: t.ink3 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 900, color: t.ink3, letterSpacing: 1, textTransform: "uppercase" }}>Next closing</div>
          <div style={{ marginTop: 2, fontSize: 12.5, color: t.ink3 }}>No close dates on any file yet.</div>
        </div>
      </div>
    );
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((item.ts - today.getTime()) / 86_400_000);
  const overdue = days < 0;
  const daysLabel = days === 0 ? "today" : overdue ? `${Math.abs(days)}d overdue` : `in ${days}d`;
  const tone = overdue ? t.danger : days <= 3 ? t.warn : days <= 10 ? t.brand : t.ink2;
  const toneBg = overdue ? t.dangerBg : days <= 3 ? t.warnBg : days <= 10 ? t.brandSoft : t.surface2;
  const dateStr = new Date(item.ts).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
  return (
    <Link href={`/loans/${item.loan.id}`} style={{
      padding: 10, borderRadius: 11,
      background: t.surface, border: `1px solid ${t.line}`,
      display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) auto", gap: 10,
      alignItems: "center", textDecoration: "none", color: t.ink,
    }}>
      <div style={{
        padding: "6px 10px", borderRadius: 8,
        background: toneBg, color: tone,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        minWidth: 64,
      }}>
        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.6, textTransform: "uppercase" }}>{overdue ? "Slipped" : "Closes"}</span>
        <span style={{ fontSize: 14, fontWeight: 950, lineHeight: 1.1 }}>{daysLabel}</span>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 900, color: t.ink3, letterSpacing: 1, textTransform: "uppercase" }}>Next closing</div>
        <div style={{ marginTop: 2, fontSize: 13.5, fontWeight: 850, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.loan.address}
        </div>
        <div style={{ marginTop: 1, fontSize: 11.5, color: t.ink3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {dateStr} · {item.loan.deal_id}
          {item.loan.client_name ? ` · ${item.loan.client_name}` : ""}
        </div>
      </div>
      <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
        <div style={{ fontSize: 14, fontWeight: 950, color: t.ink, fontFeatureSettings: '"tnum"' }}>
          {QC_FMT.short(Number(item.loan.amount))}
        </div>
        <div style={{ fontSize: 10, fontWeight: 800, color: t.ink3, textTransform: "uppercase", letterSpacing: 0.4 }}>
          {String(item.loan.type).replace("_", " ")}
        </div>
      </div>
    </Link>
  );
}

function CreditCell({ fico, override }: { fico: number | null; override: boolean }) {
  const { t } = useTheme();
  if (fico === null) {
    return (
      <div style={{ textAlign: "right", color: t.ink3, fontWeight: 700, fontSize: 12.5 }}>—</div>
    );
  }
  const tone = fico >= 740 ? t.profit : fico >= 680 ? t.warn : t.danger;
  return (
    <div style={{ textAlign: "right", fontFeatureSettings: '"tnum"' }}>
      <div style={{ fontSize: 12.5, fontWeight: 900, color: tone, lineHeight: 1.1 }}>
        {fico}
      </div>
      {override ? (
        <div style={{ fontSize: 9, fontWeight: 800, color: t.ink3, letterSpacing: 0.3, textTransform: "uppercase" }}>
          override
        </div>
      ) : null}
    </div>
  );
}

function ReadinessCell({ score, label }: { score: number; label: string }) {
  const { t } = useTheme();
  const color = score >= 85 ? t.profit : score >= 65 ? t.warn : t.brand;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 12.5, fontWeight: 900, color, fontFeatureSettings: '"tnum"' }}>{score}%</span>
        <span style={{ fontSize: 10.5, fontWeight: 800, color: t.ink3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: t.line, overflow: "hidden", marginTop: 5 }}>
        <div style={{ width: `${score}%`, height: "100%", background: color }} />
      </div>
    </div>
  );
}

function ReadinessBar({ score, label }: { score: number; label: string }) {
  const { t } = useTheme();
  const color = score >= 85 ? t.profit : score >= 65 ? t.warn : t.brand;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 10.5, color: t.ink3, fontWeight: 850 }}>{label}</span>
        <span style={{ fontSize: 11, color, fontWeight: 950, fontFeatureSettings: '"tnum"' }}>{score}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: t.line, overflow: "hidden", marginTop: 5 }}>
        <div style={{ width: `${score}%`, height: "100%", background: color }} />
      </div>
    </div>
  );
}

type PipelineAction = {
  label: string;
  tone: "ready" | "watch" | "danger" | "brand";
};

function getPipelineAction(
  readiness: number,
  openDocs: number,
  flaggedDocs: number,
  summary: DSPipelineSummaryItem | undefined,
): PipelineAction {
  if (summary?.state === "blocked") return { label: "AI blocked", tone: "danger" };
  if (flaggedDocs > 0) return { label: "Review docs", tone: "danger" };
  if (readiness < 65) return { label: "Build criteria", tone: "brand" };
  if (openDocs > 0) return { label: "Collect docs", tone: "watch" };
  if (summary?.state === "waiting_borrower") return { label: "Waiting borrower", tone: "watch" };
  if (readiness >= 85) return { label: "Submit UW", tone: "ready" };
  return { label: "File review", tone: "brand" };
}

function PipelineActionCell({ action, compact }: { action: PipelineAction; compact?: boolean }) {
  const { t } = useTheme();
  const color = action.tone === "ready" ? t.profit : action.tone === "danger" ? t.danger : action.tone === "watch" ? t.warn : t.brand;
  const bg = action.tone === "ready" ? t.profitBg : action.tone === "danger" ? t.dangerBg : action.tone === "watch" ? t.warnBg : t.brandSoft;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, justifyContent: compact ? "flex-start" : "center", minWidth: 0 }}>
      <span style={{ padding: compact ? "3px 7px" : "4px 8px", borderRadius: 999, background: bg, color, fontSize: compact ? 10.5 : 11.5, fontWeight: 900, whiteSpace: "nowrap" }}>
        {action.label}
      </span>
    </div>
  );
}

function ConditionCell({ open, flagged, total }: { open: number; flagged: number; total: number }) {
  const { t } = useTheme();
  const color = flagged ? t.danger : open ? t.warn : total ? t.profit : t.ink3;
  const bg = flagged ? t.dangerBg : open ? t.warnBg : total ? t.profitBg : t.surface2;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, color, fontWeight: 850, fontSize: 12 }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: color }} />
      <span style={{ padding: "3px 7px", borderRadius: 999, background: bg }}>
        {flagged ? `${flagged} flagged` : open ? `${open} open` : total ? "clear" : "none"}
      </span>
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

// Brand-tinted variant of segBtn for the top-level mode switcher. Bigger
// hit target + brand color when active so it reads as the primary
// view control on the page, not the same weight as the kanban/table
// view toggle.
function modeSegBtn(t: ReturnType<typeof useTheme>["t"], active: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    padding: "8px 14px",
    borderRadius: 8,
    border: "none",
    background: active ? t.brand : "transparent",
    color: active ? t.inverse : t.ink2,
    fontSize: 12.5,
    fontWeight: 850,
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
  };
}

function DealSecretaryBadge({ summary }: { summary: DSPipelineSummaryItem | undefined }) {
  const { t } = useTheme();
  if (!summary || summary.ai_task_count === 0) return null;

  // Map state → icon + tone.
  let icon = "ai";
  let bg = t.brandSoft;
  let color = t.brand;
  let label = "";
  if (summary.state === "blocked") {
    icon = "alert"; bg = t.warnBg; color = t.warn;
    label = summary.current_blocker
      ? `Blocked · ${summary.current_blocker}`
      : `Blocked · ${summary.blocked_count} task${summary.blocked_count === 1 ? "" : "s"}`;
  } else if (summary.state === "waiting_borrower") {
    label = "Waiting on borrower";
    if (summary.next_outreach_at) {
      const t = new Date(summary.next_outreach_at);
      label += ` · next ${t.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
    }
  } else if (summary.state === "active_work") {
    label = `AI working · ${summary.ai_task_count} task${summary.ai_task_count === 1 ? "" : "s"}`;
  } else {
    // setup
    icon = "pause"; bg = t.surface2; color = t.ink3;
    label = `Setup · ${summary.ai_task_count} assigned, outreach off`;
  }

  return (
    <>
      <span aria-hidden>·</span>
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "1px 6px", borderRadius: 4,
        background: bg, color, fontWeight: 700,
        fontSize: 10.5, letterSpacing: 0.2,
      }}>
        <Icon name={icon} size={11} />
        {label}
      </span>
    </>
  );
}
