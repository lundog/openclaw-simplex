import type { SimplexAccountConfig } from "../config/config-schema.js";

export type SimplexConnectionConfig = {
  mode?: "external";
  wsUrl?: string;
  wsHost?: string;
  wsPort?: number;
  allowUnsafeRemoteWs?: boolean;
  autoAcceptFiles?: boolean;
  /**
   * Files-folder the external runtime stores received files in (its
   * `--files-folder`). Used to resolve relative inbound file paths (the WS API
   * reports received files by name only when a files-folder is set). Defaults to
   * `~/.simplex/files`.
   */
  filesFolder?: string;
  /**
   * Directory writable by OpenClaw and readable by the external runtime (e.g.
   * `/tmp/simplex-outbound`). When set, outbound media is staged here before
   * sending so the path in the send command is valid inside the runtime's
   * container. Both sides must see this path identically (a shared volume
   * mounted verbatim). Unset = legacy single-filesystem behavior (pass the
   * local path directly).
   */
  outboundFolder?: string;
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
