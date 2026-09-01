export type PublicIntakeAttribution = {
  source?: string;
  page?: string;
  program?: string;
  vertical?: string;
  campaign?: string;
  cta?: string;
};

export function readPublicIntakeAttribution(): PublicIntakeAttribution {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const value = (key: string) => params.get(key)?.trim() || undefined;
  return {
    source: value("source"),
    page: value("page"),
    program: value("program"),
    vertical: value("vertical"),
    campaign: value("campaign") ?? value("utm_campaign"),
    cta: value("cta"),
  };
}
