"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useParams } from "next/navigation";
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
    <main style={page}>
      {!access ? (
        <section style={gateShell}>
          <BrandBlock />
          <div style={gateCard}>
            <div style={securePill}>
              <Icon name="lock" size={14} />
              Encrypted secure room
            </div>
            <h1 style={gateTitle}>Qualified Commercial Secure File Room</h1>
            <p style={gateCopy}>{status || "Opening your secure file room."}</p>
          </div>
        </section>
      ) : (
        <section style={roomShell}>
          <header style={roomHeader}>
            <div style={{ minWidth: 0 }}>
              <BrandBlock compact />
              <h1 style={roomTitle}>{roomName}</h1>
              <p style={roomMeta}>
                {recipient ? <>Shared with <strong>{recipient}</strong></> : "Shared files"}
                {access.bucket.client_name ? ` | ${access.bucket.client_name}` : ""}
                {access.bucket.purpose ? ` | ${access.bucket.purpose}` : ""}
              </p>
            </div>
            <div style={summaryCard}>
              <span style={summaryNumber}>{access.files.length}</span>
              <span style={summaryLabel}>shared files</span>
            </div>
          </header>

          <div style={securityBar}>
            <Icon name="shield" size={16} />
            <span>This is a public link — no login or access code is required to view these files.</span>
          </div>

          <main style={filePanel}>
            <div style={sectionHeader}>
              <div>
                <h2 style={sectionTitle}>Shared files</h2>
                <p style={sectionCopy}>Preview supported files in the secure viewer or download when permission is enabled.</p>
              </div>
            </div>
            <div style={fileList}>
              {access.files.length === 0 ? (
                <div style={emptyState}>No files have been shared yet.</div>
              ) : access.files.map((file) => (
                <article key={file.id} style={fileCard}>
                  <div style={fileIcon(file)}>
                    <span>{fileExtension(file.file_name)}</span>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <h3 style={fileName}>{file.file_name}</h3>
                    <div style={fileMeta}>
                      <span>{fileKindLabel(file)}</span>
                      <span>Uploaded {formatDate(file.created_at)}</span>
                      {typeof file.size_bytes === "number" ? <span>{formatSize(file.size_bytes)}</span> : null}
                    </div>
                  </div>
                  <div style={fileActions}>
                    {file.preview_url ? (
                      <button style={secondaryButton} onClick={() => previewFile(file)}>
                        <Icon name="eye" size={14} />
                        Preview
                      </button>
                    ) : null}
                    {access.share.can_download ? (
                      <button style={primaryLinkButton} onClick={() => downloadSharedFile(file).catch(() => setStatus("Download is not available for this file."))} disabled={downloadingId === file.id}>
                        <Icon name="download" size={14} />
                        {downloadingId === file.id ? "Preparing..." : "Download"}
                      </button>
                    ) : (
                      <span style={downloadDisabled}>Download disabled</span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </main>
          {status ? <p style={statusStyle(status)}>{status}</p> : null}
        </section>
      )}
    </main>
  );
}

function BrandBlock({ compact = false }: { compact?: boolean }) {
  return (
    <div style={brandBlock}>
      <QCMark size={compact ? 34 : 44} />
      <div>
        <div style={brandEyebrow}>Qualified Commercial</div>
        <div style={brandName}>Secure File Room</div>
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

function statusStyle(value: string): CSSProperties {
  const isError = /invalid|unavailable|could not|disabled|expired/i.test(value);
  return { margin: "14px 0 0", color: isError ? "#b91c1c" : "#0f766e", fontWeight: 800 };
}

const page: CSSProperties = { minHeight: "100vh", background: "#f3f5f8", color: "#111827", padding: 24, fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" };
const gateShell: CSSProperties = { maxWidth: 760, margin: "6vh auto 0", display: "grid", gap: 18 };
const gateCard: CSSProperties = { background: "#fff", border: "1px solid #d8dee8", borderRadius: 12, padding: 28, boxShadow: "0 18px 45px rgba(15,23,42,.08)" };
const brandBlock: CSSProperties = { display: "flex", alignItems: "center", gap: 12 };
const brandEyebrow: CSSProperties = { color: "#64748b", fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0 };
const brandName: CSSProperties = { color: "#111827", fontSize: 16, fontWeight: 900, lineHeight: 1.2 };
const securePill: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 7, border: "1px solid #bfdbfe", borderRadius: 999, padding: "6px 10px", color: "#1e3a8a", background: "#eff6ff", fontSize: 12, fontWeight: 900 };
const gateTitle: CSSProperties = { margin: "16px 0 8px", fontSize: 34, lineHeight: 1.08, letterSpacing: 0 };
const gateCopy: CSSProperties = { margin: 0, color: "#475569", fontSize: 16, lineHeight: 1.5 };
const roomShell: CSSProperties = { maxWidth: 1320, margin: "0 auto", display: "grid", gap: 14 };
const roomHeader: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", background: "#fff", border: "1px solid #d8dee8", borderRadius: 12, padding: 18, boxShadow: "0 10px 28px rgba(15,23,42,.06)" };
const roomTitle: CSSProperties = { margin: "12px 0 4px", fontSize: 28, lineHeight: 1.12, letterSpacing: 0 };
const roomMeta: CSSProperties = { margin: 0, color: "#64748b", lineHeight: 1.45 };
const summaryCard: CSSProperties = { minWidth: 116, border: "1px solid #e2e8f0", borderRadius: 10, padding: 12, textAlign: "center", background: "#f8fafc" };
const summaryNumber: CSSProperties = { display: "block", color: "#111827", fontSize: 28, fontWeight: 950, lineHeight: 1 };
const summaryLabel: CSSProperties = { color: "#64748b", fontSize: 12, fontWeight: 850, textTransform: "uppercase" };
const securityBar: CSSProperties = { display: "flex", alignItems: "center", gap: 10, border: "1px solid #bfdbfe", borderRadius: 10, padding: "10px 12px", color: "#1e3a8a", background: "#eff6ff", fontSize: 13.5, fontWeight: 750 };
const filePanel: CSSProperties = { minWidth: 0, background: "#fff", border: "1px solid #d8dee8", borderRadius: 12, padding: 16, boxShadow: "0 10px 28px rgba(15,23,42,.05)" };
const sectionHeader: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 12 };
const sectionTitle: CSSProperties = { margin: 0, color: "#111827", fontSize: 17, fontWeight: 950 };
const sectionCopy: CSSProperties = { margin: "4px 0 0", color: "#64748b", fontSize: 13, lineHeight: 1.4 };
const fileList: CSSProperties = { display: "grid", gap: 10 };
const fileCard: CSSProperties = { display: "grid", gridTemplateColumns: "54px minmax(0, 1fr)", gap: 12, alignItems: "center", border: "1px solid #e2e8f0", borderRadius: 10, padding: 12, background: "#fff" };
const fileName: CSSProperties = { margin: 0, color: "#111827", fontSize: 16, fontWeight: 900, lineHeight: 1.25, overflowWrap: "anywhere" };
const fileMeta: CSSProperties = { display: "flex", flexWrap: "wrap", gap: "6px 10px", color: "#64748b", fontSize: 12.5, marginTop: 5 };
const fileActions: CSSProperties = { gridColumn: "1 / -1", display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-start", flexWrap: "wrap" };
const secondaryButton: CSSProperties = { height: 38, border: "1px solid #cbd5e1", borderRadius: 8, padding: "0 12px", font: "inherit", fontWeight: 900, background: "#fff", color: "#111827", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7 };
const primaryLinkButton: CSSProperties = { height: 38, border: "none", borderRadius: 9, padding: "0 14px", font: "inherit", fontWeight: 900, background: "#111827", color: "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7, textDecoration: "none" };
const downloadDisabled: CSSProperties = { color: "#64748b", fontSize: 12.5, fontWeight: 800 };
const emptyState: CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 10, padding: 13, color: "#64748b", background: "#f8fafc", fontSize: 13 };

function fileIcon(file: FileRow): CSSProperties {
  const type = reviewFileType(file.content_type, file.file_name);
  const colors: Record<string, { bg: string; color: string; border: string }> = {
    pdf: { bg: "#fef2f2", color: "#991b1b", border: "#fecaca" },
    image: { bg: "#eff6ff", color: "#1e3a8a", border: "#bfdbfe" },
    csv: { bg: "#f0fdf4", color: "#166534", border: "#bbf7d0" },
    text: { bg: "#f8fafc", color: "#334155", border: "#e2e8f0" },
    spreadsheet: { bg: "#ecfdf5", color: "#065f46", border: "#a7f3d0" },
    unsupported: { bg: "#f8fafc", color: "#334155", border: "#e2e8f0" },
  };
  const palette = colors[type];
  return { width: 54, height: 54, border: `1px solid ${palette.border}`, borderRadius: 10, background: palette.bg, color: palette.color, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 950 };
}
