"use client";

import { useEffect, type ReactNode } from "react";
import { useTheme } from "./ThemeProvider";
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
  const { t } = useTheme();

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
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(6, 7, 11, 0.32)",
        backdropFilter: "blur(2px)",
        zIndex: 200,
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width,
          height: "100%",
          background: t.surface,
          borderLeft: `1px solid ${t.line}`,
          boxShadow: t.shadowLg,
          display: "flex",
          flexDirection: "column",
          animation: "qc-rightpanel-in 180ms ease-out",
        }}
      >
        <style>{`
          @keyframes qc-rightpanel-in {
            from { transform: translateX(24px); opacity: 0; }
            to   { transform: translateX(0);    opacity: 1; }
          }
        `}</style>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 18px",
            borderBottom: `1px solid ${t.line}`,
            flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 0 }}>
            {eyebrow && (
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 1.6,
                  textTransform: "uppercase",
                  color: t.petrol,
                }}
              >
                {eyebrow}
              </div>
            )}
            <div
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: t.ink,
                marginTop: eyebrow ? 2 : 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {title}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              all: "unset",
              cursor: "pointer",
              width: 30,
              height: 30,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
              color: t.ink2,
              flexShrink: 0,
            }}
          >
            <Icon name="x" size={15} />
          </button>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: 18,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {children}
        </div>

        {footer && (
          <div
            style={{
              padding: "12px 18px",
              borderTop: `1px solid ${t.line}`,
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              flexShrink: 0,
              background: t.surface,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
