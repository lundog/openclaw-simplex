import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { describe, expect, it } from "vitest";
import { buildSimplexHeartbeat } from "./simplex-heartbeat.js";

describe("simplex heartbeat adapter", () => {
  it("reports not configured accounts as not ready", async () => {
    const heartbeat = buildSimplexHeartbeat();

    await expect(
      heartbeat.checkReady?.({
        cfg: { channels: {} } as OpenClawConfig,
      })
    ).resolves.toEqual({
      ok: false,
      reason: "simplex-not-configured",
    });
  });

  it("reports configured but stopped accounts as not running", async () => {
    const heartbeat = buildSimplexHeartbeat();

    await expect(
      heartbeat.checkReady?.({
        cfg: {
          channels: {
            "openclaw-simplex": {
              connection: { wsUrl: "ws://127.0.0.1:5225" },
            },
          },
        } as OpenClawConfig,
      })
    ).resolves.toEqual({
      ok: false,
      reason: "simplex-not-running",
    });
  });

  it("does not expose removed heartbeat recipient resolution hooks", () => {
    expect(buildSimplexHeartbeat()).not.toHaveProperty("resolveRecipients");
  });
});
