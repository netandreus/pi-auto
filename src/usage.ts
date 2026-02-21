import { spawn } from "node:child_process";
import { type BackendId, getConfig, modelToBackend } from "./config.js";

export type Period = "daily";

export interface BackendUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  totalCost: number;
  /** Models that contributed to this backend (for debugging) */
  modelsUsed: string[];
}

export interface UsageResult {
  backends: Record<BackendId, BackendUsage>;
  totals: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    totalCost: number;
  };
  period: Period;
  /** For daily period: the date (YYYY-MM-DD) this report is for. */
  date?: string;
  error?: string;
}

const EMPTY_BACKEND: BackendUsage = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  totalCost: 0,
  modelsUsed: [],
};

function emptyBackends(): Record<BackendId, BackendUsage> {
  return {
    "claude-code": { ...EMPTY_BACKEND },
    codex: { ...EMPTY_BACKEND },
    cursorai: { ...EMPTY_BACKEND },
  };
}

/** Normalize daily entry: may have modelsUsed, modelBreakdowns, or breakdown (per-model). */
interface DailyEntry {
  date?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  totalTokens?: number;
  totalCost?: number;
  costUSD?: number;
  modelsUsed?: string[];
  models?: string[];
  modelBreakdowns?: unknown;
  breakdown?: Record<string, { inputTokens?: number; outputTokens?: number; totalTokens?: number; costUSD?: number; totalCost?: number }>;
}

interface CCUsageDailyJson {
  daily?: DailyEntry[];
  data?: DailyEntry[];
  totals?: { inputTokens?: number; outputTokens?: number; totalTokens?: number; totalCost?: number; totalCostUSD?: number };
  summary?: { totalInputTokens?: number; totalOutputTokens?: number; totalTokens?: number; totalCostUSD?: number };
  projects?: Record<string, DailyEntry[]>;
}

function num(x: unknown): number {
  if (typeof x === "number" && !Number.isNaN(x)) return x;
  if (typeof x === "string") return Number.parseFloat(x) || 0;
  return 0;
}

function aggregateEntry(
  entry: DailyEntry,
  backends: Record<BackendId, BackendUsage>,
  config: ReturnType<typeof getConfig>
): void {
  const inT = num(entry.inputTokens);
  const outT = num(entry.outputTokens);
  const totalT = num(entry.totalTokens) || inT + outT;
  const cost = num(entry.totalCost ?? entry.costUSD);

  const models = entry.modelsUsed ?? entry.models ?? [];
  if (models.length === 0 && entry.breakdown) {
    for (const m of Object.keys(entry.breakdown)) models.push(m);
  }
  if (models.length === 0) {
    // No per-model info: attribute all to first backend (or spread later); treat as "unknown" and skip or put in first
    const fallback: BackendId = config.priority[0];
    const b = backends[fallback];
    b.inputTokens += inT;
    b.outputTokens += outT;
    b.totalTokens += totalT;
    b.totalCost += cost;
    return;
  }

  if (entry.breakdown && typeof entry.breakdown === "object") {
    for (const [model, stats] of Object.entries(entry.breakdown)) {
      const backend = modelToBackend(model, config) ?? modelToBackend("anthropic", config) ?? config.priority[0];
      const bb = backends[backend];
      bb.inputTokens += num((stats as { inputTokens?: number }).inputTokens);
      bb.outputTokens += num((stats as { outputTokens?: number }).outputTokens);
      bb.totalTokens += num((stats as { totalTokens?: number }).totalTokens);
      bb.totalCost += num((stats as { costUSD?: number }).costUSD ?? (stats as { totalCost?: number }).totalCost);
      if (!bb.modelsUsed.includes(model)) bb.modelsUsed.push(model);
    }
    return;
  }

  // No breakdown: split evenly across models, then map each model to backend
  const perModelCost = models.length ? cost / models.length : 0;
  const perModelTokens = models.length ? totalT / models.length : 0;
  const perModelIn = models.length ? inT / models.length : 0;
  const perModelOut = models.length ? outT / models.length : 0;
  for (const model of models) {
    const backend = modelToBackend(model, config) ?? modelToBackend("anthropic", config) ?? config.priority[0];
    const b = backends[backend];
    b.inputTokens += perModelIn;
    b.outputTokens += perModelOut;
    b.totalTokens += perModelTokens;
    b.totalCost += perModelCost;
    if (!b.modelsUsed.includes(model)) b.modelsUsed.push(model);
  }
}

/** Today's date in YYYY-MM-DD (local), to match ccusage daily report dates. */
function todayDateString(): string {
  return new Date().toLocaleDateString("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });
}

/** Run @ccusage/pi CLI and return usage aggregated by backend. */
export async function getUsage(period: Period = "daily"): Promise<UsageResult> {
  const config = getConfig();
  const backends = emptyBackends();

  const piPath = process.env.PI_AGENT_DIR;
  const args = [
    "@ccusage/pi@latest",
    period,
    "--json",
    "--breakdown",
  ];
  if (piPath) args.push("--pi-path", piPath);

  return new Promise((resolve) => {
    const child = spawn("npx", args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
      env: { ...process.env, ...(piPath ? { PI_AGENT_DIR: piPath } : {}) },
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf-8");
    child.stdout?.on("data", (chunk) => { stdout += chunk; });
    child.stderr?.setEncoding("utf-8");
    child.stderr?.on("data", (chunk) => { stderr += chunk; });

    child.on("error", (err) => {
      resolve({
        backends,
        totals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, totalCost: 0 },
        period,
        error: `Failed to run @ccusage/pi: ${err.message}. Is npx available and @ccusage/pi installed?`,
      });
    });

    child.on("close", (code) => {
      if (code !== 0) {
        resolve({
          backends,
          totals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, totalCost: 0 },
          period,
          error: stderr.trim() || `@ccusage/pi exited with code ${code}. Run: npx @ccusage/pi@latest ${period} --json --breakdown`,
        });
        return;
      }

      let data: CCUsageDailyJson;
      try {
        data = JSON.parse(stdout) as CCUsageDailyJson;
      } catch {
        resolve({
          backends,
          totals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, totalCost: 0 },
          period,
          error: "Invalid JSON from @ccusage/pi. Ensure --json is supported by your @ccusage/pi version.",
        });
        return;
      }

      const allEntries: DailyEntry[] =
        data.daily ?? data.data ?? (data.projects ? ([] as DailyEntry[]).concat(...Object.values(data.projects).filter(Array.isArray)) : []);
      // For "daily" period, return only today's usage (match ccusage-pi behavior).
      const today = todayDateString();
      const entries = allEntries.filter((e) => e.date === today);
      for (const entry of entries) aggregateEntry(entry, backends, config);

      const totalInput = Object.values(backends).reduce((s, b) => s + b.inputTokens, 0);
      const totalOutput = Object.values(backends).reduce((s, b) => s + b.outputTokens, 0);
      const totalTokens = Object.values(backends).reduce((s, b) => s + b.totalTokens, 0);
      const totalCost = Object.values(backends).reduce((s, b) => s + b.totalCost, 0);
      // Use only aggregated-from-entries totals so "daily" is truly today (no fallback to CLI global totals).
      resolve({
        backends,
        totals: {
          inputTokens: totalInput,
          outputTokens: totalOutput,
          totalTokens: totalTokens,
          totalCost: totalCost,
        },
        period,
        ...(period === "daily" && { date: today }),
      });
    });
  });
}
