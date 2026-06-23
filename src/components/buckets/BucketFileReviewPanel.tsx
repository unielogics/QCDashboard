"use client";

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode, type RefObject } from "react";
import { Icon } from "@/components/design-system/Icon";

export type BucketReviewFile = {
  id: string;
  file_name: string;
  content_type: string;
  size_bytes?: number;
  created_at?: string;
};

export type BucketFileAnnotation = {
  id: string;
  file_id: string;
  page_number: number;
  x: number;
  y: number;
  width: number;
  height: number;
  comment: string;
  author_name: string;
  author_role: string;
  created_at: string;
};

export type BucketFileReview = {
  file: BucketReviewFile;
  preview_url: string | null;
  annotations: BucketFileAnnotation[];
};

type DraftRect = { page_number: number; x: number; y: number; width: number; height: number };

export function BucketFileReviewPanel({
  title = "File review",
  loadReview,
  saveAnnotation,
  onClose,
}: {
  title?: string;
  loadReview: () => Promise<BucketFileReview>;
  saveAnnotation: (payload: DraftRect & { comment: string }) => Promise<BucketFileAnnotation>;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const [review, setReview] = useState<BucketFileReview | null>(null);
  const [status, setStatus] = useState("Loading file...");
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [draftRect, setDraftRect] = useState<DraftRect | null>(null);
  const [draftComment, setDraftComment] = useState("");
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadReview()
      .then((data) => {
        if (cancelled) return;
        setReview(data);
        setStatus("");
        setPageNumber(1);
      })
      .catch((error) => {
        if (!cancelled) setStatus(error instanceof Error ? error.message : "Could not load review.");
      });
    return () => {
      cancelled = true;
    };
  }, [loadReview]);

  const fileType = review ? reviewFileType(review.file.content_type, review.file.file_name) : "unsupported";

  useEffect(() => {
    let cancelled = false;
    if (!review?.preview_url || fileType !== "pdf") {
      setPdfDoc(null);
      return;
    }
    async function loadPdf() {
      setStatus("Loading PDF...");
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const doc = await pdfjs.getDocument({ url: review!.preview_url! }).promise;
      if (cancelled) return;
      setPdfDoc(doc);
      setPageCount(doc.numPages);
      setStatus("");
    }
    loadPdf().catch((error) => {
      if (!cancelled) setStatus(error instanceof Error ? error.message : "Could not render PDF.");
    });
    return () => {
      cancelled = true;
    };
  }, [fileType, review]);

  useEffect(() => {
    let cancelled = false;
    async function renderPage() {
      if (!pdfDoc || !canvasRef.current || !stageRef.current) return;
      const page = await pdfDoc.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const availableWidth = Math.max(320, stageRef.current.clientWidth - 48);
      const scale = Math.min(1.6, availableWidth / baseViewport.width);
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      if (!context) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: context, viewport }).promise;
      if (!cancelled) setStatus("");
    }
    if (fileType === "pdf") {
      renderPage().catch((error) => setStatus(error instanceof Error ? error.message : "Could not render page."));
    }
    return () => {
      cancelled = true;
    };
  }, [fileType, pageNumber, pdfDoc]);

  const pageAnnotations = (review?.annotations ?? []).filter((annotation) => annotation.page_number === pageNumber);
  const activeAnnotation = review?.annotations.find((annotation) => annotation.id === activeAnnotationId) ?? null;

  function stagePoint(event: MouseEvent<HTMLDivElement>) {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: clamp((event.clientX - rect.left) / rect.width),
      y: clamp((event.clientY - rect.top) / rect.height),
    };
  }

  function beginMark(event: MouseEvent<HTMLDivElement>) {
    if (!canAnnotate(fileType) || saving || !review?.preview_url) return;
    const point = stagePoint(event);
    if (!point) return;
    dragStartRef.current = point;
    setDraftRect({ page_number: pageNumber, x: point.x, y: point.y, width: 0, height: 0 });
    setActiveAnnotationId(null);
  }

  function moveMark(event: MouseEvent<HTMLDivElement>) {
    if (!dragStartRef.current) return;
    const point = stagePoint(event);
    if (!point) return;
    const start = dragStartRef.current;
    setDraftRect({
      page_number: pageNumber,
      x: Math.min(start.x, point.x),
      y: Math.min(start.y, point.y),
      width: Math.abs(point.x - start.x),
      height: Math.abs(point.y - start.y),
    });
  }

  function endMark() {
    dragStartRef.current = null;
    setDraftRect((rect) => (rect && rect.width > 0.01 && rect.height > 0.01 ? rect : null));
  }

  async function submitComment() {
    if (!draftRect || !draftComment.trim()) return;
    setSaving(true);
    try {
      const annotation = await saveAnnotation({ ...draftRect, comment: draftComment.trim() });
      setReview((current) => current ? { ...current, annotations: [...current.annotations, annotation] } : current);
      setActiveAnnotationId(annotation.id);
      setDraftRect(null);
      setDraftComment("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={backdrop}>
      <section style={panel}>
        <header style={header}>
          <div style={{ minWidth: 0 }}>
            <div style={eyebrow}>{title}</div>
            <h2 style={heading}>{review?.file.file_name ?? "File"}</h2>
          </div>
          <button style={iconButton} onClick={onClose} aria-label="Close review">
            <Icon name="x" size={18} />
          </button>
        </header>
        <div style={body}>
          <main style={viewerColumn}>
            {review?.preview_url && fileType === "pdf" ? (
              <>
                <div style={toolbar}>
                  <button style={toolButton} onClick={() => setPageNumber((page) => Math.max(1, page - 1))} disabled={pageNumber <= 1}>Previous</button>
                  <span style={muted}>Page {pageNumber} of {pageCount}</span>
                  <button style={toolButton} onClick={() => setPageNumber((page) => Math.min(pageCount, page + 1))} disabled={pageNumber >= pageCount}>Next</button>
                </div>
                <ReviewStage stageRef={stageRef} onMouseDown={beginMark} onMouseMove={moveMark} onMouseUp={endMark}>
                  <canvas ref={canvasRef} style={{ display: "block", maxWidth: "100%" }} />
                  <RectLayer annotations={pageAnnotations} draftRect={draftRect} activeId={activeAnnotationId} onSelect={setActiveAnnotationId} />
                </ReviewStage>
              </>
            ) : review?.preview_url && fileType === "image" ? (
              <ReviewStage stageRef={stageRef} onMouseDown={beginMark} onMouseMove={moveMark} onMouseUp={endMark}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={review.preview_url} alt={review.file.file_name} style={{ display: "block", maxWidth: "100%", maxHeight: "72vh", objectFit: "contain" }} />
                <RectLayer annotations={pageAnnotations} draftRect={draftRect} activeId={activeAnnotationId} onSelect={setActiveAnnotationId} />
              </ReviewStage>
            ) : (
              <div style={unsupportedBox}>
                <Icon name="file" size={24} />
                <strong>Preview is not available for this file type.</strong>
                <span style={muted}>Download the file to review it locally.</span>
              </div>
            )}
            {status ? <div style={statusText}>{status}</div> : null}
          </main>
          <aside style={sidePanel}>
            <section style={sideSection}>
              <h3 style={sectionTitle}>Add section comment</h3>
              <p style={muted}>Drag over an area of the PDF or image, then add your review note.</p>
              {draftRect ? (
                <div style={{ display: "grid", gap: 8 }}>
                  <textarea style={textarea} value={draftComment} onChange={(event) => setDraftComment(event.target.value)} placeholder="Comment on the marked section" />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={primaryButton} onClick={submitComment} disabled={saving || !draftComment.trim()}>{saving ? "Saving..." : "Save comment"}</button>
                    <button style={secondaryButton} onClick={() => { setDraftRect(null); setDraftComment(""); }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={emptyNote}>No area selected.</div>
              )}
            </section>
            <section style={sideSection}>
              <h3 style={sectionTitle}>Review comments</h3>
              <div style={{ display: "grid", gap: 8 }}>
                {(review?.annotations ?? []).length === 0 ? (
                  <div style={emptyNote}>No comments yet.</div>
                ) : review!.annotations.map((annotation) => (
                  <button
                    key={annotation.id}
                    style={{ ...annotationButton, ...(activeAnnotationId === annotation.id ? annotationButtonActive : {}) }}
                    onClick={() => {
                      setPageNumber(annotation.page_number);
                      setActiveAnnotationId(annotation.id);
                    }}
                  >
                    <strong>{annotation.author_name}</strong>
                    <span>Page {annotation.page_number} - {formatDate(annotation.created_at)}</span>
                    <span>{annotation.comment}</span>
                  </button>
                ))}
              </div>
            </section>
            {activeAnnotation ? (
              <section style={sideSection}>
                <h3 style={sectionTitle}>Selected comment</h3>
                <p style={{ margin: 0, color: "#111827", fontWeight: 800 }}>{activeAnnotation.author_name}</p>
                <p style={muted}>{formatDate(activeAnnotation.created_at)}</p>
                <p style={{ margin: 0, color: "#334155", lineHeight: 1.45 }}>{activeAnnotation.comment}</p>
              </section>
            ) : null}
          </aside>
        </div>
      </section>
    </div>
  );
}

function ReviewStage({
  stageRef,
  children,
  onMouseDown,
  onMouseMove,
  onMouseUp,
}: {
  stageRef: RefObject<HTMLDivElement>;
  children: ReactNode;
  onMouseDown: (event: MouseEvent<HTMLDivElement>) => void;
  onMouseMove: (event: MouseEvent<HTMLDivElement>) => void;
  onMouseUp: () => void;
}) {
  return (
    <div
      ref={stageRef}
      style={stage}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {children}
    </div>
  );
}

function RectLayer({
  annotations,
  draftRect,
  activeId,
  onSelect,
}: {
  annotations: BucketFileAnnotation[];
  draftRect: DraftRect | null;
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div style={rectLayer}>
      {annotations.map((annotation) => (
        <button
          key={annotation.id}
          style={{ ...rectStyle(annotation), ...(activeId === annotation.id ? activeRect : {}) }}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(annotation.id);
          }}
          title={annotation.comment}
          aria-label={`Review comment by ${annotation.author_name}`}
        />
      ))}
      {draftRect ? <div style={{ ...rectStyle(draftRect), ...draftRectStyle }} /> : null}
    </div>
  );
}

function rectStyle(rect: Pick<DraftRect, "x" | "y" | "width" | "height">): CSSProperties {
  return {
    position: "absolute",
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.width * 100}%`,
    height: `${rect.height * 100}%`,
    border: "2px solid #21a7a1",
    background: "rgba(33,167,161,.16)",
    borderRadius: 3,
    padding: 0,
    cursor: "pointer",
  };
}

function reviewFileType(contentType: string, fileName: string): "pdf" | "image" | "unsupported" {
  const lower = `${contentType} ${fileName}`.toLowerCase();
  if (lower.includes("application/pdf") || lower.endsWith(".pdf")) return "pdf";
  if (lower.includes("image/") || /\.(png|jpe?g|webp|gif)$/i.test(fileName)) return "image";
  return "unsupported";
}

function canAnnotate(type: "pdf" | "image" | "unsupported") {
  return type === "pdf" || type === "image";
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

const backdrop: CSSProperties = { position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,.48)", padding: 24 };
const panel: CSSProperties = { height: "100%", background: "#fff", border: "1px solid #d8dee8", borderRadius: 14, display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", overflow: "hidden" };
const header: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "16px 18px", borderBottom: "1px solid #e5e7eb" };
const eyebrow: CSSProperties = { color: "#64748b", fontSize: 12, fontWeight: 900, textTransform: "uppercase" };
const heading: CSSProperties = { margin: "3px 0 0", color: "#111827", fontSize: 20, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const body: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", minHeight: 0 };
const viewerColumn: CSSProperties = { minWidth: 0, minHeight: 0, overflow: "auto", background: "#f4f6f8", padding: 18 };
const sidePanel: CSSProperties = { borderLeft: "1px solid #e5e7eb", background: "#fff", overflowY: "auto", padding: 14, display: "grid", gap: 12, alignContent: "start" };
const toolbar: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 12 };
const toolButton: CSSProperties = { height: 34, border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", color: "#111827", fontWeight: 800, padding: "0 12px", cursor: "pointer" };
const stage: CSSProperties = { position: "relative", width: "fit-content", maxWidth: "100%", margin: "0 auto", background: "#fff", boxShadow: "0 12px 32px rgba(15,23,42,.14)", userSelect: "none" };
const rectLayer: CSSProperties = { position: "absolute", inset: 0 };
const activeRect: CSSProperties = { borderColor: "#0f766e", background: "rgba(15,118,110,.24)" };
const draftRectStyle: CSSProperties = { borderStyle: "dashed", pointerEvents: "none" };
const iconButton: CSSProperties = { width: 36, height: 36, border: "1px solid #d8dee8", borderRadius: 9, background: "#fff", color: "#334155", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };
const sideSection: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, display: "grid", gap: 8 };
const sectionTitle: CSSProperties = { margin: 0, color: "#111827", fontSize: 14, fontWeight: 900 };
const muted: CSSProperties = { margin: 0, color: "#64748b", fontSize: 13, lineHeight: 1.4 };
const textarea: CSSProperties = { minHeight: 88, border: "1px solid #cbd5e1", borderRadius: 8, padding: 10, font: "inherit", resize: "vertical" };
const primaryButton: CSSProperties = { height: 36, border: "none", borderRadius: 8, background: "#111827", color: "#fff", fontWeight: 900, padding: "0 12px", cursor: "pointer" };
const secondaryButton: CSSProperties = { height: 36, border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", color: "#334155", fontWeight: 900, padding: "0 12px", cursor: "pointer" };
const emptyNote: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, color: "#64748b", background: "#f8fafc", fontSize: 13 };
const annotationButton: CSSProperties = { textAlign: "left", border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", color: "#334155", padding: 10, display: "grid", gap: 4, cursor: "pointer" };
const annotationButtonActive: CSSProperties = { borderColor: "#21a7a1", background: "#ecfeff" };
const unsupportedBox: CSSProperties = { minHeight: 360, display: "grid", placeItems: "center", alignContent: "center", gap: 10, color: "#334155", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12 };
const statusText: CSSProperties = { marginTop: 12, color: "#b45309", fontWeight: 800 };
