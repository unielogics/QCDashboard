"use client";

import { useTheme } from "@/components/design-system/ThemeProvider";

/**
 * Small animated "AI is thinking" indicator — three bouncing dots.
 * Themed via useTheme so it matches whichever chat surface it renders in.
 * Pass `label` to show text alongside the dots (e.g. "Underwriter AI is typing").
 */
export function TypingDots({ label, color }: { label?: string; color?: string }) {
  const { t } = useTheme();
  const dot = color || t.ink3;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }} aria-live="polite" aria-label={label || "AI is thinking"}>
      <span style={{ display: "inline-flex", gap: 3 }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: dot,
              display: "inline-block",
              animation: "qc-typing 1.2s ease-in-out infinite",
              animationDelay: `${i * 0.18}s`,
            }}
          />
        ))}
      </span>
      {label ? <span style={{ color: t.ink3, fontSize: 12, fontStyle: "italic" }}>{label}</span> : null}
      <style>{"@keyframes qc-typing{0%,80%,100%{transform:translateY(0);opacity:.4}40%{transform:translateY(-4px);opacity:1}}"}</style>
    </span>
  );
}
