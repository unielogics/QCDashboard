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
  describeRejection,
  uploadInlineImage,
  type InlineImage,
  type InlineImageSubject,
} from "@/lib/inlineImages";

/** An image chosen but not yet saved. Held in the browser until then. */
export type PendingImage = {
  id: string;
  filename: string;
  file: File;
  url: string;
};

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
  images: PendingImage[];
  onRemove: (id: string) => void;
  /** How many images are still uploading, during a save. */
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
          Saving {busy} image{busy === 1 ? "" : "s"}…
        </span>
      ) : null}
    </div>
  );
}

/**
 * Images attached to one composer, uploaded when the note is saved.
 *
 * Pasting keeps the file in the browser and previews it from an object URL — no
 * network, no row, nothing in object storage. The bytes leave only when the
 * person saves, which is the point at which they have decided the image belongs
 * to the note.
 *
 * The earlier version uploaded on paste so saving stayed instant. That traded a
 * real cost for a small one: every abandoned paste left a finished file in
 * object storage attached to nothing, growing with use and never shrinking.
 *
 * `flush` returns the ids to hand to the save. Call it first; if it throws, the
 * note has not been saved and nothing is lost.
 *
 * Mirrors QCRep's useInlineImages — the two apps share no package, so keep them
 * in step by hand.
 */
export function useInlineImages(subjectKind: InlineImageSubject) {
  const apiCall = useAuthedApi();
  const [images, setImages] = useState<PendingImage[]>([]);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState("");

  const add = useCallback((files: File[]) => {
    const usable: PendingImage[] = [];
    for (const file of files) {
      const rejection = describeRejection(file);
      if (rejection) {
        // Said now, not at save: a file that can never be attached should not
        // be discovered at the moment someone presses the button.
        setError(rejection);
        continue;
      }
      usable.push({
        id: `local-${Math.random().toString(36).slice(2)}`,
        filename: file.name || "pasted image",
        file,
        url: URL.createObjectURL(file),
      });
    }
    if (usable.length) setError("");
    setImages((current) => [...current, ...usable]);
  }, []);

  const remove = useCallback((id: string) => {
    setImages((current) => {
      const going = current.find((image) => image.id === id);
      // Purely local — nothing was uploaded. The object URL still has to be
      // released or the bytes stay held for the life of the tab.
      if (going?.url) URL.revokeObjectURL(going.url);
      return current.filter((image) => image.id !== id);
    });
  }, []);

  const reset = useCallback(() => {
    setImages((current) => {
      for (const image of current) if (image.url) URL.revokeObjectURL(image.url);
      return [];
    });
    setError("");
  }, []);

  const flush = useCallback(async (): Promise<string[]> => {
    if (!images.length) return [];
    setError("");
    setPending(images.length);
    try {
      const ids: string[] = [];
      for (const image of images) {
        const uploaded = await uploadInlineImage(apiCall, image.file, subjectKind);
        ids.push(uploaded.id);
        setPending((count) => Math.max(0, count - 1));
      }
      return ids;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That image could not be attached.");
      throw reason;
    } finally {
      setPending(0);
    }
  }, [apiCall, images, subjectKind]);

  /** Drop-in for a textarea's onPaste. */
  const onPaste = useCallback(
    (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (!files.length) return;
      event.preventDefault();
      add(files);
    },
    [add],
  );

  return { images, pending, error, add, remove, reset, flush, onPaste };
}
