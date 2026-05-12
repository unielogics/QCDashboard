"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { DocRequestModal } from "@/app/documents/components/DocRequestModal";
import { DocUploadButton } from "@/app/documents/components/DocUploadButton";
import { useDocuments, useMarkDocumentVerified } from "@/hooks/useApi";
import { ContextMenu, useContextMenu, type ContextMenuItem } from "@/components/ContextMenu";
import { UploadOnBehalfModal } from "../components/UploadOnBehalfModal";
import type { Document, Loan } from "@/lib/types";

export function DocsTab({ loan, canRequest }: { loan: Loan; canRequest: boolean }) {
  const { t } = useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: docs = [] } = useDocuments(loan.id);
  const markVerified = useMarkDocumentVerified();
  const [requestOpen, setRequestOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  // Tracks the doc_id whose upload picker should auto-open on mount,
  // sourced from `?upload=<doc_id>` (the chat's upload_document CTA
  // deep-links here).
  const [autoUploadDocId, setAutoUploadDocId] = useState<string | null>(null);
  // Right-click context menu shared across all doc rows.
  const ctxMenu = useContextMenu<Document>();

  useEffect(() => {
    const u = searchParams?.get("upload");
    if (!u) return;
    if (docs.length === 0) return;
    const target = docs.find((d) => d.id === u);
    if (target && (target.status === "requested" || target.status === "pending" || target.status === "flagged")) {
      setAutoUploadDocId(u);
    }
    // Strip the param so re-renders don't re-fire the picker.
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.delete("upload");
    router.replace(
      `/loans/${loan.id}${params.toString() ? `?${params.toString()}` : ""}#docs`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams?.get("upload"), docs.length]);

  const counts = {
    received: docs.filter((d) => d.status === "received" || d.status === "verified").length,
    requested: docs.filter((d) => d.status === "requested").length,
    pending: docs.filter((d) => d.status === "pending").length,
    flagged: docs.filter((d) => d.status === "flagged").length,
  };

  // Compute the right-click menu items per row. "Mark complete" only
  // appears when the doc isn't already verified.
  const menuItems = (doc: Document): ContextMenuItem[] => {
    const alreadyVerified = doc.status === "verified";
    return [
      {
        label: alreadyVerified ? "Already complete" : "Mark complete",
        icon: "check",
        disabled: alreadyVerified || !canRequest || markVerified.isPending,
        hint: alreadyVerified ? undefined : "operator override",
        onSelect: () => markVerified.mutate({ documentId: doc.id, loanId: loan.id }),
      },
    ];
  };

  return (
    <Card pad={0}>
      <div style={{ padding: 16, borderBottom: `1px solid ${t.line}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <SectionLabel>Document Vault · {docs.length} items</SectionLabel>
          <Counter label="Received" count={counts.received} color={t.profit} t={t} />
          <Counter label="Requested" count={counts.requested} color={t.brand} t={t} />
          <Counter label="Pending" count={counts.pending} color={t.warn} t={t} />
          <Counter label="Flagged" count={counts.flagged} color={t.danger} t={t} />
        </div>
        {canRequest ? (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => setUploadOpen(true)}
              style={{
                padding: "8px 12px", borderRadius: 9,
                background: t.surface, color: t.ink,
                fontSize: 13, fontWeight: 700,
                border: `1px solid ${t.lineStrong}`,
                display: "inline-flex", alignItems: "center", gap: 6,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              <Icon name="download" size={13} style={{ transform: "rotate(180deg)" }} />
              Upload on behalf
            </button>
            <button
              onClick={() => setRequestOpen(true)}
              style={{
                padding: "8px 12px", borderRadius: 9, background: t.brand, color: t.inverse,
                fontSize: 13, fontWeight: 700, border: "none",
                display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer",
              }}
            >
              <Icon name="plus" size={13} /> Request doc
            </button>
          </div>
        ) : null}
      </div>

      {canRequest ? (
        <div style={{
          padding: "8px 16px",
          background: t.surface2,
          borderBottom: `1px solid ${t.line}`,
          fontSize: 11.5, color: t.ink3, fontWeight: 700,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <Icon name="ai" size={12} stroke={2.2} />
          <span>
            AI scans every upload — operator or client. Right-click a row to mark complete, override, or open details.
          </span>
        </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16 }}>
        {docs.length === 0 && <div style={{ fontSize: 13, color: t.ink3 }}>No documents on file yet.</div>}
        {docs.map((d) => {
          const showUpload = canRequest && (d.status === "requested" || d.status === "pending" || d.status === "flagged");
          const showMarkComplete = canRequest && d.status !== "verified";
          return (
            <div
              key={d.id}
              onContextMenu={(e) => { if (canRequest) ctxMenu.open(e, d); }}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 12px",
                borderRadius: 10,
                border: `1px solid ${t.line}`,
                cursor: canRequest ? "context-menu" : "default",
              }}
              title={canRequest ? "Right-click for actions" : undefined}
            >
              <Icon name="doc" size={16} style={{ color: t.ink3 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>{d.name}</div>
                <div style={{ fontSize: 11.5, color: t.ink3 }}>
                  {d.category ?? "uncategorized"}
                  {d.requested_on && ` · requested ${new Date(d.requested_on).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                  {d.received_on && ` · received ${new Date(d.received_on).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                </div>
              </div>
              <AIScanBadge status={d.ai_scan_status} t={t} />
              <Pill bg={
                d.status === "verified" ? t.profitBg : d.status === "received" ? t.brandSoft : d.status === "flagged" ? t.dangerBg : t.warnBg
              } color={
                d.status === "verified" ? t.profit : d.status === "received" ? t.brand : d.status === "flagged" ? t.danger : t.warn
              }>
                {d.status}
              </Pill>
              {showUpload && (
                <DocUploadButton
                  loanId={loan.id}
                  category={d.category ?? undefined}
                  compact
                  label="Upload"
                  fulfillDocId={d.id}
                  autoOpen={autoUploadDocId === d.id}
                  onAutoOpenHandled={() => setAutoUploadDocId(null)}
                />
              )}
              {showMarkComplete && !showUpload ? (
                <button
                  type="button"
                  onClick={() => markVerified.mutate({ documentId: d.id, loanId: loan.id })}
                  disabled={markVerified.isPending}
                  title="Force-mark this document complete (operator override)"
                  style={{
                    padding: "5px 9px", borderRadius: 7,
                    border: `1px solid ${t.line}`,
                    background: t.surface2, color: t.ink2,
                    fontSize: 11, fontWeight: 800,
                    cursor: markVerified.isPending ? "wait" : "pointer",
                    fontFamily: "inherit",
                    whiteSpace: "nowrap",
                  }}
                >
                  <Icon name="check" size={11} /> Mark complete
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      <DocRequestModal open={requestOpen} onClose={() => setRequestOpen(false)} defaultLoanId={loan.id} />
      <UploadOnBehalfModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        loanId={loan.id}
        docs={docs}
      />
      <ContextMenu state={ctxMenu.state} onClose={ctxMenu.close} items={menuItems} />
    </Card>
  );
}


function AIScanBadge({ status, t }: { status?: string | null; t: ReturnType<typeof useTheme>["t"] }) {
  if (!status || status === "unscanned") return null;
  let label = "";
  let fg = t.ink3;
  let bg = t.surface2;
  if (status === "queued" || status === "scanning") {
    label = "AI scanning";
    fg = t.brand;
    bg = t.brandSoft;
  } else if (status === "verified") {
    label = "AI ✓";
    fg = t.profit;
    bg = t.profitBg;
  } else if (status === "flagged") {
    label = "AI ⚠ flagged";
    fg = t.danger;
    bg = t.dangerBg;
  } else if (status === "failed") {
    label = "AI scan failed";
    fg = t.warn;
    bg = t.warnBg;
  } else {
    return null;
  }
  return (
    <span style={{
      fontSize: 9.5, fontWeight: 900,
      padding: "2px 7px", borderRadius: 4,
      background: bg, color: fg,
      whiteSpace: "nowrap",
      letterSpacing: 0.3, textTransform: "uppercase",
    }}>
      {label}
    </span>
  );
}


function Counter({ t, label, count, color }: { t: ReturnType<typeof useTheme>["t"]; label: string; count: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: color }} />
      <span style={{ fontSize: 12, color: t.ink3, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 800, color: t.ink, fontFeatureSettings: '"tnum"' }}>{count}</span>
    </div>
  );
}
