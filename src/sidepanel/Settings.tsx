import { useState, useEffect, useRef } from "preact/hooks";
import { getSettings, saveSettings, type LLMProviderConfig } from "@/shared/settings";
import { exportBackup, importBackup } from "@/shared/backup";
import { ProviderSettings } from "./ProviderSettings";

interface Props {
  onClose: () => void;
}

export function Settings({ onClose }: Props) {
  const [providers, setProviders] = useState<LLMProviderConfig[]>([]);
  const [includeKeys, setIncludeKeys] = useState(false);
  const [backupStatus, setBackupStatus] = useState<{ msg: string; ok: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getSettings().then((s) => setProviders(s.llm_providers));
  }, []);

  async function handleSaveProviders(updated: LLMProviderConfig[]) {
    setProviders(updated);
    const current = await getSettings();
    await saveSettings({ ...current, llm_providers: updated });
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

  async function handleImport(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!fileInputRef.current) return;
    fileInputRef.current.value = "";
    if (!file) return;
    try {
      setBackupStatus(null);
      const result = await importBackup(file);
      // Refresh the provider list so imported providers show up immediately,
      // instead of only after closing and reopening Settings.
      const settings = await getSettings();
      setProviders(settings.llm_providers);
      setBackupStatus({
        msg: `Imported ${result.workflows} action${result.workflows !== 1 ? "s" : ""}, ${result.providers} provider${result.providers !== 1 ? "s" : ""}.`,
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
            onChange={handleImport}
          />

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
