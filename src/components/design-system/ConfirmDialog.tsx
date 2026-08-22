"use client";

import { Modal } from "./Modal";
import { cx } from "@/components/ds";

/**
 * Themed replacement for window.confirm. Native confirm dialogs break the
 * banking surface — they're OS-chrome, unthemeable, and jarring. This renders
 * the same yes/no decision inside the design-system Modal.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={title}
      icon={tone === "danger" ? "alert" : undefined}
      footer={
        <>
          {/* `.drawer-f` (Modal's footer) already lays these out. The style
              helpers in ./buttons.ts are superseded here by `.btn`,
              `.btn.pri` and `.btn.danger`; they stay in place for their
              other ~249 call sites. */}
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={cx("btn", tone === "danger" ? "danger" : "pri")}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </>
      }
    >
      {/* Modal's body is unpadded by design, so the prose brings its own.
          Deliberately NOT `.sub`: that is 12px caption grey, and a confirm
          prompt is the sentence the decision turns on. */}
      {body ? <p className="dlg-prose">{body}</p> : null}
    </Modal>
  );
}
