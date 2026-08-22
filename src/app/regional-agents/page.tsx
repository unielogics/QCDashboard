"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/design-system/Icon";
import { QC_FMT } from "@/lib/fmt";
import {
  Btn,
  CG,
  Card,
  CellChip,
  IconBtn,
  Input,
  Kpi,
  KpiRow,
  Panel,
  Table,
  Td,
  Tr,
  type Col,
} from "@/components/ds";
import {
  useCurrentUser,
  useInviteMyRegionalAgent,
  useMyRegionalAgents,
  useRemoveMyRegionalAgent,
} from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";

// One column per portfolio metric. The per-row "Clients / Active / Pipeline /
// Funded / Overdue" captions the old card rows repeated five times each are
// stated once here, in the header — same fields, read down instead of across.
const AGENT_COLS: Col[] = [
  { label: "Agent" },
  { label: "Clients", align: "r" },
  { label: "Active", align: "r" },
  { label: "Pipeline", align: "r" },
  { label: "Funded", align: "r" },
  { label: "Overdue", align: "r" },
  { label: "", width: 46 },
];

export default function RegionalAgentsPage() {
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const { data: agents = [], isLoading, error } = useMyRegionalAgents();
  const invite = useInviteMyRegionalAgent();
  const remove = useRemoveMyRegionalAgent();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);

  if (userLoading) return <div className="sub">Loading...</div>;
  if (user?.role !== Role.REGIONAL_MANAGER) {
    return (
      <Card>
        <CellChip tone="bad">Regional manager access required</CellChip>
      </Card>
    );
  }

  const metrics = agents.reduce(
    (acc, agent) => ({
      clients: acc.clients + agent.metrics.client_count,
      activeLoans: acc.activeLoans + agent.metrics.active_loans,
      pipeline: acc.pipeline + agent.metrics.pipeline_value,
      funded: acc.funded + agent.metrics.funded_ytd,
      overdue: acc.overdue + agent.metrics.overdue_items,
    }),
    { clients: 0, activeLoans: 0, pipeline: 0, funded: 0, overdue: 0 },
  );

  const submit = async () => {
    setErr(null);
    try {
      await invite.mutateAsync({ name: name.trim(), email: email.trim() });
      setName("");
      setEmail("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Invite failed");
    }
  };

  const valid = name.trim().length > 0 && /\S+@\S+\.\S+/.test(email);

  return (
    <>
      <div className="hd">
        <h2>Agents</h2>
        <CellChip tone="pet">Regional portfolio</CellChip>
        <span className="lede">Invite agents and monitor the portfolio attached to your region.</span>
        <span style={{ flex: 1 }} />
        <Link className="btn" href="/pipeline">
          <Icon name="layers" size={14} /> Portfolio pipeline
        </Link>
      </div>

      <KpiRow className="mt">
        <Kpi label="Agents" value={agents.length} />
        <Kpi label="Clients" value={metrics.clients} />
        <Kpi label="Active loans" value={metrics.activeLoans} />
        <Kpi label="Pipeline" value={QC_FMT.short(metrics.pipeline)} />
        {/* The old tile carried the overdue warning as an accent colour on the
            icon. The chip says it in words instead — colour alone was never
            going to survive a monochrome print or a colour-blind reader. */}
        <Kpi
          label="Overdue"
          value={metrics.overdue}
          tone="warn"
          delta={metrics.overdue ? "Needs attention" : undefined}
        />
      </KpiRow>

      <CG className="mt">
        <Panel className="s3" title="Invite agent">
          <div style={{ display: "grid", gap: 10 }}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Agent name"
              aria-label="Agent name"
            />
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="agent@company.com"
              aria-label="Agent email"
            />
            {/* .btn:disabled already carries the dimmed state the old inline
                opacity computed by hand. */}
            <Btn
              variant="pri"
              onClick={submit}
              disabled={!valid || invite.isPending}
              style={{ justifyContent: "center" }}
            >
              <Icon name="send" size={13} /> {invite.isPending ? "Sending..." : "Send invite"}
            </Btn>
            {err && <CellChip tone="bad">{err}</CellChip>}
          </div>
        </Panel>

        <Panel
          className="s9"
          title="Portfolio agents"
          actions={<CellChip tone="mut">{agents.length} agents</CellChip>}
          noPad
        >
          <Table cols={AGENT_COLS} caption="Agents in this regional portfolio">
            {isLoading && (
              <Tr>
                <Td colSpan={7}>
                  <span className="sub">Loading agents...</span>
                </Td>
              </Tr>
            )}
            {error && (
              <Tr>
                <Td colSpan={7}>
                  <CellChip tone="bad">Failed to load agents.</CellChip>
                </Td>
              </Tr>
            )}
            {agents.map((agent) => (
              <Tr key={agent.user_id}>
                <Td>
                  <b>{agent.display_name ?? agent.name}</b>
                  <div className="sub">{agent.email}</div>
                </Td>
                <Td align="r">
                  <span className="num">{agent.metrics.client_count}</span>
                </Td>
                <Td align="r">
                  <span className="num">{agent.metrics.active_loans}</span>
                </Td>
                <Td align="r">
                  <span className="num">{QC_FMT.short(agent.metrics.pipeline_value)}</span>
                </Td>
                <Td align="r">
                  <span className="num">{QC_FMT.short(agent.metrics.funded_ytd)}</span>
                </Td>
                <Td align="r">
                  {agent.metrics.overdue_items ? (
                    <CellChip tone="warn">{agent.metrics.overdue_items}</CellChip>
                  ) : (
                    <span className="num">{agent.metrics.overdue_items}</span>
                  )}
                </Td>
                <Td align="r">
                  <IconBtn
                    aria-label={`Remove ${agent.name}`}
                    onClick={() => remove.mutate(agent.user_id)}
                  >
                    <Icon name="x" size={13} />
                  </IconBtn>
                </Td>
              </Tr>
            ))}
            {!isLoading && agents.length === 0 && (
              <Tr>
                <Td colSpan={7}>
                  <span className="sub">No agents in this regional portfolio yet.</span>
                </Td>
              </Tr>
            )}
          </Table>
        </Panel>
      </CG>
    </>
  );
}
