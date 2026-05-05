"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { QC_DENSITY, QC_TOKENS, type Density, type QCTokens, type ThemeMode, tokensToCssVars } from "./tokens";

interface ThemeCtx {
  mode: ThemeMode;
  isDark: boolean;
  setMode: (m: ThemeMode) => void;
  toggle: () => void;
  density: Density;
  setDensity: (d: Density) => void;
  t: QCTokens;
  d: (typeof QC_DENSITY)[Density];
}

const Ctx = createContext<ThemeCtx | null>(null);

const STORAGE_KEY = "qc.theme";
const DENSITY_KEY = "qc.density";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>("light");
  const [density, setDensity] = useState<Density>("comfortable");

  // Hydrate from localStorage / system preference on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") {
      setMode(saved);
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setMode("dark");
    }
    const savedDensity = localStorage.getItem(DENSITY_KEY);
    if (savedDensity === "comfortable" || savedDensity === "compact") {
      setDensity(savedDensity);
    }
  }, []);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, mode); }, [mode]);
  useEffect(() => { localStorage.setItem(DENSITY_KEY, density); }, [density]);

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

  const value = useMemo<ThemeCtx>(
    () => ({
      mode,
      isDark: mode === "dark",
      setMode,
      toggle: () => setMode((m) => (m === "dark" ? "light" : "dark")),
      density,
      setDensity,
      t,
      d,
    }),
    [mode, density, t, d]
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
