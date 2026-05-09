"use client";

import { useEffect, useMemo } from "react";
import { Card, Pill, SectionLabel, VerifiedBadge } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { QC_FMT } from "@/components/design-system/tokens";
import { useLoanPrequalRequests, useRecalc } from "@/hooks/useApi";
import type { Activity, Document, Loan } from "@/lib/types";

export function FundingFileTab({
  loan,
  docs,
  activity,
}: {
  loan: Loan;
  docs: Document[];
  activity: Activity[];
}) {
  const { t } = useTheme();
  const recalc = useRecalc();
  const { data: prequalRequests = [] } = useLoanPrequalRequests(loan.id);

  useEffect(() => {
    recalc.mutate({
      loanId: loan.id,
      discount_points: loan.discount_points,
      loan_amount: loan.amount,
      base_rate: loan.base_rate ?? undefined,
      annual_taxes: loan.annual_taxes,
      annual_insurance: loan.annual_insurance,
      monthly_hoa: loan.monthly_hoa,
      purpose: loan.purpose,
      arv: loan.arv,
    });
  }, [
    loan.id,
    loan.amount,
    loan.base_rate,
    loan.discount_points,
    loan.annual_taxes,
    loan.annual_insurance,
    loan.monthly_hoa,
    loan.purpose,
    loan.arv,
  ]);

  const receivedDocs = docs.filter((doc) => doc.status === "received" || doc.status === "verified");
  const verifiedDocs = docs.filter((doc) => doc.status === "verified");
  const flaggedDocs = docs.filter((doc) => doc.status === "flagged");
  const pendingDocs = docs.filter((doc) => doc.status !== "verified");
  const latestPrequal = [...prequalRequests].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
  const warnings = recalc.data?.warnings ?? [];

  const criteria = useMemo(
    () => [
      { label: "Loan amount", ready: Number(loan.amount) > 0, value: QC_FMT.usd(Number(loan.amount || 0), 0) },
      { label: "Base rate", ready: !!loan.base_rate, value: loan.base_rate ? `${(loan.base_rate * 100).toFixed(3)}%` : "Missing" },
      { label: "ARV / value", ready: !!loan.arv, value: loan.arv ? QC_FMT.usd(Number(loan.arv), 0) : "Missing" },
      { label: "Income", ready: !!loan.monthly_rent || loan.type !== "dscr", value: loan.monthly_rent ? QC_FMT.usd(Number(loan.monthly_rent), 0) : loan.type === "dscr" ? "Missing rent" : "Not required" },
      { label: "Terms", ready: !!loan.term_months, value: loan.term_months ? `${loan.term_months} months` : "Default" },
      { label: "Close date", ready: !!loan.close_date, value: loan.close_date ? new Date(loan.close_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Unset" },
    ],
    [loan],
  );
  const criteriaReady = criteria.filter((item) => item.ready).length;
  const readinessScore = Math.round(
    ((criteriaReady / criteria.length) * 0.45 +
      ((docs.length ? verifiedDocs.length / docs.length : 0) * 0.35) +
      (warnings.length === 0 ? 0.2 : 0)) *
      100,
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card pad={18}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <SectionLabel>Internal Funding File</SectionLabel>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 850, color: t.ink, letterSpacing: -0.4 }}>
              Build criteria, clear conditions, and prep underwriting.
            </h2>
            <div style={{ marginTop: 6, fontSize: 13, color: t.ink2, lineHeight: 1.55, maxWidth: 760 }}>
              This is the operator view for file handling. Agents get a limited relationship mirror;
              loan criteria, pricing, conditions, and lender packaging stay internal.
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 120px)", gap: 10 }}>
            <Metric t={t} label="Readiness" value={`${readinessScore}%`} accent={readinessScore >= 80 ? t.profit : readinessScore >= 55 ? t.warn : t.danger} />
            <Metric t={t} label="Docs" value={`${verifiedDocs.length}/${docs.length || 0}`} />
            <Metric t={t} label="Warnings" value={warnings.length} accent={warnings.length ? t.warn : t.profit} />
          </div>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 14 }}>
        <Card pad={18}>
          <SectionLabel action={recalc.isPending ? "Calculating..." : "Backend recalc"}>Calculation Snapshot</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            <Metric t={t} label="Sized amount" value={QC_FMT.usd(Number(recalc.data?.loan_amount ?? loan.amount), 0)} />
            <Metric t={t} label="Final rate" value={recalc.data ? `${(recalc.data.final_rate * 100).toFixed(3)}%` : loan.final_rate ? `${(loan.final_rate * 100).toFixed(3)}%` : "..."} />
            <Metric t={t} label="Monthly P&I" value={recalc.data ? QC_FMT.usd(recalc.data.monthly_pi, 0) : "..."} />
            <Metric
              t={t}
              label="DSCR"
              value={recalc.data?.dscr != null ? recalc.data.dscr.toFixed(2) : loan.dscr != null ? loan.dscr.toFixed(2) : "N/A"}
              accent={(recalc.data?.dscr ?? loan.dscr ?? 0) >= 1.25 ? t.profit : (recalc.data?.dscr ?? loan.dscr ?? 0) > 0 ? t.warn : undefined}
            />
          </div>

          {recalc.data?.sizing ? (
            <div style={{ marginTop: 14, padding: 13, borderRadius: 12, border: `1px solid ${t.line}`, background: t.surface2 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: t.ink }}>Sizing constraint</div>
                  <div style={{ marginTop: 3, fontSize: 12, color: t.ink3 }}>
                    {constraintLabel(recalc.data.sizing.binding_constraint)}
                    {recalc.data.sizing.clamped ? " limited requested amount" : " did not limit requested amount"}
                  </div>
                </div>
                <Pill bg={recalc.data.sizing.clamped ? t.warnBg : t.profitBg} color={recalc.data.sizing.clamped ? t.warn : t.profit}>
                  Cap {QC_FMT.usd(recalc.data.sizing.max_allowed, 0)}
                </Pill>
              </div>
            </div>
          ) : null}

          {warnings.length > 0 ? (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {warnings.map((warning) => (
                <div key={`${warning.code}-${warning.message}`} style={{ display: "flex", gap: 9, padding: "9px 11px", borderRadius: 10, background: t.warnBg, color: t.warn, fontSize: 12.5, fontWeight: 700 }}>
                  <Icon name="alert" size={14} />
                  {warning.message}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", color: t.profit, fontSize: 12.5, fontWeight: 800 }}>
              <Icon name="check" size={14} />
              No calculation warnings from the pricing and sizing engine.
            </div>
          )}
        </Card>

        <Card pad={18}>
          <SectionLabel>File Status</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <StatusRow t={t} icon="docCheck" label="Documents" value={`${receivedDocs.length} received, ${flaggedDocs.length} flagged`} status={flaggedDocs.length ? "watch" : receivedDocs.length === docs.length && docs.length > 0 ? "ready" : "pending"} />
            <StatusRow t={t} icon="shield" label="Pre-Qual" value={latestPrequal ? latestPrequal.status.replace(/_/g, " ") : "No request"} status={latestPrequal?.status === "approved" || latestPrequal?.status === "offer_accepted" ? "ready" : latestPrequal ? "watch" : "pending"} />
            <StatusRow t={t} icon="calc" label="Criteria" value={`${criteriaReady}/${criteria.length} complete`} status={criteriaReady === criteria.length ? "ready" : criteriaReady >= 4 ? "watch" : "pending"} />
            <StatusRow t={t} icon="audit" label="Activity" value={activity[0] ? activity[0].summary : "No recent activity"} status={activity.length ? "ready" : "pending"} />
          </div>
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Card pad={18}>
          <SectionLabel>Loan Criteria</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
            {criteria.map((item) => (
              <div key={item.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 12px", borderRadius: 10, border: `1px solid ${t.line}` }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: t.ink3, letterSpacing: 1, textTransform: "uppercase" }}>{item.label}</div>
                  <div style={{ marginTop: 3, fontSize: 13, fontWeight: 800, color: t.ink }}>{item.value}</div>
                </div>
                <VerifiedBadge kind={item.ready ? "verified" : "pending"} />
              </div>
            ))}
          </div>
        </Card>

        <Card pad={18}>
          <SectionLabel>Conditions To Clear</SectionLabel>
          {pendingDocs.length === 0 ? (
            <div style={{ color: t.profit, fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="check" size={15} />
              No open document conditions.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {pendingDocs.slice(0, 6).map((doc) => (
                <div key={doc.id} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 96px", gap: 10, alignItems: "center", padding: "9px 11px", borderRadius: 10, border: `1px solid ${t.line}` }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.name}</div>
                    <div style={{ marginTop: 2, fontSize: 11.5, color: t.ink3 }}>{doc.category ?? "Document condition"}</div>
                  </div>
                  <VerifiedBadge kind={doc.status === "flagged" ? "flagged" : "pending"} />
                </div>
              ))}
              {pendingDocs.length > 6 ? (
                <div style={{ fontSize: 12, color: t.ink3 }}>+{pendingDocs.length - 6} more conditions in Documents.</div>
              ) : null}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Metric({
  t,
  label,
  value,
  accent,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div style={{ border: `1px solid ${t.line}`, borderRadius: 12, padding: "10px 12px", background: t.surface2 }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: t.ink3, letterSpacing: 1.1, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ marginTop: 5, fontSize: 19, fontWeight: 850, color: accent ?? t.ink, fontFeatureSettings: '"tnum"' }}>
        {value}
      </div>
    </div>
  );
}

function StatusRow({
  t,
  icon,
  label,
  value,
  status,
}: {
  t: ReturnType<typeof useTheme>["t"];
  icon: string;
  label: string;
  value: string;
  status: "ready" | "watch" | "pending";
}) {
  const color = status === "ready" ? t.profit : status === "watch" ? t.warn : t.ink3;
  const bg = status === "ready" ? t.profitBg : status === "watch" ? t.warnBg : t.surface2;
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", padding: 10, borderRadius: 11, border: `1px solid ${t.line}` }}>
      <div style={{ width: 30, height: 30, borderRadius: 9, background: bg, color, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={14} />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 11, color: t.ink3, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
        <div style={{ marginTop: 2, color: t.ink, fontWeight: 750, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
      </div>
    </div>
  );
}

function constraintLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
