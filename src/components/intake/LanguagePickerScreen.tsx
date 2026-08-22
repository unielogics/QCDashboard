"use client";

// First screen a client sees on the public dealer/funding-review intake
// pages, before the contact form -- picks English or Spanish. The choice
// flows into the /start payload as preferred_language and then drives both
// the page's own copy tree and the AI chat's response language for the rest
// of the session. Styled to match the existing stepOneHero/stepOneCta visual
// language on both intake pages (dark hero card, gold accent) rather than
// introducing a new look.

import type { Lang } from "@/lib/intakeCopy";

export function LanguagePickerScreen({ onPick }: { onPick: (lang: Lang) => void }) {
  return (
    // `.v-gate` and not the console vocabulary: these rooms are dark-ground and
    // gold-accented, and `.card` / `.btn` both paint `var(--surface)` — a white
    // institutional surface — which would render console chrome on a near-black
    // public page.
    <section className="v-gate">
      {/* h1, not h2. This is the FIRST thing a stranger arriving from a
          marketing link sees, and until they choose a language it is the whole
          page — so it was a document with no top-level heading at all. The
          rooms behind it already emit their own h1. */}
      <h1 className="v-gate-t">Choose your language / Elige tu idioma</h1>
      <p className="v-gate-s">
        You can talk to the AI underwriter in this language. Your loan documents will always be prepared in English.
        <br />
        Puedes hablar con el suscriptor de IA en este idioma. Tus documentos del préstamo siempre se prepararán en inglés.
      </p>
      <div className="v-gate-opts">
        <button type="button" className="v-gate-b" onClick={() => onPick("en")} lang="en">
          Continue in English
        </button>
        <button type="button" className="v-gate-b" onClick={() => onPick("es")} lang="es">
          Continuar en Español
        </button>
      </div>
    </section>
  );
}
