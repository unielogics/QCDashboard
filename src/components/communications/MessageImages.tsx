"use client";

import { useCallback, useEffect, useRef, useState, type ClipboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@/components/design-system/Icon";
import { useAuthedApi } from "@/hooks/useApi";
import type { InlineImage } from "@/lib/inlineImages";
import { MESSAGE_IMAGE_ACCEPT, MAX_MESSAGE_IMAGES, MAX_MESSAGE_IMAGE_TOTAL_BYTES, messageImageMime, messageImageRejection, uploadMessageImage, type MessageImageCapabilities } from "@/lib/messageImages";

type DraftImage = { id: string; file: File; preview: string; uploaded?: InlineImage; status: "ready" | "uploading" | "uploaded" | "error"; error?: string };

/** Local until Send; uploaded IDs survive a delivery retry. Every scope owns its draft. */
export function useMessageImages(scope: string) {
  const api = useAuthedApi();
  const [images, setImages] = useState<DraftImage[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const current = useRef<DraftImage[]>([]);
  const generation = useRef(0);
  const running = useRef<Promise<string[]> | null>(null);
  const update = useCallback((next: DraftImage[]) => { current.current = next; setImages(next); }, []);
  const reset = useCallback(() => {
    generation.current += 1;
    for (const image of current.current) URL.revokeObjectURL(image.preview);
    update([]); setError(""); setPending(false); running.current = null;
  }, [update]);
  useEffect(() => { reset(); }, [scope, reset]);
  useEffect(() => () => {
    generation.current += 1;
    for (const image of current.current) URL.revokeObjectURL(image.preview);
  }, []);
  const add = useCallback((files: File[]) => {
    if (running.current) return;
    const next = [...current.current];
    const rejected: string[] = [];
    for (const file of files) {
      const rejection = messageImageRejection(file);
      if (rejection) { rejected.push(rejection); continue; }
      if (next.length >= MAX_MESSAGE_IMAGES) { rejected.push("Attach up to 10 images to one message."); break; }
      const knownSize = next.reduce((sum, image) => sum + (/^image\/(heic|heif)$/.test(messageImageMime(image.file)) ? 0 : image.file.size), 0);
      if (!/^image\/(heic|heif)$/.test(messageImageMime(file)) && knownSize + file.size > MAX_MESSAGE_IMAGE_TOTAL_BYTES) { rejected.push("The attached images must total 6 MB or less after conversion."); continue; }
      next.push({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file), status: "ready" });
    }
    update(next); setError(rejected.join(" "));
  }, [update]);
  const remove = useCallback((id: string) => {
    if (running.current) return;
    const selected = current.current.find((image) => image.id === id);
    if (selected) URL.revokeObjectURL(selected.preview);
    update(current.current.filter((image) => image.id !== id)); setError("");
  }, [update]);
  const flush = useCallback((maxTotalBytes = MAX_MESSAGE_IMAGE_TOTAL_BYTES): Promise<string[]> => {
    if (running.current) return running.current;
    const revision = generation.current;
    const selected = [...current.current];
    const task = Promise.resolve().then(async () => {
      setPending(true); setError("");
      const ids: string[] = [];
      try {
        for (const image of selected) {
          if (revision !== generation.current) throw new Error("The conversation changed. Review your images before sending.");
          let uploaded = image.uploaded;
          if (!uploaded) {
            update(current.current.map((item) => item.id === image.id ? { ...item, status: "uploading", error: undefined } : item));
            uploaded = await uploadMessageImage(api, image.file);
            if (revision !== generation.current) throw new Error("The conversation changed. Review your images before sending.");
            update(current.current.map((item) => item.id === image.id ? { ...item, uploaded, status: "uploaded" } : item));
          }
          ids.push(uploaded.id);
        }
        const limit = Math.min(maxTotalBytes, MAX_MESSAGE_IMAGE_TOTAL_BYTES);
        if (current.current.reduce((sum, image) => sum + (image.uploaded?.size_bytes || 0), 0) > limit) throw new Error(`The attached images total more than ${Math.round(limit / 1024 / 1024)} MB after conversion. Remove an image or choose a smaller copy.`);
        return ids;
      } catch (reason) {
        if (revision === generation.current) {
          const detail = reason instanceof Error ? reason.message : "An image could not be uploaded.";
          update(current.current.map((item) => item.status === "uploading" ? { ...item, status: "error", error: detail } : item)); setError(detail);
        }
        throw reason;
      } finally {
        if (revision === generation.current) { setPending(false); running.current = null; }
      }
    });
    running.current = task;
    return task;
  }, [api, update]);
  const onPaste = useCallback((event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files);
    if (!files.length) return;
    event.preventDefault(); add(files);
  }, [add]);
  return { images, error, pending, add, remove, reset, flush, onPaste };
}

export function useMessageImageCapabilities(enabled = true) {
  const api = useAuthedApi();
  return useQuery({ queryKey: ["communication-image-capabilities"], queryFn: () => api<MessageImageCapabilities>("/communications/capabilities"), enabled, staleTime: 60_000 });
}

export function MessageImageDrafts({ draft, disabled = false }: { draft: ReturnType<typeof useMessageImages>; disabled?: boolean }) {
  return <>
    {draft.images.length ? <div className="message-image-drafts" aria-label="Images attached to this message">
      {draft.images.map((image) => <div key={image.id} className="message-image-draft">
        {/^image\/(heic|heif)$/.test(messageImageMime(image.file)) && !image.uploaded?.url ? <span className="message-image-placeholder"><Icon name="file" size={24} /><small>HEIC · converts on send</small></span> : <>{/* eslint-disable-next-line @next/next/no-img-element */}<a href={image.uploaded?.url || image.preview} target="_blank" rel="noreferrer" aria-label={`Preview ${image.file.name || "pasted image"} full size`}><img src={image.uploaded?.url || image.preview} alt={image.file.name || "Pasted image"} /></a></>}
        <span title={image.file.name}>{image.file.name || "Pasted image"}</span>
        <button type="button" disabled={disabled || draft.pending} onClick={() => draft.remove(image.id)} aria-label={`Remove ${image.file.name || "pasted image"}`}><Icon name="x" size={13} /></button>
        {image.status === "uploading" ? <small role="status">Uploading…</small> : image.status === "error" ? <small role="alert">Upload failed · send again to retry</small> : null}
      </div>)}
    </div> : null}
    {draft.error ? <div className="chat-composer-error" role="alert">{draft.error}</div> : null}
  </>;
}

export function MessageImagePicker({ draft, disabled = false }: { draft: ReturnType<typeof useMessageImages>; disabled?: boolean }) {
  const input = useRef<HTMLInputElement | null>(null);
  return <div className="message-image-picker"><button type="button" className="btn" disabled={disabled || draft.pending} onClick={() => input.current?.click()}><Icon name="paperclip" size={14} />Attach images</button><span className="sub">Or paste an image into your message.</span><input ref={input} type="file" hidden multiple accept={MESSAGE_IMAGE_ACCEPT} onChange={(event) => { draft.add(Array.from(event.target.files || [])); event.target.value = ""; }} /><MessageImageDrafts draft={draft} disabled={disabled} /></div>;
}
