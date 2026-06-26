import { useState, useEffect } from "preact/hooks";
import { DEFAULT_CATEGORIES } from "@/shared/local-categories";
import type { Category } from "@/shared/local-categories";
import type { LocalWorkflow, CollectionRecipe, WorkflowCategory } from "@/shared/types";
import type { LLMProviderConfig } from "@/shared/settings";
import { fetchModels, type ModelInfo } from "@/shared/llm/models";

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

interface Props {
  workflow: LocalWorkflow | null;
  providers: LLMProviderConfig[];
  categories?: Category[];
  onSave: (workflow: LocalWorkflow) => void;
  onDelete?: (slug: string) => void;
  onCancel: () => void;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Editor for creating / editing local workflows (card-based layout). */
export function WorkflowEditor({
  workflow,
  providers,
  categories = DEFAULT_CATEGORIES,
  onSave,
  onDelete,
  onCancel,
}: Props) {
  const isNew = !workflow;
  const defaultProvider = providers[0];

  const [name, setName] = useState(workflow?.name ?? "");
  const [description, setDescription] = useState(workflow?.description ?? "");
  const [promptTemplate, setPromptTemplate] = useState(workflow?.prompt_template ?? "");
  const [providerId, setProviderId] = useState(workflow?.provider_id ?? defaultProvider?.id ?? "");
  const [model, setModel] = useState(workflow?.model ?? "");
  const [outputAction, setOutputAction] = useState(workflow?.output_action ?? "side_panel_only");
  const [hotkey, setHotkey] = useState(workflow?.default_hotkey ?? "");
  const [inputSource, setInputSource] = useState<CollectionRecipe["input"]>(
    workflow?.recipe?.input ?? "selection_plain",
  );
  const [category, setCategory] = useState<WorkflowCategory>(
    (workflow?.category as WorkflowCategory) ?? "Custom",
  );
  const [systemPrompt, setSystemPrompt] = useState(workflow?.system_prompt ?? "");
  const [temperature, setTemperature] = useState<string>(workflow?.temperature?.toString() ?? "");
  const [maxTokens, setMaxTokens] = useState<string>(workflow?.max_tokens?.toString() ?? "");
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [, setLoadingModels] = useState(false);

  // Load models when provider changes
  useEffect(() => {
    if (providerId) {
      const provider = providers.find((p) => p.id === providerId);
      if (provider) {
        if (!model) setModel(provider.model || "");
        loadModels(provider);
      }
    }
  }, [providerId]);

  async function loadModels(provider?: LLMProviderConfig) {
    const p = provider ?? providers.find((pr) => pr.id === providerId);
    if (!p) return;
    setLoadingModels(true);
    try {
      const models = await fetchModels(p);
      setAvailableModels(models);
      // Drop a selection the live list no longer offers — but keep it when the
      // list is empty (e.g. a server without /models), so the prefilled provider
      // default isn't wiped and the user can still enter a model manually.
      setModel((prev) => (models.length === 0 || models.some((m) => m.id === prev) ? prev : ""));
    } catch {
      setAvailableModels([]);
    } finally {
      setLoadingModels(false);
    }
  }

  const hotkeyValid =
    !hotkey.trim() || /^(Ctrl\+|Alt\+|Shift\+){1,3}[A-Za-z0-9]$/i.test(hotkey.trim());

  function handleSave() {
    if (!name.trim() || !promptTemplate.trim() || !providerId || !model.trim() || !hotkeyValid)
      return;

    const slug = workflow?.slug ?? slugify(name);
    const saved: LocalWorkflow = {
      id: workflow?.id ?? slug,
      slug,
      name: name.trim(),
      description: description.trim() || null,
      category,
      category_icon: categories.find((c) => c.value === category)?.icon ?? null,
      default_hotkey: hotkey.trim() || null,
      version: workflow?.version ?? "1.0.0",
      workflow_type: "text_transformation",
      llm_model_name: model,
      stt_model_name: null,
      tool_name: null,
      recipe: { input: inputSource },
      output_action: outputAction,
      prompt_template: promptTemplate,
      provider_id: providerId,
      model,
      system_prompt: systemPrompt.trim() || undefined,
      temperature: temperature ? parseFloat(temperature) : undefined,
      max_tokens: maxTokens ? parseInt(maxTokens, 10) : undefined,
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
              onChange={(e) =>
                setCategory((e.target as HTMLSelectElement).value as WorkflowCategory)
              }
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
              {OUTPUT_ACTIONS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label class="text-xs font-medium text-gray-700">Hotkey</label>
            <input
              type="text"
              value={hotkey}
              onInput={(e) => setHotkey((e.target as HTMLInputElement).value)}
              class={`w-full border rounded px-2 py-1.5 text-sm mt-0.5 ${hotkey.trim() && !hotkeyValid ? "border-red-400" : ""}`}
              placeholder="Ctrl+Shift+G"
            />
            {hotkey.trim() && !hotkeyValid ? (
              <p class="text-xs text-red-500 mt-0.5">Invalid format. Example: Ctrl+Shift+G</p>
            ) : (
              <p class="text-xs text-gray-400 mt-0.5">Modifiers: Ctrl, Alt, Shift</p>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div class="p-3 border-t bg-white space-y-2">
        <button
          onClick={handleSave}
          disabled={
            !name.trim() || !promptTemplate.trim() || !providerId || !model.trim() || !hotkeyValid
          }
          class="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition text-sm disabled:opacity-50"
        >
          {isNew ? "Create Action" : "Save Changes"}
        </button>
        {!isNew && onDelete && (
          <button
            onClick={() => onDelete(workflow!.slug)}
            class="w-full text-xs text-red-400 hover:text-red-600"
          >
            Delete Action
          </button>
        )}
      </div>
    </div>
  );
}
