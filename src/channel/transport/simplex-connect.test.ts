import type { RuntimeEnv } from "openclaw/plugin-sdk/runtime-env";
import { describe, expect, it, vi } from "vitest";
import type { SimplexClient } from "../../simplex/runtime/client.js";
import { connectSimplexWithRetry } from "./simplex-connect.js";

function simplexClient(connect: () => Promise<void>): SimplexClient {
  return { connect } as SimplexClient;
}

function runtimeEnv(params: {
  messages?: string[];
  error?: (message: string) => void;
}): RuntimeEnv {
  return {
    log() {},
    error: (...args: unknown[]) => {
      const message = args[0];
      if (typeof message === "string") {
        if (params.error) {
          params.error(message);
        } else {
          params.messages?.push(message);
        }
      }
    },
    exit() {
      throw new Error("unexpected exit");
    },
  };
}

describe("connectSimplexWithRetry", () => {
  it("keeps retrying by default until the SimpleX runtime becomes reachable", async () => {
    const messages: string[] = [];
    let attempts = 0;
    const client = simplexClient(async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error("runtime unavailable");
      }
    });

    await connectSimplexWithRetry({
      client,
      runtime: runtimeEnv({ messages }),
      accountId: "default",
      abortSignal: new AbortController().signal,
      baseDelayMs: 0,
      maxDelayMs: 0,
    });

    expect(attempts).toBe(3);
    expect(messages).toEqual([
      "[default] SimpleX connect failed (attempt 1/unbounded): Error: runtime unavailable; retrying in 0ms",
      "[default] SimpleX connect failed (attempt 2/unbounded): Error: runtime unavailable; retrying in 0ms",
    ]);
  });

  it("still honors an explicit finite attempt budget", async () => {
    const client = simplexClient(async () => {
      throw new Error("runtime unavailable");
    });

    await expect(
      connectSimplexWithRetry({
        client,
        runtime: runtimeEnv({}),
        accountId: "default",
        abortSignal: new AbortController().signal,
        attempts: 2,
        baseDelayMs: 0,
        maxDelayMs: 0,
      })
    ).rejects.toThrow("runtime unavailable");
  });

  it("stops immediately when abort happens during a failed connect attempt", async () => {
    const abortController = new AbortController();
    const error = vi.fn();
    const client = simplexClient(async () => {
      abortController.abort();
      throw new Error("runtime unavailable");
    });

    await expect(
      connectSimplexWithRetry({
        client,
        runtime: runtimeEnv({ error }),
        accountId: "default",
        abortSignal: abortController.signal,
        baseDelayMs: 0,
        maxDelayMs: 0,
      })
    ).rejects.toThrow("SimpleX connect aborted");

    expect(error).not.toHaveBeenCalled();
  });
});
