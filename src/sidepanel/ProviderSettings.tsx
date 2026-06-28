import { useState, useEffect, useRef } from "preact/hooks";
import type { LLMProviderConfig, LLMProviderType } from "@/shared/settings";
import { ensureHostPermission } from "@/shared/host-permission";
import { listLocalWorkflows } from "@/shared/local-workflows";
import { fetchModels, type ModelInfo } from "@/shared/llm/models";
import { probeModel } from "@/shared/llm";

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

/**
 * Whether a provider has enough credentials to query its model list:
 * an API key (except Ollama) and, for OpenAI-compatible endpoints, a base URL.
 */
function providerHasCreds(p: LLMProviderConfig): boolean {
  const hasKey = p.type === "ollama" || p.api_key.trim().length > 0;
  const hasUrl = p.type !== "openai-compatible" || !!p.base_url?.trim();
  return hasKey && hasUrl;
}

/**
 * Fingerprint of the credentials that select a model list. Used to tell whether
 * the connection currently shown still matches the one that was verified — so
 * editing an unrelated field (e.g. the display name) doesn't force a re-test,
 * but changing the key, URL or type does.
 */
function credsFingerprint(p: LLMProviderConfig): string {
  return `${p.type}|${p.api_key.trim()}|${p.base_url?.trim() ?? ""}`;
}

interface Props {
  providers: LLMProviderConfig[];
  onSave: (providers: LLMProviderConfig[]) => void;
}

/** Panel for managing LLM provider API keys. */
export function ProviderSettings({ providers, onSave }: Props) {
  const [editing, setEditing] = useState<LLMProviderConfig | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  // Fingerprint of the credentials whose model list is currently loaded, i.e.
  // the connection that has been verified. The model picker and Save stay locked
  // until this matches the credentials on screen.
  const [verifiedCreds, setVerifiedCreds] = useState<string | null>(null);
  // Result of probing the selected model with a real chat call: { ok } tells
  // success from failure, `text` is the status message (OK note or error text).
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<{ ok: boolean; text: string } | null>(null);
  // The currently in-flight probe. A new probe (or leaving the editor) aborts the
  // previous one, so a slow earlier reply can't overwrite a newer selection's
  // result — the displayed status always belongs to the latest picked model.
  const probeAbort = useRef<AbortController | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    name: string;
    count: number;
  } | null>(null);

  // Existing (already-saved) providers have working credentials, so load their
  // models automatically on open — no re-test needed. New providers load their
  // list only when the user runs the connection test.
  useEffect(() => {
    if (!editing) return;
    const isExisting = providers.some((p) => p.id === editing.id);
    if (!isExisting || !providerHasCreds(editing)) return;
    let cancelled = false;
    setLoadingModels(true);
    fetchModels(editing)
      .then((models) => {
        if (!cancelled) setAvailableModels(models);
      })
      .catch((err) => {
        if (cancelled) return;
        setAvailableModels([]);
        // Don't leave a silently blank picker — surface why the list is empty.
        // A 404 from an OpenAI-compatible server just means it has no /models
        // route (manual entry is fine); anything else is a real problem to show.
        const msg = err instanceof Error ? err.message : "Could not load models";
        setTestResult(editing.type === "openai-compatible" && /\b404\b/.test(msg) ? "manual" : msg);
      })
      .finally(() => {
        if (!cancelled) setLoadingModels(false);
      });
    return () => {
      cancelled = true;
    };
    // Only re-run when switching to a different provider, not on every keystroke.
  }, [editing?.id]);

  // Abort an in-flight model probe when the editor closes or switches providers,
  // so a late reply can't surface under a different (or no) provider. The aborted
  // probe deliberately skips its own cleanup, so reset the probe UI here.
  useEffect(() => {
    return () => {
      probeAbort.current?.abort();
      probeAbort.current = null;
      setProbing(false);
      setProbeResult(null);
    };
  }, [editing?.id]);

  function startAdd() {
    setEditing({
      id: crypto.randomUUID(),
      type: "openai",
      name: "OpenAI",
      api_key: "",
      // No model preselected — the user picks one from the live list after the
      // connection test loads the provider's models.
      model: "",
    });
    setAvailableModels([]);
    setVerifiedCreds(null);
    setTestResult(null);
    setProbeResult(null);
  }

  function startEdit(provider: LLMProviderConfig) {
    setEditing({ ...provider });
    setAvailableModels([]);
    // Saved credentials are already known-good — treat them as verified so the
    // user can re-save without testing again unless they change the connection.
    setVerifiedCreds(credsFingerprint(provider));
    setTestResult(null);
    setProbeResult(null);
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

    // The Save button is disabled until the connection is verified and a model
    // is chosen, so trust the user's explicit selection.
    const withModel: LLMProviderConfig = {
      ...editing,
      model: editing.model?.trim() ?? "",
    };
    const saved =
      withModel.type === "ollama" && !withModel.api_key
        ? { ...withModel, api_key: "ollama" }
        : withModel;
    const updated = providers.filter((p) => p.id !== saved.id);
    updated.push(saved);
    onSave(updated);
    setEditing(null);
    setTestResult(null);
  }

  // Verify the connection by loading the provider's model list. A successful
  // fetch both confirms auth/connectivity and populates the model picker.
  async function handleTest() {
    if (!editing) return;
    if (editing.type !== "ollama" && !editing.api_key.trim()) return;
    if (editing.type === "openai-compatible" && !editing.base_url?.trim()) return;
    setTesting(true);
    setTestResult(null);
    setProbeResult(null);

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
      const models = await fetchModels(testProvider);
      setAvailableModels(models);
      setVerifiedCreds(credsFingerprint(editing));
      // Drop a stale selection that the live list no longer offers, so the
      // picker doesn't keep a model the provider can't serve.
      if (editing.model && models.length > 0 && !models.some((m) => m.id === editing.model)) {
        setEditing({ ...editing, model: "" });
      }
      setTestResult("success");
    } catch (err) {
      setAvailableModels([]);
      const msg = err instanceof Error ? err.message : "Connection failed";
      if (editing.type === "openai-compatible") {
        // A /models route is optional for OpenAI-compatible servers, so let the
        // user type the model name manually instead of blocking Save. A 404 means
        // the server simply has no listing route — fall back quietly. Any other
        // failure (auth, wrong URL, network) is a real problem: keep the manual
        // fallback but surface the actual error instead of hiding it behind a
        // generic "no model list" message.
        setVerifiedCreds(credsFingerprint(editing));
        setTestResult(/\b404\b/.test(msg) ? "manual" : msg);
      } else {
        setTestResult(msg);
      }
    } finally {
      setTesting(false);
    }
  }

  // Probe the selected model with a real chat call. A model showing up in the
  // list is no guarantee it works — Gemini keeps retired models in its list that
  // 404 on the actual call — so this is the only reliable check. Any successful
  // reply means OK; we don't show the content (self-reported names are unreliable).
  // Runs the probe against an explicit provider+model so it can be called right
  // after a selection (where `editing` state hasn't updated yet) without racing.
  async function runProbe(prov: LLMProviderConfig, model: string) {
    // Abort any probe still in flight so its (now stale) reply can't land after
    // this one and show a result for a model the user already moved off of.
    probeAbort.current?.abort();
    const controller = new AbortController();
    probeAbort.current = controller;
    setProbing(true);
    setProbeResult(null);
    try {
      await probeModel(prov, model, controller.signal);
      if (controller.signal.aborted) return;
      setProbeResult({ ok: true, text: "Model responded — OK" });
    } catch (err) {
      // A newer probe (or leaving the editor) aborted this one — drop its result.
      if (controller.signal.aborted) return;
      setProbeResult({ ok: false, text: err instanceof Error ? err.message : "Model test failed" });
    } finally {
      // Only the latest probe owns the spinner; a superseded one must not clear it.
      if (probeAbort.current === controller) {
        probeAbort.current = null;
        setProbing(false);
      }
    }
  }

  // Editing / adding a provider
  if (editing) {
    const compatibleNeedsUrl = editing.type === "openai-compatible" && !editing.base_url?.trim();
    const hasCreds = providerHasCreds(editing);
    const credsVerified = verifiedCreds === credsFingerprint(editing);
    const baseInvalid =
      (editing.type !== "ollama" && !editing.api_key.trim()) || compatibleNeedsUrl;

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
              // Clear the model — a model from another provider type is meaningless
              // here, and the user re-picks from the new type's live list.
              setEditing({ ...editing, type, name: label, model: "" });
              setAvailableModels([]);
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

        {/* Step 1 — verify the connection, which loads the model list. */}
        <button
          onClick={handleTest}
          disabled={testing || baseInvalid}
          class="w-full border text-sm py-1.5 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
        >
          {testing
            ? "Testing connection…"
            : credsVerified
              ? "Re-test connection"
              : "Test connection"}
        </button>

        {testResult && (
          <div
            class={`text-xs px-2 py-1.5 rounded ${
              testResult === "success"
                ? "bg-green-50 text-green-700"
                : testResult === "manual"
                  ? "bg-amber-50 text-amber-700"
                  : "bg-red-50 text-red-600"
            }`}
          >
            {testResult === "success"
              ? `Connection successful${availableModels.length > 0 ? ` — ${availableModels.length} model${availableModels.length !== 1 ? "s" : ""} found` : ""}!`
              : testResult === "manual"
                ? "Connected, but no model list is available — enter a model name below."
                : testResult}
          </div>
        )}

        {/* Step 2 — pick the model from the verified provider's live list. */}
        <div>
          <label class="text-xs font-medium text-gray-700">Default model</label>
          {!hasCreds ? (
            <div class="w-full border rounded px-2 py-1.5 text-sm text-gray-400 bg-gray-50 mt-0.5">
              {editing.type === "openai-compatible"
                ? "Enter the API key and base URL, then test the connection."
                : "Enter the API key, then test the connection."}
            </div>
          ) : testing || loadingModels ? (
            <div class="w-full border rounded px-2 py-1.5 text-sm text-gray-400 bg-gray-50 mt-0.5">
              Loading available models…
            </div>
          ) : !credsVerified ? (
            <div class="w-full border rounded px-2 py-1.5 text-sm text-gray-400 bg-gray-50 mt-0.5">
              Test the connection to load available models.
            </div>
          ) : availableModels.length > 0 ? (
            <select
              value={editing.model ?? ""}
              onChange={(e) => {
                const model = (e.target as HTMLSelectElement).value;
                const next = { ...editing, model };
                setEditing(next);
                // Auto-verify the picked model: a listed model can still fail at
                // chat time (responses-only models, retired entries), so catch it
                // here before saving rather than at inference.
                if (model.trim()) void runProbe(next, model);
                else setProbeResult(null);
              }}
              class="w-full border rounded px-2 py-1.5 text-sm mt-0.5"
            >
              <option value="" disabled>
                Select a model…
              </option>
              {/* Keep the current value selectable even if the live list omits it. */}
              {editing.model && !availableModels.some((m) => m.id === editing.model) && (
                <option value={editing.model}>{editing.model}</option>
              )}
              {availableModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          ) : (
            // Connection verified but no list returned (e.g. an endpoint without
            // a /models route) — fall back to manual entry so saving still works.
            <input
              type="text"
              value={editing.model ?? ""}
              onInput={(e) => {
                setProbeResult(null);
                setEditing({ ...editing, model: (e.target as HTMLInputElement).value });
              }}
              class="w-full border rounded px-2 py-1.5 text-sm mt-0.5"
              placeholder="Enter a model name"
            />
          )}
          <p class="text-xs text-gray-400 mt-0.5">
            Selecting a model sends a short test prompt to check it works, using a few tokens.
          </p>
          {/* Selecting a model auto-probes it with a real call: a listed model can
              still 404 at chat time (Gemini keeps retired models in its list), so
              this is the only reliable check — any successful reply counts as OK. */}
          {credsVerified && editing.model?.trim() && (probing || probeResult) && (
            <div class="mt-1.5">
              {probing ? (
                <div class="text-xs text-gray-400">Testing model…</div>
              ) : (
                probeResult && (
                  <div
                    class={`text-xs rounded px-2 py-1.5 ${
                      probeResult.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                    }`}
                  >
                    {probeResult.text}
                  </div>
                )
              )}
            </div>
          )}
        </div>

        {/* Step 3 — save, enabled once the connection is verified and a model chosen. */}
        <button
          onClick={handleSaveProvider}
          disabled={baseInvalid || !credsVerified || !editing.model?.trim()}
          class="w-full bg-blue-600 text-white text-sm py-1.5 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
        >
          Save
        </button>
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
