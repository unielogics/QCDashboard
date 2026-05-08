"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { useBrokers, useCreateClient, useCurrentUser } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";

export default function NewClientPage() {
  const { t } = useTheme();
  const router = useRouter();
  const createClient = useCreateClient();
  const { data: user } = useCurrentUser();
  const { data: brokers = [] } = useBrokers();

  // Referral source + Assign broker are management metadata, not Agent-side
  // intake fields. The Agent is auto-linked as the broker on the new row
  // server-side (their user_id is the broker_id). Only Super Admin sees and
  // edits these — they manage attribution + cross-Agent assignment.
  const isAdmin = user?.role === Role.SUPER_ADMIN;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [referralSource, setReferralSource] = useState("");
  const [brokerId, setBrokerId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0;

  const handleSubmit = async () => {
    setError(null);
    if (!canSubmit) return;
    try {
      const created = await createClient.mutateAsync({
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        city: city.trim() || undefined,
        // Only forward these when the creator is a Super Admin. For Agents,
        // the backend auto-stamps broker_id from the JWT and leaves
        // referral_source null until/unless an admin fills it in later.
        referral_source: isAdmin ? referralSource.trim() || undefined : undefined,
        broker_id: isAdmin ? brokerId || undefined : undefined,
      });
      router.push(`/clients/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create client.");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 640 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Link href="/clients" style={{ background: "transparent", border: "none", color: t.ink3, fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Icon name="chevL" size={13} /> Back to clients
        </Link>
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: t.ink, margin: 0 }}>New client</h1>

      <Card pad={20}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field t={t} label="Name" required>
            <Input t={t} value={name} onChange={setName} placeholder="Marcus Holloway" />
          </Field>
          <Field t={t} label="Email">
            <Input t={t} type="email" value={email} onChange={setEmail} placeholder="marcus@holloway.cap" />
          </Field>
          <Field t={t} label="Phone">
            <Input t={t} value={phone} onChange={setPhone} placeholder="(917) 555-0148" />
          </Field>
          <Field t={t} label="City">
            <Input t={t} value={city} onChange={setCity} placeholder="Brooklyn, NY" />
          </Field>
          {/* Super-admin-only: referral source + broker assignment are file-
              management concerns, not intake. Agents auto-link as the broker. */}
          {isAdmin && (
            <>
              <Field t={t} label="Referral source" full>
                <Input t={t} value={referralSource} onChange={setReferralSource} placeholder="Direct, broker network, etc." />
              </Field>
              <Field t={t} label="Assign broker" full>
                <select
                  value={brokerId}
                  onChange={(e) => setBrokerId(e.target.value)}
                  style={{
                    width: "100%", padding: "10px 12px", borderRadius: 9, background: t.surface2,
                    border: `1px solid ${t.line}`, color: t.ink, fontSize: 13, fontFamily: "inherit",
                  }}
                >
                  <option value="">Auto-assign</option>
                  {brokers.map((b) => (
                    <option key={b.id} value={b.id}>{b.display_name} · {b.tier}</option>
                  ))}
                </select>
              </Field>
            </>
          )}
        </div>
        {error && <div style={{ color: t.danger, fontSize: 12, fontWeight: 700, marginTop: 12 }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Link href="/clients" style={{ ...qcBtn(t), textDecoration: "none" }}>Cancel</Link>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || createClient.isPending}
            style={{ ...qcBtnPrimary(t), opacity: canSubmit && !createClient.isPending ? 1 : 0.5, cursor: canSubmit && !createClient.isPending ? "pointer" : "not-allowed" }}
          >
            <Icon name="plus" size={13} />
            {createClient.isPending ? "Creating…" : "Create client"}
          </button>
        </div>
      </Card>
    </div>
  );
}

function Field({ t, label, required, children, full }: { t: ReturnType<typeof useTheme>["t"]; label: string; required?: boolean; children: React.ReactNode; full?: boolean }) {
  return (
    <div style={{ gridColumn: full ? "1 / -1" : "auto" }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.0, textTransform: "uppercase", marginBottom: 6 }}>
        {label} {required && <span style={{ color: t.danger }}>*</span>}
      </div>
      {children}
    </div>
  );
}

function Input({ t, value, onChange, placeholder, type = "text" }: { t: ReturnType<typeof useTheme>["t"]; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input
      type={type}
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
