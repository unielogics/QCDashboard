"use client";

// Super Admin → Lending AI Settings → AI Identity & Global Rules
// Firm-wide AI persona configuration: the AI's name, voice, and the
// hard rules that apply across every customer conversation.
//
// These get injected at the TOP of every Realtor + Lending AI system
// prompt by app/routers/ai.py — so the AI introduces itself with this
// name, follows the firm's tone, and refuses anything in the global
// rules list regardless of per-client overrides.
//
// Styling migrated off the inline token objects onto the plain-CSS design
// system (globals.css + app-extras.css) via the wrappers in @/components/ds.
// Every field, handler and payload key is unchanged; only the surface
// vocabulary moved:
//   local Field helper       → ds Field (same label + hint shape)
//   local ChipRow helper     → Seg as="filter" — it is a value picker, not a
//                              view switch, so aria-pressed rather than a
//                              tablist (see `problems`)
//   Card + SectionLabel      → Panel with its own title row
//   hand-rolled inputs       → Input / Textarea (`.field`)
// The page no longer sets its own padding or max-width — the shell's
// `.content` owns both.

import { useEffect, useState } from "react";
import { Btn, Field, Input, Panel, Row, Seg, Sub, Textarea } from "@/components/ds";
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

const GREETING_STYLES: { value: NonNullable<Identity["greeting_style"]>; label: string }[] = [
  { value: "formal", label: "Formal" },
  { value: "friendly", label: "Friendly" },
  { value: "concise", label: "Concise" },
];


export default function AIIdentityPage() {
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
    <div className="grid">
      <LendingAIHeader
        title="AI Identity & Global Rules"
        subtitle="The AI's name, voice, and the hard rules that apply across every conversation. These take precedence over per-agent or per-client overrides."
      />

      {isAINotDeployed(idErr) ? (
        <AINotDeployedBanner surface="Lending AI" />
      ) : isLoading ? (
        <Panel><Sub>Loading…</Sub></Panel>
      ) : (
        <>
          {/* ── Identity ────────────────────────────────────────── */}
          <Panel title="Identity" bodyClass="grid">
            <Field label="AI name" hint="What your AI introduces itself as. e.g. Quinn, Athena, Rocky.">
              <Input
                value={identity.ai_name || ""}
                onChange={e => setIdentity({ ...identity, ai_name: e.target.value })}
                placeholder="e.g. Quinn"
              />
            </Field>

            <Field label="Greeting style">
              <Row>
                <Seg
                  as="filter"
                  ariaLabel="Greeting style"
                  value={identity.greeting_style || "friendly"}
                  onChange={(v) => setIdentity({ ...identity, greeting_style: v })}
                  options={GREETING_STYLES}
                />
              </Row>
            </Field>

            <Field label="Voice summary" hint="One or two sentences describing how the AI should sound.">
              <Textarea
                value={identity.voice_summary || ""}
                onChange={e => setIdentity({ ...identity, voice_summary: e.target.value })}
                placeholder="e.g. Direct, knowledgeable about commercial real estate lending. Always references concrete numbers, never vague generalities."
                rows={2}
              />
            </Field>

            <Field label="Brand signature" hint="Optional sign-off appended to messages.">
              <Input
                value={identity.brand_signature || ""}
                onChange={e => setIdentity({ ...identity, brand_signature: e.target.value })}
                placeholder="— Quinn, Qualified Commercial"
              />
            </Field>
          </Panel>

          {/* ── Global Rules ───────────────────────────────────── */}
          <Panel
            title="Global rules — applied to every conversation"
            bodyClass="grid g10"
          >
            <Sub>
              The AI honors these rules regardless of per-agent or per-client overrides.
              Phrase as plain English &quot;never&quot; / &quot;always&quot; statements.
            </Sub>

            {(identity.global_rules || []).map((rule, i) => (
              <Row key={i}>
                <Input
                  grow
                  aria-label={`Global rule ${i + 1}`}
                  value={rule}
                  onChange={e => setRule(i, e.target.value)}
                />
                <Btn className="danger" onClick={() => removeRule(i)}>
                  Remove
                </Btn>
              </Row>
            ))}

            <Row>
              <Btn onClick={() => addRule("")}>+ Add rule</Btn>
            </Row>

            {/* Suggested rules — quick-add pool */}
            <hr className="hr" />
            <div>
              <div className="lbl mb">Suggested rules (click to add)</div>
              <Row>
                {SUGGESTED_RULES
                  .filter(s => !(identity.global_rules || []).includes(s))
                  .map(s => (
                    <Btn key={s} size="sm" onClick={() => addRule(s)}>
                      + {s}
                    </Btn>
                  ))}
              </Row>
            </div>
          </Panel>

          {/* ── Forbidden topics ───────────────────────────────── */}
          <Panel title="Off-limits topics" bodyClass="grid">
            <Sub>
              Comma-separated. The AI will refuse to engage on these and offer the redirect template instead.
            </Sub>

            <Input
              aria-label="Off-limits topics"
              value={(identity.forbidden_topics || []).join(", ")}
              onChange={e => setIdentity({
                ...identity,
                forbidden_topics: e.target.value
                  .split(",")
                  .map(s => s.trim())
                  .filter(Boolean),
              })}
              placeholder="e.g. exact rate quotes, legal advice, tax advice, competitor pricing"
            />

            <Field label="When the AI redirects, it says:">
              <Textarea
                value={identity.redirect_template || ""}
                onChange={e => setIdentity({ ...identity, redirect_template: e.target.value })}
                placeholder="e.g. That's something the funding team will confirm directly with you. I can flag it now and they'll follow up — would that work?"
                rows={2}
              />
            </Field>
          </Panel>

          <Row>
            <Btn variant="pri" onClick={save} disabled={patch.isPending}>
              {patch.isPending ? "Saving…" : "Save AI Identity"}
            </Btn>
          </Row>
        </>
      )}
    </div>
  );
}
