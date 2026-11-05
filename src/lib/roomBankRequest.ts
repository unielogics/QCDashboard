// Which checklist row is the business bank statements, so the room can put
// "Connect your bank" ahead of "Add file" on it. The owner: "plaid needs to be
// the first option available to upload bank statements". The requirement key
// is what the desk's templates stamp; the category is what older rows carry.

export type BankRequestLike = { requirement_key?: string | null; category?: string | null; name?: string | null };

export function isBankStatementRequest(doc: BankRequestLike): boolean {
  if (doc.requirement_key === "business_bank_statements_6_months") return true;
  const text = `${doc.category ?? ""} ${doc.name ?? ""}`;
  // A personal statement (an owner's own account) is not the business bank
  // connection, and a card statement is a debt, not a bank account.
  if (/personal|credit card/i.test(text)) return false;
  if (/bank statements?/i.test(doc.category ?? "")) return true;
  return /\bbank statements?\b/i.test(doc.name ?? "");
}

/** The room's choice of first action for a checklist row. A bank-statement row
 *  on a room that can connect a bank leads with Plaid; everything else uploads. */
export function roomRowPrimaryAction(doc: BankRequestLike, canConnectBank: boolean): "connect_bank" | "upload" {
  return canConnectBank && isBankStatementRequest(doc) ? "connect_bank" : "upload";
}
