import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ACCESS_PIN_LENGTH,
  OLDER_ACCESS_CODE_MAX_LENGTH,
  accessPinProblem,
  chosenRoomPinProblem,
  generateAccessPin,
  isAccessPin,
  isEasyPin,
  normalizeAccessPin,
  roomEntryCodeReady,
  type FillRandom,
} from "../roomPin";

/** A stand-in random source that hands back the given 32-bit draws in order. */
function scripted(...draws: number[]): FillRandom & { calls: number } {
  const queue = [...draws];
  const fill = ((array: Uint32Array) => {
    fill.calls += 1;
    const next = queue.shift();
    if (next === undefined) throw new Error("ran out of scripted draws");
    array[0] = next;
    return array;
  }) as FillRandom & { calls: number };
  fill.calls = 0;
  return fill;
}

describe("client-chosen room credentials", () => {
  it("requires six ASCII digits and a matching confirmation", () => {
    for (const pin of ["", "48291", "4829137", "abcdef", "١٢٣٤٥٦", "48 291"]) expect(chosenRoomPinProblem(pin, pin)).not.toBeNull();
    expect(chosenRoomPinProblem("482913", "482914")).toMatch(/do not match/);
    expect(chosenRoomPinProblem("482913", "482913")).toBeNull();
  });
  it("rejects canonical easily guessed choices and retaining a generated invitation code", () => {
    for (const pin of ["000000", "111111", "999999", "123456", "654321", "012345", "543210", "123123", "112233", "121212", "111222"]) expect(chosenRoomPinProblem(pin, pin)).toMatch(/easy to guess/);
    expect(chosenRoomPinProblem("482913", "482913", "en", "482913")).toMatch(/different/);
    expect(chosenRoomPinProblem("638274", "638274", "en", "482913")).toBeNull();
  });
  it("gives Spanish callers the same credential rules", () => {
    expect(chosenRoomPinProblem("123456", "123456", "es")).toMatch(/adivinar/);
    expect(chosenRoomPinProblem("638274", "638275", "es")).toMatch(/no coinciden/);
    expect(chosenRoomPinProblem("638274", "638274", "es")).toBeNull();
  });
});

describe("generating an access PIN", () => {
  afterEach(() => vi.restoreAllMocks());

  it("always gives six ASCII digits that are not an easy code", () => {
    for (let i = 0; i < 2000; i += 1) {
      const pin = generateAccessPin();
      expect(pin).toMatch(/^[0-9]{6}$/);
      expect(pin).toHaveLength(ACCESS_PIN_LENGTH);
      expect(isEasyPin(pin)).toBe(false);
    }
  });

  it("draws from the browser's secure random source by default", () => {
    const spy = vi.spyOn(globalThis.crypto, "getRandomValues");
    generateAccessPin();
    expect(spy).toHaveBeenCalled();
  });

  it("keeps leading zeros", () => {
    expect(generateAccessPin(scripted(42))).toBe("000042");
    expect(generateAccessPin(scripted(1_000_007))).toBe("000007");
    expect(generateAccessPin(scripted(98_765))).toBe("098765");
  });

  it("draws again instead of issuing a code a guesser tries first", () => {
    // 0 -> 000000 and 123456 are easy; 7 -> 000007 is not.
    const fill = scripted(0, 123_456, 7);
    expect(generateAccessPin(fill)).toBe("000007");
    expect(fill.calls).toBe(3);
  });

  it("discards the top of the 32-bit range so no PIN is more likely than another", () => {
    // 4294000000 is the first value past the last whole run of 1,000,000.
    const fill = scripted(4_294_967_295, 4_294_000_000, 5);
    expect(generateAccessPin(fill)).toBe("000005");
    expect(fill.calls).toBe(3);
    // A value just below the cut-off is still used.
    expect(generateAccessPin(scripted(4_293_999_998))).toBe("999998");
  });
});

describe("the six-digit rule for a PIN the desk types", () => {
  it("accepts six digits, leading zeros included, or blank (a PIN is generated)", () => {
    for (const ok of ["", "   ", "012345", "482913", " 482913 "]) expect(accessPinProblem(ok)).toBeNull();
  });

  it("explains anything else", () => {
    for (const bad of ["AB12CD34", "12345", "1234567", "12 345", "12345a", "١٢٣٤٥٦"]) {
      expect(accessPinProblem(bad)).toMatch(/exactly 6 digits/);
    }
  });

  it("keeps only digits, at most six, as the field is typed or pasted", () => {
    expect(normalizeAccessPin("AB12CD34")).toBe("1234");
    expect(normalizeAccessPin("12-34-56-78")).toBe("123456");
    expect(normalizeAccessPin("012345")).toBe("012345");
    expect(normalizeAccessPin("١٢٣٤٥٦")).toBe("");
    expect(isAccessPin(normalizeAccessPin(" 0 4 8 2 9 1 3"))).toBe(true);
  });
});

describe("entering a room", () => {
  it("needs six digits for a PIN", () => {
    expect(roomEntryCodeReady("482913", false)).toBe(true);
    expect(roomEntryCodeReady("012345", false)).toBe(true);
    for (const code of ["", "48291", "AB12CD34", "4829130"]) expect(roomEntryCodeReady(code, false)).toBe(false);
  });

  it("still takes a code issued before PINs were six digits", () => {
    expect(roomEntryCodeReady("AB12CD34", true)).toBe(true);
    expect(roomEntryCodeReady("QC-104293", true)).toBe(true);
    expect(roomEntryCodeReady("  ", true)).toBe(false);
    expect(roomEntryCodeReady("x".repeat(OLDER_ACCESS_CODE_MAX_LENGTH + 1), true)).toBe(false);
  });
});

describe("one PIN generator", () => {
  it("no other source file mints a PIN or access code of its own", () => {
    const src = fileURLToPath(new URL("../..", import.meta.url));
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          if (name !== "__tests__" && name !== "node_modules") walk(path);
        } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) {
          files.push(path);
        }
      }
    };
    walk(src);
    const offenders: string[] = [];
    for (const path of files) {
      const where = relative(src, path);
      if (where === join("lib", "roomPin.ts")) continue;
      const source = readFileSync(path, "utf8");
      // A function named like a PIN/access-code generator, or the old panel's alphabet.
      for (const match of source.matchAll(/function\s+(generate\w*(?:Pin|Passcode|AccessCode|ShareCode)\w*)\s*\(/g)) {
        if (match[1] !== "generateShareCode") offenders.push(`${where}: ${match[1]}`);
      }
      if (source.includes("ABCDEFGHJKLMNPQRSTUVWXYZ23456789")) offenders.push(`${where}: old code alphabet`);
    }
    expect(offenders).toEqual([]);
  });
});
