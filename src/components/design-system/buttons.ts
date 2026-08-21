// Shared button style helpers, re-pointed at the `.btn` geometry in globals.css.
//
// These are a bridge. Every one of their ~249 call sites still spreads them as
// `style={qcBtnPrimary(t)}`, and rewriting all of those at once is the kind of
// commit nobody can review. Instead the bodies now emit exactly what `.btn`
// renders, so an un-migrated button is visually indistinguishable from a
// migrated `<Btn variant="pri">` sitting beside it.
//
// Note what changed and why it is visible: primary used to be `t.ink` — near
// black. `.btn.pri` is brand blue. That is the design's call, not an accident,
// and it lands across every primary button in the app at once.
//
// Values are CSS custom properties rather than token lookups so there is one
// source of truth while both systems coexist. The `t` parameter is ignored and
// kept only so call sites need no edit.
//
// Deleted in Phase 4, once no route spreads them.

import type { CSSProperties } from "react";
import type { QCTokens } from "./tokens";

/** `.btn` */
export function qcBtn(_t?: QCTokens): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    borderRadius: 10,
    fontWeight: 650,
    fontSize: 12.5,
    padding: "8px 14px",
    cursor: "pointer",
    border: "1px solid var(--line)",
    background: "var(--surface)",
    color: "var(--ink2)",
    fontFamily: "inherit",
    lineHeight: 1,
    textDecoration: "none",
  };
}

/** `.btn.pri` */
export function qcBtnPrimary(_t?: QCTokens): CSSProperties {
  return {
    ...qcBtn(),
    background: "var(--accent)",
    borderColor: "var(--accent)",
    color: "#fff",
  };
}

/** Petrol variant — no class equivalent; kept for the surfaces that use it. */
export function qcBtnPetrol(_t?: QCTokens): CSSProperties {
  return {
    ...qcBtn(),
    background: "var(--petrol)",
    borderColor: "var(--petrol)",
    color: "#fff",
  };
}

/** `.linky` */
export function qcLinkBtn(_t?: QCTokens): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    background: "none",
    border: 0,
    color: "var(--accent)",
    fontSize: "inherit",
    fontWeight: 650,
    cursor: "pointer",
    fontFamily: "inherit",
    padding: 0,
  };
}

/**
 * Destructive action. Admin surfaces were faking this with
 * `{ ...qcBtnPrimary(t), background: t.danger }`; it stays a real primitive so
 * delete / revoke / request-deletion read consistently.
 */
export function qcBtnDanger(_t?: QCTokens): CSSProperties {
  return {
    ...qcBtn(),
    background: "var(--danger)",
    borderColor: "var(--danger)",
    color: "#fff",
  };
}
