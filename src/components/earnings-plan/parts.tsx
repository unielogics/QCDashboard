"use client";

import type { ReactNode } from "react";
import type { Amount } from "@/lib/earningsPlan/types";
import type { Tag } from "@/lib/earningsPlan/view";
import styles from "./EarningsPlan.module.css";

export const cx = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).join(" ");

export function TagChip({ tag, num = true }: { tag: Tag; num?: boolean }) {
  return <span className={cx(styles.tag, styles[`tag_${tag.tone}`], num && styles.num)}>{tag.label}</span>;
}

/** One choice out of a few, as a row of buttons. */
export function Seg<T extends string>({ label, value, options, onChange, disabled, small }: {
  label: string; value: T | null; options: ReadonlyArray<{ value: T; label: string }>; onChange: (value: T) => void; disabled?: boolean; small?: boolean;
}) {
  return (
    <div className={cx(styles.seg, small && styles.small)} role="radiogroup" aria-label={label}>
      {options.map(option => (
        <button key={option.value} type="button" role="radio" aria-checked={value === option.value} disabled={disabled} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Digits and one decimal point: what can be typed is always a figure, so nothing typed is ever refused later. */
export function cleanFigure(text: string): string {
  const kept = text.replace(/[^0-9.]/g, "");
  const dot = kept.indexOf(".");
  const figure = dot < 0 ? kept : kept.slice(0, dot + 1) + kept.slice(dot + 1).replace(/\./g, "");
  return figure.slice(0, 15);
}

/**
 * A figure being typed. The plan holds the text exactly as typed ("12."), so the
 * field never loses a keystroke to a round trip and never jumps while typing.
 */
export function NumberField({ label, value, onChange, disabled, className, placeholder = "0", needs }: {
  label: string; value: Amount | undefined; onChange: (value: string) => void; disabled?: boolean; className?: string; placeholder?: string; needs?: boolean;
}) {
  return (
    <input
      className={cx(styles.input, styles.num, className, needs && styles.needs)}
      type="text" inputMode="decimal" autoComplete="off" aria-label={label} placeholder={placeholder} disabled={disabled}
      value={value == null ? "" : String(value)}
      onChange={event => onChange(cleanFigure(event.target.value))}
    />
  );
}

export function Card({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return <section className={cx(styles.card, className)} aria-label={label}>{children}</section>;
}
