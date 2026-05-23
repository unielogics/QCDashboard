"use client";

// ActiveAgentStrip — surface the AI Agents currently working a
// specific Client (or specific Deal) with Pause / Resume / Remove
// controls. Drops onto the client detail page + the deal/file view.
//
// Renders nothing when no agents are assigned, so it's safe to mount
// unconditionally above the existing content.

import Link from "next/link";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn } from "@/components/design-system/buttons";
import {
  useClientAiAgents,
  useDealAiAgents,
  usePauseAiAgentLead,
  useRemoveAiAgentLead,
  useResumeAiAgentLead,
  type AssignedAgentRow,
} from "@/hooks/useAiAgents";

type Props =
  | { clientId: string; dealId?: undefined }
  | { dealId: string; clientId?: undefined };

export function ActiveAgentStrip(props: Props) {
  const { t } = useTheme();
  const clientId = "clientId" in props ? props.clientId : undefined;
  const dealId = "dealId" in props ? props.dealId : undefined;

  const clientQ = useClientAiAgents(clientId ?? null);
  const dealQ = useDealAiAgents(dealId ?? null);
  const rows: AssignedAgentRow[] = clientId
    ? clientQ.data ?? []
    : dealQ.data ?? [];

  const pause = usePauseAiAgentLead();
  const resume = useResumeAiAgentLead();
  const remove = useRemoveAiAgentLead();

  if (rows.length === 0) return null;

  return (
    <Card pad={14} style={{ marginBottom: 14 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: t.ink3,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          marginBottom: 10,
        }}
      >
        Active AI agents
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((r) => {
          const paused = r.status === "paused";
          return (
            <div
              key={r.lead_id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                padding: "8px 4px",
                borderTop: `1px solid ${t.line}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <Icon name="spark" size={14} stroke={2.2} />
                <div style={{ minWidth: 0 }}>
                  <Link
                    href={`/ai-agents/${r.ai_agent_id}`}
                    style={{
                      fontSize: 13.5,
                      fontWeight: 700,
                      color: t.ink,
                      textDecoration: "none",
                    }}
                  >
                    {r.name}
                  </Link>
                  <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 1 }}>
                    {r.kind.replace(/_/g, " ")}
                    {r.ai_display_name ? ` · ${r.ai_display_name}` : ""}
                    {" · "}
                    {r.attempts_made} sent
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Pill
                  color={paused ? t.warn : t.profit}
                  bg={paused ? t.warnBg : t.profitBg}
                >
                  {paused ? "Paused" : r.status}
                </Pill>
                {paused ? (
                  <button
                    style={qcBtn(t)}
                    onClick={() =>
                      resume.mutate({
                        agentId: r.ai_agent_id,
                        leadId: r.lead_id,
                        clientId,
                        dealId,
                      })
                    }
                  >
                    Resume
                  </button>
                ) : (
                  <button
                    style={qcBtn(t)}
                    onClick={() =>
                      pause.mutate({
                        agentId: r.ai_agent_id,
                        leadId: r.lead_id,
                        clientId,
                        dealId,
                      })
                    }
                  >
                    Pause
                  </button>
                )}
                <button
                  style={{ ...qcBtn(t), color: t.danger, borderColor: t.lineStrong }}
                  onClick={() => {
                    if (
                      confirm(
                        "Remove this AI agent from this contact? It will stop working them but the audit row stays.",
                      )
                    )
                      remove.mutate({
                        agentId: r.ai_agent_id,
                        leadId: r.lead_id,
                        clientId,
                        dealId,
                      });
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
