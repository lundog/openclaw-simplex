import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  isInboundSimplexChatItem,
  resolveSimplexChatContext,
  resolveSimplexMessageText,
} from "../../channel/events/simplex-event-parser.js";
import type { SimplexChatItem } from "../../types/events.js";
import type { SimplexRuntimeResponse } from "../../types/simplex.js";
import { extractSimplexLink } from "./links.js";
import {
  readSimplexArrayField,
  readSimplexObjectField,
  unwrapSimplexCommandResponse,
} from "./responses.js";

type SimplexSmokePayloadFixture = {
  meta: {
    runtime: string;
    runtimeVersion: string;
    source: string;
    capturedAt: string;
  };
  events: {
    directMessageItem: SimplexChatItem;
    groupMessageItem: SimplexChatItem;
    fileMessageItem: SimplexChatItem;
  };
  responses: {
    contacts: SimplexRuntimeResponse;
    groups: SimplexRuntimeResponse;
    activeUser: SimplexRuntimeResponse;
    connectLink: SimplexRuntimeResponse;
    nativeContactLink: SimplexRuntimeResponse;
    commandError: SimplexRuntimeResponse;
  };
};

const fixture = readFixture("simplex-v6.5.4-smoke.json");

function readFixture(name: string): SimplexSmokePayloadFixture {
  const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__", name);
  return JSON.parse(readFileSync(fixturePath, "utf8")) as SimplexSmokePayloadFixture;
}

describe("simplex v6.5.4 payload contracts", () => {
  it("identifies the runtime fixture source", () => {
    expect(fixture.meta).toMatchObject({
      runtime: "simplex-chat",
      runtimeVersion: "6.5.4",
      capturedAt: "2026-06-07",
    });
  });

  it("maps inbound direct message items into direct chat context", () => {
    const item = fixture.events.directMessageItem;

    expect(isInboundSimplexChatItem(item)).toBe(true);
    expect(resolveSimplexChatContext(item)).toEqual({
      chatType: "direct",
      chatId: 4,
      chatLabel: "Release Tester",
      senderId: "4",
      senderName: "Release Tester",
    });
    expect(resolveSimplexMessageText(item.chatItem?.content?.msgContent)).toBe("hi from dm");
  });

  it("maps inbound group message items into group chat context", () => {
    const item = fixture.events.groupMessageItem;

    expect(isInboundSimplexChatItem(item)).toBe(true);
    expect(resolveSimplexChatContext(item)).toEqual({
      chatType: "group",
      chatId: 2,
      chatLabel: "Release_1",
      senderId: "4",
      senderName: "Release Tester",
    });
    expect(resolveSimplexMessageText(item.chatItem?.content?.msgContent)).toBe("hi from group");
  });

  it("maps inbound file items into file text and keeps file metadata available", () => {
    const item = fixture.events.fileMessageItem;

    expect(isInboundSimplexChatItem(item)).toBe(true);
    expect(resolveSimplexChatContext(item)).toMatchObject({
      chatType: "direct",
      chatId: 4,
      senderId: "4",
    });
    expect(
      resolveSimplexMessageText(item.chatItem?.content?.msgContent, item.chatItem?.file?.fileName)
    ).toBe("[file: smoke.txt]");
    expect(item.chatItem?.file).toMatchObject({
      fileId: 31,
      fileSource: { filePath: "/tmp/simplex/smoke.txt" },
    });
  });

  it("extracts common SimpleX command response arrays and objects", () => {
    expect(
      readSimplexArrayField(unwrapSimplexCommandResponse(fixture.responses.contacts), ["contacts"])
    ).toHaveLength(1);
    expect(
      readSimplexArrayField(unwrapSimplexCommandResponse(fixture.responses.groups), ["groups"])
    ).toHaveLength(1);
    expect(
      readSimplexObjectField(unwrapSimplexCommandResponse(fixture.responses.activeUser), ["user"])
    ).toMatchObject({ userId: 1 });
  });

  it("extracts native and web SimpleX links from captured response shapes", () => {
    expect(
      extractSimplexLink(unwrapSimplexCommandResponse(fixture.responses.nativeContactLink))
    ).toBe("simplex:/contact#release-test");
    expect(extractSimplexLink(unwrapSimplexCommandResponse(fixture.responses.connectLink))).toBe(
      "simplex:/contact#/?v=2-7&smp=smp%3A%2F%2Fanonymized%3D%40smp18.simplex.im%2Fanonymized"
    );
  });

  it("normalizes command errors", () => {
    expect(() => unwrapSimplexCommandResponse(fixture.responses.commandError)).toThrow(
      "invalid connection link"
    );
  });
});
