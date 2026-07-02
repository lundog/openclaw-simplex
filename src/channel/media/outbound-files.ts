import { randomUUID } from "node:crypto";
import { copyFile, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { SIMPLEX_CHANNEL_ID } from "../../constants.js";
import type { SimplexComposedMessage } from "../../types/simplex.js";

/**
 * Shared outbound directory support (external mode, containerized runtime).
 *
 * When the SimpleX runtime runs in a container, it has a filesystem separate
 * from OpenClaw's (whether or not OpenClaw is itself containerized), so they
 * exchange files through a shared volume rather than a shared filesystem. On
 * send, the path in `fileSource.filePath` is resolved by the *runtime*, so it
 * must be valid on the runtime's side. If `connection.outboundFolder` is set,
 * outbound media is staged there before the send command is issued; both sides
 * must see that path identically (a shared volume mounted verbatim, e.g.
 * `/tmp/simplex-outbound`).
 *
 * Staged files are tracked and deleted after the send completes. When
 * `outboundFolder` is unset, this module is inert and the legacy
 * single-filesystem behavior applies (the local path is passed as-is). Native
 * mode never sets it (the embedded core shares the gateway's filesystem).
 */

const STAGED_FILES = new Set<string>();

function expandHome(value: string): string {
  if (value === "~") {
    return os.homedir();
  }
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

/**
 * The configured shared outbound directory for this channel/account, or
 * undefined when the feature is disabled. Account config overrides channel.
 */
export function resolveSimplexOutboundDir(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): string | undefined {
  const channel = params.cfg.channels?.[SIMPLEX_CHANNEL_ID];
  const account = params.accountId ? channel?.accounts?.[params.accountId] : undefined;
  const configured =
    account?.connection?.outboundFolder?.trim() || channel?.connection?.outboundFolder?.trim();
  return configured ? expandHome(configured) : undefined;
}

/**
 * Whether a local path is already readable by the runtime without staging
 * (it already lives inside the shared outbound dir).
 */
export function isSimplexReadablePath(filePath: string, outboundDir: string): boolean {
  const prefix = outboundDir.endsWith(path.sep) ? outboundDir : outboundDir + path.sep;
  return filePath.startsWith(prefix);
}

function stagedFileName(fileName?: string): string {
  const base = fileName ? path.basename(fileName) : "";
  return base ? `${randomUUID()}-${base}` : randomUUID();
}

/** Write a media buffer into the shared outbound dir; returns the staged path. */
export async function stageOutboundBuffer(params: {
  outboundDir: string;
  buffer: Uint8Array;
  fileName?: string;
}): Promise<string> {
  const filePath = path.join(params.outboundDir, stagedFileName(params.fileName));
  await writeFile(filePath, params.buffer);
  STAGED_FILES.add(filePath);
  return filePath;
}

/** Copy a local file into the shared outbound dir; returns the staged path. */
export async function stageOutboundLocalFile(params: {
  outboundDir: string;
  sourcePath: string;
}): Promise<string> {
  const filePath = path.join(params.outboundDir, stagedFileName(params.sourcePath));
  await copyFile(params.sourcePath, filePath);
  STAGED_FILES.add(filePath);
  return filePath;
}

/**
 * Delete any staged outbound files referenced by the given composed messages.
 * Call after the send completes. Only files staged by this module are deleted;
 * pre-existing files in the outbound dir are left alone.
 */
export async function cleanupStagedOutboundFiles(
  composedMessages: SimplexComposedMessage[]
): Promise<void> {
  for (const message of composedMessages) {
    const filePath = message.fileSource?.filePath;
    if (filePath && STAGED_FILES.has(filePath)) {
      STAGED_FILES.delete(filePath);
      await unlink(filePath).catch(() => {
        // Best-effort: the file may already be gone.
      });
    }
  }
}
