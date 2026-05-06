import { describe, expect, it } from "vitest";
import type { ResolvedSimplexAccount } from "../../types/config.js";
import { simplexPlugin } from "../plugin.js";
import { buildSimplexStatus } from "./simplex-status.js";

function account(overrides: Partial<ResolvedSimplexAccount> = {}): ResolvedSimplexAccount {
  return {
    accountId: "default",
    enabled: true,
    configured: true,
    mode: "external",
    wsUrl: "ws://127.0.0.1:5225",
    wsHost: "127.0.0.1",
    wsPort: 5225,
    config: {
      connection: {
        wsHost: "127.0.0.1",
        wsPort: 5225,
      },
    },
    ...overrides,
  };
}

describe("simplex status adapter", () => {
  it("falls back to resolved account configuration for channel summaries", async () => {
    const summary = await buildSimplexStatus().buildChannelSummary?.({
      account: account(),
      cfg: { channels: {} },
      defaultAccountId: "default",
      snapshot: {
        accountId: "default",
        running: false,
        connected: false,
      },
    });

    expect(summary).toMatchObject({
      configured: true,
      running: false,
      connected: false,
      healthState: "ready",
      mode: "external",
      wsUrl: "ws://127.0.0.1:5225",
    });
  });

  it("does not expose raw account config through inspectAccount", () => {
    expect(simplexPlugin.config.inspectAccount).toBeUndefined();
  });
});
