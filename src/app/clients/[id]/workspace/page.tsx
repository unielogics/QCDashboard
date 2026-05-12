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
import { useUI } from "@/store/ui";
import { Card, KPI, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import {
  useAddAgentNote,
  useClient,
  useClientAIPlan,
  useClientProperties,
  useCreateClientProperty,
  useDeleteClientProperty,
  useDocumentsForClient,
  useEngagement,
  useFindOrCreateChatThread,
  useLoans,
  useLogClientEngagement,
  useMarkClientFinanceReady,
  useRequestPrequalification,
  useSendBuyerAgreement,
  useSendListingAgreement,
  type ClientProperty,
} from "@/hooks/useApi";
import { ClientAIPlanCard } from "@/components/ClientAIPlanCard";
import { RealtorReadinessCard } from "@/components/RealtorReadinessCard";
import { ClientAuditTrail } from "@/components/ClientAuditTrail";
import { AddPropertyModal } from "@/components/AddPropertyModal";
import { StageStepper } from "@/components/StageStepper";
import { FollowUpRhythmModal } from "./components/FollowUpRhythmModal";
import type { FollowUpSettings } from "@/components/FollowUpEditor";
import type { Client } from "@/lib/types";
import type { ClientStage } from "@/lib/enums.generated";


// Pull the per-client follow_up override out of the JSONB blob.
// Tolerant: returns null when the blob is missing, not an object, or
// doesn't contain a follow_up key.
function extractFollowUp(raw: unknown): FollowUpSettings | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const fu = r.follow_up;
  if (!fu || typeof fu !== "object") return null;
  return fu as FollowUpSettings;
}

function hasFollowUpOverride(raw: unknown): boolean {
  const fu = extractFollowUp(raw);
  if (!fu) return false;
  return Object.values(fu).some((v) => v !== null && v !== undefined);
}


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
  const setAiOpen = useUI((s) => s.setAiOpen);
  const [tab, setTab] = useState<TabId>("overview");
  const [busy, setBusy] = useState<string | null>(null);
  const [followUpOpen, setFollowUpOpen] = useState(false);

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
    // Pre-warm the per-client thread so the AIChatPanel pops open with
    // the right context already prepared. Then flip the global aiOpen
    // bit; the panel mounted in TopBar shows the side drawer with the
    // freshly-resolved thread at the top of its sidebar.
    setBusy("chat");
    try {
      await findOrCreate.mutateAsync({ client_id: id, loan_id: null });
      setAiOpen(true);
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
            <button
              onClick={() => setFollowUpOpen(true)}
              disabled={busy !== null}
              style={btnSecondary(t)}
              title="Configure how often the AI Realtor nudges this lead if they go quiet"
            >
              <Icon name="cal" size={13} /> Follow-up rhythm
              {hasFollowUpOverride(client.ai_cadence_override) ? (
                <span style={{
                  marginLeft: 4, fontSize: 9.5, fontWeight: 800,
                  padding: "1px 5px", borderRadius: 999,
                  background: t.brandSoft, color: t.brand,
                  textTransform: "uppercase", letterSpacing: 0.3,
                }}>
                  override
                </span>
              ) : null}
            </button>
            {client.stage === "lead" && client.lead_promotion_status !== "agent_requested_review" ? (
              <button onClick={onMarkReady} disabled={busy !== null} style={btnPrimary(t)}>
                <Icon name="bolt" size={13} /> {busy === "ready" ? "Marking…" : "Mark Ready for Lending"}
              </button>
            ) : null}
          </div>
        </div>
      </Card>

      <FollowUpRhythmModal
        open={followUpOpen}
        onClose={() => setFollowUpOpen(false)}
        clientId={id}
        value={extractFollowUp(client.ai_cadence_override)}
        cadenceOverride={(client.ai_cadence_override ?? null) as Record<string, unknown> | null}
      />

      {/* Stage pipeline — visual horizontal stepper */}
      <StageStepper clientId={id} currentStage={client.stage as ClientStage} />

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


function PropertiesTab({ clientId, client }: { clientId: string; client: Client }) {
  const { t } = useTheme();
  const { data: properties = [], isLoading } = useClientProperties(clientId);
  const create = useCreateClientProperty(clientId);
  const del = useDeleteClientProperty(clientId);
  const { data: loans = [] } = useLoans();
  const clientLoans = loans.filter(l => l.client_id === clientId);
  const [addOpen, setAddOpen] = useState(false);

  const ctype = client.realtor_profile?.client_type;
  const clientSide: "buyer" | "seller" | "both" =
    ctype === "seller" ? "seller" :
    ctype === "buyer_and_seller" ? "both" : "buyer";

  // Fall back to realtor_profile cards when no explicit properties yet —
  // gives the agent something to look at on a fresh client until they
  // add concrete addresses.
  const profile = client.realtor_profile || {};
  const bp = (profile as Record<string, unknown>).buyer_profile as Record<string, unknown> | undefined;
  const sp = (profile as Record<string, unknown>).seller_profile as Record<string, unknown> | undefined;
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
            padding: "8px 14px", fontSize: 12, fontWeight: 700,
            borderRadius: 8, border: "none",
            background: t.brand, color: t.inverse, cursor: "pointer",
            display: "inline-flex", alignItems: "center", gap: 6,
          }}
        >
          <Icon name="plus" size={12} /> Add property
        </button>
      </div>

      {isLoading ? (
        <Card pad={20}><div style={{ color: t.ink3, fontSize: 13 }}>Loading…</div></Card>
      ) : null}

      {!isLoading && properties.length === 0 && !showAIFallback && clientLoans.length === 0 ? (
        <Card pad={20}>
          <div style={{ fontSize: 13, color: t.ink3 }}>
            No properties yet. Click <strong>Add property</strong> above, or
            let the AI capture criteria as you chat with the client.
          </div>
        </Card>
      ) : null}

      {properties.map(p => (
        <RealPropertyCard
          key={p.id}
          p={p}
          t={t}
          onArchive={() => {
            if (confirm("Archive this property?")) del.mutate(p.id);
          }}
        />
      ))}

      {/* AI-captured criteria as fallback context — only shown if no
          explicit properties yet. Once the agent adds one, these
          disappear (the AI's chat continues to maintain
          realtor_profile but we stop double-rendering). */}
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

      {/* Linked loans — properties that have crossed into underwriting */}
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
  p, t, onArchive,
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
        <span style={{ fontSize: 14, fontWeight: 700, color: t.ink, flex: 1 }}>
          {headline}
        </span>
        <button
          onClick={onArchive}
          style={{
            background: "transparent", border: `1px solid ${t.line}`,
            padding: "4px 8px", borderRadius: 4, color: t.danger,
            cursor: "pointer", fontSize: 11,
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
        <div style={{ marginTop: 10, fontSize: 12, color: t.ink3, fontStyle: "italic" }}>
          {p.notes}
        </div>
      ) : null}
    </Card>
  );
}


function AIFallbackCard({
  t, title, rows,
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
        {rows.map(([k, v]) => <KPI key={k} label={k} value={v} />)}
      </div>
    </Card>
  );
}


// ── ACTIVITY ────────────────────────────────────────────────────────


function ActivityTab({ clientId }: { clientId: string }) {
  const { t } = useTheme();
  const { data: events = [], isLoading } = useEngagement(clientId);
  const log = useLogClientEngagement(clientId);
  const [composeKind, setComposeKind] = useState<string | null>(null);
  const [composeText, setComposeText] = useState("");

  async function logEvent() {
    if (!composeKind || !composeText.trim()) return;
    try {
      await log.mutateAsync({ kind: composeKind, summary: composeText.trim() });
      setComposeKind(null);
      setComposeText("");
    } catch { /* swallowed */ }
  }

  function quickAction(kind: string, label: string, icon: "phone" | "chat" | "cal" | "doc") {
    return (
      <button
        onClick={() => { setComposeKind(kind); setComposeText(""); }}
        style={{
          padding: "6px 10px", fontSize: 12, fontWeight: 600,
          borderRadius: 6, border: `1px solid ${t.line}`,
          background: composeKind === kind ? t.brandSoft : t.surface,
          color: composeKind === kind ? t.brand : t.ink,
          cursor: "pointer",
          display: "inline-flex", alignItems: "center", gap: 6,
        }}
      >
        <Icon name={icon} size={12} /> {label}
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card pad={16}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <SectionLabel>Log activity</SectionLabel>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {quickAction("call_logged", "Log call", "phone")}
          {quickAction("sms_sent", "Log SMS", "chat")}
          {quickAction("email_sent", "Log email", "doc")}
          {quickAction("meeting_held", "Log meeting", "cal")}
        </div>
        {composeKind ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <textarea
              value={composeText}
              onChange={e => setComposeText(e.target.value)}
              rows={2}
              autoFocus
              placeholder={
                composeKind === "call_logged" ? "What was discussed on the call?" :
                composeKind === "sms_sent" ? "What was the SMS about?" :
                composeKind === "email_sent" ? "Subject + brief context…" :
                "Meeting summary…"
              }
              style={{
                padding: 10, fontSize: 13, fontFamily: "inherit",
                borderRadius: 6, border: `1px solid ${t.line}`,
                background: t.surface, color: t.ink, resize: "vertical",
              }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={logEvent}
                disabled={!composeText.trim() || log.isPending}
                style={{
                  padding: "8px 14px", fontSize: 13, fontWeight: 600,
                  borderRadius: 6, border: "none",
                  background: t.brand, color: t.inverse, cursor: "pointer",
                  opacity: composeText.trim() && !log.isPending ? 1 : 0.5,
                }}
              >
                {log.isPending ? "Logging…" : "Save"}
              </button>
              <button
                onClick={() => { setComposeKind(null); setComposeText(""); }}
                style={{
                  padding: "8px 14px", fontSize: 13, fontWeight: 600,
                  borderRadius: 6, border: `1px solid ${t.line}`,
                  background: t.surface, color: t.ink, cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </Card>

      <Card pad={16}>
        <SectionLabel>Recent activity</SectionLabel>
        {isLoading ? (
          <div style={{ marginTop: 10, color: t.ink3, fontSize: 13 }}>Loading…</div>
        ) : events.length === 0 ? (
          <div style={{ marginTop: 10, color: t.ink3, fontSize: 13 }}>
            No activity logged yet. Use the buttons above to log a call,
            SMS, email, or meeting against this client.
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
                      {ev.actor_label ? ` · ${String(ev.actor_label)}` : ""}
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


function NotesTab({ clientId, client }: { clientId: string; client: Client }) {
  const { t } = useTheme();
  const addNote = useAddAgentNote(clientId);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const profile = client.realtor_profile as Record<string, unknown> | null | undefined;
  const facts = ((profile?.known_facts as Array<Record<string, unknown>> | undefined) || []).filter(
    f => f.source === "agent",
  );

  async function save() {
    if (!draft.trim()) return;
    setErr(null);
    try {
      await addNote.mutateAsync({ text: draft.trim() });
      setDraft("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save note.");
    }
  }

  return (
    <Card pad={16}>
      <SectionLabel>Agent notes</SectionLabel>
      <div style={{ fontSize: 12, color: t.ink3, margin: "6px 0 14px" }}>
        Free-form notes about this client. Anything you write here flows
        into the AI&apos;s memory on the next chat turn — when you ask the
        AI about this client tomorrow, it will reference these.
      </div>

      {/* Compose */}
      <div style={{ marginBottom: 16 }}>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={3}
          placeholder='e.g. "Marcus mentioned his preferred lender is Chase. Wants to close before Aug 1."'
          style={{
            width: "100%", padding: 10, fontSize: 13,
            borderRadius: 8, border: `1px solid ${t.line}`,
            background: t.surface, color: t.ink, fontFamily: "inherit",
            resize: "vertical",
          }}
        />
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
          <button
            onClick={save}
            disabled={!draft.trim() || addNote.isPending}
            style={{
              padding: "8px 14px", fontSize: 13, fontWeight: 600,
              borderRadius: 6, border: "none",
              background: t.brand, color: t.inverse, cursor: "pointer",
              opacity: draft.trim() && !addNote.isPending ? 1 : 0.5,
            }}
          >
            {addNote.isPending ? "Saving…" : "Save note"}
          </button>
          {err ? <span style={{ fontSize: 12, color: t.danger }}>{err}</span> : null}
        </div>
      </div>

      {/* History */}
      {facts.length === 0 ? (
        <div style={{ fontSize: 13, color: t.ink3 }}>
          No notes yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {facts.slice().reverse().map((f, i) => (
            <div key={i} style={{
              padding: 12, borderRadius: 8,
              background: t.surface2, border: `1px solid ${t.line}`,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: t.ink3, marginBottom: 4, textTransform: "uppercase" }}>
                {String(f.field || "note")}
              </div>
              <div style={{ fontSize: 13, color: t.ink, whiteSpace: "pre-wrap" }}>
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
