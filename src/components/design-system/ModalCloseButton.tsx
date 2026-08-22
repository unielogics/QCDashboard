"use client";

import type { CSSProperties } from "react";
import { Icon } from "./Icon";

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
  // `.iconbtn` is exactly 30px, which is this component's default. A caller
  // that asks for another size is overriding the class on purpose, so the
  // override is applied only when it actually differs — otherwise the class
  // and the style object would both claim width/height.
  const sized: CSSProperties | undefined =
    size !== 30 ? { width: size, height: size, ...style } : style;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="btn sm iconbtn"
      style={sized}
    >
      <Icon name="x" size={15} />
    </button>
  );
}
