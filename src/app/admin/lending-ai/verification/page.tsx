"use client";

// Super Admin → Lending AI Settings → Document Verification
// Visual checklists per common doc type. Raw JSON + source-of-truth
// priority overrides live behind an Advanced disclosure.

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/components/design-system/primitives";
import { LendingAIHeader } from "@/components/LendingAIHeader";
import { useFundingMetaRules, usePatchFundingMetaRules } from "@/hooks/useApi";

type DocChecks = Record<string, boolean>;

interface DocTypeConfig {
  /** Free-form schema for one doc type. Visual surface uses the
   *  `checks` map (label → enabled). Numeric fields like
   *  expiration_days surface as inline inputs. */
  checks: DocChecks;
  expiration_days?: number | null;
  confidence_threshold?: number;
}

interface VerificationRules {
  doc_types?: Record<string, DocTypeConfig>;
  source_of_truth_priority?: string[];
  [k: string]: unknown;
}


/** Catalog of common doc types + their default check rows. The
 * funding admin can extend each. */
const DOC_TYPE_CATALOG: { key: string; label: string; checks: { id: string; label: string }[]; hasExpiration?: boolean }[] = [
  {
    key: "purchase_contract",
    label: "Purchase Contract",
    checks: [
      { id: "buyer_name", label: "Buyer name" },
      { id: "property_address", label: "Property address" },
      { id: "purchase_price", label: "Purchase price" },
      { id: "closing_date", label: "Closing date" },
      { id: "signatures", label: "Signatures" },
      { id: "missing_pages", label: "Missing pages check" },
    ],
  },
  {
    key: "bank_statements",
    label: "Bank Statements",
    checks: [
      { id: "borrower_name", label: "Borrower name" },
      { id: "statement_date", label: "Statement date" },
      { id: "account_balance", label: "Account balance" },
      { id: "full_pages", label: "All pages present" },
    ],
    hasExpiration: true,
  },
  {
    key: "entity_docs",
    label: "Entity Docs",
    checks: [
      { id: "entity_name", label: "Entity name" },
      { id: "state", label: "Entity state" },
      { id: "members", label: "Members listed" },
      { id: "operating_agreement", label: "Operating agreement attached" },
    ],
  },
  {
    key: "rent_roll",
    label: "Rent Roll / Leases",
    checks: [
      { id: "property_address", label: "Property address" },
      { id: "tenant_names", label: "Tenant names" },
      { id: "monthly_rent", label: "Monthly rent" },
      { id: "lease_terms", label: "Lease terms" },
    ],
  },
  {
    key: "id_document",
    label: "Government ID",
    checks: [
      { id: "borrower_name", label: "Borrower name matches" },
      { id: "expiration", label: "Not expired" },
      { id: "photo", label: "Photo present" },
    ],
    hasExpiration: false,
  },
];


export default function VerificationRulesPage() {
  const { t } = useTheme();
  const { data, isLoading } = useFundingMetaRules("verification");
  const patch = usePatchFundingMetaRules("verification");

  const [val, setVal] = useState<VerificationRules>({});
  const [advanced, setAdvanced] = useState(false);
  const [advancedText, setAdvancedText] = useState<string>("");

  useEffect(() => {
    if (data?.rules) {
      const v = data.rules as VerificationRules;
      setVal(v);
      setAdvancedText(JSON.stringify(v, null, 2));
    }
  }, [data?.rules]);

  // Merge stored + catalog defaults so the UI shows all known doc types.
  const docTypes = useMemo(() => {
    const stored = val.doc_types || {};
    return DOC_TYPE_CATALOG.map(cat => ({
      ...cat,
      cfg: stored[cat.key] || {
        checks: Object.fromEntries(cat.checks.map(c => [c.id, true])) as DocChecks,
        ...(cat.hasExpiration ? { expiration_days: 60 } : {}),
        confidence_threshold: 0.7,
      },
    }));
  }, [val]);

  function setDocCheck(docKey: string, checkId: string, value: boolean) {
    const next: VerificationRules = { ...val };
    next.doc_types = next.doc_types ? { ...next.doc_types } : {};
    const cur = next.doc_types[docKey] || { checks: {} };
    next.doc_types[docKey] = { ...cur, checks: { ...cur.checks, [checkId]: value } };
    setVal(next);
  }

  function setExpiration(docKey: string, days: number | null) {
    const next: VerificationRules = { ...val };
    next.doc_types = next.doc_types ? { ...next.doc_types } : {};
    const cur = next.doc_types[docKey] || { checks: {} };
    next.doc_types[docKey] = { ...cur, expiration_days: days };
    setVal(next);
  }

  async function save() {
    await patch.mutateAsync(val);
  }

  async function saveAdvanced() {
    try {
      const parsed = JSON.parse(advancedText || "{}");
      await patch.mutateAsync(parsed);
      setVal(parsed);
    } catch {
      alert("Invalid JSON");
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <LendingAIHeader
        title="Document Verification"
        subtitle="For each document type, choose what the AI should check."
      />

      <Card pad={20}>
        {isLoading ? (
          <div style={{ color: t.ink3 }}>Loading…</div>
        ) : (
          <>
            {docTypes.map(d => (
              <div key={d.key} style={{ marginBottom: 24 }}>
                <SectionLabel>{d.label}</SectionLabel>
                <div style={{ marginTop: 8 }}>
                  {d.checks.map(c => (
                    <label key={c.id} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "6px 0", fontSize: 13, color: t.ink,
                      cursor: "pointer",
                    }}>
                      <input
                        type="checkbox"
                        checked={d.cfg.checks?.[c.id] !== false}
                        onChange={e => setDocCheck(d.key, c.id, e.target.checked)}
                        style={{ width: 18, height: 18 }}
                      />
                      {c.label}
                    </label>
                  ))}
                </div>
                {d.hasExpiration ? (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 10,
                    marginTop: 8, fontSize: 13, color: t.ink3,
                  }}>
                    Expiration window:
                    <input
                      type="number"
                      value={d.cfg.expiration_days ?? 60}
                      onChange={e => setExpiration(d.key, parseInt(e.target.value || "0", 10) || null)}
                      style={{
                        width: 70, padding: 6, fontSize: 13,
                        borderRadius: 6, border: `1px solid ${t.line}`,
                        background: t.surface, color: t.ink,
                      }}
                    />
                    days
                  </div>
                ) : null}
              </div>
            ))}

            <button onClick={save} disabled={patch.isPending} style={btnPrimary(t)}>
              {patch.isPending ? "Saving…" : "Save verification rules"}
            </button>

            {/* Advanced disclosure */}
            <div style={{ marginTop: 28, paddingTop: 16, borderTop: `1px solid ${t.line}` }}>
              <button
                onClick={() => setAdvanced(o => !o)}
                style={{
                  background: "transparent", border: "none",
                  padding: 0, color: t.ink3, fontSize: 12, fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {advanced ? "▾" : "▸"} Advanced — raw JSON + source-of-truth priority overrides
              </button>
              {advanced ? (
                <div style={{ marginTop: 12 }}>
                  <textarea
                    value={advancedText}
                    onChange={e => setAdvancedText(e.target.value)}
                    rows={20}
                    style={{
                      width: "100%", fontFamily: "ui-monospace, SF Mono, monospace", fontSize: 12,
                      padding: 10, borderRadius: 8, border: `1px solid ${t.line}`,
                      background: t.surface, color: t.ink, resize: "vertical",
                    }}
                  />
                  <button onClick={saveAdvanced} style={{ ...btnPrimary(t), marginTop: 8 }}>
                    Save raw JSON
                  </button>
                </div>
              ) : null}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}


function btnPrimary(t: ReturnType<typeof useTheme>["t"]) {
  return {
    padding: "8px 14px", fontSize: 13, fontWeight: 600,
    borderRadius: 6, border: `1px solid ${t.line}`,
    background: t.petrol, color: "#fff", cursor: "pointer",
  } as const;
}
