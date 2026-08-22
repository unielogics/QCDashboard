"use client";

import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { cx } from "@/components/ds";
import { Icon } from "./Icon";

/**
 * Reusable drag-and-drop + click-to-browse file input. Owns only the drag-hover
 * state and the hidden <input>; the caller owns the file queue via onFiles.
 * Extracted from the admin buckets upload zone so buckets, the admin chat panel,
 * and the intake conversation all share one dropzone. Renders `.dropzone`
 * from globals.css in its in-form density (`.inline`), so the hover, drag and
 * disabled states are all CSS.
 */
export function FileDropzone({
  onFiles,
  disabled = false,
  multiple = true,
  accept,
  title = "Drag files here or click to browse",
  hint,
  children,
  compact = false,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  multiple?: boolean;
  accept?: string;
  title?: string;
  hint?: ReactNode;
  children?: ReactNode;
  /** Shrinks padding/icon/gap ~30% for tight layouts (e.g. beside a chat composer). */
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  function emit(files: FileList | null) {
    if (!files || files.length === 0) return;
    onFiles(Array.from(files));
    if (inputRef.current) inputRef.current.value = "";
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!disabled) setDragging(true);
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDragging(false);
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (disabled) return;
    setDragging(false);
    emit(event.dataTransfer.files);
  }

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => {
        if (!disabled) inputRef.current?.click();
      }}
      className={cx("dropzone", "inline", compact && "compact", dragging && "drag", disabled && "off")}
    >
      {children ?? (
        <>
          <Icon name="upload" size={compact ? 14 : 18} />
          <b>{title}</b>
          {hint ? <span className="sub">{hint}</span> : null}
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept={accept}
        onChange={(e) => emit(e.target.files)}
        hidden
      />
    </div>
  );
}
