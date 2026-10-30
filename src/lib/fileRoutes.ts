import type { LeadDetailView } from "@/components/file/leadFile";

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

export type SectionDefinition = {
  key: FileSection;
  label: string;
  hint: string;
  view: LeadDetailView;
  activeTab: "conversation" | "workspace";
  workspaceSection?: "overview" | "documents" | "client" | "credit" | "contracts" | "package";
  evidenceTab?: "requirements" | "banking";
};

export const SECTION_DEFINITIONS: Record<FileSection, SectionDefinition> = {
  conversation: { key: "conversation", label: "Underwriter chat", hint: "Ask the AI about this file", view: "workspace", activeTab: "conversation" },
  overview: { key: "overview", label: "Overview", hint: "Who, what, and where it stands", view: "workspace", activeTab: "workspace", workspaceSection: "overview" },
  documents: { key: "documents", label: "Documents", hint: "The room, checklist and uploads", view: "workspace", activeTab: "workspace", workspaceSection: "documents" },
  evidence: { key: "evidence", label: "Evidence & programs", hint: "Requirements, fit and readiness", view: "underwriting", activeTab: "workspace", evidenceTab: "requirements" },
  banking: { key: "banking", label: "Banking", hint: "Statements and connected accounts", view: "underwriting", activeTab: "workspace", evidenceTab: "banking" },
  communications: { key: "communications", label: "Communications", hint: "Client thread, email, SMS", view: "communications", activeTab: "workspace" },
  package: { key: "package", label: "Package", hint: "Summary, lender packet, delivery", view: "production", activeTab: "workspace" },
  payments: { key: "payments", label: "Payments", hint: "Fees and collections", view: "payments", activeTab: "workspace" },
  timeline: { key: "timeline", label: "Timeline", hint: "Everything that happened", view: "audit", activeTab: "workspace" },
  review: { key: "review", label: "AI review", hint: "The reviewer's digest", view: "reviewer", activeTab: "workspace" },
};
