import type { LocalWorkflow } from "./types";
import type { LLMProviderConfig } from "./settings";
import { listLocalWorkflows, saveLocalWorkflow } from "./local-workflows";
import { getSettings, saveSettings } from "./settings";
import { listCategories, saveCategory } from "./local-categories";
import type { Category } from "./local-categories";

export interface BackupData {
  version: "1";
  exportedAt: string;
  workflows: LocalWorkflow[];
  providers: LLMProviderConfig[];
  categories?: Category[];
}

export function validateBackup(data: unknown): data is BackupData {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  if (d.version !== "1") return false;
  if (!Array.isArray(d.workflows)) return false;
  if (!Array.isArray(d.providers)) return false;
  for (const w of d.workflows) {
    if (!w || typeof w !== "object") return false;
    const wf = w as Record<string, unknown>;
    if (typeof wf.slug !== "string" || typeof wf.name !== "string" || typeof wf.prompt_template !== "string") return false;
  }
  return true;
}

export async function exportBackup(includeApiKeys: boolean): Promise<void> {
  const [workflows, settings, categories] = await Promise.all([
    listLocalWorkflows(),
    getSettings(),
    listCategories(),
  ]);

  const providers = settings.llm_providers.map((p) =>
    includeApiKeys ? p : { ...p, api_key: "" },
  );

  const data: BackupData = {
    version: "1",
    exportedAt: new Date().toISOString(),
    workflows,
    providers,
    categories,
  };

  const json = JSON.stringify(data, null, 2);
  const dataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
  const date = new Date().toISOString().slice(0, 10);
  await chrome.downloads.download({
    url: dataUrl,
    filename: `ancroo-backup-${date}.json`,
    saveAs: false,
  });
}

export async function importBackup(file: File): Promise<{ workflows: number; providers: number }> {
  const text = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON file");
  }

  if (!validateBackup(parsed)) {
    throw new Error("Not a valid Ancroo backup file");
  }

  for (const workflow of parsed.workflows) {
    await saveLocalWorkflow(workflow);
  }

  if (parsed.categories && parsed.categories.length > 0) {
    for (const cat of parsed.categories) {
      if (cat && typeof cat.value === "string" && typeof cat.label === "string") {
        await saveCategory(cat);
      }
    }
  }

  if (parsed.providers.length > 0) {
    const current = await getSettings();
    const existingById = new Map(current.llm_providers.map((p) => [p.id, p]));
    for (const imported of parsed.providers) {
      const existing = existingById.get(imported.id);
      existingById.set(
        imported.id,
        existing && imported.api_key === "" ? { ...imported, api_key: existing.api_key } : imported,
      );
    }
    await saveSettings({ ...current, llm_providers: Array.from(existingById.values()) });
  }

  return { workflows: parsed.workflows.length, providers: parsed.providers.length };
}
