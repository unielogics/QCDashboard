"use client";

// Click-to-toggle multi-select chip group, backed by the LoanType enum.
// Used in the Lender edit modal for "products serviced" — operator
// taps a chip to add the product, taps again to remove it.

import { useTheme } from "@/components/design-system/ThemeProvider";
import { LoanType, LoanTypeOptions } from "@/lib/enums.generated";

interface Props {
  selected: LoanType[];
  onChange: (next: LoanType[]) => void;
  disabled?: boolean;
}

export function LoanTypeChips({ selected, onChange, disabled = false }: Props) {
  const { t } = useTheme();
  const set = new Set<string>(selected);

  const toggle = (value: LoanType) => {
    if (disabled) return;
    const next = new Set(set);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    onChange(Array.from(next) as LoanType[]);
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {LoanTypeOptions.map((opt) => {
        const isOn = set.has(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value as LoanType)}
            aria-pressed={isOn}
            disabled={disabled}
            style={{
              all: "unset",
              cursor: disabled ? "not-allowed" : "pointer",
              padding: "7px 12px",
              borderRadius: 999,
              border: `1px solid ${isOn ? t.petrol : t.line}`,
              background: isOn ? t.brandSoft : "transparent",
              color: isOn ? t.brand : t.ink2,
              fontSize: 12.5,
              fontWeight: isOn ? 700 : 500,
              letterSpacing: -0.1,
              opacity: disabled ? 0.55 : 1,
              transition: "background 80ms ease, color 80ms ease, border-color 80ms ease",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
