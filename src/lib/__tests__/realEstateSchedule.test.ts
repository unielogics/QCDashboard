import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RealEstateScheduleForm } from "@/components/application/RealEstateScheduleForm";
import { applyFinancialCells, financialLayout, financialValues } from "@/lib/financialWorkspaceApi";
import { recompute } from "@/components/sheet/compute";
import type { SheetLayout } from "@/components/sheet/types";
import {
  REAL_ESTATE_EXPENSES, realEstateBodyFromValues, realEstateTotals, realEstateValues,
  type RealEstateBody, type RealEstateSchema,
} from "@/lib/realEstateSchedule";

const propertyId = "08b49e86-13df-44f2-a4b2-206854533bf9";
const mortgageId = "a7fd61ec-f914-4367-9e11-dae564d19168";
const property = () => ({ id: propertyId, address: "123 Example Street", estimated_value: "500000", ownership_pct: "50", monthly_gross_rent: "4000", mortgage_status: "active", ...Object.fromEntries(REAL_ESTATE_EXPENSES.map((key) => [key, "0"])) });
const mortgage = () => ({ id: mortgageId, property_row_id: propertyId, status: "active", lender: "Example Bank", balance: "200000", monthly_payment: "1500", payment_basis: "principal_interest" });
const body = (): RealEstateBody => ({ owner_name: "Example Investor", properties: [property()], mortgages: [mortgage()] });
const schema: RealEstateSchema = {
  kind: "real_estate_schedule", schema_version: "qc_res.v1",
  header: [{ key: "owner_name", label: "Owner name", type: "text" }, { key: "as_of", label: "As of", type: "date" }],
  properties: [{ key: "address", label: "Property address", type: "text" }, { key: "estimated_value", label: "Owner-estimated current value", type: "money" }, { key: "mortgage_status", label: "Mortgage status", type: "select", options: ["active", "free_clear", "unknown"] }],
  mortgages: [{ key: "property_row_id", label: "Property", type: "select" }, { key: "lender", label: "Lender", type: "text" }, { key: "balance", label: "Current balance", type: "money" }],
  totals: [{ key: "estimated_value_total", label: "Owner-estimated value" }, { key: "mortgage_balance_total", label: "Mortgage balances" }],
};

describe("real estate schedule figures", () => {
  it("keeps untouched templates unknown and only an explicit no-assets declaration establishes zeros", () => {
    expect(Object.values(realEstateTotals({ properties: [{ id: propertyId, mortgage_status: "unknown" }] })).every((value) => value === null)).toBe(true);
    expect(Object.values(realEstateTotals({ no_real_estate: true })).every((value) => value === 0)).toBe(true);
  });
  it("calculates full property amounts, retaining ownership percentage separately", () => {
    expect(realEstateTotals(body())).toEqual({ property_count: 1, active_mortgage_count: 1, estimated_value_total: 500000, mortgage_balance_total: 200000, monthly_rent_total: 4000, monthly_operating_expenses_total: 0, monthly_mortgage_payments_total: 1500, estimated_equity: 300000, monthly_cash_flow: 2500 });
  });
  it("sums separate mortgages and excludes paid-off loans", () => {
    const next = body(); next.mortgages!.push({ ...mortgage(), id: "second", balance: "50000", monthly_payment: "400" }, { ...mortgage(), id: "old", status: "paid_off", balance: "0", monthly_payment: "1000" });
    expect(realEstateTotals(next)).toMatchObject({ active_mortgage_count: 2, mortgage_balance_total: 250000, monthly_mortgage_payments_total: 1900, estimated_equity: 250000, monthly_cash_flow: 2100 });
  });
  it("does not count escrowed taxes and insurance twice", () => {
    const next = body(); next.properties![0].monthly_property_tax = "300"; next.properties![0].monthly_insurance = "200";
    Object.assign(next.mortgages![0], { monthly_payment: "2000", payment_basis: "including_escrow", monthly_escrow: "500" });
    expect(realEstateTotals(next)).toMatchObject({ monthly_operating_expenses_total: 500, monthly_mortgage_payments_total: 2000, monthly_cash_flow: 2000 });
  });
  it.each([{ payment_basis: "unknown" }, { payment_basis: "including_escrow", monthly_escrow: "" }, { payment_basis: "including_escrow", monthly_escrow: "1600" }])("keeps cash flow unknown when payment composition is unresolved: %j", (changes) => {
    const next = body(); Object.assign(next.mortgages![0], changes);
    expect(realEstateTotals(next).monthly_cash_flow).toBeNull();
    expect(realEstateTotals(next).mortgage_balance_total).toBe(200000);
  });
  it.each(["unknown", "active"])("does not invent zero mortgage debt when property status is %s without loan detail", (status) => {
    const next = body(); next.properties![0].mortgage_status = status; next.mortgages = [];
    expect(realEstateTotals(next)).toMatchObject({ active_mortgage_count: null, mortgage_balance_total: null, estimated_equity: null });
  });
  it("establishes zero debt only for explicit free-and-clear properties", () => {
    const next = body(); next.properties![0].mortgage_status = "free_clear"; next.mortgages = [];
    expect(realEstateTotals(next)).toMatchObject({ active_mortgage_count: 0, mortgage_balance_total: 0, monthly_mortgage_payments_total: 0, estimated_equity: 500000, monthly_cash_flow: 4000 });
  });
  it("keeps totals incomplete until a mortgage with an observed positive balance has its status confirmed", () => {
    const next = body(); next.mortgages![0].status = "unknown";
    expect(realEstateTotals(next).active_mortgage_count).toBeNull();
    expect(realEstateTotals(next).mortgage_balance_total).toBeNull();
  });
  it("keeps linked-property conflicts and missing financial inputs incomplete", () => {
    const next = body(); next.mortgages![0].property_row_id = "missing-property"; next.properties![0].monthly_insurance = "";
    expect(realEstateTotals(next)).toMatchObject({ mortgage_balance_total: null, monthly_operating_expenses_total: null, monthly_cash_flow: null });
  });
});

describe("real estate form and worksheet identities", () => {
  const layout: SheetLayout = { kind: "real_estate_schedule", title: "Real estate schedule", schema_version: "qc_res.v1", layout_version: "v1", name_prefix: "RES", freeze: [2, 1], columns: [{ c: 1 }, { c: 2 }], rows: [
    { r: 1, kind: "field", cells: [{ c: 1, type: "text", key: "owner_name", path: ["owner_name"] }] },
    { r: 2, kind: "data", block: "properties", row_key: "r1", cells: [{ c: 1, type: "text", key: "properties.r1.address", path: ["properties", "r1", "address"] }, { c: 2, type: "money", key: "properties.r1.estimated_value", path: ["properties", "r1", "estimated_value"] }] },
    { r: 3, kind: "data", block: "mortgages", row_key: "r1", cells: [{ c: 1, type: "text", key: "mortgages.r1.property_row_id", path: ["mortgages", "r1", "property_row_id"] }, { c: 2, type: "money", key: "mortgages.r1.balance", path: ["mortgages", "r1", "balance"] }] },
  ] };
  it("uses stable property and mortgage IDs for grid edits and their relationship", () => {
    const source = body(); const rebuilt = financialLayout(source as Record<string, unknown>, layout);
    const edited = applyFinancialCells(source as Record<string, unknown>, rebuilt, [{ sheet: "real_estate_schedule", key: `mortgages.${mortgageId}.balance`, value: "175000" }]) as RealEstateBody;
    expect(edited.mortgages![0]).toMatchObject({ id: mortgageId, property_row_id: propertyId, balance: "175000" });
    expect(edited.properties![0].id).toBe(propertyId);
    const phone = realEstateBodyFromValues(rebuilt.rows, financialValues(edited as Record<string, unknown>, rebuilt));
    expect(phone.mortgages![0]).toMatchObject({ id: mortgageId, property_row_id: propertyId, balance: "175000" });
  });
  it("recomputes the same totals from flat worksheet cells", () => {
    const source = body();
    const fullSchema = { ...schema, properties: Object.keys(source.properties![0]).filter((key) => key !== "id").map((key) => ({ key, label: key })), mortgages: Object.keys(source.mortgages![0]).filter((key) => key !== "id").map((key) => ({ key, label: key })) };
    expect(recompute("real_estate_schedule", fullSchema, realEstateValues(source, fullSchema))).toEqual(realEstateTotals(source));
  });
  it("renders clear portfolio sections and labels owner estimates", () => {
    const html = renderToStaticMarkup(createElement(RealEstateScheduleForm, { schema, value: body(), onChange: () => undefined }));
    expect(html).toContain("Owner-estimated current value");
    expect(html).toContain('aria-label="Real estate schedule sections"');
    expect(html).toContain("Mortgages"); expect(html).toContain("Portfolio totals");
    expect(html).toContain("Current values are your estimates");
    expect(html).not.toContain("Social Security");
  });
});
