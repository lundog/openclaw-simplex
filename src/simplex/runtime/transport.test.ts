import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResolvedSimplexAccount } from "../../types/config.js";

const clientMock = vi.hoisted(() => ({
  constructed: 0,
  reset() {
    this.constructed = 0;
  },
}));

vi.mock("./client.js", () => ({
  SimplexClient: class {
    source = "constructed";
    constructor() {
      clientMock.constructed += 1;
    }
    async connect() {}
    async close() {}
  },
}));

import type { SimplexClient } from "./client.js";
import {
  getActiveSimplexClient,
  registerActiveSimplexClient,
  unregisterActiveSimplexClient,
  withSimplexClient,
} from "./transport.js";

const registeredAccounts: Array<{ account: ResolvedSimplexAccount; client: SimplexClient }> = [];

function account(
  accountId = "default",
  wsUrl = `ws://127.0.0.1:5225/${accountId}`
): ResolvedSimplexAccount {
  return {
    accountId,
    name: accountId,
    enabled: true,
    configured: true,
    mode: "external",
    wsUrl,
    wsHost: "127.0.0.1",
    wsPort: 5225,
    config: {
      connection: { wsUrl },
    },
  };
}

function activeClient(source: string): SimplexClient {
  return {
    source,
    async connect() {},
    async close() {},
  } as unknown as SimplexClient;
}

describe("simplex runtime transport", () => {
  afterEach(() => {
    for (const registered of registeredAccounts) {
      unregisterActiveSimplexClient(registered.account, registered.client);
    }
    registeredAccounts.length = 0;
    clientMock.reset();
  });

  it("prefers the active monitor client for runtime calls", async () => {
    const cfg = account("alpha");
    const client = activeClient("active");
    registeredAccounts.push({ account: cfg, client });
    await registerActiveSimplexClient(cfg, client);

    const result = await withSimplexClient({
      account: cfg,
      run: async (runtimeClient) => (runtimeClient as unknown as { source: string }).source,
    });

    expect(result).toBe("active");
    expect(clientMock.constructed).toBe(0);
  });

  it("reuses an active monitor client for another account with the same WebSocket URL", async () => {
    const wsUrl = "ws://127.0.0.1:5225";
    const monitored = account("alpha", wsUrl);
    const alias = account("alias", wsUrl);
    const client = activeClient("active");
    registeredAccounts.push({ account: monitored, client });
    await registerActiveSimplexClient(monitored, client);

    const result = await withSimplexClient({
      account: alias,
      run: async (runtimeClient) => (runtimeClient as unknown as { source: string }).source,
    });

    expect(result).toBe("active");
    expect(clientMock.constructed).toBe(0);
  });

  it("does not unregister a newer active client with an older handle", async () => {
    const cfg = account("gamma");
    const oldClient = activeClient("old");
    const newClient = activeClient("new");
    registeredAccounts.push(
      { account: cfg, client: oldClient },
      { account: cfg, client: newClient }
    );
    await registerActiveSimplexClient(cfg, oldClient);
    await registerActiveSimplexClient(cfg, newClient);

    unregisterActiveSimplexClient(cfg, oldClient);

    expect(getActiveSimplexClient("gamma")).toBe(newClient);
  });
});
