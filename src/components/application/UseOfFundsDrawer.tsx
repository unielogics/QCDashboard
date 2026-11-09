"use client";

import { useRef, useState } from "react";
import { Btn, Callout } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { UseOfFundsEditor } from "./UseOfFundsEditor";
import type { BudgetEditorControls } from "./UseOfFundsBudgetEditor";

export function UseOfFundsDrawer({ profileId, onClose, onSaved }: {
  profileId: string; onClose: () => void; onSaved: () => Promise<unknown> | void;
}) {
  const [controls, setControls] = useState<BudgetEditorControls | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const busy = submitting || Boolean(controls?.busy);

  function close() {
    if (submittingRef.current || controls?.busy) return;
    if (controls?.dirty) { setConfirmDiscard(true); return; }
    onClose();
  }
  async function save() {
    if (!controls?.canSave || submittingRef.current) return;
    submittingRef.current = true; setSubmitting(true); setConfirmDiscard(false);
    try { await controls.save(); }
    finally { submittingRef.current = false; setSubmitting(false); }
  }

  return <Drawer open onClose={close} closeOnBackdrop={!busy} title="Business use of proceeds" ariaLabel="Fill in use of proceeds" sub="Itemize the requested funds for this application." width="lg" footer={
    <div style={{ display: "grid", gap: 10, width: "100%" }}>
      {confirmDiscard ? <Callout tone="warn"><div role="alert">You have unsaved use of proceeds. Save them or discard the changes before closing.</div><div className="row" style={{ flexWrap: "wrap", marginTop: 8 }}><Btn disabled={busy} onClick={() => setConfirmDiscard(false)}>Keep editing</Btn><Btn disabled={busy} onClick={() => { if (submittingRef.current) return; controls?.discard(); onClose(); }}>Discard and close</Btn></div></Callout> : null}
      <div className="row" style={{ width: "100%", flexWrap: "wrap" }}>
        <Btn aria-label="Close budget" disabled={busy} onClick={close}>Close</Btn>
        <span className="sp" />
        {controls?.canEdit !== false ? <Btn variant="pri" disabled={!controls?.canSave || busy} onClick={() => void save()}>{submitting || controls?.saving ? "Saving…" : "Save budget"}</Btn> : null}
      </div>
    </div>
  }>
    <UseOfFundsEditor key={profileId} profileId={profileId} initiallyOpen showActions={false} onControlsChange={setControls} onSaved={onSaved} />
  </Drawer>;
}
