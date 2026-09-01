"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/design-system/Icon";
import { cx } from "@/components/ds";

export type ComboboxOption = {
  id: string;
  label: string;
  code?: string | null;
  meta?: string | null;
  pending?: boolean;
};

export function SearchableCombobox({
  value,
  options,
  placeholder,
  ariaLabel,
  loading,
  disabled,
  allowAdd,
  addLabel,
  onQueryChange,
  onChange,
  onAdd,
}: {
  value: ComboboxOption | null;
  options: ComboboxOption[];
  placeholder?: string;
  ariaLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  allowAdd?: boolean;
  addLabel?: string;
  onQueryChange?: (query: string) => void;
  onChange: (option: ComboboxOption | null) => void;
  onAdd?: (query: string) => void;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value?.label ?? "");
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!open) setQuery(value?.label ?? "");
  }, [open, value]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const exact = useMemo(
    () => options.some((option) => option.label.trim().toLocaleLowerCase() === query.trim().toLocaleLowerCase() || option.code === query.trim()),
    [options, query],
  );
  const canAdd = Boolean(allowAdd && onAdd && query.trim().length >= 2 && !exact);
  const rowCount = options.length + (canAdd ? 1 : 0);

  function select(option: ComboboxOption) {
    onChange(option);
    setQuery(option.label);
    setOpen(false);
  }

  return (
    <div className={cx("search-combobox", open && "open", disabled && "disabled")} ref={root}>
      <div className="search-combobox-input">
        <Icon name="search" size={14} />
        <input
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-activedescendant={open && rowCount ? `${id}-option-${Math.min(active, rowCount - 1)}` : undefined}
          autoComplete="off"
          aria-label={ariaLabel}
          disabled={disabled}
          placeholder={placeholder}
          value={query}
          onFocus={() => { setOpen(true); setActive(0); onQueryChange?.(query); }}
          onChange={(event) => { const next = event.target.value; setQuery(next); setOpen(true); setActive(0); onQueryChange?.(next); if (!next) onChange(null); }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive((current) => Math.min(current + 1, Math.max(rowCount - 1, 0))); }
            if (event.key === "ArrowUp") { event.preventDefault(); setActive((current) => Math.max(current - 1, 0)); }
            if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
            if (event.key === "Enter" && open) {
              event.preventDefault();
              if (active < options.length && options[active]) select(options[active]);
              else if (canAdd) onAdd?.(query.trim());
            }
          }}
        />
        {value ? <button type="button" aria-label="Clear selection" onClick={() => { onChange(null); setQuery(""); setOpen(true); onQueryChange?.(""); }}><Icon name="x" size={13} /></button> : null}
      </div>
      {open ? (
        <div className="search-combobox-menu" id={`${id}-list`} role="listbox">
          {loading ? <div className="search-combobox-empty">Searching...</div> : null}
          {!loading && options.map((option, index) => (
            <button
              type="button"
              id={`${id}-option-${index}`}
              role="option"
              aria-selected={value?.id === option.id}
              className={cx(index === active && "active")}
              key={option.id}
              onMouseEnter={() => setActive(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => select(option)}
            >
              {option.code ? <span className="search-combobox-code">{option.code}</span> : null}
              <span><b>{option.label}</b>{option.meta ? <small>{option.meta}</small> : null}</span>
              {option.pending ? <em>Custom · Pending review</em> : null}
            </button>
          ))}
          {!loading && canAdd ? (
            <button
              type="button"
              id={`${id}-option-${options.length}`}
              role="option"
              aria-selected="false"
              className={cx("add", active === options.length && "active")}
              onMouseEnter={() => setActive(options.length)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onAdd?.(query.trim())}
            ><Icon name="plus" size={14} /><span><b>{addLabel || `Add “${query.trim()}”`}</b><small>Use on this file now; publish globally after review</small></span></button>
          ) : null}
          {!loading && !options.length && !canAdd ? <div className="search-combobox-empty">No matching options</div> : null}
        </div>
      ) : null}
    </div>
  );
}
