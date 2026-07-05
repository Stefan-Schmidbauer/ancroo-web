/** Extension settings stored in chrome.storage.local. */

export type LLMProviderType =
  | "openai"
  | "anthropic"
  | "gemini"
  | "ollama"
  | "openrouter"
  | "openai-compatible";

export interface LLMProviderConfig {
  id: string;
  type: LLMProviderType;
  name: string;
  api_key: string;
  /** Base URL for openai-compatible providers. */
  base_url?: string;
  /** Default model for this provider — prefilled when creating new actions. */
  model?: string;
}

export interface Settings {
  llm_providers: LLMProviderConfig[];
  /** Timeout for a single LLM request, in milliseconds. */
  request_timeout_ms?: number;
}

/**
 * Default LLM request timeout (5 minutes). Reasoning models, long inputs and
 * local Ollama models on slow hardware regularly need more than the old 60s.
 * Users can raise or lower this in Settings.
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 300_000;

// Guard rails for the user-configurable timeout. The 1s floor is intentionally
// low so a timeout can be provoked quickly for testing; it still blocks the
// 0/negative values that would abort every call instantly. The 10min ceiling is
// the realistic upper bound for a single blocking (non-streamed) chat call —
// beyond that a hung connection is better handled by the Cancel button.
export const MIN_REQUEST_TIMEOUT_MS = 1_000;
export const MAX_REQUEST_TIMEOUT_MS = 600_000; // 10 min

const DEFAULTS: Settings = {
  llm_providers: [],
  request_timeout_ms: DEFAULT_REQUEST_TIMEOUT_MS,
};

/** Get current settings (with defaults). */
export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get("settings");
  return { ...DEFAULTS, ...(stored.settings as Partial<Settings> | undefined) };
}

/** Save settings. */
export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ settings });
}

/** Check if initial setup has been completed (at least one LLM provider configured). */
export async function isSetupComplete(): Promise<boolean> {
  const stored = await chrome.storage.local.get("settings");
  if (!stored.settings) return false;
  const settings = { ...DEFAULTS, ...stored.settings } as Settings;
  return settings.llm_providers.length > 0;
}
