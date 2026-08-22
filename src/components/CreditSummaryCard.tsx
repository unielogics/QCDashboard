"use client";

// Borrower-facing credit summary. Compact card showing FICO, tier, the
// signal bullets, and the products the borrower currently qualifies for.
// Mounted on the simulator page (CLIENT view) and the client detail
// page (operators see the same data + the link to drill into the full
// report).
//
// Restyled onto the plain-CSS design system: the Card+SectionLabel shell is
// one `.panel`, the score and the tier ceiling are `.kpi` tiles (the FICO
// figure and the max-LTV percentage are exactly what a KPI tile is for), the
// tier badge and the fraud flag are the chip/callout vocabulary, and the
// program tiles ride `.grid.cols-auto` instead of a hand-rolled auto-fit
// track. The one colour still written inline is the bullet dot, which is
// chosen from the bullet's kind — see the comment at that site.

import { Icon } from "@/components/design-system/Icon";
import { Callout, CellChip, Empty, Kpi, KpiRow, Loading, Note, Panel, Sub, type ChipTone } from "@/components/ds";
import type { CreditSummary } from "@/lib/types";

const TIER_LABEL: Record<string, { label: string; tone: ChipTone }> = {
  pro: { label: "Pro", tone: "ok" },
  basic: { label: "Standard", tone: "acc" },
  warn: { label: "Caution", tone: "warn" },
  blocked: { label: "Blocked", tone: "bad" },
};

export function CreditSummaryCard({
  summary,
  loading,
}: {
  summary: CreditSummary | undefined;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <Panel title="Credit summary">
        <Loading>Loading…</Loading>
      </Panel>
    );
  }
  if (!summary || summary.fico == null) {
    return (
      <Panel title="Credit summary">
        <Empty>No credit pull on file.</Empty>
      </Panel>
    );
  }

  const tier = summary.tier ?? "blocked";
  const tierInfo = TIER_LABEL[tier] ?? { label: tier, tone: "mut" as ChipTone };
  const maxLtv =
    summary.tier_max_ltv != null ? `${Math.round(summary.tier_max_ltv * 100)}%` : "—";
  const modelLabel = summary.fico_model
    ? `${summary.fico_model.toUpperCase().replace("_", " ")} score`
    : "FICO score";

  return (
    <Panel
      title="Credit summary"
      actions={<CellChip tone={tierInfo.tone}>{tierInfo.label}</CellChip>}
    >
      <KpiRow>
        <Kpi label={modelLabel} value={summary.fico} />
        <Kpi label="Max LTV" value={maxLtv} sub="Available at this tier" />
      </KpiRow>

      {summary.fraud_flag ? (
        <Callout
          tone="bad"
          className="mt"
          icon={<Icon name="alert" size={16} stroke={2.4} />}
        >
          <strong>Fraud flag</strong> — {summary.fraud_flag}
        </Callout>
      ) : null}

      {summary.bullets.length > 0 && (
        <div className="grid g8 mt">
          {summary.bullets.map((b, i) => (
            <div className="itemrow" key={i}>
              {/* Data-derived: the dot's tint is picked from the bullet's kind,
                  so it stays inline. `.repdot` owns the geometry only. */}
              <span
                className="repdot"
                style={{
                  background:
                    b.kind === "positive"
                      ? "var(--ok)"
                      : b.kind === "warn"
                        ? "var(--warn)"
                        : "var(--muted)",
                }}
              />
              <div className="grow">
                <b>{b.label}</b>
                {b.detail ? <div className="sub">{b.detail}</div> : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {summary.available_products.length > 0 && (
        <div className="mt">
          <div className="lbl">Available programs</div>
          <div className="grid cols-auto g8 mt">
            {summary.available_products.map((p) => (
              <div className="card" key={p.id}>
                <b>{p.label}</b>
                <div className="row sub">
                  {p.rate != null ? <span>{p.rate}%</span> : null}
                  {p.max_ltv != null ? <span>· max {Math.round(p.max_ltv * 100)}%</span> : null}
                  {p.term ? <span>· {p.term}</span> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {summary.blocked_products.length > 0 && (
        <details className="mt">
          <summary className="linky">
            Why {summary.blocked_products.length} program
            {summary.blocked_products.length === 1 ? "" : "s"}{" "}
            {summary.blocked_products.length === 1 ? "isn't" : "aren't"} available
          </summary>
          <div className="grid g6 mt">
            {summary.blocked_products.map((p) => (
              <div className="sub" key={p.id}>
                <strong>{p.label}</strong> — {p.reason}
              </div>
            ))}
          </div>
        </details>
      )}

      {summary.note ? <Note>{summary.note}</Note> : null}
    </Panel>
  );
}
