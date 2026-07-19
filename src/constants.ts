export const SIMPLEX_PLUGIN_ID = "openclaw-simplex";
export const SIMPLEX_CHANNEL_ID = "openclaw-simplex";
export const LEGACY_SIMPLEX_PLUGIN_ID = "simplex";
export const LEGACY_SIMPLEX_CHANNEL_ID = "simplex";
export const SIMPLEX_PROVIDER_PREFIXES = [SIMPLEX_CHANNEL_ID, LEGACY_SIMPLEX_CHANNEL_ID] as const;

/** Default runtime folders (simplex-chat `--files-folder` / `--temp-folder`). */
export const DEFAULT_SIMPLEX_FILES_FOLDER = "~/.simplex/files";
export const DEFAULT_SIMPLEX_TEMP_FOLDER = "~/.simplex/tmp";

export function stripSimplexProviderPrefix(value: string): string {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  for (const prefix of SIMPLEX_PROVIDER_PREFIXES) {
    const providerPrefix = `${prefix}:`;
    if (lower.startsWith(providerPrefix)) {
      return trimmed.slice(providerPrefix.length).trim();
    }
  }
  return trimmed;
}
