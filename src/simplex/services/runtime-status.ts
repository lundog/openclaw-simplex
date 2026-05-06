import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import {
  readSimplexRuntimeVersion,
  resolveRuntimeAccount,
  withActiveSimplexUser,
} from "../runtime/account.js";
import { getActiveSimplexClient } from "../runtime/transport.js";

export type SimplexRuntimeStatusResult = {
  accountId: string;
  enabled: boolean;
  configured: boolean;
  mode: string;
  wsUrl: string | null;
  runtimeVersion: string | null;
  runtime: {
    activeClient: boolean;
    connected: boolean;
    lastStateAt: number | null;
    expectedDisconnect: boolean | null;
    lastError: string | null;
  };
  activeUser: unknown;
  address: unknown;
  counts: {
    contacts: number;
    groups: number;
    users: number;
  };
};

export async function getSimplexRuntimeStatus(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): Promise<SimplexRuntimeStatusResult> {
  const account = resolveRuntimeAccount(params.cfg, params.accountId);
  const activeClient = getActiveSimplexClient(account.accountId);
  const connection = activeClient?.getConnectionState();
  const details = await withActiveSimplexUser({
    account,
    run: async (userId, client) => {
      const [activeUser, address, contacts, groups, users] = await Promise.all([
        client.getActiveUser(),
        client.getAddress().catch(() => undefined),
        client.listContacts(userId).catch(() => []),
        client.listGroups({ userId }).catch(() => []),
        client.listUsers().catch(() => []),
      ]);
      return { activeUser, address, contacts, groups, users };
    },
  });

  return {
    accountId: account.accountId,
    enabled: account.enabled,
    configured: account.configured,
    mode: account.mode,
    wsUrl: account.wsUrl ?? null,
    runtimeVersion: readSimplexRuntimeVersion(),
    runtime: {
      activeClient: Boolean(activeClient),
      connected: connection?.connected ?? true,
      lastStateAt: connection?.at ?? null,
      expectedDisconnect: connection?.expected ?? null,
      lastError: connection?.error ?? null,
    },
    activeUser: details.activeUser ?? null,
    address: details.address ?? null,
    counts: {
      contacts: details.contacts.length,
      groups: details.groups.length,
      users: details.users.length,
    },
  };
}

export async function doctorSimplexRuntime(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): Promise<SimplexRuntimeStatusResult & { ok: boolean; issues: string[] }> {
  const status = await getSimplexRuntimeStatus(params);
  const issues: string[] = [];
  if (!status.configured) {
    issues.push("SimpleX account is not configured.");
  }
  if (!status.activeUser) {
    issues.push("SimpleX runtime has no active user profile.");
  }
  if (status.runtime.lastError) {
    issues.push(`SimpleX runtime error: ${status.runtime.lastError}`);
  }
  return { ...status, ok: issues.length === 0, issues };
}
