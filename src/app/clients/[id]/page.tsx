"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, KPI, Pill, SectionLabel } from "@/components/design-system/primitives";
import { useClient, useLoans } from "@/hooks/useApi";
import { QC_FMT } from "@/components/design-system/tokens";

export default function ClientDetailPage() {
  const { t } = useTheme();
  const { id } = useParams<{ id: string }>();
  const { data: client } = useClient(id);
  const { data: loans = [] } = useLoans();

  if (!client) return <div style={{ color: t.ink3 }}>Loading…</div>;

  const clientLoans = loans.filter((l) => l.client_id === client.id);
  const exposure = clientLoans.reduce((s, l) => s + Number(l.amount), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card pad={20}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 56, height: 56, borderRadius: 28, background: t.petrol, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800 }}>
            {client.name.split(" ").map(n => n[0]).slice(0, 2).join("")}
          </div>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: t.ink, margin: 0 }}>{client.name}</h1>
            <div style={{ fontSize: 13, color: t.ink3 }}>{client.email} · {client.phone} · {client.city}</div>
          </div>
          <div style={{ marginLeft: "auto" }}><Pill>{client.tier}</Pill></div>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <KPI label="Exposure" value={QC_FMT.short(exposure)} />
        <KPI label="Active loans" value={clientLoans.length} />
        <KPI label="FICO" value={client.fico ?? "—"} />
        <KPI label="Funded" value={QC_FMT.short(Number(client.funded_total))} />
      </div>

      <Card pad={16}>
        <SectionLabel>Loans</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {clientLoans.map((l) => (
            <Link key={l.id} href={`/loans/${l.id}`} style={{ display: "flex", gap: 10, padding: "10px 12px", borderRadius: 10, border: `1px solid ${t.line}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: t.ink3, width: 80 }}>{l.deal_id}</div>
              <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: t.ink }}>{l.address}</div>
              <Pill>{l.type.replace("_", " ")}</Pill>
              <div style={{ fontWeight: 700, fontFeatureSettings: '"tnum"' }}>{QC_FMT.short(Number(l.amount))}</div>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
