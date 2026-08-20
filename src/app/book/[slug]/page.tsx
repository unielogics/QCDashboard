"use client";

// The public booking page. A stranger's first impression of the firm, reached
// from a link with no account and no context.
//
// It was the last surface still rendering the retired dark language: a
// near-black ground, a teal accent, white-on-white the moment a host picked a
// light background_color, and 24 hardcoded rgba literals. It is now on the
// light token set, locked there deliberately.
//
// Locked, not themed: this page is read by people who have never seen the
// console and have no stored preference, so inheriting an operator's dark mode
// would be arbitrary. It reads QC_TOKENS.light directly rather than useTheme(),
// which also keeps it out of the provider's persistence entirely.
//
// The host's primary_color is still honoured, but as an accent only. It no
// longer paints the page ground, so a host cannot make their own page
// unreadable by choosing a pale colour.

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Icon } from "@/components/design-system/Icon";
import { QC_TOKENS, withAlpha } from "@/components/design-system/tokens";

const t = QC_TOKENS.light;

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

/**
 * Text that stays legible on an arbitrary host-chosen accent.
 *
 * primary_color is a free colour input, so a host can pick #FFFF00. Relative
 * luminance decides black or white rather than assuming a dark accent, which is
 * what the previous version did.
 */
function onAccent(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || "").trim());
  if (!m) return "#FFFFFF";
  const int = parseInt(m[1], 16);
  const chan = [(int >> 16) & 255, (int >> 8) & 255, int & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  const L = 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2];
  return L > 0.45 ? t.ink : "#FFFFFF";
}

export default function PublicBookingPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const [profile, setProfile] = useState<PublicBookingProfile | null>(null);
  const [selected, setSelected] = useState<PublicBookingSlot | null>(null);
  const [dayIndex, setDayIndex] = useState(0);
  const [form, setForm] = useState<BookingForm>({ full_name: "", email: "", phone: "", notes: "" });
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "submitting" | "success">("loading");
  const [error, setError] = useState<string | null>(null);
  const detailsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await api<PublicBookingProfile>(`/public/booking/${slug}`);
        if (cancelled) return;
        setProfile(data);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        const status404 = (err as { status?: number })?.status === 404;
        setError(
          status404
            ? "This booking page is not active."
            : "Could not load this booking page.",
        );
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const days = useMemo(() => {
    const groups: { date: string; slots: PublicBookingSlot[] }[] = [];
    for (const slot of profile?.slots ?? []) {
      const last = groups[groups.length - 1];
      if (last && last.date === slot.date_label) last.slots.push(slot);
      else groups.push({ date: slot.date_label, slots: [slot] });
    }
    return groups;
  }, [profile]);

  const accent = profile?.primary_color || t.brand;
  const accentInk = onAccent(accent);
  const activeDay = days[Math.min(dayIndex, Math.max(0, days.length - 1))];

  const pick = (slot: PublicBookingSlot) => {
    setSelected(slot);
    // On a phone the form is below the fold, so a pick that produces no visible
    // change reads as a dead tap.
    window.setTimeout(() => {
      detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 60);
  };

  const canSubmit =
    !!selected && form.full_name.trim().length > 0 && /\S+@\S+\.\S+/.test(form.email);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !canSubmit) return;
    setStatus("submitting");
    setError(null);
    try {
      await api<{ ok: boolean; event_id: string }>(`/public/booking/${slug}`, {
        method: "POST",
        body: JSON.stringify({ ...form, starts_at: selected.starts_at }),
      });
      setStatus("success");
    } catch (err) {
      const code = (err as { status?: number })?.status;
      setStatus("ready");
      setError(
        code === 409
          ? "That time was just taken. Pick another one."
          : code === 429
            ? "One moment, then try again."
            : "Could not complete the booking. Check your details and try again.",
      );
    }
  };

  // ---- states ------------------------------------------------------------

  if (status === "loading") {
    return (
      <Frame>
        <Centered>
          <div style={{ color: t.ink3, fontSize: 14 }}>Loading…</div>
        </Centered>
      </Frame>
    );
  }

  if (status === "error" || !profile) {
    return (
      <Frame>
        <Centered>
          <h1 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 800, color: t.ink }}>
            Booking page unavailable
          </h1>
          <p style={{ margin: 0, color: t.ink3, fontSize: 14, lineHeight: 1.6 }}>{error}</p>
        </Centered>
      </Frame>
    );
  }

  if (status === "success") {
    const host = profile.host_name || profile.agent_name;
    return (
      <Frame>
        <Centered>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 999,
              display: "grid",
              placeItems: "center",
              background: withAlpha(t.profit, 0.14),
              color: t.profit,
              margin: "0 auto 16px",
            }}
          >
            <Icon name="check" size={22} stroke={2.6} />
          </div>
          <h1 style={{ margin: "0 0 8px", fontSize: 24, fontWeight: 800, color: t.ink }}>
            You are booked
          </h1>
          <p style={{ margin: "0 0 14px", color: t.ink2, fontSize: 14, lineHeight: 1.65 }}>
            {selected?.date_label} at {selected?.label}, with {host}.
          </p>
          <div
            style={{
              padding: 14,
              borderRadius: 12,
              background: t.surface2,
              border: `1px solid ${t.line}`,
              color: t.ink3,
              fontSize: 13,
              lineHeight: 1.6,
              textAlign: "left",
            }}
          >
            A calendar invitation is on its way to{" "}
            <strong style={{ color: t.ink }}>{form.email}</strong>. Accept it and the meeting
            lands on your calendar with everything you need to join.
          </div>
        </Centered>
      </Frame>
    );
  }

  // ---- the page ----------------------------------------------------------

  const host = profile.host_name || profile.agent_name;
  const role = profile.host_role
    ? profile.host_role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "";

  return (
    <Frame accent={accent}>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "0 16px 64px" }}>
        {/* Header */}
        <header style={{ padding: "40px 0 28px" }}>
          {profile.logo_url ? (
            <img
              src={profile.logo_url}
              alt=""
              style={{ height: 34, width: "auto", objectFit: "contain", marginBottom: 20 }}
            />
          ) : (
            <div
              style={{
                fontSize: 13,
                fontWeight: 800,
                letterSpacing: 0.2,
                color: t.ink,
                marginBottom: 20,
              }}
            >
              Qualified Commercial
            </div>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <Chip accent={accent}>{profile.duration_min} minutes</Chip>
            <Chip>
              <Icon name="audit" size={12} style={{ marginRight: 5, verticalAlign: -1 }} />
              {profile.timezone.replace(/_/g, " ")}
            </Chip>
          </div>

          <h1
            style={{
              margin: "0 0 10px",
              fontSize: "clamp(28px, 4.6vw, 44px)",
              lineHeight: 1.1,
              letterSpacing: -0.8,
              fontWeight: 800,
              color: t.ink,
              fontFamily: "var(--font-inter-tight), inherit",
              maxWidth: 720,
            }}
          >
            {profile.title}
          </h1>
          {profile.intro && (
            <p style={{ margin: 0, maxWidth: 620, color: t.ink3, fontSize: 15, lineHeight: 1.65 }}>
              {profile.intro}
            </p>
          )}

          {/* Host */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 22 }}>
            {profile.profile_photo_url ? (
              <img
                src={profile.profile_photo_url}
                alt=""
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 999,
                  objectFit: "cover",
                  border: `1px solid ${t.line}`,
                }}
              />
            ) : (
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 999,
                  display: "grid",
                  placeItems: "center",
                  background: withAlpha(accent, 0.12),
                  color: accent,
                }}
              >
                <Icon name="user" size={19} />
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: t.ink }}>{host}</div>
              {role && <div style={{ fontSize: 12.5, color: t.ink3 }}>{role}</div>}
            </div>
          </div>
        </header>

        <div
          style={{
            display: "grid",
            gap: 20,
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            alignItems: "start",
          }}
        >
          {/* Slots */}
          <Panel title="Pick a time" icon="cal">
            {days.length === 0 ? (
              <p style={{ margin: 0, color: t.ink3, fontSize: 13.5, lineHeight: 1.6 }}>
                No times are open at the moment. Please check back shortly.
              </p>
            ) : (
              <>
                {/* Day rail. The old page dumped up to seven dates at once, which
                    on a phone was a wall of buttons. */}
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    overflowX: "auto",
                    paddingBottom: 10,
                    marginBottom: 14,
                    borderBottom: `1px solid ${t.line}`,
                  }}
                >
                  {days.map((d, i) => {
                    const on = i === Math.min(dayIndex, days.length - 1);
                    return (
                      <button
                        key={d.date}
                        type="button"
                        onClick={() => setDayIndex(i)}
                        aria-pressed={on}
                        style={{
                          flex: "0 0 auto",
                          padding: "8px 13px",
                          borderRadius: 999,
                          fontSize: 12.5,
                          fontWeight: 700,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                          border: `1px solid ${on ? accent : t.line}`,
                          background: on ? withAlpha(accent, 0.1) : t.surface,
                          color: on ? accent : t.ink2,
                        }}
                      >
                        {d.date}
                        <span style={{ marginLeft: 6, color: on ? accent : t.ink4, fontWeight: 600 }}>
                          {d.slots.length}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))",
                    gap: 8,
                  }}
                >
                  {(activeDay?.slots ?? []).map((slot) => {
                    const on = selected?.starts_at === slot.starts_at;
                    return (
                      <button
                        key={slot.starts_at}
                        type="button"
                        onClick={() => pick(slot)}
                        aria-pressed={on}
                        style={{
                          padding: "11px 8px",
                          borderRadius: 10,
                          fontSize: 13.5,
                          fontWeight: 700,
                          cursor: "pointer",
                          fontVariantNumeric: "tabular-nums",
                          border: `1px solid ${on ? accent : t.lineStrong}`,
                          background: on ? accent : t.surface,
                          color: on ? accentInk : t.ink,
                          transition: "background 120ms, border-color 120ms",
                        }}
                      >
                        {slot.label}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </Panel>

          {/* Details */}
          <div ref={detailsRef}>
            <Panel title="Your details" icon="user">
              <form onSubmit={submit} noValidate>
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    marginBottom: 16,
                    fontSize: 13,
                    fontWeight: 600,
                    background: selected ? withAlpha(accent, 0.09) : t.surface2,
                    border: `1px solid ${selected ? withAlpha(accent, 0.3) : t.line}`,
                    color: selected ? t.ink : t.ink3,
                  }}
                >
                  {selected
                    ? `${selected.date_label} at ${selected.label}`
                    : "Pick a time to continue"}
                </div>

                <Field label="Full name" required>
                  <input
                    style={inputStyle}
                    value={form.full_name}
                    onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                    autoComplete="name"
                    required
                  />
                </Field>
                <Field label="Email" required>
                  <input
                    style={inputStyle}
                    type="email"
                    inputMode="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    autoComplete="email"
                    required
                  />
                </Field>
                <Field label="Phone">
                  <input
                    style={inputStyle}
                    type="tel"
                    inputMode="tel"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    autoComplete="tel"
                  />
                </Field>
                <Field label="What would you like to cover?">
                  <textarea
                    style={{ ...inputStyle, minHeight: 88, resize: "vertical" }}
                    rows={3}
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </Field>

                {error && (
                  <div
                    role="alert"
                    style={{
                      marginBottom: 12,
                      padding: "9px 12px",
                      borderRadius: 9,
                      fontSize: 13,
                      background: t.dangerBg,
                      color: t.danger,
                      border: `1px solid ${withAlpha(t.danger, 0.25)}`,
                    }}
                  >
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!canSubmit || status === "submitting"}
                  style={{
                    width: "100%",
                    padding: "13px 18px",
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: canSubmit && status !== "submitting" ? "pointer" : "not-allowed",
                    border: "none",
                    background: canSubmit ? accent : t.chip,
                    color: canSubmit ? accentInk : t.ink4,
                    transition: "background 120ms",
                  }}
                >
                  {status === "submitting" ? "Booking…" : "Confirm booking"}
                </button>

                <p style={{ margin: "12px 0 0", fontSize: 12, lineHeight: 1.55, color: t.ink4 }}>
                  You will get a calendar invitation by email. No account needed.
                </p>
              </form>
            </Panel>
          </div>
        </div>
      </div>
    </Frame>
  );
}

// ---- pieces --------------------------------------------------------------

function Frame({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: t.bg,
        color: t.ink,
        // The page renders inside the app shell's own ground, which follows the
        // operator's theme. This must cover it completely or a dark-mode
        // visitor sees the wrong colour bleed at the edges.
        borderTop: accent ? `3px solid ${accent}` : undefined,
        fontFamily: "var(--font-inter), system-ui, sans-serif",
      }}
    >
      {children}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div
        style={{
          maxWidth: 420,
          width: "100%",
          textAlign: "center",
          background: t.surface,
          border: `1px solid ${t.line}`,
          borderRadius: 16,
          padding: 32,
          boxShadow: t.shadow,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Panel({
  title,
  icon,
  children,
}: {
  title: string;
  icon: "cal" | "user";
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: t.surface,
        border: `1px solid ${t.line}`,
        borderRadius: 16,
        padding: 20,
        boxShadow: t.shadow,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <Icon name={icon} size={16} style={{ color: t.ink3 }} />
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: t.ink, letterSpacing: -0.1 }}>
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function Chip({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "5px 11px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        background: accent ? withAlpha(accent, 0.1) : t.chip,
        color: accent || t.ink2,
      }}
    >
      {children}
    </span>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block", marginBottom: 13 }}>
      <span
        style={{
          display: "block",
          marginBottom: 6,
          fontSize: 11.5,
          fontWeight: 700,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          color: t.ink3,
        }}
      >
        {label}
        {required && <span style={{ color: t.danger, marginLeft: 3 }}>*</span>}
      </span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 9,
  border: `1px solid ${t.lineStrong}`,
  background: t.surface,
  color: t.ink,
  fontSize: 14,
  fontFamily: "inherit",
  outline: "none",
};
