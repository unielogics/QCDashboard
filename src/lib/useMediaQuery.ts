"use client";

// One media query, as a hook, resolved on the client only.
//
// Four `matchMedia` call sites already exist in this app — dealer-ai-underwriter,
// funding-review, mca-refinance-intake, AppShell — and not one of them is a
// hook, so each re-implements the listener and the cleanup. This is that code
// once.
//
// **It answers `null` until the browser has told us.** That is the whole point
// of the file. A hook that guessed `false` on the server and `true` on the
// client would make Next hydrate a tree that does not match the one it
// rendered, and the worksheet's fork is exactly the case where the two trees
// are different components rather than a different class name. `null` means
// "not known yet": render neither branch, and decide once.
//
// The listener is `change` on the MediaQueryList, not `resize` on the window:
// a rotation or a zoom fires it, and nothing fires it while a person is merely
// dragging a window across a width the query does not care about.

import { useEffect, useState } from "react";

/**
 * `true` / `false` once the browser has evaluated the query, `null` before.
 *
 * ```tsx
 * const wide = useMediaQuery("(min-width: 760px)");
 * if (wide === null) return <Skeleton />;   // never guess
 * return wide ? <Grid /> : <StackedForms />;
 * ```
 */
export function useMediaQuery(query: string): boolean | null {
  const [matches, setMatches] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      // No matchMedia at all (a very old browser, or a test environment that
      // did not stub it). Answering `false` rather than staying `null` forever
      // is the safe half of the fork: the stacked forms work everywhere.
      setMatches(false);
      return;
    }
    const media = window.matchMedia(query);
    setMatches(media.matches);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    // Safari below 14 has only the deprecated pair. Both are kept because the
    // public forms are opened on whatever phone the borrower owns.
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    }
    media.addListener(onChange);
    return () => media.removeListener(onChange);
  }, [query]);

  return matches;
}

/** The worksheet's fork. 760px is `AppShell.tsx:69`'s breakpoint, and the
 *  width below which `DebtScheduleForm`'s twelve columns would scroll
 *  sideways — the one thing the stacked forms exist to prevent. */
export const WORKSHEET_MIN_WIDTH = "(min-width: 760px)";

export default useMediaQuery;
