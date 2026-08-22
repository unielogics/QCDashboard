"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/design-system/Icon";
import {
  Btn,
  CellChip,
  Field,
  IconBtn,
  Input,
  Panel,
  Row,
  Select,
  Table,
  Td,
  Textarea,
  Tr,
  cx,
  type ChipTone,
} from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { useLinkBucketIntake, useUnifiedOperatorFiles } from "@/hooks/useApi";
import {
  DOCUMENT_PACKS,
  FUNDING_LADDER,
  ORIGIN_OPTIONS,
  UNIFIED_ACTIONS,
  VERTICAL_OPTIONS,
  WORKING_LADDERS,
  documentPackFor,
  formatUnifiedAmount,
  operatorFileHref,
  originTone,
  programBlueprintFor,
  rowMatchesStage,
  stageProgress,
  stageTone,
  verticalTone,
  type BucketIntakeLinkPayload,
  type UnifiedAction,
  type UnifiedFileRow,
  type UnifiedOrigin,
  type UnifiedStageFamily,
  type UnifiedVertical,
} from "@/lib/unifiedOperator";

type UnifiedFilterState = {
  vertical: UnifiedVertical | "all";
  origin: UnifiedOrigin | "all";
  q: string;
};

export function UnifiedFileTags({ row, compact = false }: { row: UnifiedFileRow; compact?: boolean }) {
  const program = programBlueprintFor(row);
  const tags = compact ? row.program_tags.slice(0, 2) : row.program_tags;
  return (
    <span className="row" style={{ gap: 6, flexWrap: "wrap", minWidth: 0 }}>
      <CellChip tone={verticalTone(row.vertical)}>{row.vertical_label}</CellChip>
      <CellChip tone={originTone(row.origin)}>{row.origin_label}</CellChip>
      <CellChip tone={stageTone(row.stage)}>{row.stage.label}</CellChip>
      {program ? <CellChip tone="mut">{program.label}</CellChip> : null}
      {tags.map((tag) => (
        <CellChip key={tag} tone="mut">{tag}</CellChip>
      ))}
    </span>
  );
}

export function UnifiedStageMeter({ row, compact = false }: { row: UnifiedFileRow; compact?: boolean }) {
  const pct = stageProgress(row.stage);
  return (
    <div style={{ minWidth: 0 }}>
      <div className="row split" style={{ gap: 8 }}>
        <span className="sub trunc">{row.stage.family === "funding" ? "Funding ladder" : "Working ladder"}</span>
        {!compact ? <b className="num">{pct}%</b> : null}
      </div>
      <div className="track" style={{ marginTop: 5 }}>
        <div className="fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function UnifiedDocumentPack({ row }: { row: UnifiedFileRow }) {
  const pack = documentPackFor(row);
  const progress = row.document_progress;
  const docTone: ChipTone =
    progress.docs_total > 0 && progress.docs_uploaded >= progress.docs_total ? "ok"
      : progress.docs_uploaded > 0 ? "warn"
        : "mut";
  const sigTone: ChipTone =
    progress.signatures_total > 0 && progress.signatures_uploaded >= progress.signatures_total ? "ok"
      : progress.signatures_uploaded > 0 ? "warn"
        : "mut";
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div>
        <b>{pack.label}</b>
        <div className="sub">
          {pack.required.slice(0, 4).join(", ")}
          {pack.required.length > 4 ? ` +${pack.required.length - 4} more` : ""}
        </div>
      </div>
      <Row>
        <CellChip tone={docTone}>
          {progress.docs_uploaded}/{progress.docs_total} docs
        </CellChip>
        <CellChip tone={sigTone}>
          {progress.signatures_uploaded}/{progress.signatures_total} signatures
        </CellChip>
        <CellChip tone="mut">{progress.bucket_progress_label}</CellChip>
      </Row>
    </div>
  );
}

export function UnifiedOperatorFilters({
  value,
  onChange,
  searchPlaceholder = "Search files, clients, buckets...",
}: {
  value: UnifiedFilterState;
  onChange: (next: UnifiedFilterState) => void;
  searchPlaceholder?: string;
}) {
  return (
    <div className="pagebar">
      <div className="field box" style={{ minWidth: 260, flex: "1 1 320px" }}>
        <Icon name="search" size={14} />
        <input
          value={value.q}
          onChange={(e) => onChange({ ...value, q: e.target.value })}
          placeholder={searchPlaceholder}
          aria-label="Search unified files"
        />
      </div>
      <Select
        aria-label="Vertical"
        value={value.vertical}
        onChange={(e) => onChange({ ...value, vertical: e.target.value as UnifiedVertical | "all" })}
      >
        {VERTICAL_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </Select>
      <Select
        aria-label="Origin"
        value={value.origin}
        onChange={(e) => onChange({ ...value, origin: e.target.value as UnifiedOrigin | "all" })}
      >
        {ORIGIN_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </Select>
    </div>
  );
}

export function UnifiedFilesTable({
  rows,
  empty = "No unified files match these filters.",
  onLinkBucketIntake,
  caption = "Unified operator files",
}: {
  rows: UnifiedFileRow[];
  empty?: string;
  onLinkBucketIntake?: (row: UnifiedFileRow) => void;
  caption?: string;
}) {
  return (
    <Table
      caption={caption}
      cols={[
        { label: "File", width: "30%" },
        { label: "Tags", width: "25%" },
        { label: "Stage", width: "18%" },
        { label: "Owner", width: "14%" },
        { label: "Health", width: "9%" },
        { label: "", width: 54 },
      ]}
    >
      {rows.length === 0 ? (
        <Tr>
          <Td colSpan={6}>
            <div className="sub" style={{ padding: 18 }}>{empty}</div>
          </Td>
        </Tr>
      ) : (
        rows.map((row) => (
          <Tr key={row.id}>
            <Td>
              <Link href={operatorFileHref(row)} className="linkreset">
                <div className="trunc" style={{ fontWeight: 700 }}>{row.label}</div>
                <div className="sub trunc">
                  {row.subtitle || row.business_name || row.client_name || "No file subtitle"}
                  {row.amount != null ? ` | ${formatUnifiedAmount(row.amount)}` : ""}
                </div>
              </Link>
            </Td>
            <Td>
              <UnifiedFileTags row={row} compact />
            </Td>
            <Td>
              <UnifiedStageMeter row={row} compact />
              <div className="sub trunc" style={{ marginTop: 4 }}>{row.stage.label}</div>
            </Td>
            <Td>
              <div className="trunc">{row.owner_name || row.rep_name || row.dealer_name || "Unassigned"}</div>
              <div className="sub trunc">
                {row.bucket_name || row.source_kind}
              </div>
            </Td>
            <Td>
              <CellChip tone={row.health_tone}>{row.health}</CellChip>
            </Td>
            <Td align="r">
              <UnifiedActionMenu row={row} onLinkBucketIntake={onLinkBucketIntake} />
            </Td>
          </Tr>
        ))
      )}
    </Table>
  );
}

export function UnifiedFileSummaryCard({
  row,
  onLinkBucketIntake,
}: {
  row: UnifiedFileRow;
  onLinkBucketIntake?: (row: UnifiedFileRow) => void;
}) {
  return (
    <div className="kcard" style={{ display: "grid", gap: 10 }}>
      <div className="row split">
        <Link href={operatorFileHref(row)} className="linkreset" style={{ minWidth: 0 }}>
          <b className="trunc">{row.label}</b>
          <span className="sub subline trunc">{row.subtitle || row.client_name || row.source_kind}</span>
        </Link>
        <UnifiedActionMenu row={row} onLinkBucketIntake={onLinkBucketIntake} />
      </div>
      <UnifiedFileTags row={row} compact />
      <UnifiedStageMeter row={row} compact />
      <UnifiedDocumentPack row={row} />
    </div>
  );
}

export function UnifiedKanbanBoard({
  rows,
  vertical,
  onLinkBucketIntake,
}: {
  rows: UnifiedFileRow[];
  vertical: UnifiedVertical | "all";
  onLinkBucketIntake?: (row: UnifiedFileRow) => void;
}) {
  const workingColumns = useMemo(() => {
    const seen = new Set<string>();
    const source =
      vertical === "all"
        ? [...WORKING_LADDERS.real_estate, ...WORKING_LADDERS.main_street]
        : WORKING_LADDERS[vertical];
    return source.filter((stage) => {
      if (seen.has(stage.key)) return false;
      seen.add(stage.key);
      return true;
    });
  }, [vertical]);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Panel title="Working ladders" sub="Vertical-specific intake and qualification before the funding gate." noPad>
        <StageColumnRail
          family="working"
          stages={workingColumns}
          rows={rows}
          onLinkBucketIntake={onLinkBucketIntake}
        />
      </Panel>
      <Panel title="Shared funding ladder" sub="All promoted files use the canonical Loan.stage sequence." noPad>
        <StageColumnRail
          family="funding"
          stages={FUNDING_LADDER}
          rows={rows}
          onLinkBucketIntake={onLinkBucketIntake}
        />
      </Panel>
    </div>
  );
}

function StageColumnRail({
  family,
  stages,
  rows,
  onLinkBucketIntake,
}: {
  family: UnifiedStageFamily;
  stages: Array<{ key: string; label: string }>;
  rows: UnifiedFileRow[];
  onLinkBucketIntake?: (row: UnifiedFileRow) => void;
}) {
  return (
    <div className="kanban" style={{ padding: 10, overflowX: "auto" }}>
      {stages.map((stage) => {
        const matches = rows.filter((row) => rowMatchesStage(row, stage.key, family));
        return (
          <div className="kcol" key={`${family}-${stage.key}`}>
            <div className="row split">
              <b>{stage.label}</b>
              <CellChip tone={matches.length ? (family === "funding" ? "gold" : "acc") : "mut"}>{matches.length}</CellChip>
            </div>
            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              {matches.slice(0, 20).map((row) => (
                <UnifiedFileSummaryCard
                  key={row.id}
                  row={row}
                  onLinkBucketIntake={onLinkBucketIntake}
                />
              ))}
              {matches.length === 0 ? <div className="sub" style={{ padding: "10px 2px" }}>No files</div> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function UnifiedActionMenu({
  row,
  onLinkBucketIntake,
}: {
  row: UnifiedFileRow;
  onLinkBucketIntake?: (row: UnifiedFileRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reviewing, setReviewing] = useState<UnifiedAction | null>(null);
  const actions = UNIFIED_ACTIONS.filter((action) => {
    if (action.key === "link_bucket_intake") return Boolean(row.bucket_id || row.intake_id);
    if (action.key === "promote_to_funding") return row.stage.family === "working";
    if (action.key === "send_external") return Boolean(row.bucket_id || row.loan_id);
    if (action.key === "archive") return false;
    return true;
  });

  function choose(action: UnifiedAction) {
    setOpen(false);
    if (action.key === "link_bucket_intake" && onLinkBucketIntake) {
      onLinkBucketIntake(row);
      return;
    }
    setReviewing(action);
  }

  function confirm(action: UnifiedAction) {
    setReviewing(null);
    if (action.key === "review_file") window.location.href = operatorFileHref(row);
  }

  return (
    <span style={{ position: "relative", display: "inline-flex" }} onClick={(e) => e.stopPropagation()}>
      <IconBtn aria-label={`Open actions for ${row.label}`} onClick={() => setOpen((v) => !v)}>
        <Icon name="dots" size={14} />
      </IconBtn>
      {open ? (
        <div className="actmenu" style={{ right: 0, top: 34, zIndex: 30 }}>
          {actions.map((action) => (
            <button key={action.key} type="button" onClick={() => choose(action)}>
              <span>{action.label}</span>
              {action.workflowChanging || action.external || action.destructive ? (
                <CellChip tone={action.tone}>
                  {action.destructive ? "destructive" : action.external ? "external" : "workflow"}
                </CellChip>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
      <Drawer
        open={reviewing != null}
        onClose={() => setReviewing(null)}
        title={reviewing?.label ?? "Review action"}
        sub={row.label}
        width="md"
        footer={
          reviewing ? (
            <>
              <Btn onClick={() => setReviewing(null)}>Cancel</Btn>
              <Btn variant="pri" onClick={() => confirm(reviewing)}>
                {reviewing.key === "review_file" ? "Open file" : "Confirm"}
              </Btn>
            </>
          ) : null
        }
      >
        {reviewing ? (
          <ActionReviewBody row={row} action={reviewing} />
        ) : null}
      </Drawer>
    </span>
  );
}

function ActionReviewBody({ row, action }: { row: UnifiedFileRow; action: UnifiedAction }) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="hintbox">
        Confirming workflow-changing or external actions writes an audit entry from the backend route handling the action.
      </div>
      <Panel title="File" noPad>
        <div className="filerow" style={{ border: 0 }}>
          <div className="grow">
            <b>{row.label}</b>
            <div className="sub">{row.subtitle || row.client_name || "No subtitle"}</div>
          </div>
          <CellChip tone={row.health_tone}>{row.health}</CellChip>
        </div>
      </Panel>
      <div className="cg">
        <div className="s6">
          <Field label="Vertical">
            <Input value={row.vertical_label} readOnly />
          </Field>
        </div>
        <div className="s6">
          <Field label="Origin">
            <Input value={row.origin_label} readOnly />
          </Field>
        </div>
        <div className="s12">
          <Field label="Stage">
            <Input value={`${row.stage.label} (${row.stage.family})`} readOnly />
          </Field>
        </div>
      </div>
      <Row>
        <CellChip tone={action.tone}>{action.workflowChanging ? "Workflow change" : "Review"}</CellChip>
        {action.external ? <CellChip tone="pet">External handoff</CellChip> : null}
        {action.destructive ? <CellChip tone="bad">Destructive</CellChip> : null}
      </Row>
    </div>
  );
}

export function BucketIntakeLinkDrawer({
  open,
  onClose,
  initialBucketId,
  initialIntakeId,
  title = "Link bucket and AI intake",
}: {
  open: boolean;
  onClose: () => void;
  initialBucketId?: string | null;
  initialIntakeId?: string | null;
  title?: string;
}) {
  const { data, isLoading } = useUnifiedOperatorFiles({ limit: 500 });
  const linkMutation = useLinkBucketIntake();
  const [bucketId, setBucketId] = useState(initialBucketId ?? "");
  const [intakeId, setIntakeId] = useState(initialIntakeId ?? "");
  const [relationship, setRelationship] = useState<BucketIntakeLinkPayload["relationship"]>("primary");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setBucketId(initialBucketId ?? "");
    setIntakeId(initialIntakeId ?? "");
    setRelationship("primary");
    setNote("");
    setError(null);
  }, [initialBucketId, initialIntakeId, open]);

  const bucketOptions = useMemo(() => {
    const seen = new Map<string, UnifiedFileRow>();
    for (const row of data?.items ?? []) {
      if (row.bucket_id && !seen.has(row.bucket_id)) seen.set(row.bucket_id, row);
    }
    return Array.from(seen.values()).sort((a, b) => (a.bucket_name || a.label).localeCompare(b.bucket_name || b.label));
  }, [data?.items]);

  const intakeOptions = useMemo(() => {
    const seen = new Map<string, UnifiedFileRow>();
    for (const row of data?.items ?? []) {
      if (row.intake_id && !seen.has(row.intake_id)) seen.set(row.intake_id, row);
    }
    return Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [data?.items]);

  const selectedBucket = bucketOptions.find((row) => row.bucket_id === bucketId);
  const selectedIntake = intakeOptions.find((row) => row.intake_id === intakeId);
  const canSubmit = Boolean(bucketId && intakeId) && !linkMutation.isPending;

  async function submit() {
    if (!bucketId || !intakeId) return;
    setError(null);
    try {
      await linkMutation.mutateAsync({
        bucket_id: bucketId,
        intake_id: intakeId,
        relationship,
        note: note.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to link bucket and intake.");
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={title}
      sub="Review the source records before confirming. The backend records an audit line on the bucket and intake bucket when available."
      width="lg"
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="pri" onClick={() => submit()} disabled={!canSubmit}>
            {linkMutation.isPending ? "Linking..." : "Confirm link"}
          </Btn>
        </>
      }
    >
      <div style={{ display: "grid", gap: 14 }}>
        {error ? <div className="warnline">{error}</div> : null}
        <div className="cg">
          <div className="s6">
            <Field label="Document bucket">
              <Select value={bucketId} onChange={(e) => setBucketId(e.target.value)} disabled={isLoading}>
                <option value="">Select bucket</option>
                {bucketOptions.map((row) => (
                  <option key={row.bucket_id ?? row.id} value={row.bucket_id ?? ""}>
                    {row.bucket_name || row.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="s6">
            <Field label="AI intake">
              <Select value={intakeId} onChange={(e) => setIntakeId(e.target.value)} disabled={isLoading}>
                <option value="">Select AI intake</option>
                {intakeOptions.map((row) => (
                  <option key={row.intake_id ?? row.id} value={row.intake_id ?? ""}>
                    {row.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="s6">
            <Field label="Relationship">
              <Select value={relationship} onChange={(e) => setRelationship(e.target.value as BucketIntakeLinkPayload["relationship"])}>
                <option value="primary">Primary</option>
                <option value="supporting">Supporting</option>
                <option value="source">Source</option>
              </Select>
            </Field>
          </div>
          <div className="s6">
            <Field label="Audit note" hint="Optional. Appears in the bucket activity log.">
              <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why these records are being linked" />
            </Field>
          </div>
        </div>

        <div className="cg">
          <div className="s6">
            <ReviewPick title="Bucket" row={selectedBucket} fallback={bucketId ? "Bucket not in the current filtered projection." : "Select a bucket."} />
          </div>
          <div className="s6">
            <ReviewPick title="AI intake" row={selectedIntake} fallback={intakeId ? "Intake not in the current filtered projection." : "Select an intake."} />
          </div>
        </div>

        <Panel title="Blueprint coverage">
          <div className="cg">
            {Object.values(DOCUMENT_PACKS).map((pack) => (
              <div className="s6" key={pack.key}>
                <b>{pack.label}</b>
                <div className="sub">{pack.required.slice(0, 3).join(", ")}</div>
                <div className="sub">{pack.signatures.join(", ")}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </Drawer>
  );
}

function ReviewPick({ title, row, fallback }: { title: string; row?: UnifiedFileRow; fallback: string }) {
  if (!row) {
    return (
      <Panel title={title}>
        <div className="sub">{fallback}</div>
      </Panel>
    );
  }
  return (
    <Panel title={title}>
      <div style={{ display: "grid", gap: 8 }}>
        <div>
          <b>{row.label}</b>
          <div className="sub">{row.subtitle || row.client_name || "No subtitle"}</div>
        </div>
        <UnifiedFileTags row={row} compact />
        <Row>
          <CellChip tone={row.health_tone}>{row.health}</CellChip>
          <CellChip tone={row.coverage === "complete" ? "ok" : row.coverage === "partial" ? "warn" : "mut"}>
            {row.coverage}
          </CellChip>
        </Row>
      </div>
    </Panel>
  );
}

export function UnifiedBlueprintRail() {
  return (
    <Panel title="Centralized blueprint" sub="Shared taxonomy for pipeline, clients, buckets, AI intake, and partner portals.">
      <div className="cg">
        {VERTICAL_OPTIONS.filter((option) => option.value !== "all").map((option) => {
          const key = option.value as UnifiedVertical;
          const pack = DOCUMENT_PACKS[key];
          return (
            <div className={cx("s3")} key={key}>
              <div className="row" style={{ gap: 8 }}>
                <CellChip tone={verticalTone(key)}>{option.label}</CellChip>
              </div>
              <div className="sub" style={{ marginTop: 6 }}>{pack.label}</div>
              <div className="sub">{WORKING_LADDERS[key].length} working stages before funding</div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

