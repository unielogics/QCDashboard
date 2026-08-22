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
//
// Styling: this is edge-to-edge inside `.content` (the caller cancels the
// shell padding), so the OUTER box is deliberately not a `.panel` — a panel
// would draw a border and a 14px radius hard against the viewport edge. Its
// header, tab strip, scroller and rail borrow the panel vocabulary instead.

import { useMemo, useState } from "react";
import { Icon } from "@/components/design-system/Icon";
import { QC_FMT } from "@/components/design-system/tokens";
import {
  Btn,
  BtnLink,
  Callout,
  Card,
  CellChip,
  IconBtn,
  ItemRow,
  Note,
  Panel,
  StatusLine,
  Sub,
  Table,
  Td,
  Tr,
  cx,
  type ChipTone,
} from "@/components/ds";
import { loanTypeLabel } from "@/lib/types";
import {
  useCalendar,
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
  initialTab,
}: {
  file: MyFileRow;
  onClose: () => void;
  // Optional tab to open on — used by dashboard "needs attention"
  // deep-links (?tab=documents etc.). Falls back to Property; an
  // out-of-range value is clamped to the first available tab.
  initialTab?: string;
}) {
  const loanId = file.loan_uuid;
  const hasLoan = !!loanId;
  const isFunding = file.status === "in_funding" || file.status === "funded";

  const { data: currentUser } = useCurrentUser();
  const { data: loan } = useLoan(loanId);

  const tabs = useMemo(
    () => (isFunding ? [...RE_WORKING_TABS, ...IN_FUNDING_TABS] : RE_WORKING_TABS),
    [isFunding],
  );
  const [tab, setTab] = useState<TabId>((initialTab as TabId) || "property");
  const activeTab = tabs.some((x) => x.id === tab) ? tab : tabs[0].id;

  const statusPill: { label: string; tone: ChipTone } =
    file.status === "funded"
      ? { label: "Funded", tone: "ok" }
      : file.status === "in_funding"
        ? { label: "In Funding", tone: "acc" }
        : file.status === "lost"
          ? { label: "Lost", tone: "bad" }
          : { label: "RE Working", tone: "warn" };

  return (
    <div
      // Bespoke geometry: a full-bleed surface sized to the content area, with
      // its own scrollers inside. No class in the sheet expresses "fill the
      // viewport below the topbar", and `.panel` would add the frame this
      // deliberately does not have.
      style={{
        height: "calc(100vh - 64px)",
        minHeight: 560,
        background: "var(--surface)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div className="panel-h">
        <Btn onClick={onClose}>
          <Icon name="arrowL" size={12} /> All files
        </Btn>
        <div className="grow">
          <div className="row">
            <CellChip tone={statusPill.tone}>{statusPill.label}</CellChip>
            <span className="sub">
              {file.ref} · {file.stage_detail}
            </span>
          </div>
          <div className="filehd-t">{file.address || file.ref}</div>
        </div>
        <IconBtn onClick={onClose} aria-label="Close file">
          <Icon name="x" size={15} />
        </IconBtn>
      </div>

      {/* AI intelligence strip */}
      {file.ai_status ? (
        // Bespoke gutter only: the strip lines up with the header's 16px
        // inset. `.note` owns the box itself — petrol tint, petrol icon,
        // petrol lead-in.
        <div style={{ padding: "0 16px" }}>
          <Note>
            <Icon name="ai" size={13} />
            <div>
              <b>Where things stand · </b>
              {file.ai_status}
            </div>
          </Note>
        </div>
      ) : null}

      {/* Two-pane body.
          Bespoke geometry: a growing main pane and a fixed 360px chat rail,
          both full height with their own scrollers. `.withrail > .railcol` is
          a STICKY page rail, and `.rail` is the Elara sidebar (100vh, sticky) —
          both carry positioning that is wrong for a pane inside a fixed-height
          box, so the split is written out here. */}
      <div style={{ display: "flex", minHeight: 0, flex: 1 }}>
        {/* Main pane */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          {/* Tab strip */}
          <div className="ftabs" role="tablist" aria-label="File sections">
            {tabs.map((x) => {
              const on = x.id === activeTab;
              return (
                <button
                  key={x.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  className={cx("ftab", on && "on")}
                  onClick={() => setTab(x.id)}
                >
                  <Icon name={x.icon} size={12} />
                  {x.label}
                </button>
              );
            })}
          </div>

          {/* Panel — `.panel-b` owns the padding and the flex fill; the scroll
              is this box's own job. */}
          <div className="panel-b" style={{ overflowY: "auto", minHeight: 0 }}>
            {activeTab === "property" ? (
              <PropertyPanel file={file} loan={loan} />
            ) : activeTab === "schedule" ? (
              <SchedulePanel loan={loan} hasLoan={hasLoan} />
            ) : activeTab === "documents" ? (
              hasLoan && loan ? (
                <DocsTab loan={loan} canRequest={false} canUpload />
              ) : (
                <SetupNotice label="Document upload opens once your agent moves this file forward." />
              )
            ) : activeTab === "terms" ? (
              <LoanTermsPanel loan={loan} />
            ) : activeTab === "conditions" ? (
              <ConditionsPanel loanId={loanId} />
            ) : activeTab === "prequal" ? (
              <PrequalPanel loanId={loanId} />
            ) : activeTab === "hud" ? (
              <HudPanel loanId={loanId} />
            ) : null}
          </div>
        </div>

        {/* Persistent AI chat rail — bespoke fixed pane, see the note above. */}
        <div
          style={{
            width: 360,
            flexShrink: 0,
            borderLeft: "1px solid var(--line)",
            background: "var(--bg)",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          <div className="panel-h">
            <Icon name="chat" size={13} />
            <b>Chat</b>
            <Sub>· AI + your team</Sub>
          </div>
          <div className="panel-b" style={{ overflowY: "auto", minHeight: 0 }}>
            {hasLoan && loanId && currentUser ? (
              <ClientLoanChatTab loanId={loanId} user={currentUser} />
            ) : (
              <SetupNotice label="Chat opens here once your file is active. In the meantime your agent is the best contact." />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Panels ────────────────────────────────────────────────────────────

function SetupNotice({ label }: { label: string }) {
  return <Callout icon={<Icon name="clock" size={15} />}>{label}</Callout>;
}

function FieldGrid({
  rows,
}: {
  rows: { label: string; value: React.ReactNode }[];
}) {
  return (
    <div className="grid cols-auto">
      {rows.map((r) => (
        <div key={r.label} className="grid g4">
          <div className="lbl">{r.label}</div>
          <div>{r.value ?? <Sub>—</Sub>}</div>
        </div>
      ))}
    </div>
  );
}

function PropertyPanel({
  file,
  loan,
}: {
  file: MyFileRow;
  loan: ReturnType<typeof useLoan>["data"];
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
    <Card>
      <FieldGrid rows={rows} />
    </Card>
  );
}

function SchedulePanel({
  loan,
  hasLoan,
}: {
  loan: ReturnType<typeof useLoan>["data"];
  hasLoan: boolean;
}) {
  const { data: allEvents } = useCalendar();

  // Events scoped to THIS file, soonest first. Overdue items are kept,
  // never filtered out — a missed milestone has to stay visible.
  const events = useMemo(() => {
    if (!loan?.id || !allEvents) return [];
    return allEvents
      .filter((ev) => ev.loan_id === loan.id)
      .sort(
        (a, b) =>
          new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
      );
  }, [allEvents, loan?.id]);

  if (!hasLoan) {
    return <SetupNotice label="Showings and key dates appear here once the file is active." />;
  }

  const now = Date.now();
  const closeDate = loan?.close_date ? new Date(loan.close_date) : null;

  const kindLabel = (k: string): string =>
    ({
      call: "Call",
      doc: "Document",
      ai: "AI task",
      inspect: "Inspection",
      milestone: "Milestone",
      lock: "Rate lock",
      pay: "Payment",
      closing: "Closing",
    })[k] ?? "Event";

  return (
    <div className="grid">
      <Card>
        <FieldGrid
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
        <div className="sub mt">
          Your agent and the funding team coordinate inspections, appraisal,
          and closing. Anything that needs you will show up in Chat and on
          your To-Do list.
        </div>
      </Card>

      <Panel title="Key dates">
        {events.length === 0 ? (
          <div className="sub">
            No scheduled items yet. Inspections, appraisal, and closing
            dates appear here as the funding team sets them.
          </div>
        ) : (
          // `.itemrow + .itemrow` owns the spacing between rows.
          <div>
            {events.map((ev) => {
              const when = new Date(ev.starts_at);
              const isOverdue =
                when.getTime() < now && ev.status === "pending";
              const isDone = ev.status === "done";
              const isCancelled = ev.status === "cancelled";
              return (
                <ItemRow
                  key={ev.id}
                  // A missed milestone tints the whole row: a list like this is
                  // scanned, and a chip alone means reading every row to find it.
                  className={cx(isOverdue && "tone-bad")}
                  right={
                    isOverdue ? (
                      <CellChip tone="bad">Overdue</CellChip>
                    ) : isDone ? (
                      <CellChip tone="ok">Done</CellChip>
                    ) : isCancelled ? (
                      <CellChip>Cancelled</CellChip>
                    ) : (
                      <CellChip>Scheduled</CellChip>
                    )
                  }
                >
                  <div
                    className="trunc"
                    // Data-derived: a cancelled event is struck through, and no
                    // class carries that state.
                    style={isCancelled ? { textDecoration: "line-through" } : undefined}
                  >
                    {ev.title}
                  </div>
                  <div className="sub">
                    {kindLabel(ev.kind)} ·{" "}
                    {when.toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    {ev.who ? ` · ${ev.who}` : ""}
                  </div>
                </ItemRow>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

function pct(v: number | null | undefined): string | null {
  if (v == null) return null;
  return `${(Number(v) * 100).toFixed(1)}%`;
}

function LoanTermsPanel({ loan }: { loan: ReturnType<typeof useLoan>["data"] }) {
  if (!loan) {
    return <SetupNotice label="Loan terms appear once underwriting begins." />;
  }
  const rate = loan.final_rate ?? loan.base_rate;
  return (
    <>
      <Card>
        <FieldGrid
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
      <div className="sub mt">
        Preliminary terms — final pricing and conditions are set by the
        lender at underwriting and may change.
      </div>
    </>
  );
}

function ConditionsPanel({ loanId }: { loanId: string | null | undefined }) {
  const { data: docs = [], isLoading } = useDocuments(loanId ?? undefined);
  if (isLoading) {
    return <Card><div className="sub">Loading…</div></Card>;
  }
  const outstanding = docs.filter((d) => d.status !== "verified");
  if (outstanding.length === 0) {
    return (
      <StatusLine tone="ok">
        ✓ No outstanding conditions — everything we need is in.
      </StatusLine>
    );
  }
  return (
    <Panel title={`${outstanding.length} outstanding ${outstanding.length === 1 ? "item" : "items"}`}>
      {outstanding.map((d) => (
        <ItemRow
          key={d.id}
          // Flagged tints the row; "pending" is the normal state of everything
          // in this list, so tinting it too would say nothing.
          className={cx(d.status === "flagged" && "tone-bad")}
          icon={<Icon name={d.status === "flagged" ? "alert" : "clock"} size={14} />}
          right={
            <CellChip tone={d.status === "flagged" ? "bad" : "warn"}>
              {d.status === "flagged" ? "Needs attention" : "Pending"}
            </CellChip>
          }
        >
          {d.name}
        </ItemRow>
      ))}
    </Panel>
  );
}

function PrequalPanel({ loanId }: { loanId: string | null | undefined }) {
  const { data: requests = [], isLoading } = useLoanPrequalRequests(loanId ?? undefined);
  if (isLoading) {
    return <Card><div className="sub">Loading…</div></Card>;
  }
  if (requests.length === 0) {
    return <SetupNotice label="No pre-qualification letter yet for this file." />;
  }
  return (
    <div>
      {requests.map((r) => (
        <ItemRow
          key={r.id}
          icon={<Icon name="docCheck" size={15} />}
          right={
            r.pdf_url ? (
              <BtnLink
                size="sm"
                href={r.pdf_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon name="doc" size={12} /> View letter
              </BtnLink>
            ) : (
              <Sub>No letter yet</Sub>
            )
          }
        >
          <b>{r.quote_number ? `Pre-qual ${r.quote_number}` : "Pre-qualification"}</b>
          <div className="sub">Status: {r.status}</div>
        </ItemRow>
      ))}
    </div>
  );
}

function HudPanel({ loanId }: { loanId: string | null | undefined }) {
  const { data: lines = [], isLoading } = useHudLines(loanId ?? undefined);
  if (isLoading) {
    return <Card><div className="sub">Loading…</div></Card>;
  }
  if (lines.length === 0) {
    return <SetupNotice label="The settlement statement (HUD) isn't ready yet — it's prepared as closing approaches." />;
  }
  const total = lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
  return (
    <Panel noPad>
      <Table
        cols={[{ label: "Item" }, { label: "Amount", align: "r" }]}
        caption="Estimated settlement statement"
      >
        {lines.map((l) => (
          <Tr key={l.id}>
            <Td>
              {l.label}
              {l.payee ? <div className="sub">{l.payee}</div> : null}
            </Td>
            <Td align="r">
              <span className="num">{QC_FMT.usd(Number(l.amount) || 0, 2)}</span>
            </Td>
          </Tr>
        ))}
        <Tr>
          <Td>
            <span className="lbl">Estimated total</span>
          </Td>
          <Td align="r">
            <b className="num">{QC_FMT.usd(total, 2)}</b>
          </Td>
        </Tr>
      </Table>
    </Panel>
  );
}
