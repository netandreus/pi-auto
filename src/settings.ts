import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { getGlobalSettingsPath, getProjectSettingsPath } from "./config.js";

export type SettingsScope = "global" | "project";

export interface PiSettings {
  defaultProvider?: string;
  defaultModel?: string;
  [key: string]: unknown;
}

/** Read pi settings from global or project scope. */
export function readSettings(scope: SettingsScope = "global", projectPath?: string): PiSettings {
  const path =
    scope === "global" ? getGlobalSettingsPath() : getProjectSettingsPath(projectPath);
  if (!existsSync(path)) return {};
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    return raw && typeof raw === "object" ? (raw as PiSettings) : {};
  } catch {
    return {};
  }
}

/** Merge and write defaultProvider + defaultModel into existing pi settings. */
export function writeSettings(
  scope: SettingsScope,
  provider: string,
  model: string,
  projectPath?: string
): void {
  const path =
    scope === "global" ? getGlobalSettingsPath() : getProjectSettingsPath(projectPath);
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const existing = readSettings(scope, projectPath);
  const merged: PiSettings = {
    ...existing,
    defaultProvider: provider,
    defaultModel: model,
  };
  writeFileSync(path, JSON.stringify(merged, null, 2), "utf-8");
}
