"use client";

import { useEffect, useState } from "react";

export type DesktopOS = "mac" | "windows" | "other";

export function detectDesktopOS(): DesktopOS {
  if (typeof navigator === "undefined") return "other";
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const rawPlatform = nav.userAgentData?.platform || navigator.platform || navigator.userAgent || "";
  const platform = typeof rawPlatform === "string" ? rawPlatform.toLowerCase() : "";
  if (platform.includes("mac") || platform.includes("iphone") || platform.includes("ipad")) return "mac";
  if (platform.includes("win")) return "windows";
  return "other";
}

export function isPrimaryShortcut(e: KeyboardEvent, key: string, os = detectDesktopOS()): boolean {
  // Browser extensions, embedded webviews, and a few Samsung keyboard paths
  // can dispatch keydown-like events without a string `key`. The app shell is
  // global, so one malformed event must not crash every route beneath it.
  const eventKey = typeof e?.key === "string" ? e.key : "";
  if (!eventKey || typeof key !== "string" || eventKey.toLowerCase() !== key.toLowerCase()) return false;
  return os === "mac" ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
}

export function usePrimaryShortcutLabel(key: string): string {
  const [os, setOs] = useState<DesktopOS>("other");

  useEffect(() => {
    setOs(detectDesktopOS());
  }, []);

  return `${os === "mac" ? "⌘" : "Ctrl+"}${key.toUpperCase()}`;
}
