"use client";

import type { ReactNode } from "react";
import { Drawer } from "@/components/ds/Drawer";

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
 * Compatibility adapter for older slide-out call sites. The prototype uses a
 * single centered dialog shape, so legacy panels inherit Drawer behavior.
 */
export function RightPanel({
  open,
  onClose,
  title,
  eyebrow,
  width: _width,
  footer,
  ariaLabel,
  children,
}: RightPanelProps) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="md"
      title={title}
      sub={eyebrow}
      footer={footer}
      ariaLabel={ariaLabel}
    >
      {children}
    </Drawer>
  );
}
