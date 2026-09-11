"use client";

// The people working a file. The ownership-derived agent stays visibly primary;
// the desk can add more agents and underwriters without replacing ownership.

import { useCallback, useEffect, useState } from "react";
import { CellChip, Field, IconBtn, Panel, Select, WarnLine } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useAuthedApi } from "@/hooks/useApi";
import { ApiError } from "@/lib/api";
import {
  agentDerivedFromLabel,
  roleLabel,
  type FileTeam,
  type FileTeamCandidates,
} from "@/lib/fileUpdates";

export function FileTeamStrip({
  profileId,
  canEdit,
}: {
  profileId: string | null | undefined;
  canEdit: boolean;
}) {
  const api = useAuthedApi();
  const [team, setTeam] = useState<FileTeam | null>(null);
  const [candidates, setCandidates] = useState<FileTeamCandidates | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setTeam(null);
    setError(null);
    if (!profileId) return;
    try {
      setTeam(await api<FileTeam>(`/application-profiles/${profileId}/team`));
    } catch (reason) {
      // No file record, or one the caller may not see: nothing to show.
      if (reason instanceof ApiError && reason.status === 404) return;
      setError(reason instanceof Error ? reason.message : "The file team could not be loaded.");
    }
  }, [api, profileId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Candidates are an operator-only read; nobody else can add a seat, so
  // nobody else asks.
  useEffect(() => {
    if (!canEdit || !profileId) return;
    let cancelled = false;
    api<FileTeamCandidates>("/application-profiles/team/candidates")
      .then((rows) => {
        if (!cancelled) setCandidates(rows);
      })
      .catch(() => {
        // The pickers simply stay empty.
      });
    return () => {
      cancelled = true;
    };
  }, [api, canEdit, profileId]);

  if (!profileId) return null;
  if (error) return <WarnLine>{error}</WarnLine>;
  if (!team) return null;

  const editable = canEdit && team.can_edit !== false;

  const run = async (label: string, work: () => Promise<FileTeam>) => {
    setBusy(label);
    setError(null);
    try {
      setTeam(await work());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That did not work.");
    } finally {
      setBusy("");
    }
  };

  const addUnderwriter = (userId: string) =>
    run(`add:${userId}`, () =>
      api<FileTeam>(`/application-profiles/${profileId}/team/underwriters`, {
        method: "POST",
        body: JSON.stringify({ user_id: userId }),
      }),
    );

  const removeUnderwriter = (userId: string) =>
    run(`remove:${userId}`, () =>
      api<FileTeam>(`/application-profiles/${profileId}/team/underwriters/${userId}`, { method: "DELETE" }),
    );

  const addAgent = (userId: string) =>
    run(`add-agent:${userId}`, () =>
      api<FileTeam>(`/application-profiles/${profileId}/team/agents`, {
        method: "POST",
        body: JSON.stringify({ user_id: userId }),
      }),
    );

  const removeAgent = (userId: string) =>
    run(`remove-agent:${userId}`, () =>
      api<FileTeam>(`/application-profiles/${profileId}/team/agents/${userId}`, { method: "DELETE" }),
    );

  const setCompany = (companyId: string | null) =>
    run("company", () =>
      api<FileTeam>(`/application-profiles/${profileId}/team/company`, {
        method: "PUT",
        body: JSON.stringify({ company_id: companyId }),
      }),
    );

  const agents = team.agents?.length ? team.agents : team.agent ? [team.agent] : [];
  const agentIds = new Set(agents.map((member) => member.user_id).filter(Boolean));
  const underwriterIds = new Set(team.underwriters.map((member) => member.user_id));
  const addableAgents = (candidates?.agents ?? []).filter((member) => !agentIds.has(member.user_id));
  const addableUnderwriters = (candidates?.underwriters ?? []).filter((member) => !underwriterIds.has(member.user_id));

  return (
    <Panel title="File team" className="file-team-panel" bodyClass="grid g12">
      <Field label="Agents">
        <div className="file-team-members">
          {agents.length ? agents.map((member, index) => {
            const source = agentDerivedFromLabel(member.derived_from);
            return (
              <div className="file-team-member" key={member.user_id ?? `${member.name}-${index}`}>
                <div className="file-team-person">
                  <b>{member.name}</b>
                  <div className="file-team-meta">
                    {member.derived_from ? <CellChip tone="acc">Primary</CellChip> : null}
                    {member.role ? <span>{roleLabel(member.role)}</span> : null}
                    {source ? <span>from {source}</span> : null}
                  </div>
                </div>
                {editable && member.user_id && !member.derived_from ? (
                  <IconBtn
                    className="file-team-remove"
                    aria-label={`Remove ${member.name}`}
                    title={`Remove ${member.name}`}
                    disabled={busy !== ""}
                    onClick={() => removeAgent(member.user_id!)}
                  >
                    <Icon name="x" size={12} />
                  </IconBtn>
                ) : null}
              </div>
            );
          }) : <span className="sub">No agent on this file</span>}
        </div>
        {editable ? (
          <Select
            aria-label="Add agent"
            value=""
            disabled={busy !== "" || !addableAgents.length}
            onChange={(event) => {
              if (event.target.value) void addAgent(event.target.value);
            }}
          >
            <option value="">{addableAgents.length ? "Add agent..." : "No agent to add"}</option>
            {addableAgents.map((member) => (
              <option key={member.user_id} value={member.user_id}>{member.name} · {roleLabel(member.role)}</option>
            ))}
          </Select>
        ) : null}
      </Field>

      <Field label="Underwriters">
        <div className="file-team-members">
          {team.underwriters.length ? team.underwriters.map((member) => (
            <div className="file-team-member" key={member.user_id}>
              <div className="file-team-person">
                <b>{member.name}</b>
                <div className="file-team-meta"><span>{roleLabel(member.role)}</span></div>
              </div>
              {editable ? (
                <IconBtn
                  className="file-team-remove"
                  aria-label={`Remove ${member.name}`}
                  title={`Remove ${member.name}`}
                  disabled={busy !== ""}
                  onClick={() => removeUnderwriter(member.user_id)}
                >
                  <Icon name="x" size={12} />
                </IconBtn>
              ) : null}
            </div>
          )) : <span className="sub">No underwriter assigned</span>}
        </div>
        {editable ? (
          <Select
            aria-label="Add underwriter"
            value=""
            disabled={busy !== "" || !addableUnderwriters.length}
            onChange={(event) => {
              if (event.target.value) void addUnderwriter(event.target.value);
            }}
          >
            <option value="">{addableUnderwriters.length ? "Add underwriter..." : "No underwriter to add"}</option>
            {addableUnderwriters.map((member) => (
              <option key={member.user_id} value={member.user_id}>{member.name} · {roleLabel(member.role)}</option>
            ))}
          </Select>
        ) : null}
      </Field>

      <Field label="Company">
        {editable ? (
          <Select
            aria-label="Company"
            value={team.company?.id ?? ""}
            disabled={busy !== ""}
            onChange={(event) => void setCompany(event.target.value || null)}
          >
            <option value="">None</option>
            {(candidates?.companies ?? []).map((company) => (
              <option key={company.id} value={company.id}>{company.name}</option>
            ))}
            {team.company && !(candidates?.companies ?? []).some((company) => company.id === team.company?.id) ? (
              <option value={team.company.id}>{team.company.name}</option>
            ) : null}
          </Select>
        ) : <CellChip tone={team.company ? "acc" : "mut"}>{team.company?.name ?? "No company"}</CellChip>}
        {team.company?.derived ? <span className="sub">From the primary agent&apos;s company</span> : null}
      </Field>
      <span className="sub">The primary agent follows file ownership. Additional agents and underwriters collaborate on this file only.</span>
    </Panel>
  );
}
