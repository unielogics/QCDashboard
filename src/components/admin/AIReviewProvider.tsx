"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/design-system/Icon";
import { Btn, Callout, CellChip, cx, IconBtn, Sub } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { useAuthedApi } from "@/hooks/useApi";

export type ReviewProgress = {
  review_id: string;
  status: string;
  stage: string;
  label: string;
  percent: number;
  files_total: number;
  files_done: number;
  error?: string | null;
};

export type AIReviewRequest = {
  intakeId: string;
  leadName: string;
  reviewId?: string | null;
};

type AIReviewJob = ReviewProgress & AIReviewRequest & {
  startedAt: string;
  completedAt?: string | null;
};

type DialogState = {
  request: AIReviewRequest;
  phase: "confirm" | "progress";
};

type AIReviewContextValue = {
  requestReview: (request: AIReviewRequest) => void;
  isReviewing: (intakeId: string) => boolean;
  jobFor: (intakeId: string) => AIReviewJob | null;
};

const STORAGE_KEY = "qc.ai-review-jobs.v1";
const ACTIVE_STATUSES = new Set(["queued", "running"]);
const STAGES = [
  { key: "reading", label: "Reading documents" },
  { key: "analyzing", label: "Analyzing files" },
  { key: "synthesizing", label: "Synthesizing" },
  { key: "complete", label: "Done" },
];

const AIReviewContext = createContext<AIReviewContextValue | null>(null);

export function useAIReview() {
  const value = useContext(AIReviewContext);
  if (!value) throw new Error("useAIReview must be used inside AIReviewProvider");
  return value;
}

export function AIReviewProvider({ children }: { children: ReactNode }) {
  const apiCall = useAuthedApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [jobs, setJobs] = useState<AIReviewJob[]>([]);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const pollBusy = useRef(false);
  const jobsRef = useRef<AIReviewJob[]>([]);
  const announcedCompleted = useRef(new Set<string>());
  jobsRef.current = jobs;

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      const parsed = saved ? JSON.parse(saved) : [];
      if (Array.isArray(parsed)) setJobs(parsed.slice(0, 8));
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs.slice(0, 8)));
  }, [hydrated, jobs]);

  const updateJob = useCallback((intakeId: string, update: Partial<AIReviewJob>) => {
    setJobs((current) => current.map((job) => job.intakeId === intakeId ? { ...job, ...update } : job));
  }, []);

  const pollJobs = useCallback(async () => {
    if (pollBusy.current) return;
    const active = jobsRef.current.filter((job) => ACTIVE_STATUSES.has(job.status) && job.review_id);
    if (!active.length) return;
    pollBusy.current = true;
    try {
      await Promise.all(active.map(async (job) => {
        try {
          const progress = await apiCall<ReviewProgress>(
            `/admin/ai-underwriter-leads/${job.intakeId}/review-progress?review_id=${job.review_id}`,
          );
          updateJob(job.intakeId, {
            ...progress,
            completedAt: progress.status === "completed" || progress.status === "failed"
              ? new Date().toISOString()
              : null,
          });
        } catch {
          // A transient network failure must not turn a durable backend job into
          // a failed review. The next poll will recover its current state.
        }
      }));
    } finally {
      pollBusy.current = false;
    }
  }, [apiCall, updateJob]);

  const hasActiveJobs = jobs.some((job) => ACTIVE_STATUSES.has(job.status) && job.review_id);
  useEffect(() => {
    if (!hasActiveJobs) return;
    const timer = window.setInterval(() => { void pollJobs(); }, 1500);
    void pollJobs();
    return () => window.clearInterval(timer);
  }, [hasActiveJobs, pollJobs]);

  useEffect(() => {
    for (const job of jobs) {
      if (job.status !== "completed" || announcedCompleted.current.has(job.review_id)) continue;
      announcedCompleted.current.add(job.review_id);
      queryClient.invalidateQueries({ queryKey: ["unified-operator-files"] });
      window.dispatchEvent(new CustomEvent("qc-ai-review-completed", { detail: { intakeId: job.intakeId } }));
    }
  }, [jobs, queryClient]);

  const requestReview = useCallback((request: AIReviewRequest) => {
    const active = jobs.find((job) => job.intakeId === request.intakeId && ACTIVE_STATUSES.has(job.status));
    if (active) {
      setDialog({ request, phase: "progress" });
      return;
    }
    if (request.reviewId) {
      const tracked: AIReviewJob = {
        ...request,
        review_id: request.reviewId,
        status: "queued",
        stage: "queued",
        label: "Evidence linked - review queued",
        percent: 0,
        files_total: 0,
        files_done: 0,
        error: null,
        startedAt: new Date().toISOString(),
        completedAt: null,
      };
      setJobs((current) => [tracked, ...current.filter((job) => job.intakeId !== request.intakeId)].slice(0, 8));
      setDialog({ request, phase: "progress" });
      return;
    }
    setDialog({ request, phase: "confirm" });
  }, [jobs]);

  const startReview = useCallback(async (request: AIReviewRequest) => {
    const pending: AIReviewJob = {
      ...request,
      review_id: "",
      status: "queued",
      stage: "queued",
      label: "Starting AI review...",
      percent: 0,
      files_total: 0,
      files_done: 0,
      error: null,
      startedAt: new Date().toISOString(),
      completedAt: null,
    };
    setJobs((current) => [pending, ...current.filter((job) => job.intakeId !== request.intakeId)].slice(0, 8));
    setDialog({ request, phase: "progress" });
    try {
      const started = await apiCall<{ review_id: string; status: string }>(
        `/admin/ai-underwriter-leads/${request.intakeId}/run-review`,
        { method: "POST" },
      );
      updateJob(request.intakeId, { review_id: started.review_id, status: started.status || "queued" });
    } catch (error) {
      updateJob(request.intakeId, {
        status: "failed",
        stage: "error",
        label: "Review could not be started",
        error: error instanceof Error ? error.message : "Could not start the review.",
        completedAt: new Date().toISOString(),
      });
    }
  }, [apiCall, updateJob]);

  const jobFor = useCallback(
    (intakeId: string) => jobs.find((job) => job.intakeId === intakeId) ?? null,
    [jobs],
  );
  const isReviewing = useCallback(
    (intakeId: string) => jobs.some((job) => job.intakeId === intakeId && ACTIVE_STATUSES.has(job.status)),
    [jobs],
  );

  const value = useMemo<AIReviewContextValue>(() => ({ requestReview, isReviewing, jobFor }), [requestReview, isReviewing, jobFor]);
  const dialogJob = dialog ? jobFor(dialog.request.intakeId) : null;

  function viewResults(job: AIReviewJob) {
    setDialog(null);
    router.push(`/admin/ai-underwriter-leads?lead=${job.intakeId}`);
    window.dispatchEvent(new CustomEvent("qc-ai-review-completed", { detail: { intakeId: job.intakeId } }));
  }

  function removeJob(intakeId: string) {
    setJobs((current) => current.filter((job) => job.intakeId !== intakeId));
    if (dialog?.request.intakeId === intakeId) setDialog(null);
  }

  return (
    <AIReviewContext.Provider value={value}>
      {children}
      <ReviewDialog
        state={dialog}
        job={dialogJob}
        onClose={() => setDialog(null)}
        onStart={startReview}
        onViewResults={viewResults}
      />
      <ReviewDock
        jobs={jobs}
        onOpen={(job) => {
          if (job.status === "completed") {
            viewResults(job);
            return;
          }
          setDialog({ request: { intakeId: job.intakeId, leadName: job.leadName }, phase: "progress" });
        }}
        onRemove={removeJob}
      />
    </AIReviewContext.Provider>
  );
}

function ReviewDialog({
  state,
  job,
  onClose,
  onStart,
  onViewResults,
}: {
  state: DialogState | null;
  job: AIReviewJob | null;
  onClose: () => void;
  onStart: (request: AIReviewRequest) => Promise<void>;
  onViewResults: (job: AIReviewJob) => void;
}) {
  if (!state) return null;
  const confirm = state.phase === "confirm";
  const running = Boolean(job && ACTIVE_STATUSES.has(job.status));
  const failed = job?.status === "failed";
  const completed = job?.status === "completed";
  const pct = Math.max(0, Math.min(100, job?.percent ?? 0));
  const title = confirm ? "Run AI review" : completed ? "Review complete" : failed ? "Review did not finish" : "Running AI review...";

  return (
    <Drawer
      open
      onClose={onClose}
      title={title}
      sub={state.request.leadName}
      width="md"
      footer={
        confirm ? (
          <><span className="sp" /><Btn onClick={onClose}>Cancel</Btn><Btn variant="pri" onClick={() => void onStart(state.request)}>Run review</Btn></>
        ) : running ? (
          <><Sub className="grow">The review continues after this window is minimized.</Sub><Btn onClick={onClose}><Icon name="minimize" size={14} />Minimize</Btn></>
        ) : completed && job ? (
          <><span className="sp" /><Btn onClick={onClose}>Keep in background</Btn><Btn variant="pri" onClick={() => onViewResults(job)}>View AI intake</Btn></>
        ) : failed ? (
          <><span className="sp" /><Btn onClick={onClose}>Close</Btn><Btn variant="pri" onClick={() => void onStart(state.request)}>Try again</Btn></>
        ) : undefined
      }
    >
      {confirm ? (
        <div className="grid">
          <p className="sub">This runs a fresh underwriting pass over the evidence currently linked to this intake and updates the file breakdown.</p>
          <Callout tone="acc" icon={<Icon name="spark" size={18} />}>
            You can minimize the review and continue working anywhere in the console.
          </Callout>
        </div>
      ) : (
        <ReviewProgressBody job={job} pct={pct} />
      )}
    </Drawer>
  );
}

function ReviewProgressBody({ job, pct }: { job: AIReviewJob | null; pct: number }) {
  if (!job) return <div className="empty">Preparing the review...</div>;
  if (job.status === "failed") {
    return <Callout tone="bad" icon={<Icon name="x" size={17} />}>{job.error || "The review could not be completed."}</Callout>;
  }
  if (job.status === "completed") {
    const reviewed = job.files_total || job.files_done;
    return <Callout tone="ok" icon={<Icon name="check" size={18} />}>{reviewed > 0 ? `The underwriting breakdown has been refreshed across ${reviewed} files.` : "The underwriting breakdown has been refreshed."}</Callout>;
  }
  const activeIndex = stageIndex(job.stage);
  return (
    <div className="grid">
      <div className="row">
        <span className="spinner solo" />
        <span className="grow sub">{job.label || "Working..."}{job.files_total > 0 ? ` | ${job.files_done}/${job.files_total} files` : ""}</span>
        <strong className="num ai-review-percent">{pct}%</strong>
      </div>
      <div className="track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Review progress">
        <div className="fill" style={{ width: `${pct}%`, transition: "width 400ms ease" }} />
      </div>
      <div className="grid g8">
        {STAGES.map((stage, index) => (
          <span key={stage.key} className={cx("stepdot", index <= activeIndex && "on")}>
            <i>{index < activeIndex ? <Icon name="check" size={11} /> : index + 1}</i>
            {stage.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function ReviewDock({ jobs, onOpen, onRemove }: { jobs: AIReviewJob[]; onOpen: (job: AIReviewJob) => void; onRemove: (intakeId: string) => void }) {
  if (!jobs.length) return null;
  return (
    <aside className="ai-review-dock" aria-label="AI reviews">
      <div className="ai-review-dock-head"><Icon name="spark" size={15} /><b>AI reviews</b><CellChip tone="mut">{jobs.length}</CellChip></div>
      <div className="ai-review-dock-list">
        {jobs.map((job) => {
          const running = ACTIVE_STATUSES.has(job.status);
          return (
            <div key={job.intakeId} className={cx("ai-review-job", job.status === "completed" && "done", job.status === "failed" && "failed")}>
              <button type="button" className="ai-review-job-main" onClick={() => onOpen(job)}>
                <span className={cx("ai-review-job-icon", running && "running")}>
                  {running ? <span className="spinner" /> : <Icon name={job.status === "completed" ? "check" : "x"} size={14} />}
                </span>
                <span className="grow trunc"><b className="trunc">{job.leadName}</b><small>{job.status === "completed" ? "Review complete - open intake" : job.status === "failed" ? "Review needs attention" : `${job.label || "Reviewing"} - ${job.percent}%`}</small></span>
              </button>
              {!running ? <IconBtn onClick={() => onRemove(job.intakeId)} aria-label={`Dismiss ${job.leadName} review`} title="Dismiss"><Icon name="x" size={13} /></IconBtn> : null}
              {running ? <div className="ai-review-job-track"><span style={{ width: `${Math.max(2, job.percent)}%` }} /></div> : null}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function stageIndex(stage: string) {
  if (stage === "queued") return 0;
  const index = STAGES.findIndex((item) => item.key === stage);
  return index < 0 ? 0 : index;
}
