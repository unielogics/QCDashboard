"use client";

import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { Icon } from "./Icon";
import { useTheme } from "./ThemeProvider";

/**
 * Reusable drag-and-drop + click-to-browse file input. Owns only the drag-hover
 * state and the hidden <input>; the caller owns the file queue via onFiles.
 * Extracted from the admin buckets upload zone so buckets, the admin chat panel,
 * and the intake conversation all share one dropzone. Themed via useTheme().
 */
export function FileDropzone({
  onFiles,
  disabled = false,
  multiple = true,
  accept,
  title = "Drag files here or click to browse",
  hint,
  children,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  multiple?: boolean;
  accept?: string;
  title?: string;
  hint?: ReactNode;
  children?: ReactNode;
}) {
  const { t } = useTheme();
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
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: "18px 16px",
        borderRadius: 12,
        border: `1.5px dashed ${dragging ? t.brand : t.line}`,
        background: dragging ? t.brandSoft : t.surface2,
        color: t.ink3,
        textAlign: "center",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        transition: "border-color 120ms ease, background 120ms ease",
      }}
    >
      {children ?? (
        <>
          <Icon name="upload" size={18} />
          <span style={{ fontSize: 13, fontWeight: 700, color: t.ink2 }}>{title}</span>
          {hint ? <span style={{ fontSize: 12 }}>{hint}</span> : null}
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept={accept}
        onChange={(e) => emit(e.target.files)}
        style={{ display: "none" }}
      />
    </div>
  );
}
