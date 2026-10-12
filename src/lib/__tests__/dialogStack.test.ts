import { describe, expect, it, vi } from "vitest";
import { createDialogStack, type DialogFocusTarget, type DialogKeyEvent } from "../dialogStack";

function fixture(initialOverflow = "auto") {
  let active: DialogFocusTarget | null = null;
  class Target implements DialogFocusTarget {
    isConnected = true;
    available = true;
    focus = vi.fn((_options: { preventScroll: true }) => { active = this; });
    constructor(readonly parent: Target | null = null) {}
    contains(target: object | null): boolean {
      for (let current = target as Target | null; current; current = current.parent) {
        if (current === this) return true;
      }
      return false;
    }
  }
  const page = new Target();
  const opener = new Target(page);
  active = opener;
  const style = { overflow: initialOverflow };
  const stack = createDialogStack({ overflowStyle: style, activeElement: () => active,
    isPageTarget: (target) => target === null || target === page,
    canFocus: (target) => (target as Target).available });
  const register = (panel: Target, close = vi.fn(), focusable: Target[] = [], baseZIndex?: number) => {
    const change = vi.fn();
    const registration = stack.register({ panel, onClose: close, focusable: () => focusable,
      onTopmostChange: change, baseZIndex });
    return { ...registration, close, change };
  };
  return { Target, page, opener, style, stack, register, active: () => active,
    setActive: (target: DialogFocusTarget | null) => { active = target; } };
}

function key(key: string, shiftKey = false): DialogKeyEvent {
  return { key, shiftKey, preventDefault: vi.fn(), stopPropagation: vi.fn(), stopImmediatePropagation: vi.fn() };
}

describe("shared dialog stack", () => {
  it("only the latest registered dialog owns Escape and higher layers", () => {
    const f = fixture();
    const parent = f.register(new f.Target());
    const preview = f.register(new f.Target(), undefined, [], 500);
    const confirmation = f.register(new f.Target());
    f.stack.handleKeyDown(key("Escape"));
    expect(parent.close).not.toHaveBeenCalled();
    expect(preview.close).not.toHaveBeenCalled();
    expect(confirmation.close).toHaveBeenCalledOnce();
    expect(preview.zIndex).toBeGreaterThan(parent.zIndex);
    expect(confirmation.zIndex).toBeGreaterThan(preview.zIndex);
    expect(parent.isTopmost()).toBe(false);
    expect(confirmation.isTopmost()).toBe(true);
    expect(parent.zIndex).toBe(61);
    expect(preview.zIndex).toBe(500);
    expect(confirmation.zIndex).toBe(502);
    expect(parent.change).toHaveBeenLastCalledWith(false);
    confirmation.unregister();
    expect(preview.isTopmost()).toBe(true);
  });

  it("out-of-order closure and duplicate unregister cannot unlock a surviving child", () => {
    const f = fixture("scroll");
    const parent = f.register(new f.Target());
    const child = f.register(new f.Target());
    parent.unregister();
    parent.unregister();
    expect(f.stack.size).toBe(1);
    expect(f.style.overflow).toBe("hidden");
    expect(child.isTopmost()).toBe(true);
    child.unregister();
    expect(f.style.overflow).toBe("scroll");
    expect(f.stack.size).toBe(0);
    child.unregister();
    expect(f.style.overflow).toBe("scroll");
  });

  it("nested closure restores the child's trigger inside the parent without scrolling", () => {
    const f = fixture();
    const panel = new f.Target();
    const parent = f.register(panel);
    const trigger = new f.Target(panel);
    f.setActive(trigger);
    const child = f.register(new f.Target());
    child.unregister();
    expect(f.active()).toBe(trigger);
    expect(trigger.focus).toHaveBeenLastCalledWith({ preventScroll: true });
    expect(f.style.overflow).toBe("hidden");
    parent.unregister();
    expect(f.active()).toBe(f.opener);
    expect(f.opener.focus).toHaveBeenLastCalledWith({ preventScroll: true });
  });

  it("closing a parent first carries its outside trigger through a surviving preview", () => {
    const f = fixture();
    const panel = new f.Target();
    const parent = f.register(panel);
    const trigger = new f.Target(panel);
    f.setActive(trigger);
    const childPanel = new f.Target();
    const child = f.register(childPanel);
    parent.unregister();
    panel.isConnected = trigger.isConnected = false;
    expect(f.active()).toBe(childPanel);
    child.unregister();
    expect(f.active()).toBe(f.opener);
  });

  it("does not steal focus from an unrelated control during closure", () => {
    const f = fixture();
    const dialog = f.register(new f.Target());
    const unrelated = new f.Target(f.page);
    f.setActive(unrelated);
    dialog.unregister();
    expect(f.active()).toBe(unrelated);
    expect(f.opener.focus).not.toHaveBeenCalled();
  });

  it("falls back to the remaining parent if its trigger was removed", () => {
    const f = fixture();
    const parentPanel = new f.Target();
    f.register(parentPanel);
    const trigger = new f.Target(parentPanel);
    f.setActive(trigger);
    const child = f.register(new f.Target());
    trigger.isConnected = false;
    child.unregister();
    expect(f.active()).toBe(parentPanel);
    expect(parentPanel.focus).toHaveBeenLastCalledWith({ preventScroll: true });
  });

  it("does not restore focus to a connected but hidden or disabled trigger", () => {
    const f = fixture();
    const panel = new f.Target();
    f.register(panel);
    const trigger = new f.Target(panel);
    f.setActive(trigger);
    const child = f.register(new f.Target());
    trigger.available = false;
    child.unregister();
    expect(trigger.focus).not.toHaveBeenCalled();
    expect(f.active()).toBe(panel);
  });

  it("traps forward/backward Tab only in the topmost dialog", () => {
    const f = fixture();
    const parentPanel = new f.Target();
    const parentButton = new f.Target(parentPanel);
    f.register(parentPanel, undefined, [parentButton]);
    const childPanel = new f.Target();
    const first = new f.Target(childPanel);
    const last = new f.Target(childPanel);
    f.register(childPanel, undefined, [first, last]);
    f.setActive(last);
    const forward = key("Tab");
    f.stack.handleKeyDown(forward);
    expect(f.active()).toBe(first);
    expect(forward.preventDefault).toHaveBeenCalledOnce();
    f.stack.handleKeyDown(key("Tab", true));
    expect(f.active()).toBe(last);
    expect(parentButton.focus).not.toHaveBeenCalled();
    expect(last.focus).toHaveBeenLastCalledWith({ preventScroll: true });
  });

  it("focuses the panel without scroll when no usable controls exist", () => {
    const f = fixture();
    const panel = new f.Target();
    f.register(panel);
    f.stack.handleKeyDown(key("Tab"));
    expect(f.active()).toBe(panel);
    expect(panel.focus).toHaveBeenLastCalledWith({ preventScroll: true });
  });

  it("respects an inner widget's handled Escape and an IME composition", () => {
    const f = fixture();
    const dialog = f.register(new f.Target());
    f.stack.handleKeyDown({ ...key("Escape"), defaultPrevented: true });
    f.stack.handleKeyDown({ ...key("Escape"), isComposing: true });
    f.stack.handleKeyDown({ ...key("Escape"), repeat: true });
    expect(dialog.close).not.toHaveBeenCalled();
  });

  it("reopening a minimized preview creates a new topmost layer and lock", () => {
    const f = fixture();
    const parent = f.register(new f.Target());
    const panel = new f.Target();
    const preview = f.register(panel, undefined, [], 500);
    preview.unregister();
    expect(parent.isTopmost()).toBe(true);
    // The existing dock at z560 must remain above the still-open bucket.
    expect(parent.zIndex).toBeLessThan(560);
    const reopened = f.register(panel, undefined, [], 500);
    expect(reopened.isTopmost()).toBe(true);
    expect(reopened.zIndex).toBeGreaterThan(parent.zIndex);
    expect(reopened.zIndex).toBe(500);
    expect(f.style.overflow).toBe("hidden");
  });
});
