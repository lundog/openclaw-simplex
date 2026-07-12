import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import type { MessageReceipt } from "openclaw/plugin-sdk/channel-outbound";
import { parseSimplexNumericId, resolveSimplexChatItemId } from "../../simplex/runtime/api.js";
import { withSimplexClient } from "../../simplex/runtime/transport.js";
import type { ResolvedSimplexAccount } from "../../types/config.js";
import type { SimplexComposedMessage } from "../../types/simplex.js";
import { buildComposedMessages } from "../media/simplex-media.js";

export async function sendSimplexComposedMessages(params: {
  chatRef: string;
  composedMessages: SimplexComposedMessage[];
  ttl?: number;
  liveMessage?: boolean;
  send: (params: {
    chatRef: string;
    composedMessages: SimplexComposedMessage[];
    ttl?: number;
    liveMessage?: boolean;
  }) => Promise<unknown[]>;
}): Promise<{ messageId?: string; receipt?: MessageReceipt }> {
  if (params.composedMessages.length === 0) {
    return {};
  }
  const chatItems = await params.send({
    chatRef: params.chatRef,
    composedMessages: params.composedMessages,
    ttl: params.ttl,
    liveMessage: params.liveMessage,
  });
  // Staged outbound files are reclaimed by the outbound-files reaper once the
  // runtime has had time to read them; the send returning does not mean the
  // async upload is done, so we deliberately do not delete them here.
  const messageId = resolveSimplexChatItemId(chatItems[0]);
  return {
    messageId,
    receipt: messageId
      ? {
          primaryPlatformMessageId: messageId,
          platformMessageIds: [messageId],
          parts: [
            {
              platformMessageId: messageId,
              kind: "text",
              index: 0,
              raw: { messageId, chatId: params.chatRef },
            },
          ],
          sentAt: Date.now(),
          raw: [{ messageId, chatId: params.chatRef }],
        }
      : undefined,
  };
}

export async function buildAndSendSimplexMessages(params: {
  cfg: OpenClawConfig;
  account: ResolvedSimplexAccount;
  chatRef: string;
  text?: string;
  mediaUrl?: string;
  mediaUrls?: string[];
  audioAsVoice?: boolean;
  replyToId?: string | number | null;
  ttl?: number;
  liveMessage?: boolean;
  send?: (params: {
    chatRef: string;
    composedMessages: SimplexComposedMessage[];
    ttl?: number;
    liveMessage?: boolean;
  }) => Promise<unknown[]>;
}): Promise<{ messageId?: string; receipt?: MessageReceipt }> {
  const quotedItemId =
    params.replyToId === undefined || params.replyToId === null
      ? undefined
      : parseSimplexNumericId(params.replyToId);
  const composedMessages = await buildComposedMessages({
    cfg: params.cfg,
    accountId: params.account.accountId,
    text: params.text,
    mediaUrl: params.mediaUrl,
    mediaUrls: params.mediaUrls,
    audioAsVoice: params.audioAsVoice,
    quotedItemId: quotedItemId ?? undefined,
  });
  return await sendSimplexComposedMessages({
    chatRef: params.chatRef,
    composedMessages,
    ttl: params.ttl ?? params.account.config.messageTtlSeconds,
    liveMessage: params.liveMessage,
    send:
      params.send ??
      (({ chatRef, composedMessages: messages, ttl, liveMessage }) =>
        withSimplexClient({
          account: params.account,
          run: (client) =>
            client.sendMessages({ chatRef, composedMessages: messages, ttl, liveMessage }),
        })),
  });
}

export type SimplexLiveReplyPayload = {
  text?: string;
  mediaUrl?: string;
  mediaUrls?: string[];
  audioAsVoice?: boolean;
  replyToId?: string | number | null;
};

export function resolveSimplexLiveStreamingConfig(account: ResolvedSimplexAccount): {
  enabled: boolean;
  throttleMs: number;
  minChars: number;
  wordBoundary: boolean;
} {
  const streaming = account.config.streaming;
  return {
    enabled: streaming?.nativeTransport === true,
    throttleMs: streaming?.throttleMs ?? 2000,
    minChars: streaming?.minChars ?? 24,
    wordBoundary: streaming?.wordBoundary ?? true,
  };
}

function trimToWordBoundary(text: string): string {
  const trimmed = text.trimEnd();
  if (trimmed.length !== text.length) {
    return trimmed;
  }
  const lastSpace = trimmed.lastIndexOf(" ");
  if (lastSpace <= 0) {
    return trimmed;
  }
  return trimmed.slice(0, lastSpace).trimEnd();
}

function payloadHasMedia(payload: SimplexLiveReplyPayload): boolean {
  return Boolean(
    payload.mediaUrl ||
      (Array.isArray(payload.mediaUrls) && payload.mediaUrls.some((url) => Boolean(url)))
  );
}

function renderLiveText(text: string, params: { final?: boolean; wordBoundary: boolean }): string {
  return params.final || !params.wordBoundary ? text.trimEnd() : trimToWordBoundary(text);
}

export function createSimplexLiveReplyController(params: {
  cfg: OpenClawConfig;
  account: ResolvedSimplexAccount;
  chatRef: string;
  replyToId?: string | number | null;
  now?: () => number;
  logError?: (message: string) => void;
}): {
  readonly enabled: boolean;
  readonly messageId: string | undefined;
  updatePartial: (payload: SimplexLiveReplyPayload) => Promise<boolean>;
  finalize: (payload: SimplexLiveReplyPayload) => Promise<boolean>;
} {
  const live = resolveSimplexLiveStreamingConfig(params.account);
  const now = params.now ?? Date.now;
  let messageId: string | undefined;
  let lastSent = "";
  let lastSentAt = 0;
  let failed = false;

  async function sendInitial(text: string): Promise<boolean> {
    const sent = await buildAndSendSimplexMessages({
      cfg: params.cfg,
      account: params.account,
      chatRef: params.chatRef,
      text,
      replyToId: params.replyToId,
      liveMessage: true,
    });
    messageId = sent.messageId;
    lastSent = text;
    lastSentAt = now();
    return Boolean(messageId);
  }

  async function editLive(text: string, final: boolean): Promise<boolean> {
    if (!messageId) {
      return false;
    }
    const existingMessageId = messageId;
    const composed = await buildComposedMessages({
      cfg: params.cfg,
      accountId: params.account.accountId,
      text,
    });
    const updatedMessage = composed[0];
    if (!updatedMessage) {
      return false;
    }
    await withSimplexClient({
      account: params.account,
      run: (client) =>
        client.editMessage({
          chatRef: params.chatRef,
          messageId: existingMessageId,
          updatedMessage,
          liveMessage: !final,
        }),
    });
    lastSent = text;
    lastSentAt = now();
    return true;
  }

  async function updateText(text: string, options: { final?: boolean } = {}): Promise<boolean> {
    if (!live.enabled || failed) {
      return false;
    }
    const rendered = renderLiveText(text, {
      final: options.final,
      wordBoundary: live.wordBoundary,
    });
    if (!rendered) {
      return true;
    }
    const currentTime = now();
    if (!options.final) {
      if (!messageId && rendered.length < live.minChars) {
        return true;
      }
      if (
        messageId &&
        Math.abs(rendered.length - lastSent.length) < live.minChars &&
        currentTime - lastSentAt < live.throttleMs
      ) {
        return true;
      }
    }
    try {
      return messageId
        ? await editLive(rendered, options.final === true)
        : await sendInitial(rendered);
    } catch (err) {
      failed = true;
      params.logError?.(`SimpleX live reply update failed: ${String(err)}`);
      return false;
    }
  }

  return {
    get enabled() {
      return live.enabled;
    },
    get messageId() {
      return messageId;
    },
    updatePartial: async (payload) => {
      if (!live.enabled || payloadHasMedia(payload)) {
        return false;
      }
      const text = payload.text?.trimEnd();
      if (!text) {
        return true;
      }
      return await updateText(text);
    },
    finalize: async (payload) => {
      if (!live.enabled || payloadHasMedia(payload) || !messageId) {
        return false;
      }
      const text = payload.text?.trimEnd();
      if (!text) {
        return false;
      }
      return await updateText(text, { final: true });
    },
  };
}
