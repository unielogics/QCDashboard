"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/design-system/Icon";
import {
  Btn,
  CellChip,
  Field,
  IconBtn,
  Panel,
  Seg,
  Select,
  Table,
  Td,
  Textarea,
  Tr,
  type ChipTone,
} from "@/components/ds";
import { Drawer, DrawerSteps } from "@/components/ds/Drawer";
import {
  useBucketIntakeLinkOptions,
  useBucketIntakeLinks,
  useLinkBucketIntake,
  useOperatorBucketFiles,
  useUnlinkBucketIntake,
  useUpdateBucketIntakeLink,
} from "@/hooks/useApi";
import {
  FUNDING_LADDER,
  ORIGIN_OPTIONS,
  VERTICAL_OPTIONS,
  WORKING_LADDERS,
  documentPackFor,
  formatUnifiedAmount,
  operatorFileHref,
  originTone,
  verticalTone,
  type BucketIntakeLinkPayload,
  type UnifiedFileRow,
  type UnifiedOrigin,
  type UnifiedStage,
  type UnifiedVertical,
} from "@/lib/unifiedOperator";

export type UnifiedFilterState = {
  vertical: UnifiedVertical | "all";
  origin: UnifiedOrigin | "all";
  q: string;
};

const NORMALIZED_WORKING = [
  { key: "new", label: "New", sub: "Opened, not yet worked" },
  { key: "qualifying", label: "Qualifying", sub: "Verification in progress" },
  { key: "verified", label: "Verified", sub: "Authorizations back" },
  { key: "ready", label: "Ready for funding", sub: "Awaiting handoff" },
];

function activeStage(row: UnifiedFileRow): UnifiedStage {
  return row.funding_stage ?? row.working_stage ?? row.stage;
}

export function UnifiedFileTags({ row, compact = false }: { row: UnifiedFileRow; compact?: boolean }) {
  const tags = compact ? row.program_tags.slice(0, 1) : row.program_tags;
  return (
    <span className="row" style={{ gap: 5, flexWrap: "wrap", minWidth: 0 }}>
      <CellChip tone={verticalTone(row.vertical)}>{row.vertical_label}</CellChip>
      {row.origin === "rep" ? <CellChip tone="gold" className="repdot">{row.rep_name || "Rep desk"}</CellChip> : null}
      {!compact ? <CellChip tone={originTone(row.origin)}>{row.origin_label}</CellChip> : null}
      {tags.map((tag) => <CellChip key={tag} tone="mut">{tag}</CellChip>)}
    </span>
  );
}

export function UnifiedStageMeter({ row }: { row: UnifiedFileRow }) {
  const stage = activeStage(row);
  const progress = stage.total ? Math.round((stage.index / stage.total) * 100) : 0;
  return (
    <div style={{ minWidth: 110 }}>
      <div className="row split" style={{ gap: 8 }}>
        <span className="sub trunc">{stage.label}</span>
        <b className="num">{progress}%</b>
      </div>
      <div className="track" style={{ marginTop: 5 }}><div className="fill" style={{ width: `${progress}%` }} /></div>
    </div>
  );
}

export function UnifiedDocumentPack({ row }: { row: UnifiedFileRow }) {
  const pack = documentPackFor(row);
  const progress = row.document_progress;
  const docsTone: ChipTone = progress.docs_total > 0 && progress.docs_uploaded >= progress.docs_total ? "ok" : progress.docs_uploaded ? "warn" : "bad";
  const signaturesTone: ChipTone = progress.signatures_total > 0 && progress.signatures_uploaded >= progress.signatures_total ? "ok" : progress.signatures_uploaded ? "warn" : "bad";
  return (
    <div className="row" style={{ gap: 5 }} title={pack.required.join(", ")}>
      <CellChip tone={docsTone}>{progress.docs_uploaded}/{progress.docs_total} docs</CellChip>
      <CellChip tone={signaturesTone}>{progress.signatures_uploaded}/{progress.signatures_total} signatures</CellChip>
    </div>
  );
}

export function UnifiedOperatorFilters({
  value,
  onChange,
  rows = [],
}: {
  value: UnifiedFilterState;
  onChange: (next: UnifiedFilterState) => void;
  rows?: UnifiedFileRow[];
}) {
  const verticalCount = (vertical: UnifiedVertical | "all") =>
    vertical === "all" ? rows.length : rows.filter((row) => row.vertical === vertical).length;
  const originCount = (origin: UnifiedOrigin | "all") =>
    origin === "all" ? rows.length : rows.filter((row) => row.origin === origin).length;
  return (
    <>
      <div className="vfilter">
        {VERTICAL_OPTIONS.map((option) => (
          <button
            type="button"
            key={option.value}
            className={value.vertical === option.value ? "on" : undefined}
            onClick={() => onChange({ ...value, vertical: option.value })}
          >
            {option.label}<span className="tag" style={{ marginLeft: 7 }}>{verticalCount(option.value)}</span>
          </button>
        ))}
        <span className="sp" />
        <span className="lbl">Source</span>
        <Seg
          as="filter"
          ariaLabel="Pipeline source"
          value={value.origin}
          onChange={(origin) => onChange({ ...value, origin })}
          options={ORIGIN_OPTIONS.map((option) => ({
            value: option.value,
            label: <>{option.label.replace(" origins", "")}<span className="tag" style={{ marginLeft: 6 }}>{originCount(option.value)}</span></>,
          }))}
        />
      </div>
      <div className="pagebar" style={{ paddingTop: 2 }}>
        <span className="sub">Working ladders change by vertical. Every file uses the same funding ladder after the gate.</span>
        <span className="spacer" />
        <div className="field box" style={{ width: 290 }}>
          <Icon name="search" size={14} />
          <input
            value={value.q}
            onChange={(event) => onChange({ ...value, q: event.target.value })}
            placeholder="Search files, clients, reps..."
            aria-label="Search pipeline"
          />
        </div>
      </div>
    </>
  );
}

export function UnifiedFilesTable({
  rows,
  empty = "No files match these filters.",
  onLinkBucketIntake,
}: {
  rows: UnifiedFileRow[];
  empty?: string;
  onLinkBucketIntake?: (row: UnifiedFileRow) => void;
}) {
  return (
    <Table
      caption="Unified operator files"
      cols={[
        { label: "File", width: "25%" },
        { label: "Vertical", width: 120 },
        { label: "Source", width: 120 },
        { label: "Stage", width: "17%" },
        { label: "Program" },
        { label: "Coverage", width: 150 },
        { label: "Health", width: 110 },
        { label: "", width: 44 },
      ]}
    >
      {rows.length ? rows.map((row) => (
        <Tr key={row.id} onClick={() => { window.location.href = operatorFileHref(row); }}>
          <Td><b>{row.title || row.label}</b><div className="sub num">{row.ref || row.id} · {formatUnifiedAmount(row.amount)}</div></Td>
          <Td><CellChip tone={verticalTone(row.vertical)}>{row.vertical_label}</CellChip></Td>
          <Td><CellChip tone={originTone(row.origin)}>{row.origin_label}</CellChip></Td>
          <Td><UnifiedStageMeter row={row} /></Td>
          <Td><span className="sub">{row.program_tags.slice(0, 2).join(" · ") || "Unassigned"}</span></Td>
          <Td><UnifiedDocumentPack row={row} /></Td>
          <Td><CellChip tone={row.health_tone}>{row.health}</CellChip></Td>
          <Td align="r"><UnifiedActionMenu row={row} onLinkBucketIntake={onLinkBucketIntake} /></Td>
        </Tr>
      )) : (
        <Tr><Td colSpan={8}><div className="empty">{empty}</div></Td></Tr>
      )}
    </Table>
  );
}

export function UnifiedFileSummaryCard({ row, onLinkBucketIntake }: { row: UnifiedFileRow; onLinkBucketIntake?: (row: UnifiedFileRow) => void }) {
  const stage = activeStage(row);
  return (
    <div className="kcard" style={{ cursor: "default" }}>
      <div className="row" style={{ gap: 5, marginBottom: 4 }}>
        <UnifiedFileTags row={row} compact />
        <span className="sp" />
        <UnifiedActionMenu row={row} onLinkBucketIntake={onLinkBucketIntake} />
      </div>
      <Link href={operatorFileHref(row)} className="linkreset">
        <div className="trunc" style={{ fontSize: 12.8, fontWeight: 640 }}>{row.title || row.label}</div>
        <div className="sub num trunc" style={{ fontSize: 10.5, marginTop: 1 }}>{row.ref || row.id} · {stage.label}</div>
        <div className="row split" style={{ marginTop: 8 }}>
          <b className="num" style={{ fontSize: 12.5 }}>{formatUnifiedAmount(row.amount)}</b>
          <CellChip tone={row.health_tone}>{row.health}</CellChip>
        </div>
      </Link>
    </div>
  );
}

function normalizedWorkingIndex(row: UnifiedFileRow): number {
  const stage = row.working_stage;
  if (!stage) return 0;
  if (row.vertical === "real_estate") return Math.min(3, Math.max(0, stage.index - 1));
  if (stage.index <= 1) return 0;
  if (stage.index === 2) return 1;
  if (stage.index === 3) return 2;
  return 3;
}

export function UnifiedKanbanBoard({ rows, vertical, onLinkBucketIntake }: { rows: UnifiedFileRow[]; vertical: UnifiedVertical | "all"; onLinkBucketIntake?: (row: UnifiedFileRow) => void }) {
  const workingRows = rows.filter((row) => !row.funding_stage);
  const fundingRows = rows.filter((row) => Boolean(row.funding_stage));
  const workingColumns = vertical === "all"
    ? NORMALIZED_WORKING.map((column, index) => ({ ...column, rows: workingRows.filter((row) => normalizedWorkingIndex(row) === index) }))
    : WORKING_LADDERS[vertical].map((stage) => ({ ...stage, sub: stage.label, rows: workingRows.filter((row) => row.working_stage?.key === stage.key) }));
  const fundingColumns = FUNDING_LADDER.map((stage) => ({
    ...stage,
    rows: fundingRows.filter((row) => row.funding_stage?.key === stage.key),
  }));
  return (
    <div className="board2">
      <div className="bandgrp">
        <div className="bandhd">{vertical === "real_estate" ? "Relationship sequence" : vertical === "all" ? "Working the file · normalized" : "Application sequence"}</div>
        <div className="cols">
          {workingColumns.map((column) => <BoardColumn key={column.key} label={column.label} sub={column.sub} rows={column.rows} onLinkBucketIntake={onLinkBucketIntake} />)}
        </div>
      </div>
      <div className="gatecol"><span className="ln" /><span className="tx" style={{ color: "var(--accent)" }}>Ready for funding</span><span className="ln" /></div>
      <div className="bandgrp">
        <div className="bandhd">Funding the file · identical for every vertical</div>
        <div className="cols">
          {fundingColumns.map((column) => <BoardColumn key={column.key} label={column.label} sub={column.rows.length ? formatUnifiedAmount(column.rows.reduce((sum, row) => sum + Number(row.amount || 0), 0)) : "—"} rows={column.rows} onLinkBucketIntake={onLinkBucketIntake} />)}
        </div>
      </div>
    </div>
  );
}

function BoardColumn({ label, sub, rows, onLinkBucketIntake }: { label: string; sub: string; rows: UnifiedFileRow[]; onLinkBucketIntake?: (row: UnifiedFileRow) => void }) {
  return (
    <div className="kcol">
      <div className="row split" style={{ marginBottom: 4 }}><span className="lbl" style={{ fontSize: 9.6 }}>{label}</span><span className="tag num">{rows.length}</span></div>
      <div className="sub trunc" style={{ fontSize: 10.5, marginBottom: 9 }}>{sub}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((row) => <UnifiedFileSummaryCard key={row.id} row={row} onLinkBucketIntake={onLinkBucketIntake} />)}
        {!rows.length ? <div className="sub" style={{ fontSize: 11, padding: "10px 2px", textAlign: "center", opacity: 0.7 }}>Nothing here</div> : null}
      </div>
    </div>
  );
}

export function UnifiedActionMenu({ row, onLinkBucketIntake }: { row: UnifiedFileRow; onLinkBucketIntake?: (row: UnifiedFileRow) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="popwrap" onClick={(event) => event.stopPropagation()}>
      <IconBtn aria-label={`Actions for ${row.title || row.label}`} onClick={() => setOpen((value) => !value)}><Icon name="dots" size={14} /></IconBtn>
      {open ? (
        <>
          <span className="menu-scrim" onClick={() => setOpen(false)} />
          <span className="actmenu">
            <button type="button" onClick={() => { window.location.href = operatorFileHref(row); }}>Open file</button>
            {(row.bucket_id || row.intake_id) && onLinkBucketIntake ? <button type="button" onClick={() => { setOpen(false); onLinkBucketIntake(row); }}>Manage linked evidence</button> : null}
          </span>
        </>
      ) : null}
    </span>
  );
}

export function BucketIntakeLinkDrawer({
  open,
  onClose,
  initialBucketId,
  initialIntakeId,
}: {
  open: boolean;
  onClose: () => void;
  initialBucketId?: string | null;
  initialIntakeId?: string | null;
  title?: string;
}) {
  const [step, setStep] = useState(1);
  const [bucketId, setBucketId] = useState("");
  const [intakeId, setIntakeId] = useState("");
  const [relationship, setRelationship] = useState<BucketIntakeLinkPayload["relationship"]>("supporting");
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState<{ count: number; reviewId: string | null; unlinked?: boolean } | null>(null);
  const [selectionKey, setSelectionKey] = useState("");
  const options = useBucketIntakeLinkOptions();
  const files = useOperatorBucketFiles(bucketId || null);
  const links = useBucketIntakeLinks({ bucketId: bucketId || null, intakeId: intakeId || null });
  const createLink = useLinkBucketIntake();
  const updateLink = useUpdateBucketIntakeLink();
  const unlink = useUnlinkBucketIntake();
  const existing = links.data?.find((link) => link.bucket_id === bucketId && link.intake_id === intakeId);
  const busy = createLink.isPending || updateLink.isPending || unlink.isPending;

  useEffect(() => {
    if (!open) return;
    setBucketId(initialBucketId || "");
    setIntakeId(initialIntakeId || "");
    setStep(1);
    setRelationship("supporting");
    setSelectedFileIds([]);
    setSelectionKey("");
    setNote("");
    setError(null);
    setCompleted(null);
  }, [open, initialBucketId, initialIntakeId]);

  useEffect(() => {
    const key = `${bucketId}:${intakeId}:${existing?.link_id || "new"}:${files.data?.length || 0}`;
    if (!bucketId || !intakeId || !files.data || key === selectionKey) return;
    setSelectedFileIds(existing?.linked_file_ids?.length ? existing.linked_file_ids : files.data.map((file) => file.id));
    setRelationship(existing?.relationship || "supporting");
    setNote(existing?.note || "");
    setSelectionKey(key);
  }, [bucketId, intakeId, existing, files.data, selectionKey]);

  const bucket = options.data?.buckets.find((item) => item.id === bucketId);
  const intake = options.data?.intakes.find((item) => item.id === intakeId);
  const toggleFile = (fileId: string) => setSelectedFileIds((current) => current.includes(fileId) ? current.filter((id) => id !== fileId) : [...current, fileId]);

  async function confirmLink() {
    if (!bucketId || !intakeId) return;
    setError(null);
    try {
      const result = existing
        ? await updateLink.mutateAsync({ linkId: existing.link_id, relationship, file_ids: selectedFileIds, note: note.trim() || undefined })
        : await createLink.mutateAsync({ bucket_id: bucketId, intake_id: intakeId, relationship, file_ids: selectedFileIds, note: note.trim() || undefined });
      setCompleted({ count: result.linked_file_ids?.length || 0, reviewId: result.review_id });
      setStep(4);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save this link.");
    }
  }

  async function confirmUnlink() {
    if (!existing) return;
    setError(null);
    try {
      const result = await unlink.mutateAsync(existing.link_id);
      setCompleted({ count: 0, reviewId: result.review_id, unlinked: true });
      setStep(4);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to unlink these records.");
    }
  }

  const counterpartReady = Boolean(bucketId && intakeId);
  const footer = step === 4 ? <><span className="sp" /><Btn variant="pri" onClick={onClose}>Done</Btn></> : (
    <>
      {step > 1 ? <Btn onClick={() => setStep((current) => Math.max(1, current - 1))}>Back</Btn> : <Btn onClick={onClose}>Cancel</Btn>}
      {step === 3 && existing ? <Btn className="danger" onClick={confirmUnlink} disabled={busy}>Unlink</Btn> : null}
      <span className="sp" />
      {step < 3 ? <Btn variant="pri" onClick={() => setStep(step + 1)} disabled={(step === 1 && !counterpartReady) || (step === 2 && files.isLoading)}>Continue</Btn> : null}
      {step === 3 ? <Btn variant="pri" onClick={confirmLink} disabled={busy}>{busy ? "Saving..." : existing ? "Update link" : "Confirm link"}</Btn> : null}
    </>
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      ariaLabel="Link bucket and AI intake"
      title={step === 4 ? completed?.unlinked ? "Evidence unlinked" : "Evidence linked" : existing ? "Update linked evidence" : "Link bucket and AI intake"}
      sub={step === 4 ? "The audit trail and intake review queue have been updated." : "Selected files remain in their source bucket. Elara receives read access by reference."}
      width="lg"
      closeOnBackdrop={!busy}
      footer={footer}
    >
      {step < 4 ? <DrawerSteps steps={["Counterpart", "Files", "Review", "Complete"]} current={step} /> : null}
      {error ? <div className="warnline" style={{ marginBottom: 14 }}>{error}</div> : null}
      {step === 1 ? (
        <div className="cg">
          <div className="s6"><Field label="Document bucket"><Select aria-label="Document bucket" value={bucketId} onChange={(event) => { setBucketId(event.target.value); setSelectionKey(""); }} disabled={Boolean(initialBucketId)}><option value="">Choose bucket</option>{options.data?.buckets.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.file_count} files</option>)}</Select></Field></div>
          <div className="s6"><Field label="AI intake"><Select aria-label="AI intake" value={intakeId} onChange={(event) => { setIntakeId(event.target.value); setSelectionKey(""); }} disabled={Boolean(initialIntakeId)}><option value="">Choose intake</option>{options.data?.intakes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</Select></Field></div>
          <div className="s12"><Field label="Relationship"><Select aria-label="Relationship" value={relationship} onChange={(event) => setRelationship(event.target.value as BucketIntakeLinkPayload["relationship"])}><option value="supporting">Supporting evidence</option><option value="source">Source documents</option><option value="primary">Primary relationship</option></Select></Field></div>
        </div>
      ) : null}
      {step === 2 ? (
        <div>
          <div className="row" style={{ marginBottom: 10 }}><div className="grow"><b>Select files Elara may read</b><div className="sub">{bucket?.label || "Bucket"} · {selectedFileIds.length} selected</div></div><Btn size="sm" onClick={() => setSelectedFileIds([])}>Clear</Btn><Btn size="sm" onClick={() => setSelectedFileIds(files.data?.map((file) => file.id) || [])}>Select all</Btn></div>
          <div className="panel">
            {files.isLoading ? <div className="empty">Loading bucket files...</div> : files.data?.length ? files.data.map((file) => (
              <label className="filerow" key={file.id}><input type="checkbox" checked={selectedFileIds.includes(file.id)} onChange={() => toggleFile(file.id)} /><span className="grow"><b>{file.file_name}</b><span className="sub">{file.content_type} · {Math.max(1, Math.round(file.size_bytes / 1024))} KB</span></span><CellChip tone={selectedFileIds.includes(file.id) ? "ok" : "mut"}>{selectedFileIds.includes(file.id) ? "Selected" : "Excluded"}</CellChip></label>
            )) : <div className="empty">This bucket has no active files.</div>}
          </div>
        </div>
      ) : null}
      {step === 3 ? (
        <div className="grid">
          <div className="hintbox"><b>Review before running</b><div className="sub">This changes AI evidence access and queues a new intake review.</div></div>
          <Panel title="Effects">
            <div className="kv"><span>Bucket</span><b>{bucket?.label || bucketId}</b></div>
            <div className="kv"><span>AI intake</span><b>{intake?.label || intakeId}</b></div>
            <div className="kv"><span>Files shared</span><b>{selectedFileIds.length}</b></div>
            <div className="kv"><span>Actor</span><b>Current signed-in operator</b></div>
            <div className="kv"><span>Execution</span><b>Immediately after confirmation</b></div>
            <div className="kv"><span>Reversible</span><b>Yes · unlink keeps source files intact</b></div>
          </Panel>
          <Field label="Audit note"><Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional reason or context" rows={3} /></Field>
        </div>
      ) : null}
      {step === 4 && completed ? (
        <div className="completed-state">
          <span className="botmark pet"><Icon name={completed.unlinked ? "link" : "check"} size={22} /></span>
          <h3>{completed.unlinked ? "Evidence access removed" : `${completed.count} file${completed.count === 1 ? "" : "s"} handed to Elara`}</h3>
          <p className="sub">{completed.unlinked ? "The relationship is reversible and remains visible in audit history." : "The intake review is queued with only the selected source references."}</p>
          {completed.reviewId ? <CellChip tone="acc">Review queued · {completed.reviewId.slice(0, 8)}</CellChip> : null}
        </div>
      ) : null}
    </Drawer>
  );
}
