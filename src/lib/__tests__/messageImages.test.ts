import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { MAX_MESSAGE_IMAGE_BYTES, messageImageMime, messageImageRejection, outgoingDeliveryWarning, smsImageDeliveryNotice, uploadMessageImage, type MessageImageCapabilities } from "../messageImages";

afterEach(() => vi.unstubAllGlobals());

const image = { name: "Screenshot.png", type: "image/png", size: 123 } as File;
const converted = { id: "uploaded-image", filename: "Loan.jpg", mime_type: "image/jpeg", size_bytes: 100, url: "https://images.example/private-preview" };
function apiMock() {
  return vi.fn().mockResolvedValueOnce({ image_id: "uploaded-image", upload_url: "https://upload.example/private-image", mime_type: "image/png" }).mockResolvedValueOnce(converted);
}

describe("outgoing message image validation", () => {
  it("recognizes screenshot MIME and Apple photo extensions when browsers omit their type", () => {
    expect(messageImageMime(image)).toBe("image/png");
    expect(messageImageMime({ name: "Photo.HEIC", type: "" })).toBe("image/heic");
    expect(messageImageMime({ name: "Photo.heif", type: "application/octet-stream" })).toBe("image/heif");
    expect(messageImageRejection({ name: "Photo.heic", type: "", size: 100 })).toBeNull();
  });
  it("refuses active or unrelated documents even if their names end in an image extension", () => {
    expect(messageImageRejection({ name: "unsafe.png", type: "image/svg+xml", size: 100 })).toMatch(/supported image/);
    expect(messageImageRejection({ name: "contract.pdf", type: "application/pdf", size: 100 })).toMatch(/supported image/);
  });
  it("rejects empty and oversized input before asking for an upload", async () => {
    const api = vi.fn();
    expect(messageImageRejection({ ...image, size: 0 })).toMatch(/empty/);
    await expect(uploadMessageImage(api, { ...image, size: MAX_MESSAGE_IMAGE_BYTES + 1 })).rejects.toThrow(/10 MB/);
    expect(api).not.toHaveBeenCalled();
  });
});

describe("private outgoing image upload", () => {
  it("uses the message attachment subject and completes the exact uploaded object", async () => {
    const api = apiMock();
    const fetch = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal("fetch", fetch);
    expect(await uploadMessageImage(api, image)).toEqual(converted);
    expect(JSON.parse(api.mock.calls[0][1].body)).toMatchObject({ subject_kind: "outbound_message", filename: "Screenshot.png", mime_type: "image/png", size_bytes: 123 });
    expect(fetch).toHaveBeenCalledWith("https://upload.example/private-image", { method: "PUT", body: image, headers: { "Content-Type": "image/png", "x-amz-server-side-encryption": "AES256" } });
    expect(api.mock.calls[1]).toEqual(["/inline-images/uploaded-image/complete", { method: "POST" }]);
  });
  it("preserves required signed headers and returns the server-converted HEIC preview", async () => {
    const api = vi.fn().mockResolvedValueOnce({ image_id: "heic", upload_url: "https://upload.example/heic", mime_type: "image/heic", required_headers: { "Content-Type": "image/heic", "x-verified": "yes" } }).mockResolvedValueOnce(converted);
    const fetch = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal("fetch", fetch);
    const heic = { name: "Loan.HEIC", type: "", size: 321 } as File;
    expect((await uploadMessageImage(api, heic)).mime_type).toBe("image/jpeg");
    expect(JSON.parse(api.mock.calls[0][1].body).mime_type).toBe("image/heic");
    expect(fetch).toHaveBeenCalledWith("https://upload.example/heic", expect.objectContaining({ headers: { "Content-Type": "image/heic", "x-verified": "yes" } }));
  });
  it("does not complete an upload that failed", async () => {
    const api = apiMock(); vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await expect(uploadMessageImage(api, image)).rejects.toThrow(/could not be uploaded/);
    expect(api).toHaveBeenCalledTimes(1);
  });
  it("reports unavailable image storage without claiming a successful attachment", async () => {
    const api = vi.fn().mockResolvedValue({ image_id: "not-uploaded", upload_url: null, mime_type: "image/png" });
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(uploadMessageImage(api, image)).rejects.toThrow(/storage is unavailable/);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("shows the actionable validation detail returned by the image verifier", async () => {
    const api = vi.fn().mockRejectedValue(new ApiError(422, "HTTP 422", { detail: "This HEIC image could not be decoded. Export it as JPEG and try again." }));
    await expect(uploadMessageImage(api, image)).rejects.toThrow(/could not be decoded/);
  });
});

describe("SMS image delivery wording", () => {
  const caps = (mode: "mms" | "secure_link" | "unavailable") => ({ sms: { image_delivery: mode } } as MessageImageCapabilities);
  it("distinguishes a private link from a native picture message", () => {
    expect(smsImageDeliveryNotice(caps("secure_link"))).toMatch(/secure image links/);
    expect(smsImageDeliveryNotice(caps("mms"))).toMatch(/MMS/);
    expect(smsImageDeliveryNotice(caps("unavailable"))).toMatch(/cannot send images/);
    expect(smsImageDeliveryNotice(undefined)).toMatch(/Checking/);
  });
});

describe("accepted message delivery warnings", () => {
  it("preserves explicit backend delivery notices", () => {
    expect(outgoingDeliveryWarning({ delivery_warning: "Sent; history is unavailable." })).toBe("Sent; history is unavailable.");
  });
  it("does not turn a provider-accepted message into a normal retry", () => {
    expect(outgoingDeliveryWarning({ results: [{ ok: true, detail: "sent_not_recorded: unavailable" }] })).toMatch(/Do not resend/);
    expect(outgoingDeliveryWarning({ detail: "sent_but_image_links_unavailable" })).toMatch(/image links could not be activated/);
    expect(outgoingDeliveryWarning({ results: [{ ok: false, detail: "not_sent" }] })).toBeNull();
  });
});
