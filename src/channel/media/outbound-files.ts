import { randomUUID } from "node:crypto";
import { copyFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { SIMPLEX_CHANNEL_ID } from "../../constants.js";
import type { SimplexComposedMessage } from "../../types/simplex.js";

/**
 * Shared outbound directory support.
 *
 * When OpenClaw and simplex-chat run in separate containers, they exchange
 * files through a shared volume rather than a shared filesystem.
 * For example:
 *
 *   /simplex/inbound   files received by the bot (readable by OpenClaw)
 *   /simplex/outbound  files OpenClaw writes for the bot to send
 *
 * If `files.outboundDir` is configured for this channel, outbound media is
 * written there before the send command is issued, so the path in
 * `fileSource.filePath` is readable by simplex-chat. Files staged by this
 * module are tracked and deleted after the send completes.
 *
 * If `files.outboundDir` is not configured, the legacy single-filesystem
 * behavior applies and this module is inert.
 */

const STAGED_FILES = new Set<string>();

export function resolveSimplexOutboundDir(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): string | undefined {
  const channel = params.cfg.channels?.[SIMPLEX_CHANNEL_ID];
  const account = params.accountId ? channel?.accounts?.[params.accountId] : undefined;
  return account?.files?.outboundDir ?? channel?.files?.outboundDir;
}

/**
 * Whether a local path is already readable by simplex-chat without staging
 * (it lives in the shared outbound dir).
 */
export function isSimplexReadablePath(filePath: string, outboundDir: string): boolean {
  return filePath.startsWith(outboundDir.endsWith(path.sep) ? outboundDir : outboundDir + path.sep);
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
 * Call after the send completes. Only files staged by this module are
 * deleted; pre-existing files in the outbound dir are left alone.
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
