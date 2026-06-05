import { useState } from "preact/hooks";
import type { LLMProviderConfig, LLMProviderType } from "@/shared/settings";
import { ensureHostPermission } from "@/shared/host-permission";
import { listLocalWorkflows } from "@/shared/local-workflows";

const PROVIDER_TYPES: { value: LLMProviderType; label: string }[] = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "gemini", label: "Google Gemini" },
  { value: "ollama", label: "Ollama (local)" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "openai-compatible", label: "OpenAI-Compatible" },
];

// Displayed API endpoints — kept in sync with the adapters' actual base URLs.
// OpenAI-style providers include the version segment ("/v1"); Anthropic and
// Ollama use a host-root base to which the adapter appends the version path.
const DEFAULT_BASE_URLS: Partial<Record<LLMProviderType, string>> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
  openrouter: "https://openrouter.ai/api/v1",
  ollama: "http://localhost:11434",
};

const DEFAULT_MODELS: Record<LLMProviderType, string> = {
  openai: "gpt-4o",
  anthropic: "claude-sonnet-4-20250514",
  gemini: "gemini-2.0-flash",
  ollama: "gemma3:12b",
  openrouter: "openai/gpt-4o",
  "openai-compatible": "",
};

interface Props {
  providers: LLMProviderConfig[];
  onSave: (providers: LLMProviderConfig[]) => void;
}

/** Panel for managing LLM provider API keys. */
export function ProviderSettings({ providers, onSave }: Props) {
  const [editing, setEditing] = useState<LLMProviderConfig | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    name: string;
    count: number;
  } | null>(null);

  function startAdd() {
    setEditing({
      id: crypto.randomUUID(),
      type: "openai",
      name: "OpenAI",
      api_key: "",
    });
    setTestResult(null);
  }

  function startEdit(provider: LLMProviderConfig) {
    setEditing({ ...provider });
    setTestResult(null);
  }

  async function startDelete(id: string, name: string) {
    const workflows = await listLocalWorkflows();
    const count = workflows.filter((w) => w.provider_id === id).length;
    if (count === 0) {
      onSave(providers.filter((p) => p.id !== id));
    } else {
      setPendingDelete({ id, name, count });
    }
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    onSave(providers.filter((p) => p.id !== pendingDelete.id));
    setPendingDelete(null);
  }

  async function handleSaveProvider() {
    if (!editing) return;
    // Ollama doesn't require an API key
    if (editing.type !== "ollama" && !editing.api_key.trim()) return;
    // openai-compatible requires a base URL — without it the request silently
    // hits api.openai.com and returns a confusing 401.
    if (editing.type === "openai-compatible" && !editing.base_url?.trim()) return;

    // Request host permission for custom URLs before saving
    if (editing.base_url) {
      const granted = await ensureHostPermission(editing.base_url);
      if (!granted) {
        setTestResult("Permission to access this URL was denied.");
        return;
      }
    }

    const saved =
      editing.type === "ollama" && !editing.api_key ? { ...editing, api_key: "ollama" } : editing;
    const updated = providers.filter((p) => p.id !== saved.id);
    updated.push(saved);
    onSave(updated);
    setEditing(null);
    setTestResult(null);
  }

  async function handleTest() {
    if (!editing) return;
    if (editing.type !== "ollama" && !editing.api_key.trim()) return;
    if (editing.type === "openai-compatible" && !editing.base_url?.trim()) return;
    setTesting(true);
    setTestResult(null);

    try {
      // Request host permission for custom URLs (Ollama, OpenAI-compatible)
      if (editing.base_url) {
        const granted = await ensureHostPermission(editing.base_url);
        if (!granted) {
          setTestResult("Permission to access this URL was denied.");
          setTesting(false);
          return;
        }
      }
      const testProvider =
        editing.type === "ollama" && !editing.api_key ? { ...editing, api_key: "ollama" } : editing;
      if (editing.type === "openai-compatible") {
        // No model is configured on the provider, so verify connectivity and
        // auth via GET /models instead of guessing a model name.
        const { pingOpenAI } = await import("@/shared/llm/openai");
        await pingOpenAI(testProvider);
      } else {
        const { callLLM } = await import("@/shared/llm");
        await callLLM(testProvider, {
          model: DEFAULT_MODELS[editing.type] || "gpt-4o",
          user_prompt: "Reply with exactly: OK",
          max_tokens: 5,
        });
      }
      setTestResult("success");
    } catch (err) {
      setTestResult(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setTesting(false);
    }
  }

  // Editing / adding a provider
  if (editing) {
    const compatibleNeedsUrl = editing.type === "openai-compatible" && !editing.base_url?.trim();

    return (
      <div class="space-y-3">
        <h3 class="text-xs font-semibold text-gray-500 uppercase">
          {providers.some((p) => p.id === editing.id) ? "Edit" : "Add"} Provider
        </h3>

        <div>
          <label class="text-xs font-medium text-gray-700">Type</label>
          <select
            value={editing.type}
            onChange={(e) => {
              const type = (e.target as HTMLSelectElement).value as LLMProviderType;
              const label = PROVIDER_TYPES.find((t) => t.value === type)?.label ?? type;
              setEditing({ ...editing, type, name: label });
            }}
            class="w-full border rounded px-2 py-1.5 text-sm mt-0.5"
          >
            {PROVIDER_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label class="text-xs font-medium text-gray-700">Display Name</label>
          <input
            type="text"
            value={editing.name}
            onInput={(e) => setEditing({ ...editing, name: (e.target as HTMLInputElement).value })}
            class="w-full border rounded px-2 py-1.5 text-sm mt-0.5"
            placeholder="My OpenAI"
          />
        </div>

        {editing.type !== "ollama" && (
          <div>
            <label class="text-xs font-medium text-gray-700">API Key</label>
            <input
              type="password"
              value={editing.api_key}
              onInput={(e) =>
                setEditing({ ...editing, api_key: (e.target as HTMLInputElement).value })
              }
              class="w-full border rounded px-2 py-1.5 text-sm font-mono mt-0.5"
              placeholder="sk-..."
            />
          </div>
        )}

        {editing.type === "openai-compatible" || editing.type === "ollama" ? (
          <div>
            <label class="text-xs font-medium text-gray-700">Base URL</label>
            <input
              type="url"
              value={editing.base_url ?? ""}
              onInput={(e) =>
                setEditing({ ...editing, base_url: (e.target as HTMLInputElement).value })
              }
              class="w-full border rounded px-2 py-1.5 text-sm mt-0.5"
              placeholder={
                editing.type === "ollama" ? "http://localhost:11434" : "http://localhost:1234/v1"
              }
            />
            {editing.type === "ollama" ? (
              <p class="text-xs text-gray-400 mt-0.5">Leave empty for localhost:11434</p>
            ) : compatibleNeedsUrl ? (
              <p class="text-xs text-amber-600 mt-0.5">
                Required — enter your server URL (e.g. http://localhost:1234/v1).
              </p>
            ) : (
              <p class="text-xs text-gray-400 mt-0.5">
                Include the version path (e.g. /v1) — the endpoint is appended automatically.
              </p>
            )}
          </div>
        ) : DEFAULT_BASE_URLS[editing.type] ? (
          <div>
            <label class="text-xs font-medium text-gray-700">API Endpoint</label>
            <div class="w-full border rounded px-2 py-1.5 text-sm text-gray-400 bg-gray-50 mt-0.5">
              {DEFAULT_BASE_URLS[editing.type]}
            </div>
          </div>
        ) : null}

        {testResult && (
          <div
            class={`text-xs px-2 py-1.5 rounded ${testResult === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}
          >
            {testResult === "success" ? "Connection successful!" : testResult}
          </div>
        )}

        <div class="flex gap-2">
          <button
            onClick={handleTest}
            disabled={
              testing ||
              (editing.type !== "ollama" && !editing.api_key.trim()) ||
              compatibleNeedsUrl
            }
            class="flex-1 border text-sm py-1.5 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
          >
            {testing ? "Testing..." : "Test"}
          </button>
          <button
            onClick={handleSaveProvider}
            disabled={(editing.type !== "ollama" && !editing.api_key.trim()) || compatibleNeedsUrl}
            class="flex-1 bg-blue-600 text-white text-sm py-1.5 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
          >
            Save
          </button>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setTestResult(null);
          }}
          class="w-full text-xs text-gray-400 hover:text-gray-600"
        >
          Cancel
        </button>
      </div>
    );
  }

  // Provider list
  return (
    <div class="space-y-3">
      <h3 class="text-xs font-semibold text-gray-500 uppercase">LLM Providers</h3>

      {pendingDelete && (
        <div class="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
          <p class="text-xs text-red-700">
            <span class="font-medium">{pendingDelete.name}</span> is used by {pendingDelete.count}{" "}
            action{pendingDelete.count !== 1 ? "s" : ""}. They will stop working after deletion.
          </p>
          <div class="flex gap-2">
            <button
              onClick={() => setPendingDelete(null)}
              class="flex-1 border text-xs py-1 rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={confirmDelete}
              class="flex-1 bg-red-500 text-white text-xs py-1 rounded hover:bg-red-600"
            >
              Delete anyway
            </button>
          </div>
        </div>
      )}

      {providers.length === 0 && <p class="text-xs text-gray-400">No providers configured yet.</p>}

      {providers.map((p) => (
        <div key={p.id} class="flex items-center justify-between p-2 bg-white rounded-lg border">
          <div>
            <div class="text-sm font-medium">{p.name}</div>
            <div class="text-xs text-gray-400">
              {p.type} — {p.base_url || DEFAULT_BASE_URLS[p.type] || "custom"} — ****
              {p.api_key.slice(-4)}
            </div>
          </div>
          <div class="flex gap-1">
            <button
              onClick={() => startEdit(p)}
              class="text-xs text-blue-500 hover:text-blue-700 px-1"
            >
              Edit
            </button>
            <button
              onClick={() => startDelete(p.id, p.name)}
              class="text-xs text-red-400 hover:text-red-600 px-1"
            >
              Delete
            </button>
          </div>
        </div>
      ))}

      <button
        onClick={startAdd}
        class="w-full border border-dashed rounded-lg py-2 text-sm text-gray-500 hover:text-gray-700 hover:border-gray-400 transition"
      >
        + Add Provider
      </button>
    </div>
  );
}

export { DEFAULT_MODELS };
