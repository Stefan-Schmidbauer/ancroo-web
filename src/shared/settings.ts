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
}

export interface Settings {
  llm_providers: LLMProviderConfig[];
}

const DEFAULTS: Settings = {
  llm_providers: [],
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
