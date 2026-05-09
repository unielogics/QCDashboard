"use client";

// Super Admin → Lending AI Settings → AI Identity & Global Rules
// Firm-wide AI persona configuration: the AI's name, voice, and the
// hard rules that apply across every customer conversation.
//
// These get injected at the TOP of every Realtor + Lending AI system
// prompt by app/routers/ai.py — so the AI introduces itself with this
// name, follows the firm's tone, and refuses anything in the global
// rules list regardless of per-client overrides.

import { useEffect, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/components/design-system/primitives";
import { LendingAIHeader } from "@/components/LendingAIHeader";
import { AINotDeployedBanner } from "@/components/AINotDeployedBanner";
import {
  isAINotDeployed,
  useFundingMetaRules,
  usePatchFundingMetaRules,
} from "@/hooks/useApi";

interface Identity {
  ai_name?: string;
  greeting_style?: "formal" | "friendly" | "concise";
  voice_summary?: string;
  brand_signature?: string;
  /** Hard rules the AI must always follow — surface as "never" / "always" lines. */
  global_rules?: string[];
  /** Topics the AI is NOT allowed to discuss (rate quotes, legal advice, etc). */
  forbidden_topics?: string[];
  /** What the AI says when redirecting from a forbidden topic. */
  redirect_template?: string;
}


const SUGGESTED_RULES = [
  "Never quote rates or APRs — always defer to the funding team",
  "Never promise loan approval before underwriting",
  "Never give legal, tax, or financial advice",
  "Never share another client's information",
  "Always identify yourself by name when starting a conversation",
  "Always confirm before taking an action that sends a message or document",
  "Always escalate to a human if the borrower expresses anger or distress",
  "If asked about a competitor, redirect politely to our offering",
];


export default function AIIdentityPage() {
  const { t } = useTheme();
  const { data, isLoading, error: idErr } = useFundingMetaRules("communication");
  const patch = usePatchFundingMetaRules("communication");

  const [identity, setIdentity] = useState<Identity>({});
  useEffect(() => {
    if (data?.rules) setIdentity((data.rules.identity as Identity) || {});
  }, [data?.rules]);

  async function save() {
    const next = { ...(data?.rules || {}), identity };
    await patch.mutateAsync(next);
  }

  function setRule(idx: number, value: string) {
    const next = [...(identity.global_rules || [])];
    next[idx] = value;
    setIdentity({ ...identity, global_rules: next });
  }
  function addRule(text: string = "") {
    setIdentity({ ...identity, global_rules: [...(identity.global_rules || []), text] });
  }
  function removeRule(idx: number) {
    setIdentity({
      ...identity,
      global_rules: (identity.global_rules || []).filter((_, i) => i !== idx),
    });
  }

  return (
    <div style={{ padding: 24, maxWidth: 880, margin: "0 auto" }}>
      <LendingAIHeader
        title="AI Identity & Global Rules"
        subtitle="The AI's name, voice, and the hard rules that apply across every conversation. These take precedence over per-agent or per-client overrides."
      />

      {isAINotDeployed(idErr) ? (
        <AINotDeployedBanner surface="Lending AI" />
      ) : isLoading ? (
        <Card pad={20}><div style={{ color: t.ink3 }}>Loading…</div></Card>
      ) : (
        <>
          {/* ── Identity ────────────────────────────────────────── */}
          <Card pad={20} style={{ marginBottom: 16 }}>
            <SectionLabel>Identity</SectionLabel>

            <Field label="AI name" t={t} hint="What your AI introduces itself as. e.g. Quinn, Athena, Rocky.">
              <input
                value={identity.ai_name || ""}
                onChange={e => setIdentity({ ...identity, ai_name: e.target.value })}
                placeholder="e.g. Quinn"
                style={input(t)}
              />
            </Field>

            <Field label="Greeting style" t={t}>
              <ChipRow
                options={[
                  { value: "formal", label: "Formal" },
                  { value: "friendly", label: "Friendly" },
                  { value: "concise", label: "Concise" },
                ]}
                value={identity.greeting_style || "friendly"}
                onChange={(v) => setIdentity({ ...identity, greeting_style: v as Identity["greeting_style"] })}
                t={t}
              />
            </Field>

            <Field label="Voice summary" t={t} hint="One or two sentences describing how the AI should sound.">
              <textarea
                value={identity.voice_summary || ""}
                onChange={e => setIdentity({ ...identity, voice_summary: e.target.value })}
                placeholder="e.g. Direct, knowledgeable about commercial real estate lending. Always references concrete numbers, never vague generalities."
                rows={2}
                style={{ ...input(t), resize: "vertical" }}
              />
            </Field>

            <Field label="Brand signature" t={t} hint="Optional sign-off appended to messages.">
              <input
                value={identity.brand_signature || ""}
                onChange={e => setIdentity({ ...identity, brand_signature: e.target.value })}
                placeholder="— Quinn, Qualified Commercial"
                style={input(t)}
              />
            </Field>
          </Card>

          {/* ── Global Rules ───────────────────────────────────── */}
          <Card pad={20} style={{ marginBottom: 16 }}>
            <SectionLabel>Global rules — applied to every conversation</SectionLabel>
            <div style={{ fontSize: 12, color: t.ink3, margin: "4px 0 14px" }}>
              The AI honors these rules regardless of per-agent or per-client overrides.
              Phrase as plain English &quot;never&quot; / &quot;always&quot; statements.
            </div>

            {(identity.global_rules || []).map((rule, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input
                  value={rule}
                  onChange={e => setRule(i, e.target.value)}
                  style={{ ...input(t), flex: 1 }}
                />
                <button
                  onClick={() => removeRule(i)}
                  style={{
                    padding: "6px 12px", fontSize: 12, fontWeight: 600,
                    borderRadius: 6, border: `1px solid ${t.line}`,
                    background: t.surface, color: t.danger, cursor: "pointer",
                  }}
                >
                  Remove
                </button>
              </div>
            ))}

            <button
              onClick={() => addRule("")}
              style={{
                marginTop: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600,
                borderRadius: 6, border: `1px dashed ${t.line}`,
                background: "transparent", color: t.ink3, cursor: "pointer",
              }}
            >
              + Add rule
            </button>

            {/* Suggested rules — quick-add pool */}
            <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${t.line}` }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: t.ink3,
                marginBottom: 8, textTransform: "uppercase",
              }}>
                Suggested rules (click to add)
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {SUGGESTED_RULES
                  .filter(s => !(identity.global_rules || []).includes(s))
                  .map(s => (
                    <button
                      key={s}
                      onClick={() => addRule(s)}
                      style={{
                        padding: "6px 10px", fontSize: 12,
                        borderRadius: 999, border: `1px solid ${t.line}`,
                        background: t.surface, color: t.ink2, cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      + {s}
                    </button>
                  ))}
              </div>
            </div>
          </Card>

          {/* ── Forbidden topics ───────────────────────────────── */}
          <Card pad={20} style={{ marginBottom: 16 }}>
            <SectionLabel>Off-limits topics</SectionLabel>
            <div style={{ fontSize: 12, color: t.ink3, margin: "4px 0 14px" }}>
              Comma-separated. The AI will refuse to engage on these and offer the redirect template instead.
            </div>

            <input
              value={(identity.forbidden_topics || []).join(", ")}
              onChange={e => setIdentity({
                ...identity,
                forbidden_topics: e.target.value
                  .split(",")
                  .map(s => s.trim())
                  .filter(Boolean),
              })}
              placeholder="e.g. exact rate quotes, legal advice, tax advice, competitor pricing"
              style={input(t)}
            />

            <Field label="When the AI redirects, it says:" t={t}>
              <textarea
                value={identity.redirect_template || ""}
                onChange={e => setIdentity({ ...identity, redirect_template: e.target.value })}
                placeholder="e.g. That's something the funding team will confirm directly with you. I can flag it now and they'll follow up — would that work?"
                rows={2}
                style={{ ...input(t), resize: "vertical" }}
              />
            </Field>
          </Card>

          <button onClick={save} disabled={patch.isPending} style={btnPrimary(t)}>
            {patch.isPending ? "Saving…" : "Save AI Identity"}
          </button>
        </>
      )}
    </div>
  );
}


// ── Helpers ─────────────────────────────────────────────────────────


function Field({
  label, hint, children, t,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  t: ReturnType<typeof useTheme>["t"];
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: t.ink3,
        marginBottom: 4, textTransform: "uppercase",
      }}>
        {label}
      </div>
      {hint ? (
        <div style={{ fontSize: 11, color: t.ink3, marginBottom: 6, lineHeight: 1.5 }}>
          {hint}
        </div>
      ) : null}
      {children}
    </div>
  );
}


function ChipRow({
  options, value, onChange, t,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  t: ReturnType<typeof useTheme>["t"];
}) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          style={{
            padding: "6px 14px", fontSize: 13, fontWeight: 600,
            borderRadius: 18, border: `1px solid ${value === o.value ? t.petrol : t.line}`,
            background: value === o.value ? t.petrol : t.surface,
            color: value === o.value ? "#fff" : t.ink,
            cursor: "pointer",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}


function input(t: ReturnType<typeof useTheme>["t"]) {
  return {
    width: "100%", padding: 8, fontSize: 13, fontFamily: "inherit",
    borderRadius: 6, border: `1px solid ${t.line}`,
    background: t.surface, color: t.ink,
  } as const;
}


function btnPrimary(t: ReturnType<typeof useTheme>["t"]) {
  return {
    padding: "10px 18px", fontSize: 13, fontWeight: 600,
    borderRadius: 6, border: `1px solid ${t.line}`,
    background: t.petrol, color: "#fff", cursor: "pointer",
  } as const;
}
