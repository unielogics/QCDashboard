"use client";

import { Modal } from "./Modal";
import { useTheme } from "./ThemeProvider";
import { qcBtn, qcBtnPrimary, qcBtnDanger } from "./buttons";

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
  const { t } = useTheme();
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={title}
      icon={tone === "danger" ? "alert" : undefined}
      footer={
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" style={qcBtn(t)} onClick={onClose} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            style={tone === "danger" ? qcBtnDanger(t) : qcBtnPrimary(t)}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      }
    >
      {body ? (
        <p style={{ margin: 0, color: t.ink2, fontSize: 13.5, lineHeight: 1.55, padding: 4 }}>{body}</p>
      ) : null}
    </Modal>
  );
}
