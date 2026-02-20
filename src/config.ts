import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

/** Backend identifier (display name for pi). */
export type BackendId = "claude-code" | "codex" | "cursorai";

/** Strategy for model selection. */
export type Strategy = "load-balancing" | "high-availability";

/** Default backend order for HA (Codex → Claude Code → CursorAI). */
export const DEFAULT_PRIORITY: BackendId[] = ["codex", "claude-code", "cursorai"];

export const DEFAULT_STRATEGY: Strategy = "load-balancing";

/** Map from provider/model patterns (from ccusage) to our backend id. */
export const DEFAULT_BACKEND_MAP: Record<string, BackendId> = {
  anthropic: "claude-code",
  "claude-": "claude-code",
  openai: "codex",
  "gpt-": "codex",
  cursor: "cursorai",
};

/** Default pi provider + model per backend (user can override in config). */
export const DEFAULT_MODELS: Record<BackendId, { provider: string; model: string }> = {
  "claude-code": { provider: "anthropic", model: "claude-sonnet-4-20250514" },
  codex: { provider: "openai", model: "gpt-4o" },
  cursorai: { provider: "cursor", model: "auto" },
};

export interface ServerConfig {
  /** Strategy: load-balancing or high-availability */
  strategy?: Strategy;
  /** Ordered list of backend ids for HA; first is preferred */
  priority?: BackendId[];
  /** Optional: map provider/model pattern -> backend id (extends default) */
  backendMap?: Record<string, BackendId>;
  /** Optional: default provider+model per backend id */
  defaultModels?: Partial<Record<BackendId, { provider: string; model: string }>>;
}

const VALID_BACKEND_IDS: BackendId[] = ["claude-code", "codex", "cursorai"];
const VALID_STRATEGIES: Strategy[] = ["load-balancing", "high-availability"];

function getConfigPath(): string {
  return join(homedir(), ".pi", "agent", "pi-auto.json");
}

function loadConfigRaw(): ServerConfig {
  const path = getConfigPath();
  if (!existsSync(path)) return {};
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    if (raw && typeof raw === "object") return raw as ServerConfig;
  } catch {
    // invalid or missing -> defaults
  }
  return {};
}

let cachedConfig: ServerConfig | null = null;

/** Get full server config (with defaults). Uses in-memory cache; call invalidateConfig() after writes. */
export function getConfig(): ServerConfig & {
  strategy: Strategy;
  priority: BackendId[];
  backendMap: Record<string, BackendId>;
  defaultModels: Record<BackendId, { provider: string; model: string }>;
} {
  if (cachedConfig !== null) {
    return cachedConfig as ReturnType<typeof getConfig>;
  }
  const raw = loadConfigRaw();
  const strategy =
    raw.strategy && VALID_STRATEGIES.includes(raw.strategy) ? raw.strategy : DEFAULT_STRATEGY;
  const priority = Array.isArray(raw.priority)
    ? raw.priority.filter((id): id is BackendId => VALID_BACKEND_IDS.includes(id as BackendId))
    : [...DEFAULT_PRIORITY];
  const backendMap = { ...DEFAULT_BACKEND_MAP, ...raw.backendMap };
  const defaultModels = { ...DEFAULT_MODELS, ...raw.defaultModels };
  cachedConfig = { strategy, priority, backendMap, defaultModels };
  return cachedConfig as ReturnType<typeof getConfig>;
}

/** Invalidate config cache so next getConfig() reads from disk. */
export function invalidateConfig(): void {
  cachedConfig = null;
}

/** Get current strategy. */
export function getStrategy(): Strategy {
  return getConfig().strategy;
}

/** Set strategy and persist to server config file. */
export function setStrategy(strategy: Strategy): void {
  if (!VALID_STRATEGIES.includes(strategy)) {
    throw new Error(
      `Invalid strategy: "${strategy}". Must be one of: ${VALID_STRATEGIES.join(", ")}`
    );
  }
  const path = getConfigPath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const raw = loadConfigRaw();
  raw.strategy = strategy;
  writeFileSync(path, JSON.stringify(raw, null, 2), "utf-8");
  invalidateConfig();
}

/** Get current HA priority (ordered backend ids). */
export function getPriority(): BackendId[] {
  return [...getConfig().priority];
}

/** Set HA priority and persist. Rejects invalid or duplicate entries by normalizing. */
export function setPriority(priority: string[]): BackendId[] {
  const valid = priority.filter(
    (id): id is BackendId => VALID_BACKEND_IDS.includes(id as BackendId)
  );
  const seen = new Set<BackendId>();
  const normalized: BackendId[] = [];
  for (const id of valid) {
    if (!seen.has(id)) {
      seen.add(id);
      normalized.push(id);
    }
  }
  // Ensure all backends appear (append missing at end)
  for (const id of VALID_BACKEND_IDS) {
    if (!seen.has(id)) normalized.push(id);
  }
  const path = getConfigPath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const raw = loadConfigRaw();
  raw.priority = normalized;
  writeFileSync(path, JSON.stringify(raw, null, 2), "utf-8");
  invalidateConfig();
  return normalized;
}

/** Resolve global pi settings path. */
export function getGlobalSettingsPath(): string {
  const base =
    process.env.CCUSAGE_MCP_SETTINGS_PATH ??
    join(homedir(), ".pi", "agent", "settings.json");
  return base.replace(/^~/, homedir());
}

/** Resolve project pi settings path (defaults to cwd). */
export function getProjectSettingsPath(projectPath?: string): string {
  const root = projectPath ? join(process.cwd(), projectPath) : process.cwd();
  return join(root, ".pi", "settings.json");
}

/** Map a provider or model string from ccusage to backend id. */
export function modelToBackend(
  providerOrModel: string,
  config = getConfig()
): BackendId | undefined {
  const lower = providerOrModel.toLowerCase();
  for (const [pattern, backend] of Object.entries(config.backendMap)) {
    if (pattern.toLowerCase() === lower) return backend;
    if (lower.startsWith(pattern.toLowerCase())) return backend;
    if (lower.includes(pattern.toLowerCase())) return backend;
  }
  return undefined;
}
