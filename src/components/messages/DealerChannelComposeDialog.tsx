"use client";

// Start a new dealer-channel conversation from the team's Messages inbox:
// either pick an existing AI file or create a new one, assign the dealer
// partner it should reach, and send the first message. Admin-scoped — uses the
// /admin/ai-underwriter-leads create / dealer-partners / assign-partner routes.

import { useEffect, useMemo, useState } from "react";
import { Drawer } from "@/components/ds/Drawer";
import {
  Btn,
  Field,
  Input,
  Seg,
  Select,
  StatusLine,
  Textarea,
  cx,
} from "@/components/ds";
import { ApiError } from "@/lib/api";
import { useAuthedFetch } from "@/hooks/useAuthedFetch";

type Partner = { id: string; name: string; email: string };
type LeadRow = { id: string; business_name?: string | null; full_name: string; email: string };

export function DealerChannelComposeDialog({
  apiPrefix,
  onClose,
  onSent,
}: {
  apiPrefix: string;
  onClose: () => void;
  onSent: (intakeId: string) => void;
}) {
  const authedFetch = useAuthedFetch();

  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [partners, setPartners] = useState<Partner[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [leadSearch, setLeadSearch] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [nf, setNf] = useState({ full_name: "", email: "", business_name: "", variant: "dealer" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    return authedFetch<T>(path, init);
  }

  useEffect(() => {
    void (async () => {
      try {
        const [p, l] = await Promise.all([
          call<Partner[]>(`${apiPrefix}/dealer-partners`),
          call<{ items: LeadRow[] }>(`${apiPrefix}?limit=200&offset=0`),
        ]);
        setPartners(p);
        setLeads(l.items ?? []);
      } catch {
        // non-fatal; the pickers just stay empty
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiPrefix]);

  const filteredLeads = useMemo(() => {
    const q = leadSearch.trim().toLowerCase();
    if (!q) return leads.slice(0, 50);
    return leads
      .filter((l) => `${l.business_name ?? ""} ${l.full_name} ${l.email}`.toLowerCase().includes(q))
      .slice(0, 50);
  }, [leads, leadSearch]);

  const canSend =
    !!message.trim() &&
    (mode === "existing" ? !!selectedLeadId : !!nf.full_name.trim() && !!nf.email.trim());

  async function send() {
    if (!canSend || busy) return;
    setBusy(true);
    setError(null);
    try {
      let intakeId = selectedLeadId;

      if (mode === "new") {
        try {
          const created = await call<{ intake: { id: string } }>(`${apiPrefix}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              variant: nf.variant,
              full_name: nf.full_name.trim(),
              email: nf.email.trim(),
              business_name: nf.business_name.trim() || null,
              broker_user_id: partnerId || null,
            }),
          });
          intakeId = created.intake.id;
        } catch (e) {
          // An active lead already exists for this email → reuse it, then assign.
          if (e instanceof ApiError && e.status === 409) {
            const id = (e.body as { detail?: { intake_id?: string } } | undefined)?.detail?.intake_id;
            if (!id) throw e;
            intakeId = id;
            if (partnerId) {
              await call(`${apiPrefix}/${id}/assign-partner`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ broker_user_id: partnerId }),
              });
            }
          } else {
            throw e;
          }
        }
      } else if (partnerId) {
        // Existing file: (re)assign the partner so the message reaches them.
        await call(`${apiPrefix}/${intakeId}/assign-partner`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ broker_user_id: partnerId }),
        });
      }

      await call(`${apiPrefix}/${intakeId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: message.trim() }),
      });
      onSent(intakeId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the conversation.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title="New conversation"
      width="md"
      footer={
        <>
          <span className="sub">
            {partnerId
              ? "The dealer partner will see this in their Messages."
              : "Assign a partner so it reaches them."}
          </span>
          <span className="grow" />
          <Btn onClick={onClose} disabled={busy}>
            Cancel
          </Btn>
          {/* `.btn:disabled` carries the dimmed state the inline opacity did. */}
          <Btn variant="pri" disabled={!canSend || busy} onClick={send}>
            {busy ? "Sending…" : "Send message"}
          </Btn>
        </>
      }
    >
      <div className="grid g10">
        <Seg
          as="tabs"
          ariaLabel="Conversation target"
          value={mode}
          onChange={setMode}
          options={[
            { value: "existing", label: "Existing file" },
            { value: "new", label: "New file" },
          ]}
        />

        {mode === "existing" ? (
          <Field label="AI file">
            <Input
              placeholder="Search leads by name, business, or email…"
              value={leadSearch}
              onChange={(e) => setLeadSearch(e.target.value)}
            />
            {/* `.picklist` bounds the list so the drawer's Send button stays on
                screen no matter how many leads match. */}
            <div className="picklist">
              {filteredLeads.length === 0 ? (
                <div className="sub">No matching files.</div>
              ) : (
                filteredLeads.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setSelectedLeadId(l.id)}
                    className={cx("pick", selectedLeadId === l.id && "on")}
                  >
                    <span className="grow grid g4">
                      <strong className="trunc">{l.business_name || l.full_name}</strong>
                      <span className="sub trunc">
                        {l.full_name} · {l.email}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </Field>
        ) : (
          <div className="grid g10">
            <div className="fldgrid two">
              <Field label="Client name">
                <Input
                  value={nf.full_name}
                  onChange={(e) => setNf({ ...nf, full_name: e.target.value })}
                />
              </Field>
              <Field label="Client email">
                <Input
                  value={nf.email}
                  onChange={(e) => setNf({ ...nf, email: e.target.value })}
                />
              </Field>
            </div>
            <div className="fldgrid two">
              <Field label="Business name">
                <Input
                  value={nf.business_name}
                  onChange={(e) => setNf({ ...nf, business_name: e.target.value })}
                />
              </Field>
              <Field label="Type">
                <Select
                  value={nf.variant}
                  onChange={(e) => setNf({ ...nf, variant: e.target.value })}
                >
                  <option value="dealer">Dealer</option>
                  <option value="real_estate">Real estate</option>
                </Select>
              </Field>
            </div>
          </div>
        )}

        <Field label="Dealer partner">
          <Select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
            <option value="">— None (internal only) —</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.email}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Message">
          {/* Bespoke measure: the composer opens three lines tall. `textarea.field`
              owns the vertical-only resize. */}
          <Textarea
            style={{ minHeight: 90 }}
            placeholder="Write your message to the dealer partner…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </Field>

        {error ? <StatusLine tone="bad">{error}</StatusLine> : null}
      </div>
    </Drawer>
  );
}
