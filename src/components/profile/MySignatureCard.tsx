"use client";

// "My signature" — the one signature on file a signed-in person adopts for
// use on their behalf on Qualified Commercial program agreements (the
// relationship manager on a Production Package, a dealer partner on their
// own paperwork). Backed by GET/POST/DELETE /me/signature; the consent text
// and version come from the backend so the page never carries wording of
// its own. Adopting again retires the previous signature; revoking never
// touches documents already sent.

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn, CellChip, Field, Input, Panel, WarnLine } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { ConfirmDialog } from "@/components/design-system/ConfirmDialog";
import { SignaturePad, type SignaturePadHandle } from "@/components/design-system/SignaturePad";
import { useAuthedApi } from "@/hooks/useApi";
import { ApiError } from "@/lib/api";

export type StoredSignature = {
  id: string;
  subject_type: string;
  subject_id: string | null;
  typed_name: string;
  title: string | null;
  source: string;
  adopted_at: string;
  adopted_by_user_id: string | null;
  consent_version: string | null;
  revoked_at: string | null;
  preview_url: string | null;
};

export type StoredSignatureState = {
  signature: StoredSignature | null;
  consent_text: string;
  consent_version: string;
};

const QUERY_KEY = ["me", "signature"] as const;

function errorText(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const detail = (error.body as { detail?: unknown } | null)?.detail;
    if (detail && typeof detail === "object" && typeof (detail as { message?: unknown }).message === "string") return (detail as { message: string }).message;
    if (typeof detail === "string" && detail.trim()) return detail;
    return error.message || fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

function formatDate(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function MySignatureCard({ defaultName }: { defaultName?: string | null }) {
  const apiCall = useAuthedApi();
  const queryClient = useQueryClient();
  const state = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => apiCall<StoredSignatureState>("/me/signature"),
    staleTime: 60 * 1000,
    retry: false,
  });
  const padRef = useRef<SignaturePadHandle | null>(null);
  const [editing, setEditing] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [title, setTitle] = useState("");
  const [consent, setConsent] = useState(false);
  const [inked, setInked] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);

  const current = state.data?.signature ?? null;

  useEffect(() => {
    if (!editing) return;
    setTypedName(current?.typed_name || defaultName || "");
    setTitle(current?.title || "");
    setConsent(false);
    setInked(false);
    setMessage(null);
    // The pad mounts with the editor; nothing to clear on the first open.
  }, [editing, current?.typed_name, current?.title, defaultName]);

  const adopt = useMutation({
    mutationFn: async () => {
      const dataUrl = padRef.current?.getDataUrl() || "";
      return apiCall<StoredSignatureState>("/me/signature", {
        method: "POST",
        body: JSON.stringify({ signature_data_url: dataUrl, typed_name: typedName.trim(), title: title.trim() || null, consent }),
      });
    },
    onSuccess: (next) => {
      queryClient.setQueryData(QUERY_KEY, next);
      setEditing(false);
      setMessage(current ? "Your signature was replaced. Agreements sent from now on carry the new one." : "Your signature is on file.");
    },
    onError: (error) => setMessage(errorText(error, "Your signature could not be adopted.")),
  });

  const revoke = useMutation({
    mutationFn: () => apiCall<StoredSignatureState>("/me/signature", { method: "DELETE" }),
    onSuccess: (next) => {
      queryClient.setQueryData(QUERY_KEY, next);
      setRevokeOpen(false);
      setMessage("Your signature on file was revoked. Agreements already sent are unchanged.");
    },
    onError: (error) => { setRevokeOpen(false); setMessage(errorText(error, "Your signature could not be revoked.")); },
  });

  const canAdopt = inked && typedName.trim().length > 0 && consent && !adopt.isPending;

  return (
    <Panel
      title="My signature"
      sub="Placed on your behalf on program agreements where you are named — the relationship manager on a Production Package, or an acknowledging party."
      actions={
        !editing ? (
          <Btn variant={current ? undefined : "pri"} onClick={() => setEditing(true)} disabled={state.isLoading}>
            <Icon name="pencil" size={13} /> {current ? "Replace" : "Adopt my signature"}
          </Btn>
        ) : null
      }
    >
      {state.isError ? <WarnLine>{errorText(state.error, "Your signature on file could not be loaded.")}</WarnLine> : null}
      {message ? <div className="sub" style={{ marginBottom: 10 }}>{message}</div> : null}

      {!editing ? (
        current ? (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 280px) 1fr", gap: 16, alignItems: "flex-start" }}>
            <div style={{ border: "1px dashed var(--line2)", borderRadius: 12, background: "#fff", padding: 12, minHeight: 96, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {current.preview_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={current.preview_url} alt={`Signature of ${current.typed_name}`} style={{ maxWidth: 240, maxHeight: 90 }} />
                : <span className="sub">Preview unavailable</span>}
            </div>
            <div className="grid" style={{ gap: 8 }}>
              <div className="row">
                <CellChip tone="ok"><Icon name="check" size={11} stroke={3} /> On file</CellChip>
                <span className="sub">Adopted {formatDate(current.adopted_at)}{current.consent_version ? ` · consent ${current.consent_version}` : ""}</span>
              </div>
              <div><strong>{current.typed_name}</strong>{current.title ? <span className="sub"> · {current.title}</span> : null}</div>
              <div className="sub">Each placement is recorded with this adoption date and consent version. Revoking stops future placements; agreements already sent are unchanged.</div>
              <div className="row">
                <Btn className="c-bad" onClick={() => setRevokeOpen(true)} disabled={revoke.isPending}>Revoke</Btn>
              </div>
            </div>
          </div>
        ) : (
          <div className="sub">
            {state.isLoading ? "Loading your signature on file…" : "No signature on file. Agreements that name you cannot be sent until you adopt one."}
          </div>
        )
      ) : (
        <div className="grid" style={{ gap: 12 }}>
          <div>
            <div className="lbl" style={{ marginBottom: 6 }}>Draw your signature</div>
            <SignaturePad ref={padRef} height={150} onSignatureChange={setInked} ariaLabel="Draw your signature" />
            <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
              <span className="sub">Sign with your finger, stylus or mouse.</span>
              <Btn onClick={() => { padRef.current?.clear(); setInked(false); }}>Clear</Btn>
            </div>
          </div>
          <div className="cg">
            <Field className="s6" label="Name as it should appear">
              <Input value={typedName} onChange={(e) => setTypedName(e.target.value)} placeholder={defaultName || "Full name"} autoComplete="name" />
            </Field>
            <Field className="s6" label="Title (optional)">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Relationship Manager" />
            </Field>
          </div>
          <label className="row" style={{ alignItems: "flex-start", gap: 8, fontSize: 12.5, cursor: "pointer" }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 3 }} />
            <span>{state.data?.consent_text || "Loading the adoption consent…"}</span>
          </label>
          <div className="row">
            <Btn variant="pri" onClick={() => adopt.mutate()} disabled={!canAdopt || !state.data}>{adopt.isPending ? "Adopting…" : current ? "Replace my signature" : "Adopt my signature"}</Btn>
            <Btn onClick={() => setEditing(false)} disabled={adopt.isPending}>Cancel</Btn>
            {state.data?.consent_version ? <span className="sub">Consent version {state.data.consent_version}</span> : null}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={revokeOpen}
        tone="danger"
        busy={revoke.isPending}
        title="Revoke your signature on file?"
        body="Agreements that name you can no longer be sent until you adopt a new signature. Documents already sent keep the signature placed on them."
        confirmLabel="Revoke"
        cancelLabel="Keep it"
        onConfirm={() => revoke.mutate()}
        onClose={() => setRevokeOpen(false)}
      />
    </Panel>
  );
}
