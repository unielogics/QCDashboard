"use client";

// PropertyMap — Geoapify-powered static map preview for the property
// tab. Two modes:
//
//   1) Latitude/longitude already on the loan record (geocoded earlier)
//      → renders the static map directly using those coordinates.
//   2) No coordinates yet → geocodes the loan address through the
//      Geoapify search API, caches the result back to the loan via the
//      onGeocoded callback so subsequent renders skip the API hit.
//
// Geoapify static map URL pattern:
//   https://maps.geoapify.com/v1/staticmap?style=osm-bright&width=...
//
// We keep the lookup deliberately minimal — no autocomplete, no
// interactive map. Adding leaflet/maplibre is a future phase if the
// operator wants pin-dragging or photo overlays.

import { useEffect, useState } from "react";
import { CellChip } from "@/components/ds";

interface Props {
  address: string;
  city?: string | null;
  state?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  /** Called once geocoding resolves so the parent can persist the
   *  lat/lng to the loan record. Skipped if the loan already has them. */
  onGeocoded?: (coords: { latitude: number; longitude: number }) => void;
  /** Map dimensions in CSS pixels. Geoapify accepts up to 1600×1600. */
  width?: number;
  height?: number;
  /** Visual style — osm-bright is the default; osm-carto, dark-matter,
   *  klokantech-basic also available without paid plan. */
  style?: "osm-bright" | "osm-carto" | "dark-matter" | "klokantech-basic";
}

const API_KEY = process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY;

export function PropertyMap({
  address, city, state, latitude, longitude, onGeocoded, width = 720, height = 280, style = "osm-bright",
}: Props) {
  const [resolved, setResolved] = useState<{ lat: number; lng: number } | null>(
    latitude != null && longitude != null
      ? { lat: Number(latitude), lng: Number(longitude) }
      : null,
  );
  const [status, setStatus] = useState<"idle" | "geocoding" | "ready" | "missing-key" | "not-found" | "error">(
    resolved ? "ready" : "idle",
  );

  useEffect(() => {
    if (resolved) return;
    if (!API_KEY) {
      setStatus("missing-key");
      return;
    }
    if (!address) return;
    setStatus("geocoding");
    const query = [address, city, state].filter(Boolean).join(", ");
    const ctrl = new AbortController();
    fetch(
      `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(query)}&limit=1&apiKey=${API_KEY}`,
      { signal: ctrl.signal },
    )
      .then(async (r) => {
        if (!r.ok) throw new Error(`Geoapify ${r.status}`);
        return r.json();
      })
      .then((data) => {
        const feature = data?.features?.[0];
        const lat = feature?.geometry?.coordinates?.[1];
        const lng = feature?.geometry?.coordinates?.[0];
        if (typeof lat !== "number" || typeof lng !== "number") {
          setStatus("not-found");
          return;
        }
        setResolved({ lat, lng });
        setStatus("ready");
        onGeocoded?.({ latitude: lat, longitude: lng });
      })
      .catch((err: Error) => {
        if (err.name === "AbortError") return;
        setStatus("error");
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, city, state]);

  if (status === "missing-key") {
    return (
      <MapShell height={height}>
        <div className="grid g6">
          <div>
            <CellChip tone="warn">Map disabled</CellChip>
          </div>
          <div>
            Set <code className="tag">NEXT_PUBLIC_GEOAPIFY_API_KEY</code> in <code className="tag">.env.local</code> to
            enable the property map.
          </div>
        </div>
      </MapShell>
    );
  }

  if (status === "geocoding") {
    return (
      <MapShell height={height}>
        <span>Locating…</span>
      </MapShell>
    );
  }

  if (status === "not-found" || status === "error") {
    return (
      <MapShell height={height}>
        <div className="grid g4">
          <b>Couldn&apos;t locate this address.</b>
          <span>
            {address}{city ? `, ${city}` : ""}{state ? `, ${state}` : ""}
          </span>
        </div>
      </MapShell>
    );
  }

  if (!resolved) return <MapShell height={height}>—</MapShell>;

  // Geoapify static map. Center on resolved coords with a pin marker.
  const marker = `lonlat:${resolved.lng},${resolved.lat};type:material;color:%23e95c4e;size:large`;
  const src = `https://maps.geoapify.com/v1/staticmap?style=${style}&width=${width}&height=${height}&center=lonlat:${resolved.lng},${resolved.lat}&zoom=15&marker=${marker}&apiKey=${API_KEY}`;

  return (
    // `.mapbox` owns the frame; `height` is a prop the caller measures the
    // form against, and `position` anchors the overlay link below.
    <div className="mapbox" style={{ position: "relative", height }}>
      <img
        src={src}
        alt={`Map of ${address}`}
        // Bespoke: the image fills the frame it was requested at.
        style={{ width: "100%", height: "100%", display: "block", objectFit: "cover" }}
      />
      <a
        className="btn sm"
        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${address} ${city ?? ""} ${state ?? ""}`)}`}
        target="_blank"
        rel="noopener noreferrer"
        // Bespoke: pinned over the map corner. Nothing in the sheet floats a
        // control on top of an image.
        style={{ position: "absolute", right: 10, bottom: 10, boxShadow: "var(--sh2)" }}
      >
        Open in Maps →
      </a>
    </div>
  );
}


/**
 * The empty/loading/error frame.
 *
 * `.mapbox.empty` exists precisely so this box is the same size as the loaded
 * map and the form beside it does not jump when an address resolves.
 */
function MapShell({ children, height }: { children: React.ReactNode; height: number }) {
  // `height` is the caller's measurement, matched to the requested map size.
  return <div className="mapbox empty" style={{ height }}>{children}</div>;
}
