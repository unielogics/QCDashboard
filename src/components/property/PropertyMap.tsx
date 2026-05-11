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
import { useTheme } from "@/components/design-system/ThemeProvider";

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
  const { t } = useTheme();
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
      <MapShell t={t} height={height}>
        <div style={{ textAlign: "center", maxWidth: 360, padding: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: t.warn, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 6 }}>
            Map disabled
          </div>
          <div style={{ fontSize: 12, color: t.ink2, lineHeight: 1.5 }}>
            Set <code style={{ background: t.chip, padding: "1px 5px", borderRadius: 3, fontSize: 11 }}>NEXT_PUBLIC_GEOAPIFY_API_KEY</code> in <code>.env.local</code> to enable the property map.
          </div>
        </div>
      </MapShell>
    );
  }

  if (status === "geocoding") {
    return (
      <MapShell t={t} height={height}>
        <span style={{ fontSize: 12, color: t.ink3, fontWeight: 700 }}>Locating…</span>
      </MapShell>
    );
  }

  if (status === "not-found" || status === "error") {
    return (
      <MapShell t={t} height={height}>
        <div style={{ textAlign: "center", padding: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: t.ink3 }}>
            Couldn&apos;t locate this address.
          </div>
          <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 4 }}>
            {address}{city ? `, ${city}` : ""}{state ? `, ${state}` : ""}
          </div>
        </div>
      </MapShell>
    );
  }

  if (!resolved) return <MapShell t={t} height={height}>—</MapShell>;

  // Geoapify static map. Center on resolved coords with a pin marker.
  const marker = `lonlat:${resolved.lng},${resolved.lat};type:material;color:%23e95c4e;size:large`;
  const src = `https://maps.geoapify.com/v1/staticmap?style=${style}&width=${width}&height=${height}&center=lonlat:${resolved.lng},${resolved.lat}&zoom=15&marker=${marker}&apiKey=${API_KEY}`;

  return (
    <div style={{
      position: "relative",
      width: "100%",
      height,
      borderRadius: 12,
      overflow: "hidden",
      background: t.surface2,
    }}>
      <img
        src={src}
        alt={`Map of ${address}`}
        style={{ width: "100%", height: "100%", display: "block", objectFit: "cover" }}
      />
      <a
        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${address} ${city ?? ""} ${state ?? ""}`)}`}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          position: "absolute",
          right: 10,
          bottom: 10,
          padding: "5px 10px",
          borderRadius: 7,
          background: t.surface,
          color: t.ink,
          fontSize: 11.5,
          fontWeight: 800,
          textDecoration: "none",
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        }}
      >
        Open in Maps →
      </a>
    </div>
  );
}


function MapShell({ children, t, height }: { children: React.ReactNode; t: ReturnType<typeof useTheme>["t"]; height: number }) {
  return (
    <div style={{
      width: "100%",
      height,
      borderRadius: 12,
      background: `repeating-linear-gradient(135deg, ${t.surface2}, ${t.surface2} 16px, ${t.surface} 16px, ${t.surface} 32px)`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
      {children}
    </div>
  );
}
