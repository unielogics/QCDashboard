"use client";

// /admin/token-usage — canonical Elara AI usage and controls surface.

import { useEffect, useMemo, useState } from "react";
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
  useUpdateSettings,
  type AIUsageBucket,
  type TokenUsageDimension,
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

      {/* KPI tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <KPI label={`${rangeDays}-day est. cost`} value={s ? fmtUsd(s.cost_usd) : "—"} />
        <KPI label={`${rangeDays}-day tokens`} value={s ? fmtInt(s.total_tokens) : "—"} />
        <KPI label="Cache-hit %" value={s ? `${s.cache_hit_pct}%` : "—"} />
        <KPI label={`${rangeDays}-day calls`} value={s ? fmtInt(s.calls) : "—"} />
      </div>

      {/* Daily spend bar */}
      <Card pad={18}>
        <SectionLabel>Historical daily spend</SectionLabel>
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
