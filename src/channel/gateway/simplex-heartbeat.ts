import type { ChannelPlugin } from "openclaw/plugin-sdk/channel-core";
import { resolveSimplexAccount } from "../../config/accounts.js";
import { hasActiveSimplexClient } from "../../simplex/runtime/transport.js";

export function buildSimplexHeartbeat(): NonNullable<ChannelPlugin["heartbeat"]> {
  return {
    checkReady: async ({ cfg, accountId }) => {
      const account = resolveSimplexAccount({ cfg, accountId });
      if (!account.enabled) {
        return { ok: false as const, reason: "simplex-disabled" as const };
      }
      if (!account.configured) {
        return { ok: false as const, reason: "simplex-not-configured" as const };
      }
      if (!hasActiveSimplexClient(account.accountId)) {
        return { ok: false as const, reason: "simplex-not-running" as const };
      }
      return { ok: true as const, reason: "ok" as const };
    },
  };
}
