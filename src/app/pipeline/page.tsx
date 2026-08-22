"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/design-system/Icon";
import { Btn, CellChip, Panel, Seg } from "@/components/ds";
import { PageActionMenu } from "@/components/ds/PageActionMenu";
import {
  BucketIntakeLinkDrawer,
  UnifiedFilesTable,
  UnifiedKanbanBoard,
  UnifiedOperatorFilters,
  type UnifiedFilterState,
} from "@/components/operator/UnifiedOperator";
import { useCurrentUser, useUnifiedOperatorFiles } from "@/hooks/useApi";
import type { UnifiedFileRow } from "@/lib/unifiedOperator";
import { ClientFilePipeline } from "./components/ClientFilePipeline";
import { SmartIntakeModal } from "./components/SmartIntakeModal";

const INITIAL_FILTERS: UnifiedFilterState = { vertical: "all", origin: "all", q: "" };

export default function PipelinePage() {
  const { data: user, isLoading } = useCurrentUser();

  if (!user) return <div className="empty">{isLoading ? "Loading pipeline..." : "Loading account..."}</div>;
  if (user.role === "client") return <ClientFilePipeline />;
  return <OperatorPipeline />;
}

function OperatorPipeline() {
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<UnifiedFilterState>(INITIAL_FILTERS);
  const [view, setView] = useState<"board" | "table">("board");
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [linkRow, setLinkRow] = useState<UnifiedFileRow | null>(null);
  const files = useUnifiedOperatorFiles({ limit: 500 });
  const allRows = files.data?.items ?? [];

  useEffect(() => {
    if (searchParams?.get("new") === "1") setIntakeOpen(true);
    const vertical = searchParams?.get("vertical");
    const origin = searchParams?.get("origin");
    setFilters((current) => ({
      ...current,
      vertical: vertical === "real_estate" || vertical === "main_street" || vertical === "dealer" || vertical === "mca" ? vertical : current.vertical,
      origin: origin === "console" || origin === "agent" || origin === "rep" || origin === "dealer" || origin === "ai_intake" ? origin : current.origin,
    }));
  }, [searchParams]);

  const rows = useMemo(() => {
    const query = filters.q.trim().toLowerCase();
    return allRows.filter((row) => {
      if (filters.vertical !== "all" && row.vertical !== filters.vertical) return false;
      if (filters.origin !== "all" && row.origin !== filters.origin) return false;
      if (!query) return true;
      return [row.title, row.label, row.ref, row.client_name, row.business_name, row.rep_name, row.dealer_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [allRows, filters]);

  const rollup = files.data?.rollup;
  const visibleAmount = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);

  return (
    <div className="grid">
      <div className="ckhead">
        <div className="ckrow">
          <h1>Pipeline</h1>
          <CellChip tone="mut" className="num">
            {files.isLoading ? "Loading" : `${rows.length} files`} · {formatCompactCurrency(visibleAmount)}
          </CellChip>
          {rollup?.needs_attention ? <CellChip tone="warn">{rollup.needs_attention} need attention</CellChip> : null}
          <span className="sp" />
          <Seg
            ariaLabel="Pipeline view"
            value={view}
            onChange={setView}
            options={[
              { value: "board", label: "Board" },
              { value: "table", label: "Table" },
            ]}
          />
          <Btn variant="pri" onClick={() => setIntakeOpen(true)}>
            <Icon name="plus" size={14} /> New file
          </Btn>
          <PageActionMenu items={[
            { label: "Open client book", href: "/clients" },
            { label: "Open AI intake", href: "/admin/ai-underwriter-leads" },
            { label: "Open document buckets", href: "/admin/buckets" },
          ]} label="Pipeline actions" />
        </div>
        <UnifiedOperatorFilters value={filters} onChange={setFilters} rows={allRows} />
      </div>

      {files.isError ? (
        <Panel>
          <div className="empty">
            <b>Pipeline could not be loaded.</b>
            <span className="sub">The page structure remains available while the latest logical-file projection is retried.</span>
            <Btn onClick={() => files.refetch()} disabled={files.isFetching}>Retry</Btn>
          </div>
        </Panel>
      ) : view === "board" ? (
        files.isLoading ? <PipelineSkeleton /> : <UnifiedKanbanBoard rows={rows} vertical={filters.vertical} onLinkBucketIntake={setLinkRow} />
      ) : (
        <Panel noPad>
          <UnifiedFilesTable
            rows={rows}
            empty={files.isLoading ? "Loading logical files..." : "No files match these filters."}
            onLinkBucketIntake={setLinkRow}
          />
        </Panel>
      )}

      <SmartIntakeModal open={intakeOpen} onClose={() => setIntakeOpen(false)} />
      <BucketIntakeLinkDrawer
        open={linkRow != null}
        onClose={() => setLinkRow(null)}
        initialBucketId={linkRow?.bucket_id}
        initialIntakeId={linkRow?.intake_id}
      />
    </div>
  );
}

function PipelineSkeleton() {
  return (
    <div className="board2" aria-label="Loading pipeline board">
      <div className="bandgrp">
        <div className="bandhd">Working the file · normalized</div>
        <div className="cols">
          {[0, 1, 2, 3].map((column) => <div className="kcol" key={column}><span className="skeleton" style={{ height: 76 }} /></div>)}
        </div>
      </div>
      <div className="gatecol"><span className="ln" /><span className="tx">Ready for funding</span><span className="ln" /></div>
      <div className="bandgrp">
        <div className="bandhd">Funding the file · identical for every vertical</div>
        <div className="cols">
          {[0, 1, 2, 3, 4, 5].map((column) => <div className="kcol" key={column}><span className="skeleton" style={{ height: 76 }} /></div>)}
        </div>
      </div>
    </div>
  );
}

function formatCompactCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}
