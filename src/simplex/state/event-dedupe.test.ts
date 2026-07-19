import type { PluginRuntime } from "openclaw/plugin-sdk/runtime-store";
import { beforeEach, describe, expect, it } from "vitest";
import { setSimplexRuntime } from "../../channel/runtime.js";
import { hasSimplexEventBeenSeen, markSimplexEventSeen } from "./event-dedupe.js";

function key(messageId: number) {
  return { accountId: `acct-${messageId}`, chatId: 7, messageId };
}

describe("simplex event dedupe", () => {
  beforeEach(() => {
    // No `state` on the runtime, so the keyed store falls back to memory.
    setSimplexRuntime({} as object as Partial<PluginRuntime> as PluginRuntime);
  });

  it("does not treat an event as seen until it is marked", async () => {
    const event = key(1001);
    expect(await hasSimplexEventBeenSeen(event)).toBe(false);
    // Checking twice must stay false: a crash before the mark has to replay.
    expect(await hasSimplexEventBeenSeen(event)).toBe(false);

    await markSimplexEventSeen(event);
    expect(await hasSimplexEventBeenSeen(event)).toBe(true);
  });

  it("scopes seen state per account, chat, and message", async () => {
    await markSimplexEventSeen(key(1002));
    expect(await hasSimplexEventBeenSeen(key(1002))).toBe(true);
    expect(await hasSimplexEventBeenSeen(key(1003))).toBe(false);
    expect(
      await hasSimplexEventBeenSeen({ accountId: "acct-1002", chatId: 8, messageId: 1002 })
    ).toBe(false);
  });

  it("treats events without a message id as never seen", async () => {
    expect(await hasSimplexEventBeenSeen(null)).toBe(false);
    await expect(markSimplexEventSeen(null)).resolves.toBeUndefined();
  });
});
