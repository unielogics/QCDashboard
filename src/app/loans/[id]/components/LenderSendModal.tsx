"use client";

// Modal for "Send package to lender". Triggered from the connected
// lender card. Operator picks documents (multi-select), picks
// delivery mode (Links vs ZIP), and clicks Draft. The backend
// generates an EmailDraft in the existing pending-broker-review
// queue — no email actually sends until a broker approves it.

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useDocuments, useDraftLenderSend } from "@/hooks/useApi";
import type { Document, Lender, Loan } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  loan: Loan;
  lender: Lender;
}

const SENDABLE_STATUSES = new Set(["received", "verified", "approved"]);

export function LenderSendModal({ open, onClose, loan, lender }: Props) {
  const { t } = useTheme();
  const { data: docs = [], isLoading } = useDocuments(loan.id);
  const draft = useDraftLenderSend();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [delivery, setDelivery] = useState<"links" | "zip">("links");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setDelivery("links");
      setError(null);
      setSuccess(null);
    }
  }, [open]);

  const sendable = useMemo<Document[]>(
    () => docs.filter((d) => SENDABLE_STATUSES.has(d.status)),
    [docs],
  );
  const requested = useMemo<Document[]>(
    () => docs.filter((d) => !SENDABLE_STATUSES.has(d.status)),
    [docs],
  );

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const selectAll = () => setSelected(new Set(sendable.map((d) => d.id)));
  const clearAll = () => setSelected(new Set());

  const submit = async () => {
    setError(null);
    setSuccess(null);
    if (selected.size === 0) {
      setError("Pick at least one document.");
      return;
    }
    try {
      const res = await draft.mutateAsync({
        loanId: loan.id,
        payload: { document_ids: Array.from(selected), delivery },
      });
      setSuccess(
        `Draft created for review — ${res.document_count} file(s) packaged via ${res.delivery}. ` +
          `Subject: ${res.subject}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Draft failed.");
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Send package to lender"
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
          width: "min(680px, 95vw)",
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
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.6, textTransform: "uppercase", color: t.petrol }}>
              Send to lender
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: t.ink, marginTop: 2 }}>
              {lender.name}
            </div>
            <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 2 }}>
              → {lender.submission_email ?? lender.contact_email ?? "(no email on file)"}
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
              Delivery mode
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <DeliveryButton t={t} active={delivery === "links"} onClick={() => setDelivery("links")} label="Individual links" hint="One presigned link per file (24h)" />
              <DeliveryButton t={t} active={delivery === "zip"} onClick={() => setDelivery("zip")} label="Single ZIP archive" hint="One link to a packaged archive (7d)" />
            </div>
          </div>

          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                  color: t.ink3,
                }}
              >
                Documents to send · {selected.size} selected
              </label>
              {sendable.length > 0 ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={selectAll}
                    style={{ all: "unset", cursor: "pointer", fontSize: 11.5, color: t.brand, textDecoration: "underline" }}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={clearAll}
                    style={{ all: "unset", cursor: "pointer", fontSize: 11.5, color: t.ink3, textDecoration: "underline" }}
                  >
                    Clear
                  </button>
                </div>
              ) : null}
            </div>
            {isLoading ? (
              <div style={{ fontSize: 12.5, color: t.ink3 }}>Loading documents…</div>
            ) : sendable.length === 0 ? (
              <div style={{ fontSize: 12.5, color: t.ink3, lineHeight: 1.5 }}>
                No received / verified documents on this loan. Mark some docs received first.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {sendable.map((d) => {
                  const isOn = selected.has(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => toggle(d.id)}
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: `1px solid ${isOn ? t.petrol : t.line}`,
                        background: isOn ? t.brandSoft : "transparent",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <div
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: 4,
                          border: `1.5px solid ${isOn ? t.petrol : t.line}`,
                          background: isOn ? t.petrol : "transparent",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flex: "0 0 auto",
                        }}
                      >
                        {isOn ? <Icon name="check" size={11} color="#fff" stroke={3} /> : null}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {d.name}
                        </div>
                        <div style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>
                          {d.status}
                          {d.received_on ? ` · received ${d.received_on}` : ""}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {requested.length > 0 ? (
              <div style={{ marginTop: 12, fontSize: 11.5, color: t.ink3, lineHeight: 1.5 }}>
                {requested.length} doc(s) still pending or requested — those won&apos;t be included.
              </div>
            ) : null}
          </div>

          {error ? <Pill bg={t.dangerBg} color={t.danger}>{error}</Pill> : null}
          {success ? <Pill bg={t.profitBg} color={t.profit}>{success}</Pill> : null}
        </div>

        {/* Footer */}
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
              disabled={draft.isPending || selected.size === 0}
              style={{
                all: "unset",
                cursor: draft.isPending ? "wait" : selected.size === 0 ? "not-allowed" : "pointer",
                padding: "10px 18px",
                borderRadius: 10,
                background: selected.size === 0 ? t.chip : t.petrol,
                color: selected.size === 0 ? t.ink4 : "#fff",
                fontSize: 13,
                fontWeight: 700,
                opacity: draft.isPending ? 0.6 : 1,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {draft.isPending ? "Drafting…" : (
                <>
                  <Icon name="external" size={12} stroke={3} /> Draft email
                </>
              )}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DeliveryButton({
  t,
  active,
  onClick,
  label,
  hint,
}: {
  t: ReturnType<typeof useTheme>["t"];
  active: boolean;
  onClick: () => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        all: "unset",
        cursor: "pointer",
        flex: 1,
        padding: 12,
        borderRadius: 12,
        border: `1px solid ${active ? t.petrol : t.line}`,
        background: active ? t.brandSoft : "transparent",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: active ? t.brand : t.ink }}>
        {label}
      </div>
      <div style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>{hint}</div>
    </button>
  );
}
