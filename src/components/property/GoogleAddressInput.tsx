"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/design-system/Icon";
import { CellChip, Input, Linky, Select, cx } from "@/components/ds";
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
    line2: clean(parts?.line2) || null,
    city: clean(parts?.city) || null,
    state: clean(parts?.state) || null,
    zip: clean(parts?.zip) || null,
    country_code: clean(parts?.country_code) || "US",
    full: clean(parts?.full) || null,
    latitude: parts?.latitude ?? null,
    longitude: parts?.longitude ?? null,
    provider: parts?.provider ?? null,
    provider_place: parts?.provider_place ?? null,
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

export function AddressInput({
  value,
  onChange,
  onResolved,
  label = "Property address",
  helperText = "Start typing to search verified address data. If the property does not appear, enter the split address manually.",
  disabled = false,
  showZip = true,
  publicAccess = false,
}: {
  value: AddressParts | null;
  onChange: (next: AddressParts) => void;
  onResolved?: (next: AddressParts, providerPlace: Record<string, unknown> | null) => void;
  label?: string;
  helperText?: string;
  disabled?: boolean;
  showZip?: boolean;
  publicAccess?: boolean;
}) {
  const [query, setQuery] = useState(() => formatAddressParts(value));
  const [localValue, setLocalValue] = useState<AddressParts>(() => normalize(value));
  const [manualOpen, setManualOpen] = useState(() => hasSplitAddress(value));
  const [menuOpen, setMenuOpen] = useState(false);
  const [sessionToken, setSessionToken] = useState(makeSessionToken);
  const debouncedQuery = useDebouncedValue(query);
  const suggestions = useAddressAutocomplete(debouncedQuery, sessionToken, publicAccess);
  const resolveAddress = useResolveAddress(publicAccess);

  const formattedValue = useMemo(() => formatAddressParts(value), [value]);
  const localFormattedValue = formatAddressParts(localValue);

  useEffect(() => {
    if (formattedValue === localFormattedValue) return;
    setLocalValue(normalize(value));
    setQuery(formattedValue);
  }, [formattedValue, localFormattedValue, value]);

  const updatePart = (key: keyof Pick<AddressParts, "street" | "city" | "state" | "zip">, raw: string) => {
    const next = normalize({
      ...localValue,
      [key]: raw,
      full: null,
      latitude: null,
      longitude: null,
      provider: "manual",
      provider_place: null,
    });
    setLocalValue(next);
    onChange(next);
    setQuery(formatAddressParts(next));
  };

  const openManual = () => {
    const next = normalize(localValue);
    if (!next.street && query.trim()) next.street = query.trim();
    setLocalValue(next);
    onChange(next);
    setManualOpen(true);
    setMenuOpen(false);
  };

  const selectSuggestion = async (placeId: string, fallbackText: string) => {
    const resolved = await resolveAddress.mutateAsync({ place_id: placeId, address: fallbackText, session_token: sessionToken });
    const next = normalize(resolved.address);
    const formatted = formatAddressParts(next, fallbackText);
    const resolvedNext = {
      ...next,
      full: next.full || formatted,
      provider: resolved.provider,
      provider_place: resolved.provider_place,
    };
    setLocalValue(resolvedNext);
    onChange(resolvedNext);
    onResolved?.(resolvedNext, resolved.provider_place);
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

  const resolvedByProvider = Boolean(localValue.latitude && localValue.longitude);

  return (
    <div className="grid g8">
      <label className="grid g4">
        <span className="lbl">{label}</span>
        {/* Bespoke: the anchor for the absolutely-positioned suggestion menu. */}
        <div style={{ position: "relative" }}>
          {/* `.field` is the box; the flex row inside it carries a leading
              search icon and a trailing pending spinner, which is why the
              input is not simply an `<Input>` in a `.row`. */}
          <div className="field" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="search" size={14} className="sub" />
            <input
              className="grow"
              value={query}
              disabled={disabled}
              onFocus={() => setMenuOpen(true)}
              onBlur={() => window.setTimeout(() => setMenuOpen(false), 150)}
              onChange={(e) => {
                setQuery(e.target.value);
                setMenuOpen(true);
              }}
              placeholder="Start typing property address..."
              // Bespoke: a bare input INSIDE a `.field` shell — the shell owns
              // the border, radius, padding and background, so this one must
              // own none of them.
              style={{ border: 0, padding: 0, background: "transparent", color: "inherit", font: "inherit", outline: "none" }}
            />
            {resolveAddress.isPending ? <span className="spinner" aria-label="Resolving address" role="status" /> : null}
          </div>
          {showSuggestions ? (
            // `.popmenu` is right-anchored and min-width 212; this one spans
            // the input and caps its own height.
            <div className="popmenu" style={{ left: 0, maxHeight: 260, overflowY: "auto" }}>
              {suggestions.data?.map((s) => (
                <button
                  key={s.place_id}
                  type="button"
                  className="mi"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectSuggestion(s.place_id, s.text)}
                >
                  <b>{s.text}</b>
                  {s.secondary_text ? <small>{s.secondary_text}</small> : null}
                </button>
              ))}
              <button type="button" className="mi" onMouseDown={(e) => e.preventDefault()} onClick={openManual}>
                <b>Enter address manually</b>
              </button>
            </div>
          ) : null}
          {showManualFallback ? (
            <div className="popmenu" style={{ left: 0 }}>
              <button type="button" className="mi" onMouseDown={(e) => e.preventDefault()} onClick={openManual}>
                <b>Enter address manually</b>
                <small>No address match. Use manual entry for this property.</small>
              </button>
            </div>
          ) : null}
        </div>
      </label>
      <div className="row">
        <CellChip tone={resolvedByProvider ? "ok" : "mut"}>
          {resolvedByProvider
            ? "Address resolved"
            : hasSplitAddress(localValue)
              ? "Manual · Unverified"
              : "Search or enter manually"}
        </CellChip>
        {!manualOpen ? <Linky onClick={openManual}>Manual entry</Linky> : null}
      </div>
      {helperText ? <div className="sub">{helperText}</div> : null}
      {manualOpen ? (
        // Four across with ZIP, three without — `.fldgrid` collapses both to
        // two columns and then one as the container narrows.
        <div className={cx("fldgrid", showZip ? "four" : "three")}>
          <label className="grid g4">
            <span className="lbl">Street</span>
            <Input value={localValue.street ?? ""} onChange={(e) => updatePart("street", e.target.value)} />
          </label>
          <label className="grid g4">
            <span className="lbl">City</span>
            <Input value={localValue.city ?? ""} onChange={(e) => updatePart("city", e.target.value)} />
          </label>
          <label className="grid g4">
            <span className="lbl">State</span>
            <Select value={localValue.state ?? ""} onChange={(e) => updatePart("state", e.target.value)}>
              <option value="">State</option>
              {US_STATES.map((s) => <option key={s.code} value={s.code}>{s.code}</option>)}
            </Select>
          </label>
          {showZip ? (
            <label className="grid g4">
              <span className="lbl">ZIP</span>
              <Input value={localValue.zip ?? ""} onChange={(e) => updatePart("zip", e.target.value)} inputMode="numeric" />
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// Compatibility export while route modules migrate to the provider-neutral name.
export const GoogleAddressInput = AddressInput;
