import { useState, useEffect, useRef } from "preact/hooks";
import { getSettings, saveSettings, type LLMProviderConfig } from "@/shared/settings";
import { importBackup } from "@/shared/backup";
import { seedStarterWorkflows } from "@/shared/local-workflows";
import { fetchModels } from "@/shared/llm/models";
import { ProviderSettings, DEFAULT_MODELS } from "./ProviderSettings";

/** Setup screen — LLM provider configuration. */
export function SetupScreen({ onComplete }: { onComplete: () => void }) {
  const [providers, setProviders] = useState<LLMProviderConfig[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<{ msg: string; ok: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getSettings().then((s) => setProviders(s.llm_providers));
  }, []);

  async function handleSaveProviders(updated: LLMProviderConfig[]) {
    setProviders(updated);
    const current = await getSettings();
    await saveSettings({ ...current, llm_providers: updated });
  }

  async function handleImport(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;
    try {
      setImportStatus(null);
      const result = await importBackup(file);
      const settings = await getSettings();
      setProviders(settings.llm_providers);
      setImportStatus({
        msg: `Imported ${result.workflows} action${result.workflows !== 1 ? "s" : ""}, ${result.providers} provider${result.providers !== 1 ? "s" : ""}.`,
        ok: true,
      });
    } catch (e) {
      setImportStatus({ msg: e instanceof Error ? e.message : "Import failed", ok: false });
    }
  }

  async function handleComplete() {
    if (providers.length === 0) {
      setError("Add at least one LLM provider to continue.");
      return;
    }
    setError(null);
    await saveSettings({ llm_providers: providers });

    // Seed starter workflows — try to detect the first available model
    const firstProvider = providers[0];
    let defaultModel = DEFAULT_MODELS[firstProvider.type] || "gpt-4o";
    try {
      const models = await fetchModels(firstProvider);
      if (models.length > 0) {
        defaultModel = models[0].id;
      }
    } catch {
      // Fall back to hardcoded default
    }
    await seedStarterWorkflows(firstProvider.id, defaultModel);

    onComplete();
  }

  return (
    <div class="flex flex-col h-screen p-4">
      <h1 class="text-lg font-bold mb-1">Ancroo Setup</h1>
      <p class="text-xs text-gray-500 mb-3">
        Add at least one LLM provider to get started. Starter actions will be created automatically.
      </p>

      <div class="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
        <p class="text-xs font-semibold text-gray-500 mb-2">Restore from backup</p>
        <button
          onClick={() => fileInputRef.current?.click()}
          class="text-xs px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 rounded-lg transition"
        >
          ↑ Import backup file
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          class="hidden"
          onChange={handleImport}
        />
        {importStatus && (
          <p class={`text-xs mt-2 ${importStatus.ok ? "text-green-600" : "text-red-500"}`}>
            {importStatus.msg}
          </p>
        )}
      </div>

      <p class="text-xs font-semibold text-gray-500 mb-2">Or add a provider manually</p>
      <div class="flex-1 overflow-y-auto min-h-0">
        <ProviderSettings providers={providers} onSave={handleSaveProviders} />
      </div>

      {error && <div class="text-xs text-red-600 mt-3">{error}</div>}

      <button
        onClick={handleComplete}
        disabled={providers.length === 0}
        class="mt-3 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 text-sm"
      >
        Complete Setup
      </button>
    </div>
  );
}
