"use client";

import { useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { useLoans, useRequestDocument } from "@/hooks/useApi";
import { parseIntStrict } from "@/lib/formCoerce";

const DOC_CATEGORIES = ["entity", "property", "financial", "insurance", "title", "other"] as const;

export function DocRequestModal({
  open,
  onClose,
  defaultLoanId,
}: {
  open: boolean;
  onClose: () => void;
  defaultLoanId?: string;
}) {
  const { t } = useTheme();
  const { data: loans = [] } = useLoans();
  const requestDoc = useRequestDocument();
  const [loanId, setLoanId] = useState<string>(defaultLoanId ?? "");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("financial");
  const [dueDays, setDueDays] = useState("7");
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const targetLoan = defaultLoanId ?? loanId;
  const canSubmit = !!targetLoan && name.trim().length > 0;

  const handleSubmit = async () => {
    setError(null);
    if (!canSubmit) return;
    try {
      await requestDoc.mutateAsync({
        loan_id: targetLoan,
        name: name.trim(),
        category: category || undefined,
        due_in_days: parseIntStrict(dueDays) || undefined,
      });
      setName("");
      setDueDays("7");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to request document.");
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,20,28,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
        padding: 32,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 520,
          background: t.surface,
          borderRadius: 16,
          border: `1px solid ${t.line}`,
          boxShadow: t.shadowLg,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${t.line}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: t.ink, letterSpacing: -0.3 }}>Request document</div>
          <button onClick={onClose} style={{ width: 28, height: 28, border: `1px solid ${t.line}`, borderRadius: 7, background: "transparent", color: t.ink2, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="x" size={13} />
          </button>
        </div>

        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          {!defaultLoanId && (
            <Field t={t} label="Loan" required>
              <select
                value={loanId}
                onChange={(e) => setLoanId(e.target.value)}
                style={selectStyle(t)}
              >
                <option value="">Select a loan…</option>
                {loans.map((l) => (
                  <option key={l.id} value={l.id}>{l.deal_id} — {l.address}</option>
                ))}
              </select>
            </Field>
          )}
          <Field t={t} label="Document name" required>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Updated insurance binder"
              style={inputStyle(t)}
            />
          </Field>
          <Field t={t} label="Category">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={selectStyle(t)}
            >
              {DOC_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field t={t} label="Due in (days)">
            <input
              value={dueDays}
              onChange={(e) => setDueDays(e.target.value)}
              placeholder="7"
              style={inputStyle(t)}
            />
          </Field>
          {error && <div style={{ color: t.danger, fontSize: 12, fontWeight: 700 }}>{error}</div>}
        </div>

        <div style={{ padding: "12px 20px", borderTop: `1px solid ${t.line}`, display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={qcBtn(t)}>Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || requestDoc.isPending}
            style={{ ...qcBtnPrimary(t), opacity: canSubmit && !requestDoc.isPending ? 1 : 0.5, cursor: canSubmit && !requestDoc.isPending ? "pointer" : "not-allowed" }}
          >
            <Icon name="bolt" size={13} />
            {requestDoc.isPending ? "Sending…" : "Send request"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ t, label, required, children }: { t: ReturnType<typeof useTheme>["t"]; label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.0, textTransform: "uppercase", marginBottom: 6 }}>
        {label} {required && <span style={{ color: t.danger }}>*</span>}
      </div>
      {children}
    </div>
  );
}

function inputStyle(t: ReturnType<typeof useTheme>["t"]): React.CSSProperties {
  return {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 9,
    border: `1px solid ${t.line}`,
    background: t.surface2,
    color: t.ink,
    fontSize: 13,
    fontFamily: "inherit",
    outline: "none",
  };
}
function selectStyle(t: ReturnType<typeof useTheme>["t"]): React.CSSProperties {
  return inputStyle(t);
}
