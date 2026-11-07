import { describe, expect, it, vi } from "vitest";
import { focusSheetInput, isValidSheetDate } from "../inputEditing";

describe("worksheet editor focus", () => {
  it.each(["date", "number", "email", "time", "month", "week", "datetime-local", "checkbox"])("focuses %s without invoking unsupported selection methods", (type) => {
    const input = { type, value: "2026-07-03", focus: vi.fn(), select: vi.fn(() => { throw new Error("Unsupported selection"); }), setSelectionRange: vi.fn(() => { throw new Error("Unsupported range"); }) };
    focusSheetInput(input as unknown as HTMLInputElement, null);
    focusSheetInput(input as unknown as HTMLInputElement, "2");
    expect(input.focus).toHaveBeenCalledTimes(2); expect(input.select).not.toHaveBeenCalled(); expect(input.setSelectionRange).not.toHaveBeenCalled();
  });
  it.each(["text", "search", "tel", "url", "password"])("preserves selection and seeded caret behavior for %s", (type) => {
    const input = { type, value: "12.34", focus: vi.fn(), select: vi.fn(), setSelectionRange: vi.fn() };
    focusSheetInput(input as unknown as HTMLInputElement, null);
    expect(input.select).toHaveBeenCalledOnce(); expect(input.setSelectionRange).not.toHaveBeenCalled();
    focusSheetInput(input as unknown as HTMLInputElement, "1");
    expect(input.setSelectionRange).toHaveBeenCalledExactlyOnceWith(5, 5);
  });
});

describe("worksheet date commits", () => {
  it.each(["", "2026-07-03", "2024-02-29", "2000-02-29", "0001-01-01"])("accepts a valid calendar date or explicit clear: %s", (value) => expect(isValidSheetDate(value)).toBe(true));
  it.each(["2", "2026-", "2023-02-29", "1900-02-29", "2026-04-31", "2026-00-03", "2026-13-03", "2026-07-00", "0000-01-01", "07/03/2026", "2026-7-3", "2026-07-03T00:00:00Z", " "])("rejects an incomplete or invalid date without rollover: %s", (value) => expect(isValidSheetDate(value)).toBe(false));
  it("distinguishes an incomplete native date segment from an intentional blank", () => {
    expect(isValidSheetDate("", true)).toBe(false);
    expect(isValidSheetDate("", false)).toBe(true);
  });
});
