"use client";

// Passcode-gated bucket share — a token in a URL plus an access code, no login.
//
// Styling only: migrated off the module-level CSSProperties constants (and the
// ~40 hardcoded hex literals in them) onto the plain-CSS design system. This
// route is bare-layout — `.bareshell` in AppShell is the only chrome it gets —
// so it has to read as a finished product standing alone, which is exactly why
// it should not carry a second, private palette that drifts from the one every
// other screen uses. The file-type badge keeps its colour coding; the colours
// are now the sheet's tone tokens. Behaviour, endpoints, the passcode gate,
// Enter-to-submit, and both permission flags (can_download, can_add_notes) are
// unchanged.

import { useEffect, useState, type CSSProperties } from "react";
import { useParams } from "next/navigation";
import { Btn, Callout, Card, CellChip, Kpi, Panel, StatusLine, Textarea, type ChipTone } from "@/components/ds";
import { BucketFileReviewPanel, type BucketFileAnnotation, type BucketFileReview } from "@/components/buckets/BucketFileReviewPanel";
import { QCMark } from "@/components/QCMark";
import { Icon } from "@/components/design-system/Icon";
import { apiBase } from "@/lib/api";
import { openSignedUrl } from "@/lib/safeOpen";

type FileRow = { id: string; file_name: string; content_type: string; size_bytes?: number; created_at: string; preview_url?: string | null; download_url?: string | null };
type Note = { id: string; author_name: string; content: string; created_at: string };
type Access = {
  bucket: { name: string; client_name?: string | null; purpose?: string | null };
  share: { recipient_name: string; can_download: boolean; can_add_notes: boolean; can_propose_tasks?: boolean };
  files: FileRow[];
  notes: Note[];
};
type ShareInfo = {
  bucket: { name: string; client_name?: string | null; purpose?: string | null };
  recipient_name: string;
  recipient_email?: string | null;
  can_download: boolean;
  can_add_notes: boolean;
  can_propose_tasks?: boolean;
};

export default function BucketSharePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [passcode, setPasscode] = useState("");
  const [info, setInfo] = useState<ShareInfo | null>(null);
  const [access, setAccess] = useState<Access | null>(null);
  const [reviewFile, setReviewFile] = useState<FileRow | null>(null);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("Loading secure room...");
  const [working, setWorking] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiBase}/api/v1/buckets/share/${token}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Share link unavailable."))))
      .then((data) => {
        setInfo(data);
        setStatus("");
      })
      .catch((e: Error) => setStatus(e.message));
  }, [token]);

  async function openRoom() {
    if (!passcode.trim()) return;
    setWorking(true);
    setStatus("Checking access...");
    try {
      const res = await fetch(`${apiBase}/api/v1/buckets/share/${token}/access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: passcode.trim() }),
      });
      if (!res.ok) {
        setStatus("Invalid or inactive share link.");
        return;
      }
      setAccess(await res.json());
      setReviewFile(null);
      setStatus("");
    } finally {
      setWorking(false);
    }
  }

  async function addNote() {
    if (!note.trim()) return;
    setWorking(true);
    const res = await fetch(`${apiBase}/api/v1/buckets/share/${token}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode: passcode.trim(), content: note.trim() }),
    });
    if (!res.ok) {
      setStatus("Could not add note.");
      setWorking(false);
      return;
    }
    setNote("");
    await openRoom();
  }

  async function loadSharedReview(file: FileRow): Promise<BucketFileReview> {
    const res = await fetch(`${apiBase}/api/v1/buckets/share/${token}/files/${file.id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode: passcode.trim() }),
    });
    if (!res.ok) throw new Error("Could not open file review.");
    return res.json();
  }

  async function saveSharedAnnotation(file: FileRow, payload: { page_number: number; x: number; y: number; width: number; height: number; comment: string }): Promise<BucketFileAnnotation> {
    const res = await fetch(`${apiBase}/api/v1/buckets/share/${token}/files/${file.id}/annotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, passcode: passcode.trim() }),
    });
    if (!res.ok) throw new Error("Could not save review comment.");
    return res.json();
  }

  async function downloadSharedFile(file: FileRow) {
    if (!access?.share.can_download) return;
    setDownloadingId(file.id);
    setStatus("");
    try {
      const res = await fetch(`${apiBase}/api/v1/buckets/share/${token}/files/${file.id}/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: passcode.trim() }),
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

  const roomName = access?.bucket.name ?? info?.bucket.name ?? "Secure file room";
  const recipient = access?.share.recipient_name ?? info?.recipient_name;

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
            {/* Hero display type: while the room is locked this heading IS the
                page, and `.hd h1` is a console page title. */}
            <h1 style={{ margin: "16px 0 8px", fontSize: 34, lineHeight: 1.08 }}>
              Qualified Commercial Secure File Room
            </h1>
            <p style={{ margin: 0, color: "var(--muted)", fontSize: 16, lineHeight: 1.5 }}>
              {info ? (
                <>
                  Hi <strong>{info.recipient_name}</strong>, you have been invited to review files for <strong>{info.bucket.name}</strong>.
                </>
              ) : (
                "Opening your secure file room."
              )}
            </p>
            <Callout tone="pet" className="mt" icon={<Icon name="shield" size={16} />}>
              Access is gated by a private code and authorized user controls.
            </Callout>
            {/* Bespoke: the code field is deliberately larger than a console
                `.field` — it is the only control on the page and it is typed
                from a phone. */}
            <div className="grid g10" style={{ maxWidth: 440, marginTop: 20 }}>
              <label className="lbl" htmlFor="share-passcode">Access code</label>
              <input
                id="share-passcode"
                className="field"
                style={{ height: 50, fontSize: 17 }}
                placeholder="Enter access code"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") openRoom().catch(() => undefined);
                }}
                autoComplete="one-time-code"
              />
              <Btn
                variant="pri"
                onClick={() => openRoom().catch(() => undefined)}
                disabled={working || !passcode.trim()}
                style={{ justifyContent: "center", height: 44 }}
              >
                {working ? "Checking access..." : "Open file room"}
              </Btn>
            </div>
            {status ? (
              <StatusLine className="mt" tone={isErrorStatus(status) ? "bad" : "ok"}>{status}</StatusLine>
            ) : null}
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
                Access granted to <strong>{recipient}</strong>
                {access.bucket.client_name ? ` | ${access.bucket.client_name}` : ""}
                {access.bucket.purpose ? ` | ${access.bucket.purpose}` : ""}
              </p>
            </div>
            <Kpi label="Shared files" value={access.files.length} />
          </Card>

          <Callout tone="acc" icon={<Icon name="shield" size={16} />}>
            Uploads and shared documents are encrypted. Viewing is controlled through authorized access permissions.
          </Callout>

          {/* Bespoke: files beside notes on a laptop, stacked on a phone, each
              column allowed to shrink to zero. Not `.cg` — this page has no
              console around it and the split is a reading decision. */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))", gap: 14, alignItems: "start" }}>
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
                  // Bespoke track: a fixed 54px file badge beside a fluid
                  // title, with the actions dropping to a full-width row.
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
                        <Btn onClick={() => setReviewFile(file)}>
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

            {/* The notes rail rides along as you scroll the file list. */}
            <div style={{ position: "sticky", top: 16 }}>
              <Panel
                title="Shared notes"
                sub={access.share.can_add_notes ? "Add context or questions for the Qualified Commercial team." : "Notes are read-only for this share."}
              >
                {access.share.can_add_notes ? (
                  <div className="grid g8" style={{ marginBottom: 12 }}>
                    <Textarea
                      placeholder="Add a note"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      style={{ minHeight: 96, resize: "vertical" }}
                    />
                    <Btn
                      variant="pri"
                      onClick={() => addNote().catch(() => undefined)}
                      disabled={working || !note.trim()}
                      style={{ justifySelf: "end" }}
                    >
                      Add note
                    </Btn>
                  </div>
                ) : (
                  <div className="sub" style={{ marginBottom: 12 }}>Notes are disabled for this share.</div>
                )}
                <div className="grid g8">
                  {access.notes.length === 0 ? (
                    <div className="sub">No notes yet.</div>
                  ) : access.notes.map((item) => (
                    <div key={item.id} className="itemrow" style={{ display: "block" }}>
                      <div style={{ fontWeight: 700 }}>{item.author_name || "Qualified Commercial"}</div>
                      <div className="sub" style={{ marginTop: 2 }}>{formatDateTime(item.created_at)}</div>
                      {/* `.pretext` keeps the line breaks a person typed. */}
                      <p className="pretext" style={{ margin: "8px 0 0", color: "var(--ink2)" }}>{item.content}</p>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          </div>
          {status ? <StatusLine tone={isErrorStatus(status) ? "bad" : "ok"}>{status}</StatusLine> : null}
        </section>
      )}

      {reviewFile ? (
        <BucketFileReviewPanel
          title="Shared file review"
          onDownload={access?.share.can_download ? () => downloadSharedFile(reviewFile).catch(() => setStatus("Download is not available for this file.")) : undefined}
          loadReview={() => loadSharedReview(reviewFile)}
          saveAnnotation={(payload) => saveSharedAnnotation(reviewFile, payload)}
          onClose={() => setReviewFile(null)}
        />
      ) : null}
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/** Same wording test the page always used; only the styling moved to a class. */
function isErrorStatus(value: string): boolean {
  return /invalid|unavailable|could not|disabled/i.test(value);
}

/** File kind -> the sheet's tone vocabulary, so a PDF badge here is the same
    red a bad status is anywhere else in the product. */
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
