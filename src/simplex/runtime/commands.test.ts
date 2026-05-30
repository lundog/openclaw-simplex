import { describe, expect, it } from "vitest";
import {
  buildDeleteChatItemCommand,
  buildSendMessagesCommand,
  buildUpdateChatItemCommand,
  parseSimplexNumericId,
} from "./commands.js";

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
    expect(parseSimplexNumericId(12.5)).toBeNull();
  });

  it("builds live and ttl send commands", () => {
    expect(
      buildSendMessagesCommand({
        chatRef: "@123",
        liveMessage: true,
        ttl: 60,
        composedMessages: [{ msgContent: { type: "text", text: "hello" } }],
      })
    ).toBe('/_send @123 live=on ttl=60 json [{"msgContent":{"type":"text","text":"hello"}}]');
  });

  it("builds live update commands and rejects partial item ids", () => {
    expect(
      buildUpdateChatItemCommand({
        chatRef: "@123",
        chatItemId: "456",
        liveMessage: true,
        updatedMessage: { msgContent: { type: "text", text: "done" } },
      })
    ).toBe('/_update item @123 456 live=on json {"msgContent":{"type":"text","text":"done"}}');

    expect(() =>
      buildDeleteChatItemCommand({
        chatRef: "@123",
        chatItemIds: ["456abc"],
      })
    ).toThrow("invalid SimpleX chat item id");
  });
});
