"use client";

// AI Preview / Test Mode panel — used by both portals.
//
// Lets admins/agents see what the AI plan resolves to for a chosen
// client + the next-best question, plus a handoff packet preview
// (agent-only) and a cadence dry-run preview. Persists nothing.

import { useState } from "react";
import {
  useClients,
  usePreviewAIPlan,
  usePreviewCadence,
  usePreviewHandoffPacket,
} from "@/hooks/useApi";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/components/design-system/primitives";

interface Props {
  /** Restrict to one preview mode in single-purpose contexts. */
  mode?: "plan" | "handoff" | "cadence";
}

export function AIPreviewPanel({ mode }: Props) {
  const { t } = useTheme();
  const { data: clients = [] } = useClients();
  const [clientId, setClientId] = useState<string>("");

  const plan = usePreviewAIPlan();
  const handoff = usePreviewHandoffPacket();
  const cadence = usePreviewCadence();

  const showPlan = !mode || mode === "plan";
  const showHandoff = !mode || mode === "handoff";
  const showCadence = !mode || mode === "cadence";

  return (
    <Card pad={16}>
      <SectionLabel>AI Preview</SectionLabel>
      <div style={{ fontSize: 12, color: t.muted, marginTop: 4, marginBottom: 12 }}>
        Run the AI's logic against a real (or test) client without saving anything.
      </div>

      <div style={{ marginBottom: 12 }}>
        <select
          value={clientId}
          onChange={e => setClientId(e.target.value)}
          style={{
            width: "100%", padding: 8, fontSize: 13,
            borderRadius: 6, border: `1px solid ${t.border}`,
            background: t.surface, color: t.ink,
          }}
        >
          <option value="">— Pick a client —</option>
          {clients.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {showPlan ? (
          <button
            disabled={!clientId || plan.isPending}
            onClick={() => plan.mutate({ client_id: clientId })}
            style={btn(t)}
          >
            {plan.isPending ? "Running…" : "Preview AI Plan"}
          </button>
        ) : null}
        {showHandoff ? (
          <button
            disabled={!clientId || handoff.isPending}
            onClick={() => handoff.mutate(clientId)}
            style={btn(t)}
          >
            {handoff.isPending ? "Building…" : "Preview Handoff Packet"}
          </button>
        ) : null}
        {showCadence ? (
          <button
            disabled={cadence.isPending}
            onClick={() => cadence.mutate({ client_id: clientId || null })}
            style={btn(t)}
          >
            {cadence.isPending ? "Computing…" : "Preview Cadence Actions"}
          </button>
        ) : null}
      </div>

      {plan.data ? (
        <PreviewBlock title="Plan preview" t={t}>
          <Field label="Phase">{plan.data.current_phase}</Field>
          <Field label="Readiness">{plan.data.readiness_score ?? 0}%</Field>
          <Field label="Next-best question">{plan.data.next_best_question || "—"}</Field>
          <Field label="Required items">
            {plan.data.required_items.length === 0 ? "—" : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {plan.data.required_items.map(i => (
                  <li key={i.requirement_key} style={{ fontSize: 12 }}>
                    {i.label} <span style={{ color: t.muted }}>({i.required_level}, src={i.source}, status={i.status})</span>
                  </li>
                ))}
              </ul>
            )}
          </Field>
        </PreviewBlock>
      ) : null}

      {handoff.data ? (
        <PreviewBlock title="Handoff packet preview" t={t}>
          <Field label="Summary"><pre style={preStyle(t)}>{handoff.data.handoff_summary || "—"}</pre></Field>
          <Field label="Missing lending items">{(handoff.data.missing_lending_items || []).join(", ") || "—"}</Field>
          <Field label="First lending question">{handoff.data.first_lending_question || "—"}</Field>
          <Field label="Recommended path">
            <pre style={preStyle(t)}>{JSON.stringify(handoff.data.recommended_lending_path || {}, null, 2)}</pre>
          </Field>
        </PreviewBlock>
      ) : null}

      {cadence.data ? (
        <PreviewBlock title="Cadence actions that would fire today" t={t}>
          {cadence.data.length === 0 ? (
            <div style={{ fontSize: 12, color: t.muted }}>No rules fire right now.</div>
          ) : cadence.data.map((c, i) => (
            <div key={i} style={{ padding: 8, borderBottom: `1px solid ${t.border}`, fontSize: 12 }}>
              <strong>{c.action_type}</strong> for {c.client_name} ({c.trigger_event})
              {c.message_preview ? (
                <div style={{ color: t.muted, marginTop: 4 }}>{c.message_preview}</div>
              ) : null}
            </div>
          ))}
        </PreviewBlock>
      ) : null}
    </Card>
  );
}

function PreviewBlock({ title, children, t }: { title: string; children: React.ReactNode; t: ReturnType<typeof useTheme>["t"] }) {
  return (
    <div style={{
      marginTop: 14, padding: 12,
      border: `1px dashed ${t.border}`, borderRadius: 8,
      background: t.surface2,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: t.muted, marginBottom: 8, textTransform: "uppercase" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.7, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13 }}>{children}</div>
    </div>
  );
}

function btn(t: ReturnType<typeof useTheme>["t"]) {
  return {
    padding: "6px 12px", fontSize: 12, fontWeight: 600,
    borderRadius: 6, border: `1px solid ${t.border}`,
    background: t.surface, color: t.ink, cursor: "pointer",
  } as const;
}

function preStyle(t: ReturnType<typeof useTheme>["t"]) {
  return {
    background: t.surface, padding: 8, borderRadius: 6,
    fontSize: 11, lineHeight: 1.4, overflowX: "auto" as const,
    border: `1px solid ${t.border}`, color: t.ink,
    margin: 0, whiteSpace: "pre-wrap" as const,
  } as const;
}
