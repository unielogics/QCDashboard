"use client";

// DocsTab — the loan file's document vault.
//
// Styling lives in globals.css / app-extras.css. Rows are `.itemrow` (the
// read-only list row); the empty state is `.hintbox`, which is the sheet's
// "a placeholder with a reason" surface rather than an error or a warning.

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/design-system/Icon";
import { DocRequestModal } from "@/app/documents/components/DocRequestModal";
import { DocUploadButton } from "@/app/documents/components/DocUploadButton";
import { useDocuments, useMarkDocumentVerified } from "@/hooks/useApi";
import { ContextMenu, useContextMenu, type ContextMenuItem } from "@/components/ContextMenu";
import { UploadOnBehalfModal } from "../components/UploadOnBehalfModal";
import { Btn, CellChip, Panel, type ChipTone } from "@/components/ds";
import type { Document, Loan } from "@/lib/types";

export function DocsTab({
  loan,
  canRequest,
  // Whether the viewer can attach/upload files. Distinct from
  // `canRequest` (operator-only: request a doc, upload-on-behalf,
  // mark complete). Borrowers can't request but absolutely can
  // upload — this defaults true so a client viewing their own file
  // gets a working upload affordance on every requested row plus a
  // general "Upload a document" button.
  canUpload = true,
}: {
  loan: Loan;
  canRequest: boolean;
  canUpload?: boolean;
}) {
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
    <Panel
      title={`Document Vault · ${docs.length} items`}
      sub={
        <>
          <CellChip tone="ok">Received {counts.received}</CellChip>{" "}
          <CellChip tone="acc">Requested {counts.requested}</CellChip>{" "}
          <CellChip tone="warn">Pending {counts.pending}</CellChip>{" "}
          <CellChip tone="bad">Flagged {counts.flagged}</CellChip>
        </>
      }
      actions={
        canRequest ? (
          <>
            <Btn onClick={() => setUploadOpen(true)}>
              {/* The download glyph, turned over — there is no upload glyph in
                  the icon set, and the rotation is geometry, not palette. */}
              <Icon name="download" size={13} style={{ transform: "rotate(180deg)" }} />
              Upload on behalf
            </Btn>
            <Btn variant="pri" onClick={() => setRequestOpen(true)}>
              <Icon name="plus" size={13} /> Request doc
            </Btn>
          </>
        ) : canUpload ? (
          // Non-operator viewer (borrower) — a general upload entry so
          // they can always attach a file, even with nothing requested.
          <DocUploadButton loanId={loan.id} label="Upload a document" />
        ) : undefined
      }
      noPad
    >
      {canRequest ? (
        <div className="panel-h">
          <Icon name="ai" size={12} stroke={2.2} />
          <span className="sub">
            AI scans every upload — operator or client. Right-click a row to mark complete, override, or open details.
          </span>
        </div>
      ) : null}

      <div className="panel-b grid g8">
        {docs.length === 0 && (
          <div className="hintbox">
            <span className="hintbox-i"><Icon name="doc" size={18} /></span>
            <div className="grow">
              No documents on file yet.
              {canUpload
                ? " Upload anything we'll need — bank statements, tax returns, the purchase contract — and we'll sort it."
                : ""}
            </div>
            {canUpload ? <DocUploadButton loanId={loan.id} label="Upload a document" /> : null}
          </div>
        )}
        {docs.map((d) => {
          const showUpload = canUpload && (d.status === "requested" || d.status === "pending" || d.status === "flagged");
          const showMarkComplete = canRequest && d.status !== "verified";
          return (
            // `.itemrow` is the read-only list row. The right-click target is
            // the whole row, so onContextMenu and its title stay on it rather
            // than on ItemRow, which forwards neither.
            <div
              key={d.id}
              className="itemrow"
              onContextMenu={(e) => { if (canRequest) ctxMenu.open(e, d); }}
              title={canRequest ? "Right-click for actions" : undefined}
              // No class owns `cursor` on `.itemrow`; the row is only a
              // right-click target when the viewer can act on it.
              style={canRequest ? { cursor: "context-menu" } : undefined}
            >
              <Icon name="doc" size={16} />
              <div className="grow">
                <div className="trunc"><strong>{d.name}</strong></div>
                <div className="sub">
                  {d.category ?? "uncategorized"}
                  {d.requested_on && ` · requested ${new Date(d.requested_on).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                  {d.received_on && ` · received ${new Date(d.received_on).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                </div>
              </div>
              <AIScanBadge status={d.ai_scan_status} />
              <CellChip tone={docTone(d.status)}>{d.status}</CellChip>
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
                <Btn
                  size="sm"
                  onClick={() => markVerified.mutate({ documentId: d.id, loanId: loan.id })}
                  disabled={markVerified.isPending}
                  title="Force-mark this document complete (operator override)"
                >
                  <Icon name="check" size={11} /> Mark complete
                </Btn>
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
    </Panel>
  );
}


/** Document status → the sheet's chip tone. */
function docTone(status: string): ChipTone {
  if (status === "verified") return "ok";
  if (status === "received") return "acc";
  if (status === "flagged") return "bad";
  return "warn";
}


function AIScanBadge({ status }: { status?: string | null }) {
  if (!status || status === "unscanned") return null;
  let label = "";
  let tone: ChipTone = "mut";
  if (status === "queued" || status === "scanning") {
    label = "AI scanning";
    tone = "acc";
  } else if (status === "verified") {
    label = "AI ✓";
    tone = "ok";
  } else if (status === "flagged") {
    label = "AI ⚠ flagged";
    tone = "bad";
  } else if (status === "failed") {
    label = "AI scan failed";
    tone = "warn";
  } else {
    return null;
  }
  // `.caps` is the stamp variant of `.cellchip` — a badge that shouts.
  return <CellChip tone={tone} className="caps">{label}</CellChip>;
}
