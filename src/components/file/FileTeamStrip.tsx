"use client";

// Who is on a file, in one strip.
//
// The agent seat is derived from the file's ownership (the lead's partner, the
// rep who opened it, the client's agent) and follows the existing reassign
// actions, so there is no agent picker here — only a note saying where the
// seat came from. Underwriters and the company are the desk's to set.

import { useCallback, useEffect, useState } from "react";
import { CellChip, Field, Linky, Panel, Row, Select, WarnLine } from "@/components/ds";
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

  const setCompany = (companyId: string | null) =>
    run("company", () =>
      api<FileTeam>(`/application-profiles/${profileId}/team/company`, {
        method: "PUT",
        body: JSON.stringify({ company_id: companyId }),
      }),
    );

  const onFile = new Set(team.underwriters.map((member) => member.user_id));
  const addable = (candidates?.underwriters ?? []).filter((member) => !onFile.has(member.user_id));
  const agentFrom = agentDerivedFromLabel(team.agent?.derived_from);

  return (
    <Panel bodyClass="grid">
      <Row>
        <Field label="Agent">
          <Row>
            {team.agent ? (
              <>
                <CellChip tone="acc" title={team.agent.email}>{team.agent.name}</CellChip>
                {team.agent.role ? <span className="sub">{roleLabel(team.agent.role)}</span> : null}
                {agentFrom ? <span className="sub">from {agentFrom}</span> : null}
              </>
            ) : (
              <CellChip tone="mut">No agent on this file</CellChip>
            )}
          </Row>
        </Field>

        <Field label="Underwriters">
          <Row>
            {team.underwriters.length ? (
              team.underwriters.map((member) => (
                <CellChip key={member.user_id} tone="mut" title={member.email}>
                  {member.name}
                  {editable ? (
                    <Linky
                      aria-label={`Remove ${member.name}`}
                      title={`Remove ${member.name}`}
                      disabled={busy !== ""}
                      onClick={() => removeUnderwriter(member.user_id)}
                    >
                      ×
                    </Linky>
                  ) : null}
                </CellChip>
              ))
            ) : (
              <span className="sub">None yet</span>
            )}
            {editable ? (
              <Select
                aria-label="Add underwriter"
                value=""
                disabled={busy !== "" || !addable.length}
                onChange={(event) => {
                  if (event.target.value) void addUnderwriter(event.target.value);
                }}
              >
                <option value="">{addable.length ? "Add underwriter…" : "No one to add"}</option>
                {addable.map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.name} · {roleLabel(member.role)}
                  </option>
                ))}
              </Select>
            ) : null}
          </Row>
        </Field>

        <Field label="Company">
          <Row>
            {editable ? (
              <Select
                aria-label="Company"
                value={team.company?.id ?? ""}
                disabled={busy !== ""}
                onChange={(event) => void setCompany(event.target.value || null)}
              >
                <option value="">None</option>
                {(candidates?.companies ?? []).map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
                {/* A derived company that is not in the candidate list (a
                    house row, say) still needs an option to be shown as selected. */}
                {team.company && !(candidates?.companies ?? []).some((company) => company.id === team.company?.id) ? (
                  <option value={team.company.id}>{team.company.name}</option>
                ) : null}
              </Select>
            ) : (
              <CellChip tone={team.company ? "acc" : "mut"}>{team.company?.name ?? "No company"}</CellChip>
            )}
            {team.company?.derived ? <span className="sub">from the agent&apos;s company</span> : null}
          </Row>
        </Field>
      </Row>
      <span className="sub">Change the agent from the loan, the client or the partner assignment.</span>
    </Panel>
  );
}
