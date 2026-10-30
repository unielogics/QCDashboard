"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiBase } from "@/lib/api";
import { resolvePublicLink } from "@/lib/publicLinks";

/**
 * The one address a client needs. The token says what it opens; this page asks
 * the API and sends the client there. It renders only while that happens, or
 * when the link cannot be resolved.
 */
export default function PublicLinkPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = params?.token;
    if (!token) return;
    let cancelled = false;
    resolvePublicLink(apiBase, token)
      .then((resolved) => { if (!cancelled) router.replace(resolved.path); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "This link could not be opened."); });
    return () => { cancelled = true; };
  }, [params?.token, router]);

  return (
    <main className="public-link-page" aria-live="polite" style={{ maxWidth: 520, margin: "12vh auto", padding: "0 20px", textAlign: "center" }}>
      {error ? (
        <>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>We couldn’t open that link</h1>
          <p className="sub">{error}</p>
          <p className="sub">If someone at Qualified Commercial sent it to you, reply to their message and they will send a fresh one.</p>
        </>
      ) : (
        <>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>Opening your secure link…</h1>
          <p className="sub">One moment.</p>
        </>
      )}
    </main>
  );
}
