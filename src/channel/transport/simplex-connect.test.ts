import type { RuntimeEnv } from "openclaw/plugin-sdk/runtime-env";
import { describe, expect, it, vi } from "vitest";
import type { SimplexClient } from "../../simplex/runtime/client.js";
import { connectSimplexWithRetry } from "./simplex-connect.js";

describe("connectSimplexWithRetry", () => {
  it("keeps retrying by default until the SimpleX runtime becomes reachable", async () => {
    const messages: string[] = [];
    let attempts = 0;
    const client = {
      async connect() {
        attempts += 1;
        if (attempts < 3) {
          throw new Error("runtime unavailable");
        }
      },
    } as unknown as SimplexClient;

    await connectSimplexWithRetry({
      client,
      runtime: {
        log() {},
        error: (message: string) => messages.push(message),
        exit() {
          throw new Error("unexpected exit");
        },
      } as unknown as RuntimeEnv,
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
    const client = {
      async connect() {
        throw new Error("runtime unavailable");
      },
    } as unknown as SimplexClient;

    await expect(
      connectSimplexWithRetry({
        client,
        runtime: {
          log() {},
          error() {},
          exit() {
            throw new Error("unexpected exit");
          },
        } as unknown as RuntimeEnv,
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
    const client = {
      async connect() {
        abortController.abort();
        throw new Error("runtime unavailable");
      },
    } as unknown as SimplexClient;

    await expect(
      connectSimplexWithRetry({
        client,
        runtime: {
          log() {},
          error,
          exit() {
            throw new Error("unexpected exit");
          },
        } as unknown as RuntimeEnv,
        accountId: "default",
        abortSignal: abortController.signal,
        baseDelayMs: 0,
        maxDelayMs: 0,
      })
    ).rejects.toThrow("SimpleX connect aborted");

    expect(error).not.toHaveBeenCalled();
  });
});
