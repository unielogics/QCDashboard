"use client";

// Lender portal — one secure package: download the documents, then quote it
// (or mark no-quote).
//
// Styling only: migrated off the inline token objects onto the plain-CSS
// design system in globals.css. Every endpoint, gate, state and control is the
// one that was here before — the terms form still carries all 20 fields plus
// the interest-only flag, and still disables itself when the package is
// expired, revoked or already closed out.
//
// Two things deliberately did NOT become the obvious design-system component:
//   - the field wrapper stays a `<label>` (see `Fld`), because ds `Field`
//     renders a `<div>` and these inputs have no id/htmlFor pair to fall back
//     on, so a div would leave every input with no accessible name;
//   - the four-across form rows became `.cg` + `.s3` because 4 equal columns
//     genuinely are 4×3 of a 12-column grid; the document row's
//     "name … button" split did not, so it stays a `.filerow`.

import { useEffect, useMemo, useState, type ReactNode, type TextareaHTMLAttributes } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Btn,
  Card,
  CellChip,
  Input,
  PageHeader,
  Panel,
  Row,
  Textarea,
  type ChipTone,
} from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import {
  useCurrentUser,
  useLenderPackageDownload,
  useLenderPortalPackage,
  useMarkLenderNoQuote,
  useSubmitLenderPortalTerms,
} from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import type { LenderTermFields, LenderTermRead } from "@/lib/types";

type TermsDraft = {
  requestedAmount: string;
  approvedAmount: string;
  baseRatePct: string;
  finalRatePct: string;
  points: string;
  originationPct: string;
  lenderFees: string;
  termMonths: string;
  amortizationStyle: string;
  interestOnly: boolean;
  prepayPenalty: string;
  ltvPct: string;
  ltcPct: string;
  dscr: string;
  reserves: string;
  closeDays: string;
  constructionHoldbackPct: string;
  drawCount: string;
  exitStrategy: string;
  conditions: string;
  missingItems: string;
  notes: string;
};

export default function LenderPackageDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const packageId = typeof params.id === "string" ? params.id : "";
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const pkg = useLenderPortalPackage(packageId);
  const download = useLenderPackageDownload();
  const submitTerms = useSubmitLenderPortalTerms();
  const noQuote = useMarkLenderNoQuote();
  const recipient = pkg.data?.recipients[0] ?? null;
  const term = recipient?.term ?? null;
  const [draft, setDraft] = useState<TermsDraft>(() => toDraft(null));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!meLoading && me && me.role !== Role.LENDER) router.replace("/");
  }, [me, meLoading, router]);

  useEffect(() => {
    if (term) setDraft(toDraft(term));
  }, [term?.id, term?.updated_at]);

  const disabled = useMemo(() => {
    const status = recipient?.status;
    return status === "expired" || status === "revoked" || pkg.data?.revoked_at;
  }, [pkg.data?.revoked_at, recipient?.status]);

  const set = (key: keyof TermsDraft, value: string | boolean) => {
    setDraft((cur) => ({ ...cur, [key]: value }));
  };

  const handleDownload = async (documentId: string) => {
    setError(null);
    try {
      const res = await download.mutateAsync({ packageId, documentId });
      window.open(res.download_url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed.");
    }
  };

  const handleSubmitTerms = async () => {
    setError(null);
    setSuccess(null);
    try {
      await submitTerms.mutateAsync({ packageId, payload: toPayload(draft) });
      setSuccess("Terms submitted.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit terms.");
    }
  };

  const handleNoQuote = async () => {
    if (!window.confirm("Mark this package as no quote?")) return;
    setError(null);
    try {
      await noQuote.mutateAsync(packageId);
      setSuccess("Marked no quote.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not mark no quote.");
    }
  };

  if (meLoading) {
    return (
      <Card>
        <span className="sub">Loading...</span>
      </Card>
    );
  }
  if (me && me.role !== Role.LENDER) return null;

  if (pkg.isLoading) {
    return (
      <Card>
        <span className="sub">Loading package...</span>
      </Card>
    );
  }

  if (pkg.isError || !pkg.data) {
    return (
      <Card>
        <StatusLine tone="bad">
          {pkg.error instanceof Error ? pkg.error.message : "Package unavailable."}
        </StatusLine>
      </Card>
    );
  }

  const data = pkg.data;

  return (
    <div className="grid">
      {/* `.row` keeps the back control at its own width — a bare grid child
          would stretch the button across the page. */}
      <Row>
        <Link href="/lender/packages" className="btn sm">
          <Icon name="chevL" size={13} /> Packages
        </Link>
      </Row>

      <PageHeader
        // Fragment, not a template string: deal_id and address are nullable on
        // LenderPackageRead, and `${null}` would print the word "null".
        title={
          <>
            {data.deal_id} - {data.address}
          </>
        }
        lede={<>Secure package · Expires {fmtDate(data.expires_at)}</>}
        actions={recipient ? <StatusPill status={recipient.status} /> : null}
      />

      {error ? <StatusLine tone="bad">{error}</StatusLine> : null}
      {success ? <StatusLine tone="ok">{success}</StatusLine> : null}

      <Panel title="Documents">
        {data.documents.map((doc) => (
          <div key={doc.id} className="filerow">
            <span style={{ flex: 1, minWidth: 0 }}>
              <span
                style={{
                  display: "block",
                  fontWeight: 650,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {doc.display_name}
              </span>
              <span className="sub" style={{ display: "block", marginTop: 2 }}>
                {doc.status ?? "document"}
              </span>
            </span>
            <Btn
              variant="pri"
              size="sm"
              disabled={!!disabled || download.isPending}
              onClick={() => handleDownload(doc.document_id)}
            >
              <Icon name="download" size={13} /> Download
            </Btn>
          </div>
        ))}
      </Panel>

      <Panel
        title="Proposed terms"
        actions={term ? <CellChip tone="ok">Saved</CellChip> : null}
        bodyClass="grid"
      >
        <div className="cg">
          <Fld className="s3" label="Requested amount">
            <Input value={draft.requestedAmount} onChange={(e) => set("requestedAmount", e.target.value)} disabled={!!disabled} />
          </Fld>
          <Fld className="s3" label="Approved amount">
            <Input value={draft.approvedAmount} onChange={(e) => set("approvedAmount", e.target.value)} disabled={!!disabled} />
          </Fld>
          <Fld className="s3" label="Base rate %">
            <Input value={draft.baseRatePct} onChange={(e) => set("baseRatePct", e.target.value)} disabled={!!disabled} />
          </Fld>
          <Fld className="s3" label="Final rate %">
            <Input value={draft.finalRatePct} onChange={(e) => set("finalRatePct", e.target.value)} disabled={!!disabled} />
          </Fld>
        </div>

        <div className="cg">
          <Fld className="s3" label="Points">
            <Input value={draft.points} onChange={(e) => set("points", e.target.value)} disabled={!!disabled} />
          </Fld>
          <Fld className="s3" label="Origination %">
            <Input value={draft.originationPct} onChange={(e) => set("originationPct", e.target.value)} disabled={!!disabled} />
          </Fld>
          <Fld className="s3" label="Lender fees">
            <Input value={draft.lenderFees} onChange={(e) => set("lenderFees", e.target.value)} disabled={!!disabled} />
          </Fld>
          <Fld className="s3" label="Term months">
            <Input value={draft.termMonths} onChange={(e) => set("termMonths", e.target.value)} disabled={!!disabled} />
          </Fld>
        </div>

        <div className="cg">
          <Fld className="s3" label="LTV %">
            <Input value={draft.ltvPct} onChange={(e) => set("ltvPct", e.target.value)} disabled={!!disabled} />
          </Fld>
          <Fld className="s3" label="LTC %">
            <Input value={draft.ltcPct} onChange={(e) => set("ltcPct", e.target.value)} disabled={!!disabled} />
          </Fld>
          <Fld className="s3" label="DSCR">
            <Input value={draft.dscr} onChange={(e) => set("dscr", e.target.value)} disabled={!!disabled} />
          </Fld>
          <Fld className="s3" label="Reserves">
            <Input value={draft.reserves} onChange={(e) => set("reserves", e.target.value)} disabled={!!disabled} />
          </Fld>
        </div>

        <div className="cg">
          <Fld className="s3" label="Amortization">
            <Input value={draft.amortizationStyle} onChange={(e) => set("amortizationStyle", e.target.value)} disabled={!!disabled} />
          </Fld>
          <Fld className="s3" label="Prepay">
            <Input value={draft.prepayPenalty} onChange={(e) => set("prepayPenalty", e.target.value)} disabled={!!disabled} />
          </Fld>
          <Fld className="s3" label="Close days">
            <Input value={draft.closeDays} onChange={(e) => set("closeDays", e.target.value)} disabled={!!disabled} />
          </Fld>
          {/* Sits in the 4th column of the row, bottom-aligned with the inputs
              beside it — `.cg` aligns its children to the top. */}
          <label className="row s3" style={{ alignSelf: "end", paddingBottom: 8 }}>
            <input
              type="checkbox"
              checked={draft.interestOnly}
              onChange={(e) => set("interestOnly", e.target.checked)}
              disabled={!!disabled}
            />
            <span className="sub">Interest only</span>
          </label>
        </div>

        <div className="cg">
          <Fld className="s3" label="Holdback %">
            <Input value={draft.constructionHoldbackPct} onChange={(e) => set("constructionHoldbackPct", e.target.value)} disabled={!!disabled} />
          </Fld>
          <Fld className="s3" label="Draws">
            <Input value={draft.drawCount} onChange={(e) => set("drawCount", e.target.value)} disabled={!!disabled} />
          </Fld>
          <Fld className="s3" label="Exit strategy">
            <Input value={draft.exitStrategy} onChange={(e) => set("exitStrategy", e.target.value)} disabled={!!disabled} />
          </Fld>
        </div>

        <div className="cg">
          <Fld className="s6" label="Conditions">
            <TA value={draft.conditions} onChange={(e) => set("conditions", e.target.value)} disabled={!!disabled} rows={4} />
          </Fld>
          <Fld className="s6" label="Missing items">
            <TA value={draft.missingItems} onChange={(e) => set("missingItems", e.target.value)} disabled={!!disabled} rows={4} />
          </Fld>
        </div>

        <Fld label="Notes">
          <TA value={draft.notes} onChange={(e) => set("notes", e.target.value)} disabled={!!disabled} rows={4} />
        </Fld>

        <div className="row" style={{ justifyContent: "flex-end" }}>
          <Btn onClick={handleNoQuote} disabled={!!disabled || noQuote.isPending}>
            No quote
          </Btn>
          <Btn variant="pri" onClick={handleSubmitTerms} disabled={!!disabled || submitTerms.isPending}>
            {submitTerms.isPending ? "Submitting..." : "Submit terms"}
          </Btn>
        </div>
      </Panel>
    </div>
  );
}

/**
 * Label + control, stacked.
 *
 * Deliberately a `<label>` rather than the ds `Field`, which renders a `<div>`:
 * none of these inputs carries an id, so the implicit label association is the
 * only thing giving them an accessible name — and the only thing that makes the
 * caption click into the input. The inline value is the two-row stack itself,
 * which no class in the sheet owns; `.lbl` owns the caption's type.
 */
function Fld({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={className} style={{ display: "grid", gap: 5, minWidth: 0 }}>
      <span className="lbl">{label}</span>
      {children}
    </label>
  );
}

/**
 * `.field` textarea. The one inline property is the resize affordance: these
 * were vertical-only before, and the browser default (`both`) lets a drag pull
 * a textarea out past its grid column.
 */
function TA(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <Textarea {...props} style={{ resize: "vertical" }} />;
}

function StatusPill({ status }: { status: string }) {
  if (status === "terms_submitted") return <CellChip tone="ok">terms submitted</CellChip>;
  if (status === "expired" || status === "revoked" || status === "no_quote")
    return <CellChip tone="bad">{status.replace("_", " ")}</CellChip>;
  return <CellChip tone="acc">{status}</CellChip>;
}

/**
 * Tinted status block. `.c-bad` / `.c-ok` own the tint and the text colour; the
 * inline values are box geometry only — the tone classes in the sheet are
 * pill-shaped (`.cellchip`, nowrap) and a server error message is a sentence,
 * not a chip.
 */
function StatusLine({ tone, children }: { tone: ChipTone; children: ReactNode }) {
  return (
    <div
      className={`c-${tone}`}
      style={{ borderRadius: 10, padding: "9px 12px", fontSize: 12.5, fontWeight: 650, lineHeight: 1.45 }}
      role={tone === "bad" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}

function toDraft(term: LenderTermRead | null): TermsDraft {
  return {
    requestedAmount: text(term?.requested_amount),
    approvedAmount: text(term?.approved_amount),
    baseRatePct: pctText(term?.base_rate),
    finalRatePct: pctText(term?.final_rate),
    points: text(term?.discount_points),
    originationPct: pctText(term?.origination_pct),
    lenderFees: text(term?.lender_fees),
    termMonths: text(term?.term_months),
    amortizationStyle: term?.amortization_style ?? "",
    interestOnly: !!term?.interest_only,
    prepayPenalty: term?.prepay_penalty ?? "",
    ltvPct: pctText(term?.ltv),
    ltcPct: pctText(term?.ltc),
    dscr: text(term?.dscr),
    reserves: text(term?.reserves_required),
    closeDays: text(term?.estimated_close_days),
    constructionHoldbackPct: pctText(term?.construction_holdback_pct),
    drawCount: text(term?.draw_count),
    exitStrategy: term?.exit_strategy ?? "",
    conditions: (term?.conditions ?? []).join("\n"),
    missingItems: (term?.missing_items ?? []).join("\n"),
    notes: term?.notes ?? "",
  };
}

function toPayload(draft: TermsDraft): LenderTermFields {
  return {
    requested_amount: moneyNum(draft.requestedAmount),
    approved_amount: moneyNum(draft.approvedAmount),
    base_rate: pctNum(draft.baseRatePct),
    final_rate: pctNum(draft.finalRatePct),
    discount_points: numOrNull(draft.points),
    origination_pct: pctNum(draft.originationPct),
    lender_fees: moneyNum(draft.lenderFees),
    term_months: intOrNull(draft.termMonths),
    amortization_style: emptyToNull(draft.amortizationStyle),
    interest_only: draft.interestOnly,
    prepay_penalty: emptyToNull(draft.prepayPenalty),
    ltv: pctNum(draft.ltvPct),
    ltc: pctNum(draft.ltcPct),
    dscr: numOrNull(draft.dscr),
    reserves_required: moneyNum(draft.reserves),
    estimated_close_days: intOrNull(draft.closeDays),
    construction_holdback_pct: pctNum(draft.constructionHoldbackPct),
    draw_count: intOrNull(draft.drawCount),
    exit_strategy: emptyToNull(draft.exitStrategy),
    conditions: lines(draft.conditions),
    missing_items: lines(draft.missingItems),
    notes: emptyToNull(draft.notes),
  };
}

function fmtDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function text(value: number | null | undefined): string {
  return value == null ? "" : `${value}`;
}

function pctText(value: number | null | undefined): string {
  return value == null ? "" : `${(value * 100).toFixed(3).replace(/\.?0+$/, "")}`;
}

function numOrNull(raw: string): number | null {
  const clean = raw.replace(/[$,%]/g, "").trim();
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

function intOrNull(raw: string): number | null {
  const n = numOrNull(raw);
  return n == null ? null : Math.round(n);
}

function moneyNum(raw: string): number | null {
  return numOrNull(raw);
}

function pctNum(raw: string): number | null {
  const n = numOrNull(raw);
  return n == null ? null : n / 100;
}

function emptyToNull(raw: string): string | null {
  const value = raw.trim();
  return value ? value : null;
}

function lines(raw: string): string[] | null {
  const values = raw.split("\n").map((line) => line.trim()).filter(Boolean);
  return values.length ? values : null;
}
