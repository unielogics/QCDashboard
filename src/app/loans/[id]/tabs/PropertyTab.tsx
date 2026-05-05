"use client";

import { useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, KPI, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { useUpdateLoan } from "@/hooks/useApi";
import { QC_FMT } from "@/components/design-system/tokens";
import { parseUSD, parseIntStrict } from "@/lib/formCoerce";
import { PropertyType, PropertyTypeOptions } from "@/lib/enums.generated";
import type { Loan } from "@/lib/types";

export function PropertyTab({ loan, canEdit }: { loan: Loan; canEdit: boolean }) {
  const { t } = useTheme();
  const update = useUpdateLoan();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    address: loan.address,
    city: loan.city ?? "",
    property_type: loan.property_type,
    annual_taxes: String(loan.annual_taxes ?? ""),
    annual_insurance: String(loan.annual_insurance ?? ""),
    monthly_hoa: String(loan.monthly_hoa ?? ""),
  });

  const save = async () => {
    await update.mutateAsync({
      loanId: loan.id,
      address: draft.address,
      city: draft.city || null,
      property_type: draft.property_type as Loan["property_type"],
      annual_taxes: parseUSD(draft.annual_taxes),
      annual_insurance: parseUSD(draft.annual_insurance),
      monthly_hoa: parseUSD(draft.monthly_hoa),
    });
    setEditing(false);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20 }}>
      <Card pad={0}>
        {/* Map placeholder */}
        <div style={{
          height: 220,
          background: `repeating-linear-gradient(135deg, ${t.surface2}, ${t.surface2} 16px, ${t.surface} 16px, ${t.surface} 32px)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          borderBottom: `1px solid ${t.line}`,
          fontFamily: "ui-monospace, SF Mono, monospace",
          fontSize: 11, color: t.ink3,
        }}>
          [ MAP — {loan.address}, {loan.city ?? "—"} ]
        </div>
        <div style={{ padding: 18 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: t.ink }}>{loan.address}</div>
              <div style={{ fontSize: 13, color: t.ink2 }}>{loan.city ?? "—"}</div>
            </div>
            {canEdit && !editing && (
              <button onClick={() => setEditing(true)} style={qcBtn(t)}>
                <Icon name="gear" size={12} /> Edit
              </button>
            )}
          </div>

          {editing ? (
            <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field t={t} label="Address">
                <Input t={t} value={draft.address} onChange={(v) => setDraft((d) => ({ ...d, address: v }))} />
              </Field>
              <Field t={t} label="City">
                <Input t={t} value={draft.city} onChange={(v) => setDraft((d) => ({ ...d, city: v }))} />
              </Field>
              <Field t={t} label="Property type">
                <select
                  value={draft.property_type}
                  onChange={(e) => setDraft((d) => ({ ...d, property_type: e.target.value as Loan["property_type"] }))}
                  style={inputStyle(t)}
                >
                  {PropertyTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <Field t={t} label="Annual taxes">
                <Input t={t} value={draft.annual_taxes} onChange={(v) => setDraft((d) => ({ ...d, annual_taxes: v }))} prefix="$" />
              </Field>
              <Field t={t} label="Annual insurance">
                <Input t={t} value={draft.annual_insurance} onChange={(v) => setDraft((d) => ({ ...d, annual_insurance: v }))} prefix="$" />
              </Field>
              <Field t={t} label="Monthly HOA">
                <Input t={t} value={draft.monthly_hoa} onChange={(v) => setDraft((d) => ({ ...d, monthly_hoa: v }))} prefix="$" />
              </Field>
              <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button onClick={() => setEditing(false)} style={qcBtn(t)}>Cancel</button>
                <button
                  onClick={save}
                  disabled={update.isPending}
                  style={{ ...qcBtnPrimary(t), opacity: update.isPending ? 0.6 : 1, cursor: update.isPending ? "wait" : "pointer" }}
                >
                  <Icon name="check" size={13} /> {update.isPending ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 14 }}>
              <KPI label="Type" value={prettyPropertyType(loan.property_type)} />
              <KPI label="Annual taxes" value={QC_FMT.usd(Number(loan.annual_taxes))} />
              <KPI label="Annual insurance" value={QC_FMT.usd(Number(loan.annual_insurance))} />
            </div>
          )}
        </div>
      </Card>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Card pad={16}>
          <SectionLabel>Valuation</SectionLabel>
          <Row t={t} label="As-is value (appraised)" value={loan.ltv ? QC_FMT.usd(Math.round(Number(loan.amount) / Number(loan.ltv))) : "—"} />
          <Row t={t} label="ARV (after repair)" value={loan.arv ? QC_FMT.usd(Number(loan.arv)) : "—"} />
          <Row t={t} label="Loan-to-value" value={loan.ltv ? `${(loan.ltv * 100).toFixed(0)}%` : "—"} />
          {loan.ltc && <Row t={t} label="Loan-to-cost" value={`${(loan.ltc * 100).toFixed(0)}%`} />}
        </Card>
      </div>
    </div>
  );
}

function prettyPropertyType(p: Loan["property_type"]): string {
  switch (p) {
    case PropertyType.SFR: return "Single-Family";
    case PropertyType.UNITS_2_4: return "2–4 Units";
    case PropertyType.UNITS_5_8: return "5–8 Units";
    case PropertyType.MIXED_USE: return "Mixed-Use";
    case PropertyType.COMMERCIAL: return "Commercial";
    default: return p;
  }
}

function Field({ t, label, children }: { t: ReturnType<typeof useTheme>["t"]; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.0, textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

function Input({ t, value, onChange, prefix }: { t: ReturnType<typeof useTheme>["t"]; value: string; onChange: (v: string) => void; prefix?: string }) {
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      {prefix && <span style={{ position: "absolute", left: 10, fontSize: 12.5, color: t.ink3, fontWeight: 600 }}>{prefix}</span>}
      <input value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle(t), paddingLeft: prefix ? 22 : 12 }} />
    </div>
  );
}

function inputStyle(t: ReturnType<typeof useTheme>["t"]): React.CSSProperties {
  return {
    width: "100%", padding: "10px 12px", borderRadius: 9, background: t.surface2,
    border: `1px solid ${t.line}`, color: t.ink, fontSize: 13, fontFamily: "inherit", outline: "none",
  };
}

function Row({ t, label, value }: { t: ReturnType<typeof useTheme>["t"]; label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0" }}>
      <span style={{ fontSize: 12.5, color: t.ink3, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: t.ink, fontFeatureSettings: '"tnum"' }}>{value}</span>
    </div>
  );
}
