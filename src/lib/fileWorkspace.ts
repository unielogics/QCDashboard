import type { SheetKind } from "@/components/sheet/types";

export const FILE_WORKSPACE_TOOLS = ["forms", "operating-plan", "coverage", "terms", "use-of-funds", "marketplace"] as const;
export type FileWorkspaceTool = typeof FILE_WORKSPACE_TOOLS[number];
const KINDS: SheetKind[] = ["debt_schedule", "pfs", "real_estate_schedule", "p_and_l", "balance_sheet", "operating_plan"];
const VIEWS = ["form", "worksheet", "pdf", "history"] as const;
export type FileWorkspaceRequest = { tool: FileWorkspaceTool; kind?: SheetKind; view?: typeof VIEWS[number]; debtId?: string };
export const FILE_WORKSPACE_LABELS: Record<FileWorkspaceTool, string> = { forms: "Financial forms", "operating-plan": "Operating expenses and earnings plan", coverage: "Coverage plan", terms: "Loan terms", "use-of-funds": "Program criteria and use of funds", marketplace: "Marketplace setup" };
export function parseFileWorkspaceRequest(params: Pick<URLSearchParams, "get">): FileWorkspaceRequest | null {
  const tool = params.get("tool");
  if (!(FILE_WORKSPACE_TOOLS as readonly string[]).includes(tool ?? "")) return null;
  const kind = params.get("kind"), view = params.get("view"), debtId = params.get("debtId");
  return { tool: tool as FileWorkspaceTool, ...(KINDS.includes(kind as SheetKind) ? { kind: kind as SheetKind } : {}), ...((VIEWS as readonly string[]).includes(view ?? "") ? { view: view as typeof VIEWS[number] } : {}), ...(debtId && /^[a-zA-Z0-9_-]{1,128}$/.test(debtId) ? { debtId } : {}) };
}
export function fileWorkspaceHref(intakeId: string, request: FileWorkspaceRequest): string {
  const query = new URLSearchParams({ tool: request.tool });
  if (request.kind && KINDS.includes(request.kind)) query.set("kind", request.kind);
  if (request.view && (VIEWS as readonly string[]).includes(request.view)) query.set("view", request.view);
  if (request.debtId && /^[a-zA-Z0-9_-]{1,128}$/.test(request.debtId)) query.set("debtId", request.debtId);
  return `/files/${encodeURIComponent(intakeId)}/workspace?${query}`;
}
export type FileWorkspaceSaved = { version: 1; type: "saved"; eventId: string; intakeId: string; profileId: string; authScope: string; tool: FileWorkspaceTool };
export function isFileWorkspaceSaved(value: unknown): value is FileWorkspaceSaved {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return row.version === 1 && row.type === "saved" && ["eventId", "intakeId", "profileId", "authScope"].every(key => typeof row[key] === "string" && row[key].length > 0 && row[key].length <= 256) && (FILE_WORKSPACE_TOOLS as readonly unknown[]).includes(row.tool) && Object.keys(row).every(key => ["version", "type", "eventId", "intakeId", "profileId", "authScope", "tool"].includes(key));
}
