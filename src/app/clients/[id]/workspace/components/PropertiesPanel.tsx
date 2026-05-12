"use client";

// Properties tab — extracted from the original inline implementation
// in workspace/page.tsx. Properties stays as a tab in v2 alongside
// Deals (deals are transaction paths; properties are addresses).

import Link from "next/link";
import { useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, KPI, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import {
  useClientProperties,
  useCreateClientProperty,
  useDeleteClientProperty,
  useLoans,
  type ClientProperty,
} from "@/hooks/useApi";
import { AddPropertyModal } from "@/components/AddPropertyModal";
import type { Client } from "@/lib/types";

export function PropertiesPanel({ clientId, client }: { clientId: string; client: Client }) {
  const { t } = useTheme();
  const { data: properties = [], isLoading } = useClientProperties(clientId);
  const create = useCreateClientProperty(clientId);
  const del = useDeleteClientProperty(clientId);
  const { data: loans = [] } = useLoans();
  const clientLoans = loans.filter((l) => l.client_id === clientId);
  const [addOpen, setAddOpen] = useState(false);

  const ctype = client.realtor_profile?.client_type;
  const clientSide: "buyer" | "seller" | "both" =
    ctype === "seller" ? "seller" : ctype === "buyer_and_seller" ? "both" : "buyer";

  const profile = (client.realtor_profile as Record<string, unknown> | null | undefined) ?? {};
  const bp = profile.buyer_profile as Record<string, unknown> | undefined;
  const sp = profile.seller_profile as Record<string, unknown> | undefined;
  const buyerTargetFromAI = bp && (bp.target_property_type || bp.target_location || bp.target_budget);
  const sellerListingFromAI = sp && (sp.property_address || sp.desired_list_price);
  const showAIFallback = properties.length === 0 && (buyerTargetFromAI || sellerListingFromAI);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <SectionLabel>Properties · {properties.length}</SectionLabel>
        <button
          onClick={() => setAddOpen(true)}
          style={{
            marginLeft: "auto",
            padding: "8px 14px",
            fontSize: 12,
            fontWeight: 700,
            borderRadius: 8,
            border: "none",
            background: t.brand,
            color: t.inverse,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Icon name="plus" size={12} /> Add property
        </button>
      </div>

      {isLoading ? <Card pad={20}><div style={{ color: t.ink3, fontSize: 13 }}>Loading…</div></Card> : null}

      {!isLoading && properties.length === 0 && !showAIFallback && clientLoans.length === 0 ? (
        <Card pad={20}>
          <div style={{ fontSize: 13, color: t.ink3 }}>
            No properties yet. Click <strong>Add property</strong> above, or let the AI capture
            criteria as you chat with the client.
          </div>
        </Card>
      ) : null}

      {properties.map((p) => (
        <RealPropertyCard
          key={p.id}
          p={p}
          t={t}
          onArchive={() => {
            if (confirm("Archive this property?")) del.mutate(p.id);
          }}
        />
      ))}

      {showAIFallback && buyerTargetFromAI ? (
        <AIFallbackCard
          t={t}
          title="Buyer target criteria (from AI chat)"
          rows={[
            ["Type", String(bp!.target_property_type || "—").replace(/_/g, " ")],
            ["Location", String(bp!.target_location || "—")],
            ["Budget", bp!.target_budget ? `$${Number(bp!.target_budget).toLocaleString()}` : "—"],
            ["Timeline", String(bp!.purchase_timeline || "—").replace(/_/g, "–")],
            ["Financing", bp!.financing_needed === true ? "Financing" : bp!.financing_needed === false ? "Cash" : "—"],
          ]}
        />
      ) : null}
      {showAIFallback && sellerListingFromAI ? (
        <AIFallbackCard
          t={t}
          title="Listing (from AI chat)"
          rows={[
            ["Address", String(sp!.property_address || "—")],
            ["Type", String(sp!.property_type || "—").replace(/_/g, " ")],
            ["List price", sp!.desired_list_price ? `$${Number(sp!.desired_list_price).toLocaleString()}` : "—"],
            ["Timeline", String(sp!.selling_timeline || "—").replace(/_/g, "–")],
          ]}
        />
      ) : null}

      {clientLoans.map((l) => (
        <Link key={l.id} href={`/loans/${l.id}`} style={{ textDecoration: "none" }}>
          <Card pad={16}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Icon name="file" size={16} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: t.ink }}>
                  {l.address || l.deal_id || "(unnamed loan)"}
                </div>
                <div style={{ fontSize: 12, color: t.ink3 }}>
                  Loan · {l.stage} · ${Number(l.amount || 0).toLocaleString()}
                </div>
              </div>
              <Icon name="chevR" size={14} />
            </div>
          </Card>
        </Link>
      ))}

      {addOpen ? (
        <AddPropertyModal
          clientSide={clientSide}
          onSubmit={(body) => create.mutateAsync(body)}
          onClose={() => setAddOpen(false)}
        />
      ) : null}
    </div>
  );
}

function RealPropertyCard({
  p,
  t,
  onArchive,
}: {
  p: ClientProperty;
  t: ReturnType<typeof useTheme>["t"];
  onArchive: () => void;
}) {
  const headline = p.address || `${p.city ?? ""}${p.state ? `, ${p.state}` : ""}` || "(no address)";
  const sideLabel = p.side === "buyer_target" ? "Buyer target" : "Seller listing";
  const price = p.list_price || p.target_price || p.sold_price;
  const priceLabel = p.side === "seller_listing" ? "List price" : "Target price";

  return (
    <Card pad={16}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <Pill bg={t.brandSoft} color={t.brand}>{sideLabel}</Pill>
        <Pill>{p.status}</Pill>
        <span style={{ fontSize: 14, fontWeight: 700, color: t.ink, flex: 1 }}>{headline}</span>
        <button
          onClick={onArchive}
          style={{
            background: "transparent",
            border: `1px solid ${t.line}`,
            padding: "4px 8px",
            borderRadius: 4,
            color: t.danger,
            cursor: "pointer",
            fontSize: 11,
          }}
        >
          Archive
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
        {p.property_type ? <KPI label="Type" value={p.property_type.replace(/_/g, " ")} /> : null}
        {price ? <KPI label={priceLabel} value={`$${Number(price).toLocaleString()}`} /> : null}
        {p.bedrooms ? <KPI label="Beds" value={String(p.bedrooms)} /> : null}
        {p.bathrooms ? <KPI label="Baths" value={String(p.bathrooms)} /> : null}
        {p.sqft ? <KPI label="Sq ft" value={Number(p.sqft).toLocaleString()} /> : null}
        {p.units ? <KPI label="Units" value={String(p.units)} /> : null}
      </div>
      {p.notes ? (
        <div style={{ marginTop: 10, fontSize: 12, color: t.ink3, fontStyle: "italic" }}>{p.notes}</div>
      ) : null}
    </Card>
  );
}

function AIFallbackCard({
  t,
  title,
  rows,
}: {
  t: ReturnType<typeof useTheme>["t"];
  title: string;
  rows: [string, string][];
}) {
  return (
    <Card pad={16} style={{ borderLeft: `3px solid ${t.petrol}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Icon name="spark" size={13} />
        <SectionLabel>{title}</SectionLabel>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
        {rows.map(([k, v]) => (
          <KPI key={k} label={k} value={v} />
        ))}
      </div>
    </Card>
  );
}
