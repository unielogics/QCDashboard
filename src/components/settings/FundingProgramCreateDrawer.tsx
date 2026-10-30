"use client";

import { useEffect, useMemo, useState } from "react";
import { Btn, Callout, Field, Input, Textarea } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import type { FundingProgramVertical } from "@/lib/fundingPrograms";
import { draftIssues, programKeyFrom, publicSlugFrom, type FundingProgramDraftInput } from "./fundingProgramCreateModel";
export type { FundingProgramDraftInput } from "./fundingProgramCreateModel";

/**
 * Add a program to the funding catalog.
 *
 * The drawer creates the catalog row only. Its eligibility checks arrive as a
 * draft the operator reviews on the main screen, and "Save & enable" remains
 * the single act that makes a program live — publishing refuses criteria with
 * no eligibility check, so nothing here can quietly put an unfinished program
 * in front of a client.
 */

const VERTICAL_LABELS: Array<{ key: FundingProgramVertical; label: string }> = [
  { key: "dealer", label: "Auto dealerships" },
  { key: "main_street", label: "Main Street businesses" },
  { key: "real_estate", label: "Real estate" },
  { key: "mca", label: "MCA refinance" },
];

export function FundingProgramCreateDrawer({
  open,
  busy,
  error,
  takenKeys,
  takenSlugs,
  nextDisplayOrder,
  onClose,
  onCreate,
}: {
  open: boolean;
  busy: boolean;
  error: string | null;
  takenKeys: string[];
  takenSlugs: string[];
  nextDisplayOrder: number;
  onClose: () => void;
  onCreate: (draft: FundingProgramDraftInput) => void;
}) {
  const [name, setName] = useState("");
  const [keyEdited, setKeyEdited] = useState(false);
  const [slugEdited, setSlugEdited] = useState(false);
  const [programKey, setProgramKey] = useState("");
  const [publicSlug, setPublicSlug] = useState("");
  const [description, setDescription] = useState("");
  const [verticals, setVerticals] = useState<FundingProgramVertical[]>([]);
  const [reason, setReason] = useState("");
  const [showIssues, setShowIssues] = useState(false);

  useEffect(() => {
    if (open) return;
    setName(""); setProgramKey(""); setPublicSlug(""); setDescription("");
    setVerticals([]); setReason(""); setKeyEdited(false); setSlugEdited(false); setShowIssues(false);
  }, [open]);

  const draft: FundingProgramDraftInput = useMemo(() => ({
    name,
    program_key: keyEdited ? programKeyFrom(programKey) : programKeyFrom(name),
    public_slug: slugEdited ? publicSlugFrom(publicSlug) : publicSlugFrom(name),
    short_description: description,
    display_order: nextDisplayOrder,
    verticals,
    reason,
  }), [name, keyEdited, programKey, slugEdited, publicSlug, description, nextDisplayOrder, verticals, reason]);

  const issues = draftIssues(draft, takenKeys, takenSlugs);

  function submit() {
    if (issues.length) { setShowIssues(true); return; }
    onCreate(draft);
  }

  return <Drawer
    open={open}
    onClose={onClose}
    title="New funding program"
    sub="Creates the catalog entry and a criteria draft. Nothing reaches a client until you enable it."
    width="md"
    closeOnBackdrop={false}
    ariaLabel="New funding program"
    footer={<>
      <Btn onClick={onClose}>Cancel</Btn>
      <Btn variant="pri" onClick={submit} disabled={busy}>{busy ? "Creating…" : "Create program"}</Btn>
    </>}
  >
    <div style={{ display: "grid", gap: 12 }}>
      {error ? <Callout tone="bad">{error}</Callout> : null}
      {showIssues && issues.length ? <Callout tone="warn"><ul style={{ margin: 0, paddingLeft: 16 }}>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></Callout> : null}

      <Field label="Program name" req hint="How the desk and the client see it, e.g. “10-Year Term Loan”.">
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="10-Year Term Loan" />
      </Field>

      <Field label="Program key" req hint="Permanent identifier used by eligibility rules and file history. Derived from the name; edit only if you must.">
        <Input
          value={keyEdited ? programKey : draft.program_key}
          onChange={(event) => { setKeyEdited(true); setProgramKey(event.target.value); }}
          placeholder="ten_year_term"
        />
      </Field>

      <Field label="Public slug" req hint="Used in the public program page address on the marketing site.">
        <Input
          value={slugEdited ? publicSlug : draft.public_slug}
          onChange={(event) => { setSlugEdited(true); setPublicSlug(event.target.value); }}
          placeholder="ten-year-term"
        />
      </Field>

      <Field label="Short description" hint="One or two sentences. Shown to the client and given to the underwriting AI.">
        <Textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
      </Field>

      <Field label="Workspaces" req hint="Where this program can be offered. A program with no workspace can never match a file.">
        <div className="funding-program-verticals">
          {VERTICAL_LABELS.map((item) => <label key={item.key}>
            <input
              type="checkbox"
              checked={verticals.includes(item.key)}
              onChange={(event) => setVerticals((current) => event.target.checked
                ? [...current, item.key]
                : current.filter((value) => value !== item.key))}
            />
            {item.label}
          </label>)}
        </div>
      </Field>

      <Field label="Why are you adding this?" req hint="Recorded on the audit trail with your name.">
        <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Onboarding the lender's published program sheet" />
      </Field>

      <Callout tone="mut">
        After creating it, review the suggested eligibility checks and documents on the program
        screen, then choose <strong>Save &amp; enable</strong>. A program cannot be enabled until it
        has at least one eligibility check.
      </Callout>
    </div>
  </Drawer>;
}
