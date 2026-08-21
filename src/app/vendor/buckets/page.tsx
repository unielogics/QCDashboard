"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { BucketFileReviewPanel, type BucketFileAnnotation, type BucketFileReview } from "@/components/buckets/BucketFileReviewPanel";
import { Icon } from "@/components/design-system/Icon";
import { useCurrentUser } from "@/hooks/useApi";
import { api } from "@/lib/api";
import { Role } from "@/lib/enums.generated";
import { openSignedUrl } from "@/lib/safeOpen";
import {
  Btn,
  CG,
  CellChip,
  Note as InfoNote,
  PageHeader,
  Panel,
  Sub,
  Table,
  Tag,
  Td,
  Textarea,
  Tr,
  WarnLine,
  cx,
  type Col,
} from "@/components/ds";

type VendorBucket = {
  id: string;
  name: string;
  client_name?: string | null;
  purpose?: string | null;
  bucket_type?: string | null;
  uploaded_file_count?: number;
  vendor_access: VendorAccess;
};
type VendorAccess = {
  id: string;
  vendor_name?: string | null;
  vendor_email?: string | null;
  file_scope: "all_active" | "selected";
  can_download: boolean;
  can_add_notes: boolean;
  can_propose_tasks: boolean;
  view_count: number;
  download_count: number;
  status: string;
  expires_at?: string | null;
  files?: FileRow[];
};
type FileRow = { id: string; file_name: string; content_type: string; size_bytes?: number; created_at: string; preview_url?: string | null; download_url?: string | null };
type Note = { id: string; author_name: string; content: string; created_at: string };
type VendorRoom = {
  bucket: VendorBucket;
  vendor_access: VendorAccess;
  files: FileRow[];
  notes: Note[];
};

const FILE_COLS: Col[] = [
  { label: "File" },
  { label: "Type" },
  { label: "Added" },
  { label: "Size", align: "r" },
  { label: "Actions", align: "r" },
];

export default function VendorBucketsPage() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const [buckets, setBuckets] = useState<VendorBucket[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [room, setRoom] = useState<VendorRoom | null>(null);
  const [reviewFile, setReviewFile] = useState<FileRow | null>(null);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await getToken();
    return api<T>(path, { ...init, authToken: token ?? undefined });
  }

  async function loadBuckets() {
    const rows = await call<VendorBucket[]>("/buckets/vendor");
    setBuckets(rows);
    if (!selectedId && rows[0]) setSelectedId(rows[0].id);
  }

  async function loadRoom(bucketId: string) {
    setBusy(true);
    setStatus("");
    try {
      const payload = await call<VendorRoom>(`/buckets/vendor/${bucketId}`);
      setRoom(payload);
    } catch (error) {
      setStatus(readableError(error));
      setRoom(null);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!meLoading && me && me.role !== Role.VENDOR) router.replace("/");
  }, [meLoading, me, router]);

  useEffect(() => {
    if (me?.role === Role.VENDOR) loadBuckets().catch((error) => setStatus(readableError(error)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.role]);

  useEffect(() => {
    if (selectedId && me?.role === Role.VENDOR) loadRoom(selectedId).catch((error) => setStatus(readableError(error)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, me?.role]);

  async function addNote() {
    if (!room || !note.trim()) return;
    setBusy(true);
    try {
      await call<Note>(`/buckets/vendor/${room.bucket.id}/notes`, {
        method: "POST",
        body: JSON.stringify({ content: note.trim(), visibility: "shared" }),
      });
      setNote("");
      await loadRoom(room.bucket.id);
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  async function loadReview(file: FileRow): Promise<BucketFileReview> {
    if (!room) throw new Error("Vendor room is not loaded.");
    return call<BucketFileReview>(`/buckets/vendor/${room.bucket.id}/files/${file.id}/review`);
  }

  async function saveAnnotation(file: FileRow, payload: { page_number: number; x: number; y: number; width: number; height: number; comment: string }): Promise<BucketFileAnnotation> {
    if (!room) throw new Error("Vendor room is not loaded.");
    return call<BucketFileAnnotation>(`/buckets/vendor/${room.bucket.id}/files/${file.id}/annotations`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async function downloadFile(file: FileRow) {
    if (!room?.vendor_access.can_download) return;
    setDownloadingId(file.id);
    try {
      const payload = await call<{ url: string }>(`/buckets/vendor/${room.bucket.id}/files/${file.id}/download`, { method: "POST" });
      if (!openSignedUrl(payload.url)) setStatus("Download is not available for this file.");
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setDownloadingId(null);
    }
  }

  const selectedBucket = useMemo(() => buckets.find((bucket) => bucket.id === selectedId), [buckets, selectedId]);

  if (meLoading) return <div className="sub">Loading vendor buckets...</div>;
  if (me && me.role !== Role.VENDOR) return null;

  return (
    <>
      <PageHeader
        title="Assigned Buckets"
        lede="Vendor File Rooms"
        actions={<Tag>{buckets.length} assigned</Tag>}
      />

      <CG className="mt">
        <Panel className="s3" title="My buckets">
          {buckets.length === 0 ? (
            <div className="sub">No buckets are assigned to your vendor account yet.</div>
          ) : (
            buckets.map((bucket) => (
              <button
                key={bucket.id}
                type="button"
                className={cx("pick", bucket.id === selectedId && "on")}
                onClick={() => setSelectedId(bucket.id)}
              >
                {/* Bespoke: two stacked lines that each truncate. `.pick` is a
                    centred row, so the stack lives in its own child. */}
                <span style={{ display: "grid", gap: 2, minWidth: 0, flex: 1, textAlign: "left" }}>
                  <b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bucket.name}</b>
                  <span className="sub" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {bucket.client_name || "No client"} | {bucket.uploaded_file_count ?? 0} files
                  </span>
                </span>
              </button>
            ))
          )}
        </Panel>

        <div className="s9 grid">
          {!room ? (
            <Panel>
              <div className="sub">{busy ? "Opening secure room..." : selectedBucket ? "Select a bucket to open its room." : "No bucket selected."}</div>
            </Panel>
          ) : (
            <Panel
              title={room.bucket.name}
              sub={[room.bucket.client_name, room.bucket.purpose, room.vendor_access.file_scope === "all_active" ? "All active files" : "Selected files"].filter(Boolean).join(" | ")}
              actions={
                <>
                  <Tag>Secure vendor access</Tag>
                  <CellChip tone={room.vendor_access.status === "active" ? "ok" : "bad"}>{room.vendor_access.status}</CellChip>
                </>
              }
            >
              <InfoNote>
                <Icon name="shield" size={18} />
                <div>
                  Files are encrypted and access is controlled by <b>Qualified Commercial</b> permissions.
                </div>
              </InfoNote>
            </Panel>
          )}

          {room ? (
            <CG>
              <Panel className="s8" title="Files" actions={<Sub>{room.files.length} files</Sub>} noPad>
                <Table cols={FILE_COLS} caption="Files shared with this vendor">
                  {room.files.length === 0 ? (
                    <Tr>
                      <Td colSpan={5}>
                        <span className="sub">No files are visible for this bucket.</span>
                      </Td>
                    </Tr>
                  ) : (
                    room.files.map((file) => (
                      <Tr key={file.id}>
                        <Td>
                          <b>{file.file_name}</b>
                          <div className="sub">{fileKindLabel(file)}</div>
                        </Td>
                        <Td>
                          <CellChip tone="pet">{fileExtension(file.file_name)}</CellChip>
                        </Td>
                        <Td>{formatDate(file.created_at)}</Td>
                        <Td align="r">{typeof file.size_bytes === "number" ? formatSize(file.size_bytes) : "Unknown size"}</Td>
                        <Td align="r">
                          <div className="row" style={{ justifyContent: "flex-end" }}>
                            {file.preview_url ? (
                              <Btn size="sm" onClick={() => setReviewFile(file)}>
                                <Icon name="eye" size={13} />
                                Preview
                              </Btn>
                            ) : null}
                            {room.vendor_access.can_download ? (
                              <Btn size="sm" variant="pri" onClick={() => downloadFile(file)} disabled={downloadingId === file.id}>
                                <Icon name="download" size={13} />
                                {downloadingId === file.id ? "Preparing..." : "Download"}
                              </Btn>
                            ) : (
                              <span className="sub">Download disabled</span>
                            )}
                          </div>
                        </Td>
                      </Tr>
                    ))
                  )}
                </Table>
              </Panel>

              <Panel className="s4" title="Notes">
                <div className="thr">
                  {room.notes.length === 0 ? (
                    <div className="thr-empty">No notes yet.</div>
                  ) : (
                    room.notes.map((item) => (
                      <div key={item.id} className="msg">
                        <div className="msg-h">
                          <span className="msg-who">{item.author_name || "Qualified Commercial"}</span>
                          <span className="msg-when">{formatDateTime(item.created_at)}</span>
                        </div>
                        <div className="msg-b">{item.content}</div>
                      </div>
                    ))
                  )}
                </div>
                {room.vendor_access.can_add_notes ? (
                  <div className="composer">
                    <Textarea
                      placeholder="Add a note for Qualified Commercial"
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                    />
                    <div className="composer-row">
                      <Btn variant="pri" onClick={addNote} disabled={busy || !note.trim()}>
                        Add note
                      </Btn>
                    </div>
                  </div>
                ) : (
                  <WarnLine className="mt">Notes are disabled for this vendor access.</WarnLine>
                )}
              </Panel>
            </CG>
          ) : null}
        </div>
      </CG>

      {status ? (
        /error|failed|disabled|not/i.test(status) ? (
          <WarnLine className="mt">{status}</WarnLine>
        ) : (
          <InfoNote>{status}</InfoNote>
        )
      ) : null}

      {reviewFile ? (
        <BucketFileReviewPanel
          title="Vendor file review"
          onDownload={room?.vendor_access.can_download ? () => downloadFile(reviewFile) : undefined}
          loadReview={() => loadReview(reviewFile)}
          saveAnnotation={(payload) => saveAnnotation(reviewFile, payload)}
          onClose={() => setReviewFile(null)}
        />
      ) : null}
    </>
  );
}

function readableError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Request failed.";
}

function fileExtension(fileName: string): string {
  const ext = fileName.split(".").pop()?.slice(0, 4).toUpperCase();
  return ext && ext !== fileName.toUpperCase() ? ext : "FILE";
}

function fileKindLabel(file: FileRow): string {
  const lower = `${file.content_type} ${file.file_name}`.toLowerCase();
  if (lower.includes("pdf")) return "PDF";
  if (lower.includes("image") || /\.(png|jpe?g|webp|gif)$/i.test(file.file_name)) return "Image";
  if (lower.includes("csv") || file.file_name.toLowerCase().endsWith(".csv")) return "CSV";
  if (/\.(xlsx?|xlsm)$/i.test(file.file_name)) return "Spreadsheet";
  return "File";
}

function formatDate(value?: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

function formatDateTime(value?: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
