import type { AuthedApi } from "@/lib/worksheetApi";
import type { SheetKind, SheetLayout, SheetCell, SheetRow, Edit, SheetValues } from "@/components/sheet/types";
import { parseMoney } from "@/components/sheet/money";
import { updateDebtPaymentTerms } from "@/lib/debtPaymentTerms";
import { DEBT_TYPES, isAdvanceType } from "@/lib/debtTypes";
import { loanPaidDownPct } from "@/lib/loanProgress";
import { orderDebtScheduleColumns } from "@/lib/debtWorksheetLayout";
import { clearOperatingReview, normalizeOperatingPlanBody, type OperatingAction, type OperatingExpense, type ReleasedCashFlowEvaluation } from "@/lib/operatingPlan";

export type FinancialBody = Record<string, unknown>;
export type FinancialVersion = {
  id: string; version_number: number; created_at: string; actor_name: string | null;
  source: string; source_file_id: string | null; pdf_file_id: string | null; status: string; source_content_type?: string | null;
};
export type FinancialEvidence = import("./documentVersions").DocumentVersionMetadata & { file_id: string; file_name: string; classification?: string | null; content_type?: string | null };
export type FinancialWorkspaceSnapshot = {
  kind: SheetKind; family_id: string; label: string; body: FinancialBody; schema: unknown;
  worksheet: { layout: SheetLayout; values: SheetValues; computed: Record<string, number | null> };
  draft: { revision: number; base_version_id: string | null; updated_at: string; dirty: boolean };
  current_version_id: string | null; versions: FinancialVersion[];
  accepted_version_id?: string | null;
  families: Array<{ id: string; kind: SheetKind; label: string; current_version_id: string | null }>;
  evidence: FinancialEvidence[];
  saved_version?: FinancialVersion;
  completion?: { complete: boolean; missing_fields: string[]; reason: string; no_debt: boolean; active_rows: number; released_cash_flow?: ReleasedCashFlowEvaluation } | null;
  accepted_completion?: FinancialWorkspaceSnapshot["completion"];
  saved_completion?: FinancialWorkspaceSnapshot["completion"];
};
export type FinancialImport = {
  id: string; kind: SheetKind; family_id: string; source_file_id: string; status: string;
  base_revision: number; proposed_body: FinancialBody;
  target_row_id?: string; role?: DebtDocumentRole;
  mappings: Array<{ key: string; value: unknown; before?: unknown; conflict?: boolean; derived?: boolean; source: { file_id?: string; analysis_id?: string | null; content_hash?: string; page?: number; content_type?: string; sheet?: string; cell?: string; quote?: string; kind?: string; calculation?: string; multiplier?: string; derived_from?: Record<string, unknown> }; confidence: number | "high" | "needs_review" | null }>;
  warnings: string[];
};
export type DebtDocumentRole = "agreement" | "payoff" | "supporting";
export type DebtDocumentLink = import("./documentVersions").DocumentVersionMetadata & { file_id: string; role: DebtDocumentRole; is_current?: boolean; payoff_amount?: string | number | null; payoff_date?: string | null };
export type FinancialDebtRow = Record<string, unknown> & { id: string; lender?: string; balance?: string; monthly_payment?: string; factor_rate?: string; payment_amount?: string; payment_frequency?: string; monthly_payment_source?: "native_terms" | "stated" | null; status?: "active" | "dismissed" | "duplicate"; duplicate_of_id?: string | null; evidence_links?: DebtDocumentLink[] };
export type DebtAction = {
  op: "delete" | "restore" | "duplicate" | "link_document" | "unlink_document" | "select_payoff";
  row_id: string; target_row_id?: string; file_id?: string; role?: DebtDocumentRole;
  payoff_amount?: string | null; payoff_date?: string | null;
};

const root = (profileId: string) => `/application-profiles/${encodeURIComponent(profileId)}/financial-workspace`;
export const FINANCIAL_LABELS: Record<SheetKind, string> = { debt_schedule: "Business debt schedule", pfs: "Personal financial statement", p_and_l: "Profit and loss", balance_sheet: "Balance sheet", real_estate_schedule: "Real estate schedule", operating_plan: "Operating expenses and earnings plan" };
export const FINANCIAL_ORDER: SheetKind[] = ["debt_schedule", "pfs", "real_estate_schedule", "p_and_l", "balance_sheet", "operating_plan"];
export async function readFinancialWorkspace(api: AuthedApi, profileId: string, kind: SheetKind, familyId?: string) {
  const query = new URLSearchParams({ kind });
  if (familyId) query.set("family_id", familyId);
  const result = await api<FinancialWorkspaceSnapshot>(`${root(profileId)}?${query}`);
  return result.kind === "operating_plan" ? { ...result, body: normalizeOperatingPlanBody(result.body) } : result;
}
export function saveFinancialDraft(api: AuthedApi, profileId: string, snapshot: FinancialWorkspaceSnapshot, body: FinancialBody) {
  return api<FinancialWorkspaceSnapshot>(`${root(profileId)}/draft`, { method: "PUT", body: JSON.stringify({ kind: snapshot.kind, family_id: snapshot.family_id, body: snapshot.kind === "operating_plan" ? normalizeOperatingPlanBody(body) : body, expected_revision: snapshot.draft.revision }) });
}
export function createFinancialFamily(api: AuthedApi, profileId: string, kind: SheetKind, label: string, identity: { subject?: string; period_start?: string; period_end?: string; as_of?: string }) {
  return api<FinancialWorkspaceSnapshot>(`${root(profileId)}/families`, { method: "POST", body: JSON.stringify({ kind, label, identity }) });
}
export function saveFinancialVersion(api: AuthedApi, profileId: string, snapshot: FinancialWorkspaceSnapshot, idempotencyKey: string, submit = false) {
  return api<FinancialWorkspaceSnapshot>(`${root(profileId)}/versions`, { method: "POST", body: JSON.stringify({ kind: snapshot.kind, family_id: snapshot.family_id, expected_revision: snapshot.draft.revision, base_version_id: snapshot.draft.base_version_id, idempotency_key: idempotencyKey, submit }) });
}
export function stageFinancialImport(api: AuthedApi, profileId: string, snapshot: FinancialWorkspaceSnapshot, fileId: string) {
  return api<FinancialImport>(`${root(profileId)}/imports`, { method: "POST", body: JSON.stringify({ kind: snapshot.kind, family_id: snapshot.family_id, file_id: fileId }) });
}
export function stageDebtDocumentImport(api: AuthedApi, profileId: string, snapshot: FinancialWorkspaceSnapshot, rowId: string, fileId: string, role: DebtDocumentRole = "agreement") {
  return api<FinancialImport>(`${root(profileId)}/debts/${encodeURIComponent(rowId)}/document-imports`, { method: "POST", body: JSON.stringify({ family_id: snapshot.family_id, expected_revision: snapshot.draft.revision, file_id: fileId, role }) });
}
export function applyFinancialImport(api: AuthedApi, profileId: string, importId: string, revision: number, selectedKeys: string[]) {
  return api<FinancialWorkspaceSnapshot>(`${root(profileId)}/imports/${encodeURIComponent(importId)}/apply`, { method: "POST", body: JSON.stringify({ expected_revision: revision, selected_keys: selectedKeys }) });
}
export function restoreFinancialVersion(api: AuthedApi, profileId: string, versionId: string, revision: number) {
  return api<FinancialWorkspaceSnapshot>(`${root(profileId)}/versions/${encodeURIComponent(versionId)}/restore`, { method: "POST", body: JSON.stringify({ expected_revision: revision }) });
}
export function actOnFinancialDebt(api: AuthedApi, profileId: string, snapshot: FinancialWorkspaceSnapshot, action: DebtAction) {
  return api<FinancialWorkspaceSnapshot>(`${root(profileId)}/debts/actions`, { method: "POST", body: JSON.stringify({ ...action, family_id: snapshot.family_id, expected_revision: snapshot.draft.revision }) });
}
export const financialVersionPdfPath = (profileId: string, versionId: string) => `${root(profileId)}/versions/${encodeURIComponent(versionId)}/pdf`;
export function shareFinancialVersion(api: AuthedApi, profileId: string, versionId: string) {
  return api<{ url: string; expires_at: string }>(`${root(profileId)}/versions/${encodeURIComponent(versionId)}/share`, { method: "POST" });
}
export function savedFinancialCompletion(snapshot: FinancialWorkspaceSnapshot, versionId: string) {
  if (Object.prototype.hasOwnProperty.call(snapshot, "saved_completion")) return snapshot.saved_completion ?? null;
  if (versionId !== snapshot.current_version_id) return null;
  return Object.prototype.hasOwnProperty.call(snapshot, "accepted_completion") ? snapshot.accepted_completion ?? null : snapshot.completion ?? null;
}
/** A PDF save is not proof that this exact debt version became authoritative. */
export function financialVersionPublicationState(snapshot: FinancialWorkspaceSnapshot, versionId: string): "published" | "saved_pdf" | "historical" {
  if (versionId !== snapshot.current_version_id) return "historical";
  if (snapshot.kind !== "debt_schedule") return "published";
  return savedFinancialCompletion(snapshot, versionId)?.complete && snapshot.accepted_completion?.complete && snapshot.accepted_version_id === versionId ? "published" : "saved_pdf";
}

function listIndex(rows: unknown[], key: string): number {
  const ordinal = /^r(\d+)$/.exec(key);
  if (ordinal) return Number(ordinal[1]) - 1;
  return rows.findIndex((row) => row && typeof row === "object" && String((row as Record<string, unknown>).id ?? (row as Record<string, unknown>).row_id ?? "") === key);
}
/** Follow the server layout's paths; debt IDs and PFS schedule IDs are identities, never array offsets. */
export function financialValueAt(body: FinancialBody, path: string[]): unknown {
  let value: unknown = body;
  for (const step of path) {
    if (Array.isArray(value)) value = value[listIndex(value, step)];
    else if (value && typeof value === "object") value = (value as Record<string, unknown>)[step];
    else return undefined;
  }
  return value;
}
export function financialValues(body: FinancialBody, layout: SheetLayout): SheetValues {
  const result: SheetValues = {};
  for (const row of layout.rows) for (const cell of row.cells ?? []) {
    if (cell.key && cell.path) result[cell.key] = String(financialValueAt(body, cell.path) ?? "");
  }
  return result;
}
/** Reconcile list identities immediately, including excluded debts omitted by the published layout. */
export function financialLayout(body: FinancialBody, source: SheetLayout): SheetLayout {
  if (source.kind !== "debt_schedule" && source.kind !== "pfs" && source.kind !== "real_estate_schedule" && source.kind !== "operating_plan") return source;
  if (source.kind === "debt_schedule") {
    const fields = ["lender", "debt_type", "original_amount", "balance", "rate", "monthly_payment", "originated_on", "maturity_on", "secured", "payment_status", "collateral", "mca_modified", "mca_modification_note", "notes", "factor_rate", "payment_amount", "payment_frequency"];
    const old = source.rows.filter((row) => row.kind === "data" && row.block === "debts");
    const template = old[0];
    const first = template?.r ?? (source.rows.find((row) => row.kind === "colhead")?.r ?? 5) + 2;
    const data: SheetRow[] = ((body.debts as FinancialDebtRow[] | undefined) ?? []).map((row, index) => ({
      r: first + index, kind: "data", block: "debts", row_key: row.id, ordinal: index + 1,
      cells: source.columns.map((column, at): SheetCell => {
        const original = template?.cells?.find((cell) => cell.c === column.c);
        if (original?.type === "formula" || (!original?.path && at >= fields.length)) {
          const paidDown = original?.compute?.endsWith(".paid_down_pct") || (!original && at === fields.length);
          return { ...original, c: column.c, type: "formula", editable: false, key: undefined, path: undefined,
            ...(paidDown ? { compute: `${row.id}.paid_down_pct`, xlsx_name: `${row.id}.paid_down_pct`, formula: `=IFERROR(({${row.id}.original_amount}-{${row.id}.balance})/{${row.id}.original_amount}*100,"")`, format: "percent", hint: "Balance reduction: (original amount − current balance) ÷ original amount × 100. Payoff fees, interest and factor rates are not included." }
              : { compute: original?.compute?.replace(`${template?.row_key}.`, `${row.id}.`) }) };
        }
        const field = original?.path?.at(-1) ?? fields[at];
        const categories: Record<string, Record<string, string>> = {
          debt_type: Object.fromEntries(DEBT_TYPES.map((option) => [option.value, option.label])),
          payment_frequency: { daily: "Business day", weekly: "Week", biweekly: "Every two weeks", monthly: "Month" },
          secured: { secured: "Secured", unsecured: "Unsecured" }, payment_status: { current: "Current", delinquent: "Delinquent" }, mca_modified: { yes: "Modified", no: "No modification" },
        };
        const options = categories[field];
        const legacy = options && row[field] != null && String(row[field]).trim() && !(String(row[field]) in options) ? String(row[field]) : null;
        const type = options ? "select" : ["balance", "monthly_payment", "original_amount", "payment_amount"].includes(field) ? "money" : ["rate", "factor_rate"].includes(field) ? "rate" : field.endsWith("_on") ? "date" : "text";
        return { ...original, c: column.c, type: options ? "select" : original?.type ?? type, key: `${row.id}.${field}`, path: ["debts", row.id, field], editable: true, ...(options ? { options: [...Object.keys(options), ...(legacy ? [legacy] : [])], option_labels: { ...options, ...(legacy ? { [legacy]: `${legacy} (as entered)` } : {}) } } : {}), ...(field === "factor_rate" ? { format: "text" } : {}), ...(field === "monthly_payment" && row.monthly_payment_source === "native_terms" ? { flags: [...(original?.flags ?? []), "approximate"] } : {}) };
      }),
    }));
    const before = source.rows.filter((row) => row.r < first && row.kind !== "data");
    const after = source.rows.filter((row) => row.r >= first && row.kind !== "data").map((row, index) => ({ ...row, r: first + data.length + index }));
    return orderDebtScheduleColumns({ ...source, rows: [...before, ...data, ...after] });
  }
  const schedules = (source.kind === "real_estate_schedule" || source.kind === "operating_plan" ? body : body.schedules ?? {}) as Record<string, Array<Record<string, unknown>>>;
  const next: SheetRow[] = [];
  const handled = new Set<string>();
  let offset = 0;
  for (const row of source.rows) {
    if (row.kind !== "data" || !row.block) { next.push({ ...row, r: row.r + offset }); continue; }
    if (handled.has(row.block)) continue;
    handled.add(row.block);
    const old = source.rows.filter((candidate) => candidate.kind === "data" && candidate.block === row.block);
    const entries = schedules[row.block] ?? [];
    const count = Math.max(2, entries.length);
    for (let index = 0; index < count; index++) {
      const id = String(entries[index]?.id ?? entries[index]?.row_id ?? `r${index + 1}`);
      next.push({ ...row, r: row.r + offset + index, row_key: id, ordinal: index + 1, cells: row.cells?.map((cell) => {
        if (!cell.path || !cell.key) return cell;
        const path = [...cell.path]; path[source.kind === "real_estate_schedule" || source.kind === "operating_plan" ? 1 : 2] = id;
        return { ...cell, key: `${row.block}.${id}.${path.at(-1)}`, path };
      }) });
    }
    offset += count - old.length;
  }
  return { ...source, rows: next };
}
export function applyFinancialCells(body: FinancialBody, layout: SheetLayout, edits: Edit[]): FinancialBody {
  const next = structuredClone(body);
  const paths = new Map(layout.rows.flatMap((row) => (row.cells ?? []).filter((cell) => cell.key && cell.path && cell.editable !== false && cell.type !== "formula").map((cell) => [cell.key!, cell.path!] as const)));
  for (const edit of edits) {
    const path = paths.get(edit.key);
    if (!path || edit.sheet !== layout.kind) continue;
    let node: unknown = next;
    for (let at = 0; at < path.length - 1; at++) {
      const key = path[at];
      if (Array.isArray(node)) {
        let index = listIndex(node, key);
        if (index < 0) { index = node.length; node.push({ id: key }); }
        while (node.length <= index) node.push({});
        node = node[index];
      } else if (node && typeof node === "object") {
        const object = node as Record<string, unknown>;
        if (!object[key]) object[key] = ["debts", "properties", "mortgages", "expenses", "adjustments"].includes(key) || path[0] === "schedules" && at === 1 ? [] : {};
        node = object[key];
      }
    }
    if (node && typeof node === "object" && !Array.isArray(node)) (node as Record<string, unknown>)[path[path.length - 1]] = edit.value;
  }
  if (layout.kind === "debt_schedule") {
    const originalRows = (body.debts as FinancialDebtRow[] | undefined) ?? [];
    next.debts = ((next.debts as FinancialDebtRow[] | undefined) ?? []).map((row) => {
      const before = originalRows.find((candidate) => candidate.id === row.id);
      if (!before) return row;
      const changes = Object.fromEntries(edits.flatMap((edit) => { const path = paths.get(edit.key); return edit.sheet === layout.kind && path?.[0] === "debts" && path[1] === row.id ? [[path[2], edit.value]] : []; }));
      if ("debt_type" in changes && !isAdvanceType(changes.debt_type)) { changes.mca_modified = ""; changes.mca_modification_note = ""; }
      return Object.keys(changes).length ? updateDebtPaymentTerms(before, changes) : row;
    });
  }
  if (layout.kind === "operating_plan") {
    const previousExpenses = (body.expenses ?? []) as OperatingExpense[];
    const previousActions = (body.adjustments ?? []) as OperatingAction[];
    const currentExpenses = (next.expenses ?? []) as OperatingExpense[];
    next.adjustments = ((next.adjustments ?? []) as OperatingAction[]).map((row) => {
      const before = previousActions.find((item) => item.id === row.id);
      const expense = currentExpenses.find((item) => item.id === row.expense_row_id);
      const priorExpense = previousExpenses.find((item) => item.id === row.expense_row_id);
      const expenseChanged = expense && JSON.stringify(expense) !== JSON.stringify(priorExpense);
      const updated = expenseChanged ? { ...row, current_amount: expense.current_amount, cadence: expense.cadence } : row;
      return expenseChanged || JSON.stringify(before) !== JSON.stringify(row) ? clearOperatingReview(updated) : updated;
    });
  }
  return layout.kind === "operating_plan" ? normalizeOperatingPlanBody(next) : next;
}
/** A native correction must not retain an extracted-field badge for the replaced value. */
export function clearEditedDebtSources(previous: FinancialBody, next: FinancialBody): FinancialBody {
  const sources = { ...((next.field_sources ?? {}) as Record<string, unknown>) };
  const beforeRows = (previous.debts as FinancialDebtRow[] | undefined) ?? [];
  for (const row of (next.debts as FinancialDebtRow[] | undefined) ?? []) {
    const before = beforeRows.find((candidate) => candidate.id === row.id);
    if (!before) continue;
    for (const key of Object.keys(row)) if (typeof row[key] !== "object" && String(row[key] ?? "") !== String(before[key] ?? "")) delete sources[`${row.id}.${key}`];
  }
  return { ...next, ...(Object.keys(sources).length || next.field_sources ? { field_sources: sources } : {}) };
}
export function activeFinancialDebts(body: FinancialBody): FinancialDebtRow[] {
  return ((body.debts as FinancialDebtRow[] | undefined) ?? []).filter((row) => row.status !== "dismissed" && row.status !== "duplicate" && !row.duplicate_of_id);
}
/** Blank editor placeholders are retained for editing but are not obligations. */
export function meaningfulFinancialDebts(body: FinancialBody): FinancialDebtRow[] {
  return activeFinancialDebts(body).filter((row) => (row.status ?? "active") === "active" && [
    "lender", "balance", "monthly_payment", "original_amount", "rate", "factor_rate",
    "payment_amount", "payment_frequency", "debt_type", "notes", "collateral",
  ].some((key) => row[key] !== null && row[key] !== undefined && row[key] !== ""));
}
/** Show the same working schedule the editor opens, with publication kept separate. */
export function financialDebtReviewSummary(workspace: FinancialWorkspaceSnapshot) {
  const rows = meaningfulFinancialDebts(workspace.body);
  const completion = workspace.completion;
  const publishedComplete = workspace.accepted_completion?.complete === true;
  return {
    read: publishedComplete ? 0 : rows.length,
    onSchedule: rows.length,
    removed: ((workspace.body.debts as FinancialDebtRow[] | undefined) ?? []).filter((row) => row.status === "dismissed" || row.status === "duplicate" || row.duplicate_of_id).length,
    missingAnswers: completion?.complete ? 0 : completion?.missing_fields.length ?? 0,
    missingFields: completion?.missing_fields ?? [],
    reason: completion?.reason ?? null,
    draftComplete: completion?.complete === true,
    publishedComplete,
    publishedRows: workspace.accepted_completion?.active_rows ?? 0,
    publishNeeded: workspace.draft.dirty || !publishedComplete,
    hasDraft: rows.length > 0 || workspace.body.no_debt === true || workspace.draft.dirty,
    hasSource: workspace.evidence.some((file) => ["business_debt_schedule", "debt_schedule"].includes(file.classification ?? "")),
    loading: false,
  };
}
export function financialDebtTotals(body: FinancialBody): { total_balance: number | null; total_monthly_payment: number | null } {
  const rows = meaningfulFinancialDebts(body);
  if (!rows.length && body.no_debt !== true) return { total_balance: null, total_monthly_payment: null };
  const sum = (field: "balance" | "monthly_payment") => {
    const amounts = rows.map((row) => parseMoney(row[field]));
    return amounts.some((amount, index) => amount.blank || amount.warn || ["-", "."].includes(String(rows[index][field]))) ? null : amounts.reduce((total, amount) => total + amount.value, 0);
  };
  return { total_balance: sum("balance"), total_monthly_payment: sum("monthly_payment") };
}
/** Formula values follow the working rows; excluded rows retain their own read-only detail. */
export function financialDebtComputed(body: FinancialBody): Record<string, number | null> {
  return { ...financialDebtTotals(body), ...Object.fromEntries(((body.debts as FinancialDebtRow[] | undefined) ?? []).map((row) => [`${row.id}.paid_down_pct`, loanPaidDownPct(row.original_amount, row.balance)])) };
}
export function financialMappingConflict(existing: unknown, proposed: unknown): boolean {
  return existing != null && String(existing).trim() !== "" && String(existing).trim() !== String(proposed ?? "").trim();
}
export function financialMappingConfidence(value: FinancialImport["mappings"][number]["confidence"]): string {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value * 100)}% confidence` : value === "high" ? "Source verified" : "Needs review";
}
export function isFinancialDraftConflict(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("status" in error) || error.status !== 409) return false;
  const body = "body" in error ? error.body as { detail?: { code?: string } } | null : null;
  return ["financial_draft_conflict", "financial_version_conflict"].includes(body?.detail?.code ?? "");
}
