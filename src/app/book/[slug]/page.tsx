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
//
// Styling only: migrated onto the plain-CSS design system. The "locked light"
// note above is now free — globals.css IS the light palette and carries no dark
// block at all, so `.panel` / `.btn` / `.field` here render exactly what the
// signed-in console renders. QC_TOKENS.light survives in only two places, both
// marked: withAlpha() needs a concrete hex to composite against, and a CSS
// custom property is a string this page cannot do colour maths on. Every
// host-accent colour stays inline because it is data, not design.

import { useEffect, useMemo, useRef, useState } from "react";
import { V } from "@/components/design-system/cssVars";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Card, Textarea, cx } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { withAlpha } from "@/lib/color";


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
  /** The exact consent sentence the server stores as proof; rendered verbatim. */
  sms_disclosure_text?: string;
  precall_enabled?: boolean;
}

interface PublicBookingCreated {
  ok: boolean;
  event_id: string;
  room_url: string | null;
  pin_delivered_via: string | null;
}

interface BookingForm {
  full_name: string;
  email: string;
  phone: string;
  notes: string;
  transactional_sms_consent: boolean;
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
  return L > 0.45 ? V.ink : "#FFFFFF";
}

export default function PublicBookingPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const [profile, setProfile] = useState<PublicBookingProfile | null>(null);
  const [selected, setSelected] = useState<PublicBookingSlot | null>(null);
  const [dayIndex, setDayIndex] = useState(0);
  const [form, setForm] = useState<BookingForm>({
    full_name: "",
    email: "",
    phone: "",
    notes: "",
    transactional_sms_consent: false,
  });
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "submitting" | "success">("loading");
  const [booked, setBooked] = useState<PublicBookingCreated | null>(null);
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

  const accent = profile?.primary_color || V.brand;
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
      const created = await api<PublicBookingCreated>(`/public/booking/${slug}`, {
        method: "POST",
        body: JSON.stringify({ ...form, starts_at: selected.starts_at }),
      });
      setBooked(created);
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
          <span className="sub">Loading…</span>
        </Centered>
      </Frame>
    );
  }

  if (status === "error" || !profile) {
    return (
      <Frame>
        <Centered>
          <h1>Booking page unavailable</h1>
          <p className="sub" style={{ marginTop: 8, lineHeight: 1.6 }}>{error}</p>
        </Centered>
      </Frame>
    );
  }

  if (status === "success") {
    const host = profile.host_name || profile.agent_name;
    return (
      <Frame>
        <Centered>
          {/* Bespoke: a 46px success medallion. `.botmark` is the square
              38px mark and the wrong shape for a confirmation. */}
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 999,
              display: "grid",
              placeItems: "center",
              background: "var(--ok-tint)",
              color: "var(--ok)",
              margin: "0 auto 16px",
            }}
          >
            <Icon name="check" size={22} stroke={2.6} />
          </div>
          <h1>You are booked</h1>
          <p style={{ margin: "8px 0 14px", lineHeight: 1.65 }}>
            {selected?.date_label} at {selected?.label}, with {host}.
          </p>
          <div className="itemrow" style={{ textAlign: "left", lineHeight: 1.6 }}>
            <span className="sub">
              A calendar invitation is on its way to <strong>{form.email}</strong>. Accept it and the
              meeting lands on your calendar with everything you need to join.
            </span>
          </div>
          {booked?.room_url ? (
            <div className="itemrow" style={{ textAlign: "left", lineHeight: 1.6, marginTop: 10, display: "grid", gap: 10 }}>
              <span className="sub">
                <strong>Get ready before the call — about 10 minutes.</strong> Confirm who owns the business,
                connect the business bank and authorize a soft credit check in your secure room, so {host} can
                talk real numbers on the call. Your room PIN was {booked.pin_delivered_via === "sms" ? "texted to you" : "emailed to you separately"}.
              </span>
              <a className="btn pri" href={`${booked.room_url}?tab=precall`} style={accent ? { background: accent, borderColor: accent, color: accentInk } : undefined}>
                Open my secure room
              </a>
            </div>
          ) : null}
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
            <div style={{ fontWeight: 800, marginBottom: 20 }}>Qualified Commercial</div>
          )}

          <div className="row" style={{ marginBottom: 12 }}>
            <Chip accent={accent}>{profile.duration_min} minutes</Chip>
            <Chip>
              <Icon name="audit" size={12} />
              {profile.timezone.replace(/_/g, " ")}
            </Chip>
          </div>

          {/* Hero display type. This is the only heading in the product sized
              for a stranger's first screen — `.hd h1` is 23px, which is a
              console page title. Weight, face and tracking stay with the
              stylesheet; only the scale and the measure are declared here. */}
          <h1
            style={{
              marginBottom: 10,
              fontSize: "clamp(28px, 4.6vw, 44px)",
              lineHeight: 1.1,
              maxWidth: 720,
            }}
          >
            {profile.title}
          </h1>
          {profile.intro && (
            /* Hero-scale prose, same reasoning as the h1 above: `.sub` is the
               console's 12px caption and this is the paragraph a stranger reads
               first, so the scale is declared here rather than fought with. */
            <p style={{ margin: 0, maxWidth: 620, color: "var(--muted)", fontSize: 15, lineHeight: 1.65 }}>
              {profile.intro}
            </p>
          )}

          {/* Host */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 22 }}>
            {profile.profile_photo_url ? (
              <img
                src={profile.profile_photo_url}
                alt=""
                /* Bespoke: a 42px host portrait. `.avatar` is the console's
                   30px initials disc, which is not this. */
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 999,
                  objectFit: "cover",
                  border: "1px solid var(--line)",
                }}
              />
            ) : (
              <div
                /* Same 42px disc; the tint is the host's own accent, so it is
                   data and stays inline. */
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
              <div style={{ fontWeight: 700 }}>{host}</div>
              {role && <div className="sub">{role}</div>}
            </div>
          </div>
        </header>

        {/* Bespoke: two panels that sit side by side on a laptop and stack on a
            phone. `.cg` is the twelve-column console grid and this page has no
            console around it. */}
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
              <p className="sub" style={{ margin: 0, lineHeight: 1.6 }}>
                No times are open at the moment. Please check back shortly.
              </p>
            ) : (
              <>
                {/* Day rail. The old page dumped up to seven dates at once, which
                    on a phone was a wall of buttons. Bespoke: a horizontal
                    scroller under a hairline — not `.seg`, which is a fixed
                    pill group that cannot scroll. */}
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    overflowX: "auto",
                    paddingBottom: 10,
                    marginBottom: 14,
                    borderBottom: "1px solid var(--line)",
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
                        className="btn sm"
                        // `.btn.sm` owns the resting chrome. The pressed state
                        // is painted in the HOST's accent, which is data, and
                        // the two flex properties keep the rail scrolling
                        // instead of squeezing.
                        style={{
                          flex: "0 0 auto",
                          whiteSpace: "nowrap",
                          ...(on
                            ? { borderColor: accent, background: withAlpha(accent, 0.1), color: accent }
                            : null),
                        }}
                      >
                        {d.date}
                        <span style={{ color: on ? accent : "var(--faint)" }}>{d.slots.length}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Bespoke: a time grid that packs as many 104px columns as
                    fit. `.cols-auto` is 230px minimum — two per row here. */}
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
                        className="btn"
                        // Selected slot is filled with the host accent, with
                        // `onAccent()` picking legible ink for it — data, both.
                        style={{
                          justifyContent: "center",
                          ...(on ? { borderColor: accent, background: accent, color: accentInk } : null),
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
              {/* `.grid.g10` stacks the whole form on one rhythm, which is why
                  no field below carries a margin of its own. */}
              <form onSubmit={submit} noValidate className="grid g10">
                <div
                  className="itemrow"
                  // `.itemrow` is the resting state. Once a slot is picked the
                  // row is tinted with the HOST's accent — data, not design.
                  style={
                    selected
                      ? { background: withAlpha(accent, 0.09), borderColor: withAlpha(accent, 0.3) }
                      : undefined
                  }
                >
                  <span className={cx(!selected && "sub")} style={{ fontWeight: 600 }}>
                    {selected
                      ? `${selected.date_label} at ${selected.label}`
                      : "Pick a time to continue"}
                  </span>
                </div>

                <Field label="Full name" required>
                  <input
                    className="field"
                    value={form.full_name}
                    onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                    autoComplete="name"
                    required
                  />
                </Field>
                <Field label="Email" required>
                  <input
                    className="field"
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
                    className="field"
                    type="tel"
                    inputMode="tel"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    autoComplete="tel"
                  />
                </Field>
                {form.phone.trim() && (
                  <label className="itemrow" style={{ alignItems: "flex-start", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={form.transactional_sms_consent}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, transactional_sms_consent: e.target.checked }))
                      }
                      style={{ marginTop: 3 }}
                    />
                    <span className="sub" style={{ lineHeight: 1.55 }}>
                      {profile.sms_disclosure_text ||
                        "I agree to receive account and application text messages from Qualified Commercial about this funding file, including appointment reminders, secure links, bank-connection requests, document and signature requests, and status updates. Consent is optional and is not a condition of applying for or receiving funding. Message frequency varies. Message and data rates may apply. Reply STOP to opt out. Reply HELP for help."}
                    </span>
                  </label>
                )}
                <Field label="What would you like to cover?">
                  <Textarea
                    // `.field` owns the box and the `.grid` label above stretches
                    // it; `.composer textarea` is the only place the sheet sizes
                    // a textarea, and this is not a composer.
                    style={{ minHeight: 88, resize: "vertical" }}
                    rows={3}
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </Field>

                {error && (
                  // role="alert" so a submission failure is announced, not just
                  // shown. `.statusline` is the chip vocabulary that wraps.
                  <div role="alert" className="statusline c-bad">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!canSubmit || status === "submitting"}
                  className="btn pri"
                  // `.btn.pri` and `.btn:disabled` own the shape and the dimmed
                  // state. Only the host's accent is painted here, and only
                  // while the button is live — a disabled control must not
                  // advertise itself in full brand colour.
                  style={{
                    justifyContent: "center",
                    ...(canSubmit && status !== "submitting"
                      ? { background: accent, borderColor: accent, color: accentInk }
                      : null),
                  }}
                >
                  {status === "submitting" ? "Booking…" : "Confirm booking"}
                </button>

                <p className="sub" style={{ margin: 0, lineHeight: 1.55 }}>
                  You will get a calendar invitation by email{form.transactional_sms_consent ? " and reminders by text" : ""}. No account needed.
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
    // `.bareshell` (AppShell) already paints the ground and holds the 100vh
    // floor for every route under /book, and globals.css carries no dark block
    // at all — so the "cover the operator's theme" defence the old inline
    // background existed for has nothing left to defend against. The one rule
    // here is the host's own accent, which is data.
    <div className="bareshell" style={{ borderTop: accent ? `3px solid ${accent}` : undefined }}>
      {children}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    // Bespoke: one card centred in the viewport. `.card` supplies its own
    // surface, border, radius, shadow and padding; the measure and the
    // centring are the only things left.
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <Card style={{ maxWidth: 420, width: "100%", textAlign: "center" }}>{children}</Card>
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
    // Kept as a local component rather than swapped for `<Panel>` from
    // "@/components/ds": that one puts the whole header inside its <h3>, and
    // the section icon here is a SIBLING of the heading, not part of its text.
    // The chrome is the same `.panel` / `.panel-h` / `.panel-b` all the same,
    // and `.panel-h h2` (app-extras) owns the title size.
    <section className="panel">
      <div className="panel-h">
        <Icon name={icon} size={15} />
        <h2>{title}</h2>
      </div>
      <div className="panel-b">{children}</div>
    </section>
  );
}

function Chip({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <span
      className="chip"
      // `.chip` owns the pill. The accent variant repaints it in the host's
      // own colour, which is data — there is no class for "whatever hex this
      // firm typed into their booking settings".
      style={
        accent
          ? { background: withAlpha(accent, 0.1), color: accent, borderColor: withAlpha(accent, 0.25) }
          : undefined
      }
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
    // A real <label> WRAPPING the control, not `<Field>` from
    // "@/components/ds": that one renders a <div> with a `.lbl` span, and the
    // implicit label-for association this <label> gives is the difference
    // between a screen reader reading "Email, edit text" and reading nothing
    // at all. On a page filled in by strangers that is not negotiable.
    <label className="grid g6">
      <span className="lbl">
        {label}
        {/* Required marker. `.reqtag` says REQUIRED and belongs to the
            requirement engine; this is plain form validation. */}
        {required && <span style={{ color: "var(--danger)", marginLeft: 3 }}>*</span>}
      </span>
      {children}
    </label>
  );
}
