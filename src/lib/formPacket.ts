// The forms one packet link opens. The desk sends a packet as one link whose
// child links are `{base}.{kind}`; the server mints a personal financial
// statement child only on a file that asks for personal statements
// (owner_statements on the backend), so a packet holds three forms or four.

export type PacketKind = "p_and_l" | "balance_sheet" | "debt_schedule" | "pfs";

/** The order the desk reads them in: the business first, the owner last. */
export const PACKET_KINDS: PacketKind[] = ["p_and_l", "balance_sheet", "debt_schedule", "pfs"];

/** A packet always has these. The personal statement is in it only when the file asks for one. */
const CORE_KINDS: PacketKind[] = ["p_and_l", "balance_sheet", "debt_schedule"];

const NUMBER_WORDS = ["No", "One", "Two", "Three", "Four"];

/** The packet's forms from which child links answered: null when the packet is closed or expired. */
export function packetKinds(answered: Partial<Record<PacketKind, boolean>>): PacketKind[] | null {
  if (CORE_KINDS.some((kind) => !answered[kind])) return null;
  return PACKET_KINDS.filter((kind) => answered[kind]);
}

/** "Three" or "Four", for "Three forms, one link." */
export function formCountWords(count: number): string {
  return NUMBER_WORDS[count] ?? String(count);
}
