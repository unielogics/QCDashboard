export const MARKETPLACE_FIELD_LABELS = {
  vertical: "Vertical", program_label: "Program label", name: "Deal title", summary: "Summary", city: "City", state: "State (2 letters)",
  collateral_type: "Collateral type", lien_position: "Lien position", note_rate_pct: "Note rate, % paid to participants", term_months: "Term, months",
  ltv_pct: "LTV / LTC / CLTV, %", ltv_kind: "Ratio kind", loan_amount: "Loan amount, $", offered_amount: "Capital to raise from investors, $",
  minimum_investment: "Smallest investor contribution, $", payment_frequency: "Payment frequency", personal_guarantee: "Personal guarantee",
  guarantee_text: "Guarantee, as shown", borrower_track_record: "Borrower track record", exit_plan: "Exit plan", valuation_amount: "Valuation, $",
  valuation_source: "Valuation source", title_status: "Title", servicer_label: "Servicer, as shown", expected_funding_date: "Estimated funding date", maturity_date: "Estimated maturity date", maturity_date_mode: "Maturity calculation", closes_at: "Subscriptions close",
} as const;
export type MarketplaceField = keyof typeof MARKETPLACE_FIELD_LABELS;
export type MarketplaceFinancialAction = "coverage" | "terms" | "use-of-funds";
export type MarketplacePublishIssue = { code: string; message: string; section: "terms" | "documents" | "budget" | "coverage_plan" | "client_terms" | "use_of_funds" | "snapshot"; field?: string | null; document_kind?: "ppm" | null };
export type MarketplaceIssueTarget = { kind: "field"; field: MarketplaceField } | { kind: "ppm" } | { kind: "upload"; documentKind?: "ppm" } | { kind: "document-type" } | { kind: "budget" } | { kind: "file"; action: MarketplaceFinancialAction } | { kind: "snapshot" };
export type MarketplaceIssue = { key: string; message: string; instruction: string; actionLabel?: string; target?: MarketplaceIssueTarget };
type Context = { linked: boolean; action?: "publish" | "terms" | "documents" | "snapshot" };

export const marketplaceFieldId = (field: MarketplaceField) => `marketplace-field-${field}`;
export const isMarketplaceField = (field: unknown): field is MarketplaceField => typeof field === "string" && Object.hasOwn(MARKETPLACE_FIELD_LABELS, field);

function targetIssue(message: string, target: MarketplaceIssueTarget): MarketplaceIssue {
  if (isMarketplaceField(message)) message = `${MARKETPLACE_FIELD_LABELS[message]} is required.`;
  if (message === "minimum_investment exceeds offered_amount") message = "The smallest investor contribution exceeds the capital to raise.";
  if (message === "offered_amount exceeds the canonical financing amount") message = "Investor capital exceeds the saved financing amount.";
  switch (target.kind) {
    case "field": return { key: `field:${target.field}`, message, target, instruction: `Correct ${MARKETPLACE_FIELD_LABELS[target.field]}, then save the listing.`, actionLabel: `Fix ${MARKETPLACE_FIELD_LABELS[target.field]}` };
    case "ppm": return { key: "document:ppm", message: message === "private placement memorandum not uploaded" ? "Prepare and approve the private placement memorandum" : message, target, instruction: "Generate or update the PPM draft in Documents, complete the missing facts, then explicitly review the current version before publishing.", actionLabel: "Review PPM in Documents" };
    case "upload": return { key: target.documentKind === "ppm" ? "document:ppm" : "document:upload", message, target, instruction: target.documentKind === "ppm" ? "Upload the private placement memorandum PDF under Documents. Once it is marked Ready, review and publish the offer." : "Review the selected document and upload status. Choose the appropriate PDF or retry the upload.", actionLabel: target.documentKind === "ppm" ? "Upload PPM in Documents" : "Review document upload" };
    case "document-type": return { key: "document:type", message, target, instruction: "Choose the document kind, then select the appropriate PDF.", actionLabel: "Choose document type" };
    case "budget": return { key: "owner:budget", message, target, instruction: "Review and save the shared investment and closing-cost budget, then refresh the listing from the saved file.", actionLabel: "Review shared deal budget" };
    case "file": return { key: `owner:${target.action}`, message, target, instruction: `${target.action === "terms" ? "Review and save the current full loan terms on the linked file, then refresh this listing." : target.action === "use-of-funds" ? "Reconcile the linked file’s itemized use of funds with net proceeds, then refresh this listing." : "Review and save the active coverage loan on the linked file, then refresh this listing."} The owner opens in a new tab so your unsaved listing edits stay here.`, actionLabel: target.action === "terms" ? "Open full terms in new tab" : target.action === "use-of-funds" ? "Open use of funds in new tab" : "Open coverage plan in new tab" };
    case "snapshot": return { key: "owner:snapshot", message, target, instruction: "Refresh the listing figures from the saved file, review the resulting terms, then publish explicitly.", actionLabel: "Refresh saved file figures" };
  }
}

function fieldIssue(field: MarketplaceField, message: string, linked: boolean): MarketplaceIssue {
  if (isMarketplaceField(message)) message = `${MARKETPLACE_FIELD_LABELS[message]} is required.`;
  if (message === "minimum_investment exceeds offered_amount") message = "The smallest investor contribution exceeds the capital to raise.";
  if (linked && ["offered_amount", "minimum_investment"].includes(field)) return targetIssue(message, { kind: "budget" });
  if (linked && ["loan_amount", "note_rate_pct", "term_months", "expected_funding_date", "maturity_date", "maturity_date_mode"].includes(field)) return targetIssue(message, { kind: "file", action: "coverage" });
  return targetIssue(message, { kind: "field", field });
}

const LEGACY_TARGETS: Record<string, MarketplaceIssueTarget> = {
  "private placement memorandum not uploaded": { kind: "ppm" },
  "Restore or synchronize the working financing proposal before publishing; issued terms are a historical reference": { kind: "file", action: "coverage" },
  "Save an updated terms version for the changed financing or collateral before publishing": { kind: "file", action: "terms" },
  "Save an updated terms version for the changed cost budget before publishing": { kind: "file", action: "terms" },
  "Confirm the closing cost budget, funding mode and investor charges before publishing": { kind: "budget" },
  "Apply the solved gross principal to the shared loan before publishing": { kind: "budget" },
  "Reconcile the current use-of-funds allocations with net loan proceeds at funding before publishing": { kind: "file", action: "use-of-funds" },
  "offered_amount exceeds the canonical financing amount": { kind: "budget" },
  "Refresh financing from the file before publishing": { kind: "snapshot" },
};

export function marketplacePublishIssues(blockers: string[], structured: MarketplacePublishIssue[] | undefined, context: Context): MarketplaceIssue[] {
  const fromStructured = (item: MarketplacePublishIssue) => {
    if (item.section === "terms" && isMarketplaceField(item.field)) return fieldIssue(item.field, item.message, context.linked);
    if (item.section === "documents" && item.document_kind === "ppm") return targetIssue(item.message, { kind: "ppm" });
    if (item.section === "budget") return targetIssue(item.message, { kind: "budget" });
    if (item.section === "coverage_plan") return targetIssue(item.message, { kind: "file", action: "coverage" });
    if (item.section === "client_terms") return targetIssue(item.message, { kind: "file", action: "terms" });
    if (item.section === "use_of_funds") return targetIssue(item.message, { kind: "file", action: "use-of-funds" });
    if (item.section === "snapshot") return targetIssue(item.message, { kind: "snapshot" });
    return unknownIssue(item.message);
  };
  const items = structured?.length ? structured.map(fromStructured) : blockers.map(message => {
    if (isMarketplaceField(message)) return fieldIssue(message, `${MARKETPLACE_FIELD_LABELS[message]} is required.`, context.linked);
    if (message === "minimum_investment exceeds offered_amount") return fieldIssue("minimum_investment", message, context.linked);
    return LEGACY_TARGETS[message] ? targetIssue(message, LEGACY_TARGETS[message]) : unknownIssue(message);
  });
  return dedupeMarketplaceIssues(items);
}

export function unknownIssue(message: string): MarketplaceIssue {
  return { key: `unknown:${message.trim().toLowerCase()}`, message, instruction: "Your current edits are retained. Review the server’s message and retry the action; no specific input could be identified safely." };
}

export function marketplaceApiIssues(error: unknown, context: Context): MarketplaceIssue[] {
  const detail = (error as { body?: { detail?: unknown } } | null)?.body?.detail;
  const object = detail && typeof detail === "object" && !Array.isArray(detail) ? detail as { code?: string; message?: string; publish_issues?: MarketplacePublishIssue[] } : null;
  if (context.action === "publish" && object?.publish_issues?.length) return marketplacePublishIssues([], object.publish_issues, context);
  if (Array.isArray(detail) && detail.length) return dedupeMarketplaceIssues(detail.map(item => {
    if (!item || typeof item !== "object") return unknownIssue("The server rejected the request without identifying a valid input.");
    const entry = item as { loc?: unknown[]; msg?: string };
    const message = typeof entry.msg === "string" ? entry.msg.replace(/^Value error,\s*/, "") : "The server rejected this value.";
    if (context.action === "documents" && entry.loc?.[0] === "body" && ["kind", "name", "content_type", "size_bytes"].includes(String(entry.loc?.[1]))) return targetIssue(message, entry.loc?.[1] === "kind" ? { kind: "document-type" } : { kind: "upload" });
    if (context.action === "terms" && entry.loc?.length === 2 && entry.loc[0] === "body" && isMarketplaceField(entry.loc[1])) return fieldIssue(entry.loc[1], message, context.linked);
    if (context.action === "terms" && context.linked && entry.loc?.[0] === "body" && entry.loc?.[1] === "products") return targetIssue(message, { kind: "file", action: "coverage" });
    return unknownIssue(message);
  }));
  const message = typeof detail === "string" ? detail : object?.message ?? (error instanceof Error ? error.message : "The marketplace action could not be completed.");
  if (object?.code === "closed" || ["This offering has committed or funded capital. Its financing, participation amount and linked file cannot be edited without reviewing those commitments.", "This listing has committed or funded capital. Financing and recorded collateral cannot be changed through a file refresh; review the existing commitments before issuing a revised offering."].includes(message)) return [{ ...unknownIssue(message), instruction: "This listing is locked. Review its lifecycle status and capital commitments with the marketplace administrator; changing a disabled input will not resolve the lock." }];
  if (message === "The file changed since this listing was prepared. Refresh its financial snapshot and review the current financing and collateral before publishing.") return [targetIssue(message, { kind: "snapshot" })];
  if (context.action === "documents" && object?.code === "not_uploaded") return [targetIssue(message, { kind: "upload" })];
  if (context.action === "documents" && ["Document storage is not configured.", "Could not create an upload link."].includes(message)) return [{ ...unknownIssue(message), instruction: "Document storage is unavailable. Keep your current edits and retry the upload later; ask an administrator if storage is not configured." }];
  if (context.action === "publish" && object?.code === "incomplete" && message.startsWith("Fill in: ")) {
    let remaining = message.slice(9);
    const found: string[] = [];
    for (const known of [...Object.keys(LEGACY_TARGETS), "minimum_investment exceeds offered_amount", "name", "note_rate_pct", "term_months", "offered_amount", "minimum_investment"].sort((a, b) => b.length - a.length)) {
      const parts = remaining.split(known);
      if (parts.length > 1 && parts.every((part, index) => index === 0 ? !part || /;\s*$/.test(part) : !part || /^\s*;/.test(part))) { found.push(known); remaining = parts.join(""); }
    }
    if (found.length) return dedupeMarketplaceIssues([...marketplacePublishIssues(found, undefined, context), ...(remaining.replace(/[;\s]/g, "") ? [unknownIssue(remaining.replace(/^;\s*|;\s*$/g, ""))] : [])]);
  }
  return [unknownIssue(message)];
}

export function dedupeMarketplaceIssues(issues: MarketplaceIssue[]): MarketplaceIssue[] {
  const unique = new Map<string, MarketplaceIssue>();
  const messages = new Map<string, Set<string>>();
  for (const issue of issues) {
    const current = unique.get(issue.key);
    if (!current) { unique.set(issue.key, issue); messages.set(issue.key, new Set([issue.message])); }
    else if (!messages.get(issue.key)?.has(issue.message)) { unique.set(issue.key, { ...current, message: `${current.message} ${issue.message}` }); messages.get(issue.key)?.add(issue.message); }
  }
  return [...unique.values()];
}

export function marketplaceIssueHref(listingId: string, issue: MarketplaceIssue): string {
  return `/admin/marketplace/${encodeURIComponent(listingId)}?fix=${encodeURIComponent(issue.key)}`;
}

export function parseMarketplaceFinancialAction(value: string | null | undefined): MarketplaceFinancialAction | null {
  return value === "coverage" || value === "terms" || value === "use-of-funds" ? value : null;
}

export function marketplaceOwnerHref(intakeId: string, action: MarketplaceFinancialAction): string {
  return `/files/${encodeURIComponent(intakeId)}?section=overview&financial_action=${action}`;
}
