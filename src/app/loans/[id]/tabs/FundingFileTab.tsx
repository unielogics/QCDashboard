"use client";

// Funding file tab — the loan cockpit's default workspace.
//
// Styling only: migrated off the inline token objects onto the plain-CSS design
// system in globals.css / app-extras.css. Every control, endpoint, panel, empty
// state and callback is the one that was here before — the five workspace
// panels, the two "open the full workbench" jumps, the per-criterion and
// per-condition drill-throughs, and the recalc effect with its exact payload
// and dependency list.
//
// The components below the exported tab (OperationalHeader, CompletionGauge,
// MiniTile, PathTile, Track, LoanStageStepper, FileCompletionStrip,
// BlockersPopup and friends) are no longer rendered by this tab — the loan
// header in page.tsx owns that furniture now — but they are KEPT and migrated
// rather than deleted, because deleting a funding control is how a deal stops
// being fundable.
//
// One bespoke layout stays inline: the fixed-width workspace rail beside the
// panel body. A 224px nav column is a design decision, not 3/12 of the cockpit
// grid — `.cg` would give it ~430px on the wide cockpit content width.

import { useEffect, useMemo, useState } from "react";
import { VerifiedBadge } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { QC_FMT } from "@/components/design-system/tokens";
import {
  Btn,
  CG,
  Card,
  CellChip,
  Kpi,
  KpiRow,
  Panel,
  StatusLine,
  Tag,
  cx,
  type ChipTone,
} from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { useLoanPrequalRequests, useRecalc } from "@/hooks/useApi";
import type { Activity, Document, Loan } from "@/lib/types";
import { getCriteriaItems, getFileCompletion, FILE_STAGE_KEYS, FILE_STAGE_LABELS } from "../fileReadiness";
// PropertyTab is now embedded inside FundingFileTab instead of living
// on its own tab — property details belong with the rest of the deal
// foundation (address, beds/baths, taxes/insurance, ARV/LTV).
import { PropertyTab } from "./PropertyTab";

/** Status vocabulary used across this file, mapped once onto the chip tones. */
type Tone = "ready" | "watch" | "danger" | "open" | "neutral";

const TONE_CHIP: Record<Tone, ChipTone> = {
  ready: "ok",
  watch: "warn",
  danger: "bad",
  open: "acc",
  neutral: "mut",
};

/** Ink colour for a figure that carries its own status. */
function toneInk(tone: Tone): string | undefined {
  if (tone === "ready") return "var(--ok)";
  if (tone === "watch") return "var(--warn)";
  if (tone === "danger") return "var(--danger)";
  if (tone === "open") return "var(--muted)";
  return undefined;
}

/** Completion bar colour — the same three thresholds the file used before. */
function scoreInk(score: number): string {
  return score >= 85 ? "var(--ok)" : score >= 65 ? "var(--warn)" : "var(--accent)";
}

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

  return (
    <>
      {/* Stage stepper + clickable file-completion strip + blockers
          popup all live in the loan header (page.tsx) now — this tab
          starts directly with the Workspace panel selector + the
          chosen panel's content. */}

      {/* Bespoke on purpose: a fixed 224px rail beside a fluid body. */}
      <div style={{ display: "grid", gridTemplateColumns: "224px minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
        <Panel title="Open only what you need" sub="Workspace">
          <div>
            <PanelNavButton active={activePanel === "math"} icon="calc" title="Math + sizing" detail="Live recalc and UW ratios" onClick={() => setActivePanel("math")} />
            <PanelNavButton active={activePanel === "criteria"} icon="sliders" title="Criteria fields" detail={`${completion.criteria.ready}/${completion.criteria.total} ready`} onClick={() => setActivePanel("criteria")} />
            <PanelNavButton active={activePanel === "documents"} icon="docCheck" title="Docs + conditions" detail={`${openDocs.length} open`} onClick={() => setActivePanel("documents")} />
            <PanelNavButton active={activePanel === "property"} icon="building2" title="Property file" detail="Collateral details" onClick={() => setActivePanel("property")} />
            <PanelNavButton active={activePanel === "activity"} icon="audit" title="Activity" detail={`${activity.length} events`} onClick={() => setActivePanel("activity")} />
          </div>
        </Panel>

        {activePanel === "math" ? (
          <Panel
            title="Sizing and underwriting snapshot"
            sub="Calculation engine"
            actions={<Tag>{recalc.isPending ? "Calculating" : "Live recalc"}</Tag>}
          >
            <KpiRow>
              <CalcMetric label="Sized amount" value={QC_FMT.usd(sizedAmount, 0)} emphasis />
              <CalcMetric label="Final rate" value={finalRate != null ? `${(finalRate * 100).toFixed(3)}%` : "Missing"} />
              <CalcMetric label="DSCR" value={dscr != null ? dscr.toFixed(2) : "N/A"} tone={dscr != null && dscr >= 1.25 ? "ready" : dscr ? "watch" : "open"} />
              <CalcMetric label="LTV" value={ltv != null ? `${(ltv * 100).toFixed(1)}%` : "N/A"} tone={ltv != null && ltv <= 0.75 ? "ready" : ltv ? "watch" : "open"} />
              <CalcMetric label="Binding cap" value={cap ? QC_FMT.usd(cap, 0) : "No cap"} sub={binding ? binding.replace(/_/g, " ") : undefined} />
            </KpiRow>
            <KpiRow className="mt">
              <CalcMetric label="Term" value={loan.term_months ? `${loan.term_months} mo` : "Missing"} tone={loan.term_months ? "neutral" : "open"} />
              <CalcMetric label="Monthly rent" value={loan.monthly_rent ? QC_FMT.usd(Number(loan.monthly_rent), 0) : loan.type === "dscr" ? "Missing" : "N/A"} tone={loan.type === "dscr" && !loan.monthly_rent ? "open" : "neutral"} />
              <CalcMetric label="ARV / value" value={loan.arv ? QC_FMT.usd(Number(loan.arv), 0) : "Missing"} tone={loan.arv ? "neutral" : "open"} />
              <CalcMetric label="Taxes + ins." value={QC_FMT.usd(Number(loan.annual_taxes || 0) + Number(loan.annual_insurance || 0), 0)} />
            </KpiRow>
            <CG className="mt">
              <RatioBar className="s4" label="DSCR target" value={dscr ?? 0} target={1.25} formatter={(v) => v.toFixed(2)} />
              <RatioBar className="s4" label="LTV ceiling" value={ltv ?? 0} target={0.75} formatter={(v) => `${(v * 100).toFixed(1)}%`} reverse />
              <RatioBar className="s4" label="Completion" value={completion.score} target={100} formatter={(v) => `${Math.round(v)}%`} />
            </CG>
            <Btn className="mt" onClick={() => onOpenTab?.("terms", "criteria-output")}>
              <Icon name="arrowR" size={13} /> Open full criteria workbench
            </Btn>
          </Panel>
        ) : null}

        {activePanel === "criteria" ? (
          <Panel
            title="Fields required before underwriting"
            sub="Criteria matrix"
            actions={<Tag>{`${completion.criteria.score}% complete`}</Tag>}
          >
            <CG>
              {criteria.map((item) => (
                <CriterionTile key={item.id} className="s3" label={item.label} value={item.value} ready={item.ready} group={item.group} onClick={() => onOpenTab?.("terms", criteriaTarget(item.id))} />
              ))}
            </CG>
          </Panel>
        ) : null}

        {activePanel === "documents" ? (
          <Panel title="Document queue" sub="Open conditions" actions={<Tag>{`${openDocs.length} open`}</Tag>}>
            {openDocs.length === 0 ? (
              <StatusLine tone="ok">
                <Icon name="check" size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />
                All document conditions are verified.
              </StatusLine>
            ) : (
              <CG>
                {openDocs.slice(0, 10).map((doc) => (
                  <ConditionRow key={doc.id} className="s6" doc={doc} onClick={() => onOpenTab?.("docs")} />
                ))}
              </CG>
            )}
            <Btn className="mt" onClick={() => onOpenTab?.("workflow")}>
              <Icon name="cal" size={13} /> Manage due dates and collection rules
            </Btn>
          </Panel>
        ) : null}

        {activePanel === "property" ? (
          <div style={{ minWidth: 0 }}>
            <PropertyTab loan={loan} canEdit={canEdit} />
          </div>
        ) : null}

        {activePanel === "activity" ? (
          <Panel title="Latest movement" sub="Recent file activity">
            <CG>
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
                <div key={item.id} className="card s4">
                  <div className="row lbl">
                    <Icon name="audit" size={13} />
                    {item.occurred_at ? new Date(item.occurred_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Activity"}
                  </div>
                  <div className="mt">{item.summary}</div>
                </div>
              ))}
            </CG>
          </Panel>
        ) : null}
      </div>
    </>
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
  return (
    <Card hi>
      <CG>
        <div className="s3">
          <div className="lbl">File command</div>
          <div className="big">{label}</div>
          <div className="track mt">
            <div className="fill" style={{ width: `${score}%`, background: scoreInk(score) }} />
          </div>
          <div className="mt">
            <CellChip tone={score >= 85 ? "ok" : score >= 65 ? "warn" : "acc"}>{score}% complete</CellChip>
          </div>
        </div>

        <div className="card s4">
          <div className="row">
            <CellChip tone={TONE_CHIP[nextAction.tone]}>
              <Icon name={nextAction.tone === "ready" ? "check" : nextAction.tone === "danger" ? "alert" : "arrowR"} size={14} />
            </CellChip>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="lbl">Next action</div>
              <b>{nextAction.title}</b>
              <div className="sub">{nextAction.detail}</div>
            </div>
          </div>
        </div>

        <KpiRow className="s5">
          <HeaderKpi label="Sized" value={QC_FMT.usd(amount, 0)} />
          <HeaderKpi label="Rate" value={finalRate != null ? `${(finalRate * 100).toFixed(3)}%` : "Missing"} tone={finalRate != null ? "neutral" : "watch"} />
          <HeaderKpi label="DSCR" value={dscr != null ? dscr.toFixed(2) : "N/A"} tone={dscr != null && dscr >= 1.25 ? "ready" : dscr ? "watch" : "neutral"} />
          <HeaderKpi label="Blockers" value={openDocs + warnings} tone={openDocs + warnings ? "watch" : "ready"} />
        </KpiRow>
      </CG>
    </Card>
  );
}

function HeaderKpi({ label, value, tone = "neutral" }: { label: string; value: string | number; tone?: "ready" | "watch" | "neutral" }) {
  return <Kpi label={label} value={<span style={{ color: toneInk(tone) }}>{value}</span>} />;
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
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx("pick", active && "on")}
      style={{ width: "100%", textAlign: "left", font: "inherit" }}
    >
      <Icon name={icon} size={16} />
      <span style={{ minWidth: 0, flex: 1, display: "grid" }}>
        <b>{title}</b>
        <span className="sub">{detail}</span>
      </span>
    </button>
  );
}

function CompletionGauge({ score, label }: { score: number; label: string }) {
  const color = scoreInk(score);
  return (
    <div
      className="gauge"
      title={label}
      style={{ borderRadius: 999, background: `conic-gradient(${color} ${score * 3.6}deg, var(--line) 0deg)` }}
    >
      <div className="val" style={{ margin: 18, borderRadius: 999, background: "var(--surface)", border: "1px solid var(--line)" }}>
        <b style={{ color }}>{score}%</b>
        <span>Complete</span>
      </div>
    </div>
  );
}

function MiniTile({ label, value, tone = "neutral" }: { label: string; value: string | number; tone?: "ready" | "watch" | "neutral" }) {
  return <Kpi label={label} value={<span style={{ color: toneInk(tone) }}>{value}</span>} />;
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
  const color = toneInk(step.status) ?? "var(--muted)";
  return (
    <button type="button" onClick={onClick} className="card" style={{ width: "100%", textAlign: "left", font: "inherit", cursor: "pointer" }}>
      <div className="kv">
        <CellChip tone={TONE_CHIP[step.status]}>
          <Icon name={step.icon} size={15} />
        </CellChip>
        <b className="num" style={{ color }}>{Math.round(step.score)}%</b>
      </div>
      <div className="mt">{step.label}</div>
      <div className="sub">{step.detail}</div>
      <div className="track mt">
        <div className="fill" style={{ width: `${Math.min(100, Math.max(0, step.score))}%`, background: color }} />
      </div>
    </button>
  );
}

function Track({ label, value, detail }: { label: string; value: number; detail: string }) {
  const color = value >= 85 ? "var(--ok)" : value >= 60 ? "var(--warn)" : "var(--accent)";
  return (
    <div className="card">
      <div className="kv">
        <b>{label}</b>
        <b className="num" style={{ color }}>{value}%</b>
      </div>
      <div className="track mt">
        <div className="fill" style={{ width: `${value}%`, background: color }} />
      </div>
      <div className="sub">{detail}</div>
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
  return (
    <button
      type="button"
      onClick={onClick}
      className="rung"
      style={{ width: "100%", textAlign: "left", font: "inherit", cursor: onClick ? "pointer" : "default" }}
    >
      <CellChip tone={TONE_CHIP[tone]}>
        <Icon name={icon} size={14} />
      </CellChip>
      <span style={{ minWidth: 0, flex: 1, display: "grid" }}>
        <b>{title}</b>
        <span className="sub">{meta}</span>
      </span>
      {onClick ? <Icon name="arrowR" size={12} className="sub" /> : <span />}
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
  const color = emphasis ? "var(--accent)" : toneInk(tone);
  return (
    <Kpi
      label={label}
      value={<span style={{ color }}>{value}</span>}
      sub={sub ? <span style={{ textTransform: "capitalize" }}>{sub}</span> : undefined}
    />
  );
}

function RatioBar({
  label,
  value,
  target,
  formatter,
  reverse,
  className,
}: {
  label: string;
  value: number;
  target: number;
  formatter: (value: number) => string;
  reverse?: boolean;
  className?: string;
}) {
  const ratio = target > 0 ? value / target : 0;
  const healthy = reverse ? value > 0 && value <= target : value >= target;
  const color = healthy ? "var(--ok)" : value > 0 ? "var(--warn)" : "var(--faint)";
  const width = Math.max(4, Math.min(100, ratio * 100));
  return (
    <div className={cx("card", className)}>
      <div className="kv">
        <b>{label}</b>
        <b className="num" style={{ color }}>{formatter(value)}</b>
      </div>
      <div className="track mt">
        <div className="fill" style={{ width: `${width}%`, background: color }} />
      </div>
      <div className="sub">Target {formatter(target)}</div>
    </div>
  );
}

function CriterionTile({
  label,
  value,
  ready,
  group,
  onClick,
  className,
}: {
  label: string;
  value: string;
  ready: boolean;
  group: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx("card", className)}
      style={{ width: "100%", textAlign: "left", font: "inherit", cursor: "pointer" }}
    >
      <div className="kv">
        <span className="lbl">{group}</span>
        <VerifiedBadge kind={ready ? "verified" : "pending"} />
      </div>
      <b className="mt" style={{ display: "block" }}>{label}</b>
      <div className="num" style={{ color: ready ? undefined : "var(--warn)", textTransform: value.includes("_") ? "capitalize" : undefined }}>{value}</div>
      <div className="mt">
        <span className="linky">
          Open editor <Icon name="arrowR" size={10} />
        </span>
      </div>
    </button>
  );
}

function ConditionRow({ doc, onClick, className }: { doc: Document; onClick: () => void; className?: string }) {
  const kind = doc.status === "flagged" ? "flagged" : "pending";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx("rung", className)}
      style={{ width: "100%", textAlign: "left", font: "inherit", cursor: "pointer" }}
    >
      <span style={{ minWidth: 0, flex: 1, display: "grid" }}>
        <b>{doc.name}</b>
        <span className="sub">
          {doc.category ?? "Document"}
          {doc.requested_on ? ` / requested ${new Date(doc.requested_on).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
        </span>
      </span>
      <VerifiedBadge kind={kind} />
      <Icon name="arrowR" size={12} className="sub" />
    </button>
  );
}

function criteriaTarget(id: string) {
  if (["value", "ltv", "income"].includes(id)) return "criteria-collateral";
  if (id === "close") return "criteria-output";
  return "criteria-pricing";
}

// ── New components for the slim header ─────────────────────────────

function LoanStageStepper({ currentIndex, totalStages: _t }: { currentIndex: number; totalStages: number }) {
  return (
    <div className="card" style={{ display: "grid", gridTemplateColumns: `repeat(${FILE_STAGE_KEYS.length}, 1fr)`, gap: 0 }}>
      {FILE_STAGE_KEYS.map((_stage, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        const dotBg = done ? "var(--ok)" : active ? "var(--accent)" : "var(--sunken)";
        const dotColor = done || active ? "#fff" : "var(--muted)";
        const lineColor = done ? "var(--ok)" : active ? "var(--accent)" : "var(--line)";
        return (
          <div key={FILE_STAGE_KEYS[i]} style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 0, position: "relative" }}>
            {/* Connecting line behind the dot */}
            {i > 0 ? (
              <div style={{
                position: "absolute", top: 16, left: 0, width: "50%",
                height: 3, background: done ? "var(--ok)" : i === currentIndex ? "var(--accent)" : "var(--line)",
                borderRadius: 2,
              }} />
            ) : null}
            {i < FILE_STAGE_KEYS.length - 1 ? (
              <div style={{
                position: "absolute", top: 16, right: 0, width: "50%",
                height: 3, background: done ? "var(--ok)" : "var(--line)",
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
              boxShadow: active ? "0 0 0 4px var(--accent-100)" : "none",
            }}>
              {done ? "✓" : i + 1}
            </div>
            <div
              className="lbl"
              style={{
                marginTop: 7,
                color: active ? "var(--accent)" : done ? "var(--ink)" : undefined,
                textAlign: "center",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: "100%",
              }}
            >
              {FILE_STAGE_LABELS[i]}
            </div>
            {active ? (
              <div className="lbl" style={{ color: "var(--accent)" }}>Current</div>
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
  const tone: ChipTone = totalBlockers === 0 ? "ok" : totalBlockers > 5 ? "bad" : "warn";
  const barInk = totalBlockers === 0 ? "var(--ok)" : totalBlockers > 5 ? "var(--danger)" : "var(--warn)";
  return (
    <button
      type="button"
      onClick={onClick}
      className="card"
      style={{ width: "100%", textAlign: "left", font: "inherit", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="row">
          <span className="big num">{Math.round(score)}%</span>
          <b>{label}</b>
          <span className="sub">· click to see what&apos;s left</span>
        </div>
        <div className="track mt">
          <div className="fill" style={{ width: `${Math.max(0, Math.min(100, score))}%`, background: barInk }} />
        </div>
      </div>
      <CellChip tone={tone}>
        {totalBlockers > 0 ? "⚠" : "✓"}
        <span>
          {totalBlockers === 0
            ? "All clear"
            : `${totalBlockers} blocker${totalBlockers === 1 ? "" : "s"} · ${warnings} warn · ${missingCriteria} crit · ${flaggedDocs} flag · ${openDocs} open`}
        </span>
      </CellChip>
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
  const total = warnings.length + missingCriteria.length + flaggedDocs.length + (openDocs.length > 0 ? 1 : 0);
  // ds/Drawer, not a hand-rolled overlay: it keeps the backdrop-click close and
  // the role=dialog/aria-modal this had, and adds Escape, body-scroll lock and
  // focus restore, which the original did not carry.
  return (
    <Drawer
      open
      onClose={onClose}
      width="md"
      title={total === 0 ? "Nothing to fix — this file is clear" : `${total} item${total === 1 ? "" : "s"} need attention`}
      sub="File Blockers"
    >
      <div className="ladder">
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
    </Drawer>
  );
}
