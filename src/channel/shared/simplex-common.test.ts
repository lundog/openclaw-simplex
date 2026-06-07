import { describe, expect, it } from "vitest";
import { looksLikeSimplexExplicitTarget, parseSimplexExplicitTarget } from "./simplex-common.js";

describe("simplex target parsing", () => {
  it("recognizes explicit target forms without directory lookup", () => {
    for (const input of [
      "@1",
      "#2",
      "!3",
      "contact:4",
      "group:5",
      "channel:6",
      "openclaw-simplex:7",
      "simplex:8",
    ]) {
      expect(looksLikeSimplexExplicitTarget(input), input).toBe(true);
    }
  });

  it("keeps bare names out of explicit target parsing", () => {
    expect(looksLikeSimplexExplicitTarget("Alice")).toBe(false);
    expect(parseSimplexExplicitTarget("Alice")).toBeNull();
  });

  it("normalizes provider-prefixed direct ids", () => {
    expect(parseSimplexExplicitTarget("openclaw-simplex:4")).toEqual({
      to: "@4",
      chatType: "direct",
    });
    expect(parseSimplexExplicitTarget("simplex:4")).toEqual({
      to: "@4",
      chatType: "direct",
    });
  });
});
