"use client";

// The two halves of a pasted image, kept together because they must agree: the
// chips under a composer while a note is being written, and the thumbnails on
// the note once it is saved.
//
// A thumbnail is a link rather than a lightbox. The signed URL opens full size
// in a new tab, which is what someone reading a bank statement screenshot
// actually wants, and it costs no modal state.
//
// Mirrors QCRep's components/InlineImageStrip.tsx.

import { useCallback, useState } from "react";
import { Icon } from "@/components/design-system/Icon";
import { useAuthedApi } from "@/hooks/useApi";
import {
  uploadInlineImage,
  type InlineImage,
  type InlineImageSubject,
} from "@/lib/inlineImages";

/** Attached images on a saved note. */
export function InlineImageStrip({ images }: { images?: InlineImage[] }) {
  if (!images?.length) return null;
  return (
    <div className="inline-images">
      {images.map((image) => (
        <a
          key={image.id}
          className="inline-image"
          href={image.url ?? undefined}
          target="_blank"
          rel="noreferrer"
          title={`Open ${image.filename}`}
        >
          {/* Signed S3 URLs, not a configured remote pattern — next/image would
              need the host allow-listed and would proxy every view. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.url ?? ""} alt={image.filename} loading="lazy" />
        </a>
      ))}
    </div>
  );
}

/** Staged images under a composer, each removable before the note is saved. */
export function InlineImageChips({
  images,
  onRemove,
  busy = 0,
}: {
  images: InlineImage[];
  onRemove: (id: string) => void;
  busy?: number;
}) {
  if (!images.length && !busy) return null;
  return (
    <div className="inline-image-chips">
      {images.map((image) => (
        <span key={image.id} className="inline-image-chip">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.url ?? ""} alt="" />
          <span className="inline-image-chip-name">{image.filename}</span>
          <button
            type="button"
            aria-label={`Remove ${image.filename}`}
            onClick={() => onRemove(image.id)}
          >
            <Icon name="x" size={12} />
          </button>
        </span>
      ))}
      {busy > 0 ? (
        <span className="inline-image-chip is-busy">
          Uploading {busy} image{busy === 1 ? "" : "s"}…
        </span>
      ) : null}
    </div>
  );
}

/**
 * Staged uploads for one composer.
 *
 * Uploads start the moment a file arrives and run in parallel; the ids go to
 * the save as `image_ids`. Call `reset` after a successful save — the images
 * belong to the note then, not to the composer.
 */
export function useInlineImages(subjectKind: InlineImageSubject) {
  const apiCall = useAuthedApi();
  const [images, setImages] = useState<InlineImage[]>([]);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState("");

  const add = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      setError("");
      setBusy((count) => count + files.length);
      await Promise.all(
        files.map(async (file) => {
          try {
            const image = await uploadInlineImage(apiCall, file, subjectKind);
            setImages((current) => [...current, image]);
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : "That image could not be attached.");
          } finally {
            setBusy((count) => Math.max(0, count - 1));
          }
        }),
      );
    },
    [apiCall, subjectKind],
  );

  const remove = useCallback((id: string) => {
    // Dropped from the composer only. The staged row was never bound to
    // anything, so it stays an orphan in S3 rather than needing a delete call.
    setImages((current) => current.filter((image) => image.id !== id));
  }, []);

  const reset = useCallback(() => {
    setImages([]);
    setError("");
  }, []);

  /** Drop-in for a textarea's onPaste. */
  const onPaste = useCallback(
    (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (!files.length) return;
      event.preventDefault();
      void add(files);
    },
    [add],
  );

  return {
    images,
    ids: images.map((image) => image.id),
    busy,
    error,
    add,
    remove,
    reset,
    onPaste,
  };
}
