"use client";

// OverviewTab — the loan file's front page.
//
// Styling lives in globals.css / app-extras.css. The two-pane shape is
// `.withrail` (main surface + sticky rail); the Health band uses
// `.kpi.tone-*` so a tile that is bad is tinted rather than badged — the band
// is scanned, and a badge inside each tile means reading every tile.

import { Icon } from "@/components/design-system/Icon";
import { QC_FMT } from "@/components/design-system/tokens";
import { Kpi, KpiRow, Panel, StatusLine } from "@/components/ds";
import type { Loan, Document, Activity } from "@/lib/types";
import Link from "next/link";
import { LoanSummaryCard } from "../components/LoanSummaryCard";
import { EmailDraftsCard } from "../components/EmailDraftsCard";

interface Props {
  loan: Loan;
  docs: Document[];
  activity: Activity[];
}

/** "good" | "warn" | "bad" | "neutral" → the sheet's tone modifier. */
function toneClass(status: "good" | "warn" | "bad" | "neutral"): string | undefined {
  if (status === "good") return "tone-ok";
  if (status === "warn") return "tone-warn";
  if (status === "bad") return "tone-bad";
  return undefined;
}

export function OverviewTab({ loan, docs, activity }: Props) {
  const docsReceived = docs.filter((d) => d.status === "received" || d.status === "verified").length;
  const docsTotal = docs.length;
  const docsFlagged = docs.filter((d) => d.status === "flagged").length;
  const docsPending = docs.filter((d) => d.status === "pending" || d.status === "requested").length;

  return (
    <div className="withrail">
      <div className="grid">
        <LoanSummaryCard loan={loan} />
        <EmailDraftsCard loanId={loan.id} />

        <Panel title="Health">
          <KpiRow>
            <Kpi
              label="Docs received"
              value={`${docsReceived}/${docsTotal || 0}`}
              prose
              className={toneClass(docsFlagged ? "bad" : docsPending ? "warn" : docsTotal ? "good" : "neutral")}
            />
            <Kpi
              label="Risk score"
              value={loan.risk_score ?? "—"}
              prose
              className={toneClass(loan.risk_score ? (loan.risk_score >= 80 ? "good" : loan.risk_score >= 70 ? "warn" : "bad") : "neutral")}
            />
            <Kpi
              label="DSCR"
              value={loan.dscr ? loan.dscr.toFixed(2) : "—"}
              prose
              className={toneClass(loan.dscr ? (loan.dscr > 1.25 ? "good" : loan.dscr > 1 ? "warn" : "bad") : "neutral")}
            />
            <Kpi
              label="Days to close"
              value={loan.close_date ? daysUntil(loan.close_date) + "d" : "—"}
              prose
              className={toneClass("neutral")}
            />
          </KpiRow>
        </Panel>

        <Panel title="Pricing snapshot">
          <KpiRow>
            <Kpi label="Loan amount" value={QC_FMT.short(Number(loan.amount))} sub={loan.ltv ? `${(loan.ltv * 100).toFixed(0)}% LTV` : ""} />
            <Kpi label="Final rate" value={loan.final_rate ? `${(loan.final_rate * 100).toFixed(3)}%` : "—"} sub={loan.discount_points > 0 ? `${loan.discount_points} pts` : "no buydown"} />
            <Kpi label="Origination" value={`${(loan.origination_pct * 100).toFixed(2)}%`} />
            <Kpi label="Risk score" value={loan.risk_score ?? "—"} />
          </KpiRow>
        </Panel>

        <Panel
          title="Recent activity"
          actions={
            activity.length > 5 ? (
              <Link href="#activity" className="linky">
                See full log <Icon name="chevR" size={11} />
              </Link>
            ) : undefined
          }
        >
          <div className="grid g10">
            {activity.slice(0, 5).map((e) => (
              <div key={e.id} className="row top">
                {/* `.repdot.pet` — the feed's bullet, petrol like every other
                    Elara/system mark in the app. */}
                <span className="repdot pet" />
                <div className="grow">
                  <div>{e.summary}</div>
                  <div className="sub mono">
                    {new Date(e.occurred_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    {e.actor_label && ` · ${e.actor_label}`}
                  </div>
                </div>
              </div>
            ))}
            {activity.length === 0 && <span className="sub">No activity logged yet.</span>}
          </div>
        </Panel>
      </div>

      <div className="railcol">
        <Panel title="AI insights">
          <div className="grid g6">
            {loan.risk_score && loan.risk_score >= 80 && (
              <StatusLine tone="ok">Risk score above threshold — eligible for fast-track UW.</StatusLine>
            )}
            {docsPending >= 2 && (
              <StatusLine tone="warn">{docsPending} doc requests still outstanding. Consider a follow-up.</StatusLine>
            )}
            {docsFlagged > 0 && (
              <StatusLine tone="bad">{docsFlagged} flagged document{docsFlagged > 1 ? "s" : ""} — needs UW review.</StatusLine>
            )}
            {loan.dscr && loan.dscr < 1 && (
              <StatusLine tone="bad">DSCR below 1.0 — the rents do not cover debt service at this rate.</StatusLine>
            )}
            {(!loan.risk_score || loan.risk_score < 80) && docsPending < 2 && docsFlagged === 0 && (loan.dscr == null || loan.dscr >= 1) && (
              <span className="sub">No insights right now — file is on track.</span>
            )}
          </div>
        </Panel>

        <Panel title="Borrower">
          <Link href={`/clients/${loan.client_id}`} className="pick">
            <Icon name="user" size={16} />
            <div className="grow">
              <div><strong>Open client profile</strong></div>
              <div className="sub">view exposure, FICO, all loans</div>
            </div>
            <Icon name="chevR" size={13} />
          </Link>
        </Panel>
      </div>
    </div>
  );
}

function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}
