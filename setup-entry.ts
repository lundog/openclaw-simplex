import { defineSetupPluginEntry } from "openclaw/plugin-sdk/channel-core";
import { simplexPlugin } from "./src/channel/plugin.js";

const setupEntry: ReturnType<typeof defineSetupPluginEntry> = defineSetupPluginEntry(simplexPlugin);

export default setupEntry;
