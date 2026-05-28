/** Workflow executor — calls LLM directly (no backend). */

import type { InputDataPacket, ExecuteWorkflowResponse, LocalWorkflow, Workflow } from "./types";
import { getSettings } from "./settings";
import { getLocalWorkflow } from "./local-workflows";
import { renderTemplate } from "./template-renderer";
import { callLLM } from "./llm";

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
      action: "notification",
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
  if (lower.includes("not found") || lower.includes("does not exist")) {
    const modelMatch = msg.match(/model[:\s'"]+([^\s'"]+)/i);
    const modelName = modelMatch?.[1] ?? "unknown";
    return `Model "${modelName}" not found. Check that it is available with your provider.`;
  }
  if (
    lower.includes("401") ||
    lower.includes("unauthorized") ||
    lower.includes("invalid api key")
  ) {
    return "Invalid API key. Check your provider settings.";
  }
  if (lower.includes("429") || lower.includes("rate limit")) {
    return "Rate limit exceeded. Wait a moment and try again.";
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
