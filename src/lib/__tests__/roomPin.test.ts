import { describe, expect, it } from "vitest";
import { chosenRoomPinProblem } from "../roomPin";

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
