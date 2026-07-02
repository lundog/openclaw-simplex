import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cleanupStagedOutboundFiles,
  isSimplexReadablePath,
  resolveSimplexOutboundClientDir,
  resolveSimplexOutboundDir,
  stageOutboundBuffer,
  stageOutboundLocalFile,
  toClientOutboundPath,
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

describe("resolveSimplexOutboundClientDir", () => {
  it("returns undefined when not set", () => {
    expect(resolveSimplexOutboundClientDir({ cfg: cfg({ outboundFolder: "/w" }) })).toBeUndefined();
  });

  it("reads connection.outboundFolderOnClient (account overrides channel)", () => {
    const c = cfg(
      { outboundFolderOnClient: "/data/.simplex/outbound" },
      { outboundFolderOnClient: "/other/client" }
    );
    expect(resolveSimplexOutboundClientDir({ cfg: c, accountId: "acct" })).toBe("/other/client");
  });

  it("does NOT expand ~ (it's a path on the runtime's side)", () => {
    expect(resolveSimplexOutboundClientDir({ cfg: cfg({ outboundFolderOnClient: "~/x" }) })).toBe(
      "~/x"
    );
  });
});

describe("toClientOutboundPath", () => {
  it("returns the path unchanged when no client dir (verbatim)", () => {
    expect(toClientOutboundPath("/w/out/a.jpg", "/w/out")).toBe("/w/out/a.jpg");
  });

  it("swaps the outbound-dir prefix for the client dir", () => {
    expect(toClientOutboundPath("/w/out/a.jpg", "/w/out", "/data/.simplex/outbound")).toBe(
      "/data/.simplex/outbound/a.jpg"
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

  it("with a client dir: writes on disk in outboundDir, sends the translated path, cleans up the real file", async () => {
    const clientDir = "/data/.simplex/outbound";
    const sent = await stageOutboundBuffer({
      outboundDir: dir,
      clientDir,
      buffer: new TextEncoder().encode("hi"),
      fileName: "pic.jpg",
    });
    // the path sent to the runtime is under the client dir, not the write dir
    expect(sent.startsWith(clientDir)).toBe(true);
    expect(sent.startsWith(dir)).toBe(false);
    // the actual bytes live under the local write dir, same basename
    const onDisk = path.join(dir, path.basename(sent));
    expect(await readFile(onDisk, "utf8")).toBe("hi");

    // cleanup is keyed by the sent path but deletes the on-disk file
    await cleanupStagedOutboundFiles([
      { fileSource: { filePath: sent }, msgContent: { type: "file", text: "" }, mentions: {} },
    ]);
    await expect(readFile(onDisk)).rejects.toThrow();
  });

  it("creates the outbound dir if it does not exist yet", async () => {
    const nested = path.join(dir, "does/not/exist/yet");
    const staged = await stageOutboundBuffer({
      outboundDir: nested,
      buffer: new TextEncoder().encode("x"),
      fileName: "a.bin",
    });
    expect(staged.startsWith(nested)).toBe(true);
    expect(await readFile(staged, "utf8")).toBe("x");
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
