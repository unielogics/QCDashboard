"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Icon } from "@/components/design-system/Icon";
import { ApiError, api } from "@/lib/api";

interface PublicBookingSlot {
  starts_at: string;
  label: string;
  date_label: string;
}

interface PublicBookingProfile {
  slug: string;
  agent_name: string;
  host_name: string;
  host_role: string;
  title: string;
  intro: string;
  primary_color: string;
  background_color: string;
  duration_min: number;
  timezone: string;
  logo_url: string | null;
  profile_photo_url: string | null;
  slots: PublicBookingSlot[];
}

interface BookingForm {
  full_name: string;
  email: string;
  phone: string;
  notes: string;
}

export default function PublicBookingPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;
  const [profile, setProfile] = useState<PublicBookingProfile | null>(null);
  const [selected, setSelected] = useState<PublicBookingSlot | null>(null);
  const [form, setForm] = useState<BookingForm>({ full_name: "", email: "", phone: "", notes: "" });
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "submitting" | "success">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!slug) return;
      setStatus("loading");
      setError(null);
      try {
        const data = await api<PublicBookingProfile>(`/public/booking/${slug}`);
        if (cancelled) return;
        setProfile(data);
        setSelected(data.slots[0] ?? null);
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        if (e instanceof ApiError && e.status === 404) setError("This booking page is not active.");
        else setError("Could not load this booking page.");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const groupedSlots = useMemo(() => {
    const groups: { date: string; slots: PublicBookingSlot[] }[] = [];
    for (const slot of profile?.slots ?? []) {
      let group = groups.find((x) => x.date === slot.date_label);
      if (!group) {
        group = { date: slot.date_label, slots: [] };
        groups.push(group);
      }
      group.slots.push(slot);
    }
    return groups;
  }, [profile?.slots]);

  const submit = async () => {
    if (!slug || !selected) return;
    setStatus("submitting");
    setError(null);
    try {
      await api<{ ok: boolean; event_id: string }>(`/public/booking/${slug}`, {
        method: "POST",
        body: JSON.stringify({ ...form, starts_at: selected.starts_at }),
      });
      setStatus("success");
    } catch (e) {
      setStatus("ready");
      if (e instanceof ApiError && e.status === 409) {
        setError("That time was just taken. Pick another available slot.");
      } else if (e instanceof ApiError && e.status === 429) {
        setError("Please wait a moment before trying again.");
      } else {
        setError("Could not create the booking. Check the required fields and try again.");
      }
    }
  };

  const bg = profile?.background_color || "#05070d";
  const accent = profile?.primary_color || "#5eead4";

  if (status === "loading") {
    return <Shell background={bg} accent={accent}><Centered>Loading booking page...</Centered></Shell>;
  }
  if (status === "error" || !profile) {
    return (
      <Shell background={bg} accent={accent}>
        <Centered>
          <h1 style={{ margin: 0, fontSize: 28 }}>Booking page unavailable</h1>
          <p style={{ margin: "10px 0 0", color: "rgba(255,255,255,0.68)" }}>{error}</p>
        </Centered>
      </Shell>
    );
  }
  if (status === "success") {
    return (
      <Shell background={bg} accent={accent}>
        <Centered>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: accent, color: bg, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
            <Icon name="check" size={22} stroke={2.6} />
          </div>
          <h1 style={{ margin: 0, fontSize: 30 }}>You are booked</h1>
          <p style={{ margin: "10px 0 0", color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}>
            The meeting was added to {profile.agent_name}&apos;s calendar. You can close this page.
          </p>
        </Centered>
      </Shell>
    );
  }

  return (
    <Shell background={bg} accent={accent}>
      <main style={{ width: "min(1120px, calc(100vw - 32px))", margin: "0 auto", padding: "44px 0" }}>
        <header style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 18, alignItems: "start", marginBottom: 24 }}>
          <div>
            {profile.logo_url ? (
              <img
                src={profile.logo_url}
                alt=""
                style={{ maxWidth: 220, maxHeight: 54, objectFit: "contain", marginBottom: 22, display: "block" }}
              />
            ) : (
              <div style={{ color: accent, fontSize: 13, fontWeight: 950, letterSpacing: 1.8, textTransform: "uppercase", marginBottom: 22 }}>
                Qualified Commercial
              </div>
            )}
            <div style={{ color: accent, fontSize: 12, fontWeight: 900, letterSpacing: 1.6, textTransform: "uppercase" }}>
              {profile.duration_min} minute meeting
            </div>
            <h1 style={{ color: "#fff", margin: "10px 0 8px", fontSize: "clamp(30px, 5vw, 58px)", lineHeight: 1.02 }}>
              {profile.title}
            </h1>
            <p style={{ color: "rgba(255,255,255,0.72)", fontSize: 16, lineHeight: 1.6, maxWidth: 680, margin: 0 }}>
              {profile.intro}
            </p>
          </div>
          <div style={{ border: "1px solid rgba(255,255,255,0.14)", borderRadius: 16, padding: 14, color: "rgba(255,255,255,0.76)", minWidth: 240, background: "rgba(255,255,255,0.055)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 58, height: 58, borderRadius: 16, overflow: "hidden", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.16)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                {profile.profile_photo_url ? (
                  <img src={profile.profile_photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <Icon name="user" size={24} />
                )}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: "#fff", fontWeight: 900 }}>{profile.host_name || profile.agent_name}</div>
                <div style={{ fontSize: 12, marginTop: 4, textTransform: "capitalize" }}>{profile.host_role.replace(/_/g, " ")}</div>
              </div>
            </div>
            <div style={{ fontSize: 12, marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.12)" }}>{profile.timezone}</div>
          </div>
        </header>

        <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.05fr) minmax(340px, 0.75fr)", gap: 18, alignItems: "start" }}>
          <div style={panelStyle()}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <Icon name="cal" size={18} />
              <h2 style={{ margin: 0, fontSize: 18 }}>Choose a time</h2>
            </div>
            {groupedSlots.length === 0 ? (
              <p style={{ color: "rgba(255,255,255,0.66)", margin: 0 }}>
                No available slots are currently open. Please check back later.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {groupedSlots.slice(0, 7).map((group) => (
                  <div key={group.date}>
                    <div style={{ color: "rgba(255,255,255,0.62)", fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8 }}>
                      {group.date}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(124px, 1fr))", gap: 8 }}>
                      {group.slots.map((slot) => {
                        const active = selected?.starts_at === slot.starts_at;
                        return (
                          <button
                            key={slot.starts_at}
                            onClick={() => setSelected(slot)}
                            style={{
                              border: `1px solid ${active ? accent : "rgba(255,255,255,0.14)"}`,
                              background: active ? accent : "rgba(255,255,255,0.06)",
                              color: active ? bg : "#fff",
                              borderRadius: 9,
                              padding: "10px 12px",
                              cursor: "pointer",
                              fontSize: 13,
                              fontWeight: 900,
                            }}
                          >
                            {slot.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={panelStyle()}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <Icon name="user" size={18} />
              <h2 style={{ margin: 0, fontSize: 18 }}>Your details</h2>
            </div>
            {selected ? (
              <div style={{ color: accent, fontSize: 13, fontWeight: 900, marginBottom: 14 }}>
                {selected.date_label} at {selected.label}
              </div>
            ) : null}
            <div style={{ display: "grid", gap: 10 }}>
              <BookingInput label="Name" value={form.full_name} onChange={(v) => setForm((f) => ({ ...f, full_name: v }))} required />
              <BookingInput label="Email" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} required />
              <BookingInput label="Phone" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
              <label style={{ display: "grid", gap: 5 }}>
                <span style={labelStyle()}>Notes</span>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={4}
                  style={inputStyle()}
                />
              </label>
              {error ? <div style={{ color: "#fca5a5", fontSize: 12.5 }}>{error}</div> : null}
              <button
                onClick={submit}
                disabled={!selected || !form.full_name || !form.email || status === "submitting"}
                style={{
                  border: "none",
                  borderRadius: 10,
                  padding: "12px 14px",
                  background: accent,
                  color: bg,
                  fontSize: 14,
                  fontWeight: 950,
                  cursor: !selected || !form.full_name || !form.email || status === "submitting" ? "not-allowed" : "pointer",
                  opacity: !selected || !form.full_name || !form.email || status === "submitting" ? 0.55 : 1,
                }}
              >
                {status === "submitting" ? "Booking..." : "Book meeting"}
              </button>
            </div>
          </div>
        </section>
      </main>
    </Shell>
  );
}

function Shell({ background, accent, children }: { background: string; accent: string; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background, color: "#fff", borderTop: `4px solid ${accent}` }}>
      {children}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "min(520px, 100%)", textAlign: "center", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 16, padding: 28, background: "rgba(255,255,255,0.05)" }}>
        {children}
      </div>
    </div>
  );
}

function BookingInput({ label, value, onChange, required }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  return (
    <label style={{ display: "grid", gap: 5 }}>
      <span style={labelStyle()}>{label}{required ? " *" : ""}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle()} />
    </label>
  );
}

function panelStyle(): React.CSSProperties {
  return {
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.055)",
    borderRadius: 16,
    padding: 18,
    boxShadow: "0 18px 50px rgba(0,0,0,0.24)",
  };
}

function labelStyle(): React.CSSProperties {
  return {
    color: "rgba(255,255,255,0.64)",
    fontSize: 11,
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: 1.1,
  };
}

function inputStyle(): React.CSSProperties {
  return {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 9,
    background: "rgba(255,255,255,0.07)",
    color: "#fff",
    padding: "10px 11px",
    outline: "none",
    fontSize: 14,
    resize: "vertical",
  };
}
