"use client";

// Agent Relationship Workspace — dedicated CRM view for one client/lead.
// Reached from /pipeline (Leads view) when an agent clicks a row.
// Replaces the older "drop into the generic /clients/[id] form" UX.
//
// Five tabs: Overview · Properties · Activity · Documents · Notes
// AI Chat is one click away (Open AI Chat button in the header).
//
// Mirrors the /loans/[id] workspace pattern but scoped to the
// pre-loan / relationship phase. Once the agent fires Ready-for-Lending,
// the loan workspace takes over.

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, KPI, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import {
  useClient,
  useClientAIPlan,
  useDocumentsForClient,
  useEngagement,
  useFindOrCreateChatThread,
  useLoans,
  useMarkClientFinanceReady,
  useRequestPrequalification,
  useSendBuyerAgreement,
  useSendListingAgreement,
} from "@/hooks/useApi";
import { ClientAIPlanCard } from "@/components/ClientAIPlanCard";
import { RealtorReadinessCard } from "@/components/RealtorReadinessCard";
import { ClientAuditTrail } from "@/components/ClientAuditTrail";
import type { Client } from "@/lib/types";


type TabId = "overview" | "properties" | "activity" | "documents" | "notes";

const TABS: { id: TabId; label: string; icon: "home" | "vault" | "trend" | "doc" | "chat" }[] = [
  { id: "overview", label: "Overview", icon: "home" },
  { id: "properties", label: "Properties", icon: "vault" },
  { id: "activity", label: "Activity", icon: "trend" },
  { id: "documents", label: "Documents", icon: "doc" },
  { id: "notes", label: "Notes", icon: "chat" },
];


export default function ClientWorkspacePage() {
  const { t } = useTheme();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { data: client } = useClient(id);
  const findOrCreate = useFindOrCreateChatThread();
  const requestPrequal = useRequestPrequalification();
  const markReady = useMarkClientFinanceReady();
  const [tab, setTab] = useState<TabId>("overview");
  const [busy, setBusy] = useState<string | null>(null);

  if (!client) {
    return <div style={{ padding: 24, color: t.ink3, fontSize: 13 }}>Loading…</div>;
  }

  const ctype = client.realtor_profile?.client_type;
  const leadKind =
    ctype === "buyer" ? "Buyer Lead"
    : ctype === "seller" ? "Seller Lead"
    : ctype === "buyer_and_seller" ? "Buyer + Seller Lead"
    : "Lead";

  async function openChat() {
    setBusy("chat");
    try {
      const thread = await findOrCreate.mutateAsync({ client_id: id, loan_id: null });
      router.push(`/messages?thread=${thread.id}`);
    } finally { setBusy(null); }
  }

  async function onMarkReady() {
    if (!confirm("Mark this client as ready for lending? The funding team will pick it up.")) return;
    setBusy("ready");
    try { await markReady.mutateAsync(id); } finally { setBusy(null); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Back to pipeline */}
      <div>
        <Link
          href="/pipeline"
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 12, fontWeight: 600, color: t.ink3,
            textDecoration: "none",
            padding: "4px 8px", borderRadius: 6,
            border: `1px solid ${t.line}`, background: t.surface,
          }}
        >
          <Icon name="chevL" size={11} /> Pipeline
        </Link>
      </div>

      {/* Header — avatar, name, contact, primary actions */}
      <Card pad={20}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{
            width: 56, height: 56, borderRadius: 28,
            background: client.avatar_color ?? t.petrol, color: "#fff",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, fontWeight: 800, flexShrink: 0,
          }}>
            {client.name.split(" ").map(n => n[0]).slice(0, 2).join("")}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: t.ink, margin: 0 }}>
                {client.name}
              </h1>
              <Pill bg={t.brandSoft} color={t.brand}>{leadKind}</Pill>
              <Pill>{client.tier}</Pill>
            </div>
            <div style={{ fontSize: 13, color: t.ink3, marginTop: 2 }}>
              {client.email ?? "No email"} · {client.phone ?? "No phone"} · {client.city ?? "—"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {client.phone ? (
              <a
                href={`tel:${client.phone}`}
                style={btnSecondary(t)}
              >
                <Icon name="phone" size={13} /> Call
              </a>
            ) : null}
            <button onClick={openChat} disabled={busy !== null} style={btnSecondary(t)}>
              <Icon name="chat" size={13} /> {busy === "chat" ? "Opening…" : "Open AI Chat"}
            </button>
            {client.stage === "lead" && client.lead_promotion_status !== "agent_requested_review" ? (
              <button onClick={onMarkReady} disabled={busy !== null} style={btnPrimary(t)}>
                <Icon name="bolt" size={13} /> {busy === "ready" ? "Marking…" : "Mark Ready for Lending"}
              </button>
            ) : null}
          </div>
        </div>
      </Card>

      {/* Tab strip */}
      <div style={{
        display: "flex", gap: 4,
        borderBottom: `1px solid ${t.line}`, paddingBottom: 0,
        flexWrap: "wrap",
      }}>
        {TABS.map(x => (
          <button
            key={x.id}
            onClick={() => setTab(x.id)}
            style={{
              padding: "10px 14px", fontSize: 13, fontWeight: 600,
              border: "none", background: "transparent",
              color: tab === x.id ? t.ink : t.ink3,
              borderBottom: `2px solid ${tab === x.id ? t.petrol : "transparent"}`,
              cursor: "pointer", marginBottom: -1,
              display: "inline-flex", alignItems: "center", gap: 6,
            }}
          >
            <Icon name={x.icon} size={13} />
            {x.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? <OverviewTab clientId={id} client={client} /> : null}
      {tab === "properties" ? <PropertiesTab clientId={id} client={client} /> : null}
      {tab === "activity" ? <ActivityTab clientId={id} /> : null}
      {tab === "documents" ? <DocumentsTab clientId={id} /> : null}
      {tab === "notes" ? <NotesTab clientId={id} client={client} /> : null}
    </div>
  );
}


// ── OVERVIEW ────────────────────────────────────────────────────────


function OverviewTab({ clientId, client }: { clientId: string; client: Client }) {
  const { t } = useTheme();
  const { data: plan } = useClientAIPlan(clientId, null);
  const { data: loans = [] } = useLoans();
  const clientLoans = loans.filter(l => l.client_id === clientId);
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
              {clientLoans.map(l => (
                <Link
                  key={l.id}
                  href={`/loans/${l.id}`}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: 10, borderRadius: 8,
                    background: t.surface2, color: t.ink,
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

      {/* Sidebar: quick actions + KPIs */}
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


// ── PROPERTIES ──────────────────────────────────────────────────────


function PropertiesTab({ client }: { clientId: string; client: Client }) {
  const { t } = useTheme();
  const { data: loans = [] } = useLoans();
  const clientLoans = loans.filter(l => l.client_id === client.id);

  const profile = client.realtor_profile || {};
  const buyerProfile = (profile as Record<string, unknown>).buyer_profile as Record<string, unknown> | undefined;
  const sellerProfile = (profile as Record<string, unknown>).seller_profile as Record<string, unknown> | undefined;

  // Buyer "target" property — what the buyer is looking for (criteria, not a specific address yet)
  const buyerTarget = buyerProfile && (buyerProfile.target_property_type || buyerProfile.target_location || buyerProfile.target_budget) ? {
    title: "Buyer target criteria",
    type: String(buyerProfile.target_property_type || "—").replace(/_/g, " "),
    location: String(buyerProfile.target_location || "—"),
    budget: buyerProfile.target_budget ? `$${Number(buyerProfile.target_budget).toLocaleString()}` : "—",
    timeline: String(buyerProfile.purchase_timeline || "—").replace(/_/g, "–"),
    financing: buyerProfile.financing_needed === true ? "Financing" : buyerProfile.financing_needed === false ? "Cash" : "—",
    address: null as string | null,
  } : null;

  // Seller property — concrete listing
  const sellerListing = sellerProfile && (sellerProfile.property_address || sellerProfile.desired_list_price) ? {
    title: "Listing",
    type: String(sellerProfile.property_type || "—").replace(/_/g, " "),
    location: String(sellerProfile.property_address || "—"),
    budget: sellerProfile.desired_list_price ? `$${Number(sellerProfile.desired_list_price).toLocaleString()}` : "—",
    timeline: String(sellerProfile.selling_timeline || "—").replace(/_/g, "–"),
    financing: "—",
    address: String(sellerProfile.property_address || ""),
  } : null;

  const hasAny = buyerTarget || sellerListing || clientLoans.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {!hasAny ? (
        <Card pad={20}>
          <div style={{ fontSize: 13, color: t.ink3 }}>
            No properties or target criteria captured yet. As you talk with the
            client, the AI will fill these in via the chat — or you can add
            properties manually below.
          </div>
        </Card>
      ) : null}

      {buyerTarget ? <PropertyCard p={buyerTarget} t={t} /> : null}
      {sellerListing ? <PropertyCard p={sellerListing} t={t} /> : null}

      {/* Loans — concrete properties the AI is already underwriting */}
      {clientLoans.map(l => (
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

      <button
        onClick={() => alert("Manual property add — coming next. For now, criteria are captured by the AI from chat.")}
        style={{
          padding: "10px 14px", fontSize: 13, fontWeight: 600,
          borderRadius: 8, border: `1px dashed ${t.line}`,
          background: "transparent", color: t.ink3, cursor: "pointer",
          alignSelf: "flex-start",
        }}
      >
        + Add property manually
      </button>
    </div>
  );
}


function PropertyCard({
  p, t,
}: {
  p: { title: string; type: string; location: string; budget: string; timeline: string; financing: string; address: string | null };
  t: ReturnType<typeof useTheme>["t"];
}) {
  return (
    <Card pad={16}>
      <SectionLabel>{p.title}</SectionLabel>
      <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        <KPI label="Type" value={p.type} />
        <KPI label={p.address ? "Address" : "Location"} value={p.location} />
        <KPI label={p.address ? "List price" : "Budget"} value={p.budget} />
        <KPI label="Timeline" value={p.timeline} />
        {p.financing !== "—" ? <KPI label="Financing" value={p.financing} /> : null}
      </div>
    </Card>
  );
}


// ── ACTIVITY ────────────────────────────────────────────────────────


function ActivityTab({ clientId }: { clientId: string }) {
  const { t } = useTheme();
  const { data: events = [], isLoading } = useEngagement(clientId);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card pad={16}>
        <SectionLabel>Recent activity</SectionLabel>
        {isLoading ? (
          <div style={{ marginTop: 10, color: t.ink3, fontSize: 13 }}>Loading…</div>
        ) : events.length === 0 ? (
          <div style={{ marginTop: 10, color: t.ink3, fontSize: 13 }}>
            No activity logged yet. As the AI chats with this client and as
            you log calls / send messages, events will land here.
          </div>
        ) : (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            {events.map((e, i: number) => {
              const ev = e as unknown as Record<string, unknown>;
              return (
                <div key={i} style={{
                  display: "flex", gap: 10, alignItems: "flex-start",
                  padding: "10px 0", borderBottom: `1px solid ${t.line}`,
                }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                    background: t.surface2, color: t.ink2, textTransform: "uppercase",
                    fontFamily: "monospace",
                  }}>
                    {String(ev.kind || "event")}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: t.ink }}>
                      {String(ev.summary || ev.title || "—")}
                    </div>
                    <div style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>
                      {ev.created_at ? new Date(String(ev.created_at)).toLocaleString() : ""}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Audit trail — filtered to this client. Phase 7 surface. */}
      <ClientAuditTrail clientId={clientId} limit={50} />
    </div>
  );
}


// ── DOCUMENTS ───────────────────────────────────────────────────────


function DocumentsTab({ clientId }: { clientId: string }) {
  const { t } = useTheme();
  const { data: docs = [], isLoading } = useDocumentsForClient(clientId);

  return (
    <Card pad={16}>
      <SectionLabel>Client documents</SectionLabel>
      {isLoading ? (
        <div style={{ marginTop: 10, color: t.ink3 }}>Loading…</div>
      ) : docs.length === 0 ? (
        <div style={{ marginTop: 10, fontSize: 13, color: t.ink3 }}>
          No documents on file yet. Documents the borrower uploads in chat will
          appear here.
        </div>
      ) : (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          {docs.map(d => (
            <div key={d.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: 10, borderRadius: 8,
              background: t.surface2, border: `1px solid ${t.line}`,
            }}>
              <Icon name="doc" size={14} />
              <div style={{ flex: 1, fontSize: 13, color: t.ink, fontWeight: 600 }}>
                {d.name}
              </div>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                background: t.chip, color: t.ink2, textTransform: "uppercase",
              }}>
                {d.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}


// ── NOTES ───────────────────────────────────────────────────────────


function NotesTab({ client }: { clientId: string; client: Client }) {
  const { t } = useTheme();
  // Surface known_facts where source=agent — these are the agent's own
  // notes captured by the AI during conversation.
  const profile = client.realtor_profile as Record<string, unknown> | null | undefined;
  const facts = ((profile?.known_facts as Array<Record<string, unknown>> | undefined) || []).filter(
    f => f.source === "agent",
  );

  return (
    <Card pad={16}>
      <SectionLabel>Agent notes</SectionLabel>
      <div style={{ fontSize: 12, color: t.ink3, margin: "6px 0 14px" }}>
        Free-form notes captured by the AI during your conversations,
        plus anything you want the AI to remember about this client. Edit
        the AI&apos;s per-client custom instructions on the Overview tab
        (Client AI Plan card → Custom Instructions).
      </div>

      {facts.length === 0 ? (
        <div style={{ fontSize: 13, color: t.ink3 }}>
          No notes captured yet. As you chat with the AI about this
          client, anything you tell it will surface here.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {facts.map((f, i) => (
            <div key={i} style={{
              padding: 12, borderRadius: 8,
              background: t.surface2, border: `1px solid ${t.line}`,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: t.ink3, marginBottom: 4, textTransform: "uppercase" }}>
                {String(f.field || "note")}
              </div>
              <div style={{ fontSize: 13, color: t.ink }}>
                {String(f.value || "")}
              </div>
              {f.captured_at ? (
                <div style={{ fontSize: 11, color: t.ink3, marginTop: 4 }}>
                  {new Date(String(f.captured_at)).toLocaleString()}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}


// ── shared button styles ────────────────────────────────────────────


function btnPrimary(t: ReturnType<typeof useTheme>["t"]) {
  return {
    padding: "8px 12px", fontSize: 12, fontWeight: 700,
    borderRadius: 8, border: "none",
    background: t.brand, color: t.inverse, cursor: "pointer",
    display: "inline-flex", alignItems: "center", gap: 6,
    textDecoration: "none",
  } as const;
}


function btnSecondary(t: ReturnType<typeof useTheme>["t"]) {
  return {
    padding: "8px 12px", fontSize: 12, fontWeight: 700,
    borderRadius: 8, border: `1px solid ${t.line}`,
    background: t.surface, color: t.ink, cursor: "pointer",
    display: "inline-flex", alignItems: "center", gap: 6,
    textDecoration: "none",
  } as const;
}


function qaBtn(t: ReturnType<typeof useTheme>["t"]) {
  return {
    padding: "8px 10px", fontSize: 12, fontWeight: 600,
    borderRadius: 6, border: `1px solid ${t.line}`,
    background: t.surface, color: t.ink, cursor: "pointer",
    textAlign: "left" as const,
    display: "inline-flex", alignItems: "center", gap: 6,
  } as const;
}
