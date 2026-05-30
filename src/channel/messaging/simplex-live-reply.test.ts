import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResolvedSimplexAccount } from "../../types/config.js";
import { createSimplexLiveReplyController } from "./simplex-send.js";

const simplexClientMock = vi.hoisted(() => ({
  sendMessages: vi.fn(async () => [{ chatItem: { meta: { itemId: 10 } } }]),
  editMessage: vi.fn(async () => ({})),
}));

vi.mock("../../simplex/runtime/transport.js", () => ({
  withSimplexClient: vi.fn(async ({ run }) => run(simplexClientMock)),
}));

function account(streaming: ResolvedSimplexAccount["config"]["streaming"]): ResolvedSimplexAccount {
  return {
    accountId: "default",
    enabled: true,
    configured: true,
    mode: "external",
    wsUrl: "ws://127.0.0.1:5225",
    wsHost: "127.0.0.1",
    wsPort: 5225,
    config: {
      connection: { wsUrl: "ws://127.0.0.1:5225" },
      streaming,
    },
  };
}

describe("simplex live reply controller", () => {
  afterEach(() => {
    simplexClientMock.sendMessages.mockClear();
    simplexClientMock.editMessage.mockClear();
  });

  it("does nothing when native live transport is disabled", async () => {
    const live = createSimplexLiveReplyController({
      cfg: {},
      account: account({ nativeTransport: false }),
      chatRef: "@123",
    });

    await expect(live.updatePartial({ text: "hello world" })).resolves.toBe(false);
    expect(simplexClientMock.sendMessages).not.toHaveBeenCalled();
    expect(simplexClientMock.editMessage).not.toHaveBeenCalled();
  });

  it("sends one live message, throttles updates, and finalizes in place", async () => {
    let now = 1_000;
    const live = createSimplexLiveReplyController({
      cfg: {},
      account: account({
        nativeTransport: true,
        throttleMs: 1_000,
        minChars: 5,
        wordBoundary: false,
      }),
      chatRef: "@123",
      replyToId: 99,
      now: () => now,
    });

    await expect(live.updatePartial({ text: "hello" })).resolves.toBe(true);
    expect(simplexClientMock.sendMessages).toHaveBeenCalledWith({
      chatRef: "@123",
      composedMessages: [
        {
          msgContent: { type: "text", text: "hello" },
          quotedItemId: 99,
          mentions: {},
        },
      ],
      liveMessage: true,
      ttl: undefined,
    });

    now = 1_500;
    await expect(live.updatePartial({ text: "hello!" })).resolves.toBe(true);
    expect(simplexClientMock.editMessage).not.toHaveBeenCalled();

    now = 2_100;
    await expect(live.updatePartial({ text: "hello world" })).resolves.toBe(true);
    expect(simplexClientMock.editMessage).toHaveBeenCalledWith({
      chatRef: "@123",
      messageId: "10",
      updatedMessage: {
        msgContent: { type: "text", text: "hello world" },
        quotedItemId: undefined,
        mentions: {},
      },
      liveMessage: true,
    });

    await expect(live.finalize({ text: "hello world!" })).resolves.toBe(true);
    expect(simplexClientMock.editMessage).toHaveBeenLastCalledWith({
      chatRef: "@123",
      messageId: "10",
      updatedMessage: {
        msgContent: { type: "text", text: "hello world!" },
        quotedItemId: undefined,
        mentions: {},
      },
      liveMessage: false,
    });
  });

  it("falls back when a live update fails", async () => {
    const errors: string[] = [];
    simplexClientMock.editMessage.mockRejectedValueOnce(new Error("update failed"));
    const live = createSimplexLiveReplyController({
      cfg: {},
      account: account({ nativeTransport: true, throttleMs: 1, minChars: 1, wordBoundary: false }),
      chatRef: "@123",
      now: () => 10_000,
      logError: (message) => errors.push(message),
    });

    await expect(live.updatePartial({ text: "hello" })).resolves.toBe(true);
    await expect(live.updatePartial({ text: "hello world" })).resolves.toBe(false);
    await expect(live.finalize({ text: "hello world!" })).resolves.toBe(false);
    expect(errors.join("\n")).toContain("update failed");
  });
});
