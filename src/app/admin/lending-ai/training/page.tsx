"use client";

// Super Admin → Lending AI → AI Training.
//
// Two surfaces:
//   • Control panel — per AI task type, edit the instructions + tone +
//     do's/don'ts + example phrasings. Saved config layers on top of
//     the task's base prompt at runtime (see backend task_training.py).
//   • Corrections review — recent thumbs-down ratings + operator
//     corrections; "use as example" feeds one into the selected task.
//
// v1 covers the three borrower-facing task types. Super-admin only.
//
// Styling migrated off the inline token objects onto the plain-CSS design
// system (globals.css + app-extras.css) via the wrappers in @/components/ds.
// The role bounce, the dirty-state gate, the save payload and the
// use-as-example append are unchanged; only the surface vocabulary moved:
//   local labelStyle/inputStyle → Field + Textarea (`.field`)
//   hand-rolled task pills      → Seg as="tabs" (it switches which task's
//                                 config you are editing)
//   two-column page split       → CG + `.s7`/`.s5`, which also collapses on a
//                                 narrow viewport (the fixed 1.6fr/1fr did not)
//   feedback list rows          → `.gridrow.top`, which owns the hairline and
//                                 drops it on the last row
// The page no longer sets its own padding or max-width — the shell's
// `.content` owns both.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Btn, CellChip, CG, Empty, Field, Loading, PageHeader, Panel, Row, Seg, StatusLine, Sub, Textarea } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useActiveProfile } from "@/store/role";
import { Role } from "@/lib/enums.generated";
import {
  useAiTaskConfigs,
  useSaveAiTaskConfig,
  useAiTrainingFeedback,
  type AiTaskConfig,
} from "@/hooks/useApi";

const linesToArr = (s: string): string[] =>
  s.split("\n").map((x) => x.trim()).filter(Boolean);
const arrToLines = (a: string[]): string => (a || []).join("\n");

type Form = {
  instructions: string;
  tone: string;
  dos: string;
  donts: string;
  examples: string;
};

function formOf(cfg: AiTaskConfig | undefined): Form {
  return {
    instructions: cfg?.instructions ?? "",
    tone: cfg?.tone ?? "",
    dos: arrToLines(cfg?.dos ?? []),
    donts: arrToLines(cfg?.donts ?? []),
    examples: arrToLines(cfg?.examples ?? []),
  };
}

export default function AiTrainingPage() {
  const router = useRouter();
  const profile = useActiveProfile();

  const { data, isLoading } = useAiTaskConfigs();
  const { data: feedback = [] } = useAiTrainingFeedback();
  const save = useSaveAiTaskConfig();

  const tasks = useMemo(() => data?.tasks ?? [], [data]);
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(formOf(undefined));
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  // Default the selection to the first task once loaded.
  useEffect(() => {
    if (!selected && tasks.length > 0) setSelected(tasks[0].task_key);
  }, [tasks, selected]);

  const current = tasks.find((x) => x.task_key === selected);

  // Sync the form whenever the selected task (or its server data) changes.
  useEffect(() => {
    setForm(formOf(current));
    setSavedMsg(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, current?.task_key, data]);

  // Super-admin only — bounce anyone else.
  useEffect(() => {
    if (profile.role && profile.role !== Role.SUPER_ADMIN) router.replace("/");
  }, [profile.role, router]);
  if (profile.role && profile.role !== Role.SUPER_ADMIN) return null;

  const baseline = formOf(current);
  const dirty =
    form.instructions !== baseline.instructions ||
    form.tone !== baseline.tone ||
    form.dos !== baseline.dos ||
    form.donts !== baseline.donts ||
    form.examples !== baseline.examples;

  const set = <K extends keyof Form>(k: K, v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const onSave = async () => {
    if (!selected) return;
    await save.mutateAsync({
      taskKey: selected,
      payload: {
        instructions: form.instructions.trim(),
        tone: form.tone.trim(),
        dos: linesToArr(form.dos),
        donts: linesToArr(form.donts),
        examples: linesToArr(form.examples),
      },
    });
    setSavedMsg("Saved — the AI uses this on its next message.");
    setTimeout(() => setSavedMsg(null), 4000);
  };

  const useAsExample = (text: string) => {
    setForm((p) => ({
      ...p,
      examples: p.examples ? `${p.examples}\n${text}` : text,
    }));
  };

  return (
    <div className="grid">
      <div>
        <Link href="/admin/lending-ai" className="crumb">
          <Icon name="arrowL" size={12} /> Lending AI
        </Link>
        <PageHeader
          title="AI Training"
          lede="Tune what the AI says and how it sounds, per task. Your config layers on top of each task's base prompt — leave a task blank to keep its default behavior."
        />
      </div>

      <CG>
        {/* ── Control panel ─────────────────────────────────────── */}
        <div className="s7 grid g10">
          {/* Task selector */}
          {tasks.length > 0 && selected ? (
            <Row>
              <Seg
                as="tabs"
                ariaLabel="AI task"
                value={selected}
                onChange={setSelected}
                options={tasks.map((task) => ({ value: task.task_key, label: task.label }))}
              />
            </Row>
          ) : null}

          {isLoading ? (
            <Panel><Loading>Loading…</Loading></Panel>
          ) : !current ? (
            <Panel><Empty>No task selected.</Empty></Panel>
          ) : (
            <Panel bodyClass="grid">
              <Field label="Instructions">
                <Textarea
                  rows={5}
                  value={form.instructions}
                  onChange={(e) => set("instructions", e.target.value)}
                  placeholder="What this AI task should focus on, prioritize, or always do…"
                />
              </Field>
              <Field label="Tone / voice">
                <Textarea
                  rows={2}
                  value={form.tone}
                  onChange={(e) => set("tone", e.target.value)}
                  placeholder="e.g. Warm and concise. Encouraging, never pushy. Plain language."
                />
              </Field>
              <div className="fldgrid two">
                <Field label="Do — one per line">
                  <Textarea
                    rows={5}
                    value={form.dos}
                    onChange={(e) => set("dos", e.target.value)}
                    placeholder={"Lead with the borrower's first name\nName the exact document needed"}
                  />
                </Field>
                <Field label="Don't — one per line">
                  <Textarea
                    rows={5}
                    value={form.donts}
                    onChange={(e) => set("donts", e.target.value)}
                    placeholder={"Quote rates\nUse legal jargon"}
                  />
                </Field>
              </div>
              <Field label="Example phrasings — one per line">
                <Textarea
                  rows={4}
                  value={form.examples}
                  onChange={(e) => set("examples", e.target.value)}
                  placeholder="Good example messages the AI should emulate…"
                />
              </Field>
              <Row>
                <Btn variant="pri" onClick={onSave} disabled={!dirty || save.isPending}>
                  {save.isPending ? "Saving…" : "Save task"}
                </Btn>
                {savedMsg ? (
                  // A sentence, not a word — `.cellchip` is nowrap inside a
                  // panel that is overflow:hidden and would clip it silently.
                  <StatusLine tone="ok">{savedMsg}</StatusLine>
                ) : dirty ? (
                  <Sub>Unsaved changes</Sub>
                ) : null}
              </Row>
            </Panel>
          )}
        </div>

        {/* ── Corrections review ────────────────────────────────── */}
        <div className="s5">
          <Panel
            title="What operators flagged"
            sub="Recent thumbs-down ratings + corrections. Use these to refine the instructions on the left."
            noPad
          >
            <div className="qscroll">
              {feedback.length === 0 ? (
                <div className="panel-b"><Empty>No flagged AI output yet.</Empty></div>
              ) : (
                feedback.map((f, i) => (
                  // `.gridrow.top` owns the hairline between entries and drops
                  // it on the last one, which the old `i < len - 1` did by hand.
                  <div key={`${f.kind}-${i}`} className="gridrow top">
                    <Row>
                      <CellChip
                        className="caps"
                        tone={f.kind === "correction" ? "acc" : "bad"}
                      >
                        {f.kind === "correction" ? "Correction" : "Thumbs-down"}
                      </CellChip>
                      {f.output_type ? <Sub>{f.output_type}</Sub> : null}
                      <span className="grow" />
                      <Sub>
                        {new Date(f.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </Sub>
                    </Row>
                    <div className="pretext">{f.text}</div>
                    <Row>
                      <Btn
                        size="sm"
                        onClick={() => useAsExample(f.text)}
                        title="Append this to the selected task's example phrasings"
                      >
                        <Icon name="plus" size={11} /> Use as example
                      </Btn>
                    </Row>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>
      </CG>
    </div>
  );
}
