"use client";

import {
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Icon } from "@/components/design-system/Icon";

function classes(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export interface TableWorkspaceProps {
  children: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  className?: string;
  viewportClassName?: string;
  ariaLabel?: string;
  /** Identifies this workspace in markup and future preference migrations. */
  storageKey?: string;
  defaultFocused?: boolean;
  /** Supply with onFocusedChange to control focus mode from a parent. */
  focused?: boolean;
  onFocusedChange?: (focused: boolean) => void;
  focusLabel?: string;
}

/**
 * A reusable, tall table surface with a keyboard-accessible full-viewport mode.
 * It also gives real tables a sticky header and keeps pagination visible while
 * focused. Surrounding page content remains in normal document flow otherwise.
 */
export function TableWorkspace({
  children,
  title,
  description,
  actions,
  footer,
  className,
  viewportClassName,
  ariaLabel = "Data table",
  storageKey,
  defaultFocused = false,
  focused,
  onFocusedChange,
  focusLabel = "Focus table",
}: TableWorkspaceProps) {
  const [internalFocused, setInternalFocused] = useState(defaultFocused);
  const isControlled = focused !== undefined;
  const isFocused = isControlled ? focused : internalFocused;
  const frameRef = useRef<HTMLElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const headingId = useId();
  const descriptionId = useId();
  const isEmbedded = className?.split(/\s+/).includes("table-workspace--embedded") ?? false;
  const exposeWorkspaceHeading = !isEmbedded || isFocused;

  const setFocused = useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalFocused(next);
      onFocusedChange?.(next);
    },
    [isControlled, onFocusedChange],
  );

  useEffect(() => {
    if (!isFocused) return;

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    let yieldedToExternalSurface = false;
    document.body.style.overflow = "hidden";
    document.body.classList.add("table-workspace-focus-active");

    const yieldToExternalSurface = (surface?: HTMLElement, ensureLegacyFocus = false) => {
      if (yieldedToExternalSurface) return;
      yieldedToExternalSurface = true;
      const activeTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const returnTarget = activeTarget === frameRef.current
        ? restoreFocusRef.current
          ?? frameRef.current?.querySelector<HTMLElement>(".table-workspace__focus-button")
          ?? null
        : activeTarget;
      // Release the page lock before a dialog acquires its own. Cleanup then
      // leaves focus and scroll ownership with the incoming surface.
      document.body.style.overflow = previousOverflow;
      document.body.classList.remove("table-workspace-focus-active");
      setFocused(false);
      if (surface && ensureLegacyFocus) {
        window.requestAnimationFrame(() => {
          if (!surface.isConnected || surface.hidden || surface.getAttribute("aria-hidden") === "true") return;
          // Shared drawers and modern full-screen panels focus and lock in
          // their own effects. This is a fallback for older aria-modal
          // surfaces that do neither.
          if (!surface.contains(document.activeElement)) {
            if (!surface.hasAttribute("tabindex")) surface.tabIndex = -1;
            surface.focus({ preventScroll: true });
          }
          if (document.body.style.overflow === "hidden") return;
          document.body.style.overflow = "hidden";
          const getFocusable = () => Array.from(surface.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          )).filter((element) => element.getClientRects().length > 0);
          const trapLegacyFocus = (event: KeyboardEvent) => {
            if (event.key !== "Tab") return;
            const focusable = getFocusable();
            if (!focusable.length) {
              event.preventDefault();
              surface.focus({ preventScroll: true });
              return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && (document.activeElement === first || !surface.contains(document.activeElement))) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && (document.activeElement === last || !surface.contains(document.activeElement))) {
              event.preventDefault();
              first.focus();
            }
          };
          const containLegacyFocus = (event: FocusEvent) => {
            const target = event.target instanceof HTMLElement ? event.target : null;
            if (!surface.isConnected || !target || surface.contains(target)) return;
            (getFocusable()[0] ?? surface).focus({ preventScroll: true });
          };
          const releaseFallbackGuards = () => {
            document.removeEventListener("keydown", trapLegacyFocus, true);
            document.removeEventListener("focusin", containLegacyFocus);
          };
          document.addEventListener("keydown", trapLegacyFocus, true);
          document.addEventListener("focusin", containLegacyFocus);
          const releaseLegacyLock = new MutationObserver(() => {
            const closed = !surface.isConnected
              || surface.hidden
              || surface.getAttribute("aria-hidden") === "true"
              || surface.getClientRects().length === 0;
            if (!closed) return;
            releaseLegacyLock.disconnect();
            releaseFallbackGuards();
            document.body.style.overflow = previousOverflow;
            if (returnTarget?.isConnected) returnTarget.focus({ preventScroll: true });
          });
          releaseLegacyLock.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["aria-hidden", "hidden", "open", "class", "style"],
          });
        });
      }
    };
    frameRef.current?.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Portaled row-action menus live inside the focused workspace so they
        // participate in its focus loop. Give the menu first refusal on
        // Escape; its own handler closes it and restores its trigger.
        if (frameRef.current?.querySelector('[role="menu"]')) return;
        event.preventDefault();
        setFocused(false);
        return;
      }
      if (event.key !== "Tab" || !frameRef.current) return;

      const focusable = Array.from(
        frameRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) =>
        !element.hidden &&
        element.getAttribute("aria-hidden") !== "true" &&
        element.getClientRects().length > 0,
      );
      if (!focusable.length) {
        event.preventDefault();
        frameRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !frameRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !frameRef.current.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    // A row action may open a higher-priority drawer/dialog. Yield focus mode
    // as soon as that surface receives focus so two modal focus traps never
    // compete and the new action remains keyboard reachable.
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target || frameRef.current?.contains(target)) return;
      const externalSurface = target.closest<HTMLElement>('[role="dialog"], [aria-modal="true"]');
      if (externalSurface && externalSurface !== frameRef.current) {
        yieldToExternalSurface(externalSurface, false);
        return;
      }
      frameRef.current?.focus({ preventScroll: true });
    };
    const guardBackgroundInteraction = (event: Event) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target || frameRef.current?.contains(target)) return;
      const externalSurface = target.closest<HTMLElement>('[role="dialog"], [aria-modal="true"]');
      if (externalSurface && externalSurface !== frameRef.current) {
        yieldToExternalSurface(externalSurface, false);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      frameRef.current?.focus({ preventScroll: true });
    };
    // A few legacy full-screen review panels correctly declare dialog
    // semantics but do not move focus when they mount. Watch for those (and
    // portaled action menus) so the table never leaves a second modal trap
    // active underneath them.
    const findExternalSurface = () => {
      const candidates = document.querySelectorAll<HTMLElement>(
        '[role="dialog"][aria-modal="true"]',
      );
      for (const surface of candidates) {
        if (surface === frameRef.current || frameRef.current?.contains(surface)) continue;
        if (surface.hidden || surface.getAttribute("aria-hidden") === "true" || surface.getClientRects().length === 0) continue;
        yieldToExternalSurface(surface, true);
        break;
      }
    };
    const surfaceObserver = typeof MutationObserver !== "undefined"
      ? new MutationObserver(findExternalSurface)
      : null;
    surfaceObserver?.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["role", "aria-modal", "aria-hidden", "hidden", "open", "class", "style"],
    });
    // Some routes replace the table with a file workspace using `display:none`
    // instead of unmounting it. Do not leave a hidden fullscreen trap active.
    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
          const bounds = frameRef.current?.getBoundingClientRect();
          if (bounds && (bounds.width === 0 || bounds.height === 0)) setFocused(false);
        })
      : null;
    if (frameRef.current) resizeObserver?.observe(frameRef.current);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("pointerdown", guardBackgroundInteraction, true);
    document.addEventListener("click", guardBackgroundInteraction, true);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("pointerdown", guardBackgroundInteraction, true);
      document.removeEventListener("click", guardBackgroundInteraction, true);
      resizeObserver?.disconnect();
      surfaceObserver?.disconnect();
      if (yieldedToExternalSurface) return;
      document.body.style.overflow = previousOverflow;
      document.body.classList.remove("table-workspace-focus-active");
      const restoreTarget = restoreFocusRef.current;
      if (restoreTarget?.isConnected) restoreTarget.focus({ preventScroll: true });
    };
  }, [isFocused, setFocused]);

  const labelProps = title && exposeWorkspaceHeading
    ? { "aria-labelledby": headingId }
    : { "aria-label": ariaLabel };

  return (
    <section
      ref={frameRef}
      className={classes("table-workspace", isFocused && "is-focused", className)}
      data-table-workspace={storageKey || true}
      data-focused={isFocused ? "true" : "false"}
      role={isFocused ? "dialog" : "region"}
      aria-modal={isFocused ? true : undefined}
      aria-describedby={description && exposeWorkspaceHeading ? descriptionId : undefined}
      tabIndex={isFocused ? -1 : undefined}
      {...labelProps}
    >
      <div className="table-workspace__toolbar">
        <div className="table-workspace__heading">
          {title && exposeWorkspaceHeading ? <h2 id={headingId}>{title}</h2> : null}
          {description && exposeWorkspaceHeading ? <p id={descriptionId}>{description}</p> : null}
        </div>
        <div className="table-workspace__actions">
          {actions}
          <button
            type="button"
            className="btn sm table-workspace__focus-button"
            aria-pressed={isFocused}
            aria-label={isFocused ? "Exit table focus" : focusLabel}
            title={isFocused ? "Exit table focus (Esc)" : focusLabel}
            onClick={() => setFocused(!isFocused)}
          >
            <Icon name={isFocused ? "minimize" : "maximize"} size={15} aria-hidden="true" />
            <span>{isFocused ? "Exit focus" : "Focus table"}</span>
          </button>
        </div>
      </div>
      <div className={classes("table-workspace__viewport", viewportClassName)}>
        {children}
      </div>
      {footer ? <div className="table-workspace__footer">{footer}</div> : null}
    </section>
  );
}

export interface PinRowButtonProps {
  pinned: boolean;
  onToggle: () => void;
  /** Human-readable record name used by assistive technology. */
  label: string;
  className?: string;
  disabled?: boolean;
}

/** Compact table-row control. Stops row click navigation before toggling. */
export function PinRowButton({
  pinned,
  onToggle,
  label,
  className,
  disabled,
}: PinRowButtonProps) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onToggle();
  };

  return (
    <button
      type="button"
      className={classes("table-row-pin", pinned && "is-pinned", className)}
      aria-label={`${pinned ? "Unpin" : "Pin"} ${label} ${pinned ? "from" : "to"} the top of this page`}
      aria-pressed={pinned}
      title={pinned ? "Unpin from the top of this page" : "Pin to the top of this page"}
      onClick={handleClick}
      disabled={disabled}
    >
      <Icon name="pinTop" size={14} aria-hidden="true" />
    </button>
  );
}
