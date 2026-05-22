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

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
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
  const { t } = useTheme();
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

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: t.ink3,
    marginBottom: 6,
    display: "block",
  };
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    background: t.surface2,
    border: `1px solid ${t.line}`,
    color: t.ink,
    fontSize: 13,
    fontFamily: "inherit",
    outline: "none",
    resize: "vertical",
  };

  return (
    <div style={{ padding: 24, maxWidth: 1240, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <Link
          href="/admin/lending-ai"
          style={{ fontSize: 12, fontWeight: 700, color: t.petrol, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5 }}
        >
          <Icon name="arrowL" size={12} /> Lending AI
        </Link>
        <h1 style={{ margin: "8px 0 2px", fontSize: 24, fontWeight: 800, color: t.ink, letterSpacing: -0.4 }}>
          AI Training
        </h1>
        <div style={{ fontSize: 13, color: t.ink3 }}>
          Tune what the AI says and how it sounds, per task. Your config
          layers on top of each task&apos;s base prompt — leave a task
          blank to keep its default behavior.
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr)", gap: 16 }}>
        {/* ── Control panel ─────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Task selector */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {tasks.map((task) => {
              const on = task.task_key === selected;
              return (
                <button
                  key={task.task_key}
                  onClick={() => setSelected(task.task_key)}
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    padding: "8px 14px",
                    borderRadius: 999,
                    background: on ? t.brandSoft : "transparent",
                    border: `1px solid ${on ? t.brand + "40" : t.line}`,
                    color: on ? t.brand : t.ink2,
                    fontSize: 12.5,
                    fontWeight: 700,
                  }}
                >
                  {task.label}
                </button>
              );
            })}
          </div>

          {isLoading ? (
            <Card pad={24}><div style={{ fontSize: 13, color: t.ink3 }}>Loading…</div></Card>
          ) : !current ? (
            <Card pad={24}><div style={{ fontSize: 13, color: t.ink3 }}>No task selected.</div></Card>
          ) : (
            <Card pad={20}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={labelStyle}>Instructions</label>
                  <textarea
                    rows={5}
                    value={form.instructions}
                    onChange={(e) => set("instructions", e.target.value)}
                    placeholder="What this AI task should focus on, prioritize, or always do…"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Tone / voice</label>
                  <textarea
                    rows={2}
                    value={form.tone}
                    onChange={(e) => set("tone", e.target.value)}
                    placeholder="e.g. Warm and concise. Encouraging, never pushy. Plain language."
                    style={inputStyle}
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div>
                    <label style={labelStyle}>Do — one per line</label>
                    <textarea
                      rows={5}
                      value={form.dos}
                      onChange={(e) => set("dos", e.target.value)}
                      placeholder={"Lead with the borrower's first name\nName the exact document needed"}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Don&apos;t — one per line</label>
                    <textarea
                      rows={5}
                      value={form.donts}
                      onChange={(e) => set("donts", e.target.value)}
                      placeholder={"Quote rates\nUse legal jargon"}
                      style={inputStyle}
                    />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Example phrasings — one per line</label>
                  <textarea
                    rows={4}
                    value={form.examples}
                    onChange={(e) => set("examples", e.target.value)}
                    placeholder="Good example messages the AI should emulate…"
                    style={inputStyle}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button
                    onClick={onSave}
                    disabled={!dirty || save.isPending}
                    style={{
                      ...qcBtnPrimary(t),
                      opacity: !dirty || save.isPending ? 0.55 : 1,
                      cursor: !dirty || save.isPending ? "not-allowed" : "pointer",
                    }}
                  >
                    {save.isPending ? "Saving…" : "Save task"}
                  </button>
                  {savedMsg ? (
                    <span style={{ fontSize: 12, color: t.profit, fontWeight: 700 }}>{savedMsg}</span>
                  ) : dirty ? (
                    <span style={{ fontSize: 12, color: t.ink3 }}>Unsaved changes</span>
                  ) : null}
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* ── Corrections review ────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Card pad={0}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${t.line}` }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: t.ink, textTransform: "uppercase", letterSpacing: 0.6 }}>
                What operators flagged
              </div>
              <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 2 }}>
                Recent thumbs-down ratings + corrections. Use these to
                refine the instructions on the left.
              </div>
            </div>
            <div style={{ maxHeight: 560, overflowY: "auto" }}>
              {feedback.length === 0 ? (
                <div style={{ padding: 18, fontSize: 13, color: t.ink3 }}>
                  No flagged AI output yet.
                </div>
              ) : (
                feedback.map((f, i) => (
                  <div
                    key={`${f.kind}-${i}`}
                    style={{
                      padding: "12px 16px",
                      borderBottom: i < feedback.length - 1 ? `1px solid ${t.line}` : "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                      <span
                        style={{
                          fontSize: 9.5,
                          fontWeight: 900,
                          letterSpacing: 0.4,
                          textTransform: "uppercase",
                          padding: "2px 7px",
                          borderRadius: 999,
                          background: f.kind === "correction" ? t.brandSoft : t.dangerBg,
                          color: f.kind === "correction" ? t.brand : t.danger,
                        }}
                      >
                        {f.kind === "correction" ? "Correction" : "Thumbs-down"}
                      </span>
                      {f.output_type ? (
                        <span style={{ fontSize: 10.5, color: t.ink4 }}>{f.output_type}</span>
                      ) : null}
                      <span style={{ fontSize: 10.5, color: t.ink4, marginLeft: "auto" }}>
                        {new Date(f.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    </div>
                    <div style={{ fontSize: 12.5, color: t.ink2, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                      {f.text}
                    </div>
                    <button
                      onClick={() => useAsExample(f.text)}
                      style={{ ...qcBtn(t), marginTop: 8, fontSize: 11, padding: "5px 9px" }}
                      title="Append this to the selected task's example phrasings"
                    >
                      <Icon name="plus" size={11} /> Use as example
                    </button>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
