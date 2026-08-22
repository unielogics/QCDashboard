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
import { Icon } from "@/components/design-system/Icon";

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
  eyebrow,
  meta,
  className,
}: {
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("ckhead", "pagehead", className)}>
      {eyebrow ? <div className="lbl pagehead-eye">{eyebrow}</div> : null}
      <div className="ckrow">
        <h1>{title}</h1>
        {lede ? <span className="lede">{lede}</span> : null}
        <span className="sp" />
        {actions ? <span className="pgacts">{actions}</span> : null}
      </div>
      {meta ? <div className="pagehead-meta">{meta}</div> : null}
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
  sub,
  delta,
  trend,
  tone = "mut",
  icon,
  iconTone,
  prose,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  /** Qualifier under the figure — "3 active loans", "vs. prior year".
      Without this every route carrying a KPI caption had to hand-roll the
      .kpi markup, which is how a shared component quietly stops being used. */
  sub?: ReactNode;
  delta?: ReactNode;
  /**
   * Direction of travel, drawn as an arrow inside the delta chip.
   *
   * The primitive this replaced drew this arrow and the migration dropped it,
   * leaving "+12%" and "-12%" distinguishable only by a minus sign and a
   * colour — which is a colour-only signal for anyone who cannot separate the
   * ok and bad tints. Pass "up" or "down" alongside `delta`.
   */
  trend?: "up" | "down";
  tone?: ChipTone;
  /**
   * Glyph in the tile's top-right corner, beside the label.
   *
   * Carried by the primitive this replaced. Thirteen tiles on the home
   * dashboard alone lost it in the migration; it is what lets a wall of eight
   * near-identical tiles be told apart at a glance rather than by reading
   * every label.
   */
  icon?: string;
  /** Tone for `icon`. Defaults to the label's muted grey. */
  iconTone?: ChipTone;
  /**
   * The value is a sentence, not a figure.
   *
   * `.knum` is 26px and `white-space: nowrap`, which is right for "$1.2M" and
   * overflows the tile for "Auto-approve under $50k". Routes were hand-rolling
   * `.kpi` markup to escape this rather than using the component.
   */
  prose?: boolean;
  className?: string;
}) {
  return (
    <div className={cx("kpi", className)}>
      <div className="kpi-h">
        <span className="lbl">{label}</span>
        {icon ? (
          <span className={cx("kpi-i", iconTone && `c-${iconTone}`)}>
            <Icon name={icon} size={14} />
          </span>
        ) : null}
      </div>
      <div className={cx("knum", !prose && "num", prose && "prose")}>{value}</div>
      {sub != null && (
        <div className="sub" style={{ marginTop: 4 }}>
          {sub}
        </div>
      )}
      {delta != null && (
        <div className="kdelta">
          <span className={`cellchip c-${tone}`}>
            {trend ? <Icon name={trend === "up" ? "trend" : "trendDn"} size={11} stroke={2.4} /> : null}
            {delta}
          </span>
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
  title,
}: {
  tone?: ChipTone;
  children: ReactNode;
  className?: string;
  /** Hover explanation. A chip is terse by design; some of them need a sentence. */
  title?: string;
}) {
  return (
    <span className={cx("cellchip", `c-${tone}`, className)} title={title}>
      {children}
    </span>
  );
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

/**
 * A status that is a sentence rather than a word.
 *
 * `CellChip` is `white-space: nowrap` and usually sits inside a `.panel`, which
 * is `overflow: hidden` — so a long status string is clipped rather than
 * wrapping, and the failure is silent. Three separate routes hand-rolled the
 * same block-level replacement before this existed.
 */
export function StatusLine({
  tone = "mut",
  children,
  className,
}: {
  tone?: ChipTone;
  children: ReactNode;
  className?: string;
}) {
  return <div className={cx("statusline", `c-${tone}`, className)}>{children}</div>;
}

/**
 * A card that has something to say — a warning, a nudge, a piece of context.
 *
 * Tone reuses the chip vocabulary rather than inventing a second one, so
 * "this is bad" is the same word here as it is in a table cell.
 */
export function Callout({
  tone = "acc",
  icon,
  children,
  className,
}: {
  tone?: ChipTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("callout", `c-${tone}`, className)}>
      {icon}
      <div className="grow">{children}</div>
    </div>
  );
}

/** Read-only list row: icon, growing middle, status on the right. */
export function ItemRow({
  icon,
  children,
  right,
  className,
}: {
  icon?: ReactNode;
  children: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("itemrow", className)}>
      {icon}
      <div className="grow">{children}</div>
      {right}
    </div>
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
  req,
  children,
  className,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /**
   * The system is still waiting on this one.
   *
   * Distinct from `error`, which means "what you typed is wrong". This means
   * "nothing is here yet and something downstream needs it" — a different
   * message, and it is set by the requirement engine rather than by
   * validation. Marks the label with a rail and a REQUIRED tag; pair it with
   * `bad` on the control so the signal is not colour alone.
   */
  req?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(req && "fld-req", className)}
      style={{ display: "grid", gap: 5, minWidth: 0 }}
    >
      {label && (
        <span className="lbl">
          {label}
          {req && <span className="reqtag">Required</span>}
        </span>
      )}
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
  as = "tabs",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
  ariaLabel?: string;
  /**
   * What this control *is*, semantically.
   *
   * The same segmented pill is used for two different things: switching which
   * view you are looking at (tabs), and narrowing a list (a filter). They look
   * identical and announce completely differently — a filter described as a
   * tablist tells a screen-reader user the page is about to change when it is
   * not. Visuals are shared; semantics are not.
   */
  as?: "tabs" | "filter";
}) {
  const tabs = as === "tabs";
  return (
    <div
      className={cx("seg", className)}
      role={tabs ? "tablist" : "group"}
      aria-label={ariaLabel}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role={tabs ? "tab" : undefined}
            aria-selected={tabs ? on : undefined}
            aria-pressed={tabs ? undefined : on}
            className={on ? "on" : ""}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
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

/**
 * A caption on its own line.
 *
 * `.sub` the CLASS is display-neutral on purpose — it is also worn by spans
 * sitting inline beside an input, inside a `.row`, or in a composer hint.
 * `Sub` the COMPONENT is a caption under something, which is how every one of
 * its call sites uses it, so it carries `.subline` to actually be one.
 *
 * Without this, `<b>Title</b><Sub>caption</Sub>` — the single most common
 * pattern in this migration — rendered as one run-on line: "Purchase
 * contract1418 Northwest Fairview Terrace". Twenty-one sites did exactly that,
 * and nothing in a typecheck, an endpoint diff or a class-token diff can see
 * it. It took looking at the page.
 */
export function Sub({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("sub", "subline", className)}>{children}</span>;
}

/** Petrol-tinted explanatory callout. */
/**
 * A list with nothing in it.
 *
 * Deliberately not a `<Sub>`: a caption is a left-aligned grey line beside
 * other content, and when it is the ONLY thing in a panel it reads as text
 * that failed to load rather than as an answer. This is the answer — centred,
 * given room, and optionally with a glyph and a next step.
 */
export function Empty({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon?: string;
  /** The headline. Without it the body text carries the whole message. */
  title?: ReactNode;
  children?: ReactNode;
  /** What to do about it, when there is something to do. */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("empty", className)}>
      {icon ? <Icon name={icon} size={20} /> : null}
      {title ? <b>{title}</b> : null}
      {children}
      {action ? <div style={{ marginTop: 10 }}>{action}</div> : null}
    </div>
  );
}

/**
 * A panel waiting on its data.
 *
 * Shares `.empty`'s centred, padded block — a placeholder and an empty result
 * want the same shape — but it is a different word because it means a
 * different thing, and a reader who finds `<Empty>Loading…</Empty>` has to
 * stop and work out which one the author meant.
 */
export function Loading({ children = "Loading…", className }: { children?: ReactNode; className?: string }) {
  return (
    <div className={cx("empty", className)} aria-live="polite">
      {children}
    </div>
  );
}

export function Note({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("note", className)}>{children}</div>;
}

/** Amber warning line — used where an action has a consequence worth naming. */
export function WarnLine({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("warnline", className)}>{children}</div>;
}
