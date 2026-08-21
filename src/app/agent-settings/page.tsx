"use client";

// Agent Settings — the realtor's personal configuration. Three sections:
//
//   1. Identity & Letterhead
//      • From your account — read-only (name/email from User row, Clerk-synced).
//      • Your branding   — title, license #, brokerage, headshot. Persists to
//        brokers.settings_data.letterhead. Headshot is stored as base64 data
//        URL today; v2 will replace with S3-backed key.
//
//   2. AI Cadence — single preset selector (Gentle / Standard / Aggressive).
//      "Standard" = inherit firm default (sends `cadence: null`). Advanced
//      disclosure exposes raw numeric overrides.
//
//   3. Doc Checklist — single Buyer | Seller tab strip. Loan-type axis
//      dropped (those are funding-stage, super-admin territory). Two zones:
//      starter buyer/seller docs (toggle to disable on the agent's leads),
//      and "Your additions" (custom rows).
//
// Design system: this route renders the plain-CSS classes in globals.css /
// app-extras.css through the wrappers in components/ds. The section rail, the
// cadence presets and the "enable" toggles are all the same object — a
// selectable row (`.pick` / `.pick.on`) — which is why they now look alike.
// Inline styles that survive are the ones no class owns: the 240px rail split,
// the fixed-size headshot well, and the booking preview, whose colours are the
// data being edited.

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/design-system/Icon";
import {
  Btn,
  CG,
  CellChip,
  IconBtn,
  Input,
  Linky,
  Note,
  Panel,
  Row,
  Seg,
  Select,
  Textarea,
  WarnLine,
  cx,
} from "@/components/ds";
import {
  useBrokerSettings,
  useCurrentUser,
  useUpdateBrokerSettings,
  useUploadHeadshot,
} from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import type {
  AgentCadenceOverride,
  AgentBookingSettings,
  AgentChecklistOverlay,
  AgentLetterhead,
  AgentSettingsData,
  DocChecklistItem,
  LoanSide,
} from "@/lib/types";

// Buyer / seller starter docs — same as AddLeadWizard, kept in sync.
// Until firm-level transaction_checklists ships (deferred), these act as
// the canonical "firm defaults" the agent toggles against.
const STARTER_BUYER_DOCS = [
  "Government ID",
  "Pre-Approval Letter",
  "Buyer Agency Agreement",
  "Purchase Agreement",
  "Earnest Money Receipt",
  "Inspection Report",
  "Proof of Funds",
];
const STARTER_SELLER_DOCS = [
  "Government ID",
  "Listing Agreement",
  "Property Disclosure",
  "HOA Documents",
  "Lead-Based Paint Disclosure",
  "Title / Deed",
  "Agency Disclosure",
];

type CadencePreset = "gentle" | "standard" | "aggressive";
const CADENCE_PRESETS: Record<
  CadencePreset,
  { first: number; second: number; escalate: number; label: string; sub: string }
> = {
  gentle:     { first: 5, second: 12, escalate: 21, label: "Gentle",     sub: "5 / 12 / 21 day nudges" },
  standard:   { first: 3, second: 7,  escalate: 14, label: "Standard",   sub: "3 / 7 / 14d — firm default" },
  aggressive: { first: 2, second: 5,  escalate: 10, label: "Aggressive", sub: "2 / 5 / 10 day nudges" },
};

const SIDES: { id: LoanSide; label: string }[] = [
  { id: "buyer", label: "Buyer" },
  { id: "seller", label: "Seller" },
];

const SECTIONS = [
  { id: "identity", label: "Identity & Letterhead", icon: "user" as const, legacy: false },
  { id: "booking", label: "Booking Page", icon: "cal" as const, legacy: false },
  { id: "cadence", label: "AI Cadence", icon: "bell" as const, legacy: true },
  { id: "checklists", label: "Doc Checklist", icon: "vault" as const, legacy: true },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

function emptyOverlay(): AgentChecklistOverlay {
  return { disabled_firm_items: [], extra_items: [] };
}

function emptyLetterhead(): AgentLetterhead {
  return {
    title: null,
    license_number: null,
    brokerage_name: null,
    headshot_data_url: null,
    headshot_s3_key: null,
  };
}

function emptyBooking(): AgentBookingSettings {
  return {
    enabled: false,
    slug: null,
    title: null,
    intro: null,
    primary_color: "#5eead4",
    background_color: "#05070d",
    duration_min: 30,
    timezone: "America/New_York",
    available_days: [1, 2, 3, 4, 5],
    start_time: "09:00",
    end_time: "17:00",
  };
}

function emptyAgentSettings(): AgentSettingsData {
  return { checklists: {}, cadence: null, letterhead: emptyLetterhead(), booking: emptyBooking() };
}

// Map a saved cadence override → preset id. "Standard" = no override (null).
function detectPreset(c: AgentCadenceOverride | null | undefined): CadencePreset {
  if (!c) return "standard";
  const f = c.first_reminder_days ?? null;
  const s = c.second_reminder_days ?? null;
  const e = c.escalate_after_days ?? null;
  for (const id of ["gentle", "aggressive"] as const) {
    const p = CADENCE_PRESETS[id];
    if (f === p.first && s === p.second && e === p.escalate) return id;
  }
  return "standard";
}

export default function AgentSettingsPage() {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const brokerQ = useBrokerSettings();
  const update = useUpdateBrokerSettings();

  const [section, setSection] = useState<SectionId>("identity");
  const [draft, setDraft] = useState<AgentSettingsData>(emptyAgentSettings());
  const [originalJson, setOriginalJson] = useState<string>("");
  const [feedback, setFeedback] = useState<string | null>(null);

  // Auth: brokers + super-admins (super-admin can preview)
  useEffect(() => {
    if (!user) return;
    if (user.role !== Role.BROKER && user.role !== Role.SUPER_ADMIN) {
      router.replace("/");
    }
  }, [user, router]);

  // Hydrate draft from API
  useEffect(() => {
    const data = brokerQ.data?.data;
    if (!data) return;
    const seeded: AgentSettingsData = {
      checklists: data.checklists ?? {},
      cadence: data.cadence ?? null,
      letterhead: data.letterhead ?? emptyLetterhead(),
      booking: data.booking ?? emptyBooking(),
    };
    setDraft(seeded);
    setOriginalJson(JSON.stringify(seeded));
  }, [brokerQ.data]);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== originalJson,
    [draft, originalJson],
  );

  const onSave = async () => {
    setFeedback(null);
    try {
      const r = await update.mutateAsync(draft);
      setOriginalJson(JSON.stringify(r.data));
      setDraft(r.data);
      setFeedback("Saved.");
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Save failed.");
    }
  };

  if (user?.role === Role.CLIENT) return null;
  if (brokerQ.isLoading) {
    return <div className="sub">Loading…</div>;
  }
  if (brokerQ.isError) {
    return (
      <StatusLine tone="bad">
        {brokerQ.error instanceof Error ? brokerQ.error.message : "Couldn't load broker settings."}
      </StatusLine>
    );
  }

  return (
    // Rail + body. Not the 12-col grid: 240px is a fixed rail width, not a
    // proportion of the page, and it must not reflow with the content.
    <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 18, height: "100%", minHeight: 0 }}>
      {/* Sidebar */}
      <Panel title="Agent Settings" bodyClass="grid">
        <div className="sub">
          Your personal branding, follow-up cadence, and lead-stage doc list.
          Per-lead overrides happen when you add a lead.
        </div>
        <div>
          {/* Elara — routes to the new page; the four other items
              still use the existing in-page section state. */}
          <Link href="/agent-settings/ai" className="pick">
            <Icon name="spark" size={14} />
            Elara
            <span className="sp" />
            <span className="sub">→</span>
          </Link>
          {SECTIONS.map((s) => {
            const active = section === s.id;
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={active}
                onClick={() => setSection(s.id)}
                className={cx("pick", active && "on")}
              >
                <Icon name={s.icon} size={14} />
                <span>{s.label}</span>
                <span className="sp" />
                {s.legacy ? <CellChip tone="warn">Legacy</CellChip> : null}
              </button>
            );
          })}
        </div>
      </Panel>

      {/* Body — banner removed; Elara sidebar entry above
          is the canonical entry point. */}
      <div className="grid">

        {/* Legacy banner — shows when a deprecated section is open. The
            old AI Cadence + Doc Checklist sections still write to the
            old broker-settings JSON, but Elara itself reads from
            client_ai_plan (Lending AI). */}
        {SECTIONS.find((s) => s.id === section)?.legacy ? (
          <WarnLine>
            <Row>
              <div className="sp">
                <div><b>⚠ Legacy section — superseded by Elara</b></div>
                <div>
                  {section === "cadence"
                    ? "Elara now follows the conditional rules in Elara → Follow-Up. This preset only feeds the older non-AI doc-reminder pipeline."
                    : "Elara now reads requirements from Elara → Buyer / Seller Rules. This list only pre-populates the legacy loans.required_docs field at loan creation."}
                  {" "}Edits here keep working but Elara ignores them.
                </div>
              </div>
              <Link href="/agent-settings/ai" className="btn">
                Open Elara →
              </Link>
            </Row>
          </WarnLine>
        ) : null}

        {section === "identity" && (
          <IdentitySection
            draft={draft}
            setDraft={setDraft}
            user={user ?? null}
            dirty={dirty}
            saving={update.isPending}
            onSave={onSave}
          />
        )}
        {section === "booking" && (
          <BookingSection
            draft={draft}
            setDraft={setDraft}
            user={user ?? null}
            dirty={dirty}
            saving={update.isPending}
            onSave={onSave}
          />
        )}
        {section === "cadence" && (
          <CadenceSection
            draft={draft}
            setDraft={setDraft}
            dirty={dirty}
            saving={update.isPending}
            onSave={onSave}
          />
        )}
        {section === "checklists" && (
          <ChecklistsSection
            draft={draft}
            setDraft={setDraft}
            dirty={dirty}
            saving={update.isPending}
            onSave={onSave}
          />
        )}
        {feedback && (
          <StatusLine tone={feedback === "Saved." ? "ok" : "warn"}>{feedback}</StatusLine>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Section 1: Identity & Letterhead
// ───────────────────────────────────────────────────────────────────
interface IdentityProps {
  draft: AgentSettingsData;
  setDraft: React.Dispatch<React.SetStateAction<AgentSettingsData>>;
  user: { name: string; email: string } | null;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
}

function IdentitySection({ draft, setDraft, user, dirty, saving, onSave }: IdentityProps) {
  const lh = draft.letterhead ?? emptyLetterhead();
  const upload = useUploadHeadshot();
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const update = (patch: Partial<AgentLetterhead>) => {
    setDraft((d) => ({ ...d, letterhead: { ...lh, ...patch } }));
  };

  const onPickHeadshot = async (file: File | null) => {
    if (!file) return;
    setUploadErr(null);
    try {
      const r = await upload.mutateAsync(file);
      if (r.kind === "s3") {
        // Wipe legacy data URL when an S3 key is set so the
        // backend reads the production path.
        update({ headshot_s3_key: r.s3_key, headshot_data_url: null });
      } else {
        // Local dev — keep the data URL for instant preview.
        update({ headshot_data_url: r.data_url, headshot_s3_key: null });
      }
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : "Upload failed");
    }
  };

  const headshotPreview = lh.headshot_data_url || null;
  const hasS3Key = !!lh.headshot_s3_key;
  return (
    <Panel
      title="Identity & Letterhead"
      actions={<SaveBtn dirty={dirty} saving={saving} onClick={onSave} />}
      bodyClass="grid"
    >
      <div className="sub">
        Your headshot, brokerage, and license number appear on every prequal we
        generate for your clients alongside the Qualified Commercial firm logo.
      </div>

      {/* Zone 1: From your account (read-only) */}
      <div className="card">
        <div className="lbl">From your account</div>
        {/* 1fr 1fr — a genuine 6 + 6 of the cockpit grid. */}
        <CG className="mt">
          <ReadOnlyField className="s6" label="Name" value={user?.name ?? "—"} />
          <ReadOnlyField className="s6" label="Email" value={user?.email ?? "—"} />
        </CG>
        <div className="sub mt">
          Synced from your profile. Edit your name or email in your account settings.
        </div>
      </div>

      {/* Zone 2: Your branding */}
      <div>
        <div className="lbl">Your branding</div>
        {/* Three fields on a two-up grid: the third wraps, exactly as the
            original 1fr 1fr did. */}
        <CG className="mt">
          <Field className="s6" label="Title">
            <TextInput value={lh.title ?? ""} onChange={(v) => update({ title: v || null })} placeholder="Real Estate Agent" />
          </Field>
          <Field className="s6" label="License #">
            <TextInput value={lh.license_number ?? ""} onChange={(v) => update({ license_number: v || null })} />
          </Field>
          <Field className="s6" label="Brokerage">
            <TextInput value={lh.brokerage_name ?? ""} onChange={(v) => update({ brokerage_name: v || null })} />
          </Field>
        </CG>
      </div>

      <Field label="Headshot">
        <Row>
          {hasS3Key || headshotPreview ? (
            headshotPreview ? (
              <img
                src={headshotPreview}
                alt="Headshot"
                style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line)" }}
              />
            ) : (
              // Fixed 96px well — no class owns a square image slot.
              <div style={{
                width: 96, height: 96, borderRadius: 8, border: "1px solid var(--line)",
                background: "var(--sunken2)", display: "grid", placeItems: "center",
                color: "var(--muted)", fontSize: 10.5, padding: 6, textAlign: "center",
              }}>
                Stored on S3
              </div>
            )
          ) : (
            <div style={{
              width: 96, height: 96, borderRadius: 8, border: "1px dashed var(--line2)",
              display: "grid", placeItems: "center", color: "var(--faint)", fontSize: 11,
            }}>
              No image
            </div>
          )}
          <div style={{ display: "grid", gap: 6, flex: 1, minWidth: 200 }}>
            <Input
              type="file"
              accept="image/png,image/jpeg"
              onChange={(e) => void onPickHeadshot(e.target.files?.[0] ?? null)}
              disabled={upload.isPending}
            />
            {upload.isPending && <div className="sub">Uploading…</div>}
            {uploadErr && <StatusLine tone="bad">{uploadErr}</StatusLine>}
            {(hasS3Key || headshotPreview) && !upload.isPending && (
              <Row>
                <Btn size="sm" onClick={() => update({ headshot_s3_key: null, headshot_data_url: null })}>
                  Remove
                </Btn>
              </Row>
            )}
          </div>
        </Row>
      </Field>
    </Panel>
  );
}

// ───────────────────────────────────────────────────────────────────
// Section 2: Public booking page
// ───────────────────────────────────────────────────────────────────
interface BookingProps {
  draft: AgentSettingsData;
  setDraft: React.Dispatch<React.SetStateAction<AgentSettingsData>>;
  user: { name: string; email: string } | null;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
}

const WEEKDAYS = [
  { id: 1, label: "Mon" },
  { id: 2, label: "Tue" },
  { id: 3, label: "Wed" },
  { id: 4, label: "Thu" },
  { id: 5, label: "Fri" },
  { id: 6, label: "Sat" },
  { id: 0, label: "Sun" },
];

function BookingSection({ draft, setDraft, user, dirty, saving, onSave }: BookingProps) {
  const booking = draft.booking ?? emptyBooking();
  const slug = booking.slug || defaultBookingSlug(user?.name || user?.email || "agent");
  const bookingPath = `/book/${slug}`;
  const publicUrl = typeof window === "undefined" ? bookingPath : `${window.location.origin}${bookingPath}`;

  const update = (patch: Partial<AgentBookingSettings>) => {
    setDraft((d) => ({ ...d, booking: { ...(d.booking ?? emptyBooking()), ...patch } }));
  };

  const toggleDay = (day: number) => {
    const current = new Set(booking.available_days ?? []);
    if (current.has(day)) current.delete(day);
    else current.add(day);
    update({ available_days: Array.from(current).sort((a, b) => a - b) });
  };

  return (
    <Panel
      title="Booking Page"
      actions={<SaveBtn dirty={dirty} saving={saving} onClick={onSave} />}
      bodyClass="grid"
    >
      <div className="sub">
        Booking pages are now configured from the universal booking settings screen.
        Use that page to upload your logo, profile photo, and manage your public scheduling link.
      </div>
      <Row>
        <Link href="/booking-settings" className="btn pri">
          <Icon name="external" size={13} /> Open Booking Page Settings
        </Link>
      </Row>

      {/* Editor beside a fixed 340px preview of the public page — pinned so the
          preview stays true to size however wide the console gets. */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: 16, alignItems: "start" }}>
        <div className="grid">
          <Toggle
            label="Enable public booking page"
            value={booking.enabled}
            onChange={(enabled) => update({ enabled, slug: booking.slug || slug })}
          />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 12 }}>
            <Field label="Public URL slug">
              <TextInput
                value={slug}
                onChange={(v) => update({ slug: normalizeBookingSlug(v) || null })}
                placeholder="jonathan-franco"
              />
            </Field>
            <Field label="Meeting length">
              <Select
                value={booking.duration_min}
                onChange={(e) => update({ duration_min: Number(e.target.value) })}
              >
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={45}>45 minutes</option>
                <option value={60}>60 minutes</option>
                <option value={90}>90 minutes</option>
              </Select>
            </Field>
          </div>

          <Field label="Page title">
            <TextInput
              value={booking.title ?? ""}
              onChange={(v) => update({ title: v || null })}
              placeholder={`Book a meeting with ${user?.name || "me"}`}
            />
          </Field>

          <Field label="Intro text">
            {/* `resize` is not on `.field`, and holding it to vertical is the
                affordance the original shipped. */}
            <Textarea
              value={booking.intro ?? ""}
              onChange={(e) => update({ intro: e.target.value || null })}
              placeholder="Choose a time to discuss your file, prequalification, or next steps."
              rows={3}
              style={{ resize: "vertical" }}
            />
          </Field>

          <CG>
            <Field className="s4" label="Timezone">
              <TextInput
                value={booking.timezone}
                onChange={(v) => update({ timezone: v || "America/New_York" })}
                placeholder="America/New_York"
              />
            </Field>
            <Field className="s4" label="Start time">
              <Input
                type="time"
                value={booking.start_time}
                onChange={(e) => update({ start_time: e.target.value || "09:00" })}
              />
            </Field>
            <Field className="s4" label="End time">
              <Input
                type="time"
                value={booking.end_time}
                onChange={(e) => update({ end_time: e.target.value || "17:00" })}
              />
            </Field>
          </CG>

          <div>
            <div className="lbl">Available days</div>
            {/* `.seg` shrink-wraps only inside a flex parent. */}
            <Row className="mt">
              <div className="seg" role="group" aria-label="Available days">
                {WEEKDAYS.map((day) => {
                  const active = booking.available_days.includes(day.id);
                  return (
                    <button
                      key={day.id}
                      type="button"
                      aria-pressed={active}
                      className={active ? "on" : ""}
                      onClick={() => toggleDay(day.id)}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            </Row>
          </div>

          <CG>
            <Field className="s6" label="Accent color">
              <ColorInput value={booking.primary_color} onChange={(v) => update({ primary_color: v })} />
            </Field>
            <Field className="s6" label="Background color">
              <ColorInput value={booking.background_color} onChange={(v) => update({ background_color: v })} />
            </Field>
          </CG>

          <Row>
            <Link href={bookingPath} target="_blank" className="btn">
              <Icon name="external" size={13} /> Preview page
            </Link>
            <div className="sub" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
              {publicUrl}
            </div>
          </Row>
        </div>

        {/* DELIBERATELY NOT MIGRATED. This mirrors the public /book/[slug] page,
            whose surface and accent are the two colours being edited here.
            Restyling it to `.card` / `.panel` would make the preview show the
            operator console instead of the page it previews. */}
        <div
          style={{
            borderRadius: 14,
            border: "1px solid var(--line)",
            padding: 18,
            background: booking.background_color,
            color: "#ffffff",
            boxShadow: "0 14px 34px rgba(0,0,0,0.22)",
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.5, textTransform: "uppercase", color: booking.primary_color }}>
            Booking preview
          </div>
          <h3 style={{ margin: "10px 0 8px", fontSize: 24, lineHeight: 1.1 }}>
            {booking.title || `Book a meeting with ${user?.name || "your agent"}`}
          </h3>
          <p style={{ margin: 0, color: "rgba(255,255,255,0.72)", fontSize: 13, lineHeight: 1.5 }}>
            {booking.intro || "Choose a time that works for you. You will receive a confirmation after booking."}
          </p>
          <div style={{ marginTop: 18, display: "grid", gap: 8 }}>
            {["Tomorrow", "Thursday", "Friday"].map((label, idx) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.06)" }}>
                <span>{label}</span>
                <span style={{ color: booking.primary_color, fontWeight: 900 }}>{idx === 0 ? booking.start_time : "10:30"}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

// ───────────────────────────────────────────────────────────────────
// Section 3: AI Cadence — preset cards + advanced disclosure
// ───────────────────────────────────────────────────────────────────
interface CadenceProps {
  draft: AgentSettingsData;
  setDraft: React.Dispatch<React.SetStateAction<AgentSettingsData>>;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
}

function CadenceSection({ draft, setDraft, dirty, saving, onSave }: CadenceProps) {
  const preset = detectPreset(draft.cadence);
  const cadence = draft.cadence;
  const [showAdvanced, setShowAdvanced] = useState(
    // Auto-expand if the saved cadence doesn't match any preset (custom override)
    !!cadence && preset === "standard" &&
      (cadence.first_reminder_days != null ||
       cadence.second_reminder_days != null ||
       cadence.escalate_after_days != null)
  );

  const setPreset = (id: CadencePreset) => {
    if (id === "standard") {
      // Standard = inherit firm default = no override
      setDraft((d) => ({ ...d, cadence: null }));
    } else {
      const p = CADENCE_PRESETS[id];
      setDraft((d) => ({
        ...d,
        cadence: {
          first_reminder_days: p.first,
          second_reminder_days: p.second,
          escalate_after_days: p.escalate,
        },
      }));
    }
  };

  const updateAdvanced = (patch: Partial<AgentCadenceOverride>) => {
    setDraft((d) => ({
      ...d,
      cadence: {
        first_reminder_days: d.cadence?.first_reminder_days ?? null,
        second_reminder_days: d.cadence?.second_reminder_days ?? null,
        escalate_after_days: d.cadence?.escalate_after_days ?? null,
        ...patch,
      },
    }));
  };

  return (
    <Panel
      title="AI Cadence"
      actions={<SaveBtn dirty={dirty} saving={saving} onClick={onSave} />}
      bodyClass="grid"
    >
      <div className="sub">
        How aggressively Elara nudges your leads to send in the docs they owe.
        Pick a preset; you can override per-lead when you add a lead.
      </div>

      {/* Stacked pick rows rather than three side-by-side tiles: one preset is
          chosen at a time, which is what `.pick.on` says. */}
      <div>
        {(Object.keys(CADENCE_PRESETS) as CadencePreset[]).map((id) => {
          const p = CADENCE_PRESETS[id];
          const active = preset === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              onClick={() => setPreset(id)}
              className={cx("pick", active && "on")}
            >
              <b>{p.label}</b>
              <span className="sub">{p.sub}</span>
            </button>
          );
        })}
      </div>

      {/* Advanced disclosure */}
      <div>
        <Linky
          onClick={() => setShowAdvanced((v) => !v)}
          aria-expanded={showAdvanced}
          style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
        >
          <Icon name={showAdvanced ? "chevD" : "chevR"} size={11} />
          Advanced — set exact day counts
        </Linky>
        {showAdvanced && (
          <CG className="mt">
            <Field className="s4" label="First reminder (days)">
              <NullableNumInput
                value={cadence?.first_reminder_days ?? null}
                onChange={(n) => updateAdvanced({ first_reminder_days: n })}
                placeholder="3"
              />
            </Field>
            <Field className="s4" label="Second reminder (days)">
              <NullableNumInput
                value={cadence?.second_reminder_days ?? null}
                onChange={(n) => updateAdvanced({ second_reminder_days: n })}
                placeholder="7"
              />
            </Field>
            <Field className="s4" label="Escalate after (days)">
              <NullableNumInput
                value={cadence?.escalate_after_days ?? null}
                onChange={(n) => updateAdvanced({ escalate_after_days: n })}
                placeholder="14"
              />
            </Field>
          </CG>
        )}
      </div>
    </Panel>
  );
}

// ───────────────────────────────────────────────────────────────────
// Section 3: Doc Checklist — single Buyer | Seller tab
// ───────────────────────────────────────────────────────────────────
interface ChecklistsProps {
  draft: AgentSettingsData;
  setDraft: React.Dispatch<React.SetStateAction<AgentSettingsData>>;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
}

function ChecklistsSection({ draft, setDraft, dirty, saving, onSave }: ChecklistsProps) {
  const [activeSide, setActiveSide] = useState<LoanSide>("buyer");
  // Click-to-expand state. Starter rows use string id "starter:<name>";
  // extra rows use "extra:<idx>". One row open at a time.
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const overlay = draft.checklists?.[activeSide] ?? emptyOverlay();
  const starter = activeSide === "buyer" ? STARTER_BUYER_DOCS : STARTER_SELLER_DOCS;

  const setOverlay = (next: AgentChecklistOverlay) => {
    setDraft((d) => ({ ...d, checklists: { ...d.checklists, [activeSide]: next } }));
  };

  const toggleDisable = (name: string) => {
    const has = overlay.disabled_firm_items.includes(name);
    setOverlay({
      ...overlay,
      disabled_firm_items: has
        ? overlay.disabled_firm_items.filter((n) => n !== name)
        : [...overlay.disabled_firm_items, name],
    });
  };

  const addExtra = () => {
    const newItem: DocChecklistItem = {
      name: `Custom doc ${overlay.extra_items.length + 1}`,
      display_name: null,
      type: "external",
      required: false,
      auto_request: true,
      due_offset_days: 7,
      anchor: "loan_created",
      per_unit: false,
      side: activeSide,
    };
    setOverlay({ ...overlay, extra_items: [...overlay.extra_items, newItem] });
    // Auto-expand the new row so the agent immediately edits its details
    setExpandedKey(`extra:${overlay.extra_items.length}`);
  };

  const updateExtra = (idx: number, patch: Partial<DocChecklistItem>) => {
    const next = [...overlay.extra_items];
    next[idx] = { ...next[idx], ...patch };
    setOverlay({ ...overlay, extra_items: next });
  };

  const removeExtra = (idx: number) => {
    const next = overlay.extra_items.filter((_, i) => i !== idx);
    setOverlay({ ...overlay, extra_items: next });
    if (expandedKey === `extra:${idx}`) setExpandedKey(null);
  };

  // Reset expanded row when switching tab so we don't accidentally
  // show a row from the other side.
  const onSideChange = (next: LoanSide) => {
    setActiveSide(next);
    setExpandedKey(null);
  };

  return (
    <Panel
      title="Doc Checklist — your leads"
      actions={<SaveBtn dirty={dirty} saving={saving} onClick={onSave} />}
      bodyClass="grid"
    >
      <div className="sub">
        What Elara will collect from your buyer-side and seller-side leads.
        Click any row to see its full detail. Disable starter items you don&apos;t
        want, and add your own. You can further override per-lead when you add a lead.
      </div>

      <Row>
        <Seg
          value={activeSide}
          onChange={onSideChange}
          ariaLabel="Transaction side"
          options={SIDES.map((s) => ({ value: s.id, label: s.label }))}
        />
      </Row>

      {/* Starter (firm-default) zone — read-only details, toggle to disable */}
      <div>
        <div className="lbl">Starter docs — uncheck to disable on your leads</div>
        <div className="mt">
          {starter.map((name) => {
            const disabled = overlay.disabled_firm_items.includes(name);
            const key = `starter:${name}`;
            const isExpanded = expandedKey === key;
            return (
              <Fragment key={name}>
                {/* Collapsed row */}
                <div
                  className="filerow"
                  onClick={() => setExpandedKey(isExpanded ? null : key)}
                  style={{ cursor: "pointer", opacity: disabled ? 0.65 : 1 }}
                >
                  <Icon name={isExpanded ? "chevD" : "chevR"} size={11} />
                  <input
                    type="checkbox"
                    checked={!disabled}
                    onChange={(e) => { e.stopPropagation(); toggleDisable(name); }}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Collect ${name}`}
                  />
                  <span className="sp" style={{ fontWeight: 700, textDecoration: disabled ? "line-through" : "none" }}>
                    {name}
                  </span>
                  <CellChip tone="mut">{activeSide}</CellChip>
                </div>

                {/* Expanded details (read-only — firm defaults can't be
                    edited from the agent surface; only disabled). */}
                {isExpanded && (
                  <Note>
                    <div style={{ display: "grid", gap: 4 }}>
                      <div><b>What Elara collects:</b> {name}</div>
                      <div><b>Side:</b> {activeSide}</div>
                      <div>
                        <b>Status:</b>{" "}
                        {disabled
                          ? "Disabled on your leads — Elara won't request this."
                          : "Active — Elara will request this from each new lead."}
                      </div>
                      <div className="sub">
                        Starter docs are firm-managed. To edit due dates or wording,
                        add your own version under &quot;Your additions&quot; below and
                        disable this one.
                      </div>
                    </div>
                  </Note>
                )}
              </Fragment>
            );
          })}
        </div>
      </div>

      {/* Your additions — fully editable */}
      <div>
        <Row>
          <div className="lbl">Your additions — extras only you collect</div>
          <span className="sp" />
          <Btn size="sm" onClick={addExtra}>
            <Icon name="plus" size={11} /> Add row
          </Btn>
        </Row>
        {overlay.extra_items.length === 0 ? (
          <div className="sub mt">
            No additions yet. Click &quot;Add row&quot; to extend your {activeSide}-side checklist.
          </div>
        ) : (
          <div className="mt">
            {overlay.extra_items.map((it, idx) => {
              const key = `extra:${idx}`;
              const isExpanded = expandedKey === key;
              const offset = it.due_offset_days ?? 7;
              return (
                <Fragment key={idx}>
                  {/* Collapsed row */}
                  <div
                    className="filerow"
                    onClick={() => setExpandedKey(isExpanded ? null : key)}
                    style={{ cursor: "pointer" }}
                  >
                    <Icon name={isExpanded ? "chevD" : "chevR"} size={11} />
                    <span className="sp" style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {it.display_name || it.name}
                    </span>
                    {it.required ? <CellChip tone="acc">Required</CellChip> : null}
                    <span className="sub">due +{offset}d</span>
                    <IconBtn
                      aria-label="Remove row"
                      onClick={(e) => { e.stopPropagation(); removeExtra(idx); }}
                    >
                      <Icon name="x" size={11} />
                    </IconBtn>
                  </div>

                  {/* Expanded editor — agent-relevant fields only.
                      Drops type/anchor/per_unit/internal_action since
                      those are funding-stage internal concerns. */}
                  {isExpanded && (
                    <div className="card">
                      <CG>
                        <Field className="s6" label="Internal key">
                          <Input
                            value={it.name}
                            onChange={(e) => updateExtra(idx, { name: e.target.value })}
                            placeholder="e.g. closing_disclosure"
                          />
                        </Field>
                        <Field className="s6" label="What the borrower sees">
                          <Input
                            value={it.display_name ?? ""}
                            onChange={(e) => updateExtra(idx, { display_name: e.target.value || null })}
                            placeholder={it.name}
                          />
                        </Field>
                        <Field className="s6" label="Due offset (days)">
                          <NumInput
                            value={it.due_offset_days ?? 7}
                            onChange={(n) => updateExtra(idx, { due_offset_days: n })}
                          />
                        </Field>
                        <Field className="s6" label="Side">
                          <Select
                            value={it.side ?? activeSide}
                            onChange={(e) => updateExtra(idx, { side: e.target.value as DocChecklistItem["side"] })}
                          >
                            <option value="buyer">Buyer</option>
                            <option value="seller">Seller</option>
                            <option value="both">Both</option>
                          </Select>
                        </Field>
                        <div className="s6">
                          <Toggle
                            label="Required"
                            value={!!it.required}
                            onChange={(v) => updateExtra(idx, { required: v })}
                          />
                        </div>
                        <div className="s6">
                          <Toggle
                            label="Auto-request from borrower"
                            value={it.auto_request !== false}
                            onChange={(v) => updateExtra(idx, { auto_request: v })}
                          />
                        </div>
                      </CG>
                    </div>
                  )}
                </Fragment>
              );
            })}
          </div>
        )}
      </div>
    </Panel>
  );
}

// ───────────────────────────────────────────────────────────────────
// Primitives
// ───────────────────────────────────────────────────────────────────
function defaultBookingSlug(seed: string): string {
  return normalizeBookingSlug(seed) || "agent";
}

function normalizeBookingSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 64);
}

/**
 * Two-tone status line. `.c-ok` / `.c-warn` / `.c-bad` own the tint and the
 * text colour; the inline values are box geometry only — the stylesheet has no
 * block-level status surface, and `.cellchip` is `white-space: nowrap`, which
 * a full-sentence save error is not.
 */
function StatusLine({ tone, children }: { tone: "ok" | "warn" | "bad"; children: ReactNode }) {
  return (
    <div className={`c-${tone}`} style={{ borderRadius: 10, padding: "9px 12px", fontSize: 12.5, fontWeight: 650 }}>
      {children}
    </div>
  );
}

/** Label above a control, still a real `<label>` so clicking it focuses. */
function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={className} style={{ display: "grid", gap: 5, minWidth: 0 }}>
      <span className="lbl">{label}</span>
      {children}
    </label>
  );
}

function ReadOnlyField({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className} style={{ display: "grid", gap: 5, minWidth: 0 }}>
      <span className="lbl">{label}</span>
      <div>{value}</div>
    </div>
  );
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Row>
      {/* `.field` owns the frame; only the swatch box size is inline. */}
      <input
        type="color"
        className="field"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 52, height: 36 }}
      />
      <Input grow value={value} onChange={(e) => onChange(e.target.value)} />
    </Row>
  );
}

/** Checkbox row — the same selectable-row object as the section rail. */
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={cx("pick", value && "on")}>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 16, height: 16, cursor: "pointer" }}
      />
      <span>{label}</span>
    </label>
  );
}

function NumInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <Input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
    />
  );
}

function NullableNumInput({ value, onChange, placeholder }: { value: number | null; onChange: (n: number | null) => void; placeholder?: string }) {
  return (
    <Input
      type="number"
      value={value ?? ""}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === "" ? null : Number(v));
      }}
      placeholder={placeholder}
    />
  );
}

function SaveBtn({ dirty, saving, onClick }: { dirty: boolean; saving: boolean; onClick: () => void }) {
  // `.btn:disabled` carries the dimmed, not-allowed state the inline
  // background/colour swap used to.
  return (
    <Btn variant="pri" onClick={onClick} disabled={!dirty || saving}>
      {saving ? "Saving…" : "Save"}
    </Btn>
  );
}
