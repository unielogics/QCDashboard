"use client";

import { useEffect, useState } from "react";
import { useAuthedFetch } from "@/hooks/useAuthedFetch";
import { apiBase } from "@/lib/api";
import { useConsoleAuth, visualQaUser } from "@/lib/consoleAuth";
import type { AddressResolveResponse } from "@/lib/types";
import { useActiveProfile } from "@/store/role";

interface Props {
  address: string;
  city?: string | null;
  state?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  onGeocoded?: (coords: { latitude: number; longitude: number }) => void;
  width?: number;
  height?: number;
  style?: "osm-bright" | "osm-carto" | "dark-matter" | "klokantech-basic";
}

export function PropertyMap({
  address,
  city,
  state,
  latitude,
  longitude,
  onGeocoded,
  width = 720,
  height = 280,
}: Props) {
  const apiCall = useAuthedFetch();
  const { getToken, isSignedIn } = useConsoleAuth();
  const devUser = visualQaUser(useActiveProfile().email);
  const [resolved, setResolved] = useState<{ lat: number; lng: number } | null>(
    latitude != null && longitude != null ? { lat: Number(latitude), lng: Number(longitude) } : null,
  );
  const [mapSrc, setMapSrc] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "geocoding" | "loading-map" | "ready" | "not-found" | "error">(
    resolved ? "loading-map" : "idle",
  );

  useEffect(() => {
    if (latitude == null || longitude == null) return;
    setResolved({ lat: Number(latitude), lng: Number(longitude) });
  }, [latitude, longitude]);

  useEffect(() => {
    if (resolved || !address) return;
    let cancelled = false;
    const query = [address, city, state].filter(Boolean).join(", ");
    setStatus("geocoding");
    apiCall<AddressResolveResponse>("/property-intelligence/address/resolve", {
      method: "POST",
      body: JSON.stringify({ address: query }),
    })
      .then((data) => {
        if (cancelled) return;
        const lat = data.address.latitude;
        const lng = data.address.longitude;
        if (typeof lat !== "number" || typeof lng !== "number") {
          setStatus("not-found");
          return;
        }
        setResolved({ lat, lng });
        onGeocoded?.({ latitude: lat, longitude: lng });
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => { cancelled = true; };
  }, [address, apiCall, city, onGeocoded, resolved, state]);

  useEffect(() => {
    if (!resolved) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    const params = new URLSearchParams({
      latitude: String(resolved.lat),
      longitude: String(resolved.lng),
      width: String(width),
      height: String(height),
      zoom: "15",
    });
    setStatus("loading-map");
    void (async () => {
      const token = isSignedIn ? await getToken() : null;
      const response = await fetch(`${apiBase}/api/v1/property-intelligence/address/static-map?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : { "X-Dev-User": devUser },
      });
      if (!response.ok) throw new Error(`Map ${response.status}`);
      objectUrl = URL.createObjectURL(await response.blob());
      if (!cancelled) {
        setMapSrc(objectUrl);
        setStatus("ready");
      }
    })().catch(() => {
      if (!cancelled) setStatus("error");
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [devUser, getToken, height, isSignedIn, resolved, width]);

  if (status === "geocoding" || status === "loading-map") {
    return <MapShell height={height}>Locating...</MapShell>;
  }

  if (status === "not-found" || status === "error") {
    return (
      <MapShell height={height}>
        <div className="grid g4">
          <b>Couldn&apos;t locate this address.</b>
          <span>{address}{city ? `, ${city}` : ""}{state ? `, ${state}` : ""}</span>
        </div>
      </MapShell>
    );
  }

  if (!resolved || !mapSrc) return <MapShell height={height}>-</MapShell>;

  return (
    <div className="mapbox" style={{ position: "relative", height }}>
      <img
        src={mapSrc}
        alt={`Map of ${address}`}
        style={{ width: "100%", height: "100%", display: "block", objectFit: "cover" }}
      />
      <a
        className="btn sm"
        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${address} ${city ?? ""} ${state ?? ""}`)}`}
        target="_blank"
        rel="noopener noreferrer"
        style={{ position: "absolute", right: 10, bottom: 10, boxShadow: "var(--sh2)" }}
      >
        Open in Maps
      </a>
    </div>
  );
}

function MapShell({ children, height }: { children: React.ReactNode; height: number }) {
  return <div className="mapbox empty" style={{ height }}>{children}</div>;
}
