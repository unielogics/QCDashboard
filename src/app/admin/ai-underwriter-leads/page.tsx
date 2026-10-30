"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { uploadFile } from "@/lib/fileUpload";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Btn, Callout, CellChip, cx, Input, Select, WarnLine } from "@/components/ds";
import { PageActionMenu } from "@/components/ds/PageActionMenu";
import { PinRowButton, TableWorkspace } from "@/components/ds/TableWorkspace";
import { Icon } from "@/components/design-system/Icon";
import { api, ApiError } from "@/lib/api";
import { documentUploadErrorMessage, passwordProtectedPdfUploadNotice, screenPdfUploads } from "@/lib/documentUpload";
import { Role } from "@/lib/enums.generated";
import { useCurrentUser, useUnifiedOperatorFiles } from "@/hooks/useApi";
import { WhatsNewRail } from "@/components/admin/WhatsNewRail";
import { semanticStatusClass } from "@/lib/semanticStatus";
import { FileEconomicsDrawer } from "@/components/operator/FileEconomicsDrawer";
import { mcaRefinanceReviewState } from "@/lib/mcaRefinanceReview";
import { originTone, verticalTone, type UnifiedFileRow } from "@/lib/unifiedOperator";
import type { ApplicationProfile } from "@/lib/applicationProfile";
import { capitalReadinessBandLabel, capitalReadinessBandTone, listReadinessSummary } from "@/lib/capitalReadiness";
import { resolveIntakeWorkspaceState } from "@/lib/intakeWorkspace";
import { nonIntakeClientLeadsFromGlobalSearch } from "@/lib/intakeSearch";
import type { GroupedResults } from "@/lib/types";
import { usePinnedRows } from "@/lib/tablePinning";
import { useConsoleAuth } from "@/lib/consoleAuth";
import { CreateLeadPayload, DEFAULT_PAGE_SIZE, LeadDetail, LeadPage, LeadRow, PAGE_SIZES, PROBABILITY_FILTERS, STATUS_FILTERS, VARIANT_FILTERS, apiErrorMessage, formatMoney, intakeStatusPresentation, presentContact, probabilityTone, variantLabel } from "@/components/file/leadFile";
import { ConfirmDeleteLeadModal, Stat } from "@/components/file/LeadDetailPanel";
import { CreateLeadModal } from "@/components/file/CreateLeadModal";
import { fileHref, sectionFromLegacyParams } from "@/components/file/FileRail";

export default function AdminAIUnderwriterLeadsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { getToken } = useConsoleAuth();
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const { data: unifiedFiles, refetch: refetchUnifiedFiles } = useUnifiedOperatorFiles({ limit: 500 });
  const leadParam = searchParams.get("lead");
  const partnerUserId = searchParams.get("partner");
  const requestedStep = searchParams.get("step");
  const isIntakeOperator = me?.role === Role.SUPER_ADMIN || me?.role === Role.LOAN_EXEC;
  const canGovern = me?.role === Role.SUPER_ADMIN;
  // Delete is the desk's — super admin and underwriting — and nobody else's.
  const canDelete = me?.role === Role.SUPER_ADMIN || me?.role === Role.LOAN_EXEC;
  const [deleteRow, setDeleteRow] = useState<LeadRow | null>(null);
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [archivedFilter, setArchivedFilter] = useState<"active" | "archived" | "all">("active");
  const [variantFilter, setVariantFilter] = useState(searchParams.get("variant") || "all");
  const [probabilityFilter, setProbabilityFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [archivedSearchMatch, setArchivedSearchMatch] = useState<{ count: number; query: string } | null>(null);
  const [nonIntakeLeadMatches, setNonIntakeLeadMatches] = useState<Array<{ id: string; name: string }>>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [economicsRow, setEconomicsRow] = useState<UnifiedFileRow | null>(null);
  const listShellRef = useRef<HTMLDivElement | null>(null);
  const leadListRequestRef = useRef(0);
  const leadListLoadingRequestRef = useRef(0);

  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await getToken();
    return api<T>(path, { ...init, authToken: token ?? undefined });
  }

  // A file opens on its own page; this list is the directory.
  function openLead(id: string) {
    router.push(fileHref(id));
  }

  async function loadLeads(nextOffset = offset, options: { background?: boolean } = {}) {
    const requestId = ++leadListRequestRef.current;
    setArchivedSearchMatch(null);
    setNonIntakeLeadMatches([]);
    if (!options.background) {
      leadListLoadingRequestRef.current = requestId;
      setLoading(true);
      setNotice("");
    }
    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(nextOffset),
        status_filter: statusFilter,
        probability_status: probabilityFilter,
        variant_filter: variantFilter,
        archived_filter: archivedFilter,
      });
      if (submittedQuery.trim()) params.set("q", submittedQuery.trim());
      if (partnerUserId) params.set("partner_user_id", partnerUserId);
      const data = await call<LeadPage>(`/admin/ai-underwriter-leads?${params.toString()}`);
      if (requestId !== leadListRequestRef.current) return;
      let closedOrArchivedMatch: { count: number; query: string } | null = null;
      let clientLeadMatches: Array<{ id: string; name: string }> = [];
      const identityDiscoveryIsUnfiltered = statusFilter === "all"
        && probabilityFilter === "all"
        && variantFilter === "all";
      if (!data.items.length && archivedFilter === "active" && submittedQuery.trim() && identityDiscoveryIsUnfiltered) {
        const archivedParams = new URLSearchParams(params);
        archivedParams.set("limit", "1");
        archivedParams.set("offset", "0");
        archivedParams.set("status_filter", "all");
        archivedParams.set("probability_status", "all");
        archivedParams.set("variant_filter", "all");
        archivedParams.set("archived_filter", "archived");
        try {
          const archived = await call<LeadPage>(`/admin/ai-underwriter-leads?${archivedParams.toString()}`);
          if (requestId !== leadListRequestRef.current) return;
          if (archived.total > 0) closedOrArchivedMatch = { count: archived.total, query: submittedQuery.trim() };
        } catch {
          // The primary list remains useful if this optional discovery check fails.
        }
      }
      if (!data.items.length && !closedOrArchivedMatch && archivedFilter === "active" && submittedQuery.trim() && identityDiscoveryIsUnfiltered && !partnerUserId) {
        try {
          const groups = await call<GroupedResults[]>(`/search?q=${encodeURIComponent(submittedQuery.trim())}`);
          if (requestId !== leadListRequestRef.current) return;
          clientLeadMatches = nonIntakeClientLeadsFromGlobalSearch(groups);
        } catch {
          // This is a scoped discovery aid. Never weaken the primary Intake
          // search or expose an unscoped result when the directory is absent.
        }
      }
      if (requestId !== leadListRequestRef.current) return;
      setRows(data.items);
      setTotal(data.total);
      setOffset(data.offset);
      setArchivedSearchMatch(closedOrArchivedMatch);
      setNonIntakeLeadMatches(clientLeadMatches);
      if (!data.items.length && !closedOrArchivedMatch && !clientLeadMatches.length) setNotice("No AI Intake files match these filters.");
    } catch (error) {
      if (requestId === leadListRequestRef.current) {
        setNotice(error instanceof Error ? error.message : "AI Intake files are unavailable.");
      }
    } finally {
      if (!options.background && requestId === leadListLoadingRequestRef.current) setLoading(false);
    }
  }

  async function createLead(payload: CreateLeadPayload, evidenceFiles: File[]): Promise<LeadDetail | undefined> {
    setCreating(true);
    setNotice("");
    try {
      const screened = await screenPdfUploads(evidenceFiles);
      const lockedNotice = screened.rejected.length ? passwordProtectedPdfUploadNotice(screened.rejected) : "";
      if (!screened.uploadable.length && screened.rejected.length) {
        setNotice(lockedNotice);
        return;
      }
      const res = await call<LeadDetail>("/admin/ai-underwriter-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const profile = await call<ApplicationProfile>("/application-profiles/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source_kind: "intake", source_id: res.intake.id }) });
      await call(`/application-profiles/${profile.id}/draft`, { method: "POST" });
      let uploaded = 0;
      for (const file of screened.uploadable) {
        await uploadFile(
          { initPath: `/admin/ai-underwriter-leads/${res.intake.id}/files/upload-init`, completePath: `/admin/ai-underwriter-leads/${res.intake.id}/files/complete`, call },
          file,
          { requestedDocumentId: null, storageRejectedMessage: (rejected) => `${rejected.name} could not be uploaded. The draft was preserved.` },
        );
        uploaded += 1;
      }
      setNotice([
        uploaded ? `${uploaded} evidence file${uploaded === 1 ? "" : "s"} uploaded. Extraction continues in the background.` : "",
        lockedNotice,
      ].filter(Boolean).join(" "));
      await loadLeads(0);
      router.push(fileHref(res.intake.id));
      return res;
    } catch (error) {
      // Duplicate email → backend returns 409 with the existing intake_id; open it.
      if (error instanceof ApiError && error.status === 409) {
        const detail = (error.body as { detail?: { intake_id?: string; message?: string } } | undefined)?.detail;
        if (detail?.intake_id) {
          setCreateOpen(false);
          setNotice(detail.message || "A lead already exists for this email — opening it.");
          router.push(fileHref(detail.intake_id));
          return;
        }
      }
      setNotice(documentUploadErrorMessage(error, "Could not create the lead."));
    } finally {
      setCreating(false);
    }
  }

  async function restoreLead(id: string) {
    setNotice("");
    try {
      await call<LeadRow>(`/admin/ai-underwriter-leads/${id}/restore`, { method: "POST" });
      setNotice("AI Intake file restored with its existing documents and history.");
      await loadLeads(offset);
    } catch (error) {
      setNotice(apiErrorMessage(error, "This AI Intake file could not be restored."));
    }
  }

  async function deleteLead(id: string, confirmName: string) {
    await call(`/admin/ai-underwriter-leads/${id}/confirm-deletion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm_name: confirmName }),
    });
    await loadLeads(offset);
  }

  // From the table row: the same reversible archive and confirmation dialog.
  async function deleteFromRow(row: LeadRow, confirmName: string) {
    await deleteLead(row.id, confirmName);
    setDeleteRow(null);
  }

  useEffect(() => {
    if (!meLoading && me && !isIntakeOperator) router.replace("/");
  }, [isIntakeOperator, meLoading, me, router]);

  useEffect(() => {
    if (isIntakeOperator) loadLeads(0).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isIntakeOperator, statusFilter, archivedFilter, variantFilter, probabilityFilter, submittedQuery, partnerUserId, pageSize]);

  useEffect(() => {
    // Legacy deep links (?lead=…&view=…&step=…) land on the file's page, at the matching section.
    if (isIntakeOperator && leadParam) {
      router.replace(fileHref(leadParam, sectionFromLegacyParams({ view: searchParams.get("view"), step: requestedStep, tab: searchParams.get("tab"), channel: searchParams.get("channel") })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isIntakeOperator, leadParam]);

  const unifiedByIntake = useMemo(() => new Map(
    (unifiedFiles?.items ?? []).filter((file) => file.intake_id).map((file) => [file.intake_id as string, file]),
  ), [unifiedFiles]);
  const counts = useMemo(() => {
    const readiness = rows.map((row) => listReadinessSummary(unifiedByIntake.get(row.id))).filter((item) => item !== null);
    return {
      total,
      good: rows.filter((row) => row.probability_status === "Good probability - book call").length,
      booked: rows.filter((row) => row.call_booked).length,
      missing: rows.reduce((sum, row) => sum + row.missing_required_count, 0),
      readinessScored: readiness.length,
      readySoon: readiness.filter((item) => item.band === "ready_soon").length,
    };
  }, [rows, total, unifiedByIntake]);
  const aiIntakeTableStorageKey = me?.id ? `ai-intake:${me.id}` : null;
  const {
    rows: orderedRows,
    pinnedIds,
    isPinned,
    togglePin,
    clearPins,
  } = usePinnedRows({
    rows,
    getId: (row) => row.id,
    storageKey: aiIntakeTableStorageKey,
  });

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setOffset(0);
    setSubmittedQuery(query);
  }

  if (me && !isIntakeOperator) return null;

  const leadOverlays = (
    <>
      {deleteRow && canDelete ? (
        <ConfirmDeleteLeadModal
          open={deleteRow !== null}
          onClose={() => setDeleteRow(null)}
          expectedName={deleteRow.business_name || deleteRow.full_name}
          onConfirm={(confirmName) => deleteFromRow(deleteRow, confirmName)}
        />
      ) : null}
      <FileEconomicsDrawer
        open={economicsRow !== null}
        row={economicsRow}
        onClose={() => setEconomicsRow(null)}
        onSaved={() => void refetchUnifiedFiles()}
      />

    </>
  );

  return (
    <>
    <div
      ref={listShellRef}
      tabIndex={-1}
      aria-label="File list"
      className="ai-intake-list-shell"
      style={{ maxWidth: 1480, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12, minHeight: "calc(100dvh - 95px - var(--pad-y))" }}
    >
      <div className="ckhead" style={{ flexShrink: 0 }}>
        <div className="ckrow">
          <h1>Files</h1>
          <CellChip tone="mut">{counts.total} files</CellChip>
          <span className="sp" />
          <span className="sub">Operational view across evidence, underwriting, ownership, and next actions.</span>
          {canGovern ? <Btn variant="pri" size="sm" onClick={() => setCreateOpen(true)}><Icon name="plus" size={13} /> New file</Btn> : null}
          <PageActionMenu label="File actions" items={[
            { label: "What changed", onSelect: () => setWhatsNewOpen(true) },
            ...(canGovern ? [{ label: "All documents", href: "/admin/buckets" }] : []),
          ]} />
        </div>
        <div className="cktabs" role="tablist" aria-label="File vertical">
          {VARIANT_FILTERS.map((item) => <button type="button" role="tab" aria-selected={variantFilter === item.value} className={variantFilter === item.value ? "on" : undefined} key={item.value} onClick={() => { setOffset(0); setVariantFilter(item.value); }}>{item.label}</button>)}
        </div>
      </div>

      <div className="kpis ai-intake-stats" style={{ flexShrink: 0 }} aria-label="Files overview">
        <Stat
          title={archivedFilter === "active" ? "Active files" : archivedFilter === "archived" ? "Closed & archived files" : "All files"}
          value={String(counts.total)}
          sub="matching the current filters"
          tone="accent"
        />
        <Stat
          title={counts.readinessScored ? "Capital ready" : "Good probability"}
          value={String(counts.readinessScored ? counts.readySoon : counts.good)}
          sub={counts.readinessScored ? `${counts.readinessScored} scored · advisory` : "ready for the next action"}
          tone="good"
        />
        <Stat title="Booked calls" value={String(counts.booked)} sub="appointments on this page" tone="neutral" />
        <Stat title="Missing items" value={String(counts.missing)} sub="requirements still unresolved" tone="warn" />
      </div>

      <div className="panel" style={{ flexShrink: 0 }}>
        <form className="panel-h" onSubmit={submitSearch} style={{ display: "grid", gridTemplateColumns: "minmax(240px,1fr) repeat(3, minmax(160px, 220px)) auto", gap: 10, alignItems: "center" }}>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, owner, email, phone, dealership"
            aria-label="Search leads"
          />
          <Select value={statusFilter} onChange={(event) => { setOffset(0); setStatusFilter(event.target.value); }} aria-label="Status">
            {STATUS_FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </Select>
          <Select value={probabilityFilter} onChange={(event) => { setOffset(0); setProbabilityFilter(event.target.value); }} aria-label="Probability">
            {PROBABILITY_FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </Select>
          <Select
            value={archivedFilter}
            onChange={(event) => {
              setOffset(0);
              setArchivedFilter(event.target.value as "active" | "archived" | "all");
            }}
            aria-label="Record visibility"
          >
            <option value="all">All files</option>
            <option value="active">Active only</option>
            <option value="archived">Closed & archived</option>
          </Select>
          <Btn type="submit" variant="pri">Search</Btn>
        </form>
      </div>

      {notice ? <WarnLine>{notice}</WarnLine> : null}
      {archivedSearchMatch ? (
        <div role="status" aria-live="polite">
          <Callout tone="warn" icon={<Icon name="vault" size={16} />}>
            <div className="row" style={{ width: "100%", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span className="grow">
                <b>No active file matches “{archivedSearchMatch.query}.”</b>{" "}
                {archivedSearchMatch.count === 1
                  ? "One matching file is closed or archived."
                  : `${archivedSearchMatch.count} matching files are closed or archived.`}
              </span>
              <Btn
                style={{ minHeight: 44 }}
                onClick={() => {
                  setOffset(0);
                  setStatusFilter("all");
                  setProbabilityFilter("all");
                  setVariantFilter("all");
                  setArchivedFilter("archived");
                }}
              >
                View closed & archived
              </Btn>
            </div>
          </Callout>
        </div>
      ) : null}
      {nonIntakeLeadMatches.length ? (
        <div role="status" aria-live="polite">
          <Callout tone="acc" icon={<Icon name="clients" size={16} />}>
            <div className="row" style={{ width: "100%", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span className="grow">
                <b>{nonIntakeLeadMatches.length === 1 ? "A matching client lead exists." : "Matching client leads exist."}</b>{" "}
                No matching AI Intake or document bucket was found for this search. Open the lead to review its workflow.
              </span>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                {nonIntakeLeadMatches.map((client) => (
                  <Link
                    key={client.id}
                    href={`/clients/${client.id}`}
                    className="btn"
                    style={{ minHeight: 44 }}
                    aria-label={`Open client lead ${client.name}`}
                  >
                    {client.name} · Open lead
                  </Link>
                ))}
              </div>
            </div>
          </Callout>
        </div>
      ) : null}

      <TableWorkspace
        title="Files"
        description="Scroll the page to give the file list the full workspace, or focus the table for concentrated review."
        storageKey={aiIntakeTableStorageKey ?? undefined}
        actions={pinnedIds.length ? <Btn size="sm" onClick={clearPins}>Clear pinned ({pinnedIds.length})</Btn> : null}
        footer={(
          <div className="row" style={{ width: "100%", flexWrap: "nowrap" }}>
            <span className="sub">{total ? `${offset + 1}-${Math.min(offset + pageSize, total)} of ${total}` : "0 leads"}</span>
            <span className="sp" />
            <label className="row sub" style={{ gap: 6, flexWrap: "nowrap" }}>
              Rows
              <Select
                aria-label="Rows per page"
                value={String(pageSize)}
                onChange={(event) => {
                  setOffset(0);
                  setPageSize(Number(event.target.value));
                }}
              >
                {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
              </Select>
            </label>
            <Btn disabled={offset === 0 || loading} onClick={() => loadLeads(Math.max(0, offset - pageSize))}>Previous</Btn>
            <Btn disabled={offset + pageSize >= total || loading} onClick={() => loadLeads(offset + pageSize)}>Next</Btn>
          </div>
        )}
      >
        <div className="tblwrap">
          <table className="tbl">
            <caption className="sr-only">AI intake files</caption>
            <thead><tr><th>File</th><th>Contact</th><th>Opened by</th><th>Referral</th><th>Vertical</th><th>Capital readiness</th><th>Probability</th><th>Status</th><th>Deal economics</th><th>Evidence</th><th>Missing</th><th className="r">Actions</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={12}><div className="empty">Loading AI intake...</div></td></tr> : orderedRows.map((row) => {
                const unified = unifiedByIntake.get(row.id);
                const readiness = listReadinessSummary(unified);
                const mcaReview = mcaRefinanceReviewState({ intake: row });
                const workspaceState = resolveIntakeWorkspaceState({
                  workspaceState: row.workspace_state,
                  workspaceStateReason: row.workspace_state_reason,
                  archivedAt: row.archived_at,
                  underwritingStatus: row.underwriting_status ?? unified?.pipeline_status,
                  outcomeStatus: row.outcome_status,
                  intakeStatus: row.status,
                });
                const manuallyArchived = workspaceState === "archived";
                const statusPresentation = intakeStatusPresentation(
                  row.status,
                  row.underwriting_status ?? unified?.pipeline_status,
                  row.outcome_status,
                  workspaceState,
                  row.workspace_state_reason,
                );
                const pinned = isPinned(row.id);
                const hasEconomics = Boolean(unified && (
                  unified.accepted_amount != null
                  || unified.forecast_fee_points != null
                  || unified.forecast_consulting_fee != null
                  || unified.estimated_close_date
                ));
                return (
                  <tr
                    key={row.id}
                    onClick={() => { if (!manuallyArchived) void openLead(row.id); }}
                    className={cx(semanticStatusClass(statusPresentation.effectiveStatus), pinned && "table-row-pinned")}
                    data-pinned={pinned || undefined}
                  >
                    <td className="lead-file-cell">
                      <button type="button" className="linky" disabled={manuallyArchived} onClick={(event) => { event.stopPropagation(); void openLead(row.id); }}>{row.business_name || row.full_name}</button>
                      <div className="sub num">{unified?.ref || row.id.slice(0, 8)}</div>
                      {row.business_name ? <div className="sub">Owner: {row.full_name}</div> : null}
                      {manuallyArchived ? <CellChip tone="mut">Archived{row.archived_at ? ` ${new Date(row.archived_at).toLocaleDateString()}` : ""}</CellChip> : null}
                    </td>
                    <td className="lead-contact-cell">
                      <div className="lead-contact-line">{presentContact(row.email)}</div>
                      <div className="lead-contact-line sub">{presentContact(row.phone)}</div>
                    </td>
                    <td><CellChip tone={unified ? originTone(unified.origin) : "mut"}>{row.opened_by_name || unified?.rep_name || unified?.origin_label || "House desk"}</CellChip><div className="sub">{row.opened_by_role || unified?.case_ref || "Internal"}</div></td>
                    <td className="sub">{row.referral_source || unified?.dealer_name || "Direct"}</td>
                    <td><CellChip tone={unified ? verticalTone(unified.vertical) : "acc"}>{unified?.vertical_label || variantLabel(row.variant)}</CellChip></td>
                    <td>{readiness ? <div className="capital-readiness-list-summary"><div><b>{readiness.score == null ? "—" : Math.round(readiness.score)}</b><CellChip tone={capitalReadinessBandTone(readiness.band)}>{capitalReadinessBandLabel(readiness.band)}</CellChip></div><small>{readiness.evidence_coverage_pct == null ? "Coverage unavailable" : `${Math.round(readiness.evidence_coverage_pct)}% evidence coverage`}</small></div> : <span className="sub">Not calculated</span>}</td>
                    <td><CellChip tone={mcaReview && mcaReview.mode !== "automated_review" ? "warn" : probabilityTone(row.probability_status)}>{mcaReview && mcaReview.mode !== "automated_review" ? mcaReview.title : row.probability_status || "Awaiting review"}</CellChip></td>
                    <td><CellChip tone={manuallyArchived ? "mut" : statusPresentation.tone}>{manuallyArchived ? "Archived" : statusPresentation.label}</CellChip></td>
                    <td>
                      {unified && hasEconomics ? (
                        <button type="button" className="linky" onClick={(event) => { event.stopPropagation(); setEconomicsRow(unified); }}>
                          <b>{unified.accepted_amount == null ? "Accepted not recorded" : `${formatMoney(unified.accepted_amount)} accepted`}</b>
                          <span className="sub" style={{ display: "block" }}>{unified.forecast_earnings == null ? "Earnings not configured" : `${formatMoney(unified.forecast_earnings)} expected earnings`}</span>
                          <span className="sub" style={{ display: "block" }}>{unified.estimated_close_date ? `Est. ${new Date(`${unified.estimated_close_date}T12:00:00`).toLocaleDateString()}` : "Add closing date"}</span>
                        </button>
                      ) : unified ? <Btn size="sm" onClick={(event) => { event.stopPropagation(); setEconomicsRow(unified); }}>Set deal economics</Btn> : <span className="sub">Not configured</span>}
                    </td>
                    <td>{manuallyArchived ? <span className="cellchip c-mut">{row.file_count} retained files</span> : <button type="button" className="cellchip c-pet" onClick={(event) => { event.stopPropagation(); router.push(fileHref(row.id, "documents")); }}>{row.file_count} files · {row.bucket_name || "Room"}</button>}</td>
                    <td className="num">{row.missing_required_count}</td>
                    <td className="r">
                      <div className="row" style={{ gap: 6, justifyContent: "flex-end", flexWrap: "nowrap" }}>
                        <PinRowButton pinned={pinned} onToggle={() => togglePin(row.id)} label={row.business_name || row.full_name} />
                        {manuallyArchived ? (
                          <Btn size="sm" variant="pri" onClick={(event) => { event.stopPropagation(); void restoreLead(row.id); }}>Restore</Btn>
                        ) : (
                          <>
                            <Btn size="sm" onClick={(event) => { event.stopPropagation(); void openLead(row.id); }}>Open</Btn>
                            {canDelete ? <Btn size="sm" title="Archive this file and retain its documents" onClick={(event) => { event.stopPropagation(); setDeleteRow(row); }}>Archive</Btn> : null}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && !orderedRows.length ? <tr><td colSpan={12}><div className="empty">No AI intake files match these filters.</div></td></tr> : null}
            </tbody>
          </table>
        </div>
      </TableWorkspace>

      <WhatsNewRail
        open={whatsNewOpen}
        onClose={() => setWhatsNewOpen(false)}
        onOpenLead={(intakeId) => {
          setWhatsNewOpen(false);
          openLead(intakeId);
          // Reflect the cleared NEW badge once the lead loads.
          loadLeads().catch(() => undefined);
        }}
      />

      {createOpen && canGovern ? (
        <CreateLeadModal
          onClose={() => setCreateOpen(false)}
          onCreate={createLead}
          creating={creating}
        />
      ) : null}
    </div>
    {leadOverlays}
    </>
  );
}
