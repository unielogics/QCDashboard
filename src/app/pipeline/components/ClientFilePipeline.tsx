"use client";

// Borrower-facing pipeline — the single merged file table a CLIENT sees
// on /pipeline. One row per file; status moves RE Working → In Funding →
// Funded (or Lost). Clicking a row opens <ClientFileModal>, the
// stage-aware detail surface.
//
// Operators never reach this component — pipeline/page.tsx role-branches
// CLIENT here and everyone else to the operator pipeline.

import { useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
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

function statusAccent(t: ReturnType<typeof useTheme>["t"], s: MyFileStatus) {
  if (s === "funded") return { label: "Funded", bg: t.profitBg, fg: t.profit };
  if (s === "in_funding") return { label: "In Funding", bg: t.brandSoft, fg: t.brand };
  if (s === "lost") return { label: "Lost", bg: t.dangerBg, fg: t.danger };
  return { label: "RE Working", bg: t.warnBg, fg: t.warn };
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
  const { t } = useTheme();
  const { data: files = [], isLoading } = useMyFiles();
  const [filter, setFilter] = useState<FilterId>("all");
  const [openFile, setOpenFile] = useState<MyFileRow | null>(null);

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

  return (
    <div style={{ padding: 24, maxWidth: 1240, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: t.ink, letterSpacing: -0.4 }}>
          My Files
        </h1>
        <div style={{ fontSize: 13, color: t.ink3, marginTop: 4 }}>
          Every property file you have with us — from the agent stage
          through funding. Click a file to open it.
        </div>
      </div>

      {/* Status filter pills */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {FILTERS.map((f) => {
          const active = filter === f.id;
          const count = f.id === "all" ? files.length : counts[f.id] ?? 0;
          const accent =
            f.id === "funded"
              ? { fg: t.profit, bg: t.profitBg }
              : f.id === "in_funding"
                ? { fg: t.brand, bg: t.brandSoft }
                : f.id === "lost"
                  ? { fg: t.danger, bg: t.dangerBg }
                  : f.id === "re_working"
                    ? { fg: t.warn, bg: t.warnBg }
                    : { fg: t.ink, bg: t.surface2 };
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              style={{
                all: "unset",
                cursor: "pointer",
                padding: "8px 14px",
                borderRadius: 999,
                background: active ? accent.bg : "transparent",
                border: `1px solid ${active ? accent.fg + "30" : t.line}`,
                color: active ? accent.fg : t.ink2,
                fontSize: 12,
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
              }}
            >
              <span>{f.label}</span>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 800,
                  fontFeatureSettings: '"tnum"',
                  padding: "1px 6px",
                  borderRadius: 999,
                  background: active ? accent.fg + "22" : t.surface2,
                  color: active ? accent.fg : t.ink3,
                  minWidth: 18,
                  textAlign: "center",
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <Card pad={28}>
          <div style={{ fontSize: 12.5, color: t.ink3 }}>Loading your files…</div>
        </Card>
      ) : visible.length === 0 ? (
        <Card pad={28}>
          <div style={{ fontSize: 13, color: t.ink2 }}>
            {files.length === 0
              ? "No files yet. Once your agent starts a file for a property, it shows up here."
              : "No files in this status."}
          </div>
        </Card>
      ) : (
        <Card pad={0}>
          <Header t={t} />
          {visible.map((f) => (
            <Row key={`${f.kind}-${f.id}`} file={f} t={t} onClick={() => setOpenFile(f)} />
          ))}
        </Card>
      )}

      {openFile ? (
        <ClientFileModal file={openFile} onClose={() => setOpenFile(null)} />
      ) : null}
    </div>
  );
}

function Header({ t }: { t: ReturnType<typeof useTheme>["t"] }) {
  const cell = (label: string, alignRight = false) => (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 1.2,
        textTransform: "uppercase",
        color: t.ink3,
        textAlign: alignRight ? "right" : "left",
      }}
    >
      {label}
    </div>
  );
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: GRID,
        gap: 12,
        padding: "12px 16px 12px 12px",
        borderBottom: `1px solid ${t.line}`,
        background: t.surface2,
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
  t,
  onClick,
}: {
  file: MyFileRow;
  t: ReturnType<typeof useTheme>["t"];
  onClick: () => void;
}) {
  const s = statusAccent(t, file.status);
  const stripe =
    file.status === "funded"
      ? t.profit
      : file.status === "in_funding"
        ? t.brand
        : file.status === "lost"
          ? t.danger
          : t.warn;
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
        borderBottom: `1px solid ${t.line}`,
        alignItems: "center",
        fontSize: 13,
        color: t.ink,
        cursor: "pointer",
        transition: "background .12s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = t.surface2;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = "transparent";
      }}
    >
      <div style={{ alignSelf: "stretch", background: stripe, borderRadius: 2 }} />
      <div>
        <Pill bg={s.bg} color={s.fg}>
          {s.label}
        </Pill>
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: t.ink,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {propLine}
        </div>
        <div
          style={{
            fontSize: 11,
            color: t.ink3,
            marginTop: 2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {file.city ? `${file.city} · ` : ""}
          {file.ref} · {file.stage_detail}
        </div>
      </div>
      <div style={{ fontSize: 12, color: t.ink2 }}>{typeLabel}</div>
      <div
        style={{
          fontSize: 12,
          color: file.ai_status ? t.ink2 : t.ink4,
          lineHeight: 1.4,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {file.ai_status || "—"}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, textAlign: "right", fontFeatureSettings: '"tnum"' }}>
        {fmtAmount(file.amount)}
      </div>
      <div style={{ fontSize: 12, color: t.ink3, textAlign: "right", fontFeatureSettings: '"tnum"' }}>
        {fmtDate(file.updated_at)}
      </div>
    </div>
  );
}
