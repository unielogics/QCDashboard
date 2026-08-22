"use client";

// Manual workflow for starting a Messages thread:
//   1. Pick a client (search/list)
//   2a. If the client has loans, pick one to link the thread to
//   2b. If the client has none (or operator chooses), create a minimal loan
//       and let the per-loan-type doc checklist kick the AI doc-collection
//       workflow.
//   3. Activate the thread (returns the picked/created loan_id to the parent
//      so the messages page can select it).

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/design-system/Icon";
import { Btn, CellChip, Field, Input, Lbl, Note, Select, WarnLine } from "@/components/ds";
import { Drawer, DrawerSteps } from "@/components/ds/Drawer";
import { GoogleAddressInput, formatAddressParts } from "@/components/property/GoogleAddressInput";
import { useClients, useCreateLoan, useLoans } from "@/hooks/useApi";
import { LoanType, PropertyType } from "@/lib/enums.generated";
import type { AddressParts, Client, Loan } from "@/lib/types";

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
  const [newLoanAddress, setNewLoanAddress] = useState<AddressParts | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setStep("client");
      setSearch("");
      setPickedClient(null);
      setNewLoan({ type: LoanType.DSCR, address: "", amount: "", property_type: PropertyType.SFR });
      setNewLoanAddress(null);
      setErr(null);
    }
  }, [open]);

  // Escape-to-close, backdrop-to-close, body scroll lock and focus restore now
  // come from <Drawer>. The one affordance it does not carry is the search
  // box's autofocus: Drawer focuses its own panel in an effect, which lands
  // after React applies `autoFocus`, so the focus is re-taken here on the next
  // tick.
  useEffect(() => {
    if (!open || step !== "client") return;
    const id = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open, step]);

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

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="md"
      title={step === "client" ? "Pick a client" : pickedClient?.name ?? "Loan"}
      // Step two retitles to the client's name, which announces as a person
      // rather than as the dialog. Keep the stable name here.
      ariaLabel="New message"
      footer={
        step === "loan" ? (
          <>
            <Btn onClick={() => setStep("client")}>
              <Icon name="arrowL" size={13} /> Back
            </Btn>
            <span style={{ flex: 1 }} />
            <Btn
              variant="pri"
              onClick={submitNewLoan}
              disabled={createLoan.isPending || !newLoan.address.trim() || !newLoan.amount}
            >
              <Icon name="plus" size={13} stroke={2.4} />
              {createLoan.isPending ? "Creating…" : "Create loan + start thread"}
            </Btn>
          </>
        ) : undefined
      }
    >
      <DrawerSteps
        steps={["Pick a client", "Pick or create a loan"]}
        current={step === "client" ? 1 : 2}
      />

      {/* ── Step 1: Client picker ── */}
      {step === "client" && (
        <>
          <input
            ref={searchRef}
            className="field"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients by name or email…"
            autoFocus
            // `.field` has no width of its own; the picker's search box fills
            // the drawer body.
            style={{ width: "100%" }}
          />
          <div className="mt" style={{ maxHeight: 320, overflowY: "auto" }}>
            {filteredClients.length === 0 && (
              <div className="sub">
                No clients match. Create one from <strong>Clients → New</strong> first.
              </div>
            )}
            {filteredClients.map((c) => {
              const lc = loans.filter((l) => l.client_id === c.id).length;
              return (
                <button
                  key={c.id}
                  type="button"
                  className="pick btnreset"
                  onClick={() => {
                    setPickedClient(c);
                    setStep("loan");
                  }}
                >
                  <span
                    className="avatar"
                    style={c.avatar_color ? { background: c.avatar_color } : undefined}
                  >
                    {c.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                  </span>
                  <span className="grow">
                    <span className="trunc" style={{ display: "block", fontWeight: 700 }}>{c.name}</span>
                    <span className="sub trunc" style={{ display: "block" }}>{c.email ?? "—"}</span>
                  </span>
                  <CellChip tone="mut">{`${lc} ${lc === 1 ? "loan" : "loans"}`}</CellChip>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* ── Step 2: Pick existing loan or create new ── */}
      {step === "loan" && pickedClient && (
        <>
          <Lbl>Existing loans for {pickedClient.name}</Lbl>
          {clientLoans.length === 0 ? (
            <Note>
              No loans linked to this client yet. Create one below to start the doc-collection workflow.
            </Note>
          ) : (
            <div className="mt">
              {clientLoans.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className="pick btnreset"
                  onClick={() => {
                    onThreadReady(l.id);
                    onClose();
                  }}
                >
                  <CellChip tone="acc">{l.deal_id}</CellChip>
                  <span className="grow trunc" style={{ fontWeight: 700 }}>
                    {l.address}
                  </span>
                  <span className="sub">{l.type.replace("_", " ")}</span>
                </button>
              ))}
            </div>
          )}

          <Lbl className="mt">Or create a new loan</Lbl>
          <Field label="Loan type" className="mt">
            <Select
              value={newLoan.type}
              onChange={(e) => setNewLoan({ ...newLoan, type: e.target.value as LoanType })}
            >
              {LOAN_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </Field>
          <div className="mt">
            <GoogleAddressInput
              value={newLoanAddress}
              onChange={(next) => {
                setNewLoanAddress(next);
                setNewLoan((p) => ({ ...p, address: formatAddressParts(next) }));
              }}
              helperText="Search Google and select the property, or use manual entry if the address is not listed."
            />
          </div>
          <Field label="Loan amount ($)" className="mt">
            <Input
              type="number"
              step={1000}
              min={0}
              value={newLoan.amount}
              onChange={(e) => setNewLoan({ ...newLoan, amount: e.target.value })}
              placeholder="e.g. 450000"
            />
          </Field>

          <div className="sub mt">
            Once created, the &quot;Elara&quot; uses the per-loan-type checklist
            (Settings → Doc checklists) to start collecting required documents from{" "}
            {pickedClient.name}.
          </div>

          {err && <WarnLine className="mt">{err}</WarnLine>}
        </>
      )}
    </Drawer>
  );
}
