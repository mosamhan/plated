@AGENTS.md

## OpenClaw integration

This machine runs a local OpenClaw gateway that can route Discord DMs to a coding agent bound to this repo. None of this is required to develop the app — it's optional infra layered on top.

**Gateway:** loopback only, dashboard at http://127.0.0.1:18789/. Manage via `openclaw status`, `openclaw doctor`, `openclaw gateway status --deep`.

**Agent for this repo:** `plated` (workspace = this directory, model `anthropic/claude-opus-4-7`, 200k ctx). The default agent is `main` (general-purpose workspace at `~/.openclaw/workspace`). Discord is routed to `plated` (`openclaw agents bindings` → `plated <- discord`); list agents with `openclaw agents list`.

**Memory:** semantic recall via `ollama` + `nomic-embed-text` (local embeddings). Status: `openclaw memory status --deep`. Node 23.11's bundled SQLite is built without FTS5, so keyword/full-text fallback is unavailable; semantic search works normally.

**Secrets:** never store API keys or tokens as plaintext in `~/.openclaw/openclaw.json`. Use SecretRefs pointing at files in `~/.openclaw/secrets/` (perms `600`). Audit with `openclaw secrets audit --check`. Currently configured: Anthropic API key, Discord bot token, gateway auth token.

**Discord channel (DM-only):** command owner `discord:931979428316209153`; `groupPolicy=disabled`; `dmPolicy=pairing`. The first DM from an unknown sender triggers a one-time pairing code — approve via:

```
openclaw pairing list discord
openclaw pairing approve discord <code>
```

**Coding-agent skill:** enabled for `plated`. OpenClaw can delegate coding work to the `claude` CLI as a background worker against this workspace, invoked from Discord. Inspect with `openclaw skills info coding-agent --agent plated`. Use it for non-trivial tasks; not simple edits or read-only lookups.
