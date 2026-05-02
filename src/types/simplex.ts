export type SimplexChatType = "direct" | "group" | "local";
export type SimplexChatRef = {
  type: SimplexChatType;
  id: number | string;
  scope?: string | null;
};

export type SimplexNumericChatRef = ["direct" | "group", number];

export type SimplexMsgContent = {
  type: "text" | "link" | "image" | "video" | "voice" | "file" | "report" | "chat" | "unknown";
  text: string;
  [key: string]: unknown;
};

export type SimplexComposedMessage = {
  msgContent: SimplexMsgContent;
  quotedItemId?: number;
  fileSource?: {
    filePath: string;
    cryptoArgs?: { fileKey: string; fileNonce: string };
  };
  mentions?: Record<string, number>;
};

export type SimplexDeleteMode = "broadcast" | "internal" | "internalMark";
export type SimplexReaction = Record<string, unknown>;
export type SimplexGroupMemberRole =
  | "observer"
  | "author"
  | "member"
  | "moderator"
  | "admin"
  | "owner";
export type SimplexGroupProfile = {
  displayName: string;
  fullName?: string;
  description?: string;
};

export type SimplexRuntimeResponse = {
  corrId?: string;
  resp?: {
    type: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type SimplexRuntimeEvent = {
  type: string;
  [key: string]: unknown;
};

export type SimplexChatEvent = SimplexRuntimeEvent;

export type SimplexLogger = {
  info?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
  debug?: (message: string) => void;
};
