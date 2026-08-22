"use client";


/**
 * Small animated "AI is thinking" indicator — three bouncing dots.
 * Drawn in `currentColor` (`.tdots`) so it matches whichever chat surface it
 * renders in; pass `color` to override.
 * Pass `label` to show text alongside the dots (e.g. "Underwriter AI is typing").
 */
export function TypingDots({ label, color }: { label?: string; color?: string }) {
  return (
    // The @keyframes used to be a <style> tag nested inside this span — a
    // global at-rule injected mid-body and re-declared on every mount, the
    // same pattern app-extras.css already pulled out of the four spinners.
    // It lives in `.tdots` there now; the dots inherit `currentColor`, so one
    // caller-supplied colour tints all three.
    <span
      className="tdots"
      aria-live="polite"
      aria-label={label || "AI is thinking"}
      style={color ? { color } : undefined}
    >
      <span className="tdots-d">
        {[0, 1, 2].map((i) => (
          // Staggered start — derived from the dot's index.
          <i key={i} style={{ animationDelay: `${i * 0.18}s` }} />
        ))}
      </span>
      {label ? <span className="tdots-l sub">{label}</span> : null}
    </span>
  );
}
