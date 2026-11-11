"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Btn } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useAuthedApi } from "@/hooks/useApi";
import { apiBase } from "@/lib/api";
import { useConsoleAuth, visualQaUser } from "@/lib/consoleAuth";
import { useActiveProfile } from "@/store/role";
import type { ApplicationClientTerms } from "@/lib/applicationProfile";
import type { TermSheetState } from "@/production-package/types";
import { readSavedTermsPdf, SavedTermsPdfError, type SavedTermsKind } from "@/lib/savedTermsDownload";

type Props = { profileId: string; kind: SavedTermsKind; version?: number | null; disabled?: boolean; onDealerTermsRefreshed?: (state: TermSheetState) => void };

export function SavedTermsDownload(props: Props) {
  return <SavedTermsDownloadAction key={`${props.profileId}:${props.kind}`} {...props} />;
}

function SavedTermsDownloadAction({ profileId, kind, version = 0, disabled, onDealerTermsRefreshed }: Props) {
  const api = useAuthedApi();
  const queryClient = useQueryClient();
  const { getToken, isLoaded, isSignedIn } = useConsoleAuth();
  const devUser = visualQaUser(useActiveProfile().email);
  const [refreshed, setRefreshed] = useState<{ base: number | null; version: number } | null>(null);
  const savedVersion = refreshed?.base === version ? refreshed.version : version ?? 0;
  const currentVersion = useRef(savedVersion); currentVersion.current = savedVersion;
  const pending = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => () => { pending.current?.abort(); pending.current = null; }, []);

  async function download() {
    if (disabled || !savedVersion || pending.current) return;
    const controller = new AbortController();
    pending.current = controller; setBusy(true); setError(""); setNotice("");
    try {
      if (!isLoaded) throw new Error("Your session is still loading. Try downloading again in a moment.");
      const token = isSignedIn ? await getToken() : null;
      if (controller.signal.aborted) return;
      const result = await readSavedTermsPdf({ base: apiBase, profileId, kind, version: savedVersion, token, devUser, signal: controller.signal });
      if (controller.signal.aborted) return;
      if (currentVersion.current !== savedVersion) throw new SavedTermsPdfError(409, "The saved terms version changed during download.");
      const url = URL.createObjectURL(result.blob);
      try {
        const anchor = document.createElement("a");
        anchor.href = url; anchor.download = result.filename;
        document.body.appendChild(anchor); anchor.click(); anchor.remove();
        setNotice(`${result.filename} downloaded.`);
      } finally { window.setTimeout(() => URL.revokeObjectURL(url), 0); }
    } catch (reason) {
      if (controller.signal.aborted) return;
      if (reason instanceof SavedTermsPdfError && reason.status === 409) {
        try {
          let latestVersion: number;
          if (kind === "application_term_sheet") {
            const latest = await api<ApplicationClientTerms>(`/application-profiles/${encodeURIComponent(profileId)}/client-terms`, { signal: controller.signal });
            if (controller.signal.aborted) return;
            latestVersion = latest.version;
            queryClient.setQueryData(["application-client-terms", profileId], latest);
          } else {
            const latest = await api<TermSheetState>(`/production-packages/term-sheets/${encodeURIComponent(profileId)}`, { signal: controller.signal });
            if (controller.signal.aborted) return;
            latestVersion = latest.current?.version ?? 0;
            onDealerTermsRefreshed?.(latest);
          }
          setRefreshed({ base: version, version: latestVersion });
          setError(latestVersion ? `Saved terms changed. Latest saved terms v${latestVersion} are ready; download again. Your unsaved changes are preserved.` : "No saved terms version is available to download. Your unsaved changes are preserved.");
        } catch { if (!controller.signal.aborted) setError("Saved terms changed, but the latest version could not be refreshed. Try downloading again. Your unsaved changes are preserved."); }
      } else setError(reason instanceof Error ? reason.message : "The saved terms PDF could not be downloaded. Try again.");
    } finally {
      if (pending.current === controller) { pending.current = null; setBusy(false); }
    }
  }

  return <div className="grid g4" aria-label="Saved terms download">
    <div><Btn size="sm" disabled={!savedVersion || disabled || busy} onClick={() => void download()}><Icon name="download" size={14} aria-hidden="true" />{busy ? "Downloading saved terms…" : `Download saved terms${savedVersion ? ` v${savedVersion}` : ""}`}</Btn></div>
    <small className="sub">{savedVersion ? `Uses saved terms v${savedVersion}; unsaved changes are not included.` : "Save a terms version before downloading."}</small>
    {error ? <p className="sub" role="alert">{error}</p> : null}
    {notice ? <p className="sub" role="status">{notice}</p> : null}
  </div>;
}
