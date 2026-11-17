// The real-estate loan application, as the backend declares it
// (app/services/re_application_schema.py). The page renders straight from
// the schema the API sends; the rules here only mirror what the backend
// decides, so a choice (loan purpose, occupancy) shows or hides its questions
// before the next save comes back.

import { moneyDigits } from "@/lib/moneyDigits";

export type FieldOption = { value: string; label: string };
export type RuleNode =
  | { all: RuleNode[] }
  | { any: RuleNode[] }
  | { not: RuleNode }
  | { field: string; in?: unknown[]; eq?: unknown; lt?: number; present?: boolean };

export type FieldSpec = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  options?: FieldOption[];
  applies_when?: RuleNode;
  help?: string;
  sensitive?: boolean;
};

export type SectionSpec = {
  key: string;
  label: string;
  per_role?: boolean;
  applies_when?: RuleNode;
  fields: FieldSpec[];
  collections?: Record<string, FieldSpec[]>;
};

export type ApplicationSchema = {
  kind: string;
  schema_version: string;
  title: string;
  roles: { key: string; label: string }[];
  sections: SectionSpec[];
};

export type Provenance = { tier: "A" | "B" | "C"; source: string; confirmed?: boolean };
export type SectionCompletion = { key: string; label: string; filled: number; total: number; missing: string[]; applies: boolean };

export type ApplicationView = {
  kind: string;
  schema: ApplicationSchema;
  body: Record<string, unknown>;
  provenance: Record<string, Provenance>;
  completion: { sections: SectionCompletion[]; filled: number; total: number; missing: string[]; complete: boolean };
  please_check: string[];
  revision: number;
  status: "draft" | "submitted";
  version: { id: string; number: number; submitted_at: string | null; submitted_by: string; body_sha256: string; pdf_available: boolean } | null;
  warnings?: { path: string; label: string; source: string; message: string }[];
  needs_code?: boolean;
  /** Desk reads only: where signing stands. */
  signing?: SigningView;
};

export type FieldRef = { section: SectionSpec; path: string; spec: FieldSpec; role?: string };

const ROLES = ["borrower", "coborrower"] as const;

export function getAt(body: Record<string, unknown>, path: string): unknown {
  let node: unknown = body;
  for (const part of path.split(".")) {
    if (!node || typeof node !== "object" || Array.isArray(node)) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

export function setAt(body: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const parts = path.split(".");
  const next = structuredClone(body);
  let node: Record<string, unknown> = next;
  for (const part of parts.slice(0, -1)) {
    const child = node[part];
    node[part] = child && typeof child === "object" && !Array.isArray(child) ? { ...(child as Record<string, unknown>) } : {};
    node = node[part] as Record<string, unknown>;
  }
  const last = parts[parts.length - 1];
  if (value === null || value === undefined || value === "") delete node[last];
  else node[last] = value;
  return next;
}

export function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

export function applies(node: RuleNode | undefined, body: Record<string, unknown>, role?: string): boolean {
  if (!node) return true;
  if ("all" in node) return node.all.every((child) => applies(child, body, role));
  if ("any" in node) return node.any.some((child) => applies(child, body, role));
  if ("not" in node) return !applies(node.not, body, role);
  const value = node.field.startsWith("$.") ? (role ? getAt(body, `borrowers.${role}.${node.field.slice(2)}`) : undefined) : getAt(body, node.field);
  if (isBlank(value)) return false;
  if (node.in) return node.in.includes(value);
  if ("eq" in node) return value === node.eq;
  if (typeof node.lt === "number") return typeof value === "number" && value < node.lt;
  return Boolean(node.present);
}

export function activeRoles(body: Record<string, unknown>): string[] {
  return body.has_coborrower ? [...ROLES] : [ROLES[0]];
}

/** Every field that applies to this body, in the schema's order. */
export function applicableFields(schema: ApplicationSchema, body: Record<string, unknown>): FieldRef[] {
  const out: FieldRef[] = [];
  for (const section of schema.sections) {
    if (!applies(section.applies_when, body)) continue;
    for (const spec of section.fields) {
      if (section.per_role) {
        for (const role of activeRoles(body)) {
          if (applies(spec.applies_when, body, role)) out.push({ section, path: `borrowers.${role}.${spec.key}`, spec, role });
        }
      } else if (applies(spec.applies_when, body)) {
        out.push({ section, path: `${section.key}.${spec.key}`, spec });
      }
    }
  }
  return out;
}

export function optionLabel(spec: FieldSpec, value: unknown): string {
  return spec.options?.find((option) => option.value === value)?.label ?? String(value);
}

/** A value as a person reads it ("$184,321.50", "Yes", "XXX-XX-1234"). */
export function displayValue(spec: FieldSpec, value: unknown): string {
  if (isBlank(value)) return "";
  switch (spec.type) {
    case "money": {
      const amount = Number(value);
      return Number.isFinite(amount) ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", ...moneyDigits(amount) }).format(amount) : String(value);
    }
    case "percent": return `${value}%`;
    case "yesno": return value ? "Yes" : "No";
    case "select": return optionLabel(spec, value);
    case "multiselect": return (value as unknown[]).map((item) => optionLabel(spec, item)).join(", ");
    case "ssn_last4": return `XXX-XX-${value}`;
    case "score": return value === "unknown" ? "Unknown" : String(value);
    case "phone": {
      const digits = String(value).replace(/\D/g, "");
      return digits.length === 11 && digits.startsWith("1") ? `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}` : String(value);
    }
    case "date": {
      const [year, month, day] = String(value).split("-").map(Number);
      if (!year || !month || !day) return String(value);
      return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
    }
    default: return String(value);
  }
}

/** What the input shows for a stored value (raw numbers, ISO dates). */
export function inputValue(spec: FieldSpec, value: unknown): string {
  if (isBlank(value)) return "";
  if (spec.type === "phone") return displayValue(spec, value);
  return String(value);
}

/** Turn an input's text into what the API takes (the API still validates). */
export function parseInput(spec: FieldSpec, text: string): unknown {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  if (["money", "percent"].includes(spec.type)) {
    const amount = Number(trimmed.replace(/[$,\s]/g, ""));
    return Number.isFinite(amount) ? amount : trimmed;
  }
  if (["integer", "year"].includes(spec.type)) {
    const amount = Number(trimmed.replace(/[,\s]/g, ""));
    return Number.isInteger(amount) ? amount : trimmed;
  }
  if (spec.type === "score") {
    if (/^(unknown|not sure)$/i.test(trimmed)) return "unknown";
    const amount = Number(trimmed);
    return Number.isInteger(amount) ? amount : trimmed;
  }
  return trimmed;
}

export const TIER_WORDS: Record<Provenance["tier"], string> = {
  A: "On your application",
  B: "From your credit check",
  C: "Please check",
};

export type SigningConsent = { key: string; label: string; version: string; sha256: string; text: string; draft: boolean };

export type SigningView = {
  status: "not_submitted" | "ready" | "in_progress" | "executed" | "void";
  version: { id: string; number: number; body_sha256: string } | null;
  consents: SigningConsent[];
  required_roles: string[];
  signed: Record<string, { name: string | null; signed_at: string | null }>;
  role: string | null;
  signer_name: string | null;
  can_sign: boolean;
  held: boolean;
  signing_open: boolean;
  executed_file_id: string | null;
};
