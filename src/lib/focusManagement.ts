/**
 * Return focus after dismissing a transient menu without stealing it from a
 * dialog that the selected menu action just opened.
 */
export function restoreTransientFocus(target: HTMLElement | null): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  window.requestAnimationFrame(() => {
    if (!target?.isConnected) return;

    const owner = target.closest<HTMLElement>('[role="dialog"][aria-modal="true"]');
    const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]');
    for (const dialog of dialogs) {
      if (dialog === owner) continue;
      if (
        dialog.isConnected
        && !dialog.hidden
        && dialog.getAttribute("aria-hidden") !== "true"
        && dialog.getClientRects().length > 0
      ) {
        return;
      }
    }

    const active = document.activeElement;
    const focusIsUnowned = !active
      || active === document.body
      || active === document.documentElement
      || !active.isConnected;
    if (focusIsUnowned) target.focus({ preventScroll: true });
  });
}
