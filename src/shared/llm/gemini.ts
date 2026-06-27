/** Adapter for the Google Gemini API. */

import type { LLMProviderConfig } from "../settings";
import type { LLMRequest, LLMResponse } from "./types";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export async function callGemini(
  provider: LLMProviderConfig,
  request: LLMRequest,
): Promise<LLMResponse> {
  const url = `${BASE_URL}/models/${encodeURIComponent(request.model)}:generateContent`;

  const contents: { role: string; parts: { text: string }[] }[] = [];
  if (request.system_prompt) {
    contents.push({
      role: "user",
      parts: [{ text: request.system_prompt }],
    });
    contents.push({
      role: "model",
      parts: [{ text: "Understood." }],
    });
  }
  contents.push({
    role: "user",
    parts: [{ text: request.user_prompt }],
  });

  const body: Record<string, unknown> = { contents };

  const generationConfig: Record<string, unknown> = {};
  if (request.max_tokens != null) generationConfig.maxOutputTokens = request.max_tokens;
  if (request.temperature != null) generationConfig.temperature = request.temperature;
  if (Object.keys(generationConfig).length > 0) body.generationConfig = generationConfig;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": provider.api_key,
    },
    body: JSON.stringify(body),
    signal: request.signal,
  });

  if (!res.ok) {
    const text = await res.text();
    // Google keeps retired models in ListModels — with "generateContent" still
    // in their supportedGenerationMethods — so a model can look perfectly
    // selectable yet 404 here. Surface that as a clear, actionable message
    // instead of the raw API JSON. We deliberately don't name a replacement
    // model; any suggestion would itself go stale as Google retires more.
    if (res.status === 404) {
      throw new Error(
        `Gemini model "${request.model}" is no longer available from Google. Please select a different model.`,
      );
    }
    throw new Error(`Gemini API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const text =
    data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ??
    "";

  return {
    text,
    model: request.model,
    usage: data.usageMetadata
      ? {
          prompt_tokens: data.usageMetadata.promptTokenCount ?? 0,
          completion_tokens: data.usageMetadata.candidatesTokenCount ?? 0,
        }
      : undefined,
  };
}
