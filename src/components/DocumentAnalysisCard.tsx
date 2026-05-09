"use client";

// DocumentAnalysisCard — renders one document_analysis_results row's
// extracted facts + any contradictions + the recommended_action.
//
// Used on /loans/[id] under the Documents tab. Fed from the (future)
// /loans/{id}/document-analyses endpoint or inline data passed by
// the parent.

import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/components/design-system/primitives";

interface AnalysisIssue {
  type: string;
  field: string;
  winning_value: unknown;
  winning_source: string;
  conflicts?: { value: unknown; source: string; evidence_id?: string | null }[];
  severity?: "high" | "medium" | "low";
}

interface Props {
  documentName: string;
  detectedDocumentType: string | null;
  confidence: number | null;
  extractedFacts: Record<string, unknown> | null;
  issues: AnalysisIssue[] | null;
  recommendedAction: string | null;
  onResolve?: (action: string, field?: string) => void;
}

export function DocumentAnalysisCard({
  documentName, detectedDocumentType, confidence,
  extractedFacts, issues, recommendedAction, onResolve,
}: Props) {
  const { t } = useTheme();
  const conf = confidence ?? 0;

  return (
    <Card pad={16}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <SectionLabel>Document analysis</SectionLabel>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
          background: t.surface2, color: t.ink, textTransform: "uppercase",
        }}>
          {detectedDocumentType || "Unknown type"}
        </span>
        <span style={{ fontSize: 12, color: t.ink3, marginLeft: "auto" }}>
          confidence {(conf * 100).toFixed(0)}%
        </span>
      </div>
      <div style={{ fontSize: 12, color: t.ink3, marginBottom: 10 }}>
        {documentName}
      </div>

      {extractedFacts && Object.keys(extractedFacts).length > 0 ? (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: t.ink3, marginBottom: 4, textTransform: "uppercase" }}>
            Extracted facts
          </div>
          {Object.entries(extractedFacts).map(([k, v]) => (
            <div key={k} style={{ fontSize: 12, color: t.ink }}>
              <strong>{k}:</strong> {String(v)}
            </div>
          ))}
        </div>
      ) : null}

      {issues && issues.length > 0 ? (
        <div style={{
          padding: 10, borderRadius: 8,
          background: "#c1444411", border: `1px solid #c14444aa`,
          marginBottom: 10,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#c14444", marginBottom: 4, textTransform: "uppercase" }}>
            ⚠ Contradiction detected
          </div>
          {issues.map((iss, i) => (
            <div key={i} style={{ fontSize: 12, color: t.ink, marginBottom: 6 }}>
              <strong>{iss.field}:</strong> document says{" "}
              <code>{String(iss.winning_value)}</code> ({iss.winning_source})
              {iss.conflicts && iss.conflicts.length > 0 ? (
                <span> — but chat says {iss.conflicts.map(c => `${String(c.value)} (${c.source})`).join("; ")}</span>
              ) : null}
            </div>
          ))}
          {onResolve ? (
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => onResolve("update_field_from_doc", issues[0].field)}
                style={btn(t)}
              >
                Update from doc
              </button>
              <button
                onClick={() => onResolve("confirm_field_chat", issues[0].field)}
                style={btn(t)}
              >
                Keep chat value
              </button>
              <button
                onClick={() => onResolve("request_borrower_confirm", issues[0].field)}
                style={btn(t)}
              >
                Ask borrower
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {recommendedAction && !issues?.length ? (
        <div style={{ fontSize: 12, color: t.ink3 }}>
          Recommended: <code>{recommendedAction}</code>
        </div>
      ) : null}
    </Card>
  );
}

function btn(t: ReturnType<typeof useTheme>["t"]) {
  return {
    padding: "4px 10px", fontSize: 11, fontWeight: 600,
    borderRadius: 6, border: `1px solid ${t.line}`,
    background: t.surface, color: t.ink, cursor: "pointer",
  } as const;
}
