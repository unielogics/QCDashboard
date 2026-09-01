"use client";

import type { CSSProperties, ReactNode } from "react";
import { Drawer, type DrawerWidth } from "@/components/ds/Drawer";
import { Icon } from "./Icon";

export type ModalSize = "md" | "lg" | "xl" | "full" | "stage";

const DRAWER_WIDTH: Record<ModalSize, DrawerWidth> = {
  md: "md",
  lg: "lg",
  xl: "xl",
  full: "xl",
  stage: "xl",
};

/**
 * Compatibility adapter for older call sites. All dialog chrome and behavior
 * now comes from the shared centered Drawer implementation.
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
  insetLeft?: number;
}) {
  const drawerTitle = icon ? <span className="row"><Icon name={icon} size={15} />{title}</span> : title;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={drawerTitle}
      headerActions={headerAccessory}
      footer={footer}
      width={DRAWER_WIDTH[size]}
      closeOnBackdrop={closeOnBackdrop}
      bodyStyle={bodyStyle}
    >
      {children}
    </Drawer>
  );
}
