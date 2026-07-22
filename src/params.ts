import { readPositiveIntegerParam } from "openclaw/plugin-sdk/channel-actions";

/**
 * SimpleX protocol ids (contact, group, member, file) are positive integers.
 *
 * The SDK helper treats a missing value as `undefined` so it can back optional
 * params; every call site here needs the id, so absence is an error.
 */
export function readRequiredPositiveInteger(
  params: Record<string, unknown> | undefined,
  key: string
): number {
  const value = readPositiveIntegerParam(params ?? {}, key);
  if (value === undefined) {
    throw new Error(`${key} must be a positive integer`);
  }
  return value;
}
