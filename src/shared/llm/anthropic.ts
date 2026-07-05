/** Adapter for the Anthropic Messages API. */

import type { LLMProviderConfig } from "../settings";
import type { LLMRequest, LLMResponse } from "./types";

export const ANTHROPIC_DEFAULT_BASE_URL = "https://api.anthropic.com";
const API_VERSION = "2023-06-01";

/** Resolve the API root: user override (proxy/gateway) or the official default.
 *  Anthropic's base is the host root; the adapter appends the version path. */
export function resolveAnthropicBaseUrl(provider: LLMProviderConfig): string {
  return (provider.base_url || ANTHROPIC_DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export async function callAnthropic(
  provider: LLMProviderConfig,
  request: LLMRequest,
): Promise<LLMResponse> {
  const url = `${resolveAnthropicBaseUrl(provider)}/v1/messages`;

  const body: Record<string, unknown> = {
    model: request.model,
    messages: [{ role: "user", content: request.user_prompt }],
    max_tokens: request.max_tokens ?? 4096,
  };
  if (request.system_prompt) body.system = request.system_prompt;
  if (request.temperature != null) body.temperature = request.temperature;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": provider.api_key,
      "anthropic-version": API_VERSION,
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
    signal: request.signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const text =
    data.content
      ?.filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("") ?? "";

  return {
    text,
    model: data.model ?? request.model,
    usage: data.usage
      ? {
          prompt_tokens: data.usage.input_tokens ?? 0,
          completion_tokens: data.usage.output_tokens ?? 0,
        }
      : undefined,
  };
}
