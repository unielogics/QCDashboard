"use client";

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode, type Ref } from "react";
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
type DragStart = { page_number: number; x: number; y: number };
type ReviewFileType = "pdf" | "image" | "csv" | "text" | "spreadsheet" | "unsupported";

export function BucketFileReviewPanel({
  title = "File review",
  downloadUrl,
  onDownload,
  onDelete,
  loadReview,
  saveAnnotation,
  onClose,
}: {
  title?: string;
  downloadUrl?: string | null;
  onDownload?: () => void;
  onDelete?: () => void;
  loadReview: () => Promise<BucketFileReview>;
  saveAnnotation: (payload: DraftRect & { comment: string }) => Promise<BucketFileAnnotation>;
  onClose: () => void;
}) {
  const imageStageRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const pageStageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const dragStartRef = useRef<DragStart | null>(null);
  const [review, setReview] = useState<BucketFileReview | null>(null);
  const [status, setStatus] = useState("Loading file...");
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageCount, setPageCount] = useState(1);
  const [pdfZoom, setPdfZoom] = useState(1);
  const [viewerWidth, setViewerWidth] = useState(900);
  const [textPreview, setTextPreview] = useState("");
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
        setPdfDoc(null);
        setPageCount(1);
        setPdfZoom(1);
        setTextPreview("");
        setDraftRect(null);
        setActiveAnnotationId(null);
      })
      .catch((error) => {
        if (!cancelled) setStatus(error instanceof Error ? error.message : "Could not load review.");
      });
    return () => {
      cancelled = true;
    };
  }, [loadReview]);

  const fileType = review ? reviewFileType(review.file.content_type, review.file.file_name) : "unsupported";
  const activeAnnotation = review?.annotations.find((annotation) => annotation.id === activeAnnotationId) ?? null;

  useEffect(() => {
    const node = viewerRef.current;
    if (!node) return;
    const update = () => setViewerWidth(Math.max(360, node.clientWidth - 32));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

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
    if (!review?.preview_url || (fileType !== "csv" && fileType !== "text")) {
      setTextPreview("");
      return;
    }
    async function loadTextPreview() {
      setStatus(fileType === "csv" ? "Loading CSV preview..." : "Loading text preview...");
      const res = await fetch(review!.preview_url!);
      if (!res.ok) throw new Error("Could not load text preview.");
      const body = await res.text();
      if (cancelled) return;
      setTextPreview(body);
      setStatus("");
    }
    loadTextPreview().catch((error) => {
      if (!cancelled) setStatus(error instanceof Error ? error.message : "Could not load preview.");
    });
    return () => {
      cancelled = true;
    };
  }, [fileType, review]);

  function stagePoint(event: MouseEvent<HTMLDivElement>, stage: HTMLDivElement | null) {
    const rect = stage?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: clamp((event.clientX - rect.left) / rect.width),
      y: clamp((event.clientY - rect.top) / rect.height),
    };
  }

  function beginMark(pageNumber: number, stage: HTMLDivElement | null, event: MouseEvent<HTMLDivElement>) {
    if (!canAnnotate(fileType) || saving || !review?.preview_url) return;
    const point = stagePoint(event, stage);
    if (!point) return;
    dragStartRef.current = { page_number: pageNumber, ...point };
    setDraftRect({ page_number: pageNumber, x: point.x, y: point.y, width: 0, height: 0 });
    setActiveAnnotationId(null);
  }

  function moveMark(pageNumber: number, stage: HTMLDivElement | null, event: MouseEvent<HTMLDivElement>) {
    const start = dragStartRef.current;
    if (!start || start.page_number !== pageNumber) return;
    const point = stagePoint(event, stage);
    if (!point) return;
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
      scrollToPage(annotation.page_number);
    } finally {
      setSaving(false);
    }
  }

  function scrollToPage(pageNumber: number) {
    pageStageRefs.current[pageNumber]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function selectAnnotation(annotation: BucketFileAnnotation) {
    setActiveAnnotationId(annotation.id);
    scrollToPage(annotation.page_number);
  }

  const annotationHelp = canAnnotate(fileType)
    ? "Drag over an area of the PDF or image, then add your review note."
    : "Area comments are available for PDF and image previews.";

  return (
    <div style={backdrop}>
      <section style={panel}>
        <header style={header}>
          <div style={{ minWidth: 0 }}>
            <div style={eyebrow}>{title}</div>
            <h2 style={heading}>{review?.file.file_name ?? "File"}</h2>
            {review ? <div style={fileMeta}>{fileTypeLabel(fileType)}{typeof review.file.size_bytes === "number" ? ` | ${formatSize(review.file.size_bytes)}` : ""}</div> : null}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {onDownload ? (
              <button style={primaryButton} onClick={onDownload}>
                <Icon name="download" size={14} />
                Download
              </button>
            ) : downloadUrl ? (
              <a style={primaryLink} href={downloadUrl} target="_blank" rel="noopener noreferrer">
                <Icon name="download" size={14} />
                Download
              </a>
            ) : null}
            {review?.preview_url ? (
              <a style={secondaryLink} href={review.preview_url} target="_blank" rel="noopener noreferrer">
                <Icon name="external" size={14} />
                Open original
              </a>
            ) : null}
            {onDelete ? (
              <button style={dangerButton} onClick={onDelete}>
                <Icon name="x" size={14} />
                Delete
              </button>
            ) : null}
            <button style={iconButton} onClick={onClose} aria-label="Close review">
              <Icon name="x" size={18} />
            </button>
          </div>
        </header>
        <div style={body}>
          <main ref={viewerRef} style={viewerColumn}>
            {review?.preview_url && fileType === "pdf" ? (
              <>
                <div style={toolbar}>
                  <button style={toolButton} onClick={() => setPdfZoom(1)}>Fit width</button>
                  <button style={toolButton} onClick={() => setPdfZoom((zoom) => Math.max(0.55, Number((zoom - 0.15).toFixed(2))))} aria-label="Zoom out">-</button>
                  <span style={zoomLabel}>{Math.round(pdfZoom * 100)}%</span>
                  <button style={toolButton} onClick={() => setPdfZoom((zoom) => Math.min(2.4, Number((zoom + 0.15).toFixed(2))))} aria-label="Zoom in">+</button>
                  <button style={toolButton} onClick={() => setPdfZoom(1)}>Reset</button>
                  <span style={muted}>{pageCount} page{pageCount === 1 ? "" : "s"}</span>
                </div>
                <div style={pdfStack}>
                  {pdfDoc ? Array.from({ length: pageCount }, (_, index) => {
                    const pageNumber = index + 1;
                    return (
                      <PdfPage
                        key={pageNumber}
                        pdfDoc={pdfDoc}
                        pageNumber={pageNumber}
                        zoom={pdfZoom}
                        viewerWidth={viewerWidth}
                        annotations={(review.annotations ?? []).filter((annotation) => annotation.page_number === pageNumber)}
                        draftRect={draftRect?.page_number === pageNumber ? draftRect : null}
                        activeId={activeAnnotationId}
                        setStageRef={(node) => {
                          pageStageRefs.current[pageNumber] = node;
                        }}
                        onSelect={setActiveAnnotationId}
                        onMouseDown={(event, stage) => beginMark(pageNumber, stage, event)}
                        onMouseMove={(event, stage) => moveMark(pageNumber, stage, event)}
                        onMouseUp={endMark}
                      />
                    );
                  }) : null}
                </div>
              </>
            ) : review?.preview_url && fileType === "image" ? (
              <ReviewStage
                stageRef={imageStageRef}
                onMouseDown={(event) => beginMark(1, imageStageRef.current, event)}
                onMouseMove={(event) => moveMark(1, imageStageRef.current, event)}
                onMouseUp={endMark}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={review.preview_url} alt={review.file.file_name} style={imagePreview} />
                <RectLayer annotations={(review.annotations ?? []).filter((annotation) => annotation.page_number === 1)} draftRect={draftRect?.page_number === 1 ? draftRect : null} activeId={activeAnnotationId} onSelect={setActiveAnnotationId} />
              </ReviewStage>
            ) : review?.preview_url && fileType === "csv" ? (
              <CsvPreview text={textPreview} />
            ) : review?.preview_url && fileType === "text" ? (
              <pre style={textBox}>{textPreview || "Loading preview..."}</pre>
            ) : (
              <UnsupportedPreview review={review} fileType={fileType} />
            )}
            {status ? <div style={statusText}>{status}</div> : null}
          </main>
          <aside style={sidePanel}>
            <section style={sideSection}>
              <h3 style={sectionTitle}>Add section comment</h3>
              <div style={instructionBox}>
                <strong>{canAnnotate(fileType) ? "To leave a comment: click and drag over the exact area on the document." : "Section comments are available for PDF and image files."}</strong>
                <span>{annotationHelp}</span>
              </div>
              {draftRect ? (
                <div style={{ display: "grid", gap: 8 }}>
                  <textarea style={textarea} value={draftComment} onChange={(event) => setDraftComment(event.target.value)} placeholder="Comment on the marked section" />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={primaryButton} onClick={submitComment} disabled={saving || !draftComment.trim()}>{saving ? "Saving..." : "Save comment"}</button>
                    <button style={secondaryButton} onClick={() => { setDraftRect(null); setDraftComment(""); }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={emptyNote}>{canAnnotate(fileType) ? "No area selected." : "Preview this file locally to add general feedback."}</div>
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
                    onClick={() => selectAnnotation(annotation)}
                  >
                    <strong>{annotation.author_name}</strong>
                    <span>Page {annotation.page_number} | {formatDate(annotation.created_at)}</span>
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

function PdfPage({
  pdfDoc,
  pageNumber,
  zoom,
  viewerWidth,
  annotations,
  draftRect,
  activeId,
  setStageRef,
  onSelect,
  onMouseDown,
  onMouseMove,
  onMouseUp,
}: {
  pdfDoc: any;
  pageNumber: number;
  zoom: number;
  viewerWidth: number;
  annotations: BucketFileAnnotation[];
  draftRect: DraftRect | null;
  activeId: string | null;
  setStageRef: (node: HTMLDivElement | null) => void;
  onSelect: (id: string) => void;
  onMouseDown: (event: MouseEvent<HTMLDivElement>, stage: HTMLDivElement | null) => void;
  onMouseMove: (event: MouseEvent<HTMLDivElement>, stage: HTMLDivElement | null) => void;
  onMouseUp: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const localStageRef = useRef<HTMLDivElement | null>(null);
  const renderTaskRef = useRef<any>(null);
  const [renderStatus, setRenderStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function renderPage() {
      if (!pdfDoc || !canvasRef.current) return;
      setRenderStatus("Rendering...");
      const previousTask = renderTaskRef.current;
      if (previousTask) {
        previousTask.cancel();
        try {
          await previousTask.promise;
        } catch {
          // Expected when a zoom/resize starts a replacement render.
        }
        if (cancelled || !canvasRef.current) return;
      }
      const page = await pdfDoc.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const fitScale = Math.max(0.4, viewerWidth / baseViewport.width);
      const scale = clampRange(fitScale * zoom, 0.35, 3.2);
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      if (!context) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const renderTask = page.render({ canvasContext: context, viewport });
      renderTaskRef.current = renderTask;
      await renderTask.promise;
      if (!cancelled) {
        renderTaskRef.current = null;
        setRenderStatus("");
      }
    }
    renderPage().catch((error) => {
      if (renderTaskRef.current?.promise && error?.name === "RenderingCancelledException") return;
      if (!cancelled) setRenderStatus(error instanceof Error ? error.message : "Could not render page.");
    });
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [pageNumber, pdfDoc, viewerWidth, zoom]);

  return (
    <div style={pdfPageWrap}>
      <div style={pdfPageLabel}>Page {pageNumber}</div>
      <ReviewStage
        stageRef={(node) => {
          localStageRef.current = node;
          setStageRef(node);
        }}
        onMouseDown={(event) => onMouseDown(event, localStageRef.current)}
        onMouseMove={(event) => onMouseMove(event, localStageRef.current)}
        onMouseUp={onMouseUp}
      >
        <canvas ref={canvasRef} style={{ display: "block", maxWidth: "none" }} />
        <RectLayer annotations={annotations} draftRect={draftRect} activeId={activeId} onSelect={onSelect} />
      </ReviewStage>
      {renderStatus ? <div style={pageStatus}>{renderStatus}</div> : null}
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
  stageRef: Ref<HTMLDivElement>;
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

function CsvPreview({ text }: { text: string }) {
  const parsed = parseCsv(text);
  const rows = parsed.slice(0, 200);
  if (!text) return <div style={emptyPreview}>Loading CSV preview...</div>;
  if (!rows.length) return <div style={emptyPreview}>No CSV rows found.</div>;
  const [head, ...bodyRows] = rows;
  return (
    <div style={tableWrap}>
      <table style={table}>
        <thead>
          <tr>
            {head.map((cell, index) => <th key={`${cell}-${index}`} style={th}>{cell || `Column ${index + 1}`}</th>)}
          </tr>
        </thead>
        <tbody>
          {bodyRows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {head.map((_, cellIndex) => <td key={cellIndex} style={td}>{row[cellIndex] ?? ""}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {parsed.length > 200 ? <div style={tableNote}>Showing first 200 rows.</div> : null}
    </div>
  );
}

function UnsupportedPreview({ review, fileType }: { review: BucketFileReview | null; fileType: ReviewFileType }) {
  const isSpreadsheet = fileType === "spreadsheet";
  return (
    <div style={unsupportedBox}>
      <Icon name={isSpreadsheet ? "doc" : "file"} size={28} />
      <strong>{isSpreadsheet ? "Spreadsheet preview requires download." : "Preview is not available for this file type."}</strong>
      <span style={muted}>{isSpreadsheet ? "Open Excel files locally to preserve formulas, tabs, and formatting." : "Open the original file to review it locally."}</span>
      {review?.preview_url ? (
        <a style={primaryLink} href={review.preview_url} target="_blank" rel="noopener noreferrer">
          <Icon name="external" size={14} />
          Open file
        </a>
      ) : null}
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

function reviewFileType(contentType: string, fileName: string): ReviewFileType {
  const lower = `${contentType} ${fileName}`.toLowerCase();
  if (lower.includes("application/pdf") || lower.endsWith(".pdf")) return "pdf";
  if (lower.includes("image/") || /\.(png|jpe?g|webp|gif)$/i.test(fileName)) return "image";
  if (lower.includes("text/csv") || lower.endsWith(".csv")) return "csv";
  if (lower.includes("text/") || /\.(txt|md|log)$/i.test(fileName)) return "text";
  if (/\.(xlsx?|xlsm)$/i.test(fileName) || lower.includes("spreadsheet")) return "spreadsheet";
  return "unsupported";
}

function fileTypeLabel(type: ReviewFileType): string {
  if (type === "pdf") return "PDF document";
  if (type === "image") return "Image";
  if (type === "csv") return "CSV data";
  if (type === "text") return "Text document";
  if (type === "spreadsheet") return "Spreadsheet";
  return "File";
}

function canAnnotate(type: ReviewFileType) {
  return type === "pdf" || type === "image";
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function clampRange(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

const backdrop: CSSProperties = { position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,.52)", padding: 18 };
const panel: CSSProperties = { height: "100%", background: "#fff", border: "1px solid #d8dee8", borderRadius: 12, display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", overflow: "hidden" };
const header: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "14px 16px", borderBottom: "1px solid #e5e7eb" };
const eyebrow: CSSProperties = { color: "#64748b", fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0 };
const heading: CSSProperties = { margin: "3px 0 0", color: "#111827", fontSize: 20, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const fileMeta: CSSProperties = { color: "#64748b", fontSize: 12, fontWeight: 750, marginTop: 3 };
const body: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", minHeight: 0 };
const viewerColumn: CSSProperties = { minWidth: 0, minHeight: 0, overflow: "auto", background: "#eef1f5", padding: 16 };
const sidePanel: CSSProperties = { borderLeft: "1px solid #e5e7eb", background: "#fff", overflowY: "auto", padding: 14, display: "grid", gap: 12, alignContent: "start" };
const toolbar: CSSProperties = { position: "sticky", top: 0, zIndex: 4, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 14, padding: 8, border: "1px solid #d8dee8", borderRadius: 10, background: "rgba(255,255,255,.94)", boxShadow: "0 8px 24px rgba(15,23,42,.08)", flexWrap: "wrap" };
const toolButton: CSSProperties = { height: 34, border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", color: "#111827", fontWeight: 850, padding: "0 12px", cursor: "pointer" };
const zoomLabel: CSSProperties = { minWidth: 54, textAlign: "center", color: "#334155", fontSize: 12, fontWeight: 900 };
const pdfStack: CSSProperties = { display: "grid", justifyItems: "center", gap: 18, paddingBottom: 24 };
const pdfPageWrap: CSSProperties = { display: "grid", justifyItems: "center", gap: 7 };
const pdfPageLabel: CSSProperties = { color: "#64748b", fontSize: 12, fontWeight: 900 };
const stage: CSSProperties = { position: "relative", width: "fit-content", maxWidth: "none", margin: "0 auto", background: "#fff", boxShadow: "0 12px 34px rgba(15,23,42,.16)", userSelect: "none" };
const rectLayer: CSSProperties = { position: "absolute", inset: 0 };
const activeRect: CSSProperties = { borderColor: "#0f766e", background: "rgba(15,118,110,.24)" };
const draftRectStyle: CSSProperties = { borderStyle: "dashed", pointerEvents: "none" };
const imagePreview: CSSProperties = { display: "block", maxWidth: "min(100%, 1200px)", maxHeight: "78vh", objectFit: "contain" };
const iconButton: CSSProperties = { width: 36, height: 36, border: "1px solid #d8dee8", borderRadius: 9, background: "#fff", color: "#334155", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };
const sideSection: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, display: "grid", gap: 8 };
const sectionTitle: CSSProperties = { margin: 0, color: "#111827", fontSize: 14, fontWeight: 900 };
const muted: CSSProperties = { margin: 0, color: "#64748b", fontSize: 13, lineHeight: 1.4 };
const instructionBox: CSSProperties = { display: "grid", gap: 4, border: "1px solid #bfdbfe", borderRadius: 9, padding: 10, color: "#1e3a8a", background: "#eff6ff", fontSize: 13, lineHeight: 1.4 };
const textarea: CSSProperties = { minHeight: 88, border: "1px solid #cbd5e1", borderRadius: 8, padding: 10, font: "inherit", resize: "vertical" };
const primaryButton: CSSProperties = { height: 36, border: "none", borderRadius: 8, background: "#111827", color: "#fff", fontWeight: 900, padding: "0 12px", cursor: "pointer" };
const primaryLink: CSSProperties = { ...primaryButton, display: "inline-flex", alignItems: "center", gap: 7, textDecoration: "none" };
const secondaryButton: CSSProperties = { height: 36, border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", color: "#334155", fontWeight: 900, padding: "0 12px", cursor: "pointer" };
const secondaryLink: CSSProperties = { ...secondaryButton, display: "inline-flex", alignItems: "center", gap: 7, textDecoration: "none" };
const dangerButton: CSSProperties = { ...secondaryButton, display: "inline-flex", alignItems: "center", gap: 7, color: "#b91c1c", borderColor: "#fecaca", background: "#fff5f5" };
const emptyNote: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, color: "#64748b", background: "#f8fafc", fontSize: 13 };
const annotationButton: CSSProperties = { textAlign: "left", border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", color: "#334155", padding: 10, display: "grid", gap: 4, cursor: "pointer" };
const annotationButtonActive: CSSProperties = { borderColor: "#21a7a1", background: "#ecfeff" };
const unsupportedBox: CSSProperties = { minHeight: 360, display: "grid", placeItems: "center", alignContent: "center", gap: 10, color: "#334155", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 18, textAlign: "center" };
const emptyPreview: CSSProperties = { minHeight: 260, display: "grid", placeItems: "center", color: "#64748b", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12 };
const statusText: CSSProperties = { marginTop: 12, color: "#b45309", fontWeight: 800 };
const pageStatus: CSSProperties = { color: "#b45309", fontSize: 12, fontWeight: 800 };
const textBox: CSSProperties = { margin: 0, minHeight: 420, border: "1px solid #d8dee8", borderRadius: 12, background: "#fff", color: "#111827", padding: 16, whiteSpace: "pre-wrap", overflow: "auto", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize: 13, lineHeight: 1.55 };
const tableWrap: CSSProperties = { border: "1px solid #d8dee8", borderRadius: 12, background: "#fff", overflow: "auto", maxHeight: "76vh" };
const table: CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const th: CSSProperties = { position: "sticky", top: 0, zIndex: 1, background: "#f8fafc", color: "#334155", textAlign: "left", padding: "9px 10px", borderBottom: "1px solid #e2e8f0", fontWeight: 900, whiteSpace: "nowrap" };
const td: CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #eef2f7", color: "#111827", whiteSpace: "nowrap" };
const tableNote: CSSProperties = { padding: 10, color: "#64748b", fontSize: 12, fontWeight: 800 };
