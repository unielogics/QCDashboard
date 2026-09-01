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
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import {
  Btn,
  BtnLink,
  CellChip,
  Empty,
  Field,
  Input,
  Kpi,
  KpiRow,
  Loading,
  PageHeader,
  Panel,
  Row,
  Seg,
  Select,
  Table,
  Tag,
  Td,
  cx,
  type ChipTone,
  type Col,
} from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { Icon } from "@/components/design-system/Icon";
import {
  useCurrentUser,
  useDocuments,
  useLoans,
  useRequiredDocuments,
  useUploadDocument,
  useVaultLoanDocuments,
  useVaultLoanFiles,
  type VaultSection,
} from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import type { Document, Loan, User, VaultLoanSummary } from "@/lib/types";
import { PageActionMenu } from "@/components/ds/PageActionMenu";

type UploadKind = "experience" | "active_asset";
type LoanOption = Pick<Loan, "id" | "deal_id" | "address">;

// Three tabs:
//   requested    — open AI-driven asks (checklist items the AI auto-
//                  requested at intake or via reminders). Click a row
//                  → upload modal pre-bound to that doc.
//   experience   — proof of past deals
//   active_asset — currently-owned real estate
type VaultTab = "requested" | "experience" | "active_asset";

// Match the mobile heuristic: docs with no category default to the
// experience tab (where the vault originally lived). The new
// "requested" tab filters by status, not category.
function tabFor(category: string | null | undefined): VaultTab {
  if (category === "active_asset") return "active_asset";
  return "experience";
}

const DOC_COLS: Col[] = [
  { label: "Document" },
  { label: "Category", width: 150 },
  { label: "Loan", width: 130 },
  { label: "Received", width: 120 },
  { label: "Status", width: 120 },
];

export default function VaultPage() {
  const { data: user, isLoading, isError } = useCurrentUser();
  if (isLoading || !user) {
    return (
      <div className="grid">
        <PageHeader title="Vault" />
        <Panel>{isError ? <Empty title="Vault unavailable">Retry after your session reconnects.</Empty> : <Loading />}</Panel>
      </div>
    );
  }
  return user.role === Role.CLIENT ? <PersonalVaultPage /> : <OperatorVaultPage user={user} />;
}

const VAULT_LOAN_COLS: Col[] = [
  { label: "Loan ID", width: 124 },
  { label: "Entity / property" },
  { label: "Stage", width: 116 },
  { label: "Docs", width: 66, align: "r" },
  { label: "Attention", width: 92, align: "r" },
  { label: "Updated", width: 96 },
];

const VAULT_DOCUMENT_COLS: Col[] = [
  { label: "Document" },
  { label: "Received", width: 88 },
  { label: "Status", width: 96 },
];

function OperatorVaultPage({ user }: { user: User }) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);
  const [section, setSection] = useState<VaultSection>("all");
  const [documentSearchInput, setDocumentSearchInput] = useState("");
  const [documentSearch, setDocumentSearch] = useState("");
  const [documentOffset, setDocumentOffset] = useState(0);
  const [uploadOpen, setUploadOpen] = useState(false);
  const limit = 20;
  const documentLimit = 25;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setOffset(0);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDocumentSearch(documentSearchInput.trim());
      setDocumentOffset(0);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [documentSearchInput]);

  const loanFiles = useVaultLoanFiles({ search, limit, offset });
  const loanItems = useMemo(() => loanFiles.data?.items ?? [], [loanFiles.data?.items]);

  useEffect(() => {
    if (selectedLoanId && loanItems.some((item) => item.loan_id === selectedLoanId)) return;
    setSelectedLoanId(loanItems[0]?.loan_id ?? null);
  }, [loanItems, selectedLoanId]);

  useEffect(() => {
    setDocumentOffset(0);
  }, [selectedLoanId, section]);

  const selectedLoan = loanItems.find((item) => item.loan_id === selectedLoanId) ?? null;
  const loanDocuments = useVaultLoanDocuments(selectedLoanId, {
    section,
    search: documentSearch,
    limit: documentLimit,
    offset: documentOffset,
  });
  const borrowerGroups = useMemo(() => {
    const groups = new Map<string, { borrowerId: string; borrowerName: string; items: VaultLoanSummary[] }>();
    for (const item of loanItems) {
      const current = groups.get(item.borrower_id);
      if (current) current.items.push(item);
      else groups.set(item.borrower_id, { borrowerId: item.borrower_id, borrowerName: item.borrower_name, items: [item] });
    }
    return [...groups.values()];
  }, [loanItems]);

  const totals = loanFiles.data?.totals;
  const totalLoanFiles = loanFiles.data?.total ?? 0;
  const totalDocuments = loanDocuments.data?.total ?? 0;
  const canUpload = user.role !== Role.REGIONAL_MANAGER && !!selectedLoan;
  const uploadLoans: LoanOption[] = selectedLoan
    ? [{ id: selectedLoan.loan_id, deal_id: selectedLoan.deal_id, address: selectedLoan.address }]
    : [];

  return (
    <div className="grid operator-vault">
      <PageHeader
        title="Vault"
        lede={<CellChip tone="acc">Funding evidence</CellChip>}
        actions={
          <>
            <Btn variant="pri" onClick={() => setUploadOpen(true)} disabled={!canUpload}>
              <Icon name="plus" size={14} /> Upload to loan
            </Btn>
            <PageActionMenu items={[{ label: "Prequalifications", href: "/admin/prequal-requests" }, { label: "Calendar", href: "/calendar" }]} />
          </>
        }
      />
      <div className="sub">Borrower folders · loan IDs · funding evidence</div>

      <KpiRow>
        <Kpi label="Borrowers" value={totals?.borrowers ?? "—"} sub="With Vault activity" icon="user" />
        <Kpi label="Loan files" value={totals?.loan_files ?? "—"} sub="Grouped by loan ID" icon="vault" />
        <Kpi label="Documents" value={totals?.documents ?? "—"} sub="Across visible files" icon="doc" />
        <Kpi label="Need attention" value={totals?.need_attention ?? "—"} sub="Requested or flagged" icon="alert" tone="warn" />
      </KpiRow>

      <UploadDocumentModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        loans={uploadLoans}
        defaultKind="experience"
      />

      <div className="vault-operator-layout">
        <Panel
          title="Borrower loan folders"
          sub={totalLoanFiles ? `${offset + 1}–${Math.min(offset + limit, totalLoanFiles)} of ${totalLoanFiles}` : "No matching files"}
          noPad
        >
          <div className="vault-panel-controls">
            <div className="vault-search">
              <Icon name="search" size={14} />
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search borrower, loan ID, entity, address, or document"
                aria-label="Search borrower loan folders"
              />
            </div>
          </div>
          {loanFiles.isLoading ? (
            <Loading>Loading borrower folders…</Loading>
          ) : loanFiles.isError ? (
            <Empty title="Could not load Vault folders" action={<Btn onClick={() => loanFiles.refetch()}>Retry</Btn>} />
          ) : borrowerGroups.length === 0 ? (
            <Empty icon="vault" title="No loan folders found">Try a different search or upload from a loan file.</Empty>
          ) : (
            <Table cols={VAULT_LOAN_COLS} caption="Borrower loan folders" className="vault-loan-table">
              {borrowerGroups.map((group) => (
                <BorrowerLoanRows
                  key={group.borrowerId}
                  borrowerName={group.borrowerName}
                  items={group.items}
                  selectedLoanId={selectedLoanId}
                  onSelect={setSelectedLoanId}
                />
              ))}
            </Table>
          )}
          <VaultPager
            offset={offset}
            limit={limit}
            total={totalLoanFiles}
            onChange={setOffset}
            label="loan folders"
          />
        </Panel>

        <Panel
          title={selectedLoan ? `${selectedLoan.borrower_name} · ${selectedLoan.deal_id}` : "Loan documents"}
          sub={selectedLoan?.entity_name ?? selectedLoan?.address}
          actions={selectedLoan ? <BtnLink href={`/loans/${selectedLoan.loan_id}`} size="sm">Open loan</BtnLink> : undefined}
          noPad
        >
          {!selectedLoan ? (
            <Empty icon="doc" title="Select a loan folder">Documents load one loan at a time.</Empty>
          ) : (
            <>
              <div className="vault-panel-controls vault-document-controls">
                <Seg<VaultSection>
                  value={section}
                  onChange={setSection}
                  ariaLabel="Loan document section"
                  options={[
                    { value: "all", label: "All" },
                    { value: "attention", label: "Attention" },
                    { value: "requested", label: "Requested" },
                    { value: "experience", label: "Experience" },
                    { value: "active_asset", label: "Active assets" },
                  ]}
                />
                <div className="vault-search compact">
                  <Icon name="search" size={14} />
                  <Input
                    value={documentSearchInput}
                    onChange={(event) => setDocumentSearchInput(event.target.value)}
                    placeholder="Search this loan"
                    aria-label="Search documents in selected loan"
                  />
                </div>
              </div>
              {loanDocuments.isLoading ? (
                <Loading>Loading loan documents…</Loading>
              ) : loanDocuments.isError ? (
                <Empty title="Could not load this loan" action={<Btn onClick={() => loanDocuments.refetch()}>Retry</Btn>} />
              ) : (loanDocuments.data?.items.length ?? 0) === 0 ? (
                <Empty icon="doc" title="No documents in this view">Change the filter or upload evidence to this loan.</Empty>
              ) : (
                <Table cols={VAULT_DOCUMENT_COLS} caption={`Documents for ${selectedLoan.deal_id}`}>
                  {loanDocuments.data?.items.map((document) => (
                    <OperatorDocumentRow key={document.id} document={document} />
                  ))}
                </Table>
              )}
              <VaultPager
                offset={documentOffset}
                limit={documentLimit}
                total={totalDocuments}
                onChange={setDocumentOffset}
                label="documents"
              />
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}

function BorrowerLoanRows({
  borrowerName,
  items,
  selectedLoanId,
  onSelect,
}: {
  borrowerName: string;
  items: VaultLoanSummary[];
  selectedLoanId: string | null;
  onSelect: (loanId: string) => void;
}) {
  return (
    <>
      <tr className="vault-borrower-row">
        <Td colSpan={VAULT_LOAN_COLS.length}>
          <span className="vault-borrower-name"><Icon name="user" size={14} /> {borrowerName}</span>
          <span className="sub">{items.length} {items.length === 1 ? "loan" : "loans"} on this page</span>
        </Td>
      </tr>
      {items.map((item) => {
        const attention = item.requested + item.flagged;
        const selected = item.loan_id === selectedLoanId;
        return (
          <tr
            key={item.loan_id}
            className={cx("vault-loan-row", selected && "is-selected")}
            onClick={() => onSelect(item.loan_id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(item.loan_id);
              }
            }}
            role="button"
            tabIndex={0}
            aria-pressed={selected}
          >
            <Td><span className="mono vault-deal-id">{item.deal_id}</span></Td>
            <Td>
              <b>{item.entity_name ?? item.address}</b>
              <div className="sub vault-property-line">{item.entity_name ? item.address : [item.city, item.state].filter(Boolean).join(", ") || "Address pending"}</div>
            </Td>
            <Td><CellChip tone="mut">{humanize(item.stage)}</CellChip></Td>
            <Td align="r"><b>{item.documents}</b></Td>
            <Td align="r">{attention ? <CellChip tone="warn">{attention}</CellChip> : <CellChip tone="ok">Clear</CellChip>}</Td>
            <Td><span className="sub">{formatShortDate(item.updated_at)}</span></Td>
          </tr>
        );
      })}
    </>
  );
}

function OperatorDocumentRow({ document }: { document: Document }) {
  const status = documentStatus(document);
  return (
    <tr>
      <Td>
        <div className="vault-document-name">
          <span className="vault-file-icon"><Icon name="doc" size={14} /></span>
          <div><b>{document.name}</b><div className="sub">{humanize(document.category ?? document.checklist_key ?? "Uncategorized")}</div></div>
        </div>
      </Td>
      <Td><span className="sub">{document.received_on ? formatShortDate(document.received_on) : "—"}</span></Td>
      <Td><CellChip tone={status.tone}>{status.label}</CellChip></Td>
    </tr>
  );
}

function VaultPager({
  offset,
  limit,
  total,
  onChange,
  label,
}: {
  offset: number;
  limit: number;
  total: number;
  onChange: (offset: number) => void;
  label: string;
}) {
  if (total <= limit) return null;
  return (
    <div className="vault-pager">
      <span className="sub">{offset + 1}–{Math.min(offset + limit, total)} of {total} {label}</span>
      <span className="sp" />
      <Btn size="sm" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}><Icon name="chevL" size={13} /> Previous</Btn>
      <Btn size="sm" disabled={offset + limit >= total} onClick={() => onChange(offset + limit)}>Next <Icon name="chevR" size={13} /></Btn>
    </div>
  );
}

function humanize(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatShortDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}

function documentStatus(document: Document): { label: string; tone: ChipTone } {
  if (document.status === "verified") return { label: "Verified", tone: "ok" };
  if (document.status === "flagged") return { label: "Flagged", tone: "bad" };
  if (document.status === "requested") return { label: "Requested", tone: "warn" };
  if (document.status === "received") return { label: "Received", tone: "acc" };
  return { label: "Pending", tone: "warn" };
}

function PersonalVaultPage() {
  const { data: loans = [] } = useLoans();
  const { data: docs = [] } = useDocuments();
  const [tab, setTab] = useState<VaultTab>("requested");

  const isClient = true;

  const tabCounts = useMemo(() => ({
    requested: docs.filter((d) => d.status === "requested").length,
    experience: docs.filter((d) => d.status !== "requested" && tabFor(d.category) === "experience").length,
    active_asset: docs.filter((d) => d.status !== "requested" && tabFor(d.category) === "active_asset").length,
  }), [docs]);

  const filtered = useMemo(() => {
    if (tab === "requested") {
      return docs.filter((d) => d.status === "requested");
    }
    return docs.filter((d) => d.status !== "requested" && tabFor(d.category) === tab);
  }, [docs, tab]);

  // First-load default: land on Requested whenever there's an open
  // request (the AI's task list); otherwise on Experience.
  const defaultedRef = useRef(false);
  useEffect(() => {
    if (defaultedRef.current) return;
    if (tabCounts.requested > 0) {
      setTab("requested");
      defaultedRef.current = true;
    } else if (tabCounts.experience > 0 || tabCounts.active_asset > 0) {
      setTab("experience");
      defaultedRef.current = true;
    }
  }, [tabCounts.requested, tabCounts.experience, tabCounts.active_asset]);

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
    <div className="grid">
      {/* Per Architecture decision #6: every doc surfaced here is a
          lender-required (Funding) document — labeled clearly so the
          Borrower can distinguish from Agent-requested transaction docs
          that join the unified view in P1. */}
      <PageHeader
        title="Vault"
        lede={<CellChip tone="acc">Funding</CellChip>}
        actions={
          <>
            <Btn variant="pri" onClick={() => setUploadOpen(true)}>
              <Icon name="plus" size={14} /> Upload
            </Btn>
            <PageActionMenu items={[{ label: "Prequalifications", href: "/admin/prequal-requests", hidden: isClient }, { label: "Calendar", href: "/calendar" }]} />
          </>
        }
      />
      <div className="sub">
        {isClient
          ? "Your document vault — funding documents requested by Qualified Commercial / Lender. Experience = proof of past deals. Active assets = real estate you currently own. Transaction documents requested by your Agent will join here in P1."
          : "Borrower-style document view, split by experience proof vs. active assets. Lender-required only — Agent-requested transaction docs join in P1."}
      </div>

      <Row>
        <Seg<VaultTab>
          value={tab}
          onChange={setTab}
          ariaLabel="Vault section"
          options={[
            { value: "requested", label: <>Requested <span className="tag">{tabCounts.requested}</span></> },
            { value: "experience", label: <>Experience <span className="tag">{tabCounts.experience}</span></> },
            { value: "active_asset", label: <>Active assets <span className="tag">{tabCounts.active_asset}</span></> },
          ]}
        />
      </Row>

      <UploadDocumentModal
        open={uploadOpen}
        onClose={() => {
          setUploadOpen(false);
          setPrefill(null);
        }}
        loans={loans}
        defaultKind={tab === "requested" ? "experience" : tab}
        prefill={prefill}
      />

      {filtered.length === 0 ? (
        <Panel>
          <div className="sub" style={{ textAlign: "center", padding: "20px 0", lineHeight: 1.55 }}>
            {tab === "requested"
              ? "Nothing requested right now. When the AI requests a document, it'll show up here. Click a row to upload."
              : tab === "experience"
                ? "No experience proof yet. Upload HUDs, closing statements, deeds, or prior leases from past deals to count toward your investor experience tier."
                : "No active assets yet. Upload bank notes, leases, insurance, or tax bills for properties you currently own."}
          </div>
        </Panel>
      ) : (
        <Panel noPad>
          <Table cols={DOC_COLS} caption="Vault documents">
            {filtered.map((d) => (
              <DocRow
                key={d.id}
                doc={d}
                loan={loanById[d.loan_id]}
                onTapRequested={d.status === "requested" ? () => onTapRequestedDoc(d) : undefined}
              />
            ))}
          </Table>
        </Panel>
      )}
    </div>
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
  // Same three-way split VerifiedBadge carried; the chip tones hold it now.
  const kind = doc.status === "verified"
    ? "verified"
    : doc.status === "flagged"
    ? "flagged"
    : "pending";
  const statusTone: ChipTone = kind === "verified" ? "ok" : kind === "flagged" ? "bad" : "warn";
  const statusLabel = kind === "verified" ? "Verified" : kind === "flagged" ? "Flagged" : "Pending";
  const isRequested = !!onTapRequested;
  return (
    <tr
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
      // Status-derived tint on the row that is also the call to action; the
      // stylesheet has no "row needs you" state to reach for.
      style={isRequested ? { cursor: "pointer", background: "var(--warn-tint)" } : undefined}
    >
      <Td>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: "var(--accent-100)",
              color: "var(--accent)",
              display: "inline-grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <Icon name="doc" size={14} />
          </span>
          <div style={{ minWidth: 0 }}>
            <b>{doc.name}</b>
            {isRequested ? (
              <div style={{ marginTop: 3 }}>
                <CellChip tone="warn">Click to upload →</CellChip>
              </div>
            ) : null}
          </div>
        </div>
      </Td>
      <Td>
        <Tag>{doc.category ?? "—"}</Tag>
      </Td>
      <Td>
        {loan ? (
          // `.linky` owns colour and weight, `.mono` the machine face a deal
          // id is set in. Both are classes now — this used to hand-copy the
          // font stack because `.mono` did not exist yet.
          <Link href={`/loans/${loan.id}`} className="linky mono">
            {loan.deal_id}
          </Link>
        ) : (
          <span className="sub">—</span>
        )}
      </Td>
      <Td>
        <span className="sub">
          {doc.received_on ? new Date(doc.received_on).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
        </span>
      </Td>
      <Td>
        <CellChip tone={statusTone}>{statusLabel}</CellChip>
      </Td>
    </tr>
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
  loans: LoanOption[];
  defaultKind: UploadKind;
  // Set when the modal was opened from a tap on a REQUESTED row in
  // the vault list or from a calendar deep-link (?fulfill=<doc_id>).
  // Pre-binds loan + checklist pick so the user goes straight from
  // file-pick to submit.
  prefill?: { loanId: string; fulfillDocId: string; name: string } | null;
}) {
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

  const submitDisabled = upload.isPending || loans.length === 0 || !file;

  return (
    <Drawer
      open
      onClose={onClose}
      width="md"
      // The old dialog had no backdrop dismiss, and this one holds a
      // half-filled form — losing it to a stray click is not an upgrade.
      closeOnBackdrop={false}
      title="Add a document"
      sub="Upload to vault"
      bodyClass="grid"
      footer={
        <>
          {/* `.sp` is the sheet's spacer — the same one `.panel-h` uses to push
              its actions right. */}
          <span className="sp" />
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="pri" onClick={submit} disabled={submitDisabled}>
            {upload.isPending ? "Uploading…" : "Upload"}
          </Btn>
        </>
      }
    >
      {/* Kind picker */}
      <Field label="What are you uploading?">
        <div>
          <KindCard
            title="Experience proof"
            hint="HUDs, closing statements, prior leases"
            icon="doc"
            active={kind === "experience"}
            onClick={() => setKind("experience")}
          />
          <KindCard
            title="Active asset"
            hint="Bank notes, current leases, insurance"
            icon="home"
            active={kind === "active_asset"}
            onClick={() => setKind("active_asset")}
          />
        </div>
      </Field>

      {/* Loan picker */}
      <Field label="Attach to property / loan">
        {loans.length === 0 ? (
          <span className="sub">
            No loans yet — start one before uploading. Documents must link to a property in your portfolio.
          </span>
        ) : (
          <Select value={loanId} onChange={(e) => setLoanId(e.target.value)} aria-label="Attach to property / loan">
            {loans.map((l) => (
              <option key={l.id} value={l.id}>
                {l.deal_id} · {l.address ?? "(no address)"}
              </option>
            ))}
          </Select>
        )}
      </Field>

      {/* Checklist picker — drives `fulfill_document_id` /
          `checklist_key` / `is_other` on the upload payload.
          Must pick exactly one row before the file input enables. */}
      <Field label="Which document is this?">
        {requiredLoading ? (
          <span className="sub">Loading checklist…</span>
        ) : required.length === 0 ? (
          <span className="sub">
            Couldn&apos;t resolve a checklist for this loan. Pick &quot;Other&quot; below.
          </span>
        ) : (
          <div style={{ maxHeight: 240, overflowY: "auto" }}>
            {required.map((r) => {
              if (r.is_other) {
                return (
                  <ChecklistRow
                    key="other"
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
              let statusPill: { label: string; tone: ChipTone } | null = null;
              if (fulfilled) statusPill = { label: r.current_status === "verified" ? "Verified" : "Received", tone: "ok" };
              else if (inFlight) statusPill = { label: "In review", tone: "warn" };
              else if (requested) {
                const days = r.days_since_requested ?? 0;
                statusPill = { label: `Requested · ${days}d`, tone: "mut" };
              }
              return (
                <ChecklistRow
                  key={id}
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
          <Input
            value={otherLabel}
            onChange={(e) => setOtherLabel(e.target.value)}
            placeholder="Briefly describe what this is (optional)"
            aria-label="Describe this document"
          />
        ) : null}
      </Field>

      {/* File picker — disabled until a checklist row is picked. */}
      <Field
        label="File"
        hint={file ? `${file.name} · ${(file.size / 1024).toFixed(1)} KB` : undefined}
      >
        <input
          ref={fileRef}
          type="file"
          className="field"
          disabled={!pickedKey}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          style={pickedKey ? undefined : { opacity: 0.5 }}
        />
      </Field>

      {error ? <StatusLine tone="bad">{error}</StatusLine> : null}
      {success ? <StatusLine tone="ok">{success}</StatusLine> : null}
    </Drawer>
  );
}

/**
 * Tinted status block. This hand-rolled its own box because the sheet had no
 * full-width variant of the tone chips; `.statusline` is now exactly that — the
 * `.cellchip` vocabulary in a block that wraps. Kept as a local wrapper rather
 * than swapped for `StatusLine` from "@/components/ds" only because that one
 * takes no `role`, and a failure here has to be announced, not just shown.
 */
function StatusLine({ tone, children }: { tone: ChipTone; children: ReactNode }) {
  return (
    <div className={cx("statusline", `c-${tone}`)} role={tone === "bad" ? "alert" : "status"}>
      {children}
    </div>
  );
}

function ChecklistRow({
  label,
  sub,
  statusPill,
  active,
  disabled,
  onClick,
}: {
  label: string;
  sub?: string;
  statusPill: { label: string; tone: ChipTone } | null;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx("pick", "btnreset", active && "on")}
      // `.btnreset` fills the column and reads left. The dimming is
      // state-derived, and the cursor override is there because `.pick` says
      // `pointer` and on a disabled row that is a lie.
      style={disabled ? { opacity: 0.55, cursor: "not-allowed" } : undefined}
    >
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: 4,
          border: `1.5px solid ${active ? "var(--accent)" : "var(--line2)"}`,
          background: active ? "var(--accent)" : "transparent",
          display: "inline-grid",
          placeItems: "center",
          flex: "0 0 auto",
        }}
      >
        {active ? <Icon name="check" size={11} color="#fff" stroke={3} /> : null}
      </span>
      <span className="grow">
        <b style={{ display: "block", fontWeight: 600 }}>{label}</b>
        {sub ? <span className="sub" style={{ display: "block", marginTop: 2 }}>{sub}</span> : null}
      </span>
      {statusPill ? <CellChip tone={statusPill.tone}>{statusPill.label}</CellChip> : null}
    </button>
  );
}

function KindCard({
  title,
  hint,
  icon,
  active,
  onClick,
}: {
  title: string;
  hint: string;
  icon: "doc" | "home";
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx("pick", "btnreset", active && "on")}
    >
      <Icon name={icon} size={16} />
      <span className="grow">
        <b style={{ display: "block" }}>{title}</b>
        <span className="sub" style={{ display: "block", marginTop: 2 }}>{hint}</span>
      </span>
    </button>
  );
}
