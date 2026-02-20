---
name: pi-auto
description: Observes token and cost usage per backend (Claude Code, Codex, CursorAI) via pi-auto and switches pi's default provider/model based on strategy (load-balancing or high-availability). Use when the user asks to check usage, balance cost, switch provider or model, set load-balancing or high-availability, or to use ccusage or switch provider by usage.
---

# pi-auto: Token Usage and Provider Switching

## Prerequisite

The **pi-auto** must be configured in pi's MCP config (e.g. `~/.pi/agent/mcp.json`) so the following tools are available:

- **pi_get_usage** — Current usage (tokens/cost) per backend (Claude Code, Codex, CursorAI) for the given period (e.g. daily). Uses @ccusage/pi CLI.
- **pi_suggest_provider** — Recommends provider and model from current strategy and priority: load-balancing picks lowest-usage backend; HA uses the priority order.
- **pi_set_provider** — Writes pi's defaultProvider and defaultModel (global or project scope). Merges into existing settings.
- **pi_get_provider** — Reads pi settings (global or project) and returns current defaultProvider and defaultModel.
- **pi_get_strategy** — Returns current strategy: `load-balancing` or `high-availability` (from server config).
- **pi_set_strategy** — Sets strategy to `load-balancing` or `high-availability`. Persisted to server config.
- **pi_get_priority** — Returns current HA priority: ordered list of backend ids (e.g. codex, claude-code, cursorai). Used when strategy is high-availability.
- **pi_set_priority** — Sets HA priority to an ordered array of backend ids. Valid ids: claude-code, codex, cursorai. Persisted to server config.

## Observe current state

1. **Usage** — Call `mcp_pi-auto_pi_get_usage`. Optional input: `period` (default `daily`). Returns tokens and cost per backend.
2. **Current provider** — Call `mcp_pi-auto_pi_get_provider`. Optional: `scope` (global/project), `projectPath`. Returns pi's current defaultProvider and defaultModel.
3. **Strategy** — Call `mcp_pi-auto_pi_get_strategy`. Returns `load-balancing` or `high-availability`.
4. **Priority (HA only)** — Call `mcp_pi-auto_pi_get_priority` to see the ordered list of backends used when strategy is high-availability.

## Decide and switch

1. Call `mcp_pi-auto_pi_suggest_provider` (optional input: `period`). It returns recommended `provider` and `model` for the current strategy.
2. If the user wants to apply that recommendation (e.g. "switch" or "balance"): call `mcp_pi-auto_pi_set_provider` with the suggested `provider` and `model`. Optional: `scope` (global/project), `projectPath`.
3. If the user wants to change strategy or priority: call `mcp_pi-auto_pi_set_strategy` with `load-balancing` or `high-availability`, and/or `mcp_pi-auto_pi_set_priority` with an array of backend ids (e.g. `["codex", "claude-code", "cursorai"]`). Then optionally call `pi_suggest_provider` and `pi_set_provider` again.

When the user asks to **switch provider** but does **not** specify a model, use these default models per provider:

| Provider    | Default model         |
|-------------|-----------------------|
| Cursor      | auto                  |
| OpenAI      | gpt-5.2-codex         |
| Claude Code | claude-sonnet-4-6     |

## Strategies

- **Load-balancing** — Picks the backend with the lowest current usage (tokens). Use to equalize cost across Claude Code, Codex, and CursorAI.
- **High-availability** — Uses the first backend in the priority list. Use when you prefer a fixed order (e.g. Codex first, then Claude, then CursorAI).

Strategy and priority are stored in `~/.pi/agent/pi-auto.json`. Valid backend ids: `claude-code`, `codex`, `cursorai`.
