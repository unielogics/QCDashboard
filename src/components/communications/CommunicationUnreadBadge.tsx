import styles from "./CommunicationUnreadBadge.module.css";
import { Btn } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";

/** A count always comes from scoped server read state, never a local visit. */
export function CommunicationUnreadBadge({ count, channel }: { count: number; channel: string }) {
  if (count <= 0) return null;
  return <span className={styles.badge} aria-label={`${count} unread ${channel} message${count === 1 ? "" : "s"}`} title={`${count} unread ${channel} message${count === 1 ? "" : "s"}`}>{count > 99 ? "99+" : count}</span>;
}

export function CommunicationUnreadBar({ sms, email, error, fetching, onOpen, onRetry }: {
  sms: number; email: number; error: boolean; fetching: boolean;
  onOpen: (channel: "client" | "email") => void; onRetry: () => void;
}) {
  if (sms > 0 || email > 0) return <div className={styles.bar} aria-label="Unread client communications"><span>Unread client messages</span>{sms > 0 ? <Btn size="sm" onClick={() => onOpen("client")}><Icon name="chat" size={13} />SMS<CommunicationUnreadBadge count={sms} channel="SMS" /></Btn> : null}{email > 0 ? <Btn size="sm" onClick={() => onOpen("email")}><Icon name="mail" size={13} />Email<CommunicationUnreadBadge count={email} channel="email" /></Btn> : null}{error ? <><span role="status">Counts could not refresh; showing the last loaded counts.</span><Btn size="sm" disabled={fetching} onClick={onRetry}>Retry counts</Btn></> : null}</div>;
  return error ? <div className={styles.error}><span>Client message counts are unavailable.</span><Btn size="sm" disabled={fetching} onClick={onRetry}>Retry counts</Btn></div> : null;
}
