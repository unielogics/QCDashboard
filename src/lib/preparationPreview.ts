type PreviewOptions = { title: string; description: string; state?: "loading" | "complete" | "error" };

function escapeText(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
}

/** Keeps the preview tab useful while its server-generated document is pending. */
export function writePreparationPreview(target: Window, { title, description, state = "loading" }: PreviewOptions): void {
  try {
  if (target.closed) return;
  const safeTitle = escapeText(title), safeDescription = escapeText(description);
  const label = state === "complete" ? "Ready" : state === "error" ? "Needs attention" : "In progress";
  target.document.open();
  target.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title><style>
    :root{color-scheme:light dark;--bg:#f5f7fb;--surface:#fff;--ink:#18212d;--muted:#657186;--line:#e1e5ed;--accent:#3853a4}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:var(--bg);color:var(--ink);font:14px/1.6 system-ui,sans-serif}main{width:min(100%,540px);padding:30px;background:var(--surface);border:1px solid var(--line);border-radius:18px;box-shadow:0 12px 45px #152b5710}.file{width:48px;height:56px;border:2px solid var(--accent);border-radius:6px;position:relative;background:var(--bg);margin-bottom:24px}.file:before,.file:after{content:"";position:absolute;left:10px;right:10px;height:2px;background:var(--accent);opacity:.55;top:22px}.file:after{top:32px;right:18px}.status{color:var(--accent);font-size:12px;font-weight:600}h1{font-size:22px;line-height:1.3;margin:6px 0 10px;overflow-wrap:anywhere}p{color:var(--muted);margin:0;overflow-wrap:anywhere}.track{height:6px;border-radius:9px;background:var(--line);overflow:hidden;margin-top:24px}.fill{height:100%;width:36%;border-radius:inherit;background:var(--accent);animation:prepare 1.8s ease-in-out infinite}small{display:block;margin-top:14px;color:var(--muted);font-size:12px}[data-state=error]{--accent:#b6332d}[data-state=complete]{--accent:#39815b}[data-state=error] .fill,[data-state=complete] .fill{width:100%;animation:none}[data-state=error] .fill{opacity:.35}@keyframes prepare{from{transform:translateX(-105%)}to{transform:translateX(385%)}}@media(prefers-reduced-motion:reduce){[data-state=loading] .fill{animation:none;width:36%;transform:translateX(88%);opacity:.55}}@media(prefers-color-scheme:dark){:root{--bg:#111826;--surface:#1b2535;--ink:#f0f3fa;--muted:#b1bdd1;--line:#354155;--accent:#9bb0ff}}@media(max-width:480px){main{padding:22px}h1{font-size:19px}}
    </style></head><body><main data-state="${state}"><div class="file" aria-hidden="true"></div><div role="status"><span class="status">${label}</span><h1>${safeTitle}</h1><p>${safeDescription}</p></div><div class="track" role="progressbar" aria-busy="${state === "loading"}" aria-label="${safeTitle}" aria-valuemin="0" aria-valuemax="100" ${state === "complete" ? 'aria-valuenow="100"' : ""} aria-valuetext="${label}"><div class="fill"></div></div><small>${state === "loading" ? "Your preview will open here when it is ready. Larger files can take a little longer." : state === "error" ? "Return to the file to review the error and retry." : "Return to the file to view all generated documents."}</small></main></body></html>`);
  target.document.close();
  } catch {
    // The user can close or navigate the preview tab while generation runs.
    // That must not turn a successfully saved package into an apparent failure.
  }
}
