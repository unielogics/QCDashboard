"use client";

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode, type Ref } from "react";
import { Icon } from "@/components/design-system/Icon";
import { Btn, BtnLink, Callout, cx, Empty, IconBtn, Panel, StatusLine, Sub, Textarea } from "@/components/ds";

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
const MAXIMIZED_PDF_ZOOM = 1.7;

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
      // All pdf.js runtime assets are staged version-locked into /pdfjs/ by
      // scripts/copy-pdfjs-assets.mjs (postinstall). The wasm decoders and
      // font/cmap data are fetched lazily at render time — without these URLs
      // the fetches 404 and scanned documents paint as blank white pages.
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
      const doc = await pdfjs.getDocument({
        url: review!.preview_url!,
        wasmUrl: "/pdfjs/wasm/",
        standardFontDataUrl: "/pdfjs/standard_fonts/",
        cMapUrl: "/pdfjs/cmaps/",
        cMapPacked: true,
        iccUrl: "/pdfjs/iccs/",
      }).promise;
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
    // Bespoke, and it has to be: this is a full-bleed reviewer, not the centred
    // `.drawer`. z-index 500 is load-bearing — /admin/buckets opens it from
    // inside its bucket detail modal (300) and /vendor/buckets over the AI rail
    // (200); at the drawer's 61 it would open behind both.
    <div style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(15, 23, 32, 0.52)", padding: 18 }}>
      {/* `.panel` is already a clipped flex column; only the full-height fill
          is this overlay's own. */}
      <section className="panel" style={{ height: "100%" }}>
        {/* `.filehd-b` and not `.panel-h`: this is a file identity block —
            eyebrow, file name, meta on the left, actions on the right — and
            `.panel-h h2` would pin the file name to 15px, fighting
            `.filehd-t`. Only the hairline under it is this header's own,
            because `.filehd` (which normally draws it) is a standalone card
            and would double the panel's border. */}
        <header className="filehd-b" style={{ borderBottom: "1px solid var(--line)" }}>
          <div className="grid g4" style={{ minWidth: 0 }}>
            <span className="lbl">{title}</span>
            <h2 className="filehd-t">{review?.file.file_name ?? "File"}</h2>
            {review ? (
              <Sub>
                {fileTypeLabel(fileType)}
                {typeof review.file.size_bytes === "number" ? ` | ${formatSize(review.file.size_bytes)}` : ""}
              </Sub>
            ) : null}
          </div>
          <div className="row">
          {onDownload ? (
            <Btn variant="pri" onClick={onDownload}>
              <Icon name="download" size={14} />
              Download
            </Btn>
          ) : downloadUrl ? (
            <BtnLink variant="pri" href={downloadUrl} target="_blank" rel="noopener noreferrer">
              <Icon name="download" size={14} />
              Download
            </BtnLink>
          ) : null}
          {review?.preview_url ? (
            <BtnLink href={review.preview_url} target="_blank" rel="noopener noreferrer">
              <Icon name="external" size={14} />
              Open original
            </BtnLink>
          ) : null}
          {onDelete ? (
            <Btn className="danger" onClick={onDelete}>
              <Icon name="x" size={14} />
              Delete
            </Btn>
          ) : null}
          <IconBtn onClick={onClose} aria-label="Close review" title="Close review">
            <Icon name="x" size={15} />
          </IconBtn>
          </div>
        </header>
        {/* Bespoke track: a document that wants every pixel it can get beside a
            review rail that must not fall below a readable width. */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 5fr) minmax(180px, 1fr)", minHeight: 0, flex: 1 }}>
          {/* Bespoke: the scrolling document well, sunk behind the page it holds. */}
          <main ref={viewerRef} style={{ minWidth: 0, minHeight: 0, overflow: "auto", background: "var(--sunken)", padding: 16 }}>
            {review?.preview_url && fileType === "pdf" ? (
              <>
                {/* Bespoke: a toolbar that stays with the reader as the document
                    scrolls under it. Nothing in the sheet is sticky-within. */}
                <div
                  className="row"
                  style={{
                    position: "sticky", top: 0, zIndex: 4, justifyContent: "center", marginBottom: 14,
                    padding: 8, border: "1px solid var(--line2)", borderRadius: "var(--r-sm)",
                    background: "var(--surface)", boxShadow: "var(--sh2)",
                  }}
                >
                  <Btn onClick={() => setPdfZoom(MAXIMIZED_PDF_ZOOM)}>Maximize</Btn>
                  <Btn onClick={() => setPdfZoom((zoom) => Math.max(0.55, Number((zoom - 0.15).toFixed(2))))} aria-label="Zoom out" title="Zoom out">-</Btn>
                  {/* Fixed width so the row does not shuffle between 90% and 100%. */}
                  <span className="num" style={{ minWidth: 54, textAlign: "center" }}>{Math.round(pdfZoom * 100)}%</span>
                  <Btn onClick={() => setPdfZoom((zoom) => Math.min(2.4, Number((zoom + 0.15).toFixed(2))))} aria-label="Zoom in" title="Zoom in">+</Btn>
                  <Btn onClick={() => setPdfZoom(1)}>Reset</Btn>
                  <span className="sub">{pageCount} page{pageCount === 1 ? "" : "s"}</span>
                </div>
                {/* Bespoke: a centred column of rendered pages. */}
                <div style={{ display: "grid", justifyItems: "center", gap: 18, paddingBottom: 24 }}>
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
                {/* Bespoke: the image is sized to the viewport, not to a box. */}
                <img src={review.preview_url} alt={review.file.file_name} style={{ display: "block", maxWidth: "min(100%, 1200px)", maxHeight: "78vh", objectFit: "contain" }} />
                <RectLayer annotations={(review.annotations ?? []).filter((annotation) => annotation.page_number === 1)} draftRect={draftRect?.page_number === 1 ? draftRect : null} activeId={activeAnnotationId} onSelect={setActiveAnnotationId} />
              </ReviewStage>
            ) : review?.preview_url && fileType === "csv" ? (
              <CsvPreview text={textPreview} />
            ) : review?.preview_url && fileType === "text" ? (
              // Bespoke: a monospace document well. `.field` is a control and
              // the sheet has no read-only code surface.
              <pre style={{ margin: 0, minHeight: 420, border: "1px solid var(--line)", borderRadius: "var(--r)", background: "var(--surface)", color: "var(--ink)", padding: 16, whiteSpace: "pre-wrap", overflow: "auto", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize: 13, lineHeight: 1.55 }}>
                {textPreview || "Loading preview..."}
              </pre>
            ) : (
              <UnsupportedPreview review={review} fileType={fileType} />
            )}
            {status ? <StatusLine tone="warn" className="mt">{status}</StatusLine> : null}
          </main>
          {/* Bespoke: the review rail. Scrolls independently of the document. */}
          <aside className="grid g10" style={{ borderLeft: "1px solid var(--line)", background: "var(--surface)", overflowY: "auto", padding: 14, alignContent: "start" }}>
            <Panel title="Add section comment" bodyClass="grid g8">
              <Callout tone="acc">
                <div className="grid g4">
                  <b>{canAnnotate(fileType) ? "To leave a comment: click and drag over the exact area on the document." : "Section comments are available for PDF and image files."}</b>
                  <span>{annotationHelp}</span>
                </div>
              </Callout>
              {draftRect ? (
                <>
                  {/* Bespoke: a comment box sized to a comment. */}
                  <Textarea style={{ minHeight: 88 }} value={draftComment} onChange={(event) => setDraftComment(event.target.value)} placeholder="Comment on the marked section" />
                  <div className="row">
                    <Btn variant="pri" onClick={submitComment} disabled={saving || !draftComment.trim()}>{saving ? "Saving..." : "Save comment"}</Btn>
                    <Btn onClick={() => { setDraftRect(null); setDraftComment(""); }}>Cancel</Btn>
                  </div>
                </>
              ) : (
                <Sub>{canAnnotate(fileType) ? "No area selected." : "Preview this file locally to add general feedback."}</Sub>
              )}
            </Panel>
            <Panel title="Review comments" bodyClass="grid g8">
              {(review?.annotations ?? []).length === 0 ? (
                <Empty>
                  No comments yet.
                </Empty>
              ) : review!.annotations.map((annotation) => (
                <button
                  key={annotation.id}
                  type="button"
                  className={cx("pick", activeAnnotationId === annotation.id && "on")}
                  onClick={() => selectAnnotation(annotation)}
                >
                  <span className="grow grid g4">
                    <b>{annotation.author_name}</b>
                    <span className="sub">Page {annotation.page_number} | {formatDate(annotation.created_at)}</span>
                    <span>{annotation.comment}</span>
                  </span>
                </button>
              ))}
            </Panel>
            {activeAnnotation ? (
              <Panel title="Selected comment" bodyClass="grid g6">
                <b>{activeAnnotation.author_name}</b>
                <Sub>{formatDate(activeAnnotation.created_at)}</Sub>
                <p>{activeAnnotation.comment}</p>
              </Panel>
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
    // Bespoke: one rendered page, centred with its label above it.
    <div style={{ display: "grid", justifyItems: "center", gap: 7 }}>
      <div className="lbl">Page {pageNumber}</div>
      <ReviewStage
        stageRef={(node) => {
          localStageRef.current = node;
          setStageRef(node);
        }}
        onMouseDown={(event) => onMouseDown(event, localStageRef.current)}
        onMouseMove={(event) => onMouseMove(event, localStageRef.current)}
        onMouseUp={onMouseUp}
      >
        {/* The canvas is sized in JS from the pdf.js viewport — measured geometry. */}
        <canvas ref={canvasRef} style={{ display: "block", maxWidth: "none" }} />
        <RectLayer annotations={annotations} draftRect={draftRect} activeId={activeId} onSelect={onSelect} />
      </ReviewStage>
      {renderStatus ? <StatusLine tone="warn">{renderStatus}</StatusLine> : null}
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
      // Bespoke: the drag surface. It sizes to the rendered page (fit-content)
      // because the mark coordinates are fractions of exactly this box, and
      // text selection has to be off or a drag selects the page instead.
      style={{ position: "relative", width: "fit-content", maxWidth: "none", margin: "0 auto", background: "var(--surface)", boxShadow: "var(--sh2)", userSelect: "none" }}
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
    <div className="marklayer">
      {annotations.map((annotation) => (
        <button
          key={annotation.id}
          type="button"
          className={cx("mark", activeId === annotation.id && "on")}
          style={rectBox(annotation)}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(annotation.id);
          }}
          title={annotation.comment}
          aria-label={`Review comment by ${annotation.author_name}`}
        />
      ))}
      {draftRect ? <div className="mark draft" style={rectBox(draftRect)} /> : null}
    </div>
  );
}

function CsvPreview({ text }: { text: string }) {
  const parsed = parseCsv(text);
  const rows = parsed.slice(0, 200);
  if (!text) return <div className="hintbox"><Sub>Loading CSV preview...</Sub></div>;
  if (!rows.length) return <div className="hintbox"><Sub>No CSV rows found.</Sub></div>;
  const [head, ...bodyRows] = rows;
  return (
    <Panel noPad>
      {/* Bespoke: the preview scrolls in both directions inside a bounded box,
          so a 4000-row export does not become a 4000-row page. */}
      <div className="tblwrap" style={{ maxHeight: "76vh", overflowY: "auto" }}>
        <table className="tbl nowrap">
          <caption className="sr-only">CSV preview</caption>
          <thead>
            <tr>
              {head.map((cell, index) => (
                <th key={`${cell}-${index}`} scope="col" style={{ position: "sticky", top: 0, zIndex: 1 }}>
                  {cell || `Column ${index + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bodyRows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {head.map((_, cellIndex) => <td key={cellIndex}>{row[cellIndex] ?? ""}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {parsed.length > 200 ? (
        <div className="panel-b">
          <Sub>Showing first 200 rows.</Sub>
        </div>
      ) : null}
    </Panel>
  );
}

function UnsupportedPreview({ review, fileType }: { review: BucketFileReview | null; fileType: ReviewFileType }) {
  const isSpreadsheet = fileType === "spreadsheet";
  return (
    // `.hintbox` is the dashed placeholder-with-a-reason; `minHeight` keeps the
    // well from collapsing to a strip in the middle of a tall viewer.
    <div className="hintbox" style={{ minHeight: 360 }}>
      <span className="hintbox-i">
        <Icon name={isSpreadsheet ? "doc" : "file"} size={18} />
      </span>
      <div className="grid g6">
        <b>{isSpreadsheet ? "Spreadsheet preview requires download." : "Preview is not available for this file type."}</b>
        <Sub>{isSpreadsheet ? "Open Excel files locally to preserve formulas, tabs, and formatting." : "Open the original file to review it locally."}</Sub>
        {review?.preview_url ? (
          <div>
            <BtnLink variant="pri" href={review.preview_url} target="_blank" rel="noopener noreferrer">
              <Icon name="external" size={14} />
              Open file
            </BtnLink>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Where a mark sits on the page.
 *
 * Fractions of the stage box, so this is measured geometry and stays inline.
 * Everything the mark LOOKS like — the teal border, the wash, the selected and
 * draft variants — is `.mark` in app-extras.css.
 */
function rectBox(rect: Pick<DraftRect, "x" | "y" | "width" | "height">): CSSProperties {
  return {
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.width * 100}%`,
    height: `${rect.height * 100}%`,
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
