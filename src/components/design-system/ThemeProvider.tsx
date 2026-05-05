"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { QC_DENSITY, QC_TOKENS, type Density, type QCTokens, type ThemeMode, tokensToCssVars } from "./tokens";

// User preference for how to pick the applied theme.
//   - "light"  → always light
//   - "dark"   → always dark
//   - "system" → follow the OS preference (and update live via matchMedia)
export type ThemePreference = "light" | "dark" | "system";

interface ThemeCtx {
  mode: ThemeMode;            // resolved palette currently in effect
  isDark: boolean;
  preference: ThemePreference; // user's chosen preference
  setMode: (m: ThemeMode) => void;        // legacy: forces a concrete palette + clears system pref
  setPreference: (p: ThemePreference) => void;
  toggle: () => void;          // legacy
  density: Density;
  setDensity: (d: Density) => void;
  t: QCTokens;
  d: (typeof QC_DENSITY)[Density];
}

const Ctx = createContext<ThemeCtx | null>(null);

const STORAGE_KEY = "qc.theme";
const DENSITY_KEY = "qc.density";

function readSystemPalette(): ThemeMode {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // `mode` is the resolved palette in effect. `preference` is what the user
  // picked — when it's "system", `mode` mirrors the OS preference live.
  const [mode, setModeState] = useState<ThemeMode>("light");
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [density, setDensity] = useState<Density>("comfortable");

  // Hydrate from localStorage on mount. Stored values:
  //   "light" / "dark" → explicit preference
  //   absent           → "system" (follow OS)
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") {
      setPreferenceState(saved);
      setModeState(saved);
    } else {
      setPreferenceState("system");
      setModeState(readSystemPalette());
    }
    const savedDensity = localStorage.getItem(DENSITY_KEY);
    if (savedDensity === "comfortable" || savedDensity === "compact") {
      setDensity(savedDensity);
    }
  }, []);

  useEffect(() => { localStorage.setItem(DENSITY_KEY, density); }, [density]);

  // Live-listen to the OS preference whenever the user is in "system" mode.
  // Removes the listener when they pick an explicit theme so we don't fight them.
  useEffect(() => {
    if (preference !== "system" || typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setModeState(e.matches ? "dark" : "light");
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, [preference]);

  const t = QC_TOKENS[mode];
  const d = QC_DENSITY[density];

  // Mirror the theme tokens onto :root so html/body (styled in globals.css)
  // pick up the active palette. Without this the body bg falls back to the
  // pre-hydration default and overscroll/elastic-scroll flashes white in
  // dark mode (and the inverted color in light mode after a toggle).
  useEffect(() => {
    const root = document.documentElement;
    const vars = tokensToCssVars(t);
    Object.entries(vars).forEach(([k, v]) => {
      if (typeof v === "string") root.style.setProperty(k, v);
    });
    root.style.colorScheme = mode;
  }, [t, mode]);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    if (p === "system") {
      localStorage.removeItem(STORAGE_KEY);
      setModeState(readSystemPalette());
    } else {
      localStorage.setItem(STORAGE_KEY, p);
      setModeState(p);
    }
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    // Legacy entry point — treat as an explicit preference so the picker
    // and toggle stay in sync.
    setPreference(m);
  }, [setPreference]);

  const toggle = useCallback(() => {
    setMode(mode === "dark" ? "light" : "dark");
  }, [mode, setMode]);

  const value = useMemo<ThemeCtx>(
    () => ({
      mode,
      isDark: mode === "dark",
      preference,
      setMode,
      setPreference,
      toggle,
      density,
      setDensity,
      t,
      d,
    }),
    [mode, preference, setMode, setPreference, toggle, density, t, d]
  );

  return (
    <Ctx.Provider value={value}>
      <div
        style={{
          ...tokensToCssVars(t),
          background: t.bg,
          color: t.ink,
          minHeight: "100vh",
          fontFamily:
            '-apple-system, "SF Pro Text", "Inter", system-ui, sans-serif',
          WebkitFontSmoothing: "antialiased",
        }}
      >
        {children}
      </div>
    </Ctx.Provider>
  );
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
