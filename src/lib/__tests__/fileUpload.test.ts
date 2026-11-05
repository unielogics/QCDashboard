import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadFile } from "../fileUpload";

const file = { name: "statement.pdf", type: "application/pdf", size: 120, arrayBuffer: vi.fn() } as unknown as File;
afterEach(() => vi.unstubAllGlobals());

describe("upload recovery", () => {
  it("retries the same storage object after a transient storage failure", async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 503 }).mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetch);
    const call = vi.fn().mockResolvedValueOnce({ file_id: "existing", upload_url: "https://storage.example/upload", required_headers: { "Content-Type": "application/pdf" } }).mockResolvedValueOnce({ id: "existing" });
    const stored = vi.fn();
    await uploadFile({ initPath: "/init", completePath: "/complete", call }, file, { clientPdfCheck: false, storageAttempts: 2, onStored: stored });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(call).toHaveBeenCalledTimes(2);
    expect(stored).toHaveBeenCalledWith("existing");
    expect(file.arrayBuffer).not.toHaveBeenCalled();
  });
  it("retries confirmation without creating another upload or sending the file again", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const call = vi.fn().mockResolvedValue({ id: "already-stored" });
    await uploadFile({ initPath: "/init", completePath: "/complete", call }, file, { storedFileId: "already-stored" });
    expect(fetch).not.toHaveBeenCalled();
    expect(call).toHaveBeenCalledTimes(1);
    expect(call.mock.calls[0][0]).toBe("/complete");
    expect(JSON.parse(call.mock.calls[0][1].body).file_id).toBe("already-stored");
  });
  it("does not repeatedly retry an authorization rejection from storage", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    vi.stubGlobal("fetch", fetch);
    const call = vi.fn().mockResolvedValue({ file_id: "id", upload_url: "https://storage.example/upload" });
    await expect(uploadFile({ initPath: "/init", completePath: "/complete", call }, file, { clientPdfCheck: false, storageAttempts: 3 })).rejects.toThrow("403");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledTimes(1);
  });
});
