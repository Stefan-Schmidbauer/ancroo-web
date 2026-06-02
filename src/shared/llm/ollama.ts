/** Adapter for Ollama (OpenAI-compatible API).
 *
 *  Ollama rejects requests where the Origin header is set to a
 *  chrome-extension:// URL (403). We use declarativeNetRequest to
 *  override the Origin header before the request reaches Ollama.
 */

import type { LLMProviderConfig } from "../settings";
import type { LLMRequest, LLMResponse } from "./types";

const DEFAULT_BASE_URL = "http://localhost:11434";
const OLLAMA_RULE_ID = 9999;

/** Ensure a declarativeNetRequest rule is active that overrides Origin for this Ollama URL.
 *  Exported so the model-list fetch (/api/tags) gets the same Origin override as the
 *  chat call — setting the Origin header directly on fetch() is silently dropped by the
 *  browser (forbidden header). */
export async function ensureOriginRule(baseUrl: string): Promise<void> {
  try {
    const rule: chrome.declarativeNetRequest.Rule = {
      id: OLLAMA_RULE_ID,
      priority: 1,
      action: {
        type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
        requestHeaders: [
          {
            header: "Origin",
            operation: chrome.declarativeNetRequest.HeaderOperation.SET,
            value: baseUrl,
          },
        ],
      },
      condition: {
        urlFilter: `${baseUrl}/*`,
        resourceTypes: [chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST],
      },
    };

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [OLLAMA_RULE_ID],
      addRules: [rule],
    });
  } catch (err) {
    // Only warn for unexpected errors — declarativeNetRequest is unavailable
    // in content scripts and during early extension init, which is expected.
    if (err instanceof Error && !err.message.includes("Cannot access")) {
      console.warn("Failed to set Ollama origin rule:", err);
    }
  }
}

export async function callOllama(
  provider: LLMProviderConfig,
  request: LLMRequest,
): Promise<LLMResponse> {
  const baseUrl = (provider.base_url || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const url = `${baseUrl}/v1/chat/completions`;

  // Register the Origin override rule before making the request
  await ensureOriginRule(baseUrl);

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

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: request.signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama API error ${res.status}: ${text}`);
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
