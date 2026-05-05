// Shared button style helpers — port of `window.QC_BTN` from the design prototypes.
// Use as inline-style spread: `style={qcBtnPrimary(t)}`.

import type { CSSProperties } from "react";
import type { QCTokens } from "./tokens";

export function qcBtn(t: QCTokens): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    padding: "9px 14px",
    borderRadius: 10,
    background: t.surface,
    color: t.ink2,
    border: `1px solid ${t.lineStrong}`,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  };
}

export function qcBtnPrimary(t: QCTokens): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    padding: "9px 14px",
    borderRadius: 10,
    background: t.ink,
    color: t.inverse,
    border: "none",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  };
}

export function qcBtnPetrol(t: QCTokens): CSSProperties {
  return {
    ...qcBtnPrimary(t),
    background: t.petrol,
    fontSize: 13,
    padding: "10px 18px",
  };
}

export function qcLinkBtn(t: QCTokens): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    background: "transparent",
    border: "none",
    color: t.petrol,
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
    padding: 0,
  };
}
