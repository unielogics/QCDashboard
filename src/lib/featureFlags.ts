/**
 * Feature flag helpers.
 *
 * NEXT_PUBLIC_WORKSPACE_V2 gates the agent-side unified workspace
 * upgrade (Phase 2+ — Deals / Funding / Tasks / AI Follow-Up tabs).
 * When OFF, the workspace renders today's 5-tab layout
 * (Overview / Properties / Activity / Documents / Notes).
 *
 * Defaults to ON in dev (NODE_ENV !== "production") so the new flow
 * is the path of least resistance during development. In production
 * the env var must be set explicitly to "1" or "true" to enable.
 *
 * Per the plan's pipeline protection rule, this flag does NOT gate
 * any super admin / underwriting surface — those remain unchanged
 * regardless of the flag.
 */

function readFlag(): boolean | null {
  if (typeof process === "undefined") return null;
  const raw = process.env.NEXT_PUBLIC_WORKSPACE_V2;
  if (raw === undefined || raw === "") return null;
  return raw === "1" || raw.toLowerCase() === "true";
}

export function isWorkspaceV2(): boolean {
  const explicit = readFlag();
  if (explicit !== null) return explicit;
  // Default on in dev, off in prod.
  return typeof process !== "undefined" && process.env.NODE_ENV !== "production";
}
