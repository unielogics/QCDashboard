"use client";

// Manual workflow for starting a Messages thread:
//   1. Pick a client (search/list)
//   2a. If the client has loans, pick one to link the thread to
//   2b. If the client has none (or operator chooses), create a minimal loan
//       and let the per-loan-type doc checklist kick the AI doc-collection
//       workflow.
//   3. Activate the thread (returns the picked/created loan_id to the parent
//      so the messages page can select it).

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { useClients, useCreateLoan, useLoans } from "@/hooks/useApi";
import { LoanType, PropertyType } from "@/lib/enums.generated";
import type { Client, Loan } from "@/lib/types";

const LOAN_TYPE_OPTIONS: { value: LoanType; label: string }[] = [
  { value: LoanType.DSCR, label: "DSCR Rental (30-yr)" },
  { value: LoanType.FIX_AND_FLIP, label: "Fix & Flip (12-mo)" },
  { value: LoanType.GROUND_UP, label: "Ground Up Construction (18-mo)" },
  { value: LoanType.BRIDGE, label: "Bridge (24-mo)" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onThreadReady: (loanId: string) => void;
}

type Step = "client" | "loan" | "create-loan";

export function NewThreadDialog({ open, onClose, onThreadReady }: Props) {
  const { t } = useTheme();
  const { data: clients = [] } = useClients();
  const { data: loans = [] } = useLoans();
  const createLoan = useCreateLoan();

  const [step, setStep] = useState<Step>("client");
  const [search, setSearch] = useState("");
  const [pickedClient, setPickedClient] = useState<Client | null>(null);
  const [newLoan, setNewLoan] = useState({
    type: LoanType.DSCR as LoanType,
    address: "",
    amount: "",
    property_type: PropertyType.SFR as PropertyType,
  });
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep("client");
      setSearch("");
      setPickedClient(null);
      setNewLoan({ type: LoanType.DSCR, address: "", amount: "", property_type: PropertyType.SFR });
      setErr(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => c.name.toLowerCase().includes(q) || (c.email ?? "").toLowerCase().includes(q));
  }, [clients, search]);

  const clientLoans: Loan[] = useMemo(
    () => (pickedClient ? loans.filter((l) => l.client_id === pickedClient.id) : []),
    [loans, pickedClient],
  );

  const submitNewLoan = async () => {
    if (!pickedClient) return;
    setErr(null);
    const amount = Number(newLoan.amount);
    if (!newLoan.address.trim() || !Number.isFinite(amount) || amount <= 0) {
      setErr("Address and a positive loan amount are required.");
      return;
    }
    try {
      const loan = await createLoan.mutateAsync({
        client_id: pickedClient.id,
        address: newLoan.address.trim(),
        type: newLoan.type,
        amount,
        property_type: newLoan.property_type,
      });
      onThreadReady(loan.id);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create loan");
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Start new thread"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(6, 7, 11, 0.55)",
        backdropFilter: "blur(2px)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 560,
          maxHeight: "92vh",
          overflowY: "auto",
          background: t.surface,
          borderRadius: 16,
          boxShadow: t.shadowLg,
          border: `1px solid ${t.line}`,
        }}
      >
        <div
          style={{
            padding: "14px 18px",
            borderBottom: `1px solid ${t.line}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
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
              {step === "client" ? "Step 1 of 2" : "Step 2 of 2"}
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: t.ink, marginTop: 2 }}>
              {step === "client" ? "Pick a client" : pickedClient?.name ?? "Loan"}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              all: "unset",
              cursor: "pointer",
              width: 30,
              height: 30,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 7,
              color: t.ink2,
            }}
          >
            <Icon name="x" size={15} />
          </button>
        </div>

        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
          {/* ── Step 1: Client picker ── */}
          {step === "client" && (
            <>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search clients by name or email…"
                autoFocus
                style={inputStyle(t)}
              />
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  maxHeight: 320,
                  overflowY: "auto",
                }}
              >
                {filteredClients.length === 0 && (
                  <div style={{ fontSize: 12.5, color: t.ink3, padding: 12 }}>
                    No clients match. Create one from <strong>Clients → New</strong> first.
                  </div>
                )}
                {filteredClients.map((c) => {
                  const lc = loans.filter((l) => l.client_id === c.id).length;
                  return (
                    <button
                      key={c.id}
                      onClick={() => {
                        setPickedClient(c);
                        setStep("loan");
                      }}
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 12px",
                        borderRadius: 9,
                        background: t.surface2,
                        border: `1px solid ${t.line}`,
                      }}
                    >
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 999,
                          background: c.avatar_color ?? t.petrol,
                          color: "#fff",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 12,
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        {c.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: t.ink3 }}>{c.email ?? "—"}</div>
                      </div>
                      <Pill>{lc} {lc === 1 ? "loan" : "loans"}</Pill>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* ── Step 2: Pick existing loan or create new ── */}
          {step === "loan" && pickedClient && (
            <>
              <SectionLabel>Existing loans for {pickedClient.name}</SectionLabel>
              {clientLoans.length === 0 ? (
                <div
                  style={{
                    fontSize: 12.5,
                    color: t.ink3,
                    padding: 12,
                    background: t.surface2,
                    borderRadius: 9,
                    border: `1px solid ${t.line}`,
                  }}
                >
                  No loans linked to this client yet. Create one below to start the doc-collection workflow.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {clientLoans.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => {
                        onThreadReady(l.id);
                        onClose();
                      }}
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 12px",
                        borderRadius: 9,
                        background: t.surface2,
                        border: `1px solid ${t.line}`,
                      }}
                    >
                      <Pill>{l.deal_id}</Pill>
                      <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: t.ink }}>
                        {l.address}
                      </div>
                      <span style={{ fontSize: 11, color: t.ink3 }}>{l.type.replace("_", " ")}</span>
                    </button>
                  ))}
                </div>
              )}

              <div style={{ height: 4 }} />
              <SectionLabel>Or create a new loan</SectionLabel>
              <Field t={t} label="Loan type">
                <select
                  value={newLoan.type}
                  onChange={(e) => setNewLoan({ ...newLoan, type: e.target.value as LoanType })}
                  style={inputStyle(t)}
                >
                  {LOAN_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
              <Field t={t} label="Property address">
                <input
                  value={newLoan.address}
                  onChange={(e) => setNewLoan({ ...newLoan, address: e.target.value })}
                  placeholder="123 Main St, Charlotte NC"
                  style={inputStyle(t)}
                />
              </Field>
              <Field t={t} label="Loan amount ($)">
                <input
                  type="number"
                  step={1000}
                  min={0}
                  value={newLoan.amount}
                  onChange={(e) => setNewLoan({ ...newLoan, amount: e.target.value })}
                  placeholder="e.g. 450000"
                  style={inputStyle(t)}
                />
              </Field>

              <div style={{ fontSize: 11, color: t.ink3, lineHeight: 1.5 }}>
                Once created, &quot;The Associate&quot; uses the per-loan-type checklist
                (Settings → Doc checklists) to start collecting required documents from{" "}
                {pickedClient.name}.
              </div>

              {err && <Pill bg={t.dangerBg} color={t.danger}>{err}</Pill>}
            </>
          )}
        </div>

        <div
          style={{
            padding: "12px 18px",
            borderTop: `1px solid ${t.line}`,
            display: "flex",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          {step === "loan" ? (
            <button onClick={() => setStep("client")} style={qcBtn(t)}>
              <Icon name="arrowL" size={13} /> Back
            </button>
          ) : (
            <span />
          )}
          {step === "loan" && (
            <button
              onClick={submitNewLoan}
              disabled={createLoan.isPending || !newLoan.address.trim() || !newLoan.amount}
              style={qcBtnPrimary(t)}
            >
              <Icon name="plus" size={13} stroke={2.4} />
              {createLoan.isPending ? "Creating…" : "Create loan + start thread"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ t, label, children }: { t: ReturnType<typeof useTheme>["t"]; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.0, textTransform: "uppercase", marginBottom: 6 }}>
        {label}
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
    background: t.surface2,
    border: `1px solid ${t.line}`,
    color: t.ink,
    fontSize: 13,
    fontFamily: "inherit",
    outline: "none",
  };
}
