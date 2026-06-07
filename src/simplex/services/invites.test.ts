import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedSimplexAccount } from "../../types/config.js";

const runtimeMock = vi.hoisted(() => ({
  account: {
    accountId: "default",
    enabled: true,
    configured: true,
    mode: "external",
    wsUrl: "ws://127.0.0.1:5225",
    wsHost: "127.0.0.1",
    wsPort: 5225,
    config: { connection: { wsUrl: "ws://127.0.0.1:5225" } },
  } as ResolvedSimplexAccount,
  client: {
    getAddress: vi.fn(
      async (): Promise<{ link: string | null; response: unknown }> => ({
        link: null,
        response: {},
      })
    ),
    listContacts: vi.fn(async () => [] as unknown[]),
    deleteAddress: vi.fn(async () => ({})),
  },
}));

vi.mock("../runtime/account.js", () => ({
  resolveRuntimeAccount: () => runtimeMock.account,
  withActiveSimplexUser: async <T>(params: {
    run: (userId: number, client: typeof runtimeMock.client) => Promise<T>;
  }): Promise<T> => await params.run(1, runtimeMock.client),
}));

import { listSimplexInvites, revokeSimplexInvite } from "./invites.js";

describe("simplex invite service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists contacts when the runtime has no current address", async () => {
    runtimeMock.client.getAddress.mockRejectedValueOnce(new Error("SimpleX command failed"));
    runtimeMock.client.listContacts.mockResolvedValueOnce([
      {
        contact: {
          contactId: 7,
          profile: { displayName: "Alice" },
        },
      },
    ]);

    const result = await listSimplexInvites({ cfg: {} });

    expect(result).toMatchObject({
      accountId: "default",
      addressLink: null,
      links: [],
      contactsResponse: [
        {
          contact: {
            contactId: 7,
            profile: { displayName: "Alice" },
          },
        },
      ],
    });
    expect(result.addressResponse).toMatchObject({
      type: "addressLookupFailed",
      error: "SimpleX command failed",
    });
  });

  it("returns not revoked when no current address exists", async () => {
    runtimeMock.client.getAddress.mockResolvedValueOnce({ link: null, response: {} });

    await expect(revokeSimplexInvite({ cfg: {} })).resolves.toEqual({
      accountId: "default",
      revoked: false,
    });
    expect(runtimeMock.client.deleteAddress).not.toHaveBeenCalled();
  });

  it("deletes the current address when one exists", async () => {
    runtimeMock.client.getAddress.mockResolvedValueOnce({
      link: "https://simplex.chat/contact#/?v=1-test",
      response: {},
    });

    await expect(revokeSimplexInvite({ cfg: {} })).resolves.toEqual({
      accountId: "default",
      revoked: true,
    });
    expect(runtimeMock.client.deleteAddress).toHaveBeenCalledTimes(1);
  });
});
