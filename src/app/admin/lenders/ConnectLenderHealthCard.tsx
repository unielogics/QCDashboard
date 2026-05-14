"use client";

// Super-admin diagnostic for the Connect-Lender feature chain.
//
// Surfaces the result of GET /admin/connect-lender/health as a list of
// traffic-light rows so the operator can see exactly which link is
// missing (Gmail config, active lenders, eligible loans, Anthropic
// key, mock vs real inbound). Lives at the top of the Lenders tab.

import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useConnectLenderHealth } from "@/hooks/useApi";
import type { HealthStatus } from "@/lib/types";

function statusColors(t: ReturnType<typeof useTheme>["t"], status: HealthStatus) {
  switch (status) {
    case "ok":
      return { bg: t.profitBg, fg: t.profit, label: "OK" };
    case "warn":
      return { bg: t.warnBg, fg: t.warn, label: "WARN" };
    case "fail":
      return { bg: t.dangerBg, fg: t.danger, label: "FAIL" };
  }
}

export function ConnectLenderHealthCard() {
  const { t } = useTheme();
  const { data, isLoading, isError, error } = useConnectLenderHealth();

  return (
    <Card pad={0}>
      <div
        style={{
          padding: "12px 16px",
          borderBottom: `1px solid ${t.line}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name="shieldChk" size={14} stroke={2.5} />
          <SectionLabel>Connect Lender — health</SectionLabel>
        </div>
        {data ? (
          <Pill
            bg={statusColors(t, data.overall).bg}
            color={statusColors(t, data.overall).fg}
          >
            {statusColors(t, data.overall).label}
          </Pill>
        ) : null}
      </div>

      <div style={{ padding: 16 }}>
        {isLoading ? (
          <div style={{ fontSize: 12.5, color: t.ink3 }}>Running checks…</div>
        ) : isError ? (
          <div style={{ fontSize: 12.5, color: t.danger }}>
            Probe failed: {(error as Error)?.message ?? "Unknown error"}.
            The /admin/connect-lender/health endpoint may not be deployed yet.
          </div>
        ) : data ? (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 12,
                marginBottom: 14,
              }}
            >
              <Stat t={t} label="Active lenders" value={data.active_lender_count} />
              <Stat
                t={t}
                label="Loans connectable"
                value={data.eligible_loan_count}
              />
              <Stat
                t={t}
                label="Loans connected"
                value={data.connected_loan_count}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.checks.map((c) => {
                const sc = statusColors(t, c.status);
                return (
                  <div
                    key={c.name}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "auto 1fr",
                      gap: 10,
                      alignItems: "start",
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: t.surface2,
                      border: `1px solid ${t.line}`,
                    }}
                  >
                    <Pill bg={sc.bg} color={sc.fg}>
                      {sc.label}
                    </Pill>
                    <div>
                      <div
                        style={{
                          fontSize: 12.5,
                          fontWeight: 700,
                          color: t.ink,
                        }}
                      >
                        {c.name}
                      </div>
                      <div
                        style={{
                          fontSize: 11.5,
                          color: t.ink3,
                          marginTop: 2,
                          lineHeight: 1.45,
                        }}
                      >
                        {c.detail}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
      </div>
    </Card>
  );
}

function Stat({
  t,
  label,
  value,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  value: number;
}) {
  return (
    <div
      style={{
        padding: 10,
        borderRadius: 10,
        background: t.surface2,
        border: `1px solid ${t.line}`,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: t.ink3,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 800,
          color: t.ink,
          marginTop: 2,
          letterSpacing: -0.4,
        }}
      >
        {value}
      </div>
    </div>
  );
}
