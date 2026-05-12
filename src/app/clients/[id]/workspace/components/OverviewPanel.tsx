"use client";

// Overview tab — extracted from the original inline implementation
// in workspace/page.tsx. Renders the AI plan card, realtor readiness,
// linked loans, quick actions, and snapshot KPIs.

import Link from "next/link";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, KPI, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import {
  useClientAIPlan,
  useLoans,
  useSendBuyerAgreement,
  useSendListingAgreement,
} from "@/hooks/useApi";
import { ClientAIPlanCard } from "@/components/ClientAIPlanCard";
import { RealtorReadinessCard } from "@/components/RealtorReadinessCard";
import type { Client } from "@/lib/types";

export function OverviewPanel({ clientId, client }: { clientId: string; client: Client }) {
  const { t } = useTheme();
  const { data: plan } = useClientAIPlan(clientId, null);
  const { data: loans = [] } = useLoans();
  const clientLoans = loans.filter((l) => l.client_id === clientId);
  const sendBuyerAgreement = useSendBuyerAgreement();
  const sendListingAgreement = useSendListingAgreement();

  const ctype = client.realtor_profile?.client_type;
  const isBuyer = ctype === "buyer" || ctype === "buyer_and_seller";
  const isSeller = ctype === "seller" || ctype === "buyer_and_seller";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 14, alignItems: "flex-start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        <ClientAIPlanCard clientId={clientId} loanId={null} />
        {client.realtor_profile && client.realtor_profile.client_type !== "unknown" ? (
          <RealtorReadinessCard profile={client.realtor_profile} />
        ) : null}

        {clientLoans.length > 0 ? (
          <Card pad={16}>
            <SectionLabel>Linked loans</SectionLabel>
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              {clientLoans.map((l) => (
                <Link
                  key={l.id}
                  href={`/loans/${l.id}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: 10,
                    borderRadius: 8,
                    background: t.surface2,
                    color: t.ink,
                    textDecoration: "none",
                    border: `1px solid ${t.line}`,
                  }}
                >
                  <Icon name="file" size={14} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>
                      {l.deal_id || "(no deal id)"}
                      {l.address ? ` · ${l.address}` : ""}
                    </div>
                    <div style={{ fontSize: 11.5, color: t.ink3 }}>
                      {l.stage} · ${Number(l.amount || 0).toLocaleString()}
                    </div>
                  </div>
                  <Icon name="chevR" size={13} />
                </Link>
              ))}
            </div>
          </Card>
        ) : null}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Card pad={16}>
          <SectionLabel>Quick actions</SectionLabel>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {isBuyer ? (
              <button
                onClick={() => sendBuyerAgreement.mutate(clientId)}
                disabled={sendBuyerAgreement.isPending}
                style={qaBtn(t)}
              >
                <Icon name="docCheck" size={13} /> Send buyer agreement
              </button>
            ) : null}
            {isSeller ? (
              <button
                onClick={() => sendListingAgreement.mutate(clientId)}
                disabled={sendListingAgreement.isPending}
                style={qaBtn(t)}
              >
                <Icon name="docCheck" size={13} /> Send listing agreement
              </button>
            ) : null}
            <button style={qaBtn(t)}>
              <Icon name="cal" size={13} /> Schedule consultation
            </button>
          </div>
        </Card>

        <Card pad={16}>
          <SectionLabel>Snapshot</SectionLabel>
          <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <KPI label="Stage" value={client.stage ?? "—"} />
            <KPI label="Tier" value={client.tier ?? "—"} />
            <KPI label="FICO" value={client.fico ? String(client.fico) : "—"} />
            <KPI label="Readiness" value={`${plan?.readiness_score ?? 0}%`} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function qaBtn(t: ReturnType<typeof useTheme>["t"]) {
  return {
    padding: "8px 10px",
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 6,
    border: `1px solid ${t.line}`,
    background: t.surface,
    color: t.ink,
    cursor: "pointer",
    textAlign: "left" as const,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  } as const;
}
