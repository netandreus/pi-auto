# pi-auto

<div align="center">
  <img src="logo.png" alt="Pi Cursor Provider" width="400" />
</div>

[![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-server-00D4AA)](https://modelcontextprotocol.io/)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**pi-auto** is a [Pi package](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent#pi-packages) that provides the pi-auto MCP server and a Skill for [pi-coding-agent](https://github.com/badlogic/pi-mono): usage data from [@ccusage/pi](https://www.npmjs.com/package/@ccusage/pi) and tools to switch the active provider by strategy — **load-balancing** (equalize usage across backends) or **high-availability** (fixed priority order).

---

## Prerequisites

Install the following (globally) before using pi-auto:

| Dependency | Description |
|------------|-------------|
| [Pi Coding Agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) | Pi CLI and coding agent (required for `pi` and extensions). |
| [@ccusage/pi](https://www.npmjs.com/package/@ccusage/pi) | Pi-agent usage tracking; used by the MCP server for usage data. |
| **Alias `ccusage`** | Shortcut to run `@ccusage/pi` (see bash below). |
| [pi-mcp-adapter](https://www.npmjs.com/package/pi-mcp-adapter) | MCP adapter for Pi (required to run MCP servers). |
| [@netandreus/pi-cursor-provider](https://www.npmjs.com/package/@netandreus/pi-cursor-provider) | Cursor provider for Pi (optional; for CursorAI backend in usage/strategy). |

**Example: install all globally and set the `ccusage` alias**

```bash
# 1. Pi Coding Agent
npm install -g @mariozechner/pi-coding-agent

# 2. Usage tracking (for pi-auto)
npm install -g @ccusage/pi

# 3. Alias for ccusage (pick one: bash or zsh)
echo "alias ccusage='npx @ccusage/pi@latest'" >> ~/.bashrc
# echo "alias ccusage='npx @ccusage/pi@latest'" >> ~/.zshrc

# 4. Pi MCP adapter (run after Pi is installed)
pi install npm:pi-mcp-adapter

# 5. Cursor provider for Pi (optional)
pi install npm:@netandreus/pi-cursor-provider
```

Then reload your shell (e.g. `source ~/.bashrc` or `source ~/.zshrc`) so `ccusage` is available.

---

## Install (Pi)

**Prerequisite:** Install the MCP adapter in Pi so it can run MCP servers:

```bash
pi install npm:pi-mcp-adapter
```

Install the pi-auto package (Skill is loaded automatically):

```bash
pi install npm:@netandreus/pi-auto
```

Or from git:

```bash
pi install git:github.com/netandreus/pi-auto
```

**MCP config:** Add the MCP server to pi’s config so the agent can call the tools.

**`~/.pi/agent/mcp.json`** (or your pi MCP config path):

If you installed via `pi install npm:@netandreus/pi-auto`, pi uses global npm; point to the installed package. Using the binary name (after a global npm install of the package):

```json
{
  "mcpServers": {
      "pi-auto": {
        "command": "pi-auto-mcp",
        "lifecycle": "keep-alive",
        "directTools": true
      }
  }
}
```

Or with explicit path (replace `GLOBAL_NPM_ROOT` with the output of `npm root -g`):

```json
{
  "mcpServers": {
      "pi-auto": {
        "command": "node",
        "args": ["GLOBAL_NPM_ROOT/@netandreus/pi-auto/dist/index.js"],
        "lifecycle": "keep-alive",
        "directTools": true
      }
  }
}
```

Exposed tools: `mcp_pi-auto_pi_get_usage`, `mcp_pi-auto_pi_suggest_provider`, `mcp_pi-auto_pi_set_provider`, `mcp_pi-auto_pi_get_provider`, `mcp_pi-auto_pi_get_strategy`, `mcp_pi-auto_pi_set_strategy`, `mcp_pi-auto_pi_get_priority`, `mcp_pi-auto_pi_set_priority`.

**Skill:** The Skill is loaded automatically when the package is installed. Invoke with `/skill:pi-auto` or ask about usage, balancing cost, or switching provider.

---

## Features

| Tool | Description |
|------|-------------|
| **pi_get_usage** | Current usage (tokens/cost) per backend (Claude Code, OpenAI Codex, CursorAI) for a given period (e.g. daily). |
| **pi_suggest_provider** | Recommends `provider` and `model` based on current strategy and priority. |
| **pi_set_provider** | Writes pi’s `defaultProvider` and `defaultModel` (global or project scope). |
| **pi_get_provider** | Reads current pi default provider and model. |
| **pi_get_strategy** / **pi_set_strategy** | Get or set strategy: `load-balancing` or `high-availability`. |
| **pi_get_priority** / **pi_set_priority** | Get or set the HA priority order (e.g. `["codex", "claude-code", "cursorai"]`). |

---

## Configuration

**Requirements:** Node 18+, and (for usage data) [@ccusage/pi](https://www.npmjs.com/package/@ccusage/pi) available via `npx`.

### Environment

| Variable | Description |
|----------|-------------|
| **`PI_AGENT_DIR`** | Override pi-agent sessions directory (used when calling `@ccusage/pi`; default: `~/.pi/agent/sessions`). |
| **`CCUSAGE_MCP_SETTINGS_PATH`** | Override path to pi’s **global** settings file (default: `~/.pi/agent/settings.json`). |

### Server config

Strategy and priority are stored in **`~/.pi/agent/pi-auto.json`**.

Example:

```json
{
  "strategy": "load-balancing",
  "priority": ["codex", "claude-code", "cursorai"],
  "defaultModels": {
    "claude-code": { "provider": "anthropic", "model": "claude-sonnet-4-20250514" },
    "codex": { "provider": "openai", "model": "gpt-4o" },
    "cursorai": { "provider": "cursor", "model": "auto" }
  }
}
```

| Field | Description |
|-------|-------------|
| **strategy** | `"load-balancing"` (default) or `"high-availability"`. |
| **priority** | Ordered list of backend ids for HA; first is preferred. Valid ids: `claude-code`, `codex`, `cursorai`. |
| **defaultModels** | Optional overrides for provider/model per backend (must match your installed pi providers). |

---

## Usage strategies

- **Load-balancing** — `pi_suggest_provider` picks the backend with the **lowest** current usage (total tokens). Use `pi_get_usage` to see per-backend totals; then call `pi_suggest_provider` and optionally `pi_set_provider` to switch.
- **High-availability** — `pi_suggest_provider` returns the **first** backend in `priority` (and its default model). Use `pi_set_priority` to change the order (e.g. prefer Codex, then Claude, then CursorAI).

When you need to balance cost or ensure a preferred provider, use the pi-auto tools: get/set strategy and priority, get current provider, get usage, suggest a provider, and set it with `pi_set_provider`.

---

## Backend mapping

Usage from `@ccusage/pi` (with `--json --breakdown`) is mapped to three backends:

| Backend | Source |
|---------|--------|
| **Claude Code** | `anthropic` / `claude-*` models |
| **OpenAI Codex** | `openai` / `gpt-*` models |
| **CursorAI** | `cursor` (e.g. [@netandreus/pi-cursor-provider](https://www.npmjs.com/package/@netandreus/pi-cursor-provider)) |

You can override mapping and default models in `~/.pi/agent/pi-auto.json` if your setup differs.

---

## Publishing (npm)

To publish to [npmjs.com](https://www.npmjs.com/):

1. **Log in:** `npm login` (use an account with access to the `@netandreus` scope).
2. **Bump version** in `package.json` (e.g. `0.1.0` → `0.1.1`).
3. **Build and publish:**  
   `npm publish`  
   (runs `prepublishOnly` → `yarn build`, then publishes; scoped package is published as public via `publishConfig.access`.)

To see what will be included: `npm pack --dry-run`.

---

## License

[MIT](LICENSE)
