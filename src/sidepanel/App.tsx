import { useState, useEffect } from "preact/hooks";
import { getSettings } from "@/shared/settings";
import { isSetupComplete } from "@/shared/settings";
import { executeWorkflowUnified } from "@/shared/executor";
import { listWorkflowsUnified } from "@/shared/workflow-provider";
import type { Workflow, HistoryEntry, CollectionRecipe, InputDataPacket } from "@/shared/types";
import type {
  ExtensionMessage,
  SelectionResultMessage,
  PageTextResultMessage,
  InsertResultMessage,
} from "@/shared/messages";
import { sendToTab } from "@/shared/tab-messaging";
import { needsManualInput, friendlyError, categoryIcon } from "./utils";
import { HistoryItem } from "./HistoryItem";
import { SetupScreen } from "./SetupScreen";
import { AboutPanel } from "./AboutPanel";
import { WorkflowEditor } from "./WorkflowEditor";
import { Settings } from "./Settings";
import type { LocalWorkflow } from "@/shared/types";
import type { LLMProviderConfig } from "@/shared/settings";
import {
  listLocalWorkflows,
  saveLocalWorkflow,
  deleteLocalWorkflow,
} from "@/shared/local-workflows";
import {
  listCategories,
  saveCategory,
  deleteCategory,
  DEFAULT_CATEGORIES,
} from "@/shared/local-categories";
import type { Category } from "@/shared/local-categories";
import { CategoryManager } from "./CategoryManager";

export function App() {
  const [setupDone, setSetupDone] = useState<boolean | null>(null);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Manual input state
  const [pendingWorkflow, setPendingWorkflow] = useState<Workflow | null>(null);
  const [manualInputText, setManualInputText] = useState("");

  // About panel state
  const [showAbout, setShowAbout] = useState(false);

  // Settings / editor state
  const [editingWorkflow, setEditingWorkflow] = useState<LocalWorkflow | null | "new">(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [llmProviders, setLlmProviders] = useState<LLMProviderConfig[]>([]);
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);

  // Result display state
  const [resultText, setResultText] = useState<string | null>(null);
  const [resultWorkflowName, setResultWorkflowName] = useState<string>("");
  const [resultWorkflow, setResultWorkflow] = useState<Workflow | null>(null);
  const [copied, setCopied] = useState(false);

  // Collapsed categories
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [recentCollapsed, setRecentCollapsed] = useState(false);
  const toggleCategory = (cat: string) =>
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });

  useEffect(() => {
    init();
  }, []);

  // Sync history when background script adds entries (hotkey-triggered workflows)
  useEffect(() => {
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (area === "local" && changes.history) {
        setHistory((changes.history.newValue as HistoryEntry[] | undefined) ?? []);
      }
      // An already-open panel must also react to results the background computed
      // for hotkey-triggered workflows. loadData() reads pendingResult only once
      // on mount, so without this the result never appears when the panel was
      // already open (the background's sidePanel.open() is then a no-op).
      if (area === "session" && changes.pendingResult?.newValue) {
        const pending = changes.pendingResult.newValue as { text: string; workflowName: string };
        void chrome.storage.session.remove("pendingResult");
        setResultText(pending.text);
        setResultWorkflowName(pending.workflowName);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  async function init() {
    const done = await isSetupComplete();
    setSetupDone(done);
    if (done) {
      await loadData();
    }
    setLoading(false);
  }

  async function loadData() {
    try {
      setError(null);

      const settings = await getSettings();
      setLlmProviders(settings.llm_providers);
      setCategories(await listCategories());

      const [workflowList, stored, session] = await Promise.all([
        listWorkflowsUnified(),
        chrome.storage.local.get("history"),
        chrome.storage.session.get(["pendingWorkflowSlug", "pendingResult"]),
      ]);

      setWorkflows(workflowList);
      setHistory((stored.history as HistoryEntry[] | undefined) ?? []);

      // Cache workflows for background hotkey execution and refresh bindings
      await chrome.storage.session.set({ cachedWorkflows: workflowList });
      chrome.runtime.sendMessage({ type: "REFRESH_HOTKEYS" }).catch(() => {});

      // Check if a complex workflow was triggered via hotkey (needs side panel collection)
      if (session.pendingWorkflowSlug) {
        await chrome.storage.session.remove("pendingWorkflowSlug");
        const target = workflowList.find((w) => w.slug === session.pendingWorkflowSlug);
        if (target) {
          setTimeout(() => handleExecute(target), 0);
        }
      }

      // Check if background executed a workflow and has a result to display
      if (session.pendingResult) {
        await chrome.storage.session.remove("pendingResult");
        const pending = session.pendingResult as { text: string; workflowName: string };
        setResultText(pending.text);
        setResultWorkflowName(pending.workflowName);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load";
      setError(friendlyError(msg));
    }
  }

  async function handleSaveCategory(cat: Category) {
    await saveCategory(cat);
    setCategories(await listCategories());
  }

  async function handleDeleteCategory(value: string) {
    const all = await listLocalWorkflows();
    for (const w of all.filter((w) => w.category === value)) {
      await saveLocalWorkflow({ ...w, category: null, category_icon: null });
    }
    await deleteCategory(value);
    setCategories(await listCategories());
    await loadData();
  }

  async function collectInputData(
    recipe: CollectionRecipe,
    tabId: number,
  ): Promise<InputDataPacket> {
    const packet: InputDataPacket = {};

    switch (recipe.input) {
      case "selection_html": {
        const sel = await sendToTab<SelectionResultMessage>(tabId, { type: "GET_SELECTION" });
        packet.text = sel?.html ?? "";
        packet.context = { url: sel?.url ?? "", title: sel?.title ?? "" };
        break;
      }
      case "page_text": {
        const page = await sendToTab<PageTextResultMessage>(tabId, { type: "GET_PAGE_TEXT" });
        packet.text = page?.text ?? "";
        packet.context = { url: page?.url ?? "", title: page?.title ?? "" };
        break;
      }
      case "manual_input": {
        packet.text = manualInputText;
        const tab = await chrome.tabs.get(tabId).catch(() => null);
        packet.context = { url: tab?.url ?? "", title: tab?.title ?? "" };
        break;
      }
      // selection_plain plus any unknown/legacy input value (e.g. pre-1.0
      // workflows still stored in the old `collect` format) fall back to
      // plain selection text, so they keep working instead of running empty.
      case "selection_plain":
      default: {
        const sel = await sendToTab<SelectionResultMessage>(tabId, { type: "GET_SELECTION" });
        packet.text = sel?.text ?? "";
        packet.context = { url: sel?.url ?? "", title: sel?.title ?? "" };
        break;
      }
    }
    return packet;
  }

  async function applyAction(action: string, resultText: string, tabId: number) {
    switch (action) {
      case "replace_selection":
      case "insert_text": {
        const res = await sendToTab<InsertResultMessage>(tabId, {
          type: "INSERT_TEXT",
          text: resultText,
        });
        await sendToTab(tabId, {
          type: "SHOW_TOAST",
          text: res?.success ? "Text inserted" : "Could not insert text",
          variant: res?.success ? "success" : "error",
          duration: res?.success ? 2000 : 4000,
        } as ExtensionMessage);
        break;
      }
      case "clipboard":
      case "copy_to_clipboard": {
        try {
          await navigator.clipboard.writeText(resultText);
          if (tabId) {
            await sendToTab(tabId, {
              type: "SHOW_TOAST",
              text: "Copied to clipboard",
              variant: "success",
              duration: 2000,
            } as ExtensionMessage);
          }
        } catch {
          setResultText(resultText);
        }
        break;
      }
      case "insert_before": {
        const res = await sendToTab<InsertResultMessage>(tabId, {
          type: "INSERT_BEFORE",
          text: resultText,
        });
        await sendToTab(tabId, {
          type: "SHOW_TOAST",
          text: res?.success ? "Text inserted before selection" : "Could not insert text",
          variant: res?.success ? "success" : "error",
          duration: res?.success ? 2000 : 4000,
        } as ExtensionMessage);
        break;
      }
      case "insert_after": {
        const res = await sendToTab<InsertResultMessage>(tabId, {
          type: "INSERT_AFTER",
          text: resultText,
        });
        await sendToTab(tabId, {
          type: "SHOW_TOAST",
          text: res?.success ? "Text inserted after selection" : "Could not insert text",
          variant: res?.success ? "success" : "error",
          duration: res?.success ? 2000 : 4000,
        } as ExtensionMessage);
        break;
      }
      case "side_panel_only":
        break;
    }
  }

  async function handleExecute(workflow: Workflow) {
    if (needsManualInput(workflow)) {
      if (pendingWorkflow?.slug === workflow.slug) {
        // Toggle off via button click — manual submit goes through executeTextWorkflow
      } else {
        setPendingWorkflow(workflow);
        setManualInputText("");
      }
      return;
    }

    await executeTextWorkflow(workflow);
  }

  async function executeTextWorkflow(workflow: Workflow) {
    setExecuting(workflow.slug);
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.id) return;

      const isManualInput = workflow.recipe?.input === "manual_input";
      const tabUrl = tab.url ?? "";
      if (
        !isManualInput &&
        (tabUrl.startsWith("chrome://") ||
          tabUrl.startsWith("chrome-extension://") ||
          tabUrl.startsWith("about:"))
      ) {
        setError("Cannot run actions on this page. Please switch to a regular website tab.");
        return;
      }

      let inputData: InputDataPacket;

      if (workflow.recipe) {
        inputData = await collectInputData(workflow.recipe, tab.id);
      } else {
        const response = await sendToTab<SelectionResultMessage>(tab.id, { type: "GET_SELECTION" });
        inputData = {
          text: response?.text ?? "",
          context: { url: response?.url ?? "", title: response?.title ?? "" },
        };
      }

      // Selection inputs need actual selected text. Bail out before the LLM call
      // (and tokens) when nothing is selected, instead of sending an empty input.
      // collectInputData() treats everything except page_text/manual_input as a
      // selection (legacy/unknown inputs fall back to plain selection), so the
      // guard mirrors that. inputData.text carries the HTML for selection_html,
      // which always has content for a real selection (the content script falls
      // back to the plain text), so this only fires when nothing is selected.
      const input = workflow.recipe?.input;
      const usesSelection = input !== "page_text" && input !== "manual_input";
      if (usesSelection && !inputData.text?.trim()) {
        setError("Select some text on the page first, then run this action.");
        return;
      }

      const result = await executeWorkflowUnified(workflow, inputData);

      const entry: HistoryEntry = {
        id: result.execution_id,
        workflow_slug: workflow.slug,
        workflow_name: workflow.name,
        input_preview: (inputData.text ?? "").substring(0, 100),
        output_preview: result.result?.text?.substring(0, 100) ?? "",
        output_full: result.result?.text ?? undefined,
        success: result.result?.success ?? false,
        timestamp: Date.now(),
      };
      const newHistory = [entry, ...history].slice(0, 50);
      setHistory(newHistory);
      await chrome.storage.local.set({ history: newHistory });

      if (result.result?.success && result.result.text) {
        const action = workflow.output_action ?? result.result.action ?? "none";

        if (
          action !== "replace_selection" &&
          action !== "insert_text" &&
          action !== "insert_before" &&
          action !== "insert_after" &&
          action !== "clipboard" &&
          action !== "copy_to_clipboard"
        ) {
          setResultText(result.result.text);
          setResultWorkflowName(workflow.name);
          setResultWorkflow(workflow);
          setManualInputText("");
          setPendingWorkflow(null);
        }

        await applyAction(action, result.result.text, tab.id);
      } else if (result.result && !result.result.success) {
        setError(result.result.error ?? `${workflow.name} failed`);
      } else if (result.result?.success && !result.result.text) {
        setError(`${workflow.name}: no output returned. Check your selection.`);
      }
    } catch (err) {
      console.error("Execution failed:", err);
      setError(friendlyError(err instanceof Error ? err.message : String(err)));
    } finally {
      setExecuting(null);
    }
  }

  async function handleCopyResult() {
    if (!resultText) return;
    await navigator.clipboard.writeText(resultText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleFollowUp() {
    if (!resultWorkflow || !manualInputText.trim()) return;
    await executeTextWorkflow(resultWorkflow);
  }

  if (loading || setupDone === null) {
    return (
      <div class="flex items-center justify-center h-screen">
        <div class="text-gray-500">Loading...</div>
      </div>
    );
  }

  // Setup screen — shown on first use
  if (!setupDone) {
    return (
      <SetupScreen
        onComplete={() => {
          setSetupDone(true);
          loadData();
        }}
      />
    );
  }

  if (error) {
    return (
      <div class="flex flex-col items-center justify-center h-screen p-6 gap-4">
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#ef4444"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <h2 class="text-base font-semibold text-gray-800">Something went wrong</h2>
        <p class="text-red-600 text-center text-sm">{error}</p>
        <button
          onClick={() => {
            setError(null);
            loadData();
          }}
          class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
        >
          Retry
        </button>
      </div>
    );
  }

  // About panel
  if (showAbout) {
    return <AboutPanel onClose={() => setShowAbout(false)} />;
  }

  // Workflow Editor
  if (editingWorkflow !== null) {
    const wf = editingWorkflow === "new" ? null : editingWorkflow;
    return (
      <WorkflowEditor
        workflow={wf}
        providers={llmProviders}
        categories={categories}
        onSave={async (saved) => {
          await saveLocalWorkflow(saved);
          setEditingWorkflow(null);
          await loadData();
        }}
        onDelete={
          wf
            ? async (slug) => {
                await deleteLocalWorkflow(slug);
                setEditingWorkflow(null);
                await loadData();
              }
            : undefined
        }
        onCancel={() => setEditingWorkflow(null)}
      />
    );
  }

  // Settings
  if (showSettings) {
    return (
      <Settings
        onClose={() => {
          setShowSettings(false);
          loadData();
        }}
      />
    );
  }

  // Category Manager
  if (showCategoryManager) {
    const workflowCountByCategory = workflows.reduce<Record<string, number>>((acc, w) => {
      const cat = w.category ?? "__uncategorized__";
      acc[cat] = (acc[cat] ?? 0) + 1;
      return acc;
    }, {});
    return (
      <CategoryManager
        categories={categories}
        workflowCounts={workflowCountByCategory}
        onSave={handleSaveCategory}
        onDelete={handleDeleteCategory}
        onClose={() => setShowCategoryManager(false)}
      />
    );
  }

  // Result display
  if (resultText !== null) {
    const showFollowUp = resultWorkflow && needsManualInput(resultWorkflow);
    const isExecutingResult = resultWorkflow && executing === resultWorkflow.slug;

    return (
      <div class="flex flex-col h-screen">
        <div class="flex items-center justify-between p-3 border-b bg-white">
          <h1 class="font-bold text-sm">Ancroo</h1>
          <button
            onClick={() => {
              setResultText(null);
              setResultWorkflow(null);
              setCopied(false);
            }}
            class="text-xs text-gray-400 hover:text-gray-600"
          >
            Close
          </button>
        </div>

        <div class="flex-1 flex flex-col p-3 min-h-0">
          <h2 class="text-xs font-semibold text-gray-500 uppercase mb-2">
            Result: {resultWorkflowName}
          </h2>
          <textarea
            readOnly
            value={resultText}
            class="flex-1 w-full p-3 bg-white border rounded-lg text-sm font-mono resize-none focus:outline-none focus:ring-1 focus:ring-blue-300"
          />
          <button
            onClick={handleCopyResult}
            class="mt-2 w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition text-sm"
          >
            {copied ? "Copied!" : "Copy to clipboard"}
          </button>
        </div>

        {showFollowUp && (
          <div class="p-3 border-t bg-gray-50">
            {isExecutingResult ? (
              <div class="flex items-center gap-2 text-xs text-amber-600 py-2">
                <span class="w-3 h-3 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
                <span>Processing with AI...</span>
              </div>
            ) : (
              <>
                <textarea
                  value={manualInputText}
                  onInput={(e) => setManualInputText((e.target as HTMLTextAreaElement).value)}
                  placeholder="Send another message..."
                  class="w-full p-2 bg-white border rounded-lg text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-300"
                  rows={3}
                />
                <button
                  onClick={handleFollowUp}
                  disabled={!manualInputText.trim()}
                  class="mt-2 w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition text-sm disabled:opacity-50"
                >
                  Send
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div class="flex flex-col h-screen">
      {/* Header */}
      <div class="flex items-center justify-between p-3 border-b bg-white">
        <h1 class="font-bold text-sm">Ancroo</h1>
        <div class="flex items-center gap-2">
          <button
            onClick={() => setShowAbout(true)}
            class="text-gray-400 hover:text-gray-600"
            title="About Ancroo"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </button>

          <button
            onClick={() => setEditingWorkflow("new")}
            class="text-xs text-blue-500 hover:text-blue-700"
          >
            + New
          </button>
          <button
            onClick={() => setShowSettings(true)}
            class="text-xs text-gray-400 hover:text-gray-600"
          >
            Settings
          </button>
        </div>
      </div>

      {/* Workflows */}
      <div class="flex-1 overflow-y-auto p-3">
        {Object.entries(
          workflows.reduce<Record<string, Workflow[]>>((groups, w) => {
            const cat = w.category ?? "__uncategorized__";
            (groups[cat] ??= []).push(w);
            return groups;
          }, {}),
        )
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([category, categoryWorkflows]) => (
            <div key={category} class="mb-4">
              <div class="flex items-center mb-2">
                <button
                  type="button"
                  onClick={() => toggleCategory(category)}
                  class="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase hover:text-gray-700 cursor-pointer select-none text-left flex-1 min-w-0"
                >
                  <span
                    class={`inline-block transition-transform duration-200 ${collapsedCategories.has(category) ? "" : "rotate-90"}`}
                  >
                    ▶
                  </span>
                  {category === "__uncategorized__"
                    ? "📂"
                    : categoryIcon(categoryWorkflows[0], categories)}{" "}
                  {category === "__uncategorized__"
                    ? "Uncategorized"
                    : (categories.find((c) => c.value === category)?.label ?? category)}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCategoryManager(true)}
                  class="text-gray-300 hover:text-gray-500 px-1 text-xs"
                  title="Manage categories"
                >
                  ✎
                </button>
              </div>
              {!collapsedCategories.has(category) && (
                <div class="space-y-2">
                  {categoryWorkflows.map((workflow) => {
                    const isManual = needsManualInput(workflow);
                    const isPending = pendingWorkflow?.slug === workflow.slug;
                    const isExecuting = executing === workflow.slug;

                    const inputLabel = ((): string | null => {
                      switch (workflow.recipe?.input) {
                        case "manual_input":
                          return "manual";
                        case "page_text":
                          return "page";
                        case "selection_html":
                          return "selection (html)";
                        case "selection_plain":
                          return "selection";
                        default:
                          return null;
                      }
                    })();
                    const outputLabel: string | null = (() => {
                      switch (workflow.output_action) {
                        case "replace_selection":
                          return "replace";
                        case "copy_to_clipboard":
                          return "copy";
                        case "insert_before":
                          return "insert↑";
                        case "insert_after":
                          return "insert↓";
                        case "side_panel_only":
                          return "panel";
                        default:
                          return null;
                      }
                    })();

                    return (
                      <div key={workflow.id}>
                        <button
                          onClick={() => handleExecute(workflow)}
                          disabled={executing !== null && !isPending}
                          class="w-full text-left p-3 bg-white rounded-lg border hover:border-blue-300 hover:shadow-sm transition disabled:opacity-50"
                        >
                          <div class="font-medium text-sm">{workflow.name}</div>
                          {workflow.description && (
                            <div class="text-xs text-gray-500 mt-0.5">{workflow.description}</div>
                          )}
                          <div class="flex items-center gap-2 mt-1">
                            {workflow.default_hotkey && (
                              <span class="text-xs text-blue-500">{workflow.default_hotkey}</span>
                            )}
                            {inputLabel && (
                              <span class="text-xs text-gray-400">in: {inputLabel}</span>
                            )}
                            {outputLabel && (
                              <span class="text-xs text-gray-400">out: {outputLabel}</span>
                            )}
                            <span
                              class="text-xs text-gray-400 hover:text-gray-600 ml-auto"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingWorkflow(workflow as LocalWorkflow);
                              }}
                            >
                              Edit
                            </span>
                          </div>
                          {isExecuting && (
                            <div class="flex items-center gap-2 text-xs text-amber-600 mt-1">
                              <span class="w-3 h-3 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
                              <span>Processing with AI...</span>
                            </div>
                          )}
                        </button>

                        {/* Manual text input area */}
                        {isPending && isManual && (
                          <div class="mt-1 p-3 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                            <textarea
                              value={manualInputText}
                              onInput={(e) =>
                                setManualInputText((e.target as HTMLTextAreaElement).value)
                              }
                              placeholder="Enter text..."
                              class="w-full p-2 bg-white border rounded-lg text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-300"
                              rows={4}
                              disabled={isExecuting}
                            />
                            {isExecuting && (
                              <div class="flex items-center gap-2 text-xs text-amber-600 mt-1">
                                <span class="w-3 h-3 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
                                <span>Processing with AI...</span>
                              </div>
                            )}
                            {!isExecuting && (
                              <div class="flex gap-2 mt-2">
                                <button
                                  onClick={() => executeTextWorkflow(workflow)}
                                  disabled={!manualInputText.trim()}
                                  class="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition text-sm disabled:opacity-50"
                                >
                                  Run
                                </button>
                                <button
                                  onClick={() => {
                                    setPendingWorkflow(null);
                                    setManualInputText("");
                                  }}
                                  class="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition"
                                >
                                  Cancel
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        {workflows.length === 0 && (
          <div class="text-sm text-gray-400 text-center py-4">No actions available</div>
        )}

        {/* History */}
        {history.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setRecentCollapsed((v) => !v)}
              class="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase mt-6 mb-2 hover:text-gray-700 cursor-pointer select-none w-full text-left"
            >
              <span
                class={`inline-block transition-transform duration-200 ${recentCollapsed ? "" : "rotate-90"}`}
              >
                ▶
              </span>
              Recent
            </button>
            {!recentCollapsed && (
              <div class="space-y-1">
                {history.slice(0, 10).map((entry) => (
                  <HistoryItem
                    key={entry.id}
                    entry={entry}
                    onCopy={async (text) => {
                      await navigator.clipboard.writeText(text);
                    }}
                    onView={(entry) => {
                      if (entry.output_full) {
                        setResultText(entry.output_full);
                        setResultWorkflowName(entry.workflow_name);
                        setResultWorkflow(
                          workflows.find((w) => w.slug === entry.workflow_slug) ?? null,
                        );
                        setManualInputText("");
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
