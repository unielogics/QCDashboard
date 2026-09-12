import type { InlineImage } from "@/lib/inlineImages";

/**
 * Every open conversation uses the same fallback refresh contract. Realtime
 * transports may make this interval a no-op most of the time, but the poll is
 * what keeps a dropped socket, delayed mailbox sync, or tablet relay from
 * requiring a page refresh.
 */
export const LIVE_MESSAGE_POLL_MS = 3_000;
export const LIVE_MESSAGE_QUERY_OPTIONS = {
  staleTime: 0,
  refetchInterval: LIVE_MESSAGE_POLL_MS,
  refetchIntervalInBackground: true,
  refetchOnWindowFocus: "always",
  refetchOnReconnect: "always",
} as const;

export type UnifiedCommunicationThread = {
  id: string;
  title: string;
  participant_name: string | null;
  participant_email: string | null;
  participant_phone: string | null;
  participant_type: string;
  source_kind: string;
  source_id: string;
  source_ref: string | null;
  source_label: string | null;
  channel: string;
  transport: string;
  unread_count: number;
  message_count: number;
  latest_snippet: string | null;
  latest_at: string;
  assigned_desk: string | null;
  href: string;
  can_reply: boolean;
};

export type UnifiedCommunicationMessage = {
  id: string;
  thread_id: string;
  body: string;
  sender_name: string | null;
  sender_type: string;
  direction: "inbound" | "outbound" | "system";
  channel: string;
  transport: string;
  created_at: string;
  seen: boolean;
  delivery_status: string | null;
  /** Pictures on this message. Today that means an MMS the client sent us. */
  images?: InlineImage[];
};

export type UnifiedCommunicationThreadDetail = {
  thread: UnifiedCommunicationThread;
  messages: UnifiedCommunicationMessage[];
};

export type UnifiedCommunicationThreadPage = {
  items: UnifiedCommunicationThread[];
  total: number;
  limit: number;
  offset: number;
  totals_by_participant: Record<string, number>;
  totals_by_channel: Record<string, number>;
  unread_total: number;
};

export type UnifiedContactGroup = {
  key: string;
  name: string;
  email: string | null;
  phone: string | null;
  channels: string[];
  sources: string[];
  unread_total: number;
  message_total: number;
  latest_thread_id: string;
  latest_snippet: string | null;
  latest_channel: string;
  latest_at: string;
  threads: UnifiedCommunicationThread[];
};

export type UnifiedContactPage = {
  items: UnifiedContactGroup[];
  total: number;
  unread_total: number;
};

export type ComposeRecipient = {
  kind: "client" | "intake" | "dealer";
  id: string;
  name: string;
  label: string | null;
  email: string | null;
  phone: string | null;
};

export type ComposeChannelResult = { channel: string; ok: boolean; detail: string };

export type UnifiedComposeResult = {
  ok: boolean;
  results: ComposeChannelResult[];
  thread_id: string | null;
};
