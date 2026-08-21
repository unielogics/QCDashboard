"use client";

import { useState, type ReactNode } from "react";
import { Btn, Field, Input, Select } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { Icon } from "@/components/design-system/Icon";
import { useLoans, useRequestDocument } from "@/hooks/useApi";
import { parseIntStrict } from "@/lib/formCoerce";

const DOC_CATEGORIES = ["entity", "property", "financial", "insurance", "title", "other"] as const;

/** Required marker beside a field label. The sheet carries no utility for a
    single danger-coloured glyph, so the token is referenced directly. */
function Req({ label }: { label: string }): ReactNode {
  return (
    <>
      {label} <span style={{ color: "var(--danger)" }}>*</span>
    </>
  );
}

export function DocRequestModal({
  open,
  onClose,
  defaultLoanId,
}: {
  open: boolean;
  onClose: () => void;
  defaultLoanId?: string;
}) {
  const { data: loans = [] } = useLoans();
  const requestDoc = useRequestDocument();
  const [loanId, setLoanId] = useState<string>(defaultLoanId ?? "");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("financial");
  const [dueDays, setDueDays] = useState("7");
  const [error, setError] = useState<string | null>(null);

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
    <Drawer
      open={open}
      onClose={onClose}
      title="Request document"
      width="md"
      footer={
        <>
          <span className="sp" />
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="pri" onClick={handleSubmit} disabled={!canSubmit || requestDoc.isPending}>
            <Icon name="bolt" size={13} />
            {requestDoc.isPending ? "Sending…" : "Send request"}
          </Btn>
        </>
      }
    >
      <div className="grid">
        {!defaultLoanId && (
          <Field label={<Req label="Loan" />}>
            <Select value={loanId} onChange={(e) => setLoanId(e.target.value)}>
              <option value="">Select a loan…</option>
              {loans.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.deal_id} — {l.address}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={<Req label="Document name" />}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Updated insurance binder"
          />
        </Field>
        <Field label="Category">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {DOC_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Due in (days)">
          <Input value={dueDays} onChange={(e) => setDueDays(e.target.value)} placeholder="7" />
        </Field>
        {/* Error text follows the pattern ds/Field uses for its own `error`
            slot: the .sub caption with the danger token substituted. */}
        {error && (
          <div className="sub" style={{ color: "var(--danger)" }}>
            {error}
          </div>
        )}
      </div>
    </Drawer>
  );
}
