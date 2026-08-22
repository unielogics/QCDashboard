"use client";

// Secure lender packages + the terms each recipient came back with.
//
// Restyled onto the plain-CSS design system. The manual-terms editor moved
// from a hand-rolled fixed overlay onto `Drawer`, which brings Escape-to-
// close, focus return and a body scroll lock that the old overlay never had.

import { useMemo, useState, type ReactNode } from "react";
import {
  Btn,
  CellChip,
  Input,
  Panel,
  Select,
  StatusLine,
  Sub,
  Textarea,
} from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { Icon } from "@/components/design-system/Icon";
import {
  useCreateManualLenderTerms,
  useLoanLenderPackages,
  useRevokeLenderPackage,
  useSelectLenderTerms,
  useUpdateLenderTerms,
} from "@/hooks/useApi";
import type {
  LenderPackageRead,
  LenderPackageRecipientRead,
  LenderTermManualCreate,
  LenderTermRead,
  Loan,
} from "@/lib/types";

interface Props {
  loan: Loan;
}

type ManualDraft = {
  source: "manual" | "email" | "phone";
  approvedAmount: string;
  ratePct: string;
  points: string;
  originationPct: string;
  lenderFees: string;
  termMonths: string;
  ltvPct: string;
  ltcPct: string;
  dscr: string;
  reserves: string;
  closeDays: string;
  interestOnly: boolean;
  amortizationStyle: string;
  prepayPenalty: string;
  constructionHoldbackPct: string;
  drawCount: string;
  exitStrategy: string;
  conditions: string;
  missingItems: string;
  notes: string;
};

export function LenderPackagesPanel({ loan }: Props) {
  const { data: packages = [], isLoading, isError, error } = useLoanLenderPackages(loan.id);
  const revokePackage = useRevokeLenderPackage();
  const selectTerms = useSelectLenderTerms();
  const [editing, setEditing] = useState<{
    packageId: string;
    recipient: LenderPackageRecipientRead;
    term?: LenderTermRead | null;
  } | null>(null);

  const totalRecipients = useMemo(
    () => packages.reduce((sum, p) => sum + p.recipients.length, 0),
    [packages],
  );

  const handleSelect = async (term: LenderTermRead) => {
    const applyToLoan = window.confirm(
      "Select this lender as primary and apply these terms to the loan fields? Press Cancel to select the lender without overwriting loan terms.",
    );
    await selectTerms.mutateAsync({ loanId: loan.id, termId: term.id, applyToLoan });
  };

  const handleRevoke = async (pkg: LenderPackageRead) => {
    if (!window.confirm("Revoke this lender package? Lenders will lose portal access immediately.")) return;
    await revokePackage.mutateAsync({ loanId: loan.id, packageId: pkg.id, reason: "Revoked from loan workspace" });
  };

  return (
    <div className="grid g10">
      <div className="row">
        <div className="grow">
          <div className="lbl">Lender packages &amp; terms</div>
          <Sub>
            {packages.length} package(s) · {totalRecipients} lender recipient(s)
          </Sub>
        </div>
        {isLoading ? <CellChip>Loading</CellChip> : null}
      </div>

      {isError ? (
        <StatusLine tone="bad">
          {error instanceof Error ? error.message : "Could not load lender packages."}
        </StatusLine>
      ) : packages.length === 0 && !isLoading ? (
        <Sub>No secure lender packages have been created for this file yet.</Sub>
      ) : (
        packages.map((pkg) => (
          <Panel
            key={pkg.id}
            title={
              /* `.trunc` needs a block box to clip inside the flex header. */
              <span className="trunc" style={{ display: "block" }}>{pkg.subject}</span>
            }
            sub={`${pkg.documents.length} docs · expires ${fmtDate(pkg.expires_at)}`}
            actions={
              <>
                <CellChip tone={pkg.revoked_at ? "bad" : "acc"}>
                  {pkg.revoked_at ? "revoked" : pkg.status}
                </CellChip>
                {!pkg.revoked_at ? (
                  <Btn size="sm" className="danger" onClick={() => handleRevoke(pkg)}>
                    Revoke
                  </Btn>
                ) : null}
              </>
            }
            noPad
          >
            {pkg.recipients.map((recipient) => (
              <RecipientRow
                key={recipient.id}
                recipient={recipient}
                onEdit={() => setEditing({ packageId: pkg.id, recipient, term: recipient.term })}
                onSelect={recipient.term ? () => handleSelect(recipient.term as LenderTermRead) : undefined}
                selecting={selectTerms.isPending}
              />
            ))}
          </Panel>
        ))
      )}

      {editing ? (
        <ManualTermsModal
          loanId={loan.id}
          packageId={editing.packageId}
          recipient={editing.recipient}
          term={editing.term}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function RecipientRow({
  recipient,
  onEdit,
  onSelect,
  selecting,
}: {
  recipient: LenderPackageRecipientRead;
  onEdit: () => void;
  onSelect?: () => void;
  selecting: boolean;
}) {
  const term = recipient.term;
  return (
    // Bespoke three-track row: identity / terms / actions. Not `.cg`.
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(170px, 0.9fr) minmax(220px, 1.1fr) auto",
        gap: 12,
        alignItems: "center",
        padding: "11px 12px",
        borderTop: "1px solid var(--line)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div className="trunc" style={{ fontWeight: 700 }}>
          {recipient.lender_name ?? "Lender"}
        </div>
        <div className="sub trunc">{recipient.email}</div>
        <div style={{ marginTop: 5 }}>
          <StatusChip status={recipient.status} />
        </div>
      </div>

      <div style={{ minWidth: 0 }}>
        {term ? (
          <>
            <div className="row">
              <Metric label="Amount" value={money(term.approved_amount)} />
              <Metric label="Rate" value={pct(term.final_rate)} />
              <Metric label="Points" value={num(term.discount_points)} />
              <Metric label="Term" value={term.term_months ? `${term.term_months} mo` : "-"} />
            </div>
            <div className="sub" style={{ marginTop: 5 }}>
              {term.source} · {term.status}{term.notes ? ` · ${term.notes}` : ""}
            </div>
          </>
        ) : (
          <Sub>No terms recorded yet.</Sub>
        )}
      </div>

      <div className="row end">
        <Btn size="sm" onClick={onEdit}>
          <Icon name="pencil" size={12} /> {term ? "Edit terms" : "Add terms"}
        </Btn>
        {term && term.status !== "selected" ? (
          <Btn size="sm" variant="pri" onClick={onSelect} disabled={selecting}>
            Select
          </Btn>
        ) : term?.status === "selected" ? (
          <CellChip tone="ok">Selected</CellChip>
        ) : null}
      </div>
    </div>
  );
}

function ManualTermsModal({
  loanId,
  packageId: _packageId,
  recipient,
  term,
  onClose,
}: {
  loanId: string;
  packageId: string;
  recipient: LenderPackageRecipientRead;
  term?: LenderTermRead | null;
  onClose: () => void;
}) {
  const createTerms = useCreateManualLenderTerms();
  const updateTerms = useUpdateLenderTerms();
  const [draft, setDraft] = useState<ManualDraft>(() => toDraft(term));
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof ManualDraft, value: string | boolean) => {
    setDraft((cur) => ({ ...cur, [key]: value }));
  };

  const save = async () => {
    setError(null);
    const payload = toPayload(draft);
    try {
      if (term) {
        await updateTerms.mutateAsync({
          loanId,
          termId: term.id,
          payload: { ...payload, source: draft.source, status: "received" },
        });
      } else {
        await createTerms.mutateAsync({
          loanId,
          payload: {
            ...payload,
            lender_id: recipient.lender_id,
            package_recipient_id: recipient.id,
            source: draft.source,
            status: "received",
          } satisfies LenderTermManualCreate,
        });
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save terms.");
    }
  };

  const saving = createTerms.isPending || updateTerms.isPending;

  return (
    <Drawer
      open
      onClose={onClose}
      title={recipient.lender_name ?? recipient.email}
      sub="Lender terms"
      ariaLabel="Lender terms"
      width="lg"
      bodyClass="grid"
      footer={
        <>
          <span className="grow" />
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="pri" onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save terms"}
          </Btn>
        </>
      }
    >
      <div className="fldgrid four">
        <Field label="Source">
          <Select value={draft.source} onChange={(e) => set("source", e.target.value as ManualDraft["source"])}>
            <option value="manual">Manual</option>
            <option value="email">Email</option>
            <option value="phone">Phone</option>
          </Select>
        </Field>
        <Field label="Amount">
          <Input value={draft.approvedAmount} onChange={(e) => set("approvedAmount", e.target.value)} />
        </Field>
        <Field label="Rate %">
          <Input value={draft.ratePct} onChange={(e) => set("ratePct", e.target.value)} />
        </Field>
        <Field label="Points">
          <Input value={draft.points} onChange={(e) => set("points", e.target.value)} />
        </Field>
      </div>

      <div className="fldgrid four">
        <Field label="Origination %">
          <Input value={draft.originationPct} onChange={(e) => set("originationPct", e.target.value)} />
        </Field>
        <Field label="Lender fees">
          <Input value={draft.lenderFees} onChange={(e) => set("lenderFees", e.target.value)} />
        </Field>
        <Field label="Term months">
          <Input value={draft.termMonths} onChange={(e) => set("termMonths", e.target.value)} />
        </Field>
        <Field label="Close days">
          <Input value={draft.closeDays} onChange={(e) => set("closeDays", e.target.value)} />
        </Field>
      </div>

      <div className="fldgrid four">
        <Field label="LTV %">
          <Input value={draft.ltvPct} onChange={(e) => set("ltvPct", e.target.value)} />
        </Field>
        <Field label="LTC %">
          <Input value={draft.ltcPct} onChange={(e) => set("ltcPct", e.target.value)} />
        </Field>
        <Field label="DSCR">
          <Input value={draft.dscr} onChange={(e) => set("dscr", e.target.value)} />
        </Field>
        <Field label="Reserves">
          <Input value={draft.reserves} onChange={(e) => set("reserves", e.target.value)} />
        </Field>
      </div>

      <div className="fldgrid four">
        <Field label="Amortization">
          <Input value={draft.amortizationStyle} onChange={(e) => set("amortizationStyle", e.target.value)} />
        </Field>
        <Field label="Prepay">
          <Input value={draft.prepayPenalty} onChange={(e) => set("prepayPenalty", e.target.value)} />
        </Field>
        <Field label="Holdback %">
          <Input value={draft.constructionHoldbackPct} onChange={(e) => set("constructionHoldbackPct", e.target.value)} />
        </Field>
        <Field label="Draws">
          <Input value={draft.drawCount} onChange={(e) => set("drawCount", e.target.value)} />
        </Field>
      </div>

      <div className="fldgrid two">
        <Field label="Exit strategy">
          <Input value={draft.exitStrategy} onChange={(e) => set("exitStrategy", e.target.value)} />
        </Field>
        {/* `align-self` and the pad are this cell's own — `.row` owns
            `align-items`, and a second owner for it would be a coin toss. */}
        <label className="row" style={{ alignSelf: "end", paddingBottom: 8 }}>
          <input type="checkbox" checked={draft.interestOnly} onChange={(e) => set("interestOnly", e.target.checked)} />
          Interest only
        </label>
      </div>

      <div className="fldgrid two">
        <Field label="Conditions">
          <Textarea value={draft.conditions} onChange={(e) => set("conditions", e.target.value)} rows={3} />
        </Field>
        <Field label="Missing items">
          <Textarea value={draft.missingItems} onChange={(e) => set("missingItems", e.target.value)} rows={3} />
        </Field>
      </div>

      <Field label="Notes">
        <Textarea value={draft.notes} onChange={(e) => set("notes", e.target.value)} rows={3} />
      </Field>

      {error ? <StatusLine tone="bad">{error}</StatusLine> : null}
    </Drawer>
  );
}

function toDraft(term?: LenderTermRead | null): ManualDraft {
  return {
    source: term?.source === "email" || term?.source === "phone" || term?.source === "manual" ? term.source : "manual",
    approvedAmount: text(term?.approved_amount),
    ratePct: pctText(term?.final_rate),
    points: text(term?.discount_points),
    originationPct: pctText(term?.origination_pct),
    lenderFees: text(term?.lender_fees),
    termMonths: text(term?.term_months),
    ltvPct: pctText(term?.ltv),
    ltcPct: pctText(term?.ltc),
    dscr: text(term?.dscr),
    reserves: text(term?.reserves_required),
    closeDays: text(term?.estimated_close_days),
    interestOnly: !!term?.interest_only,
    amortizationStyle: term?.amortization_style ?? "",
    prepayPenalty: term?.prepay_penalty ?? "",
    constructionHoldbackPct: pctText(term?.construction_holdback_pct),
    drawCount: text(term?.draw_count),
    exitStrategy: term?.exit_strategy ?? "",
    conditions: (term?.conditions ?? []).join("\n"),
    missingItems: (term?.missing_items ?? []).join("\n"),
    notes: term?.notes ?? "",
  };
}

function toPayload(draft: ManualDraft) {
  return {
    approved_amount: moneyNum(draft.approvedAmount),
    final_rate: pctNum(draft.ratePct),
    discount_points: numOrNull(draft.points),
    origination_pct: pctNum(draft.originationPct),
    lender_fees: moneyNum(draft.lenderFees),
    term_months: intOrNull(draft.termMonths),
    ltv: pctNum(draft.ltvPct),
    ltc: pctNum(draft.ltcPct),
    dscr: numOrNull(draft.dscr),
    reserves_required: moneyNum(draft.reserves),
    estimated_close_days: intOrNull(draft.closeDays),
    interest_only: draft.interestOnly,
    amortization_style: emptyToNull(draft.amortizationStyle),
    prepay_penalty: emptyToNull(draft.prepayPenalty),
    construction_holdback_pct: pctNum(draft.constructionHoldbackPct),
    draw_count: intOrNull(draft.drawCount),
    exit_strategy: emptyToNull(draft.exitStrategy),
    conditions: lines(draft.conditions),
    missing_items: lines(draft.missingItems),
    notes: emptyToNull(draft.notes),
  };
}

/**
 * A labelled control.
 *
 * Deliberately a `<label>` and NOT the design system's `Field`: `Field`
 * renders a `<div>` with a `<span class="lbl">`, which is not associated
 * with the control. Wrapping keeps every input in this form named for a
 * screen reader, which is what the pre-migration markup did.
 */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid g4">
      <span className="lbl">{label}</span>
      {children}
    </label>
  );
}

function StatusChip({ status }: { status: string }) {
  if (status === "terms_submitted") return <CellChip tone="ok">terms</CellChip>;
  if (status === "downloaded" || status === "viewed") return <CellChip tone="acc">{status}</CellChip>;
  if (status === "revoked" || status === "expired" || status === "no_quote") {
    return <CellChip tone="bad">{status.replace("_", " ")}</CellChip>;
  }
  return <CellChip>{status}</CellChip>;
}

function Metric({ label, value }: { label: string; value: string }) {
  // `.sub` owns colour and size; nowrap is this metric strip's own.
  return (
    <span className="sub" style={{ whiteSpace: "nowrap" }}>
      <strong style={{ color: "var(--ink)" }}>{label}:</strong> {value}
    </span>
  );
}

function fmtDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function money(value: number | null | undefined): string {
  if (value == null) return "-";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function pct(value: number | null | undefined): string {
  if (value == null) return "-";
  return `${(value * 100).toFixed(2)}%`;
}

function num(value: number | null | undefined): string {
  if (value == null) return "-";
  return `${value}`;
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
