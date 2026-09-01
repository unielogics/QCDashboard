"use client";

// ActiveAgentStrip — surface the AI Agents currently working a
// specific Client (or specific Deal) with Pause / Resume / Remove
// controls. Drops onto the client detail page + the deal/file view.
//
// Renders nothing when no agents are assigned, so it's safe to mount
// unconditionally above the existing content.
//
// Styling is the shared class system: a `.panel` of `.itemrow` agents, the
// run state as a `.cellchip` tone, and the row actions as `.btn.sm`.

import Link from "next/link";
import { CellChip, Btn, ItemRow, Panel } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useConfirmAction } from "@/components/design-system/ConfirmationProvider";
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
  const confirmAction = useConfirmAction();
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
    <Panel title="Active AI agents" className="mb">
      {/* Plain flow, not `.grid`: `.itemrow + .itemrow` already carries the
          6px rhythm, and a grid gap would stack on top of it. */}
      <div>
        {rows.map((r) => {
          const paused = r.status === "paused";
          return (
            <ItemRow
              key={r.lead_id}
              icon={<Icon name="spark" size={14} stroke={2.2} />}
              right={
                <div className="row">
                  <CellChip tone={paused ? "warn" : "ok"}>
                    {paused ? "Paused" : r.status}
                  </CellChip>
                  {paused ? (
                    <Btn
                      size="sm"
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
                    </Btn>
                  ) : (
                    <Btn
                      size="sm"
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
                    </Btn>
                  )}
                  <Btn
                    size="sm"
                    className="danger"
                    onClick={async () => {
                      const confirmed = await confirmAction({
                        title: "Remove AI agent",
                        body: "The agent will stop working this contact. Its audit history remains available.",
                        confirmLabel: "Remove agent",
                        tone: "danger",
                        reversible: true,
                      });
                      if (confirmed) remove.mutate({
                          agentId: r.ai_agent_id,
                          leadId: r.lead_id,
                          clientId,
                          dealId,
                        });
                    }}
                  >
                    Remove
                  </Btn>
                </div>
              }
            >
              <Link href={`/ai-agents/${r.ai_agent_id}`} className="linky">
                {r.name}
              </Link>
              <div className="sub">
                {r.kind.replace(/_/g, " ")}
                {r.ai_display_name ? ` · ${r.ai_display_name}` : ""}
                {" · "}
                {r.attempts_made} sent
              </div>
            </ItemRow>
          );
        })}
      </div>
    </Panel>
  );
}
