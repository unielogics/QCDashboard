"use client";

import Link from "next/link";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill } from "@/components/design-system/primitives";
import { useClients } from "@/hooks/useApi";
import { QC_FMT } from "@/components/design-system/tokens";

export default function ClientsPage() {
  const { t } = useTheme();
  const { data: clients = [] } = useClients();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: t.ink, margin: 0 }}>Clients</h1>
        <Pill>{clients.length}</Pill>
      </div>
      <Card pad={0}>
        <div style={{
          display: "grid", gridTemplateColumns: "minmax(0, 2fr) 100px 80px 80px 100px 140px",
          padding: "12px 16px", fontSize: 11, fontWeight: 700, color: t.ink3,
          textTransform: "uppercase", letterSpacing: 1.2, borderBottom: `1px solid ${t.line}`,
        }}>
          <div>Client</div><div>Tier</div><div>FICO</div><div>Loans</div><div>Exposure</div><div>City</div>
        </div>
        {clients.map((c) => (
          <Link key={c.id} href={`/clients/${c.id}`} style={{
            display: "grid", gridTemplateColumns: "minmax(0, 2fr) 100px 80px 80px 100px 140px",
            padding: "12px 16px", borderBottom: `1px solid ${t.line}`, alignItems: "center", fontSize: 13, color: t.ink,
          }}>
            <div>
              <div style={{ fontWeight: 700 }}>{c.name}</div>
              <div style={{ fontSize: 11.5, color: t.ink3 }}>{c.email}</div>
            </div>
            <div><Pill>{c.tier}</Pill></div>
            <div style={{ fontFeatureSettings: '"tnum"' }}>{c.fico ?? "—"}</div>
            <div>{c.funded_count}</div>
            <div style={{ fontWeight: 700, fontFeatureSettings: '"tnum"' }}>{QC_FMT.short(Number(c.funded_total))}</div>
            <div style={{ color: t.ink3 }}>{c.city ?? "—"}</div>
          </Link>
        ))}
      </Card>
    </div>
  );
}
