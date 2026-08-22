"use client";

import { useEffect, type CSSProperties, type ReactNode } from "react";
import { cx } from "@/components/ds";
import { Icon } from "./Icon";
import { ModalCloseButton } from "./ModalCloseButton";

export type ModalSize = "md" | "lg" | "xl" | "full" | "stage";

const WIDTHS: Record<ModalSize, string> = {
  md: "min(620px, 96vw)",
  lg: "min(920px, 96vw)",
  xl: "min(1180px, 96vw)",
  full: "min(1440px, 97vw)",
  stage: "100%",
};

/**
 * Themed, centered, full-canvas dialog. Fixed overlay + backdrop with
 * click-outside and Escape to close. Chrome comes from `.mscrim` / `.panel` in
 * the design-system sheet. zIndex 300 sits above RightPanel/AIChatPanel (200)
 * and below BucketFileReviewPanel (500).
 */
export function Modal({
  open,
  onClose,
  title,
  icon,
  headerAccessory,
  footer,
  size = "lg",
  children,
  bodyStyle,
  closeOnBackdrop = true,
  insetLeft = 0,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  icon?: string;
  headerAccessory?: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  children: ReactNode;
  bodyStyle?: CSSProperties;
  closeOnBackdrop?: boolean;
  /**
   * Left offset (px) so the overlay clears a fixed sidebar/menu and the menu
   * stays visible + clickable. Used with size="stage" for a full-screen modal
   * that occupies only the content area beside the app sidebar.
   */
  insetLeft?: number;
}) {
  const isStage = size === "stage";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className={cx("mscrim", isStage && "stage")}
      // `insetLeft` is a caller-supplied offset that keeps a fixed sidebar
      // uncovered and clickable, so it is data and stays inline. `.mscrim`
      // deliberately sets `right/top/bottom` only and never `left`, so there
      // is still exactly one owner of each edge.
      style={{ left: insetLeft }}
      onClick={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="panel mpanel"
        // Width comes from the `size` map; the stage variant fills its scrim.
        style={{
          width: WIDTHS[size],
          maxHeight: isStage ? "100%" : "90vh",
          height: isStage ? "100%" : undefined,
        }}
      >
        {(title || icon || headerAccessory) && (
          <header className="panel-h">
            {icon ? <Icon name={icon} size={15} /> : null}
            {title ? <span className="mtitle">{title}</span> : null}
            <span className="sp" />
            {headerAccessory}
            <ModalCloseButton onClick={onClose} />
          </header>
        )}
        {/* `bodyStyle` is a caller escape hatch and is spread last on purpose. */}
        <div className="mbody" style={bodyStyle}>{children}</div>
        {footer ? <footer className="drawer-f mfoot">{footer}</footer> : null}
      </div>
    </div>
  );
}
