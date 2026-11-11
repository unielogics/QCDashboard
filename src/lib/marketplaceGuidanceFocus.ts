/** One explicit guidance request; stop waiting when the user moves elsewhere. */
export function focusMarketplaceControl(resolve: () => HTMLElement | null | undefined, highlightClass: string): () => void {
  let frame = 0;
  let highlighted: HTMLElement | null = null;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true; observer.disconnect(); cancelAnimationFrame(frame); window.clearTimeout(timeout);
    for (const event of ["pointerdown", "keydown", "wheel", "touchstart"]) window.removeEventListener(event, stop, true);
  };
  const attempt = () => {
    frame = 0;
    const target = resolve();
    if (stopped || !target || !target.getClientRects().length || target.matches(":disabled")) return;
    stop(); highlighted = target;
    target.classList.add(highlightClass);
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    target.focus({ preventScroll: true });
  };
  const schedule = () => { if (!stopped && !frame) frame = requestAnimationFrame(attempt); };
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "disabled", "aria-hidden"] });
  const timeout = window.setTimeout(stop, 15000);
  for (const event of ["pointerdown", "keydown", "wheel", "touchstart"]) window.addEventListener(event, stop, true);
  schedule();
  return () => { stop(); highlighted?.classList.remove(highlightClass); };
}
