"use client";

import { useEffect, useMemo, useState } from "react";
import { Btn, Callout, CellChip, Input, Select } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { errorMessage } from "@/components/marketplace/shared";
import { useClosingStipulations, useSaveClosingStipulations, useSeedClosingStipulations, type ClosingStipulationItem } from "@/hooks/useApi";

const STATUS_LABELS: Record<ClosingStipulationItem["status"], string> = { open: "Open", received: "Received", waived: "Waived" };

/** What must be in hand before funding, once the client has accepted: the accepted terms' conditions
 *  seed the list, the desk adds its own, and marks each received or waived. Nothing is deleted. */
export function ClosingStipulationsPanel({ profileId, canEdit, onOpenEconomics }: { profileId: string; canEdit: boolean; onOpenEconomics?: () => void }) {
  const query = useClosingStipulations(profileId);
  const save = useSaveClosingStipulations(profileId);
  const seed = useSeedClosingStipulations(profileId);
  const [draft, setDraft] = useState<ClosingStipulationItem[]>([]);
  const [newText, setNewText] = useState("");
  const [savedKey, setSavedKey] = useState("");
  const block = query.data;
  const serverKey = useMemo(() => JSON.stringify(block?.items ?? []), [block]);
  useEffect(() => { if (block) { setDraft(block.items); setSavedKey(serverKey); } }, [block, serverKey]);
  const dirty = JSON.stringify(draft) !== savedKey;
  const editable = canEdit && Boolean(block?.accepted);
  const unseeded = (block?.terms_conditions ?? []).filter((c) => !draft.some((d) => d.text.trim().toLowerCase() === c.trim().toLowerCase()));

  function patch(index: number, change: Partial<ClosingStipulationItem>) {
    setDraft((rows) => rows.map((row, i) => (i === index ? { ...row, ...change } : row)));
  }
  function add() {
    const text = newText.trim();
    if (!text) return;
    setDraft((rows) => [...rows, { text, source: "desk", status: "open", note: null }]);
    setNewText("");
  }

  if (query.isLoading && !block) return <div className="empty">Reading the stipulations…</div>;
  if (query.error || !block) return <Callout tone="warn">{errorMessage(query.error, "The stipulations could not be read.")}</Callout>;
  const open = draft.filter((d) => d.status === "open").length;
  return (
    <div className="grid g10 closing-stipulations" aria-label="Stipulations to close">
      {!block.accepted ? (
        <Callout tone="mut">
          <b>Stipulations open once the client accepts.</b> Record the accepted amount in the Accepted step{onOpenEconomics ? <> (<button type="button" className="linklike" onClick={onOpenEconomics}>open it</button>)</> : null}; the conditions on the accepted terms then seed this list.
        </Callout>
      ) : (
        <div className="closing-stipulations-head">
          <div className="closing-stipulations-chips">
            <CellChip tone={block.ready_to_close && !dirty ? "ok" : open ? "warn" : "mut"}>{draft.length ? `${open} open · ${draft.filter((d) => d.status === "received").length} received · ${draft.filter((d) => d.status === "waived").length} waived` : "No stipulations yet"}</CellChip>
            {block.ready_to_close && !dirty ? <CellChip tone="ok">Ready to close</CellChip> : null}
            {block.estimated_close_date ? <CellChip tone="mut">Estimated close {block.estimated_close_date}</CellChip> : <CellChip tone="mut">No estimated close date yet · set it in the Accepted step</CellChip>}
          </div>
          {unseeded.length && editable ? <Btn size="sm" onClick={() => seed.mutate()} disabled={seed.isPending}><Icon name="docCheck" size={14} />{seed.isPending ? "Adding…" : `Add the ${unseeded.length} condition${unseeded.length === 1 ? "" : "s"} from the accepted terms`}</Btn> : null}
        </div>
      )}
      {draft.length ? (
        <div className="tbl-wrap">
          <table className="tbl closing-stipulations-table">
            <thead><tr><th>Stipulation</th><th>From</th><th>Status</th><th>Note</th></tr></thead>
            <tbody>
              {draft.map((row, i) => (
                <tr key={row.id ?? `new-${i}`} className={row.status === "waived" ? "muted" : undefined}>
                  <td><Input aria-label={`Stipulation ${i + 1}`} value={row.text} disabled={!editable} onChange={(e) => patch(i, { text: e.target.value })} /></td>
                  <td><CellChip tone="mut">{row.source === "term_sheet" ? "Accepted terms" : "Desk"}</CellChip></td>
                  <td>
                    <Select aria-label={`Status of stipulation ${i + 1}`} value={row.status} disabled={!editable} onChange={(e) => patch(i, { status: e.target.value as ClosingStipulationItem["status"] })}>
                      {(Object.keys(STATUS_LABELS) as ClosingStipulationItem["status"][]).map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                    </Select>
                  </td>
                  <td><Input aria-label={`Note on stipulation ${i + 1}`} placeholder={row.status === "received" ? "Received Nov 4, in the room" : row.status === "waived" ? "Why it is waived" : ""} value={row.note ?? ""} disabled={!editable} onChange={(e) => patch(i, { note: e.target.value || null })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : block.accepted ? <p className="sub">Nothing listed yet. Add the conditions from the accepted terms, or type the desk's own.</p> : null}
      {editable ? (
        <div className="closing-stipulations-add">
          <Input aria-label="New stipulation" placeholder="Add a stipulation, for example: landlord waiver signed" value={newText} onChange={(e) => setNewText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
          <Btn size="sm" onClick={add} disabled={!newText.trim()}><Icon name="plus" size={14} />Add</Btn>
          <Btn variant="pri" size="sm" onClick={() => save.mutate(draft)} disabled={!dirty || save.isPending}>{save.isPending ? "Saving…" : "Save stipulations"}</Btn>
          {save.error ? <span className="sub">{errorMessage(save.error, "The stipulations could not be saved.")}</span> : dirty ? <span className="sub">Unsaved changes</span> : null}
        </div>
      ) : null}
    </div>
  );
}
