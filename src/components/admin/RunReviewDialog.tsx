"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/design-system/Modal";
import { Icon } from "@/components/design-system/Icon";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";

export type ReviewProgress = {
  review_id: string;
  status: string; // queued | running | completed | failed
  stage: string; // queued | reading | analyzing | synthesizing | complete | error
  label: string;
  percent: number;
  files_total: number;
  files_done: number;
  error?: string | null;
};

const STAGES: Array<{ key: string; label: string }> = [
  { key: "reading", label: "Reading documents" },
  { key: "analyzing", label: "Analyzing files" },
  { key: "synthesizing", label: "Synthesizing" },
  { key: "complete", label: "Done" },
];

function stageIndex(stage: string): number {
  const i = STAGES.findIndex((s) => s.key === stage);
  if (stage === "queued") return 0;
  return i < 0 ? 0 : i;
}

/**
 * In-app re-run dialog. Two phases in one themed modal (no browser confirm):
 *  1. confirm — explains the action, Cancel / Run.
 *  2. running — a live progress bar + % + stage stepper, polling the backend's
 *     review-progress endpoint so the user sees exactly what the AI is doing.
 * Calls onStart() to POST the run (returns {review_id}), then poll() to fetch
 * progress. On completion, onDone(true) lets the parent refresh the lead.
 */
export function RunReviewDialog({
  open,
  onClose,
  onStart,
  poll,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onStart: () => Promise<{ review_id: string }>;
  poll: (reviewId: string) => Promise<ReviewProgress>;
  onDone: (completed: boolean) => void;
}) {
  const { t } = useTheme();
  const [phase, setPhase] = useState<"confirm" | "running" | "done" | "error">("confirm");
  const [progress, setProgress] = useState<ReviewProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reviewIdRef = useRef<string | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  // Reset to the confirm step whenever the dialog is (re)opened.
  useEffect(() => {
    if (open) {
      setPhase("confirm");
      setProgress(null);
      setErrorMsg("");
      reviewIdRef.current = null;
    } else {
      clearTimer();
    }
  }, [open, clearTimer]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const tick = useCallback(async () => {
    const id = reviewIdRef.current;
    if (!id) return;
    try {
      const p = await poll(id);
      setProgress(p);
      if (p.status === "completed" || p.stage === "complete") {
        setPhase("done");
        clearTimer();
        return;
      }
      if (p.status === "failed" || p.stage === "error") {
        setErrorMsg(p.error || "The review could not be completed.");
        setPhase("error");
        clearTimer();
        return;
      }
    } catch {
      // transient poll error — keep polling
    }
    timer.current = setTimeout(tick, 1500);
  }, [poll, clearTimer]);

  async function begin() {
    setPhase("running");
    setErrorMsg("");
    setProgress({ review_id: "", status: "queued", stage: "queued", label: "Starting…", percent: 0, files_total: 0, files_done: 0 });
    try {
      const { review_id } = await onStart();
      reviewIdRef.current = review_id;
      timer.current = setTimeout(tick, 800);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Could not start the review.");
      setPhase("error");
    }
  }

  function finish(completed: boolean) {
    clearTimer();
    onDone(completed);
    onClose();
  }

  const pct = Math.max(0, Math.min(100, progress?.percent ?? 0));

  return (
    <Modal open={open} onClose={phase === "running" ? () => undefined : onClose} size="md" closeOnBackdrop={phase !== "running"}>
      <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
        {phase === "confirm" ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: t.brandSoft, color: t.brand, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="spark" size={17} />
              </div>
              <strong style={{ color: t.ink, fontSize: 16 }}>Re-run AI review</strong>
            </div>
            <p style={{ margin: 0, color: t.ink2, fontSize: 13.5, lineHeight: 1.55 }}>
              This runs a fresh underwriting pass over every document currently uploaded to this
              lead — including any new files — and updates the intelligence breakdown. Files that
              were already analyzed are reused, so this is usually fast.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" style={qcBtn(t)} onClick={onClose}>Cancel</button>
              <button type="button" style={qcBtnPrimary(t)} onClick={begin}>Run review</button>
            </div>
          </>
        ) : null}

        {phase === "running" ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Spinner color={t.brand} />
              <strong style={{ color: t.ink, fontSize: 15 }}>Running AI review…</strong>
              <span style={{ marginLeft: "auto", color: t.ink, fontSize: 15, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{pct}%</span>
            </div>

            <div style={{ height: 10, borderRadius: 999, background: t.surface2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: t.brand, borderRadius: 999, transition: "width 400ms ease" }} />
            </div>

            <div style={{ color: t.ink2, fontSize: 13, minHeight: 18 }}>
              {progress?.label || "Working…"}
              {progress && progress.files_total > 0 ? (
                <span style={{ color: t.ink3 }}> · {progress.files_done}/{progress.files_total} files</span>
              ) : null}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 2 }}>
              {STAGES.map((s, i) => {
                const active = i === stageIndex(progress?.stage || "queued");
                const done = i < stageIndex(progress?.stage || "queued");
                return (
                  <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5 }}>
                    <span
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 999,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: done ? t.profit : active ? t.brand : t.surface2,
                        color: done || active ? t.inverse : t.ink3,
                        flexShrink: 0,
                      }}
                    >
                      {done ? <Icon name="check" size={11} /> : <span style={{ fontSize: 9, fontWeight: 800 }}>{i + 1}</span>}
                    </span>
                    <span style={{ color: active ? t.ink : done ? t.ink2 : t.ink3, fontWeight: active ? 700 : 500 }}>{s.label}</span>
                  </div>
                );
              })}
            </div>

            <p style={{ margin: 0, color: t.ink4, fontSize: 11.5, lineHeight: 1.5 }}>
              You can keep this open — it updates as the AI works. Larger files take longer the
              first time; after that they're cached and re-runs are quick.
            </p>
          </>
        ) : null}

        {phase === "done" ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: t.profitBg, color: t.profit, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="check" size={18} />
              </div>
              <strong style={{ color: t.ink, fontSize: 16 }}>Review complete</strong>
            </div>
            <p style={{ margin: 0, color: t.ink2, fontSize: 13.5, lineHeight: 1.55 }}>
              The underwriting breakdown has been refreshed{progress && progress.files_total ? ` across all ${progress.files_total} files` : ""}.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="button" style={qcBtnPrimary(t)} onClick={() => finish(true)}>View results</button>
            </div>
          </>
        ) : null}

        {phase === "error" ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: t.dangerBg, color: t.danger, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="x" size={17} />
              </div>
              <strong style={{ color: t.ink, fontSize: 16 }}>Review didn’t finish</strong>
            </div>
            <p style={{ margin: 0, color: t.ink2, fontSize: 13, lineHeight: 1.55 }}>{errorMsg}</p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" style={qcBtn(t)} onClick={() => finish(false)}>Close</button>
              <button type="button" style={qcBtnPrimary(t)} onClick={begin}>Try again</button>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}

function Spinner({ color }: { color: string }) {
  return (
    <span
      style={{
        width: 18,
        height: 18,
        borderRadius: 999,
        border: `2.5px solid ${color}`,
        borderTopColor: "transparent",
        display: "inline-block",
        animation: "qc-spin 0.7s linear infinite",
      }}
    >
      <style>{"@keyframes qc-spin{to{transform:rotate(360deg)}}"}</style>
    </span>
  );
}
