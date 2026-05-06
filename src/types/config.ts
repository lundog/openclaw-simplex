import type { SimplexAccountConfig } from "../config/config-schema.js";

export type SimplexConnectionConfig = {
  mode?: "external";
  wsUrl?: string;
  wsHost?: string;
  wsPort?: number;
  allowUnsafeRemoteWs?: boolean;
  autoAcceptFiles?: boolean;
  connectTimeoutMs?: number;
};

export type ResolvedSimplexAccount = {
  accountId: string;
  enabled: boolean;
  name?: string;
  configured: boolean;
  mode: "external";
  wsUrl: string;
  wsHost: string;
  wsPort: number;
  config: SimplexAccountConfig;
};
