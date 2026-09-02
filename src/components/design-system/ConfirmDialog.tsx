"use client";

import type { ReactNode } from "react";
import { Btn } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  busy = false,
  reversible = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  busy?: boolean;
  reversible?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="md"
      title="Review before running"
      sub={title}
      closeOnBackdrop={!busy}
      footer={
        <>
          <Btn style={{ minHeight: 44 }} onClick={onClose} disabled={busy}>{cancelLabel}</Btn>
          <span className="sp" />
          <Btn style={{ minHeight: 44 }} variant={tone === "danger" ? "default" : "pri"} className={tone === "danger" ? "danger" : undefined} onClick={onConfirm} disabled={busy}>
            {busy ? "Working..." : confirmLabel}
          </Btn>
        </>
      }
    >
      <div className="grid">
        {body ? <div className={tone === "danger" ? "warnline" : "hintbox"}>{body}</div> : null}
        <div className="kv"><span>Actor</span><b>Current signed-in user</b></div>
        <div className="kv"><span>Execution</span><b>Immediately after confirmation</b></div>
        <div className="kv"><span>Reversible</span><b>{reversible ? "Yes" : "No"}</b></div>
      </div>
    </Drawer>
  );
}
