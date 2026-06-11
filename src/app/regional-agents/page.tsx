"use client";

import { useState } from "react";
import Link from "next/link";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, KPI, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { QC_FMT } from "@/components/design-system/tokens";
import {
  useCurrentUser,
  useInviteMyRegionalAgent,
  useMyRegionalAgents,
  useRemoveMyRegionalAgent,
} from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";

export default function RegionalAgentsPage() {
  const { t } = useTheme();
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const { data: agents = [], isLoading, error } = useMyRegionalAgents();
  const invite = useInviteMyRegionalAgent();
  const remove = useRemoveMyRegionalAgent();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);

  if (userLoading) return <div style={{ padding: 24, color: t.ink3 }}>Loading...</div>;
  if (user?.role !== Role.REGIONAL_MANAGER) {
    return (
      <div style={{ padding: 24 }}>
        <Card pad={20}>
          <Pill bg={t.dangerBg} color={t.danger}>Regional manager access required</Pill>
        </Card>
      </div>
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
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18, maxWidth: 1280, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: t.petrol, letterSpacing: 1.4, textTransform: "uppercase" }}>
            Regional portfolio
          </div>
          <h1 style={{ margin: "4px 0 0", fontSize: 28, fontWeight: 800, color: t.ink }}>Agents</h1>
          <div style={{ fontSize: 13, color: t.ink3, marginTop: 4 }}>
            Invite agents and monitor the portfolio attached to your region.
          </div>
        </div>
        <Link href="/pipeline" style={{ ...qcBtn(t), textDecoration: "none" }}>
          <Icon name="layers" size={14} /> Portfolio pipeline
        </Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 12 }}>
        <KPI label="Agents" value={agents.length} icon="clients" />
        <KPI label="Clients" value={metrics.clients} icon="user" />
        <KPI label="Active loans" value={metrics.activeLoans} icon="layers" />
        <KPI label="Pipeline" value={QC_FMT.short(metrics.pipeline)} icon="dollar" />
        <KPI label="Overdue" value={metrics.overdue} icon="bell" accent={metrics.overdue ? t.warn : t.ink3} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 16, alignItems: "flex-start" }}>
        <Card pad={16}>
          <SectionLabel>Invite agent</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Agent name" style={inputStyle(t)} />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="agent@company.com" style={inputStyle(t)} />
            <button
              onClick={submit}
              disabled={!valid || invite.isPending}
              style={{ ...qcBtnPrimary(t), justifyContent: "center", opacity: valid && !invite.isPending ? 1 : 0.5 }}
            >
              <Icon name="send" size={13} /> {invite.isPending ? "Sending..." : "Send invite"}
            </button>
            {err && <Pill bg={t.dangerBg} color={t.danger}>{err}</Pill>}
          </div>
        </Card>

        <Card pad={0}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${t.line}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <SectionLabel>Portfolio agents</SectionLabel>
            <Pill>{agents.length} agents</Pill>
          </div>
          {isLoading && <div style={{ padding: 16, color: t.ink3, fontSize: 13 }}>Loading agents...</div>}
          {error && <div style={{ padding: 16, color: t.danger, fontSize: 13 }}>Failed to load agents.</div>}
          {agents.map((agent) => (
            <div key={agent.user_id} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) repeat(5, minmax(86px, 1fr)) 36px", gap: 10, alignItems: "center", padding: "12px 16px", borderBottom: `1px solid ${t.line}` }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: t.ink }}>{agent.display_name ?? agent.name}</div>
                <div style={{ fontSize: 11.5, color: t.ink3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{agent.email}</div>
              </div>
              <Metric label="Clients" value={agent.metrics.client_count} />
              <Metric label="Active" value={agent.metrics.active_loans} />
              <Metric label="Pipeline" value={QC_FMT.short(agent.metrics.pipeline_value)} />
              <Metric label="Funded" value={QC_FMT.short(agent.metrics.funded_ytd)} />
              <Metric label="Overdue" value={agent.metrics.overdue_items} />
              <button
                aria-label={`Remove ${agent.name}`}
                onClick={() => remove.mutate(agent.user_id)}
                style={{ all: "unset", cursor: "pointer", display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: 7, color: t.ink3 }}
              >
                <Icon name="x" size={13} />
              </button>
            </div>
          ))}
          {!isLoading && agents.length === 0 && (
            <div style={{ padding: 18, color: t.ink3, fontSize: 13 }}>No agents in this regional portfolio yet.</div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  const { t } = useTheme();
  return (
    <div>
      <div style={{ fontSize: 10, color: t.ink3, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 12.5, color: t.ink, fontWeight: 800, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function inputStyle(t: ReturnType<typeof useTheme>["t"]): React.CSSProperties {
  return {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 9,
    background: t.surface2,
    border: `1px solid ${t.line}`,
    color: t.ink,
    fontSize: 13,
    fontFamily: "inherit",
    outline: "none",
  };
}
