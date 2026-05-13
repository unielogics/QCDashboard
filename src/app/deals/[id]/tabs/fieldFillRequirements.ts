// Splits the Deal Secretary's Human-column rows into two buckets:
//
//   • "field-fill" — data the agent has to type into the system. The AI
//     can't help here, so these are pulled OUT of the Resolution Queue
//     and surfaced as red count badges on the tab where the field lives
//     (Property tab for property_data, Loan Overview tab for
//     borrower_info + credit). The fields themselves render with a red
//     left-border so the agent can spot them.
//
//   • "ai-distributable" — every other category. Stays in the queue,
//     ready for the agent to drag into the AI column.
//
// Used by AISecretaryTab (filtering), the /deals/[id] page (tab badges),
// PropertyTab (red field highlighting), and LoanOverviewTab (top
// callout listing pending borrower/credit items).

import type { DSTaskRow } from "@/lib/types";

export type FieldFillBucket = "property" | "borrower" | "credit";

const PROPERTY_CATEGORIES = new Set(["property_data"]);
const BORROWER_CATEGORIES = new Set(["borrower_info"]);
const CREDIT_CATEGORIES = new Set(["credit"]);

// Status values that mean "still open" — anything else (verified,
// completed, waived, not_applicable, …) is treated as done so we don't
// flag completed fields as red.
const OPEN_STATUSES = new Set([
  "needed",
  "asked",
  "in_progress",
  "responded",
  "uploaded",
  "blocked",
]);

export function classifyRow(row: DSTaskRow): FieldFillBucket | "ai" {
  if (PROPERTY_CATEGORIES.has(row.category)) return "property";
  if (BORROWER_CATEGORIES.has(row.category)) return "borrower";
  if (CREDIT_CATEGORIES.has(row.category)) return "credit";
  return "ai";
}

export function isOpen(row: DSTaskRow): boolean {
  return OPEN_STATUSES.has(row.status);
}

export interface FieldFillSnapshot {
  property: DSTaskRow[];
  borrower: DSTaskRow[];
  credit: DSTaskRow[];
}

// Strips field-fill rows out of the Human queue and groups them by
// bucket. Only OPEN rows count — anything verified/waived/etc. is
// dropped because the agent has nothing left to do for it.
export function partitionFieldFill(rows: DSTaskRow[]): {
  queue: DSTaskRow[];
  fieldFill: FieldFillSnapshot;
} {
  const queue: DSTaskRow[] = [];
  const fieldFill: FieldFillSnapshot = { property: [], borrower: [], credit: [] };
  for (const row of rows) {
    const bucket = classifyRow(row);
    if (bucket === "ai") {
      queue.push(row);
      continue;
    }
    if (!isOpen(row)) continue;
    fieldFill[bucket].push(row);
  }
  return { queue, fieldFill };
}

// Maps a property_data requirement_key onto the Property tab field it
// represents, so we can highlight that field red. Keys not in this map
// still count toward the Property badge but don't get a specific field
// highlighted — they show up in the "+N more" tail at the top of the
// Property tab.
//
// Driven by the keys the platform playbooks ship with today (alembic
// 0032 + 0039 seeds). New keys can be added here without touching the
// rest of the tab.
export const PROPERTY_FIELD_BY_REQUIREMENT_KEY: Record<string, keyof PropertyFieldFlags> = {
  property_address: "address",
  target_location: "address",
  property_city: "city",
  property_state: "state",
  property_zip: "zip",
  property_type: "property_type",
  target_property_type: "property_type",
  property_beds: "beds",
  property_baths: "baths",
  property_sqft: "sqft",
  property_year_built: "year_built",
  property_condition: "year_built", // closest field; no dedicated input
  list_price: "list_price",
  desired_list_price: "list_price",
  target_budget: "target_price",
  target_price: "target_price",
  listing_status: "listing_status",
  occupancy_status: "listing_status",
  mls_number: "mls_number",
};

export interface PropertyFieldFlags {
  address: boolean;
  city: boolean;
  state: boolean;
  zip: boolean;
  property_type: boolean;
  beds: boolean;
  baths: boolean;
  sqft: boolean;
  year_built: boolean;
  list_price: boolean;
  target_price: boolean;
  listing_status: boolean;
  mls_number: boolean;
}

export function emptyPropertyFlags(): PropertyFieldFlags {
  return {
    address: false,
    city: false,
    state: false,
    zip: false,
    property_type: false,
    beds: false,
    baths: false,
    sqft: false,
    year_built: false,
    list_price: false,
    target_price: false,
    listing_status: false,
    mls_number: false,
  };
}

// Given the open property_data rows and the current property values
// the agent has typed in, returns which specific fields should render
// red (open requirement AND value is still blank) plus the labels of
// any rows that didn't map to a known field.
export function deriveRedPropertyFields(
  rows: DSTaskRow[],
  values: Record<keyof PropertyFieldFlags, string | null | undefined>,
): { flags: PropertyFieldFlags; unmappedLabels: string[] } {
  const flags = emptyPropertyFlags();
  const unmappedLabels: string[] = [];
  for (const row of rows) {
    const field = PROPERTY_FIELD_BY_REQUIREMENT_KEY[row.requirement_key];
    if (!field) {
      unmappedLabels.push(row.label);
      continue;
    }
    const current = values[field];
    if (current == null || String(current).trim() === "") {
      flags[field] = true;
    }
  }
  return { flags, unmappedLabels };
}
