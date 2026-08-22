"use client";

// Public bucket share — a token in a URL, no login, no access code.
//
// Styling only: migrated off the module-level CSSProperties constants (and the
// ~30 hardcoded hex literals in them) onto the plain-CSS design system. This
// route is bare-layout — `.bareshell` in AppShell is the only chrome it gets —
// so it must read as a finished product standing on its own, which is exactly
// why it should not be carrying a second, private palette that drifts from the
// one every other screen uses. The file-type tile keeps its colour coding, but
// the colours are now the sheet's tone tokens rather than six hand-picked
// Tailwind greys. Behaviour, endpoints and the download permission gate are
// unchanged.

import { useEffect, useState, type CSSProperties } from "react";
import { useParams } from "next/navigation";
import { Btn, Callout, Card, CellChip, Kpi, Panel, StatusLine, type ChipTone } from "@/components/ds";
import { QCMark } from "@/components/QCMark";
import { Icon } from "@/components/design-system/Icon";
import { apiBase } from "@/lib/api";
import { openSignedUrl } from "@/lib/safeOpen";

type FileRow = { id: string; file_name: string; content_type: string; size_bytes?: number; created_at: string; preview_url?: string | null; download_url?: string | null };
type Access = {
  bucket: { name: string; client_name?: string | null; purpose?: string | null };
  share: { recipient_name?: string | null; can_download: boolean };
  files: FileRow[];
};

export default function BucketPublicSharePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [access, setAccess] = useState<Access | null>(null);
  const [status, setStatus] = useState("Opening secure room...");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiBase}/api/v1/buckets/public-share/${token}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("This link is unavailable or has expired."))))
      .then((data) => {
        setAccess(data);
        setStatus("");
      })
      .catch((e: Error) => setStatus(e.message));
  }, [token]);

  function previewFile(file: FileRow) {
    if (!openSignedUrl(file.preview_url)) setStatus("Preview is not available for this file.");
  }

  async function downloadSharedFile(file: FileRow) {
    if (!access?.share.can_download) return;
    setDownloadingId(file.id);
    setStatus("");
    try {
      const res = await fetch(`${apiBase}/api/v1/buckets/public-share/${token}/files/${file.id}/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        setStatus("Download is not available for this file.");
        return;
      }
      const payload = (await res.json()) as { url: string };
      if (!openSignedUrl(payload.url)) setStatus("Download is not available for this file.");
    } finally {
      setDownloadingId(null);
    }
  }

  const roomName = access?.bucket.name ?? "Secure file room";
  const recipient = access?.share.recipient_name;

  return (
    // `.bareshell` around this page already paints the ground and holds the
    // 100vh floor; the gutter is all that is left.
    <main style={{ padding: 24 }}>
      {!access ? (
        <section className="grid" style={{ maxWidth: 760, margin: "6vh auto 0" }}>
          <BrandBlock />
          <Card hi>
            <CellChip tone="acc">
              <Icon name="lock" size={12} /> Encrypted secure room
            </CellChip>
            {/* Hero display type: this is the whole page while the room is
                opening, and `.hd h1` is a console page title. */}
            <h1 style={{ margin: "16px 0 8px", fontSize: 34, lineHeight: 1.08 }}>
              Qualified Commercial Secure File Room
            </h1>
            <p style={{ margin: 0, color: "var(--muted)", fontSize: 16, lineHeight: 1.5 }}>
              {status || "Opening your secure file room."}
            </p>
          </Card>
        </section>
      ) : (
        <section className="grid" style={{ maxWidth: 1320, margin: "0 auto" }}>
          {/* Bespoke: identity on the left, the file count pinned right. */}
          <Card style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}>
            <div style={{ minWidth: 0 }}>
              <BrandBlock compact />
              <h1 style={{ margin: "12px 0 4px", fontSize: 28, lineHeight: 1.12 }}>{roomName}</h1>
              <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.45 }}>
                {recipient ? <>Shared with <strong>{recipient}</strong></> : "Shared files"}
                {access.bucket.client_name ? ` | ${access.bucket.client_name}` : ""}
                {access.bucket.purpose ? ` | ${access.bucket.purpose}` : ""}
              </p>
            </div>
            <Kpi label="Shared files" value={access.files.length} />
          </Card>

          <Callout tone="acc" icon={<Icon name="shield" size={16} />}>
            This is a public link — no login or access code is required to view these files.
          </Callout>

          {/* <section>, not <main>: the page already has one, and two of them
              leaves a screen reader with no single main landmark. */}
          <Panel
            title="Shared files"
            sub="Preview supported files in the secure viewer or download when permission is enabled."
          >
            <div className="grid g10">
              {access.files.length === 0 ? (
                <div className="sub">No files have been shared yet.</div>
              ) : access.files.map((file) => (
                // Bespoke track: a fixed 54px file badge beside a fluid title,
                // with the actions dropping to a full-width second row.
                <article
                  key={file.id}
                  className="card"
                  style={{ display: "grid", gridTemplateColumns: "54px minmax(0, 1fr)", gap: 12, alignItems: "center" }}
                >
                  <div style={fileIcon(file)}>
                    <span>{fileExtension(file.file_name)}</span>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ fontSize: 16, overflowWrap: "anywhere" }}>{file.file_name}</h3>
                    <div className="sub" style={{ display: "flex", flexWrap: "wrap", gap: "6px 10px", marginTop: 5 }}>
                      <span>{fileKindLabel(file)}</span>
                      <span>Uploaded {formatDate(file.created_at)}</span>
                      {typeof file.size_bytes === "number" ? <span>{formatSize(file.size_bytes)}</span> : null}
                    </div>
                  </div>
                  <div className="row" style={{ gridColumn: "1 / -1" }}>
                    {file.preview_url ? (
                      <Btn onClick={() => previewFile(file)}>
                        <Icon name="eye" size={14} />
                        Preview
                      </Btn>
                    ) : null}
                    {access.share.can_download ? (
                      <Btn
                        variant="pri"
                        onClick={() => downloadSharedFile(file).catch(() => setStatus("Download is not available for this file."))}
                        disabled={downloadingId === file.id}
                      >
                        <Icon name="download" size={14} />
                        {downloadingId === file.id ? "Preparing..." : "Download"}
                      </Btn>
                    ) : (
                      <span className="sub">Download disabled</span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </Panel>
          {status ? <StatusLine tone={isErrorStatus(status) ? "bad" : "ok"}>{status}</StatusLine> : null}
        </section>
      )}
    </main>
  );
}

function BrandBlock({ compact = false }: { compact?: boolean }) {
  return (
    <div className="row">
      <QCMark size={compact ? 34 : 44} />
      <div>
        <div className="lbl">Qualified Commercial</div>
        <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.2 }}>Secure File Room</div>
      </div>
    </div>
  );
}

function fileExtension(fileName: string): string {
  const ext = fileName.split(".").pop()?.slice(0, 4).toUpperCase();
  return ext && ext !== fileName.toUpperCase() ? ext : "FILE";
}

function fileKindLabel(file: FileRow): string {
  const type = reviewFileType(file.content_type, file.file_name);
  if (type === "pdf") return "PDF document";
  if (type === "image") return "Image";
  if (type === "csv") return "CSV data";
  if (type === "text") return "Text document";
  if (type === "spreadsheet") return "Spreadsheet";
  return "File";
}

function reviewFileType(contentType: string, fileName: string): "pdf" | "image" | "csv" | "text" | "spreadsheet" | "unsupported" {
  const lower = `${contentType} ${fileName}`.toLowerCase();
  if (lower.includes("application/pdf") || lower.endsWith(".pdf")) return "pdf";
  if (lower.includes("image/") || /\.(png|jpe?g|webp|gif)$/i.test(fileName)) return "image";
  if (lower.includes("text/csv") || lower.endsWith(".csv")) return "csv";
  if (lower.includes("text/") || /\.(txt|md|log)$/i.test(fileName)) return "text";
  if (/\.(xlsx?|xlsm)$/i.test(fileName) || lower.includes("spreadsheet")) return "spreadsheet";
  return "unsupported";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/** Same wording test the page always used; only the styling moved to a class. */
function isErrorStatus(value: string): boolean {
  return /invalid|unavailable|could not|disabled|expired/i.test(value);
}

/** File kind → the sheet's tone vocabulary, so a PDF badge here is the same red
    a bad status is anywhere else in the product. */
const FILE_TONE: Record<string, ChipTone> = {
  pdf: "bad",
  image: "acc",
  csv: "ok",
  text: "mut",
  spreadsheet: "pet",
  unsupported: "mut",
};

const TONE_INK: Record<ChipTone, string> = {
  ok: "var(--ok)", warn: "var(--warn)", bad: "var(--danger)", mut: "var(--muted)",
  acc: "var(--accent)", gold: "var(--gold)", pet: "var(--petrol)",
};
const TONE_TINT: Record<ChipTone, string> = {
  ok: "var(--ok-tint)", warn: "var(--warn-tint)", bad: "var(--danger-tint)", mut: "var(--sunken)",
  acc: "var(--accent-100)", gold: "var(--gold-100)", pet: "var(--petrol-100)",
};

/**
 * The 54px file-type badge. Data-derived by definition — the tone is read off
 * the file's own content type — and larger than anything `.cellchip` or
 * `.botmark` describes, so the geometry stays here.
 */
function fileIcon(file: FileRow): CSSProperties {
  const tone = FILE_TONE[reviewFileType(file.content_type, file.file_name)];
  return {
    width: 54,
    height: 54,
    border: "1px solid var(--line)",
    borderRadius: 10,
    background: TONE_TINT[tone],
    color: TONE_INK[tone],
    display: "grid",
    placeItems: "center",
    fontSize: 11,
    fontWeight: 900,
  };
}
