import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import type { OperatingPlanBody, OperatingEvaluation } from "../../src/lib/operatingPlan";
import type { OperatingGuidance, OperatingGuidanceEvidence as OperatingEvidence } from "../../src/lib/operatingGuidance";
import type { OperatingGoalRead } from "../../src/lib/operatingGoal";
import { operatingEditSnapshot } from "./operatingPlanEditing";

export type MarketingSeed = "base" | "marketing_existing" | "legacy_generic" | "split_group" | "legacy_group" | "malformed_marketing";
export type CanonicalQuote = { body: OperatingPlanBody; completion: { complete: boolean; missing: string[] }; reply: { goal: OperatingGoalRead; evaluation: OperatingEvaluation; guidance: OperatingGuidance; evidence: OperatingEvidence } };
type Packet = { id: number; ok: boolean; value?: CanonicalQuote; status?: number; detail?: unknown };
export class CanonicalBridgeError extends Error {
  constructor(public status: number, public detail: unknown) { super(typeof detail === "string" ? detail : "Canonical financial validation failed"); }
}
export const canonicalBridgeConfigured = Boolean(process.env.QC_MARKETING_ENGINE_COMMAND);
export const canonicalBridgeSetupMessage = "Set QC_MARKETING_ENGINE_COMMAND to a JSON command array for the external canonical backend test bridge (synthetic data only). No browser financial calculator or static priced fallback is used.";

export async function createCanonicalEngine(seed: MarketingSeed) {
  let command: unknown;
  try { command = JSON.parse(process.env.QC_MARKETING_ENGINE_COMMAND || "null"); } catch { throw new Error(canonicalBridgeSetupMessage); }
  if (!Array.isArray(command) || !command.length || !command.every(value => typeof value === "string")) throw new Error(canonicalBridgeSetupMessage);
  const child: ChildProcessWithoutNullStreams = spawn(command[0], command.slice(1), { env: { ...process.env, PYTHONUTF8: "1" }, windowsHide: true });
  const pending = new Map<number, { resolve: (quote: CanonicalQuote) => void; reject: (reason: Error) => void }>();
  let counter = 0, stderr = "", closed = false;
  child.stderr.on("data", chunk => { stderr += String(chunk); });
  const lines = createInterface({ input: child.stdout });
  lines.on("line", line => {
    let packet: Packet;
    try { packet = JSON.parse(line) as Packet; } catch { return; }
    const job = pending.get(packet.id); if (!job) return; pending.delete(packet.id);
    if (packet.ok && packet.value) job.resolve(packet.value);
    else job.reject(new CanonicalBridgeError(packet.status || 500, packet.detail));
  });
  child.on("error", error => { for (const job of pending.values()) job.reject(error); pending.clear(); });
  child.on("exit", code => { closed = true; for (const job of pending.values()) job.reject(new Error("Canonical bridge exited " + code + ": " + stderr.slice(-1000))); pending.clear(); });
  const send = (operation: "init" | "preview" | "draft", body?: OperatingPlanBody) => new Promise<CanonicalQuote>((resolve, reject) => {
    const id = ++counter; pending.set(id, { resolve, reject }); child.stdin.write(JSON.stringify({ id, operation, seed, body }) + "\n");
  });
  const initial = await send("init").catch(error => { child.stdin.end(); child.kill(); lines.close(); throw error; });
  return {
    initial, pid: child.pid,
    quote: (body: OperatingPlanBody, operation: "preview" | "draft" = "preview") => send(operation, body),
    async close() {
      if (closed) return; child.stdin.end();
      await new Promise<void>(resolve => { const timer = setTimeout(() => { if (!closed) child.kill(); resolve(); }, 2000); child.once("exit", () => { clearTimeout(timer); resolve(); }); });
      lines.close();
    },
  };
}
export type CanonicalEngine = Awaited<ReturnType<typeof createCanonicalEngine>>;
export function marketingSnapshot(body: OperatingPlanBody, revision: number, quote: CanonicalQuote) {
  const base = operatingEditSnapshot(body, revision);
  return { ...base, evidence: (quote.reply.evidence.files || []).map(row => ({ ...row, content_type: "application/pdf" })),
    completion: base.completion ? { ...base.completion, ...quote.completion } : base.completion };
}
