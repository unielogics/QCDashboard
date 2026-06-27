"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { useCreateRate, useCurrentUser, useDeleteRate, useRates, useUpdateRate } from "@/hooks/useApi";
import { LoanTypeOptions, Role } from "@/lib/enums.generated";
import type { LoanType } from "@/lib/enums.generated";
import type { RateSKU, RateSKUInput } from "@/lib/types";

const EMPTY_DRAFT: RateSKUInput = {
  id: "",
  label: "",
  loan_type: "dscr",
  rate: 7.5,
  points: 1,
  term: "30 yr",
  min_fico: 680,
  max_ltv: 0.75,
  delta_bps: 0,
};

export default function RatesPage() {
  const { t } = useTheme();
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

  const canManage = user?.role === Role.SUPER_ADMIN;
  const filtered = useMemo(
    () => (filter === "all" ? rates : rates.filter((r) => r.loan_type === filter)),
    [filter, rates],
  );

  const deltaColor = (bps: number) => bps < 0 ? t.profit : bps > 0 ? t.danger : t.ink3;
  const deltaLabel = (bps: number) => `${bps > 0 ? "+" : ""}${bps} bps`;
  const gridColumns = canManage
    ? "minmax(0, 2fr) 110px 80px 90px 90px 90px 90px 118px"
    : "minmax(0, 2fr) 110px 80px 90px 90px 90px 90px";

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
      min_fico: rate.min_fico,
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
    if (!window.confirm(`Delete ${rate.label}? This removes it from the published rate sheet.`)) return;
    setError(null);
    try {
      await deleteRate.mutateAsync(rate.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete rate SKU.");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: t.ink, margin: 0 }}>Rate sheet</h1>
        <Pill>{filtered.length} SKUs</Pill>
        <div style={{ flex: 1 }} />
        {canManage && (
          <button type="button" onClick={openCreate} style={primaryBtn(t)}>
            + Add SKU
          </button>
        )}
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{
            padding: "8px 10px", borderRadius: 8, background: t.surface, border: `1px solid ${t.line}`,
            fontSize: 12.5, color: t.ink2, fontFamily: "inherit",
          }}
        >
          <option value="all">All loan types</option>
          {LoanTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {error && (
        <div style={{ padding: "10px 12px", borderRadius: 10, background: t.dangerBg, color: t.danger, fontSize: 13, fontWeight: 700 }}>
          {error}
        </div>
      )}

      <Card pad={0}>
        <div style={{
          display: "grid",
          gridTemplateColumns: gridColumns,
          padding: "12px 16px", fontSize: 11, fontWeight: 700, color: t.ink3,
          textTransform: "uppercase", letterSpacing: 1.2, borderBottom: `1px solid ${t.line}`,
        }}>
          <div>SKU</div>
          <div>Type</div>
          <div style={{ textAlign: "right" }}>Rate</div>
          <div style={{ textAlign: "right" }}>Points</div>
          <div style={{ textAlign: "right" }}>Min FICO</div>
          <div style={{ textAlign: "right" }}>Max LTV</div>
          <div style={{ textAlign: "right" }}>Δ vs y&apos;day</div>
          {canManage && <div style={{ textAlign: "right" }}>Actions</div>}
        </div>
        {filtered.map((r) => (
          <div key={r.id} style={{
            display: "grid",
            gridTemplateColumns: gridColumns,
            padding: "12px 16px", borderBottom: `1px solid ${t.line}`, alignItems: "center",
            fontSize: 13, color: t.ink,
          }}>
            <div>
              <div style={{ fontWeight: 700 }}>{r.label}</div>
              <div style={{ fontSize: 11, color: t.ink3, fontFamily: "ui-monospace, SF Mono, monospace" }}>{r.id}</div>
            </div>
            <div><Pill>{r.loan_type.replace(/_/g, " ")}</Pill></div>
            <div style={{ textAlign: "right", fontWeight: 800, fontFeatureSettings: '"tnum"' }}>{r.rate.toFixed(3)}%</div>
            <div style={{ textAlign: "right", fontFeatureSettings: '"tnum"' }}>{r.points.toFixed(2)}</div>
            <div style={{ textAlign: "right", fontFeatureSettings: '"tnum"' }}>{r.min_fico}</div>
            <div style={{ textAlign: "right", fontFeatureSettings: '"tnum"' }}>{(r.max_ltv * 100).toFixed(0)}%</div>
            <div style={{ textAlign: "right", fontFeatureSettings: '"tnum"', color: deltaColor(r.delta_bps), fontWeight: 700 }}>
              {deltaLabel(r.delta_bps)}
            </div>
            {canManage && (
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button type="button" onClick={() => openEdit(r)} style={ghostBtn(t)}>Edit</button>
                <button type="button" onClick={() => removeRate(r)} style={dangerBtn(t)} disabled={deleteRate.isPending}>Delete</button>
              </div>
            )}
          </div>
        ))}
        {!isLoading && filtered.length === 0 && (
          <div style={{ padding: 24, fontSize: 13, color: t.ink3 }}>No rates match this filter.</div>
        )}
        {isLoading && (
          <div style={{ padding: 24, fontSize: 13, color: t.ink3 }}>Loading rate sheet...</div>
        )}
      </Card>

      <Card pad={16}>
        <SectionLabel>How rates update</SectionLabel>
        <div style={{ fontSize: 12.5, color: t.ink2, lineHeight: 1.6 }}>
          Daily rate-sheet pull at 7:00 AM ET. Auto-publish triggers on swings under 25 bps; larger moves pause for super-admin review (configurable in Settings - Pricing).
        </div>
      </Card>

      {modalOpen && (
        <RateModal
          draft={draft}
          editing={editing}
          saving={createRate.isPending || updateRate.isPending}
          error={error}
          onClose={closeModal}
          onSave={saveDraft}
          onChange={setDraft}
        />
      )}
    </div>
  );
}

function RateModal({
  draft,
  editing,
  saving,
  error,
  onClose,
  onSave,
  onChange,
}: {
  draft: RateSKUInput;
  editing: RateSKU | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: () => void;
  onChange: (draft: RateSKUInput) => void;
}) {
  const { t } = useTheme();
  const set = <K extends keyof RateSKUInput>(key: K, value: RateSKUInput[K]) => {
    onChange({ ...draft, [key]: value });
  };

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 60,
      display: "grid",
      placeItems: "center",
      padding: 24,
      background: "rgba(0,0,0,0.45)",
    }}>
      <div style={{
        width: "min(720px, 100%)",
        background: t.elevated,
        border: `1px solid ${t.lineStrong}`,
        borderRadius: 14,
        boxShadow: t.shadowLg,
        padding: 18,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ color: t.ink, fontSize: 18, fontWeight: 800 }}>{editing ? "Edit rate SKU" : "Create rate SKU"}</div>
            <div style={{ color: t.ink3, fontSize: 12.5 }}>Published pricing visible to eligible rate-sheet viewers.</div>
          </div>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={onClose} style={ghostBtn(t)} disabled={saving}>Close</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="SKU">
            <input value={draft.id} disabled={!!editing} onChange={(e) => set("id", e.target.value)} style={inputStyle(t)} placeholder="R-DSCR-30Y-75" />
          </Field>
          <Field label="Loan type">
            <select value={draft.loan_type} onChange={(e) => set("loan_type", e.target.value as LoanType)} style={inputStyle(t)}>
              {LoanTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Label">
            <input value={draft.label} onChange={(e) => set("label", e.target.value)} style={inputStyle(t)} placeholder="DSCR 30Y - 75 LTV" />
          </Field>
          <Field label="Term">
            <input value={draft.term} onChange={(e) => set("term", e.target.value)} style={inputStyle(t)} placeholder="30 yr" />
          </Field>
          <Field label="Rate %">
            <input type="number" step="0.001" value={draft.rate} onChange={(e) => set("rate", Number(e.target.value))} style={inputStyle(t)} />
          </Field>
          <Field label="Points">
            <input type="number" step="0.01" value={draft.points} onChange={(e) => set("points", Number(e.target.value))} style={inputStyle(t)} />
          </Field>
          <Field label="Min FICO">
            <input type="number" step="1" value={draft.min_fico} onChange={(e) => set("min_fico", Number(e.target.value))} style={inputStyle(t)} />
          </Field>
          <Field label="Max LTV %">
            <input type="number" step="1" value={Math.round(draft.max_ltv * 100)} onChange={(e) => set("max_ltv", Number(e.target.value) / 100)} style={inputStyle(t)} />
          </Field>
          <Field label="Delta bps">
            <input type="number" step="1" value={draft.delta_bps} onChange={(e) => set("delta_bps", Number(e.target.value))} style={inputStyle(t)} />
          </Field>
        </div>

        {error && (
          <div style={{ marginTop: 12, padding: 10, borderRadius: 10, background: t.dangerBg, color: t.danger, fontSize: 13, fontWeight: 700 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
          <button type="button" onClick={onClose} style={ghostBtn(t)} disabled={saving}>Cancel</button>
          <button type="button" onClick={onSave} style={primaryBtn(t)} disabled={saving}>
            {saving ? "Saving..." : editing ? "Save changes" : "Create SKU"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  const { t } = useTheme();
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, color: t.ink3, fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" }}>
      {label}
      {children}
    </label>
  );
}

function inputStyle(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return {
    width: "100%",
    minHeight: 42,
    borderRadius: 10,
    border: `1px solid ${t.line}`,
    background: t.surface,
    color: t.ink,
    padding: "0 12px",
    fontSize: 14,
    fontFamily: "inherit",
    outline: "none",
  };
}

function primaryBtn(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return {
    border: 0,
    borderRadius: 10,
    background: t.ink,
    color: t.inverse,
    padding: "9px 13px",
    fontSize: 12.5,
    fontWeight: 800,
    fontFamily: "inherit",
    cursor: "pointer",
  };
}

function ghostBtn(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return {
    border: `1px solid ${t.line}`,
    borderRadius: 9,
    background: t.surface,
    color: t.ink2,
    padding: "7px 10px",
    fontSize: 12,
    fontWeight: 800,
    fontFamily: "inherit",
    cursor: "pointer",
  };
}

function dangerBtn(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return {
    ...ghostBtn(t),
    color: t.danger,
    background: t.dangerBg,
    border: `1px solid ${t.dangerBg}`,
  };
}
