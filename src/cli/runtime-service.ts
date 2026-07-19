import { constants as fsConstants } from "node:fs";
import { access, mkdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { DEFAULT_SIMPLEX_FILES_FOLDER, DEFAULT_SIMPLEX_TEMP_FOLDER } from "../constants.js";
import { expandHome } from "../fs-paths.js";

export type RuntimeServiceProvider = "auto" | "systemd" | "launchd" | "sysvinit";

export type RuntimeServiceOptions = {
  provider?: RuntimeServiceProvider;
  port?: string;
  simplexChatPath?: string;
  deviceName?: string;
  filesFolder?: string;
  tempFolder?: string;
  dryRun?: boolean;
};

type ResolvedRuntimeService = {
  provider: Exclude<RuntimeServiceProvider, "auto">;
  servicePath: string;
  installCommand: string[];
  startCommand: string[];
  stopCommand: string[];
  statusCommand: string[];
  content: string;
};

function readPort(value: string | undefined): number {
  const token = value?.trim() || "5225";
  const parsed = /^[0-9]+$/.test(token) ? Number(token) : Number.NaN;
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error("port must be an integer between 1 and 65535");
  }
  return parsed;
}

function shellQuote(value: string): string {
  return value.length > 0 && /^[A-Za-z0-9_./:=@%+-]+$/.test(value)
    ? value
    : `'${value.replaceAll("'", "'\\''")}'`;
}

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function pathExists(value: string): Promise<boolean> {
  try {
    await access(value, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function commandExists(command: string): Promise<boolean> {
  const paths = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  for (const dir of paths) {
    const candidate = path.join(dir, command);
    try {
      const stats = await stat(candidate);
      if (stats.isFile()) {
        await access(candidate, fsConstants.X_OK);
        return true;
      }
    } catch {
      // keep scanning PATH
    }
  }
  return false;
}

async function detectProvider(
  requested: RuntimeServiceProvider | undefined
): Promise<Exclude<RuntimeServiceProvider, "auto">> {
  if (
    requested !== undefined &&
    requested !== "auto" &&
    requested !== "systemd" &&
    requested !== "launchd" &&
    requested !== "sysvinit"
  ) {
    throw new Error('provider must be "auto", "systemd", "launchd", or "sysvinit"');
  }
  if (requested === "systemd" || requested === "launchd" || requested === "sysvinit") {
    return requested;
  }
  if (process.platform === "darwin") {
    return "launchd";
  }
  if (process.platform === "linux" && (await commandExists("systemctl"))) {
    return "systemd";
  }
  if (process.platform === "linux" && (await pathExists("/etc/init.d"))) {
    return "sysvinit";
  }
  throw new Error(
    "Could not auto-detect a supported service manager. Use --provider systemd, --provider launchd, or --provider sysvinit."
  );
}

export function resolveRuntimeService(
  provider: Exclude<RuntimeServiceProvider, "auto">,
  opts: RuntimeServiceOptions
): ResolvedRuntimeService {
  const home = os.homedir();
  const port = readPort(opts.port);
  const simplexChatPath = expandHome(opts.simplexChatPath?.trim() || "simplex-chat");
  const deviceName = opts.deviceName?.trim() || "OpenClaw SimpleX";
  const filesFolder = expandHome(opts.filesFolder?.trim() || DEFAULT_SIMPLEX_FILES_FOLDER);
  const tempFolder = expandHome(opts.tempFolder?.trim() || DEFAULT_SIMPLEX_TEMP_FOLDER);

  if (provider === "systemd") {
    const servicePath = path.join(home, ".config/systemd/user/simplex-chat.service");
    const execStart = [
      simplexChatPath,
      "-p",
      String(port),
      "--device-name",
      deviceName,
      "--files-folder",
      filesFolder,
      "--temp-folder",
      tempFolder,
    ]
      .map(shellQuote)
      .join(" ");
    return {
      provider,
      servicePath,
      installCommand: ["systemctl", "--user", "daemon-reload"],
      startCommand: ["systemctl", "--user", "enable", "--now", "simplex-chat.service"],
      stopCommand: ["systemctl", "--user", "disable", "--now", "simplex-chat.service"],
      statusCommand: ["systemctl", "--user", "status", "simplex-chat.service"],
      content: `[Unit]
Description=SimpleX Chat WebSocket Runtime
After=network-online.target

[Service]
ExecStartPre=/bin/mkdir -p ${shellQuote(filesFolder)} ${shellQuote(tempFolder)}
ExecStart=${execStart}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
`,
    };
  }

  if (provider === "sysvinit") {
    const servicePath = "/etc/init.d/simplex-chat";
    const runAsUser = process.env.SUDO_USER?.trim() || os.userInfo().username;
    const daemonArgs = [
      simplexChatPath,
      "-p",
      String(port),
      "--device-name",
      deviceName,
      "--files-folder",
      filesFolder,
      "--temp-folder",
      tempFolder,
    ]
      .map(shellQuote)
      .join(" ");
    return {
      provider,
      servicePath,
      installCommand: [
        "sh",
        "-c",
        `chmod +x ${shellQuote(servicePath)} && (command -v update-rc.d >/dev/null && update-rc.d simplex-chat defaults || true)`,
      ],
      startCommand: ["service", "simplex-chat", "start"],
      stopCommand: ["service", "simplex-chat", "stop"],
      statusCommand: ["service", "simplex-chat", "status"],
      content: `#!/bin/sh
### BEGIN INIT INFO
# Provides:          simplex-chat
# Required-Start:    $network
# Required-Stop:     $network
# Default-Start:     2 3 4 5
# Default-Stop:      0 1 6
# Short-Description: SimpleX Chat WebSocket Runtime
### END INIT INFO

RUN_AS_USER=${shellQuote(runAsUser)}
PIDFILE=/var/run/simplex-chat-openclaw.pid

case "$1" in
  start)
    mkdir -p ${shellQuote(filesFolder)} ${shellQuote(tempFolder)}
    chown "$RUN_AS_USER" ${shellQuote(filesFolder)} ${shellQuote(tempFolder)} 2>/dev/null || true
    start-stop-daemon --start --background --make-pidfile --pidfile "$PIDFILE" --chuid "$RUN_AS_USER" --startas /bin/sh -- -c 'exec "$@"' simplex-chat-openclaw ${daemonArgs}
    ;;
  stop)
    start-stop-daemon --stop --pidfile "$PIDFILE" --retry TERM/10/KILL/5
    rm -f "$PIDFILE"
    ;;
  status)
    start-stop-daemon --status --pidfile "$PIDFILE"
    ;;
  restart)
    "$0" stop
    "$0" start
    ;;
  *)
    echo "Usage: $0 {start|stop|status|restart}"
    exit 2
    ;;
esac
exit $?
`,
    };
  }

  const servicePath = path.join(home, "Library/LaunchAgents/ai.openclaw.simplex-chat.plist");
  const runtimeArgs = [
    simplexChatPath,
    "-p",
    String(port),
    "--device-name",
    deviceName,
    "--files-folder",
    filesFolder,
    "--temp-folder",
    tempFolder,
  ];
  // launchd has no ExecStartPre, so mkdir in a wrapping shell, then exec so
  // launchd tracks the runtime process and not the shell.
  const launchShellCommand = `mkdir -p ${shellQuote(filesFolder)} ${shellQuote(tempFolder)} && exec ${runtimeArgs.map(shellQuote).join(" ")}`;
  const args = ["/bin/sh", "-c", launchShellCommand];
  const argXml = args.map((arg) => `          <string>${xmlEscape(arg)}</string>`).join("\n");
  return {
    provider,
    servicePath,
    installCommand: [
      "launchctl",
      "bootstrap",
      `gui/${process.getuid?.() ?? "$(id -u)"}`,
      servicePath,
    ],
    startCommand: [
      "launchctl",
      "kickstart",
      "-k",
      `gui/${process.getuid?.() ?? "$(id -u)"}/ai.openclaw.simplex-chat`,
    ],
    stopCommand: ["launchctl", "bootout", `gui/${process.getuid?.() ?? "$(id -u)"}`, servicePath],
    statusCommand: [
      "launchctl",
      "print",
      `gui/${process.getuid?.() ?? "$(id -u)"}/ai.openclaw.simplex-chat`,
    ],
    content: `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>ai.openclaw.simplex-chat</string>
    <key>ProgramArguments</key>
    <array>
${argXml}
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
  </dict>
</plist>
`,
  };
}

function printServicePlan(service: ResolvedRuntimeService): void {
  console.log(
    JSON.stringify(
      {
        provider: service.provider,
        servicePath: service.servicePath,
        installCommand: service.installCommand,
        startCommand: service.startCommand,
        stopCommand: service.stopCommand,
        statusCommand: service.statusCommand,
        content: service.content,
      },
      null,
      2
    )
  );
}

function printCommand(label: string, command: string[]): void {
  console.log(`${label}: ${command.map(shellQuote).join(" ")}`);
}

async function confirmAction(message: string): Promise<boolean> {
  if (!input.isTTY) {
    throw new Error(`${message} Refusing because stdin is not interactive.`);
  }
  const rl = createInterface({ input, output });
  try {
    const answer = (await rl.question(`${message} Type "y" to continue: `)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

export async function runRuntimeServiceInstallCli(opts: RuntimeServiceOptions): Promise<void> {
  const provider = await detectProvider(opts.provider);
  const service = resolveRuntimeService(provider, opts);
  printServicePlan(service);
  if (opts.dryRun) {
    return;
  }
  const approved = await confirmAction(
    `Create directory ${path.dirname(service.servicePath)} and write ${service.servicePath}.`
  );
  if (!approved) {
    console.log("Skipped.");
    return;
  }
  await mkdir(path.dirname(service.servicePath), { recursive: true });
  await writeFile(service.servicePath, service.content, "utf8");
  console.log(`Wrote ${service.servicePath}`);
  printCommand("Run after install", service.installCommand);
  printCommand("Start service", service.startCommand);
}
