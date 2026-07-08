import { useState, useEffect, useRef } from "preact/hooks";
import {
  getSettings,
  saveSettings,
  DEFAULT_REQUEST_TIMEOUT_MS,
  MIN_REQUEST_TIMEOUT_MS,
  MAX_REQUEST_TIMEOUT_MS,
  type LLMProviderConfig,
} from "@/shared/settings";
import { exportBackup, importBackup } from "@/shared/backup";
import { ensureHostPermissions } from "@/shared/host-permission";
import { ProviderSettings } from "./ProviderSettings";

interface Props {
  onClose: () => void;
}

export function Settings({ onClose }: Props) {
  const [providers, setProviders] = useState<LLMProviderConfig[]>([]);
  const [includeKeys, setIncludeKeys] = useState(false);
  const [backupStatus, setBackupStatus] = useState<{ msg: string; ok: boolean } | null>(null);
  // File picked for import, held until the user confirms the restore. Importing
  // replaces all existing actions and categories (providers are merged) with no
  // undo — that must never happen without an explicit warning.
  const [pendingImport, setPendingImport] = useState<File | null>(null);
  // Timeout is edited in whole seconds for readability; stored as ms.
  const [timeoutSec, setTimeoutSec] = useState(
    Math.round(DEFAULT_REQUEST_TIMEOUT_MS / 1000).toString(),
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getSettings().then((s) => {
      setProviders(s.llm_providers);
      setTimeoutSec(
        Math.round((s.request_timeout_ms ?? DEFAULT_REQUEST_TIMEOUT_MS) / 1000).toString(),
      );
    });
  }, []);

  async function handleSaveProviders(updated: LLMProviderConfig[]) {
    setProviders(updated);
    const current = await getSettings();
    await saveSettings({ ...current, llm_providers: updated });
  }

  // Clamp to the allowed range and persist on blur so a half-typed value never
  // reaches storage. A non-numeric entry falls back to the default.
  async function handleSaveTimeout() {
    const parsed = Number.parseInt(timeoutSec, 10);
    const ms = Number.isFinite(parsed)
      ? Math.min(Math.max(parsed * 1000, MIN_REQUEST_TIMEOUT_MS), MAX_REQUEST_TIMEOUT_MS)
      : DEFAULT_REQUEST_TIMEOUT_MS;
    setTimeoutSec(Math.round(ms / 1000).toString());
    const current = await getSettings();
    await saveSettings({ ...current, request_timeout_ms: ms });
  }

  async function handleExport() {
    try {
      setBackupStatus(null);
      await exportBackup(includeKeys);
      setBackupStatus({ msg: "Backup exported.", ok: true });
    } catch (e) {
      setBackupStatus({ msg: e instanceof Error ? e.message : "Export failed", ok: false });
    }
  }

  function handleImportPick(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!fileInputRef.current) return;
    fileInputRef.current.value = "";
    if (!file) return;
    setBackupStatus(null);
    setPendingImport(file);
  }

  async function handleImportConfirmed() {
    const file = pendingImport;
    setPendingImport(null);
    if (!file) return;
    try {
      setBackupStatus(null);
      const result = await importBackup(file);
      // Refresh the provider list so imported providers show up immediately,
      // instead of only after closing and reopening Settings.
      const settings = await getSettings();
      setProviders(settings.llm_providers);
      // Grant host access for custom-URL providers (Ollama on LAN,
      // OpenAI-compatible, …) now, while the confirm-click user gesture is
      // still active, so imported providers work on the first run instead of
      // failing for lack of permission. Best-effort: if the gesture has expired
      // the grant can still happen later by re-saving the provider in settings.
      try {
        await ensureHostPermissions(
          settings.llm_providers.map((p) => p.base_url).filter((u): u is string => !!u),
        );
      } catch {
        // Ignore — execution surfaces a clear hint if a grant is still missing.
      }
      setBackupStatus({
        msg: `Imported ${result.actions} action${result.actions !== 1 ? "s" : ""}, ${result.providers} provider${result.providers !== 1 ? "s" : ""}.`,
        ok: true,
      });
    } catch (e) {
      setBackupStatus({ msg: e instanceof Error ? e.message : "Import failed", ok: false });
    }
  }

  return (
    <div class="flex flex-col h-screen">
      <div class="flex items-center justify-between p-3 border-b bg-white">
        <h1 class="font-bold text-sm">Settings</h1>
        <button onClick={onClose} class="text-xs text-gray-400 hover:text-gray-600">
          Close
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-3">
        <ProviderSettings providers={providers} onSave={handleSaveProviders} />

        <div class="mt-6 pt-4 border-t">
          <p class="text-xs font-semibold text-gray-500 uppercase mb-3">Request timeout</p>
          <div class="flex items-center gap-2">
            <input
              type="number"
              min={Math.round(MIN_REQUEST_TIMEOUT_MS / 1000)}
              max={Math.round(MAX_REQUEST_TIMEOUT_MS / 1000)}
              value={timeoutSec}
              onInput={(e) => setTimeoutSec((e.target as HTMLInputElement).value)}
              onBlur={handleSaveTimeout}
              class="w-24 p-2 bg-white border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-300"
            />
            <span class="text-xs text-gray-500">
              seconds ({Math.round(MIN_REQUEST_TIMEOUT_MS / 1000)}–
              {Math.round(MAX_REQUEST_TIMEOUT_MS / 1000)})
            </span>
          </div>
          <p class="text-xs text-gray-400 mt-1.5">
            How long to wait for an AI response before giving up. Raise this for slow reasoning
            models or local Ollama. You can cancel a running request any time.
          </p>
        </div>

        <div class="mt-6 pt-4 border-t">
          <p class="text-xs font-semibold text-gray-500 uppercase mb-3">Backup</p>

          <div class="flex items-center gap-3 mb-2">
            <button
              onClick={handleExport}
              class="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition"
            >
              ↓ Export
            </button>
            <label class="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeKeys}
                onChange={(e) => setIncludeKeys((e.target as HTMLInputElement).checked)}
              />
              Include API keys
            </label>
          </div>

          <button
            onClick={() => fileInputRef.current?.click()}
            class="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition"
          >
            ↑ Import from file
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            class="hidden"
            onChange={handleImportPick}
          />

          {pendingImport && (
            <div class="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
              <p class="text-xs text-amber-800 mb-2">
                Importing "{pendingImport.name}" replaces all existing actions and categories
                (providers are merged). This cannot be undone.
              </p>
              <div class="flex gap-2">
                <button
                  onClick={handleImportConfirmed}
                  class="text-xs px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition"
                >
                  Replace and import
                </button>
                <button
                  onClick={() => setPendingImport(null)}
                  class="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {backupStatus && (
            <p class={`text-xs mt-2 ${backupStatus.ok ? "text-green-600" : "text-red-500"}`}>
              {backupStatus.msg}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
