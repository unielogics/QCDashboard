import type { FinancialVersion } from "./financialWorkspaceApi";

export const OPERATING_REPORT_SCHEMA = "operating-plan-review-v1";

/** An unchanged legacy saved version can be upgraded through the normal Save version flow. */
export function operatingReportNeedsUpgrade(kind: string, current?: Pick<FinancialVersion, "report_schema"> | null): boolean {
  return kind === "operating_plan" && Boolean(current) && !current?.report_schema;
}

export function selectedOperatingReport(versions: FinancialVersion[], currentId: string | null, selectedId: string | null): FinancialVersion | undefined {
  return versions.find(version => version.id === (selectedId ?? currentId));
}
