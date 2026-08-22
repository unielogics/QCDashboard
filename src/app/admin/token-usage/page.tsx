"use client";

// /admin/token-usage — canonical Elara AI usage and controls surface.
//
// Styling: migrated off inline token objects onto the plain-CSS design system
// in globals.css / app-extras.css. Every control, endpoint, permission gate and
// empty state from the inline version is preserved verbatim; only the surface
// vocabulary changed (Card+SectionLabel → Panel, hand-rolled pills → CellChip,
// hand-rolled tables → Table/Tr/Td, hand-rolled segmented buttons → Seg).
//
// The only inline styles left are genuinely dynamic: the daily-spend chart
// geometry, computed bar widths, the disabled-control opacity, and the
// data-derived trend colour.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Card,
  CellChip,
  CG,
  Input,
  Kpi,
  KpiRow,
  PageHeader,
  Panel,
  Seg,
  StatusLine,
  Table,
  Td,
  Tr,
  cx,
  type ChipTone,
} from "@/components/ds";
import {
  useAdminAIUsageToday,
  useCurrentUser,
  useSettings,
  useTokenUsageBreakdown,
  useTokenUsageSummary,
  useTokenUsageTimeseries,
  useTokenUsageAttribution,
  useUpdateSettings,
  type AIUsageBucket,
  type TokenUsageAttributionRow,
  type TokenUsageDimension,
  type TokenUsageEventRow,
} from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";

const DIMENSIONS: { key: TokenUsageDimension; label: string }[] = [
  { key: "activity", label: "By activity" },
  { key: "file", label: "By file" },
  { key: "agent", label: "By AI agent" },
  { key: "broker", label: "By broker" },
  { key: "model", label: "By model" },
];

const RANGES: { key: string; label: string; days: number }[] = [
  { key: "7", label: "7 days", days: 7 },
  { key: "30", label: "30 days", days: 30 },
  { key: "90", label: "90 days", days: 90 },
];

const DEFAULT_AI_SPEND = {
  daily_warning_usd: 10,
  daily_critical_usd: 25,
  avg_client_file_warning_usd: 1.5,
  avg_client_file_critical_usd: 3,
  master_enabled: true,
  chat_enabled: true,
  automations_enabled: true,
  document_scanning_enabled: true,
  summaries_enabled: true,
  lender_ai_enabled: true,
};

function fmtInt(n: number): string {
  return n.toLocaleString("en-US");
}
function fmtUsd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function TokenUsagePage() {
  const router = useRouter();
  const { data: me, isLoading: meLoading } = useCurrentUser();

  const [rangeDays, setRangeDays] = useState(30);
  const [dimension, setDimension] = useState<TokenUsageDimension>("activity");
  const from = useMemo(() => isoDaysAgo(rangeDays), [rangeDays]);

  const today = useAdminAIUsageToday();
  const settings = useSettings();
  const updateSettings = useUpdateSettings();
  const summary = useTokenUsageSummary(from);
  const breakdown = useTokenUsageBreakdown(dimension, from);
  const series = useTokenUsageTimeseries(from);
  const attribution = useTokenUsageAttribution(from);

  const sourceRows = attribution.data?.source_rows ?? [];
  const featureRows = attribution.data?.feature_rows ?? [];
  const recentEvents = attribution.data?.recent_events ?? [];
  const documentSpend = useMemo(
    () =>
      featureRows
        .filter((row) => /document|scan|pdf|bucket|dealer/i.test(`${row.key} ${row.label} ${row.top_feature ?? ""}`))
        .reduce((sum, row) => sum + row.cost_usd, 0),
    [featureRows],
  );

  useEffect(() => {
    if (!meLoading && me && me.role !== Role.SUPER_ADMIN && me.role !== Role.LOAN_EXEC) {
      router.replace("/");
    }
  }, [meLoading, me, router]);
  if (meLoading) {
    return (
      <Card>
        <span className="sub">Loading…</span>
      </Card>
    );
  }
  if (me && me.role !== Role.SUPER_ADMIN && me.role !== Role.LOAN_EXEC) return null;

  const s = summary.data;
  const todayData = today.data;
  const spend = settings.data?.data.ai_spend ?? DEFAULT_AI_SPEND;
  const isSuperAdmin = me?.role === Role.SUPER_ADMIN;
  const canToggleMaster = isSuperAdmin && (me?.email || "").toLowerCase() === "franco@qualifiedcommercial.com";
  const canEditControls = isSuperAdmin;
  const masterEnabled = spend.master_enabled !== false;
  // Was an inline colour; now the chip tone vocabulary carries the same signal.
  const alertTone: ChipTone =
    todayData?.alert_level === "critical" ? "bad" : todayData?.alert_level === "warning" ? "warn" : "ok";
  const rows = breakdown.data ?? [];
  const points = series.data ?? [];
  const maxCost = Math.max(1, ...points.map((p) => p.cost_usd));
  const saveSpend = (patch: Partial<typeof spend>) => {
    if (!canEditControls) return;
    updateSettings.mutate({ ai_spend: { ...spend, ...patch } });
  };

  return (
    <div className="grid">
      <PageHeader
        title="Elara AI Usage & Controls"
        lede="Review AI spend across Elara, monitor current Bedrock usage, and control which paid model calls are allowed."
        actions={
          <Seg
            ariaLabel="Reporting window"
            as="filter"
            value={String(rangeDays)}
            onChange={(v) => setRangeDays(RANGES.find((r) => r.key === v)?.days ?? 30)}
            options={RANGES.map((r) => ({ value: r.key, label: r.label }))}
          />
        }
      />

      {today.isLoading || !todayData ? (
        <Card>
          <span className="sub">Loading AI controls...</span>
        </Card>
      ) : (
        <>
          <KpiRow>
            <Kpi label="Today spend" value={fmtUsd(todayData.total_estimated_cost_usd)} />
            <Kpi label="Today calls" value={fmtInt(todayData.total_calls)} />
            <Kpi label="Avg/client today" value={fmtUsd(todayData.avg_cost_per_client_usd)} />
            <Kpi label="Avg/file today" value={fmtUsd(todayData.avg_cost_per_loan_file_usd)} />
          </KpiRow>

          <Panel
            title="Admin AI controls"
            actions={<CellChip tone={alertTone}>{todayData.alert_level}</CellChip>}
          >
            {masterEnabled ? (
              <div className="sub">
                Controls paid Bedrock model calls across chat, automations, summaries, scanning, and lender workflows.
              </div>
            ) : (
              // The whole card used to turn red. The signal now lives in a
              // block-level status line, which says the same thing and does not
              // need the card to own a data-derived background.
              <StatusLine tone="bad">
                AI is disabled system-wide. Deterministic app workflows continue, but model calls are blocked.
              </StatusLine>
            )}
            {!canEditControls ? (
              <div className="sub mt">Read-only for loan executives.</div>
            ) : !canToggleMaster ? (
              <div className="sub mt">Only franco@qualifiedcommercial.com can change the master switch.</div>
            ) : null}

            <div className="grid cols-auto mt">
              <Toggle
                label={`AI System ${masterEnabled ? "Enabled" : "Disabled"}`}
                value={masterEnabled}
                disabled={!canToggleMaster || updateSettings.isPending}
                onChange={(v) => saveSpend({ master_enabled: v })}
              />
              <Toggle label="Chat" value={spend.chat_enabled} disabled={!canEditControls || !masterEnabled} onChange={(v) => saveSpend({ chat_enabled: v })} />
              <Toggle label="Automations" value={spend.automations_enabled} disabled={!canEditControls || !masterEnabled} onChange={(v) => saveSpend({ automations_enabled: v })} />
              <Toggle label="Document scanning" value={spend.document_scanning_enabled} disabled={!canEditControls || !masterEnabled} onChange={(v) => saveSpend({ document_scanning_enabled: v })} />
              <Toggle label="Summaries" value={spend.summaries_enabled} disabled={!canEditControls || !masterEnabled} onChange={(v) => saveSpend({ summaries_enabled: v })} />
              <Toggle label="Lender/Funding AI" value={spend.lender_ai_enabled} disabled={!canEditControls || !masterEnabled} onChange={(v) => saveSpend({ lender_ai_enabled: v })} />
            </div>

            <div className="fldgrid four mt">
              <NumberControl label="Daily warning" value={spend.daily_warning_usd} disabled={!canEditControls} onChange={(v) => saveSpend({ daily_warning_usd: v })} />
              <NumberControl label="Daily critical" value={spend.daily_critical_usd} disabled={!canEditControls} onChange={(v) => saveSpend({ daily_critical_usd: v })} />
              <NumberControl label="Avg/file warning" value={spend.avg_client_file_warning_usd} disabled={!canEditControls} onChange={(v) => saveSpend({ avg_client_file_warning_usd: v })} />
              <NumberControl label="Avg/file critical" value={spend.avg_client_file_critical_usd} disabled={!canEditControls} onChange={(v) => saveSpend({ avg_client_file_critical_usd: v })} />
            </div>
          </Panel>

          <CG>
            <BucketTable title="Today by category" rows={todayData.by_category} />
            <BucketTable title="Today by feature" rows={todayData.by_feature} />
          </CG>
        </>
      )}

      <ActualSpendPanel
        rangeDays={rangeDays}
        actualCost={attribution.data?.actual.cost_usd ?? s?.cost_usd ?? 0}
        calls={attribution.data?.actual.calls ?? s?.calls ?? 0}
        tokens={(attribution.data?.actual.input_tokens ?? s?.input_tokens ?? 0) + (attribution.data?.actual.output_tokens ?? s?.output_tokens ?? 0)}
        previousCost={attribution.data?.previous_actual.cost_usd ?? 0}
        trendDirection={attribution.data?.trend.direction ?? "flat"}
        trendPct={attribution.data?.trend.pct ?? null}
        projected30Day={attribution.data?.projection.projected_30_day_usd ?? 0}
        dailyRunRate={attribution.data?.projection.daily_run_rate_usd ?? 0}
        documentSpend={documentSpend}
        isLoading={attribution.isLoading}
      />

      <CG>
        <SourceAttributionTable rows={sourceRows} loading={attribution.isLoading} />
        <FeatureCostBars rows={featureRows} loading={attribution.isLoading} />
      </CG>

      <RecentUsageEvents rows={recentEvents} loading={attribution.isLoading} />

      {/* Daily spend bar */}
      <Panel title="Actual daily spend">
        {points.length === 0 ? (
          <div className="sub">No usage logged in this window yet.</div>
        ) : (
          // Chart geometry: bespoke by definition, so it stays inline.
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 120 }}>
            {points.map((p) => (
              <div
                key={p.day}
                title={`${p.day}: ${fmtUsd(p.cost_usd)} · ${fmtInt(p.tokens)} tok`}
                style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", gap: 4 }}
              >
                <div
                  style={{
                    width: "100%",
                    maxWidth: 28,
                    height: `${Math.max(3, (p.cost_usd / maxCost) * 100)}%`,
                    background: "var(--petrol)",
                    borderRadius: 4,
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Breakdown */}
      <Panel
        title="Supplemental dimensions"
        actions={
          <Seg
            ariaLabel="Breakdown dimension"
            as="filter"
            value={dimension}
            onChange={setDimension}
            options={DIMENSIONS.map((d) => ({ value: d.key, label: d.label }))}
          />
        }
        noPad
      >
        {rows.length === 0 ? (
          <div className="panel-b">
            <span className="sub">Nothing in this window.</span>
          </div>
        ) : (
          <Table
            cols={[
              { label: DIMENSIONS.find((d) => d.key === dimension)?.label.replace("By ", "") },
              { label: "Calls", align: "r" },
              { label: "Tokens", align: "r" },
              { label: "Est. cost", align: "r" },
            ]}
          >
            {rows.map((r) => (
              <Tr key={r.key}>
                <Td>
                  <b>{r.label.replace(/_/g, " ")}</b>
                </Td>
                <Td align="r" className="num">
                  {fmtInt(r.calls)}
                </Td>
                <Td align="r" className="num">
                  {fmtInt(r.tokens)}
                </Td>
                <Td align="r" className="num">
                  <b>{fmtUsd(r.cost_usd)}</b>
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  );
}

function ActualSpendPanel({
  rangeDays,
  actualCost,
  calls,
  tokens,
  previousCost,
  trendDirection,
  trendPct,
  projected30Day,
  dailyRunRate,
  documentSpend,
  isLoading,
}: {
  rangeDays: number;
  actualCost: number;
  calls: number;
  tokens: number;
  previousCost: number;
  trendDirection: string;
  trendPct: number | null;
  projected30Day: number;
  dailyRunRate: number;
  documentSpend: number;
  isLoading: boolean;
}) {
  const trendColor =
    trendDirection === "up" ? "var(--danger)" : trendDirection === "down" ? "var(--ok)" : "var(--muted)";
  const trendArrow = trendDirection === "up" ? "▲" : trendDirection === "down" ? "▼" : "■";
  // The comparison window moved from the headline into the caption so the
  // figure fits a `.kpi` tile; nothing was dropped.
  const trendValue = trendPct == null ? "No baseline" : `${trendArrow} ${Math.abs(trendPct).toFixed(1)}%`;
  const trendDetail =
    trendPct == null
      ? `No previous baseline · previous period: ${fmtUsd(previousCost)}`
      : `vs previous ${rangeDays} days · previous period: ${fmtUsd(previousCost)}`;
  return (
    <Panel
      title="Actual ledger focus"
      sub="Real recorded usage is emphasized. Run-rate projections are isolated in amber so they are not confused with posted cost."
      actions={
        <>
          <BasisPill label="Actual" tone="actual" />
          <BasisPill label="Projection" tone="projected" />
        </>
      }
    >
      <div className="kpis">
        <SpendMetric
          label={`${rangeDays}-day actual spend`}
          value={isLoading ? "Loading..." : fmtUsd(actualCost)}
          detail={`${fmtInt(calls)} calls · ${fmtInt(tokens)} tokens`}
          tone="actual"
          large
        />
        <SpendMetric
          label="Trend"
          value={isLoading ? "Loading..." : trendValue}
          detail={trendDetail}
          tone={trendDirection === "up" ? "danger" : trendDirection === "down" ? "profit" : "neutral"}
          color={trendColor}
        />
        <SpendMetric
          label="Document / PDF analysis"
          value={isLoading ? "Loading..." : fmtUsd(documentSpend)}
          detail="Bucket reviews, PDF scans, dealer AI document work"
          tone="actual"
        />
        <SpendMetric
          label="Projected 30-day run rate"
          value={isLoading ? "Loading..." : fmtUsd(projected30Day)}
          detail={`${fmtUsd(dailyRunRate)} daily average from this window`}
          tone="projected"
        />
      </div>
    </Panel>
  );
}

function BasisPill({ label, tone }: { label: string; tone: "actual" | "projected" }) {
  return <CellChip tone={tone === "actual" ? "ok" : "warn"}>{label}</CellChip>;
}

function SpendMetric({
  label,
  value,
  detail,
  tone,
  large = false,
  color,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "actual" | "projected" | "danger" | "profit" | "neutral";
  /** Kept in the signature: emphasis is now carried by `.big` vs `.knum`. */
  large?: boolean;
  color?: string;
}) {
  // The tile used to be tinted by tone. The tone now rides on the basis chip,
  // which is the same vocabulary the legend pills above the row use.
  const chip: { tone: ChipTone; text: string } = {
    actual: { tone: "ok" as ChipTone, text: "Actual" },
    projected: { tone: "warn" as ChipTone, text: "Projection" },
    danger: { tone: "bad" as ChipTone, text: "Actual" },
    profit: { tone: "ok" as ChipTone, text: "Actual" },
    neutral: { tone: "mut" as ChipTone, text: "Actual" },
  }[tone];
  return (
    <div className="kpi">
      <div className="lbl">{label}</div>
      {/* `.knum` is white-space:nowrap; `.big` is not, which is why the emphasised
          tile uses it. Colour is data-derived (trend direction) and no class owns
          it on these elements. */}
      <div className={cx(large ? "big" : "knum", "num")} style={color ? { color } : undefined}>
        {value}
      </div>
      <div className="sub">{detail}</div>
      <div className="kdelta">
        <CellChip tone={chip.tone}>{chip.text}</CellChip>
      </div>
    </div>
  );
}

function SourceAttributionTable({ rows, loading }: { rows: TokenUsageAttributionRow[]; loading: boolean }) {
  const top = rows.slice(0, 12);
  return (
    <Panel
      className="s6"
      title="Top spend by who / what"
      sub="Links take you to the client, loan, bucket, dealer AI lead, or file area that caused the usage."
      noPad
    >
      {loading ? (
        <div className="panel-b">
          <span className="sub">Resolving source attribution...</span>
        </div>
      ) : top.length === 0 ? (
        <div className="panel-b">
          <span className="sub">No attributed usage in this window.</span>
        </div>
      ) : (
        <Table
          cols={[
            { label: "Source" },
            { label: "Area" },
            { label: "Main feature" },
            { label: "Calls", align: "r" },
            { label: "Tokens", align: "r" },
            { label: "Actual cost", align: "r" },
            { label: "Open", align: "r" },
          ]}
        >
          {top.map((row) => (
            <Tr key={row.key}>
              <Td>
                <b>{row.label}</b>
                <div className="sub">{row.id || "No object id"}</div>
              </Td>
              <Td>
                <KindBadge kind={row.kind} />
              </Td>
              <Td>{(row.top_feature || "unknown").replace(/_/g, " ")}</Td>
              <Td align="r" className="num">
                {fmtInt(row.calls)}
              </Td>
              <Td align="r" className="num">
                {fmtInt(row.tokens)}
              </Td>
              <Td align="r" className="num">
                <b>{fmtUsd(row.cost_usd)}</b>
              </Td>
              <Td align="r">
                {row.href ? (
                  <Link href={row.href} className="linky">
                    Open
                  </Link>
                ) : (
                  <span className="sub">—</span>
                )}
              </Td>
            </Tr>
          ))}
        </Table>
      )}
    </Panel>
  );
}

function KindBadge({ kind }: { kind: string }) {
  const tone: ChipTone =
    kind === "dealer_ai_lead" || kind === "bucket" ? "pet" : kind === "legacy" ? "warn" : "mut";
  return <CellChip tone={tone}>{kind.replace(/_/g, " ")}</CellChip>;
}

function FeatureCostBars({ rows, loading }: { rows: TokenUsageAttributionRow[]; loading: boolean }) {
  const top = rows.slice(0, 9);
  const max = Math.max(0.01, ...top.map((row) => row.cost_usd));
  return (
    <Panel className="s6" title="Premium feature cost">
      {loading ? (
        <span className="sub">Loading feature costs...</span>
      ) : top.length === 0 ? (
        <span className="sub">No feature spend in this window.</span>
      ) : (
        <div className="grid g10">
          {top.map((row) => {
            const pct = Math.max(4, (row.cost_usd / max) * 100);
            const isDoc = row.kind === "feature" && /document|scan/i.test(row.key);
            return (
              <div key={row.key}>
                <div className="row">
                  <span>
                    <b>{row.label.replace(/_/g, " ")}</b>
                  </span>
                  <span className="sp" />
                  <b className="num">{fmtUsd(row.cost_usd)}</b>
                </div>
                <div className="track">
                  {/* Width is computed; the amber is data-derived (document work
                      is called out separately in the ledger copy above). */}
                  <div className="fill" style={{ width: `${pct}%`, background: isDoc ? "var(--warn)" : undefined }} />
                </div>
                <div className="sub">
                  {fmtInt(row.calls)} calls · {fmtInt(row.tokens)} tokens · {row.top_provider || "provider unknown"}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function RecentUsageEvents({ rows, loading }: { rows: TokenUsageEventRow[]; loading: boolean }) {
  const top = rows.slice(0, 20);
  return (
    <Panel title="Recent expensive events" noPad>
      {loading ? (
        <div className="panel-b">
          <span className="sub">Loading ledger events...</span>
        </div>
      ) : top.length === 0 ? (
        <div className="panel-b">
          <span className="sub">No event-level usage in this window.</span>
        </div>
      ) : (
        <Table
          cols={[
            { label: "When" },
            { label: "Source" },
            { label: "Feature" },
            { label: "Model" },
            { label: "Ledger" },
            { label: "Tokens", align: "r" },
            { label: "Actual cost", align: "r" },
          ]}
        >
          {top.map((row) => (
            <Tr key={row.id}>
              <Td>
                <span className="sub">{formatDateTime(row.created_at)}</span>
              </Td>
              <Td>
                {row.source.href ? (
                  <Link href={row.source.href} className="linky">
                    {row.source.label}
                  </Link>
                ) : (
                  <b>{row.source.label}</b>
                )}
              </Td>
              <Td>{row.feature.replace(/_/g, " ")}</Td>
              <Td>{row.model}</Td>
              <Td>
                <BasisPill
                  label={row.ledger === "legacy" ? "Legacy actual" : "Actual"}
                  tone={row.ledger === "legacy" ? "projected" : "actual"}
                />
              </Td>
              <Td align="r" className="num">
                {fmtInt(row.tokens)}
              </Td>
              <Td align="r" className="num">
                <b>{fmtUsd(row.cost_usd)}</b>
              </Td>
            </Tr>
          ))}
        </Table>
      )}
    </Panel>
  );
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function NumberControl({ label, value, disabled = false, onChange }: { label: string; value: number; disabled?: boolean; onChange: (value: number) => void }) {
  // Stays a <label> wrapping its input: clicking the caption focuses the field,
  // which a <div>-based Field wrapper would silently drop.
  return (
    <label className="grid g6" style={disabled ? { opacity: 0.65 } : undefined}>
      <span className="lbl">{label}</span>
      <Input
        type="number"
        min={0}
        step={0.25}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value || 0))}
      />
    </label>
  );
}

function Toggle({ label, value, disabled = false, onChange }: { label: string; value: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="row" style={disabled ? { opacity: 0.68 } : undefined}>
      <input type="checkbox" checked={value} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function BucketTable({ title, rows }: { title: string; rows: AIUsageBucket[] }) {
  return (
    <Panel className="s6" title={title}>
      {rows.length === 0 ? (
        <span className="sub">No usage recorded today.</span>
      ) : (
        rows.map((row) => (
          <div key={row.key} className="kv">
            <div>
              <b>{row.key.replace(/_/g, " ")}</b>
              <div className="sub">
                {fmtInt(row.calls)} calls · {fmtInt(row.input_tokens + row.output_tokens)} tokens
              </div>
            </div>
            <b className="num">{fmtUsd(row.estimated_cost_usd)}</b>
          </div>
        ))
      )}
    </Panel>
  );
}
