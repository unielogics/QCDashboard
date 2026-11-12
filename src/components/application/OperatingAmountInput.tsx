"use client";

import { useEffect, useRef, useState } from "react";

/** Keep in-progress decimal punctuation visible; every edit still updates the one parent body. */
export function OperatingAmountInput({ label, value, disabled, invalid, onCommit }: { label: string; value: unknown; disabled?: boolean; invalid?: boolean; onCommit: (value: string) => void }) {
  const display = value == null ? "" : String(value);
  const [text, setText] = useState(display);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(display); }, [display]);
  return <input aria-label={label} aria-invalid={invalid || undefined} inputMode="decimal" value={text} placeholder="Unknown" disabled={disabled}
    onFocus={() => { focused.current = true; }} onBlur={() => { focused.current = false; setText(display); }}
    onChange={event => { setText(event.target.value); onCommit(event.target.value); }} />;
}
