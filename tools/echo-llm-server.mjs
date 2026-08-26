#!/usr/bin/env node
/**
 * Minimal fake LLM server for verifying which request parameters ancroo-web
 * actually puts on the wire. Speaks all four dialects the extension supports,
 * so every adapter in src/shared/llm/ can be exercised against it.
 *
 * Usage:  node echo-llm-server.mjs [port]      (default: 8899)
 *
 * Provider setup in ancroo-web (API key: any non-empty string, e.g. "test"):
 *   OpenAI-compatible  base URL: http://localhost:8899/v1
 *   Ollama             base URL: http://localhost:8899
 *   Anthropic          base URL: http://localhost:8899
 *   Gemini             base URL: http://localhost:8899/v1beta
 *
 * Every call is logged and the received parameters are echoed back as the
 * assistant reply, so the values show up in the side panel without DevTools.
 */

import { createServer } from "node:http";

const port = Number(process.argv[2] ?? 8899);
const MODEL = "echo-model";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

const json = (res, status, payload) => {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    ...cors,
  });
  res.end(body);
};

const readBody = async (req) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
};

/** Render "what arrived" for a flat set of keys, distinguishing absent from null/NaN. */
const describe = (obj, keys) =>
  keys
    .map((k) => {
      const present = obj && Object.prototype.hasOwnProperty.call(obj, k);
      const val = present ? `${JSON.stringify(obj[k])} (${typeof obj[k]})` : "ABSENT";
      return `${(k + ":").padEnd(24)}${val}`;
    })
    .join("\n");

const logCall = (dialect, req, body) => {
  console.log(`\n[${new Date().toISOString()}] ${dialect}  ${req.method} ${req.url}`);
  const auth =
    req.headers.authorization ?? req.headers["x-api-key"] ?? req.headers["x-goog-api-key"];
  console.log("auth header:", auth ?? "(none)");
  console.log("body:", JSON.stringify(body, null, 2));
};

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    return res.end();
  }

  const url = new URL(req.url, `http://localhost:${port}`);
  const path = url.pathname;

  // ---- model listings (make the provider "Test" button and picker work) ----

  if (req.method === "GET" && path === "/api/tags") {
    // Ollama
    console.log(`\n[${new Date().toISOString()}] OLLAMA   GET ${path}`);
    return json(res, 200, { models: [{ name: MODEL, model: MODEL }] });
  }

  if (req.method === "GET" && path.endsWith("/models")) {
    console.log(`\n[${new Date().toISOString()}] LIST     GET ${path}`);
    // Shape covers both the OpenAI and Anthropic listing formats, plus Gemini's.
    return json(res, 200, {
      object: "list",
      data: [{ id: MODEL, object: "model", display_name: MODEL, owned_by: "echo" }],
      models: [
        {
          name: `models/${MODEL}`,
          displayName: MODEL,
          supportedGenerationMethods: ["generateContent"],
        },
      ],
    });
  }

  // ---- chat calls ----

  if (req.method === "POST") {
    const raw = await readBody(req);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      console.log(`\n!! ${path}: body is not valid JSON:\n`, raw);
      return json(res, 400, { error: { message: "invalid JSON body" } });
    }

    // Anthropic Messages API
    if (path.endsWith("/v1/messages")) {
      logCall("ANTHROPIC", req, body);
      const report =
        "RECEIVED PARAMETERS (Anthropic)\n" +
        describe(body, ["model", "temperature", "max_tokens", "system"]) +
        `\n${"user message:".padEnd(24)}${body.messages?.[0]?.content ?? "ABSENT"}` +
        `\n${"all body keys:".padEnd(24)}${Object.keys(body).join(", ")}`;
      console.log("---\n" + report);
      return json(res, 200, {
        id: "msg_echo",
        type: "message",
        role: "assistant",
        model: body.model ?? MODEL,
        content: [{ type: "text", text: report }],
        usage: { input_tokens: 0, output_tokens: 0 },
      });
    }

    // Gemini generateContent
    if (path.endsWith(":generateContent")) {
      logCall("GEMINI", req, body);
      const cfg = body.generationConfig;
      const report =
        "RECEIVED PARAMETERS (Gemini)\n" +
        `${"model (from path):".padEnd(24)}${decodeURIComponent(
          path.split("/models/")[1]?.replace(":generateContent", "") ?? "?",
        )}\n` +
        `${"generationConfig:".padEnd(24)}${cfg ? "" : "ABSENT"}\n` +
        (cfg ? describe(cfg, ["temperature", "maxOutputTokens"]) + "\n" : "") +
        `${"contents roles:".padEnd(24)}${(body.contents ?? []).map((c) => c.role).join(", ")}\n` +
        `${"all body keys:".padEnd(24)}${Object.keys(body).join(", ")}`;
      console.log("---\n" + report);
      return json(res, 200, {
        candidates: [{ content: { role: "model", parts: [{ text: report }] } }],
        usageMetadata: { promptTokenCount: 0, candidatesTokenCount: 0 },
      });
    }

    // OpenAI / OpenAI-compatible / OpenRouter / Ollama
    if (path.endsWith("/chat/completions")) {
      logCall("OPENAI", req, body);
      const report =
        "RECEIVED PARAMETERS (OpenAI-style)\n" +
        describe(body, ["model", "temperature", "max_tokens", "max_completion_tokens"]) +
        `\n${"system message:".padEnd(24)}${
          body.messages?.find((m) => m.role === "system")?.content ?? "ABSENT"
        }` +
        `\n${"user message:".padEnd(24)}${
          body.messages?.find((m) => m.role === "user")?.content ?? "ABSENT"
        }` +
        `\n${"all body keys:".padEnd(24)}${Object.keys(body).join(", ")}`;
      console.log("---\n" + report);
      return json(res, 200, {
        id: "chatcmpl-echo",
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: body.model ?? MODEL,
        choices: [
          { index: 0, message: { role: "assistant", content: report }, finish_reason: "stop" },
        ],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      });
    }
  }

  console.log(`\n[${new Date().toISOString()}] UNHANDLED ${req.method} ${path}`);
  json(res, 404, { error: { message: `no route for ${req.method} ${path}` } });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Echo LLM server on http://localhost:${port}`);
  console.log(`  OpenAI-compatible -> http://localhost:${port}/v1`);
  console.log(`  Ollama / Anthropic -> http://localhost:${port}`);
  console.log(`  Gemini            -> http://localhost:${port}/v1beta`);
});
