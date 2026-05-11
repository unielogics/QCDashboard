"use client";

import { useEffect, useMemo } from "react";
import { Pill, VerifiedBadge } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { QC_FMT } from "@/components/design-system/tokens";
import { useLoanPrequalRequests, useRecalc } from "@/hooks/useApi";
import type { Activity, Document, Loan } from "@/lib/types";
import { getCriteriaItems, getFileCompletion } from "../fileReadiness";
// PropertyTab is now embedded inside FundingFileTab instead of living
// on its own tab — property details belong with the rest of the deal
// foundation (address, beds/baths, taxes/insurance, ARV/LTV).
import { PropertyTab } from "./PropertyTab";

export function FundingFileTab({
  loan,
  docs,
  activity,
  canEdit = false,
}: {
  loan: Loan;
  docs: Document[];
  activity: Activity[];
  canEdit?: boolean;
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
      ltv: loan.ltv ?? undefined,
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
    loan.ltv,
  ]);

  const warnings = recalc.data?.warnings ?? [];
  const completion = getFileCompletion(loan, docs, warnings.length);
  const criteria = useMemo(() => getCriteriaItems(loan), [loan]);
  const verifiedDocs = docs.filter((doc) => doc.status === "verified");
  const receivedDocs = docs.filter((doc) => doc.status === "received" || doc.status === "verified");
  const flaggedDocs = docs.filter((doc) => doc.status === "flagged");
  const openDocs = docs.filter((doc) => doc.status !== "verified");
  const latestPrequal = [...prequalRequests].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
  const sizedAmount = Number(recalc.data?.loan_amount ?? loan.amount);
  const finalRate = recalc.data?.final_rate ?? loan.final_rate;
  const dscr = recalc.data?.dscr ?? loan.dscr;
  const ltv = recalc.data?.sizing?.ltv ?? loan.ltv;
  const cap = recalc.data?.sizing?.max_allowed ?? null;
  const binding = recalc.data?.sizing?.binding_constraint ?? null;

  const criticalPath = [
    {
      label: "Criteria",
      icon: "sliders",
      score: completion.criteria.score,
      detail: `${completion.criteria.ready}/${completion.criteria.total} complete`,
      status: completion.criteria.score >= 88 ? "ready" : completion.criteria.score >= 60 ? "watch" : "open",
    },
    {
      label: "Calculations",
      icon: "calc",
      score: warnings.length ? 62 : recalc.data ? 100 : 45,
      detail: warnings.length ? `${warnings.length} warning${warnings.length === 1 ? "" : "s"}` : recalc.isPending ? "Calculating" : "Clean recalc",
      status: warnings.length ? "watch" : recalc.data ? "ready" : "open",
    },
    {
      label: "Documents",
      icon: "docCheck",
      score: completion.docs.score,
      detail: `${verifiedDocs.length}/${docs.length || 0} verified`,
      status: flaggedDocs.length ? "watch" : completion.docs.score >= 88 ? "ready" : "open",
    },
    {
      label: "Pre-Qual",
      icon: "shield",
      score: latestPrequal?.status === "approved" || latestPrequal?.status === "offer_accepted" ? 100 : latestPrequal ? 62 : 18,
      detail: latestPrequal ? latestPrequal.status.replace(/_/g, " ") : "Not started",
      status: latestPrequal?.status === "approved" || latestPrequal?.status === "offer_accepted" ? "ready" : latestPrequal ? "watch" : "open",
    },
  ] as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "240px minmax(0, 1fr) 330px", gap: 14 }}>
        <Panel compact>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <CompletionGauge score={completion.score} label={completion.label} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 900, color: t.ink3, letterSpacing: 1.3, textTransform: "uppercase" }}>
                Funding file
              </div>
              <div style={{ marginTop: 4, fontSize: 18, fontWeight: 900, color: t.ink }}>{completion.label}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, width: "100%" }}>
              <MiniTile label="Criteria" value={`${completion.criteria.ready}/${completion.criteria.total}`} />
              <MiniTile label="Docs" value={`${verifiedDocs.length}/${docs.length || 0}`} />
              <MiniTile label="Warnings" value={warnings.length} tone={warnings.length ? "watch" : "ready"} />
              <MiniTile label="Stage" value={`${completion.stage.index + 1}/${completion.stage.total}`} />
            </div>
          </div>
        </Panel>

        <Panel>
          <HeaderRow eyebrow="Critical path" title="File readiness map" action={`${openDocs.length} open condition${openDocs.length === 1 ? "" : "s"}`} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
            {criticalPath.map((step) => (
              <PathTile key={step.label} step={step} />
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1.25fr 1fr", gap: 10, marginTop: 12 }}>
            <Track label="Document collection" value={completion.docs.score} detail={`${receivedDocs.length} received / ${flaggedDocs.length} flagged`} />
            <Track label="Criteria build" value={completion.criteria.score} detail={`${completion.criteria.ready} ready fields`} />
          </div>
        </Panel>

        <Panel>
          <HeaderRow eyebrow="Blockers" title="Needs attention" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {warnings.slice(0, 3).map((warning) => (
              <AttentionRow key={`${warning.code}-${warning.message}`} tone="watch" icon="alert" title={warning.message} meta={warning.code.replace(/_/g, " ")} />
            ))}
            {flaggedDocs.slice(0, 3).map((doc) => (
              <AttentionRow key={doc.id} tone="danger" icon="doc" title={doc.name} meta={doc.category ?? "Flagged document"} />
            ))}
            {warnings.length === 0 && flaggedDocs.length === 0 ? (
              <AttentionRow tone="ready" icon="check" title="No calculation warnings or flagged documents" meta="Ready for internal review" />
            ) : null}
            {openDocs.length > 0 ? (
              <AttentionRow tone="open" icon="docCheck" title={`${openDocs.length} document condition${openDocs.length === 1 ? "" : "s"} still open`} meta="Review Documents or Conditions" />
            ) : null}
          </div>
        </Panel>
      </div>

      <Panel>
        <HeaderRow eyebrow="Calculation engine" title="Sizing and underwriting snapshot" action={recalc.isPending ? "Calculating" : "Live recalc"} />
        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr 0.8fr 0.8fr 1fr", gap: 10 }}>
          <CalcMetric label="Sized amount" value={QC_FMT.usd(sizedAmount, 0)} emphasis />
          <CalcMetric label="Final rate" value={finalRate != null ? `${(finalRate * 100).toFixed(3)}%` : "Missing"} />
          <CalcMetric label="DSCR" value={dscr != null ? dscr.toFixed(2) : "N/A"} tone={dscr != null && dscr >= 1.25 ? "ready" : dscr ? "watch" : "open"} />
          <CalcMetric label="LTV" value={ltv != null ? `${(ltv * 100).toFixed(1)}%` : "N/A"} tone={ltv != null && ltv <= 0.75 ? "ready" : ltv ? "watch" : "open"} />
          <CalcMetric label="Binding cap" value={cap ? QC_FMT.usd(cap, 0) : "No cap"} sub={binding ? binding.replace(/_/g, " ") : undefined} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 12 }}>
          <RatioBar label="DSCR target" value={dscr ?? 0} target={1.25} formatter={(v) => v.toFixed(2)} />
          <RatioBar label="LTV ceiling" value={ltv ?? 0} target={0.75} formatter={(v) => `${(v * 100).toFixed(1)}%`} reverse />
          <RatioBar label="Completion" value={completion.score} target={100} formatter={(v) => `${Math.round(v)}%`} />
        </div>
      </Panel>

      {/* Property details — folded in from the standalone Property tab.
          Lives between the calc engine snapshot and the criteria matrix
          so the file flows: status → math → what we're lending against →
          what's still needed → activity. */}
      <PropertyTab loan={loan} canEdit={canEdit} />

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 390px", gap: 14 }}>
        <Panel>
          <HeaderRow eyebrow="Criteria matrix" title="Fields required before underwriting" action={`${completion.criteria.score}% complete`} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 9 }}>
            {criteria.map((item) => (
              <CriterionTile key={item.id} label={item.label} value={item.value} ready={item.ready} group={item.group} />
            ))}
          </div>
        </Panel>

        <Panel>
          <HeaderRow eyebrow="Open conditions" title="Document queue" action={`${openDocs.length} open`} />
          {openDocs.length === 0 ? (
            <div style={{ padding: 14, borderRadius: 12, background: t.profitBg, color: t.profit, display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 850 }}>
              <Icon name="check" size={15} />
              All document conditions are verified.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {openDocs.slice(0, 7).map((doc) => (
                <ConditionRow key={doc.id} doc={doc} />
              ))}
              {openDocs.length > 7 ? (
                <div style={{ fontSize: 12, color: t.ink3, fontWeight: 750 }}>+{openDocs.length - 7} more in Documents</div>
              ) : null}
            </div>
          )}
        </Panel>
      </div>

      <Panel>
        <HeaderRow eyebrow="Recent file activity" title="Latest movement" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
          {(activity.length
            ? activity.slice(0, 3)
            : [{
                id: "empty",
                loan_id: loan.id,
                actor_id: null,
                actor_label: null,
                kind: "activity",
                summary: "No recent file activity",
                payload: null,
                occurred_at: "",
              }]).map((item) => (
            <div key={item.id} style={{ border: `1px solid ${t.line}`, borderRadius: 12, padding: 12, background: t.surface2, minHeight: 78 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, color: t.ink3, fontSize: 10.5, fontWeight: 850, letterSpacing: 1, textTransform: "uppercase" }}>
                <Icon name="audit" size={13} />
                {item.occurred_at ? new Date(item.occurred_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Activity"}
              </div>
              <div style={{ marginTop: 8, fontSize: 13, fontWeight: 800, color: t.ink, lineHeight: 1.35 }}>{item.summary}</div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Panel({
  children,
  compact,
}: {
  children: React.ReactNode;
  compact?: boolean;
}) {
  const { t } = useTheme();
  return (
    <section
      style={{
        background: t.surface,
        border: `1px solid ${t.line}`,
        borderRadius: 16,
        padding: compact ? 14 : 16,
        boxShadow: t.shadow,
        minWidth: 0,
      }}
    >
      {children}
    </section>
  );
}

function HeaderRow({ eyebrow, title, action }: { eyebrow: string; title: string; action?: string }) {
  const { t } = useTheme();
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
      <div>
        <div style={{ fontSize: 10.5, fontWeight: 900, color: t.ink3, letterSpacing: 1.4, textTransform: "uppercase" }}>{eyebrow}</div>
        <div style={{ marginTop: 3, fontSize: 17, fontWeight: 900, color: t.ink, letterSpacing: 0 }}>{title}</div>
      </div>
      {action ? (
        <Pill bg={t.chip} color={t.ink2} style={{ fontWeight: 800 }}>
          {action}
        </Pill>
      ) : null}
    </div>
  );
}

function CompletionGauge({ score, label }: { score: number; label: string }) {
  const { t } = useTheme();
  const color = score >= 85 ? t.profit : score >= 65 ? t.warn : t.brand;
  return (
    <div
      title={label}
      style={{
        width: 150,
        height: 150,
        borderRadius: 999,
        background: `conic-gradient(${color} ${score * 3.6}deg, ${t.line} 0deg)`,
        display: "grid",
        placeItems: "center",
        boxShadow: `inset 0 0 0 1px ${t.line}`,
      }}
    >
      <div
        style={{
          width: 112,
          height: 112,
          borderRadius: 999,
          background: t.surface,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          border: `1px solid ${t.line}`,
        }}
      >
        <div style={{ fontSize: 34, fontWeight: 950, color, fontFeatureSettings: '"tnum"', lineHeight: 1 }}>{score}%</div>
        <div style={{ marginTop: 5, fontSize: 10, fontWeight: 900, color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase" }}>Complete</div>
      </div>
    </div>
  );
}

function MiniTile({ label, value, tone = "neutral" }: { label: string; value: string | number; tone?: "ready" | "watch" | "neutral" }) {
  const { t } = useTheme();
  const color = tone === "ready" ? t.profit : tone === "watch" ? t.warn : t.ink;
  return (
    <div style={{ border: `1px solid ${t.line}`, borderRadius: 10, padding: "9px 10px", background: t.surface2 }}>
      <div style={{ fontSize: 9.5, fontWeight: 900, color: t.ink3, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 16, fontWeight: 950, color, fontFeatureSettings: '"tnum"' }}>{value}</div>
    </div>
  );
}

function PathTile({
  step,
}: {
  step: {
    label: string;
    icon: string;
    score: number;
    detail: string;
    status: "ready" | "watch" | "open";
  };
}) {
  const { t } = useTheme();
  const color = step.status === "ready" ? t.profit : step.status === "watch" ? t.warn : t.ink3;
  const bg = step.status === "ready" ? t.profitBg : step.status === "watch" ? t.warnBg : t.surface2;
  return (
    <div style={{ border: `1px solid ${t.line}`, borderRadius: 13, padding: 12, background: t.surface2, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, background: bg, color, display: "grid", placeItems: "center" }}>
          <Icon name={step.icon} size={15} />
        </div>
        <div style={{ fontSize: 18, fontWeight: 950, color, fontFeatureSettings: '"tnum"' }}>{Math.round(step.score)}%</div>
      </div>
      <div style={{ marginTop: 10, fontSize: 13, fontWeight: 900, color: t.ink }}>{step.label}</div>
      <div style={{ marginTop: 3, fontSize: 11.5, fontWeight: 700, color: t.ink3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{step.detail}</div>
      <div style={{ height: 5, borderRadius: 999, background: t.line, overflow: "hidden", marginTop: 10 }}>
        <div style={{ width: `${Math.min(100, Math.max(0, step.score))}%`, height: "100%", background: color }} />
      </div>
    </div>
  );
}

function Track({ label, value, detail }: { label: string; value: number; detail: string }) {
  const { t } = useTheme();
  const color = value >= 85 ? t.profit : value >= 60 ? t.warn : t.brand;
  return (
    <div style={{ border: `1px solid ${t.line}`, borderRadius: 12, padding: "10px 12px", background: t.surface2 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: t.ink }}>{label}</div>
        <div style={{ fontSize: 12, fontWeight: 950, color, fontFeatureSettings: '"tnum"' }}>{value}%</div>
      </div>
      <div style={{ marginTop: 8, height: 7, borderRadius: 999, background: t.line, overflow: "hidden" }}>
        <div style={{ width: `${value}%`, height: "100%", background: color }} />
      </div>
      <div style={{ marginTop: 6, fontSize: 11.5, color: t.ink3, fontWeight: 700 }}>{detail}</div>
    </div>
  );
}

function AttentionRow({
  tone,
  icon,
  title,
  meta,
}: {
  tone: "ready" | "watch" | "danger" | "open";
  icon: string;
  title: string;
  meta: string;
}) {
  const { t } = useTheme();
  const color = tone === "ready" ? t.profit : tone === "watch" ? t.warn : tone === "danger" ? t.danger : t.ink3;
  const bg = tone === "ready" ? t.profitBg : tone === "watch" ? t.warnBg : tone === "danger" ? t.dangerBg : t.surface2;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "30px minmax(0, 1fr)", gap: 9, alignItems: "center", padding: 10, borderRadius: 12, border: `1px solid ${t.line}`, background: tone === "open" ? t.surface2 : bg }}>
      <div style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", color, background: tone === "open" ? t.chip : t.surface }}>
        <Icon name={icon} size={14} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 900, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
        <div style={{ marginTop: 2, fontSize: 11, fontWeight: 750, color }}>{meta}</div>
      </div>
    </div>
  );
}

function CalcMetric({
  label,
  value,
  sub,
  tone = "neutral",
  emphasis,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "ready" | "watch" | "open" | "neutral";
  emphasis?: boolean;
}) {
  const { t } = useTheme();
  const color = tone === "ready" ? t.profit : tone === "watch" ? t.warn : tone === "open" ? t.ink3 : t.ink;
  return (
    <div style={{ border: `1px solid ${emphasis ? t.lineStrong : t.line}`, borderRadius: 12, padding: "12px 13px", background: emphasis ? t.brandSoft : t.surface2, minWidth: 0 }}>
      <div style={{ fontSize: 10.5, fontWeight: 900, color: t.ink3, letterSpacing: 1.1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ marginTop: 5, fontSize: emphasis ? 24 : 20, fontWeight: 950, color: emphasis ? t.brand : color, fontFeatureSettings: '"tnum"', overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
      {sub ? <div style={{ marginTop: 3, fontSize: 11, fontWeight: 750, color: t.ink3, textTransform: "capitalize" }}>{sub}</div> : null}
    </div>
  );
}

function RatioBar({
  label,
  value,
  target,
  formatter,
  reverse,
}: {
  label: string;
  value: number;
  target: number;
  formatter: (value: number) => string;
  reverse?: boolean;
}) {
  const { t } = useTheme();
  const ratio = target > 0 ? value / target : 0;
  const healthy = reverse ? value > 0 && value <= target : value >= target;
  const color = healthy ? t.profit : value > 0 ? t.warn : t.ink4;
  const width = Math.max(4, Math.min(100, ratio * 100));
  return (
    <div style={{ border: `1px solid ${t.line}`, borderRadius: 12, padding: "10px 12px", background: t.surface2 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: t.ink }}>{label}</div>
        <div style={{ fontSize: 12, fontWeight: 950, color, fontFeatureSettings: '"tnum"' }}>{formatter(value)}</div>
      </div>
      <div style={{ height: 7, borderRadius: 999, background: t.line, overflow: "hidden", marginTop: 8 }}>
        <div style={{ width: `${width}%`, height: "100%", background: color }} />
      </div>
      <div style={{ marginTop: 6, fontSize: 11, fontWeight: 750, color: t.ink3 }}>Target {formatter(target)}</div>
    </div>
  );
}

function CriterionTile({ label, value, ready, group }: { label: string; value: string; ready: boolean; group: string }) {
  const { t } = useTheme();
  return (
    <div style={{ border: `1px solid ${ready ? t.line : t.warn}55`, borderRadius: 12, padding: 12, background: ready ? t.surface2 : t.warnBg, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <div style={{ fontSize: 10, fontWeight: 900, color: t.ink3, letterSpacing: 1, textTransform: "uppercase" }}>{group}</div>
        <VerifiedBadge kind={ready ? "verified" : "pending"} />
      </div>
      <div style={{ marginTop: 9, fontSize: 12.5, fontWeight: 900, color: t.ink }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 15, fontWeight: 950, color: ready ? t.ink : t.warn, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textTransform: value.includes("_") ? "capitalize" : undefined }}>{value}</div>
    </div>
  );
}

function ConditionRow({ doc }: { doc: Document }) {
  const { t } = useTheme();
  const kind = doc.status === "flagged" ? "flagged" : "pending";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, alignItems: "center", padding: "10px 11px", borderRadius: 12, border: `1px solid ${doc.status === "flagged" ? t.danger : t.line}`, background: doc.status === "flagged" ? t.dangerBg : t.surface2 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 900, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.name}</div>
        <div style={{ marginTop: 3, fontSize: 11, fontWeight: 700, color: t.ink3 }}>
          {doc.category ?? "Document"}
          {doc.requested_on ? ` / requested ${new Date(doc.requested_on).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
        </div>
      </div>
      <VerifiedBadge kind={kind} />
    </div>
  );
}
