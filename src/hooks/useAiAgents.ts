"use client";

// AI Agents — React Query hooks for the broker's 11-step builder.
// Backed by the /ai-agents router (qcbackend). Every endpoint is
// BROKER-scoped server-side.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthedApi } from "./useApi";

// ── types ───────────────────────────────────────────────────────────

export type AiAgentStatus =
  | "draft"
  | "needs_training"
  | "training_in_progress"
  | "needs_review"
  | "ready_to_activate"
  | "active"
  | "paused"
  | "archived";

export type AiAgentKind =
  | "buyer_nurture"
  | "seller_followup"
  | "past_client"
  | "investor_outreach"
  | "open_house"
  | "review_request"
  | "custom";

export type AiAgentSendMode = "draft_first" | "auto";
export type AiAgentPersonaMode = "virtual_secretary" | "agent_persona";
export type AiAgentDomain = "pipeline" | "clients" | "both";

export type StepState = "missing" | "attention" | "done";
export type StepStates = Record<string, StepState>;

export interface AiAgent {
  id: string;
  name: string;
  kind: AiAgentKind;
  audience: string | null;
  ai_display_name: string | null;
  persona_mode: AiAgentPersonaMode;
  status: AiAgentStatus;
  send_mode: AiAgentSendMode;
  warmup_mode: boolean;
  max_followups: number;
  cadence: number[];
  last_tested_at: string | null;
  activated_at: string | null;
  created_at: string | null;
}

export interface AiAgentListRow extends AiAgent {
  lead_count: number;
  steps: StepStates;
}

export interface AiAgentDetail extends AiAgent {
  steps: StepStates;
  gate_blockers: string[];
}

export interface AiAgentGoal {
  primary_goal: string | null;
  primary_cta: string | null;
  handoff_triggers: string[];
  success_definition: string | null;
  qualified_reply_definition: string | null;
  auto_reply_boundaries: Record<string, unknown>;
}

export interface AiAgentKnowledgeLinkRow {
  id: string;
  knowledge_document_id: string;
  filename: string;
  doc_type: string | null;
  summary: string | null;
  status: string;
  attach_to_emails: boolean;
}

export interface AiAgentTargeting {
  domain: AiAgentDomain;
  include_rules: Record<string, unknown>;
  exclude_rules: Record<string, unknown>;
  enrollment_mode: "auto" | "review";
  last_targeting_pass_at: string | null;
}

export interface AiAgentLeadRow {
  id: string;
  client_id: string;
  name: string;
  email: string | null;
  stage: string;
  status: string;
  attempts_made: number;
  next_action_at: string | null;
}

export interface AiAgentTraining {
  session_id: string | null;
  completed: boolean;
  messages: { role: string; content: string }[];
}

export interface AiAgentSynth {
  content: Record<string, unknown>;
  generation_status: "idle" | "generating" | "ready" | "failed";
  generation_error?: string | null;
  approval_status: "draft" | "approved";
  approved_at: string | null;
}

export interface AiAgentExitRules {
  max_email_attempts: number;
  max_no_reply_followups: number;
  max_days_in_sequence: number;
}

export interface AiAgentSampleMessage {
  id: string;
  touchpoint_key: string;
  channel: string;
  sample_text: string;
}

export interface AiAgentTestScenario {
  id: string;
  prompt: string;
  ai_response: string | null;
  reviewed: boolean;
  created_at: string | null;
}

export interface AiAgentMessage {
  id: string;
  client_id: string | null;
  touchpoint_key: string;
  channel: string;
  subject: string | null;
  body: string;
  status: string;
  is_warmup: boolean;
  created_at: string | null;
}

// ── queries ─────────────────────────────────────────────────────────

export function useAiAgents() {
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["ai-agents"],
    queryFn: () => apiCall<AiAgentListRow[]>("/ai-agents"),
  });
}

export function useAiAgent(id: string | null) {
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["ai-agent", id],
    queryFn: () => apiCall<AiAgentDetail>(`/ai-agents/${id}`),
    enabled: !!id,
  });
}

function useSubResource<T>(id: string | null, sub: string, key: string) {
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["ai-agent", id, key],
    queryFn: () => apiCall<T>(`/ai-agents/${id}/${sub}`),
    enabled: !!id,
  });
}

export const useAiAgentGoal = (id: string | null) =>
  useSubResource<AiAgentGoal>(id, "goal", "goal");
export const useAiAgentKnowledgeLinks = (id: string | null) =>
  useSubResource<AiAgentKnowledgeLinkRow[]>(id, "knowledge-links", "knowledge");
export const useAiAgentTargeting = (id: string | null) =>
  useSubResource<AiAgentTargeting>(id, "targeting", "targeting");
export const useAiAgentLeads = (id: string | null) =>
  useSubResource<AiAgentLeadRow[]>(id, "leads", "leads");
export const useAiAgentTraining = (id: string | null) =>
  useSubResource<AiAgentTraining>(id, "training", "training");
export const useAiAgentPlaybook = (id: string | null) =>
  useSubResource<AiAgentSynth>(id, "playbook", "playbook");
export const useAiAgentShowingGuide = (id: string | null) =>
  useSubResource<AiAgentSynth>(id, "showing-guide", "showing-guide");
export const useAiAgentExitRules = (id: string | null) =>
  useSubResource<AiAgentExitRules>(id, "exit-rules", "exit-rules");
export const useAiAgentSampleMessages = (id: string | null) =>
  useSubResource<AiAgentSampleMessage[]>(id, "sample-messages", "samples");
export const useAiAgentTestScenarios = (id: string | null) =>
  useSubResource<AiAgentTestScenario[]>(id, "test-scenarios", "tests");
export const useAiAgentMessages = (id: string | null) =>
  useSubResource<AiAgentMessage[]>(id, "messages", "messages");

// ── mutations ───────────────────────────────────────────────────────

function useAgentMutation<TInput, TOut = unknown>(
  fn: (apiCall: ReturnType<typeof useAuthedApi>, input: TInput) => Promise<TOut>,
  agentIdOf: (input: TInput) => string | null,
  extraKeys: string[] = [],
) {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) => fn(apiCall, input),
    onSuccess: (_d, input) => {
      const id = agentIdOf(input);
      qc.invalidateQueries({ queryKey: ["ai-agents"] });
      qc.invalidateQueries({ queryKey: ["ai-agent", id] });
      extraKeys.forEach((k) =>
        qc.invalidateQueries({ queryKey: ["ai-agent", id, k] }),
      );
    },
  });
}

export function useCreateAiAgent() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; kind: string; audience?: string }) =>
      apiCall<AiAgent>("/ai-agents", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-agents"] }),
  });
}

export const usePatchAiAgent = () =>
  useAgentMutation<{ id: string; patch: Partial<AiAgent> }>(
    (api, { id, patch }) =>
      api(`/ai-agents/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    (i) => i.id,
  );

export const useArchiveAiAgent = () =>
  useAgentMutation<{ id: string }>(
    (api, { id }) => api(`/ai-agents/${id}`, { method: "DELETE" }),
    (i) => i.id,
  );

export const useSaveAiAgentGoal = () =>
  useAgentMutation<{ id: string; goal: AiAgentGoal }>(
    (api, { id, goal }) =>
      api(`/ai-agents/${id}/goal`, {
        method: "PUT",
        body: JSON.stringify(goal),
      }),
    (i) => i.id,
    ["goal"],
  );

export const useAddKnowledgeLink = () =>
  useAgentMutation<{
    id: string;
    knowledge_document_id: string;
    attach_to_emails: boolean;
  }>(
    (api, { id, knowledge_document_id, attach_to_emails }) =>
      api(`/ai-agents/${id}/knowledge-links`, {
        method: "POST",
        body: JSON.stringify({ knowledge_document_id, attach_to_emails }),
      }),
    (i) => i.id,
    ["knowledge"],
  );

export const useRemoveKnowledgeLink = () =>
  useAgentMutation<{ id: string; linkId: string }>(
    (api, { id, linkId }) =>
      api(`/ai-agents/${id}/knowledge-links/${linkId}`, { method: "DELETE" }),
    (i) => i.id,
    ["knowledge"],
  );

export const useSaveAiAgentTargeting = () =>
  useAgentMutation<{ id: string; targeting: Omit<AiAgentTargeting, "last_targeting_pass_at"> }>(
    (api, { id, targeting }) =>
      api(`/ai-agents/${id}/targeting`, {
        method: "PUT",
        body: JSON.stringify(targeting),
      }),
    (i) => i.id,
    ["targeting"],
  );

export function useAiAgentTargetingPreview() {
  const apiCall = useAuthedApi();
  return useMutation({
    mutationFn: (id: string) =>
      apiCall<{ count: number; sample: { id: string; name: string; stage: string }[] }>(
        `/ai-agents/${id}/targeting/preview`,
      ),
  });
}

export const useRunTargeting = () =>
  useAgentMutation<{ id: string }, { enrolled: number; retired: number }>(
    (api, { id }) =>
      api<{ enrolled: number; retired: number }>(
        `/ai-agents/${id}/targeting/run`,
        { method: "POST" },
      ),
    (i) => i.id,
    ["leads"],
  );

export const usePostTrainingTurn = () =>
  useAgentMutation<{ id: string; message: string }, { session_id: string; reply: string }>(
    (api, { id, message }) =>
      api<{ session_id: string; reply: string }>(
        `/ai-agents/${id}/training/messages`,
        { method: "POST", body: JSON.stringify({ message }) },
      ),
    (i) => i.id,
    ["training"],
  );

export const useCompleteTraining = () =>
  useAgentMutation<{ id: string }>(
    (api, { id }) =>
      api(`/ai-agents/${id}/training/complete`, { method: "POST" }),
    (i) => i.id,
    ["training"],
  );

export const useGeneratePlaybook = () =>
  useAgentMutation<{ id: string }>(
    (api, { id }) => api(`/ai-agents/${id}/playbook/generate`, { method: "POST" }),
    (i) => i.id,
    ["playbook"],
  );

export const useApprovePlaybook = () =>
  useAgentMutation<{ id: string }>(
    (api, { id }) => api(`/ai-agents/${id}/playbook/approve`, { method: "POST" }),
    (i) => i.id,
    ["playbook"],
  );

export const useGenerateShowingGuide = () =>
  useAgentMutation<{ id: string }>(
    (api, { id }) =>
      api(`/ai-agents/${id}/showing-guide/generate`, { method: "POST" }),
    (i) => i.id,
    ["showing-guide"],
  );

export const useApproveShowingGuide = () =>
  useAgentMutation<{ id: string }>(
    (api, { id }) =>
      api(`/ai-agents/${id}/showing-guide/approve`, { method: "POST" }),
    (i) => i.id,
    ["showing-guide"],
  );

export const useSaveExitRules = () =>
  useAgentMutation<{ id: string; rules: AiAgentExitRules }>(
    (api, { id, rules }) =>
      api(`/ai-agents/${id}/exit-rules`, {
        method: "PUT",
        body: JSON.stringify(rules),
      }),
    (i) => i.id,
    ["exit-rules"],
  );

export const useAddSampleMessage = () =>
  useAgentMutation<{
    id: string;
    touchpoint_key: string;
    channel: string;
    sample_text: string;
  }>(
    (api, { id, touchpoint_key, channel, sample_text }) =>
      api(`/ai-agents/${id}/sample-messages`, {
        method: "POST",
        body: JSON.stringify({ touchpoint_key, channel, sample_text }),
      }),
    (i) => i.id,
    ["samples"],
  );

export const useDeleteSampleMessage = () =>
  useAgentMutation<{ id: string; sampleId: string }>(
    (api, { id, sampleId }) =>
      api(`/ai-agents/${id}/sample-messages/${sampleId}`, { method: "DELETE" }),
    (i) => i.id,
    ["samples"],
  );

export const useRunTest = () =>
  useAgentMutation<{ id: string; prompt: string }, { id: string; ai_response: string }>(
    (api, { id, prompt }) =>
      api<{ id: string; ai_response: string }>(`/ai-agents/${id}/test`, {
        method: "POST",
        body: JSON.stringify({ prompt }),
      }),
    (i) => i.id,
    ["tests"],
  );

export const useReviewTestScenario = () =>
  useAgentMutation<{ id: string; scenarioId: string }>(
    (api, { id, scenarioId }) =>
      api(`/ai-agents/${id}/test-scenarios/${scenarioId}/review`, {
        method: "POST",
      }),
    (i) => i.id,
    ["tests"],
  );

export const useWarmupSend = () =>
  useAgentMutation<
    { id: string; client_id?: string; touchpoint_key: string },
    { id: string; subject: string; body: string; warmup_mode: boolean }
  >(
    (api, { id, client_id, touchpoint_key }) =>
      api<{ id: string; subject: string; body: string; warmup_mode: boolean }>(
        `/ai-agents/${id}/warmup-send`,
        {
          method: "POST",
          body: JSON.stringify({ client_id, touchpoint_key }),
        },
      ),
    (i) => i.id,
    ["messages"],
  );

export const useAssignWarmupLeads = () =>
  useAgentMutation<{ id: string; client_ids: string[] }, { assigned: number }>(
    (api, { id, client_ids }) =>
      api<{ assigned: number }>(`/ai-agents/${id}/leads/assign`, {
        method: "POST",
        body: JSON.stringify({ client_ids }),
      }),
    (i) => i.id,
    ["leads"],
  );

export const useCreateWarmupContact = () =>
  useAgentMutation<
    { id: string; name: string; email: string; phone?: string },
    { client_id: string; name: string }
  >(
    (api, { id, name, email, phone }) =>
      api<{ client_id: string; name: string }>(
        `/ai-agents/${id}/leads/create`,
        { method: "POST", body: JSON.stringify({ name, email, phone }) },
      ),
    (i) => i.id,
    ["leads"],
  );

export const useActivateAiAgent = () =>
  useAgentMutation<{ id: string }>(
    (api, { id }) => api(`/ai-agents/${id}/activate`, { method: "POST" }),
    (i) => i.id,
  );

export const usePauseAiAgent = () =>
  useAgentMutation<{ id: string }>(
    (api, { id }) => api(`/ai-agents/${id}/pause`, { method: "POST" }),
    (i) => i.id,
  );
