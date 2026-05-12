// Shared Clerk appearance config — used by both /sign-in and /sign-up
// pages so the two flows match. Overrides Clerk's defaults so the
// widget reads against the dark-navy marketing hero background.
//
// Variable + element names follow Clerk's public appearance API:
//   https://clerk.com/docs/customization/overview

export const CLERK_DARK_APPEARANCE = {
  variables: {
    colorPrimary: "#D4AF37",
    colorBackground: "rgba(8, 14, 33, 0.85)",
    colorInputBackground: "rgba(255, 255, 255, 0.04)",
    colorInputText: "#F8FAFC",
    colorText: "#E2E8F0",
    colorTextSecondary: "#94A3B8",
    colorTextOnPrimaryBackground: "#0B1326",
    colorDanger: "#F87171",
    colorSuccess: "#34D399",
    colorWarning: "#FBBF24",
    colorNeutral: "#94A3B8",
    fontFamily: "-apple-system, 'SF Pro Text', Inter, system-ui, sans-serif",
    fontSize: "14px",
    borderRadius: "12px",
  },
  elements: {
    rootBox: { width: "100%" },
    card: {
      width: "100%",
      maxWidth: 480,
      backgroundColor: "rgba(8, 14, 33, 0.85)",
      border: "1px solid rgba(255, 255, 255, 0.10)",
      boxShadow: "0 24px 60px rgba(0, 0, 0, 0.55)",
      backdropFilter: "blur(12px)",
    },
    headerTitle: { color: "#F8FAFC" },
    headerSubtitle: { color: "#94A3B8" },
    socialButtonsBlockButton: {
      backgroundColor: "rgba(255, 255, 255, 0.05)",
      borderColor: "rgba(255, 255, 255, 0.12)",
      color: "#F8FAFC",
    },
    socialButtonsBlockButtonText: { color: "#F8FAFC", fontWeight: 600 },
    formFieldLabel: { color: "#CBD5E1", fontWeight: 600 },
    formFieldInput: {
      backgroundColor: "rgba(255, 255, 255, 0.04)",
      borderColor: "rgba(255, 255, 255, 0.12)",
      color: "#F8FAFC",
    },
    formButtonPrimary: {
      background: "linear-gradient(135deg, #E9D58A 0%, #D4AF37 100%)",
      color: "#0B1326",
      fontWeight: 800,
      boxShadow: "0 12px 36px rgba(212, 175, 55, 0.28)",
    },
    footerActionLink: { color: "#E9D58A" },
    dividerLine: { backgroundColor: "rgba(255, 255, 255, 0.10)" },
    dividerText: { color: "#64748B" },
    identityPreviewText: { color: "#E2E8F0" },
    identityPreviewEditButton: { color: "#E9D58A" },
    formResendCodeLink: { color: "#E9D58A" },
  },
} as const;
