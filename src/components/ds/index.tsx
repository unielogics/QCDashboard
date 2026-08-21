"use client";

// The design-system layer: thin wrappers over the classes in globals.css.
//
// Every component here is markup and a className. No inline styles, no
// useTheme, no palette knowledge. That is the point — colour and spacing live
// in one stylesheet, vendored from QCDealerOS, and a component that reaches for
// a token is a component that will drift from it.
//
// These SUPERSEDE most of design-system/primitives.tsx. Both exist during the
// migration because 222 files still render the old ones; the old set is deleted
// in Phase 4 when nothing imports it. New code should import from here.
//
// Escape hatches are deliberate and narrow. Every component takes `className`
// so a caller can add a layout class (`.s6`, `.mt`), and most take `style` for
// the genuinely dynamic cases — a computed bar width, a measured height. The
// rule that keeps this honest: a component owns a class or an inline value for
// a given property, never both. `className="panel" style={{padding:16}}` is how
// you get a double-padding bug nobody can find.

import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  CSSProperties,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ── surfaces ─────────────────────────────────────────────────────────── */

/**
 * One flat container: a header row (title left, actions right, hairline under)
 * and a padded body. This replaces card-in-card nesting — the single most
 * common way a dense screen turns to mush.
 */
export function Panel({
  title,
  sub,
  actions,
  children,
  className,
  bodyClass,
  noPad,
  id,
}: {
  title?: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClass?: string;
  /** For a panel whose body is a full-bleed table. */
  noPad?: boolean;
  id?: string;
}) {
  return (
    <div className={cx("panel", className)} id={id}>
      {(title || actions) && (
        <div className="panel-h">
          {title && <h3 style={{ fontSize: 14, margin: 0 }}>{title}</h3>}
          {sub && <span className="sub">{sub}</span>}
          {actions && (
            <>
              <span className="sp" style={{ flex: 1 }} />
              {actions}
            </>
          )}
        </div>
      )}
      {noPad ? children : <div className={cx("panel-b", bodyClass)}>{children}</div>}
    </div>
  );
}

export function Card({
  children,
  hi,
  className,
  onClick,
  style,
}: {
  children?: ReactNode;
  /** Lifted shadow — for the one card on a screen that should draw the eye. */
  hi?: boolean;
  className?: string;
  onClick?: () => void;
  style?: CSSProperties;
}) {
  return (
    <div className={cx("card", hi && "hi", className)} onClick={onClick} style={style}>
      {children}
    </div>
  );
}

/** Page title, lede on the same baseline, actions pushed right. */
export function PageHeader({
  title,
  lede,
  actions,
}: {
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="hd">
      <h2>{title}</h2>
      {lede && <span className="lede">{lede}</span>}
      {actions && (
        <>
          <span style={{ flex: 1 }} />
          <span className="pgacts">{actions}</span>
        </>
      )}
    </div>
  );
}

/* ── stats ────────────────────────────────────────────────────────────── */

export function KpiRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("kpis", className)}>{children}</div>;
}

export function Kpi({
  label,
  value,
  delta,
  tone = "mut",
}: {
  label: ReactNode;
  value: ReactNode;
  delta?: ReactNode;
  tone?: ChipTone;
}) {
  return (
    <div className="kpi">
      <div className="lbl">{label}</div>
      <div className="knum num">{value}</div>
      {delta != null && (
        <div className="kdelta">
          <span className={`cellchip c-${tone}`}>{delta}</span>
        </div>
      )}
    </div>
  );
}

/* ── chips ────────────────────────────────────────────────────────────── */

export type ChipTone = "ok" | "warn" | "bad" | "mut" | "acc" | "gold" | "pet";

/** Status marker inside a table cell or beside a title. */
export function CellChip({
  tone = "mut",
  children,
  className,
}: {
  tone?: ChipTone;
  children: ReactNode;
  className?: string;
}) {
  return <span className={cx("cellchip", `c-${tone}`, className)}>{children}</span>;
}

/** Standalone pill with an optional status dot — heavier than a CellChip. */
export function Chip({
  children,
  dotColor,
  className,
  href,
  title,
}: {
  children: ReactNode;
  dotColor?: string;
  className?: string;
  href?: string;
  title?: string;
}) {
  const inner = (
    <>
      {dotColor && <span className="dot" style={{ background: dotColor }} />}
      {children}
    </>
  );
  return href ? (
    <a className={cx("chip", className)} href={href} title={title}>
      {inner}
    </a>
  ) : (
    <span className={cx("chip", className)} title={title}>
      {inner}
    </span>
  );
}

export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("tag", className)}>{children}</span>;
}

/* ── controls ─────────────────────────────────────────────────────────── */

type BtnBase = { variant?: "default" | "pri"; size?: "sm"; className?: string; children: ReactNode };

export function Btn({
  variant = "default",
  size,
  className,
  children,
  ...rest
}: BtnBase & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cx("btn", variant === "pri" && "pri", size === "sm" && "sm", className)}
      {...rest}
    >
      {children}
    </button>
  );
}

export function BtnLink({
  variant = "default",
  size,
  className,
  children,
  ...rest
}: BtnBase & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      className={cx("btn", variant === "pri" && "pri", size === "sm" && "sm", className)}
      {...rest}
    >
      {children}
    </a>
  );
}

/** Square icon-only button, level with a `.btn.sm`. */
export function IconBtn({
  className,
  children,
  ...rest
}: { className?: string; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={cx("btn", "sm", "iconbtn", className)} {...rest}>
      {children}
    </button>
  );
}

/** Text-weight action. A button, not an anchor — it performs, it doesn't navigate. */
export function Linky({
  className,
  children,
  ...rest
}: { className?: string; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={cx("linky", className)} {...rest}>
      {children}
    </button>
  );
}

export function Input({
  className,
  grow,
  ...rest
}: { grow?: boolean } & InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx("field", grow && "grow", className)} {...rest} />;
}

export function Select({
  className,
  grow,
  children,
  ...rest
}: { grow?: boolean; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx("field", grow && "grow", className)} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx("field", className)} {...rest} />;
}

/** Label + control + optional hint or error, stacked. */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx(className)} style={{ display: "grid", gap: 5, minWidth: 0 }}>
      {label && <span className="lbl">{label}</span>}
      {children}
      {error ? (
        <span className="sub" style={{ color: "var(--danger)" }}>
          {error}
        </span>
      ) : (
        hint && <span className="sub">{hint}</span>
      )}
    </div>
  );
}

/** Segmented control. Generic over the value so callers keep their union type. */
export function Seg<T extends string>({
  value,
  onChange,
  options,
  className,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div className={cx("seg", className)} role="tablist" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          className={o.value === value ? "on" : ""}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── tables ───────────────────────────────────────────────────────────── */

export type Col = { label: ReactNode; align?: "r"; width?: number | string };

/**
 * A real `<table class="tbl">` in a scroll container.
 *
 * The wrapper is not decoration: a wide table must scroll inside its own box,
 * or it widens the page and every other element on the screen goes with it.
 */
export function Table({
  cols,
  children,
  caption,
  className,
}: {
  cols: Col[];
  children: ReactNode;
  caption?: string;
  className?: string;
}) {
  return (
    <div className={cx("tblwrap", className)} style={{ minWidth: 0 }}>
      <table className="tbl">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {cols.map((c, i) => (
              <th
                key={i}
                scope="col"
                className={c.align === "r" ? "r" : undefined}
                style={c.width ? { width: c.width } : undefined}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Tr({
  children,
  onClick,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <tr
      className={className}
      onClick={onClick}
      style={onClick ? { cursor: "pointer" } : undefined}
    >
      {children}
    </tr>
  );
}

export function Td({
  children,
  align,
  className,
  colSpan,
}: {
  children?: ReactNode;
  align?: "r";
  className?: string;
  colSpan?: number;
}) {
  return (
    <td className={cx(align === "r" && "r", className)} colSpan={colSpan}>
      {children}
    </td>
  );
}

/* ── layout ───────────────────────────────────────────────────────────── */

/** 12-column cockpit grid. Children carry `.s3`…`.s12`. */
export function CG({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("cg", className)}>{children}</div>;
}

export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("row", className)}>{children}</div>;
}

export function Lbl({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("lbl", className)}>{children}</div>;
}

export function Sub({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("sub", className)}>{children}</span>;
}

/** Petrol-tinted explanatory callout. */
export function Note({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("note", className)}>{children}</div>;
}

/** Amber warning line — used where an action has a consequence worth naming. */
export function WarnLine({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("warnline", className)}>{children}</div>;
}
