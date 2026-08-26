/** Verifies that request parameters (temperature, max_tokens, system prompt)
 *  reach the wire in the shape each provider's API expects.
 *
 *  The recurring bug class here is a parameter that silently disappears:
 *  `temperature: 0` dropped by a truthiness check, or a value placed at the
 *  top level for an API that nests it. Every case asserts the actual JSON body
 *  handed to fetch(), not just that the call succeeded. */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { LLMProviderConfig } from "../settings";
import type { LLMRequest, LLMResponse } from "./types";
import { callOpenAI } from "./openai";
import { callAnthropic } from "./anthropic";
import { callGemini } from "./gemini";
import { callOllama } from "./ollama";

/** One captured fetch() call, decoded. */
interface Captured {
  url: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

/** Install a fetch stub returning `payload`; returns the captured calls. */
function stubFetch(payload: unknown): Captured[] {
  const calls: Captured[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit) => {
      calls.push({
        url: String(url),
        body: JSON.parse(String(init.body)),
        headers: (init.headers ?? {}) as Record<string, string>,
      });
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(payload),
        text: () => Promise.resolve(JSON.stringify(payload)),
      } as Response);
    }),
  );
  return calls;
}

interface ProviderCase {
  name: string;
  provider: LLMProviderConfig;
  call: (p: LLMProviderConfig, r: LLMRequest) => Promise<LLMResponse>;
  /** Minimal valid response for this provider's parser. */
  response: unknown;
  /** Where this API expects each parameter. */
  temperatureOf: (c: Captured) => unknown;
  maxTokensOf: (c: Captured) => unknown;
  systemOf: (c: Captured) => unknown;
  /** Default max_tokens when the caller supplies none, if the adapter sets one. */
  defaultMaxTokens?: number;
}

const base = { id: "p1", name: "Test", api_key: "test-key" };

const cases: ProviderCase[] = [
  {
    name: "openai",
    provider: { ...base, type: "openai" },
    call: callOpenAI,
    response: { model: "m", choices: [{ message: { content: "ok" } }] },
    temperatureOf: (c) => c.body.temperature,
    maxTokensOf: (c) => c.body.max_tokens,
    systemOf: (c) =>
      (c.body.messages as { role: string; content: string }[]).find((m) => m.role === "system")
        ?.content,
  },
  {
    name: "ollama",
    provider: { ...base, type: "ollama", base_url: "http://localhost:11434" },
    call: callOllama,
    response: { model: "m", choices: [{ message: { content: "ok" } }] },
    temperatureOf: (c) => c.body.temperature,
    maxTokensOf: (c) => c.body.max_tokens,
    systemOf: (c) =>
      (c.body.messages as { role: string; content: string }[]).find((m) => m.role === "system")
        ?.content,
  },
  {
    name: "anthropic",
    provider: { ...base, type: "anthropic" },
    call: callAnthropic,
    response: { model: "m", content: [{ type: "text", text: "ok" }] },
    temperatureOf: (c) => c.body.temperature,
    maxTokensOf: (c) => c.body.max_tokens,
    systemOf: (c) => c.body.system,
    // Anthropic requires max_tokens, so the adapter fills in a default.
    defaultMaxTokens: 4096,
  },
  {
    name: "gemini",
    provider: { ...base, type: "gemini" },
    call: callGemini,
    response: { candidates: [{ content: { parts: [{ text: "ok" }] } }] },
    temperatureOf: (c) =>
      (c.body.generationConfig as Record<string, unknown> | undefined)?.temperature,
    maxTokensOf: (c) =>
      (c.body.generationConfig as Record<string, unknown> | undefined)?.maxOutputTokens,
    // Gemini has no system role: the adapter prepends it as a user turn.
    systemOf: (c) =>
      (c.body.contents as { role: string; parts: { text: string }[] }[])[0]?.parts[0]?.text,
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each(cases)("$name request body", (tc) => {
  let calls: Captured[];

  beforeEach(() => {
    calls = stubFetch(tc.response);
  });

  it("forwards a temperature that was set", async () => {
    await tc.call(tc.provider, { model: "m", user_prompt: "hi", temperature: 0.7 });
    expect(tc.temperatureOf(calls[0])).toBe(0.7);
  });

  it("forwards temperature 0 instead of dropping it", async () => {
    // The regression guard: 0 is falsy, so any truthiness check on the way
    // down would turn "deterministic" into "provider default".
    await tc.call(tc.provider, { model: "m", user_prompt: "hi", temperature: 0 });
    expect(tc.temperatureOf(calls[0])).toBe(0);
  });

  it("omits temperature entirely when unset", async () => {
    await tc.call(tc.provider, { model: "m", user_prompt: "hi" });
    expect(tc.temperatureOf(calls[0])).toBeUndefined();
    expect(JSON.stringify(calls[0].body)).not.toContain("temperature");
  });

  it("forwards max_tokens", async () => {
    await tc.call(tc.provider, { model: "m", user_prompt: "hi", max_tokens: 256 });
    expect(tc.maxTokensOf(calls[0])).toBe(256);
  });

  it("omits max_tokens when unset (or uses the documented default)", async () => {
    await tc.call(tc.provider, { model: "m", user_prompt: "hi" });
    expect(tc.maxTokensOf(calls[0])).toBe(tc.defaultMaxTokens);
  });

  it("forwards the system prompt", async () => {
    await tc.call(tc.provider, {
      model: "m",
      user_prompt: "hi",
      system_prompt: "be terse",
    });
    expect(tc.systemOf(calls[0])).toBe("be terse");
  });

  it("forwards the user prompt verbatim", async () => {
    await tc.call(tc.provider, { model: "m", user_prompt: "the quick brown fox" });
    expect(JSON.stringify(calls[0].body)).toContain("the quick brown fox");
  });

  it("passes the abort signal through to fetch", async () => {
    const controller = new AbortController();
    await tc.call(tc.provider, { model: "m", user_prompt: "hi", signal: controller.signal });
    const init = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
    expect(init.signal).toBe(controller.signal);
  });
});

describe("model identifier placement", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("openai sends the model in the body", async () => {
    const calls = stubFetch({ model: "m", choices: [{ message: { content: "ok" } }] });
    await callOpenAI({ ...base, type: "openai" }, { model: "gpt-4o", user_prompt: "hi" });
    expect(calls[0].body.model).toBe("gpt-4o");
  });

  it("anthropic sends the model in the body", async () => {
    const calls = stubFetch({ model: "m", content: [{ type: "text", text: "ok" }] });
    await callAnthropic(
      { ...base, type: "anthropic" },
      { model: "claude-sonnet-4-20250514", user_prompt: "hi" },
    );
    expect(calls[0].body.model).toBe("claude-sonnet-4-20250514");
  });

  it("gemini sends the model in the URL path, not the body", async () => {
    const calls = stubFetch({ candidates: [{ content: { parts: [{ text: "ok" }] } }] });
    await callGemini({ ...base, type: "gemini" }, { model: "gemini-2.5-pro", user_prompt: "hi" });
    expect(calls[0].url).toContain("/models/gemini-2.5-pro:generateContent");
    expect(calls[0].body.model).toBeUndefined();
  });
});

describe("openai max_completion_tokens retry", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("retries with max_completion_tokens and keeps temperature on the retry", async () => {
    // Reasoning models reject `max_tokens` with a 400 naming the replacement.
    // The retry must carry every other parameter across unchanged.
    const bodies: Record<string, unknown>[] = [];
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)));
        call++;
        if (call === 1) {
          return Promise.resolve({
            ok: false,
            status: 400,
            text: () =>
              Promise.resolve(
                '{"error":{"message":"Unsupported parameter: use max_completion_tokens"}}',
              ),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ model: "m", choices: [{ message: { content: "ok" } }] }),
          text: () => Promise.resolve("{}"),
        } as Response);
      }),
    );

    await callOpenAI(
      { ...base, type: "openai" },
      { model: "o3", user_prompt: "hi", max_tokens: 512, temperature: 0 },
    );

    expect(bodies).toHaveLength(2);
    expect(bodies[0].max_tokens).toBe(512);
    expect(bodies[1].max_completion_tokens).toBe(512);
    expect(bodies[1].max_tokens).toBeUndefined();
    expect(bodies[1].temperature).toBe(0);
  });
});
