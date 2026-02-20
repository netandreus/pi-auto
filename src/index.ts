#!/usr/bin/env node
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getUsage } from "./usage.js";
import { suggestModel } from "./strategy.js";
import { readSettings, writeSettings } from "./settings.js";
import {
  getStrategy,
  setStrategy,
  getPriority,
  setPriority,
  type Strategy,
  type BackendId,
} from "./config.js";

const server = new McpServer({
  name: "pi-auto",
  version: "0.1.0",
});

// --- pi_get_usage ---
server.registerTool(
  "pi_get_usage",
  {
    title: "Get usage per backend",
    description:
      "Return current usage (tokens/cost) per backend (Claude Code, Codex, CursorAI) for the given period. Uses @ccusage/pi CLI with --json --breakdown.",
    inputSchema: {
      period: z.enum(["daily"]).optional().default("daily"),
    },
  },
  async ({ period }) => {
    const result = await getUsage(period);
    const text = JSON.stringify(
      {
        backends: result.backends,
        totals: result.totals,
        period: result.period,
        ...(result.error && { error: result.error }),
      },
      null,
      2
    );
    return {
      content: [{ type: "text" as const, text }],
      ...(result.error && { isError: true }),
    };
  }
);

// --- pi_suggest_provider ---
server.registerTool(
  "pi_suggest_provider",
  {
    title: "Suggest provider by strategy",
    description:
      "Given current strategy (load-balancing or high-availability) and priority, return recommended provider and model. Load-balancing picks the backend with lowest usage; HA uses the priority order.",
    inputSchema: {
      period: z.enum(["daily"]).optional().default("daily"),
    },
  },
  async ({ period }) => {
    const result = await suggestModel(period);
    const text = JSON.stringify(result, null, 2);
    return {
      content: [{ type: "text" as const, text }],
      ...(result.usageError && { isError: false }),
    };
  }
);

// --- pi_set_provider ---
server.registerTool(
  "pi_set_provider",
  {
    title: "Set pi default provider",
    description:
      "Write pi settings with defaultProvider and defaultModel. Scope: global (~/.pi/agent/settings.json) or project (.pi/settings.json). Merges into existing settings.",
    inputSchema: {
      provider: z.string(),
      model: z.string(),
      scope: z.enum(["global", "project"]).optional().default("global"),
      projectPath: z.string().optional(),
    },
  },
  async ({ provider, model, scope, projectPath }) => {
    try {
      writeSettings(scope, provider, model, projectPath);
      const text = JSON.stringify(
        { ok: true, scope, provider, model, message: "Settings updated." },
        null,
        2
      );
      return { content: [{ type: "text" as const, text }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ ok: false, error: message }, null, 2) }],
        isError: true,
      };
    }
  }
);

// --- pi_get_provider ---
server.registerTool(
  "pi_get_provider",
  {
    title: "Get current pi provider",
    description:
      "Read pi settings (global or project) and return current defaultProvider and defaultModel.",
    inputSchema: {
      scope: z.enum(["global", "project"]).optional().default("global"),
      projectPath: z.string().optional(),
    },
  },
  async ({ scope, projectPath }) => {
    const settings = readSettings(scope, projectPath);
    const text = JSON.stringify(
      {
        defaultProvider: settings.defaultProvider ?? null,
        defaultModel: settings.defaultModel ?? null,
        scope,
      },
      null,
      2
    );
    return { content: [{ type: "text" as const, text }] };
  }
);

// --- pi_get_strategy ---
server.registerTool(
  "pi_get_strategy",
  {
    title: "Get current strategy",
    description:
      "Return the current strategy: load-balancing or high-availability. Read from server config (~/.pi/agent/pi-auto.json).",
  },
  async () => {
    const strategy: Strategy = getStrategy();
    const text = JSON.stringify({ strategy }, null, 2);
    return { content: [{ type: "text" as const, text }] };
  }
);

// --- pi_set_strategy ---
server.registerTool(
  "pi_set_strategy",
  {
    title: "Set strategy",
    description:
      "Set the strategy to load-balancing or high-availability. Persisted to server config.",
    inputSchema: {
      strategy: z.enum(["load-balancing", "high-availability"]),
    },
  },
  async ({ strategy }) => {
    try {
      setStrategy(strategy as Strategy);
      const text = JSON.stringify({ ok: true, strategy, message: "Strategy updated." }, null, 2);
      return { content: [{ type: "text" as const, text }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ ok: false, error: message }, null, 2) }],
        isError: true,
      };
    }
  }
);

// --- pi_get_priority ---
server.registerTool(
  "pi_get_priority",
  {
    title: "Get HA priority",
    description:
      "Return the current high-availability priority: ordered list of backend ids (e.g. codex, claude-code, cursorai). Used when strategy is high-availability.",
  },
  async () => {
    const priority: BackendId[] = getPriority();
    const text = JSON.stringify({ priority }, null, 2);
    return { content: [{ type: "text" as const, text }] };
  }
);

// --- pi_set_priority ---
server.registerTool(
  "pi_set_priority",
  {
    title: "Set HA priority",
    description:
      "Set the high-availability priority to an ordered array of backend ids (e.g. [\"cursorai\", \"codex\", \"claude-code\"]). Valid ids: claude-code, codex, cursorai. Persisted to server config.",
    inputSchema: {
      priority: z.array(z.string()),
    },
  },
  async ({ priority }) => {
    try {
      const normalized = setPriority(priority);
      const text = JSON.stringify(
        { ok: true, priority: normalized, message: "Priority updated." },
        null,
        2
      );
      return { content: [{ type: "text" as const, text }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ ok: false, error: message }, null, 2) }],
        isError: true,
      };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
