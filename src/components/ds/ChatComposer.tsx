"use client";

// One composer for every conversation in the dashboard.
//
// The shape is the one people already know from their phone: an input that
// grows with the text, a round send button at the trailing edge, Enter to send
// and Shift+Enter for a new line. Before this each thread rolled its own
// textarea and rectangular button, so the same keystroke did different things
// depending on which panel you were in.
//
// Attachments are opt-in per surface rather than assumed, because not every
// transport can carry a file. Outbound SMS through the handset relay is text
// only — the gateway's send API has no media field — so a text thread passes no
// `onFiles` and gets no paperclip it cannot use.
//
// Mirrors QCRep's components/ChatComposer.tsx. The two apps share no package,
// so they share a shape and a set of rules instead; change both together.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Icon } from "@/components/design-system/Icon";
import { cx } from "./index";

const MAX_INPUT_HEIGHT = 168; // ~7 lines, then it scrolls instead of growing.

export type ChatComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  placeholder?: string;
  disabled?: boolean;
  sending?: boolean;
  /** Screen-reader name for the round button. Say what it sends. */
  sendLabel?: string;
  hint?: ReactNode;
  /** Warning above the input, for a channel that reaches the client. */
  notice?: ReactNode;
  error?: ReactNode;
  /** Provide to enable the paperclip AND pasting an image. Omit for text-only transports. */
  onFiles?: (files: File[]) => void;
  /** What the picker offers. Pasting is not filtered by this — the surface decides. */
  accept?: string;
  attachments?: ReactNode;
  /**
   * Send is allowed on an empty input. For a surface where an attachment on
   * its own is a complete message.
   */
  allowEmpty?: boolean;
  /** Own control for the leading slot, replacing the file paperclip. */
  leading?: ReactNode;
  autoFocus?: boolean;
};

export function ChatComposer({
  value,
  onChange,
  onSend,
  placeholder,
  disabled = false,
  sending = false,
  sendLabel = "Send message",
  hint,
  notice,
  error,
  onFiles,
  accept = "image/*",
  attachments,
  allowEmpty = false,
  leading,
  autoFocus,
}: ChatComposerProps) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  // An IME candidate window swallows Enter to commit a character. Sending on
  // that keystroke would post half a word in Japanese or Chinese.
  const [composing, setComposing] = useState(false);

  const canSend = (Boolean(value.trim()) || allowEmpty) && !disabled && !sending;

  // Grow to fit, up to a ceiling. Reset first so deleting text shrinks it back.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }, [value]);

  const submit = useCallback(() => {
    if (!canSend) return;
    onSend();
  }, [canSend, onSend]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter") return;
    if (event.shiftKey || composing || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submit();
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!onFiles) return;
    // Only intercept when the clipboard actually carries a file. A normal text
    // paste must still land in the input untouched.
    const files = Array.from(event.clipboardData?.files ?? []);
    if (!files.length) return;
    event.preventDefault();
    onFiles(files);
  };

  return (
    <div className={cx("chat-composer", disabled && "is-disabled")}>
      {notice ? <div className="chat-composer-notice">{notice}</div> : null}
      {attachments ? <div className="chat-composer-attachments">{attachments}</div> : null}
      <div className="chat-composer-bar">
        {leading}
        {!leading && onFiles ? (
          <>
            <button
              type="button"
              className="chat-composer-attach"
              aria-label="Attach a file"
              disabled={disabled || sending}
              onClick={() => fileRef.current?.click()}
            >
              <Icon name="paperclip" size={17} />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept={accept}
              multiple
              hidden
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                if (event.target.files?.length) onFiles(Array.from(event.target.files));
                // Same file twice in a row still fires a change event.
                event.target.value = "";
              }}
            />
          </>
        ) : null}
        <textarea
          ref={inputRef}
          className="chat-composer-input"
          rows={1}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          aria-label={placeholder || "Message"}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => setComposing(false)}
        />
        <button
          type="button"
          className="chat-composer-send"
          aria-label={sendLabel}
          disabled={!canSend}
          onClick={submit}
        >
          <Icon name="send" size={16} />
        </button>
      </div>
      {error ? <div className="chat-composer-error">{error}</div> : null}
      {hint ? <div className="chat-composer-hint">{hint}</div> : null}
    </div>
  );
}
