import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DebtScheduleForm } from "@/components/application/DebtScheduleForm";
import { debtRowProblems } from "../debtTypes";
import { apiBase } from "../api";
import { PublicFinancialFormError, PublicFinancialFormWriter, publicFinancialBody, publicFinancialPdfUrl, type PublicFinancialWorkspace } from "../publicFinancialForms";

const workspace = (revision = 1): PublicFinancialWorkspace => ({ family_id: "family", revision, base_version_id: "original-v1", dirty: revision > 1,
  current_version: { id: "original-v1", version_number: 1, created_at: "2026-11-06T12:00:00Z" }, versions: [] });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("client financial corrections and immutable version saves", () => {
  it("lets scoped imported rows be corrected while keeping their provenance", () => {
    const html = renderToStaticMarkup(createElement(DebtScheduleForm, { value: { debts: [{ id: "source", owner: "ai_draft", editable: true, lender: "Imported lender", balance: "12000", monthly_payment: "500" }] }, onChange: () => undefined, scheduleCompletion: true }));
    expect(html).toContain("Imported from a document");
    expect(html).toContain("original source is preserved");
    expect(html).not.toContain("can only be changed from there");
    expect(html).not.toContain('disabled=""');
    const readonly = renderToStaticMarkup(createElement(DebtScheduleForm, { value: { debts: [{ owner: "ai_draft", editable: false, lender: "Read only" }] }, onChange: () => undefined }));
    expect(readonly).toContain("Read-only in this form");
    expect(readonly).toContain('disabled=""');
  });

  it("uses the same completion rule as the managed debt workspace without inventing source detail", () => {
    const rows = [{ lender: "Imported lender", balance: "12000", monthly_payment: "500", editable: true }];
    expect(debtRowProblems(rows, true)).toEqual([]);
    expect(debtRowProblems(rows)).toHaveLength(1);
    expect(debtRowProblems([{ ...rows[0], balance: "" }], true)[0].missing).toEqual(["balance"]);
  });

  it("keeps stable row IDs for debt, PFS and real estate working tables", () => {
    const body = publicFinancialBody({ debts: [{ lender: "New" }, { id: "kept", lender: "Source" }], schedules: { notes_payable: [{ lender: "Bank" }] }, properties: [{ address: "Example" }], mortgages: [{ lender: "Mortgage" }] });
    const again = publicFinancialBody(body);
    expect(body.debts[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.debts[1].id).toBe("kept");
    expect((body.schedules.notes_payable[0] as { id?: string }).id).toBeTruthy();
    expect((body.properties[0] as { id?: string }).id).toBeTruthy();
    expect((body.mortgages[0] as { id?: string }).id).toBeTruthy();
    expect(again).toEqual(body);
  });

  it("serializes pending drafts before submission and sends the acknowledged revision", async () => {
    let acknowledge!: () => void;
    const gate = new Promise<void>((resolve) => { acknowledge = resolve; });
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      if (url.endsWith("/draft")) { await gate; return json({ workspace: workspace(2) }); }
      return json({ workspace: { ...workspace(3), dirty: false, base_version_id: "v2", current_version: { id: "v2", version_number: 2, created_at: "2026-11-06T13:00:00Z" } }, saved_version: { id: "v2", version_number: 2 } });
    }));
    const writer = new PublicFinancialFormWriter("https://api.example/form/token", workspace());
    const draft = writer.write("draft", { debts: [{ id: "source", balance: "10000" }] });
    const sent = writer.write("submit", { debts: [{ id: "source", balance: "9000" }] });
    await Promise.resolve(); await Promise.resolve();
    expect(calls).toHaveLength(1);
    acknowledge();
    await draft; const result = await sent;
    expect(calls[1].body.expected_revision).toBe(2);
    expect(calls[1].body.base_version_id).toBe("original-v1");
    expect(calls[1].body.body).toEqual({ debts: [{ id: "source", balance: "9000" }] });
    expect(result.saved_version?.version_number).toBe(2);
    expect(writer.workspace?.current_version?.id).toBe("v2");
  });

  it("never treats a failed draft save as acknowledged", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "Draft storage unavailable" }, 503)));
    const writer = new PublicFinancialFormWriter("/form", workspace());
    await expect(writer.write("draft", { notes: "kept" })).rejects.toMatchObject({ status: 503 });
    expect(writer.workspace?.revision).toBe(1);
  });

  it("coalesces a double-click into one explicit version save", async () => {
    let complete!: () => void;
    const gate = new Promise<void>((resolve) => { complete = resolve; });
    const fetcher = vi.fn(async () => { await gate; return json({ workspace: workspace(2), saved_version: { id: "v2", version_number: 2 } }); });
    vi.stubGlobal("fetch", fetcher);
    const writer = new PublicFinancialFormWriter("/form", workspace());
    const first = writer.write("submit", { notes: "Accepted answers" });
    const repeated = writer.write("submit", { notes: "Accepted answers" });
    expect(first).toBe(repeated);
    complete();
    await Promise.all([first, repeated]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("reuses a submission key after an ambiguous network or PDF failure", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce(json({ detail: "PDF unavailable; draft kept" }, 502))
      .mockResolvedValueOnce(json({ workspace: workspace(2), saved_version: { id: "v2", version_number: 2 } }));
    vi.stubGlobal("fetch", fetcher);
    const writer = new PublicFinancialFormWriter("/form", workspace());
    const body = { notes: "Same accepted answers" };
    await expect(writer.write("submit", body)).rejects.toThrow();
    await expect(writer.write("submit", body)).rejects.toMatchObject({ status: 502 });
    await writer.write("submit", body);
    const keys = fetcher.mock.calls.map((call) => JSON.parse(call[1].body).idempotency_key);
    expect(new Set(keys).size).toBe(1);
  });

  it("halts stale queued writes and keeps the submitted answers in the caller", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ detail: { code: "financial_draft_conflict", message: "Reload the current form" } }, 409));
    vi.stubGlobal("fetch", fetcher);
    const writer = new PublicFinancialFormWriter("/form", workspace());
    await expect(writer.write("draft", { balance: "10" })).rejects.toBeInstanceOf(PublicFinancialFormError);
    await expect(writer.write("submit", { balance: "20" })).rejects.toMatchObject({ status: 409 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("uses a draft retained by a failed PDF render when retrying the same version save", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({ detail: { code: "financial_pdf_unavailable", message: "PDF unavailable; draft retained", workspace: workspace(2) } }, 502))
      .mockResolvedValueOnce(json({ workspace: workspace(3), saved_version: { id: "v2", version_number: 2 } }));
    vi.stubGlobal("fetch", fetcher);
    const writer = new PublicFinancialFormWriter("/form", workspace());
    const body = { notes: "Corrected imported answers" };
    await expect(writer.write("submit", body)).rejects.toMatchObject({ status: 502 });
    await writer.write("submit", body);
    const payloads = fetcher.mock.calls.map((call) => JSON.parse(call[1].body));
    expect(payloads.map((value) => value.expected_revision)).toEqual([1, 2]);
    expect(payloads[0].idempotency_key).toBe(payloads[1].idempotency_key);
    expect(payloads[1].body).toEqual(body);
  });

  it("preserves server-side view-only enforcement without adding an authorization header", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ detail: "This form is read-only" }, 403));
    vi.stubGlobal("fetch", fetcher);
    await expect(new PublicFinancialFormWriter("/form", workspace()).write("draft", {})).rejects.toMatchObject({ status: 403 });
    expect(fetcher.mock.calls[0][1].headers).toEqual({ "Content-Type": "application/json" });
  });

  it("only opens server-issued PDF URLs on the configured API origin", () => {
    expect(publicFinancialPdfUrl("javascript:alert(1)")).toBeNull();
    expect(publicFinancialPdfUrl("https://unrelated.example/private.pdf")).toBeNull();
    expect(publicFinancialPdfUrl("/api/v1/form/token/versions/v1/pdf")).toBe(new URL("/api/v1/form/token/versions/v1/pdf", apiBase).toString());
  });
});
