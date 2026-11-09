import type { InlineImage } from "./inlineImages";
import { ApiError } from "./api";

export const MESSAGE_IMAGE_ACCEPT = ".png,.jpg,.jpeg,.gif,.webp,.heic,.heif,image/png,image/jpeg,image/gif,image/webp,image/heic,image/heif";
export const MAX_MESSAGE_IMAGES = 10;
export const MAX_MESSAGE_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_MESSAGE_IMAGE_TOTAL_BYTES = 6 * 1024 * 1024;

export type MessageImageCapabilities = {
  image_upload: { max_images: number; max_image_bytes: number; max_total_bytes: number; allowed_mime_types: string[] };
  sms: { image_delivery: "mms" | "secure_link" | "unavailable"; label?: string; detail?: string; max_total_bytes?: number };
};

const TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/heic", "image/heif"]);
const EXTENSIONS: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", heic: "image/heic", heif: "image/heif" };

export function messageImageMime(file: Pick<File, "name" | "type">): string {
  const declared = file.type.split(";")[0].trim().toLowerCase();
  if (declared && declared !== "application/octet-stream") return declared === "image/jpg" ? "image/jpeg" : declared;
  return EXTENSIONS[file.name.split(".").at(-1)?.toLowerCase() || ""] || declared;
}

export function messageImageRejection(file: Pick<File, "name" | "type" | "size">): string | null {
  if (!TYPES.has(messageImageMime(file))) return `${file.name || "That file"} is not a supported image. Choose PNG, JPEG, GIF, WebP, HEIC, or HEIF.`;
  if (file.size <= 0) return `${file.name || "That image"} is empty.`;
  if (file.size > MAX_MESSAGE_IMAGE_BYTES) return `${file.name || "That image"} is over 10 MB.`;
  return null;
}

type ApiCall = <T>(path: string, opts?: RequestInit) => Promise<T>;
export async function uploadMessageImage(api: ApiCall, file: File): Promise<InlineImage> {
  const rejection = messageImageRejection(file);
  if (rejection) throw new Error(rejection);
  try {
  const ticket = await api<{ image_id: string; upload_url: string | null; mime_type: string; required_headers?: Record<string, string> }>("/inline-images/upload-init", {
    method: "POST",
    body: JSON.stringify({ subject_kind: "outbound_message", filename: file.name || "pasted-image.png", mime_type: messageImageMime(file), size_bytes: file.size }),
  });
  if (!ticket.upload_url) throw new Error("Image storage is unavailable. Your image is still attached; try again shortly.");
  const result = await fetch(ticket.upload_url, { method: "PUT", body: file, headers: ticket.required_headers || { "Content-Type": ticket.mime_type, "x-amz-server-side-encryption": "AES256" } });
  if (!result.ok) throw new Error(`${file.name || "That image"} could not be uploaded. Try sending again.`);
  return await api<InlineImage>(`/inline-images/${encodeURIComponent(ticket.image_id)}/complete`, { method: "POST" });
  } catch (reason) {
    const detail = reason instanceof ApiError ? (reason.body as { detail?: unknown } | null)?.detail : null;
    throw new Error(typeof detail === "string" && detail ? detail : reason instanceof Error ? reason.message : "That image could not be attached.");
  }
}

export function smsImageDeliveryNotice(capabilities: MessageImageCapabilities | undefined): string {
  if (!capabilities) return "Checking how this SMS provider sends images…";
  if (capabilities.sms.image_delivery === "secure_link") return capabilities.sms.label || "Images are sent as secure image links in the text message.";
  if (capabilities.sms.image_delivery === "unavailable") return capabilities.sms.label || "This SMS provider cannot send images. Send them by email instead.";
  return capabilities.sms.label || "Images are sent as picture messages (MMS).";
}

/** Provider acceptance remains a sent message even if local follow-up fails. */
export function outgoingDeliveryWarning(result: { delivery_warning?: string | null; delivery_notice?: string | null; detail?: string | null; results?: Array<{ ok: boolean; detail?: string | null }> } | void): string | null {
  if (!result) return null;
  if (result.delivery_warning || result.delivery_notice) return result.delivery_warning || result.delivery_notice || null;
  const details = [result.detail, ...(result.results || []).filter((entry) => entry.ok).map((entry) => entry.detail)];
  if (details.some((detail) => detail?.startsWith("sent_but_image_links_unavailable"))) return "The message was sent, but its image links could not be activated. Do not resend this message; contact support to restore image access.";
  if (details.some((detail) => detail?.startsWith("sent_not_recorded"))) return "The message was sent, but its history could not be saved. Do not resend this message. Refresh the conversation to check its history.";
  return null;
}
