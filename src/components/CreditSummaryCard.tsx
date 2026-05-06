"use client";

// Borrower-facing credit summary. Compact card showing FICO, tier, the
// signal bullets, and the products the borrower currently qualifies for.
// Mounted on the simulator page (CLIENT view) and the client detail
// page (operators see the same data + the link to drill into the full
// report).

import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import type { CreditSummary } from "@/lib/types";

const TIER_LABEL: Record<string, { label: string; bg?: string; fg?: string }> = {
  pro: { label: "Pro" },
  basic: { label: "Standard" },
  warn: { label: "Caution" },
  blocked: { label: "Blocked" },
};

export function CreditSummaryCard({
  summary,
  loading,
}: {
  summary: CreditSummary | undefined;
  loading?: boolean;
}) {
  const { t } = useTheme();

  if (loading) {
    return (
      <Card pad={20}>
        <SectionLabel>Credit summary</SectionLabel>
        <div style={{ fontSize: 13, color: t.ink3 }}>Loading…</div>
      </Card>
    );
  }
  if (!summary || summary.fico == null) {
    return (
      <Card pad={20}>
        <SectionLabel>Credit summary</SectionLabel>
        <div style={{ fontSize: 13, color: t.ink3 }}>
          No credit pull on file.
        </div>
      </Card>
    );
  }

  const tier = summary.tier ?? "blocked";
  const tierFg = tier === "pro" ? t.profit : tier === "basic" ? t.brand : tier === "warn" ? t.warn : t.danger;
  const tierBg = tier === "pro" ? t.profitBg : tier === "basic" ? t.brandSoft : tier === "warn" ? t.warnBg : t.dangerBg;
  const maxLtv = summary.tier_max_ltv != null ? `${Math.round(summary.tier_max_ltv * 100)}%` : "—";

  return (
    <Card pad={20}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 14 }}>
        <div style={{ minWidth: 120 }}>
          <SectionLabel>Credit Summary</SectionLabel>
          <div style={{ fontSize: 44, fontWeight: 800, color: t.ink, fontFeatureSettings: '"tnum"', lineHeight: 1 }}>
            {summary.fico}
          </div>
          <div style={{ fontSize: 11, color: t.ink3, marginTop: 4 }}>
            {summary.fico_model ? `${summary.fico_model.toUpperCase().replace("_", " ")} score` : "FICO score"}
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Pill bg={tierBg} color={tierFg}>{TIER_LABEL[tier]?.label ?? tier}</Pill>
            <div style={{ fontSize: 12, color: t.ink2 }}>
              Up to <strong style={{ color: t.ink }}>{maxLtv}</strong> LTV available
            </div>
          </div>
          {summary.fraud_flag ? (
            <Pill bg={t.dangerBg} color={t.danger}>
              <Icon name="alert" size={11} stroke={2.4} /> {summary.fraud_flag}
            </Pill>
          ) : null}
        </div>
      </div>

      {summary.bullets.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          {summary.bullets.map((b, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <span
                style={{
                  width: 8, height: 8, borderRadius: 4, flexShrink: 0, marginTop: 6,
                  background:
                    b.kind === "positive" ? t.profit : b.kind === "warn" ? t.warn : t.ink3,
                }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: t.ink }}>{b.label}</div>
                {b.detail ? (
                  <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 1 }}>{b.detail}</div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {summary.available_products.length > 0 && (
        <>
          <SectionLabel>Available programs</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8, marginTop: 6 }}>
            {summary.available_products.map((p) => (
              <div
                key={p.id}
                style={{
                  border: `1px solid ${t.line}`,
                  borderRadius: 10,
                  padding: 10,
                  background: t.surface2,
                }}
              >
                <div style={{ fontSize: 12.5, fontWeight: 700, color: t.ink }}>{p.label}</div>
                <div style={{ fontSize: 11, color: t.ink3, marginTop: 4, display: "flex", gap: 8 }}>
                  {p.rate != null ? <span>{p.rate}%</span> : null}
                  {p.max_ltv != null ? <span>· max {Math.round(p.max_ltv * 100)}%</span> : null}
                  {p.term ? <span>· {p.term}</span> : null}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {summary.blocked_products.length > 0 && (
        <details style={{ marginTop: 14 }}>
          <summary style={{ fontSize: 11.5, color: t.ink3, cursor: "pointer", fontWeight: 600 }}>
            Why {summary.blocked_products.length} program{summary.blocked_products.length === 1 ? "" : "s"} {summary.blocked_products.length === 1 ? "isn't" : "aren't"} available
          </summary>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {summary.blocked_products.map((p) => (
              <div key={p.id} style={{ fontSize: 11.5, color: t.ink3 }}>
                <strong style={{ color: t.ink2 }}>{p.label}</strong> — {p.reason}
              </div>
            ))}
          </div>
        </details>
      )}

      {summary.note ? (
        <div style={{ marginTop: 12, fontSize: 11, color: t.ink3, fontStyle: "italic" }}>
          {summary.note}
        </div>
      ) : null}
    </Card>
  );
}
