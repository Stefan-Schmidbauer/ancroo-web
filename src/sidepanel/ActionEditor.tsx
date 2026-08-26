import { useState, useEffect } from "preact/hooks";
import { DEFAULT_CATEGORIES } from "@/shared/local-categories";
import type { Category } from "@/shared/local-categories";
import type { LocalAction, CollectionRecipe, ActionCategory, Action } from "@/shared/types";
import type { LLMProviderConfig } from "@/shared/settings";
import { fetchModels, type ModelInfo } from "@/shared/llm/models";
import { parseHotkey } from "@/shared/hotkeys";
import { slugify } from "@/shared/slug";
import { parseOptionalFloat, parseOptionalInt } from "./utils";

const INPUT_SOURCES: { value: CollectionRecipe["input"]; label: string }[] = [
  { value: "selection_html", label: "Selection (formatted)" },
  { value: "selection_plain", label: "Selection (plain text)" },
  { value: "page_text", label: "Whole page" },
  { value: "manual_input", label: "Manual entry" },
];

const OUTPUT_ACTIONS = [
  { value: "side_panel_only", label: "Show in panel" },
  { value: "replace_selection", label: "Replace selection" },
  { value: "copy_to_clipboard", label: "Copy to clipboard" },
  { value: "insert_before", label: "Insert before selection" },
  { value: "insert_after", label: "Insert after selection" },
];

// Outputs that write back into the page need a selection to anchor to. Only the
// selection inputs produce one — "Whole page" and "Manual entry" don't — so for
// those inputs these actions are hidden, leaving "Show in panel" / "Copy".
const SELECTION_OUTPUTS = new Set(["replace_selection", "insert_before", "insert_after"]);
const inputHasSelection = (input: CollectionRecipe["input"]): boolean =>
  input === "selection_html" || input === "selection_plain";

interface Props {
  action: LocalAction | null;
  providers: LLMProviderConfig[];
  categories?: Category[];
  /** All existing actions — used to keep new slugs unique and flag hotkey clashes. */
  existingActions?: Action[];
  onSave: (action: LocalAction) => void;
  onDelete?: (slug: string) => void;
  onCancel: () => void;
}

/** Make `base` unique against `taken` by appending -2, -3, … */
function uniqueSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/**
 * Canonical form of a hotkey for equality checks — normalizes order/casing
 * ("Shift+Ctrl+g" and "ctrl+shift+G" compare equal). Empty for unparseable.
 */
function canonHotkey(h: string): string {
  const p = parseHotkey(h);
  if (!p) return "";
  return [p.ctrlKey && "ctrl", p.altKey && "alt", p.shiftKey && "shift", p.metaKey && "meta", p.key]
    .filter(Boolean)
    .join("+");
}

/**
 * A hotkey is valid when empty (none) or it has a single alphanumeric key with
 * at least one Ctrl/Alt modifier (Shift may be added). Shift-only combos are
 * rejected: the panel/content keydown handlers ignore presses without
 * Ctrl/Alt/Meta, so a Shift-only hotkey would validate but never fire.
 */
function isValidHotkey(raw: string): boolean {
  const s = raw.trim();
  if (!s) return true;
  const parts = s.split("+").map((p) => p.trim().toLowerCase());
  const key = parts.pop();
  if (!key || !/^[a-z0-9]$/.test(key)) return false;
  if (parts.length === 0) return false;
  const mods = new Set(parts);
  if (parts.length !== mods.size) return false; // no duplicate modifiers
  for (const m of mods) if (m !== "ctrl" && m !== "alt" && m !== "shift") return false;
  return mods.has("ctrl") || mods.has("alt");
}

/** Editor for creating / editing local actions (card-based layout). */
export function ActionEditor({
  action,
  providers,
  categories = DEFAULT_CATEGORIES,
  existingActions = [],
  onSave,
  onDelete,
  onCancel,
}: Props) {
  const isNew = !action;
  const defaultProvider = providers[0];

  const [name, setName] = useState(action?.name ?? "");
  const [description, setDescription] = useState(action?.description ?? "");
  const [promptTemplate, setPromptTemplate] = useState(action?.prompt_template ?? "");
  const [providerId, setProviderId] = useState(action?.provider_id ?? defaultProvider?.id ?? "");
  const [model, setModel] = useState(action?.model ?? "");
  const [outputAction, setOutputAction] = useState(action?.output_action ?? "side_panel_only");
  const [hotkey, setHotkey] = useState(action?.default_hotkey ?? "");
  const [inputSource, setInputSource] = useState<CollectionRecipe["input"]>(
    action?.recipe?.input ?? "selection_plain",
  );
  const [category, setCategory] = useState<ActionCategory>(
    (action?.category as ActionCategory) ?? "Custom",
  );
  const [systemPrompt, setSystemPrompt] = useState(action?.system_prompt ?? "");
  const [temperature, setTemperature] = useState<string>(action?.temperature?.toString() ?? "");
  const [maxTokens, setMaxTokens] = useState<string>(action?.max_tokens?.toString() ?? "");
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);

  // Load models when provider changes. Latest-wins: without the cancel flag a
  // slow fetch for the previous provider could resolve after the new one and
  // fill the picker with the wrong provider's models.
  useEffect(() => {
    if (!providerId) return;
    const provider = providers.find((p) => p.id === providerId);
    if (!provider) return;
    if (!model) setModel(provider.model || "");
    let cancelled = false;
    fetchModels(provider)
      .then((models) => {
        // Keep the current model selection even if the live list omits it. A saved
        // action's model is known-good, and some providers list retired-but-usable
        // models (Gemini) or no /models at all — wiping it here would block Save on
        // an unrelated edit. The picker still offers it as an explicit option.
        if (!cancelled) setAvailableModels(models);
      })
      .catch(() => {
        if (!cancelled) setAvailableModels([]);
      });
    return () => {
      cancelled = true;
    };
  }, [providerId]);

  // Keep Output valid for the chosen Input: a selection-based output without a
  // selection input has nothing to anchor to, so fall back to showing the result
  // in the panel when the combination becomes invalid.
  useEffect(() => {
    if (!inputHasSelection(inputSource) && SELECTION_OUTPUTS.has(outputAction)) {
      setOutputAction("side_panel_only");
    }
  }, [inputSource, outputAction]);

  const hotkeyValid = isValidHotkey(hotkey);

  // Name of another action already bound to this hotkey, or null if free. Editing
  // an action ignores its own binding (compare by slug).
  const hotkeyConflict: string | null = (() => {
    const h = hotkey.trim();
    if (!h || !hotkeyValid) return null;
    const canon = canonHotkey(h);
    if (!canon) return null;
    const clash = existingActions.find(
      (a) => a.slug !== action?.slug && a.default_hotkey && canonHotkey(a.default_hotkey) === canon,
    );
    return clash ? clash.name : null;
  })();

  const canSave =
    !!name.trim() &&
    !!promptTemplate.trim() &&
    !!providerId &&
    !!model.trim() &&
    hotkeyValid &&
    !hotkeyConflict;

  function handleSave() {
    if (!canSave) return;

    // A new action's slug must not collide with an existing one — saveLocalAction
    // upserts by slug, so a duplicate would silently overwrite that action.
    const slug =
      action?.slug ??
      uniqueSlug(slugify(name, "action"), new Set(existingActions.map((a) => a.slug)));
    const saved: LocalAction = {
      id: action?.id ?? slug,
      slug,
      name: name.trim(),
      description: description.trim() || null,
      category,
      category_icon: categories.find((c) => c.value === category)?.icon ?? null,
      default_hotkey: hotkey.trim() || null,
      version: action?.version ?? "1.0.0",
      action_type: "text_transformation",
      llm_model_name: model,
      stt_model_name: null,
      tool_name: null,
      recipe: { input: inputSource },
      output_action: outputAction,
      prompt_template: promptTemplate,
      provider_id: providerId,
      model,
      system_prompt: systemPrompt.trim() || undefined,
      temperature: parseOptionalFloat(temperature),
      max_tokens: parseOptionalInt(maxTokens),
    };
    onSave(saved);
  }

  const cardClass = "bg-white rounded-lg border p-3 space-y-2";

  return (
    <div class="flex flex-col h-screen">
      <div class="flex items-center justify-between p-3 border-b bg-white">
        <h1 class="font-bold text-sm">{isNew ? "New Action" : "Edit Action"}</h1>
        <button onClick={onCancel} class="text-xs text-gray-400 hover:text-gray-600">
          Cancel
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50">
        {/* Card: Name & Description */}
        <div class={cardClass}>
          <div>
            <label class="text-xs font-medium text-gray-700">Name</label>
            <input
              type="text"
              value={name}
              onInput={(e) => setName((e.target as HTMLInputElement).value)}
              class="w-full border rounded px-2 py-1.5 text-sm mt-0.5"
              placeholder="My Action"
            />
          </div>
          <div>
            <label class="text-xs font-medium text-gray-700">Description</label>
            <input
              type="text"
              value={description}
              onInput={(e) => setDescription((e.target as HTMLInputElement).value)}
              class="w-full border rounded px-2 py-1.5 text-sm mt-0.5"
              placeholder="What this action does..."
            />
          </div>
          <div>
            <label class="text-xs font-medium text-gray-700">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory((e.target as HTMLSelectElement).value as ActionCategory)}
              class="w-full border rounded px-2 py-1.5 text-sm mt-0.5"
            >
              {categories.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.icon} {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Card: Prompt */}
        <div class={cardClass}>
          <div>
            <label class="text-xs font-medium text-gray-700">Prompt Template</label>
            <textarea
              value={promptTemplate}
              onInput={(e) => setPromptTemplate((e.target as HTMLTextAreaElement).value)}
              class="w-full border rounded px-2 py-1.5 text-sm mt-0.5 font-mono resize-none"
              rows={5}
              placeholder={"Summarize the following text:\n\n{text}"}
            />
            <p class="text-xs text-gray-400 mt-0.5">
              Variables: {"{text}"} {"{url}"} {"{title}"}
            </p>
          </div>
          <div>
            <label class="text-xs font-medium text-gray-700">System Prompt</label>
            <textarea
              value={systemPrompt}
              onInput={(e) => setSystemPrompt((e.target as HTMLTextAreaElement).value)}
              class="w-full border rounded px-2 py-1.5 text-sm mt-0.5 font-mono resize-none"
              rows={3}
              placeholder="Optional system instructions for the model..."
            />
          </div>
        </div>

        {/* Card: Model */}
        <div class={cardClass}>
          <div>
            <label class="text-xs font-medium text-gray-700">Provider</label>
            <select
              value={providerId}
              onChange={(e) => {
                setProviderId((e.target as HTMLSelectElement).value);
                setModel("");
              }}
              class="w-full border rounded px-2 py-1.5 text-sm mt-0.5"
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label class="text-xs font-medium text-gray-700">Model</label>
            <div class="flex gap-1 mt-0.5 overflow-hidden">
              {availableModels.length > 0 ? (
                <select
                  value={model}
                  onChange={(e) => setModel((e.target as HTMLSelectElement).value)}
                  class="flex-1 min-w-0 border rounded px-2 py-1.5 text-sm font-mono"
                >
                  <option value="">Select a model...</option>
                  {/* Keep the saved model selectable even if the live list omits it. */}
                  {model && !availableModels.some((m) => m.id === model) && (
                    <option value={model}>{model}</option>
                  )}
                  {availableModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={model}
                  onInput={(e) => setModel((e.target as HTMLInputElement).value)}
                  class="flex-1 min-w-0 border rounded px-2 py-1.5 text-sm font-mono"
                  placeholder="Enter a model name"
                />
              )}
            </div>
          </div>
          <div>
            <label class="text-xs font-medium text-gray-700">Temperature</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={temperature}
              onInput={(e) => setTemperature((e.target as HTMLInputElement).value)}
              class="w-full border rounded px-2 py-1.5 text-sm mt-0.5"
              placeholder="Default"
            />
          </div>
          <div>
            <label class="text-xs font-medium text-gray-700">Max Tokens</label>
            <input
              type="number"
              min="1"
              value={maxTokens}
              onInput={(e) => setMaxTokens((e.target as HTMLInputElement).value)}
              class="w-full border rounded px-2 py-1.5 text-sm mt-0.5"
              placeholder="Default"
            />
          </div>
        </div>

        {/* Card: Input & Output */}
        <div class={cardClass}>
          <div>
            <label class="text-xs font-medium text-gray-700">Input</label>
            <select
              value={inputSource}
              onChange={(e) =>
                setInputSource((e.target as HTMLSelectElement).value as CollectionRecipe["input"])
              }
              class="w-full border rounded px-2 py-1.5 text-sm mt-0.5"
            >
              {INPUT_SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label class="text-xs font-medium text-gray-700">Output</label>
            <select
              value={outputAction}
              onChange={(e) => setOutputAction((e.target as HTMLSelectElement).value)}
              class="w-full border rounded px-2 py-1.5 text-sm mt-0.5"
            >
              {OUTPUT_ACTIONS.filter(
                (a) => inputHasSelection(inputSource) || !SELECTION_OUTPUTS.has(a.value),
              ).map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
            {!inputHasSelection(inputSource) && (
              <p class="text-xs text-gray-400 mt-0.5">
                Selection-based outputs need a selection input.
              </p>
            )}
          </div>
          <div>
            <label class="text-xs font-medium text-gray-700">Hotkey</label>
            <input
              type="text"
              value={hotkey}
              onInput={(e) => setHotkey((e.target as HTMLInputElement).value)}
              class={`w-full border rounded px-2 py-1.5 text-sm mt-0.5 ${(hotkey.trim() && !hotkeyValid) || hotkeyConflict ? "border-red-400" : ""}`}
              placeholder="Ctrl+Shift+G"
            />
            {hotkey.trim() && !hotkeyValid ? (
              <p class="text-xs text-red-500 mt-0.5">
                Needs Ctrl or Alt (Shift optional). Example: Ctrl+Shift+G
              </p>
            ) : hotkeyConflict ? (
              <p class="text-xs text-red-500 mt-0.5">
                Already used by "{hotkeyConflict}". Pick a different combination.
              </p>
            ) : (
              <p class="text-xs text-gray-400 mt-0.5">Modifiers: Ctrl or Alt (optionally Shift)</p>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div class="p-3 border-t bg-white space-y-2">
        <button
          onClick={handleSave}
          disabled={!canSave}
          class="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition text-sm disabled:opacity-50"
        >
          {isNew ? "Create Action" : "Save Changes"}
        </button>
        {!isNew && onDelete && (
          <button
            onClick={() => onDelete(action!.slug)}
            class="w-full text-xs text-red-400 hover:text-red-600"
          >
            Delete Action
          </button>
        )}
      </div>
    </div>
  );
}
