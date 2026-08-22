"use client";

// Client Readiness Map — renders the Realtor Client Intelligence
// Profile (alembic 0030) on /clients/[id]. Buyer or seller flavor
// based on profile.client_type. Shows the readiness bar, KNOWN
// facts, MISSING gaps, and the AI's next-best-action.
//
// Mirrored on mobile in /home/ubuntu/QCMobile/src/components/RealtorReadinessCard.tsx.
//
// Restyled onto the plain-CSS design system: the card is a `.panel` whose
// header carries the score and the relationship chip, the readiness bar is
// `.track`/`.fill`, the intent summary and the next-best-action are
// `.callout`s, and the two lists sit on `.grid.cols-auto` so they collapse to
// one column on a narrow rail instead of squeezing to 1fr/1fr. The two
// colours still written inline are data-derived — see the comments.

import type { RealtorClientProfile } from "@/lib/types";
import { Icon } from "@/components/design-system/Icon";
import {
  Btn,
  Callout,
  CellChip,
  Panel,
  StatusLine,
  Sub,
  type ChipTone,
} from "@/components/ds";

interface Props {
  profile: RealtorClientProfile;
  onOpenChat?: () => void;
}

export function RealtorReadinessCard({ profile, onOpenChat }: Props) {
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
    <Panel
      title={headline}
      actions={
        <>
          <b className="num">{score}%</b>
          <RelationshipChip stage={profile.relationship_stage} />
        </>
      }
    >
      {/* Progress bar. Both the width and the fill tint are read off the
          score, so they stay inline; `.track`/`.fill` own everything else. */}
      <div className="track">
        <div
          className="fill"
          style={{
            width: `${score}%`,
            background:
              score >= 70 ? "var(--ok)" : score >= 40 ? "var(--accent)" : "var(--warn)",
            transition: "width 0.3s ease",
          }}
        />
      </div>

      {profile.intent_summary && (
        <Callout tone="acc" className="mt">
          {profile.intent_summary}
        </Callout>
      )}

      <div className="grid cols-auto mt">
        {/* KNOWN */}
        <div>
          <div className="lbl mb">Known</div>
          {known.length === 0 ? (
            <Sub>
              <em>Nothing captured yet — talk to Elara about this client to start filling this in.</em>
            </Sub>
          ) : (
            <ul className="grid g4">
              {known.map((line, i) => (
                <li className="sub" key={i}>
                  {/* Tone is the column's meaning, not the glyph's: a captured
                      fact is a positive. No chip class fits an inline marker
                      without turning it into a pill. */}
                  <span style={{ color: "var(--ok)", marginRight: 6 }}>✓</span>
                  {line}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* MISSING */}
        <div>
          <div className="lbl mb">Missing</div>
          {missing.length === 0 ? (
            <StatusLine tone="ok">All known — ready to advance.</StatusLine>
          ) : (
            <ul className="grid g4">
              {missing.map((field) => (
                <li className="sub" key={field}>
                  {/* Same call as the ✓ above: an open gap is a warning. */}
                  <span style={{ color: "var(--warn)", marginRight: 6 }}>•</span>
                  {prettifyField(field)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {(nextQuestion || nextAction) && (
        <Callout className="mt">
          <div className="lbl">Next best {nextAction ? "action" : "question"}</div>
          <div>{nextAction || nextQuestion}</div>
        </Callout>
      )}

      {onOpenChat && (
        <Btn variant="pri" className="mt" onClick={onOpenChat}>
          <Icon name="chat" size={12} /> Open AI thread for this client
        </Btn>
      )}
    </Panel>
  );
}

function RelationshipChip({
  stage,
}: {
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
  const tone: ChipTone = danger ? "bad" : positive ? "ok" : "mut";
  return <CellChip tone={tone}>{labelMap[stage] ?? stage}</CellChip>;
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
