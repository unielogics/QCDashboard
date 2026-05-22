"use client";

// Shared form primitives for the AI Agent builder panels.

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type CSSProperties,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";

export function useUi() {
  const { t } = useTheme();
  const input: CSSProperties = {
    width: "100%",
    padding: "9px 12px",
    borderRadius: 10,
    border: `1px solid ${t.lineStrong}`,
    background: t.surface,
    color: t.ink,
    fontSize: 14,
    fontFamily: "inherit",
    boxSizing: "border-box",
  };
  return { t, input };
}

export function FieldRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  const { t } = useTheme();
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          color: t.ink3,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {children}
      {hint && (
        <div style={{ fontSize: 12, color: t.ink3, marginTop: 5 }}>{hint}</div>
      )}
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
  const { input } = useUi();
  return (
    <input
      style={input}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
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
  const { input } = useUi();
  return (
    <textarea
      style={{ ...input, resize: "vertical", minHeight: rows * 22 }}
      rows={rows}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
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
  const { input } = useUi();
  return (
    <select style={input} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
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
  const { t } = useTheme();
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    padding: "9px 16px",
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "inherit",
    opacity: disabled ? 0.5 : 1,
    border: "none",
  };
  const styles: Record<string, CSSProperties> = {
    primary: { ...base, background: t.ink, color: t.inverse },
    secondary: {
      ...base,
      background: t.surface,
      color: t.ink2,
      border: `1px solid ${t.lineStrong}`,
    },
    danger: { ...base, background: t.dangerBg, color: t.danger },
  };
  return (
    <button style={styles[variant]} onClick={onClick} disabled={disabled}>
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
  const { t } = useTheme();
  return (
    <div style={{ marginBottom: 18 }}>
      <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: t.ink }}>
        {title}
      </h2>
      <p style={{ fontSize: 13, color: t.ink3, margin: "6px 0 0" }}>{desc}</p>
    </div>
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
  const { t } = useTheme();
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 12px",
        borderRadius: 999,
        fontSize: 12.5,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "inherit",
        border: `1px solid ${active ? t.ink : t.lineStrong}`,
        background: active ? t.ink : t.surface,
        color: active ? t.inverse : t.ink2,
      }}
    >
      {label}
    </button>
  );
}
