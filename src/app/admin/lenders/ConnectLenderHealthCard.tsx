"use client";

// Super-admin diagnostic for the Connect-Lender feature chain.
//
// Kept compact so the lender roster stays the primary surface. The
// full probe details are still available behind the Details toggle.

import { useMemo, useState } from "react";
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
  const [expanded, setExpanded] = useState(false);

  const attentionCheck = useMemo(() => {
    if (!data) return null;
    return data.checks.find((c) => c.status === "fail") ?? data.checks.find((c) => c.status === "warn") ?? null;
  }, [data]);

  const overall = data ? statusColors(t, data.overall) : null;

  return (
    <Card pad={0}>
      <div
        style={{
          padding: "9px 14px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 190 }}>
          <Icon name="shieldChk" size={14} stroke={2.5} />
          <SectionLabel style={{ marginBottom: 0 }}>Connect Lender — health</SectionLabel>
        </div>

        {isLoading ? (
          <div style={{ fontSize: 12.5, color: t.ink3 }}>Running checks...</div>
        ) : isError ? (
          <div style={{ fontSize: 12.5, color: t.danger, minWidth: 0 }}>
            Probe failed: {(error as Error)?.message ?? "Unknown error"}. The /admin/connect-lender/health endpoint may not be deployed yet.
          </div>
        ) : data ? (
          <>
            {overall ? <Pill bg={overall.bg} color={overall.fg}>{overall.label}</Pill> : null}
            <InlineStat label="Active lenders" value={data.active_lender_count} />
            <InlineStat label="Connectable" value={data.eligible_loan_count} />
            <InlineStat label="Connected" value={data.connected_loan_count} />
            {attentionCheck ? (
              <div
                style={{
                  minWidth: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  color: statusColors(t, attentionCheck.status).fg,
                  fontSize: 12,
                  fontWeight: 750,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                <Icon name="alert" size={12} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                  {attentionCheck.name}
                </span>
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              style={{
                all: "unset",
                marginLeft: "auto",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "5px 8px",
                borderRadius: 7,
                color: t.ink2,
                background: t.surface2,
                border: `1px solid ${t.line}`,
                fontSize: 11.5,
                fontWeight: 800,
              }}
            >
              {expanded ? "Hide" : "Details"}
              <Icon name={expanded ? "chevU" : "chevD"} size={11} />
            </button>
          </>
        ) : null}
      </div>

      {expanded && data ? (
        <div
          style={{
            padding: "0 14px 12px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 6,
          }}
        >
          {data.checks.map((c) => {
            const sc = statusColors(t, c.status);
            return (
              <div
                key={c.name}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr",
                  gap: 8,
                  alignItems: "start",
                  padding: "7px 9px",
                  borderRadius: 8,
                  background: t.surface2,
                  border: `1px solid ${t.line}`,
                }}
              >
                <Pill bg={sc.bg} color={sc.fg}>
                  {sc.label}
                </Pill>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: t.ink }}>
                    {c.name}
                  </div>
                  <div style={{ fontSize: 11, color: t.ink3, marginTop: 2, lineHeight: 1.35 }}>
                    {c.detail}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </Card>
  );
}

function InlineStat({ label, value }: { label: string; value: number }) {
  const { t } = useTheme();
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 5,
        padding: "4px 8px",
        borderRadius: 8,
        background: t.surface2,
        border: `1px solid ${t.line}`,
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: 0.8,
          textTransform: "uppercase",
          color: t.ink3,
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 14, fontWeight: 900, color: t.ink, fontFeatureSettings: '"tnum"' }}>
        {value}
      </span>
    </div>
  );
}
