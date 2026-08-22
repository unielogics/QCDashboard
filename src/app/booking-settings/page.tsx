"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { QC_TOKENS, withAlpha } from "@/components/design-system/tokens";
import { Icon } from "@/components/design-system/Icon";
import { Btn, CG, Input, PageHeader, Panel, Row, Select, StatusLine, Textarea, cx } from "@/components/ds";
import {
  useBookingSettings,
  useCurrentUser,
  useUpdateBookingSettings,
  useUploadBookingAsset,
} from "@/hooks/useApi";
import type { UserBookingSettings } from "@/lib/types";

const WEEKDAYS = [
  { id: 0, label: "Sun" },
  { id: 1, label: "Mon" },
  { id: 2, label: "Tue" },
  { id: 3, label: "Wed" },
  { id: 4, label: "Thu" },
  { id: 5, label: "Fri" },
  { id: 6, label: "Sat" },
];

export default function BookingSettingsPage() {
  const { data: user } = useCurrentUser();
  const settingsQ = useBookingSettings();
  const update = useUpdateBookingSettings();
  const uploadLogo = useUploadBookingAsset("logo");
  const uploadProfile = useUploadBookingAsset("profile-photo");
  const [draft, setDraft] = useState<UserBookingSettings | null>(null);
  const [originalJson, setOriginalJson] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [localLogoUrl, setLocalLogoUrl] = useState<string | null>(null);
  const [localProfileUrl, setLocalProfileUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!settingsQ.data) return;
    setDraft(settingsQ.data);
    setOriginalJson(JSON.stringify(settingsQ.data));
    setLocalLogoUrl(null);
    setLocalProfileUrl(null);
  }, [settingsQ.data]);

  const dirty = useMemo(() => (draft ? JSON.stringify(draft) !== originalJson : false), [draft, originalJson]);
  const bookingPath = draft?.slug ? `/book/${draft.slug}` : "/booking-settings";
  const publicUrl = typeof window === "undefined" ? bookingPath : `${window.location.origin}${bookingPath}`;
  const logoUrl = localLogoUrl || draft?.logo_url || null;
  const profileUrl = localProfileUrl || draft?.profile_photo_url || null;

  const patch = (next: Partial<UserBookingSettings>) => {
    setDraft((current) => (current ? { ...current, ...next } : current));
  };

  const toggleDay = (day: number) => {
    if (!draft) return;
    const days = new Set(draft.available_days);
    if (days.has(day)) days.delete(day);
    else days.add(day);
    patch({ available_days: Array.from(days).sort((a, b) => a - b) });
  };

  const onSave = async () => {
    if (!draft) return;
    setFeedback(null);
    try {
      const saved = await update.mutateAsync(draft);
      setDraft(saved);
      setOriginalJson(JSON.stringify(saved));
      setFeedback("Booking page settings saved.");
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Could not save booking settings.");
    }
  };

  const onUpload = async (asset: "logo" | "profile-photo", event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !draft) return;
    setFeedback(null);
    try {
      const result = asset === "logo" ? await uploadLogo.mutateAsync(file) : await uploadProfile.mutateAsync(file);
      if (result.kind === "s3") {
        if (asset === "logo") patch({ logo_s3_key: result.s3_key, logo_url: URL.createObjectURL(file) });
        else patch({ profile_photo_s3_key: result.s3_key, profile_photo_url: URL.createObjectURL(file) });
        setFeedback("Image uploaded. Save settings to publish it.");
      } else {
        if (asset === "logo") setLocalLogoUrl(result.data_url);
        else setLocalProfileUrl(result.data_url);
        setFeedback("S3 is not configured here, so this image is preview-only until production upload is available.");
      }
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Image upload failed.");
    }
  };

  const copyUrl = async () => {
    if (!draft?.slug) return;
    await navigator.clipboard.writeText(publicUrl);
    setFeedback("Public URL copied.");
  };

  if (settingsQ.isLoading || !draft) {
    return <div className="sub">Loading booking settings...</div>;
  }

  return (
    <div className="grid">
      <div>
        {/* Eyebrow above the page title — `.hd` has no slot for one, so it sits
            in the same wrapper rather than becoming its own grid row. */}
        <div className="lbl">Public booking</div>
        <PageHeader
          title="Booking Page Settings"
          lede={`Configure a branded scheduling page for ${user?.name || "your account"}.`}
          actions={
            <>
              {draft.slug ? (
                <Link href={bookingPath} target="_blank" className="btn">
                  <Icon name="external" size={13} /> Preview
                </Link>
              ) : null}
              {/* `.btn:disabled` carries the dimmed state the inline opacity used to. */}
              <Btn variant="pri" onClick={onSave} disabled={!dirty || update.isPending}>
                <Icon name="check" size={14} /> {update.isPending ? "Saving..." : "Save changes"}
              </Btn>
            </>
          }
        />
      </div>

      {feedback ? (
        <FeedbackLine ok={/saved|copied|uploaded/i.test(feedback)}>{feedback}</FeedbackLine>
      ) : null}

      {/* Editor beside a fixed-width preview of the public page. Not a 12-col
          split: the preview is pinned to the 390px the real page renders at, so
          it stays a true-to-size mirror however wide the console gets. */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 390px", gap: 16, alignItems: "start" }}>
        <div className="grid">
          <Panel title="Publish">
            <div className="grid">
              <ToggleRow
                label="Enable public booking page"
                description="When enabled, visitors can book open times directly onto your calendar."
                checked={draft.enabled}
                onChange={(enabled) => patch({ enabled, slug: draft.slug || normalizeSlug(user?.name || user?.email || "booking") })}
              />
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 150px", gap: 10 }}>
                <Field label="Public URL slug">
                  <Input value={draft.slug ?? ""} onChange={(e) => patch({ slug: normalizeSlug(e.target.value) || null })} />
                </Field>
                <Field label="Meeting length">
                  <Select value={draft.duration_min} onChange={(e) => patch({ duration_min: Number(e.target.value) })}>
                    {[15, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} min</option>)}
                  </Select>
                </Field>
              </div>
              <Row>
                <Input grow readOnly value={publicUrl} onFocus={(e) => e.currentTarget.select()} />
                <Btn onClick={copyUrl} disabled={!draft.slug}>
                  <Icon name="link" size={13} /> Copy
                </Btn>
              </Row>
            </div>
          </Panel>

          <Panel title="Branding">
            {/* 1fr 1fr, so a genuine 6 + 6 of the cockpit grid. */}
            <CG>
              <UploadCard
                className="s6"
                title="Logo"
                description="Use your firm or personal logo for the top of the page."
                imageUrl={logoUrl}
                inputId="booking-logo-upload"
                onChange={(e) => void onUpload("logo", e)}
              />
              <UploadCard
                className="s6"
                title="Profile photo"
                description="Add a professional agent, officer, or account photo."
                imageUrl={profileUrl}
                inputId="booking-profile-upload"
                onChange={(e) => void onUpload("profile-photo", e)}
                circle
              />
            </CG>
          </Panel>

          <Panel title="Page content">
            <div className="grid">
              <Field label="Page title">
                <Input value={draft.title ?? ""} onChange={(e) => patch({ title: e.target.value || null })} placeholder={`Book a meeting with ${user?.name || "me"}`} />
              </Field>
              <Field label="Intro text">
                {/* `resize` is not on `.field`, and restricting it to vertical is
                    the affordance the original shipped. */}
                <Textarea value={draft.intro ?? ""} onChange={(e) => patch({ intro: e.target.value || null })} rows={3} style={{ resize: "vertical" }} />
              </Field>
              <CG>
                <Field label="Accent color" className="s6">
                  {/* `.field` owns the frame; only the swatch height is inline. */}
                  <input type="color" className="field" value={draft.primary_color} onChange={(e) => patch({ primary_color: e.target.value })} style={{ height: 42 }} />
                </Field>
              </CG>
            </div>
          </Panel>

          <Panel title="Availability">
            <div className="grid">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 140px", gap: 10 }}>
                <Field label="Timezone"><Input value={draft.timezone} onChange={(e) => patch({ timezone: e.target.value || "America/New_York" })} /></Field>
                <Field label="Start"><Input type="time" value={draft.start_time} onChange={(e) => patch({ start_time: e.target.value || "09:00" })} /></Field>
                <Field label="End"><Input type="time" value={draft.end_time} onChange={(e) => patch({ end_time: e.target.value || "17:00" })} /></Field>
              </div>
              {/* `.seg` shrink-wraps only inside a flex parent; as a bare grid
                  item its track would stretch the full column. */}
              <Row>
                <div className="seg">
                  {WEEKDAYS.map((day) => {
                    const active = draft.available_days.includes(day.id);
                    return (
                      <button key={day.id} type="button" className={active ? "on" : ""} onClick={() => toggleDay(day.id)}>
                        {day.label}
                      </button>
                    );
                  })}
                </div>
              </Row>
            </div>
          </Panel>
        </div>

        <BookingPreview settings={draft} hostName={user?.name || "Qualified Commercial"} logoUrl={logoUrl} profileUrl={profileUrl} />
      </div>
    </div>
  );
}

/**
 * Two-tone status line. This used to hand-roll its box because the sheet had no
 * block-level success surface; `.statusline` (and `StatusLine`) is now exactly
 * that class — a `.cellchip` that wraps — so the geometry has one owner again.
 */
function FeedbackLine({ ok, children }: { ok: boolean; children: ReactNode }) {
  return <StatusLine tone={ok ? "ok" : "warn"}>{children}</StatusLine>;
}

function BookingPreview({ settings, hostName, logoUrl, profileUrl }: { settings: UserBookingSettings; hostName: string; logoUrl: string | null; profileUrl: string | null }) {
  // Mirrors the real /book/[slug] page. That page is now itself on the plain-CSS
  // classes, so the parts of it that ARE the design system — the `.chip` pills,
  // the `.panel` around the time picker — are the same classes here. The parts
  // that are bespoke to a public page stay bespoke here too: the hero type, the
  // device frame, and the slot tiles, which are a PICTURE of buttons and must
  // not carry `.btn`'s cursor:pointer and pretend to be clickable.
  //
  // This component tracks /book/[slug], not this stylesheet. If that file's
  // layout changes, this one changes with it.
  //
  // `l` survives for the two values that must be a concrete hex: withAlpha()
  // composites against one, and onAccentPreview() does luminance maths on one.
  // Everything else reads the custom properties directly — globals.css IS this
  // palette, and a second copy of a colour is a colour that will drift.
  const l = QC_TOKENS.light;
  const accent = settings.primary_color || l.brand;
  return (
    // The device frame: the public page's own ground (--bg), pinned beside the
    // editor, wearing the host's accent as its top rule. Bespoke because it is
    // a picture of a page, not a surface in this one.
    <div style={{ position: "sticky", top: 18, borderRadius: "var(--r)", border: "1px solid var(--line)", borderTop: `3px solid ${accent}`, background: "var(--bg)", padding: 20, boxShadow: "var(--sh2)" }}>
      {logoUrl ? <img src={logoUrl} alt="" style={{ maxHeight: 30, maxWidth: 170, objectFit: "contain", marginBottom: 14 }} /> : <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 14 }}>Qualified Commercial</div>}

      {/* Same `.chip` pair the real page renders, accent tint and all. */}
      <div className="row" style={{ marginBottom: 12 }}>
        <span className="chip" style={{ background: withAlpha(accent, 0.1), color: accent, borderColor: withAlpha(accent, 0.25) }}>{settings.duration_min} minutes</span>
        <span className="chip">{settings.timezone.replace(/_/g, " ")}</span>
      </div>

      {/* Hero type, scaled down. The real page clamps to 44px; this is the
          same shape at preview size. */}
      <h2 style={{ marginBottom: 8, fontSize: 24, lineHeight: 1.12 }}>{settings.title || `Book a meeting with ${hostName}`}</h2>
      <p style={{ color: "var(--muted)", lineHeight: 1.6, fontSize: 13.5, margin: 0 }}>{settings.intro || "Choose a time that works for you. You will receive a calendar invitation after booking."}</p>

      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0" }}>
        {/* The host disc, at the preview's 34px rather than the page's 42px. */}
        <div style={{ width: 34, height: 34, borderRadius: 999, border: "1px solid var(--line)", background: withAlpha(accent, 0.12), color: accent, overflow: "hidden", display: "grid", placeItems: "center", flexShrink: 0 }}>
          {profileUrl ? <img src={profileUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Icon name="user" size={17} />}
        </div>
        <span style={{ fontWeight: 700 }}>{hostName}</span>
      </div>

      <div className="panel">
        <div className="panel-h"><h2>Pick a time</h2></div>
        <div className="panel-b">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {[settings.start_time, "10:30", "11:00", "13:00", "14:30", "15:00"].map((label, index) => (
              // NOT `.btn`: these are a picture of the slot buttons, and `.btn`
              // carries cursor:pointer, which would advertise a click the
              // preview cannot honour. Colours are the host's, so inline.
              <div key={`${label}-${index}`} style={{ textAlign: "center", padding: "8px 4px", borderRadius: 8, fontSize: 12.5, fontWeight: 700, border: `1px solid ${index === 0 ? accent : "var(--line2)"}`, background: index === 0 ? accent : "var(--surface)", color: index === 0 ? onAccentPreview(accent, l.ink) : "var(--ink)" }}>{label}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Same luminance rule the public page uses, so the preview cannot lie about contrast. */
function onAccentPreview(hex: string, inkFallback: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || "").trim());
  if (!m) return "#FFFFFF";
  const int = parseInt(m[1], 16);
  const chan = [(int >> 16) & 255, (int >> 8) & 255, int & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  const L = 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2];
  return L > 0.45 ? inkFallback : "#FFFFFF";
}

function UploadCard({ title, description, imageUrl, inputId, onChange, circle, className }: { title: string; description: string; imageUrl: string | null; inputId: string; onChange: (e: ChangeEvent<HTMLInputElement>) => void; circle?: boolean; className?: string }) {
  return (
    <div className={cx("card", className)}>
      {/* Dashed image well — bespoke geometry, and the radius is derived from
          the `circle` prop, so it stays inline. */}
      <div style={{ width: 82, height: 82, borderRadius: circle ? 41 : 12, border: "1px dashed var(--line2)", background: "var(--sunken2)", display: "grid", placeItems: "center", overflow: "hidden", marginBottom: 10 }}>
        {imageUrl ? <img src={imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Icon name="upload" size={24} />}
      </div>
      <div><b>{title}</b></div>
      <div className="sub" style={{ margin: "4px 0 10px" }}>{description}</div>
      <input id={inputId} type="file" accept="image/png,image/jpeg" onChange={onChange} style={{ display: "none" }} />
      {/* `.btn` already carries cursor:pointer and text-decoration:none. */}
      <label htmlFor={inputId} className="btn">
        <Icon name="upload" size={13} /> Upload
      </label>
    </div>
  );
}

/**
 * Stays a real <label> rather than `ds/Field`, which renders a <div>: the
 * implicit label association is what makes clicking the caption focus the
 * control, and losing it would be a regression, not a restyle.
 */
function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={className} style={{ display: "grid", gap: 6, minWidth: 0 }}>
      <span className="lbl">{label}</span>
      {children}
    </label>
  );
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className={cx("pick", checked && "on")} style={{ justifyContent: "space-between", textAlign: "left" }}>
      <span>
        <span style={{ display: "block", fontWeight: 650 }}>{label}</span>
        <span className="sub" style={{ display: "block", marginTop: 3 }}>{description}</span>
      </span>
      {/* The switch itself has no class in the system — bespoke geometry, and
          the track colour is driven by state. */}
      <span style={{ width: 46, height: 26, borderRadius: 999, background: checked ? "var(--accent)" : "var(--line2)", padding: 3, flexShrink: 0 }}>
        <span style={{ display: "block", width: 20, height: 20, borderRadius: 999, background: "#fff", transform: checked ? "translateX(20px)" : "translateX(0)", transition: "transform .16s ease" }} />
      </span>
    </button>
  );
}

function normalizeSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-").slice(0, 64);
}
