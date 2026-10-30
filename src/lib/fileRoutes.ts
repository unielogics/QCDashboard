/**
 * Routes for one file and its sections.
 *
 * Kept free of components so libs, drawers and pages can link to a file
 * without importing the rail that renders these sections.
 */

export const FILE_SECTIONS = [
  "conversation",
  "overview",
  "documents",
  "evidence",
  "banking",
  "communications",
  "package",
  "payments",
  "timeline",
  "review",
] as const;

export type FileSection = (typeof FILE_SECTIONS)[number];

export function parseFileSection(value: string | null | undefined): FileSection {
  return (FILE_SECTIONS as readonly string[]).includes(value ?? "") ? (value as FileSection) : "overview";
}

/** Translate the legacy list-page deep-link params into a section. */
export function sectionFromLegacyParams(params: { view?: string | null; step?: string | null; tab?: string | null; channel?: string | null }): FileSection {
  if (params.tab === "banking" || params.step === "4") return "banking";
  switch (params.view) {
    case "underwriting": return "evidence";
    case "payments": return "payments";
    case "reviewer": return "review";
    case "production": return "package";
    case "communications": return "communications";
    case "audit": return "timeline";
    default: return params.channel === "client" || params.channel === "email" ? "communications" : "overview";
  }
}

export function fileHref(id: string, section: FileSection = "overview"): string {
  return section === "overview" ? `/files/${id}` : `/files/${id}?section=${section}`;
}
