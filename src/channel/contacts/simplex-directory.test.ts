import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import type { RuntimeEnv } from "openclaw/plugin-sdk/runtime-env";
import { beforeEach, describe, expect, it, vi } from "vitest";

const simplexApiMock = vi.hoisted(() => ({
  contacts: [] as unknown[],
  groups: [] as unknown[],
  members: [] as unknown[],
  listGroups: vi.fn(async (_params?: unknown) => [] as unknown[]),
  reset() {
    this.contacts = [];
    this.groups = [];
    this.members = [];
    this.listGroups.mockImplementation(async () => this.groups);
    this.listGroups.mockClear();
  },
}));

vi.mock("../../simplex/runtime/transport.js", () => ({
  withSimplexClient: async <T>(params: { run: (client: unknown) => Promise<T> }): Promise<T> => {
    const client = {
      getActiveUser: vi.fn(async () => ({
        userId: 1,
        profile: { displayName: "OpenClaw SimpleX" },
      })),
      listContacts: vi.fn(async () => simplexApiMock.contacts),
      listGroups: simplexApiMock.listGroups,
      listGroupMembers: vi.fn(async () => simplexApiMock.members),
    };
    return await params.run(client);
  },
}));

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

const runtime = {
  error: vi.fn(),
} as unknown as RuntimeEnv;

describe("simplex directory mapping", () => {
  beforeEach(() => {
    simplexApiMock.reset();
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

  it("resolves explicit targets without listing runtime groups", async () => {
    await expect(
      resolveSimplexTargets({
        cfg,
        runtime,
        kind: "group",
        inputs: ["openclaw-simplex:4"],
      })
    ).resolves.toEqual([
      {
        input: "openclaw-simplex:4",
        resolved: true,
        id: "4",
        note: "treated as explicit id",
      },
    ]);
    expect(simplexApiMock.listGroups).not.toHaveBeenCalled();
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
