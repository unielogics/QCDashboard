export type CollateralAddress = { street: string; city: string; state: string; postal_code: string };
export type InvestorCollateralProperty = {
  id: string;
  address: CollateralAddress;
  owner_name?: string | null;
  property_type?: string | null;
  estimated_value?: number | string | null;
  existing_liens_total?: number | string | null;
  available_lien_amount?: number | string | null;
  proposed_lien_position?: number | null;
  valuation_date?: string | null;
  currency: string;
  notes?: string | null;
  source_file_ids: string[];
  real_estate_property_id?: string | null;
};
export type CollateralPropertyOption = Partial<Omit<InvestorCollateralProperty, "id" | "currency">> & { id: string; label: string; currency?: string | null };
export const collateralAssetTypes = { equipment: "Equipment", vehicle: "Vehicle", inventory: "Inventory", receivables: "Receivables", cash: "Cash", securities: "Securities", other: "Other asset" } as const;
export type InvestorCollateralAsset = Omit<InvestorCollateralProperty, "address" | "property_type" | "real_estate_property_id"> & { asset_type: keyof typeof collateralAssetTypes; description: string };
export type InvestorCollateral = {
  profile_id: string;
  enabled: boolean;
  properties: InvestorCollateralProperty[];
  assets?: InvestorCollateralAsset[];
  revision: number;
  updated_at?: string | null;
  updated_by_user_id?: string | null;
  can_edit: boolean;
  property_options: CollateralPropertyOption[];
  source_file_options: Array<{ id: string; label: string }>;
};
export type InvestorCollateralSave = Pick<InvestorCollateral, "enabled" | "properties" | "assets"> & { expected_revision: number };
export type CollateralPropertyDraft = Omit<InvestorCollateralProperty, "estimated_value" | "existing_liens_total" | "available_lien_amount" | "proposed_lien_position"> & {
  estimated_value: string;
  existing_liens_total: string;
  available_lien_amount: string;
  proposed_lien_position: string;
};
export function collateralPropertyDraft(row?: Partial<InvestorCollateralProperty>): CollateralPropertyDraft {
  const text = (value: number | string | null | undefined) => value == null ? "" : String(value);
  return { id: row?.id ?? crypto.randomUUID(), address: { street: "", city: "", state: "", postal_code: "", ...row?.address }, owner_name: row?.owner_name ?? "", property_type: row?.property_type ?? "", estimated_value: text(row?.estimated_value), existing_liens_total: text(row?.existing_liens_total), available_lien_amount: text(row?.available_lien_amount), proposed_lien_position: text(row?.proposed_lien_position), valuation_date: row?.valuation_date ?? "", currency: row?.currency ?? "USD", notes: row?.notes ?? "", source_file_ids: [...row?.source_file_ids ?? []], real_estate_property_id: row?.real_estate_property_id ?? null };
}
export function collateralPropertyPayload(row: CollateralPropertyDraft): InvestorCollateralProperty {
  const amount = (value: string) => value.trim() ? Number(value.replace(/,/g, "")) : null;
  return { ...row, address: Object.fromEntries(Object.entries(row.address).map(([key, value]) => [key, value.trim()])) as CollateralAddress, owner_name: row.owner_name?.trim() || null, property_type: row.property_type?.trim() || null, estimated_value: amount(row.estimated_value), existing_liens_total: amount(row.existing_liens_total), available_lien_amount: amount(row.available_lien_amount), proposed_lien_position: amount(row.proposed_lien_position), valuation_date: row.valuation_date || null, currency: row.currency.trim().toUpperCase(), notes: row.notes?.trim() || null };
}
export type CollateralAssetDraft = Omit<InvestorCollateralAsset, "estimated_value" | "existing_liens_total" | "available_lien_amount" | "proposed_lien_position"> & Pick<CollateralPropertyDraft, "estimated_value" | "existing_liens_total" | "available_lien_amount" | "proposed_lien_position">;
export function collateralAssetDraft(row?: Partial<InvestorCollateralAsset>): CollateralAssetDraft {
  const { address: _address, property_type: _type, real_estate_property_id: _propertyId, ...common } = collateralPropertyDraft(row);
  return { ...common, asset_type: row?.asset_type ?? "equipment", description: row?.description ?? "" };
}
export function collateralAssetPayload(row: CollateralAssetDraft): InvestorCollateralAsset {
  const { address: _address, property_type: _type, real_estate_property_id: _propertyId, ...common } = collateralPropertyPayload({ ...row, address: { street: "", city: "", state: "", postal_code: "" } });
  return { ...common, asset_type: row.asset_type, description: row.description.trim() };
}
export function collateralDraftErrors(enabled: boolean, properties: CollateralPropertyDraft[], assets: CollateralAssetDraft[] = []): string[] {
  const errors: string[] = [];
  if (enabled && !properties.length && !assets.length) errors.push("Add a property or other asset before including collateral.");
  properties.forEach((row, index) => {
    if (enabled && Object.values(row.address).some(value => !value.trim())) errors.push(`Property ${index + 1}: complete the street, city, state and postal code.`);
  });
  assets.forEach((row, index) => {
    if (!row.description.trim()) errors.push(`Asset ${index + 1}: enter an asset description.`);
    if (!(row.asset_type in collateralAssetTypes)) errors.push(`Asset ${index + 1}: select an asset type.`);
  });
  [...properties.map((row, index) => ({ row, prefix: `Property ${index + 1}: ` })), ...assets.map((row, index) => ({ row, prefix: `Asset ${index + 1}: ` }))].forEach(({row, prefix}) => {
    if (!/^[A-Z]{3}$/.test(row.currency.trim().toUpperCase())) errors.push(prefix + "enter a three-letter currency code.");
    for (const [key, label] of [["estimated_value", "estimated value"], ["existing_liens_total", "existing liens"], ["available_lien_amount", "available lien amount"]] as const) {
      const raw = row[key].replace(/,/g, "").trim();
      if (raw && (!/^\d+(\.\d{1,2})?$/.test(raw) || !Number.isFinite(Number(raw)) || Number(raw) > 999999999999)) errors.push(prefix + `enter a nonnegative ${label} with at most two decimal places.`);
    }
    if (row.proposed_lien_position && !/^(10|[1-9])$/.test(row.proposed_lien_position)) errors.push(prefix + "lien position must be 1 through 10.");
  });
  return errors;
}

export type InvestorSourceReference = {
  id: string;
  label: string;
  kind?: string | null;
  period?: string | null;
  file_id?: string | null;
  version_id?: string | null;
  version_number?: number | null;
  pages?: number[];
  content_hash?: string | null;
  metric_keys?: string[];
  status?: string | null;
};
export type InvestorReferenceManifest = {
  artifact_id: string;
  generation_id?: string | null;
  generated_at?: string | null;
  available?: boolean;
  reason?: string | null;
  references: InvestorSourceReference[];
  section_reference_ids?: Record<string, string[]>;
  analysis_notes?: Array<{ section: string; label: string; text: string }>;
};
export function investorReferenceLabel(row: InvestorSourceReference): string {
  return /credit/i.test(row.kind ?? "") ? "Linked owner credit report" : row.label || "Source document";
}
