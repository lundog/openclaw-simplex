import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { parseSimplexNumericId, resolveSimplexChatItemId } from "../../simplex/runtime/api.js";
import { withSimplexClient } from "../../simplex/runtime/transport.js";
import type { ResolvedSimplexAccount } from "../../types/config.js";
import type { SimplexComposedMessage } from "../../types/simplex.js";
import { buildComposedMessages } from "../media/simplex-media.js";

export async function sendSimplexComposedMessages(params: {
  chatRef: string;
  composedMessages: SimplexComposedMessage[];
  send: (chatRef: string, composedMessages: SimplexComposedMessage[]) => Promise<unknown[]>;
}): Promise<{ messageId?: string }> {
  if (params.composedMessages.length === 0) {
    return {};
  }
  const chatItems = await params.send(params.chatRef, params.composedMessages);
  return { messageId: resolveSimplexChatItemId(chatItems[0]) };
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
}): Promise<{ messageId?: string }> {
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
    send: (chatRef, messages) =>
      withSimplexClient({
        account: params.account,
        run: (client) => client.sendMessages({ chatRef, composedMessages: messages }),
      }),
  });
}
