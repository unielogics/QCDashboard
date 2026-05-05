"use client";

import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, KPI, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcLinkBtn } from "@/components/design-system/buttons";
import { QC_FMT } from "@/components/design-system/tokens";
import type { Loan, Document, Activity } from "@/lib/types";
import Link from "next/link";
import { LoanSummaryCard } from "../components/LoanSummaryCard";
import { EmailDraftsCard } from "../components/EmailDraftsCard";

interface Props {
  loan: Loan;
  docs: Document[];
  activity: Activity[];
}

export function OverviewTab({ loan, docs, activity }: Props) {
  const { t } = useTheme();
  const docsReceived = docs.filter((d) => d.status === "received" || d.status === "verified").length;
  const docsTotal = docs.length;
  const docsFlagged = docs.filter((d) => d.status === "flagged").length;
  const docsPending = docs.filter((d) => d.status === "pending" || d.status === "requested").length;

  const tile = (label: string, value: string | number, status: "good" | "warn" | "bad" | "neutral") => {
    const c = status === "good" ? t.profit : status === "warn" ? t.warn : status === "bad" ? t.danger : t.ink3;
    const bg = status === "good" ? t.profitBg : status === "warn" ? t.warnBg : status === "bad" ? t.dangerBg : t.chip;
    return (
      <div style={{ background: bg, borderRadius: 10, padding: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: c, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: c, marginTop: 4, fontFeatureSettings: '"tnum"' }}>{value}</div>
      </div>
    );
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <LoanSummaryCard loan={loan} />
        <EmailDraftsCard loanId={loan.id} />
        <Card pad={16}>
          <SectionLabel>Health</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            {tile("Docs received", `${docsReceived}/${docsTotal || 0}`, docsFlagged ? "bad" : docsPending ? "warn" : docsTotal ? "good" : "neutral")}
            {tile("Risk score", loan.risk_score ?? "—", loan.risk_score ? (loan.risk_score >= 80 ? "good" : loan.risk_score >= 70 ? "warn" : "bad") : "neutral")}
            {tile("DSCR", loan.dscr ? loan.dscr.toFixed(2) : "—", loan.dscr ? (loan.dscr > 1.25 ? "good" : loan.dscr > 1 ? "warn" : "bad") : "neutral")}
            {tile("Days to close", loan.close_date ? daysUntil(loan.close_date) + "d" : "—", "neutral")}
          </div>
        </Card>

        <Card pad={16}>
          <SectionLabel>Pricing snapshot</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            <KPI label="Loan amount" value={QC_FMT.short(Number(loan.amount))} sub={loan.ltv ? `${(loan.ltv * 100).toFixed(0)}% LTV` : ""} />
            <KPI label="Final rate" value={loan.final_rate ? `${(loan.final_rate * 100).toFixed(3)}%` : "—"} sub={loan.discount_points > 0 ? `${loan.discount_points} pts` : "no buydown"} />
            <KPI label="Origination" value={`${(loan.origination_pct * 100).toFixed(2)}%`} />
            <KPI label="Risk score" value={loan.risk_score ?? "—"} />
          </div>
        </Card>

        <Card pad={16}>
          <SectionLabel action={
            activity.length > 5 && <Link href="#activity" style={qcLinkBtn(t)}>See full log <Icon name="chevR" size={11} /></Link>
          }>Recent activity</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {activity.slice(0, 5).map((e) => (
              <div key={e.id} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{ width: 6, height: 6, borderRadius: 999, background: t.petrol, marginTop: 7, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: t.ink, fontWeight: 600 }}>{e.summary}</div>
                  <div style={{ fontSize: 11, color: t.ink3, marginTop: 2, fontFamily: "ui-monospace, SF Mono, monospace" }}>
                    {new Date(e.occurred_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    {e.actor_label && ` · ${e.actor_label}`}
                  </div>
                </div>
              </div>
            ))}
            {activity.length === 0 && <div style={{ fontSize: 13, color: t.ink3 }}>No activity logged yet.</div>}
          </div>
        </Card>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Card pad={16}>
          <SectionLabel>AI insights</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {loan.risk_score && loan.risk_score >= 80 && (
              <Insight color={t.profit} bg={t.profitBg}>Risk score above threshold — eligible for fast-track UW.</Insight>
            )}
            {docsPending >= 2 && (
              <Insight color={t.warn} bg={t.warnBg}>{docsPending} doc requests still outstanding. Consider a follow-up.</Insight>
            )}
            {docsFlagged > 0 && (
              <Insight color={t.danger} bg={t.dangerBg}>{docsFlagged} flagged document{docsFlagged > 1 ? "s" : ""} — needs UW review.</Insight>
            )}
            {loan.dscr && loan.dscr < 1 && (
              <Insight color={t.danger} bg={t.dangerBg}>DSCR below 1.0 — the rents do not cover debt service at this rate.</Insight>
            )}
            {(!loan.risk_score || loan.risk_score < 80) && docsPending < 2 && docsFlagged === 0 && (loan.dscr == null || loan.dscr >= 1) && (
              <div style={{ fontSize: 12, color: t.ink3 }}>No insights right now — file is on track.</div>
            )}
          </div>
        </Card>

        <Card pad={16}>
          <SectionLabel>Borrower</SectionLabel>
          <Link href={`/clients/${loan.client_id}`} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
            borderRadius: 9, border: `1px solid ${t.line}`, textDecoration: "none",
          }}>
            <Icon name="user" size={16} style={{ color: t.ink3 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>Open client profile</div>
              <div style={{ fontSize: 11, color: t.ink3 }}>view exposure, FICO, all loans</div>
            </div>
            <Icon name="chevR" size={13} style={{ color: t.ink4 }} />
          </Link>
        </Card>
      </div>
    </div>
  );
}

function Insight({ color, bg, children }: { color: string; bg: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: bg, color, borderRadius: 8,
      padding: "8px 10px", fontSize: 11.5, fontWeight: 600, lineHeight: 1.45,
    }}>
      {children}
    </div>
  );
}

function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}
