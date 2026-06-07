import type { SimplexAccountConfig } from "../config/config-schema.js";

export type SimplexConnectionConfig = {
  mode?: "external";
  wsUrl?: string;
  wsHost?: string;
  wsPort?: number;
  allowUnsafeRemoteWs?: boolean;
  autoAcceptFiles?: boolean;
  connectTimeoutMs?: number;
  commandTimeoutMs?: number;
  directoryTimeoutMs?: number;
};

export type SimplexStreamingConfig = {
  nativeTransport?: boolean;
  throttleMs?: number;
  minChars?: number;
  wordBoundary?: boolean;
};

export type SimplexFilePolicyConfig = {
  autoAccept?: boolean;
  maxSizeMb?: number;
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
