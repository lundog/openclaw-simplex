import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk/account-id";
import type { ChannelPlugin } from "openclaw/plugin-sdk/channel-core";
import { SIMPLEX_CHANNEL_ID } from "../../constants.js";
import { describeSimplexWsEndpointSecurity } from "../../simplex/runtime/security.js";
import type { ResolvedSimplexAccount } from "../../types/config.js";
import { resolveSimplexHealthState } from "../shared/simplex-common.js";

export function buildSimplexStatus(): NonNullable<ChannelPlugin<ResolvedSimplexAccount>["status"]> {
  return {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    collectStatusIssues: (accounts) =>
      accounts.flatMap((account) => {
        const issues = [];
        const lastError = typeof account.lastError === "string" ? account.lastError.trim() : "";
        if (lastError) {
          issues.push({
            channel: SIMPLEX_CHANNEL_ID,
            accountId: account.accountId,
            kind: "runtime" as const,
            message: `Channel error: ${lastError}`,
          });
        }

        const transportWarnings = (
          account.application as { transportWarnings?: unknown } | undefined
        )?.transportWarnings;
        if (Array.isArray(transportWarnings)) {
          for (const warning of transportWarnings) {
            if (typeof warning === "string" && warning.trim()) {
              issues.push({
                channel: SIMPLEX_CHANNEL_ID,
                accountId: account.accountId,
                kind: "runtime" as const,
                message: `Transport warning: ${warning}`,
              });
            }
          }
        }
        return issues;
      }),
    buildChannelSummary: ({ snapshot, account }) => {
      const connection = account.config.connection;
      const configured = snapshot.configured ?? account.configured;
      const running = snapshot.running ?? false;
      const connected = snapshot.connected ?? false;
      const lastError = snapshot.lastError ?? null;
      const security = describeSimplexWsEndpointSecurity(account.wsUrl, {
        allowUnsafeRemoteWs: connection?.allowUnsafeRemoteWs,
      });
      return {
        configured,
        running,
        connected,
        lastStartAt: snapshot.lastStartAt ?? null,
        lastStopAt: snapshot.lastStopAt ?? null,
        lastError,
        lastConnectedAt: snapshot.lastConnectedAt ?? null,
        lastDisconnect: snapshot.lastDisconnect ?? null,
        lastEventAt: snapshot.lastEventAt ?? null,
        healthState:
          security.blockingWarnings.length > 0
            ? "error"
            : resolveSimplexHealthState({
                configured,
                running,
                connected,
                lastError,
              }),
        mode: snapshot.mode ?? account.mode,
        wsUrl: account.wsUrl,
        transportWarnings: security.warnings,
      };
    },
    buildAccountSnapshot: async ({ account, runtime }) => {
      const connection = account.config.connection;
      const security = describeSimplexWsEndpointSecurity(account.wsUrl, {
        allowUnsafeRemoteWs: connection?.allowUnsafeRemoteWs,
      });
      return {
        accountId: account.accountId,
        name: account.name,
        enabled: account.enabled,
        configured: account.configured,
        running: runtime?.running ?? false,
        connected: runtime?.connected ?? false,
        lastStartAt: runtime?.lastStartAt ?? null,
        lastStopAt: runtime?.lastStopAt ?? null,
        lastConnectedAt: runtime?.lastConnectedAt ?? null,
        lastDisconnect: runtime?.lastDisconnect ?? null,
        lastError: runtime?.lastError ?? null,
        healthState:
          security.blockingWarnings.length > 0
            ? "error"
            : resolveSimplexHealthState({
                configured: account.configured,
                running: runtime?.running ?? false,
                connected: runtime?.connected ?? false,
                lastError: runtime?.lastError ?? null,
              }),
        mode: runtime?.mode ?? account.mode,
        lastInboundAt: runtime?.lastInboundAt ?? null,
        lastOutboundAt: runtime?.lastOutboundAt ?? null,
        lastEventAt: runtime?.lastEventAt ?? null,
        application: {
          wsUrl: account.wsUrl,
          transportWarnings: security.warnings,
          transportBlocked: security.blockingWarnings.length > 0,
        },
      };
    },
  };
}
