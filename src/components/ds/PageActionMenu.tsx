"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/design-system/Icon";
import { IconBtn } from "./index";

export type PageActionMenuItem = {
  label: string;
  href?: string;
  onSelect?: () => void;
  hidden?: boolean;
  tone?: "default" | "danger";
};

export function PageActionMenu({ items, label = "More actions" }: { items: PageActionMenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const visible = items.filter((item) => !item.hidden && (item.href || item.onSelect));

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  if (!visible.length) return null;

  return (
    <span className="popwrap">
      <IconBtn aria-label={label} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <Icon name="dots" size={15} />
      </IconBtn>
      {open ? (
        <>
          <span className="menu-scrim" onClick={() => setOpen(false)} />
          <span className="actmenu">
            {visible.map((item) => item.href ? (
              <Link key={item.label} href={item.href} onClick={() => setOpen(false)} className={item.tone === "danger" ? "danger" : undefined}>
                {item.label}
              </Link>
            ) : (
              <button key={item.label} type="button" className={item.tone === "danger" ? "danger" : undefined} onClick={() => { setOpen(false); item.onSelect?.(); }}>
                {item.label}
              </button>
            ))}
          </span>
        </>
      ) : null}
    </span>
  );
}
