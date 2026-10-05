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

// Field Desk is deployed separately from Funding. Use an absolute handoff for
// Marketing so Next never prefetches `/marketing` from the Funding deployment,
// which does not own that route and correctly returns 404.
export const FIELD_DESK_ORIGIN =
  (process.env.NEXT_PUBLIC_FIELD_DESK_URL || "https://rep.qualifiedcommercial.com").replace(
    /\/+$/,
    "",
  );

export const MARKETING_URL = `${FIELD_DESK_ORIGIN}/marketing`;

export const SIGN_IN_URL = `${APP_ORIGIN}/sign-in`;
export const SIGN_UP_URL = `${APP_ORIGIN}/sign-up`;
