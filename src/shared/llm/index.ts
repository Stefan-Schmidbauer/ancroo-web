/** LLM provider router — single entry point for all direct LLM calls. */

import type { LLMProviderConfig } from "../settings";
import type { LLMRequest, LLMResponse } from "./types";
import { callOpenAI } from "./openai";
import { callAnthropic } from "./anthropic";
import { callGemini } from "./gemini";
import { callOllama } from "./ollama";

export type { LLMRequest, LLMResponse } from "./types";

/** Call an LLM provider based on its type. */
export async function callLLM(
  provider: LLMProviderConfig,
  request: LLMRequest,
): Promise<LLMResponse> {
  switch (provider.type) {
    case "openai":
    case "openai-compatible":
      return callOpenAI(provider, request);
    case "openrouter":
      return callOpenAI({ ...provider, base_url: "https://openrouter.ai/api/v1" }, request);
    case "ollama":
      return callOllama(provider, request);
    case "anthropic":
      return callAnthropic(provider, request);
    case "gemini":
      return callGemini(provider, request);
    default:
      throw new Error(`Unknown LLM provider type: ${provider.type}`);
  }
}

/**
 * Send a tiny real request to verify a model can actually serve a chat call and
 * to reveal what the endpoint really is. Listing a model isn't proof it works —
 * Gemini, for instance, keeps retired models in its model list that 404 on the
 * actual call. The returned text is the model's self-reported identity, shown to
 * the user as a sanity check; it's informational only (models often misname
 * themselves) — the real signal is whether this call succeeds or throws.
 */
export async function probeModel(
  provider: LLMProviderConfig,
  model: string,
  signal?: AbortSignal,
): Promise<string> {
  const res = await callLLM(provider, {
    model,
    user_prompt: "What model are you? Reply with only your model name and version, nothing else.",
    max_tokens: 50,
    signal,
  });
  return res.text.trim();
}
