"use client";

import { FileWorkspaceLink, useFileWorkspace } from "@/components/file/FileWorkspaceContext";
import { useEffect, useRef, useState } from "react";
import { Btn, Callout, Input } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useAuthedApi } from "@/hooks/useApi";
import { prepareUseOfFundsLink } from "@/lib/requirementUseOfFunds";
import styles from "./RequirementCollectionActions.module.css";

export function RequirementUseOfFundsActions({ profileId, canEdit, disabled = false, onFill }: {
  profileId: string; canEdit: boolean; disabled?: boolean; onFill: () => void;
}) {
  const fileWorkspace = useFileWorkspace();
  const api = useAuthedApi();
  const [sharing, setSharing] = useState(false);
  const [link, setLink] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const pending = useRef(false);
  const mounted = useRef(false);
  const generation = useRef(0);
  const activeProfile = useRef(profileId); activeProfile.current = profileId;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current += 1; pending.current = false; };
  }, [profileId]);

  async function share() {
    if (disabled || pending.current || !canEdit) return;
    pending.current = true; setSharing(true); setLink(""); setNotice(""); setError("");
    const requestedProfile = profileId;
    const requestGeneration = ++generation.current;
    const current = () => mounted.current && generation.current === requestGeneration && activeProfile.current === requestedProfile;
    try {
      const url = await prepareUseOfFundsLink(api, requestedProfile);
      if (!current()) return;
      setLink(url);
      try {
        await navigator.clipboard.writeText(url);
        if (current()) setNotice("Link copied.");
      } catch {
        if (current()) setNotice("Link ready. Clipboard access was blocked; select and copy the link below.");
      }
    } catch (reason) {
      if (current()) setError(reason instanceof Error ? reason.message : "The client link could not be prepared.");
    } finally {
      if (current()) { pending.current = false; setSharing(false); }
    }
  }

  if (!canEdit) return null;
  return <>
    {fileWorkspace ? <FileWorkspaceLink tool="use-of-funds" disabled={disabled || sharing}>Fill in use of proceeds</FileWorkspaceLink> : <Btn size="sm" disabled={disabled || sharing} onClick={onFill}><Icon name="pencil" size={14} />Fill in use of proceeds</Btn>}
    <Btn size="sm" disabled={disabled || sharing} onClick={() => void share()}><Icon name="link" size={14} />{sharing ? "Preparing link…" : "Share link"}</Btn>
    {link ? <div className={styles.link}>
      <label><span>Client use of proceeds link</span><Input aria-label="Client use of proceeds link" value={link} readOnly onFocus={(event) => event.target.select()} /></label>
      <p className={styles.note}>The client needs their existing room PIN. Share the PIN separately from this link. No email or SMS was sent.</p>
    </div> : null}
    {notice ? <p className={styles.note} role="status">{notice}</p> : null}
    {error ? <div className={styles.error}><Callout tone="bad"><span role="alert">{error}</span></Callout></div> : null}
  </>;
}
