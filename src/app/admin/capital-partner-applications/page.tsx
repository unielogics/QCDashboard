"use client";

// Super-admin review queue for capital-partner (lender) applications
// submitted via qualifiedcommercial.com/lenders/apply.
//
// Wired to:
//   GET  /admin/capital-partner-applications[?status_filter=...]
//   GET  /admin/capital-partner-applications/{id}
//   POST /admin/capital-partner-applications/{id}/decision
//
// Single-page UI: status filter pills + list. Clicking a row opens the
// detail/decision drawer where the operator reviews the full application,
// adds notes, and approves or denies. On approval, an optional "Promote to
// lender roster" checkbox stamps a row in the existing `lenders` table so
// deals can route immediately.
//
// Styling: migrated off the inline token objects onto the plain-CSS design
// system in globals.css / app-extras.css. Every control, endpoint, permission
// gate, keyboard affordance and empty state from the inline version survives;
// only the surface vocabulary changed:
//   hand-rolled filter pills   → Seg (as="filter", counts kept in the labels)
//   CSS-grid faux table        → Table/Tr/Td, with the row's Enter/Space
//                                affordance carried by a real button on the
//                                company name (a <tr> cannot be role="button"
//                                without destroying the table semantics)
//   hand-rolled modal overlay  → ds/Drawer, which additionally brings Escape,
//                                body scroll lock and focus restore
//   status stripe + Pill       → CellChip tone (the stripe was a second copy
//                                of the same signal)

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Btn,
  Card,
  CellChip,
  Field,
  Linky,
  PageHeader,
  Panel,
  Seg,
  StatusLine,
  Table,
  Td,
  Textarea,
  Tr,
  cx,
  type ChipTone,
} from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { Icon } from "@/components/design-system/Icon";
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

/** Status → the chip vocabulary. Was a palette lookup off the theme object. */
function statusMeta(s: CapitalPartnerStatus): { label: string; tone: ChipTone } {
  if (s === "approved") return { label: "Approved", tone: "ok" };
  if (s === "denied") return { label: "Denied", tone: "bad" };
  return { label: "Pending", tone: "warn" };
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
      <Panel title="Super-admin only">
        <div className="sub">
          Capital partner applications can only be reviewed by super-admin.
        </div>
        <div className="row mt">
          <Btn onClick={() => router.push("/")}>Back to dashboard</Btn>
        </div>
      </Panel>
    );
  }

  return (
    <div className="grid">
      <PageHeader
        title="Capital partner applications"
        lede="Submissions from qualifiedcommercial.com/lenders/apply. Click a row to review and approve / deny. Approval can optionally promote the firm into the lender roster."
        actions={
          <Seg
            as="filter"
            ariaLabel="Filter by status"
            value={filter}
            onChange={setFilter}
            options={FILTERS.map((f) => ({
              value: f.id,
              label: (
                <>
                  {f.label} <span className="num">{f.id === "all" ? rows.length : counts[f.id] ?? 0}</span>
                </>
              ),
            }))}
          />
        }
      />

      {isLoading ? (
        <Card>
          <span className="sub">Loading applications…</span>
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <span className="sub">No applications in this status.</span>
        </Card>
      ) : (
        <Panel noPad>
          <Table
            caption="Capital partner applications"
            cols={[
              { label: "Status" },
              { label: "Company" },
              { label: "Contact" },
              { label: "Loan types" },
              { label: "Monthly volume" },
              { label: "Submitted" },
            ]}
          >
            {visible.map((r) => (
              <ApplicationRow key={r.id} row={r} onOpen={() => setOpenId(r.id)} />
            ))}
          </Table>
        </Panel>
      )}

      {openId ? <ReviewDrawer id={openId} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function ApplicationRow({
  row,
  onOpen,
}: {
  row: CapitalPartnerAppListRow;
  onOpen: () => void;
}) {
  const s = statusMeta(row.status);
  const created = new Date(row.created_at);
  return (
    <Tr onClick={onOpen}>
      <Td>
        <CellChip tone={s.tone}>{s.label}</CellChip>
      </Td>
      <Td>
        {/* The whole row is clickable with a mouse; this button is what makes
            the same action reachable from the keyboard, which the old
            role="button" div carried via its own Enter/Space handler. */}
        <div className="row">
          <Linky
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
          >
            {row.company_name}
          </Linky>
          {row.promoted_lender_id ? (
            <CellChip tone="acc">↗ promoted to lender roster</CellChip>
          ) : null}
        </div>
      </Td>
      <Td>
        <div className="grid g4">
          <span>{row.contact_name}</span>
          <span className="sub">{row.contact_email}</span>
        </div>
      </Td>
      <Td>{row.loan_types.length > 0 ? row.loan_types.join(", ") : "—"}</Td>
      <Td>{row.monthly_origination_band ?? "—"}</Td>
      <Td className="num">
        {created.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "2-digit",
        })}
      </Td>
    </Tr>
  );
}

// ---------------------------------------------------------------------------
// Review drawer — full detail + decision form
// ---------------------------------------------------------------------------

function ReviewDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  // Defer to query — re-fetches whenever the drawer mounts so the operator
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
    <Drawer
      open
      onClose={onClose}
      width="lg"
      // The visible title is the applicant's name and changes as the fetch
      // lands; the announced name has to stay put.
      ariaLabel="Capital partner application"
      title={detail?.company_name ?? (isLoading ? "Loading…" : "—")}
      sub="Capital partner application"
    >
      {!detail ? (
        <span className="sub">{isLoading ? "Loading application…" : "Not found"}</span>
      ) : (
        <div className="grid">
          <ReviewStatusBanner detail={detail} />

          <Panel title="Company" bodyClass="grid cols-auto">
            <Fld label="Entity type" value={detail.legal_entity_type} />
            <Fld label="Formation state" value={detail.formation_state} />
            <Fld label="EIN" value={detail.ein} />
            <Fld label="Years in business" value={detail.years_in_business?.toString() ?? null} />
            <Fld
              label="Website"
              value={
                detail.website ? (
                  <a href={detail.website} target="_blank" rel="noopener noreferrer">
                    {detail.website}
                  </a>
                ) : null
              }
            />
          </Panel>

          <Panel title="Lending appetite" bodyClass="grid cols-auto">
            <Fld
              label="Loan types"
              value={detail.loan_types.length ? detail.loan_types.join(", ") : null}
            />
            <Fld
              label="Loan size"
              value={
                detail.loan_size_min || detail.loan_size_max
                  ? `${fmtUsd(detail.loan_size_min)} – ${fmtUsd(detail.loan_size_max)}`
                  : null
              }
            />
            <Fld
              label="States"
              value={detail.geographic_states.length ? detail.geographic_states.join(", ") : null}
            />
            <Fld
              label="Asset classes"
              value={detail.asset_classes.length ? detail.asset_classes.join(", ") : null}
            />
          </Panel>

          <Panel title="Capital & volume" bodyClass="grid cols-auto">
            <Fld label="Capital source" value={detail.capital_source} />
            <Fld label="AUM" value={detail.aum_band} />
            <Fld label="Monthly origination" value={detail.monthly_origination_band} />
          </Panel>

          <Panel title="Underwriting box" bodyClass="grid cols-auto">
            <Fld
              label="Max LTV"
              value={detail.max_ltv != null ? `${(detail.max_ltv * 100).toFixed(1)}%` : null}
            />
            <Fld
              label="Max LTC"
              value={detail.max_ltc != null ? `${(detail.max_ltc * 100).toFixed(1)}%` : null}
            />
            <Fld
              label="Min DSCR"
              value={detail.min_dscr != null ? `${detail.min_dscr.toFixed(2)}x` : null}
            />
            <Fld label="Min FICO" value={detail.min_fico?.toString() ?? null} />
            <Fld label="Rate range" value={detail.rate_range} />
          </Panel>

          <Panel title="Contact & submission" bodyClass="grid cols-auto">
            <Fld label="Name" value={detail.contact_name} />
            <Fld label="Title" value={detail.contact_title} />
            <Fld
              label="Email"
              value={<a href={`mailto:${detail.contact_email}`}>{detail.contact_email}</a>}
            />
            <Fld label="Phone" value={detail.contact_phone} />
            <Fld label="Submission email" value={detail.submission_email} />
            <Fld
              label="Submission portal"
              value={
                detail.submission_portal_url ? (
                  <a href={detail.submission_portal_url} target="_blank" rel="noopener noreferrer">
                    {detail.submission_portal_url}
                  </a>
                ) : null
              }
            />
            <Fld label="Avg response time" value={detail.average_response_time} />
          </Panel>

          {detail.notes ? (
            <Panel title="Notes from applicant">
              {/* .msg-b is the app's pre-wrapped block of authored text — the
                  same shape this was hand-rolling. */}
              <div className="msg-b">{detail.notes}</div>
            </Panel>
          ) : null}

          {/* Decision form (only when pending) */}
          {!isDecided ? (
            <Panel title="Decision" bodyClass="grid g10">
              {/* A real <label> wrapper, not a detached caption: it is what
                  makes clicking the label focus the textarea. */}
              <label className="grid g6">
                <span className="lbl">Review notes (internal)</span>
                <Textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  rows={4}
                  placeholder="Why approve or deny — visible to other operators only."
                  style={{ resize: "vertical" }}
                />
              </label>
              <label className={cx("pick", promote && "on")}>
                <input
                  type="checkbox"
                  checked={promote}
                  onChange={(e) => setPromote(e.target.checked)}
                />
                <span>
                  On approval, also create a row in the lender roster so we can route deals
                  immediately.
                </span>
              </label>
              {err ? <StatusLine tone="bad">{err}</StatusLine> : null}
              <div className="row">
                <Btn variant="pri" onClick={() => fire("approved")} disabled={decide.isPending}>
                  <Icon name="check" size={13} stroke={3} />
                  Approve
                </Btn>
                <Btn
                  className="danger"
                  onClick={() => fire("denied")}
                  disabled={decide.isPending}
                >
                  <Icon name="x" size={13} stroke={3} />
                  Deny
                </Btn>
                <Btn onClick={onClose}>Cancel</Btn>
              </div>
            </Panel>
          ) : null}
        </div>
      )}
    </Drawer>
  );
}

function ReviewStatusBanner({ detail }: { detail: CapitalPartnerApp }) {
  const s = statusMeta(detail.status);
  return (
    <StatusLine tone={s.tone}>
      <b>{s.label}</b>
      {" · Submitted "}
      {new Date(detail.created_at).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      })}
      {detail.reviewed_at ? (
        <>
          {" · decided "}
          {new Date(detail.reviewed_at).toLocaleString("en-US", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </>
      ) : null}
      {detail.promoted_lender_id ? <>{" · promoted to lender roster"}</> : null}
    </StatusLine>
  );
}

/**
 * One read-only label/value pair inside a detail panel.
 *
 * Named `Fld` because `Field` is the design-system component it renders — the
 * only thing this adds is the em-dash placeholder and long-value wrapping.
 */
function Fld({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Field label={label}>
      {/* Emails, URLs and joined state lists have no spaces to break on, and
          .panel is overflow:hidden — without this they are clipped silently. */}
      <div style={{ wordBreak: "break-word" }}>{value ?? <span className="sub">—</span>}</div>
    </Field>
  );
}
