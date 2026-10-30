"use client";

import { Icon, type IconProps } from "@/components/design-system/Icon";

type IconName = IconProps["name"];
import { cx } from "@/components/ds";
import type { LeadDetailView } from "./leadFile";
import { FILE_SECTIONS, type FileSection } from "@/lib/fileRoutes";

export { FILE_SECTIONS, fileHref, parseFileSection, sectionFromLegacyParams, type FileSection } from "@/lib/fileRoutes";

/**
 * The sections of one file, as a rail.
 *
 * Each section is a mapping onto views the detail panel already has, so the
 * rail is navigation rather than new screens: the operator opens a file once
 * and moves between its parts instead of between destinations.
 */

type SectionDefinition = {
  key: FileSection;
  label: string;
  hint: string;
  icon: IconName;
  view: LeadDetailView;
  activeTab: "conversation" | "workspace";
  workspaceSection?: "overview" | "documents" | "client" | "credit" | "contracts" | "package";
  evidenceTab?: "requirements" | "banking";
};

export const SECTION_DEFINITIONS: Record<FileSection, SectionDefinition> = {
  conversation: { key: "conversation", label: "Underwriter chat", hint: "Ask the AI about this file", icon: "chat", view: "workspace", activeTab: "conversation" },
  overview: { key: "overview", label: "Overview", hint: "Who, what, and where it stands", icon: "home", view: "workspace", activeTab: "workspace", workspaceSection: "overview" },
  documents: { key: "documents", label: "Documents", hint: "The room, checklist and uploads", icon: "lock", view: "workspace", activeTab: "workspace", workspaceSection: "documents" },
  evidence: { key: "evidence", label: "Evidence & programs", hint: "Requirements, fit and readiness", icon: "docCheck", view: "underwriting", activeTab: "workspace", evidenceTab: "requirements" },
  banking: { key: "banking", label: "Banking", hint: "Statements and connected accounts", icon: "building", view: "underwriting", activeTab: "workspace", evidenceTab: "banking" },
  communications: { key: "communications", label: "Communications", hint: "Client thread, email, SMS", icon: "mail", view: "communications", activeTab: "workspace" },
  package: { key: "package", label: "Package", hint: "Summary, lender packet, delivery", icon: "file", view: "production", activeTab: "workspace" },
  payments: { key: "payments", label: "Payments", hint: "Fees and collections", icon: "dollar", view: "payments", activeTab: "workspace" },
  timeline: { key: "timeline", label: "Timeline", hint: "Everything that happened", icon: "audit", view: "audit", activeTab: "workspace" },
  review: { key: "review", label: "AI review", hint: "The reviewer's digest", icon: "spark", view: "reviewer", activeTab: "workspace" },
};

export function FileRail({
  section,
  onSelect,
  badges,
}: {
  section: FileSection;
  onSelect: (next: FileSection) => void;
  badges?: Partial<Record<FileSection, string | number>>;
}) {
  return (
    <nav className="file-rail" aria-label="File sections">
      {FILE_SECTIONS.map((key) => {
        const item = SECTION_DEFINITIONS[key];
        const badge = badges?.[key];
        return (
          <button
            key={key}
            type="button"
            className={cx("file-rail-item", section === key && "on")}
            aria-current={section === key ? "page" : undefined}
            onClick={() => onSelect(key)}
            title={item.hint}
          >
            <Icon name={item.icon} size={15} />
            <span className="file-rail-label">{item.label}</span>
            {badge !== undefined && badge !== null && badge !== 0 && badge !== "" ? <span className="tag">{badge}</span> : null}
          </button>
        );
      })}
    </nav>
  );
}
