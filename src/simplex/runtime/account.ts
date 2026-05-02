import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { resolveDefaultSimplexAccountId, resolveSimplexAccount } from "../../config/accounts.js";
import type { ResolvedSimplexAccount } from "../../types/config.js";
import type { SimplexLogger } from "../../types/simplex.js";
import type { SimplexClient } from "./client.js";
import { withSimplexClient } from "./transport.js";

export function resolveRuntimeAccount(
  cfg: OpenClawConfig,
  rawAccountId?: string | null
): ResolvedSimplexAccount {
  const explicit = rawAccountId?.trim();
  const accountId = explicit || resolveDefaultSimplexAccountId(cfg);
  const account = resolveSimplexAccount({ cfg, accountId });
  if (!account.enabled) {
    throw new Error(`SimpleX account "${accountId}" is disabled`);
  }
  if (!account.configured) {
    throw new Error(`SimpleX account "${accountId}" is not configured`);
  }
  return account;
}

export async function withActiveSimplexUser<T>(params: {
  account: ResolvedSimplexAccount;
  logger?: SimplexLogger;
  run: (userId: number, client: SimplexClient) => Promise<T>;
}): Promise<T> {
  return await withSimplexClient({
    account: params.account,
    logger: params.logger,
    run: async (client) => {
      const user = (await client.getActiveUser()) as Record<string, unknown> | undefined;
      const userId = typeof user?.userId === "number" ? user.userId : Number(user?.userId);
      if (!Number.isFinite(userId)) {
        throw new Error(`SimpleX account "${params.account.accountId}" has no active user`);
      }
      return await params.run(Math.trunc(userId), client);
    },
  });
}

export function readSimplexRuntimeVersion(): string | null {
  return null;
}
