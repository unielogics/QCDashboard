import styles from "./FinancialReview.module.css";

export function financialReviewCompanyName(businessName?: string | null): string {
  return businessName?.trim() || "Company name unavailable";
}

/** Use the current file's identity; bank-account selections never rename it. */
export function FinancialReviewHeading({ businessName }: { businessName?: string | null }) {
  return <>
    <span className={styles.reviewTitle}>Advanced financial review</span>
    <span className={styles.reviewCompany}>{financialReviewCompanyName(businessName)}</span>
  </>;
}
