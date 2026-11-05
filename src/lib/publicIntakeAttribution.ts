export type PublicIntakeAttribution = {
  entry_url?: string;
  source?: string;
  page?: string;
  program?: string;
  funding_intent?: string;
  vertical?: string;
  campaign?: string;
  cta?: string;
};

export function readPublicIntakeAttribution(): PublicIntakeAttribution {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const value = (key: string) => params.get(key)?.trim() || undefined;
  return {
    entry_url: publicEntryUrl(window.location.href),
    source: value("source"),
    page: value("page"),
    program: value("program"),
    funding_intent: value("funding_intent"),
    vertical: value("vertical"),
    campaign: value("campaign") ?? value("utm_campaign"),
    cta: value("cta"),
  };
}

export function publicEntryUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    const safe = new URL(url.pathname, url.origin);
    for (const name of ["source", "page", "program", "funding_intent", "vertical", "campaign", "utm_campaign", "cta", "locale"]) {
      const item = url.searchParams.get(name);
      if (item) safe.searchParams.set(name, item.slice(0, 300));
    }
    return safe.toString();
  } catch { return undefined; }
}
