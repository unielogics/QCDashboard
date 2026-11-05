"use client";

// The email address and the mobile number on a file's Contact card, as things
// you act on rather than text you read.
//
// The number opens a small menu: call it (the phone or calling app takes it from
// there), text it (opens the client conversation in a popup, ready to send), or
// copy it. The address opens the email composer in a popup, with a copy icon
// beside it for the times it has to go into some other mail program.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/design-system/Icon";
import { ActionIcon } from "@/components/ds/ActionIcon";

/** "+17028632888" as "+1 (702) 863-2888"; anything that is not a US number as typed. */
export function formatPhone(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits.length === 10 ? digits : null;
  if (!national) return raw;
  return `+1 (${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
}

/** The tel: link for a number, or null when it is not one worth dialling. */
export function telHref(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7) return null;
  if (raw.startsWith("+")) return `tel:+${digits}`;
  if (digits.length === 10) return `tel:+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `tel:+${digits}`;
  return `tel:+${digits}`;
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // An unfocused document or a blocked permission: fall back to the old way.
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Copy, and say so for a moment. */
export function useCopied(): [boolean, (text: string) => Promise<void>] {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const copy = useCallback(async (text: string) => {
    if (!(await writeClipboard(text))) return;
    setCopied(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1800);
  }, []);
  return [copied, copy];
}

type MenuItem = { label: string; hint?: string; icon: string; href?: string; onSelect?: () => void };

const MENU_WIDTH = 248;

function ValueMenu({ label, items, children }: { label: string; items: MenuItem[]; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState({ top: 0, left: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const position = useCallback(() => {
    const box = trigger.current?.getBoundingClientRect();
    if (!box) return;
    const height = menu.current?.getBoundingClientRect().height ?? items.length * 54 + 12;
    const below = window.innerHeight - box.bottom - 12;
    const top = below < height && box.top > below ? box.top - height - 6 : box.bottom + 6;
    const left = Math.max(12, Math.min(box.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 12));
    setPlace({ top: Math.max(12, top), left });
  }, [items.length]);

  useLayoutEffect(() => { if (open) position(); }, [open, position]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true }));
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus({ preventScroll: true });
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const choices = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
        if (!choices.length) return;
        event.preventDefault();
        const at = choices.indexOf(document.activeElement as HTMLElement);
        choices[(at + (event.key === "ArrowDown" ? 1 : choices.length - 1)) % choices.length].focus({ preventScroll: true });
      } else if (event.key === "Tab") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open, position]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="contact-link"
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        onClick={() => setOpen((value) => !value)}
      >
        {children}
        <Icon name="chevD" size={12} />
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <>
              <span className="menu-scrim menu-scrim--portal" onClick={() => setOpen(false)} />
              <div ref={menu} className="contact-menu" role="menu" aria-label={label} style={{ top: place.top, left: place.left, width: MENU_WIDTH }}>
                {items.map((item) => {
                  const body = (
                    <>
                      <Icon name={item.icon} size={15} />
                      <span><b>{item.label}</b>{item.hint ? <small>{item.hint}</small> : null}</span>
                    </>
                  );
                  return item.href ? (
                    <a key={item.label} role="menuitem" href={item.href} onClick={() => setOpen(false)}>{body}</a>
                  ) : (
                    <button key={item.label} type="button" role="menuitem" onClick={() => { setOpen(false); item.onSelect?.(); }}>{body}</button>
                  );
                })}
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}

/** The mobile number: call it, text it, or copy it. */
export function PhoneContact({
  phone,
  firstName,
  onText,
  label = "Mobile",
}: {
  phone: string | null | undefined;
  firstName?: string | null;
  /** Omitted for people who cannot use the client conversation: the menu then offers call and copy only. */
  onText?: () => void;
  label?: string;
}) {
  const [copied, copy] = useCopied();
  const shown = formatPhone(phone);
  const dial = telHref(phone);
  if (!shown) {
    return (
      <div className="kv">
        <span className="sub">{label}</span>
        <b>-</b>
      </div>
    );
  }
  const who = firstName?.trim() || "the client";
  return (
    <div className="kv">
      <span className="sub">{label}</span>
      <span className="contact-value">
        <ValueMenu
          label={`Call or text ${shown}`}
          items={[
            ...(dial ? [{ label: `Call ${shown}`, hint: "Opens your phone or calling app", icon: "phone", href: dial }] : []),
            ...(onText ? [{ label: `Text ${who}`, hint: "Opens the client conversation, ready to send", icon: "messages", onSelect: onText }] : []),
            { label: copied ? "Copied" : "Copy number", hint: shown, icon: copied ? "check" : "copy", onSelect: () => { void copy(phone ?? ""); } },
          ]}
        >
          {shown}
        </ValueMenu>
      </span>
    </div>
  );
}

/** The email address: write to it, or copy it. */
export function EmailContact({
  email,
  onCompose,
  label = "Email",
}: {
  email: string | null | undefined;
  /** Omitted for people who cannot use the email workspace: the address then opens their own mail program. */
  onCompose?: () => void;
  label?: string;
}) {
  const [copied, copy] = useCopied();
  const address = (email ?? "").trim();
  if (!address) {
    return (
      <div className="kv">
        <span className="sub">{label}</span>
        <b>-</b>
      </div>
    );
  }
  return (
    <div className="kv">
      <span className="sub">{label}</span>
      <span className="contact-value">
        {onCompose ? (
          <button type="button" className="contact-link" title={`Write an email to ${address}`} onClick={onCompose}>
            {address}
          </button>
        ) : (
          <a className="contact-link" href={`mailto:${address}`} title={`Write an email to ${address}`}>
            {address}
          </a>
        )}
        <ActionIcon
          icon={copied ? "check" : "copy"}
          label={copied ? "Copied" : "Copy email address"}
          tone={copied ? "ok" : undefined}
          onClick={() => { void copy(address); }}
        />
      </span>
    </div>
  );
}
