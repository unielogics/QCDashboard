"use client";

import Link from "next/link";
import { CellChip, Panel, Row, Sub } from "@/components/ds";
import { QC_FMT } from "@/components/design-system/tokens";
import { useClients } from "@/hooks/useApi";
import type { AnalysisRun } from "@/lib/types";

const PRODUCT_LABEL: Record<AnalysisRun["product"], string> = {
  dscr_purchase: "DSCR purchase",
  dscr_refi: "DSCR refi",
  fix_flip: "Fix & Flip",
};

const SOURCE_LABEL: Record<AnalysisRun["tool_source"], string> = {
  deal_analyzer: "Analyzer",
  simulator: "Simulator",
  loan_recalc: "File recalc",
};

function dateLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function readNumber(payload: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!payload) return null;
  for (const key of keys) {
    const value = payload[key];
    const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function amountFor(run: AnalysisRun) {
  return (
    readNumber(run.inputs, ["requested_loan_amount", "loan_amount", "amount", "purchase_price", "property_value"]) ??
    readNumber(run.calculator_output, ["loan_amount", "loanAmount", "maxLoan", "requested_loan_amount"])
  );
}

function hrefFor(run: AnalysisRun) {
  if (run.loan_id) return `/loans/${run.loan_id}`;
  if (run.client_id) return `/clients/${run.client_id}/workspace`;
  return null;
}

export function RecentAnalysisRunsCard({
  runs,
  title = "Saved runs - last 30 days",
  emptyText = "No saved runs in the last 30 days.",
}: {
  runs: AnalysisRun[];
  title?: string;
  emptyText?: string;
}) {
  const { data: clients = [] } = useClients("mine");
  const rows = runs.slice(0, 6);

  return (
    <Panel title={title} bodyClass="grid g8">
      {rows.length === 0 ? (
        <Sub>{emptyText}</Sub>
      ) : (
        rows.map((run) => {
          const amount = amountFor(run);
          const clientName = run.client_id
            ? clients.find((client) => client.id === run.client_id)?.name ?? "Linked client"
            : "Unlinked";
          const href = hrefFor(run);
          const body = (
            <div className="grow grid g6">
              <div className="row">
                <b className="grow trunc">{run.title || run.target_property_address || "Saved analysis"}</b>
                <span className="sub trunc">{dateLabel(run.updated_at)}</span>
              </div>
              <div className="sub trunc">
                {clientName} - {PRODUCT_LABEL[run.product] ?? run.product}
                {amount ? ` - ${QC_FMT.usd(amount, 0)}` : ""}
              </div>
              <Row>
                <CellChip tone="mut">{SOURCE_LABEL[run.tool_source] ?? run.tool_source}</CellChip>
                {run.shared_at ? <CellChip tone="ok">Shared</CellChip> : null}
                {run.prequal_request_id ? <CellChip tone="pet">Prequal</CellChip> : null}
                {run.status ? <CellChip tone="mut">{run.status.replace(/_/g, " ")}</CellChip> : null}
              </Row>
            </div>
          );
          // `.pick` claims to be clickable and `.itemrow` does not — a run with
          // no loan and no client has nowhere to go, and rendering it as a
          // pointer-cursor row that swallows the click is the version of this
          // list that made people think it was broken.
          return href ? (
            <Link key={run.id} href={href} className="pick">
              {body}
            </Link>
          ) : (
            <div key={run.id} className="itemrow">
              {body}
            </div>
          );
        })
      )}
    </Panel>
  );
}
