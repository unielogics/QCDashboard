// A server-sent-events client on `fetch` + `ReadableStream`.
//
// Why not `EventSource`: it cannot set request headers, and the API reads its
// credential from headers only. The alternatives both put a credential in the
// URL — Caddy logs every request line to stdout, and the browser keeps it in
// history and sends it as a Referer — so the stream is opened with `fetch`,
// which can carry `Authorization: Bearer <token>` (staff) or a session header
// (a no-login link holder) like every other request. A hand-rolled parser
// reads the byte stream; reconnection is ours, with exponential backoff and
// jitter rather than `EventSource`'s fixed `retry:`, and `Last-Event-ID` is
// resent so the server can resume where the browser left off.
//
// Nothing here knows what the events mean. `liveInvalidation.ts` does.

export type StreamEvent = {
  /** The `id:` field, or "" when the frame had none. */
  id: string;
  /** The `event:` field, or "message" per the SSE spec when absent. */
  type: string;
  /** The `data:` lines joined with "\n". */
  data: string;
};

export type HeadersFactory = () => Promise<Record<string, string>> | Record<string, string>;

export type EventStreamOptions = {
  url: string;
  /**
   * Called before every connection attempt, so a reconnect always carries a
   * fresh credential (a Clerk JWT lives about a minute; a stream lives hours).
   */
  headers: HeadersFactory;
  onEvent: (event: StreamEvent) => void;
  /** `reconnect` is false on the first successful open, true afterwards. */
  onOpen?: (info: { reconnect: boolean }) => void;
  onError?: (error: unknown) => void;
  /** Resume point to send on the very first connection. */
  lastEventId?: string | null;
  /** Backoff floor; a server `retry:` field replaces it. Default 1 000 ms. */
  minDelayMs?: number;
  /** Backoff ceiling. Default 30 000 ms. */
  maxDelayMs?: number;
  /** Injection point for tests. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
};

export type EventStreamHandle = {
  /** Abort the current connection and stop reconnecting. Idempotent. */
  close: () => void;
  /** The last `id:` seen, resent as `Last-Event-ID` on reconnect. */
  readonly lastEventId: string | null;
  readonly connected: boolean;
};

export class EventStreamHttpError extends Error {
  constructor(public status: number) {
    super(`event stream refused with HTTP ${status}`);
  }
}

// ── parser ───────────────────────────────────────────────────────────────────

export type SseParser = {
  /** Feed decoded text; complete frames are dispatched, partial ones kept. */
  push: (text: string) => void;
  /** The last `id:` seen, including one carried by a not-yet-dispatched frame. */
  readonly lastEventId: string | null;
  /** The last `retry:` value the server sent, in milliseconds. */
  readonly retryMs: number | null;
};

/**
 * The SSE framing rules (WHATWG "Server-sent events", §9.2.5), and nothing
 * else: lines end in \r\n, \n or \r; a line starting with ":" is a comment
 * (the API's heartbeat); `field: value` with one optional leading space
 * stripped from the value; a blank line dispatches the frame. Multiple
 * `data:` lines join with "\n". An `id:` containing NUL is ignored.
 */
export function createSseParser(onEvent: (event: StreamEvent) => void, initialLastEventId: string | null = null): SseParser {
  let buffer = "";
  let dataLines: string[] = [];
  let eventType = "";
  let hasData = false;
  let lastEventId = initialLastEventId;
  let retryMs: number | null = null;

  const dispatch = () => {
    if (hasData) {
      onEvent({ id: lastEventId ?? "", type: eventType || "message", data: dataLines.join("\n") });
    }
    dataLines = [];
    eventType = "";
    hasData = false;
  };

  const field = (line: string) => {
    if (line.startsWith(":")) return;
    const colon = line.indexOf(":");
    const name = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    switch (name) {
      case "data":
        dataLines.push(value);
        hasData = true;
        break;
      case "event":
        eventType = value;
        break;
      case "id":
        if (!value.includes("\0")) lastEventId = value;
        break;
      case "retry": {
        if (/^\d+$/.test(value)) retryMs = Number(value);
        break;
      }
      default:
        break;
    }
  };

  return {
    push(text: string) {
      buffer += text;
      // Hold back a trailing "\r": the next chunk may begin with "\n".
      let end = buffer.length;
      if (buffer.endsWith("\r")) end -= 1;
      let start = 0;
      for (let i = 0; i < end; i++) {
        const ch = buffer[i];
        if (ch !== "\n" && ch !== "\r") continue;
        const line = buffer.slice(start, i);
        if (ch === "\r" && buffer[i + 1] === "\n") i += 1;
        start = i + 1;
        if (line === "") dispatch();
        else field(line);
      }
      buffer = buffer.slice(start);
    },
    get lastEventId() {
      return lastEventId;
    },
    get retryMs() {
      return retryMs;
    },
  };
}

// ── connection ───────────────────────────────────────────────────────────────

function backoffDelay(attempt: number, floor: number, ceiling: number): number {
  // Exponential from the floor, capped, then "equal jitter": half fixed,
  // half random, so a fleet of tabs reconnecting after one API restart
  // spreads out instead of arriving as a thundering herd.
  const exponential = Math.min(ceiling, floor * 2 ** Math.max(0, attempt - 1));
  return Math.round(exponential / 2 + Math.random() * (exponential / 2));
}

function sleep(ms: number, signal: AbortSignal, wake: (resolve: () => void) => () => void): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      unhook();
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal.addEventListener("abort", finish);
    const unhook = wake(finish);
  });
}

export function openEventStream(options: EventStreamOptions): EventStreamHandle {
  const {
    url,
    headers,
    onEvent,
    onOpen,
    onError,
    minDelayMs = 1_000,
    maxDelayMs = 30_000,
    fetchImpl,
  } = options;
  const doFetch = fetchImpl ?? ((input, init) => fetch(input, init));

  let closed = false;
  let connected = false;
  let openedOnce = false;
  let attempt = 0;
  let lastEventId: string | null = options.lastEventId ?? null;
  let serverRetryMs: number | null = null;
  const lifetime = new AbortController();
  let current: AbortController | null = null;

  // Coming back online is the one signal worth cutting a backoff short for.
  const wake = (resolve: () => void) => {
    if (typeof window === "undefined") return () => {};
    window.addEventListener("online", resolve);
    return () => window.removeEventListener("online", resolve);
  };

  const connectOnce = async () => {
    current = new AbortController();
    const extra = await headers();
    const response = await doFetch(url, {
      method: "GET",
      headers: {
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
        ...extra,
        ...(lastEventId ? { "Last-Event-ID": lastEventId } : {}),
      },
      cache: "no-store",
      signal: current.signal,
    });
    if (!response.ok || !response.body) {
      throw new EventStreamHttpError(response.status);
    }
    connected = true;
    attempt = 0;
    onOpen?.({ reconnect: openedOnce });
    openedOnce = true;

    const parser = createSseParser((event) => {
      if (event.id) lastEventId = event.id;
      onEvent(event);
    }, lastEventId);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        parser.push(decoder.decode(value, { stream: true }));
        if (parser.lastEventId !== null) lastEventId = parser.lastEventId;
        if (parser.retryMs !== null) serverRetryMs = parser.retryMs;
      }
    } finally {
      connected = false;
      reader.releaseLock();
    }
  };

  const run = async () => {
    while (!closed) {
      try {
        await connectOnce();
        // A clean end of stream (server restart, proxy idle timeout) is
        // still a disconnect: fall through to the backoff and reconnect.
      } catch (error) {
        connected = false;
        if (closed) return;
        onError?.(error);
      }
      if (closed) return;
      attempt += 1;
      const floor = Math.max(minDelayMs, serverRetryMs ?? 0);
      await sleep(backoffDelay(attempt, floor, Math.max(maxDelayMs, floor)), lifetime.signal, wake);
    }
  };

  void run();

  return {
    close() {
      if (closed) return;
      closed = true;
      connected = false;
      lifetime.abort();
      current?.abort();
    },
    get lastEventId() {
      return lastEventId;
    },
    get connected() {
      return connected;
    },
  };
}
