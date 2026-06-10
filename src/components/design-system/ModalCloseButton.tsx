"use client";

import type { CSSProperties } from "react";
import { Icon } from "./Icon";
import { useTheme } from "./ThemeProvider";

export function ModalCloseButton({
  onClick,
  label = "Close",
  size = 30,
  style,
}: {
  onClick: () => void;
  label?: string;
  size?: number;
  style?: CSSProperties;
}) {
  const { t } = useTheme();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{
        all: "unset",
        cursor: "pointer",
        width: size,
        height: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 8,
        color: t.ink2,
        flexShrink: 0,
        ...style,
      }}
    >
      <Icon name="x" size={15} />
    </button>
  );
}
