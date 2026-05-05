"use client";

import Link from "next/link";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useClients } from "@/hooks/useApi";
import { useActiveProfile } from "@/store/role";
import { QC_FMT } from "@/components/design-system/tokens";

export default function ClientsPage() {
  const { t } = useTheme();
  const profile = useActiveProfile();
  const { data: clients = [] } = useClients();
  const canCreate = profile.role !== "client";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: t.ink, margin: 0 }}>Clients</h1>
        <Pill>{clients.length}</Pill>
        <div style={{ flex: 1 }} />
        {canCreate && (
          <Link
            href="/clients/new"
            style={{
              padding: "8px 14px", borderRadius: 10, background: t.brand, color: t.inverse,
              fontSize: 13, fontWeight: 700, textDecoration: "none",
              display: "inline-flex", alignItems: "center", gap: 6,
            }}
          >
            <Icon name="plus" size={14} /> New client
          </Link>
        )}
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
            textDecoration: "none",
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
        {clients.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: t.ink3 }}>
            No clients yet. {canCreate && <Link href="/clients/new" style={{ color: t.petrol, fontWeight: 700 }}>Create one →</Link>}
          </div>
        )}
      </Card>
    </div>
  );
}
