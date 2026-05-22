"use client";

// ClientFileModal — the borrower's stage-aware file detail surface,
// opened from the client /pipeline table (ClientFilePipeline).
//
// Rendered as a FULL in-content panel: it fills the main content area
// (right of the sidebar, below the top bar) rather than a viewport
// overlay, so the left nav stays visible and usable. ClientFilePipeline
// swaps the table for this panel while a file is open.
//
// Layout: a two-pane body —
//   · main pane: tabbed content, tab set chosen by file status
//   · right rail: the AI chat, persistent on every tab
//   · top strip: the AI's plain-English read of the file
//
// RE Working files show Property / Schedule / Documents.
// In Funding (and Funded) files add read-only Loan Terms / Conditions /
// Prequal / HUD so the borrower can watch the funding team's work.
//
// Loan-backed files (in_funding / funded) are fully wired. A deal-only
// RE Working file shows the shell with graceful "still being set up by
// your agent" states for the loan-scoped surfaces.

import { useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { QC_FMT } from "@/components/design-system/tokens";
import { loanTypeLabel } from "@/lib/types";
import {
  useCurrentUser,
  useDocuments,
  useHudLines,
  useLoan,
  useLoanPrequalRequests,
  type MyFileRow,
} from "@/hooks/useApi";
import { ClientLoanChatTab } from "@/app/loans/[id]/components/ClientLoanChatTab";
import { DocsTab } from "@/app/loans/[id]/tabs/DocsTab";

type TabId =
  | "property"
  | "schedule"
  | "documents"
  | "terms"
  | "conditions"
  | "prequal"
  | "hud";

const RE_WORKING_TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "property", label: "Property", icon: "home" },
  { id: "schedule", label: "Schedule", icon: "cal" },
  { id: "documents", label: "Documents", icon: "doc" },
];

const IN_FUNDING_TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "terms", label: "Loan Terms", icon: "sliders" },
  { id: "conditions", label: "Conditions", icon: "cal" },
  { id: "prequal", label: "Prequal", icon: "docCheck" },
  { id: "hud", label: "HUD", icon: "file" },
];

export function ClientFileModal({
  file,
  onClose,
}: {
  file: MyFileRow;
  onClose: () => void;
}) {
  const { t } = useTheme();
  const loanId = file.loan_uuid;
  const hasLoan = !!loanId;
  const isFunding = file.status === "in_funding" || file.status === "funded";

  const { data: currentUser } = useCurrentUser();
  const { data: loan } = useLoan(loanId);

  const tabs = useMemo(
    () => (isFunding ? [...RE_WORKING_TABS, ...IN_FUNDING_TABS] : RE_WORKING_TABS),
    [isFunding],
  );
  const [tab, setTab] = useState<TabId>("property");
  const activeTab = tabs.some((x) => x.id === tab) ? tab : tabs[0].id;

  const statusPill =
    file.status === "funded"
      ? { label: "Funded", bg: t.profitBg, fg: t.profit }
      : file.status === "in_funding"
        ? { label: "In Funding", bg: t.brandSoft, fg: t.brand }
        : file.status === "lost"
          ? { label: "Lost", bg: t.dangerBg, fg: t.danger }
          : { label: "RE Working", bg: t.warnBg, fg: t.warn };

  return (
    <div
      style={{
        // Full in-content panel — fills the main area; the sidebar +
        // top bar stay visible and usable.
        height: "calc(100vh - 112px)",
        minHeight: 520,
        background: t.surface,
        border: `1px solid ${t.line}`,
        borderRadius: 14,
        boxShadow: t.shadow,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 18px",
          borderBottom: `1px solid ${t.line}`,
        }}
      >
        <button
          onClick={onClose}
          style={{
            all: "unset",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 10px",
            borderRadius: 8,
            background: t.surface2,
            border: `1px solid ${t.line}`,
            color: t.ink2,
            fontSize: 12,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          <Icon name="arrowL" size={12} /> All files
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Pill bg={statusPill.bg} color={statusPill.fg}>
              {statusPill.label}
            </Pill>
            <span style={{ fontSize: 11, color: t.ink3, fontWeight: 700 }}>
              {file.ref} · {file.stage_detail}
            </span>
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: t.ink,
              marginTop: 3,
              letterSpacing: -0.2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {file.address || file.ref}
          </div>
        </div>
      </div>

      {/* AI intelligence strip */}
      {file.ai_status ? (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 9,
            padding: "10px 18px",
            borderBottom: `1px solid ${t.line}`,
            background: t.petrolSoft,
          }}
        >
          <Icon name="ai" size={13} color={t.petrol} />
          <div style={{ fontSize: 12.5, color: t.ink2, lineHeight: 1.5 }}>
            <span style={{ fontWeight: 800, color: t.petrol }}>Where things stand · </span>
            {file.ai_status}
          </div>
        </div>
      ) : null}

      {/* Two-pane body */}
      <div style={{ display: "flex", minHeight: 0, flex: 1 }}>
        {/* Main pane */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          {/* Tab strip */}
          <div
            style={{
              display: "flex",
              gap: 2,
              padding: "10px 16px",
              borderBottom: `1px solid ${t.line}`,
              flexWrap: "wrap",
            }}
          >
            {tabs.map((x) => {
              const on = x.id === activeTab;
              return (
                <button
                  key={x.id}
                  onClick={() => setTab(x.id)}
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "7px 12px",
                    borderRadius: 8,
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: on ? t.ink : t.ink3,
                    background: on ? t.surface2 : "transparent",
                  }}
                >
                  <Icon name={x.icon} size={12} />
                  {x.label}
                </button>
              );
            })}
          </div>

          {/* Panel */}
          <div style={{ padding: 16, overflowY: "auto", flex: 1, minHeight: 0 }}>
            {activeTab === "property" ? (
              <PropertyPanel file={file} loan={loan} t={t} />
            ) : activeTab === "schedule" ? (
              <SchedulePanel loan={loan} hasLoan={hasLoan} t={t} />
            ) : activeTab === "documents" ? (
              hasLoan && loan ? (
                <DocsTab loan={loan} canRequest={false} canUpload />
              ) : (
                <SetupNotice t={t} label="Document upload opens once your agent moves this file forward." />
              )
            ) : activeTab === "terms" ? (
              <LoanTermsPanel loan={loan} t={t} />
            ) : activeTab === "conditions" ? (
              <ConditionsPanel loanId={loanId} t={t} />
            ) : activeTab === "prequal" ? (
              <PrequalPanel loanId={loanId} t={t} />
            ) : activeTab === "hud" ? (
              <HudPanel loanId={loanId} t={t} />
            ) : null}
          </div>
        </div>

        {/* Persistent AI chat rail */}
        <div
          style={{
            width: 360,
            flexShrink: 0,
            borderLeft: `1px solid ${t.line}`,
            background: t.bg,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          <div
            style={{
              padding: "10px 14px",
              borderBottom: `1px solid ${t.line}`,
              display: "flex",
              alignItems: "center",
              gap: 7,
            }}
          >
            <Icon name="chat" size={13} color={t.petrol} />
            <span style={{ fontSize: 12.5, fontWeight: 800, color: t.ink }}>Chat</span>
            <span style={{ fontSize: 11, color: t.ink3 }}>· AI + your team</span>
          </div>
          <div style={{ flex: 1, minHeight: 0, padding: 12, overflowY: "auto" }}>
            {hasLoan && loanId && currentUser ? (
              <ClientLoanChatTab loanId={loanId} user={currentUser} />
            ) : (
              <SetupNotice
                t={t}
                label="Chat opens here once your file is active. In the meantime your agent is the best contact."
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Panels ────────────────────────────────────────────────────────────

function SetupNotice({
  t,
  label,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
}) {
  return (
    <Card pad={20}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <Icon name="clock" size={15} color={t.ink3} />
        <div style={{ fontSize: 13, color: t.ink2, lineHeight: 1.55 }}>{label}</div>
      </div>
    </Card>
  );
}

function FieldGrid({
  t,
  rows,
}: {
  t: ReturnType<typeof useTheme>["t"];
  rows: { label: string; value: React.ReactNode }[];
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: 14,
      }}
    >
      {rows.map((r) => (
        <div key={r.label}>
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              color: t.ink3,
              letterSpacing: 0.8,
              textTransform: "uppercase",
            }}
          >
            {r.label}
          </div>
          <div style={{ fontSize: 13.5, color: t.ink, marginTop: 4 }}>
            {r.value ?? <span style={{ color: t.ink4 }}>—</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function PropertyPanel({
  file,
  loan,
  t,
}: {
  file: MyFileRow;
  loan: ReturnType<typeof useLoan>["data"];
  t: ReturnType<typeof useTheme>["t"];
}) {
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Address", value: loan?.address || file.address || null },
    { label: "City", value: loan?.city || file.city || null },
    { label: "State", value: loan?.state ?? null },
    {
      label: "Property type",
      value: loan?.property_type ? String(loan.property_type) : null,
    },
    { label: "Beds", value: loan?.beds != null ? String(loan.beds) : null },
    { label: "Baths", value: loan?.baths != null ? String(loan.baths) : null },
    { label: "Sq ft", value: loan?.sqft != null ? loan.sqft.toLocaleString() : null },
    {
      label: "Year built",
      value: loan?.year_built != null ? String(loan.year_built) : null,
    },
    {
      label: "Loan type",
      value: file.loan_type ? loanTypeLabel(file.loan_type) : null,
    },
  ];
  return (
    <Card pad={18}>
      <FieldGrid t={t} rows={rows} />
    </Card>
  );
}

function SchedulePanel({
  loan,
  hasLoan,
  t,
}: {
  loan: ReturnType<typeof useLoan>["data"];
  hasLoan: boolean;
  t: ReturnType<typeof useTheme>["t"];
}) {
  if (!hasLoan) {
    return <SetupNotice t={t} label="Showings and key dates appear here once the file is active." />;
  }
  const closeDate = loan?.close_date ? new Date(loan.close_date) : null;
  return (
    <Card pad={18}>
      <FieldGrid
        t={t}
        rows={[
          {
            label: "Target close date",
            value:
              closeDate && !Number.isNaN(closeDate.getTime())
                ? closeDate.toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })
                : null,
          },
        ]}
      />
      <div style={{ fontSize: 12, color: t.ink3, marginTop: 14, lineHeight: 1.55 }}>
        Your agent and the funding team coordinate inspections, appraisal,
        and closing. Anything that needs you will show up in Chat and on
        your To-Do list.
      </div>
    </Card>
  );
}

function pct(v: number | null | undefined): string | null {
  if (v == null) return null;
  return `${(Number(v) * 100).toFixed(1)}%`;
}

function LoanTermsPanel({
  loan,
  t,
}: {
  loan: ReturnType<typeof useLoan>["data"];
  t: ReturnType<typeof useTheme>["t"];
}) {
  if (!loan) {
    return <SetupNotice t={t} label="Loan terms appear once underwriting begins." />;
  }
  const rate = loan.final_rate ?? loan.base_rate;
  return (
    <>
      <Card pad={18}>
        <FieldGrid
          t={t}
          rows={[
            { label: "Loan amount", value: loan.amount != null ? QC_FMT.usd(Number(loan.amount), 0) : null },
            { label: "Rate", value: rate != null ? `${Number(rate).toFixed(3)}%` : null },
            {
              label: "Term",
              value: loan.term_months != null ? `${loan.term_months} months` : null,
            },
            { label: "LTV", value: pct(loan.ltv) },
            { label: "LTC", value: pct(loan.ltc) },
            { label: "DSCR", value: loan.dscr != null ? `${Number(loan.dscr).toFixed(2)}x` : null },
            {
              label: "Amortization",
              value: loan.amortization_style ? String(loan.amortization_style) : null,
            },
            {
              label: "Prepay penalty",
              value: loan.prepay_penalty ? String(loan.prepay_penalty) : null,
            },
            { label: "ARV", value: loan.arv != null ? QC_FMT.usd(Number(loan.arv), 0) : null },
          ]}
        />
      </Card>
      <div style={{ fontSize: 11.5, color: t.ink4, marginTop: 10, fontStyle: "italic", lineHeight: 1.5 }}>
        Preliminary terms — final pricing and conditions are set by the
        lender at underwriting and may change.
      </div>
    </>
  );
}

function ConditionsPanel({
  loanId,
  t,
}: {
  loanId: string | null | undefined;
  t: ReturnType<typeof useTheme>["t"];
}) {
  const { data: docs = [], isLoading } = useDocuments(loanId ?? undefined);
  if (isLoading) {
    return <Card pad={16}><div style={{ fontSize: 13, color: t.ink3 }}>Loading…</div></Card>;
  }
  const outstanding = docs.filter((d) => d.status !== "verified");
  if (outstanding.length === 0) {
    return (
      <Card pad={18}>
        <div style={{ fontSize: 13, color: t.profit, fontWeight: 700 }}>
          ✓ No outstanding conditions — everything we need is in.
        </div>
      </Card>
    );
  }
  return (
    <Card pad={0}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${t.line}`, fontSize: 12, fontWeight: 800, color: t.ink2, textTransform: "uppercase", letterSpacing: 1 }}>
        {outstanding.length} outstanding {outstanding.length === 1 ? "item" : "items"}
      </div>
      {outstanding.map((d, i) => (
        <div
          key={d.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 16px",
            borderBottom: i < outstanding.length - 1 ? `1px solid ${t.line}` : "none",
          }}
        >
          <Icon
            name={d.status === "flagged" ? "alert" : "clock"}
            size={14}
            color={d.status === "flagged" ? t.danger : t.warn}
          />
          <div style={{ flex: 1, fontSize: 13, color: t.ink }}>{d.name}</div>
          <Pill
            bg={d.status === "flagged" ? t.dangerBg : t.warnBg}
            color={d.status === "flagged" ? t.danger : t.warn}
          >
            {d.status === "flagged" ? "Needs attention" : "Pending"}
          </Pill>
        </div>
      ))}
    </Card>
  );
}

function PrequalPanel({
  loanId,
  t,
}: {
  loanId: string | null | undefined;
  t: ReturnType<typeof useTheme>["t"];
}) {
  const { data: requests = [], isLoading } = useLoanPrequalRequests(loanId ?? undefined);
  if (isLoading) {
    return <Card pad={16}><div style={{ fontSize: 13, color: t.ink3 }}>Loading…</div></Card>;
  }
  if (requests.length === 0) {
    return <SetupNotice t={t} label="No pre-qualification letter yet for this file." />;
  }
  return (
    <Card pad={0}>
      {requests.map((r, i) => (
        <div
          key={r.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "13px 16px",
            borderBottom: i < requests.length - 1 ? `1px solid ${t.line}` : "none",
          }}
        >
          <Icon name="docCheck" size={15} color={t.petrol} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>
              {r.quote_number ? `Pre-qual ${r.quote_number}` : "Pre-qualification"}
            </div>
            <div style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>
              Status: {r.status}
            </div>
          </div>
          {r.pdf_url ? (
            <a
              href={r.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: t.brand,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <Icon name="doc" size={12} /> View letter
            </a>
          ) : (
            <span style={{ fontSize: 11.5, color: t.ink4 }}>No letter yet</span>
          )}
        </div>
      ))}
    </Card>
  );
}

function HudPanel({
  loanId,
  t,
}: {
  loanId: string | null | undefined;
  t: ReturnType<typeof useTheme>["t"];
}) {
  const { data: lines = [], isLoading } = useHudLines(loanId ?? undefined);
  if (isLoading) {
    return <Card pad={16}><div style={{ fontSize: 13, color: t.ink3 }}>Loading…</div></Card>;
  }
  if (lines.length === 0) {
    return <SetupNotice t={t} label="The settlement statement (HUD) isn't ready yet — it's prepared as closing approaches." />;
  }
  const total = lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
  return (
    <Card pad={0}>
      {lines.map((l) => (
        <div
          key={l.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "11px 16px",
            borderBottom: `1px solid ${t.line}`,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: t.ink }}>{l.label}</div>
            {l.payee ? (
              <div style={{ fontSize: 11, color: t.ink3, marginTop: 1 }}>{l.payee}</div>
            ) : null}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, fontFeatureSettings: '"tnum"', color: t.ink }}>
            {QC_FMT.usd(Number(l.amount) || 0, 2)}
          </div>
        </div>
      ))}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "13px 16px",
          background: t.surface2,
        }}
      >
        <div style={{ flex: 1, fontSize: 12.5, fontWeight: 800, color: t.ink2, textTransform: "uppercase", letterSpacing: 1 }}>
          Estimated total
        </div>
        <div style={{ fontSize: 14, fontWeight: 800, fontFeatureSettings: '"tnum"', color: t.ink }}>
          {QC_FMT.usd(total, 2)}
        </div>
      </div>
    </Card>
  );
}
