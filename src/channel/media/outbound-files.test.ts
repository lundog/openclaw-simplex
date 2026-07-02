import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cleanupStagedOutboundFiles,
  isSimplexReadablePath,
  resolveSimplexOutboundDir,
  stageOutboundBuffer,
  stageOutboundLocalFile,
} from "./outbound-files.js";

function cfg(
  connection: Record<string, unknown>,
  account?: Record<string, unknown>
): OpenClawConfig {
  return {
    channels: {
      "openclaw-simplex": {
        connection,
        ...(account ? { accounts: { acct: { connection: account } } } : {}),
      },
    },
  } as unknown as OpenClawConfig;
}

describe("resolveSimplexOutboundDir", () => {
  it("returns undefined when outboundFolder is not set (feature disabled)", () => {
    expect(resolveSimplexOutboundDir({ cfg: cfg({}) })).toBeUndefined();
  });

  it("reads connection.outboundFolder at the channel level", () => {
    expect(resolveSimplexOutboundDir({ cfg: cfg({ outboundFolder: "/simplex/outbound" }) })).toBe(
      "/simplex/outbound"
    );
  });

  it("lets the account override the channel", () => {
    const c = cfg({ outboundFolder: "/simplex/outbound" }, { outboundFolder: "/other/out" });
    expect(resolveSimplexOutboundDir({ cfg: c, accountId: "acct" })).toBe("/other/out");
  });

  it("expands a leading ~", () => {
    expect(resolveSimplexOutboundDir({ cfg: cfg({ outboundFolder: "~/out" }) })).toBe(
      path.join(os.homedir(), "out")
    );
  });
});

describe("isSimplexReadablePath", () => {
  it("is true only for paths inside the outbound dir", () => {
    expect(isSimplexReadablePath("/simplex/outbound/a.jpg", "/simplex/outbound")).toBe(true);
    expect(isSimplexReadablePath("/simplex/outbound", "/simplex/outbound")).toBe(false);
    expect(isSimplexReadablePath("/tmp/a.jpg", "/simplex/outbound")).toBe(false);
    // guards against a sibling prefix match (/simplex/outbound-2)
    expect(isSimplexReadablePath("/simplex/outbound-2/a.jpg", "/simplex/outbound")).toBe(false);
  });
});

describe("staging + cleanup", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "sx-outbound-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("stages a buffer with a unique name and cleans it up after send", async () => {
    const staged = await stageOutboundBuffer({
      outboundDir: dir,
      buffer: new TextEncoder().encode("hello"),
      fileName: "pic.jpg",
    });
    expect(staged.startsWith(dir)).toBe(true);
    expect(staged.endsWith("-pic.jpg")).toBe(true);
    expect(await readFile(staged, "utf8")).toBe("hello");

    await cleanupStagedOutboundFiles([
      { fileSource: { filePath: staged }, msgContent: { type: "file", text: "" }, mentions: {} },
    ]);
    await expect(readFile(staged)).rejects.toThrow();
  });

  it("copies a local file into the outbound dir", async () => {
    const src = path.join(dir, "src.txt");
    await writeFile(src, "data");
    const staged = await stageOutboundLocalFile({ outboundDir: dir, sourcePath: src });
    expect(staged).not.toBe(src);
    expect(await readFile(staged, "utf8")).toBe("data");
  });

  it("leaves non-staged (pre-existing) outbound files alone on cleanup", async () => {
    const preexisting = path.join(dir, "keep.jpg");
    await writeFile(preexisting, "keep");
    await cleanupStagedOutboundFiles([
      {
        fileSource: { filePath: preexisting },
        msgContent: { type: "file", text: "" },
        mentions: {},
      },
    ]);
    expect(await readFile(preexisting, "utf8")).toBe("keep");
  });
});
