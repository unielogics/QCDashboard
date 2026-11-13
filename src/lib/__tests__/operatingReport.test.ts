import { describe, expect, it } from "vitest";
import type { FinancialVersion } from "../financialWorkspaceApi";
import { OPERATING_REPORT_SCHEMA, operatingReportNeedsUpgrade, selectedOperatingReport } from "../operatingReport";

const version = (id: string, number: number, report_schema?: string): FinancialVersion => ({ id, version_number: number, report_schema, created_at: "2026-11-13T12:00:00Z", actor_name: null, source: "staff", source_file_id: null, pdf_file_id: null, status: "saved" });
describe("immutable operating report selection", () => {
  it("allows normal format upgrade only for an existing operating version without a report schema", () => { expect(operatingReportNeedsUpgrade("operating_plan", version("old", 1))).toBe(true); expect(operatingReportNeedsUpgrade("operating_plan", null)).toBe(false); });
  it("does not make unchanged current or future report formats saveable again", () => { expect(operatingReportNeedsUpgrade("operating_plan", version("new", 2, OPERATING_REPORT_SCHEMA))).toBe(false); expect(operatingReportNeedsUpgrade("operating_plan", version("future", 3, "future-v2"))).toBe(false); });
  it("keeps other financial forms' save policy unchanged", () => { expect(operatingReportNeedsUpgrade("debt_schedule", version("old", 1))).toBe(false); });
  it("defaults to the authoritative current ID rather than list order", () => { const versions = [version("older", 1), version("current", 2)]; expect(selectedOperatingReport(versions, "current", null)?.id).toBe("current"); });
  it("keeps an explicitly chosen historical immutable ID", () => { const versions = [version("current", 2), version("older", 1)]; expect(selectedOperatingReport(versions, "current", "older")?.version_number).toBe(1); });
  it("never substitutes another saved version when the chosen ID is unavailable", () => { expect(selectedOperatingReport([version("current", 2)], "current", "missing")).toBeUndefined(); expect(selectedOperatingReport([version("older", 1)], null, null)).toBeUndefined(); });
});
