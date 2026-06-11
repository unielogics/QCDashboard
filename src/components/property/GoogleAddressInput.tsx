"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/design-system/Icon";
import { Pill } from "@/components/design-system/primitives";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { useAddressAutocomplete, useResolveAddress } from "@/hooks/useApi";
import { US_STATES } from "@/lib/usStates";
import type { AddressParts } from "@/lib/types";

function makeSessionToken() {
  return `qc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function clean(value: string | null | undefined) {
  return (value ?? "").trim();
}

export function formatAddressParts(parts: AddressParts | null | undefined, fallback = ""): string {
  if (!parts) return fallback.trim();
  const full = clean(parts.full);
  if (full) return full;
  const cityLine = [parts.city, parts.state, parts.zip].map(clean).filter(Boolean).join(" ");
  return [parts.street, cityLine].map(clean).filter(Boolean).join(", ").trim() || fallback.trim();
}

function hasSplitAddress(parts: AddressParts | null | undefined) {
  return Boolean(clean(parts?.street) || clean(parts?.city) || clean(parts?.state) || clean(parts?.zip));
}

function normalize(parts: AddressParts | null | undefined): AddressParts {
  return {
    street: clean(parts?.street) || null,
    city: clean(parts?.city) || null,
    state: clean(parts?.state) || null,
    zip: clean(parts?.zip) || null,
    full: clean(parts?.full) || null,
    latitude: parts?.latitude ?? null,
    longitude: parts?.longitude ?? null,
  };
}

function useDebouncedValue(value: string, ms = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export function GoogleAddressInput({
  value,
  onChange,
  onResolved,
  label = "Property address",
  helperText = "Start typing to search Google. If the property does not appear, enter the split address manually.",
  disabled = false,
  showZip = true,
}: {
  value: AddressParts | null;
  onChange: (next: AddressParts) => void;
  onResolved?: (next: AddressParts, googlePlace: Record<string, unknown> | null) => void;
  label?: string;
  helperText?: string;
  disabled?: boolean;
  showZip?: boolean;
}) {
  const { t } = useTheme();
  const [query, setQuery] = useState(() => formatAddressParts(value));
  const [manualOpen, setManualOpen] = useState(() => hasSplitAddress(value));
  const [menuOpen, setMenuOpen] = useState(false);
  const [sessionToken, setSessionToken] = useState(makeSessionToken);
  const debouncedQuery = useDebouncedValue(query);
  const suggestions = useAddressAutocomplete(debouncedQuery, sessionToken);
  const resolveAddress = useResolveAddress();

  const formattedValue = useMemo(() => formatAddressParts(value), [value?.street, value?.city, value?.state, value?.zip, value?.full]);

  useEffect(() => {
    if (!formattedValue || formattedValue === query) return;
    setQuery(formattedValue);
  }, [formattedValue]); // eslint-disable-line react-hooks/exhaustive-deps

  const inputStyle = {
    width: "100%",
    padding: "9px 11px",
    borderRadius: 8,
    border: `1px solid ${t.line}`,
    background: t.surface,
    color: t.ink,
    fontSize: 13,
    fontFamily: "inherit",
    outline: "none",
  } as const;

  const updatePart = (key: keyof Pick<AddressParts, "street" | "city" | "state" | "zip">, raw: string) => {
    const next = normalize({
      ...value,
      [key]: raw,
      full: null,
      latitude: null,
      longitude: null,
    });
    onChange(next);
    setQuery(formatAddressParts(next));
  };

  const openManual = () => {
    const next = normalize(value);
    if (!next.street && query.trim()) next.street = query.trim();
    onChange(next);
    setManualOpen(true);
    setMenuOpen(false);
  };

  const selectSuggestion = async (placeId: string, fallbackText: string) => {
    const resolved = await resolveAddress.mutateAsync({ place_id: placeId, session_token: sessionToken });
    const next = normalize(resolved.address);
    const formatted = formatAddressParts(next, fallbackText);
    onChange({ ...next, full: next.full || formatted });
    onResolved?.({ ...next, full: next.full || formatted }, resolved.google_place);
    setQuery(formatted);
    setManualOpen(true);
    setMenuOpen(false);
    setSessionToken(makeSessionToken());
  };

  const showSuggestions =
    menuOpen &&
    !disabled &&
    debouncedQuery.trim().length >= 2 &&
    Boolean(suggestions.data?.length);
  const showManualFallback =
    menuOpen &&
    !disabled &&
    debouncedQuery.trim().length >= 3 &&
    !suggestions.isFetching &&
    !suggestions.data?.length;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <label style={{ display: "block" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: t.ink3, textTransform: "uppercase", letterSpacing: 0.7 }}>{label}</span>
        <div style={{ position: "relative", marginTop: 5 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${t.line}`, background: t.surface2, borderRadius: 9, padding: "0 11px" }}>
            <Icon name="search" size={14} />
            <input
              value={query}
              disabled={disabled}
              onFocus={() => setMenuOpen(true)}
              onBlur={() => window.setTimeout(() => setMenuOpen(false), 150)}
              onChange={(e) => {
                setQuery(e.target.value);
                setMenuOpen(true);
              }}
              placeholder="Start typing property address..."
              style={{ flex: 1, minWidth: 0, padding: "10px 0", background: "transparent", border: "none", color: t.ink, outline: "none", fontSize: 13, fontFamily: "inherit" }}
            />
            {resolveAddress.isPending ? <Icon name="refresh" size={13} /> : null}
          </div>
          {showSuggestions ? (
            <div style={{ position: "absolute", zIndex: 30, top: "100%", left: 0, right: 0, marginTop: 4, background: t.surface, border: `1px solid ${t.line}`, borderRadius: 9, boxShadow: "0 8px 24px rgba(0,0,0,.18)", maxHeight: 260, overflow: "auto" }}>
              {suggestions.data?.map((s) => (
                <button
                  key={s.place_id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectSuggestion(s.place_id, s.text)}
                  style={{ all: "unset", display: "block", boxSizing: "border-box", width: "100%", padding: "10px 12px", cursor: "pointer", borderBottom: `1px solid ${t.line}` }}
                >
                  <div style={{ color: t.ink, fontWeight: 700, fontSize: 12.5 }}>{s.text}</div>
                  {s.secondary_text ? <div style={{ color: t.ink3, fontSize: 11, marginTop: 1 }}>{s.secondary_text}</div> : null}
                </button>
              ))}
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={openManual} style={{ all: "unset", display: "block", boxSizing: "border-box", width: "100%", padding: "9px 12px", cursor: "pointer", color: t.petrol, fontSize: 12, fontWeight: 800 }}>
                Enter address manually
              </button>
            </div>
          ) : null}
          {showManualFallback ? (
            <div style={{ position: "absolute", zIndex: 30, top: "100%", left: 0, right: 0, marginTop: 4, background: t.surface, border: `1px solid ${t.line}`, borderRadius: 9, boxShadow: "0 8px 24px rgba(0,0,0,.18)", padding: 10 }}>
              <div style={{ fontSize: 12, color: t.ink3, marginBottom: 8 }}>No Google match. Use manual entry for this property.</div>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={openManual} style={{ all: "unset", cursor: "pointer", color: t.petrol, fontSize: 12, fontWeight: 800 }}>
                Enter address manually
              </button>
            </div>
          ) : null}
        </div>
      </label>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Pill bg={value?.latitude && value?.longitude ? t.profitBg : t.chip} color={value?.latitude && value?.longitude ? t.profit : t.ink3}>
          {value?.latitude && value?.longitude
            ? "Google address resolved"
            : hasSplitAddress(value)
              ? "Manual address"
              : "Search Google or enter manually"}
        </Pill>
        {!manualOpen ? (
          <button type="button" onClick={openManual} style={{ all: "unset", cursor: "pointer", color: t.petrol, fontSize: 12, fontWeight: 800 }}>
            Manual entry
          </button>
        ) : null}
      </div>
      {helperText ? <div style={{ color: t.ink3, fontSize: 12, lineHeight: 1.45 }}>{helperText}</div> : null}
      {manualOpen ? (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${showZip ? 110 : 120}px, 1fr))`, gap: 10 }}>
          <label style={{ display: "block" }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, textTransform: "uppercase", letterSpacing: 0.6 }}>Street</span>
            <input value={value?.street ?? ""} onChange={(e) => updatePart("street", e.target.value)} style={inputStyle} />
          </label>
          <label style={{ display: "block" }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, textTransform: "uppercase", letterSpacing: 0.6 }}>City</span>
            <input value={value?.city ?? ""} onChange={(e) => updatePart("city", e.target.value)} style={inputStyle} />
          </label>
          <label style={{ display: "block" }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, textTransform: "uppercase", letterSpacing: 0.6 }}>State</span>
            <select value={value?.state ?? ""} onChange={(e) => updatePart("state", e.target.value)} style={inputStyle}>
              <option value="">State</option>
              {US_STATES.map((s) => <option key={s.code} value={s.code}>{s.code}</option>)}
            </select>
          </label>
          {showZip ? (
            <label style={{ display: "block" }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, textTransform: "uppercase", letterSpacing: 0.6 }}>ZIP</span>
              <input value={value?.zip ?? ""} onChange={(e) => updatePart("zip", e.target.value)} inputMode="numeric" style={inputStyle} />
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
