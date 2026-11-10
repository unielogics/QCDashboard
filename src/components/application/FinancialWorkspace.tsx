"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Btn, Callout, CellChip, Field, IconBtn, Input, Select } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { Icon } from "@/components/design-system/Icon";
import { PreparationProgress, type PreparationStep } from "@/components/design-system/PreparationProgress";
import { useAuthedApi, useDevUser } from "@/hooks/useApi";
import { useConsoleAuth } from "@/lib/consoleAuth";
import { apiBase } from "@/lib/api";
import { assertPdfUploadUnlocked } from "@/lib/documentUpload";
import { DEBT_SOURCE_ACCEPT, financialSourceIsImage, financialUploadContentType, financialVersionSourceKind } from "@/lib/financialSourceFiles";
import { DocumentVersionControl, DocumentVersionBadge } from "@/components/documents/DocumentVersionControl";
import { documentVersionLabel, documentVersionService, historicalDocumentReference } from "@/lib/documentVersions";
import { Pfs413Form, type PfsBody, type PfsSchema } from "./Pfs413Form";
import { DebtScheduleForm, type DebtRow } from "./DebtScheduleForm";
import { BusinessStatementForm, type StatementBody, type StatementSchema } from "./BusinessStatementForm";
import { RealEstateScheduleForm } from "./RealEstateScheduleForm";
import { OperatingPlanEditor } from "./OperatingPlanEditor";
import { normalizeOperatingPlanBody, operatingPlanRequest, type OperatingPlanBody } from "@/lib/operatingPlan";
import { RealEstateMortgageEvidence } from "./RealEstateMortgageEvidence";
import { readRealEstateEvidence, realEstateImportFieldLabel, realEstateImportFieldValue, type RealEstateEvidenceLink } from "@/lib/realEstateEvidence";
import workspaceStyles from "./FinancialWorkspaceExtras.module.css";
import { realEstateTotals, type RealEstateBody, type RealEstateSchema } from "@/lib/realEstateSchedule";
import { SheetGrid } from "@/components/sheet/SheetGrid";
import { recompute, type SheetSchema } from "@/components/sheet/compute";
import { planPaste } from "@/components/sheet/clipboard";
import type { Edit, SheetKind } from "@/components/sheet/types";
import {
  FINANCIAL_LABELS, FINANCIAL_ORDER, readFinancialWorkspace, saveFinancialDraft,
  saveFinancialVersion, stageFinancialImport, stageDebtDocumentImport, applyFinancialImport, restoreFinancialVersion,
  actOnFinancialDebt, financialVersionPdfPath, financialValues, financialLayout, applyFinancialCells, meaningfulFinancialDebts, financialDebtComputed, createFinancialFamily, financialMappingConflict, financialMappingConfidence, isFinancialDraftConflict, clearEditedDebtSources, shareFinancialVersion, savedFinancialCompletion, financialVersionPublicationState,
  type FinancialWorkspaceSnapshot, type FinancialBody, type FinancialDebtRow, type FinancialImport, type FinancialVersion,
  type DebtAction, type DebtDocumentRole,
} from "@/lib/financialWorkspaceApi";
import { RequestFilesDialog } from "./RequestFilesDialog";
import { newFinancialDebtEntry, commitFinancialDebtEntry, financialDebtChoiceLabel, financialDebtEntrySelection, financialDebtNavigationRows, financialWorkspaceEntryView, isBlankFinancialDebt } from "@/lib/financialWorkspaceEntry";
import { DebtScheduleIntakeActions } from "./DebtScheduleIntakeActions";
import { DebtBatchImport } from "./DebtBatchImport";
import { LoanFilePicker, LoanImageName, LoanImagePreviewProvider } from "./LoanImagePreview";
import { loanPreviewReference } from "@/lib/loanImagePreview";
import { formatLoanOriginationDate, formatLoanPaidDown, loanPaidDownDescription } from "@/lib/loanProgress";
import { canDraftDebtIntake, hasPendingDebtIntakeReview } from "@/lib/financialDebtIntake";

type View = "form" | "worksheet" | "pdf" | "history";
const VIEWS: Array<{ id: View; label: string; icon: string }> = [
  { id: "form", label: "Form", icon: "note" }, { id: "worksheet", label: "Worksheet", icon: "calc" },
  { id: "pdf", label: "From the file", icon: "doc" }, { id: "history", label: "History", icon: "audit" },
];
const message = (error: unknown) => error instanceof Error ? error.message : "This change could not be saved.";
const when = (iso?: string | null) => iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "";
const newId = () => crypto.randomUUID();
const rowsOf = (body: FinancialBody): FinancialDebtRow[] => (body.debts as FinancialDebtRow[] | undefined) ?? [];

/** A draft has one body. Form fields, worksheet cells, and source review all edit that body. */
export function FinancialWorkspace({ open, onClose, profileId, initialKind = "debt_schedule", initialView, initialDebtId, onPublished, onUploadFiles }: {
  open: boolean; onClose: () => void; profileId: string; initialKind?: SheetKind; initialView?: View; initialDebtId?: string;
  onPublished?: () => void | Promise<void>; onUploadFiles?: (files: File[]) => Promise<void>;
}) {
  const api = useAuthedApi();
  const queryClient = useQueryClient();
  const { getToken, isSignedIn } = useConsoleAuth();
  const devUser = useDevUser();
  const [snapshot, setSnapshot] = useState<FinancialWorkspaceSnapshot | null>(null);
  const [body, setBody] = useState<FinancialBody>({});
  const [view, setView] = useState<View>(() => financialWorkspaceEntryView(initialKind, initialView, initialDebtId));
  const [expanded, setExpanded] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [publishPhase, setPublishPhase] = useState<"draft" | "pdf" | "refresh" | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [localDirty, setLocalDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [familyOpen, setFamilyOpen] = useState(false);
  const [familyDraft, setFamilyDraft] = useState({ label: "", subject: "", period_start: "", period_end: "", as_of: "" });
  const [selectedDebt, setSelectedDebt] = useState<string | null>(initialDebtId ?? null);
  const debtContext = useRef<{ rowId: string | null; familyId: string | null }>({ rowId: selectedDebt, familyId: snapshot?.family_id ?? null });
  debtContext.current = { rowId: selectedDebt, familyId: snapshot?.family_id ?? null };
  const [showExcluded, setShowExcluded] = useState(false);
  const [rowToolsOpen, setRowToolsOpen] = useState(false);
  const [newDebt, setNewDebt] = useState<FinancialDebtRow | null>(null);
  const newDebtRef = useRef<FinancialDebtRow | null>(null); newDebtRef.current = newDebt;
  const [newDebtError, setNewDebtError] = useState("");
  const [gridFocus, setGridFocus] = useState<{ rowKey: string; requestId: number }>();
  const focusRequest = useRef(0);
  const [duplicateRow, setDuplicateRow] = useState<string | null>(null);
  const [duplicateTarget, setDuplicateTarget] = useState("");
  const [imageFailed, setImageFailed] = useState(false);
  const [uploadedLinks, setUploadedLinks] = useState<Array<{ file_id: string; file_name: string; role: DebtDocumentRole; selected: boolean; payoff_amount: string; payoff_date: string }>>([]);
  const [uploadedTarget, setUploadedTarget] = useState<{ rowId: string; familyId: string } | null>(null);
  const [sourceFile, setSourceFile] = useState("");
  const [sourceRole, setSourceRole] = useState<DebtDocumentRole>("agreement");
  const [realEstateSourceMode, setRealEstateSourceMode] = useState<"schedule" | "mortgage">("schedule");
  const [selectedMortgage, setSelectedMortgage] = useState<string | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<string | null>(null);
  const [mortgageEvidence, setMortgageEvidence] = useState<RealEstateEvidenceLink[] | null>(null);
  const [evidenceRefresh, refreshEvidence] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<{ tone: "ok" | "warn"; message: string } | null>(null);
  const [fileMode, setFileMode] = useState<"sources" | "versions">("sources");
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [sourceOriginalUrl, setSourceOriginalUrl] = useState<string | null>(null);
  const [sourceContentType, setSourceContentType] = useState<string | null>(null);
  const sourceBlob = useRef<string | null>(null);
  const sourceRequest = useRef(0);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfVersionId, setPdfVersionId] = useState<string | null>(null);
  const [savedReceipt, setSavedReceipt] = useState<FinancialVersion | null>(null);
  const [savedCompletion, setSavedCompletion] = useState<FinancialWorkspaceSnapshot["completion"] | null>(null);
  const [sharedPdf, setSharedPdf] = useState<{ url: string; expires_at: string; version_id: string } | null>(null);
  const pdfRequest = useRef(0);
  const [proposal, setProposal] = useState<FinancialImport | null>(null);
  const [selectedMappings, setSelectedMappings] = useState<string[]>([]);
  const current = useRef<FinancialWorkspaceSnapshot | null>(null);
  const draftBody = useRef<FinancialBody>({});
  const changed = useRef(0);
  const persisted = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);
  const publishKey = useRef<string | null>(null);
  const mounted = useRef(true);
  const formRef = useRef<HTMLDivElement | null>(null);
  const uploadRef = useRef<HTMLInputElement | null>(null);

  const accept = useCallback((next: FinancialWorkspaceSnapshot, entry?: { resetSelection: boolean; rowId?: string }) => {
    const sameFamily = current.current?.family_id === next.family_id;
    current.current = next; draftBody.current = next.body;
    changed.current = 0; persisted.current = 0;
    setSnapshot(next); setBody(next.body); setLocalDirty(false); setConflict(false);
    setSelectedDebt((selected) => financialDebtEntrySelection(next.body, entry?.resetSelection ? entry.rowId : sameFamily ? selected : null));
  }, []);
  const changeBody = useCallback((next: FinancialBody) => {
    if (current.current?.kind === "debt_schedule") next = clearEditedDebtSources(draftBody.current, next);
    if (current.current?.kind === "operating_plan") next = normalizeOperatingPlanBody(next);
    draftBody.current = next; changed.current += 1; publishKey.current = null;
    setBody(next); setLocalDirty(true); setNotice("");
  }, []);
  useEffect(() => {
    // A source review belongs to one selected loan, including selections made outside the file tab.
    sourceRequest.current += 1;
    setProposal(null); setSourceFile(""); setSourceUrl(null); setSourceOriginalUrl(null); setSourceRole("agreement"); setUploadStatus(null); setUploadedLinks([]); setUploadedTarget(null);
  }, [selectedDebt, snapshot?.family_id]);
  useEffect(() => {
    setMortgageEvidence(null);
    if (snapshot?.kind !== "real_estate_schedule") return;
    let cancelled = false;
    void readRealEstateEvidence(api, profileId, snapshot.family_id).then((answer) => { if (!cancelled) setMortgageEvidence(answer.links); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [api, profileId, snapshot?.family_id, snapshot?.current_version_id, snapshot?.kind, evidenceRefresh]);

  const flush = useCallback(async (): Promise<void> => {
    if (inFlight.current) await inFlight.current;
    if (!current.current || persisted.current === changed.current) return;
    const work = async () => {
      setSavingDraft(true);
      try {
        while (persisted.current !== changed.current) {
          const revision = changed.current;
          const next = await saveFinancialDraft(api, profileId, current.current!, structuredClone(draftBody.current));
          current.current = next; persisted.current = revision;
          if (mounted.current) {
            setSnapshot(next); setLocalDirty(changed.current !== revision); setConflict(false);
            if (changed.current === revision) { draftBody.current = next.body; setBody(next.body); }
          }
        }
      } catch (reason) {
        if (mounted.current) { setError(message(reason)); setConflict(isFinancialDraftConflict(reason)); }
        throw reason;
      } finally { if (mounted.current) setSavingDraft(false); }
    };
    const promise = work(); inFlight.current = promise;
    try { await promise; } finally { if (inFlight.current === promise) inFlight.current = null; }
  }, [api, profileId]);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true); setError(""); setView(financialWorkspaceEntryView(initialKind, initialView, initialDebtId));
    setSelectedDebt(initialDebtId ?? null); setShowExcluded(false);
    void readFinancialWorkspace(api, profileId, initialKind).then((next) => { if (!cancelled) { accept(next, { resetSelection: true, rowId: initialDebtId }); const rowId = financialDebtEntrySelection(next.body, initialDebtId); if (next.kind === "debt_schedule" && rowId) setGridFocus({ rowKey: rowId, requestId: ++focusRequest.current }); } })
      .catch((reason) => { if (!cancelled) setError(message(reason)); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [accept, api, initialDebtId, initialKind, initialView, open, profileId]);
  useEffect(() => {
    if (!localDirty || conflict) return;
    const timer = setTimeout(() => { void flush().catch(() => undefined); }, 700);
    return () => clearTimeout(timer);
  }, [body, conflict, flush, localDirty]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (changed.current !== persisted.current || inFlight.current || newDebtRef.current && !isBlankFinancialDebt(newDebtRef.current)) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);
  useEffect(() => () => { if (sourceBlob.current) URL.revokeObjectURL(sourceBlob.current); }, []);
  useEffect(() => { setSourceOriginalUrl(null); setSourceContentType(null); setImageFailed(false); }, [sourceFile]);

  const run = async (label: string, work: () => Promise<void>) => {
    if (busy) return;
    setBusy(label); setError("");
    try { await work(); } catch (reason) { setError(message(reason)); if (isFinancialDraftConflict(reason)) setConflict(true); }
    finally { setBusy(""); setPublishPhase(null); }
  };
  const close = () => { void run("close", async () => { await flush(); onClose(); }); };
  const switchForm = (kind: SheetKind, familyId?: string) => { void run("switch", async () => {
    await flush(); pdfRequest.current += 1; setLoading(true); setSavedReceipt(null); setSavedCompletion(null); setSharedPdf(null); setProposal(null); setSourceUrl(null); setSourceFile(""); setPdfUrl(null); setPdfVersionId(null);
    try { accept(await readFinancialWorkspace(api, profileId, kind, familyId), { resetSelection: true }); setView(financialWorkspaceEntryView(kind)); } finally { setLoading(false); }
  }); };
  const switchView = (next: View) => { setView(next); setNotice(""); if (next === "worksheet" && current.current?.kind === "debt_schedule" && selectedDebt) setGridFocus({ rowKey: selectedDebt, requestId: ++focusRequest.current }); };
  const openRealEstateSource = (mode: "schedule" | "mortgage", mortgageId?: string, propertyId?: string) => {
    setRealEstateSourceMode(mode); setSelectedMortgage(mortgageId ?? null); setSelectedProperty(propertyId ?? null);
    setFileMode("sources"); setSourceFile(""); setSourceUrl(null); setProposal(null); setView("pdf");
  };
  const publish = (submit = false) => { void run(submit ? "file" : "publish", async () => {
    setPublishPhase("draft");
    await flush(); if (!current.current) return;
    publishKey.current ??= newId();
    setPublishPhase("pdf");
    const next = await saveFinancialVersion(api, profileId, current.current, `${publishKey.current}:${submit ? "file" : "save"}`, submit);
    pdfRequest.current += 1;
    accept(next); publishKey.current = null;
    setPdfUrl(null); setPdfVersionId(next.saved_version?.id ?? next.current_version_id);
    const saved = next.saved_version ?? next.versions.find((version) => version.id === next.current_version_id) ?? null;
    const accepted = saved ? savedFinancialCompletion(next, saved.id) : null;
    setSavedReceipt(saved); setSavedCompletion(accepted); setSharedPdf(null);
    const publication = saved ? financialVersionPublicationState(next, saved.id) : "saved_pdf";
    setNotice(publication === "saved_pdf" && next.kind === "debt_schedule"
      ? `Version ${saved?.version_number ?? "saved"} PDF saved. ${accepted?.complete === false ? "This debt schedule is still a draft awaiting completion. Complete it and save a version to publish its figures to financials and AI." : "This PDF is not confirmed as the completed schedule used by financials and AI."}`
      : `Version ${saved?.version_number ?? "saved"} saved${publication === "published" && (submit || next.kind === "debt_schedule") ? " and filed on the checklist" : ""}. ${publication === "published" ? "The financial interface and AI now use this version." : "This saved version is available in history; the latest version is shown in the sidebar."}`);
    setPublishPhase("refresh");
    for (const key of ["financial-workspace-summary", "operating-plan-summary", "debt-schedule-review", "financial-cockpit", "advances", "application-evidence-workspace", "application-collection-tasks", "form-answers"]) void queryClient.invalidateQueries({ queryKey: [key, profileId] });
    await onPublished?.();
  }); };
  const debtAction = (action: DebtAction) => { void run("row", async () => {
    await flush(); if (!current.current) return;
    accept(await actOnFinancialDebt(api, profileId, current.current, action));
    setNotice("Row adjustment saved to the draft. Save version to update the financial interface.");
  }); };
  const previewSource = (fileId = sourceFile, page?: number, expectedHash?: string) => { void run("source", async () => {
    if (!fileId) return;
    const request = ++sourceRequest.current; const familyId = current.current?.family_id;
    setSourceFile(fileId); setImageFailed(false); setSourceUrl(null); setSourceOriginalUrl(null);
    const linkedRole = rowsOf(draftBody.current).find((row) => row.id === selectedDebt)?.evidence_links?.find((link) => link.file_id === fileId)?.role;
    if (linkedRole) setSourceRole(linkedRole);
    const hashQuery = expectedHash && /^[a-f0-9]{64}$/i.test(expectedHash) ? `?expected_content_hash=${encodeURIComponent(expectedHash)}` : "";
    const result = await api<{ url: string }>(`/application-profiles/${encodeURIComponent(profileId)}/evidence/files/${encodeURIComponent(fileId)}/url${hashQuery}`);
    if (!mounted.current || request !== sourceRequest.current || familyId !== current.current?.family_id) return;
    const source = current.current?.evidence.find((file) => file.file_id === fileId);
    const original = current.current?.versions.find((version) => version.source_file_id === fileId && !version.pdf_file_id);
    const mapped = proposal?.mappings.find((mapping) => mapping.source.file_id === fileId && mapping.source.kind === "image")?.source;
    const contentType = original?.source_content_type ?? mapped?.content_type ?? source?.content_type ?? null;
    setSourceOriginalUrl(result.url); setSourceContentType(contentType);
    if (sourceBlob.current) { URL.revokeObjectURL(sourceBlob.current); sourceBlob.current = null; }
    let displayedUrl = result.url;
    if (/image\/hei[cf]/i.test(contentType ?? "") || /\.hei[cf]$/i.test(source?.file_name ?? "") || Boolean(original || mapped) && /^image\//i.test(contentType ?? "")) {
      const token = isSignedIn ? await getToken() : null;
      const response = await fetch(`${apiBase}/api/v1/application-profiles/${encodeURIComponent(profileId)}/financial-workspace/evidence/${encodeURIComponent(fileId)}/image-preview${hashQuery}`, { cache: "no-store", headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(devUser ? { "X-Dev-User": devUser } : {}) } });
      if (!response.ok) {
        const failure = await response.json().catch(() => null) as { detail?: unknown } | null;
        throw new Error(typeof failure?.detail === "string" ? failure.detail : "The readable image preview could not be loaded. The original file is retained.");
      }
      const blob = await response.blob();
      if (!mounted.current || request !== sourceRequest.current || familyId !== current.current?.family_id) return;
      displayedUrl = URL.createObjectURL(blob); sourceBlob.current = displayedUrl;
    }
    setFileMode("sources");
    setSourceUrl(Number.isInteger(page) && page! > 0 && !financialSourceIsImage({ file_name: source?.file_name, content_type: contentType }) ? `${displayedUrl.split("#")[0]}#page=${page}` : displayedUrl); setView("pdf");
  }); };
  const importSource = (fileId = sourceFile, role = sourceRole) => { void run("import", async () => {
    await flush(); if (!current.current || !fileId) return;
    if (current.current.kind === "debt_schedule" && !selectedDebt) throw new Error("Choose the loan this document belongs to before reading its terms.");
    const target = { rowId: selectedDebt, familyId: current.current.family_id, revision: current.current.draft.revision };
    const next = current.current.kind === "debt_schedule"
      ? await stageDebtDocumentImport(api, profileId, current.current, selectedDebt!, fileId, role)
      : await stageFinancialImport(api, profileId, current.current, fileId);
    if (!mounted.current || current.current?.family_id !== target.familyId || current.current.draft.revision !== target.revision || current.current.kind === "debt_schedule" && debtContext.current.rowId !== target.rowId) return;
    const existing = financialValues(draftBody.current, current.current.worksheet.layout);
    setSourceFile(fileId); setSourceRole(role); setFileMode("sources");
    setProposal(next); setSelectedMappings(next.mappings.filter((mapping) => !(mapping.conflict ?? financialMappingConflict(mapping.before ?? existing[mapping.key], mapping.value))).map((mapping) => mapping.key));
  }); };
  const applyImport = () => { void run("apply", async () => {
    await flush(); if (!current.current || !proposal) return;
    if (proposal.family_id !== current.current.family_id || current.current.kind === "debt_schedule" && proposal.target_row_id !== selectedDebt) throw new Error("This reviewed mapping belongs to a different loan or statement. Select its original row and review it again.");
    accept(await applyFinancialImport(api, profileId, proposal.id, current.current.draft.revision, selectedMappings));
    setProposal(null); setNotice("Selected fields were mapped into the draft. Review the form, then save a new version.");
  }); };
  const showPdf = useCallback(async (versionId: string) => {
    const request = ++pdfRequest.current;
    const familyId = current.current?.family_id;
    let token: string | null = null;
    if (isSignedIn) token = await getToken();
    const response = await fetch(`${apiBase}/api/v1${financialVersionPdfPath(profileId, versionId)}`, {
      cache: "no-store", headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(devUser ? { "X-Dev-User": devUser } : {}) },
    });
    if (request !== pdfRequest.current || familyId !== current.current?.family_id || !mounted.current) return null;
    if (!response.ok) throw new Error("This version’s PDF could not be opened. Try again.");
    const filename = /filename="?([^";]+)"?/i.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? `financial-statement-${versionId}.pdf`;
    const url = URL.createObjectURL(await response.blob());
    if (request !== pdfRequest.current || familyId !== current.current?.family_id || !mounted.current) { URL.revokeObjectURL(url); return null; }
    setSharedPdf((shared) => shared?.version_id === versionId ? shared : null);
    setPdfUrl(url); setPdfVersionId(versionId);
    return { url, filename };
  }, [devUser, getToken, isSignedIn, profileId]);
  useEffect(() => {
    if (view !== "pdf" || fileMode !== "versions" || !snapshot || pdfUrl) return;
    const id = pdfVersionId ?? snapshot.current_version_id;
    if (id && financialVersionSourceKind(snapshot, id) === "pdf") void showPdf(id).catch((reason) => setError(message(reason)));
  }, [fileMode, pdfUrl, pdfVersionId, showPdf, snapshot, view]);

  const downloadPdf = (versionId: string) => { void run("download", async () => {
    const file = await showPdf(versionId); if (!file) return; const anchor = document.createElement("a");
    anchor.href = file.url; anchor.download = file.filename; document.body.appendChild(anchor); anchor.click(); anchor.remove();
  }); };
  const copyPdfShare = (versionId: string) => { void run("share", async () => {
    const result = await shareFinancialVersion(api, profileId, versionId); setSharedPdf({ ...result, version_id: versionId });
    try { await navigator.clipboard.writeText(result.url); setNotice("Read-only PDF link copied. It opens this saved version and expires in seven days."); }
    catch { setNotice("Read-only PDF link ready below. Copy it to share this saved version."); }
  }); };
  const kind = snapshot?.kind ?? initialKind;
  const debts = rowsOf(body);
  const activeDebts = meaningfulFinancialDebts(body);
  const selected = debts.find((row) => row.id === selectedDebt) ?? debts.find((row) => row.id === financialDebtEntrySelection(body)) ?? null;
  const navigationDebts = financialDebtNavigationRows(body, selected?.id ?? null, showExcluded);
  const visibleDebtIds = useMemo(() => new Set(financialDebtNavigationRows(body, selected?.id ?? null, showExcluded).map((row) => row.id)), [body, selected?.id, showExcluded]);
  const sharedLayout = useMemo(() => snapshot ? financialLayout(body, snapshot.worksheet.layout) : null, [body, snapshot]);
  const values = useMemo(() => sharedLayout ? financialValues(body, sharedLayout) : {}, [body, sharedLayout]);
  const computed = useMemo(() => {
    if (!snapshot) return {};
    const source = kind === "debt_schedule" ? financialValues({ ...body, debts: activeDebts }, sharedLayout ?? snapshot.worksheet.layout) : values;
    return kind === "debt_schedule" ? financialDebtComputed(body) : kind === "real_estate_schedule" ? realEstateTotals(body as RealEstateBody) : recompute(kind, snapshot.schema as SheetSchema, source);
  }, [activeDebts, body, kind, sharedLayout, snapshot, values]);
  const excludedIds = useMemo(() => new Set(debts.filter((row) => row.status === "dismissed" || row.status === "duplicate" || row.duplicate_of_id).map((row) => row.id)), [debts]);
  useEffect(() => { if (initialDebtId && excludedIds.has(initialDebtId)) setShowExcluded(true); }, [initialDebtId, excludedIds]);
  const layout = useMemo(() => {
    if (!sharedLayout) return null;
    return kind === "debt_schedule" ? { ...sharedLayout, rows: sharedLayout.rows.filter((row) => !row.row_key || visibleDebtIds.has(row.row_key)) } : sharedLayout;
  }, [kind, sharedLayout, visibleDebtIds]);
  const editCells = (edits: Edit[]) => { if (sharedLayout) changeBody(applyFinancialCells(draftBody.current, sharedLayout, edits)); };
  const addDebt = () => {
    setNewDebt(newFinancialDebtEntry(draftBody.current, newId)); setNewDebtError("");
  };
  const focusDebt = (rowId: string) => { setSelectedDebt(rowId); setView("worksheet"); setGridFocus({ rowKey: rowId, requestId: ++focusRequest.current }); };
  const saveNewDebt = async (another: boolean) => {
    if (!newDebt || busy || conflict) return;
    setBusy("add-debt"); setNewDebtError("");
    try {
      await flush(); if (!current.current) throw new Error("The working schedule is not available yet.");
      const nextBody = commitFinancialDebtEntry(draftBody.current, newDebt);
      const next = await saveFinancialDraft(api, profileId, current.current, nextBody);
      accept(next); publishKey.current = null; setSelectedDebt(newDebt.id); setView("worksheet");
      if (!another) requestAnimationFrame(() => setGridFocus({ rowKey: newDebt.id, requestId: ++focusRequest.current }));
      setNotice("Loan row saved to the working draft. Save version publishes its figures and dated PDF.");
      setNewDebt(another ? newFinancialDebtEntry(next.body, newId) : null);
    } catch (reason) { setNewDebtError(message(reason)); if (isFinancialDraftConflict(reason)) { setConflict(true); setError(message(reason)); } }
    finally { setBusy(""); }
  };
  const uploadEvidence = async (files: File[], onUploaded: (fileId: string) => void) => {
    if (onUploadFiles) { await onUploadFiles(files); return; }
    for (const file of files) {
      await assertPdfUploadUnlocked(file);
      const started = await api<{ file_id: string; upload_url: string | null; required_headers?: Record<string, string>; already_uploaded?: boolean }>(`/application-profiles/${encodeURIComponent(profileId)}/evidence/files/upload-init`, { method: "POST", body: JSON.stringify({ file_name: file.name, content_type: financialUploadContentType(file), size_bytes: file.size }) });
      if (!started.already_uploaded) {
        if (!started.upload_url) throw new Error("The file upload could not be started. Try again.");
        const put = await fetch(started.upload_url, { method: "PUT", headers: started.required_headers ?? {}, body: file });
        if (!put.ok) throw new Error(`${file.name} could not be uploaded (HTTP ${put.status}). Previously received files remain in the evidence list.`);
        await api(`/application-profiles/${encodeURIComponent(profileId)}/evidence/files/complete`, { method: "POST", body: JSON.stringify({ file_id: started.file_id }) });
      }
      onUploaded(started.file_id);
    }
  };
  const linkUploaded = () => { void run("link-files", async () => {
    const target = uploadedTarget;
    if (!target || debtContext.current.rowId !== target.rowId || debtContext.current.familyId !== target.familyId) throw new Error("These files belong to a different loan selection. Choose the intended loan and review its files again.");
    await flush(); if (!current.current || current.current.family_id !== target.familyId || debtContext.current.rowId !== target.rowId) return;
    for (const file of uploadedLinks.filter((item) => item.selected)) {
      const next = await actOnFinancialDebt(api, profileId, current.current, { op: "link_document", row_id: target.rowId, file_id: file.file_id, role: file.role, ...(file.role === "payoff" ? { payoff_amount: file.payoff_amount || null, payoff_date: file.payoff_date || null } : {}) });
      accept(next); setUploadedLinks((pending) => pending.filter((item) => item.file_id !== file.file_id));
    }
    setNotice("Selected files linked to this loan in the working draft. Select the current payoff explicitly after review, then Save version.");
  }); };
  const sections = kind === "pfs" ? ["About you", "Assets", "Liabilities", "Annual income", "Contingent liabilities", ...((snapshot?.schema as PfsSchema | undefined)?.schedules ?? []).map((section) => section.label)]
    : kind === "real_estate_schedule" ? ["Properties", "Mortgages", "Portfolio totals"] : kind === "p_and_l" || kind === "balance_sheet" ? ((snapshot?.schema as StatementSchema | undefined)?.sections ?? []).map((section) => section.label) : [];
  const jumpTo = (title: string) => {
    setView("form");
    requestAnimationFrame(() => {
      if (kind === "real_estate_schedule") {
        const tab = [...(formRef.current?.querySelectorAll<HTMLButtonElement>("button[data-res-section]") ?? [])].find((button) => button.dataset.resSection === title);
        tab?.click(); tab?.scrollIntoView({ block: "start", behavior: "smooth" }); return;
      }
      const heading = [...(formRef.current?.querySelectorAll("h3,h4,summary,label") ?? [])].find((element) => element.textContent?.trim().startsWith(title));
      if (heading) { const details = heading.closest("details"); if (details) details.open = true; heading.scrollIntoView({ block: "start", behavior: "smooth" }); }
    });
  };
  const currentVersion = snapshot?.versions.find((version) => version.id === snapshot.current_version_id);
  const originalKind = snapshot ? financialVersionSourceKind(snapshot, pdfVersionId ?? snapshot.current_version_id) : "pdf";
  const selectedWorkbook = snapshot && originalKind !== "pdf" ? snapshot.versions.find((version) => version.id === (pdfVersionId ?? snapshot.current_version_id)) : null;
  const completedVersion = kind === "debt_schedule"
    ? snapshot?.accepted_completion?.complete ? snapshot.versions.find((version) => version.id === (snapshot.accepted_version_id ?? snapshot.current_version_id)) : undefined
    : currentVersion;
  const needsCompletedDebtVersion = kind === "debt_schedule" && snapshot?.completion?.complete && !snapshot.accepted_completion?.complete;
  const hasDraft = localDirty || snapshot?.draft.dirty;
  const receiptPublication = snapshot && savedReceipt ? financialVersionPublicationState(snapshot, savedReceipt.id) : null;
  const receiptSummary = kind !== "debt_schedule" ? "Dated PDF ready to download or share."
    : receiptPublication === "published" ? "Debt schedule complete — dated PDF filed on the checklist."
    : receiptPublication === "historical" ? "Dated PDF saved in History, ready to download or share."
    : savedCompletion?.complete === false ? `Dated PDF saved. Draft awaiting completion${savedCompletion.reason ? `: ${savedCompletion.reason}` : "."}`
    : "Dated PDF saved. Publication as the completed debt schedule is not confirmed.";
  const mappingBefore = (mapping: FinancialImport["mappings"][number]) => Object.prototype.hasOwnProperty.call(mapping, "before") ? mapping.before : values[mapping.key];
  const mappingConflict = (mapping: FinancialImport["mappings"][number]) => mapping.conflict ?? financialMappingConflict(mappingBefore(mapping), mapping.value);
  const mappingLabel = (mapping: FinancialImport["mappings"][number]) => kind === "real_estate_schedule" && snapshot ? realEstateImportFieldLabel(mapping.key, [body as RealEstateBody, (proposal?.proposed_body ?? {}) as RealEstateBody], snapshot.schema as RealEstateSchema) : mapping.key.slice(mapping.key.indexOf(".") + 1).replaceAll("_", " ");
  const mappingValue = (mapping: FinancialImport["mappings"][number], before = false) => kind === "real_estate_schedule" && snapshot ? realEstateImportFieldValue(mapping.key, before ? mappingBefore(mapping) : mapping.value, [body as RealEstateBody, (proposal?.proposed_body ?? {}) as RealEstateBody], snapshot.schema as RealEstateSchema) : String((before ? mappingBefore(mapping) : mapping.value) ?? "") || "Blank";
  const renderFieldSource = (row: DebtRow, field: keyof DebtRow) => {
    const source = ((body.field_sources ?? {}) as Record<string, { file_id?: string; page?: number; content_hash?: string }>)[`${row.id}.${field}`];
    if (field === "monthly_payment" && row.monthly_payment_source === "native_terms") return <span className="fw-derived-tag">≈ Calculated from payment terms</span>;
    return source?.file_id ? <button type="button" className="fw-field-source" onClick={() => previewSource(source.file_id, source.page, source.content_hash)}><Icon name="file" size={11} />From the file{source.page ? ` · p${source.page}` : ""}</button> : null;
  };
  const previewFiles = snapshot?.evidence.map((file) => loanPreviewReference(file, body, proposal, snapshot.versions)) ?? [];
  const publicationSteps: PreparationStep[] = [
    { label: "Save working edits", status: publishPhase === "draft" || !publishPhase ? "active" : "complete" },
    { label: "Generate PDF and save version", status: publishPhase === "refresh" ? "complete" : publishPhase === "pdf" ? "active" : "pending" },
    { label: "Refresh financial views", status: publishPhase === "refresh" ? "active" : "pending" },
  ];
  const preparation = busy === "publish" || busy === "file"
    ? { title: publishPhase === "refresh" ? "Version saved · refreshing financial views" : "Preparing the dated PDF version", description: publishPhase === "draft" ? "Saving your latest working edits before generating the PDF." : publishPhase === "refresh" ? "The saved version is ready. Updating the financial workspace and checklist." : "Generating the PDF and saving its immutable version. Please keep this workspace open until it finishes.", steps: publicationSteps }
    : ({
      import: { title: "Reading the source document", description: "Preparing proposed fields and source references for your review." },
      apply: { title: "Applying reviewed fields", description: "Saving the selected answers to the working draft." },
      upload: { title: "Uploading supporting files", description: "Retaining the originals for linking and source review." },
      source: { title: "Opening the source document", description: "Preparing the original file for review." },
      pdf: { title: "Opening the saved PDF", description: "Loading this immutable financial version." },
      download: { title: "Preparing the PDF download", description: "Loading the saved version for download." },
      restore: { title: "Restoring the selected version", description: "Preparing its financial values as a new working draft." },
      "operating-review": { title: "Reviewing the earnings plan", description: "Checking the current costs, proposed adjustments and financial calculations." },
    } as Record<string, { title: string; description: string; steps?: PreparationStep[] }>)[busy];

  const renderFields = () => snapshot ? (<>
    {kind === "pfs" ? <Pfs413Form schema={snapshot.schema as PfsSchema} value={body as PfsBody} onChange={(next) => {
                const schedules = Object.fromEntries(Object.entries(next.schedules ?? {}).map(([key, rows]) => [key, rows.map((row) => ({ ...row, id: row.id || newId() }))]));
                changeBody({ ...next, schedules });
              }} disabled={Boolean(busy)} />
                : kind === "real_estate_schedule" ? <RealEstateScheduleForm schema={snapshot.schema as RealEstateSchema} value={body as RealEstateBody} onChange={(next) => changeBody(next as FinancialBody)} disabled={Boolean(busy)} initialSection={view === "pdf" && realEstateSourceMode === "mortgage" ? "Mortgages" : "Properties"} onImportSchedule={() => openRealEstateSource("schedule")} onMortgageEvidence={(mortgageId, propertyId) => openRealEstateSource("mortgage", mortgageId, propertyId)} mortgageEvidence={mortgageEvidence} />
                : kind === "operating_plan" ? <OperatingPlanEditor profileId={profileId} snapshot={snapshot} value={body as OperatingPlanBody} onChange={changeBody} disabled={Boolean(busy) || conflict} prepare={async () => { await flush(); return current.current; }} onReviewed={accept} onBusyChange={(reviewing) => setBusy(reviewing ? "operating-review" : "")} onPreviewSource={(fileId) => { setView("pdf"); setFileMode("sources"); previewSource(fileId); }} />
                : kind === "debt_schedule" ? <>
                  {selected ? <><DebtScheduleForm singleRow renderFieldSource={renderFieldSource} value={{ business_name: String(body.business_name ?? ""), debts: [{ ...selected, editable: true } as DebtRow] }} disabled={Boolean(busy) || excludedIds.has(selected.id)} onChange={(next) => {
                    if (!next.debts?.length) { debtAction({ op: "delete", row_id: selected.id }); return; }
                    changeBody({ ...draftBody.current, business_name: next.business_name, debts: rowsOf(draftBody.current).map((row) => row.id === selected.id ? { ...row, ...next.debts![0], id: row.id } : row) });
                  }} /><DebtInspector key={selected.id} profileId={profileId} row={selected} rows={debts} snapshot={snapshot} busy={Boolean(busy)} onAction={debtAction} onPreview={previewSource} onReadTerms={(fileId) => importSource(fileId, "payoff")} onSourcesChanged={async () => { await flush(); if (current.current) accept(await readFinancialWorkspace(api, profileId, kind, current.current.family_id)); }} /></>
                    : <div className="empty">No active obligations. Add an obligation or map a source document.</div>}
                </> : <BusinessStatementForm schema={snapshot.schema as StatementSchema} value={body as StatementBody} onChange={(next) => changeBody(next as FinancialBody)} disabled={Boolean(busy)} />}
  </>) : null;

  return <>
    <Drawer open={open} onClose={close} fullscreen={expanded} width="xl" closeOnBackdrop={false} title="Financial workspace" sub={snapshot?.label ?? FINANCIAL_LABELS[kind]} ariaLabel="Financial workspace" bodyClass="financial-workspace-body" headerActions={<>
      <span className="sub" aria-live="polite">{savingDraft ? "Saving draft…" : localDirty ? "Unsaved draft changes" : hasDraft ? "Draft saved" : currentVersion ? `Current v${currentVersion.version_number}` : "No saved version"}</span>
      <Btn size="sm" disabled={Boolean(busy)} onClick={() => { void run("request", async () => { await flush(); setRequestOpen(true); }); }}><Icon name="mail" size={14} />{kind === "operating_plan" ? "Request client plan" : "Request files"}</Btn>
      <Btn size="sm" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? "Restore workspace size" : "Expand workspace"}><Icon name={expanded ? "layers" : "external"} size={14} />{expanded ? "Restore" : "Expand"}</Btn>
      {kind !== "debt_schedule" ? <Btn size="sm" disabled={!snapshot || Boolean(busy) || conflict} onClick={() => publish(true)}>{busy === "file" ? "Filing…" : "File on checklist"}</Btn> : null}
      <Btn variant="pri" disabled={!snapshot || Boolean(busy) || conflict || !hasDraft && Boolean(currentVersion) && !needsCompletedDebtVersion} onClick={() => publish()}>{busy === "publish" ? "Saving version…" : "Save version"}</Btn>
    </>}>
      <LoanImagePreviewProvider profileId={profileId} contextKey={`${snapshot?.family_id}:${kind}:${view}:${fileMode}:${selectedDebt}`} onOpenSource={(fileId, hash) => previewSource(fileId, undefined, hash)}><div className="fw-shell">
        <aside className="fw-sidebar" aria-label="Financial forms and sections">
          <span className="lbl">Financial forms</span>
          {FINANCIAL_ORDER.map((formKind) => <button key={formKind} type="button" className={kind === formKind ? "on" : ""} disabled={Boolean(busy)} onClick={() => switchForm(formKind)}><Icon name={formKind === "debt_schedule" ? "calc" : "doc"} size={15} /><span>{FINANCIAL_LABELS[formKind]}</span></button>)}
          {(snapshot?.families.filter((family) => family.kind === kind).length ?? 0) > 1 ? <Field label={kind === "pfs" ? "Person / statement" : "Document family"}><Select aria-label="Statement family" value={snapshot?.family_id} disabled={Boolean(busy)} onChange={(event) => switchForm(kind, event.target.value)}>{snapshot?.families.filter((family) => family.kind === kind).map((family) => <option key={family.id} value={family.id}>{family.label}</option>)}</Select></Field> : null}
          <button type="button" disabled={Boolean(busy)} aria-expanded={familyOpen} onClick={() => setFamilyOpen((value) => !value)}><Icon name="plus" size={13} />{kind === "pfs" ? "Add person / statement" : "Add reporting period"}</button>
          {familyOpen ? <div className="fw-new-family"><Field label="Statement label"><Input aria-label="Statement label" value={familyDraft.label} onChange={(event) => setFamilyDraft((draft) => ({ ...draft, label: event.target.value }))} placeholder={kind === "pfs" ? "Jane Smith — personal statement" : "2026 year to date"} /></Field><Field label={kind === "pfs" ? "Person's name" : "Business / subject"}><Input aria-label="Statement subject" value={familyDraft.subject} onChange={(event) => setFamilyDraft((draft) => ({ ...draft, subject: event.target.value }))} /></Field>{kind === "p_and_l" || kind === "operating_plan" ? <><Field label="Period start"><Input aria-label="Period start" type="date" value={familyDraft.period_start} onChange={(event) => setFamilyDraft((draft) => ({ ...draft, period_start: event.target.value }))} /></Field><Field label="Period end"><Input aria-label="Period end" type="date" value={familyDraft.period_end} onChange={(event) => setFamilyDraft((draft) => ({ ...draft, period_end: event.target.value }))} /></Field></> : <Field label="As of"><Input aria-label="As of" type="date" value={familyDraft.as_of} onChange={(event) => setFamilyDraft((draft) => ({ ...draft, as_of: event.target.value }))} /></Field>}<Btn size="sm" disabled={Boolean(busy) || !familyDraft.label.trim() || !familyDraft.subject.trim()} onClick={() => void run("family", async () => { await flush(); const { label, ...identity } = familyDraft; accept(await createFinancialFamily(api, profileId, kind, label.trim(), Object.fromEntries(Object.entries(identity).filter(([, value]) => Boolean(value))))); setFamilyOpen(false); setFamilyDraft({ label: "", subject: "", period_start: "", period_end: "", as_of: "" }); setView(financialWorkspaceEntryView(kind)); })}>Create statement</Btn></div> : null}
          <div className="fw-sidebar-sections"><span className="lbl">{kind === "debt_schedule" ? "Obligations" : "Sections"}</span>
            {kind === "debt_schedule" ? <>{navigationDebts.map((row, index) => <button type="button" key={row.id} className={selected?.id === row.id ? "on" : ""} disabled={Boolean(busy)} onClick={() => focusDebt(row.id)}><span>{String(row.lender || (isBlankFinancialDebt(row) ? "New obligation" : `Obligation ${index + 1}`))}</span>{excludedIds.has(row.id) ? <small>{row.status}</small> : null}</button>)}<Btn size="sm" onClick={addDebt} disabled={Boolean(busy)}><Icon name="plus" size={13} />Add row</Btn><label className="checkline"><input type="checkbox" checked={showExcluded} onChange={(event) => setShowExcluded(event.target.checked)} />Show removed / duplicates</label></>
              : sections.map((section) => <button type="button" key={section} onClick={() => jumpTo(section)}>{section}</button>)}
          </div>
          <div className="fw-publication"><Icon name="shieldChk" size={16} /><strong>{completedVersion ? `Published v${completedVersion.version_number}` : currentVersion ? `Saved PDF v${currentVersion.version_number}` : "Draft only"}</strong><small>{completedVersion ? when(completedVersion.created_at) : kind === "debt_schedule" ? "No completed schedule version has been filed. Save version publishes the completed draft and its dated PDF." : "Save the first version to publish these figures."}</small><small>{completedVersion ? "The financial interface and AI use this saved version." : "Uploaded and historical PDFs remain available in History."}</small></div>
        </aside>
        <main className="fw-main">
          <nav className="fw-tabs" aria-label="Financial workspace views" role="tablist">{VIEWS.filter((tab) => kind !== "debt_schedule" || tab.id !== "form").map((tab) => <button type="button" role="tab" aria-selected={view === tab.id} key={tab.id} disabled={Boolean(busy)} onClick={() => switchView(tab.id)}><Icon name={tab.icon} size={15} />{tab.label}</button>)}</nav>
          {!loading && preparation ? <div className="fw-alert"><PreparationProgress compact title={preparation.title} description={preparation.description} steps={preparation.steps} /></div> : null}
          {error ? <div className="fw-alert"><Callout tone="bad">{error}{conflict ? <p>Your draft is kept in this window. Reload the server draft to resolve the conflict before saving.</p> : null}<div className="row"><Btn size="sm" disabled={Boolean(busy)} onClick={() => void run("retry", async () => { await flush(); })}>Retry save</Btn>{conflict ? <Btn size="sm" onClick={() => void run("reload", async () => { accept(await readFinancialWorkspace(api, profileId, kind, snapshot?.family_id)); setError(""); })}>Reload server draft</Btn> : null}</div></Callout></div> : null}
          {notice ? <div className="fw-alert"><Callout tone="ok">{notice}</Callout></div> : null}
          {savedReceipt ? <div className="fw-save-receipt"><div><strong>Saved v{savedReceipt.version_number} · {when(savedReceipt.created_at)}</strong><span className="sub">{receiptSummary}</span></div><div className="row"><Btn size="sm" disabled={Boolean(busy)} onClick={() => void run("pdf", async () => { await showPdf(savedReceipt.id); setFileMode("versions"); setView("pdf"); })}>Open saved PDF</Btn><Btn size="sm" disabled={Boolean(busy)} onClick={() => downloadPdf(savedReceipt.id)}>Download PDF</Btn><Btn size="sm" disabled={Boolean(busy)} onClick={() => copyPdfShare(savedReceipt.id)}>Copy PDF share link</Btn></div></div> : null}
          {sharedPdf ? <div className="fw-share-result"><label className="lbl" htmlFor="fw-pdf-share-link">Read-only PDF · v{snapshot?.versions.find((version) => version.id === sharedPdf.version_id)?.version_number ?? "saved"} · expires {when(sharedPdf.expires_at)}</label><input id="fw-pdf-share-link" readOnly value={sharedPdf.url} onFocus={(event) => event.currentTarget.select()} /></div> : null}
          {hasDraft && view !== "history" ? <div className="fw-draft-note"><Icon name="note" size={14} />Draft changes are saved here. Financial summaries and AI update when you save a version, which includes a dated PDF.</div> : null}
          {loading ? <div className="fw-alert"><PreparationProgress title="Opening financial workspace" description="Loading the working draft, linked files and saved versions." /></div> : !snapshot ? <div className="empty">The financial workspace could not be opened.</div> : <>
            {kind === "debt_schedule" ? <div hidden={view !== "worksheet"}><DebtBatchImport key={`${profileId}:${snapshot.family_id}`} api={api} profileId={profileId} snapshot={{ ...snapshot, body }} disabled={Boolean(busy) && busy !== "debt-batch" || conflict} prepare={async () => { await flush(); if (!current.current) throw new Error("Open the working schedule before reviewing debt files."); return current.current; }} onSnapshot={accept} onBusyChange={(working) => setBusy((value) => working ? "debt-batch" : value === "debt-batch" ? "" : value)} onError={(reason) => { if (isFinancialDraftConflict(reason)) { setConflict(true); setError(message(reason)); } }} /></div> : null}
            {view === "form" ? <div className="fw-form" ref={formRef}>
              <h3>{FINANCIAL_LABELS[kind]}</h3>
              {kind === "debt_schedule" ? <div className="fw-debt-summary"><strong>{activeDebts.length} active obligations</strong><span>{computed.total_monthly_payment == null ? "Monthly payments incomplete" : `${computed.total_monthly_payment.toLocaleString(undefined, { style: "currency", currency: "USD" })} a month`}</span><span>{computed.total_balance == null ? "Balances incomplete" : `${computed.total_balance.toLocaleString(undefined, { style: "currency", currency: "USD" })} outstanding`}</span></div> : null}
              {kind === "debt_schedule" && !activeDebts.length ? <label className="checkline fw-no-debt"><input type="checkbox" checked={body.no_debt === true} disabled={Boolean(busy)} onChange={(event) => changeBody({ ...draftBody.current, no_debt: event.target.checked })} />I confirm this business has no outstanding debt.</label> : null}

              {renderFields()}
            </div> : null}
            {view === "worksheet" && layout ? <div className={`fw-worksheet ${workspaceStyles.worksheet}`}>
              <div className="fw-grid-toolbar"><span className="sub">Double-click a figure or date to edit; click ▾ for a category. Scroll across columns or down rows.</span>{kind === "debt_schedule" ? <><label className="checkline"><input type="checkbox" checked={showExcluded} onChange={(event) => setShowExcluded(event.target.checked)} />Show excluded</label><Btn size="sm" disabled={Boolean(busy) || conflict} onClick={addDebt}>Add row</Btn></> : null}</div>
              {kind === "debt_schedule" ? <div className="fw-debt-summary" aria-live="polite"><strong>{activeDebts.length} active obligations</strong><span>{computed.total_monthly_payment == null ? "Monthly payments incomplete" : `${computed.total_monthly_payment.toLocaleString(undefined, { style: "currency", currency: "USD" })} a month`}</span><span>{computed.total_balance == null ? "Balances incomplete" : `${computed.total_balance.toLocaleString(undefined, { style: "currency", currency: "USD" })} outstanding`}</span></div> : null}
              {kind === "debt_schedule" && !activeDebts.length ? <label className="checkline"><input type="checkbox" checked={body.no_debt === true} disabled={Boolean(busy)} onChange={(event) => changeBody({ ...draftBody.current, no_debt: event.target.checked })} />I confirm this business has no outstanding debt.</label> : null}

              {kind === "debt_schedule" && (canDraftDebtIntake({ ...snapshot, body }) || hasPendingDebtIntakeReview({ ...snapshot, body })) ? <DebtScheduleIntakeActions profileId={profileId} workspace={{ ...snapshot, body }} beforeRead={async () => { await flush(); return current.current!; }} onApplied={(next) => { accept(next); setView("worksheet"); setNotice("AI draft added for your review. Save version publishes its PDF and financial figures."); }} onReload={() => run("reload", async () => accept(await readFinancialWorkspace(api, profileId, kind, snapshot.family_id)))} /> : null}
              {duplicateRow ? <div className={workspaceStyles.duplicatePicker}><strong>Mark {String(debts.find((row) => row.id === duplicateRow)?.lender || "this row")} as a duplicate</strong><p>Choose the same obligation to keep. Separate loans at the same lender remain separate.</p><Select aria-label="Surviving loan row" value={duplicateTarget} disabled={Boolean(busy)} onChange={(event) => setDuplicateTarget(event.target.value)}><option value="">Choose the surviving loan…</option>{activeDebts.filter((row) => row.id !== duplicateRow).map((row) => <option key={row.id} value={row.id}>{financialDebtChoiceLabel(row, debts.indexOf(row) + 1)}</option>)}</Select><div className="row"><Btn size="sm" disabled={Boolean(busy)} onClick={() => setDuplicateRow(null)}>Cancel duplicate</Btn><Btn size="sm" disabled={!duplicateTarget || Boolean(busy) || conflict} onClick={() => void run("duplicate", async () => { await flush(); if (!current.current) return; accept(await actOnFinancialDebt(api, profileId, current.current, { op: "duplicate", row_id: duplicateRow, target_row_id: duplicateTarget })); setDuplicateRow(null); setDuplicateTarget(""); setNotice("Duplicate row excluded from draft totals. Its evidence remains accessible. Save version to publish the change."); })}>Confirm duplicate</Btn></div></div> : null}
              <SheetGrid layout={layout} values={values} computed={computed} canEdit={!busy && !conflict} lockedRows={excludedIds} focusRow={gridFocus} onFocusedRow={(id) => setGridFocus((request) => request?.requestId === id ? undefined : request)} rowDetails={kind === "debt_schedule" ? { label: "Actions", width: 128, render: (gridRow) => {
                const debt = debts.find((item) => item.id === gridRow.row_key);
                if (!debt) return null;
                const links = debt.evidence_links ?? [];
                const payoff = links.some((link) => link.role === "payoff" && link.is_current && !historicalDocumentReference({ ...link, ...snapshot.evidence.find((file) => file.file_id === link.file_id) }, link.file_id));
                const payoffReview = !payoff && links.some((link) => link.role === "payoff" && link.is_current);
                const documentsLabel = `Documents for ${debt.lender || "obligation"}: ${links.length} linked${payoff ? ", current payoff selected" : payoffReview ? ", payoff review needed" : ""}`;
                const documentNames = links.map((link) => snapshot.evidence.find((file) => file.file_id === link.file_id)?.file_name || "Linked file");
                return <div className={workspaceStyles.gridRowActions}><IconBtn className={payoff ? workspaceStyles.currentPayoff : payoffReview ? workspaceStyles.payoffReview : undefined} disabled={Boolean(busy)} title={[documentsLabel, ...documentNames].join("\n")} aria-label={documentsLabel} onClick={() => { setSelectedDebt(debt.id); setRowToolsOpen(false); setFileMode("sources"); setView("pdf"); setSourceFile(links.length === 1 ? links[0].file_id : ""); setSourceUrl(null); setProposal(null); }}><Icon name={payoff ? "docCheck" : "link"} size={14} />{links.length ? <span className={workspaceStyles.documentCount} aria-hidden>{links.length}</span> : null}</IconBtn>{excludedIds.has(debt.id) ? <IconBtn disabled={Boolean(busy) || conflict} title={`Restore ${debt.lender || "loan"} row`} aria-label={`Restore ${debt.lender || "loan"} row`} onClick={() => debtAction({ op: "restore", row_id: debt.id })}><Icon name="refresh" size={14} /></IconBtn> : <><IconBtn disabled={Boolean(busy) || conflict} title={`Remove ${debt.lender || "loan"} row`} aria-label={`Remove ${debt.lender || "loan"} row`} onClick={() => debtAction({ op: "delete", row_id: debt.id })}><Icon name="trash" size={14} /></IconBtn><IconBtn disabled={Boolean(busy) || conflict} title={`Mark ${debt.lender || "loan"} duplicate`} aria-label={`Mark ${debt.lender || "loan"} duplicate`} onClick={() => { setDuplicateRow(debt.id); setDuplicateTarget(""); }}><Icon name="copy" size={14} /></IconBtn></>}</div>;
              } } : undefined} onEdits={editCells} onPaste={(topLeft, matrix) => { const planned = planPaste(layout, values, topLeft, matrix); editCells(planned.edits); if (planned.clipped) setNotice("Some pasted rows extend beyond this section. Use Add row, then paste again."); }} onCursor={(cursor) => { if (!busy && cursor.rowKey) setSelectedDebt(cursor.rowKey); }} onNotice={(value) => setNotice(value ?? "")} />
              {kind === "debt_schedule" && selected ? <details className="fw-row-tools" open={rowToolsOpen} onToggle={(event) => setRowToolsOpen(event.currentTarget.open)}><summary>Manage {String(selected.lender || "selected obligation")}: linked files, payoff, duplicate or remove</summary><DebtInspector key={selected.id} profileId={profileId} row={selected} rows={debts} snapshot={snapshot} busy={Boolean(busy)} onAction={debtAction} onPreview={previewSource} onReadTerms={(fileId) => importSource(fileId, "payoff")} onSourcesChanged={async () => { await flush(); if (current.current) accept(await readFinancialWorkspace(api, profileId, kind, current.current.family_id)); }} /></details> : null}
            </div> : null}
            {view === "pdf" ? <div className="fw-pdf-workspace">
              <div className="fw-file-modes" aria-label="File views">
                <Btn size="sm" variant={fileMode === "sources" ? "pri" : "default"} onClick={() => setFileMode("sources")}>{kind === "debt_schedule" ? "Loan files" : "Source files"}</Btn>
                <Btn size="sm" variant={fileMode === "versions" ? "pri" : "default"} onClick={() => setFileMode("versions")}>Saved version PDFs</Btn>
              </div>
              {fileMode === "sources" ? <>
                {kind === "real_estate_schedule" ? <div className="fw-source-tools" aria-label="Real estate source document type"><Btn size="sm" variant={realEstateSourceMode === "schedule" ? "pri" : undefined} disabled={Boolean(busy)} onClick={() => openRealEstateSource("schedule")}>Existing real estate schedule</Btn><Btn size="sm" variant={realEstateSourceMode === "mortgage" ? "pri" : undefined} disabled={Boolean(busy)} onClick={() => openRealEstateSource("mortgage")}>Mortgage statements</Btn></div> : null}
                {kind === "real_estate_schedule" && realEstateSourceMode === "mortgage" ? <RealEstateMortgageEvidence api={api} profileId={profileId} snapshot={snapshot} links={mortgageEvidence} initialMortgageId={selectedMortgage} initialPropertyId={selectedProperty} disabled={Boolean(busy) && busy !== "mortgage-evidence"} prepare={async () => { await flush(); if (!current.current) throw new Error("Open the real estate schedule before reviewing statements."); return current.current; }} onSnapshot={accept} onRefreshEvidence={() => { refreshEvidence((value) => value + 1); for (const key of ["application-collection-tasks", "application-evidence-workspace", "form-answers"]) void queryClient.invalidateQueries({ queryKey: [key, profileId] }); }} onBusyChange={(working) => setBusy(working ? "mortgage-evidence" : "")} onError={(reason) => { if (isFinancialDraftConflict(reason)) { setConflict(true); setError(message(reason)); } }} onPreview={previewSource} onUploadFiles={onUploadFiles} /> : <>
                {kind === "debt_schedule" ? <section className="fw-loan-files">
                  <div className="fw-loan-file-heading"><Field label="Files related to this loan"><Select aria-label="Loan for source documents" disabled={Boolean(busy)} value={selected?.id ?? ""} onChange={(event) => { setSelectedDebt(event.target.value); setSourceFile(""); setSourceUrl(null); setProposal(null); }}><option value="">Choose a loan…</option>{debts.map((row) => <option key={row.id} value={row.id}>{financialDebtChoiceLabel(row, debts.indexOf(row) + 1)}{row.status !== "active" && row.status ? ` · ${row.status}` : ""}</option>)}</Select></Field><p>Link agreements and payoff letters to the selected loan. Reviewing terms keeps current values unchanged until you apply them.</p></div>
                  {selected ? <div className="fw-related-files">{(selected.evidence_links ?? []).map((link, index) => <div key={`${link.file_id}:${link.role}:${index}`} className="fw-document-link"><Icon name="file" size={15} /><div><LoanImageName file={previewFiles.find((file) => file.file_id === link.file_id) ?? { file_id: link.file_id, file_name: "Linked file" }} disabled={Boolean(busy)} /><small>{link.role}{link.is_current ? historicalDocumentReference({ ...link, ...snapshot.evidence.find((file) => file.file_id === link.file_id) }, link.file_id) ? " · Previously selected payoff; review latest" : " · Current payoff" : ""}</small><DocumentVersionBadge file={{ ...link, ...snapshot.evidence.find((file) => file.file_id === link.file_id), id: link.file_id, file_name: "Linked file", content_type: snapshot.evidence.find((file) => file.file_id === link.file_id)?.content_type ?? undefined }} /></div><Btn size="sm" disabled={Boolean(busy)} onClick={() => previewSource(link.file_id)}>Preview</Btn><Btn size="sm" disabled={Boolean(busy)} onClick={() => importSource(link.file_id, link.role)}>Read terms</Btn>{link.role === "payoff" && !link.is_current && !historicalDocumentReference({ ...link, ...snapshot.evidence.find((file) => file.file_id === link.file_id) }, link.file_id) ? <Btn size="sm" disabled={Boolean(busy)} onClick={() => debtAction({ op: "select_payoff", row_id: selected.id, file_id: link.file_id, role: "payoff", payoff_amount: link.payoff_amount == null ? null : String(link.payoff_amount), payoff_date: link.payoff_date })}>Use as current payoff</Btn> : null}<Btn size="sm" disabled={Boolean(busy)} onClick={() => debtAction({ op: "unlink_document", row_id: selected.id, file_id: link.file_id, role: link.role })}>Unlink</Btn></div>)}{!selected.evidence_links?.length ? <p className="sub">No documents are linked to {String(selected.lender || "this loan")} yet.</p> : null}</div> : null}
                </section> : null}
                <div className="fw-source-tools">
                  <Field label={kind === "debt_schedule" ? "Link an uploaded file" : "Source document"}>{kind === "debt_schedule" ? <LoanFilePicker files={previewFiles} value={sourceFile} disabled={Boolean(busy)} linkedIds={selected?.evidence_links?.map((link) => link.file_id)} onChange={(fileId) => { setSourceFile(fileId); setSourceUrl(null); setProposal(null); const linked = selected?.evidence_links?.find((link) => link.file_id === fileId); if (linked) setSourceRole(linked.role); }} /> : <Select aria-label="Source document" disabled={Boolean(busy)} value={sourceFile} onChange={(event) => { setSourceFile(event.target.value); setSourceUrl(null); setProposal(null); }}><option value="">Choose an uploaded document…</option>{snapshot.evidence.map((file) => <option key={file.file_id} value={file.file_id}>{file.file_name}{file.document_version_number ? ` · ${documentVersionLabel(file)}` : ""}</option>)}</Select>}</Field>
                  {kind === "debt_schedule" ? <Field label="Document role"><Select aria-label="Source document role" value={sourceRole} onChange={(event) => setSourceRole(event.target.value as DebtDocumentRole)}><option value="agreement">Loan agreement</option><option value="payoff">Payoff letter</option><option value="supporting">Supporting document</option></Select></Field> : null}
                  <Btn disabled={!sourceFile || Boolean(busy)} onClick={() => previewSource()}>Open source</Btn>
                  {kind === "debt_schedule" ? <Btn disabled={!selected || !sourceFile || Boolean(busy)} onClick={() => debtAction({ op: "link_document", row_id: selected!.id, file_id: sourceFile, role: sourceRole })}>Link to loan</Btn> : null}
                  <Btn disabled={!sourceFile || Boolean(busy) || kind === "debt_schedule" && !selected} onClick={() => importSource()}>{busy === "import" ? "Reading…" : kind === "debt_schedule" ? "Read terms from file" : "Read and map fields"}</Btn>
                  {onUploadFiles || kind === "debt_schedule" ? <><input ref={uploadRef} type="file" multiple={kind === "debt_schedule"} hidden accept={kind === "debt_schedule" ? DEBT_SOURCE_ACCEPT : kind === "real_estate_schedule" ? ".pdf,.xlsx" : ".pdf"} onChange={(event) => {
                    const files = Array.from(event.target.files ?? []);
                    if (files.length) void run("upload", async () => {
                      setUploadStatus(null); setNotice("");
                      await flush(); const beforeIds = new Set(current.current?.evidence.map((file) => file.file_id));
                      const target = { rowId: selected?.id ?? null, familyId: current.current?.family_id ?? null };
                      let uploadFailure: unknown = null;
                      const uploadedIds = new Set<string>();
                      try { await uploadEvidence(files, (fileId) => uploadedIds.add(fileId)); } catch (reason) { uploadFailure = reason; }
                      const refreshed = await readFinancialWorkspace(api, profileId, kind, snapshot.family_id);
                      if (!mounted.current || debtContext.current.familyId !== target.familyId || kind === "debt_schedule" && debtContext.current.rowId !== target.rowId) return;
                      if (current.current) current.current = { ...current.current, evidence: refreshed.evidence };
                      setSnapshot((old) => old ? { ...old, evidence: refreshed.evidence } : old);
                      const candidates = refreshed.evidence.filter((file) => uploadedIds.has(file.file_id) || !beforeIds.has(file.file_id) && files.some((upload) => upload.name === file.file_name));
                      if (!candidates.length) {
                        setUploadStatus({ tone: "warn", message: uploadFailure ? message(uploadFailure) : "The files are not available in this file yet. An upload may have failed or may still be processing. Check its upload status, then refresh files or try again." });
                        return;
                      }
                      if (candidates.length === 1 && files.length === 1) { setSourceFile(candidates[0].file_id); setSourceUrl(null); setProposal(null); }
                      if (kind === "debt_schedule" && target.rowId && target.familyId) {
                        setUploadedTarget({ rowId: target.rowId, familyId: target.familyId });
                        setUploadedLinks((pending) => { const merged = new Map(pending.map((file) => [file.file_id, file])); for (const file of candidates) if (!merged.has(file.file_id)) merged.set(file.file_id, { file_id: file.file_id, file_name: file.file_name, role: "supporting", selected: true, payoff_amount: "", payoff_date: "" }); return [...merged.values()]; });
                      }
                      setUploadStatus({ tone: uploadFailure ? "warn" : "ok", message: uploadFailure ? `${message(uploadFailure)} Received files below are retained and can still be linked.` : kind === "debt_schedule" ? "Files received. Choose each file’s role below, then link them to this loan. Review any extracted terms before applying." : "File received. Review its mapped fields before applying them." });
                    });
                    if (uploadRef.current) uploadRef.current.value = "";
                  }} /><Btn disabled={Boolean(busy) || kind === "debt_schedule" && !selected} onClick={() => uploadRef.current?.click()}>{kind === "debt_schedule" ? "Upload PDFs / images" : kind === "real_estate_schedule" ? "Upload schedule PDF / Excel" : "Upload source PDF"}</Btn></> : null}
                  <Btn disabled={Boolean(busy)} onClick={() => void run("sources", async () => { const refreshed = await readFinancialWorkspace(api, profileId, kind, snapshot.family_id); if (current.current) current.current = { ...current.current, evidence: refreshed.evidence }; setSnapshot((old) => old ? { ...old, evidence: refreshed.evidence } : old); })}>Refresh files</Btn>
                </div>
                {uploadStatus ? <Callout tone={uploadStatus.tone}>{uploadStatus.message}</Callout> : null}
                {kind === "debt_schedule" && uploadedLinks.length ? <section className={workspaceStyles.uploadLinks} aria-label="Link uploaded loan files"><h4>Files for {String(selected?.lender || "selected loan")}</h4>{uploadedLinks.map((file, index) => <div className={workspaceStyles.uploadLink} key={file.file_id}><label className="checkline"><input type="checkbox" checked={file.selected} disabled={Boolean(busy)} onChange={(event) => setUploadedLinks((rows) => rows.map((row, at) => at === index ? { ...row, selected: event.target.checked } : row))} />{file.file_name}</label><Select aria-label={`Role for ${file.file_name}`} value={file.role} disabled={Boolean(busy)} onChange={(event) => setUploadedLinks((rows) => rows.map((row, at) => at === index ? { ...row, role: event.target.value as DebtDocumentRole } : row))}><option value="supporting">Supporting document / breakdown</option><option value="agreement">Loan agreement</option><option value="payoff">Payoff letter</option></Select>{file.role === "payoff" ? <><Input aria-label={`Reviewed payoff amount for ${file.file_name}`} placeholder="Reviewed payoff amount" inputMode="decimal" value={file.payoff_amount} disabled={Boolean(busy)} onChange={(event) => setUploadedLinks((rows) => rows.map((row, at) => at === index ? { ...row, payoff_amount: event.target.value } : row))} /><Input aria-label={`Reviewed payoff date for ${file.file_name}`} type="date" value={file.payoff_date} disabled={Boolean(busy)} onChange={(event) => setUploadedLinks((rows) => rows.map((row, at) => at === index ? { ...row, payoff_date: event.target.value } : row))} /></> : null}</div>)}<Btn disabled={Boolean(busy) || !selected || !uploadedLinks.some((file) => file.selected)} onClick={linkUploaded}>Link selected files to loan</Btn></section> : null}
                {proposal ? <div className="fw-import"><h4>Review mapped fields</h4><p>{proposal.target_row_id ? `Apply only to ${String(debts.find((row) => row.id === proposal.target_row_id)?.lender || "the selected loan")}. The source is linked after Apply selected fields.` : "The original upload remains available. Apply selected fields to this draft, then save a new version."}</p>{proposal.warnings.map((warning) => <Callout key={warning} tone="warn">{warning}</Callout>)}<div className="fw-mappings">{proposal.mappings.map((mapping, index) => <label className={mappingConflict(mapping) ? "is-conflict" : ""} key={`${mapping.key}:${index}`}><input type="checkbox" checked={selectedMappings.includes(mapping.key)} onChange={(event) => setSelectedMappings((keys) => event.target.checked ? [...new Set([...keys, mapping.key])] : keys.filter((key) => key !== mapping.key))} /><strong>{mapping.derived ? "≈ Calculated monthly payment" : mappingLabel(mapping)}</strong><div className="fw-mapping-values"><small>Existing</small><span>{mappingValue(mapping, true)}</span><small>{mapping.derived ? "Calculated" : "Proposed"}</small><span>{mappingValue(mapping)}</span>{mapping.derived ? <small className="fw-calculation">{mapping.source.calculation || "Payment amount × monthly multiplier"}{mapping.source.multiplier ? ` (${mapping.source.multiplier})` : ""}</small> : null}</div><div className="fw-mapping-source"><CellChip tone={mappingConflict(mapping) ? "warn" : "mut"}>{mappingConflict(mapping) ? "Changes existing answer" : financialMappingConfidence(mapping.confidence)}</CellChip>{mapping.source.file_id ? <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); previewSource(mapping.source.file_id, mapping.source.page, mapping.source.content_hash); }}>{mapping.source.sheet ? `Open ${mapping.source.sheet}${mapping.source.cell ? ` · ${mapping.source.cell}` : ""}` : mapping.source.page ? `Open page ${mapping.source.page}` : "Open source"}</button> : <small>Calculated from reviewed payment terms</small>}</div>{mapping.source.quote ? <q title={mapping.confidence === "high" ? "Quote verified against the source page" : "Source excerpt needs review"}>{mapping.source.quote}</q> : null}</label>)}</div><div className="row"><Btn onClick={() => setProposal(null)}>Cancel mapping</Btn><Btn variant="pri" disabled={!selectedMappings.length || Boolean(busy)} onClick={applyImport}>Apply selected fields</Btn></div></div> : null}
                </>}
                <div className="fw-pdf-panes split"><section><header><strong>{selected && kind === "debt_schedule" ? `Source for ${String(selected.lender || "selected loan")}` : "Original source"}</strong>{sourceOriginalUrl ? <a href={sourceOriginalUrl} target="_blank" rel="noreferrer">Open original file</a> : null}{sourceUrl ? <Btn size="sm" onClick={() => setSourceUrl(null)}>Hide source</Btn> : null}</header>{sourceUrl ? financialSourceIsImage({ ...snapshot.evidence.find((file) => file.file_id === sourceFile), content_type: sourceContentType }) || proposal?.mappings.some((mapping) => mapping.source.file_id === sourceFile && mapping.source.kind === "image") ? <div className={workspaceStyles.imagePreview}>{!imageFailed ? <img src={sourceUrl} alt={snapshot.evidence.find((file) => file.file_id === sourceFile)?.file_name || "Loan supporting image"} onError={() => setImageFailed(true)} /> : <p>This browser could not display this image format.</p>}<a href={sourceOriginalUrl ?? sourceUrl} target="_blank" rel="noreferrer">Open original image</a></div> : /\.xlsx?$/i.test(snapshot.evidence.find((file) => file.file_id === sourceFile)?.file_name ?? "") ? <div className="empty"><p>This source is a spreadsheet. Download it to compare its source cells with the reviewed fields.</p><a href={sourceUrl} target="_blank" rel="noreferrer">Open source spreadsheet</a></div> : <iframe title="Original financial source document" src={sourceUrl} /> : <div className="empty">Choose a related PDF or image and open its source to compare the printed terms.</div>}</section><section><header><strong>Working draft</strong><Btn size="sm" onClick={() => switchView(financialWorkspaceEntryView(kind))}>{kind === "debt_schedule" ? "Back to worksheet" : "Open form"}</Btn></header><div className="fw-pdf-fields">{kind === "debt_schedule" ? selected ? <dl className={workspaceStyles.sourceDetails}>{[["lender", "Lender"], ["debt_type", "Type of debt"], ["original_amount", "Original amount"], ["balance", "Current balance"], ["rate", "Annual interest rate (%)"], ["payment_amount", "Payment amount"], ["payment_frequency", "Payment frequency"], ["monthly_payment", "Monthly payment"], ["originated_on", "Origination date"], ["maturity_on", "Maturity date"], ["secured", "Secured status"], ["payment_status", "Payment status"], ["notes", "Notes"]].map(([field, label]) => <div key={field}><dt>{label}</dt><dd>{field === "originated_on" ? formatLoanOriginationDate(selected[field]) : String(selected[field] ?? "").trim() || "Not stated"}{renderFieldSource(selected as DebtRow, field as keyof DebtRow)}</dd></div>)}<div><dt>% paid down</dt><dd title={loanPaidDownDescription(selected.original_amount, selected.balance)}>{formatLoanPaidDown(selected.original_amount, selected.balance)}</dd></div></dl> : <div className="empty">Select a loan to compare its working values.</div> : renderFields()}</div></section></div>
              </> : <div className="fw-pdf-panes"><section><header><strong>{selectedWorkbook ? `Original ${originalKind}` : "Saved version PDF"}</strong>{(pdfVersionId ?? snapshot.current_version_id) ? <div className="row"><Btn size="sm" disabled={Boolean(busy) || Boolean(selectedWorkbook)} onClick={() => downloadPdf((pdfVersionId ?? snapshot.current_version_id)!)}>Download PDF</Btn><Btn size="sm" disabled={Boolean(busy) || Boolean(selectedWorkbook)} onClick={() => copyPdfShare((pdfVersionId ?? snapshot.current_version_id)!)}>Copy PDF share link</Btn></div> : null}{snapshot.versions.length ? <Select aria-label="PDF version" disabled={Boolean(busy)} value={pdfVersionId ?? snapshot.current_version_id ?? ""} onChange={(event) => { const id = event.target.value; if (financialVersionSourceKind(snapshot, id) !== "pdf") { setPdfVersionId(id); setPdfUrl(null); } else void run("pdf", async () => { await showPdf(id); }); }}>{snapshot.versions.map((version) => <option key={version.id} value={version.id}>v{version.version_number} · {when(version.created_at)}</option>)}</Select> : null}</header>{pdfUrl ? <iframe title="Saved financial version PDF" src={pdfUrl} /> : <div className="empty">{selectedWorkbook?.source_file_id ? <><p>This version preserves the original source file. Later saved versions have dated PDFs.</p><Btn size="sm" onClick={() => { setRealEstateSourceMode("schedule"); previewSource(selectedWorkbook.source_file_id!); }}>Open original {originalKind}</Btn></> : "Save a version to generate its dated PDF."}</div>}</section></div>}
            </div> : null}
            {view === "history" ? <div className="fw-history"><h3>Dated versions</h3><p>Original client files and every saved revision stay available. Restoring an older version creates a draft; Save version publishes the next version.</p>{snapshot.versions.map((version) => <article key={version.id}><div><strong>v{version.version_number}</strong>{version.id === snapshot.current_version_id ? <CellChip tone={version.id === completedVersion?.id ? "ok" : "mut"}>{version.id === completedVersion?.id ? "Current · used by AI" : "Current saved PDF"}</CellChip> : null}<span>{when(version.created_at)}</span><small>{version.actor_name || "Client upload"} · {version.source.replaceAll("_", " ")}</small></div><div className="row"><Btn disabled={Boolean(busy)} onClick={() => { if (financialVersionSourceKind(snapshot, version.id) !== "pdf" && version.source_file_id) { setRealEstateSourceMode("schedule"); previewSource(version.source_file_id); } else void run("pdf", async () => { await showPdf(version.id); setFileMode("versions"); setView("pdf"); }); }}>{financialVersionSourceKind(snapshot, version.id) !== "pdf" ? `Open original ${financialVersionSourceKind(snapshot, version.id)}` : "View PDF"}</Btn><Btn disabled={Boolean(busy)} onClick={() => void run("restore", async () => { await flush(); accept(await restoreFinancialVersion(api, profileId, version.id, current.current!.draft.revision)); setNotice(`v${version.version_number} restored into the draft. Save version to publish it as the next revision.`); setView(financialWorkspaceEntryView(kind)); })}>Restore to draft</Btn></div></article>)}{!snapshot.versions.length ? <div className="empty">No saved versions yet. Uploaded originals appear here as v1.</div> : null}</div> : null}
          </>}
        </main>
      </div></LoanImagePreviewProvider>
    </Drawer>
    {newDebt ? <Drawer open onClose={() => { if (!busy) setNewDebt(null); }} title="Add loan row" sub="Save adds this loan to the working draft. Save version publishes financial figures and a dated PDF." width="lg" closeOnBackdrop={false} bodyClass={workspaceStyles.newRowForm} footer={<><Btn disabled={Boolean(busy)} onClick={() => setNewDebt(null)}>Cancel</Btn><span className="sp" /><Btn disabled={Boolean(busy) || conflict || isBlankFinancialDebt(newDebt)} onClick={() => void saveNewDebt(true)}>Add another</Btn><Btn variant="pri" disabled={Boolean(busy) || conflict || isBlankFinancialDebt(newDebt)} onClick={() => void saveNewDebt(false)}>{busy === "add-debt" ? "Saving…" : "Save"}</Btn></>}><DebtScheduleForm key={newDebt.id} singleRow rowEntry scheduleCompletion value={{ business_name: String(body.business_name ?? ""), debts: [{ ...newDebt, editable: true } as DebtRow] }} disabled={Boolean(busy)} onChange={(next) => { const row = next.debts?.[0]; if (row) setNewDebt({ ...newDebt, ...row, id: newDebt.id }); }} />{newDebtError ? <Callout tone="bad">{newDebtError}{conflict ? <p>The shared draft changed. Close this popup and resolve the draft conflict before adding this loan.</p> : <p>Your entered details remain here. Retry Save or Add another.</p>}</Callout> : null}</Drawer> : null}
    {requestOpen ? <RequestFilesDialog profileId={profileId} open prefill={kind === "operating_plan" ? operatingPlanRequest(String(body.business_name ?? "")) : undefined} prefillKey={kind === "operating_plan" ? `operating-plan:${snapshot?.family_id}` : undefined} onClose={() => setRequestOpen(false)} onRequested={() => { void onPublished?.(); }} /> : null}
  </>;
}

function DebtInspector({ profileId, row, rows, snapshot, busy, onAction, onPreview, onSourcesChanged, onReadTerms }: {
  profileId: string;
  row: FinancialDebtRow; rows: FinancialDebtRow[]; snapshot: FinancialWorkspaceSnapshot; busy: boolean;
  onAction: (action: DebtAction) => void; onPreview: (fileId: string) => void;
  onSourcesChanged: () => Promise<void>; onReadTerms: (fileId: string) => void;
}) {
  const api = useAuthedApi();
  const versions = useMemo(() => documentVersionService(api, `/application-profiles/${profileId}/evidence`, { fileUrl: async (fileId, download) => (await api<{ url: string }>(`/application-profiles/${profileId}/evidence/files/${fileId}/url?download=${download}`)).url }), [api, profileId]);
  const [target, setTarget] = useState("");
  const [fileId, setFileId] = useState("");
  const [role, setRole] = useState<DebtDocumentRole>("payoff");
  const [payoffAmount, setPayoffAmount] = useState("");
  const [payoffDate, setPayoffDate] = useState("");
  const excluded = row.status === "dismissed" || row.status === "duplicate" || Boolean(row.duplicate_of_id);
  const links = row.evidence_links ?? [];
  return <section className="fw-debt-inspector" aria-label={`Manage ${row.lender || "obligation"}`}>
    <div className="fw-row-heading"><h4>Obligation controls</h4><CellChip tone={excluded ? "warn" : "ok"}>{row.status || "active"}</CellChip>{row.duplicate_of_id ? <span className="sub">Duplicate of {String(rows.find((item) => item.id === row.duplicate_of_id)?.lender || row.duplicate_of_id)}</span> : null}</div>
    <div className="fw-row-actions">{excluded ? <Btn disabled={busy} onClick={() => onAction({ op: "restore", row_id: row.id })}>Restore row</Btn> : <><Btn disabled={busy} onClick={() => onAction({ op: "delete", row_id: row.id })}><Icon name="trash" size={14} />Remove row</Btn><Select aria-label="This obligation is a duplicate of" value={target} onChange={(event) => setTarget(event.target.value)}><option value="">Same obligation as…</option>{rows.filter((candidate) => candidate.id !== row.id && candidate.status !== "dismissed" && candidate.status !== "duplicate" && !candidate.duplicate_of_id).map((candidate) => <option key={candidate.id} value={candidate.id}>{financialDebtChoiceLabel(candidate, rows.indexOf(candidate) + 1)}</option>)}</Select><Btn disabled={busy || !target} onClick={() => onAction({ op: "duplicate", row_id: row.id, target_row_id: target })}>Mark duplicate</Btn></>}</div>
    <h4>Linked agreements and payoff letters</h4>
    {links.map((link, index) => {
      const evidence = snapshot.evidence.find((file) => file.file_id === link.file_id);
      const file = { ...link, ...evidence, id: link.file_id, file_name: evidence?.file_name || "Linked document", content_type: evidence?.content_type ?? undefined };
      const historical = historicalDocumentReference(file, link.file_id);
      const latestUnavailable = ["failed", "rejected", "duplicate"].includes(file.latest_document_version_status || "");
      return <div className="fw-document-link" key={`${link.file_id}:${link.role}:${index}`}><Icon name="file" size={15} /><div><LoanImageName file={loanPreviewReference({ ...file, file_id: link.file_id }, snapshot.body, null, snapshot.versions)} disabled={busy} /><small>{link.role}{link.is_current ? historical ? " · Previously selected payoff" : " · Selected current payoff" : ""}{link.payoff_amount != null ? ` · $${link.payoff_amount}` : ""}{link.payoff_date ? ` · ${link.payoff_date}` : ""}</small><DocumentVersionBadge file={file} />{historical ? <small>{latestUnavailable ? "Latest upload is not ready for use. Check its version status." : "A newer upload requires review before its payoff amount is used."}</small> : null}</div><Btn size="sm" disabled={busy} onClick={() => onPreview(link.file_id)}>View</Btn>{file.latest_file_id && file.latest_file_id !== link.file_id ? <Btn size="sm" disabled={busy || latestUnavailable} onClick={() => onReadTerms(file.latest_file_id!)}>Review latest{file.latest_version_number ? ` v${file.latest_version_number}` : ""}</Btn> : null}<DocumentVersionControl compact file={file} service={versions} disabled={busy} onChanged={onSourcesChanged} onPreview={(version) => onPreview(version.id)} />{link.role === "payoff" && !link.is_current && !historical ? <Btn size="sm" disabled={busy} onClick={() => onAction({ op: "select_payoff", row_id: row.id, file_id: link.file_id, role: "payoff", payoff_amount: link.payoff_amount == null ? null : String(link.payoff_amount), payoff_date: link.payoff_date })}>Use payoff</Btn> : null}<Btn size="sm" disabled={busy} onClick={() => onAction({ op: "unlink_document", row_id: row.id, file_id: link.file_id, role: link.role })}>Unlink</Btn></div>;
    })}
    {!links.length ? <p className="sub">Link each payoff letter to its obligation so the system knows which debt it belongs to.</p> : null}
    <div className="fw-link-composer"><Field label="Document"><LoanFilePicker label="Document" files={snapshot.evidence.map((file) => loanPreviewReference(file, snapshot.body, null, snapshot.versions))} value={fileId} disabled={busy} onChange={setFileId} /></Field><Field label="Document role"><Select aria-label="Document role" value={role} onChange={(event) => setRole(event.target.value as DebtDocumentRole)}><option value="payoff">Payoff letter</option><option value="agreement">Loan agreement</option><option value="supporting">Supporting document</option></Select></Field>{role === "payoff" ? <><Field label="Payoff amount"><Input aria-label="Payoff amount" inputMode="decimal" value={payoffAmount} onChange={(event) => setPayoffAmount(event.target.value)} /></Field><Field label="Payoff date"><Input aria-label="Payoff date" type="date" value={payoffDate} onChange={(event) => setPayoffDate(event.target.value)} /></Field></> : null}<Btn disabled={busy || !fileId} onClick={() => onAction({ op: "link_document", row_id: row.id, file_id: fileId, role, ...(role === "payoff" ? { payoff_amount: payoffAmount || null, payoff_date: payoffDate || null } : {}) })}>Link document</Btn></div>
  </section>;
}
