"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, StageBadge, KPI, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useDocuments, useLoan, useMessages, useRecalc } from "@/hooks/useApi";
import { QC_FMT } from "@/components/design-system/tokens";
import { useUI } from "@/store/ui";

const TABS = ["Overview", "Terms", "HUD-1", "Docs"] as const;
type Tab = (typeof TABS)[number];
const STAGE_KEYS = ["prequalified", "collecting_docs", "lender_connected", "processing", "closing", "funded"];

export default function LoanDetailPage() {
  const params = useParams<{ id: string }>();
  const { t } = useTheme();
  const setAiOpen = useUI((s) => s.setAiOpen);
  const { data: loan } = useLoan(params.id);
  const { data: docs = [] } = useDocuments(params.id);
  const { data: messages = [] } = useMessages(params.id);
  const recalc = useRecalc();
  const [tab, setTab] = useState<Tab>("Overview");
  const [points, setPoints] = useState(0);

  if (!loan) return <div style={{ color: t.ink3 }}>Loading…</div>;

  const stageIndex = STAGE_KEYS.indexOf(loan.stage);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Hero */}
      <Card pad={20}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: t.ink3, letterSpacing: 1.4 }}>LOAN {loan.deal_id}</span>
              <StageBadge stage={stageIndex} />
              <Pill>{loan.type.replace("_", " ")}</Pill>
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: t.ink, margin: "6px 0 4px", letterSpacing: -0.6 }}>
              {loan.address}
            </h1>
            <div style={{ fontSize: 13, color: t.ink2 }}>
              {loan.city} · {QC_FMT.short(Number(loan.amount))} ·{" "}
              {loan.close_date ? `Close ${new Date(loan.close_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "—"}
            </div>
          </div>
          <button onClick={() => setAiOpen(true)} style={{
            padding: "10px 14px", borderRadius: 10, background: t.petrolSoft, color: t.petrol, fontSize: 13, fontWeight: 700,
            border: `1px solid ${t.line}`, display: "inline-flex", alignItems: "center", gap: 6,
          }}>
            <Icon name="sparkles" size={14} /> Ask co-pilot about this loan
          </button>
        </div>

        {/* Stage stepper */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6, marginTop: 18 }}>
          {STAGE_KEYS.map((s, i) => (
            <div key={s} style={{
              height: 6, borderRadius: 3,
              background: i <= stageIndex ? t.brand : t.line,
            }} />
          ))}
        </div>
      </Card>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${t.line}` }}>
        {TABS.map((label) => (
          <button key={label} onClick={() => setTab(label)} style={{
            padding: "10px 16px",
            borderBottom: `2px solid ${tab === label ? t.brand : "transparent"}`,
            color: tab === label ? t.ink : t.ink3,
            fontSize: 13, fontWeight: 700,
          }}>{label}</button>
        ))}
      </div>

      {tab === "Overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          <KPI label="Loan Amount" value={QC_FMT.short(Number(loan.amount))} sub={`${loan.ltv ? (loan.ltv * 100).toFixed(0) + "% LTV" : ""}`} />
          <KPI label="Final Rate" value={loan.final_rate ? `${(loan.final_rate * 100).toFixed(3)}%` : "—"} sub={loan.discount_points > 0 ? `${loan.discount_points} pts` : "no buydown"} />
          <KPI label="DSCR" value={loan.dscr ? loan.dscr.toFixed(2) : "—"} sub={loan.dscr && loan.dscr >= 1.25 ? "Preferred" : "Standard"} />
          <KPI label="Risk Score" value={loan.risk_score ?? "—"} />
        </div>
      )}

      {tab === "Terms" && (
        <Card pad={20}>
          <SectionLabel>Buy down (HUD simulator)</SectionLabel>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <input type="range" min={0} max={3} step={0.25} value={points} onChange={(e) => setPoints(Number(e.target.value))} style={{ flex: 1 }} />
            <div style={{ width: 80, textAlign: "right", fontWeight: 800, color: t.ink, fontFeatureSettings: '"tnum"' }}>{points.toFixed(2)} pts</div>
            <button
              onClick={() => recalc.mutate({ loanId: loan.id, discount_points: points })}
              style={{ padding: "10px 14px", borderRadius: 10, background: t.brand, color: t.inverse, fontWeight: 700, fontSize: 13 }}
            >Recalc</button>
          </div>
          {recalc.data && (
            <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              <KPI label="Final rate" value={`${(recalc.data.final_rate * 100).toFixed(3)}%`} />
              <KPI label="Monthly P&I" value={QC_FMT.usd(recalc.data.monthly_pi)} />
              <KPI label="DSCR" value={recalc.data.dscr ? recalc.data.dscr.toFixed(2) : "—"} />
              <KPI label="Cash to close (pricing)" value={QC_FMT.usd(recalc.data.cash_to_close_pricing)} />
            </div>
          )}
          {recalc.data?.warnings && recalc.data.warnings.length > 0 && (
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              {recalc.data.warnings.map((w) => (
                <div key={w.code} style={{ padding: 10, borderRadius: 8, background: w.severity === "block" ? t.dangerBg : t.warnBg, color: w.severity === "block" ? t.danger : t.warn, fontSize: 12, fontWeight: 700 }}>
                  {w.message}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "HUD-1" && (
        <Card pad={0}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${t.line}`, fontSize: 13, fontWeight: 700, color: t.ink }}>
            HUD-1 Settlement Statement (Draft)
          </div>
          {/* Pulled from the loan via /loans recalc; replace with dedicated hook later */}
          <div style={{ padding: 16, color: t.ink3, fontSize: 13 }}>
            Open the Terms tab and tap Recalc — HUD total updates with current pricing.
          </div>
        </Card>
      )}

      {tab === "Docs" && (
        <Card pad={16}>
          <SectionLabel>Document Vault</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {docs.length === 0 && <div style={{ color: t.ink3, fontSize: 13 }}>No documents yet.</div>}
            {docs.map((doc) => (
              <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, border: `1px solid ${t.line}` }}>
                <Icon name="doc" size={16} style={{ color: t.ink3 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>{doc.name}</div>
                  <div style={{ fontSize: 11.5, color: t.ink3 }}>{doc.category ?? "uncategorized"}</div>
                </div>
                <Pill bg={
                  doc.status === "verified" ? t.profitBg : doc.status === "received" ? t.brandSoft : doc.status === "flagged" ? t.dangerBg : t.warnBg
                } color={
                  doc.status === "verified" ? t.profit : doc.status === "received" ? t.brand : doc.status === "flagged" ? t.danger : t.warn
                }>
                  {doc.status}
                </Pill>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Always-visible Messages strip */}
      {messages.length > 0 && (
        <Card pad={16}>
          <SectionLabel action={<Link href="/messages" style={{ color: t.brand }}>All messages →</Link>}>Recent activity</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {messages.slice(-3).map((m) => (
              <div key={m.id} style={{ display: "flex", gap: 10, padding: 10, borderRadius: 10, border: `1px solid ${t.line}`, background: m.from_role === "lender" ? t.surface2 : t.surface }}>
                <Pill>{m.from_role}</Pill>
                <div style={{ flex: 1, fontSize: 13, color: t.ink2 }}>{m.body}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
