"use client";

// Secure multi-lender package creator. The backend stores the document
// manifest and creates one pending portal-link email draft per lender.

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Pill } from "@/components/design-system/primitives";
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
  const { t } = useTheme();
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Create secure lender package"
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
          width: "min(860px, 95vw)",
          maxHeight: "92vh",
          overflowY: "auto",
          background: t.bg,
          borderRadius: 16,
          boxShadow: t.shadowLg,
          border: `1px solid ${t.line}`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "16px 22px",
            borderBottom: `1px solid ${t.line}`,
          }}
        >
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase", color: t.petrol }}>
              Secure lender package
            </div>
            <div style={{ fontSize: 18, fontWeight: 850, color: t.ink, marginTop: 2 }}>
              {loan.deal_id} - {loan.address}
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

        <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 8,
            }}
          >
            <SecurityChip t={t} label="Portal login" />
            <SecurityChip t={t} label="No email file links" />
            <SecurityChip t={t} label="Access logged" />
            <SecurityChip t={t} label="Revocable" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 170px", gap: 12 }}>
            <Field label="Subject" t={t}>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                style={inputStyle(t)}
              />
            </Field>
            <Field label="Expires" t={t}>
              <select
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(Number(e.target.value) as 1 | 3 | 7 | 14)}
                style={inputStyle(t)}
              >
                {EXPIRATION_OPTIONS.map((days) => (
                  <option key={days} value={days}>{days} day{days === 1 ? "" : "s"}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Message" t={t}>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Optional note for the lender portal email draft."
              rows={3}
              style={{ ...inputStyle(t), resize: "vertical", lineHeight: 1.45 }}
            />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 0.9fr) minmax(0, 1.1fr)", gap: 14 }}>
            <section>
              <HeaderRow t={t} label={`Lenders - ${selectedLenders.size} selected`} />
              {lendersLoading ? (
                <EmptyText t={t}>Loading lenders...</EmptyText>
              ) : lenders.length === 0 ? (
                <EmptyText t={t}>No active lenders are available.</EmptyText>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {lenders.map((lender) => {
                    const isOn = selectedLenders.has(lender.id);
                    const isPrimary = primaryLender?.id === lender.id;
                    return (
                      <SelectRow
                        key={lender.id}
                        t={t}
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
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <HeaderRow t={t} label={`Documents - ${selectedDocs.size} selected`} />
                {sendable.length > 0 ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setSelectedDocs(new Set(sendable.map((d) => d.id)))}
                      style={linkButton(t)}
                    >
                      Select all
                    </button>
                    <button type="button" onClick={() => setSelectedDocs(new Set())} style={linkButton(t)}>
                      Clear
                    </button>
                  </div>
                ) : null}
              </div>
              {docsLoading ? (
                <EmptyText t={t}>Loading documents...</EmptyText>
              ) : sendable.length === 0 ? (
                <EmptyText t={t}>No received or verified documents are ready.</EmptyText>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {sendable.map((doc) => (
                    <SelectRow
                      key={doc.id}
                      t={t}
                      active={selectedDocs.has(doc.id)}
                      onClick={() => toggleDoc(doc.id)}
                      title={doc.name}
                      detail={`${doc.status}${doc.received_on ? ` - received ${doc.received_on}` : ""}`}
                    />
                  ))}
                </div>
              )}
              {blockedDocs.length > 0 ? (
                <div style={{ marginTop: 10, fontSize: 11.5, color: t.ink3 }}>
                  {blockedDocs.length} pending/requested doc(s) are excluded.
                </div>
              ) : null}
            </section>
          </div>

          {error ? <Pill bg={t.dangerBg} color={t.danger}>{error}</Pill> : null}
          {success ? <Pill bg={t.profitBg} color={t.profit}>{success}</Pill> : null}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 8,
            padding: "14px 22px",
            borderTop: `1px solid ${t.line}`,
          }}
        >
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
            {success ? "Close" : "Cancel"}
          </button>
          {!success ? (
            <button
              type="button"
              onClick={submit}
              disabled={createPackage.isPending || selectedDocs.size === 0 || selectedLenders.size === 0}
              style={{
                all: "unset",
                cursor: createPackage.isPending ? "wait" : selectedDocs.size === 0 || selectedLenders.size === 0 ? "not-allowed" : "pointer",
                padding: "10px 18px",
                borderRadius: 10,
                background: selectedDocs.size === 0 || selectedLenders.size === 0 ? t.chip : t.petrol,
                color: selectedDocs.size === 0 || selectedLenders.size === 0 ? t.ink4 : "#fff",
                fontSize: 13,
                fontWeight: 800,
                opacity: createPackage.isPending ? 0.65 : 1,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {createPackage.isPending ? "Creating..." : (
                <>
                  <Icon name="shield" size={13} stroke={3} /> Create package
                </>
              )}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Field({ label, t, children }: { label: string; t: ReturnType<typeof useTheme>["t"]; children: ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1.1, textTransform: "uppercase", color: t.ink3 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function HeaderRow({ label, t }: { label: string; t: ReturnType<typeof useTheme>["t"] }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.1, textTransform: "uppercase", color: t.ink3, marginBottom: 8 }}>
      {label}
    </div>
  );
}

function SecurityChip({ label, t }: { label: string; t: ReturnType<typeof useTheme>["t"] }) {
  return (
    <div
      style={{
        border: `1px solid ${t.line}`,
        background: t.surface2,
        borderRadius: 8,
        padding: "8px 10px",
        display: "flex",
        alignItems: "center",
        gap: 6,
        minWidth: 0,
      }}
    >
      <Icon name="shield" size={12} color={t.petrol} />
      <span style={{ fontSize: 11.5, fontWeight: 750, color: t.ink2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {label}
      </span>
    </div>
  );
}

function SelectRow({
  t,
  active,
  onClick,
  title,
  detail,
}: {
  t: ReturnType<typeof useTheme>["t"];
  active: boolean;
  onClick: () => void;
  title: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        all: "unset",
        cursor: "pointer",
        padding: "9px 10px",
        borderRadius: 8,
        border: `1px solid ${active ? t.petrol : t.line}`,
        background: active ? t.brandSoft : "transparent",
        display: "flex",
        alignItems: "center",
        gap: 10,
        minWidth: 0,
      }}
    >
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: 4,
          border: `1.5px solid ${active ? t.petrol : t.line}`,
          background: active ? t.petrol : "transparent",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flex: "0 0 auto",
        }}
      >
        {active ? <Icon name="check" size={11} color="#fff" stroke={3} /> : null}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 12.5, fontWeight: 800, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}
        </span>
        <span style={{ display: "block", fontSize: 11, color: t.ink3, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {detail}
        </span>
      </span>
    </button>
  );
}

function EmptyText({ t, children }: { t: ReturnType<typeof useTheme>["t"]; children: ReactNode }) {
  return <div style={{ fontSize: 12.5, color: t.ink3, lineHeight: 1.45 }}>{children}</div>;
}

function inputStyle(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return {
    width: "100%",
    boxSizing: "border-box",
    border: `1px solid ${t.line}`,
    background: t.surface,
    color: t.ink,
    borderRadius: 8,
    padding: "10px 11px",
    fontSize: 13,
    outline: "none",
  };
}

function linkButton(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return {
    all: "unset",
    cursor: "pointer",
    fontSize: 11.5,
    color: t.brand,
    textDecoration: "underline",
  };
}
