// In-memory Deal mocks for frontend-first development.
//
// Active when NEXT_PUBLIC_BACKEND_HAS_DEALS !== "true". Once GET /deals?scope
// and POST /deals ship, flip the flag and this file becomes inert.

import type { Deal, DealType, ListScope } from "@/lib/types";

const store: Deal[] = [];

let nextSeq = 1;

function newId(): string {
  return `deal_mock_${nextSeq++}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function mockGetDeals(
  scope: ListScope,
  currentAgentId: string | null,
): Promise<Deal[]> {
  if (scope === "all") {
    return [...store];
  }
  // "mine" — Agent sees only their own. NULL-owner records intentionally
  // excluded per Architecture Rule #1.
  if (!currentAgentId) return [];
  return store.filter((d) => d.agent_id === currentAgentId);
}

export async function mockGetDeal(id: string): Promise<Deal> {
  const deal = store.find((d) => d.id === id);
  if (!deal) {
    throw new Error(`Deal ${id} not found`);
  }
  return deal;
}

export async function mockCreateDeal(
  body: {
    type: DealType;
    property_address: string | null;
    lead_id: string | null;
    client_id: string | null;
  },
  agentId: string | null,
): Promise<Deal> {
  const now = nowIso();
  const deal: Deal = {
    id: newId(),
    lead_id: body.lead_id,
    client_id: body.client_id,
    agent_id: agentId,
    type: body.type,
    property_address: body.property_address,
    status: "exploring",
    // P1 engine populates these. Mocked as null today so the UI shows the
    // "score pending" empty state and we don't fake numbers.
    deal_readiness_score: null,
    funding_file_readiness_score: null,
    created_at: now,
    last_movement_at: now,
  };
  store.unshift(deal);
  return deal;
}
