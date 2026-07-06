"use client";

// /admin/token-usage — canonical Elara AI usage and controls surface.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, KPI, SectionLabel } from "@/components/design-system/primitives";
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
  const { t } = useTheme();
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
      <Card pad={20}>
        <span style={{ color: t.ink3, fontSize: 13 }}>Loading…</span>
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
  const alertColor = todayData?.alert_level === "critical" ? t.danger : todayData?.alert_level === "warning" ? t.warn : t.profit;
  const rows = breakdown.data ?? [];
  const points = series.data ?? [];
  const maxCost = Math.max(1, ...points.map((p) => p.cost_usd));
  const saveSpend = (patch: Partial<typeof spend>) => {
    if (!canEditControls) return;
    updateSettings.mutate({ ai_spend: { ...spend, ...patch } });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: t.ink }}>
            Elara AI Usage & Controls
          </h1>
          <p style={{ fontSize: 13, color: t.ink3, margin: "6px 0 0", maxWidth: 620 }}>
            Review AI spend across Elara, monitor current Bedrock usage, and control which paid model calls are allowed.
          </p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRangeDays(r.days)}
              style={{
                padding: "7px 12px",
                borderRadius: 8,
                fontSize: 12.5,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
                border: `1px solid ${rangeDays === r.days ? t.ink : t.lineStrong}`,
                background: rangeDays === r.days ? t.ink : t.surface,
                color: rangeDays === r.days ? t.inverse : t.ink2,
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {today.isLoading || !todayData ? (
        <Card pad={16}>Loading AI controls...</Card>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <KPI label="Today spend" value={fmtUsd(todayData.total_estimated_cost_usd)} />
            <KPI label="Today calls" value={fmtInt(todayData.total_calls)} />
            <KPI label="Avg/client today" value={fmtUsd(todayData.avg_cost_per_client_usd)} />
            <KPI label="Avg/file today" value={fmtUsd(todayData.avg_cost_per_loan_file_usd)} />
          </div>

          <Card pad={16} style={{ borderRadius: 8, borderColor: masterEnabled ? t.line : t.danger, background: masterEnabled ? t.surface : t.dangerBg }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
              <div>
                <SectionLabel>Admin AI controls</SectionLabel>
                <div style={{ fontSize: 12, color: masterEnabled ? t.ink3 : t.danger, marginTop: 4 }}>
                  {masterEnabled
                    ? "Controls paid Bedrock model calls across chat, automations, summaries, scanning, and lender workflows."
                    : "AI is disabled system-wide. Deterministic app workflows continue, but model calls are blocked."}
                </div>
                {!canEditControls ? (
                  <div style={{ fontSize: 12, color: t.ink3, marginTop: 4 }}>Read-only for loan executives.</div>
                ) : !canToggleMaster ? (
                  <div style={{ fontSize: 12, color: t.ink3, marginTop: 4 }}>Only franco@qualifiedcommercial.com can change the master switch.</div>
                ) : null}
              </div>
              <div style={{ fontSize: 12, fontWeight: 900, color: alertColor, textTransform: "uppercase" }}>
                {todayData.alert_level}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10, marginBottom: 12 }}>
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

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
              <NumberControl label="Daily warning" value={spend.daily_warning_usd} disabled={!canEditControls} onChange={(v) => saveSpend({ daily_warning_usd: v })} />
              <NumberControl label="Daily critical" value={spend.daily_critical_usd} disabled={!canEditControls} onChange={(v) => saveSpend({ daily_critical_usd: v })} />
              <NumberControl label="Avg/file warning" value={spend.avg_client_file_warning_usd} disabled={!canEditControls} onChange={(v) => saveSpend({ avg_client_file_warning_usd: v })} />
              <NumberControl label="Avg/file critical" value={spend.avg_client_file_critical_usd} disabled={!canEditControls} onChange={(v) => saveSpend({ avg_client_file_critical_usd: v })} />
            </div>
          </Card>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
            <BucketTable title="Today by category" rows={todayData.by_category} />
            <BucketTable title="Today by feature" rows={todayData.by_feature} />
          </div>
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, alignItems: "start" }}>
        <SourceAttributionTable rows={sourceRows} loading={attribution.isLoading} />
        <FeatureCostBars rows={featureRows} loading={attribution.isLoading} />
      </div>

      <RecentUsageEvents rows={recentEvents} loading={attribution.isLoading} />

      {/* Daily spend bar */}
      <Card pad={18}>
        <SectionLabel>Actual daily spend</SectionLabel>
        {points.length === 0 ? (
          <div style={{ fontSize: 13, color: t.ink3, marginTop: 10 }}>
            No usage logged in this window yet.
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 120, marginTop: 14 }}>
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
                    background: t.petrol ?? t.ink,
                    borderRadius: 4,
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Breakdown */}
      <Card pad={18}>
        <SectionLabel>Supplemental dimensions</SectionLabel>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {DIMENSIONS.map((d) => (
            <button
              key={d.key}
              onClick={() => setDimension(d.key)}
              style={{
                padding: "7px 12px",
                borderRadius: 999,
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                border: `1px solid ${dimension === d.key ? t.ink : t.lineStrong}`,
                background: dimension === d.key ? t.ink : t.surface,
                color: dimension === d.key ? t.inverse : t.ink2,
              }}
            >
              {d.label}
            </button>
          ))}
        </div>
        {rows.length === 0 ? (
          <div style={{ fontSize: 13, color: t.ink3 }}>Nothing in this window.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: t.ink3, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>
                <th style={{ padding: "6px 8px" }}>{DIMENSIONS.find((d) => d.key === dimension)?.label.replace("By ", "")}</th>
                <th style={{ padding: "6px 8px", textAlign: "right" }}>Calls</th>
                <th style={{ padding: "6px 8px", textAlign: "right" }}>Tokens</th>
                <th style={{ padding: "6px 8px", textAlign: "right" }}>Est. cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} style={{ borderTop: `1px solid ${t.line}` }}>
                  <td style={{ padding: "8px", color: t.ink, fontWeight: 600 }}>
                    {r.label.replace(/_/g, " ")}
                  </td>
                  <td style={{ padding: "8px", textAlign: "right", color: t.ink3 }}>{fmtInt(r.calls)}</td>
                  <td style={{ padding: "8px", textAlign: "right", color: t.ink3 }}>{fmtInt(r.tokens)}</td>
                  <td style={{ padding: "8px", textAlign: "right", color: t.ink, fontWeight: 700 }}>{fmtUsd(r.cost_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
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
  const { t } = useTheme();
  const trendColor = trendDirection === "up" ? t.danger : trendDirection === "down" ? t.profit : t.ink3;
  const trendArrow = trendDirection === "up" ? "▲" : trendDirection === "down" ? "▼" : "■";
  const trendText = trendPct == null ? "No previous baseline" : `${trendArrow} ${Math.abs(trendPct).toFixed(1)}% vs previous ${rangeDays} days`;
  return (
    <Card
      pad={18}
      style={{
        borderRadius: 14,
        background: `linear-gradient(135deg, ${t.surface}, ${t.chip})`,
        borderColor: t.lineStrong,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 14, flexWrap: "wrap" }}>
        <div>
          <SectionLabel style={{ padding: 0, marginBottom: 4 }}>Actual ledger focus</SectionLabel>
          <div style={{ color: t.ink3, fontSize: 12.5 }}>
            Real recorded usage is emphasized. Run-rate projections are isolated in amber so they are not confused with posted cost.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <BasisPill label="Actual" tone="actual" />
          <BasisPill label="Projection" tone="projected" />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
        <SpendMetric
          label={`${rangeDays}-day actual spend`}
          value={isLoading ? "Loading..." : fmtUsd(actualCost)}
          detail={`${fmtInt(calls)} calls · ${fmtInt(tokens)} tokens`}
          tone="actual"
          large
        />
        <SpendMetric
          label="Trend"
          value={isLoading ? "Loading..." : trendText}
          detail={`Previous period: ${fmtUsd(previousCost)}`}
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
    </Card>
  );
}

function BasisPill({ label, tone }: { label: string; tone: "actual" | "projected" }) {
  const { t } = useTheme();
  const actual = tone === "actual";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 9px",
        borderRadius: 999,
        color: actual ? t.profit : t.warn,
        background: actual ? t.profitBg : t.warnBg,
        border: `1px solid ${actual ? t.profit : t.warn}`,
        fontSize: 11,
        fontWeight: 900,
        textTransform: "uppercase",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 99, background: actual ? t.profit : t.warn }} />
      {label}
    </span>
  );
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
  large?: boolean;
  color?: string;
}) {
  const { t } = useTheme();
  const toneMap = {
    actual: { bg: t.petrolSoft, border: t.petrol, color: t.ink },
    projected: { bg: t.warnBg, border: t.warn, color: t.warn },
    danger: { bg: t.dangerBg, border: t.danger, color: t.danger },
    profit: { bg: t.profitBg, border: t.profit, color: t.profit },
    neutral: { bg: t.chip, border: t.lineStrong, color: t.ink2 },
  }[tone];
  return (
    <div
      style={{
        minHeight: large ? 124 : 110,
        border: `1px solid ${toneMap.border}`,
        background: toneMap.bg,
        borderRadius: 12,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.2, textTransform: "uppercase", color: t.ink3 }}>{label}</div>
      <div style={{ fontSize: large ? 30 : 17, fontWeight: 950, color: color ?? toneMap.color, lineHeight: 1.05 }}>{value}</div>
      <div style={{ fontSize: 12, color: t.ink3, lineHeight: 1.35 }}>{detail}</div>
    </div>
  );
}

function SourceAttributionTable({ rows, loading }: { rows: TokenUsageAttributionRow[]; loading: boolean }) {
  const { t } = useTheme();
  const top = rows.slice(0, 12);
  return (
    <Card pad={18} style={{ borderRadius: 14 }}>
      <SectionLabel>Top spend by who / what</SectionLabel>
      <div style={{ fontSize: 12.5, color: t.ink3, margin: "-4px 4px 12px" }}>
        Links take you to the client, loan, bucket, dealer AI lead, or file area that caused the usage.
      </div>
      {loading ? (
        <div style={{ color: t.ink3, fontSize: 13 }}>Resolving source attribution...</div>
      ) : top.length === 0 ? (
        <div style={{ color: t.ink3, fontSize: 13 }}>No attributed usage in this window.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720, fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: t.ink3, fontSize: 10.5, textTransform: "uppercase", letterSpacing: 1 }}>
                <th style={{ padding: "8px 8px" }}>Source</th>
                <th style={{ padding: "8px 8px" }}>Area</th>
                <th style={{ padding: "8px 8px" }}>Main feature</th>
                <th style={{ padding: "8px 8px", textAlign: "right" }}>Calls</th>
                <th style={{ padding: "8px 8px", textAlign: "right" }}>Tokens</th>
                <th style={{ padding: "8px 8px", textAlign: "right" }}>Actual cost</th>
                <th style={{ padding: "8px 8px", textAlign: "right" }}>Open</th>
              </tr>
            </thead>
            <tbody>
              {top.map((row) => (
                <tr key={row.key} style={{ borderTop: `1px solid ${t.line}` }}>
                  <td style={{ padding: "10px 8px", color: t.ink, fontWeight: 850, maxWidth: 280 }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.label}</div>
                    <div style={{ color: t.ink3, fontSize: 11, marginTop: 3 }}>{row.id || "No object id"}</div>
                  </td>
                  <td style={{ padding: "10px 8px" }}><KindBadge kind={row.kind} /></td>
                  <td style={{ padding: "10px 8px", color: t.ink2 }}>{(row.top_feature || "unknown").replace(/_/g, " ")}</td>
                  <td style={{ padding: "10px 8px", textAlign: "right", color: t.ink3 }}>{fmtInt(row.calls)}</td>
                  <td style={{ padding: "10px 8px", textAlign: "right", color: t.ink3 }}>{fmtInt(row.tokens)}</td>
                  <td style={{ padding: "10px 8px", textAlign: "right", color: t.ink, fontWeight: 950 }}>{fmtUsd(row.cost_usd)}</td>
                  <td style={{ padding: "10px 8px", textAlign: "right" }}>
                    {row.href ? (
                      <Link href={row.href} style={{ color: t.petrol, fontWeight: 900, textDecoration: "none" }}>Open</Link>
                    ) : (
                      <span style={{ color: t.ink3 }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function KindBadge({ kind }: { kind: string }) {
  const { t } = useTheme();
  const tone = kind === "dealer_ai_lead" || kind === "bucket" ? t.petrol : kind === "legacy" ? t.warn : t.ink2;
  const bg = kind === "dealer_ai_lead" || kind === "bucket" ? t.petrolSoft : kind === "legacy" ? t.warnBg : t.chip;
  return (
    <span style={{ display: "inline-flex", padding: "4px 8px", borderRadius: 999, background: bg, color: tone, fontSize: 11, fontWeight: 900 }}>
      {kind.replace(/_/g, " ")}
    </span>
  );
}

function FeatureCostBars({ rows, loading }: { rows: TokenUsageAttributionRow[]; loading: boolean }) {
  const { t } = useTheme();
  const top = rows.slice(0, 9);
  const max = Math.max(0.01, ...top.map((row) => row.cost_usd));
  return (
    <Card pad={18} style={{ borderRadius: 14 }}>
      <SectionLabel>Premium feature cost</SectionLabel>
      {loading ? (
        <div style={{ color: t.ink3, fontSize: 13 }}>Loading feature costs...</div>
      ) : top.length === 0 ? (
        <div style={{ color: t.ink3, fontSize: 13 }}>No feature spend in this window.</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {top.map((row) => {
            const pct = Math.max(4, (row.cost_usd / max) * 100);
            return (
              <div key={row.key}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, marginBottom: 5 }}>
                  <span style={{ color: t.ink, fontWeight: 850 }}>{row.label.replace(/_/g, " ")}</span>
                  <span style={{ color: t.ink, fontWeight: 950 }}>{fmtUsd(row.cost_usd)}</span>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: t.line, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: row.kind === "feature" && /document|scan/i.test(row.key) ? t.warn : t.petrol }} />
                </div>
                <div style={{ color: t.ink3, fontSize: 11, marginTop: 4 }}>
                  {fmtInt(row.calls)} calls · {fmtInt(row.tokens)} tokens · {row.top_provider || "provider unknown"}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function RecentUsageEvents({ rows, loading }: { rows: TokenUsageEventRow[]; loading: boolean }) {
  const { t } = useTheme();
  const top = rows.slice(0, 20);
  return (
    <Card pad={18} style={{ borderRadius: 14 }}>
      <SectionLabel>Recent expensive events</SectionLabel>
      {loading ? (
        <div style={{ color: t.ink3, fontSize: 13 }}>Loading ledger events...</div>
      ) : top.length === 0 ? (
        <div style={{ color: t.ink3, fontSize: 13 }}>No event-level usage in this window.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760, fontSize: 12.5 }}>
            <thead>
              <tr style={{ textAlign: "left", color: t.ink3, fontSize: 10.5, textTransform: "uppercase", letterSpacing: 1 }}>
                <th style={{ padding: "8px" }}>When</th>
                <th style={{ padding: "8px" }}>Source</th>
                <th style={{ padding: "8px" }}>Feature</th>
                <th style={{ padding: "8px" }}>Model</th>
                <th style={{ padding: "8px" }}>Ledger</th>
                <th style={{ padding: "8px", textAlign: "right" }}>Tokens</th>
                <th style={{ padding: "8px", textAlign: "right" }}>Actual cost</th>
              </tr>
            </thead>
            <tbody>
              {top.map((row) => (
                <tr key={row.id} style={{ borderTop: `1px solid ${t.line}` }}>
                  <td style={{ padding: "9px 8px", color: t.ink3 }}>{formatDateTime(row.created_at)}</td>
                  <td style={{ padding: "9px 8px", color: t.ink, fontWeight: 800 }}>
                    {row.source.href ? (
                      <Link href={row.source.href} style={{ color: t.ink, textDecoration: "none" }}>{row.source.label}</Link>
                    ) : row.source.label}
                  </td>
                  <td style={{ padding: "9px 8px", color: t.ink2 }}>{row.feature.replace(/_/g, " ")}</td>
                  <td style={{ padding: "9px 8px", color: t.ink3, maxWidth: 210, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.model}</td>
                  <td style={{ padding: "9px 8px" }}><BasisPill label={row.ledger === "legacy" ? "Legacy actual" : "Actual"} tone={row.ledger === "legacy" ? "projected" : "actual"} /></td>
                  <td style={{ padding: "9px 8px", textAlign: "right", color: t.ink3 }}>{fmtInt(row.tokens)}</td>
                  <td style={{ padding: "9px 8px", textAlign: "right", color: t.ink, fontWeight: 950 }}>{fmtUsd(row.cost_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function NumberControl({ label, value, disabled = false, onChange }: { label: string; value: number; disabled?: boolean; onChange: (value: number) => void }) {
  const { t } = useTheme();
  return (
    <label style={{ display: "grid", gap: 5, opacity: disabled ? 0.65 : 1 }}>
      <span style={{ fontSize: 11, fontWeight: 850, color: t.ink3, textTransform: "uppercase" }}>{label}</span>
      <input
        type="number"
        min={0}
        step={0.25}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value || 0))}
        style={{ height: 34, borderRadius: 6, border: `1px solid ${t.line}`, background: t.surface, color: t.ink, padding: "0 9px", fontWeight: 800 }}
      />
    </label>
  );
}

function Toggle({ label, value, disabled = false, onChange }: { label: string; value: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  const { t } = useTheme();
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 850, color: disabled ? t.ink3 : t.ink, opacity: disabled ? 0.68 : 1 }}>
      <input type="checkbox" checked={value} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function BucketTable({ title, rows }: { title: string; rows: AIUsageBucket[] }) {
  const { t } = useTheme();
  return (
    <Card pad={14} style={{ borderRadius: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 900, color: t.ink, marginBottom: 10 }}>{title}</div>
      <div style={{ display: "grid", gap: 8 }}>
        {rows.length === 0 ? (
          <div style={{ color: t.ink3, fontSize: 12 }}>No usage recorded today.</div>
        ) : rows.map((row) => (
          <div key={row.key} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 850, color: t.ink }}>{row.key.replace(/_/g, " ")}</div>
              <div style={{ fontSize: 11, color: t.ink3 }}>{fmtInt(row.calls)} calls · {fmtInt(row.input_tokens + row.output_tokens)} tokens</div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 900, color: t.ink }}>{fmtUsd(row.estimated_cost_usd)}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
