import { describe, expect, it } from "vitest";
import { resolveRuntimeService } from "./runtime-service.js";

// The folders must exist before simplex-chat starts, or file transfers fail
// silently (simplex-chat with -p logs nothing).
const opts = { filesFolder: "/srv/simplex/files", tempFolder: "/srv/simplex/tmp" };

describe("resolveRuntimeService ensures the runtime folders exist on start", () => {
  it("systemd: ExecStartPre makes the files/temp folders before ExecStart", () => {
    const svc = resolveRuntimeService("systemd", opts);
    expect(svc.content).toContain("ExecStartPre=/bin/mkdir -p /srv/simplex/files /srv/simplex/tmp");
    expect(svc.content).toContain("--files-folder /srv/simplex/files");
    expect(svc.content).toContain("--temp-folder /srv/simplex/tmp");
    expect(svc.content.indexOf("ExecStartPre=")).toBeLessThan(svc.content.indexOf("ExecStart="));
  });

  it("launchd: wraps the runtime in a shell that mkdirs then execs", () => {
    const svc = resolveRuntimeService("launchd", opts);
    expect(svc.content).toContain("<string>/bin/sh</string>");
    expect(svc.content).toContain("<string>-c</string>");
    // && is XML-escaped inside the plist string
    expect(svc.content).toContain("mkdir -p /srv/simplex/files /srv/simplex/tmp &amp;&amp; exec");
  });

  it("sysvinit: start creates the folders and chowns them to the run user", () => {
    const svc = resolveRuntimeService("sysvinit", opts);
    expect(svc.content).toContain("mkdir -p /srv/simplex/files /srv/simplex/tmp");
    expect(svc.content).toContain('chown "$RUN_AS_USER" /srv/simplex/files /srv/simplex/tmp');
  });
});
