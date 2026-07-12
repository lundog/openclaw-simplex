import os from "node:os";
import path from "node:path";

/**
 * Expand a leading `~`, `~/`, or `~\` in a local path to the current user's home
 * directory. Only meaningful for OpenClaw-local paths, never apply it to a path
 * that is resolved on the runtime's side (e.g. `outboundFolderOnClient`).
 */
export function expandHome(value: string): string {
  if (value === "~") {
    return os.homedir();
  }
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}
