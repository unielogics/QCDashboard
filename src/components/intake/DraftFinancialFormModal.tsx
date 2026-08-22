"use client";

// On-screen fallback for a borrower who doesn't have or doesn't understand a
// Personal Financial Statement (PFS) or Debt Schedule. Fills in a short set
// of numbers here instead of uploading a real file — the backend renders a
// PDF from these values that satisfies the requested document exactly like a
// real upload. Deliberately does not collect a Social Security Number.

import { useState } from "react";
import { Modal } from "@/components/design-system/Modal";

export type PfsFormPayload = {
  owner_full_name: string;
  statement_date: string;
  assets: { label: string; amount: number }[];
  liabilities: { label: string; amount: number }[];
  acknowledgment: boolean;
};

export type DebtScheduleFormPayload = {
  business_name: string;
  debts: { lender: string; balance: number; monthly_payment: number }[];
  acknowledgment: boolean;
};

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
  const [businessName, setBusinessName] = useState(businessNameDefault ?? "");
  const [rows, setRows] = useState<{ lender: string; balance: string; monthly_payment: string }[]>([
    { lender: "", balance: "", monthly_payment: "" },
  ]);
  const [ack, setAck] = useState(false);
  const [formError, setFormError] = useState("");

  function submit() {
    const debts = rows
      .filter((r) => r.lender.trim())
      .map((r) => ({ lender: r.lender.trim(), balance: Number(r.balance || 0), monthly_payment: Number(r.monthly_payment || 0) }));
    if (!businessName.trim()) {
      setFormError("Enter the business name.");
      return;
    }
    if (!debts.length) {
      setFormError("Add at least one debt, or enter zero if there is none.");
      return;
    }
    if (!ack) {
      setFormError("You must check the acknowledgment box.");
      return;
    }
    setFormError("");
    onSubmit({ business_name: businessName.trim(), debts, acknowledgment: true });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Fill out your Debt Schedule"
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
          List every outstanding business debt: who it&apos;s owed to, the current balance, and the monthly
          payment. This is for underwriting processing only and is not financial or investment advice.
        </p>
        <FormField label="Business name" value={businessName} onChange={setBusinessName} />
        {rows.map((row, i) => (
          // A bespoke 4-track row (lender / balance / payment / remove).
          // `.fldgrid` is equal columns and `.cg` is the twelve-column page
          // grid; neither describes this.
          <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
            <FormField
              label="Lender"
              value={row.lender}
              onChange={(v) => setRows((r) => r.map((x, j) => (j === i ? { ...x, lender: v } : x)))}
            />
            <FormField
              label="Balance"
              value={row.balance}
              onChange={(v) => setRows((r) => r.map((x, j) => (j === i ? { ...x, balance: v } : x)))}
              type="number"
            />
            <FormField
              label="Monthly payment"
              value={row.monthly_payment}
              onChange={(v) => setRows((r) => r.map((x, j) => (j === i ? { ...x, monthly_payment: v } : x)))}
              type="number"
            />
            <button
              type="button"
              onClick={() => setRows((r) => r.filter((_, j) => j !== i))}
              className="btn"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setRows((r) => [...r, { lender: "", balance: "", monthly_payment: "" }])}
          className="btn"
          // Grid placement — the button must not stretch across the column.
          style={{ justifySelf: "start" }}
        >
          + Add another debt
        </button>
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
