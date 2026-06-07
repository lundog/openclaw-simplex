import type { ChannelAccountSnapshot } from "openclaw/plugin-sdk/channel-contract";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import type { RuntimeEnv } from "openclaw/plugin-sdk/runtime-env";
import type { SimplexClient } from "../../simplex/runtime/client.js";
import type { ResolvedSimplexAccount } from "../../types/config.js";
import {
  createSimplexLiveReplyController,
  type SimplexLiveReplyPayload,
} from "../messaging/simplex-send.js";
import { getSimplexRuntime } from "../runtime.js";

const PENDING_FILE_TIMEOUT_MS = 90_000;

type SimplexReplyPayload = {
  text?: string;
  mediaUrl?: string;
  mediaUrls?: string[];
  audioAsVoice?: boolean;
  replyToId?: string | number | null;
};

export type PendingInboundFile = {
  fileId: number;
  chatRef: string;
  replyToId?: string | number | null;
  ctxPayload: Record<string, unknown>;
  storePath: string;
  sessionKey: string;
  account: ResolvedSimplexAccount;
  cfg: OpenClawConfig;
  runtime: RuntimeEnv;
  client: SimplexClient;
  sendPayload: (payload: SimplexReplyPayload) => Promise<void>;
  statusSink?: (patch: Partial<ChannelAccountSnapshot>) => void;
};

type QueuedPendingInboundFile = {
  pending: PendingInboundFile;
  timeout: ReturnType<typeof setTimeout>;
};

const pendingFiles = new Map<string, QueuedPendingInboundFile>();

function pendingKey(accountId: string, fileId: number): string {
  return `${accountId}:${fileId}`;
}

export async function requestFileDownload(params: {
  fileId: number;
  account: ResolvedSimplexAccount;
  client: SimplexClient;
  runtime: RuntimeEnv;
}): Promise<boolean> {
  const { fileId, account, client, runtime } = params;
  const autoAccept =
    account.config.filePolicy?.autoAccept ?? account.config.connection?.autoAcceptFiles !== false;
  if (!autoAccept) {
    return false;
  }
  try {
    await client.receiveFile(fileId);
  } catch (err) {
    runtime.error?.(`[${account.accountId}] SimpleX receive file failed: ${String(err)}`);
    return false;
  }
  return true;
}

export function queuePendingFile(params: {
  pending: PendingInboundFile;
  accountId: string;
  fileId: number;
}): void {
  const { pending, accountId, fileId } = params;
  const key = pendingKey(accountId, fileId);
  const previous = pendingFiles.get(key);
  if (previous) {
    clearTimeout(previous.timeout);
  }
  const timeout = setTimeout(() => {
    const current = pendingFiles.get(key);
    if (!current) {
      return;
    }
    pendingFiles.delete(key);
    void current.pending.client.cancelFile(fileId).catch((err) => {
      current.pending.runtime.error?.(
        `[${accountId}] SimpleX file timeout cancel failed: ${String(err)}`
      );
    });
    void dispatchInbound({
      pending: current.pending,
      mediaPath: undefined,
      mediaType: undefined,
    }).catch((err) => {
      current.pending.runtime.error?.(
        `[${accountId}] SimpleX pending file timeout: ${String(err)}`
      );
    });
  }, PENDING_FILE_TIMEOUT_MS);
  timeout.unref?.();
  pendingFiles.set(key, { pending, timeout });
}

export async function finalizePendingFile(params: {
  accountId: string;
  fileId: number;
  filePath?: string;
}): Promise<void> {
  const queued = pendingFiles.get(pendingKey(params.accountId, params.fileId));
  if (!queued) {
    return;
  }
  pendingFiles.delete(pendingKey(params.accountId, params.fileId));
  clearTimeout(queued.timeout);
  const { pending } = queued;
  const mediaPath = params.filePath?.trim() || undefined;
  let mediaType: string | undefined;
  if (mediaPath) {
    mediaType = await getSimplexRuntime().media.detectMime({ filePath: mediaPath });
  }
  await dispatchInbound({ pending, mediaPath, mediaType });
}

export function hasPendingFile(accountId: string, fileId: number): boolean {
  return pendingFiles.has(pendingKey(accountId, fileId));
}

export async function dispatchInbound(params: {
  pending: PendingInboundFile;
  mediaPath?: string;
  mediaType?: string;
}): Promise<void> {
  const { pending, mediaPath, mediaType } = params;
  const core = getSimplexRuntime();
  const liveReply = createSimplexLiveReplyController({
    cfg: pending.cfg,
    account: pending.account,
    chatRef: pending.chatRef,
    replyToId: pending.replyToId,
    logError: (message) => pending.runtime.error?.(`[${pending.account.accountId}] ${message}`),
  });
  const ctxPayload = {
    ...pending.ctxPayload,
    MediaPath: mediaPath,
    MediaType: mediaType,
    MediaUrl: mediaPath,
  };

  await core.channel.session.recordInboundSession({
    storePath: pending.storePath,
    sessionKey: (ctxPayload as { SessionKey?: string }).SessionKey ?? pending.sessionKey,
    ctx: ctxPayload,
    onRecordError: (err) => {
      pending.runtime.error?.(`simplex: failed updating session meta: ${String(err)}`);
    },
  });

  pending.statusSink?.({ lastInboundAt: Date.now() });

  await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg: pending.cfg,
    dispatcherOptions: {
      beforeDeliver: (payload) => payload,
      deliver: async (payload, info) => {
        const hasMedia =
          Boolean(payload.mediaUrl) ||
          (Array.isArray(payload.mediaUrls) && payload.mediaUrls.length > 0);
        if (!payload.text && !hasMedia) {
          return;
        }
        if (!pending.account.enabled || !pending.account.configured) {
          pending.runtime.error?.(
            `[${pending.account.accountId}] SimpleX reply skipped: account not ready (enabled=${pending.account.enabled}, configured=${pending.account.configured})`
          );
          return;
        }
        const livePayload: SimplexLiveReplyPayload = {
          text: payload.text,
          mediaUrl: payload.mediaUrl,
          mediaUrls: payload.mediaUrls,
          audioAsVoice: payload.audioAsVoice,
          replyToId: pending.replyToId,
        };
        if (info.kind === "final") {
          if (await liveReply.finalize(livePayload)) {
            pending.statusSink?.({ lastOutboundAt: Date.now() });
            return;
          }
        } else if (await liveReply.updatePartial(livePayload)) {
          pending.statusSink?.({ lastOutboundAt: Date.now() });
          return;
        }
        await pending.sendPayload(payload);
        pending.statusSink?.({ lastOutboundAt: Date.now() });
      },
      onError: (err) => {
        pending.runtime.error?.(
          `[${pending.account.accountId}] SimpleX reply failed: ${String(err)}`
        );
      },
    },
    replyOptions: {
      disableBlockStreaming: liveReply.enabled
        ? true
        : typeof pending.account.config.blockStreaming === "boolean"
          ? !pending.account.config.blockStreaming
          : undefined,
      onPartialReply: liveReply.enabled
        ? async (payload) => {
            await liveReply.updatePartial({
              text: payload.text,
              mediaUrls: payload.mediaUrls,
              replyToId: pending.replyToId,
            });
          }
        : undefined,
    },
  });
}
