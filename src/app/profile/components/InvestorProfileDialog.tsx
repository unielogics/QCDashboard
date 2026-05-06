"use client";

// Investor profile editor — dialog opened from /profile → "Investor Profile"
// row. Borrower-only (CLIENT role); other roles see a hint that the dialog
// doesn't apply to operator accounts.
//
// Edits land on /clients/me (PATCH) which only accepts the safe-to-self-edit
// fields — tier/FICO/funded totals stay broker/super-admin only.

import { useEffect, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { useMyClient, useUpdateMyClient } from "@/hooks/useApi";
import { QC_FMT } from "@/components/design-system/tokens";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function InvestorProfileDialog({ open, onClose }: Props) {
  const { t } = useTheme();
  const { data: client, isLoading, error } = useMyClient();
  const update = useUpdateMyClient();

  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [properties, setProperties] = useState("");
  const [experience, setExperience] = useState("");
  const [flash, setFlash] = useState<string | null>(null);

  // Hydrate the form whenever the modal opens (so a save → close → reopen
  // shows the freshly-saved values).
  useEffect(() => {
    if (open && client) {
      setPhone(client.phone ?? "");
      setAddress(client.address ?? "");
      setCity(client.city ?? "");
      setProperties(client.properties ?? "");
      setExperience(client.experience ?? "");
      setFlash(null);
    }
  }, [open, client]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = async () => {
    setFlash(null);
    try {
      await update.mutateAsync({
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        properties: properties.trim() || undefined,
        experience: experience.trim() || undefined,
      });
      setFlash("Saved.");
      setTimeout(() => setFlash(null), 1800);
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Save failed");
    }
  };

  // 404 from /clients/me means the signed-in user doesn't have a Client
  // record (operator account). Show a short explainer rather than the form.
  const isMissingClient = !!error && /404/.test(String((error as Error).message));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Investor profile"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(6, 7, 11, 0.55)",
        backdropFilter: "blur(2px)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 640,
          maxHeight: "92vh",
          overflowY: "auto",
          background: t.surface,
          borderRadius: 16,
          boxShadow: t.shadowLg,
          border: `1px solid ${t.line}`,
        }}
      >
        <div
          style={{
            padding: "16px 20px",
            borderBottom: `1px solid ${t.line}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 1.6,
                textTransform: "uppercase",
                color: t.petrol,
              }}
            >
              Profile
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: t.ink, marginTop: 2 }}>
              Investor Profile
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              all: "unset",
              cursor: "pointer",
              width: 30,
              height: 30,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 7,
              color: t.ink2,
            }}
          >
            <Icon name="x" size={15} />
          </button>
        </div>

        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          {isLoading && <div style={{ fontSize: 13, color: t.ink3 }}>Loading…</div>}

          {isMissingClient && (
            <div
              style={{
                padding: 14,
                borderRadius: 10,
                background: t.surface2,
                border: `1px solid ${t.line}`,
                fontSize: 13,
                color: t.ink2,
                lineHeight: 1.55,
              }}
            >
              Your account isn&apos;t linked to a borrower profile. The Investor Profile
              applies to borrower accounts — operator accounts manage names, phones,
              and addresses through <strong>Personal Info</strong> instead.
            </div>
          )}

          {client && (
            <>
              {/* Stats panel — read-only, set by underwriting */}
              <Card pad={14}>
                <SectionLabel>Underwriting status</SectionLabel>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                  <Stat
                    t={t}
                    label="Tier"
                    value={
                      <Pill bg={t.petrolSoft} color={t.petrol}>
                        {client.tier}
                      </Pill>
                    }
                  />
                  <Stat
                    t={t}
                    label="Funded loans"
                    value={
                      <span style={{ fontSize: 18, fontWeight: 800, color: t.ink, fontFeatureSettings: '"tnum"' }}>
                        {client.funded_count}
                      </span>
                    }
                  />
                  <Stat
                    t={t}
                    label="Funded total"
                    value={
                      <span style={{ fontSize: 18, fontWeight: 800, color: t.ink, fontFeatureSettings: '"tnum"' }}>
                        {QC_FMT.short(client.funded_total)}
                      </span>
                    }
                  />
                </div>
                <div style={{ fontSize: 11, color: t.ink3, marginTop: 8 }}>
                  Tier and funded totals are set by your loan officer — contact your
                  account exec to update.
                </div>
              </Card>

              {/* Contact info — borrower self-edit */}
              <Card pad={14}>
                <SectionLabel>Contact</SectionLabel>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Field t={t} label="Phone">
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(555) 555-1234"
                      style={inputStyle(t)}
                    />
                  </Field>
                  <Field t={t} label="City">
                    <input
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Charlotte, NC"
                      style={inputStyle(t)}
                    />
                  </Field>
                </div>
                <div style={{ marginTop: 12 }}>
                  <Field t={t} label="Mailing address">
                    <input
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="123 Main St, Apt 4"
                      style={inputStyle(t)}
                    />
                  </Field>
                </div>
              </Card>

              {/* Properties owned */}
              <Card pad={14}>
                <SectionLabel>Properties owned</SectionLabel>
                <div style={{ fontSize: 11.5, color: t.ink3, marginBottom: 8 }}>
                  Free-form — list addresses, types, current values, monthly rent. Your
                  underwriter and &quot;The Associate&quot; both read this when scoring deals.
                </div>
                <textarea
                  value={properties}
                  onChange={(e) => setProperties(e.target.value)}
                  rows={6}
                  placeholder={"e.g.\n418 Sycamore St, Charlotte NC — SFR rental — purchased 2022 for $312k, currently $2,400/mo rent\nLot 47 Riverbend, Austin TX — vacant land — purchased 2024 for $185k"}
                  style={{ ...inputStyle(t), resize: "vertical", lineHeight: 1.55 }}
                />
              </Card>

              {/* Experience */}
              <Card pad={14}>
                <SectionLabel>Experience</SectionLabel>
                <div style={{ fontSize: 11.5, color: t.ink3, marginBottom: 8 }}>
                  Years investing, completed flips, ground-up projects, current
                  rehab work in flight. Helps the underwriter waive experience-tier
                  thresholds when relevant.
                </div>
                <textarea
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                  rows={6}
                  placeholder={"e.g.\n5 years investing, 3 flips completed in last 24 months (avg gross profit $58k)\n1 ground-up SFR currently under construction in Charlotte\nManaged GC for all rehabs personally"}
                  style={{ ...inputStyle(t), resize: "vertical", lineHeight: 1.55 }}
                />
              </Card>

              {flash && (
                <Pill
                  bg={flash === "Saved." ? t.profitBg : t.dangerBg}
                  color={flash === "Saved." ? t.profit : t.danger}
                >
                  {flash}
                </Pill>
              )}
            </>
          )}
        </div>

        <div
          style={{
            padding: "12px 20px",
            borderTop: `1px solid ${t.line}`,
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button onClick={onClose} style={qcBtn(t)} disabled={update.isPending}>
            {client ? "Cancel" : "Close"}
          </button>
          {client && (
            <button onClick={submit} disabled={update.isPending} style={qcBtnPrimary(t)}>
              <Icon name="check" size={13} />
              {update.isPending ? "Saving…" : "Save profile"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ t, label, value }: { t: ReturnType<typeof useTheme>["t"]; label: string; value: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          color: t.ink3,
          letterSpacing: 1.2,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div style={{ marginTop: 6 }}>{value}</div>
    </div>
  );
}

function Field({ t, label, children }: { t: ReturnType<typeof useTheme>["t"]; label: string; children: React.ReactNode }) {
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
