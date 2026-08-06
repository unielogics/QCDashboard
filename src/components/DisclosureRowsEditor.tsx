"use client";

// Generic repeatable-row input for a contract's "disclosure_rows"-type
// field (see ContractField.table_columns in useApi.ts) -- Schedule A's
// existing-capital-relationship disclosure tables on the Referral Protection
// Agreement being the first user. Renders one typed input per declared
// column (a <select> for "select" columns, a checkbox for "checkbox"
// columns), a remove button per row, and an "Add" button. Starts empty --
// nothing is disclosed until the signer adds a row.

import { useTheme } from "@/components/design-system/ThemeProvider";
import type { TableColumn } from "@/hooks/useApi";

export type DisclosureRow = Record<string, string | boolean>;

export function DisclosureRowsEditor({
  columns,
  rows,
  onChange,
  addLabel = "Add relationship",
}: {
  columns: TableColumn[];
  rows: DisclosureRow[];
  onChange: (rows: DisclosureRow[]) => void;
  addLabel?: string;
}) {
  const { t } = useTheme();

  function addRow() {
    const blank: DisclosureRow = {};
    for (const col of columns) blank[col.key] = col.input_type === "checkbox" ? false : "";
    onChange([...rows, blank]);
  }

  function updateRow(index: number, key: string, value: string | boolean) {
    onChange(rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  }

  function removeRow(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {rows.length > 0 ? (
        <div style={{ display: "grid", gap: 8 }}>
          {rows.map((row, i) => (
            <div
              key={i}
              style={{
                border: `1px solid ${t.line}`,
                borderRadius: 10,
                padding: 10,
                display: "grid",
                gap: 8,
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                alignItems: "end",
                background: t.surface2,
              }}
            >
              {columns.map((col) => (
                <label key={col.key} style={{ display: "block", minWidth: 0 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4, color: t.ink3, marginBottom: 3 }}>
                    {col.label}
                  </div>
                  {col.input_type === "checkbox" ? (
                    <input
                      type="checkbox"
                      checked={!!row[col.key]}
                      onChange={(e) => updateRow(i, col.key, e.target.checked)}
                      style={{ width: 16, height: 16 }}
                    />
                  ) : col.input_type === "select" ? (
                    <select
                      value={(row[col.key] as string) || ""}
                      onChange={(e) => updateRow(i, col.key, e.target.value)}
                      style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.line}`, background: t.surface, color: t.ink, fontSize: 12.5 }}
                    >
                      <option value="">Select…</option>
                      {(col.options || []).map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={col.input_type === "date" ? "date" : "text"}
                      value={(row[col.key] as string) || ""}
                      onChange={(e) => updateRow(i, col.key, e.target.value)}
                      style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.line}`, background: t.surface, color: t.ink, fontSize: 12.5 }}
                    />
                  )}
                </label>
              ))}
              <button
                type="button"
                onClick={() => removeRow(i)}
                style={{ height: 32, border: `1px solid ${t.line}`, borderRadius: 8, background: "none", color: t.danger, fontSize: 12, cursor: "pointer" }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: t.ink3, fontStyle: "italic" }}>None disclosed yet.</div>
      )}
      <button
        type="button"
        onClick={addRow}
        style={{ alignSelf: "start", height: 32, padding: "0 12px", border: `1px solid ${t.petrol}`, borderRadius: 8, background: "none", color: t.petrol, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
      >
        + {addLabel}
      </button>
    </div>
  );
}
