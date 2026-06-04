"use client";

import { LendingAIHeader } from "@/components/LendingAIHeader";
import { Card } from "@/components/design-system/primitives";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { useAdminAIUsageToday, useSettings, useUpdateSettings, type AIUsageBucket } from "@/hooks/useApi";

const money = (v: number | null | undefined) => `$${Number(v || 0).toFixed(4)}`;
const compact = (v: number | null | undefined) => Number(v || 0).toLocaleString();
const DEFAULT_AI_SPEND = {
  daily_warning_usd: 10,
  daily_critical_usd: 25,
  avg_client_file_warning_usd: 1.5,
  avg_client_file_critical_usd: 3,
  chat_enabled: true,
  automations_enabled: true,
  document_scanning_enabled: true,
  summaries_enabled: true,
  lender_ai_enabled: true,
};

export default function AIUsagePage() {
  const { t } = useTheme();
  const { data, isLoading } = useAdminAIUsageToday();
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const spend = settings?.data.ai_spend ?? DEFAULT_AI_SPEND;
  const alertColor = data?.alert_level === "critical" ? t.danger : data?.alert_level === "warning" ? t.warn : t.profit;
  const saveSpend = (patch: Partial<NonNullable<typeof spend>>) => {
    updateSettings.mutate({ ai_spend: { ...spend, ...patch } });
  };

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <LendingAIHeader
        title="AI Usage & Spend"
        subtitle="Daily usage ledger, alert thresholds, average cost per client/file, and feature-level spend."
        backHref="/admin/lending-ai"
        backLabel="Lending AI"
      />

      {isLoading || !data ? (
        <Card pad={16} style={{ borderRadius: 8 }}>Loading usage...</Card>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 12 }}>
            <Metric label="Today spend" value={money(data.total_estimated_cost_usd)} detail={`Warn ${money(data.daily_warning_usd)} · Critical ${money(data.daily_critical_usd)}`} />
            <Metric label="Calls" value={compact(data.total_calls)} detail={`${compact(data.total_input_tokens)} in / ${compact(data.total_output_tokens)} out tokens`} />
            <Metric label="Avg/client" value={money(data.avg_cost_per_client_usd)} detail="Scoped client spend today" />
            <Metric label="Avg/file" value={money(data.avg_cost_per_loan_file_usd)} detail="Scoped loan-file spend today" />
          </div>

          <Card pad={14} style={{ borderRadius: 8, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 900, color: t.ink }}>Spend alert status</div>
                <div style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>
                  Thresholds alert only. They do not stop agent workflows.
                </div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 900, color: alertColor, textTransform: "uppercase" }}>
                {data.alert_level}
              </div>
            </div>
            {spend ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
                <NumberControl label="Daily warning" value={spend.daily_warning_usd} onChange={(v) => saveSpend({ daily_warning_usd: v })} />
                <NumberControl label="Daily critical" value={spend.daily_critical_usd} onChange={(v) => saveSpend({ daily_critical_usd: v })} />
                <NumberControl label="Avg/file warning" value={spend.avg_client_file_warning_usd} onChange={(v) => saveSpend({ avg_client_file_warning_usd: v })} />
                <NumberControl label="Avg/file critical" value={spend.avg_client_file_critical_usd} onChange={(v) => saveSpend({ avg_client_file_critical_usd: v })} />
              </div>
            ) : null}
          </Card>

          {spend ? (
            <Card pad={14} style={{ borderRadius: 8, marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: t.ink, marginBottom: 10 }}>Manual category controls</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 8 }}>
                <Toggle label="Chat" value={spend.chat_enabled} onChange={(v) => saveSpend({ chat_enabled: v })} />
                <Toggle label="Automations" value={spend.automations_enabled} onChange={(v) => saveSpend({ automations_enabled: v })} />
                <Toggle label="Document scanning" value={spend.document_scanning_enabled} onChange={(v) => saveSpend({ document_scanning_enabled: v })} />
                <Toggle label="Summaries" value={spend.summaries_enabled} onChange={(v) => saveSpend({ summaries_enabled: v })} />
                <Toggle label="Lender AI" value={spend.lender_ai_enabled} onChange={(v) => saveSpend({ lender_ai_enabled: v })} />
              </div>
            </Card>
          ) : null}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, marginBottom: 12 }}>
            <BucketTable title="By category" rows={data.by_category} />
            <BucketTable title="By feature" rows={data.by_feature} />
            <BucketTable title="By client" rows={data.by_client} />
            <BucketTable title="By loan file" rows={data.by_loan_file} />
          </div>

          <Card pad={14} style={{ borderRadius: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: t.ink, marginBottom: 10 }}>Top expensive calls</div>
            <div style={{ display: "grid", gap: 8 }}>
              {data.top_calls.length === 0 ? (
                <div style={{ color: t.ink3, fontSize: 12 }}>No AI usage recorded today.</div>
              ) : data.top_calls.map((row) => (
                <div key={row.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, padding: "9px 0", borderTop: `1px solid ${t.line}` }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 850, color: t.ink }}>{row.feature} · {row.model}</div>
                    <div style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>
                      {compact(row.input_tokens)} in / {compact(row.output_tokens)} out
                      {row.loan_id ? ` · loan ${row.loan_id.slice(0, 8)}` : ""}
                      {row.client_id ? ` · client ${row.client_id.slice(0, 8)}` : ""}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 900, color: t.ink }}>{money(row.estimated_cost_usd)}</div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function NumberControl({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const { t } = useTheme();
  return (
    <label style={{ display: "grid", gap: 5 }}>
      <span style={{ fontSize: 11, fontWeight: 850, color: t.ink3, textTransform: "uppercase" }}>{label}</span>
      <input
        type="number"
        min={0}
        step={0.25}
        value={value}
        onChange={(e) => onChange(Number(e.target.value || 0))}
        style={{ height: 34, borderRadius: 6, border: `1px solid ${t.line}`, background: t.surface, color: t.ink, padding: "0 9px", fontWeight: 800 }}
      />
    </label>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  const { t } = useTheme();
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 850, color: t.ink }}>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  const { t } = useTheme();
  return (
    <Card pad={14} style={{ borderRadius: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 850, color: t.ink3, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 950, color: t.ink, marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 11, color: t.ink3, marginTop: 4 }}>{detail}</div>
    </Card>
  );
}

function BucketTable({ title, rows }: { title: string; rows: AIUsageBucket[] }) {
  const { t } = useTheme();
  return (
    <Card pad={14} style={{ borderRadius: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 900, color: t.ink, marginBottom: 10 }}>{title}</div>
      <div style={{ display: "grid", gap: 8 }}>
        {rows.length === 0 ? (
          <div style={{ color: t.ink3, fontSize: 12 }}>No usage recorded.</div>
        ) : rows.map((row) => (
          <div key={row.key} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 850, color: t.ink }}>{row.key}</div>
              <div style={{ fontSize: 11, color: t.ink3 }}>{compact(row.calls)} calls · {compact(row.input_tokens + row.output_tokens)} tokens</div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 900, color: t.ink }}>{money(row.estimated_cost_usd)}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
