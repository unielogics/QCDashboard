"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/design-system/Icon";
import { Btn, Callout, cx, Sub } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";

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

// The dialog retitles itself as it runs, so the announced name is pinned here
// instead — otherwise a screen-reader user hears the current stage and never
// what they opened.
const DIALOG_NAME = "Re-run AI review";

const PHASE_TITLE: Record<"confirm" | "running" | "done" | "error", string> = {
  confirm: "Re-run AI review",
  running: "Running AI review…",
  done: "Review complete",
  error: "Review didn’t finish",
};

/**
 * In-app re-run dialog. Two phases in one dialog (no browser confirm):
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
  const running = phase === "running";

  return (
    <Drawer
      open={open}
      // A run in flight is not dismissible: no Escape, no backdrop, no close X.
      // Same guard the Modal version carried, expressed the same way.
      onClose={running ? () => undefined : onClose}
      closeOnBackdrop={!running}
      title={PHASE_TITLE[phase]}
      ariaLabel={DIALOG_NAME}
      width="md"
      footer={
        phase === "confirm" ? (
          <>
            <span className="grow" />
            <Btn onClick={onClose}>Cancel</Btn>
            <Btn variant="pri" onClick={begin}>
              Run review
            </Btn>
          </>
        ) : phase === "done" ? (
          <>
            <span className="grow" />
            <Btn variant="pri" onClick={() => finish(true)}>
              View results
            </Btn>
          </>
        ) : phase === "error" ? (
          <>
            <span className="grow" />
            <Btn onClick={() => finish(false)}>Close</Btn>
            <Btn variant="pri" onClick={begin}>
              Try again
            </Btn>
          </>
        ) : undefined
      }
    >
      <div className="grid">
        {phase === "confirm" ? (
          <p className="sub">
            This runs a fresh underwriting pass over every document currently uploaded to this lead —
            including any new files — and updates the intelligence breakdown. Files that were already
            analyzed are reused, so this is usually fast.
          </p>
        ) : null}

        {running ? (
          <>
            <div className="row">
              <Spinner />
              <span className="grow sub">
                {progress?.label || "Working…"}
                {progress && progress.files_total > 0 ? ` · ${progress.files_done}/${progress.files_total} files` : ""}
              </span>
              <strong className="num">{pct}%</strong>
            </div>

            {/* Data-derived width: the fill is the reported percentage, so it
                has to be an inline value. Everything else is `.track`/`.fill`. */}
            <div className="track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Review progress">
              <div className="fill" style={{ width: `${pct}%`, transition: "width 400ms ease" }} />
            </div>

            <div className="grid g8">
              {STAGES.map((s, i) => {
                const active = i === stageIndex(progress?.stage || "queued");
                const done = i < stageIndex(progress?.stage || "queued");
                return (
                  <span key={s.key} className={cx("stepdot", (done || active) && "on")}>
                    <i>{done ? <Icon name="check" size={11} /> : i + 1}</i>
                    {s.label}
                  </span>
                );
              })}
            </div>

            <Sub>
              You can keep this open — it updates as the AI works. Larger files take longer the first time;
              after that they&apos;re cached and re-runs are quick.
            </Sub>
          </>
        ) : null}

        {phase === "done" ? (
          <Callout tone="ok" icon={<Icon name="check" size={18} />}>
            The underwriting breakdown has been refreshed
            {progress && progress.files_total ? ` across all ${progress.files_total} files` : ""}.
          </Callout>
        ) : null}

        {phase === "error" ? (
          <Callout tone="bad" icon={<Icon name="x" size={17} />}>
            {errorMsg}
          </Callout>
        ) : null}
      </div>
    </Drawer>
  );
}

// The ring itself is `.spinner` now; `.solo` is the standalone (non-in-button)
// size and the accent tint the old `color` prop was always passed t.brand for.
function Spinner() {
  return <span className="spinner solo" />;
}
