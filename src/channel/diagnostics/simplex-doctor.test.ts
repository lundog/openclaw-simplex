import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { afterEach, describe, expect, it } from "vitest";
import { simplexDoctor } from "./simplex-doctor.js";

function previewWarnings(cfg: OpenClawConfig): Promise<string[]> {
  return Promise.resolve(
    simplexDoctor.collectPreviewWarnings?.({ cfg, doctorFixCommand: "openclaw doctor --fix" }) ?? []
  );
}

describe("simplex doctor", () => {
  it("describes SimpleX policy model for OpenClaw doctor", () => {
    expect(simplexDoctor).toMatchObject({
      groupModel: "sender",
      dmAllowFromMode: "topOrNested",
      warnOnEmptyGroupSenderAllowlist: true,
    });
  });

  it("warns about legacy config and empty allowlists", async () => {
    const cfg = {
      channels: {
        simplex: {},
        "openclaw-simplex": {
          dmPolicy: "allowlist",
          allowFrom: [],
          groupPolicy: "allowlist",
          groupAllowFrom: [],
          accounts: {
            alt: {
              dmPolicy: "allowlist",
              allowFrom: [],
              groupPolicy: "allowlist",
              groupAllowFrom: [],
            },
          },
        },
      },
    } as OpenClawConfig;

    const warnings = await (simplexDoctor.collectPreviewWarnings?.({
      cfg,
      doctorFixCommand: "openclaw doctor --fix",
    }) ?? []);

    expect(warnings.join("\n")).toContain("Legacy channels.simplex config is present");
    expect(warnings.join("\n")).toContain('dmPolicy="allowlist" is configured with an empty');
    expect(warnings.join("\n")).toContain('groupPolicy="allowlist" is configured with an empty');
  });
});

describe("simplex doctor files-folder check", () => {
  let dir: string | undefined;
  afterEach(async () => {
    if (dir) {
      await rm(dir, { recursive: true, force: true });
      dir = undefined;
    }
  });

  it("warns when connection.filesFolder does not exist", async () => {
    const cfg = {
      channels: {
        "openclaw-simplex": {
          connection: { filesFolder: "/no/such/simplex/files" },
        },
      },
    } as OpenClawConfig;

    const warnings = await previewWarnings(cfg);
    expect(warnings.join("\n")).toContain("/no/such/simplex/files");
    expect(warnings.join("\n")).toContain("missing or not writable");
  });

  it("does not warn when the files-folder exists and is writable", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "sx-doctor-"));
    const cfg = {
      channels: {
        "openclaw-simplex": { connection: { filesFolder: dir } },
      },
    } as OpenClawConfig;

    const warnings = await previewWarnings(cfg);
    expect(warnings.some((w) => w.includes("files") && w.includes("not writable"))).toBe(false);
  });
});
