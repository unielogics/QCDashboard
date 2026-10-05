export type EditableOwnerField = "first_name" | "last_name" | "ownership_pct" | "email" | "phone";

export type OwnerFieldValidation = {
  value: string | number | null;
  error: string | null;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateOwnerField(field: EditableOwnerField, raw: string): OwnerFieldValidation {
  const trimmed = raw.trim();
  if (field === "first_name" || field === "last_name") {
    return trimmed
      ? { value: trimmed, error: null }
      : { value: null, error: `${field === "first_name" ? "First" : "Last"} name is required.` };
  }
  if (field === "ownership_pct") {
    if (!trimmed) return { value: null, error: "Ownership percentage is required." };
    const value = Number(trimmed);
    return Number.isFinite(value) && value >= 0 && value <= 100
      ? { value, error: null }
      : { value: null, error: "Ownership percentage must be between 0 and 100." };
  }
  if (field === "email") {
    return !trimmed || EMAIL_PATTERN.test(trimmed)
      ? { value: trimmed || null, error: null }
      : { value: null, error: "Enter a valid personal email address or leave it blank." };
  }
  return { value: trimmed || null, error: null };
}
