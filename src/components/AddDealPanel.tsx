"use client";

// AddDealPanel — right-side panel for an Agent to spin up a new Deal /
// Opportunity. Deal links to a Borrower (`client_id`) and optionally a Lead
// (`lead_id`); both are nullable per Architecture Rule #1 so the Agent can
// track an opportunity before the contact has converted.

import { useEffect, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { RightPanel } from "@/components/design-system/RightPanel";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { useCreateDeal, useClients, useLeads } from "@/hooks/useApi";
import type { DealType } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: (dealId: string) => void;
  // When opened from a Lead/Borrower workspace, pre-link the Deal so the
  // Agent doesn't have to pick again.
  presetLeadId?: string | null;
  presetClientId?: string | null;
}

const TYPE_OPTIONS: { value: DealType; label: string; sub: string }[] = [
  { value: "purchase", label: "Purchase", sub: "Conventional purchase financing." },
  { value: "refi", label: "Refinance", sub: "Cash-out or rate/term refinance." },
  { value: "bridge", label: "Bridge", sub: "Short-term, asset-secured." },
  { value: "fix_flip", label: "Fix & Flip", sub: "12-month rehab, ARV-driven." },
  { value: "ground_up", label: "Ground Up", sub: "New construction, 18-month term." },
  { value: "dscr_purchase", label: "DSCR Purchase", sub: "30-year, rent-driven UW." },
  { value: "dscr_refi", label: "DSCR Refinance", sub: "30-year, rent-driven UW." },
];

export function AddDealPanel({ open, onClose, onCreated, presetLeadId, presetClientId }: Props) {
  const { t } = useTheme();
  const create = useCreateDeal();
  const { data: clients = [] } = useClients();
  const { data: leads = [] } = useLeads("mine");
  const [type, setType] = useState<DealType>("purchase");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [leadId, setLeadId] = useState<string | null>(presetLeadId ?? null);
  const [clientId, setClientId] = useState<string | null>(presetClientId ?? null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setType("purchase");
      setPropertyAddress("");
      setLeadId(presetLeadId ?? null);
      setClientId(presetClientId ?? null);
      setErr(null);
    }
  }, [open, presetLeadId, presetClientId]);

  // Backend enforces that at least one of (lead_id, client_id) is set. UI
  // surfaces this rule so the Agent doesn't get a confusing 400 later.
  const hasLink = !!(leadId || clientId);

  const submit = async () => {
    setErr(null);
    try {
      const deal = await create.mutateAsync({
        type,
        property_address: propertyAddress.trim() || null,
        lead_id: leadId,
        client_id: clientId,
      });
      onCreated?.(deal.id);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create deal");
    }
  };

  return (
    <RightPanel
      open={open}
      onClose={onClose}
      eyebrow="Deals"
      title="New Deal"
      ariaLabel="Create a new deal"
      footer={
        <>
          <button onClick={onClose} style={qcBtn(t)} disabled={create.isPending}>Cancel</button>
          <button
            onClick={submit}
            disabled={!hasLink || create.isPending}
            style={{
              ...qcBtnPrimary(t),
              opacity: hasLink && !create.isPending ? 1 : 0.5,
              cursor: hasLink && !create.isPending ? "pointer" : "not-allowed",
            }}
          >
            <Icon name="plus" size={13} /> {create.isPending ? "Creating…" : "Create deal"}
          </button>
        </>
      }
    >
      <div>
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            color: t.ink3,
            letterSpacing: 1.0,
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          Deal type
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {TYPE_OPTIONS.map((opt) => {
            const active = type === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setType(opt.value)}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: `1px solid ${active ? t.petrol : t.line}`,
                  background: active ? t.petrolSoft : t.surface2,
                }}
              >
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 999,
                    border: `2px solid ${active ? t.petrol : t.lineStrong}`,
                    background: active ? t.petrol : "transparent",
                    flexShrink: 0,
                    marginTop: 1,
                  }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>{opt.label}</div>
                  <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 2 }}>{opt.sub}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <Field t={t} label="Property address">
        <input
          value={propertyAddress}
          onChange={(e) => setPropertyAddress(e.target.value)}
          placeholder="123 Main St, City, State"
          style={inputStyle(t)}
        />
      </Field>

      <Field t={t} label="Linked Lead (optional)">
        <select
          value={leadId ?? ""}
          onChange={(e) => setLeadId(e.target.value || null)}
          style={inputStyle(t)}
        >
          <option value="">—</option>
          {leads.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </Field>

      <Field t={t} label="Linked Borrower (optional)">
        <select
          value={clientId ?? ""}
          onChange={(e) => setClientId(e.target.value || null)}
          style={inputStyle(t)}
        >
          <option value="">—</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </Field>

      {!hasLink && (
        <div style={{ fontSize: 12, color: t.warn, lineHeight: 1.5 }}>
          A deal must link to at least a Lead or a Borrower. Pick one above.
        </div>
      )}

      {err && <Pill bg={t.dangerBg} color={t.danger}>{err}</Pill>}

      <div style={{ fontSize: 11, color: t.ink3, lineHeight: 1.5 }}>
        Deals open in <strong>exploring</strong> status. Quotes, Loans, Documents, Messages,
        and AI tasks attach via <code style={{ background: t.chip, padding: "1px 4px", borderRadius: 4 }}>deal_id</code>.
        Both readiness scores ship in P1.
      </div>
    </RightPanel>
  );
}

function Field({
  t,
  label,
  children,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          color: t.ink3,
          letterSpacing: 1.0,
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {children}
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
