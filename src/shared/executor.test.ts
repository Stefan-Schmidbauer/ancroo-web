/** Verifies that an action's stored parameters survive the trip from
 *  chrome.storage to the LLM call.
 *
 *  The adapters are covered by llm/request-params.test.ts; what's tested here
 *  is the layer above them — that executeActionUnified reads temperature,
 *  max_tokens and the system prompt off the action and hands them to callLLM
 *  unchanged, including the falsy `temperature: 0`. */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LocalAction, InputDataPacket } from "./types";
import type { LLMRequest } from "./llm";

const callLLM = vi.fn();
const getSettings = vi.fn();
const getLocalAction = vi.fn();
const hasHostPermission = vi.fn();

vi.mock("./llm", () => ({ callLLM: (...a: unknown[]) => callLLM(...a) }));
vi.mock("./settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./settings")>();
  return { ...actual, getSettings: () => getSettings() };
});
vi.mock("./local-actions", () => ({ getLocalAction: (...a: unknown[]) => getLocalAction(...a) }));
vi.mock("./host-permission", () => ({
  hasHostPermission: (...a: unknown[]) => hasHostPermission(...a),
}));

const { executeActionUnified } = await import("./executor");

const provider = { id: "p1", type: "openai" as const, name: "Test", api_key: "k" };

function makeAction(overrides: Partial<LocalAction> = {}): LocalAction {
  return {
    id: "a1",
    slug: "test-action",
    name: "Test Action",
    description: null,
    category: null,
    category_icon: null,
    default_hotkey: null,
    version: "1.0.0",
    action_type: "text_transformation",
    llm_model_name: "gpt-4o",
    stt_model_name: null,
    tool_name: null,
    recipe: { input: "selection_plain" },
    output_action: "side_panel_only",
    prompt_template: "Summarize: {text}",
    provider_id: "p1",
    model: "gpt-4o",
    ...overrides,
  };
}

const input: InputDataPacket = {
  text: "hello world",
  context: { url: "https://example.com", title: "Example" },
};

/** The LLMRequest handed to callLLM by the last execution. */
const lastRequest = (): LLMRequest => callLLM.mock.calls[0][1] as LLMRequest;

beforeEach(() => {
  vi.clearAllMocks();
  getSettings.mockResolvedValue({ llm_providers: [provider] });
  hasHostPermission.mockResolvedValue(true);
  callLLM.mockResolvedValue({ text: "result", model: "gpt-4o" });
});

describe("executeActionUnified parameter forwarding", () => {
  it("forwards temperature from the action", async () => {
    await executeActionUnified(makeAction({ temperature: 0.7 }), input);
    expect(lastRequest().temperature).toBe(0.7);
  });

  it("forwards temperature 0 instead of dropping it", async () => {
    await executeActionUnified(makeAction({ temperature: 0 }), input);
    expect(lastRequest().temperature).toBe(0);
  });

  it("leaves temperature undefined when the action has none", async () => {
    await executeActionUnified(makeAction(), input);
    expect(lastRequest().temperature).toBeUndefined();
  });

  it("forwards max_tokens and the system prompt", async () => {
    await executeActionUnified(makeAction({ max_tokens: 256, system_prompt: "be terse" }), input);
    expect(lastRequest().max_tokens).toBe(256);
    expect(lastRequest().system_prompt).toBe("be terse");
  });

  it("forwards the model and routes to the action's provider", async () => {
    getSettings.mockResolvedValue({
      llm_providers: [
        { ...provider, id: "other" },
        { ...provider, id: "p1", name: "Chosen" },
      ],
    });
    await executeActionUnified(makeAction({ model: "gpt-5" }), input);
    expect(lastRequest().model).toBe("gpt-5");
    expect((callLLM.mock.calls[0][0] as typeof provider).name).toBe("Chosen");
  });

  it("renders the prompt template before sending it", async () => {
    await executeActionUnified(makeAction({ prompt_template: "Title {title}: {text}" }), input);
    expect(lastRequest().user_prompt).toBe("Title Example: hello world");
  });

  it("looks up the full action when called with a bare Action", async () => {
    const stored = makeAction({ temperature: 0.25, max_tokens: 99 });
    getLocalAction.mockResolvedValue(stored);
    // A cached Action carries no prompt_template — the executor must reload it.
    const bare = { ...stored, prompt_template: "" } as LocalAction;

    await executeActionUnified(bare, input);

    expect(getLocalAction).toHaveBeenCalledWith("test-action");
    expect(lastRequest().temperature).toBe(0.25);
    expect(lastRequest().max_tokens).toBe(99);
  });

  it("reports an error instead of calling the LLM when the provider is missing", async () => {
    getSettings.mockResolvedValue({ llm_providers: [] });
    const res = await executeActionUnified(makeAction({ provider_id: "gone" }), input);
    expect(res.status).toBe("error");
    expect(callLLM).not.toHaveBeenCalled();
  });

  it("aborts the request when the caller's signal fires", async () => {
    const controller = new AbortController();
    callLLM.mockImplementation(
      (_p: unknown, r: LLMRequest) =>
        new Promise((_resolve, reject) => {
          // The signal may already be aborted by the time the adapter is
          // reached — checking only for the event would hang forever.
          if (r.signal?.aborted) return reject(new Error("aborted"));
          r.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );

    const pending = executeActionUnified(makeAction(), input, controller.signal);
    controller.abort();
    const res = await pending;

    expect(res.status).toBe("error");
  });
});
