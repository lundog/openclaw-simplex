# @dangoldbj/openclaw-simplex

> **TL;DR:** An OpenClaw channel for SimpleX Chat: invite-based reachability, end-to-end encrypted messaging, and no public bot account or hosted bot platform in the middle.

Most agent chat channels in OpenClaw assume a platform bot identity: a bot username, a phone number, an app registration, or another platform-managed endpoint. This plugin takes a different route: the contact path is created by a SimpleX one-time invite link or reusable SimpleX address, then OpenClaw policy sits on top of that link-based contact surface.

The runtime model is intentionally explicit. This plugin talks to an external long-running `simplex-chat` WebSocket runtime. OpenClaw enforces policy and runs the agent; the plugin translates SimpleX events/actions; `simplex-chat` owns the SimpleX account, database, and network connection.

## Why This Matters

**Invite-based reachability.** Share a one-time invite link or address link with the people who should reach the agent. There is no public bot handle, phone number, or workspace app registration required for the contact path.

**Self-hostable runtime and relay path.** Run `simplex-chat` and, if needed, SimpleX relays in your own environment. If you use public relays, traffic still traverses that relay infrastructure even though message contents are end-to-end encrypted.

**Agent-to-agent chat transport.** Two OpenClaw instances can exchange chat messages over SimpleX without a shared bot API platform. This is chat transport, not an implementation of OpenClaw's native federated A2A/session protocol over SimpleX.

## Quick Start

1. Start `simplex-chat` with the WebSocket API enabled, usually bound to loopback:

```bash
simplex-chat -p 5225
```

2. Install and enable the plugin:

```bash
openclaw plugins install @dangoldbj/openclaw-simplex
openclaw plugins enable openclaw-simplex
```

3. Configure the channel:

```bash
openclaw channels add --channel openclaw-simplex
```

That writes a default loopback WebSocket config. Equivalent minimal config:

```json
{
  "channels": {
    "openclaw-simplex": {
      "enabled": true,
      "connection": {
        "mode": "external",
        "wsUrl": "ws://127.0.0.1:5225"
      }
    }
  }
}
```

4. Generate an invite link:

```bash
openclaw simplex invite create --qr
```

Scan it with the SimpleX app. With the default `dmPolicy: "pairing"`, approve the first sender before the agent responds:

```bash
openclaw pairing list
openclaw pairing approve openclaw-simplex <pairingCode>
```

## What This Plugin Provides

- Direct and group messaging over SimpleX
- Media send/receive support
- Pairing approval, exec approval auth, and allowlist enforcement
- One-time invite link, SimpleX address, and QR generation
- Shared `message` actions including `upload-file`, reactions, polls, edits, deletes, and group actions
- Gateway methods for invites, runtime diagnostics, contact requests, group links, and operator-controlled link onboarding
- Runtime status reporting, command handling, heartbeat readiness, and Control UI configuration
- Hardened WebSocket endpoint checks for unsafe plaintext remote runtimes

## Operator CLI

```bash
# Runtime diagnostics
openclaw simplex runtime status
openclaw simplex runtime doctor

# One-time invite links and SimpleX addresses
openclaw simplex invite create --qr
openclaw simplex invite list
openclaw simplex address show --qr
openclaw simplex address revoke

# Pending SimpleX contact requests
openclaw simplex requests list
openclaw simplex requests accept --contact-request-id <id>
openclaw simplex requests reject --contact-request-id <id>

# SimpleX groups and group invite links
openclaw simplex groups create --display-name "OpenClaw Ops"
openclaw simplex groups link create --group-id <id> --role member --qr
openclaw simplex groups link revoke --group-id <id>

# Operator-controlled link onboarding
openclaw simplex connect plan --link "<simplex-link>"
openclaw simplex connect run --link "<simplex-link>"
```

## Runtime Boundary

```text
OpenClaw
  | channel plugin API
  v
@dangoldbj/openclaw-simplex
  | WebSocket commands/events
  v
external simplex-chat runtime
  | SimpleX network
  v
SimpleX contacts, groups, and relays
```

Keep the split clear:

- OpenClaw owns policy, routing, pairing, approval auth, and agent execution.
- This plugin owns channel translation, action handling, and gateway/CLI surfaces.
- `simplex-chat` owns the SimpleX account, database, message transport, and relay connectivity.

Full docs: https://openclaw-simplex.mintlify.app/

Deployment examples live in `examples/`, including Docker sidecar, systemd, and Caddy TLS proxy templates.
