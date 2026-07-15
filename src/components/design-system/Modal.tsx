"use client";

import { useEffect, type CSSProperties, type ReactNode } from "react";
import { Icon } from "./Icon";
import { ModalCloseButton } from "./ModalCloseButton";
import { useTheme } from "./ThemeProvider";

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
 * click-outside and Escape to close. All colors come from useTheme() tokens so
 * it holds in light and dark. zIndex 300 sits above RightPanel/AIChatPanel (200)
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
  const { t } = useTheme();
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
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        // Leave the sidebar/menu uncovered and clickable.
        left: insetLeft,
        zIndex: 300,
        background: "rgba(0,0,0,0.42)",
        display: "flex",
        alignItems: isStage ? "stretch" : "center",
        justifyContent: isStage ? "stretch" : "center",
        padding: isStage ? 16 : 24,
      }}
      onClick={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: WIDTHS[size],
          maxHeight: isStage ? "100%" : "90vh",
          height: isStage ? "100%" : undefined,
          background: t.surface,
          borderRadius: 16,
          border: `1px solid ${t.line}`,
          boxShadow: "0 28px 64px rgba(0,0,0,0.32)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {(title || icon || headerAccessory) && (
          <header
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "14px 18px",
              borderBottom: `1px solid ${t.line}`,
              flexShrink: 0,
            }}
          >
            {icon ? <Icon name={icon} size={15} /> : null}
            {title ? (
              <span style={{ fontSize: 15, fontWeight: 900, color: t.ink }}>{title}</span>
            ) : null}
            <div style={{ flex: 1 }} />
            {headerAccessory}
            <ModalCloseButton onClick={onClose} />
          </header>
        )}
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", ...bodyStyle }}>{children}</div>
        {footer ? (
          <footer
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 8,
              padding: "12px 18px",
              borderTop: `1px solid ${t.line}`,
              flexShrink: 0,
            }}
          >
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
