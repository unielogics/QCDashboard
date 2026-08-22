"use client";

import { useAuth } from "@clerk/nextjs";

export const isVisualQa =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_QC_VISUAL_QA === "1";
export const VISUAL_QA_USER_KEY = "qc.visualQaUser";
export const VISUAL_QA_USER_COOKIE = "qc_visual_qa_user";

/**
 * Local screenshot harness adapter. Production and ordinary development use
 * Clerk unchanged; the explicit visual-QA server uses the backend's seeded
 * X-Dev-User identity so protected routes can be reviewed deterministically.
 */
export function useConsoleAuth() {
  const auth = useAuth();
  if (!isVisualQa) return auth;
  return {
    ...auth,
    isLoaded: true,
    isSignedIn: true,
    userId: "visual-qa",
    getToken: async () => null,
  };
}

export function visualQaUser(fallback: string): string {
  if (!isVisualQa) return fallback;
  if (typeof window !== "undefined") {
    const cookieValue = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${VISUAL_QA_USER_COOKIE}=`))
      ?.slice(VISUAL_QA_USER_COOKIE.length + 1);
    if (cookieValue) return decodeURIComponent(cookieValue);
    const selected = window.localStorage.getItem(VISUAL_QA_USER_KEY);
    if (selected) return selected;
  }
  return process.env.NEXT_PUBLIC_QC_VISUAL_QA_USER || "admin@qc.dev";
}
