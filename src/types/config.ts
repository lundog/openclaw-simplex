import type { SimplexAccountConfig } from "../config/config-schema.js";

export type SimplexConnectionMode = "external" | "native";

/** Fully-resolved bot profile applied to the embedded native user. */
export type SimplexBotProfile = {
  displayName: string;
  fullName: string;
  /** base64 data URI, or undefined for no avatar. */
  image?: string;
  peerType: "bot" | "human";
};

export type SimplexNativeDbConfig = {
  type?: "sqlite";
  filePrefix: string;
  encryptionKey?: string;
};

export type SimplexNativeProfileConfig = {
  displayName?: string;
  fullName?: string;
  /** Avatar: data URI, http(s) URL, or local file path. Converted to a base64 data URI. */
  image?: string;
  /** SimpleX peer type shown to contacts. Defaults to "bot" when omitted. */
  peerType?: "bot" | "human";
};

export type SimplexNativeAddressSettings = {
  autoAccept?: boolean;
  welcomeMessage?: string;
  businessAddress?: boolean;
};

/**
 * Custom SMP/XFTP servers for native mode (experimental). Each entry is a full
 * server URI, e.g. `smp://<fingerprint>@host` / `xftp://<fingerprint>@host`.
 */
export type SimplexNativeServersConfig = {
  smp?: string[];
  xftp?: string[];
};

export type SimplexConnectionConfig = {
  mode?: SimplexConnectionMode;
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
  // native mode (embedded simplex-chat core)
  db?: SimplexNativeDbConfig;
  profile?: SimplexNativeProfileConfig;
  addressSettings?: SimplexNativeAddressSettings;
  servers?: SimplexNativeServersConfig;
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
  mode: SimplexConnectionMode;
  wsUrl: string;
  wsHost: string;
  wsPort: number;
  // present when mode === "native"
  db?: SimplexNativeDbConfig;
  profile?: SimplexNativeProfileConfig;
  addressSettings?: SimplexNativeAddressSettings;
  servers?: SimplexNativeServersConfig;
  config: SimplexAccountConfig;
};
