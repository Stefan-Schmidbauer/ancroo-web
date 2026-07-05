import type { LocalAction } from "./types";
import type { LLMProviderConfig } from "./settings";
import { listLocalActions, replaceAllLocalActions } from "./local-actions";
import {
  getSettings,
  saveSettings,
  MIN_REQUEST_TIMEOUT_MS,
  MAX_REQUEST_TIMEOUT_MS,
} from "./settings";
import { listCategories, replaceAllCategories } from "./local-categories";
import type { Category } from "./local-categories";

export interface BackupData {
  version: "1";
  exportedAt: string;
  actions: LocalAction[];
  providers: LLMProviderConfig[];
  categories?: Category[];
  /** Optional — absent in backups exported before the timeout was configurable. */
  request_timeout_ms?: number;
}

const PROVIDER_TYPES: ReadonlySet<LLMProviderConfig["type"]> = new Set([
  "openai",
  "anthropic",
  "gemini",
  "ollama",
  "openrouter",
  "openai-compatible",
]);

export function validateBackup(data: unknown): data is BackupData {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  if (d.version !== "1") return false;
  if (!Array.isArray(d.actions)) return false;
  if (!Array.isArray(d.providers)) return false;
  const seenSlugs = new Set<string>();
  for (const w of d.actions) {
    if (!w || typeof w !== "object") return false;
    const wf = w as Record<string, unknown>;
    if (
      typeof wf.slug !== "string" ||
      typeof wf.name !== "string" ||
      typeof wf.prompt_template !== "string"
    )
      return false;
    // The CRUD layer upserts and deletes by slug — duplicates would make an
    // edit silently overwrite the other action and a delete remove both.
    if (seenSlugs.has(wf.slug)) return false;
    seenSlugs.add(wf.slug);
    // Hotkey bindings are rebuilt from this field; a non-string value would
    // crash the refresh and silently kill all hotkeys.
    if (
      wf.default_hotkey !== undefined &&
      wf.default_hotkey !== null &&
      typeof wf.default_hotkey !== "string"
    )
      return false;
  }
  for (const p of d.providers) {
    if (!p || typeof p !== "object") return false;
    const pr = p as Record<string, unknown>;
    if (typeof pr.id !== "string" || typeof pr.name !== "string" || typeof pr.api_key !== "string")
      return false;
    if (!PROVIDER_TYPES.has(pr.type as LLMProviderConfig["type"])) return false;
    if (pr.base_url !== undefined && typeof pr.base_url !== "string") return false;
  }
  // Optional — reject only a wrong type; range is enforced by clamping on import.
  if (d.request_timeout_ms !== undefined && typeof d.request_timeout_ms !== "number") return false;
  return true;
}

export async function exportBackup(includeApiKeys: boolean): Promise<void> {
  const [actions, settings, categories] = await Promise.all([
    listLocalActions(),
    getSettings(),
    listCategories(),
  ]);

  const providers = settings.llm_providers.map((p) => (includeApiKeys ? p : { ...p, api_key: "" }));

  const data: BackupData = {
    version: "1",
    exportedAt: new Date().toISOString(),
    actions,
    providers,
    categories,
    request_timeout_ms: settings.request_timeout_ms,
  };

  const json = JSON.stringify(data, null, 2);
  const dataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
  // Date + time so multiple backups on the same day don't collide. Colons aren't
  // valid in filenames (Windows), so use "YYYY-MM-DD_HH-MM-SS".
  const stamp = new Date().toISOString().slice(0, 19).replace("T", "_").replace(/:/g, "-");
  await chrome.downloads.download({
    url: dataUrl,
    filename: `ancroo-backup-${stamp}.json`,
    saveAs: false,
  });
}

export async function importBackup(file: File): Promise<{ actions: number; providers: number }> {
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

  // Backups exported before v1.6.0 stored the array under "workflows".
  if (parsed && typeof parsed === "object") {
    const p = parsed as Record<string, unknown>;
    if (!("actions" in p) && Array.isArray(p.workflows)) p.actions = p.workflows;
  }

  if (!validateBackup(parsed)) {
    throw new Error("Not a valid Ancroo backup file");
  }

  // Restore semantics: the backup is a snapshot, so replace actions and
  // categories wholesale instead of merging onto any seeded defaults.
  await replaceAllLocalActions(parsed.actions);

  if (parsed.categories) {
    const validCategories = parsed.categories.filter(
      (cat) => cat && typeof cat.value === "string" && typeof cat.label === "string",
    );
    await replaceAllCategories(validCategories);
  }

  // Fold provider merge and the (optional) timeout into a single settings write.
  const current = await getSettings();
  let next = current;

  if (parsed.providers.length > 0) {
    const existingById = new Map(current.llm_providers.map((p) => [p.id, p]));
    for (const imported of parsed.providers) {
      const existing = existingById.get(imported.id);
      existingById.set(
        imported.id,
        existing && imported.api_key === "" ? { ...imported, api_key: existing.api_key } : imported,
      );
    }
    next = { ...next, llm_providers: Array.from(existingById.values()) };
  }

  // Absent in pre-timeout backups — leave the current value untouched then.
  // Clamp so a hand-edited or out-of-range value can't slip past the UI bounds.
  if (typeof parsed.request_timeout_ms === "number") {
    next = {
      ...next,
      request_timeout_ms: Math.min(
        Math.max(parsed.request_timeout_ms, MIN_REQUEST_TIMEOUT_MS),
        MAX_REQUEST_TIMEOUT_MS,
      ),
    };
  }

  if (next !== current) await saveSettings(next);

  return { actions: parsed.actions.length, providers: parsed.providers.length };
}
