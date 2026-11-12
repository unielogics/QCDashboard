export const CHATGPT_FEED_API = "/admin/chatgpt-product-feed";

export type FeedCatalogOverride = {
  included?: boolean;
  title?: string | null;
  description?: string | null;
  canonical_url?: string | null;
  image_url?: string | null;
  actual_price?: string | null;
  content_approved?: boolean;
  pricing_confirmed?: boolean;
  approved_source_revision?: string | null;
};

export type ChatgptFeedSettings = {
  revision: number;
  enabled: boolean;
  acceptance_confirmed: boolean;
  acceptance_reference: string;
  sftp_host: string;
  sftp_port: number;
  sftp_username: string;
  server_fingerprint: string;
  remote_directory: string;
  staging_directory: string | null;
  staging_isolation_confirmed: boolean;
  filename: string;
  schedule_hour_utc: number;
  brand: string;
  seller_name: string;
  currency?: "USD";
  catalog_overrides: Record<string, FeedCatalogOverride>;
  public_key?: string | null;
  private_key_configured?: boolean;
  connection_verified?: boolean;
  delivery_verified_at?: string | null;
  last_success_at?: string | null;
  next_run_at?: string | null;
};

export type FeedCatalogItem = {
  item_id: string;
  kind: string;
  priority: number;
  title: string;
  description: string;
  url: string;
  brand: string;
  seller_name: string;
  image_url: string;
  availability: string;
  price: string | null;
  included: boolean;
  eligible: boolean;
  issues: string[];
  commercial_terms_version?: string | number | null;
  source_revision: string;
  retired_record?: boolean;
};

export type ChatgptFeedPreview = {
  generated_at: string;
  source_count: number;
  eligible_count: number;
  excluded_count: number;
  export_count?: number;
  disabled_count?: number;
  ready_for_upload: boolean;
  blockers: string[];
  items: FeedCatalogItem[];
};

export type ChatgptFeedRun = {
  id: string;
  status: "queued" | "running" | "uploaded" | "failed" | "blocked";
  trigger: "manual" | "scheduled" | "catalog_change";
  attempt_count: number;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  eligible_count: number;
  excluded_count: number;
  sha256?: string | null;
  last_error?: string | null;
  processing_status: string;
  retry_at?: string | null;
};

/** Explicit allowlist: readonly state and any future secret fields never enter PUT. */
export function feedSettingsWrite(value: ChatgptFeedSettings) {
  return {
    revision: value.revision,
    enabled: value.enabled,
    acceptance_confirmed: value.acceptance_confirmed,
    acceptance_reference: value.acceptance_reference,
    sftp_host: value.sftp_host,
    sftp_port: value.sftp_port,
    sftp_username: value.sftp_username,
    server_fingerprint: value.server_fingerprint,
    remote_directory: value.remote_directory,
    staging_directory: value.staging_directory || "",
    staging_isolation_confirmed: value.staging_isolation_confirmed,
    filename: value.filename,
    schedule_hour_utc: value.schedule_hour_utc,
    brand: value.brand,
    seller_name: value.seller_name,
    currency: "USD" as const,
    catalog_overrides: value.catalog_overrides,
  };
}

export function feedDraftKey(value: ChatgptFeedSettings): string {
  return JSON.stringify(feedSettingsWrite(value));
}

/** Key generation/connection tests advance server state without discarding parked edits. */
export function mergeFeedServerState(draft: ChatgptFeedSettings, saved: ChatgptFeedSettings, advanceRevision = false): ChatgptFeedSettings {
  return {
    ...draft,
    revision: advanceRevision ? saved.revision : draft.revision,
    public_key: saved.public_key,
    private_key_configured: saved.private_key_configured,
    connection_verified: saved.connection_verified,
    delivery_verified_at: saved.delivery_verified_at,
    last_success_at: saved.last_success_at,
    next_run_at: saved.next_run_at,
  };
}

export function patchFeedOffer(current: FeedCatalogOverride, patch: FeedCatalogOverride): FeedCatalogOverride {
  const contentChanged = ["title", "description", "canonical_url", "image_url"].some((key) => key in patch && patch[key as keyof FeedCatalogOverride] !== current[key as keyof FeedCatalogOverride]);
  const priceChanged = "actual_price" in patch && patch.actual_price !== current.actual_price;
  return {
    ...current, ...patch,
    ...(contentChanged ? { content_approved: false, approved_source_revision: null } : {}),
    ...(priceChanged ? { pricing_confirmed: false } : {}),
  };
}

export function canManageChatgptFeed(user: { role?: string; account_status?: string } | null | undefined): boolean {
  return user?.role === "super_admin" && user.account_status === "active";
}

export function feedSyncProblem(settings: ChatgptFeedSettings, preview: ChatgptFeedPreview | null, dirty: boolean, previewCurrent: boolean): string | null {
  if (dirty) return "Save changes before uploading.";
  if (!preview || !previewCurrent) return "Preview the current catalog before uploading.";
  if (!settings.acceptance_confirmed || !settings.acceptance_reference.trim()) return "Record OpenAI’s acceptance and pricing instructions first.";
  if (!settings.private_key_configured) return "Create the dedicated SFTP key first.";
  if (!settings.delivery_verified_at || settings.connection_verified === false) return "Test this connection and completed-file delivery first.";
  if (!preview.ready_for_upload || (preview.export_count ?? preview.eligible_count) < 1) return preview.blockers[0] || "Resolve the catalog validation issues before uploading.";
  return null;
}

export function feedRunLabel(run: Pick<ChatgptFeedRun, "status">): string {
  return run.status === "uploaded" ? "Uploaded · processing not verified" : ({ queued: "Queued", running: "Uploading", failed: "Failed", blocked: "Blocked" }[run.status]);
}

export function feedSourceApproved(item: Pick<FeedCatalogItem, "source_revision">, value: FeedCatalogOverride): boolean {
  return Boolean(value.content_approved && value.approved_source_revision === item.source_revision);
}

/** Browser preview links accept public-looking HTTPS names, never credentials or local/IP endpoints. */
export function publicFeedUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || (url.port && url.port !== "443")) return null;
    if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(url.hostname) || /\.(?:localhost|local|internal|test|invalid)$/i.test(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}
