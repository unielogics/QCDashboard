"use client";

import { useEffect, type ReactNode } from "react";
import { Icon } from "./Icon";

interface RightPanelProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  eyebrow?: ReactNode;
  /** Width as a CSS value. Defaults to a viewport-aware ~33% panel with sensible bounds. */
  width?: string;
  /** Sticky footer content (typically Cancel + primary action buttons). */
  footer?: ReactNode;
  /** Optional aria-label override for the dialog root. */
  ariaLabel?: string;
  children: ReactNode;
}

/**
 * Right-side slide-in panel taking ~1/3 of the viewport. Replaces centered modal
 * dialogs across the app per the UX standard. The main view stays partially
 * visible behind a translucent scrim — click outside or press Esc to dismiss.
 */
export function RightPanel({
  open,
  onClose,
  title,
  eyebrow,
  width = "min(520px, max(33vw, 420px))",
  footer,
  ariaLabel,
  children,
}: RightPanelProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? (typeof title === "string" ? title : "Panel")}
      onClick={onClose}
      className="sheet-scrim"
    >
      {/* The slide-in keyframes used to be a <style> tag nested in here, so a
          global at-rule was re-declared on every mount. It lives in
          app-extras.css now, alongside the spinner's for the same reason. */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="sheet"
        // Caller-supplied width — the only thing that varies between the seven
        // panels that render this.
        style={{ width }}
      >
        <div className="panel-h sheet-h">
          <div className="grow">
            {eyebrow && <div className="lbl sheet-eyebrow">{eyebrow}</div>}
            <div className="sheet-t trunc">{title}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="btn sm iconbtn">
            <Icon name="x" size={15} />
          </button>
        </div>

        <div className="sheet-b">{children}</div>

        {footer && <div className="drawer-f sheet-f">{footer}</div>}
      </div>
    </div>
  );
}
