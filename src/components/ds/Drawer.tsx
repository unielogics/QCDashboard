"use client";

// One dialog shape for the whole app.
//
// This supersedes both Modal and RightPanel. They were two different objects
// doing one job — a confirm, a form and a multi-step flow all read as different
// products depending on which one a screen happened to reach for. A single
// shape is the point, not a coincidence of the redesign.
//
// Behaviour carried over from Modal deliberately, because these are the parts
// people notice only when they are missing: Escape closes, a backdrop click
// closes unless suppressed, body scroll is locked while open, and focus moves
// into the dialog on open and returns to whatever opened it on close.

import { useCallback, useEffect, useId, useRef, type CSSProperties, type ReactNode } from "react";
import { cx } from "./index";

export type DrawerWidth = "md" | "lg" | "xl";

const WIDTHS: Record<DrawerWidth, string> = {
  md: "min(620px, 92vw)",
  lg: "min(1040px, 92vw)",
  xl: "min(1320px, 94vw)",
};

export function Drawer({
  open,
  onClose,
  title,
  sub,
  headerActions,
  footer,
  children,
  width = "lg",
  closeOnBackdrop = true,
  bodyClass,
  bodyStyle,
  ariaLabel,
  fullscreen = false,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  sub?: ReactNode;
  headerActions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  width?: DrawerWidth;
  closeOnBackdrop?: boolean;
  bodyClass?: string;
  bodyStyle?: CSSProperties;
  /**
   * Overrides the announced name of the dialog.
   *
   * Needed where the visible title is not the name of the thing. A stepped
   * flow retitles itself per step ("Borrower" → "Asset" → "Numbers"), so a
   * screen-reader user hears the step and never the dialog — they lose track
   * of what they opened. Pass the stable name here and let the title move.
   */
  ariaLabel?: string;
  fullscreen?: boolean;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    if (!open) return;

    // Remember what opened this so focus can go home. Without it, closing a
    // dialog dumps focus on <body> and a keyboard user restarts from the top
    // of the page.
    restoreTo.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      restoreTo.current?.focus?.();
    };
  }, [open, close]);

  if (!open) return null;

  return (
    <>
      <div
        className="drawer-scrim"
        onClick={closeOnBackdrop ? close : undefined}
        aria-hidden="true"
      />
      <div
        className={cx("drawer", fullscreen && "drawer--fullscreen")}
        style={fullscreen ? undefined : { width: WIDTHS[width] }}
        role="dialog"
        aria-modal="true"
        // Prefer pointing at the rendered heading: it stays correct when the
        // title is an element rather than a string, and it survives the title
        // changing. `ariaLabel` wins when the visible title is not the name.
        aria-labelledby={!ariaLabel && title ? titleId : undefined}
        aria-label={ariaLabel}
        ref={panelRef}
        tabIndex={-1}
      >
        <button type="button" className="drawer-x" onClick={close} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
        {(title || sub || headerActions) && (
          <div className="drawer-h">
            <div className="drawer-h-main">
              {title && <h2 id={titleId}>{title}</h2>}
              {sub && <p className="drawer-sub sub">{sub}</p>}
            </div>
            {headerActions ? <div className="pgacts drawer-h-actions">{headerActions}</div> : null}
          </div>
        )}
        <div className={cx("drawer-b", bodyClass)} style={bodyStyle}>{children}</div>
        {footer && <div className="drawer-f">{footer}</div>}
      </div>
    </>
  );
}

/**
 * Step indicator for a multi-step drawer flow.
 *
 * `current` is 1-based to match how the steps are labelled on screen — an
 * off-by-one here is the kind of thing that ships because it looks fine on
 * step 1.
 */
export function DrawerSteps({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return (
    <div className="row" style={{ gap: 16, marginBottom: 18 }}>
      {steps.map((s, i) => (
        <span key={s} className={cx("stepdot", i + 1 <= current && "on")}>
          <i>{i + 1}</i>
          {s}
        </span>
      ))}
    </div>
  );
}
