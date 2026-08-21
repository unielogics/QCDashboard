"use client";

// Shared form primitives for the AI Agent builder panels.
//
// These are thin adapters over the class vocabulary in globals.css /
// app-extras.css. The 11 step panels call FieldRow / TextField / Btn by name in
// ~90 places, so the whole builder reskins from this file without a single
// panel changing what it does.

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { Input, Select, Textarea, cx } from "@/components/ds";

export function FieldRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    // Still a <label>, deliberately: the implicit association is what lets a
    // click on the caption focus the control and gives the control its
    // accessible name. `display:grid` is what stretches the control to the
    // caption's width — .field carries no width of its own.
    <label className="mt" style={{ display: "grid", gap: 6 }}>
      <span className="lbl">{label}</span>
      {children}
      {hint && <span className="sub">{hint}</span>}
    </label>
  );
}

export function TextField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <Input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{ width: "100%" }}
    />
  );
}

export function TextAreaField({
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <Textarea
      rows={rows}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      // Computed from `rows`, so it stays inline: .field owns no height.
      style={{ width: "100%", resize: "vertical", minHeight: rows * 22 }}
    />
  );
}

export function SelectField({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ width: "100%" }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

export function Btn({
  children,
  onClick,
  variant = "secondary",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
}) {
  // `.btn` carries geometry, hover and :disabled. Danger has no class of its
  // own in the sheet, so it is `.btn` plus the one token that differs — the
  // same shape migrated routes use for destructive row actions.
  return (
    <button
      type="button"
      className={cx("btn", variant === "primary" && "pri")}
      style={variant === "danger" ? { color: "var(--danger)" } : undefined}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function PanelHeader({
  title,
  desc,
}: {
  title: string;
  desc: string;
}) {
  return (
    // h2, one level under the page's h1 (the agent name). `h2 + .sub` in
    // globals.css gives the description its margin and measure.
    <header style={{ marginBottom: 18 }}>
      <h2 style={{ fontSize: 18 }}>{title}</h2>
      <p className="sub">{desc}</p>
    </header>
  );
}

// ── Builder save-handler context ────────────────────────────────────
//
// The 11-step builder behaves like a wizard: each panel can register
// what "Save & Next" should do, and the page's footer / left-rail
// invokes that registered handler before navigating. Panels that have
// nothing to save register a no-op.

type SaveHandler = () => Promise<void>;

const SaveHandlerCtx =
  createContext<MutableRefObject<SaveHandler | null> | null>(null);

export function BuilderStepProvider({
  saveHandlerRef,
  children,
}: {
  saveHandlerRef: MutableRefObject<SaveHandler | null>;
  children: ReactNode;
}) {
  return (
    <SaveHandlerCtx.Provider value={saveHandlerRef}>
      {children}
    </SaveHandlerCtx.Provider>
  );
}

/**
 * Each step panel calls this with its current save fn. The page reads
 * the registered fn off a shared ref when the footer's "Save & Next"
 * is clicked. Panels with nothing to save pass an async no-op.
 */
export function useRegisterSave(saveFn: SaveHandler) {
  const ctxRef = useContext(SaveHandlerCtx);
  // Keep the latest closure addressable without re-running the effect
  // on every keystroke.
  const liveRef = useRef(saveFn);
  liveRef.current = saveFn;
  useEffect(() => {
    if (!ctxRef) return;
    const wrapper: SaveHandler = () => liveRef.current();
    ctxRef.current = wrapper;
    return () => {
      // Only clear if no later panel has replaced us — prevents a
      // race where the next panel mounts before this one tears down.
      if (ctxRef.current === wrapper) ctxRef.current = null;
    };
  }, [ctxRef]);
}

export function ChipToggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cx("btn", "sm", active && "pri")}
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
