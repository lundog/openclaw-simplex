import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import type { EnvelopeFormatOptions } from "openclaw/plugin-sdk/channel-inbound";
import { SIMPLEX_CHANNEL_ID } from "../../constants.js";
import type { SimplexChatContext } from "../../types/events.js";

type SimplexAgentRoute = {
  agentId: string;
  sessionKey: string;
  accountId: string;
};

export type SimplexInboundDispatchCore = {
  channel: {
    session: {
      resolveStorePath: (
        store: NonNullable<OpenClawConfig["session"]>["store"] | undefined,
        params: { agentId: string }
      ) => string;
      readSessionUpdatedAt: (params: {
        storePath: string;
        sessionKey: string;
      }) => number | null | undefined;
    };
    reply: {
      resolveEnvelopeFormatOptions: (cfg: OpenClawConfig) => EnvelopeFormatOptions;
      formatAgentEnvelope: (params: {
        channel: string;
        from: string;
        previousTimestamp: number | Date | undefined;
        envelope?: EnvelopeFormatOptions;
        body: string;
      }) => string;
      finalizeInboundContext: (ctx: Record<string, unknown>) => Record<string, unknown>;
    };
  };
};

export function buildSimplexInboundDispatchContext(params: {
  core: SimplexInboundDispatchCore;
  cfg: OpenClawConfig;
  context: SimplexChatContext;
  route: SimplexAgentRoute;
  rawBody: string;
  dmPeerId: string;
  currentMessageId?: number;
  effectiveWasMentioned?: boolean;
  commandAuthorized?: boolean;
}): {
  ctxPayload: Record<string, unknown>;
  storePath: string;
  sessionKey: string;
} {
  const {
    core,
    cfg,
    context,
    route,
    rawBody,
    dmPeerId,
    currentMessageId,
    effectiveWasMentioned,
    commandAuthorized,
  } = params;
  const storePath = core.channel.session.resolveStorePath(cfg.session?.store, {
    agentId: route.agentId,
  });

  const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(cfg);
  const previousTimestamp = core.channel.session.readSessionUpdatedAt({
    storePath,
    sessionKey: route.sessionKey,
  });

  const fromLabel =
    context.chatType === "group"
      ? `group:${context.chatId}`
      : context.senderName || `contact:${context.senderId ?? "unknown"}`;

  const body = core.channel.reply.formatAgentEnvelope({
    channel: "SimpleX",
    from: fromLabel,
    previousTimestamp: previousTimestamp ?? undefined,
    envelope: envelopeOptions,
    body: rawBody,
  });

  const conversationId =
    context.chatType === "group"
      ? `${SIMPLEX_CHANNEL_ID}:group:${context.chatId}`
      : `${SIMPLEX_CHANNEL_ID}:${dmPeerId}`;

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    RawBody: rawBody,
    CommandBody: rawBody,
    From: conversationId,
    To: conversationId,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: context.chatType === "group" ? "group" : "direct",
    ConversationLabel: fromLabel,
    GroupSubject: context.chatType === "group" ? context.chatLabel : undefined,
    SenderName: context.senderName,
    SenderId: context.senderId,
    Provider: SIMPLEX_CHANNEL_ID,
    Surface: SIMPLEX_CHANNEL_ID,
    MessageSid: currentMessageId !== undefined ? String(currentMessageId) : undefined,
    CurrentMessageId: currentMessageId !== undefined ? String(currentMessageId) : undefined,
    WasMentioned: context.chatType === "group" ? effectiveWasMentioned : undefined,
    CommandAuthorized: commandAuthorized,
    OriginatingChannel: SIMPLEX_CHANNEL_ID,
    OriginatingTo: conversationId,
  });

  return {
    ctxPayload,
    storePath,
    sessionKey: route.sessionKey,
  };
}
