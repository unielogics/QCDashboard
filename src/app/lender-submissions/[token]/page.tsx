"use client";

import { useEffect, useState } from "react";
import { apiBase } from "@/lib/api";

interface Package {
  lender_name: string;
  expires_at: string;
  version: number;
  manifest: { summary: string; facts: Record<string, unknown>; files: { id: string; name: string }[] };
}

export default function LenderSubmissionPage({ params }: { params: { token: string } }) {
  const [data, setData] = useState<Package | null>(null);
  const [error, setError] = useState("");
  const endpoint = `${apiBase}/api/v1/public/lender-submissions/${encodeURIComponent(params.token)}`;
  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "This package is unavailable.");
      setData(body);
    }).catch((reason) => { if (reason.name !== "AbortError") setError(reason.message); });
    return () => controller.abort();
  }, [endpoint]);
  return <main style={{ maxWidth: 860, margin: "60px auto", padding: 28 }}>
    <meta name="referrer" content="no-referrer" />
    <meta name="robots" content="noindex,nofollow" />
    <p>Qualified Commercial</p><h1>Financing review package</h1>
    {error ? <p role="alert">{error}</p> : !data ? <p>Opening your secure package…</p> : <>
      <h2>{data.lender_name}</h2><p>Package version {data.version}. Available until {new Date(data.expires_at).toLocaleString()}.</p>
      <p>{data.manifest.summary}</p>
      <dl>{Object.entries(data.manifest.facts).map(([key, value]) => <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{String(value)}</dd></div>)}</dl>
      <p><a className="btn primary" href={`${endpoint}/export`} rel="noreferrer">Download complete ZIP package</a></p>
      <h2>Documents</h2><ul>{data.manifest.files.map((file) => <li key={file.id}><a href={`${endpoint}/files/${file.id}`} rel="noreferrer">{file.name}</a></li>)}</ul>
      <p>Contact your Qualified Commercial representative if you need an updated package.</p>
    </>}
  </main>;
}
