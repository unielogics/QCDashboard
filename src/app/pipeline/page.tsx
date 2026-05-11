"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, StageBadge } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useDealSecretarySummary, useDocuments, useLoans, type DSPipelineSummaryItem } from "@/hooks/useApi";
import { QC_FMT } from "@/components/design-system/tokens";
import { loanTypeLabel, type Document } from "@/lib/types";
import { getFileCompletion } from "@/app/loans/[id]/fileReadiness";
import { SmartIntakeModal } from "./components/SmartIntakeModal";
import { AgentLeadModal } from "./components/AgentLeadModal";
import { LeadsPipelineView } from "./components/LeadsPipelineView";
import { useActiveProfile } from "@/store/role";

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
  // Top-level mode: Leads (Agent funnel) vs Funding (loan stages). Each mode
  // independently picks kanban vs table for layout. Agents see Leads by
  // default; non-Agent operators land on Funding.
  const isBroker = profile.role === "broker";
  const isInternal = profile.role === "super_admin" || profile.role === "loan_exec";
  const { data: allDocs = [] } = useDocuments();
  const [mode, setMode] = useState<PipelineMode>(isBroker ? "leads" : "funding");
  const [view, setView] = useState<"table" | "kanban">("table");
  const [sortKey, setSortKey] = useState<SortKey>("amount");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [intakeOpen, setIntakeOpen] = useState(false);

  const canCreateLead = isBroker || profile.role === "super_admin";
  const canCreateDeal = isInternal;

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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.5, color: t.ink, margin: 0 }}>
          Pipeline
        </h1>

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
          <option value="leads">Agent Relationships</option>
          <option value="funding">Funding Files</option>
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
              <Icon name="plus" size={14} /> {mode === "funding" ? "New deal" : "New relationship"}
            </button>
          )}
        </div>
      </div>

      {/* Role-aware container split: agents capture a real-estate lead
          (no Loan); super-admin / underwriter originate a Loan. The
          two modals share field shapes but model different mental
          surfaces — never merge them. */}
      {profile.role === "broker" ? (
        <AgentLeadModal open={intakeOpen} onClose={() => setIntakeOpen(false)} />
      ) : (
        <SmartIntakeModal open={intakeOpen} onClose={() => setIntakeOpen(false)} />
      )}

      {mode === "leads" ? (
        <LeadsPipelineView view={view} search={search} />
      ) : view === "table" ? (
        // Operators (super_admin / loan_exec) get an extra "Agent" column —
        // brokers don't see it because their list is implicitly scoped to
        // themselves. Grid template flexes accordingly so the row layout
        // doesn't shift between roles.
        (() => {
          const gridCols = isInternal
            ? "78px minmax(0, 1.7fr) 130px 122px 96px 110px 82px 104px 86px"
            : "78px minmax(0, 1.7fr) 122px 96px 110px 82px 104px 86px";
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
                <SortHead label="DSCR" k="dscr" current={sortKey} dir={sortDir} onClick={setSort} align="right" />
                <div>Conditions</div>
                <SortHead label="Close" k="close_date" current={sortKey} dir={sortDir} onClick={setSort} />
              </div>
              {visibleLoans.map((loan) => {
                const loanDocs = docsByLoan.get(loan.id) ?? [];
                const readiness = getFileCompletion(loan, loanDocs);
                const openDocs = loanDocs.filter((doc) => doc.status !== "verified" && doc.status !== "skipped");
                const flaggedDocs = loanDocs.filter((doc) => doc.status === "flagged");
                return (
                  <Link key={loan.id} href={`/loans/${loan.id}`} style={{
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
                        <DealSecretaryBadge summary={summaryByLoanId.get(loan.id)} />
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
                    <div style={{ textAlign: "right", color: loan.dscr && loan.dscr >= 1.25 ? t.profit : loan.dscr && loan.dscr >= 1.0 ? t.warn : t.ink3, fontWeight: 800 }}>
                      {loan.dscr ? loan.dscr.toFixed(2) : "—"}
                    </div>
                    <ConditionCell open={openDocs.length} flagged={flaggedDocs.length} total={loanDocs.length} />
                    <div style={{ color: t.ink3, fontSize: 12 }}>{loan.close_date ? new Date(loan.close_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</div>
                  </Link>
                );
              })}
            </Card>
          );
        })()
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
                  {stageLoans.map((loan) => {
                    const loanDocs = docsByLoan.get(loan.id) ?? [];
                    const readiness = getFileCompletion(loan, loanDocs);
                    const openDocs = loanDocs.filter((doc) => doc.status !== "verified" && doc.status !== "skipped").length;
                    return (
                      <Link key={loan.id} href={`/loans/${loan.id}`} style={{ background: t.surface, padding: 11, borderRadius: 10, border: `1px solid ${t.line}`, display: "flex", flexDirection: "column", gap: 8 }}>
                        <div>
                          <div style={{ fontSize: 11, color: t.ink3, fontWeight: 800 }}>{loan.deal_id}</div>
                          <div style={{ fontSize: 12.5, fontWeight: 850, color: t.ink, marginTop: 2, lineHeight: 1.25 }}>{loan.address}</div>
                          <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 2 }}>{QC_FMT.short(Number(loan.amount))} / {loanTypeLabel(loan.type)}</div>
                        </div>
                        <ReadinessBar score={readiness.score} label={readiness.label} />
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                          <span style={{ fontSize: 11, color: openDocs ? t.warn : t.profit, fontWeight: 850 }}>{openDocs} open</span>
                          <span style={{ fontSize: 11, color: loan.dscr && loan.dscr >= 1.25 ? t.profit : loan.dscr ? t.warn : t.ink3, fontWeight: 850 }}>
                            DSCR {loan.dscr ? loan.dscr.toFixed(2) : "—"}
                          </span>
                        </div>
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

function DealSecretaryBadge({ summary }: { summary: DSPipelineSummaryItem | undefined }) {
  const { t } = useTheme();
  if (!summary || summary.ai_task_count === 0) return null;

  // Map state → icon + tone.
  let icon = "🤖";
  let bg = t.brandSoft;
  let color = t.brand;
  let label = "";
  if (summary.state === "blocked") {
    icon = "⚠️"; bg = t.warnBg; color = t.warn;
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
    icon = "🕒"; bg = t.surface2; color = t.ink3;
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
        <span aria-hidden>{icon}</span>
        {label}
      </span>
    </>
  );
}
