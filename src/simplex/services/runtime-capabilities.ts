import type { ResolvedSimplexAccount } from "../../types/config.js";
import { readSimplexRuntimeVersion } from "../runtime/account.js";
import type { SimplexClient } from "../runtime/client.js";
import { parseSimplexNumericId } from "../runtime/commands.js";
import { withSimplexClient } from "../runtime/transport.js";

export type SimplexCapabilityState = "supported" | "unsupported" | "unknown" | "error";

export type SimplexCapabilityProbe = {
  state: SimplexCapabilityState;
  command?: string;
  detail?: string;
  error?: string;
  runtimeVersion: string | null;
};

export type SimplexCountCapabilityProbe = SimplexCapabilityProbe & {
  count: number | null;
};

export type SimplexValueCapabilityProbe = SimplexCapabilityProbe & {
  value: unknown;
};

export type SimplexRuntimeCapabilityReport = {
  runtimeVersion: string | null;
  version: SimplexValueCapabilityProbe;
  activeUser: SimplexValueCapabilityProbe;
  users: SimplexCountCapabilityProbe;
  contacts: SimplexCountCapabilityProbe;
  groups: SimplexCountCapabilityProbe;
  liveMessages: SimplexCapabilityProbe;
  ttl: SimplexCapabilityProbe;
  verification: SimplexCapabilityProbe;
  moderation: SimplexCapabilityProbe;
  files: SimplexCapabilityProbe;
  experimentalChannels: SimplexCapabilityProbe;
};

export type SimplexRuntimeCapabilityProbeData = {
  activeUser: unknown;
  address: unknown;
  contacts: unknown[];
  groups: unknown[];
  users: unknown[];
  capabilities: SimplexRuntimeCapabilityReport;
};

type ProbeCommandRunner = Pick<SimplexClient, "runCommand">;

export type SimplexCapabilityClient = Pick<
  SimplexClient,
  "getActiveUser" | "getAddress" | "listContacts" | "listGroups" | "listUsers" | "runCommand"
>;

type SimplexRuntimeCapabilityProbeOptions = {
  account: ResolvedSimplexAccount;
  client?: SimplexCapabilityClient;
  probeCommands?: Partial<
    Record<
      "liveMessages" | "ttl" | "verification" | "moderation" | "files" | "experimentalChannels",
      string
    >
  >;
};

type ListProbeResult<Key extends string> = Record<Key, unknown[]> & {
  error: string | null;
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function readStringField(payload: unknown, fields: string[]): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  for (const field of fields) {
    const value = record[field];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function isUnsupportedRuntimeError(message: string): boolean {
  const normalized = message.toLowerCase();
  return [
    "unknown command",
    "unsupported",
    "not supported",
    "invalid command",
    "no such command",
    "not implemented",
    "unrecognized command",
  ].some((needle) => normalized.includes(needle));
}

function isEmptyRuntimeListError(message: string): boolean {
  return message.trim().toLowerCase() === "failed reading: empty";
}

function probe(
  state: SimplexCapabilityState,
  params: Omit<SimplexCapabilityProbe, "state" | "runtimeVersion"> & {
    runtimeVersion: string | null;
  }
): SimplexCapabilityProbe {
  return {
    state,
    runtimeVersion: params.runtimeVersion,
    command: params.command,
    detail: params.detail,
    error: params.error,
  };
}

function countProbe(
  state: SimplexCapabilityState,
  params: Omit<SimplexCountCapabilityProbe, "state" | "runtimeVersion"> & {
    runtimeVersion: string | null;
  }
): SimplexCountCapabilityProbe {
  return { ...probe(state, params), count: params.count };
}

function valueProbe(
  state: SimplexCapabilityState,
  params: Omit<SimplexValueCapabilityProbe, "state" | "runtimeVersion"> & {
    runtimeVersion: string | null;
  }
): SimplexValueCapabilityProbe {
  return { ...probe(state, params), value: params.value };
}

export async function probeSimplexCommandSupport(params: {
  client: ProbeCommandRunner;
  command: string;
  runtimeVersion?: string | null;
}): Promise<SimplexCapabilityProbe> {
  const runtimeVersion = params.runtimeVersion ?? null;
  try {
    await params.client.runCommand(params.command);
    return probe("supported", {
      command: params.command,
      runtimeVersion,
    });
  } catch (err) {
    const message = errorMessage(err);
    if (isUnsupportedRuntimeError(message)) {
      return probe("unsupported", {
        command: params.command,
        error: message,
        runtimeVersion,
      });
    }
    return probe("error", {
      command: params.command,
      error: message,
      runtimeVersion,
    });
  }
}

function unknownProbe(params: {
  runtimeVersion: string | null;
  detail: string;
}): SimplexCapabilityProbe {
  return probe("unknown", {
    runtimeVersion: params.runtimeVersion,
    detail: params.detail,
  });
}

function readStrictUserId(activeUser: unknown): number | null {
  if (!activeUser || typeof activeUser !== "object") {
    return null;
  }
  const rawUserId = (activeUser as { userId?: unknown }).userId;
  if (typeof rawUserId !== "number" && typeof rawUserId !== "string") {
    return null;
  }
  return parseSimplexNumericId(rawUserId);
}

async function optionalCommandProbe(params: {
  client: ProbeCommandRunner;
  command: string | undefined;
  runtimeVersion: string | null;
  fallbackDetail: string;
}): Promise<SimplexCapabilityProbe> {
  if (!params.command) {
    return unknownProbe({
      runtimeVersion: params.runtimeVersion,
      detail: params.fallbackDetail,
    });
  }
  return await probeSimplexCommandSupport({
    client: params.client,
    command: params.command,
    runtimeVersion: params.runtimeVersion,
  });
}

async function probeRuntimeVersion(
  client: ProbeCommandRunner,
  fallbackRuntimeVersion: string | null
): Promise<{ runtimeVersion: string | null; probe: SimplexValueCapabilityProbe }> {
  const command = "/version";
  try {
    const payload = await client.runCommand(command);
    const version = readStringField(payload, [
      "version",
      "simplexVersion",
      "simplexChatVersion",
      "chatVersion",
    ]);
    return {
      runtimeVersion: version ?? fallbackRuntimeVersion,
      probe: valueProbe(version ? "supported" : "unknown", {
        command,
        runtimeVersion: version ?? fallbackRuntimeVersion,
        value: version,
        detail: version
          ? undefined
          : "Runtime accepted /version but did not expose a version field.",
      }),
    };
  } catch (err) {
    const message = errorMessage(err);
    return {
      runtimeVersion: fallbackRuntimeVersion,
      probe: valueProbe(isUnsupportedRuntimeError(message) ? "unsupported" : "error", {
        command,
        runtimeVersion: fallbackRuntimeVersion,
        value: fallbackRuntimeVersion,
        error: message,
      }),
    };
  }
}

async function collectWithClient(
  params: SimplexRuntimeCapabilityProbeOptions & { client: SimplexCapabilityClient }
): Promise<SimplexRuntimeCapabilityProbeData> {
  const versionResult = await probeRuntimeVersion(params.client, readSimplexRuntimeVersion());
  const runtimeVersion = versionResult.runtimeVersion;
  let activeUser: unknown = null;
  let activeUserProbe: SimplexValueCapabilityProbe | null = null;
  try {
    activeUser = await params.client.getActiveUser();
  } catch (err) {
    activeUserProbe = valueProbe(
      isUnsupportedRuntimeError(errorMessage(err)) ? "unsupported" : "error",
      {
        command: "/user",
        runtimeVersion,
        value: null,
        error: errorMessage(err),
      }
    );
  }

  const userId = readStrictUserId(activeUser);
  if (!activeUserProbe) {
    activeUserProbe = valueProbe(userId === null ? "unknown" : "supported", {
      command: "/user",
      runtimeVersion,
      value: activeUser ?? null,
      detail:
        userId === null
          ? "SimpleX runtime did not return an active user profile with a strict numeric userId."
          : undefined,
    });
  }

  const [address, usersResult, contactsResult, groupsResult] = await Promise.all([
    params.client.getAddress().catch(() => null),
    params.client
      .listUsers()
      .then((users) => ({ users, error: null as string | null }))
      .catch(
        (err): ListProbeResult<"users"> => ({
          users: [],
          error: errorMessage(err),
        })
      ),
    userId === null
      ? Promise.resolve<ListProbeResult<"contacts">>({
          contacts: [],
          error: "No active user id available.",
        })
      : params.client
          .listContacts(userId)
          .then((contacts) => ({ contacts, error: null as string | null }))
          .catch(
            (err): ListProbeResult<"contacts"> => ({
              contacts: [],
              error: isEmptyRuntimeListError(errorMessage(err)) ? null : errorMessage(err),
            })
          ),
    userId === null
      ? Promise.resolve<ListProbeResult<"groups">>({
          groups: [],
          error: "No active user id available.",
        })
      : params.client
          .listGroups({ userId })
          .then((groups) => ({ groups, error: null as string | null }))
          .catch(
            (err): ListProbeResult<"groups"> => ({
              groups: [],
              error: isEmptyRuntimeListError(errorMessage(err)) ? null : errorMessage(err),
            })
          ),
  ]);

  const users = usersResult.users;
  const contacts = contactsResult.contacts;
  const groups = groupsResult.groups;
  const capabilityCommands = params.probeCommands ?? {};

  const [liveMessages, ttl, verification, moderation, files, experimentalChannels] =
    await Promise.all([
      optionalCommandProbe({
        client: params.client,
        command: capabilityCommands.liveMessages,
        runtimeVersion,
        fallbackDetail:
          params.account.config.streaming?.nativeTransport === true
            ? "Live replies are enabled; skipped destructive send probe because it would create a chat item."
            : "Live replies are disabled in account config.",
      }),
      optionalCommandProbe({
        client: params.client,
        command: capabilityCommands.ttl,
        runtimeVersion,
        fallbackDetail:
          typeof params.account.config.messageTtlSeconds === "number"
            ? "Message TTL is configured; skipped destructive send probe because it would create a chat item."
            : "Message TTL is not configured.",
      }),
      optionalCommandProbe({
        client: params.client,
        command: capabilityCommands.verification,
        runtimeVersion,
        fallbackDetail:
          "Verification support requires a real contact target, so the advisory probe did not run it.",
      }),
      optionalCommandProbe({
        client: params.client,
        command: capabilityCommands.moderation,
        runtimeVersion,
        fallbackDetail:
          "Moderation support requires a real group/member target, so the advisory probe did not run it.",
      }),
      optionalCommandProbe({
        client: params.client,
        command: capabilityCommands.files,
        runtimeVersion,
        fallbackDetail:
          "File receive/cancel support requires a real file id, so the advisory probe did not run it.",
      }),
      optionalCommandProbe({
        client: params.client,
        command:
          capabilityCommands.experimentalChannels ??
          (params.account.config.experimentalChannels === true ? "/_channels" : undefined),
        runtimeVersion,
        fallbackDetail: params.account.config.experimentalChannels
          ? "Experimental channel-like targets are enabled, but no stable list command was probed."
          : "Experimental channel-like targets are disabled in account config.",
      }),
    ]);

  return {
    activeUser,
    address,
    contacts,
    groups,
    users,
    capabilities: {
      runtimeVersion,
      version: versionResult.probe,
      activeUser: activeUserProbe,
      users: usersResult.error
        ? countProbe(isUnsupportedRuntimeError(usersResult.error) ? "unsupported" : "error", {
            command: "/users",
            runtimeVersion,
            count: null,
            error: usersResult.error,
          })
        : countProbe("supported", { command: "/users", runtimeVersion, count: users.length }),
      contacts: contactsResult.error
        ? countProbe(
            contactsResult.error === "No active user id available." ? "unknown" : "error",
            {
              command: userId === null ? undefined : `/_contacts ${userId}`,
              runtimeVersion,
              count: null,
              error: contactsResult.error,
            }
          )
        : countProbe("supported", {
            command: `/_contacts ${userId}`,
            runtimeVersion,
            count: contacts.length,
          }),
      groups: groupsResult.error
        ? countProbe(groupsResult.error === "No active user id available." ? "unknown" : "error", {
            command: userId === null ? undefined : `/_groups ${userId}`,
            runtimeVersion,
            count: null,
            error: groupsResult.error,
          })
        : countProbe("supported", {
            command: `/_groups ${userId}`,
            runtimeVersion,
            count: groups.length,
          }),
      liveMessages:
        capabilityCommands.liveMessages !== undefined
          ? liveMessages
          : unknownProbe({
              runtimeVersion,
              detail:
                params.account.config.streaming?.nativeTransport === true
                  ? "Live replies are enabled in account config, but no non-mutating runtime probe is available."
                  : "Live replies are disabled in account config.",
            }),
      ttl:
        capabilityCommands.ttl !== undefined
          ? ttl
          : unknownProbe({
              runtimeVersion,
              detail:
                typeof params.account.config.messageTtlSeconds === "number"
                  ? "Message TTL is enabled in account config, but no non-mutating runtime probe is available."
                  : "Message TTL is disabled in account config.",
            }),
      verification,
      moderation,
      files,
      experimentalChannels,
    },
  };
}

export async function probeSimplexRuntimeCapabilities(
  params: SimplexRuntimeCapabilityProbeOptions
): Promise<SimplexRuntimeCapabilityProbeData> {
  if (params.client) {
    return await collectWithClient({ ...params, client: params.client });
  }
  return await withSimplexClient({
    account: params.account,
    run: async (client) => await collectWithClient({ ...params, client }),
  });
}

export function collectSimplexCapabilityIssues(params: {
  account: ResolvedSimplexAccount;
  capabilities: SimplexRuntimeCapabilityReport;
}): string[] {
  const issues: string[] = [];
  if (
    params.account.config.streaming?.nativeTransport === true &&
    params.capabilities.liveMessages.state === "unsupported"
  ) {
    issues.push(
      `SimpleX live replies are enabled, but the runtime reported live message commands as unsupported${
        params.capabilities.liveMessages.error ? `: ${params.capabilities.liveMessages.error}` : "."
      }`
    );
  }

  const entries: Array<[string, SimplexCapabilityProbe]> = [
    ["active user", params.capabilities.activeUser],
    ["version", params.capabilities.version],
    ["users", params.capabilities.users],
    ["contacts", params.capabilities.contacts],
    ["groups", params.capabilities.groups],
    ["live replies", params.capabilities.liveMessages],
    ["message TTL", params.capabilities.ttl],
    ["verification", params.capabilities.verification],
    ["moderation", params.capabilities.moderation],
    ["file controls", params.capabilities.files],
    ["experimental channels", params.capabilities.experimentalChannels],
  ];
  for (const [label, capability] of entries) {
    if (capability.state === "error") {
      issues.push(
        `SimpleX capability probe failed for ${label}${
          capability.error ? `: ${capability.error}` : "."
        }`
      );
    }
  }
  return issues;
}
