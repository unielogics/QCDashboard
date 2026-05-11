"use client";

// FileBlockersPopup — modal that surfaces every blocker on a loan
// (warnings, missing criteria, flagged docs, open conditions).
//
// Lives at the page level so the loan-header completion strip can
// open it from any tab. Previously rendered inside FundingFileTab;
// extracted so the same component serves both surfaces.

import { useTheme } from "@/components/design-system/ThemeProvider";
import { Icon } from "@/components/design-system/Icon";
import type { Document } from "@/lib/types";

export interface BlockerWarning {
  code: string;
  message: string;
}

export interface BlockerMissingCriteria {
  id: string;
  label: string;
  group: string;
  value: string;
}

export interface FileBlockersPopupProps {
  onClose: () => void;
  warnings: BlockerWarning[];
  missingCriteria: BlockerMissingCriteria[];
  flaggedDocs: Document[];
  openDocs: Document[];
  onOpenTab?: (tab: string, targetId?: string) => void;
  onCriteriaJump?: (id: string) => void;
}

export function FileBlockersPopup({
  onClose, warnings, missingCriteria, flaggedDocs, openDocs, onOpenTab, onCriteriaJump,
}: FileBlockersPopupProps) {
  const { t } = useTheme();
  const total = warnings.length + missingCriteria.length + flaggedDocs.length + (openDocs.length > 0 ? 1 : 0);
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: t.surface, color: t.ink,
          border: `1px solid ${t.line}`, borderRadius: 14,
          boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
          width: "min(640px, 100%)", maxHeight: "85vh", overflow: "hidden",
          display: "flex", flexDirection: "column",
        }}
      >
        <div style={{
          padding: "14px 16px",
          borderBottom: `1px solid ${t.line}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 900, color: t.ink3, letterSpacing: 1.3, textTransform: "uppercase" }}>
              File Blockers
            </div>
            <div style={{ marginTop: 2, fontSize: 16, fontWeight: 900, color: t.ink }}>
              {total === 0 ? "Nothing to fix — this file is clear" : `${total} item${total === 1 ? "" : "s"} need attention`}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "6px 10px", borderRadius: 9,
              background: t.surface2, color: t.ink2,
              border: `1px solid ${t.line}`, cursor: "pointer",
              fontSize: 11.5, fontWeight: 800, fontFamily: "inherit",
            }}
          >
            Close
          </button>
        </div>
        <div style={{ padding: 14, overflow: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          {warnings.map((warning) => (
            <Row key={`${warning.code}-${warning.message}`} tone="watch" icon="alert" title={warning.message} meta={warning.code.replace(/_/g, " ")} onClick={() => { onClose(); onOpenTab?.("file"); }} />
          ))}
          {missingCriteria.map((item) => (
            <Row key={item.id} tone="open" icon="sliders" title={`${item.label} is missing`} meta={item.group} onClick={() => { onClose(); onCriteriaJump?.(item.id); }} />
          ))}
          {flaggedDocs.map((doc) => (
            <Row key={doc.id} tone="danger" icon="doc" title={doc.name} meta={doc.category ?? "Flagged document"} onClick={() => { onClose(); onOpenTab?.("docs"); }} />
          ))}
          {openDocs.length > 0 ? (
            <Row tone="open" icon="docCheck" title={`${openDocs.length} document condition${openDocs.length === 1 ? "" : "s"} still open`} meta="Review Documents or Conditions" onClick={() => { onClose(); onOpenTab?.("workflow"); }} />
          ) : null}
          {total === 0 ? (
            <Row tone="ready" icon="check" title="No calculation warnings or flagged documents" meta="Ready for internal review" />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Row({
  tone, icon, title, meta, onClick,
}: {
  tone: "ready" | "watch" | "danger" | "open";
  icon: string;
  title: string;
  meta: string;
  onClick?: () => void;
}) {
  const { t } = useTheme();
  const color = tone === "ready" ? t.profit : tone === "watch" ? t.warn : tone === "danger" ? t.danger : t.ink3;
  const bg = tone === "ready" ? t.profitBg : tone === "watch" ? t.warnBg : tone === "danger" ? t.dangerBg : t.surface2;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "grid",
        gridTemplateColumns: "30px minmax(0, 1fr) 16px",
        gap: 9,
        alignItems: "center",
        padding: 10,
        borderRadius: 12,
        border: `1px solid ${t.line}`,
        background: tone === "open" ? t.surface2 : bg,
        cursor: onClick ? "pointer" : "default",
        textAlign: "left",
        fontFamily: "inherit",
      }}
    >
      <div
        style={{
          width: 30, height: 30, borderRadius: 9,
          display: "grid", placeItems: "center",
          color, background: tone === "open" ? t.chip : t.surface,
        }}
      >
        <Icon name={icon} size={14} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 900, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}
        </div>
        <div style={{ marginTop: 2, fontSize: 11, fontWeight: 700, color: t.ink3 }}>{meta}</div>
      </div>
      {onClick ? <Icon name="arrowR" size={12} /> : null}
    </button>
  );
}
