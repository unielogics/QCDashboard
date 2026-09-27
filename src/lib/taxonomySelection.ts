import type { ClassificationPatch, TaxonomyEntry } from "./applicationProfile";

/** A global activity selection replaces the whole path, never just its leaf. */
export function classificationFromActivity(current: ClassificationPatch, entry: TaxonomyEntry): ClassificationPatch {
  const industry = entry.path?.find((row) => row.level === 2);
  const subindustry = entry.path?.find((row) => row.level === 3);
  if (entry.level !== 6 || !industry || !subindustry || entry.parent_id !== subindustry.id || subindustry.parent_id !== industry.id) {
    throw new Error("This activity has an incomplete industry path. Select another activity or ask an administrator to review it.");
  }
  return {
    ...current,
    industry_entry_id: industry.id, industry: industry.label,
    subindustry_entry_id: subindustry.id, subindustry: subindustry.label,
    activity_entry_id: entry.id, naics_code: entry.code, naics_label: entry.label,
    custom_industry: null,
  };
}
