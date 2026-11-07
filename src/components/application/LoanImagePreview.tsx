"use client";

import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Btn } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useDevUser } from "@/hooks/useApi";
import { useConsoleAuth } from "@/lib/consoleAuth";
import { documentVersionLabel } from "@/lib/documentVersions";
import { fetchLoanImagePreview, loanFileHasImagePreview, loanPreviewPosition, type LoanPreviewFile } from "@/lib/loanImagePreview";
import styles from "./LoanImagePreview.module.css";

type Target = { file: LoanPreviewFile; anchor: HTMLElement; focusTarget: HTMLElement; pinned: boolean; scope: string };
type PreviewContext = {
  show: (file: LoanPreviewFile, anchor: HTMLElement, options?: { pinned?: boolean; focusTarget?: HTMLElement; immediate?: boolean; fromFocus?: boolean }) => void;
  leave: () => void; cancelLeave: () => void; hide: () => void; consumeRestoredFocus: (element: HTMLElement) => boolean; escapeEpoch: number; activeId?: string; previewId: string;
};
const Context = createContext<PreviewContext | null>(null);
const nullToken = async () => null;

/** Preview is read-only local state, independent of worksheet selection and document mapping. */
export function LoanImagePreviewProvider({ profileId, contextKey, onOpenSource, children }: { profileId: string; contextKey: string; onOpenSource: (fileId: string, hash?: string) => void; children: ReactNode }) {
  const { getToken, isSignedIn } = useConsoleAuth(); const devUser = useDevUser();
  const scope = JSON.stringify([profileId, contextKey]);
  const [target, setTarget] = useState<Target | null>(null);
  const targetRef = useRef(target); targetRef.current = target?.scope === scope ? target : null;
  const [result, setResult] = useState<{ key: string; url?: string; error?: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const [escapeEpoch, setEscapeEpoch] = useState(0);
  const [position, setPosition] = useState<ReturnType<typeof loanPreviewPosition>>();
  const panel = useRef<HTMLDivElement>(null);
  const delay = useRef<ReturnType<typeof setTimeout>>();
  const leaveDelay = useRef<ReturnType<typeof setTimeout>>();
  const generation = useRef(0);
  const restoredFocus = useRef<HTMLElement | null>(null);
  const consumeRestoredFocus = useCallback((element: HTMLElement) => { if (restoredFocus.current !== element) return false; restoredFocus.current = null; return true; }, []);
  const restoreFocus = useCallback((element: HTMLElement) => { requestAnimationFrame(() => { if (element.isConnected) { restoredFocus.current = element; element.focus({ preventScroll: true }); } }); }, []);
  const previewId = useId();
  const key = target?.scope === scope ? JSON.stringify([scope, target.file.file_id, target.file.content_hash ?? "", retry]) : "";
  const previewFile = target?.scope === scope ? target.file : undefined;
  const cancelLeave = useCallback(() => { clearTimeout(leaveDelay.current); clearTimeout(delay.current); }, []);
  const hide = useCallback(() => { cancelLeave(); generation.current += 1; setTarget(null); }, [cancelLeave]);
  const show = useCallback<PreviewContext["show"]>((file, anchor, options = {}) => {
    if (options.fromFocus && restoredFocus.current === anchor) { restoredFocus.current = null; return; }
    cancelLeave();
    if (!loanFileHasImagePreview(file)) { hide(); return; }
    const next = { file, anchor, focusTarget: options.focusTarget ?? anchor, pinned: options.pinned ?? false, scope };
    if (options.immediate || options.pinned) setTarget(next);
    else delay.current = setTimeout(() => setTarget(next), 180);
  }, [cancelLeave, hide, scope]);
  const leave = useCallback(() => { clearTimeout(delay.current); if (!targetRef.current?.pinned) leaveDelay.current = setTimeout(hide, 220); }, [hide]);
  useEffect(() => { hide(); }, [contextKey, hide, profileId]);
  useEffect(() => () => { clearTimeout(delay.current); clearTimeout(leaveDelay.current); generation.current += 1; }, []);
  useEffect(() => {
    if (!previewFile) return;
    const controller = new AbortController(); const request = ++generation.current; let ownedUrl = "";
    setResult({ key });
    void fetchLoanImagePreview({ profileId, file: previewFile, signal: controller.signal, getToken: isSignedIn ? getToken : nullToken, devUser }).then((blob) => {
      if (controller.signal.aborted || generation.current !== request) return;
      ownedUrl = URL.createObjectURL(blob); setResult({ key, url: ownedUrl });
    }).catch((error: unknown) => { if (!controller.signal.aborted && generation.current === request) setResult({ key, error: error instanceof Error ? error.message : "The preview could not be loaded." }); });
    return () => { controller.abort(); if (ownedUrl) URL.revokeObjectURL(ownedUrl); };
    // Identity includes the exact profile/source/hash; moving its anchor doesn't reread bytes.
  }, [devUser, getToken, isSignedIn, key, profileId, previewFile]);
  useLayoutEffect(() => {
    if (!target || target.scope !== scope || !panel.current) return;
    const element = panel.current;
    if (typeof element.showPopover === "function" && !element.matches(":popover-open")) element.showPopover();
    if (target.pinned && !element.contains(document.activeElement)) element.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    const place = () => {
      if (!target.anchor.isConnected || target.anchor.closest("[inert], [aria-hidden=true]")) { hide(); return; }
      const anchor = target.anchor.getBoundingClientRect();
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      if (anchor.bottom < 0 || anchor.top > viewport.height || anchor.right < 0 || anchor.left > viewport.width) { hide(); return; }
      setPosition(loanPreviewPosition(anchor, viewport, { width: 720, height: element.scrollHeight || 840 }));
    };
    place();
    window.addEventListener("resize", place); document.addEventListener("scroll", place, true);
    const resize = new ResizeObserver(place); resize.observe(element);
    return () => { resize.disconnect(); window.removeEventListener("resize", place); document.removeEventListener("scroll", place, true); };
  }, [hide, target, scope]);
  useEffect(() => {
    if (!target) return;
    const outside = (event: Event) => { const node = event.target as Node; if (!target.anchor.contains(node) && !target.focusTarget.contains(node) && !panel.current?.contains(node) && !(node instanceof Element && node.closest("[data-loan-file-picker]"))) hide(); };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopPropagation();
      const restore = target.pinned || panel.current?.contains(document.activeElement);
      hide(); setEscapeEpoch((epoch) => epoch + 1);
      if (restore) restoreFocus(target.focusTarget);
    };
    document.addEventListener("pointerdown", outside, true); document.addEventListener("focusin", outside); document.addEventListener("keydown", escape, true);
    return () => { document.removeEventListener("pointerdown", outside, true); document.removeEventListener("focusin", outside); document.removeEventListener("keydown", escape, true); };
  }, [hide, restoreFocus, target]);
  const activeId = target?.scope === scope ? target.file.file_id : undefined;
  const value = useMemo(() => ({ show, hide, leave, cancelLeave, consumeRestoredFocus, escapeEpoch, previewId, activeId }), [show, hide, leave, cancelLeave, consumeRestoredFocus, escapeEpoch, previewId, activeId]);
  const current = result?.key === key ? result : null;
  return <Context.Provider value={value}>{children}{target?.scope === scope ? <div id={previewId} ref={panel} popover="manual" role="dialog" aria-label={`Image preview: ${target.file.file_name}`} data-loan-image-preview className={styles.preview} style={position} onPointerEnter={cancelLeave} onPointerLeave={leave} onFocus={cancelLeave}>
    <div className={styles.previewHeading}><strong>{target.file.file_name}</strong><button type="button" aria-label="Close image preview" onClick={() => { const restore = panel.current?.contains(document.activeElement); hide(); if (restore) restoreFocus(target.focusTarget); }}><Icon name="x" size={15} /></button></div>
    {current?.error ? <div className={styles.failure} role="status"><p>{current.error}</p><Btn size="sm" onClick={() => { panel.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true }); setRetry((attempt) => attempt + 1); }}>Retry preview</Btn></div> : current?.url ? <img src={current.url} alt={target.file.file_name} onError={() => setResult({ key, error: "This image could not be displayed. Retry the preview or open its original source." })} /> : <p className={styles.loading} role="status">Loading image preview…</p>}
    <div className={styles.previewFooter}><small>Preview only · no changes</small><Btn size="sm" onClick={() => { const file = target.file; hide(); onOpenSource(file.file_id, file.content_hash ?? undefined); }}>Open source</Btn></div>
  </div> : null}</Context.Provider>;
}

export function LoanImageName({ file, disabled = false }: { file: LoanPreviewFile; disabled?: boolean }) {
  const preview = useContext(Context);
  if (!preview || !loanFileHasImagePreview(file)) return <strong>{file.file_name}</strong>;
  return <button type="button" className={styles.fileName} disabled={disabled} aria-label={`Preview image ${file.file_name}`} aria-haspopup="dialog" aria-controls={preview.activeId === file.file_id ? preview.previewId : undefined} onPointerEnter={(event) => { if (event.pointerType !== "touch") preview.show(file, event.currentTarget); }} onPointerLeave={preview.leave} onFocus={(event) => preview.show(file, event.currentTarget, { fromFocus: true })} onBlur={preview.leave} onClick={(event) => preview.show(file, event.currentTarget, { pinned: true })}>{file.file_name}<Icon name="eye" size={12} /></button>;
}

/** Arrow/focus/hover browse files; only Enter or click commits a source selection. */
export function LoanFilePicker({ files, value, onChange, disabled, label = "Source document", linkedIds = [] }: { files: LoanPreviewFile[]; value: string; onChange: (fileId: string) => void; disabled?: boolean; label?: string; linkedIds?: string[] }) {
  const preview = useContext(Context);
  const [open, setOpen] = useState(false); const [query, setQuery] = useState(""); const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null); const input = useRef<HTMLInputElement>(null); const menu = useRef<HTMLDivElement>(null); const options = useRef<Array<HTMLDivElement | null>>([]);
  const [position, setPosition] = useState<{ left: number; top: number; width: number; maxHeight: number }>();
  const id = useId();
  const skipFocusOpen = useRef(false);
  const filtered = files.filter((file) => file.file_name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const selected = files.find((file) => file.file_id === value);
  const highlighted = filtered[Math.min(active, filtered.length - 1)];
  const close = useCallback(() => { setOpen(false); setQuery(""); preview?.hide(); }, [preview]);
  useEffect(() => { setOpen(false); setQuery(""); }, [preview?.escapeEpoch]);
  useEffect(() => { if (disabled) close(); }, [close, disabled]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node) && !(event.target instanceof Element && event.target.closest("[data-loan-image-preview]"))) close(); };
    document.addEventListener("pointerdown", outside, true); return () => document.removeEventListener("pointerdown", outside, true);
  }, [close, open]);
  useLayoutEffect(() => {
    if (!open || !menu.current || !input.current) return;
    if (typeof menu.current.showPopover === "function" && !menu.current.matches(":popover-open")) menu.current.showPopover();
    const place = () => {
      const anchor = input.current!.getBoundingClientRect(); const width = Math.min(Math.max(anchor.width, 280), window.innerWidth - 24);
      const below = window.innerHeight - anchor.bottom - 12; const above = anchor.top - 12; const height = Math.min(330, Math.max(below, above));
      setPosition({ left: Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12)), top: below >= Math.min(230, above) ? anchor.bottom + 5 : Math.max(12, anchor.top - height - 5), width, maxHeight: height });
    };
    place(); window.addEventListener("resize", place); document.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); document.removeEventListener("scroll", place, true); };
  }, [open]);
  const browse = (index: number) => {
    const next = Math.max(0, Math.min(index, filtered.length - 1)); setActive(next); setOpen(true);
    const file = filtered[next]; const anchor = options.current[next] ?? input.current;
    if (file && anchor && input.current) preview?.show(file, anchor, { focusTarget: input.current }); else preview?.hide();
    requestAnimationFrame(() => options.current[next]?.scrollIntoView({ block: "nearest" }));
  };
  const select = (file: LoanPreviewFile) => { onChange(file.file_id); close(); if (input.current && document.activeElement !== input.current) { skipFocusOpen.current = true; input.current.focus({ preventScroll: true }); } };
  return <div className={styles.picker} ref={root} data-loan-file-picker onBlur={(event) => { const next = event.relatedTarget; if (!root.current?.contains(next as Node) && !(next instanceof Element && next.closest("[data-loan-image-preview]"))) close(); }}>
    <div className={styles.inputRow}><input ref={input} type="text" name={`uploaded-document-choice-${id}`} autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} role="combobox" aria-label={label} aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={open && highlighted ? `${id}-${highlighted.file_id}` : undefined} disabled={disabled} placeholder={selected?.file_name || "Choose an uploaded document…"} value={open ? query : selected?.file_name ?? ""} onFocus={(event) => { if (preview?.consumeRestoredFocus(event.currentTarget)) return; if (skipFocusOpen.current) { skipFocusOpen.current = false; return; } setOpen(true); setActive(Math.max(0, files.findIndex((file) => file.file_id === value))); setQuery(""); }} onClick={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setActive(0); setOpen(true); preview?.hide(); }} onKeyDown={(event) => {
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) { event.preventDefault(); browse(event.key === "Home" ? 0 : event.key === "End" ? filtered.length - 1 : open ? active + (event.key === "ArrowDown" ? 1 : -1) : 0); }
      if (event.key === "Enter" && open) { event.preventDefault(); if (highlighted) select(highlighted); }
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
      if (event.key === "Tab") setOpen(false);
    }} /><Icon name="chevD" size={14} />{selected && loanFileHasImagePreview(selected) ? <button type="button" disabled={disabled} aria-label={`Preview selected image ${selected.file_name}`} onClick={(event) => preview?.show(selected, event.currentTarget, { pinned: true })}><Icon name="eye" size={16} /></button> : null}{selected ? <button type="button" disabled={disabled} aria-label={`Clear ${label.toLowerCase()}`} onClick={() => { onChange(""); close(); }}><Icon name="x" size={14} /></button> : null}</div>
    {open ? <div ref={menu} popover="manual" className={styles.menu} style={position}><div role="listbox" id={`${id}-list`} aria-label="Uploaded files" className={styles.options}>{filtered.length ? filtered.map((file, index) => <div key={file.file_id} ref={(element) => { options.current[index] = element; }} id={`${id}-${file.file_id}`} role="option" tabIndex={-1} aria-selected={file.file_id === value} className={index === active ? styles.active : ""} onPointerEnter={(event) => { setActive(index); if (event.pointerType !== "touch" && input.current) preview?.show(file, event.currentTarget, { focusTarget: input.current }); }} onPointerLeave={preview?.leave} onPointerDown={(event) => { if (event.pointerType !== "touch") event.preventDefault(); }} onClick={() => select(file)}><span>{file.file_name}</span><small>{[file.document_version_number ? documentVersionLabel(file) : "", linkedIds.includes(file.file_id) ? "Linked to this loan" : "", loanFileHasImagePreview(file) ? "Image · hover or use preview" : "Document"].filter(Boolean).join(" · ")}</small></div>) : <p className={styles.empty}>No matching uploaded files.</p>}</div>{highlighted && loanFileHasImagePreview(highlighted) ? <button type="button" className={styles.touchPreview} onClick={(event) => preview?.show(highlighted, event.currentTarget, { pinned: true, focusTarget: input.current ?? event.currentTarget })}><Icon name="eye" size={14} />Preview {highlighted.file_name}</button> : null}</div> : null}
  </div>;
}
