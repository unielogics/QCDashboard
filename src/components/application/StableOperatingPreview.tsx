"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

const useStableLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Preserve the result slot while a new evaluation replaces its values. */
export function StableOperatingPreview({ pending, children, className, label }: { pending: boolean; children: ReactNode; className?: string; label?: string }) {
  const element = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>();
  useStableLayoutEffect(() => {
    const node = element.current;
    if (!node || pending) return;
    const measure = () => { const next = node.getBoundingClientRect().height; setHeight(next); };
    measure();
    const observer = new ResizeObserver(measure); observer.observe(node);
    return () => observer.disconnect();
  }, [pending]);
  return <div ref={element} className={className} data-operating-preview={label} aria-busy={pending} style={{ boxSizing: "border-box", minWidth: 0, maxWidth: "100%", minHeight: pending ? height : undefined }}>{children}</div>;
}
