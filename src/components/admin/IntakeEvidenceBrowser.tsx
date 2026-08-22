"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/design-system/Icon";
import { Btn, CellChip, cx, IconBtn, Sub } from "@/components/ds";
import { useAuthedApi, useBucketIntakeLinkOptions, useBucketIntakeLinks } from "@/hooks/useApi";
import type { OperatorBucketFile } from "@/lib/unifiedOperator";
import type { BucketFileReview } from "@/components/buckets/BucketFileReviewPanel";

type IntakeFile = {
  id: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  status: string;
  created_at?: string;
  zip_entry_path?: string | null;
};

type EvidenceFile = IntakeFile & {
  bucketId: string;
  bucketName: string;
  relationship: "primary" | "supporting" | "source";
};

export function IntakeEvidenceBrowser({
  intakeId,
  primaryBucketId,
  primaryBucketName,
  files,
}: {
  intakeId: string;
  primaryBucketId: string;
  primaryBucketName: string;
  files: IntakeFile[];
}) {
  const apiCall = useAuthedApi();
  const links = useBucketIntakeLinks({ intakeId });
  const options = useBucketIntakeLinkOptions();
  const [linkedFiles, setLinkedFiles] = useState<EvidenceFile[]>([]);
  const [linkedLoading, setLinkedLoading] = useState(false);
  const [selectedKey, setSelectedKey] = useState("");
  const [review, setReview] = useState<BucketFileReview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const primaryRoomName = primaryBucketName || "Primary bucket";

  const primaryFiles = useMemo<EvidenceFile[]>(() => files.map((file) => ({
    ...file,
    file_name: file.zip_entry_path || file.file_name,
    bucketId: primaryBucketId,
    bucketName: primaryRoomName,
    relationship: "primary",
  })), [files, primaryBucketId, primaryRoomName]);

  useEffect(() => {
    const activeLinks = (links.data ?? []).filter((link) => link.bucket_id !== primaryBucketId && link.linked_file_ids.length > 0);
    if (!activeLinks.length) {
      setLinkedFiles([]);
      setLinkedLoading(false);
      return;
    }
    let cancelled = false;
    setLinkedLoading(true);
    Promise.all(activeLinks.map(async (link) => {
      const detail = await apiCall<{ files: OperatorBucketFile[] }>(`/buckets/admin/${link.bucket_id}`);
      const selected = new Set(link.linked_file_ids);
      const bucketName = options.data?.buckets.find((bucket) => bucket.id === link.bucket_id)?.label || "Linked bucket";
      return detail.files
        .filter((file) => file.status === "uploaded" && !file.deleted_at && selected.has(file.id))
        .map<EvidenceFile>((file) => ({ ...file, bucketId: link.bucket_id, bucketName, relationship: link.relationship }));
    }))
      .then((groups) => { if (!cancelled) setLinkedFiles(groups.flat()); })
      .catch(() => { if (!cancelled) setLinkedFiles([]); })
      .finally(() => { if (!cancelled) setLinkedLoading(false); });
    return () => { cancelled = true; };
  }, [apiCall, links.data, options.data?.buckets, primaryBucketId]);

  const allFiles = useMemo(() => [...primaryFiles, ...linkedFiles], [primaryFiles, linkedFiles]);
  const selected = allFiles.find((file) => evidenceKey(file) === selectedKey) ?? allFiles[0] ?? null;

  useEffect(() => {
    if (!selected) {
      setReview(null);
      return;
    }
    const key = evidenceKey(selected);
    if (selectedKey !== key) setSelectedKey(key);
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError("");
    setReview(null);
    apiCall<BucketFileReview>(`/buckets/admin/${selected.bucketId}/files/${selected.id}/review`)
      .then((data) => { if (!cancelled) setReview(data); })
      .catch((error) => { if (!cancelled) setPreviewError(error instanceof Error ? error.message : "Preview unavailable."); })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [apiCall, selected, selectedKey]);

  const selectedIndex = selected ? allFiles.findIndex((file) => evidenceKey(file) === evidenceKey(selected)) : -1;

  function move(offset: number) {
    if (!allFiles.length) return;
    const next = Math.max(0, Math.min(allFiles.length - 1, selectedIndex + offset));
    setSelectedKey(evidenceKey(allFiles[next]));
  }

  if (!allFiles.length && !linkedLoading) {
    return <div className="empty">No evidence files are available in the primary or linked buckets.</div>;
  }

  return (
    <div className="evidence-browser">
      <aside className="evidence-browser-nav">
        <div className="evidence-browser-nav-head">
          <div><b>Bucket evidence</b><Sub>{allFiles.length} files across {new Set(allFiles.map((file) => file.bucketId)).size} source rooms</Sub></div>
          {linkedLoading ? <span className="spinner" /> : null}
        </div>
        <div className="evidence-browser-files">
          {allFiles.map((file) => (
            <button
              type="button"
              key={evidenceKey(file)}
              className={cx("evidence-file-row", selected && evidenceKey(file) === evidenceKey(selected) && "on")}
              onClick={() => setSelectedKey(evidenceKey(file))}
            >
              <span className="evidence-file-icon"><Icon name="file" size={15} /></span>
              <span className="grow trunc"><b className="trunc">{file.file_name}</b><small className="trunc">{file.bucketName} · {formatSize(file.size_bytes)}</small></span>
              <CellChip tone={file.relationship === "primary" ? "acc" : "pet"}>{file.relationship}</CellChip>
            </button>
          ))}
        </div>
      </aside>
      <section className="evidence-browser-preview">
        <header className="evidence-browser-preview-head">
          <div className="grow trunc">
            <b className="trunc">{selected?.file_name || "Evidence preview"}</b>
            <Sub>{selected ? `${selected.bucketName} · ${selected.content_type} · ${formatSize(selected.size_bytes)}` : "Choose a file"}</Sub>
          </div>
          <div className="row">
            <IconBtn onClick={() => move(-1)} disabled={selectedIndex <= 0} aria-label="Previous file" title="Previous file"><Icon name="chevL" size={14} /></IconBtn>
            <span className="sub num">{selectedIndex + 1}/{allFiles.length}</span>
            <IconBtn onClick={() => move(1)} disabled={selectedIndex < 0 || selectedIndex >= allFiles.length - 1} aria-label="Next file" title="Next file"><Icon name="chevR" size={14} /></IconBtn>
            {review?.preview_url ? <a className="btn sm" href={review.preview_url} target="_blank" rel="noreferrer"><Icon name="external" size={13} />Open original</a> : null}
          </div>
        </header>
        <div className="evidence-preview-stage">
          {previewLoading ? <div className="empty"><span className="spinner solo" />Loading preview...</div> : null}
          {!previewLoading && previewError ? <div className="empty">{previewError}</div> : null}
          {!previewLoading && !previewError && review ? <EvidencePreview review={review} /> : null}
        </div>
      </section>
    </div>
  );
}

function EvidencePreview({ review }: { review: BucketFileReview }) {
  if (!review.preview_url) return <div className="empty">This file does not have an inline preview.</div>;
  const type = review.file.content_type.toLowerCase();
  if (type.startsWith("image/")) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={review.preview_url} alt={review.file.file_name} />;
  }
  if (type === "application/pdf" || type.startsWith("text/") || type.includes("csv")) {
    return <iframe src={review.preview_url} title={review.file.file_name} />;
  }
  return (
    <div className="empty">
      <Icon name="file" size={24} />
      <b>Preview is not available for this file type.</b>
      <Btn onClick={() => window.open(review.preview_url || "", "_blank", "noopener,noreferrer")}>Open original</Btn>
    </div>
  );
}

function evidenceKey(file: Pick<EvidenceFile, "bucketId" | "id">) {
  return `${file.bucketId}:${file.id}`;
}

function formatSize(value: number) {
  if (!value) return "0 B";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
