"use client";

import Link from "next/link";
import {
  derivePipelineEconomics,
  formatUnifiedAmount,
  type PipelineEconomicsRollup,
  type UnifiedFileRow,
} from "@/lib/unifiedOperator";

const STAGES = [
  { key: "requested", label: "Requested", sub: "Submitted and collecting documents" },
  { key: "underwriting", label: "In underwriting", sub: "Under review or terms prepared" },
  { key: "approved", label: "Approved", sub: "Approved and preparing to close" },
  { key: "funded", label: "Funded", sub: "Closed and funded files" },
] as const;

export type PipelineEconomicsStripProps = {
  economics?: PipelineEconomicsRollup | null;
  rows?: UnifiedFileRow[];
  loading?: boolean;
  title?: string;
  className?: string;
};

export function PipelineEconomicsStrip({
  economics,
  rows = [],
  loading = false,
  title = "Pipeline value and forecast earnings",
  className,
}: PipelineEconomicsStripProps) {
  const values = economics ?? derivePipelineEconomics(rows);
  return (
    <section className={["pipeline-economics", className].filter(Boolean).join(" ")} aria-label={title}>
      <div className="pipeline-economics-head">
        <div>
          <span className="lbl">Internal forecast</span>
          <h2>{title}</h2>
        </div>
        <span className="sub">Earnings use the QC revenue points saved on each file.</span>
      </div>
      <div className="pipeline-economics-grid">
        {STAGES.map((definition) => {
          const stage = values[definition.key];
          return (
            <Link
              className={`pipeline-economics-card is-${definition.key}`}
              href="/pipeline"
              key={definition.key}
              aria-label={`${definition.label}: ${stage.count} files, ${formatUnifiedAmount(stage.value)} value, ${formatUnifiedAmount(stage.forecast_earnings)} forecast earnings`}
            >
              <span className="row split">
                <span className="pipeline-economics-label">{definition.label}</span>
                <span className="tag num">{loading ? "…" : stage.count}</span>
              </span>
              <strong className="pipeline-economics-value num">{loading ? "—" : formatUnifiedAmount(stage.value)}</strong>
              <span className="sub">{definition.sub}</span>
              <span className="pipeline-economics-earnings">
                <span><small>Forecast earnings</small><b className="num">{loading ? "—" : formatUnifiedAmount(stage.forecast_earnings)}</b></span>
                <span title={`${stage.forecasted_count} of ${stage.count} files have revenue points`}><small>Coverage</small><b className="num">{loading ? "—" : `${stage.forecast_coverage_pct}%`}</b></span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

