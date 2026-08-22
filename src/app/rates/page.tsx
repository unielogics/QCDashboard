"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  Btn,
  CG,
  CellChip,
  Input,
  PageHeader,
  Panel,
  Row,
  Select,
  Table,
  Tag,
  Td,
  Tr,
  cx,
  type ChipTone,
  type Col,
} from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { useCreateRate, useCurrentUser, useDeleteRate, useRates, useUpdateRate } from "@/hooks/useApi";
import { LoanTypeOptions, Role } from "@/lib/enums.generated";
import type { LoanType } from "@/lib/enums.generated";
import type { RateSKU, RateSKUInput } from "@/lib/types";
import { PageActionMenu } from "@/components/ds/PageActionMenu";
import { ConfirmDialog } from "@/components/design-system/ConfirmDialog";

const EMPTY_DRAFT: RateSKUInput = {
  id: "",
  label: "",
  loan_type: "dscr",
  rate: 7.5,
  points: 1,
  term: "30 yr",
  credit_tier: "Base",
  min_fico: 680,
  max_fico: null,
  min_loan_amount: 0,
  max_loan_amount: null,
  max_ltv: 0.75,
  delta_bps: 0,
};

export default function RatesPage() {
  const { data: rates = [], isLoading } = useRates();
  const { data: user } = useCurrentUser();
  const createRate = useCreateRate();
  const updateRate = useUpdateRate();
  const deleteRate = useDeleteRate();
  const [filter, setFilter] = useState<string>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RateSKU | null>(null);
  const [draft, setDraft] = useState<RateSKUInput>({ ...EMPTY_DRAFT });
  const [error, setError] = useState<string | null>(null);
  const [deleteReview, setDeleteReview] = useState<RateSKU | null>(null);

  const canManage = user?.role === Role.SUPER_ADMIN;
  const filtered = useMemo(
    () => (filter === "all" ? rates : rates.filter((r) => r.loan_type === filter)),
    [filter, rates],
  );

  // A negative move is a rate improvement, so it reads as the good tone. Was a
  // computed colour (t.profit / t.danger / t.ink3); the chip tones carry the
  // same three-way split on the stylesheet.
  const deltaTone = (bps: number): ChipTone => (bps < 0 ? "ok" : bps > 0 ? "bad" : "mut");
  const deltaLabel = (bps: number) => `${bps > 0 ? "+" : ""}${bps} bps`;

  const cols: Col[] = [
    { label: "SKU" },
    { label: "Loan amount" },
    { label: "Credit tier" },
    { label: "Type" },
    { label: "Rate", align: "r" },
    { label: "Points", align: "r" },
    { label: "Min FICO", align: "r" },
    { label: "Max LTV", align: "r" },
    { label: "Δ vs y'day", align: "r" },
    ...(canManage ? ([{ label: "Actions", align: "r" }] as Col[]) : []),
  ];

  function openCreate() {
    setError(null);
    setEditing(null);
    setDraft({ ...EMPTY_DRAFT });
    setModalOpen(true);
  }

  function openEdit(rate: RateSKU) {
    setError(null);
    setEditing(rate);
    setDraft({
      id: rate.id,
      label: rate.label,
      loan_type: rate.loan_type,
      rate: rate.rate,
      points: rate.points,
      term: rate.term,
      credit_tier: rate.credit_tier,
      min_fico: rate.min_fico,
      max_fico: rate.max_fico,
      min_loan_amount: rate.min_loan_amount,
      max_loan_amount: rate.max_loan_amount,
      max_ltv: rate.max_ltv,
      delta_bps: rate.delta_bps,
    });
    setModalOpen(true);
  }

  function closeModal() {
    if (createRate.isPending || updateRate.isPending) return;
    setEditing(null);
    setDraft({ ...EMPTY_DRAFT });
    setError(null);
    setModalOpen(false);
  }

  async function saveDraft() {
    setError(null);
    if (!draft.id.trim() || !draft.label.trim()) {
      setError("SKU and label are required.");
      return;
    }
    if (draft.max_ltv <= 0 || draft.max_ltv > 1) {
      setError("Max LTV must be between 1% and 100%.");
      return;
    }
    if (draft.max_fico !== null && draft.max_fico < draft.min_fico) {
      setError("Max FICO must be greater than or equal to Min FICO.");
      return;
    }
    if (draft.max_loan_amount !== null && draft.max_loan_amount < draft.min_loan_amount) {
      setError("Max loan amount must be greater than or equal to Min loan amount.");
      return;
    }
    try {
      if (editing) {
        const { id: _id, ...patch } = draft;
        await updateRate.mutateAsync({ id: editing.id, patch });
      } else {
        await createRate.mutateAsync({ ...draft, id: draft.id.trim().toUpperCase() });
      }
      setEditing(null);
      setDraft({ ...EMPTY_DRAFT });
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save rate SKU.");
    }
  }

  async function removeRate(rate: RateSKU) {
    setError(null);
    try {
      await deleteRate.mutateAsync(rate.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete rate SKU.");
    }
  }

  return (
    <div className="grid">
      <PageHeader
        title="Rate sheet"
        lede={`${filtered.length} SKUs`}
        actions={
          <>
            {canManage && (
              <Btn variant="pri" onClick={openCreate}>
                + Add SKU
              </Btn>
            )}
            <PageActionMenu items={[{ label: "Market rates", href: "/market-rates" }, { label: "Reports", href: "/reports" }]} />
          </>
        }
      />

      <Row>
        <Select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by loan type">
          <option value="all">All loan types</option>
          {LoanTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </Row>

      {error && <ErrorLine>{error}</ErrorLine>}

      <Panel noPad>
        <Table cols={cols} caption="Published rate SKUs">
          {filtered.map((r) => (
            <Tr key={r.id}>
              <Td>
                <b>{r.label}</b>
                {/* `.sub` owns size and colour; only the mono face is inline —
                    the stylesheet has no monospace utility. */}
                <div className="sub" style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>
                  {r.id}
                </div>
              </Td>
              <Td>{amountBand(r)}</Td>
              <Td>
                <b>{r.credit_tier}</b>
                <div className="sub">{ficoBand(r)}</div>
              </Td>
              <Td>
                <Tag>{r.loan_type.replace(/_/g, " ")}</Tag>
              </Td>
              <Td align="r" className="num">
                <b>{r.rate.toFixed(3)}%</b>
              </Td>
              <Td align="r" className="num">
                {r.points.toFixed(2)}
              </Td>
              <Td align="r" className="num">
                {r.min_fico}
              </Td>
              <Td align="r" className="num">
                {(r.max_ltv * 100).toFixed(0)}%
              </Td>
              <Td align="r">
                <CellChip tone={deltaTone(r.delta_bps)} className="num">
                  {deltaLabel(r.delta_bps)}
                </CellChip>
              </Td>
              {canManage && (
                <Td align="r">
                  <span style={{ display: "inline-flex", gap: 8 }}>
                    <Btn size="sm" onClick={() => openEdit(r)}>
                      Edit
                    </Btn>
                    {/* `.c-bad` carries the danger tint; there is no danger
                        button variant on the stylesheet to reach for. */}
                    <Btn size="sm" className="c-bad" onClick={() => setDeleteReview(r)} disabled={deleteRate.isPending}>
                      Delete
                    </Btn>
                  </span>
                </Td>
              )}
            </Tr>
          ))}
          {!isLoading && filtered.length === 0 && (
            <Tr>
              <Td colSpan={cols.length}>
                <span className="sub">No rates match this filter.</span>
              </Td>
            </Tr>
          )}
          {isLoading && (
            <Tr>
              <Td colSpan={cols.length}>
                <span className="sub">Loading rate sheet...</span>
              </Td>
            </Tr>
          )}
        </Table>
      </Panel>

      <ConfirmDialog
        open={deleteReview != null}
        onClose={() => setDeleteReview(null)}
        title={`Delete ${deleteReview?.label ?? "rate SKU"}`}
        body="This removes the SKU from the published rate sheet immediately."
        confirmLabel="Delete SKU"
        tone="danger"
        busy={deleteRate.isPending}
        onConfirm={() => {
          if (!deleteReview) return;
          void removeRate(deleteReview).then(() => setDeleteReview(null));
        }}
      />

      <Panel title="How rates update">
        <div className="sub">
          Daily rate-sheet pull at 7:00 AM ET. Auto-publish triggers on swings under 25 bps; larger moves pause for
          super-admin review (configurable in Settings - Pricing).
        </div>
      </Panel>

      <RateDrawer
        open={modalOpen}
        draft={draft}
        editing={editing}
        saving={createRate.isPending || updateRate.isPending}
        error={error}
        onClose={closeModal}
        onSave={saveDraft}
        onChange={setDraft}
      />
    </div>
  );
}

function amountBand(rate: RateSKU): string {
  const min = rate.min_loan_amount || 0;
  const max = rate.max_loan_amount;
  if (!min && !max) return "All amounts";
  if (min && max) return `${moneyShort(min)} - ${moneyShort(max)}`;
  if (min) return `${moneyShort(min)}+`;
  return `Up to ${moneyShort(max ?? 0)}`;
}

function ficoBand(rate: RateSKU): string {
  if (rate.max_fico) return `${rate.min_fico}-${rate.max_fico} FICO`;
  return `${rate.min_fico}+ FICO`;
}

function moneyShort(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(value % 1_000 === 0 ? 0 : 1)}k`;
  return `$${value.toLocaleString("en-US")}`;
}

/**
 * Danger banner. `.c-bad` owns the tint and the text colour; the inline values
 * are box geometry only, because the stylesheet carries no danger-toned block
 * (`.note` is petrol, `.warnline` is amber) and shared files are off-limits.
 */
function ErrorLine({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx("c-bad", className)}
      style={{ borderRadius: 10, padding: "9px 12px", fontSize: 12.5, fontWeight: 650 }}
      role="alert"
    >
      {children}
    </div>
  );
}

function RateDrawer({
  open,
  draft,
  editing,
  saving,
  error,
  onClose,
  onSave,
  onChange,
}: {
  open: boolean;
  draft: RateSKUInput;
  editing: RateSKU | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: () => void;
  onChange: (draft: RateSKUInput) => void;
}) {
  const set = <K extends keyof RateSKUInput>(key: K, value: RateSKUInput[K]) => {
    onChange({ ...draft, [key]: value });
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={editing ? "Edit rate SKU" : "Create rate SKU"}
      sub="Published pricing visible to eligible rate-sheet viewers."
      // The modal this replaces ignored backdrop clicks. Kept off so a stray
      // click cannot discard a half-typed SKU.
      closeOnBackdrop={false}
      footer={
        <>
          <span style={{ flex: 1 }} />
          <Btn onClick={onClose} disabled={saving}>
            Cancel
          </Btn>
          <Btn variant="pri" onClick={onSave} disabled={saving}>
            {saving ? "Saving..." : editing ? "Save changes" : "Create SKU"}
          </Btn>
        </>
      }
    >
      {/* Two equal form columns — 6 + 6 of the 12-col grid. */}
      <CG>
        <FormField label="SKU">
          <Input value={draft.id} disabled={!!editing} onChange={(e) => set("id", e.target.value)} placeholder="R-DSCR-30Y-75" />
        </FormField>
        <FormField label="Loan type">
          <Select value={draft.loan_type} onChange={(e) => set("loan_type", e.target.value as LoanType)}>
            {LoanTypeOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Label">
          <Input value={draft.label} onChange={(e) => set("label", e.target.value)} placeholder="DSCR 30Y - 75 LTV" />
        </FormField>
        <FormField label="Term">
          <Input value={draft.term} onChange={(e) => set("term", e.target.value)} placeholder="30 yr" />
        </FormField>
        <FormField label="Credit tier">
          <Input value={draft.credit_tier} onChange={(e) => set("credit_tier", e.target.value)} placeholder="680-719" />
        </FormField>
        <FormField label="Rate %">
          <Input type="number" step="0.001" value={draft.rate} onChange={(e) => set("rate", Number(e.target.value))} />
        </FormField>
        <FormField label="Points">
          <Input type="number" step="0.01" value={draft.points} onChange={(e) => set("points", Number(e.target.value))} />
        </FormField>
        <FormField label="Min FICO">
          <Input type="number" step="1" value={draft.min_fico} onChange={(e) => set("min_fico", Number(e.target.value))} />
        </FormField>
        <FormField label="Max FICO optional">
          <Input
            type="number"
            step="1"
            value={draft.max_fico ?? ""}
            onChange={(e) => set("max_fico", e.target.value ? Number(e.target.value) : null)}
            placeholder="No cap"
          />
        </FormField>
        <FormField label="Min loan amount">
          <Input
            type="number"
            step="1000"
            value={draft.min_loan_amount}
            onChange={(e) => set("min_loan_amount", Number(e.target.value))}
          />
        </FormField>
        <FormField label="Max loan amount optional">
          <Input
            type="number"
            step="1000"
            value={draft.max_loan_amount ?? ""}
            onChange={(e) => set("max_loan_amount", e.target.value ? Number(e.target.value) : null)}
            placeholder="No cap"
          />
        </FormField>
        <FormField label="Max LTV %">
          <Input
            type="number"
            step="1"
            value={Math.round(draft.max_ltv * 100)}
            onChange={(e) => set("max_ltv", Number(e.target.value) / 100)}
          />
        </FormField>
        <FormField label="Delta bps">
          <Input type="number" step="1" value={draft.delta_bps} onChange={(e) => set("delta_bps", Number(e.target.value))} />
        </FormField>
      </CG>

      {error && <ErrorLine className="mt">{error}</ErrorLine>}
    </Drawer>
  );
}

/**
 * Stays a `<label>` rather than the shared `ds/Field` div: the implicit
 * label-for-control association is what lets a click on "Max FICO optional"
 * focus the input, and that is an affordance, not styling.
 */
function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="s6" style={{ display: "grid", gap: 5, minWidth: 0 }}>
      <span className="lbl">{label}</span>
      {children}
    </label>
  );
}
