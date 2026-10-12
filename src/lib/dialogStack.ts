/** One keyboard owner and one scroll lock for stacked, portalled dialogs. */
export type DialogFocusTarget = {
  isConnected: boolean;
  contains(target: object | null): boolean;
  focus(options: { preventScroll: true }): void;
};

export type DialogStackEnvironment = {
  overflowStyle: { overflow: string };
  activeElement(): DialogFocusTarget | null;
  isPageTarget(target: DialogFocusTarget | null): boolean;
  canFocus?(target: DialogFocusTarget): boolean;
};

export type DialogKeyEvent = {
  key: string;
  shiftKey?: boolean;
  defaultPrevented?: boolean;
  isComposing?: boolean;
  repeat?: boolean;
  preventDefault(): void;
  stopPropagation(): void;
  stopImmediatePropagation?(): void;
};

type DialogEntry = {
  panel: DialogFocusTarget;
  restoreTo: DialogFocusTarget | null;
  onClose(): void;
  focusable(): DialogFocusTarget[];
  onTopmostChange?(topmost: boolean): void;
  zIndex: number;
};

export function createDialogStack(environment: DialogStackEnvironment) {
  const entries: DialogEntry[] = [];
  let originalOverflow = "";
  const top = () => entries[entries.length - 1];
  const notify = () => {
    top()?.onTopmostChange?.(true);
    entries.filter((entry) => entry !== top()).forEach((entry) => entry.onTopmostChange?.(false));
  };
  const consume = (event: DialogKeyEvent) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  };

  return {
    get size() { return entries.length; },
    register(options: Omit<DialogEntry, "restoreTo" | "zIndex"> & { baseZIndex?: number }) {
      if (!entries.length) originalOverflow = environment.overflowStyle.overflow;
      const entry: DialogEntry = {
        ...options,
        restoreTo: environment.activeElement(),
        zIndex: Math.max(options.baseZIndex ?? 61, (top()?.zIndex ?? 59) + 2),
      };
      entries.push(entry);
      environment.overflowStyle.overflow = "hidden";
      entry.onTopmostChange?.(true);
      entry.panel.focus({ preventScroll: true });
      entries.filter((other) => other !== entry).forEach((other) => other.onTopmostChange?.(false));
      let removed = false;
      return {
        zIndex: entry.zIndex,
        isTopmost: () => !removed && top() === entry,
        unregister() {
          if (removed) return;
          removed = true;
          const wasTop = top() === entry;
          const active = environment.activeElement();
          const shouldRestore = wasTop && (entry.panel.contains(active) || environment.isPageTarget(active));
          entries.splice(entries.indexOf(entry), 1);
          // Closing a parent first must not leave a child pointing at a removed
          // trigger. Carry the original outside trigger through the chain.
          for (const remaining of entries) {
            if (entry.panel.contains(remaining.restoreTo)) remaining.restoreTo = entry.restoreTo;
          }
          environment.overflowStyle.overflow = entries.length ? "hidden" : originalOverflow;
          notify();
          if (!shouldRestore) return;
          const next = top();
          const target = entry.restoreTo;
          if (target?.isConnected && environment.canFocus?.(target) !== false
              && target !== entry.panel && (!next || next.panel.contains(target))) {
            target.focus({ preventScroll: true });
          } else if (next?.panel.isConnected) {
            next.panel.focus({ preventScroll: true });
          }
        },
      };
    },
    handleKeyDown(event: DialogKeyEvent) {
      const entry = top();
      if (!entry || event.defaultPrevented || event.isComposing) return;
      if (event.key === "Escape") {
        consume(event);
        if (!event.repeat) entry.onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = entry.focusable().filter((element) => element.isConnected);
      const active = environment.activeElement();
      if (!focusable.length) {
        consume(event);
        entry.panel.focus({ preventScroll: true });
      } else if (event.shiftKey && (active === focusable[0] || active === entry.panel || !entry.panel.contains(active))) {
        consume(event);
        focusable[focusable.length - 1].focus({ preventScroll: true });
      } else if (!event.shiftKey && (active === focusable[focusable.length - 1] || active === entry.panel || !entry.panel.contains(active))) {
        consume(event);
        focusable[0].focus({ preventScroll: true });
      }
    },
  };
}

export type DialogRegistration = ReturnType<ReturnType<typeof createDialogStack>["register"]>;
const browserStacks = new WeakMap<Document, { stack: ReturnType<typeof createDialogStack>; onKey(event: KeyboardEvent): void }>();

export function registerDialog(panel: HTMLElement, onClose: () => void, options: {
  baseZIndex?: number;
  onTopmostChange?: (topmost: boolean) => void;
} = {}): DialogRegistration {
  const doc = panel.ownerDocument;
  let state = browserStacks.get(doc);
  if (!state) {
    const stack = createDialogStack({
      overflowStyle: doc.body.style,
      activeElement: () => doc.activeElement as HTMLElement | null,
      isPageTarget: (target) => target === null || target === doc.body || target === doc.documentElement,
      canFocus: (target) => {
        const element = target as HTMLElement;
        return element.getClientRects().length > 0 && !element.matches(":disabled")
          && !element.closest('[inert], [aria-hidden="true"]');
      },
    });
    state = { stack, onKey: (event) => stack.handleKeyDown(event) };
    browserStacks.set(doc, state);
  }
  const { stack, onKey } = state;
  if (!stack.size) doc.addEventListener("keydown", onKey);
  const registration = stack.register({
    panel,
    onClose,
    ...options,
    onTopmostChange(topmost) {
      // Expose the new dialog before moving focus, and remove background
      // dialogs from keyboard/screen-reader navigation synchronously.
      panel.inert = !topmost;
      if (topmost) {
        panel.removeAttribute("aria-hidden");
        panel.setAttribute("aria-modal", "true");
      } else {
        panel.setAttribute("aria-hidden", "true");
        panel.removeAttribute("aria-modal");
      }
      options.onTopmostChange?.(topmost);
    },
    focusable: () => Array.from(panel.querySelectorAll<HTMLElement>(
      'a[href], button, input, select, textarea, [tabindex]',
    )).filter((element) => element.tabIndex >= 0 && !element.matches(":disabled")
      && !element.closest('[inert], [aria-hidden="true"]') && element.getClientRects().length > 0),
  });
  return {
    ...registration,
    unregister() {
      registration.unregister();
      if (!stack.size) doc.removeEventListener("keydown", onKey);
    },
  };
}

/** Portals stay inside the app's theme, outside transformed parent dialogs. */
export function dialogPortalHost(marker: HTMLElement): HTMLElement {
  return marker.closest<HTMLElement>(".app") ?? marker.ownerDocument.body;
}
