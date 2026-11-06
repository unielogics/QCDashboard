import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicWorksheetWriteQueue } from "../publicWorksheetWriter";
import { downloadPublicWorksheetVersion, WorksheetSaveError, WorksheetViewOnly, writePublicCells, writePublicVersion } from "../worksheetApi";

afterEach(() => vi.unstubAllGlobals());

describe("public worksheet corrections and version saves", () => {
  it("waits for acknowledged draft revisions before the next write", async () => {
    const queue = new PublicWorksheetWriteQueue();
    let revision = 1;
    let acknowledge!: () => void;
    const gate = new Promise<void>((resolve) => { acknowledge = resolve; });
    const sent: number[] = [];
    const first = queue.run(async () => { sent.push(revision); await gate; revision = 2; });
    const second = queue.run(async () => { sent.push(revision); revision = 3; });
    await Promise.resolve();
    await Promise.resolve();
    expect(sent).toEqual([1]);
    acknowledge();
    await Promise.all([first, second, queue.flush()]);
    expect(sent).toEqual([1, 2]);
  });

  it("blocks later writes after a concurrent-edit conflict instead of overwriting", async () => {
    const queue = new PublicWorksheetWriteQueue();
    await expect(queue.run(async () => { throw new WorksheetSaveError(409, "Newer answers exist"); })).rejects.toThrow("Newer answers");
    const write = vi.fn(async () => undefined);
    await expect(queue.run(write)).rejects.toThrow("Newer answers");
    expect(write).not.toHaveBeenCalled();
  });

  it("keeps a rendering failure actionable rather than calling the link expired", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "PDF could not be generated; draft retained" }), { status: 502 })));
    await expect(writePublicVersion("shared-token", "pin-session", { sheet: "pfs", expected_revision: 7, base_version_id: "v1", idempotency_key: "retry-this-save" })).rejects.toMatchObject({ status: 502, message: "PDF could not be generated; draft retained" });
  });

  it("publishes the chosen sheet with its revision and PIN in the header", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ saved_version: { id: "v2", version_number: 2 } }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const request = { sheet: "debt_schedule" as const, expected_revision: 4, base_version_id: "original-v1", idempotency_key: "stable-retry-key", name: "Client" };
    await writePublicVersion("shared/token", "pin-session", request);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toContain("/api/v1/public/worksheets/shared%2Ftoken/versions");
    expect(url).not.toContain("pin-session");
    expect(init.headers).toEqual({ "Content-Type": "application/json", "X-Worksheet-Session": "pin-session" });
    expect(JSON.parse(init.body)).toEqual(request);
    expect(init.headers.Authorization).toBeUndefined();
  });

  it("sends imported-row corrections with the acknowledged worksheet revision", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ rev: { debt_schedule: 3 }, workspaces: { debt_schedule: { revision: 8 } }, resync: [], computed: {} }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const result = await writePublicCells("token", null, [{ sheet: "debt_schedule", key: "source-row.balance", value: "12345" }], { debt_schedule: 2 });
    expect(JSON.parse(fetcher.mock.calls[0][1].body).edits[0].key).toBe("source-row.balance");
    expect(result.workspaces?.debt_schedule.revision).toBe(8);
  });

  it("downloads a historical PDF through the scoped PIN-protected endpoint", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("%PDF-fictional", { headers: { "Content-Type": "application/pdf" } }));
    vi.stubGlobal("fetch", fetcher);
    const blob = await downloadPublicWorksheetVersion("token", "private-session", "real_estate_schedule", "version-id");
    expect(await blob.text()).toBe("%PDF-fictional");
    expect(fetcher.mock.calls[0][0]).toContain("/versions/real_estate_schedule/version-id/pdf");
    expect(fetcher.mock.calls[0][1].headers).toEqual({ "X-Worksheet-Session": "private-session" });
  });

  it("retains server-side view-only enforcement on saves", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "This link is read-only" }), { status: 403 })));
    await expect(writePublicCells("token", null, [{ sheet: "pfs", key: "cash", value: "5" }])).rejects.toBeInstanceOf(WorksheetViewOnly);
  });
});
