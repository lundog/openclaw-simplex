import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import type { RuntimeEnv } from "openclaw/plugin-sdk/runtime-env";
import { beforeEach, describe, expect, it, vi } from "vitest";

const simplexApiMock = vi.hoisted(() => {
  const state: {
    contacts: unknown[];
    groups: unknown[];
    members: unknown[];
    withClientCalls: number;
    getActiveUser: ReturnType<typeof vi.fn>;
    listContacts: ReturnType<typeof vi.fn>;
    listGroups: ReturnType<typeof vi.fn>;
    reset: () => void;
  } = {
    contacts: [],
    groups: [],
    members: [],
    withClientCalls: 0,
    getActiveUser: vi.fn(async () => ({
      userId: 1,
      profile: { displayName: "OpenClaw SimpleX" },
    })),
    listContacts: vi.fn(async () => []),
    listGroups: vi.fn(async () => []),
    reset() {
      state.contacts = [];
      state.groups = [];
      state.members = [];
      state.withClientCalls = 0;
      state.getActiveUser.mockImplementation(async () => ({
        userId: 1,
        profile: { displayName: "OpenClaw SimpleX" },
      }));
      state.getActiveUser.mockClear();
      state.listContacts.mockImplementation(async () => state.contacts);
      state.listContacts.mockClear();
      state.listGroups.mockImplementation(async () => state.groups);
      state.listGroups.mockClear();
    },
  };
  return state;
});

vi.mock("../../simplex/runtime/transport.js", () => ({
  withSimplexClient: async <T>(params: { run: (client: unknown) => Promise<T> }): Promise<T> => {
    simplexApiMock.withClientCalls += 1;
    const client = {
      getActiveUser: simplexApiMock.getActiveUser,
      listContacts: simplexApiMock.listContacts,
      listGroups: simplexApiMock.listGroups,
      listGroupMembers: vi.fn(async () => simplexApiMock.members),
    };
    return await params.run(client);
  },
}));

import { clearSimplexDirectoryProbeCache } from "../../simplex/services/directory-probes.js";
import {
  listSimplexDirectoryGroups,
  listSimplexDirectoryPeers,
  listSimplexGroupMembers,
  resolveSimplexTargets,
} from "./simplex-directory.js";

const cfg = {
  channels: {
    "openclaw-simplex": {
      connection: {
        wsUrl: "ws://127.0.0.1:5225",
      },
    },
  },
} as OpenClawConfig;

const runtime: RuntimeEnv = {
  log: vi.fn(),
  error: vi.fn(),
  exit: vi.fn(),
};

describe("simplex directory mapping", () => {
  beforeEach(() => {
    simplexApiMock.reset();
    clearSimplexDirectoryProbeCache();
  });

  it("maps nested contact payloads and applies query filtering", async () => {
    simplexApiMock.contacts = [
      {
        contact: {
          contactId: 7,
          profile: { displayName: "Alice" },
        },
      },
      {
        contact: {
          contactId: 8,
          localDisplayName: "Bob",
        },
      },
    ];

    await expect(listSimplexDirectoryPeers({ cfg, runtime, query: "ali" })).resolves.toEqual([
      expect.objectContaining({
        kind: "user",
        id: "7",
        name: "Alice",
      }),
    ]);
  });

  it("maps nested group payloads", async () => {
    simplexApiMock.groups = [
      {
        groupInfo: {
          groupId: 42,
          groupProfile: { displayName: "Ops" },
        },
      },
    ];

    await expect(listSimplexDirectoryGroups({ cfg, runtime })).resolves.toEqual([
      expect.objectContaining({
        kind: "group",
        id: "42",
        name: "Ops",
      }),
    ]);
    expect(simplexApiMock.withClientCalls).toBe(1);
    expect(simplexApiMock.getActiveUser).toHaveBeenCalledTimes(1);
    expect(simplexApiMock.listGroups).toHaveBeenCalledTimes(1);
  });

  it("treats SimpleX empty group responses as an empty directory", async () => {
    simplexApiMock.listGroups.mockRejectedValueOnce(new Error("Failed reading: empty"));

    await expect(listSimplexDirectoryGroups({ cfg, runtime })).resolves.toEqual([]);
  });

  it("resolves provider-prefixed group ids without live group search", async () => {
    await expect(
      listSimplexDirectoryGroups({ cfg, runtime, query: "openclaw-simplex:4" })
    ).resolves.toEqual([
      {
        kind: "group",
        id: "4",
      },
    ]);
    expect(simplexApiMock.listGroups).not.toHaveBeenCalled();
  });

  it("resolves explicit group targets without listing runtime groups", async () => {
    await expect(
      resolveSimplexTargets({
        cfg,
        runtime,
        kind: "group",
        inputs: ["openclaw-simplex:4", "#5", "group:6", "simplex:7"],
      })
    ).resolves.toEqual([
      { input: "openclaw-simplex:4", resolved: true, id: "4", note: "treated as explicit id" },
      { input: "#5", resolved: true, id: "5", note: "treated as explicit id" },
      { input: "group:6", resolved: true, id: "6", note: "treated as explicit id" },
      { input: "simplex:7", resolved: true, id: "7", note: "treated as explicit id" },
    ]);
    expect(simplexApiMock.listGroups).not.toHaveBeenCalled();
    expect(simplexApiMock.withClientCalls).toBe(0);
  });

  it("resolves explicit contact targets without listing runtime contacts", async () => {
    await expect(
      resolveSimplexTargets({
        cfg,
        runtime,
        kind: "user",
        inputs: ["@8", "contact:9", "user:10", "member:11"],
      })
    ).resolves.toEqual([
      { input: "@8", resolved: true, id: "8", note: "treated as explicit id" },
      { input: "contact:9", resolved: true, id: "9", note: "treated as explicit id" },
      { input: "user:10", resolved: true, id: "10", note: "treated as explicit id" },
      { input: "member:11", resolved: true, id: "11", note: "treated as explicit id" },
    ]);
    expect(simplexApiMock.listContacts).not.toHaveBeenCalled();
    expect(simplexApiMock.withClientCalls).toBe(0);
  });

  it("maps group member payloads", async () => {
    simplexApiMock.members = [
      {
        groupMember: {
          groupMemberId: 101,
          profile: { displayName: "Carol" },
        },
      },
    ];

    await expect(
      listSimplexGroupMembers({ cfg, runtime, groupId: "42", limit: 1 })
    ).resolves.toEqual([
      expect.objectContaining({
        kind: "user",
        id: "101",
        name: "Carol",
      }),
    ]);
  });
});
