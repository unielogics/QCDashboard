// Absolute origin of the authenticated app (app.qualifiedcommercial.com).
//
// The public marketing site (qualifiedcommercial.com) and the app share
// this Next codebase but are served on different hosts. Auth links must
// always resolve to the APP host — a relative "/sign-in" rendered on the
// marketing host 404s. Override per-env with NEXT_PUBLIC_APP_URL.
export const APP_ORIGIN =
  (process.env.NEXT_PUBLIC_APP_URL || "https://app.qualifiedcommercial.com").replace(
    /\/+$/,
    "",
  );

export const SIGN_IN_URL = `${APP_ORIGIN}/sign-in`;
export const SIGN_UP_URL = `${APP_ORIGIN}/sign-up`;
