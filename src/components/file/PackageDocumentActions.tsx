"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { Btn } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { api } from "@/lib/api";
import { useConsoleAuth } from "@/lib/consoleAuth";
import { fileAuthScope } from "@/lib/fileOpening";
import { checkedPackageArtifactUrl, packageArtifactPath, type PackageArtifactLink } from "@/lib/packageArtifacts";
import { useDocumentWindow } from "@/hooks/useDocumentWindow";
import type { BucketFileReview } from "@/components/buckets/BucketFileReviewPanel";
import type { Artifact } from "./leadFile";

const PdfReader = dynamic(() => import("@/components/buckets/BucketFileReviewPanel").then(module => module.BucketFileReviewPanel), { ssr: false });

export function PackageDocumentActions({ artifact, label, previewRequest }: { artifact: Artifact; label: string; previewRequest?: { key: number; artifactId: string } | null }) {
  const auth = useConsoleAuth(), scope = `${fileAuthScope(auth)}:${artifact.intake_id}`;
  const { getToken } = auth;
  const active = useRef(scope); active.current = scope;
  const [selected, setSelected] = useState<Artifact | null>(null);
  const selectionScope = useRef(scope);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const request = useRef<AbortController | null>(null);
  const downloadRequest = useRef<AbortController | null>(null);
  const external = useDocumentWindow(scope);
  useEffect(() => { setSelected(null); setError(""); setDownloading(false); return () => { request.current?.abort(); downloadRequest.current?.abort(); }; }, [scope]);
  const handledRequest = useRef<number | null>(null);
  useEffect(() => {
    if (!previewRequest || previewRequest.artifactId !== artifact.id || handledRequest.current === previewRequest.key) return;
    handledRequest.current = previewRequest.key; selectionScope.current = scope; setError(""); setSelected({ ...artifact }); setAttempt(value => value + 1);
  }, [previewRequest, artifact, scope]);
  const readUrl = useCallback(async (row: Artifact, download: boolean, signal?: AbortSignal) => {
    const token = await getToken();
    if (active.current !== scope || signal?.aborted) throw new Error("The active file changed. Reopen its PDF.");
    const response = await api<PackageArtifactLink>(packageArtifactPath(row.intake_id, row.id, download), { authToken: token ?? undefined, signal });
    if (active.current !== scope || signal?.aborted) throw new Error("The active file changed. Reopen its PDF.");
    return checkedPackageArtifactUrl(response, row, window.location.origin);
  }, [getToken, scope]);
  const loadReview = useCallback(async (): Promise<BucketFileReview> => {
    if (!selected) throw new Error("Choose a saved package PDF.");
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    const url = await readUrl(selected, false, controller.signal);
    return { file: { id: selected.id, file_name: `${label} · v${selected.version ?? 1}.pdf`, content_type: "application/pdf" }, preview_url: url, annotations: [] };
  }, [label, readUrl, selected]);
  const close = () => { request.current?.abort(); setSelected(null); setError(""); };
  const download = async (row: Artifact) => {
    if (downloadRequest.current) return;
    setDownloading(true); setError("");
    const controller = new AbortController(); downloadRequest.current = controller;
    try {
      const url = await readUrl(row, true, controller.signal);
      const link = document.createElement("a"); link.href = url; link.download = `${label}-v${row.version ?? 1}.pdf`; link.rel = "noreferrer";
      document.body.appendChild(link); link.click(); link.remove();
    } catch (reason) { if (active.current === scope && !controller.signal.aborted) setError(reason instanceof Error ? reason.message : "The PDF could not be downloaded. Try again."); }
    finally { if (downloadRequest.current === controller) { downloadRequest.current = null; if (active.current === scope) setDownloading(false); } }
  };
  const openExternal = () => {
    if (!selected) return;
    setError("");
    void external.open(signal => readUrl(selected, false, signal)).catch(reason => setError(reason instanceof Error ? reason.message : "The PDF could not be opened."));
  };
  return <>
    <Btn size="sm" disabled={!auth.isLoaded || !auth.isSignedIn} onClick={() => { selectionScope.current = scope; setError(""); setSelected({ ...artifact }); setAttempt(value => value + 1); }} aria-label={`Preview ${label} version ${artifact.version ?? 1}`}><Icon name="eye" size={13} />Preview</Btn>
    <Btn size="sm" disabled={downloading || !auth.isLoaded || !auth.isSignedIn} onClick={() => void download(artifact)} aria-label={`Download ${label} version ${artifact.version ?? 1}`}><Icon name="download" size={13} />{downloading ? "Preparing…" : "Download"}</Btn>
    {error && !selected ? <span role="alert">{error}</span> : null}
    {selected && selectionScope.current === scope ? <PdfReader title="Package PDF preview" reviewKey={`${scope}:${selected.id}:${attempt}`} loadReview={loadReview} onClose={close} annotationsEnabled={false} onDownload={() => void download(selected)} onOpenOriginal={openExternal}
      headerActions={<Btn size="sm" onClick={() => { setError(""); setAttempt(value => value + 1); }}>Retry preview</Btn>}
      reviewContext={<div className="sub" style={{ padding: "8px 16px" }}>Saved v{selected.version ?? 1} · {selected.id === artifact.id ? "This saved PDF is kept unchanged." : "A newer saved PDF is available. Close this preview to open it."}{error ? <span role="alert"> {error}</span> : null}</div>} /> : null}
  </>;
}
