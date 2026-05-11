"use client";

// AISecretaryControl — the headline "is the AI working or not" surface.
//
// Two purposes:
//   1. A big, obvious "Start AI Secretary" CTA that atomically flips
//      outreach_mode to portal_auto AND fires first-touch outreach on
//      every AI-owned task. No more "where do I click to make it
//      actually contact the client?" confusion.
//   2. A matching Pause button + a one-line status describing what
//      the secretary is doing right now.
//
// Placed at the top of the AI Secretary tab — replaces the subtle
// segmented-mode buttons as the primary action. Power users can
// still pick a specific outreach_mode via the existing advanced
// dropdown (kept lower in the tab).

import { useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Icon } from "@/components/design-system/Icon";
import {
  usePauseAISecretary,
  useStartAISecretary,
  type DSStartResponse,
} from "@/hooks/useApi";
import type { DSDealSecretaryView, DSOutreachMode } from "@/lib/types";

export function AISecretaryControl({
  loanId,
  view,
}: {
  loanId: string;
  view: DSDealSecretaryView;
}) {
  const { t } = useTheme();
  const start = useStartAISecretary(loanId);
  const pause = usePauseAISecretary(loanId);
  const [lastResult, setLastResult] = useState<DSStartResponse | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const mode = view.file_settings.outreach_mode;
  const aiTaskCount = view.right.length;
  const isPaused = mode === "off";
  const isDrafting = mode === "draft_first";
  const isLive = mode === "portal_auto" || mode === "portal_email" || mode === "portal_email_sms";

  const stateInfo = isLive
    ? {
        title: aiTaskCount === 0 ? "Standing by · No tasks assigned" : `Working · ${aiTaskCount} task${aiTaskCount === 1 ? "" : "s"} active`,
        sub: aiTaskCount === 0
          ? "Assign a task to the AI column to give it work to do."
          : `Mode: ${labelFor(mode)} · The secretary is contacting the borrower for each assigned task on its own cadence.`,
        bg: t.brandSoft,
        accent: t.brand,
        icon: "🤖",
      }
    : isDrafting
    ? {
        title: "Drafting only · Not contacting the borrower",
        sub: "Cadence rules fire but messages land in the AI Inbox for human review before send.",
        bg: t.warnBg,
        accent: t.warn,
        icon: "✏️",
      }
    : {
        title: "Paused · The AI is silent",
        sub: "AI is tracking the plan but won't send anything. Click Start when you're ready for it to contact the borrower.",
        bg: t.surface2,
        accent: t.ink3,
        icon: "⏸",
      };

  const onStart = async () => {
    try {
      const result = await start.mutateAsync(undefined);
      setLastResult(result);
      // Auto-show details when there were skipped tasks worth investigating.
      if (result.skipped_count > 0) setShowDetails(true);
    } catch (e) {
      console.error("Start AI Secretary failed", e);
    }
  };

  const onPause = async () => {
    try {
      await pause.mutateAsync();
      setLastResult(null);
    } catch (e) {
      console.error("Pause AI Secretary failed", e);
    }
  };

  return (
    <div
      style={{
        border: `1px solid ${t.lineStrong}`,
        borderRadius: 16,
        background: t.surface,
        boxShadow: t.shadow,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          gap: 14,
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <div
            style={{
              width: 44, height: 44, borderRadius: 12,
              background: stateInfo.bg, color: stateInfo.accent,
              display: "grid", placeItems: "center",
              fontSize: 22, flexShrink: 0,
            }}
            aria-hidden
          >
            {stateInfo.icon}
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 10.5, fontWeight: 900, color: t.ink3,
                letterSpacing: 1.3, textTransform: "uppercase",
              }}
            >
              AI Secretary
            </div>
            <div
              style={{
                marginTop: 2, fontSize: 17, fontWeight: 900, color: t.ink,
                letterSpacing: -0.1,
              }}
            >
              {stateInfo.title}
            </div>
            <div
              style={{
                marginTop: 3, fontSize: 12, color: t.ink3, lineHeight: 1.4,
              }}
            >
              {stateInfo.sub}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "nowrap" }}>
          {isLive ? (
            <button
              type="button"
              onClick={onPause}
              disabled={pause.isPending}
              style={{
                padding: "11px 16px",
                borderRadius: 11,
                border: `1px solid ${t.line}`,
                background: t.surface2,
                color: t.ink2,
                fontWeight: 900,
                fontSize: 13,
                fontFamily: "inherit",
                cursor: pause.isPending ? "wait" : "pointer",
                opacity: pause.isPending ? 0.6 : 1,
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
              }}
            >
              <Icon name="pause" size={14} />
              {pause.isPending ? "Pausing…" : "Pause"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onStart}
              disabled={start.isPending || aiTaskCount === 0}
              title={aiTaskCount === 0 ? "Assign at least one task to AI first" : "Start the AI Secretary and contact the borrower"}
              style={{
                padding: "11px 18px",
                borderRadius: 11,
                border: "none",
                background: aiTaskCount === 0 ? t.surface2 : t.brand,
                color: aiTaskCount === 0 ? t.ink3 : t.inverse,
                fontWeight: 900,
                fontSize: 13.5,
                fontFamily: "inherit",
                cursor: start.isPending ? "wait" : (aiTaskCount === 0 ? "not-allowed" : "pointer"),
                opacity: start.isPending ? 0.7 : 1,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                boxShadow: aiTaskCount === 0 ? "none" : `0 4px 12px ${t.brandSoft}`,
              }}
            >
              <Icon name="send" size={15} />
              {start.isPending ? "Starting…" : "Start AI Secretary"}
            </button>
          )}
        </div>
      </div>

      {lastResult ? (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 11,
            background: lastResult.fired_count > 0 ? t.profitBg : t.warnBg,
            color: lastResult.fired_count > 0 ? t.profit : t.warn,
            fontSize: 12.5,
            fontWeight: 800,
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <span>
            {lastResult.fired_count > 0
              ? `✓ AI Secretary started — ${lastResult.fired_count} first-touch message${lastResult.fired_count === 1 ? "" : "s"} sent to the borrower.`
              : lastResult.skipped_count > 0
              ? `Started in ${labelFor(lastResult.outreach_mode as DSOutreachMode)} mode but nothing actually sent — ${lastResult.skipped_count} task${lastResult.skipped_count === 1 ? "" : "s"} skipped.`
              : `Started in ${labelFor(lastResult.outreach_mode as DSOutreachMode)} mode — no AI tasks to contact yet.`}
          </span>
          {lastResult.skipped_count > 0 ? (
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              style={{
                fontSize: 11,
                fontWeight: 800,
                background: "transparent",
                border: "none",
                color: "inherit",
                textDecoration: "underline",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {showDetails ? "Hide details" : "Show why"}
            </button>
          ) : null}
        </div>
      ) : null}

      {lastResult && showDetails && lastResult.skipped.length > 0 ? (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11.5, color: t.ink3, lineHeight: 1.5 }}>
          {lastResult.skipped.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function labelFor(mode: DSOutreachMode): string {
  switch (mode) {
    case "off":              return "Paused";
    case "draft_first":      return "Draft first";
    case "portal_auto":      return "Portal auto-send";
    case "portal_email":     return "Portal + Email";
    case "portal_email_sms": return "Portal + Email + SMS";
    default:                 return mode;
  }
}
