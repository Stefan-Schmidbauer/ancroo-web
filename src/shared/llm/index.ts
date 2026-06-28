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
 * Send a tiny real request to verify a model can actually serve a chat call.
 * Listing a model isn't proof it works — Gemini, for instance, keeps retired
 * models in its list that 404 on the actual call. The only signal that matters
 * is whether this call succeeds or throws: any reply means the model is usable,
 * so we don't inspect the content (a model's self-reported name is unreliable —
 * it routinely misnames itself — and reasoning models may return empty text
 * once they've spent the token budget on thinking). Tokens are kept minimal.
 */
export async function probeModel(
  provider: LLMProviderConfig,
  model: string,
  signal?: AbortSignal,
): Promise<void> {
  await callLLM(provider, {
    model,
    user_prompt: "Reply with OK.",
    max_tokens: 16,
    signal,
  });
}
