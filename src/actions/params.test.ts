import { describe, expect, it } from "vitest";
import { readNumberParam } from "./params.js";

describe("simplex action params", () => {
  it("strictly parses integer params", () => {
    expect(readNumberParam({ messageId: "123" }, "messageId", { integer: true })).toBe(123);
    expect(readNumberParam({ messageId: 123 }, "messageId", { integer: true })).toBe(123);
  });

  it("rejects partial or decimal integer params", () => {
    expect(() => readNumberParam({ messageId: "123abc" }, "messageId", { integer: true })).toThrow(
      /messageId must be an integer/
    );
    expect(() => readNumberParam({ messageId: "12.5" }, "messageId", { integer: true })).toThrow(
      /messageId must be an integer/
    );
    expect(() => readNumberParam({ messageId: 12.5 }, "messageId", { integer: true })).toThrow(
      /messageId must be an integer/
    );
  });

  it("strictly parses decimal number params", () => {
    expect(readNumberParam({ score: "12.5" }, "score")).toBe(12.5);
    expect(() => readNumberParam({ score: "12.5ms" }, "score")).toThrow(/score must be a number/);
  });
});
