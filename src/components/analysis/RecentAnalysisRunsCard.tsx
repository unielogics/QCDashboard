"use client";

import Link from "next/link";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
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
  const { t } = useTheme();
  const { data: clients = [] } = useClients("mine");
  const rows = runs.slice(0, 6);

  return (
    <Card pad={14}>
      <SectionLabel>{title}</SectionLabel>
      {rows.length === 0 ? (
        <div style={{ fontSize: 12.5, color: t.ink3, lineHeight: 1.5 }}>{emptyText}</div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {rows.map((run) => {
            const amount = amountFor(run);
            const clientName = run.client_id
              ? clients.find((client) => client.id === run.client_id)?.name ?? "Linked client"
              : "Unlinked";
            const href = hrefFor(run);
            const body = (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {run.title || run.target_property_address || "Saved analysis"}
                    </div>
                    <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {clientName} - {PRODUCT_LABEL[run.product] ?? run.product}
                      {amount ? ` - ${QC_FMT.usd(amount, 0)}` : ""}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: t.ink3, whiteSpace: "nowrap" }}>{dateLabel(run.updated_at)}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
                  <Pill bg={t.chip} color={t.ink2}>{SOURCE_LABEL[run.tool_source] ?? run.tool_source}</Pill>
                  {run.shared_at ? <Pill bg={t.profitBg} color={t.profit}>Shared</Pill> : null}
                  {run.prequal_request_id ? <Pill bg={t.petrolSoft} color={t.petrol}>Prequal</Pill> : null}
                  {run.status ? <Pill bg={t.chip} color={t.ink3}>{run.status.replace(/_/g, " ")}</Pill> : null}
                </div>
              </>
            );
            const style = {
              display: "block",
              padding: "10px 11px",
              borderRadius: 12,
              border: `1px solid ${t.line}`,
              background: t.surface2,
              textDecoration: "none",
              color: t.ink,
            };
            return href ? (
              <Link key={run.id} href={href} style={style}>
                {body}
              </Link>
            ) : (
              <div key={run.id} style={style}>
                {body}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
