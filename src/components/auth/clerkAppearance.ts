// Shared Clerk appearance config — used by /sign-in, /sign-up and
// /forgot-password so the three flows match.
//
// The marketing site moved from dark navy + gold to a light institutional
// system, and these pages sit on the same brand. The values below mirror the
// tokens in globals.css (.qc-marketing): white card on a cool paper ground,
// one deep blue accent, 8px radii, no gold and no glow.
//
// Kept as literals rather than var(--ms-*) on purpose — Clerk injects this
// through its own style layer, which does not inherit our scoped custom
// properties. If the tokens change, change them here too.
//
// Variable + element names follow Clerk's public appearance API:
//   https://clerk.com/docs/customization/overview

const INK = "#0f1720";
const MUTED = "#5a6675";
const SURFACE = "#ffffff";
const SUNKEN = "#eef1f6";
const ACCENT = "#1b4b9e";
const ACCENT_700 = "#153c7e";
const DIVIDER = "rgba(15, 23, 32, 0.12)";
const DIVIDER_STRONG = "rgba(15, 23, 32, 0.2)";

export const CLERK_APPEARANCE = {
  variables: {
    colorPrimary: ACCENT,
    colorBackground: SURFACE,
    colorInputBackground: SURFACE,
    colorInputText: INK,
    colorText: INK,
    colorTextSecondary: MUTED,
    colorTextOnPrimaryBackground: "#ffffff",
    colorDanger: "#b42318",
    colorSuccess: "#0f7b4f",
    colorWarning: "#a15c07",
    colorNeutral: MUTED,
    fontFamily: "Inter, -apple-system, 'SF Pro Text', system-ui, sans-serif",
    fontSize: "14px",
    borderRadius: "8px",
  },
  elements: {
    rootBox: { width: "100%" },
    card: {
      width: "100%",
      maxWidth: 480,
      backgroundColor: SURFACE,
      border: `1px solid ${DIVIDER}`,
      borderRadius: "12px",
      boxShadow: "0 4px 12px rgba(15, 23, 32, 0.08)",
      backdropFilter: "none",
    },
    headerTitle: { color: INK, fontWeight: 600, letterSpacing: "-0.02em" },
    headerSubtitle: { color: MUTED },
    socialButtonsBlockButton: {
      backgroundColor: SURFACE,
      borderColor: DIVIDER_STRONG,
      color: INK,
    },
    socialButtonsBlockButtonText: { color: INK, fontWeight: 600 },
    formFieldLabel: { color: INK, fontWeight: 500 },
    formFieldInput: {
      backgroundColor: SURFACE,
      borderColor: DIVIDER_STRONG,
      color: INK,
    },
    formButtonPrimary: {
      background: ACCENT,
      color: "#ffffff",
      fontWeight: 600,
      boxShadow: "none",
      textTransform: "none",
      "&:hover": { background: ACCENT_700 },
    },
    footerActionLink: { color: ACCENT_700, fontWeight: 600 },
    dividerLine: { backgroundColor: DIVIDER },
    dividerText: { color: MUTED },
    identityPreviewText: { color: INK },
    identityPreviewEditButton: { color: ACCENT_700 },
    formResendCodeLink: { color: ACCENT_700 },
    formFieldInputShowPasswordButton: { color: MUTED },
    footer: { backgroundColor: SUNKEN },
  },
} as const;

/**
 * @deprecated The auth pages are light now. Kept so any straggling import keeps
 * compiling; point new code at CLERK_APPEARANCE.
 */
export const CLERK_DARK_APPEARANCE = CLERK_APPEARANCE;
