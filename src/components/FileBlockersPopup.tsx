"use client";

// FileBlockersPopup — modal that surfaces every blocker on a loan
// (warnings, missing criteria, flagged docs, open conditions).
//
// Lives at the page level so the loan-header completion strip can
// open it from any tab. Previously rendered inside FundingFileTab;
// extracted so the same component serves both surfaces.

import { V } from "@/components/design-system/cssVars";
import { Icon } from "@/components/design-system/Icon";
import { Drawer } from "@/components/ds/Drawer";
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
  const total = warnings.length + missingCriteria.length + flaggedDocs.length + (openDocs.length > 0 ? 1 : 0);
  return (
    <Drawer
      open
      onClose={onClose}
      width="md"
      title="File blockers"
      sub={total === 0 ? "Nothing to fix - this file is clear" : `${total} item${total === 1 ? "" : "s"} need attention`}
      bodyClass="grid g8"
    >
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
    </Drawer>
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
  const color = tone === "ready" ? V.profit : tone === "watch" ? V.warn : tone === "danger" ? V.danger : V.ink3;
  const bg = tone === "ready" ? V.profitBg : tone === "watch" ? V.warnBg : tone === "danger" ? V.dangerBg : V.surface2;
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
        border: `1px solid ${V.line}`,
        background: tone === "open" ? V.surface2 : bg,
        cursor: onClick ? "pointer" : "default",
        textAlign: "left",
        fontFamily: "inherit",
      }}
    >
      <div
        style={{
          width: 30, height: 30, borderRadius: 9,
          display: "grid", placeItems: "center",
          color, background: tone === "open" ? V.chip : V.surface,
        }}
      >
        <Icon name={icon} size={14} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 900, color: V.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}
        </div>
        <div style={{ marginTop: 2, fontSize: 11, fontWeight: 700, color: V.ink3 }}>{meta}</div>
      </div>
      {onClick ? <Icon name="arrowR" size={12} /> : null}
    </button>
  );
}
