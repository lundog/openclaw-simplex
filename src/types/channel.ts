export type SimplexExplicitTarget = {
  to: string;
  chatType: "direct" | "group" | "channel";
};

export type SimplexTargetKind = SimplexExplicitTarget["chatType"] | null;
