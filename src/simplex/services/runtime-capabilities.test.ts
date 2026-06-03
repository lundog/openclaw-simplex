import { describe, expect, it } from "vitest";
import type { ResolvedSimplexAccount } from "../../types/config.js";
import {
  collectSimplexCapabilityIssues,
  probeSimplexCommandSupport,
  probeSimplexRuntimeCapabilities,
  type SimplexCapabilityClient,
} from "./runtime-capabilities.js";

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

function client(overrides: Partial<SimplexCapabilityClient> = {}): SimplexCapabilityClient {
  return {
    getActiveUser: async () => ({ userId: 1 }),
    getAddress: async () => ({ link: null, response: {} }),
    listContacts: async () => [{}],
    listGroups: async () => [],
    listUsers: async () => [{}],
    runCommand: async () => ({}),
    ...overrides,
  };
}

describe("simplex runtime capability probes", () => {
  it("marks a supported command response", async () => {
    const result = await probeSimplexCommandSupport({
      client: client(),
      command: "/_probe",
    });

    expect(result).toMatchObject({
      state: "supported",
      command: "/_probe",
    });
  });

  it("marks an unsupported command response", async () => {
    const result = await probeSimplexCommandSupport({
      client: client({
        runCommand: async () => {
          throw new Error("unknown command: /_probe");
        },
      }),
      command: "/_probe",
    });

    expect(result).toMatchObject({
      state: "unsupported",
      command: "/_probe",
      error: "unknown command: /_probe",
    });
  });

  it("marks non-unsupported command failures as errors", async () => {
    const result = await probeSimplexCommandSupport({
      client: client({
        runCommand: async () => {
          throw new Error("websocket closed");
        },
      }),
      command: "/_probe",
    });

    expect(result).toMatchObject({
      state: "error",
      command: "/_probe",
      error: "websocket closed",
    });
  });

  it("reports missing active user ids without probing contact or group counts", async () => {
    const result = await probeSimplexRuntimeCapabilities({
      account: account(),
      client: client({
        getActiveUser: async () => ({}),
      }),
    });

    expect(result.capabilities.activeUser.state).toBe("unknown");
    expect(result.capabilities.contacts).toMatchObject({
      state: "unknown",
      count: null,
      error: "No active user id available.",
    });
    expect(result.capabilities.groups).toMatchObject({
      state: "unknown",
      count: null,
      error: "No active user id available.",
    });
  });

  it("treats empty SimpleX list responses as supported empty counts", async () => {
    const result = await probeSimplexRuntimeCapabilities({
      account: account(),
      client: client({
        listGroups: async () => {
          throw new Error("Failed reading: empty");
        },
      }),
    });

    expect(result.groups).toEqual([]);
    expect(result.capabilities.groups).toMatchObject({
      state: "supported",
      count: 0,
    });
  });

  it("warns when live replies are enabled but runtime probe says unsupported", async () => {
    const result = await probeSimplexRuntimeCapabilities({
      account: account({
        config: {
          connection: { wsHost: "127.0.0.1", wsPort: 5225 },
          streaming: { nativeTransport: true },
        },
      }),
      client: client({
        runCommand: async () => {
          throw new Error("unknown command: /_send live=on");
        },
      }),
      probeCommands: {
        liveMessages: "/_send @probe live=on json []",
      },
    });

    const issues = collectSimplexCapabilityIssues({
      account: account({
        config: {
          connection: { wsHost: "127.0.0.1", wsPort: 5225 },
          streaming: { nativeTransport: true },
        },
      }),
      capabilities: result.capabilities,
    });

    expect(result.capabilities.liveMessages.state).toBe("unsupported");
    expect(issues.join("\n")).toContain("live replies are enabled");
    expect(issues.join("\n")).toContain("unsupported");
  });
});
