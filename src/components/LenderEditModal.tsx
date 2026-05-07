"use client";

// Lender create/edit modal.
//
// One modal handles both modes — when `lender` is null we POST,
// otherwise PATCH. Active toggle only renders in edit mode; deleting
// soft-disables (calls DELETE which sets is_active=false on the
// server). The "Hard delete" affordance is hidden behind a confirm
// and only succeeds if no loan still references the lender.

import { useEffect, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { LoanTypeChips } from "@/components/LoanTypeChips";
import {
  useCreateLender,
  useDeleteLender,
  useUpdateLender,
} from "@/hooks/useApi";
import type { Lender, LenderCreate, LenderUpdate } from "@/lib/types";
import type { LoanType } from "@/lib/enums.generated";

interface Props {
  open: boolean;
  onClose: () => void;
  lender: Lender | null;
}

export function LenderEditModal({ open, onClose, lender }: Props) {
  const { t } = useTheme();
  const create = useCreateLender();
  const update = useUpdateLender();
  const del = useDeleteLender();

  const [name, setName] = useState("");
  const [submissionEmail, setSubmissionEmail] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactTitle, setContactTitle] = useState("");
  const [emailDomain, setEmailDomain] = useState("");
  const [products, setProducts] = useState<LoanType[]>([]);
  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (lender) {
      setName(lender.name);
      setSubmissionEmail(lender.submission_email ?? "");
      setContactName(lender.contact_name ?? "");
      setContactEmail(lender.contact_email ?? "");
      setContactPhone(lender.contact_phone ?? "");
      setContactTitle(lender.contact_title ?? "");
      setEmailDomain(lender.email_domain ?? "");
      setProducts(lender.products ?? []);
      setNotes(lender.notes ?? "");
      setIsActive(lender.is_active);
    } else {
      setName("");
      setSubmissionEmail("");
      setContactName("");
      setContactEmail("");
      setContactPhone("");
      setContactTitle("");
      setEmailDomain("");
      setProducts([]);
      setNotes("");
      setIsActive(true);
    }
  }, [open, lender]);

  const submit = async () => {
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (products.length === 0) {
      setError("Pick at least one product this lender services.");
      return;
    }
    const base = {
      name: name.trim(),
      products,
      submission_email: submissionEmail.trim() || null,
      contact_name: contactName.trim() || null,
      contact_email: contactEmail.trim() || null,
      contact_phone: contactPhone.trim() || null,
      contact_title: contactTitle.trim() || null,
      email_domain: emailDomain.trim() || null,
      notes: notes.trim() || null,
    };
    try {
      if (lender) {
        const payload: LenderUpdate = { ...base, is_active: isActive };
        await update.mutateAsync({ lenderId: lender.id, ...payload });
      } else {
        const payload: LenderCreate = { ...base, is_active: true };
        await create.mutateAsync(payload);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    }
  };

  const handleSoftDelete = async () => {
    if (!lender) return;
    if (!window.confirm(`Disable "${lender.name}"? It will be hidden from new connections but historical references stay intact.`)) return;
    try {
      await del.mutateAsync({ lenderId: lender.id });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    }
  };

  if (!open) return null;

  const isSaving = create.isPending || update.isPending;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={lender ? "Edit lender" : "New lender"}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(6, 7, 11, 0.55)",
        backdropFilter: "blur(2px)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: "min(720px, 95vw)",
          maxHeight: "92vh",
          overflowY: "auto",
          background: t.bg,
          borderRadius: 16,
          boxShadow: t.shadowLg,
          border: `1px solid ${t.line}`,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 22px",
            borderBottom: `1px solid ${t.line}`,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 1.6,
                textTransform: "uppercase",
                color: t.petrol,
              }}
            >
              Lender
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: t.ink, marginTop: 2 }}>
              {lender ? lender.name : "New lender"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              all: "unset",
              cursor: "pointer",
              width: 32,
              height: 32,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
              color: t.ink2,
            }}
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
          <Field
            t={t}
            label="Lender name"
            value={name}
            onChange={setName}
            placeholder="Acme Capital Partners"
            required
          />

          <div>
            <label
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 1.2,
                textTransform: "uppercase",
                color: t.ink3,
                display: "block",
                marginBottom: 8,
              }}
            >
              Products serviced
            </label>
            <div style={{ fontSize: 11.5, color: t.ink3, marginBottom: 8, lineHeight: 1.5 }}>
              Tap to select / tap again to remove. Lenders only appear in the Connect-Lender
              dropdown when their products match the loan's type.
            </div>
            <LoanTypeChips selected={products} onChange={setProducts} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field t={t} label="Submission email" value={submissionEmail} onChange={setSubmissionEmail} placeholder="deals@acme.com" />
            <Field t={t} label="Email domain" value={emailDomain} onChange={setEmailDomain} placeholder="acme.com" hint="Phase-2: inbound match fallback" />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
              padding: 14,
              background: t.surface2,
              borderRadius: 12,
              border: `1px solid ${t.line}`,
            }}
          >
            <div style={{ gridColumn: "1 / -1", fontSize: 11, fontWeight: 700, color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase" }}>
              Primary point of contact
            </div>
            <Field t={t} label="Name" value={contactName} onChange={setContactName} placeholder="Sarah Chen" />
            <Field t={t} label="Title" value={contactTitle} onChange={setContactTitle} placeholder="Senior Underwriter" />
            <Field t={t} label="Email" value={contactEmail} onChange={setContactEmail} placeholder="sarah@acme.com" />
            <Field t={t} label="Phone" value={contactPhone} onChange={setContactPhone} placeholder="(555) 555-1234" />
          </div>

          <div>
            <label
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 1.2,
                textTransform: "uppercase",
                color: t.ink3,
                display: "block",
                marginBottom: 6,
              }}
            >
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Internal scratchpad — turnaround times, niche programs, etc."
              style={{
                width: "100%",
                padding: "10px 12px",
                background: t.surface2,
                border: `1px solid ${t.line}`,
                borderRadius: 10,
                color: t.ink,
                fontSize: 13,
                fontFamily: "inherit",
                outline: "none",
                resize: "vertical",
              }}
            />
          </div>

          {lender ? (
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, color: t.ink2 }}>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              Active — appears in Connect-Lender dropdowns
            </label>
          ) : null}

          {error ? <Pill bg={t.dangerBg} color={t.danger}>{error}</Pill> : null}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 22px",
            borderTop: `1px solid ${t.line}`,
          }}
        >
          {lender ? (
            <button
              type="button"
              onClick={handleSoftDelete}
              style={{
                all: "unset",
                cursor: "pointer",
                fontSize: 12.5,
                color: t.danger,
                fontWeight: 600,
              }}
            >
              Disable lender
            </button>
          ) : <span />}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                all: "unset",
                cursor: "pointer",
                padding: "10px 18px",
                borderRadius: 10,
                border: `1px solid ${t.line}`,
                fontSize: 13,
                color: t.ink2,
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={isSaving}
              style={{
                all: "unset",
                cursor: isSaving ? "wait" : "pointer",
                padding: "10px 18px",
                borderRadius: 10,
                background: t.petrol,
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                opacity: isSaving ? 0.6 : 1,
              }}
            >
              {isSaving ? "Saving…" : lender ? "Save changes" : "Create lender"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface FieldProps {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  hint?: string;
}

function Field({ t, label, value, onChange, placeholder, required, hint }: FieldProps) {
  return (
    <div>
      <label
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: t.ink3,
          display: "block",
          marginBottom: 6,
        }}
      >
        {label}
        {required ? <span style={{ color: t.danger }}> *</span> : null}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          padding: "10px 12px",
          background: t.surface2,
          border: `1px solid ${t.line}`,
          borderRadius: 10,
          color: t.ink,
          fontSize: 13,
          fontFamily: "inherit",
          outline: "none",
        }}
      />
      {hint ? (
        <div style={{ fontSize: 10.5, color: t.ink4, marginTop: 4 }}>{hint}</div>
      ) : null}
    </div>
  );
}
