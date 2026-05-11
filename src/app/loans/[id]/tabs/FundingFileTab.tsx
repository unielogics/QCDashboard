"use client";

import { useEffect, useMemo, useState } from "react";
import { Pill, VerifiedBadge } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { QC_FMT } from "@/components/design-system/tokens";
import { useLoanPrequalRequests, useRecalc } from "@/hooks/useApi";
import type { Activity, Document, Loan } from "@/lib/types";
import { getCriteriaItems, getFileCompletion, FILE_STAGE_KEYS, FILE_STAGE_LABELS } from "../fileReadiness";
// PropertyTab is now embedded inside FundingFileTab instead of living
// on its own tab — property details belong with the rest of the deal
// foundation (address, beds/baths, taxes/insurance, ARV/LTV).
import { PropertyTab } from "./PropertyTab";

export function FundingFileTab({
  loan,
  docs,
  activity,
  canEdit = false,
  onOpenTab,
}: {
  loan: Loan;
  docs: Document[];
  activity: Activity[];
  canEdit?: boolean;
  onOpenTab?: (tab: string, targetId?: string) => void;
}) {
  const { t } = useTheme();
  const recalc = useRecalc();
  const { data: prequalRequests = [] } = useLoanPrequalRequests(loan.id);
  const [activePanel, setActivePanel] = useState<"math" | "criteria" | "documents" | "property" | "activity">("math");
  const [showBlockers, setShowBlockers] = useState(false);

  useEffect(() => {
    recalc.mutate({
      loanId: loan.id,
      discount_points: loan.discount_points,
      loan_amount: loan.amount,
      base_rate: loan.base_rate ?? undefined,
      annual_taxes: loan.annual_taxes,
      annual_insurance: loan.annual_insurance,
      monthly_hoa: loan.monthly_hoa,
      term_months: loan.term_months,
      monthly_rent: loan.monthly_rent,
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
    loan.term_months,
    loan.monthly_rent,
    loan.purpose,
    loan.arv,
    loan.ltv,
  ]);

  const warnings = recalc.data?.warnings ?? [];
  const completion = getFileCompletion(loan, docs, warnings.length);
  const criteria = useMemo(() => getCriteriaItems(loan), [loan]);
  const missingCriteria = criteria.filter((item) => !item.ready);
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
  const nextAction = getNextAction({
    missingCriteria: missingCriteria.length,
    warningCount: warnings.length,
    flaggedDocs: flaggedDocs.length,
    openDocs: openDocs.length,
    prequalStatus: latestPrequal?.status ?? null,
  });

  const criticalPath = [
    {
      label: "Criteria",
      icon: "sliders",
      score: completion.criteria.score,
      detail: `${completion.criteria.ready}/${completion.criteria.total} complete`,
      status: completion.criteria.score >= 88 ? "ready" : completion.criteria.score >= 60 ? "watch" : "open",
      panel: "criteria" as const,
      tab: "terms",
      targetId: "criteria-pricing",
    },
    {
      label: "Calculations",
      icon: "calc",
      score: warnings.length ? 62 : recalc.data ? 100 : 45,
      detail: warnings.length ? `${warnings.length} warning${warnings.length === 1 ? "" : "s"}` : recalc.isPending ? "Calculating" : "Clean recalc",
      status: warnings.length ? "watch" : recalc.data ? "ready" : "open",
      panel: "math" as const,
      tab: "terms",
      targetId: "criteria-output",
    },
    {
      label: "Docs + Conditions",
      icon: "docCheck",
      score: completion.docs.score,
      detail: `${verifiedDocs.length}/${docs.length || 0} verified`,
      status: flaggedDocs.length ? "watch" : completion.docs.score >= 88 ? "ready" : "open",
      panel: "documents" as const,
      tab: "workflow",
    },
    {
      label: "Pre-Qual",
      icon: "shield",
      score: latestPrequal?.status === "approved" || latestPrequal?.status === "offer_accepted" ? 100 : latestPrequal ? 62 : 18,
      detail: latestPrequal ? latestPrequal.status.replace(/_/g, " ") : "Not started",
      status: latestPrequal?.status === "approved" || latestPrequal?.status === "offer_accepted" ? "ready" : latestPrequal ? "watch" : "open",
      panel: "criteria" as const,
      tab: "prequal",
    },
    {
      label: "Underwriting",
      icon: "shieldChk",
      score: warnings.length ? Math.max(45, 100 - warnings.length * 18) : recalc.data ? 100 : 35,
      detail: warnings.length ? `${warnings.length} validation item${warnings.length === 1 ? "" : "s"}` : recalc.isPending ? "Checking matrix" : "Clean matrix",
      status: warnings.length ? "watch" : recalc.data ? "ready" : "open",
      panel: "math" as const,
      tab: "uw",
    },
  ] as const;

  // Two helper data structures for the blockers popup.
  const totalBlockers = warnings.length + missingCriteria.length + flaggedDocs.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Visual loan-stage stepper — replaces the giant OperationalHeader. */}
      <LoanStageStepper
        currentIndex={completion.stage.index}
        totalStages={completion.stage.total}
      />

      {/* Clickable file-completion strip — opens a popup with blockers. */}
      <FileCompletionStrip
        score={completion.score}
        label={completion.label}
        openDocs={openDocs.length}
        warnings={warnings.length}
        missingCriteria={missingCriteria.length}
        flaggedDocs={flaggedDocs.length}
        totalBlockers={totalBlockers}
        onClick={() => setShowBlockers(true)}
      />
      {showBlockers ? (
        <BlockersPopup
          onClose={() => setShowBlockers(false)}
          warnings={warnings}
          missingCriteria={missingCriteria}
          flaggedDocs={flaggedDocs}
          openDocs={openDocs}
          onOpenTab={onOpenTab}
          onCriteriaJump={(id) => onOpenTab?.("terms", criteriaTarget(id))}
        />
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "220px minmax(0, 1fr)", gap: 14, alignItems: "start" }}>
        <Panel compact>
          <HeaderRow eyebrow="Workspace" title="Open only what you need" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <PanelNavButton active={activePanel === "math"} icon="calc" title="Math + sizing" detail="Live recalc and UW ratios" onClick={() => setActivePanel("math")} />
            <PanelNavButton active={activePanel === "criteria"} icon="sliders" title="Criteria fields" detail={`${completion.criteria.ready}/${completion.criteria.total} ready`} onClick={() => setActivePanel("criteria")} />
            <PanelNavButton active={activePanel === "documents"} icon="docCheck" title="Docs + conditions" detail={`${openDocs.length} open`} onClick={() => setActivePanel("documents")} />
            <PanelNavButton active={activePanel === "property"} icon="building2" title="Property file" detail="Collateral details" onClick={() => setActivePanel("property")} />
            <PanelNavButton active={activePanel === "activity"} icon="audit" title="Activity" detail={`${activity.length} events`} onClick={() => setActivePanel("activity")} />
          </div>
        </Panel>

        {activePanel === "math" ? (
          <Panel>
            <HeaderRow eyebrow="Calculation engine" title="Sizing and underwriting snapshot" action={recalc.isPending ? "Calculating" : "Live recalc"} />
            <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr 0.8fr 0.8fr 1fr", gap: 10 }}>
              <CalcMetric label="Sized amount" value={QC_FMT.usd(sizedAmount, 0)} emphasis />
              <CalcMetric label="Final rate" value={finalRate != null ? `${(finalRate * 100).toFixed(3)}%` : "Missing"} />
              <CalcMetric label="DSCR" value={dscr != null ? dscr.toFixed(2) : "N/A"} tone={dscr != null && dscr >= 1.25 ? "ready" : dscr ? "watch" : "open"} />
              <CalcMetric label="LTV" value={ltv != null ? `${(ltv * 100).toFixed(1)}%` : "N/A"} tone={ltv != null && ltv <= 0.75 ? "ready" : ltv ? "watch" : "open"} />
              <CalcMetric label="Binding cap" value={cap ? QC_FMT.usd(cap, 0) : "No cap"} sub={binding ? binding.replace(/_/g, " ") : undefined} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10, marginTop: 12 }}>
              <CalcMetric label="Term" value={loan.term_months ? `${loan.term_months} mo` : "Missing"} tone={loan.term_months ? "neutral" : "open"} />
              <CalcMetric label="Monthly rent" value={loan.monthly_rent ? QC_FMT.usd(Number(loan.monthly_rent), 0) : loan.type === "dscr" ? "Missing" : "N/A"} tone={loan.type === "dscr" && !loan.monthly_rent ? "open" : "neutral"} />
              <CalcMetric label="ARV / value" value={loan.arv ? QC_FMT.usd(Number(loan.arv), 0) : "Missing"} tone={loan.arv ? "neutral" : "open"} />
              <CalcMetric label="Taxes + ins." value={QC_FMT.usd(Number(loan.annual_taxes || 0) + Number(loan.annual_insurance || 0), 0)} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 12 }}>
              <RatioBar label="DSCR target" value={dscr ?? 0} target={1.25} formatter={(v) => v.toFixed(2)} />
              <RatioBar label="LTV ceiling" value={ltv ?? 0} target={0.75} formatter={(v) => `${(v * 100).toFixed(1)}%`} reverse />
              <RatioBar label="Completion" value={completion.score} target={100} formatter={(v) => `${Math.round(v)}%`} />
            </div>
            <button type="button" onClick={() => onOpenTab?.("terms", "criteria-output")} style={inlineAction(t)}>
              <Icon name="arrowR" size={13} /> Open full criteria workbench
            </button>
          </Panel>
        ) : null}

        {activePanel === "criteria" ? (
          <Panel>
            <HeaderRow eyebrow="Criteria matrix" title="Fields required before underwriting" action={`${completion.criteria.score}% complete`} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 9 }}>
              {criteria.map((item) => (
                <CriterionTile key={item.id} label={item.label} value={item.value} ready={item.ready} group={item.group} onClick={() => onOpenTab?.("terms", criteriaTarget(item.id))} />
              ))}
            </div>
          </Panel>
        ) : null}

        {activePanel === "documents" ? (
          <Panel>
            <HeaderRow eyebrow="Open conditions" title="Document queue" action={`${openDocs.length} open`} />
            {openDocs.length === 0 ? (
              <div style={{ padding: 14, borderRadius: 12, background: t.profitBg, color: t.profit, display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 850 }}>
                <Icon name="check" size={15} />
                All document conditions are verified.
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 9 }}>
                {openDocs.slice(0, 10).map((doc) => (
                  <ConditionRow key={doc.id} doc={doc} onClick={() => onOpenTab?.("docs")} />
                ))}
              </div>
            )}
            <button type="button" onClick={() => onOpenTab?.("workflow")} style={inlineAction(t)}>
              <Icon name="cal" size={13} /> Manage due dates and collection rules
            </button>
          </Panel>
        ) : null}

        {activePanel === "property" ? <PropertyTab loan={loan} canEdit={canEdit} /> : null}

        {activePanel === "activity" ? (
          <Panel>
            <HeaderRow eyebrow="Recent file activity" title="Latest movement" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
              {(activity.length
                ? activity.slice(0, 6)
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
        ) : null}
      </div>
    </div>
  );
}

function OperationalHeader({
  score,
  label,
  nextAction,
  amount,
  finalRate,
  dscr,
  openDocs,
  warnings,
}: {
  score: number;
  label: string;
  nextAction: { tone: "ready" | "watch" | "danger" | "open"; title: string; detail: string };
  amount: number;
  finalRate: number | null | undefined;
  dscr: number | null | undefined;
  openDocs: number;
  warnings: number;
}) {
  const { t } = useTheme();
  const color = nextAction.tone === "ready" ? t.profit : nextAction.tone === "danger" ? t.danger : nextAction.tone === "watch" ? t.warn : t.brand;
  return (
    <section
      style={{
        border: `1px solid ${t.line}`,
        borderRadius: 16,
        background: `linear-gradient(180deg, ${t.surface}, ${t.surface2})`,
        boxShadow: t.shadow,
        padding: 16,
        display: "grid",
        gridTemplateColumns: "minmax(220px, 1fr) 1.25fr minmax(360px, 1.1fr)",
        gap: 14,
        alignItems: "stretch",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10.5, fontWeight: 900, color: t.ink3, letterSpacing: 1.4, textTransform: "uppercase" }}>File command</div>
        <div style={{ marginTop: 5, fontSize: 25, fontWeight: 950, color: t.ink, letterSpacing: 0 }}>{label}</div>
        <div style={{ marginTop: 8, height: 8, borderRadius: 999, background: t.line, overflow: "hidden" }}>
          <div style={{ width: `${score}%`, height: "100%", background: score >= 85 ? t.profit : score >= 65 ? t.warn : t.brand }} />
        </div>
        <div style={{ marginTop: 7, fontSize: 12, fontWeight: 900, color: score >= 85 ? t.profit : score >= 65 ? t.warn : t.brand }}>{score}% complete</div>
      </div>

      <div style={{ border: `1px solid ${t.line}`, borderRadius: 13, background: t.surface, padding: 13, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: `${color}18`, color, display: "grid", placeItems: "center" }}>
            <Icon name={nextAction.tone === "ready" ? "check" : nextAction.tone === "danger" ? "alert" : "arrowR"} size={16} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10.5, fontWeight: 900, color: t.ink3, letterSpacing: 1.1, textTransform: "uppercase" }}>Next action</div>
            <div style={{ marginTop: 4, fontSize: 15, fontWeight: 950, color: t.ink }}>{nextAction.title}</div>
            <div style={{ marginTop: 4, fontSize: 12, fontWeight: 750, color: t.ink3, lineHeight: 1.35 }}>{nextAction.detail}</div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
        <HeaderKpi label="Sized" value={QC_FMT.usd(amount, 0)} />
        <HeaderKpi label="Rate" value={finalRate != null ? `${(finalRate * 100).toFixed(3)}%` : "Missing"} tone={finalRate != null ? "neutral" : "watch"} />
        <HeaderKpi label="DSCR" value={dscr != null ? dscr.toFixed(2) : "N/A"} tone={dscr != null && dscr >= 1.25 ? "ready" : dscr ? "watch" : "neutral"} />
        <HeaderKpi label="Blockers" value={openDocs + warnings} tone={openDocs + warnings ? "watch" : "ready"} />
      </div>
    </section>
  );
}

function HeaderKpi({ label, value, tone = "neutral" }: { label: string; value: string | number; tone?: "ready" | "watch" | "neutral" }) {
  const { t } = useTheme();
  const color = tone === "ready" ? t.profit : tone === "watch" ? t.warn : t.ink;
  return (
    <div style={{ border: `1px solid ${t.line}`, borderRadius: 12, background: t.surface, padding: "10px 11px", minWidth: 0 }}>
      <div style={{ fontSize: 9.5, fontWeight: 900, color: t.ink3, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ marginTop: 5, fontSize: 16, fontWeight: 950, color, fontFeatureSettings: '"tnum"', overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
}

function getNextAction({
  missingCriteria,
  warningCount,
  flaggedDocs,
  openDocs,
  prequalStatus,
}: {
  missingCriteria: number;
  warningCount: number;
  flaggedDocs: number;
  openDocs: number;
  prequalStatus: string | null;
}) {
  if (warningCount > 0) {
    return { tone: "danger" as const, title: "Clear underwriting warnings", detail: `${warningCount} validation item${warningCount === 1 ? "" : "s"} blocking a clean package.` };
  }
  if (missingCriteria > 0) {
    return { tone: "open" as const, title: "Complete loan structure", detail: `${missingCriteria} criteria field${missingCriteria === 1 ? "" : "s"} still missing before underwriting.` };
  }
  if (flaggedDocs > 0) {
    return { tone: "danger" as const, title: "Review flagged documents", detail: `${flaggedDocs} document${flaggedDocs === 1 ? "" : "s"} need quality review.` };
  }
  if (openDocs > 0) {
    return { tone: "watch" as const, title: "Collect open conditions", detail: `${openDocs} document condition${openDocs === 1 ? "" : "s"} remain open.` };
  }
  if (prequalStatus && !["approved", "offer_accepted"].includes(prequalStatus)) {
    return { tone: "watch" as const, title: "Finalize pre-qualification", detail: `Latest request is ${prequalStatus.replace(/_/g, " ")}.` };
  }
  return { tone: "ready" as const, title: "Package ready for review", detail: "Criteria, documents, and live calculations are clean." };
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

function PanelNavButton({
  active,
  icon,
  title,
  detail,
  onClick,
}: {
  active: boolean;
  icon: string;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  const { t } = useTheme();
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        border: `1px solid ${active ? t.brand : t.line}`,
        background: active ? t.brandSoft : t.surface2,
        color: t.ink,
        borderRadius: 11,
        padding: 10,
        cursor: "pointer",
        display: "grid",
        gridTemplateColumns: "28px minmax(0, 1fr)",
        gap: 8,
        alignItems: "center",
        fontFamily: "inherit",
      }}
    >
      <span style={{ width: 28, height: 28, borderRadius: 9, background: active ? t.brand : t.surface, color: active ? t.inverse : t.ink3, display: "grid", placeItems: "center" }}>
        <Icon name={icon} size={14} />
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 12.5, fontWeight: 900, color: active ? t.brand : t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
        <span style={{ display: "block", marginTop: 2, fontSize: 11, fontWeight: 700, color: t.ink3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{detail}</span>
      </span>
    </button>
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
  onClick,
}: {
  step: {
    label: string;
    icon: string;
    score: number;
    detail: string;
    status: "ready" | "watch" | "open";
  };
  onClick: () => void;
}) {
  const { t } = useTheme();
  const color = step.status === "ready" ? t.profit : step.status === "watch" ? t.warn : t.ink3;
  const bg = step.status === "ready" ? t.profitBg : step.status === "watch" ? t.warnBg : t.surface2;
  return (
    <button type="button" onClick={onClick} style={{ textAlign: "left", border: `1px solid ${t.line}`, borderRadius: 13, padding: 12, background: t.surface2, minWidth: 0, cursor: "pointer", fontFamily: "inherit" }}>
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
    </button>
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
  onClick,
}: {
  tone: "ready" | "watch" | "danger" | "open";
  icon: string;
  title: string;
  meta: string;
  onClick?: () => void;
}) {
  const { t } = useTheme();
  const color = tone === "ready" ? t.profit : tone === "watch" ? t.warn : tone === "danger" ? t.danger : t.ink3;
  const bg = tone === "ready" ? t.profitBg : tone === "watch" ? t.warnBg : tone === "danger" ? t.dangerBg : t.surface2;
  return (
    <button type="button" onClick={onClick} style={{ display: "grid", gridTemplateColumns: "30px minmax(0, 1fr) 16px", gap: 9, alignItems: "center", padding: 10, borderRadius: 12, border: `1px solid ${t.line}`, background: tone === "open" ? t.surface2 : bg, cursor: onClick ? "pointer" : "default", textAlign: "left", fontFamily: "inherit" }}>
      <div style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", color, background: tone === "open" ? t.chip : t.surface }}>
        <Icon name={icon} size={14} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 900, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
        <div style={{ marginTop: 2, fontSize: 11, fontWeight: 750, color }}>{meta}</div>
      </div>
      {onClick ? <Icon name="arrowR" size={12} style={{ color: t.ink3 }} /> : <span />}
    </button>
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

function CriterionTile({ label, value, ready, group, onClick }: { label: string; value: string; ready: boolean; group: string; onClick: () => void }) {
  const { t } = useTheme();
  return (
    <button type="button" onClick={onClick} style={{ textAlign: "left", border: `1px solid ${ready ? t.line : t.warn}55`, borderRadius: 12, padding: 12, background: ready ? t.surface2 : t.warnBg, minWidth: 0, cursor: "pointer", fontFamily: "inherit" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <div style={{ fontSize: 10, fontWeight: 900, color: t.ink3, letterSpacing: 1, textTransform: "uppercase" }}>{group}</div>
        <VerifiedBadge kind={ready ? "verified" : "pending"} />
      </div>
      <div style={{ marginTop: 9, fontSize: 12.5, fontWeight: 900, color: t.ink }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 15, fontWeight: 950, color: ready ? t.ink : t.warn, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textTransform: value.includes("_") ? "capitalize" : undefined }}>{value}</div>
      <div style={{ marginTop: 8, fontSize: 10.5, fontWeight: 850, color: t.brand, display: "inline-flex", alignItems: "center", gap: 4 }}>
        Open editor <Icon name="arrowR" size={10} />
      </div>
    </button>
  );
}

function ConditionRow({ doc, onClick }: { doc: Document; onClick: () => void }) {
  const { t } = useTheme();
  const kind = doc.status === "flagged" ? "flagged" : "pending";
  return (
    <button type="button" onClick={onClick} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto 16px", gap: 10, alignItems: "center", padding: "10px 11px", borderRadius: 12, border: `1px solid ${doc.status === "flagged" ? t.danger : t.line}`, background: doc.status === "flagged" ? t.dangerBg : t.surface2, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 900, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.name}</div>
        <div style={{ marginTop: 3, fontSize: 11, fontWeight: 700, color: t.ink3 }}>
          {doc.category ?? "Document"}
          {doc.requested_on ? ` / requested ${new Date(doc.requested_on).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
        </div>
      </div>
      <VerifiedBadge kind={kind} />
      <Icon name="arrowR" size={12} style={{ color: t.ink3 }} />
    </button>
  );
}

function criteriaTarget(id: string) {
  if (["value", "ltv", "income"].includes(id)) return "criteria-collateral";
  if (id === "close") return "criteria-output";
  return "criteria-pricing";
}

function inlineAction(t: ReturnType<typeof useTheme>["t"]): React.CSSProperties {
  return {
    marginTop: 12,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 11px",
    borderRadius: 9,
    border: `1px solid ${t.lineStrong}`,
    background: t.surface,
    color: t.brand,
    fontSize: 12,
    fontWeight: 850,
    cursor: "pointer",
    fontFamily: "inherit",
  };
}

// ── New components for the slim header ─────────────────────────────

function LoanStageStepper({ currentIndex, totalStages: _t }: { currentIndex: number; totalStages: number }) {
  const { t } = useTheme();
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: `repeat(${FILE_STAGE_KEYS.length}, 1fr)`,
      gap: 0,
      background: t.surface,
      border: `1px solid ${t.line}`,
      borderRadius: 14,
      padding: "14px 18px",
      boxShadow: t.shadow,
    }}>
      {FILE_STAGE_KEYS.map((_stage, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        const dotBg = done ? t.profit : active ? t.brand : t.surface2;
        const dotColor = done || active ? t.inverse : t.ink3;
        const lineColor = done ? t.profit : active ? t.brand : t.line;
        return (
          <div key={FILE_STAGE_KEYS[i]} style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 0, position: "relative" }}>
            {/* Connecting line behind the dot */}
            {i > 0 ? (
              <div style={{
                position: "absolute", top: 16, left: 0, width: "50%",
                height: 3, background: done ? t.profit : i === currentIndex ? t.brand : t.line,
                borderRadius: 2,
              }} />
            ) : null}
            {i < FILE_STAGE_KEYS.length - 1 ? (
              <div style={{
                position: "absolute", top: 16, right: 0, width: "50%",
                height: 3, background: done ? t.profit : t.line,
                borderRadius: 2,
              }} />
            ) : null}
            {/* The dot */}
            <div style={{
              position: "relative", zIndex: 1,
              width: 34, height: 34, borderRadius: 999,
              background: dotBg, color: dotColor,
              border: `2px solid ${lineColor}`,
              display: "grid", placeItems: "center",
              fontSize: 14, fontWeight: 900,
              boxShadow: active ? `0 0 0 4px ${t.brandSoft}` : "none",
            }}>
              {done ? "✓" : i + 1}
            </div>
            <div style={{
              marginTop: 7,
              fontSize: 11,
              fontWeight: 900,
              color: active ? t.brand : done ? t.ink : t.ink3,
              letterSpacing: 0.4,
              textAlign: "center",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "100%",
            }}>
              {FILE_STAGE_LABELS[i]}
            </div>
            {active ? (
              <div style={{ marginTop: 2, fontSize: 9.5, fontWeight: 800, color: t.brand, letterSpacing: 0.6, textTransform: "uppercase" }}>
                Current
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function FileCompletionStrip({
  score, label, openDocs, warnings, missingCriteria, flaggedDocs, totalBlockers, onClick,
}: {
  score: number; label: string; openDocs: number; warnings: number;
  missingCriteria: number; flaggedDocs: number; totalBlockers: number;
  onClick: () => void;
}) {
  const { t } = useTheme();
  const tone = totalBlockers === 0 ? t.profit : totalBlockers > 5 ? t.danger : t.warn;
  const toneBg = totalBlockers === 0 ? t.profitBg : totalBlockers > 5 ? t.dangerBg : t.warnBg;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        all: "unset",
        cursor: "pointer",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        gap: 14,
        alignItems: "center",
        padding: "12px 16px",
        borderRadius: 14,
        background: t.surface,
        border: `1px solid ${t.line}`,
        boxShadow: t.shadow,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 22, fontWeight: 950, color: t.ink, fontFeatureSettings: '"tnum"' }}>
            {Math.round(score)}%
          </span>
          <span style={{ fontSize: 13, fontWeight: 800, color: t.ink2 }}>{label}</span>
          <span style={{ fontSize: 11, color: t.ink3 }}>· click to see what's left</span>
        </div>
        <div style={{ marginTop: 8, height: 8, borderRadius: 999, background: t.surface2, overflow: "hidden" }}>
          <div style={{ width: `${Math.max(0, Math.min(100, score))}%`, height: "100%", background: tone, borderRadius: 999 }} />
        </div>
      </div>
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "9px 13px", borderRadius: 11,
        background: toneBg, color: tone,
        fontSize: 13, fontWeight: 900,
      }}>
        {totalBlockers > 0 ? "⚠" : "✓"}
        <span>
          {totalBlockers === 0
            ? "All clear"
            : `${totalBlockers} blocker${totalBlockers === 1 ? "" : "s"} · ${warnings} warn · ${missingCriteria} crit · ${flaggedDocs} flag · ${openDocs} open`}
        </span>
      </div>
    </button>
  );
}

function BlockersPopup({
  onClose, warnings, missingCriteria, flaggedDocs, openDocs, onOpenTab, onCriteriaJump,
}: {
  onClose: () => void;
  warnings: { code: string; message: string }[];
  missingCriteria: { id: string; label: string; group: string; value: string }[];
  flaggedDocs: Document[];
  openDocs: Document[];
  onOpenTab?: (tab: string, targetId?: string) => void;
  onCriteriaJump: (id: string) => void;
}) {
  const { t } = useTheme();
  const total = warnings.length + missingCriteria.length + flaggedDocs.length + (openDocs.length > 0 ? 1 : 0);
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: t.surface, color: t.ink,
          border: `1px solid ${t.line}`, borderRadius: 14,
          boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
          width: "min(640px, 100%)", maxHeight: "85vh", overflow: "hidden",
          display: "flex", flexDirection: "column",
        }}
      >
        <div style={{
          padding: "14px 16px",
          borderBottom: `1px solid ${t.line}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 900, color: t.ink3, letterSpacing: 1.3, textTransform: "uppercase" }}>
              File Blockers
            </div>
            <div style={{ marginTop: 2, fontSize: 16, fontWeight: 900, color: t.ink }}>
              {total === 0 ? "Nothing to fix — this file is clear" : `${total} item${total === 1 ? "" : "s"} need attention`}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "6px 10px", borderRadius: 9,
              background: t.surface2, color: t.ink2,
              border: `1px solid ${t.line}`, cursor: "pointer",
              fontSize: 11.5, fontWeight: 800, fontFamily: "inherit",
            }}
          >
            Close
          </button>
        </div>
        <div style={{ padding: 14, overflow: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          {warnings.map((warning) => (
            <AttentionRow key={`${warning.code}-${warning.message}`} tone="watch" icon="alert" title={warning.message} meta={warning.code.replace(/_/g, " ")} onClick={() => { onClose(); onOpenTab?.("uw"); }} />
          ))}
          {missingCriteria.map((item) => (
            <AttentionRow key={item.id} tone="open" icon="sliders" title={`${item.label} is missing`} meta={item.group} onClick={() => { onClose(); onCriteriaJump(item.id); }} />
          ))}
          {flaggedDocs.map((doc) => (
            <AttentionRow key={doc.id} tone="danger" icon="doc" title={doc.name} meta={doc.category ?? "Flagged document"} onClick={() => { onClose(); onOpenTab?.("docs"); }} />
          ))}
          {openDocs.length > 0 ? (
            <AttentionRow tone="open" icon="docCheck" title={`${openDocs.length} document condition${openDocs.length === 1 ? "" : "s"} still open`} meta="Review Documents or Conditions" onClick={() => { onClose(); onOpenTab?.("workflow"); }} />
          ) : null}
          {total === 0 ? (
            <AttentionRow tone="ready" icon="check" title="No calculation warnings or flagged documents" meta="Ready for internal review" />
          ) : null}
        </div>
      </div>
    </div>
  );
}
