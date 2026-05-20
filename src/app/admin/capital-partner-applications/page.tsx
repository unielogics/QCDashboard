"use client";

// Super-admin review queue for capital-partner (lender) applications
// submitted via qualifiedcommercial.com/lenders/apply.
//
// Wired to:
//   GET  /admin/capital-partner-applications[?status_filter=...]
//   GET  /admin/capital-partner-applications/{id}
//   POST /admin/capital-partner-applications/{id}/decision
//
// Single-page UI: status filter pills + list. Clicking a row opens an
// inline detail/decision panel (modal-style overlay) where the operator
// reviews the full application, adds notes, and approves or denies. On
// approval, an optional "Promote to lender roster" checkbox stamps a
// row in the existing `lenders` table so deals can route immediately.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { useActiveProfile } from "@/store/role";
import { Role } from "@/lib/enums.generated";
import {
  useCapitalPartnerApplication,
  useCapitalPartnerApplications,
  useDecideCapitalPartnerApplication,
  type CapitalPartnerAppListRow,
  type CapitalPartnerApp,
  type CapitalPartnerStatus,
} from "@/hooks/useApi";

type FilterId = CapitalPartnerStatus | "all";

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "denied", label: "Denied" },
];

function statusAccent(t: ReturnType<typeof useTheme>["t"], s: CapitalPartnerStatus) {
  if (s === "approved") return { label: "Approved", bg: t.profitBg, fg: t.profit };
  if (s === "denied") return { label: "Denied", bg: t.dangerBg, fg: t.danger };
  return { label: "Pending", bg: t.warnBg, fg: t.warn };
}

const fmtUsd = (n: number | null | undefined) => {
  if (n == null) return "—";
  return n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
    : n >= 1_000
      ? `$${Math.round(n / 1_000)}K`
      : `$${n}`;
};

export default function CapitalPartnerApplicationsPage() {
  const { t } = useTheme();
  const profile = useActiveProfile();
  const router = useRouter();
  const [filter, setFilter] = useState<FilterId>("pending");
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useCapitalPartnerApplications();

  const counts = useMemo(() => {
    const c: Record<CapitalPartnerStatus, number> = {
      pending: 0,
      approved: 0,
      denied: 0,
    };
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const filtered = filter === "all" ? rows : rows.filter((r) => r.status === filter);
    // Pending first; within each status, newest first.
    const rank: Record<CapitalPartnerStatus, number> = {
      pending: 0,
      approved: 1,
      denied: 2,
    };
    return [...filtered].sort((a, b) => {
      const ra = rank[a.status] ?? 99;
      const rb = rank[b.status] ?? 99;
      if (ra !== rb) return ra - rb;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [rows, filter]);

  if (profile.role !== Role.SUPER_ADMIN) {
    return (
      <div style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
        <Card pad={28}>
          <div style={{ fontSize: 16, fontWeight: 800, color: t.ink }}>
            Super-admin only
          </div>
          <div style={{ fontSize: 13, color: t.ink2, marginTop: 6, lineHeight: 1.5 }}>
            Capital partner applications can only be reviewed by super-admin.
          </div>
          <button onClick={() => router.push("/")} style={{ ...qcBtn(t), marginTop: 14 }}>
            Back to dashboard
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: 24,
        maxWidth: 1400,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div>
        <h1
          style={{
            margin: 0,
            fontSize: 24,
            fontWeight: 800,
            color: t.ink,
            letterSpacing: -0.4,
          }}
        >
          Capital partner applications
        </h1>
        <div style={{ fontSize: 13, color: t.ink3, marginTop: 4 }}>
          Submissions from qualifiedcommercial.com/lenders/apply. Click a row to
          review and approve / deny. Approval can optionally promote the
          firm into the lender roster.
        </div>
      </div>

      {/* Filter pills */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {FILTERS.map((f) => {
          const active = filter === f.id;
          const count = f.id === "all" ? rows.length : counts[f.id] ?? 0;
          const accent =
            f.id === "approved"
              ? { fg: t.profit, bg: t.profitBg }
              : f.id === "denied"
                ? { fg: t.danger, bg: t.dangerBg }
                : f.id === "pending"
                  ? { fg: t.warn, bg: t.warnBg }
                  : { fg: t.ink, bg: t.surface2 };
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              style={{
                all: "unset",
                cursor: "pointer",
                padding: "8px 14px",
                borderRadius: 999,
                background: active ? accent.bg : "transparent",
                border: `1px solid ${active ? accent.fg + "30" : t.line}`,
                color: active ? accent.fg : t.ink2,
                fontSize: 12,
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
              }}
            >
              <span>{f.label}</span>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 800,
                  fontFeatureSettings: '"tnum"',
                  padding: "1px 6px",
                  borderRadius: 999,
                  background: active ? accent.fg + "22" : t.surface2,
                  color: active ? accent.fg : t.ink3,
                  minWidth: 18,
                  textAlign: "center",
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <Card pad={28}>
          <div style={{ fontSize: 12.5, color: t.ink3 }}>Loading applications…</div>
        </Card>
      ) : visible.length === 0 ? (
        <Card pad={28}>
          <div style={{ fontSize: 13, color: t.ink2 }}>
            No applications in this status.
          </div>
        </Card>
      ) : (
        <Card pad={0}>
          <Header t={t} />
          {visible.map((r) => (
            <Row key={r.id} row={r} t={t} onClick={() => setOpenId(r.id)} />
          ))}
        </Card>
      )}

      {openId ? (
        <ReviewModal id={openId} onClose={() => setOpenId(null)} />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row + header
// ---------------------------------------------------------------------------

const GRID = "4px 110px minmax(0, 1.6fr) minmax(0, 1.2fr) minmax(0, 1fr) 140px 110px";

function Header({ t }: { t: ReturnType<typeof useTheme>["t"] }) {
  const cell = (label: string) => (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 1.2,
        textTransform: "uppercase",
        color: t.ink3,
      }}
    >
      {label}
    </div>
  );
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: GRID,
        gap: 12,
        padding: "12px 16px 12px 12px",
        borderBottom: `1px solid ${t.line}`,
        background: t.surface2,
      }}
    >
      <div />
      {cell("Status")}
      {cell("Company")}
      {cell("Contact")}
      {cell("Loan types")}
      {cell("Monthly volume")}
      {cell("Submitted")}
    </div>
  );
}

function Row({
  row,
  t,
  onClick,
}: {
  row: CapitalPartnerAppListRow;
  t: ReturnType<typeof useTheme>["t"];
  onClick: () => void;
}) {
  const s = statusAccent(t, row.status);
  const stripe =
    row.status === "approved" ? t.profit : row.status === "denied" ? t.danger : t.warn;
  const created = new Date(row.created_at);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        display: "grid",
        gridTemplateColumns: GRID,
        gap: 12,
        padding: "14px 16px 14px 12px",
        borderBottom: `1px solid ${t.line}`,
        alignItems: "center",
        fontSize: 13,
        color: t.ink,
        cursor: "pointer",
        transition: "background .12s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = t.surface2;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = "transparent";
      }}
    >
      <div style={{ alignSelf: "stretch", background: stripe, borderRadius: 2 }} />
      <div>
        <Pill bg={s.bg} color={s.fg}>
          {s.label}
        </Pill>
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: t.ink,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {row.company_name}
        </div>
        {row.promoted_lender_id ? (
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              color: t.brand,
              marginTop: 3,
              letterSpacing: 0.6,
              textTransform: "uppercase",
            }}
          >
            ↗ promoted to lender roster
          </div>
        ) : null}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: t.ink2 }}>{row.contact_name}</div>
        <div
          style={{
            fontSize: 11,
            color: t.ink3,
            marginTop: 2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {row.contact_email}
        </div>
      </div>
      <div
        style={{
          fontSize: 11.5,
          color: t.ink2,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {row.loan_types.length > 0 ? row.loan_types.join(", ") : "—"}
      </div>
      <div style={{ fontSize: 12, color: t.ink2 }}>
        {row.monthly_origination_band ?? "—"}
      </div>
      <div style={{ fontSize: 12, color: t.ink3, fontFeatureSettings: '"tnum"' }}>
        {created.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review modal — full detail + decision form
// ---------------------------------------------------------------------------

function ReviewModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useTheme();
  // Defer to query — re-fetches whenever the modal mounts so the operator
  // gets the freshest copy if multiple super-admins are reviewing.
  const { data: detail, isLoading } = useCapitalPartnerApplication(id);
  const decide = useDecideCapitalPartnerApplication();
  const [reviewNotes, setReviewNotes] = useState("");
  const [promote, setPromote] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const isDecided = detail && detail.status !== "pending";

  const fire = async (decision: "approved" | "denied") => {
    if (!detail) return;
    setErr(null);
    try {
      await decide.mutateAsync({
        id: detail.id,
        payload: {
          decision,
          review_notes: reviewNotes.trim() || null,
          promote_to_lender: decision === "approved" ? promote : false,
        },
      });
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Decision failed");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 200,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "60px 16px",
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 880,
          background: t.surface,
          border: `1px solid ${t.line}`,
          borderRadius: 14,
          boxShadow: t.shadowLg,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "16px 20px",
            borderBottom: `1px solid ${t.line}`,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: t.ink3,
                letterSpacing: 1.2,
                textTransform: "uppercase",
              }}
            >
              Capital partner application
            </div>
            <div
              style={{
                fontSize: 19,
                fontWeight: 800,
                color: t.ink,
                marginTop: 2,
                letterSpacing: -0.2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {detail?.company_name ?? (isLoading ? "Loading…" : "—")}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              all: "unset",
              cursor: "pointer",
              width: 32,
              height: 32,
              borderRadius: 8,
              display: "grid",
              placeItems: "center",
              color: t.ink3,
            }}
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 22 }}>
          {!detail ? (
            <div style={{ fontSize: 13, color: t.ink3 }}>
              {isLoading ? "Loading application…" : "Not found"}
            </div>
          ) : (
            <>
              <ReviewStatusBanner detail={detail} t={t} />

              <Section title="Company" t={t}>
                <Field label="Entity type" value={detail.legal_entity_type} t={t} />
                <Field label="Formation state" value={detail.formation_state} t={t} />
                <Field label="EIN" value={detail.ein} t={t} />
                <Field
                  label="Years in business"
                  value={detail.years_in_business?.toString() ?? null}
                  t={t}
                />
                <Field
                  label="Website"
                  value={
                    detail.website ? (
                      <a
                        href={detail.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: t.brand, textDecoration: "none" }}
                      >
                        {detail.website}
                      </a>
                    ) : null
                  }
                  t={t}
                />
              </Section>

              <Section title="Lending appetite" t={t}>
                <Field
                  label="Loan types"
                  value={detail.loan_types.length ? detail.loan_types.join(", ") : null}
                  t={t}
                />
                <Field
                  label="Loan size"
                  value={
                    detail.loan_size_min || detail.loan_size_max
                      ? `${fmtUsd(detail.loan_size_min)} – ${fmtUsd(detail.loan_size_max)}`
                      : null
                  }
                  t={t}
                />
                <Field
                  label="States"
                  value={
                    detail.geographic_states.length
                      ? detail.geographic_states.join(", ")
                      : null
                  }
                  t={t}
                />
                <Field
                  label="Asset classes"
                  value={
                    detail.asset_classes.length ? detail.asset_classes.join(", ") : null
                  }
                  t={t}
                />
              </Section>

              <Section title="Capital & volume" t={t}>
                <Field label="Capital source" value={detail.capital_source} t={t} />
                <Field label="AUM" value={detail.aum_band} t={t} />
                <Field
                  label="Monthly origination"
                  value={detail.monthly_origination_band}
                  t={t}
                />
              </Section>

              <Section title="Underwriting box" t={t}>
                <Field
                  label="Max LTV"
                  value={
                    detail.max_ltv != null ? `${(detail.max_ltv * 100).toFixed(1)}%` : null
                  }
                  t={t}
                />
                <Field
                  label="Max LTC"
                  value={
                    detail.max_ltc != null ? `${(detail.max_ltc * 100).toFixed(1)}%` : null
                  }
                  t={t}
                />
                <Field
                  label="Min DSCR"
                  value={detail.min_dscr != null ? `${detail.min_dscr.toFixed(2)}x` : null}
                  t={t}
                />
                <Field
                  label="Min FICO"
                  value={detail.min_fico?.toString() ?? null}
                  t={t}
                />
                <Field label="Rate range" value={detail.rate_range} t={t} />
              </Section>

              <Section title="Contact & submission" t={t}>
                <Field label="Name" value={detail.contact_name} t={t} />
                <Field label="Title" value={detail.contact_title} t={t} />
                <Field
                  label="Email"
                  value={
                    <a
                      href={`mailto:${detail.contact_email}`}
                      style={{ color: t.brand, textDecoration: "none" }}
                    >
                      {detail.contact_email}
                    </a>
                  }
                  t={t}
                />
                <Field label="Phone" value={detail.contact_phone} t={t} />
                <Field label="Submission email" value={detail.submission_email} t={t} />
                <Field
                  label="Submission portal"
                  value={
                    detail.submission_portal_url ? (
                      <a
                        href={detail.submission_portal_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: t.brand, textDecoration: "none" }}
                      >
                        {detail.submission_portal_url}
                      </a>
                    ) : null
                  }
                  t={t}
                />
                <Field
                  label="Avg response time"
                  value={detail.average_response_time}
                  t={t}
                />
              </Section>

              {detail.notes ? (
                <Section title="Notes from applicant" t={t}>
                  <div
                    style={{
                      fontSize: 13,
                      color: t.ink2,
                      lineHeight: 1.55,
                      whiteSpace: "pre-wrap",
                      background: t.surface2,
                      padding: 14,
                      borderRadius: 10,
                    }}
                  >
                    {detail.notes}
                  </div>
                </Section>
              ) : null}

              {/* Decision form (only when pending) */}
              {!isDecided ? (
                <Section title="Decision" t={t}>
                  <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 10 }}>
                    <label>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: 0.8,
                          color: t.ink3,
                          textTransform: "uppercase",
                        }}
                      >
                        Review notes (internal)
                      </span>
                      <textarea
                        value={reviewNotes}
                        onChange={(e) => setReviewNotes(e.target.value)}
                        rows={4}
                        placeholder="Why approve or deny — visible to other operators only."
                        style={{
                          width: "100%",
                          marginTop: 6,
                          padding: "10px 12px",
                          borderRadius: 10,
                          background: t.surface2,
                          border: `1px solid ${t.line}`,
                          color: t.ink,
                          fontSize: 13,
                          fontFamily: "inherit",
                          outline: "none",
                          resize: "vertical",
                        }}
                      />
                    </label>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 12.5,
                        color: t.ink2,
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={promote}
                        onChange={(e) => setPromote(e.target.checked)}
                      />
                      On approval, also create a row in the lender roster so we
                      can route deals immediately.
                    </label>
                    {err ? (
                      <div style={{ fontSize: 12.5, color: t.danger, fontWeight: 600 }}>{err}</div>
                    ) : null}
                    <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                      <button
                        onClick={() => fire("approved")}
                        disabled={decide.isPending}
                        style={{
                          ...qcBtnPrimary(t),
                          opacity: decide.isPending ? 0.6 : 1,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <Icon name="check" size={13} stroke={3} />
                        Approve
                      </button>
                      <button
                        onClick={() => fire("denied")}
                        disabled={decide.isPending}
                        style={{
                          ...qcBtn(t),
                          color: t.danger,
                          borderColor: t.danger + "40",
                          opacity: decide.isPending ? 0.6 : 1,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <Icon name="x" size={13} stroke={3} />
                        Deny
                      </button>
                      <button onClick={onClose} style={qcBtn(t)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                </Section>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewStatusBanner({
  detail,
  t,
}: {
  detail: CapitalPartnerApp;
  t: ReturnType<typeof useTheme>["t"];
}) {
  const s = statusAccent(t, detail.status);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        borderRadius: 10,
        background: s.bg,
        border: `1px solid ${s.fg}30`,
      }}
    >
      <Pill bg={s.bg} color={s.fg}>
        {s.label}
      </Pill>
      <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: t.ink2 }}>
        Submitted{" "}
        {new Date(detail.created_at).toLocaleString("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
        })}
        {detail.reviewed_at ? (
          <>
            {" · "}
            decided{" "}
            {new Date(detail.reviewed_at).toLocaleString("en-US", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </>
        ) : null}
        {detail.promoted_lender_id ? (
          <>
            {" · "}
            <span style={{ color: t.brand, fontWeight: 700 }}>
              promoted to lender roster
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}

function Section({
  title,
  t,
  children,
}: {
  title: string;
  t: ReturnType<typeof useTheme>["t"];
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 800,
          letterSpacing: 1.4,
          textTransform: "uppercase",
          color: t.ink3,
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  t,
}: {
  label: string;
  value: React.ReactNode;
  t: ReturnType<typeof useTheme>["t"];
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          color: t.ink3,
          letterSpacing: 0.8,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
          color: t.ink,
          marginTop: 4,
          wordBreak: "break-word",
        }}
      >
        {value ?? <span style={{ color: t.ink4 }}>—</span>}
      </div>
    </div>
  );
}

