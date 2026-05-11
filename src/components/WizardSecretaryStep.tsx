"use client";

// WizardSecretaryStep — the Step 4 surface used by AgentLeadModal +
// SmartIntakeModal. The deal/loan doesn't exist yet, so we can't
// query the canonical /deal-secretary endpoint — instead, we walk
// the agent's buyer/seller playbook and let them toggle items to AI.
//
// Captured intent posts to /clients/{id}/deal-secretary/wizard-intent
// AFTER the parent wizard's main create call succeeds. The post-loan
// path (prequal-accept → spawn-loan → materialize_pending_assignments)
// converts these into real AITaskAssignment rows.
//
// Full drag-drop power lives on the post-loan workbench tab. The
// wizard intentionally uses the simpler toggle surface so agents
// don't get bogged down mid-deal-creation.

import { useMemo } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { useAgentPlaybook, type PlaybookRequirement } from "@/hooks/useApi";
import {
  DS_CATEGORY_META,
  DS_OUTREACH_MODE_LABELS,
  type DSOutreachMode,
  type DSRequirementCategory,
} from "@/lib/types";

export interface WizardSecretaryStepProps {
  side: "buyer" | "seller";
  outreachMode: DSOutreachMode;
  onChangeOutreachMode: (mode: DSOutreachMode) => void;
  aiAssignedKeys: string[];
  onChangeAssignments: (keys: string[]) => void;
}

export function WizardSecretaryStep({
  side,
  outreachMode,
  onChangeOutreachMode,
  aiAssignedKeys,
  onChangeAssignments,
}: WizardSecretaryStepProps) {
  const { t } = useTheme();
  const { data: playbook } = useAgentPlaybook(side);

  // Merge platform + agent overlay rows. Dedup by requirement_key (agent
  // rows win — they may override platform defaults).
  const requirements = useMemo(() => {
    const map = new Map<string, PlaybookRequirement>();
    (playbook?.platform_requirements ?? []).forEach((r) => map.set(r.requirement_key, r));
    (playbook?.agent_requirements ?? []).forEach((r) => map.set(r.requirement_key, r));
    return Array.from(map.values()).sort((a, b) => a.display_order - b.display_order || a.label.localeCompare(b.label));
  }, [playbook]);

  // Group by category for the rendered list.
  const byCategory = useMemo(() => {
    const groups = new Map<string, PlaybookRequirement[]>();
    for (const r of requirements) {
      const arr = groups.get(r.category) ?? [];
      arr.push(r);
      groups.set(r.category, arr);
    }
    return Array.from(groups.entries());
  }, [requirements]);

  const toggle = (key: string) => {
    if (aiAssignedKeys.includes(key)) {
      onChangeAssignments(aiAssignedKeys.filter((k) => k !== key));
    } else {
      onChangeAssignments([...aiAssignedKeys, key]);
    }
  };

  const presetBorrowerFacing = () => {
    const keys = requirements
      .filter((r) => r.visibility?.includes("borrower"))
      .map((r) => r.requirement_key);
    onChangeAssignments(keys);
  };
  const presetCommonCollection = () => {
    const cats = new Set(["financials", "insurance", "scheduling", "communication"]);
    onChangeAssignments(requirements.filter((r) => cats.has(r.category)).map((r) => r.requirement_key));
  };
  const presetClear = () => onChangeAssignments([]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* File-level Outreach Mode strip — sticky / impossible to miss */}
      <div style={{
        border: `1px solid ${t.lineStrong}`,
        borderRadius: 14,
        background: t.surface,
        padding: "12px 14px",
        boxShadow: t.shadow,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, gap: 12 }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 900, color: t.ink3, letterSpacing: 1.3, textTransform: "uppercase" }}>
              AI Outreach
            </div>
            <div style={{ marginTop: 2, fontSize: 13, fontWeight: 800, color: t.ink }}>
              {DS_OUTREACH_MODE_LABELS[outreachMode].title}
            </div>
          </div>
          <div style={{ fontSize: 11, color: t.ink3, maxWidth: "55%", textAlign: "right" }}>
            AI can only work tasks you check below. Off = nothing sends, the AI just tracks.
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
          {(["off", "draft_first", "portal_auto", "portal_email", "portal_email_sms"] as DSOutreachMode[]).map((m) => {
            const active = m === outreachMode;
            const meta = DS_OUTREACH_MODE_LABELS[m];
            return (
              <button
                key={m}
                type="button"
                onClick={() => onChangeOutreachMode(m)}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  padding: "9px 8px",
                  borderRadius: 10,
                  background: active ? t.brandSoft : t.surface2,
                  border: `1px solid ${active ? t.brand : t.line}`,
                  color: active ? t.brand : t.ink2,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 11.5, fontWeight: 900 }}>{meta.title}</div>
                <div style={{ fontSize: 10, color: active ? t.brand : t.ink3, marginTop: 2 }}>{meta.sub}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Presets */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <PresetButton t={t} onClick={presetCommonCollection}>Assign common collection</PresetButton>
        <PresetButton t={t} onClick={presetBorrowerFacing}>Assign all borrower-facing</PresetButton>
        <PresetButton t={t} onClick={presetClear} tone="danger">Clear</PresetButton>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 11.5, color: t.ink3, alignSelf: "center" }}>
          {aiAssignedKeys.length} of {requirements.length} on AI
        </div>
      </div>

      {/* Category-grouped list with toggles */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {byCategory.length === 0 ? (
          <div style={{ padding: 16, textAlign: "center", color: t.ink3, fontSize: 12, background: t.surface2, borderRadius: 10 }}>
            Loading your playbook…
          </div>
        ) : null}
        {byCategory.map(([cat, items]) => {
          const meta = DS_CATEGORY_META[cat as DSRequirementCategory];
          return (
            <section key={cat} style={{ border: `1px solid ${t.line}`, borderRadius: 12, background: t.surface, padding: 12 }}>
              <div style={{
                fontSize: 10.5, fontWeight: 900,
                color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase",
                marginBottom: 8,
              }}>
                {meta?.label ?? cat}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {items.map((r) => {
                  const assigned = aiAssignedKeys.includes(r.requirement_key);
                  return (
                    <button
                      key={r.requirement_key}
                      type="button"
                      onClick={() => toggle(r.requirement_key)}
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        display: "grid",
                        gridTemplateColumns: "22px 1fr auto",
                        gap: 10,
                        alignItems: "center",
                        padding: "8px 10px",
                        borderRadius: 9,
                        background: assigned ? t.brandSoft : t.surface2,
                        border: `1px solid ${assigned ? t.brand : t.line}`,
                      }}
                    >
                      <div style={{
                        width: 18, height: 18, borderRadius: 5,
                        background: assigned ? t.brand : t.surface,
                        border: `1.5px solid ${assigned ? t.brand : t.line}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: t.surface, fontSize: 12, fontWeight: 900,
                      }}>{assigned ? "✓" : ""}</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: t.ink }}>{r.label}</div>
                        {r.objective_text ? (
                          <div style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>{r.objective_text}</div>
                        ) : null}
                      </div>
                      <div style={{ display: "flex", gap: 4 }}>
                        {r.required_level === "required" ? (
                          <span style={{ fontSize: 9.5, fontWeight: 900, padding: "2px 5px", borderRadius: 4, background: t.dangerBg, color: t.danger }}>REQ</span>
                        ) : null}
                        {r.required_level === "recommended" ? (
                          <span style={{ fontSize: 9.5, fontWeight: 900, padding: "2px 5px", borderRadius: 4, background: t.warnBg, color: t.warn }}>REC</span>
                        ) : null}
                        {r.link_kind === "docusign" ? (
                          <span style={{ fontSize: 9.5, fontWeight: 800, padding: "2px 5px", borderRadius: 4, background: t.chip, color: t.ink3 }} title="DocuSign link configured">
                            ✍
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <div style={{ fontSize: 11, color: t.ink3, fontStyle: "italic" }}>
        You can fine-tune each AI-handled task (instructions, channels, cadence) on the deal's AI Workbench tab after creation.
      </div>
    </div>
  );
}

function PresetButton({
  t,
  onClick,
  children,
  tone,
}: {
  t: ReturnType<typeof useTheme>["t"];
  onClick: () => void;
  children: React.ReactNode;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        all: "unset",
        cursor: "pointer",
        fontSize: 11.5,
        fontWeight: 700,
        padding: "7px 11px",
        borderRadius: 9,
        background: tone === "danger" ? t.dangerBg : t.surface2,
        color: tone === "danger" ? t.danger : t.ink2,
        border: `1px solid ${tone === "danger" ? t.danger : t.line}`,
      }}
    >
      {children}
    </button>
  );
}
