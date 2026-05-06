import { describe, expect, it } from "vitest";
import { parseSimplexNumericId } from "./commands.js";

describe("simplex command helpers", () => {
  it("parses numeric ids from SimpleX target forms", () => {
    expect(parseSimplexNumericId(123)).toBe(123);
    expect(parseSimplexNumericId("@123")).toBe(123);
    expect(parseSimplexNumericId("#123")).toBe(123);
    expect(parseSimplexNumericId("contact:123")).toBe(123);
    expect(parseSimplexNumericId("group:123")).toBe(123);
  });

  it("rejects partial numeric ids", () => {
    expect(parseSimplexNumericId("123abc")).toBeNull();
    expect(parseSimplexNumericId("contact:123abc")).toBeNull();
    expect(parseSimplexNumericId("@abc")).toBeNull();
  });
});
