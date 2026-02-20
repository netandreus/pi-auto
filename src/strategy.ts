import type { BackendId } from "./config.js";
import { getConfig } from "./config.js";
import type { UsageResult } from "./usage.js";
import { getUsage } from "./usage.js";

export interface SuggestResult {
  provider: string;
  model: string;
  backend: BackendId;
  strategy: "load-balancing" | "high-availability";
  reason: string;
  usageError?: string;
}

/** Suggest provider and model based on current strategy and (for HA) priority. */
export async function suggestModel(period: "daily" = "daily"): Promise<SuggestResult> {
  const config = getConfig();
  const usageResult = await getUsage(period);

  if (usageResult.error) {
    const haBackend = config.priority[0];
    const fallback = config.defaultModels[haBackend];
    return {
      provider: fallback.provider,
      model: fallback.model,
      backend: haBackend,
      strategy: config.strategy,
      reason: `Usage unavailable (${usageResult.error}); using HA fallback (first priority: ${haBackend}).`,
      usageError: usageResult.error,
    };
  }

  if (config.strategy === "high-availability") {
    for (const backend of config.priority) {
      const def = config.defaultModels[backend];
      return {
        provider: def.provider,
        model: def.model,
        backend,
        strategy: "high-availability",
        reason: `High-availability: using first in priority: ${backend}.`,
      };
    }
  }

  // Load-balancing: pick backend with minimum total usage (totalTokens)
  let minBackend: BackendId = config.priority[0];
  let minTokens = Number.POSITIVE_INFINITY;
  for (const id of ["claude-code", "codex", "cursorai"] as const) {
    const t = usageResult.backends[id].totalTokens;
    if (t < minTokens) {
      minTokens = t;
      minBackend = id;
    }
  }
  const def = config.defaultModels[minBackend];
  return {
    provider: def.provider,
    model: def.model,
    backend: minBackend,
    strategy: "load-balancing",
    reason: `Load-balancing: ${minBackend} has lowest usage (${minTokens} tokens).`,
  };
}
