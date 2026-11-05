"use client";

// Add a requirement to this file's checklist from the library of things we
// already know how to ask for: documents, and the forms a client can fill in
// online. Pick one, say how much it matters, and it is on the checklist like
// everything else, asked for, read by the AI and counted toward readiness.
// Something that is not in the library can be named here and joins it for the
// next file.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Btn, Callout, CellChip, Field, Input, Seg, Select, Sub, Textarea, cx } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { Icon } from "@/components/design-system/Icon";
import { useAuthedApi } from "@/hooks/useApi";
import { ApiError } from "@/lib/api";
import type { ApplicationProgramReadiness as Readiness } from "@/lib/applicationProfile";
import type { FormKind } from "@/lib/formAnswers";
import { filterLibrary, groupLibrary, type RequirementLibrary, type LibraryItem, type LibraryLevel } from "@/lib/requirementLibrary";

const LEVELS: { value: LibraryLevel; label: string }[] = [
  { value: "required", label: "Required: the file is not ready without it" },
  { value: "recommended", label: "Recommended: ask for it, but it does not block" },
  { value: "optional", label: "Optional: nice to have" },
];

function message(reason: unknown): string {
  if (reason instanceof ApiError) return reason.message;
  return reason instanceof Error ? reason.message : "The requirement could not be added.";
}

export function AddRequirementDrawer({
  profileId,
  open,
  onClose,
  onAdded,
  initialKind = "all",
}: {
  profileId: string;
  open: boolean;
  onClose: () => void;
  /** The checklist as it is now, and the key that was just added so the list can open it. */
  onAdded: (readiness: Readiness, addedKey: string | null) => void;
  initialKind?: "all" | "document" | "form";
}) {
  const api = useAuthedApi();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | "document" | "form">(initialKind);
  const [picked, setPicked] = useState<string | null>(null);
  const [level, setLevel] = useState<LibraryLevel | "">("");
  const [note, setNote] = useState("");
  const [custom, setCustom] = useState(false);
  const [customDraft, setCustomDraft] = useState({ label: "", category: "", instructions: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const library = useQuery({
    queryKey: ["requirement-library", profileId],
    queryFn: () => api<RequirementLibrary>(`/application-profiles/${profileId}/requirement-library`),
    enabled: open,
    staleTime: 30_000,
  });
  const data = library.data;
  const visible = useMemo(() => (data ? filterLibrary(data.items, query, kind) : []), [data, query, kind]);
  const groups = useMemo(() => groupLibrary(visible), [visible]);
  const selected: LibraryItem | null = data?.items.find((item) => item.key === picked) ?? null;
  const chosenLevel: LibraryLevel = (level || selected?.required_level || "required") as LibraryLevel;
  const customReady = customDraft.label.trim().length >= 2 && Boolean(customDraft.category);

  const reset = () => {
    setQuery(""); setKind(initialKind); setPicked(null); setLevel(""); setNote(""); setCustom(false);
    setCustomDraft({ label: "", category: "", instructions: "" }); setError("");
  };
  const close = () => { if (busy) return; reset(); onClose(); };

  async function add() {
    if (busy || (!custom && !selected) || (custom && !customReady)) return;
    setBusy(true);
    setError("");
    try {
      const body = custom
        ? { custom: { label: customDraft.label.trim(), category: customDraft.category, instructions: customDraft.instructions.trim() || undefined }, required_level: chosenLevel }
        : { requirement_key: selected!.key, required_level: chosenLevel, note: note.trim() || undefined };
      const readiness = await api<Readiness>(`/application-profiles/${profileId}/requirements`, { method: "POST", body: JSON.stringify(body) });
      const addedKey = custom
        ? readiness.requirements.find((item) => item.label.trim().toLowerCase() === customDraft.label.trim().toLowerCase())?.requirement_key ?? null
        : selected!.key;
      reset();
      onAdded(readiness, addedKey);
      void library.refetch();
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={close}
      width="md"
      closeOnBackdrop={!busy}
      title="Add a requirement"
      sub="Pick something from the library. It goes on the checklist like everything else: the client is asked, the AI reads what comes back, and it counts toward readiness."
      ariaLabel="Add a requirement to this file's checklist"
      footer={<>
        <Btn onClick={close} disabled={busy}>Cancel</Btn>
        <span className="sp" />
        <Btn variant="pri" onClick={() => void add()} disabled={busy || (custom ? !customReady : !selected)}>
          {busy ? "Adding..." : custom ? "Add it and ask for it" : selected ? `Add ${selected.label}` : "Choose something to add"}
        </Btn>
      </>}
    >
      <div className="ev-lib">
        {error ? <Callout tone="bad">{error}</Callout> : null}
        {library.isLoading ? <div className="empty"><span className="spinner solo" />Loading the library...</div> : null}
        {library.isError ? <Callout tone="warn">{message(library.error)}</Callout> : null}
        {data ? (
          <>
            <div className="ev-lib-tools">
              <Input autoFocus aria-label="Search the library" placeholder="Search documents and forms" value={query} onChange={(event) => setQuery(event.target.value)} />
              <Seg as="filter" ariaLabel="Show" value={kind} onChange={setKind} options={[{ value: "all", label: "Everything" }, { value: "document", label: "Documents" }, { value: "form", label: "Forms" }]} />
            </div>
            {!custom ? (
              <div className="ev-lib-list" role="radiogroup" aria-label="Requirements you can add">
                {groups.map((group) => (
                  <section key={group.label} className="ev-lib-group">
                    <h4>{group.label}</h4>
                    {group.items.map((item) => (
                      <label key={item.key} className={cx("ev-lib-item", picked === item.key && "on", item.on_file && "off")}>
                        <input type="radio" name="requirement" value={item.key} disabled={item.on_file} checked={picked === item.key} onChange={() => { setPicked(item.key); setLevel(""); }} />
                        <span className="ev-lib-text">
                          <strong>{item.label}</strong>
                          {item.description ? <small>{item.description}</small> : null}
                        </span>
                        {item.on_file ? <CellChip tone="mut">Already on this file</CellChip> : item.kind === "form" ? <CellChip tone="acc">Form · fills in online</CellChip> : <CellChip tone="mut">Document</CellChip>}
                      </label>
                    ))}
                  </section>
                ))}
                {!groups.length ? <div className="empty">Nothing in the library matches. You can add your own below.</div> : null}
              </div>
            ) : null}
            {selected && !custom ? (
              <div className="ev-lib-pick">
                <Field label="How much does it matter?">
                  <Select value={chosenLevel} onChange={(event) => setLevel(event.target.value as LibraryLevel)}>{LEVELS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</Select>
                </Field>
                <Field label="Note for your team (optional)"><Textarea rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Why this file needs it" /></Field>
                {selected.form_kind ? <Sub>{formHint(selected.form_kind)}</Sub> : null}
              </div>
            ) : null}
            <div className="ev-lib-custom">
              <button type="button" className="linky" aria-expanded={custom} onClick={() => { setCustom((on) => !on); setPicked(null); }}>
                <Icon name={custom ? "chevU" : "plus"} size={13} /> {custom ? "Back to the library" : "Not in the list? Add your own"}
              </button>
              {custom ? (
                <div className="ev-lib-pick">
                  <Field label="What do you need?"><Input autoFocus maxLength={120} placeholder="For example: Signed lease for the second location" value={customDraft.label} onChange={(event) => setCustomDraft((draft) => ({ ...draft, label: event.target.value }))} /></Field>
                  <Field label="Kind of document">
                    <Select value={customDraft.category} onChange={(event) => setCustomDraft((draft) => ({ ...draft, category: event.target.value }))}>
                      <option value="">Choose a category...</option>
                      {data.categories.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                    </Select>
                  </Field>
                  <Field label="What the client should send (optional)"><Textarea rows={3} maxLength={1000} value={customDraft.instructions} onChange={(event) => setCustomDraft((draft) => ({ ...draft, instructions: event.target.value }))} placeholder="Instructions the client sees" /></Field>
                  <Field label="How much does it matter?">
                    <Select value={chosenLevel} onChange={(event) => setLevel(event.target.value as LibraryLevel)}>{LEVELS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</Select>
                  </Field>
                  <Sub>It joins the library, so the next file can pick it from the list.</Sub>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </Drawer>
  );
}

function formHint(kind: FormKind): string {
  return ({
    debt_schedule: "The client can fill this in online from a link, or upload a file. A file we read becomes a table you can complete.",
    pfs: "The client can fill in the personal financial statement online from a link, or upload their own.",
    p_and_l: "The client can fill in the profit and loss online from a link, or upload their own.",
    balance_sheet: "The client can fill in the balance sheet online from a link, or upload their own.",
  } as Record<FormKind, string>)[kind];
}
