import type { Config } from "tailwindcss";

// Tailwind is mostly here for layout utilities — colors come from CSS vars
// fed by the design tokens (see src/components/design-system/ThemeProvider).
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // fontFamily deliberately NOT overridden. It used to force -apple-system
      // over the Inter / Inter Tight faces layout.tsx loads, so the app never
      // rendered in its own typeface. globals.css owns type via --fh / --fb.
      colors: {
        bg: "var(--qc-bg)",
        surface: "var(--qc-surface)",
        surface2: "var(--qc-surface2)",
        elevated: "var(--qc-elevated)",
        line: "var(--qc-line)",
        lineStrong: "var(--qc-line-strong)",
        ink: "var(--qc-ink)",
        ink2: "var(--qc-ink2)",
        ink3: "var(--qc-ink3)",
        ink4: "var(--qc-ink4)",
        inverse: "var(--qc-inverse)",
        brand: "var(--qc-brand)",
        brandSoft: "var(--qc-brand-soft)",
        petrol: "var(--qc-petrol)",
        petrolSoft: "var(--qc-petrol-soft)",
        gold: "var(--qc-gold)",
        goldSoft: "var(--qc-gold-soft)",
        profit: "var(--qc-profit)",
        profitBg: "var(--qc-profit-bg)",
        warn: "var(--qc-warn)",
        warnBg: "var(--qc-warn-bg)",
        danger: "var(--qc-danger)",
        dangerBg: "var(--qc-danger-bg)",
        chip: "var(--qc-chip)",
      },
    },
  },
  plugins: [],
};

export default config;
