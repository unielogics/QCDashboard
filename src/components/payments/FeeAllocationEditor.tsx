"use client";

import { useEffect, useMemo, useState } from "react";
import { Btn, Callout, CellChip, Field, Input, cx } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { usePaymentSummary, useSaveFeeAllocation } from "@/hooks/usePayments";
import { paymentMoney, type FeeCollectionMode } from "@/lib/payments";

type Draft = {
  mode: FeeCollectionMode;
  originationClient: string;
  consultingClient: string;
  bank: string;
  external: string;
  deferred: string;
  waived: string;
};

const MODE_OPTIONS: Array<{ id: FeeCollectionMode; title: string; detail: string; icon: string }> = [
  { id: "client_ach", title: "Client ACH", detail: "Collect eligible fees after verified funding.", icon: "dollar" },
  { id: "bank_direct", title: "Funding source pays QC", detail: "Track and reconcile the closing payment.", icon: "building" },
  { id: "split", title: "Split payment", detail: "Allocate the fee across more than one source.", icon: "sliders" },
  { id: "waived", title: "Waived / no fee", detail: "Keep the original forecast and record the waiver.", icon: "x" },
];

function amount(value: string): number {
  const parsed = Number(value);
  return value.trim() && Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : 0;
}

function initialDraft(originationFee = 0, consultingFee = 0): Draft {
  return {
    mode: "client_ach",
    originationClient: String(Math.max(originationFee, 0) || ""),
    consultingClient: String(Math.max(consultingFee, 0) || ""),
    bank: "",
    external: "",
    deferred: "",
    waived: "",
  };
}

export function FeeAllocationEditor({
  profileId,
  originationFee,
  consultingFee,
  compact = false,
}: {
  profileId: string | null | undefined;
  originationFee: number;
  consultingFee: number;
  compact?: boolean;
}) {
  const grossFee = Math.round((Math.max(originationFee, 0) + Math.max(consultingFee, 0)) * 100) / 100;
  const summary = usePaymentSummary(profileId, Boolean(profileId));
  const save = useSaveFeeAllocation(profileId);
  const [draft, setDraft] = useState<Draft>(() => initialDraft(originationFee, consultingFee));
  const [notice, setNotice] = useState<string | null>(null);
  const allocation = summary.data?.allocation;

  useEffect(() => {
    if (!allocation) return;
    // Legacy allocation versions stored one aggregate client ACH amount.
    // Reconstruct a stable component split without changing that total.
    const aggregateClientAch = Math.max(allocation.client_ach_amount || 0, 0);
    const legacyOriginationAch = Math.min(aggregateClientAch, Math.max(originationFee, 0));
    const legacyConsultingAch = Math.min(Math.max(aggregateClientAch - legacyOriginationAch, 0), Math.max(consultingFee, 0));
    setDraft({
      mode: allocation.collection_mode,
      originationClient: String((allocation.origination_client_ach_amount ?? legacyOriginationAch) || ""),
      consultingClient: String((allocation.consulting_client_ach_amount ?? legacyConsultingAch) || ""),
      bank: String(allocation.bank_direct_amount || ""),
      external: String(allocation.external_amount || ""),
      deferred: String(allocation.deferred_amount || ""),
      waived: String(allocation.waived_amount || ""),
    });
  }, [allocation, consultingFee, originationFee]);

  const values = useMemo(() => {
    const originationClient = amount(draft.originationClient);
    const consultingClient = amount(draft.consultingClient);
    return {
      originationClient,
      consultingClient,
      client: Math.round((originationClient + consultingClient) * 100) / 100,
      bank: amount(draft.bank),
      external: amount(draft.external),
      deferred: amount(draft.deferred),
      waived: amount(draft.waived),
    };
  }, [draft]);
  const assigned = values.client + values.bank + values.external + values.deferred + values.waived;
  const difference = Math.round((grossFee - assigned) * 100) / 100;
  const balanced = Math.abs(difference) < 0.01;
  const componentAmountsValid = values.originationClient <= Math.max(originationFee, 0)
    && values.consultingClient <= Math.max(consultingFee, 0);
  const canEdit = Boolean(summary.data?.permissions.can_edit_allocation);
  const canWaive = Boolean(summary.data?.permissions.can_waive);
  const economicsSaved = !summary.data || Math.abs(summary.data.gross_expected_fee - grossFee) < 0.01;
  const canSave = Boolean(profileId && canEdit && grossFee >= 0 && balanced && componentAmountsValid && economicsSaved && !save.isPending && !summary.isError);

  function chooseMode(mode: FeeCollectionMode) {
    setNotice(null);
    if (mode === "waived" && !canWaive) return;
    const preservedWaiver = canWaive ? 0 : amount(draft.waived);
    const collectible = Math.max(0, Math.round((grossFee - preservedWaiver) * 100) / 100);
    const originationClient = Math.min(Math.max(originationFee, 0), collectible);
    const consultingClient = Math.min(Math.max(consultingFee, 0), Math.max(0, collectible - originationClient));
    if (mode === "client_ach") setDraft({ mode, originationClient: String(originationClient || ""), consultingClient: String(consultingClient || ""), bank: "", external: "", deferred: "", waived: String(preservedWaiver || "") });
    else if (mode === "bank_direct") setDraft({ mode, originationClient: "", consultingClient: "", bank: String(collectible || ""), external: "", deferred: "", waived: String(preservedWaiver || "") });
    else if (mode === "waived") setDraft({ mode, originationClient: "", consultingClient: "", bank: "", external: "", deferred: "", waived: String(grossFee || "") });
    else setDraft((current) => ({ ...current, mode }));
  }

  function clientPreset(component: "origination" | "consulting", preset: "all" | "portion" | "none") {
    const maximum = component === "origination" ? Math.max(originationFee, 0) : Math.max(consultingFee, 0);
    setDraft((current) => {
      const field = component === "origination" ? "originationClient" : "consultingClient";
      const currentAmount = amount(current[field]);
      const nextAmount = preset === "all"
        ? maximum
        : preset === "none"
          ? 0
          : (currentAmount > 0 && currentAmount < maximum ? currentAmount : Math.round(maximum * 50) / 100);
      const next = { ...current, [field]: String(nextAmount || "") };
      const nextClientTotal = amount(next.originationClient) + amount(next.consultingClient);
      const noOtherSource = amount(next.bank) + amount(next.external) + amount(next.deferred) + amount(next.waived) === 0;
      return { ...next, mode: Math.abs(nextClientTotal - grossFee) < 0.01 && noOtherSource ? "client_ach" : "split" as FeeCollectionMode };
    });
  }

  async function saveAllocation() {
    if (!canSave) return;
    setNotice(null);
    try {
      await save.mutateAsync({
        collection_mode: draft.mode,
        client_ach_amount: values.client,
        origination_client_ach_amount: values.originationClient,
        consulting_client_ach_amount: values.consultingClient,
        bank_direct_amount: values.bank,
        external_amount: values.external,
        deferred_amount: values.deferred,
        waived_amount: values.waived,
        expected_version: allocation?.version,
      });
      setNotice("Fee allocation saved. This does not move money or release an ACH debit.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The fee allocation could not be saved.");
    }
  }

  if (!profileId) {
    return <Callout tone="warn">Save the application profile before configuring how QC will receive its fees.</Callout>;
  }

  return (
    <section className={cx("payment-allocation", compact && "compact")} aria-labelledby={`payment-allocation-${profileId}`}>
      <div className="payment-section-heading">
        <div>
          <span className="lbl">Fee payment allocation</span>
          <h4 id={`payment-allocation-${profileId}`}>How will QC receive these fees?</h4>
          <p>Allocation is planning only. ACH requires client authorization, verified funding, and a separate staff release.</p>
        </div>
        <CellChip tone={balanced ? "ok" : "warn"}>{balanced ? "Fully allocated" : `${paymentMoney(Math.abs(difference))} ${difference > 0 ? "unallocated" : "overallocated"}`}</CellChip>
      </div>

      <div className="payment-fee-lines" aria-label="Expected fee components">
        <div><span>Origination fee</span><strong>{paymentMoney(originationFee)}</strong><small>Accepted amount × fee percentage</small></div>
        <div><span>Consulting fee</span><strong>{paymentMoney(consultingFee)}</strong><small>Requires its own earned basis before collection</small></div>
        <div className="total"><span>Gross expected fees</span><strong>{paymentMoney(grossFee)}</strong><small>Forecast only until prepared for collection</small></div>
      </div>

      <div className="payment-mode-grid" role="radiogroup" aria-label="Fee payment source">
        {MODE_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={draft.mode === option.id}
            className={draft.mode === option.id ? "on" : undefined}
            disabled={!canEdit || (option.id === "waived" && !canWaive)}
            onClick={() => chooseMode(option.id)}
          >
            <span className="payment-mode-icon"><Icon name={option.icon} size={17} /></span>
            <span><b>{option.title}</b><small>{option.detail}</small></span>
            <span className="payment-radio" aria-hidden="true" />
          </button>
        ))}
      </div>

      {(draft.mode === "client_ach" || draft.mode === "split") ? (
        <div className="payment-line-allocations" aria-label="Client ACH allocation by fee component">
          <ClientAchLine
            label="Origination fee"
            detail="Collected only after actual funding is verified"
            total={Math.max(originationFee, 0)}
            value={draft.originationClient}
            disabled={!canEdit}
            onChange={(originationClient) => setDraft((current) => ({ ...current, mode: "split", originationClient }))}
            onPreset={(preset) => clientPreset("origination", preset)}
          />
          <ClientAchLine
            label="Consulting fee"
            detail="Collected only after its separate earned milestone"
            total={Math.max(consultingFee, 0)}
            value={draft.consultingClient}
            disabled={!canEdit || consultingFee <= 0}
            onChange={(consultingClient) => setDraft((current) => ({ ...current, mode: "split", consultingClient }))}
            onPreset={(preset) => clientPreset("consulting", preset)}
          />
        </div>
      ) : null}

      <div className="payment-allocation-fields">
        <AllocationField label="Funding source / closing" value={draft.bank} onChange={(bank) => setDraft((current) => ({ ...current, bank }))} disabled={!canEdit || draft.mode === "client_ach" || draft.mode === "waived"} />
        <AllocationField label="External / manual" value={draft.external} onChange={(external) => setDraft((current) => ({ ...current, external }))} disabled={!canEdit || draft.mode !== "split"} />
        <AllocationField label="Deferred" value={draft.deferred} onChange={(deferred) => setDraft((current) => ({ ...current, deferred }))} disabled={!canEdit || draft.mode !== "split"} />
        <AllocationField label="Waived" value={draft.waived} onChange={(waived) => setDraft((current) => ({ ...current, waived }))} disabled={!canEdit || !canWaive || (draft.mode !== "split" && draft.mode !== "waived")} />
      </div>

      {!componentAmountsValid ? <Callout tone="bad"><b>Reduce the client ACH allocation.</b> A fee component cannot be collected for more than its calculated amount.</Callout> : null}
      {!balanced ? <Callout tone="warn"><b>Finish the allocation before saving.</b> Every dollar must be assigned; no remainder is collected automatically.</Callout> : null}
      {!economicsSaved ? <Callout tone="warn"><b>Save Deal economics first.</b> The accepted amount or fees on this form changed. Fee allocation stays locked to the last saved economics so an unsaved value can never become a collection obligation.</Callout> : null}
      {allocation && !allocation.is_current ? <Callout tone="warn"><b>The deal economics changed.</b> Review this allocation. An existing signed or active payment plan is never changed silently.</Callout> : null}
      {summary.isError ? <Callout tone="bad">Payments could not be loaded. Deal economics are still available, but allocation cannot be saved until the Payments service responds.</Callout> : null}
      {summary.data && !canEdit ? <Callout tone="mut">You can review the fee allocation for this assigned file. An authorized payments operator must make changes or release ACH.</Callout> : null}
      {summary.data && canEdit && !canWaive ? <Callout tone="mut">Existing waived dollars are read-only. Only a Super Admin can create or change a fee waiver.</Callout> : null}
      {notice ? <Callout tone={save.isError ? "bad" : "ok"}>{notice}</Callout> : null}

      <div className="payment-allocation-actions">
        <span>{allocation?.updated_at ? `Version ${allocation.version} · last saved ${new Date(allocation.updated_at).toLocaleString()}` : "No allocation saved yet"}</span>
        <Btn variant="pri" onClick={saveAllocation} disabled={!canSave}>{save.isPending ? "Saving…" : "Save fee allocation"}</Btn>
      </div>
    </section>
  );
}

function ClientAchLine({
  label,
  detail,
  total,
  value,
  disabled,
  onChange,
  onPreset,
}: {
  label: string;
  detail: string;
  total: number;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onPreset: (preset: "all" | "portion" | "none") => void;
}) {
  const numericValue = amount(value);
  const preset = total > 0 && Math.abs(numericValue - total) < 0.01
    ? "all"
    : numericValue > 0
      ? "portion"
      : "none";
  return (
    <section className={cx("payment-line-allocation", total <= 0 && "is-empty")}>
      <div className="payment-line-allocation-heading">
        <span><b>{label}</b><small>{detail}</small></span>
        <strong>{paymentMoney(total)}</strong>
      </div>
      <div className="payment-line-allocation-controls">
        <div className="payment-ach-presets" aria-label={`${label} client ACH selection`}>
          <div>
            <button type="button" disabled={disabled || total <= 0} className={preset === "all" ? "on" : undefined} onClick={() => onPreset("all")}>All</button>
            <button type="button" disabled={disabled || total <= 0} className={preset === "portion" ? "on" : undefined} onClick={() => onPreset("portion")}>Portion</button>
            <button type="button" disabled={disabled || total <= 0} className={preset === "none" ? "on" : undefined} onClick={() => onPreset("none")}>None</button>
          </div>
        </div>
        <AllocationField label="Client ACH amount" value={value} onChange={onChange} disabled={disabled || total <= 0} max={total} />
      </div>
    </section>
  );
}

function AllocationField({ label, value, onChange, disabled, max }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean; max?: number }) {
  return (
    <Field label={label}>
      <div className="field box file-economics-points">
        <span className="sub">$</span>
        <Input
          className="payment-amount-input"
          type="number"
          min="0"
          max={max}
          step="0.01"
          inputMode="decimal"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`${label} amount`}
          placeholder="0.00"
        />
      </div>
    </Field>
  );
}
