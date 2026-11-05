import type { ApiOptions } from "@/lib/api";

export type FileRequestItem = {
  document_type: string;
  name: string;
  quantity: number;
  unit: "files" | "months" | "years";
  subject: string;
  period: string;
  instructions: string;
};

export type FileRequestDelivery = {
  id: string;
  status: string;
  detail: string | null;
  channel: string;
  created_at: string;
  recipient_email: string | null;
};

export type FileRequestRead = {
  request_id: string;
  created_at: string;
  items: (FileRequestItem & {
    label: string;
    requirement_key: string;
    requested_document_id: string;
    status: string;
    coverage: { current?: number; required?: number; unit?: string; complete?: boolean };
    verified_coverage: { current?: number; required?: number; complete?: boolean };
    task_id: string | null;
    task_status: string | null;
    next_reminder_at?: string | null;
  })[];
  deliveries: FileRequestDelivery[];
};

export type FileRequestsResponse = { requests: FileRequestRead[]; notification?: FileRequestDelivery | null };
type AuthenticatedApi = <T>(path: string, options?: ApiOptions) => Promise<T>;

export function fileRequestsApi(call: AuthenticatedApi, profileId: string) {
  const base = `/application-profiles/${encodeURIComponent(profileId)}/file-requests`;
  return {
    list: () => call<FileRequestsResponse>(base),
    create: (requestId: string, items: FileRequestItem[], notify: boolean) => call<FileRequestsResponse>(base, {
      method: "POST", body: JSON.stringify({ request_id: requestId, items, notify }),
    }),
    retry: (requestId: string, retryId: string) => call<{ notification: FileRequestDelivery }>(`${base}/${encodeURIComponent(requestId)}/retry`, {
      method: "POST", body: JSON.stringify({ retry_id: retryId }),
    }),
    cancel: (requestId: string) => call(`${base}/${encodeURIComponent(requestId)}/cancel`, { method: "POST" }),
  };
}
