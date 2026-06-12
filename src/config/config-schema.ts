import {
  AllowFromListSchema,
  BlockStreamingCoalesceSchema,
  buildCatchallMultiAccountChannelSchema,
  buildChannelConfigSchema,
  ContextVisibilityModeSchema,
  DmConfigSchema,
  DmPolicySchema,
  GroupPolicySchema,
  MarkdownConfigSchema,
  ToolPolicySchema,
} from "openclaw/plugin-sdk/channel-config-schema";
import { z } from "zod";
import { simplexChannelConfigUiHints } from "./config-ui-hints.js";

const SimplexAllowFromListSchema = AllowFromListSchema.pipe(z.array(z.string()).optional());

const groupConfigSchema = z.object({
  requireMention: z.boolean().optional(),
  tools: ToolPolicySchema.optional(),
});

const SimplexActionConfigSchema = z
  .object({
    reactions: z.boolean().optional(),
    polls: z.boolean().optional(),
  })
  .strict();

const SimplexReactionLevelSchema = z.enum(["off", "ack", "minimal", "extensive"]).optional();

const SimplexConnectionSchema = z
  .object({
    mode: z.literal("external").optional(),
    wsUrl: z.string().url().optional(),
    wsHost: z.string().optional(),
    wsPort: z.number().int().positive().optional(),
    allowUnsafeRemoteWs: z.boolean().optional(),
    autoAcceptFiles: z.boolean().optional(),
    connectTimeoutMs: z.number().int().positive().optional(),
    commandTimeoutMs: z.number().int().positive().optional(),
    directoryTimeoutMs: z.number().int().positive().optional(),
  })
  .strict();

const SimplexStreamingSchema = z
  .object({
    nativeTransport: z.boolean().optional(),
    throttleMs: z.number().int().positive().optional(),
    minChars: z.number().int().positive().optional(),
    wordBoundary: z.boolean().optional(),
  })
  .strict();

const SimplexFilePolicySchema = z
  .object({
    autoAccept: z.boolean().optional(),
    maxSizeMb: z.number().int().positive().optional(),
  })
  .strict();

// Shared-volume file exchange (cross-container deployments).
// inboundDir is the simplex-chat runtime's --files-folder (e.g.
// /simplex/inbound); the WS API reports received files relative to it, so
// the plugin needs it to locate received files on disk. Defaults to /tmp,
// where simplex-chat saves files when no --files-folder is configured.
// outboundDir is a directory writable by OpenClaw and readable by
// simplex-chat (e.g. /simplex/outbound); outbound media is staged there
// before sending. Unset = default single-filesystem behavior.
const SimplexFilesSchema = z
  .object({
    inboundDir: z.string().optional(),
    outboundDir: z.string().optional(),
  })
  .strict();

export const SimplexAccountConfigSchema = z
  .object({
    name: z.string().optional(),
    enabled: z.boolean().optional(),
    markdown: MarkdownConfigSchema,
    mediaMaxMb: z.number().int().positive().optional(),
    actions: SimplexActionConfigSchema.optional(),
    reactionLevel: SimplexReactionLevelSchema,
    dmPolicy: DmPolicySchema.optional(),
    dmHistoryLimit: z.number().int().min(0).optional(),
    contextVisibility: ContextVisibilityModeSchema.optional(),
    dms: z.record(z.string(), DmConfigSchema.optional()).optional(),
    allowFrom: SimplexAllowFromListSchema,
    blockStreaming: z.boolean().optional(),
    blockStreamingCoalesce: BlockStreamingCoalesceSchema.optional(),
    streaming: SimplexStreamingSchema.optional(),
    messageTtlSeconds: z.number().int().positive().optional(),
    filePolicy: SimplexFilePolicySchema.optional(),
    files: SimplexFilesSchema.optional(),
    experimentalChannels: z.boolean().optional(),
    groupPolicy: GroupPolicySchema.optional(),
    groupAllowFrom: SimplexAllowFromListSchema,
    groups: z.object({}).catchall(groupConfigSchema).optional(),
    connection: SimplexConnectionSchema.optional(),
  })
  .strict();

export const SimplexConfigSchema = buildCatchallMultiAccountChannelSchema(
  SimplexAccountConfigSchema
);

export type SimplexAccountConfig = z.infer<typeof SimplexAccountConfigSchema>;
export type SimplexConfig = z.infer<typeof SimplexConfigSchema>;
export type SimplexChannelConfig = SimplexConfig & {
  accounts?: Record<string, SimplexAccountConfig | undefined>;
};
export const SIMPLEX_ACCOUNT_CONFIG_CLEAR_FIELDS = Object.keys(
  SimplexAccountConfigSchema.shape
) as Array<keyof SimplexAccountConfig>;

export const SimplexChannelConfigSchema: ReturnType<typeof buildChannelConfigSchema> =
  buildChannelConfigSchema(SimplexConfigSchema, {
    uiHints: simplexChannelConfigUiHints,
  });
