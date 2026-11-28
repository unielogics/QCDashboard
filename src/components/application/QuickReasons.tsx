import styles from "./QuickReasons.module.css";

/**
 * One-click reasons above a "why" box.
 *
 * A recorded decision needs a reason, and the usual ones are few. Picking one
 * fills the box; the reviewer can still edit it or write their own.
 */
export function QuickReasons({ reasons, value, disabled = false, onPick }: {
  reasons: string[];
  /** The reason in the box now, so the picked one reads as chosen. */
  value: string;
  disabled?: boolean;
  onPick: (reason: string) => void;
}) {
  if (!reasons.length) return null;
  return <div className={styles.quick} role="group" aria-label="Common reasons">
    {reasons.map((reason) => <button type="button" key={reason} className={styles.reason} aria-pressed={value === reason} disabled={disabled} onClick={() => onPick(reason)}>{reason}</button>)}
  </div>;
}
