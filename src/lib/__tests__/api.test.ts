import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../api";

const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("api() heals a read from a failure the next attempt may not share", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends a GET again after a server-side failure and returns the later answer", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(answer(503, { detail: "The database was busy with a concurrent change. Please retry." }))
      .mockResolvedValueOnce(answer(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(api("/files/1", { retryDelaysMs: [0, 0] })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sends a GET again when the connection drops", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(answer(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(api("/files/1", { retryDelaysMs: [0, 0] })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after the last retry with the server's own message", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(answer(500, { detail: "deadlock detected" })));
    vi.stubGlobal("fetch", fetchMock);
    const failure = await api("/files/1", { retryDelaysMs: [0, 0] }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(500);
    expect((failure as ApiError).message).toBe("deadlock detected");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry an answer, only an outage", async () => {
    const fetchMock = vi.fn().mockResolvedValue(answer(404, { detail: "No such file" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(api("/files/1", { retryDelaysMs: [0, 0] })).rejects.toMatchObject({ status: 404, message: "No such file" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never re-sends a write", async () => {
    const fetchMock = vi.fn().mockResolvedValue(answer(503, { detail: "busy" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(api("/files", { method: "POST", body: "{}", retryDelaysMs: [0, 0] })).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
