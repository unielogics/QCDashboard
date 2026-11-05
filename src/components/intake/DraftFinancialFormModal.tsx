"use client";

// On-screen fallback for a borrower who doesn't have or doesn't understand a
// Personal Financial Statement (PFS) or Debt Schedule. Fills in a short set
// of numbers here instead of uploading a real file — the backend renders a
// PDF from these values that satisfies the requested document exactly like a
// real upload. Deliberately does not collect a Social Security Number.

import { useEffect, useState } from "react";
import { Modal } from "@/components/design-system/Modal";
import { DebtScheduleForm, type DebtBody, type DebtRow } from "@/components/application/DebtScheduleForm";
import { debtRowProblems, describeDebtProblems, focusFirstProblem, isBlankDebtRow } from "@/lib/debtTypes";

export type PfsFormPayload = {
  owner_full_name: string;
  statement_date: string;
  assets: { label: string; amount: number }[];
  liabilities: { label: string; amount: number }[];
  acknowledgment: boolean;
};

/** One obligation as the backend's `DealerDebtScheduleRow` takes it: the
 *  figures as numbers, the rest as text or null, the advance question as a
 *  boolean or null. The same row the borrower's link sends — the modal used to
 *  send three of these and the PDF it filed had eight columns of nothing. */
export type DebtSchedulePayloadRow = {
  lender: string;
  balance: number;
  monthly_payment: number;
  debt_type: string | null;
  original_amount: number | null;
  rate: number | null;
  originated_on: string | null;
  maturity_on: string | null;
  secured: string | null;
  payment_status: string | null;
  collateral: string | null;
  notes: string | null;
  mca_modified: boolean | null;
  mca_modification_note: string | null;
};

export type DebtScheduleFormPayload = {
  business_name: string;
  debts: DebtSchedulePayloadRow[];
  acknowledgment: boolean;
};

const parseMoney = (value: string | undefined): number | null => {
  const text = String(value ?? "").replace(/[,$%\s]/g, "").trim();
  if (!text) return null;
  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? parsed : null;
};
const textOrNull = (value: string | undefined) => {
  const text = String(value ?? "").trim();
  return text || null;
};

/** The form's row, typed, for the wire. Exported so the submit can be tested. */
export function debtPayloadRow(row: DebtRow): DebtSchedulePayloadRow {
  return {
    lender: String(row.lender ?? "").trim(),
    balance: parseMoney(row.balance) ?? 0,
    monthly_payment: parseMoney(row.monthly_payment) ?? 0,
    debt_type: textOrNull(row.debt_type),
    original_amount: parseMoney(row.original_amount),
    rate: parseMoney(row.rate),
    originated_on: textOrNull(row.originated_on),
    maturity_on: textOrNull(row.maturity_on),
    secured: textOrNull(row.secured),
    payment_status: textOrNull(row.payment_status),
    collateral: textOrNull(row.collateral),
    notes: textOrNull(row.notes),
    mca_modified: row.mca_modified === "yes" ? true : row.mca_modified === "no" ? false : null,
    mca_modification_note: row.mca_modified === "yes" ? textOrNull(row.mca_modification_note) : null,
  };
}

// Fixed 8 asset / 6 liability categories. The first 3 asset labels (liquid:
// true) MUST match the backend's _PFS_LIQUID_LABELS set in
// qcbackend/app/routers/dealer_ai_intake.py — keep both lists in sync.
const PFS_ASSET_LABELS: { label: string; liquid: boolean }[] = [
  { label: "Cash on hand and in banks", liquid: true },
  { label: "Savings accounts", liquid: true },
  { label: "Stocks and bonds / other marketable securities", liquid: true },
  { label: "Retirement accounts (401k, IRA, etc.)", liquid: false },
  { label: "Real estate equity (market value less mortgages)", liquid: false },
  { label: "Vehicles", liquid: false },
  { label: "Business ownership / equity", liquid: false },
  { label: "Other assets", liquid: false },
];

const PFS_LIABILITY_LABELS = [
  "Mortgages on real estate",
  "Auto loans",
  "Credit cards",
  "Personal loans",
  "Student loans",
  "Other liabilities",
];

export function PfsFormModal({
  open,
  onClose,
  ownerDefaultName,
  busy,
  error,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  ownerDefaultName?: string;
  busy: boolean;
  error: string | null;
  onSubmit: (payload: PfsFormPayload) => void;
}) {
  const [ownerName, setOwnerName] = useState(ownerDefaultName ?? "");
  const [assetValues, setAssetValues] = useState<Record<string, string>>({});
  const [liabilityValues, setLiabilityValues] = useState<Record<string, string>>({});
  const [ack, setAck] = useState(false);
  const [formError, setFormError] = useState("");

  function submit() {
    if (!ownerName.trim()) {
      setFormError("Enter the owner's full name.");
      return;
    }
    if (!ack) {
      setFormError("You must check the acknowledgment box.");
      return;
    }
    setFormError("");
    onSubmit({
      owner_full_name: ownerName.trim(),
      statement_date: new Date().toISOString().slice(0, 10),
      assets: PFS_ASSET_LABELS.map(({ label }) => ({ label, amount: Number(assetValues[label] || 0) })),
      liabilities: PFS_LIABILITY_LABELS.map((label) => ({ label, amount: Number(liabilityValues[label] || 0) })),
      acknowledgment: true,
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Fill out your Personal Financial Statement"
      size="md"
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn pri" onClick={submit} disabled={busy}>
            {busy ? "Submitting…" : "Submit"}
          </button>
        </>
      }
    >
      <div className="panel-b grid g10">
        <p className="sub">
          This short online form takes the place of an uploaded PFS. It is for underwriting processing only — it
          is not financial or investment advice, and completing it is voluntary. We do not collect your Social
          Security Number here.
        </p>
        <FormField label="Your full legal name" value={ownerName} onChange={setOwnerName} />
        <strong className="lbl">Assets</strong>
        {PFS_ASSET_LABELS.map(({ label }) => (
          <FormField
            key={label}
            label={label}
            value={assetValues[label] ?? ""}
            onChange={(v) => setAssetValues((s) => ({ ...s, [label]: v }))}
            type="number"
          />
        ))}
        <strong className="lbl">Liabilities</strong>
        {PFS_LIABILITY_LABELS.map((label) => (
          <FormField
            key={label}
            label={label}
            value={liabilityValues[label] ?? ""}
            onChange={(v) => setLiabilityValues((s) => ({ ...s, [label]: v }))}
            type="number"
          />
        ))}
        {/* `.consent` is the sheet's acknowledgment block. It runs at body
            size on purpose — shrinking a disclosure to fit is the thing a
            compliance review flags. */}
        <div className={ack ? "consent on" : "consent"}>
          <label>
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            <span className="ctext">
              I understand this form is informational-only, not financial or investment advice, and I am
              submitting this information voluntarily.
            </span>
          </label>
        </div>
        {(formError || error) ? <div className="statusline c-bad">{formError || error}</div> : null}
      </div>
    </Modal>
  );
}

export function DebtScheduleFormModal({
  open,
  onClose,
  businessNameDefault,
  busy,
  error,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  businessNameDefault?: string;
  busy: boolean;
  error: string | null;
  onSubmit: (payload: DebtScheduleFormPayload) => void;
}) {
  // The same card-per-obligation form the borrower's link and the desk's editor
  // use, so the room, the link and the desk ask the same questions and file the
  // same PDF. One blank obligation to start, so the first thing on screen is
  // the form rather than an "add" button.
  const [body, setBody] = useState<DebtBody>({ business_name: businessNameDefault ?? "", debts: [{}] });
  const [ack, setAck] = useState(false);
  const [formError, setFormError] = useState("");
  const [showProblems, setShowProblems] = useState(false);

  // Each opening starts clean: the callers keep this mounted with `open`
  // toggling, so without this a cancelled attempt came back already outlined
  // and a second schedule started with the first one's acknowledgment ticked.
  useEffect(() => {
    if (!open) return;
    setBody({ business_name: businessNameDefault ?? "", debts: [{}] });
    setAck(false);
    setFormError("");
    setShowProblems(false);
  }, [open, businessNameDefault]);

  function submit() {
    const rows = (body.debts ?? []).filter((row) => !isBlankDebtRow(row));
    if (!String(body.business_name ?? "").trim()) {
      setFormError("Enter the business name.");
      return;
    }
    if (!rows.length) {
      setFormError("Add at least one obligation.");
      return;
    }
    // The owner's required answers, checked here so the card shows exactly
    // which ones are missing; the backend holds the submit to the same list.
    // Checked on the rows as shown (blank lines skipped by position), so the
    // sentence numbers the same card the outline lands on.
    const problems = debtRowProblems(body.debts ?? []);
    if (problems.length) {
      setShowProblems(true);
      setFormError(describeDebtProblems(problems));
      focusFirstProblem(problems);
      return;
    }
    if (!ack) {
      setFormError("You must check the acknowledgment box.");
      return;
    }
    setFormError("");
    onSubmit({
      business_name: String(body.business_name ?? "").trim(),
      debts: rows.map(debtPayloadRow),
      acknowledgment: true,
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Fill out your Debt Schedule"
      size="xl"
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn pri" onClick={submit} disabled={busy}>
            {busy ? "Submitting…" : "Submit"}
          </button>
        </>
      }
    >
      <div className="panel-b grid g10">
        <p className="sub">
          List every outstanding business debt — loans, lines of credit, equipment, cards, leases and
          merchant cash advances — with what it is, what it started at, the balance, the rate, the
          monthly payment and whether it is current. This is for underwriting processing only and is
          not financial or investment advice.
        </p>
        <DebtScheduleForm value={body} onChange={setBody} disabled={busy} showProblems={showProblems} />
        {/* `.consent` is the sheet's acknowledgment block. It runs at body
            size on purpose — shrinking a disclosure to fit is the thing a
            compliance review flags. */}
        <div className={ack ? "consent on" : "consent"}>
          <label>
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            <span className="ctext">
              I understand this form is informational-only, not financial or investment advice, and I am
              submitting this information voluntarily.
            </span>
          </label>
        </div>
        {(formError || error) ? <div className="statusline c-bad">{formError || error}</div> : null}
      </div>
    </Modal>
  );
}

function FormField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    // A real <label> wrapping its control, so the caption is a click target.
    <label className="grid g4">
      <span className="lbl">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="field" />
    </label>
  );
}
