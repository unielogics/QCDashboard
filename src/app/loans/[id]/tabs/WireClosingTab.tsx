"use client";

import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { QC_FMT } from "@/components/design-system/tokens";
import type { Loan } from "@/lib/types";

export function WireClosingTab({ loan }: { loan: Loan }) {
  const { t } = useTheme();
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      <Card pad={16}>
        <SectionLabel>Closing details</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <KV t={t} label="Closing date" value={loan.close_date ? new Date(loan.close_date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "—"} />
          <KV t={t} label="Loan amount" value={QC_FMT.usd(Number(loan.amount))} bold />
          <KV t={t} label="Loan type" value={loan.type.replace("_", " ")} />
          <KV t={t} label="Stage" value={loan.stage.replace("_", " ")} />
        </div>
      </Card>

      <Card pad={16}>
        <SectionLabel>Wire instructions</SectionLabel>
        <div style={{
          background: t.warnBg, color: t.warn,
          padding: "8px 10px", borderRadius: 7,
          fontSize: 11.5, fontWeight: 600, marginBottom: 12,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <Icon name="shield" size={13} />
          Confirm wire details by phone before sending.
        </div>
        <div style={{ fontSize: 12.5, color: t.ink3, lineHeight: 1.6 }}>
          Wire instructions are coordinated with the title company at closing. The platform stores closing date and amount; the title company supplies the bank, routing, and beneficiary fields directly to closing counsel.
        </div>
      </Card>
    </div>
  );
}

function KV({ t, label, value, bold }: { t: ReturnType<typeof useTheme>["t"]; label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${t.line}` }}>
      <span style={{ fontSize: 11.5, color: t.ink3, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase" }}>{label}</span>
      <span style={{
        fontSize: bold ? 16 : 13, fontWeight: bold ? 800 : 600,
        color: t.ink, fontFeatureSettings: '"tnum"',
      }}>{value}</span>
    </div>
  );
}
