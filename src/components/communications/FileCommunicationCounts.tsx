import Link from "next/link";
import { Icon } from "@/components/design-system/Icon";
import { fileHref } from "@/lib/fileRoutes";
import { CommunicationUnreadBadge } from "./CommunicationUnreadBadge";
import styles from "./FileCommunicationCounts.module.css";

/** Opening a file never clears its counts; the conversation acknowledges visible messages. */
export function FileCommunicationCounts({ intakeId, name, counts, loading, unavailable }: {
  intakeId: string;
  name: string;
  counts?: { sms: number; email: number };
  loading: boolean;
  unavailable: boolean;
}) {
  if (!counts) return <span className="sub">{loading && !unavailable ? "Loading counts…" : "Counts unavailable"}</span>;
  if (counts.sms <= 0 && counts.email <= 0) return <span className="sub">{unavailable ? "Counts unavailable" : "No new messages"}</span>;
  return <div className={styles.counts}>
    {counts.sms > 0 ? <Link className={`btn sm ${styles.link}`} href={`${fileHref(intakeId, "communications")}&channel=client`} onClick={(event) => event.stopPropagation()} aria-label={`Open SMS for ${name} (${counts.sms} unread)`}><Icon name="chat" size={13} />SMS<CommunicationUnreadBadge count={counts.sms} channel="SMS" /></Link> : null}
    {counts.email > 0 ? <Link className={`btn sm ${styles.link}`} href={`${fileHref(intakeId, "communications")}&channel=email`} onClick={(event) => event.stopPropagation()} aria-label={`Open email for ${name} (${counts.email} unread)`}><Icon name="mail" size={13} />Email<CommunicationUnreadBadge count={counts.email} channel="email" /></Link> : null}
    {unavailable ? <span className="sub">Last loaded counts</span> : null}
  </div>;
}
