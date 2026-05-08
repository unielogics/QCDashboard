// In-memory Lead mocks for frontend-first development.
//
// Active when NEXT_PUBLIC_BACKEND_HAS_LEADS !== "true". Once the backend
// ships GET /leads?scope=mine and POST /leads, flip the env flag and this
// file becomes inert (the hooks bypass these helpers).
//
// Architecture Rule #1 — `scope: "mine"` excludes records with NULL
// agent_id; this mock implementation enforces the same filter so the demo
// matches what the eventual backend will return.

import type { Lead, LeadSource, ListScope } from "@/lib/types";

// Module-level store. Empty by default — the Agent adds Leads via
// AddLeadPanel and sees them appear, which demonstrates the full end-to-end
// flow without seeded fixtures.
const store: Lead[] = [];

let nextSeq = 1;

function newId(): string {
  // Predictable IDs so the demo is easy to talk through; not for production.
  return `lead_mock_${nextSeq++}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function mockGetLeads(
  scope: ListScope,
  currentAgentId: string | null,
): Promise<Lead[]> {
  if (scope === "all") {
    return [...store];
  }
  // "mine" — Agent sees only their own. Unassigned (agent_id == null) is
  // intentionally excluded per Architecture Rule #1.
  if (!currentAgentId) return [];
  return store.filter((l) => l.agent_id === currentAgentId);
}

export async function mockGetLead(id: string): Promise<Lead> {
  const lead = store.find((l) => l.id === id);
  if (!lead) {
    throw new Error(`Lead ${id} not found`);
  }
  return lead;
}

export async function mockCreateLead(
  body: {
    name: string;
    email: string | null;
    phone: string | null;
    source: LeadSource;
    notes: string | null;
  },
  agentId: string | null,
): Promise<Lead> {
  const lead: Lead = {
    id: newId(),
    agent_id: agentId,
    name: body.name,
    email: body.email,
    phone: body.phone,
    status: "new",
    source: body.source,
    created_at: nowIso(),
    client_id: null,
    notes: body.notes,
  };
  store.unshift(lead);
  return lead;
}

export async function mockInviteLead(id: string): Promise<Lead> {
  const lead = store.find((l) => l.id === id);
  if (!lead) throw new Error(`Lead ${id} not found`);
  // Until Smart Intake completion converts the Lead, status moves to
  // "contacted" so the funnel reflects the outbound invite.
  lead.status = "contacted";
  return lead;
}
