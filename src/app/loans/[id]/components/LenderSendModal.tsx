"use client";

// Secure multi-lender package creator. The backend stores the document
// manifest and creates one pending portal-link email draft per lender.
//
// Restyled onto the plain-CSS design system. The hand-rolled fixed overlay
// became `Drawer`, which adds Escape-to-close, focus return and a body
// scroll lock the old markup never had; the announced dialog name is kept
// verbatim so nothing changes for a screen-reader user.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Btn, Input, Linky, Select, StatusLine, Sub, Textarea } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { Icon } from "@/components/design-system/Icon";
import { useCreateLenderPackage, useDocuments, useLenders } from "@/hooks/useApi";
import type { Document, Lender, Loan } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  loan: Loan;
  primaryLender?: Lender | null;
}

const SENDABLE_STATUSES = new Set(["received", "verified"]);
const EXPIRATION_OPTIONS = [1, 3, 7, 14] as const;

export function LenderSendModal({ open, onClose, loan, primaryLender }: Props) {
  const { data: docs = [], isLoading: docsLoading } = useDocuments(loan.id);
  const { data: lenders = [], isLoading: lendersLoading } = useLenders({ activeOnly: true });
  const createPackage = useCreateLenderPackage();

  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [selectedLenders, setSelectedLenders] = useState<Set<string>>(new Set());
  const [expiresInDays, setExpiresInDays] = useState<1 | 3 | 7 | 14>(7);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedDocs(new Set());
    setSelectedLenders(primaryLender?.id ? new Set([primaryLender.id]) : new Set());
    setExpiresInDays(7);
    setSubject(`[QC-${loan.deal_id}] Secure lender package - ${loan.address}`);
    setMessage("");
    setError(null);
    setSuccess(null);
  }, [loan.address, loan.deal_id, open, primaryLender?.id]);

  const sendable = useMemo<Document[]>(
    () => docs.filter((d) => SENDABLE_STATUSES.has(d.status)),
    [docs],
  );
  const blockedDocs = useMemo<Document[]>(
    () => docs.filter((d) => !SENDABLE_STATUSES.has(d.status)),
    [docs],
  );

  const toggleDoc = (id: string) => {
    const next = new Set(selectedDocs);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedDocs(next);
  };

  const toggleLender = (id: string) => {
    const next = new Set(selectedLenders);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedLenders(next);
  };

  const submit = async () => {
    setError(null);
    setSuccess(null);
    if (selectedLenders.size === 0) {
      setError("Pick at least one lender.");
      return;
    }
    if (selectedDocs.size === 0) {
      setError("Pick at least one received or verified document.");
      return;
    }
    try {
      const res = await createPackage.mutateAsync({
        loanId: loan.id,
        payload: {
          lender_ids: Array.from(selectedLenders),
          document_ids: Array.from(selectedDocs),
          expires_in_days: expiresInDays,
          subject: subject.trim() || null,
          message: message.trim() || null,
        },
      });
      setSuccess(
        `Secure package created for ${res.recipients.length} lender(s). ${res.recipients.length} portal-link draft(s) are pending review.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Package creation failed.");
    }
  };

  if (!open) return null;

  const nothingPicked = selectedDocs.size === 0 || selectedLenders.size === 0;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`${loan.deal_id} - ${loan.address}`}
      sub="Secure lender package"
      // The visible title is the deal, not the name of the dialog. Keep the
      // announced name exactly as the pre-migration markup had it.
      ariaLabel="Create secure lender package"
      width="lg"
      bodyClass="grid"
      footer={
        <>
          <span className="grow" />
          <Btn onClick={onClose}>{success ? "Close" : "Cancel"}</Btn>
          {!success ? (
            <Btn
              variant="pri"
              onClick={submit}
              disabled={createPackage.isPending || nothingPicked}
            >
              {createPackage.isPending ? "Creating..." : (
                <>
                  <Icon name="shield" size={13} stroke={3} /> Create package
                </>
              )}
            </Btn>
          ) : null}
        </>
      }
    >
      <div className="fldgrid four">
        <SecurityChip label="Portal login" />
        <SecurityChip label="No email file links" />
        <SecurityChip label="Access logged" />
        <SecurityChip label="Revocable" />
      </div>

      {/* Bespoke split: the subject takes what is left, the expiry is a
          fixed 170px picker. */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 170px", gap: 12 }}>
        <Field label="Subject">
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <Field label="Expires">
          <Select
            value={expiresInDays}
            onChange={(e) => setExpiresInDays(Number(e.target.value) as 1 | 3 | 7 | 14)}
          >
            {EXPIRATION_OPTIONS.map((days) => (
              <option key={days} value={days}>{days} day{days === 1 ? "" : "s"}</option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Message">
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Optional note for the lender portal email draft."
          rows={3}
        />
      </Field>

      {/* Bespoke two-pane picker — lenders on the left, documents on the
          right, weighted to the longer list. */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 0.9fr) minmax(0, 1.1fr)", gap: 14 }}>
        <section>
          <div className="lbl mb">Lenders - {selectedLenders.size} selected</div>
          {lendersLoading ? (
            <Sub>Loading lenders...</Sub>
          ) : lenders.length === 0 ? (
            <Sub>No active lenders are available.</Sub>
          ) : (
            <div className="picklist">
              {lenders.map((lender) => {
                const isOn = selectedLenders.has(lender.id);
                const isPrimary = primaryLender?.id === lender.id;
                return (
                  <SelectRow
                    key={lender.id}
                    active={isOn}
                    onClick={() => toggleLender(lender.id)}
                    title={lender.name}
                    detail={`${lender.submission_email ?? lender.contact_email ?? "No email"}${isPrimary ? " - Primary" : ""}`}
                  />
                );
              })}
            </div>
          )}
        </section>

        <section>
          <div className="row mb">
            <div className="lbl grow">Documents - {selectedDocs.size} selected</div>
            {sendable.length > 0 ? (
              <>
                <Linky onClick={() => setSelectedDocs(new Set(sendable.map((d) => d.id)))}>
                  Select all
                </Linky>
                <Linky onClick={() => setSelectedDocs(new Set())}>Clear</Linky>
              </>
            ) : null}
          </div>
          {docsLoading ? (
            <Sub>Loading documents...</Sub>
          ) : sendable.length === 0 ? (
            <Sub>No received or verified documents are ready.</Sub>
          ) : (
            <div className="picklist">
              {sendable.map((doc) => (
                <SelectRow
                  key={doc.id}
                  active={selectedDocs.has(doc.id)}
                  onClick={() => toggleDoc(doc.id)}
                  title={doc.name}
                  detail={`${doc.status}${doc.received_on ? ` - received ${doc.received_on}` : ""}`}
                />
              ))}
            </div>
          )}
          {blockedDocs.length > 0 ? (
            <div className="sub mt">
              {blockedDocs.length} pending/requested doc(s) are excluded.
            </div>
          ) : null}
        </section>
      </div>

      {error ? <StatusLine tone="bad">{error}</StatusLine> : null}
      {success ? <StatusLine tone="ok">{success}</StatusLine> : null}
    </Drawer>
  );
}

/**
 * Label + control.
 *
 * A real `<label>` rather than the design system's `Field` (a `<div>` and a
 * `<span class="lbl">`), because wrapping is what names the control.
 */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid g6">
      <span className="lbl">{label}</span>
      {children}
    </label>
  );
}

function SecurityChip({ label }: { label: string }) {
  return (
    <div className="itemrow">
      <Icon name="shield" size={12} color="var(--petrol)" />
      <span className="grow trunc" style={{ fontWeight: 650 }}>{label}</span>
    </div>
  );
}

function SelectRow({
  active,
  onClick,
  title,
  detail,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  detail: string;
}) {
  // `.pick` is the design system's selectable row; `.pick.on` carries the
  // selected tint, and `aria-pressed` carries it to a screen reader.
  return (
    <button
      type="button"
      className={active ? "pick on" : "pick"}
      aria-pressed={active}
      onClick={onClick}
    >
      <span
        // Data-derived: the box is filled only when this row is selected.
        style={{
          width: 16,
          height: 16,
          borderRadius: 4,
          border: `1.5px solid ${active ? "var(--petrol)" : "var(--line)"}`,
          background: active ? "var(--petrol)" : "transparent",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flex: "0 0 auto",
        }}
      >
        {active ? <Icon name="check" size={11} color="#fff" stroke={3} /> : null}
      </span>
      <span className="grow">
        <span className="trunc" style={{ display: "block", fontWeight: 700 }}>{title}</span>
        <span className="sub trunc" style={{ display: "block" }}>{detail}</span>
      </span>
    </button>
  );
}
