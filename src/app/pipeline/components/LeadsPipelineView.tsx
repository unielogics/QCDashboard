"use client";

// Leads view of the Pipeline. Mirrors the Funding view's table/kanban shape
// but is driven by clients in the early-funnel stages (lead, contacted,
// verified). Click any card → /clients/[id], where the Agent finds the
// Start Funding action that promotes the client into the Funding view.

import Link from "next/link";
import { useMemo, useState } from "react";
import { Card, Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { useClients, useCreateClient } from "@/hooks/useApi";
import { LEAD_STAGES, type Client, type ClientStage } from "@/lib/types";

const LEAD_STAGE_LABELS: Record<(typeof LEAD_STAGES)[number], string> = {
  lead: "Lead",
  contacted: "Nurturing",
  verified: "Ready",
};

function isLeadStage(s: ClientStage): s is (typeof LEAD_STAGES)[number] {
  return (LEAD_STAGES as readonly ClientStage[]).includes(s);
}

interface Props {
  view: "kanban" | "table";
  search: string;
}

export function LeadsPipelineView({ view, search }: Props) {
  const { t } = useTheme();
  // Scope to the calling broker's book. Backend's _scope filter on
  // /clients does the actual gating; we still pass `scope="mine"`
  // so super-admins viewing the leads view see firm-wide instead.
  const { data: clients = [] } = useClients("mine");
  const [showAddModal, setShowAddModal] = useState(false);

  // alembic 0024 backfilled every existing client with a real `stage`
  // value, and new clients default to 'lead' on creation. Use the
  // column directly — the previous `inferStage()` hack from when
  // the column didn't exist is gone.
  const enriched = useMemo(() => {
    return clients
      .filter((c): c is Client & { stage: ClientStage } =>
        Boolean(c.stage) && isLeadStage(c.stage as ClientStage),
      )
      .map((c) => ({ ...c, _stage: c.stage }));
  }, [clients]);

  const visible = useMemo(() => {
    if (!search.trim()) return enriched;
    const q = search.trim().toLowerCase();
    return enriched.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.city ?? "").toLowerCase().includes(q),
    );
  }, [enriched, search]);

  const header = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
      <div style={{ fontSize: 12, color: t.ink3 }}>
        {visible.length} {visible.length === 1 ? "lead" : "leads"}
        {search ? ` matching "${search}"` : ""}
      </div>
      <button
        onClick={() => setShowAddModal(true)}
        style={{
          padding: "8px 12px", borderRadius: 9,
          background: t.brand, color: t.inverse,
          fontSize: 13, fontWeight: 700, border: "none",
          display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer",
        }}
      >
        <Icon name="plus" size={13} /> Add Lead
      </button>
    </div>
  );

  if (view === "table") {
    return (
      <>
      {header}
      <Card pad={0}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 2fr) 110px 90px 100px 130px",
            padding: "12px 16px",
            fontSize: 11,
            fontWeight: 700,
            color: t.ink3,
            textTransform: "uppercase",
            letterSpacing: 1.2,
            borderBottom: `1px solid ${t.line}`,
          }}
        >
          <div>Client</div>
          <div>Stage</div>
          <div>Type</div>
          <div>FICO</div>
          <div>City</div>
        </div>
        {visible.map((c) => (
          <Link
            key={c.id}
            href={`/clients/${c.id}`}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 2fr) 110px 90px 100px 130px",
              padding: "12px 16px",
              borderBottom: `1px solid ${t.line}`,
              alignItems: "center",
              fontSize: 13,
              color: t.ink,
              textDecoration: "none",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {c.name}
              </div>
              <div style={{ fontSize: 11.5, color: t.ink3 }}>{c.email ?? "—"}</div>
            </div>
            <StagePill t={t} stage={c._stage as (typeof LEAD_STAGES)[number]} />
            {c.client_type ? (
              <Pill bg={c.client_type === "buyer" ? t.brandSoft : t.warnBg} color={c.client_type === "buyer" ? t.brand : t.warn}>
                {c.client_type === "buyer" ? "Buyer" : "Seller"}
              </Pill>
            ) : (
              <span style={{ color: t.ink3 }}>—</span>
            )}
            <span style={{ fontFeatureSettings: '"tnum"', color: t.ink2 }}>{c.fico ?? "—"}</span>
            <span style={{ color: t.ink3 }}>{c.city ?? "—"}</span>
          </Link>
        ))}
        {visible.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: t.ink3 }}>
            {search ? `No leads match "${search}".` : "No leads in the funnel right now."}
          </div>
        )}
      </Card>
      {showAddModal && <AddLeadModal t={t} onClose={() => setShowAddModal(false)} />}
      </>
    );
  }

  // Kanban — 3 columns, one per lead stage.
  return (
    <>
    {header}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
      {LEAD_STAGES.map((s) => {
        const stageClients = visible.filter((c) => c._stage === s);
        return (
          <div
            key={s}
            style={{
              background: t.surface2,
              padding: 12,
              borderRadius: 12,
              border: `1px solid ${t.line}`,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <StagePill t={t} stage={s} />
              <div style={{ fontSize: 12, fontWeight: 700, color: t.ink3 }}>{stageClients.length}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {stageClients.map((c) => (
                <Link
                  key={c.id}
                  href={`/clients/${c.id}`}
                  style={{
                    background: t.surface,
                    padding: 10,
                    borderRadius: 10,
                    border: `1px solid ${t.line}`,
                    textDecoration: "none",
                    color: t.ink,
                    display: "block",
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: t.ink }}>{c.name}</div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
                    {c.client_type ? (
                      <Pill bg={c.client_type === "buyer" ? t.brandSoft : t.warnBg} color={c.client_type === "buyer" ? t.brand : t.warn}>
                        {c.client_type === "buyer" ? "Buyer" : "Seller"}
                      </Pill>
                    ) : null}
                    {c.email && (
                      <span
                        style={{
                          fontSize: 11,
                          color: t.ink3,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          minWidth: 0,
                          flex: 1,
                        }}
                      >
                        {c.email}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
              {stageClients.length === 0 && (
                <div style={{ fontSize: 12, color: t.ink3, padding: "8px 0", textAlign: "center" }}>
                  Empty
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
    {showAddModal && <AddLeadModal t={t} onClose={() => setShowAddModal(false)} />}
    </>
  );
}

function AddLeadModal({
  t,
  onClose,
}: {
  t: ReturnType<typeof useTheme>["t"];
  onClose: () => void;
}) {
  const create = useCreateClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [clientType, setClientType] = useState<"buyer" | "seller" | "">("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const canSave = name.trim().length > 0 && !create.isPending;

  const onSave = async () => {
    setFeedback(null);
    try {
      await create.mutateAsync({
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        city: city.trim() || undefined,
        client_type: clientType || undefined,
        // stage defaults to 'lead' on the backend.
        // broker_id is hard-stamped from the session for BROKER role.
      });
      onClose();
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Couldn't add lead.");
    }
  };

  const inputStyle: React.CSSProperties = {
    padding: "8px 10px", borderRadius: 7,
    border: `1px solid ${t.line}`, background: t.surface2,
    color: t.ink, fontSize: 13, outline: "none",
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: t.surface, borderRadius: 12, padding: 20,
          width: 460, maxWidth: "90vw",
          boxShadow: `0 20px 50px ${t.line}`,
          display: "flex", flexDirection: "column", gap: 12,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 800, color: t.ink }}>Add lead</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: t.ink3 }}>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus style={inputStyle} placeholder="Sarah Smith" />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: t.ink3 }}>Email</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} placeholder="sarah@example.com" />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: t.ink3 }}>Phone</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} placeholder="(555) 123-4567" />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: t.ink3 }}>City</span>
            <input value={city} onChange={(e) => setCity(e.target.value)} style={inputStyle} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: t.ink3 }}>Side</span>
            <select value={clientType} onChange={(e) => setClientType(e.target.value as "buyer" | "seller" | "")} style={inputStyle}>
              <option value="">Unknown</option>
              <option value="buyer">Buyer</option>
              <option value="seller">Seller</option>
            </select>
          </label>
        </div>
        {feedback && <div style={{ fontSize: 12, color: t.danger }}>{feedback}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <button
            onClick={onClose}
            style={{ padding: "7px 12px", borderRadius: 7, border: `1px solid ${t.line}`, background: t.surface2, color: t.ink, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={!canSave}
            style={{
              padding: "7px 14px", borderRadius: 7, border: "none",
              background: canSave ? t.brand : t.chip,
              color: canSave ? t.inverse : t.ink4,
              fontSize: 12, fontWeight: 700,
              cursor: canSave ? "pointer" : "not-allowed",
            }}
          >
            {create.isPending ? "Adding…" : "Add lead"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StagePill({
  t,
  stage,
}: {
  t: ReturnType<typeof useTheme>["t"];
  stage: (typeof LEAD_STAGES)[number];
}) {
  const palette: Record<(typeof LEAD_STAGES)[number], { bg: string; fg: string }> = {
    lead:      { bg: t.chip,       fg: t.ink2 },
    contacted: { bg: t.warnBg,     fg: t.warn },
    verified:  { bg: t.petrolSoft, fg: t.petrol },
  };
  const { bg, fg } = palette[stage];
  return <Pill bg={bg} color={fg}>{LEAD_STAGE_LABELS[stage]}</Pill>;
}
