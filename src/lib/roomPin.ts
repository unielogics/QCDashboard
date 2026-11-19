/** Every new access PIN is six ASCII digits; leading zeros are part of the PIN. */
export const ACCESS_PIN_LENGTH = 6;

/** The codes a guesser tries first: the server's `_TRIVIAL_PASSCODES`. */
const EASY_PINS = new Set(["123456", "654321", "012345", "543210", "123123", "112233", "121212", "111222"]);

/** Six repeated digits, or one of the runs and patterns tried first. */
export function isEasyPin(pin: string): boolean {
  return /^([0-9])\1{5}$/.test(pin) || EASY_PINS.has(pin);
}

/** Exactly six ASCII digits (no other numerals, no spaces). */
export function isAccessPin(value: string): boolean {
  return /^[0-9]{6}$/.test(value);
}

/** What a PIN field keeps as it is typed or pasted: digits only, at most six. */
export function normalizeAccessPin(value: string): string {
  return value.replace(/[^0-9]/g, "").slice(0, ACCESS_PIN_LENGTH);
}

/**
 * Why a PIN the desk typed for a new share or upload link cannot be used, or
 * null. Blank is fine: one is generated for it.
 */
export function accessPinProblem(value: string): string | null {
  const pin = value.trim();
  if (!pin || isAccessPin(pin)) return null;
  return "The access PIN must be exactly 6 digits. Finish it or press Generate.";
}

/**
 * Codes issued before every PIN was six digits (the old share and upload panels
 * made eight letters and digits; the desk could also type its own). The server
 * still accepts them for the links they were issued with, up to this length.
 */
export const OLDER_ACCESS_CODE_MAX_LENGTH = 80;

/**
 * Can the room gate try this code? A PIN must be six digits. An older code is
 * only checked for being there: the server decides whether it opens the room,
 * and then asks for a six-digit PIN.
 */
export function roomEntryCodeReady(code: string, olderCode: boolean): boolean {
  const value = code.trim();
  if (!olderCode) return isAccessPin(value);
  return value.length > 0 && value.length <= OLDER_ACCESS_CODE_MAX_LENGTH;
}

/** Fills the array with random values; `crypto.getRandomValues` in the browser. */
export type FillRandom = (array: Uint32Array) => Uint32Array;

const secureFill: FillRandom = (array) => globalThis.crypto.getRandomValues(array);

const PIN_SPACE = 10 ** ACCESS_PIN_LENGTH;
// The largest multiple of PIN_SPACE a 32-bit draw can reach; draws at or above
// it are discarded so every PIN is equally likely (no modulo bias).
const UNBIASED_LIMIT = 2 ** 32 - (2 ** 32 % PIN_SPACE);

/**
 * A new access PIN from the browser's secure random source: six digits drawn
 * evenly from 000000-999999, leading zeros kept, never a code a guesser tries
 * first. The server's generator follows the same rule.
 */
export function generateAccessPin(fill: FillRandom = secureFill): string {
  const draw = new Uint32Array(1);
  for (;;) {
    fill(draw);
    const value = draw[0];
    if (value >= UNBIASED_LIMIT) continue;
    const pin = String(value % PIN_SPACE).padStart(ACCESS_PIN_LENGTH, "0");
    if (!isEasyPin(pin)) return pin;
  }
}

/** New credentials follow the server's canonical client-room PIN rules. */
export function chosenRoomPinProblem(pin: string, confirmation: string, locale: "en" | "es" = "en", currentPin?: string): string | null {
  const es = locale === "es";
  if (!isAccessPin(pin)) return es ? "Elija un PIN de 6 dígitos." : "Choose a 6-digit room PIN.";
  if (isEasyPin(pin)) {
    return es ? "Elija un PIN que no sea fácil de adivinar; evite números repetidos o consecutivos." : "Choose a PIN that is not easy to guess; avoid repeated or consecutive numbers.";
  }
  if (currentPin && pin === currentPin) return es ? "Elija un PIN diferente al que le enviamos." : "Choose a PIN different from the one we sent you.";
  if (pin !== confirmation) return es ? "Los dos PIN no coinciden." : "The two room PIN entries do not match.";
  return null;
}
