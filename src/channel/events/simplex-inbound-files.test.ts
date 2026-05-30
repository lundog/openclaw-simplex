import type { PluginRuntime } from "openclaw/plugin-sdk/runtime-store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setSimplexRuntime } from "../runtime.js";
import { dispatchInbound, type PendingInboundFile } from "./simplex-inbound-files.js";

const simplexClientMock = vi.hoisted(() => ({
  sendMessages: vi.fn(async () => [{ chatItem: { meta: { itemId: 123 } } }]),
  editMessage: vi.fn(async () => ({})),
}));

vi.mock("../../simplex/runtime/transport.js", () => ({
  withSimplexClient: vi.fn(async ({ run }) => run(simplexClientMock)),
}));

function installRuntime(
  dispatch: (params: {
    dispatcherOptions: {
      deliver: (payload: { text?: string }, info: { kind: "block" | "final" }) => Promise<void>;
    };
    replyOptions?: {
      onPartialReply?: (payload: { text?: string }) => Promise<void> | void;
      disableBlockStreaming?: boolean;
    };
  }) => Promise<void>
): void {
  setSimplexRuntime({
    channel: {
      session: {
        recordInboundSession: vi.fn(async () => undefined),
      },
      reply: {
        dispatchReplyWithBufferedBlockDispatcher: vi.fn(dispatch),
      },
    },
  } as unknown as PluginRuntime);
}

function pending(sendPayload = vi.fn(async () => undefined)): PendingInboundFile {
  return {
    fileId: -1,
    chatRef: "@123",
    replyToId: 99,
    ctxPayload: { SessionKey: "simplex:direct:123" },
    storePath: "/tmp/simplex.jsonl",
    sessionKey: "simplex:direct:123",
    account: {
      accountId: "default",
      enabled: true,
      configured: true,
      mode: "external",
      wsUrl: "ws://127.0.0.1:5225",
      wsHost: "127.0.0.1",
      wsPort: 5225,
      config: {
        connection: { wsUrl: "ws://127.0.0.1:5225" },
        streaming: {
          nativeTransport: true,
          throttleMs: 1,
          minChars: 1,
          wordBoundary: false,
        },
      },
    },
    cfg: {},
    runtime: { error: vi.fn(), log: vi.fn(), exit: vi.fn() },
    client: {} as PendingInboundFile["client"],
    sendPayload,
  };
}

describe("simplex inbound live replies", () => {
  afterEach(() => {
    simplexClientMock.sendMessages.mockClear();
    simplexClientMock.editMessage.mockClear();
  });

  it("routes partial, block, and final assistant text through one SimpleX live message", async () => {
    const sendPayload = vi.fn(async () => undefined);
    installRuntime(async ({ dispatcherOptions, replyOptions }) => {
      expect(replyOptions?.disableBlockStreaming).toBe(true);
      await replyOptions?.onPartialReply?.({ text: "hello" });
      await dispatcherOptions.deliver({ text: "hello world" }, { kind: "block" });
      await dispatcherOptions.deliver({ text: "hello world!" }, { kind: "final" });
    });

    await dispatchInbound({ pending: pending(sendPayload) });

    expect(sendPayload).not.toHaveBeenCalled();
    expect(simplexClientMock.sendMessages).toHaveBeenCalledTimes(1);
    expect(simplexClientMock.sendMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        chatRef: "@123",
        liveMessage: true,
      })
    );
    expect(simplexClientMock.editMessage).toHaveBeenCalledTimes(2);
    expect(simplexClientMock.editMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ messageId: "123", liveMessage: true })
    );
    expect(simplexClientMock.editMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ messageId: "123", liveMessage: false })
    );
  });
});
