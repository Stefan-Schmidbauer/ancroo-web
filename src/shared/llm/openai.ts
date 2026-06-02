/** Adapter for OpenAI Chat Completions API (also used by OpenAI-compatible providers). */

import type { LLMProviderConfig } from "../settings";
import type { LLMRequest, LLMResponse } from "./types";

// Base URL follows the OpenAI convention: it points at the API root (including
// the version segment, e.g. ".../v1"). We append only the endpoint path. This
// matches what OpenAI-compatible servers (LM Studio, vLLM, …) document and show.
const DEFAULT_BASE_URL = "https://api.openai.com/v1";

/** Normalize a provider base URL: use the value as given, only trimming
 *  trailing slashes so endpoint paths join cleanly. Shared with the model
 *  fetcher so the "/v1 in base" convention has a single source of truth. */
export function resolveBaseUrl(provider: LLMProviderConfig): string {
  return (provider.base_url || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export async function callOpenAI(
  provider: LLMProviderConfig,
  request: LLMRequest,
): Promise<LLMResponse> {
  const url = `${resolveBaseUrl(provider)}/chat/completions`;

  const messages: { role: string; content: string }[] = [];
  if (request.system_prompt) {
    messages.push({ role: "system", content: request.system_prompt });
  }
  messages.push({ role: "user", content: request.user_prompt });

  const body: Record<string, unknown> = {
    model: request.model,
    messages,
  };
  if (request.max_tokens != null) body.max_tokens = request.max_tokens;
  if (request.temperature != null) body.temperature = request.temperature;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (provider.api_key && provider.api_key !== "ollama") {
    headers.Authorization = `Bearer ${provider.api_key}`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: request.signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return {
    text: data.choices?.[0]?.message?.content ?? "",
    model: data.model ?? request.model,
    usage: data.usage
      ? {
          prompt_tokens: data.usage.prompt_tokens ?? 0,
          completion_tokens: data.usage.completion_tokens ?? 0,
        }
      : undefined,
  };
}

/** Connectivity/auth check for OpenAI-compatible servers via GET /models.
 *  Avoids guessing a model name (the chat endpoint would 404 on an unknown
 *  model), so it verifies the base URL and API key in isolation. */
export async function pingOpenAI(provider: LLMProviderConfig, signal?: AbortSignal): Promise<void> {
  const url = `${resolveBaseUrl(provider)}/models`;

  const headers: Record<string, string> = {};
  if (provider.api_key && provider.api_key !== "ollama") {
    headers.Authorization = `Bearer ${provider.api_key}`;
  }

  const res = await fetch(url, { method: "GET", headers, signal });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${text}`);
  }
}
