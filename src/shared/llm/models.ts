/** Fetch available models from LLM providers. */

import type { LLMProviderConfig } from "../settings";

export interface ModelInfo {
  id: string;
  name: string;
}

/** Fetch the list of available models for a provider. */
export async function fetchModels(provider: LLMProviderConfig): Promise<ModelInfo[]> {
  switch (provider.type) {
    case "ollama":
      return fetchOllamaModels(provider);
    case "openai":
    case "openai-compatible":
      return fetchOpenAIModels(provider);
    case "openrouter":
      return fetchOpenAIModels({ ...provider, base_url: "https://openrouter.ai/api" });
    case "gemini":
      return fetchGeminiModels(provider);
    case "anthropic":
      return fetchAnthropicModels(provider);
    default:
      return [];
  }
}

async function fetchOllamaModels(provider: LLMProviderConfig): Promise<ModelInfo[]> {
  const baseUrl = (provider.base_url || "http://localhost:11434").replace(/\/+$/, "");
  const res = await fetch(`${baseUrl}/api/tags`, {
    headers: { Origin: baseUrl },
  });
  if (!res.ok) throw new Error(`Ollama error ${res.status}`);
  const data = await res.json();
  return (data.models ?? []).map((m: { name: string }) => ({
    id: m.name,
    name: m.name,
  }));
}

async function fetchOpenAIModels(provider: LLMProviderConfig): Promise<ModelInfo[]> {
  const baseUrl = (provider.base_url || "https://api.openai.com").replace(/\/+$/, "");
  const headers: Record<string, string> = {};
  if (provider.api_key && provider.api_key !== "ollama") {
    headers.Authorization = `Bearer ${provider.api_key}`;
  }
  const res = await fetch(`${baseUrl}/v1/models`, { headers });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();
  return (data.data ?? [])
    .map((m: { id: string }) => ({ id: m.id, name: m.id }))
    .sort((a: ModelInfo, b: ModelInfo) => a.name.localeCompare(b.name));
}

async function fetchGeminiModels(provider: LLMProviderConfig): Promise<ModelInfo[]> {
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
    headers: { "x-goog-api-key": provider.api_key },
  });
  if (!res.ok) throw new Error(`Gemini error ${res.status}`);
  const data = await res.json();
  return (data.models ?? [])
    .filter((m: { name: string }) => m.name.startsWith("models/gemini"))
    .map((m: { name: string; displayName?: string }) => ({
      id: m.name.replace("models/", ""),
      name: m.displayName || m.name.replace("models/", ""),
    }));
}

async function fetchAnthropicModels(provider: LLMProviderConfig): Promise<ModelInfo[]> {
  const res = await fetch("https://api.anthropic.com/v1/models", {
    headers: {
      "x-api-key": provider.api_key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
  });
  if (!res.ok) throw new Error(`Anthropic error ${res.status}`);
  const data = await res.json();
  return (data.data ?? [])
    .map((m: { id: string; display_name?: string }) => ({
      id: m.id,
      name: m.display_name || m.id,
    }))
    .sort((a: ModelInfo, b: ModelInfo) => a.name.localeCompare(b.name));
}
