"use client";

// Loan-type-specific underwriter fields. Renders a different field set
// based on the active loan.type so the Criteria tab can fine-tune a
// DSCR file differently from a Fix & Flip / Ground Up / Bridge / Cash-
// Out Refi / Portfolio file. All inputs are manual — no sliders.

import { useTheme } from "@/components/design-system/ThemeProvider";
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
  const { t } = useTheme();

  if (loanType === LoanType.DSCR) {
    return (
      <Grid>
        <PctField t={t} label="Vacancy %" value={value.vacancyPct} onChange={(v) => onChange("vacancyPct", v)} />
        <PctField t={t} label="Operating expense ratio" value={value.expenseRatioPct} onChange={(v) => onChange("expenseRatioPct", v)} />
      </Grid>
    );
  }

  if (loanType === LoanType.FIX_AND_FLIP || loanType === LoanType.GROUND_UP) {
    return (
      <Grid>
        <PctField t={t} label="Construction holdback" value={value.constructionHoldbackPct} onChange={(v) => onChange("constructionHoldbackPct", v)} />
        <NumField t={t} label="Draw count" value={value.drawCount} onChange={(v) => onChange("drawCount", v)} />
        <SelectField
          t={t}
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
          t={t}
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
        <MoneyField t={t} label="Cash to borrower" value={value.cashToBorrower} onChange={(v) => onChange("cashToBorrower", v)} />
        <NumField t={t} label="Seasoning (months)" value={value.seasoningMonths} onChange={(v) => onChange("seasoningMonths", v)} />
      </Grid>
    );
  }

  if (loanType === LoanType.PORTFOLIO) {
    return (
      <Grid>
        <NumField t={t} label="Property count" value={value.propertyCount} onChange={(v) => onChange("propertyCount", v)} />
        <PctField t={t} label="Operating expense ratio" value={value.expenseRatioPct} onChange={(v) => onChange("expenseRatioPct", v)} />
      </Grid>
    );
  }

  return null;
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>{children}</div>;
}

function Field({
  t,
  label,
  children,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 10.5, fontWeight: 800, color: t.ink3, letterSpacing: 1.1, textTransform: "uppercase" }}>{label}</span>
      {children}
    </label>
  );
}

function NumField({
  t,
  label,
  value,
  onChange,
  suffix,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
}) {
  return (
    <Field t={t} label={label}>
      <div style={{ position: "relative" }}>
        <input
          value={value}
          inputMode="decimal"
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
          style={{
            width: "100%",
            padding: "10px 12px",
            paddingRight: suffix ? 30 : 12,
            borderRadius: 10,
            background: t.surface2,
            border: `1px solid ${t.line}`,
            color: t.ink,
            fontSize: 13,
            fontFamily: "inherit",
            outline: "none",
            fontFeatureSettings: '"tnum"',
          }}
        />
        {suffix ? (
          <span style={{ position: "absolute", top: 0, bottom: 0, right: 10, display: "inline-flex", alignItems: "center", color: t.ink3, fontSize: 12, fontWeight: 800, pointerEvents: "none" }}>
            {suffix}
          </span>
        ) : null}
      </div>
    </Field>
  );
}

function PctField(props: Parameters<typeof NumField>[0]) {
  return <NumField {...props} suffix="%" />;
}

function MoneyField({
  t,
  label,
  value,
  onChange,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field t={t} label={label}>
      <div style={{ position: "relative" }}>
        <span style={{ position: "absolute", top: 0, bottom: 0, left: 10, display: "inline-flex", alignItems: "center", color: t.ink3, fontSize: 12, fontWeight: 800, pointerEvents: "none" }}>
          $
        </span>
        <input
          value={value}
          inputMode="decimal"
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
          style={{
            width: "100%",
            padding: "10px 12px 10px 28px",
            borderRadius: 10,
            background: t.surface2,
            border: `1px solid ${t.line}`,
            color: t.ink,
            fontSize: 13,
            fontFamily: "inherit",
            outline: "none",
            fontFeatureSettings: '"tnum"',
          }}
        />
      </div>
    </Field>
  );
}

function SelectField({
  t,
  label,
  value,
  options,
  onChange,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <Field t={t} label={label}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 10,
          background: t.surface2,
          border: `1px solid ${t.line}`,
          color: t.ink,
          fontSize: 13,
          fontFamily: "inherit",
          outline: "none",
        }}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </Field>
  );
}
