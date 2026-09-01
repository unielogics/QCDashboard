"use client";

// Super Admin → Lending AI Settings → Document Verification
// Visual checklists per common doc type. Raw JSON + source-of-truth
// priority overrides live behind an Advanced disclosure.
//
// Styling migrated off the inline token objects onto the plain-CSS design
// system (globals.css + app-extras.css) via the wrappers in @/components/ds.
// The rules model, the catalog and every handler are untouched; only the
// surface vocabulary changed:
//   Card + SectionLabel stack   → one Panel of `.fldsec` sections
//   hand-rolled checkbox rows   → `.filerow`, which already owns the accent
//                                 checkbox and the hairline between rows
//   "▸ Advanced" text toggle    → `.disc` / `.disc-h` / `.disc-b`, a real
//                                 button rather than a div with an onClick
//   raw-JSON textarea           → Textarea + `.mono`
// The page no longer sets its own padding or max-width — the shell's
// `.content` owns both.

import { useEffect, useMemo, useState } from "react";
import { Btn, Input, Lbl, Panel, Row, Sub, Textarea, WarnLine, cx } from "@/components/ds";
import { LendingAIHeader } from "@/components/LendingAIHeader";
import { AINotDeployedBanner } from "@/components/AINotDeployedBanner";
import { isAINotDeployed, useFundingMetaRules, usePatchFundingMetaRules } from "@/hooks/useApi";

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
  const { data, isLoading, error: vfError } = useFundingMetaRules("verification");
  const patch = usePatchFundingMetaRules("verification");

  const [val, setVal] = useState<VerificationRules>({});
  const [advanced, setAdvanced] = useState(false);
  const [advancedText, setAdvancedText] = useState<string>("");
  const [advancedError, setAdvancedError] = useState<string | null>(null);

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
    setAdvancedError(null);
    try {
      const parsed = JSON.parse(advancedText || "{}");
      await patch.mutateAsync(parsed);
      setVal(parsed);
    } catch {
      setAdvancedError("Invalid JSON. Correct the syntax before saving.");
    }
  }

  return (
    <div className="grid">
      <LendingAIHeader
        title="Document Verification"
        subtitle="For each document type, choose what the AI should check."
      />

      {isAINotDeployed(vfError) ? (
        <AINotDeployedBanner surface="Lending AI" />
      ) : null}

      <Panel>
        {isLoading ? (
          <Sub>Loading…</Sub>
        ) : (
          <>
            {docTypes.map(d => (
              <div key={d.key} className="fldsec">
                <Lbl>{d.label}</Lbl>
                <div>
                  {d.checks.map(c => (
                    <label key={c.id} className="filerow">
                      <input
                        type="checkbox"
                        checked={d.cfg.checks?.[c.id] !== false}
                        onChange={e => setDocCheck(d.key, c.id, e.target.checked)}
                      />
                      {c.label}
                    </label>
                  ))}
                </div>
                {d.hasExpiration ? (
                  <Row className="mt">
                    <Sub>Expiration window:</Sub>
                    <Input
                      type="number"
                      aria-label={`${d.label} expiration window in days`}
                      value={d.cfg.expiration_days ?? 60}
                      onChange={e => setExpiration(d.key, parseInt(e.target.value || "0", 10) || null)}
                      // Bespoke: a two-or-three-digit day count. `.field` has no
                      // width of its own and would otherwise stretch the row.
                      style={{ width: 70 }}
                    />
                    <Sub>days</Sub>
                  </Row>
                ) : null}
              </div>
            ))}

            <Row className="mt">
              <Btn variant="pri" onClick={save} disabled={patch.isPending}>
                {patch.isPending ? "Saving…" : "Save verification rules"}
              </Btn>
            </Row>

            {/* Advanced disclosure */}
            <div className={cx("disc", "mt", advanced && "on")}>
              <button
                type="button"
                className="disc-h"
                aria-expanded={advanced}
                onClick={() => setAdvanced(o => !o)}
              >
                <span className="lbl">
                  Advanced — raw JSON + source-of-truth priority overrides
                </span>
                <span aria-hidden="true">{advanced ? "▾" : "▸"}</span>
              </button>
              {advanced ? (
                <div className="disc-b grid">
                  <Textarea
                    className="mono"
                    aria-label="Verification rules, raw JSON"
                    value={advancedText}
                    onChange={e => { setAdvancedText(e.target.value); setAdvancedError(null); }}
                    rows={20}
                  />
                  {advancedError ? <WarnLine>{advancedError}</WarnLine> : null}
                  <Row className="mt">
                    <Btn variant="pri" onClick={saveAdvanced}>Save raw JSON</Btn>
                  </Row>
                </div>
              ) : null}
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
