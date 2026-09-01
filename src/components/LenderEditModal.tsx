"use client";

// Lender create/edit modal.
//
// One modal handles both modes — when `lender` is null we POST,
// otherwise PATCH. Active toggle only renders in edit mode; deleting
// soft-disables (calls DELETE which sets is_active=false on the
// server). The "Hard delete" affordance is hidden behind a confirm
// and only succeeds if no loan still references the lender.
//
// Restyled onto the plain-CSS design system. The hand-rolled overlay is now
// `<Drawer>`, which is a strict superset of what this modal did by hand:
// backdrop click and the close button are carried over, and Escape-to-close,
// body scroll locking and focus restore come along for free. Fields are
// `Field` + `Input`/`Textarea`; the local `Field` helper survives as
// `TextField`, reimplemented on top of the design-system pair rather than
// deleted, because its label/hint/required signature is what every call site
// here uses.

import { useEffect, useState } from "react";
import { LoanTypeChips } from "@/components/LoanTypeChips";
import { Btn, Callout, Field, Input, Sub, Textarea } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { useConfirmAction } from "@/components/design-system/ConfirmationProvider";
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
  const confirmAction = useConfirmAction();
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
    const confirmed = await confirmAction({
      title: `Disable ${lender.name}`,
      body: "The lender will be hidden from new connections. Historical references remain intact.",
      confirmLabel: "Disable lender",
      tone: "danger",
      reversible: true,
    });
    if (!confirmed) return;
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
    <Drawer
      open={open}
      onClose={onClose}
      width="md"
      // The visible title is the lender's NAME, which is not the name of the
      // dialog — and it changes between create and edit. Announce the object.
      ariaLabel={lender ? "Edit lender" : "New lender"}
      title={
        <span className="row">
          <span className="mlbl">Lender</span>
          {lender ? lender.name : "New lender"}
        </span>
      }
      footer={
        <>
          {lender ? (
            <Btn className="danger" onClick={handleSoftDelete}>
              Disable lender
            </Btn>
          ) : null}
          <span className="sp" />
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="pri" onClick={submit} disabled={isSaving}>
            {isSaving ? "Saving…" : lender ? "Save changes" : "Create lender"}
          </Btn>
        </>
      }
    >
      <div className="grid">
        <TextField
          label="Lender name"
          value={name}
          onChange={setName}
          placeholder="Acme Capital Partners"
          required
        />

        <div className="fldsec">
          <span className="lbl">Products serviced</span>
          <div className="sub mb">
            Tap to select / tap again to remove. Lenders only appear in the Connect-Lender
            dropdown when their products match the loan&apos;s type.
          </div>
          <LoanTypeChips selected={products} onChange={setProducts} />
        </div>

        <div className="fldgrid two">
          <TextField
            label="Submission email"
            value={submissionEmail}
            onChange={setSubmissionEmail}
            placeholder="deals@acme.com"
          />
          <TextField
            label="Email domain"
            value={emailDomain}
            onChange={setEmailDomain}
            placeholder="acme.com"
            hint="Phase-2: inbound match fallback"
          />
        </div>

        <div className="fldsec">
          <span className="lbl">Primary point of contact</span>
          <div className="fldgrid two">
            <TextField label="Name" value={contactName} onChange={setContactName} placeholder="Sarah Chen" />
            <TextField label="Title" value={contactTitle} onChange={setContactTitle} placeholder="Senior Underwriter" />
            <TextField label="Email" value={contactEmail} onChange={setContactEmail} placeholder="sarah@acme.com" />
            <TextField label="Phone" value={contactPhone} onChange={setContactPhone} placeholder="(555) 555-1234" />
          </div>
        </div>

        <Field label="Notes">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Internal scratchpad — turnaround times, niche programs, etc."
          />
        </Field>

        {lender ? (
          <label className="row">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <Sub>Active — appears in Connect-Lender dropdowns</Sub>
          </label>
        ) : null}

        {error ? <Callout tone="bad">{error}</Callout> : null}
      </div>
    </Drawer>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  hint?: string;
}

/**
 * Was the local `Field` helper. Kept — the call sites below all use its
 * label/value/onChange/placeholder/required/hint shape — but its hand-rolled
 * label and input styling is now the design-system `Field` + `Input`.
 *
 * `required` used to render a red asterisk that was always on. It now drives
 * `req`, which is the same claim said properly: the rail and the REQUIRED tag
 * appear while the field is still empty, and the control is marked `bad` so
 * the signal is not colour alone.
 */
function TextField({ label, value, onChange, placeholder, required, hint }: FieldProps) {
  const unmet = Boolean(required) && !value.trim();
  return (
    <Field label={label} hint={hint} req={unmet}>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={unmet ? "bad" : undefined}
        aria-required={required || undefined}
      />
    </Field>
  );
}
