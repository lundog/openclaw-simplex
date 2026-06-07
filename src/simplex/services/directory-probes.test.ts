import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedSimplexAccount } from "../../types/config.js";
import {
  clearSimplexDirectoryProbeCache,
  isSimplexEmptyRuntimeListError,
  readSimplexActiveUserInfo,
  readSimplexActiveUserInfoFromClient,
  resolveSimplexDirectoryTimeoutMs,
} from "./directory-probes.js";

function account(overrides: Partial<ResolvedSimplexAccount> = {}): ResolvedSimplexAccount {
  return {
    accountId: "default",
    enabled: true,
    configured: true,
    mode: "external",
    wsUrl: "ws://127.0.0.1:5225",
    wsHost: "127.0.0.1",
    wsPort: 5225,
    config: {
      connection: {
        wsHost: "127.0.0.1",
        wsPort: 5225,
      },
    },
    ...overrides,
  };
}

describe("simplex directory probe helpers", () => {
  beforeEach(() => {
    clearSimplexDirectoryProbeCache();
  });

  it("resolves directory timeout from directory, command, then default settings", () => {
    expect(
      resolveSimplexDirectoryTimeoutMs(
        account({ config: { connection: { directoryTimeoutMs: 1_000, commandTimeoutMs: 2_000 } } })
      )
    ).toBe(1_000);
    expect(
      resolveSimplexDirectoryTimeoutMs(
        account({ config: { connection: { commandTimeoutMs: 2_000 } } })
      )
    ).toBe(2_000);
    expect(resolveSimplexDirectoryTimeoutMs(account())).toBe(5_000);
  });

  it("reads active user ids and names from SimpleX user payloads", () => {
    expect(
      readSimplexActiveUserInfo({
        userId: 7,
        profile: { displayName: "OpenClaw SimpleX" },
      })
    ).toMatchObject({
      userId: "7",
      numericUserId: 7,
      displayName: "OpenClaw SimpleX",
    });
  });

  it("rejects partial numeric user ids", () => {
    expect(readSimplexActiveUserInfo({ userId: "7abc" })).toMatchObject({
      userId: "7abc",
      numericUserId: null,
    });
  });

  it("recognizes SimpleX empty-list runtime failures", () => {
    expect(isSimplexEmptyRuntimeListError(new Error("Failed reading: empty"))).toBe(true);
    expect(isSimplexEmptyRuntimeListError(new Error("Failed reading: permission denied"))).toBe(
      false
    );
  });

  it("caches active user reads briefly per account", async () => {
    const getActiveUser = vi.fn(async () => ({
      userId: 9,
      profile: { displayName: "Cached User" },
    }));
    const cfg = account();

    await expect(
      readSimplexActiveUserInfoFromClient({ account: cfg, client: { getActiveUser } })
    ).resolves.toMatchObject({ numericUserId: 9 });
    await expect(
      readSimplexActiveUserInfoFromClient({ account: cfg, client: { getActiveUser } })
    ).resolves.toMatchObject({ numericUserId: 9 });

    expect(getActiveUser).toHaveBeenCalledTimes(1);
  });
});
