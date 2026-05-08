"use client";

// Vault — borrower's personal document vault. Mirrors qcmobile's Vault tab:
// two sections by Document.category:
//   • Experience      — proof of past deals (HUDs, closings, deeds, prior leases)
//   • Active assets   — currently-owned real estate (bank notes, current leases,
//                       insurance, tax bills)
//
// For operators we keep the same shell — they get a borrower-style view of
// the documents the connected borrower (or themselves) has uploaded.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel, VerifiedBadge } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { useCurrentUser, useDocuments, useLoans, useRequiredDocuments, useUploadDocument } from "@/hooks/useApi";
import type { RequiredDocument } from "@/lib/types";
import { Role } from "@/lib/enums.generated";
import type { Document, Loan } from "@/lib/types";

type UploadKind = "experience" | "active_asset";

type VaultTab = "experience" | "active_asset";

// Match the mobile heuristic: docs with no category default to the
// experience tab (where the vault originally lived).
function tabFor(category: string | null | undefined): VaultTab {
  if (category === "active_asset") return "active_asset";
  return "experience";
}

export default function VaultPage() {
  const { t } = useTheme();
  const { data: user } = useCurrentUser();
  const { data: loans = [] } = useLoans();
  const { data: docs = [] } = useDocuments();
  const [tab, setTab] = useState<VaultTab>("experience");

  const isClient = user?.role === Role.CLIENT;

  const tabCounts = useMemo(() => ({
    experience: docs.filter((d) => tabFor(d.category) === "experience").length,
    active_asset: docs.filter((d) => tabFor(d.category) === "active_asset").length,
  }), [docs]);

  const filtered = useMemo(
    () => docs.filter((d) => tabFor(d.category) === tab),
    [docs, tab],
  );

  const loanById = Object.fromEntries(loans.map((l) => [l.id, l] as const));

  // Upload modal state. When the borrower clicks a REQUESTED row,
  // we pre-bind `prefill` so the modal opens with that loan + that
  // checklist item already selected — no need to walk through the
  // pickers again. Same hook also handles deep-links from the
  // calendar (?fulfill=<doc_id>).
  const [uploadOpen, setUploadOpen] = useState(false);
  const [prefill, setPrefill] = useState<{ loanId: string; fulfillDocId: string; name: string } | null>(null);

  const onTapRequestedDoc = (doc: Document) => {
    setPrefill({ loanId: doc.loan_id, fulfillDocId: doc.id, name: doc.name });
    setUploadOpen(true);
  };

  // Calendar deep-link: /vault?fulfill=<doc_id>
  const sp = useSearchParams();
  const fulfillParam = sp.get("fulfill");
  useEffect(() => {
    if (!fulfillParam) return;
    const target = docs.find((d) => d.id === fulfillParam);
    if (!target || target.status !== "requested") return;
    onTapRequestedDoc(target);
    // strip the param so a re-render doesn't re-trigger
    const url = new URL(window.location.href);
    url.searchParams.delete("fulfill");
    window.history.replaceState({}, "", url.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fulfillParam, docs.length]);

  return (
    <div style={{ padding: 24, maxWidth: 1500, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: t.ink, letterSpacing: -0.4 }}>Vault</h1>
          <div style={{ fontSize: 13, color: t.ink3, marginTop: 4 }}>
            {isClient
              ? "Your document vault. Experience = proof of past deals. Active assets = real estate you currently own."
              : "Borrower-style document view, split by experience proof vs. active assets."}
          </div>
        </div>
        <button onClick={() => setUploadOpen(true)} style={qcBtnPrimary(t)}>
          <Icon name="plus" size={14} /> Upload
        </button>
      </div>

      <div style={{ display: "flex", gap: 4 }}>
        <TabButton t={t} active={tab === "experience"} onClick={() => setTab("experience")}>
          Experience <Pill>{tabCounts.experience}</Pill>
        </TabButton>
        <TabButton t={t} active={tab === "active_asset"} onClick={() => setTab("active_asset")}>
          Active assets <Pill>{tabCounts.active_asset}</Pill>
        </TabButton>
      </div>

      <UploadDocumentModal
        open={uploadOpen}
        onClose={() => {
          setUploadOpen(false);
          setPrefill(null);
        }}
        loans={loans}
        defaultKind={tab}
        prefill={prefill}
      />

      {filtered.length === 0 ? (
        <Card pad={32}>
          <div style={{ textAlign: "center", color: t.ink3, fontSize: 13, lineHeight: 1.55 }}>
            {tab === "experience"
              ? "No experience proof yet. Upload HUDs, closing statements, deeds, or prior leases from past deals to count toward your investor experience tier."
              : "No active assets yet. Upload bank notes, leases, insurance, or tax bills for properties you currently own."}
          </div>
        </Card>
      ) : (
        <Card pad={0}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 2fr) 140px 120px 120px 120px",
              gap: 10,
              padding: "12px 16px",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: t.ink3,
              borderBottom: `1px solid ${t.line}`,
              background: t.surface2,
            }}
          >
            <div>Document</div>
            <div>Category</div>
            <div>Loan</div>
            <div>Received</div>
            <div>Status</div>
          </div>
          {filtered.map((d) => (
            <DocRow
              key={d.id}
              doc={d}
              loan={loanById[d.loan_id]}
              onTapRequested={d.status === "requested" ? () => onTapRequestedDoc(d) : undefined}
            />
          ))}
        </Card>
      )}
    </div>
  );
}

function TabButton({
  t,
  active,
  onClick,
  children,
}: {
  t: ReturnType<typeof useTheme>["t"];
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        all: "unset",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 16px",
        borderRadius: 10,
        background: active ? t.ink : t.surface2,
        color: active ? t.inverse : t.ink2,
        fontSize: 13,
        fontWeight: 700,
      }}
    >
      {children}
    </button>
  );
}

function DocRow({
  doc,
  loan,
  onTapRequested,
}: {
  doc: Document;
  loan: Loan | undefined;
  // Set on REQUESTED rows — clicking the row opens the upload
  // modal with this doc pre-bound. Other statuses pass undefined
  // (the row stays as plain layout).
  onTapRequested?: () => void;
}) {
  const { t } = useTheme();
  const kind = doc.status === "verified"
    ? "verified"
    : doc.status === "flagged"
    ? "flagged"
    : "pending";
  const isRequested = !!onTapRequested;
  return (
    <div
      onClick={isRequested ? onTapRequested : undefined}
      role={isRequested ? "button" : undefined}
      tabIndex={isRequested ? 0 : undefined}
      onKeyDown={
        isRequested
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onTapRequested?.();
              }
            }
          : undefined
      }
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 2fr) 140px 120px 120px 120px",
        gap: 10,
        padding: "12px 16px",
        borderBottom: `1px solid ${t.line}`,
        alignItems: "center",
        fontSize: 13,
        color: t.ink,
        cursor: isRequested ? "pointer" : "default",
        background: isRequested ? t.warnBg : "transparent",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: t.brandSoft,
            color: t.brand,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon name="doc" size={14} />
        </div>
        <div style={{ minWidth: 0, overflow: "hidden" }}>
          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 700 }}>
            {doc.name}
          </div>
          {isRequested ? (
            <div style={{ fontSize: 10.5, fontWeight: 700, color: t.warn, letterSpacing: 0.4, marginTop: 2 }}>
              CLICK TO UPLOAD →
            </div>
          ) : null}
        </div>
      </div>
      <div>
        <Pill>{doc.category ?? "—"}</Pill>
      </div>
      <div>
        {loan ? (
          <Link
            href={`/loans/${loan.id}`}
            style={{
              color: t.petrol,
              textDecoration: "none",
              fontFamily: "ui-monospace, SF Mono, monospace",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {loan.deal_id}
          </Link>
        ) : (
          <span style={{ color: t.ink3 }}>—</span>
        )}
      </div>
      <div style={{ color: t.ink3, fontSize: 12 }}>
        {doc.received_on ? new Date(doc.received_on).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
      </div>
      <div>
        <VerifiedBadge kind={kind} />
      </div>
    </div>
  );
}

// Upload modal — kind picker (Experience vs Active asset) + loan picker
// + file input. Posts via the existing useUploadDocument hook which
// hits /documents/upload-init with the chosen category.
function UploadDocumentModal({
  open,
  onClose,
  loans,
  defaultKind,
  prefill,
}: {
  open: boolean;
  onClose: () => void;
  loans: Loan[];
  defaultKind: UploadKind;
  // Set when the modal was opened from a tap on a REQUESTED row in
  // the vault list or from a calendar deep-link (?fulfill=<doc_id>).
  // Pre-binds loan + checklist pick so the user goes straight from
  // file-pick to submit.
  prefill?: { loanId: string; fulfillDocId: string; name: string } | null;
}) {
  const { t } = useTheme();
  const upload = useUploadDocument();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [kind, setKind] = useState<UploadKind>(defaultKind);
  const [loanId, setLoanId] = useState<string>("");
  // pickedKey: identifies the selected checklist row. Format:
  //   "checklist:<key>"          → fulfill the existing requested row OR create a new one with that key
  //   "doc:<document_id>"        → fulfill a specific in-flight Document by id
  //   "other"                    → off-checklist upload (is_other=true)
  const [pickedKey, setPickedKey] = useState<string>("");
  const [otherLabel, setOtherLabel] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { data: required = [], isLoading: requiredLoading } = useRequiredDocuments(
    loanId || null,
  );

  // Reset state when the modal opens. When `prefill` is supplied
  // (smart-route from a REQUESTED row tap or calendar deep-link),
  // bind the loan + pickedKey from it so the user lands ready to
  // pick a file immediately.
  useEffect(() => {
    if (!open) return;
    if (prefill) {
      setLoanId(prefill.loanId);
      setPickedKey(`doc:${prefill.fulfillDocId}`);
      setKind(defaultKind);
      setFile(null);
      setError(null);
      setSuccess(null);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (file === null && error === null && loanId === "" && loans.length > 0) {
      setLoanId(loans[0]?.id ?? "");
      setKind(defaultKind);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill]);

  if (!open) return null;

  const resetSelection = () => {
    setPickedKey("");
    setOtherLabel("");
    setFile(null);
    setError(null);
    setSuccess(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = async () => {
    setError(null);
    setSuccess(null);
    if (!file) {
      setError("Pick a file first.");
      return;
    }
    if (!loanId) {
      setError("Pick a property/loan to attach this to.");
      return;
    }
    if (!pickedKey) {
      setError("Pick which document this is — or choose 'Other / not in checklist'.");
      return;
    }
    let fulfillId: string | null = null;
    let checklistKey: string | null = null;
    let isOther = false;
    let nameOverride: string | undefined = undefined;
    if (pickedKey === "other") {
      isOther = true;
      if (otherLabel.trim()) nameOverride = otherLabel.trim();
    } else if (pickedKey.startsWith("doc:")) {
      fulfillId = pickedKey.slice(4);
    } else if (pickedKey.startsWith("checklist:")) {
      checklistKey = pickedKey.slice(10);
      nameOverride = checklistKey ?? undefined;
    }
    try {
      await upload.mutateAsync({
        loan_id: loanId,
        file,
        name: nameOverride,
        category: kind,
        fulfill_document_id: fulfillId,
        checklist_key: checklistKey,
        is_other: isOther,
      });
      setSuccess(
        "Uploaded — the AI is reviewing your file. You'll see the verdict in Messages within a minute.",
      );
      // Reset for next upload but keep the modal open so the user
      // sees the toast.
      setFile(null);
      setPickedKey("");
      setOtherLabel("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Upload document"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(6, 7, 11, 0.55)",
        backdropFilter: "blur(2px)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          background: t.bg,
          borderRadius: 18,
          boxShadow: t.shadowLg,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: `1px solid ${t.line}`,
          }}
        >
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.6, textTransform: "uppercase", color: t.petrol }}>
              Upload to vault
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: t.ink, marginTop: 2 }}>
              Add a document
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              all: "unset",
              cursor: "pointer",
              width: 32,
              height: 32,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
              color: t.ink2,
            }}
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Kind picker */}
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.0, textTransform: "uppercase", marginBottom: 6 }}>
              What are you uploading?
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <KindCard
                t={t}
                title="Experience proof"
                hint="HUDs, closing statements, prior leases"
                icon="doc"
                accent={t.brand}
                accentBg={t.brandSoft}
                active={kind === "experience"}
                onClick={() => setKind("experience")}
              />
              <KindCard
                t={t}
                title="Active asset"
                hint="Bank notes, current leases, insurance"
                icon="home"
                accent={t.profit}
                accentBg={t.profitBg}
                active={kind === "active_asset"}
                onClick={() => setKind("active_asset")}
              />
            </div>
          </div>

          {/* Loan picker */}
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.0, textTransform: "uppercase", marginBottom: 5 }}>
              Attach to property / loan
            </div>
            {loans.length === 0 ? (
              <div style={{ fontSize: 12, color: t.ink3 }}>
                No loans yet — start one before uploading. Documents must link to a property in your portfolio.
              </div>
            ) : (
              <select
                value={loanId}
                onChange={(e) => setLoanId(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 9,
                  background: t.surface2,
                  border: `1px solid ${t.line}`,
                  color: t.ink,
                  fontSize: 13,
                  fontFamily: "inherit",
                  outline: "none",
                }}
              >
                {loans.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.deal_id} · {l.address ?? "(no address)"}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Checklist picker — drives `fulfill_document_id` /
              `checklist_key` / `is_other` on the upload payload.
              Must pick exactly one row before the file input enables. */}
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.0, textTransform: "uppercase", marginBottom: 5 }}>
              Which document is this?
            </div>
            {requiredLoading ? (
              <div style={{ fontSize: 12, color: t.ink3 }}>Loading checklist…</div>
            ) : required.length === 0 ? (
              <div style={{ fontSize: 12, color: t.ink3 }}>
                Couldn&apos;t resolve a checklist for this loan. Pick &quot;Other&quot; below.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 220, overflowY: "auto" }}>
                {required.map((r) => {
                  if (r.is_other) {
                    return (
                      <ChecklistRow
                        key="other"
                        t={t}
                        label="Other — not in checklist"
                        sub="The AI will try to classify it; if it doesn't match anything specific, an underwriter will follow up."
                        statusPill={null}
                        active={pickedKey === "other"}
                        disabled={false}
                        onClick={() => setPickedKey("other")}
                      />
                    );
                  }
                  const id = r.current_document_id
                    ? `doc:${r.current_document_id}`
                    : `checklist:${r.checklist_key}`;
                  const fulfilled = r.current_status === "verified" || r.current_status === "received";
                  const inFlight = r.current_status === "pending";
                  const requested = r.current_status === "requested";
                  let statusPill: { label: string; bg: string; fg: string } | null = null;
                  if (fulfilled) statusPill = { label: r.current_status === "verified" ? "Verified" : "Received", bg: t.profitBg, fg: t.profit };
                  else if (inFlight) statusPill = { label: "In review", bg: t.warnBg, fg: t.warn };
                  else if (requested) {
                    const days = r.days_since_requested ?? 0;
                    statusPill = { label: `Requested · ${days}d`, bg: t.surface2, fg: t.ink3 };
                  }
                  return (
                    <ChecklistRow
                      key={id}
                      t={t}
                      label={r.label}
                      sub={fulfilled ? "Already on file" : r.required ? "Required" : undefined}
                      statusPill={statusPill}
                      active={pickedKey === id}
                      disabled={fulfilled}
                      onClick={() => !fulfilled && setPickedKey(id)}
                    />
                  );
                })}
              </div>
            )}
            {pickedKey === "other" ? (
              <input
                value={otherLabel}
                onChange={(e) => setOtherLabel(e.target.value)}
                placeholder="Briefly describe what this is (optional)"
                style={{
                  marginTop: 8,
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 9,
                  background: t.surface2,
                  border: `1px solid ${t.line}`,
                  color: t.ink,
                  fontSize: 13,
                  fontFamily: "inherit",
                  outline: "none",
                }}
              />
            ) : null}
          </div>

          {/* File picker — disabled until a checklist row is picked. */}
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.0, textTransform: "uppercase", marginBottom: 5 }}>
              File
            </div>
            <input
              ref={fileRef}
              type="file"
              disabled={!pickedKey}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 9,
                background: t.surface2,
                border: `1px solid ${t.line}`,
                color: t.ink,
                fontSize: 13,
                fontFamily: "inherit",
                opacity: pickedKey ? 1 : 0.5,
              }}
            />
            {file ? (
              <div style={{ fontSize: 11, color: t.ink3, marginTop: 4 }}>
                {file.name} · {(file.size / 1024).toFixed(1)} KB
              </div>
            ) : null}
          </div>

          {error ? (
            <div style={{ marginTop: -2 }}>
              <Pill bg={t.dangerBg} color={t.danger}>{error}</Pill>
            </div>
          ) : null}
          {success ? (
            <div style={{ marginTop: -2 }}>
              <Pill bg={t.profitBg} color={t.profit}>{success}</Pill>
            </div>
          ) : null}

          <div style={{ marginTop: 6, display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button onClick={onClose} style={qcBtn(t)}>Cancel</button>
            <button
              onClick={submit}
              disabled={upload.isPending || loans.length === 0 || !file}
              style={{
                ...qcBtnPrimary(t),
                opacity: upload.isPending || loans.length === 0 || !file ? 0.5 : 1,
                cursor: upload.isPending || loans.length === 0 || !file ? "not-allowed" : "pointer",
              }}
            >
              {upload.isPending ? "Uploading…" : "Upload"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChecklistRow({
  t,
  label,
  sub,
  statusPill,
  active,
  disabled,
  onClick,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  sub?: string;
  statusPill: { label: string; bg: string; fg: string } | null;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        all: "unset",
        cursor: disabled ? "not-allowed" : "pointer",
        padding: "9px 11px",
        borderRadius: 9,
        border: `1px solid ${active ? t.petrol : t.line}`,
        background: active ? t.brandSoft : "transparent",
        opacity: disabled ? 0.55 : 1,
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: 4,
          border: `1.5px solid ${active ? t.petrol : t.line}`,
          background: active ? t.petrol : "transparent",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flex: "0 0 auto",
        }}
      >
        {active ? <Icon name="check" size={11} color="#fff" stroke={3} /> : null}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {label}
        </div>
        {sub ? (
          <div style={{ fontSize: 10.5, color: t.ink3, marginTop: 2 }}>{sub}</div>
        ) : null}
      </div>
      {statusPill ? (
        <Pill bg={statusPill.bg} color={statusPill.fg}>{statusPill.label}</Pill>
      ) : null}
    </button>
  );
}

function KindCard({
  t,
  title,
  hint,
  icon,
  accent,
  accentBg,
  active,
  onClick,
}: {
  t: ReturnType<typeof useTheme>["t"];
  title: string;
  hint: string;
  icon: "doc" | "home";
  accent: string;
  accentBg: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        all: "unset",
        cursor: "pointer",
        padding: 12,
        borderRadius: 12,
        border: `1.5px solid ${active ? accent : t.line}`,
        background: active ? accentBg : t.surface2,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name={icon} size={16} color={accent} />
        <span style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>{title}</span>
      </div>
      <span style={{ fontSize: 11, color: t.ink2, lineHeight: 1.4 }}>{hint}</span>
    </button>
  );
}
