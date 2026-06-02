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
