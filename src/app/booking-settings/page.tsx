"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ChangeEvent, type CSSProperties, type ReactNode } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
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
  const { t } = useTheme();
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
    return <div style={{ padding: 24, color: t.ink3, fontSize: 13 }}>Loading booking settings...</div>;
  }

  return (
    <div style={{ maxWidth: 1320, margin: "0 auto", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.4, textTransform: "uppercase", color: t.ink3 }}>
            Public booking
          </div>
          <h1 style={{ margin: "4px 0 0", color: t.ink, fontSize: 26, letterSpacing: -0.4 }}>
            Booking Page Settings
          </h1>
          <div style={{ marginTop: 4, color: t.ink3, fontSize: 13 }}>
            Configure a branded scheduling page for {user?.name || "your account"}.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {draft.slug ? (
            <Link href={bookingPath} target="_blank" style={{ textDecoration: "none" }}>
              <span style={{ ...qcBtn(t), display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Icon name="external" size={13} /> Preview
              </span>
            </Link>
          ) : null}
          <button onClick={onSave} disabled={!dirty || update.isPending} style={{ ...qcBtnPrimary(t), opacity: !dirty || update.isPending ? 0.55 : 1 }}>
            <Icon name="check" size={14} /> {update.isPending ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>

      {feedback ? <Pill bg={/saved|copied|uploaded/i.test(feedback) ? t.profitBg : t.warnBg} color={/saved|copied|uploaded/i.test(feedback) ? t.profit : t.warn}>{feedback}</Pill> : null}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 390px", gap: 16, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Card pad={16}>
            <SectionLabel>Publish</SectionLabel>
            <div style={{ display: "grid", gap: 12, marginTop: 10 }}>
              <ToggleRow
                label="Enable public booking page"
                description="When enabled, visitors can book open times directly onto your calendar."
                checked={draft.enabled}
                onChange={(enabled) => patch({ enabled, slug: draft.slug || normalizeSlug(user?.name || user?.email || "booking") })}
              />
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 150px", gap: 10 }}>
                <Field label="Public URL slug">
                  <input value={draft.slug ?? ""} onChange={(e) => patch({ slug: normalizeSlug(e.target.value) || null })} style={inputStyle(t)} />
                </Field>
                <Field label="Meeting length">
                  <select value={draft.duration_min} onChange={(e) => patch({ duration_min: Number(e.target.value) })} style={inputStyle(t)}>
                    {[15, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} min</option>)}
                  </select>
                </Field>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input readOnly value={publicUrl} onFocus={(e) => e.currentTarget.select()} style={{ ...inputStyle(t), flex: 1, minWidth: 260 }} />
                <button onClick={copyUrl} disabled={!draft.slug} style={{ ...qcBtn(t), opacity: draft.slug ? 1 : 0.55 }}>
                  <Icon name="link" size={13} /> Copy
                </button>
              </div>
            </div>
          </Card>

          <Card pad={16}>
            <SectionLabel>Branding</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10 }}>
              <UploadCard
                title="Logo"
                description="Use your firm or personal logo for the top of the page."
                imageUrl={logoUrl}
                inputId="booking-logo-upload"
                onChange={(e) => void onUpload("logo", e)}
              />
              <UploadCard
                title="Profile photo"
                description="Add a professional agent, officer, or account photo."
                imageUrl={profileUrl}
                inputId="booking-profile-upload"
                onChange={(e) => void onUpload("profile-photo", e)}
                circle
              />
            </div>
          </Card>

          <Card pad={16}>
            <SectionLabel>Page content</SectionLabel>
            <div style={{ display: "grid", gap: 12, marginTop: 10 }}>
              <Field label="Page title">
                <input value={draft.title ?? ""} onChange={(e) => patch({ title: e.target.value || null })} placeholder={`Book a meeting with ${user?.name || "me"}`} style={inputStyle(t)} />
              </Field>
              <Field label="Intro text">
                <textarea value={draft.intro ?? ""} onChange={(e) => patch({ intro: e.target.value || null })} rows={3} style={{ ...inputStyle(t), resize: "vertical", lineHeight: 1.45 }} />
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Accent color"><input type="color" value={draft.primary_color} onChange={(e) => patch({ primary_color: e.target.value })} style={colorStyle(t)} /></Field>
                <Field label="Background color"><input type="color" value={draft.background_color} onChange={(e) => patch({ background_color: e.target.value })} style={colorStyle(t)} /></Field>
              </div>
            </div>
          </Card>

          <Card pad={16}>
            <SectionLabel>Availability</SectionLabel>
            <div style={{ display: "grid", gap: 12, marginTop: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 140px", gap: 10 }}>
                <Field label="Timezone"><input value={draft.timezone} onChange={(e) => patch({ timezone: e.target.value || "America/New_York" })} style={inputStyle(t)} /></Field>
                <Field label="Start"><input type="time" value={draft.start_time} onChange={(e) => patch({ start_time: e.target.value || "09:00" })} style={inputStyle(t)} /></Field>
                <Field label="End"><input type="time" value={draft.end_time} onChange={(e) => patch({ end_time: e.target.value || "17:00" })} style={inputStyle(t)} /></Field>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {WEEKDAYS.map((day) => {
                  const active = draft.available_days.includes(day.id);
                  return (
                    <button key={day.id} onClick={() => toggleDay(day.id)} style={{
                      ...qcBtn(t),
                      minWidth: 58,
                      justifyContent: "center",
                      background: active ? t.petrolSoft : t.surface2,
                      color: active ? t.petrol : t.ink3,
                      border: `1px solid ${active ? t.petrol : t.line}`,
                    }}>
                      {day.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </Card>
        </div>

        <BookingPreview settings={draft} hostName={user?.name || "Qualified Commercial"} logoUrl={logoUrl} profileUrl={profileUrl} />
      </div>
    </div>
  );
}

function BookingPreview({ settings, hostName, logoUrl, profileUrl }: { settings: UserBookingSettings; hostName: string; logoUrl: string | null; profileUrl: string | null }) {
  const accent = settings.primary_color;
  const bg = settings.background_color;
  return (
    <div style={{ position: "sticky", top: 18, borderRadius: 18, border: "1px solid rgba(255,255,255,0.16)", background: bg, color: "#fff", padding: 20, boxShadow: "0 18px 50px rgba(0,0,0,0.28)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center" }}>
        <div style={{ minWidth: 0 }}>
          {logoUrl ? <img src={logoUrl} alt="" style={{ maxHeight: 42, maxWidth: 180, objectFit: "contain", marginBottom: 14 }} /> : <div style={{ color: accent, fontSize: 12, fontWeight: 950, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 14 }}>Qualified Commercial</div>}
          <div style={{ color: accent, fontSize: 11, fontWeight: 900, letterSpacing: 1.3, textTransform: "uppercase" }}>{settings.duration_min} minute meeting</div>
        </div>
        <div style={{ width: 72, height: 72, borderRadius: 18, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.08)", overflow: "hidden", display: "grid", placeItems: "center", flexShrink: 0 }}>
          {profileUrl ? <img src={profileUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Icon name="user" size={30} />}
        </div>
      </div>
      <h2 style={{ margin: "18px 0 8px", fontSize: 30, lineHeight: 1.05 }}>{settings.title || `Book a meeting with ${hostName}`}</h2>
      <p style={{ color: "rgba(255,255,255,0.72)", lineHeight: 1.55, fontSize: 14, margin: 0 }}>{settings.intro || "Choose a time that works for you. You will receive a confirmation after booking."}</p>
      <div style={{ marginTop: 18, display: "grid", gap: 8 }}>
        {["Tomorrow", "Thursday", "Friday"].map((label, index) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "11px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.06)" }}>
            <span>{label}</span>
            <span style={{ color: accent, fontWeight: 950 }}>{index === 0 ? settings.start_time : "10:30"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function UploadCard({ title, description, imageUrl, inputId, onChange, circle }: { title: string; description: string; imageUrl: string | null; inputId: string; onChange: (e: ChangeEvent<HTMLInputElement>) => void; circle?: boolean }) {
  const { t } = useTheme();
  return (
    <div style={{ border: `1px solid ${t.line}`, borderRadius: 12, padding: 14, background: t.surface2 }}>
      <div style={{ width: 82, height: 82, borderRadius: circle ? 41 : 12, border: `1px dashed ${t.lineStrong}`, background: t.bg, display: "grid", placeItems: "center", overflow: "hidden", marginBottom: 10 }}>
        {imageUrl ? <img src={imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Icon name="upload" size={24} />}
      </div>
      <div style={{ color: t.ink, fontWeight: 900 }}>{title}</div>
      <div style={{ color: t.ink3, fontSize: 12, lineHeight: 1.45, margin: "4px 0 10px" }}>{description}</div>
      <input id={inputId} type="file" accept="image/png,image/jpeg" onChange={onChange} style={{ display: "none" }} />
      <label htmlFor={inputId} style={{ ...qcBtn(t), display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
        <Icon name="upload" size={13} /> Upload
      </label>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  const { t } = useTheme();
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.1, textTransform: "uppercase", color: t.ink3 }}>{label}</span>
      {children}
    </label>
  );
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  const { t } = useTheme();
  return (
    <button type="button" onClick={() => onChange(!checked)} style={{ border: `1px solid ${checked ? t.petrol : t.line}`, borderRadius: 12, background: checked ? t.petrolSoft : t.surface2, padding: 14, textAlign: "left", display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", color: t.ink, cursor: "pointer" }}>
      <span>
        <span style={{ display: "block", fontWeight: 900 }}>{label}</span>
        <span style={{ display: "block", color: t.ink3, fontSize: 12, marginTop: 3 }}>{description}</span>
      </span>
      <span style={{ width: 46, height: 26, borderRadius: 999, background: checked ? t.petrol : t.lineStrong, padding: 3, boxSizing: "border-box", flexShrink: 0 }}>
        <span style={{ display: "block", width: 20, height: 20, borderRadius: 999, background: "#fff", transform: checked ? "translateX(20px)" : "translateX(0)", transition: "transform .16s ease" }} />
      </span>
    </button>
  );
}

function inputStyle(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return {
    width: "100%",
    boxSizing: "border-box",
    border: `1px solid ${t.lineStrong}`,
    borderRadius: 10,
    background: t.surface2,
    color: t.ink,
    padding: "10px 12px",
    outline: "none",
    fontSize: 13,
    fontFamily: "inherit",
  };
}

function colorStyle(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return { ...inputStyle(t), height: 42, padding: 6 };
}

function normalizeSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-").slice(0, 64);
}
