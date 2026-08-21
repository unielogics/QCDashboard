"use client";

// Borrower-facing pipeline — the single merged file table a CLIENT sees
// on /pipeline. One row per file; status moves RE Working → In Funding →
// Funded (or Lost). Clicking a row opens <ClientFileModal>, the
// stage-aware detail surface.
//
// Operators never reach this component — pipeline/page.tsx role-branches
// CLIENT here and everyone else to the operator pipeline.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CellChip, PageHeader, Panel, cx, type ChipTone } from "@/components/ds";
import { loanTypeLabel } from "@/lib/types";
import { useMyFiles, type MyFileRow, type MyFileStatus } from "@/hooks/useApi";
import { ClientFileModal } from "@/components/client/ClientFileModal";

type FilterId = MyFileStatus | "all";

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "re_working", label: "RE Working" },
  { id: "in_funding", label: "In Funding" },
  { id: "funded", label: "Funded" },
  { id: "lost", label: "Lost" },
];

/** Status → chip tone. The colour is doing real work on this screen: the
 *  borrower scans the strip and the stripe by tone, not by reading labels. */
function statusTone(s: FilterId): ChipTone {
  if (s === "funded") return "ok";
  if (s === "in_funding") return "acc";
  if (s === "lost") return "bad";
  if (s === "re_working") return "warn";
  return "mut";
}

function statusAccent(s: MyFileStatus): { label: string; tone: ChipTone; stripe: string } {
  if (s === "funded") return { label: "Funded", tone: "ok", stripe: "var(--ok)" };
  if (s === "in_funding") return { label: "In Funding", tone: "acc", stripe: "var(--accent)" };
  if (s === "lost") return { label: "Lost", tone: "bad", stripe: "var(--danger)" };
  return { label: "RE Working", tone: "warn", stripe: "var(--warn)" };
}

function fmtAmount(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}

const GRID = "4px 116px minmax(0, 1.7fr) 130px minmax(0, 1.3fr) 96px 100px";

export function ClientFilePipeline() {
  const { data: files = [], isLoading } = useMyFiles();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState<FilterId>("all");
  const [openFile, setOpenFile] = useState<MyFileRow | null>(null);
  // Tab to land on when the modal opens. Set by a dashboard deep-link
  // (?file=&tab=), undefined for a plain row click.
  const [openInitialTab, setOpenInitialTab] = useState<string | undefined>(undefined);
  const deepLinkConsumed = useRef(false);

  // Honor a ?file=<id>&tab=<tab> deep-link (the dashboard "needs
  // attention" items point here). Fires once, after files load, then
  // strips the params so close/refresh behaves naturally.
  const fileParam = searchParams?.get("file") ?? null;
  const tabParam = searchParams?.get("tab") ?? null;
  useEffect(() => {
    if (deepLinkConsumed.current || !fileParam || files.length === 0) return;
    const match = files.find(
      (f) =>
        f.id === fileParam ||
        f.loan_uuid === fileParam ||
        f.deal_uuid === fileParam,
    );
    if (match) {
      deepLinkConsumed.current = true;
      setOpenFile(match);
      setOpenInitialTab(tabParam ?? undefined);
      router.replace("/pipeline", { scroll: false });
    }
  }, [fileParam, tabParam, files, router]);

  const openFromRow = (f: MyFileRow) => {
    setOpenInitialTab(undefined);
    setOpenFile(f);
  };

  const counts = useMemo(() => {
    const c: Record<MyFileStatus, number> = {
      re_working: 0,
      in_funding: 0,
      funded: 0,
      lost: 0,
    };
    for (const f of files) c[f.status] = (c[f.status] ?? 0) + 1;
    return c;
  }, [files]);

  const visible = useMemo(() => {
    const rows = filter === "all" ? files : files.filter((f) => f.status === filter);
    // Active work first (re_working, in_funding), then funded, then lost;
    // newest within each group.
    const rank: Record<MyFileStatus, number> = {
      re_working: 0,
      in_funding: 1,
      funded: 2,
      lost: 3,
    };
    return [...rows].sort((a, b) => {
      const ra = rank[a.status] ?? 9;
      const rb = rank[b.status] ?? 9;
      if (ra !== rb) return ra - rb;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [files, filter]);

  // While a file is open the panel takes over the whole content area
  // (right of the sidebar) — a full in-content view, not a popup.
  // Negative margin cancels the <main> padding so the panel runs
  // edge-to-edge: maximum size, no surrounding frame/gap.
  if (openFile) {
    return (
      // Cancels the shell's `.content` padding exactly, the same way `.ckhead`
      // does — the hard-coded -24 predated the padding becoming a clamp().
      <div style={{ margin: "calc(var(--pad-y) * -1) calc(var(--pad-x) * -1)" }}>
        <ClientFileModal
          key={openFile.id}
          file={openFile}
          initialTab={openInitialTab}
          onClose={() => setOpenFile(null)}
        />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="My Files"
        lede="Every property file you have with us — from the agent stage through funding. Click a file to open it."
      />

      {/* Status filter pills */}
      <div className="pagebar">
        {FILTERS.map((f) => {
          const active = filter === f.id;
          const count = f.id === "all" ? files.length : counts[f.id] ?? 0;
          return (
            <button
              key={f.id}
              type="button"
              className={cx("btn", active && "pri")}
              aria-pressed={active}
              onClick={() => setFilter(f.id)}
            >
              <span>{f.label}</span>
              <CellChip tone={statusTone(f.id)}>{count}</CellChip>
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="card mt sub">Loading your files…</div>
      ) : visible.length === 0 ? (
        <div className="card mt">
          {files.length === 0
            ? "No files yet. Once your agent starts a file for a property, it shows up here."
            : "No files in this status."}
        </div>
      ) : (
        <Panel className="mt" noPad>
          <Header />
          {visible.map((f) => (
            <Row key={`${f.kind}-${f.id}`} file={f} onClick={() => openFromRow(f)} />
          ))}
        </Panel>
      )}
    </>
  );
}

function Header() {
  const cell = (label: string, alignRight = false) => (
    <div className={alignRight ? "align-r" : undefined}>{label}</div>
  );
  return (
    <div
      className="lbl"
      style={{
        display: "grid",
        gridTemplateColumns: GRID,
        gap: 12,
        padding: "12px 16px 12px 12px",
        borderBottom: "1px solid var(--line2)",
        background: "var(--sunken2)",
      }}
    >
      <div />
      {cell("Status")}
      {cell("Property")}
      {cell("Type")}
      {cell("What's happening")}
      {cell("Amount", true)}
      {cell("Updated", true)}
    </div>
  );
}

function Row({
  file,
  onClick,
}: {
  file: MyFileRow;
  onClick: () => void;
}) {
  const s = statusAccent(file.status);
  const propLine = file.address || file.ref;
  const typeLabel = file.loan_type ? loanTypeLabel(file.loan_type) : "—";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        display: "grid",
        gridTemplateColumns: GRID,
        gap: 12,
        padding: "14px 16px 14px 12px",
        borderBottom: "1px solid var(--line)",
        alignItems: "center",
        color: "var(--ink)",
        cursor: "pointer",
        transition: "background .12s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = "var(--sunken2)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = "transparent";
      }}
    >
      <div style={{ alignSelf: "stretch", background: s.stripe, borderRadius: 2 }} />
      <div>
        <CellChip tone={s.tone}>{s.label}</CellChip>
      </div>
      <div style={{ minWidth: 0 }}>
        <b style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {propLine}
        </b>
        <div
          className="sub"
          style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {file.city ? `${file.city} · ` : ""}
          {file.ref} · {file.stage_detail}
        </div>
      </div>
      <div>{typeLabel}</div>
      <div
        className={file.ai_status ? undefined : "sub"}
        style={{
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {file.ai_status || "—"}
      </div>
      <div className="align-r num"><b>{fmtAmount(file.amount)}</b></div>
      <div className="align-r num sub">{fmtDate(file.updated_at)}</div>
    </div>
  );
}
