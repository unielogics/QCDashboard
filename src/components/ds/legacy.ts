// Bridges for code that has not migrated yet.
//
// Everything in this file exists to be deleted. It lets a route keep compiling
// and keep looking right while it still uses inline styles, so the migration
// can proceed one route at a time instead of as a single 220-file commit.
//
// Nothing new should import from here.

import type { CSSProperties } from "react";

/**
 * The `.field` geometry as a style object.
 *
 * There were 41 copies of this function, one per file, each slightly free to
 * drift from the others. They now all re-export this one, so inputs across the
 * app agree while their routes wait their turn.
 *
 * Values match `.field` in globals.css exactly. When they stop matching, the
 * inputs on a half-migrated screen stop lining up — which is the whole failure
 * mode this file exists to prevent.
 *
 * The parameter is ignored. It stays in the signature so the ~589 existing
 * `inputStyle(t)` call sites need no edit; when a route migrates, its inputs
 * become `<Input />` or `className="field"` and the import goes away.
 */
export function inputStyle(_t?: unknown): CSSProperties {
  return {
    width: "100%",
    padding: "8px 11px",
    borderRadius: 9,
    background: "var(--surface)",
    border: "1px solid var(--line)",
    color: "var(--ink)",
    fontSize: 13,
    fontFamily: "inherit",
    outline: "none",
    minWidth: 0,
  };
}
