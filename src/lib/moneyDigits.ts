/**
 * Fraction digits for a money amount: whole dollars print without cents, and
 * anything with cents prints both digits ("$184,321.50", never "$184,321.5").
 * Spread into an Intl.NumberFormat currency options object.
 */
export function moneyDigits(value: number): { minimumFractionDigits: number; maximumFractionDigits: number } {
  const cents = Math.round(Math.abs(value) * 100) % 100;
  return { minimumFractionDigits: cents === 0 ? 0 : 2, maximumFractionDigits: 2 };
}
