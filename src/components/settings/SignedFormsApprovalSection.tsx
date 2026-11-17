"use client";

// Signing a form that ends in a signature (the real-estate loan application)
// stays closed in production until the consent wording is approved — Franco's
// decision is that Denny Matos, CEO, approves documents. This switch records
// who approved it and when; turning it off closes signing again.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn, Callout, CellChip, Field, Input, Sub } from "@/components/ds";
import { useAuthedApi } from "@/hooks/useApi";
import { useFormKinds } from "@/hooks/useFormKinds";

type Approval = { legal_approved: boolean; approved_by: string | null; approved_at: string | null; note: string | null; signing_open: boolean };

export function SignedFormsApprovalSection() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  const kinds = useFormKinds();
  const [note, setNote] = useState("");
  const approval = useQuery({ queryKey: ["signing-approval"], queryFn: () => apiCall<Approval>("/form-kinds/signing-approval") });
  const save = useMutation({
    mutationFn: (approved: boolean) => apiCall<Approval>("/form-kinds/signing-approval", { method: "PUT", body: JSON.stringify({ approved, note: note.trim() || null }) }),
    onSuccess: (data) => { qc.setQueryData(["signing-approval"], data); setNote(""); },
  });
  const data = approval.data;
  const drafts = (kinds.data?.consents ?? []).filter((consent) => consent.draft);
  return (
    <div className="grid g12">
      <div>
        <h3 style={{ margin: 0 }}>Signed forms</h3>
        <Sub>Clients sign the real estate loan application on its own page. In production, signing opens only after the consent wording below is approved.</Sub>
      </div>
      {data ? (
        <div className="row g8" style={{ flexWrap: "wrap" }}>
          <CellChip tone={data.legal_approved ? "ok" : "warn"}>{data.legal_approved ? "Wording approved" : "Waiting for approval"}</CellChip>
          {data.approved_by ? <Sub>{data.legal_approved ? "Approved" : "Closed"} by {data.approved_by}{data.approved_at ? ` on ${new Date(data.approved_at).toLocaleDateString()}` : ""}{data.note ? ` · ${data.note}` : ""}</Sub> : null}
          <Sub>{data.signing_open ? "Signing is open." : "Signing is closed."}</Sub>
        </div>
      ) : null}
      {drafts.length ? (
        <details>
          <summary>Wording to approve ({drafts.length})</summary>
          {drafts.map((consent) => <Callout key={consent.key} tone="acc"><strong>{consent.label}</strong> <Sub>version {consent.version}</Sub><p style={{ margin: "6px 0 0" }}>{consent.text}</p></Callout>)}
        </details>
      ) : null}
      <Field label="Note (optional)"><Input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="Approved by Denny Matos, CEO" /></Field>
      <div className="row g8">
        <Btn variant="pri" disabled={save.isPending || data?.legal_approved} onClick={() => save.mutate(true)}>Record approval and open signing</Btn>
        <Btn disabled={save.isPending || !data?.legal_approved} onClick={() => save.mutate(false)}>Close signing</Btn>
      </div>
      {save.error ? <Callout tone="bad">{save.error instanceof Error ? save.error.message : "The approval could not be saved."}</Callout> : null}
    </div>
  );
}
