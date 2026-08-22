"use client";

// Shared scope-of-work editor for Fix & Flip prequal flows. Used by:
//   - PreQualRequestModal (borrower side, step 2)
//   - PrequalReviewModal (admin side, F&F card)
//
// Renders a small table — category / brief description / total $ —
// with row-level remove + an Add Row affordance. Numeric column is
// sanitized on every keystroke so the stored value is always a finite
// number. Zero state shows a dashed-border empty placeholder; Add Row
// materializes the first line.
//
// The component is uncontrolled-friendly via `items` + `onChange`. No
// internal state besides what React tracks for inputs. Caller owns
// the array shape (PrequalSowLineItem[]).

import { V, type CssVars } from "@/components/design-system/cssVars";
import { Icon } from "@/components/design-system/Icon";
import { QC_FMT } from "@/lib/fmt";
import type { PrequalSowLineItem } from "@/lib/types";

export function PrequalSowEditor({
  items,
  onChange,
  readOnly = false,
}: {
  items: PrequalSowLineItem[];
  onChange: (next: PrequalSowLineItem[]) => void;
  readOnly?: boolean;
}) {
  const total = items.reduce((sum, item) => sum + (Number(item.total_usd) || 0), 0);

  const setItem = (idx: number, patch: Partial<PrequalSowLineItem>) => {
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const removeItem = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };
  const addItem = () => {
    onChange([...items, { category: "", description: "", total_usd: 0 }]);
  };

  return (
    <>
      <div style={{
        display: "grid",
        gridTemplateColumns: readOnly
          ? "minmax(120px, 1fr) minmax(160px, 2fr) 130px"
          : "minmax(120px, 1fr) minmax(160px, 2fr) 130px 32px",
        gap: 6,
        fontSize: 10, fontWeight: 700, color: V.ink3,
        letterSpacing: 1, textTransform: "uppercase",
        marginBottom: 6,
      }}>
        <div>Category</div>
        <div>Description</div>
        <div>Total $</div>
        {!readOnly ? <div></div> : null}
      </div>

      {items.length === 0 ? (
        <div style={{
          fontSize: 12, color: V.ink3, padding: 14,
          textAlign: "center", border: `1px dashed ${V.line}`,
          borderRadius: 9, background: V.surface2,
        }}>
          {readOnly
            ? "No scope-of-work lines on file."
            : <>No scope-of-work lines yet. Tap <strong style={{ color: V.ink2 }}>Add row</strong> to start.</>}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((item, idx) => (
            <div key={idx} style={{
              display: "grid",
              gridTemplateColumns: readOnly
                ? "minmax(120px, 1fr) minmax(160px, 2fr) 130px"
                : "minmax(120px, 1fr) minmax(160px, 2fr) 130px 32px",
              gap: 6, alignItems: "center",
            }}>
              <input
                value={item.category}
                onChange={(e) => setItem(idx, { category: e.target.value })}
                placeholder="Demo / HVAC / Plumbing"
                disabled={readOnly}
                style={inputStyle()}
              />
              <input
                value={item.description}
                onChange={(e) => setItem(idx, { description: e.target.value })}
                placeholder="Brief description"
                disabled={readOnly}
                style={inputStyle()}
              />
              <input
                value={String(item.total_usd || "")}
                onChange={(e) => {
                  const v = Number(e.target.value.replace(/[^0-9.]/g, "")) || 0;
                  setItem(idx, { total_usd: v });
                }}
                placeholder="0"
                inputMode="numeric"
                disabled={readOnly}
                style={{ ...inputStyle(), fontFeatureSettings: '"tnum"' }}
              />
              {!readOnly ? (
                <button
                  type="button"
                  onClick={() => removeItem(idx)}
                  title="Remove row"
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    width: 24, height: 24,
                    borderRadius: 6,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    color: V.ink3,
                  }}
                >
                  <Icon name="x" size={12} />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <div style={{
        marginTop: 12, paddingTop: 10,
        borderTop: `1px solid ${V.line}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        {!readOnly ? (
          <button
            type="button"
            onClick={addItem}
            className="btn"
          >
            <Icon name="plus" size={12} /> Add row
          </button>
        ) : <div />}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: V.ink3, letterSpacing: 1, textTransform: "uppercase" }}>
            Total construction
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: V.ink, marginTop: 2, fontFeatureSettings: '"tnum"' }}>
            {QC_FMT.usd(total, 0)}
          </div>
        </div>
      </div>
    </>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 7,
    background: V.surface2,
    border: `1px solid ${V.line}`,
    color: V.ink,
    fontSize: 12.5,
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box",
  };
}
