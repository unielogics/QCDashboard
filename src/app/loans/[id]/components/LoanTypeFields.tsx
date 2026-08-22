"use client";

// Loan-type-specific underwriter fields. Renders a different field set
// based on the active loan.type so the Criteria tab can fine-tune a
// DSCR file differently from a Fix & Flip / Ground Up / Bridge / Cash-
// Out Refi / Portfolio file. All inputs are manual — no sliders.
//
// Restyled onto the plain-CSS design system. Each field became a real
// `<label>` on the way through — they used to be a `<span>` above an input
// with no association, so none of these controls had an accessible name.

import { Input, Select } from "@/components/ds";
import { LoanType, ExitStrategy, ExitStrategyOptions } from "@/lib/enums.generated";

export interface TypeFieldsValue {
  vacancyPct: string;
  expenseRatioPct: string;
  constructionHoldbackPct: string;
  drawCount: string;
  exitStrategy: ExitStrategy | "";
  cashToBorrower: string;
  seasoningMonths: string;
  propertyCount: string;
}

export interface TypeFieldsOnChange {
  (key: keyof TypeFieldsValue, value: string): void;
}

export function LoanTypeFields({
  loanType,
  value,
  onChange,
}: {
  loanType: LoanType;
  value: TypeFieldsValue;
  onChange: TypeFieldsOnChange;
}) {
  if (loanType === LoanType.DSCR) {
    return (
      <Grid>
        <PctField label="Vacancy %" value={value.vacancyPct} onChange={(v) => onChange("vacancyPct", v)} />
        <PctField label="Operating expense ratio" value={value.expenseRatioPct} onChange={(v) => onChange("expenseRatioPct", v)} />
      </Grid>
    );
  }

  if (loanType === LoanType.FIX_AND_FLIP || loanType === LoanType.GROUND_UP) {
    return (
      <Grid>
        <PctField label="Construction holdback" value={value.constructionHoldbackPct} onChange={(v) => onChange("constructionHoldbackPct", v)} />
        <NumField label="Draw count" value={value.drawCount} onChange={(v) => onChange("drawCount", v)} />
        <SelectField
          label="Exit strategy"
          value={value.exitStrategy}
          options={ExitStrategyOptions}
          onChange={(v) => onChange("exitStrategy", v)}
        />
      </Grid>
    );
  }

  if (loanType === LoanType.BRIDGE) {
    return (
      <Grid>
        <SelectField
          label="Exit strategy"
          value={value.exitStrategy}
          options={ExitStrategyOptions}
          onChange={(v) => onChange("exitStrategy", v)}
        />
      </Grid>
    );
  }

  if (loanType === LoanType.CASH_OUT_REFI) {
    return (
      <Grid>
        <MoneyField label="Cash to borrower" value={value.cashToBorrower} onChange={(v) => onChange("cashToBorrower", v)} />
        <NumField label="Seasoning (months)" value={value.seasoningMonths} onChange={(v) => onChange("seasoningMonths", v)} />
      </Grid>
    );
  }

  if (loanType === LoanType.PORTFOLIO) {
    return (
      <Grid>
        <NumField label="Property count" value={value.propertyCount} onChange={(v) => onChange("propertyCount", v)} />
        <PctField label="Operating expense ratio" value={value.expenseRatioPct} onChange={(v) => onChange("expenseRatioPct", v)} />
      </Grid>
    );
  }

  return null;
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="fldgrid three">{children}</div>;
}

/**
 * Label + control.
 *
 * A `<label>` rather than the design system's `Field` (a `<div>` and a
 * `<span class="lbl">`), because wrapping is what names the control.
 */
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid g6">
      <span className="lbl">{label}</span>
      {children}
    </label>
  );
}

function NumField({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
}) {
  return (
    <Field label={label}>
      <div style={{ position: "relative" }}>
        <Input
          value={value}
          inputMode="decimal"
          className="num"
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
          // The affix is overlaid INSIDE the control, so the control has to
          // reserve room for it. This is the one place in this file where a
          // property `.field` owns (its inset) is also set here — deliberately,
          // and only on the side the affix sits.
          style={{ width: "100%", paddingRight: suffix ? 30 : undefined }}
        />
        {suffix ? (
          <span className="sub" style={AFFIX_RIGHT}>{suffix}</span>
        ) : null}
      </div>
    </Field>
  );
}

function PctField(props: Omit<Parameters<typeof NumField>[0], "suffix">) {
  return <NumField {...props} suffix="%" />;
}

function MoneyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <div style={{ position: "relative" }}>
        <span className="sub" style={AFFIX_LEFT}>$</span>
        <Input
          value={value}
          inputMode="decimal"
          className="num"
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
          // Same deliberate inset override as NumField, on the left.
          style={{ width: "100%", paddingLeft: 28 }}
        />
      </div>
    </Field>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <Select value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%" }}>
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </Select>
    </Field>
  );
}

/** Affix geometry — an overlay pinned inside the control's inset. */
const AFFIX_RIGHT: React.CSSProperties = {
  position: "absolute",
  top: 0,
  bottom: 0,
  right: 10,
  display: "inline-flex",
  alignItems: "center",
  fontWeight: 700,
  pointerEvents: "none",
};
const AFFIX_LEFT: React.CSSProperties = { ...AFFIX_RIGHT, right: "auto", left: 10 };
