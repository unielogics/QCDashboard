"use client";

// Click-to-toggle multi-select chip group for a lender's "products serviced".
// Grouped — real estate, business lending, services — because the roster
// now carries every product and service the firm sells, not only the six
// real-estate loan types; a flat wrap of twenty-four chips reads as noise.
// The component keeps its name: it is used from exactly one place.

import { V } from "@/components/design-system/cssVars";
import { LENDER_PRODUCT_GROUPS } from "@/lib/lenderProducts";

interface Props {
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

export function LoanTypeChips({ selected, onChange, disabled = false }: Props) {
  const set = new Set<string>(selected);

  const toggle = (value: string) => {
    if (disabled) return;
    const next = new Set(set);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    onChange(Array.from(next));
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {LENDER_PRODUCT_GROUPS.map((group) => (
        <div key={group.id}>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: V.ink3, marginBottom: 6 }}>
            {group.label}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {group.products.map((opt) => {
              const isOn = set.has(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggle(opt.value)}
                  aria-pressed={isOn}
                  disabled={disabled}
                  style={{
                    all: "unset",
                    cursor: disabled ? "not-allowed" : "pointer",
                    padding: "7px 12px",
                    borderRadius: 999,
                    border: `1px solid ${isOn ? V.petrol : V.line}`,
                    background: isOn ? V.brandSoft : "transparent",
                    color: isOn ? V.brand : V.ink2,
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
        </div>
      ))}
    </div>
  );
}
