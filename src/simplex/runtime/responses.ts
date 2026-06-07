import type { SimplexRuntimeResponse } from "../../types/simplex.js";
import { resolveSimplexCommandError } from "./errors.js";

export type SimplexCommandResponsePayload = {
  type?: string;
  [key: string]: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function unwrapSimplexCommandResponse(
  response: SimplexRuntimeResponse
): SimplexCommandResponsePayload {
  const resp = isRecord(response.resp) ? response.resp : undefined;
  const commandError = resolveSimplexCommandError(resp);
  if (commandError) {
    throw new Error(commandError);
  }
  if (resp) {
    return resp;
  }
  return isRecord(response) ? response : {};
}

export function readSimplexArrayField(
  payload: SimplexCommandResponsePayload,
  fields: string[]
): unknown[] {
  for (const field of fields) {
    const value = payload[field];
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}

export function readSimplexObjectField(
  payload: SimplexCommandResponsePayload,
  fields: string[]
): unknown {
  for (const field of fields) {
    const value = payload[field];
    if (isRecord(value)) {
      return value;
    }
  }
  return payload;
}
