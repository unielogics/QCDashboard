"use client";

import { useEffect, useMemo, useState } from "react";
import { Btn, Callout, CellChip, Input } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { Icon } from "@/components/design-system/Icon";
import { ApiError, api } from "@/lib/api";
import { useConsoleAuth } from "@/lib/consoleAuth";
import {
  notificationRuleProblem,
  notificationRuleSummary,
  setNotificationChannel,
  togglePrimaryRecipient,
  type IntakeNotificationRule as NotificationRule,
} from "@/lib/intakeNotificationRouting";

type NotificationCandidate = {
  user_id: string;
  name: string;
  email: string;
  role: string;
  relations: string[];
};

type NotificationEvent = {
  key: string;
  label: string;
  description: string;
  rule: NotificationRule;
};

type NotificationRouting = {
  intake_id: string;
  version: number;
  uses_default: boolean;
  updated_at?: string | null;
  updated_by_user_id?: string | null;
  default_fallback_email?: string | null;
  candidates: NotificationCandidate[];
  events: NotificationEvent[];
};

function errorMessage(reason: unknown): string {
  if (reason instanceof ApiError) return reason.message;
  return reason instanceof Error ? reason.message : "Notification routing could not be saved.";
}

function relationLabel(candidate: NotificationCandidate): string {
  if (candidate.relations.length) return candidate.relations.join(" · ");
  return candidate.role.replaceAll("_", " ");
}

function sameRules(left: NotificationEvent[], right: NotificationEvent[]): boolean {
  return JSON.stringify(left.map(({ key, rule }) => ({ key, rule }))) === JSON.stringify(right.map(({ key, rule }) => ({ key, rule })));
}

export function IntakeNotificationRoutingDrawer({
  open,
  onClose,
  intakeId,
  fileLabel,
}: {
  open: boolean;
  onClose: () => void;
  intakeId: string;
  fileLabel: string;
}) {
  const { getToken } = useConsoleAuth();
  const [routing, setRouting] = useState<NotificationRouting | null>(null);
  const [initialEvents, setInitialEvents] = useState<NotificationEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [ccInput, setCcInput] = useState<Record<string, string>>({});
  const [ccError, setCcError] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open || !intakeId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setSaved(false);
    void getToken()
      .then((authToken) => api<NotificationRouting>(`/admin/ai-underwriter-leads/${intakeId}/notification-routing`, { authToken: authToken ?? undefined }))
      .then((data) => {
        if (cancelled) return;
        setRouting(data);
        setInitialEvents(data.events);
        setCcInput({});
        setCcError({});
      })
      .catch((reason) => {
        if (!cancelled) setError(errorMessage(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [getToken, intakeId, open]);

  const candidatesById = useMemo(() => new Map((routing?.candidates ?? []).map((candidate) => [candidate.user_id, candidate])), [routing?.candidates]);
  const dirty = Boolean(routing && !sameRules(routing.events, initialEvents));
  const invalidEvents = useMemo(() => (routing?.events ?? []).filter((event) => {
    const coveredByEffectiveDefault = Boolean(
      routing?.uses_default
      && !dirty
      && routing.default_fallback_email
      && event.rule.enabled
      && event.rule.email_enabled
      && !event.rule.to_user_ids.length,
    );
    return !coveredByEffectiveDefault && notificationRuleProblem(event.rule);
  }), [dirty, routing]);

  function updateRule(eventKey: string, update: (current: NotificationRule) => NotificationRule) {
    setSaved(false);
    setError("");
    setRouting((current) => current ? {
      ...current,
      events: current.events.map((event) => event.key === eventKey ? { ...event, rule: update(event.rule) } : event),
    } : current);
  }

  function togglePrimary(eventKey: string, userId: string) {
    updateRule(eventKey, (rule) => togglePrimaryRecipient(rule, userId));
  }

  function addCc(event: NotificationEvent) {
    const typed = (ccInput[event.key] ?? "").trim().toLocaleLowerCase();
    const match = routing?.candidates.find((candidate) => candidate.email.toLocaleLowerCase() === typed);
    if (!match) {
      setCcError((current) => ({ ...current, [event.key]: "Choose an involved team member from the list. Arbitrary addresses are not allowed." }));
      return;
    }
    if (event.rule.to_user_ids.includes(match.user_id)) {
      setCcError((current) => ({ ...current, [event.key]: `${match.name} is already a primary recipient.` }));
      return;
    }
    updateRule(event.key, (rule) => ({
      ...rule,
      email_enabled: true,
      cc_user_ids: rule.cc_user_ids.includes(match.user_id) ? rule.cc_user_ids : [...rule.cc_user_ids, match.user_id],
    }));
    setCcInput((current) => ({ ...current, [event.key]: "" }));
    setCcError((current) => ({ ...current, [event.key]: "" }));
  }

  async function save() {
    if (!routing) return;
    if (invalidEvents.length) {
      setError(`Fix ${invalidEvents.map((event) => event.label).join(", ")} before saving. Every On event needs a channel and a primary recipient.`);
      return;
    }
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const authToken = await getToken();
      const events = Object.fromEntries(routing.events.map((event) => [event.key, event.rule]));
      const next = await api<NotificationRouting>(`/admin/ai-underwriter-leads/${intakeId}/notification-routing`, {
        method: "PUT",
        authToken: authToken ?? undefined,
        body: JSON.stringify({ events }),
      });
      setRouting(next);
      setInitialEvents(next.events);
      setSaved(true);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  }

  const footer = (
    <>
      <span className="sp" />
      <Btn onClick={onClose} disabled={saving}>Close</Btn>
      <Btn variant="pri" onClick={() => void save()} disabled={saving || loading || !dirty || invalidEvents.length > 0}>{saving ? "Saving..." : "Save routing"}</Btn>
    </>
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Notification routing"
      sub={`${fileLabel} · Choose exactly who receives each AI Intake update.`}
      width="xl"
      closeOnBackdrop={!saving}
      footer={footer}
    >
      {loading ? <div className="empty">Loading effective recipients...</div> : null}
      {error ? <Callout tone="bad" icon={<Icon name="alert" size={16} />}>{error}</Callout> : null}
      {saved ? <Callout tone="ok" icon={<Icon name="check" size={16} />}>Notification routing saved for this file.</Callout> : null}
      {routing?.uses_default ? <Callout tone="acc" icon={<Icon name="shieldChk" size={16} />}><b>Current default preserved.</b> Intake started and AI decision emails still go to active Super Admins{routing.default_fallback_email ? <> (effective fallback: {routing.default_fallback_email})</> : null} until you save a file-specific matrix.</Callout> : null}
      {routing && !routing.candidates.length ? <Callout tone="warn" icon={<Icon name="alert" size={16} />}>No active authorized team recipients are linked to this file. Add or assign a team member before saving custom routing.</Callout> : null}

      {routing ? (
        <div className="intake-notification-stack">
          {routing.events.map((event) => {
            const activeCc = event.rule.cc_user_ids.map((id) => candidatesById.get(id)).filter((candidate): candidate is NotificationCandidate => Boolean(candidate));
            const datalistId = `notification-cc-${event.key}`;
            const coveredByEffectiveDefault = Boolean(routing.uses_default && !dirty && routing.default_fallback_email && event.rule.enabled && event.rule.email_enabled && !event.rule.to_user_ids.length);
            const ruleProblem = coveredByEffectiveDefault ? null : notificationRuleProblem(event.rule);
            return (
              <section className={`intake-notification-event${event.rule.enabled ? " is-enabled" : ""}`} key={event.key}>
                <header>
                  <div>
                    <h3>{event.label}</h3>
                    <p>{event.description}</p>
                    <small className="intake-notification-summary">{coveredByEffectiveDefault ? `Email · Default admin TO (${routing.default_fallback_email})` : notificationRuleSummary(event.rule)}</small>
                  </div>
                  <label className="intake-notification-enable">
                    <input type="checkbox" checked={event.rule.enabled} onChange={(change) => {
                      if (change.target.checked && !event.rule.to_user_ids.length) {
                        setCcError((current) => ({ ...current, [event.key]: "Select a primary recipient to turn this event on." }));
                        return;
                      }
                      updateRule(event.key, (rule) => ({ ...rule, enabled: change.target.checked, email_enabled: change.target.checked && !rule.email_enabled && !rule.in_app_enabled ? true : rule.email_enabled }));
                    }} />
                    <span>{event.rule.enabled ? "On" : "Off"}</span>
                  </label>
                </header>

                <div className="intake-notification-channels" aria-label={`${event.label} delivery channels`}>
                  <label><input type="checkbox" checked={event.rule.email_enabled} disabled={!event.rule.enabled} onChange={(change) => updateRule(event.key, (rule) => setNotificationChannel(rule, "email", change.target.checked))} /><span><Icon name="mail" size={15} />Email</span></label>
                  <label><input type="checkbox" checked={event.rule.in_app_enabled} disabled={!event.rule.enabled} onChange={(change) => updateRule(event.key, (rule) => setNotificationChannel(rule, "in_app", change.target.checked))} /><span><Icon name="bell" size={15} />In-app</span></label>
                </div>

                <div className="intake-notification-recipient-heading">
                  <b>TO · Primary recipients</b>
                  <span>Tap a named involved user to include or remove them.</span>
                </div>
                <div className="intake-notification-recipient-grid">
                  {routing.candidates.map((candidate) => {
                    const checked = event.rule.to_user_ids.includes(candidate.user_id);
                    return (
                      <button
                        key={candidate.user_id}
                        type="button"
                        className={checked ? "selected" : undefined}
                        aria-pressed={checked}
                        onClick={() => togglePrimary(event.key, candidate.user_id)}
                      >
                        <span className="intake-notification-avatar">{candidate.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?"}</span>
                        <span><b>{candidate.name}</b><small>{relationLabel(candidate)}</small><em>{candidate.email}</em></span>
                        <Icon name={checked ? "check" : "plus"} size={16} />
                      </button>
                    );
                  })}
                  {!routing.candidates.length ? <div className="empty compact">No eligible users</div> : null}
                </div>

                <div className="intake-notification-cc">
                  <div><b>CC · Email copies</b><span>CC is limited to involved, authorized team members.</span></div>
                  <div className="intake-notification-cc-chips">
                    {activeCc.map((candidate) => (
                      <CellChip key={candidate.user_id} tone="acc">
                        {candidate.name}
                        <button type="button" aria-label={`Remove ${candidate.name} from ${event.label} CC`} onClick={() => updateRule(event.key, (rule) => ({ ...rule, cc_user_ids: rule.cc_user_ids.filter((id) => id !== candidate.user_id) }))}>×</button>
                      </CellChip>
                    ))}
                    {!activeCc.length ? <span className="sub">No CC recipients</span> : null}
                  </div>
                  <div className="intake-notification-cc-add">
                    <Input
                      type="email"
                      list={datalistId}
                      value={ccInput[event.key] ?? ""}
                      disabled={!event.rule.enabled || !event.rule.email_enabled}
                      onChange={(change) => { setCcInput((current) => ({ ...current, [event.key]: change.target.value })); setCcError((current) => ({ ...current, [event.key]: "" })); }}
                      onKeyDown={(key) => { if (key.key === "Enter") { key.preventDefault(); addCc(event); } }}
                      placeholder="Type an involved user's email"
                      aria-label={`${event.label} CC team member`}
                    />
                    <datalist id={datalistId}>{routing.candidates.filter((candidate) => !event.rule.to_user_ids.includes(candidate.user_id) && !event.rule.cc_user_ids.includes(candidate.user_id)).map((candidate) => <option key={candidate.user_id} value={candidate.email}>{candidate.name} · {relationLabel(candidate)}</option>)}</datalist>
                    <Btn type="button" onClick={() => addCc(event)} disabled={!event.rule.enabled || !event.rule.email_enabled || !(ccInput[event.key] ?? "").trim()}>Add CC</Btn>
                  </div>
                  {ccError[event.key] ? <small className="intake-notification-field-error" role="alert">{ccError[event.key]}</small> : null}
                  {ruleProblem ? <small className="intake-notification-field-error" role="alert">{ruleProblem}</small> : null}
                </div>
              </section>
            );
          })}
        </div>
      ) : null}
    </Drawer>
  );
}
