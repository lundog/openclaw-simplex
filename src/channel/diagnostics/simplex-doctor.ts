import { constants as fsConstants } from "node:fs";
import { access, stat } from "node:fs/promises";
import type { ChannelDoctorAdapter } from "openclaw/plugin-sdk/channel-contract";
import type { SimplexAccountConfig, SimplexChannelConfig } from "../../config/config-schema.js";
import { LEGACY_SIMPLEX_CHANNEL_ID, SIMPLEX_CHANNEL_ID } from "../../constants.js";
import { resolveSimplexFilesFolder } from "../events/simplex-inbound-files.js";

function isEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length === 0;
}

// A missing/unwritable files folder makes file transfers fail silently
// (simplex-chat with -p logs nothing), so surface it as a diagnostic.
async function collectFilesFolderWarning(
  channel: SimplexChannelConfig
): Promise<string | undefined> {
  const configured = channel.connection?.filesFolder?.trim();
  const folder = resolveSimplexFilesFolder(configured);
  const label = configured
    ? `connection.filesFolder (${folder})`
    : `the default SimpleX files folder (${folder})`;
  try {
    const info = await stat(folder);
    if (!info.isDirectory()) {
      return `- SimpleX ${label} exists but is not a directory. Received files cannot be read until this is a writable directory.`;
    }
    await access(folder, fsConstants.W_OK);
  } catch {
    return `- SimpleX ${label} is missing or not writable. Received files will be dropped until it exists and the runtime is started with a matching --files-folder.`;
  }
  return undefined;
}

function readChannelConfig(cfg: { channels?: Record<string, unknown> }): SimplexChannelConfig {
  return (cfg.channels?.[SIMPLEX_CHANNEL_ID] ?? {}) as SimplexChannelConfig;
}

function collectAccountWarnings(
  channel: SimplexChannelConfig,
  accountId: string,
  account: SimplexAccountConfig
): string[] {
  const warnings: string[] = [];

  const inheritedAllowFrom = account.allowFrom ?? channel.allowFrom;
  if (account.dmPolicy === "allowlist" && isEmptyArray(inheritedAllowFrom)) {
    warnings.push(
      `- SimpleX account "${accountId}" has dmPolicy="allowlist" with an empty allowFrom list. Add trusted SimpleX contact ids or switch to pairing.`
    );
  }

  const inheritedGroupAllowFrom = account.groupAllowFrom ?? channel.groupAllowFrom;
  if (account.groupPolicy === "allowlist" && isEmptyArray(inheritedGroupAllowFrom)) {
    warnings.push(
      `- SimpleX account "${accountId}" has groupPolicy="allowlist" with an empty groupAllowFrom list. Add trusted SimpleX group/member ids before enabling group access.`
    );
  }
  return warnings;
}

export const simplexDoctor: ChannelDoctorAdapter = {
  groupModel: "sender",
  dmAllowFromMode: "topOrNested",
  warnOnEmptyGroupSenderAllowlist: true,
  collectPreviewWarnings: async ({ cfg, doctorFixCommand }) => {
    const warnings: string[] = [];
    const legacy = cfg.channels?.[LEGACY_SIMPLEX_CHANNEL_ID];
    if (legacy) {
      warnings.push(
        `- Legacy channels.${LEGACY_SIMPLEX_CHANNEL_ID} config is present. Run openclaw-simplex migrate or ${doctorFixCommand} before relying on ${SIMPLEX_CHANNEL_ID}.`
      );
    }

    const channel = readChannelConfig(cfg);
    if (channel.dmPolicy === "allowlist" && isEmptyArray(channel.allowFrom)) {
      warnings.push(
        '- SimpleX dmPolicy="allowlist" is configured with an empty allowFrom list. New contacts will be dropped until allowFrom is populated.'
      );
    }

    if (channel.groupPolicy === "allowlist" && isEmptyArray(channel.groupAllowFrom)) {
      warnings.push(
        '- SimpleX groupPolicy="allowlist" is configured with an empty groupAllowFrom list. Group messages will be dropped until groupAllowFrom is populated.'
      );
    }

    for (const [accountId, account] of Object.entries(channel.accounts ?? {})) {
      if (!account) {
        continue;
      }
      warnings.push(...collectAccountWarnings(channel, accountId, account));
    }

    const filesFolderWarning = await collectFilesFolderWarning(channel);
    if (filesFolderWarning) {
      warnings.push(filesFolderWarning);
    }

    return warnings;
  },
};
