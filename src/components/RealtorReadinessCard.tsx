"use client";

// Client Readiness Map — renders the Realtor Client Intelligence
// Profile (alembic 0030) on /clients/[id]. Buyer or seller flavor
// based on profile.client_type. Shows the readiness bar, KNOWN
// facts, MISSING gaps, and the AI's next-best-action.
//
// Mirrored on mobile in /home/ubuntu/QCMobile/src/components/RealtorReadinessCard.tsx.

import type { RealtorClientProfile } from "@/lib/types";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";

interface Props {
  profile: RealtorClientProfile;
  onOpenChat?: () => void;
}

export function RealtorReadinessCard({ profile, onOpenChat }: Props) {
  const { t } = useTheme();
  const score = profile.readiness_score ?? 0;
  const ctype = profile.client_type;
  const headline =
    ctype === "buyer" ? "Buyer Readiness"
    : ctype === "seller" ? "Listing Readiness"
    : ctype === "buyer_and_seller" ? "Client Readiness (buyer + seller)"
    : "Client Readiness";

  const known = collectKnown(profile);
  const missing = profile.missing_facts ?? [];
  const nextAction = profile.next_best_action;
  const nextQuestion = profile.next_best_question;

  return (
    <Card pad={16}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <SectionLabel>{headline}</SectionLabel>
        <span style={{
          fontSize: 13, fontWeight: 800, color: t.ink,
          fontFeatureSettings: '"tnum"',
        }}>
          {score}%
        </span>
        <RelationshipPill t={t} stage={profile.relationship_stage} />
      </div>

      {/* Progress bar */}
      <div style={{
        height: 8, borderRadius: 4, background: t.surface2,
        border: `1px solid ${t.line}`, overflow: "hidden", marginBottom: 12,
      }}>
        <div style={{
          height: "100%", width: `${score}%`,
          background: score >= 70 ? t.profit : score >= 40 ? t.brand : t.warn,
          transition: "width 0.3s ease",
        }} />
      </div>

      {profile.intent_summary && (
        <div style={{
          padding: "8px 12px", borderRadius: 8,
          background: t.brandSoft, color: t.ink2,
          fontSize: 12.5, lineHeight: 1.45, marginBottom: 12,
        }}>
          {profile.intent_summary}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* KNOWN */}
        <div>
          <div style={{
            fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2,
            textTransform: "uppercase", color: t.ink3, marginBottom: 6,
          }}>
            Known
          </div>
          {known.length === 0 ? (
            <div style={{ fontSize: 12, color: t.ink3, fontStyle: "italic" }}>
              Nothing captured yet — talk to your AI Secretary about this client to start filling this in.
            </div>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
              {known.map((line, i) => (
                <li key={i} style={{ fontSize: 12.5, color: t.ink2, lineHeight: 1.45 }}>
                  <span style={{ color: t.profit, marginRight: 6 }}>✓</span>
                  {line}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* MISSING */}
        <div>
          <div style={{
            fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2,
            textTransform: "uppercase", color: t.ink3, marginBottom: 6,
          }}>
            Missing
          </div>
          {missing.length === 0 ? (
            <div style={{ fontSize: 12, color: t.profit, fontWeight: 700 }}>
              All known — ready to advance.
            </div>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
              {missing.map((field) => (
                <li key={field} style={{ fontSize: 12.5, color: t.ink2, lineHeight: 1.45 }}>
                  <span style={{ color: t.warn, marginRight: 6 }}>•</span>
                  {prettifyField(field)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {(nextQuestion || nextAction) && (
        <div style={{
          marginTop: 14, padding: "10px 12px",
          borderRadius: 9, border: `1px dashed ${t.line}`,
          background: t.surface2,
        }}>
          <div style={{
            fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2,
            textTransform: "uppercase", color: t.ink3, marginBottom: 4,
          }}>
            Next best {nextAction ? "action" : "question"}
          </div>
          <div style={{ fontSize: 12.5, color: t.ink, lineHeight: 1.5 }}>
            {nextAction || nextQuestion}
          </div>
        </div>
      )}

      {onOpenChat && (
        <button
          onClick={onOpenChat}
          style={{
            marginTop: 12,
            padding: "8px 12px", borderRadius: 9,
            background: t.brand, color: t.inverse, border: "none",
            fontSize: 12.5, fontWeight: 700, cursor: "pointer",
            display: "inline-flex", alignItems: "center", gap: 6,
          }}
        >
          <Icon name="chat" size={12} /> Open AI thread for this client
        </button>
      )}
    </Card>
  );
}

function RelationshipPill({
  t,
  stage,
}: {
  t: ReturnType<typeof useTheme>["t"];
  stage: RealtorClientProfile["relationship_stage"];
}) {
  const labelMap: Record<RealtorClientProfile["relationship_stage"], string> = {
    new_lead: "New lead",
    contacted: "Contacted",
    needs_discovery: "Discovery",
    agreement_pending: "Agreement pending",
    active_client: "Active",
    finance_ready: "Finance ready",
    handoff_to_lending: "Handed off",
    under_contract: "Under contract",
    closed: "Closed",
    lost: "Lost",
  };
  const positive = stage === "active_client" || stage === "finance_ready" || stage === "handoff_to_lending" || stage === "under_contract" || stage === "closed";
  const danger = stage === "lost";
  return (
    <Pill
      bg={danger ? t.dangerBg : positive ? t.profitBg : t.surface2}
      color={danger ? t.danger : positive ? t.profit : t.ink3}
    >
      {labelMap[stage] ?? stage}
    </Pill>
  );
}

function collectKnown(profile: RealtorClientProfile): string[] {
  const out: string[] = [];
  const bp = profile.buyer_profile;
  if (bp) {
    if (bp.target_property_type) out.push(`Looking for ${humanize(bp.target_property_type)}`);
    if (bp.target_location) out.push(`Target: ${bp.target_location}`);
    if (bp.target_budget) out.push(`Budget ~$${bp.target_budget.toLocaleString("en-US")}`);
    if (bp.target_budget_range)
      out.push(`Budget range $${bp.target_budget_range.low.toLocaleString("en-US")}–$${bp.target_budget_range.high.toLocaleString("en-US")}`);
    if (bp.purchase_timeline) out.push(`Timeline: ${humanizeTimeline(bp.purchase_timeline)}`);
    if (bp.financing_needed === true) out.push("Financing needed");
    if (bp.financing_needed === false) out.push("Cash buyer (no financing)");
    if (bp.buyer_agreement_status === "signed") out.push("Buyer agency agreement signed");
    if (bp.buyer_agreement_status === "sent") out.push("Buyer agreement sent (awaiting signature)");
    if (bp.prequalified) out.push("Prequalified");
    if (bp.proof_of_funds_status === "received") out.push("Proof of funds received");
  }
  const sp = profile.seller_profile;
  if (sp) {
    if (sp.property_address) out.push(`Listing: ${sp.property_address}`);
    if (sp.desired_list_price) out.push(`List price ~$${sp.desired_list_price.toLocaleString("en-US")}`);
    if (sp.listing_agreement_status === "signed") out.push("Listing agreement signed");
    if (sp.listing_agreement_status === "sent") out.push("Listing agreement sent");
    if (sp.cma_status === "complete") out.push("CMA complete");
    if (sp.cma_status === "in_progress") out.push("CMA in progress");
    if (sp.photos_status === "complete") out.push("Photos complete");
    if (sp.photos_status === "scheduled") out.push("Picture day scheduled");
    if (sp.occupancy_status) out.push(`Occupancy: ${humanize(sp.occupancy_status)}`);
  }
  // Pull a few key known_facts too.
  for (const f of profile.known_facts ?? []) {
    out.push(`${humanize(f.field)}: ${f.value}`);
  }
  return out;
}

function humanize(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function humanizeTimeline(t: string): string {
  switch (t) {
    case "asap": return "ASAP";
    case "0_30": return "0–30 days";
    case "30_60": return "30–60 days";
    case "60_plus": return "60+ days";
    default: return t;
  }
}

function prettifyField(field: string): string {
  // "buyer.target_property_type" → "Target property type"
  // "seller.cma_status" → "CMA status"
  // "client_type" → "Client type"
  const tail = field.split(".").pop() ?? field;
  if (tail.toLowerCase() === "cma_status") return "CMA status";
  return humanize(tail);
}
