"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, KPI, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { useClient, useCurrentCredit, useLoans, useUpdateClient } from "@/hooks/useApi";
import { useActiveProfile } from "@/store/role";
import { QC_FMT } from "@/components/design-system/tokens";
import { parseIntStrict } from "@/lib/formCoerce";
import type { Client } from "@/lib/types";

export default function ClientDetailPage() {
  const { t } = useTheme();
  const profile = useActiveProfile();
  const { id } = useParams<{ id: string }>();
  const { data: client } = useClient(id);
  const { data: loans = [] } = useLoans();
  const { data: credit } = useCurrentCredit(id);
  const updateClient = useUpdateClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<Client>>({});
  const [error, setError] = useState<string | null>(null);

  const canEdit = profile.role !== "client";

  useEffect(() => {
    if (client) {
      setDraft({
        name: client.name,
        email: client.email ?? "",
        phone: client.phone ?? "",
        city: client.city ?? "",
        tier: client.tier,
        fico: client.fico,
      });
    }
  }, [client?.id]);

  if (!client) return <div style={{ color: t.ink3 }}>Loading…</div>;

  const clientLoans = loans.filter((l) => l.client_id === client.id);
  const exposure = clientLoans.reduce((s, l) => s + Number(l.amount), 0);

  const handleSave = async () => {
    setError(null);
    try {
      await updateClient.mutateAsync({
        clientId: client.id,
        name: (draft.name ?? client.name).toString(),
        email: draft.email ?? null,
        phone: draft.phone ?? null,
        city: draft.city ?? null,
        tier: (draft.tier ?? client.tier).toString(),
        fico: draft.fico == null || draft.fico === ("" as unknown as number) ? null : Number(draft.fico),
      });
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card pad={20}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 56, height: 56, borderRadius: 28, background: client.avatar_color ?? t.petrol, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, flexShrink: 0 }}>
            {client.name.split(" ").map(n => n[0]).slice(0, 2).join("")}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: t.ink, margin: 0 }}>{client.name}</h1>
            <div style={{ fontSize: 13, color: t.ink3 }}>{client.email ?? "—"} · {client.phone ?? "—"} · {client.city ?? "—"}</div>
          </div>
          <Pill>{client.tier}</Pill>
          {canEdit && !editing && (
            <button
              onClick={() => setEditing(true)}
              style={{
                padding: "8px 12px", borderRadius: 9, background: t.surface2, color: t.ink,
                border: `1px solid ${t.line}`, fontSize: 12, fontWeight: 700,
                display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer",
              }}
            >
              <Icon name="gear" size={12} /> Edit
            </button>
          )}
        </div>
      </Card>

      {editing && canEdit && (
        <Card pad={20}>
          <SectionLabel>Edit profile</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field t={t} label="Name">
              <Input t={t} value={(draft.name ?? "") as string} onChange={(v) => setDraft((d) => ({ ...d, name: v }))} />
            </Field>
            <Field t={t} label="Email">
              <Input t={t} value={(draft.email ?? "") as string} onChange={(v) => setDraft((d) => ({ ...d, email: v }))} />
            </Field>
            <Field t={t} label="Phone">
              <Input t={t} value={(draft.phone ?? "") as string} onChange={(v) => setDraft((d) => ({ ...d, phone: v }))} />
            </Field>
            <Field t={t} label="City">
              <Input t={t} value={(draft.city ?? "") as string} onChange={(v) => setDraft((d) => ({ ...d, city: v }))} />
            </Field>
            <Field t={t} label="Tier">
              <select
                value={(draft.tier ?? "standard") as string}
                onChange={(e) => setDraft((d) => ({ ...d, tier: e.target.value }))}
                style={{
                  width: "100%", padding: "10px 12px", borderRadius: 9, background: t.surface2,
                  border: `1px solid ${t.line}`, color: t.ink, fontSize: 13, fontFamily: "inherit",
                }}
              >
                <option value="standard">Standard</option>
                <option value="Tier I">Tier I</option>
                <option value="Tier II">Tier II</option>
                <option value="Tier III">Tier III</option>
              </select>
            </Field>
            <Field t={t} label="FICO (300–850)">
              <Input
                t={t}
                value={draft.fico != null ? String(draft.fico) : ""}
                onChange={(v) => setDraft((d) => ({ ...d, fico: (parseIntStrict(v) || null) as Client["fico"] }))}
                placeholder="720"
              />
            </Field>
          </div>
          {error && <div style={{ color: t.danger, fontSize: 12, fontWeight: 700, marginTop: 10 }}>{error}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
            <button onClick={() => setEditing(false)} style={qcBtn(t)}>Cancel</button>
            <button
              onClick={handleSave}
              disabled={updateClient.isPending}
              style={{ ...qcBtnPrimary(t), opacity: updateClient.isPending ? 0.6 : 1, cursor: updateClient.isPending ? "wait" : "pointer" }}
            >
              <Icon name="check" size={13} />
              {updateClient.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <KPI label="Exposure" value={QC_FMT.short(exposure)} />
        <KPI label="Active loans" value={clientLoans.length} />
        <KPI label="FICO" value={client.fico ?? "—"} />
        <KPI label="Funded" value={QC_FMT.short(Number(client.funded_total))} />
      </div>

      {/* Credit pull widget */}
      {credit && (
        <Card pad={16}>
          <SectionLabel>Latest credit pull</SectionLabel>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ fontSize: 36, fontWeight: 800, color: t.ink, fontFeatureSettings: '"tnum"' }}>
              {credit.fico ?? "—"}
            </div>
            <div style={{ flex: 1 }}>
              <Pill bg={
                credit.status === "completed" ? t.profitBg : credit.status === "expired" ? t.warnBg : t.chip
              } color={
                credit.status === "completed" ? t.profit : credit.status === "expired" ? t.warn : t.ink2
              }>
                {credit.status}
              </Pill>
              <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 4 }}>
                {credit.pulled_at ? `Pulled ${new Date(credit.pulled_at).toLocaleDateString()}` : "Not pulled"}
                {credit.expires_at && ` · expires ${new Date(credit.expires_at).toLocaleDateString()}`}
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card pad={16}>
        <SectionLabel>Loans</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {clientLoans.length === 0 && <div style={{ fontSize: 13, color: t.ink3 }}>No loans for this client yet.</div>}
          {clientLoans.map((l) => (
            <Link key={l.id} href={`/loans/${l.id}`} style={{ display: "flex", gap: 10, padding: "10px 12px", borderRadius: 10, border: `1px solid ${t.line}`, textDecoration: "none", alignItems: "center" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: t.ink3, width: 80 }}>{l.deal_id}</div>
              <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: t.ink }}>{l.address}</div>
              <Pill>{l.type.replace("_", " ")}</Pill>
              <div style={{ fontWeight: 700, fontFeatureSettings: '"tnum"', color: t.ink }}>{QC_FMT.short(Number(l.amount))}</div>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Field({ t, label, children }: { t: ReturnType<typeof useTheme>["t"]; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.0, textTransform: "uppercase", marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function Input({ t, value, onChange, placeholder }: { t: ReturnType<typeof useTheme>["t"]; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%", padding: "10px 12px", borderRadius: 9, background: t.surface2,
        border: `1px solid ${t.line}`, color: t.ink, fontSize: 13, fontFamily: "inherit", outline: "none",
      }}
    />
  );
}
