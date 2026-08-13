"use client";

// Start a new dealer-channel conversation from the team's Messages inbox:
// either pick an existing AI file or create a new one, assign the dealer
// partner it should reach, and send the first message. Admin-scoped — uses the
// /admin/ai-underwriter-leads create / dealer-partners / assign-partner routes.

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Modal } from "@/components/design-system/Modal";
import { Tabs } from "@/components/design-system/Tabs";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { api, ApiError } from "@/lib/api";

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
  const { t } = useTheme();
  const { getToken } = useAuth();

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
    const token = await getToken();
    return api<T>(path, { ...init, authToken: token ?? undefined });
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

  const field: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", padding: "9px 11px", borderRadius: 9,
    border: `1px solid ${t.line}`, background: t.surface2, color: t.ink, fontSize: 13, outline: "none",
  };
  const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: t.ink3, textTransform: "uppercase", letterSpacing: 0.4 };

  return (
    <Modal
      open
      onClose={onClose}
      title="New conversation"
      icon="chat"
      size="md"
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span style={{ color: t.ink4, fontSize: 11.5 }}>
            {partnerId ? "The dealer partner will see this in their Messages." : "Assign a partner so it reaches them."}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={qcBtn(t)} onClick={onClose} disabled={busy}>Cancel</button>
            <button type="button" style={{ ...qcBtnPrimary(t), opacity: canSend && !busy ? 1 : 0.5 }} disabled={!canSend || busy} onClick={send}>
              {busy ? "Sending…" : "Send message"}
            </button>
          </div>
        </div>
      }
    >
      <div style={{ padding: 16, display: "grid", gap: 12 }}>
        <Tabs
          variant="segmented"
          value={mode}
          onChange={(v) => setMode(v)}
          options={[{ id: "existing", label: "Existing file" }, { id: "new", label: "New file" }]}
        />

        {mode === "existing" ? (
          <div style={{ display: "grid", gap: 6 }}>
            <span style={label}>AI file</span>
            <input style={field} placeholder="Search leads by name, business, or email…" value={leadSearch} onChange={(e) => setLeadSearch(e.target.value)} />
            <div style={{ maxHeight: 180, overflowY: "auto", border: `1px solid ${t.line}`, borderRadius: 9 }}>
              {filteredLeads.length === 0 ? (
                <div style={{ padding: 12, color: t.ink3, fontSize: 12.5 }}>No matching files.</div>
              ) : filteredLeads.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setSelectedLeadId(l.id)}
                  style={{
                    all: "unset", cursor: "pointer", display: "block", width: "100%", boxSizing: "border-box",
                    padding: "9px 11px", borderBottom: `1px solid ${t.line}`,
                    background: selectedLeadId === l.id ? t.brandSoft : "transparent",
                  }}
                >
                  <div style={{ color: t.ink, fontSize: 13, fontWeight: 600 }}>{l.business_name || l.full_name}</div>
                  <div style={{ color: t.ink3, fontSize: 11.5 }}>{l.full_name} · {l.email}</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <span style={label}>Client name</span>
                <input style={field} value={nf.full_name} onChange={(e) => setNf({ ...nf, full_name: e.target.value })} />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <span style={label}>Client email</span>
                <input style={field} value={nf.email} onChange={(e) => setNf({ ...nf, email: e.target.value })} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 8 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <span style={label}>Business name</span>
                <input style={field} value={nf.business_name} onChange={(e) => setNf({ ...nf, business_name: e.target.value })} />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <span style={label}>Type</span>
                <select style={field} value={nf.variant} onChange={(e) => setNf({ ...nf, variant: e.target.value })}>
                  <option value="dealer">Dealer</option>
                  <option value="real_estate">Real estate</option>
                </select>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: "grid", gap: 6 }}>
          <span style={label}>Dealer partner</span>
          <select style={field} value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
            <option value="">— None (internal only) —</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>{p.name} · {p.email}</option>
            ))}
          </select>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <span style={label}>Message</span>
          <textarea
            style={{ ...field, minHeight: 90, resize: "vertical", fontFamily: "inherit", lineHeight: 1.45 }}
            placeholder="Write your message to the dealer partner…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>

        {error ? <div style={{ color: t.danger, fontSize: 12 }}>{error}</div> : null}
      </div>
    </Modal>
  );
}
