"use client";

// First screen a client sees on the public dealer/funding-review intake
// pages, before the contact form -- picks English or Spanish. The choice
// flows into the /start payload as preferred_language and then drives both
// the page's own copy tree and the AI chat's response language for the rest
// of the session. Styled to match the existing stepOneHero/stepOneCta visual
// language on both intake pages (dark hero card, gold accent) rather than
// introducing a new look.

import type { CSSProperties } from "react";
import type { Lang } from "@/lib/intakeCopy";

export function LanguagePickerScreen({ onPick }: { onPick: (lang: Lang) => void }) {
  return (
    <section style={card}>
      <h2 style={title}>Choose your language / Elige tu idioma</h2>
      <p style={sub}>
        You can talk to the AI underwriter in this language. Your loan documents will always be prepared in English.
        <br />
        Puedes hablar con el suscriptor de IA en este idioma. Tus documentos del préstamo siempre se prepararán en inglés.
      </p>
      <div style={grid}>
        <button type="button" style={optionButton} onClick={() => onPick("en")}>
          Continue in English
        </button>
        <button type="button" style={optionButton} onClick={() => onPick("es")}>
          Continuar en Español
        </button>
      </div>
    </section>
  );
}

const card: CSSProperties = {
  border: "1px solid rgba(212,175,55,.38)",
  borderRadius: 24,
  background:
    "linear-gradient(135deg, rgba(10,28,55,.96), rgba(8,20,42,.95) 52%, rgba(8,18,36,.98)), radial-gradient(circle at 50% 20%, rgba(33,211,199,.13), transparent 30%)",
  minHeight: 320,
  padding: "clamp(28px,5vw,52px)",
  display: "grid",
  gap: 20,
  justifyItems: "center",
  textAlign: "center",
  boxShadow: "0 30px 100px rgba(0,0,0,.36)",
};

const title: CSSProperties = {
  margin: 0,
  color: "#F8FAFC",
  fontFamily: "Georgia, 'Times New Roman', serif",
  fontSize: "clamp(24px,3.4vw,32px)",
  fontWeight: 600,
};

const sub: CSSProperties = {
  margin: 0,
  maxWidth: 520,
  color: "#B6C4D7",
  fontSize: 14,
  lineHeight: 1.65,
};

const grid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
  width: "100%",
  maxWidth: 480,
};

const optionButton: CSSProperties = {
  border: 0,
  borderRadius: 999,
  minHeight: 52,
  background: "linear-gradient(135deg,#F2E58F,#D8B533)",
  color: "#081122",
  fontWeight: 900,
  cursor: "pointer",
  fontSize: 15,
};
