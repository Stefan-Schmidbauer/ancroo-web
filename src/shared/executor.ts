/** Workflow executor — calls LLM directly (no backend). */

import type { InputDataPacket, ExecuteWorkflowResponse, LocalWorkflow, Workflow } from "./types";
import { getSettings } from "./settings";
import { getLocalWorkflow } from "./local-workflows";
import { renderTemplate } from "./template-renderer";
import { callLLM } from "./llm";
import { hasHostPermission } from "./host-permission";

/** Timeout for direct LLM calls (60 seconds). */
const DIRECT_LLM_TIMEOUT_MS = 60_000;

/** Execute a workflow directly against an LLM provider. */
export async function executeWorkflowUnified(
  workflow: Workflow,
  inputData: InputDataPacket,
): Promise<ExecuteWorkflowResponse> {
  const start = performance.now();
  const executionId = crypto.randomUUID();

  // If called with a plain Workflow (e.g. from cache), look up the full LocalWorkflow
  let local = workflow as LocalWorkflow;
  if (!local.prompt_template) {
    const found = await getLocalWorkflow(workflow.slug);
    if (!found) {
      return errorResult(
        executionId,
        start,
        `Workflow "${workflow.slug}" not found in local storage.`,
      );
    }
    local = found;
  }

  const settings = await getSettings();
  const provider = settings.llm_providers.find((p) => p.id === local.provider_id);
  if (!provider) {
    return errorResult(
      executionId,
      start,
      `LLM provider "${local.provider_id}" not configured. Check your settings.`,
    );
  }

  // A custom base_url (Ollama on LAN, OpenAI-compatible, custom endpoint) needs
  // an optional host permission that the manifest doesn't cover. Granting it
  // normally happens when the provider is saved in Settings — but a restored
  // backup writes providers straight to storage without that step. Detect the
  // gap here so the user gets an actionable message instead of a misleading
  // "invalid API key" / network failure on the first run.
  if (provider.base_url) {
    const allowed = await hasHostPermission(provider.base_url);
    if (!allowed) {
      let host = provider.base_url;
      try {
        host = new URL(provider.base_url).host;
      } catch {
        // Keep the raw base_url if it isn't a parseable URL.
      }
      return errorResult(
        executionId,
        start,
        `The extension isn't allowed to reach ${host} yet. Open Settings, edit the "${provider.name}" provider, and use Test or Save to grant access.`,
      );
    }
  }

  try {
    const userPrompt = renderTemplate(local.prompt_template, inputData);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DIRECT_LLM_TIMEOUT_MS);

    let response;
    try {
      response = await callLLM(provider, {
        model: local.model,
        user_prompt: userPrompt,
        system_prompt: local.system_prompt,
        max_tokens: local.max_tokens,
        temperature: local.temperature,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    return {
      execution_id: executionId,
      status: "success",
      result: {
        text: response.text,
        action: (local.output_action ?? "side_panel_only") as NonNullable<
          ExecuteWorkflowResponse["result"]
        >["action"],
        success: true,
        error: null,
        metadata: {
          model: response.model,
          usage: response.usage,
          mode: "direct",
        },
      },
      duration_ms: performance.now() - start,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResult(executionId, start, friendlyDirectError(msg));
  }
}

/** Build a standardized error response. */
function errorResult(executionId: string, start: number, error: string): ExecuteWorkflowResponse {
  return {
    execution_id: executionId,
    status: "error",
    result: {
      text: null,
      action: "side_panel_only",
      success: false,
      error,
      metadata: { mode: "direct" },
    },
    duration_ms: performance.now() - start,
  };
}

/** Map raw API errors to user-friendly messages. */
function friendlyDirectError(msg: string): string {
  const lower = msg.toLowerCase();

  if (lower.includes("abort") || lower.includes("timed out")) {
    return "The AI model took too long to respond. Try a shorter input or a faster model.";
  }
  // Auth and credit problems are checked before "not found": providers (e.g.
  // OpenRouter) often phrase a revoked key or empty balance with wording that
  // also contains "not found", which would otherwise be mislabeled as a missing
  // model and send the user chasing the wrong setting.
  if (
    lower.includes("401") ||
    lower.includes("403") ||
    lower.includes("unauthorized") ||
    lower.includes("invalid api key") ||
    lower.includes("no auth credentials") ||
    lower.includes("authentication")
  ) {
    return "Invalid or missing API key. Check your provider settings.";
  }
  if (
    lower.includes("402") ||
    lower.includes("insufficient") ||
    lower.includes("quota") ||
    lower.includes("billing") ||
    lower.includes("credit")
  ) {
    return "The provider rejected the request for billing reasons (out of credits or quota). Check your account.";
  }
  if (lower.includes("429") || lower.includes("rate limit")) {
    return "Rate limit exceeded. Wait a moment and try again.";
  }
  if (lower.includes("not found") || lower.includes("does not exist")) {
    // Only name a model when one was actually parsed from the error — otherwise
    // a bare fallback ("unknown") wrongly implies the model is the problem.
    const modelName = msg.match(/model[:\s'"]+([^\s'"]+)/i)?.[1];
    return modelName
      ? `Model "${modelName}" not found. Check that it is available with your provider.`
      : "The provider could not find the requested model. Check the model selection and your provider settings.";
  }
  if (lower.includes("500") || lower.includes("internal server error")) {
    return "The AI provider returned an internal error. Try again later.";
  }
  if (lower.includes("503") || lower.includes("service unavailable")) {
    return "The AI provider is temporarily unavailable. Try again later.";
  }
  if (lower.includes("failed to fetch") || lower.includes("networkerror")) {
    return "Cannot reach the AI provider. Check your internet connection and provider settings.";
  }

  return msg;
}
