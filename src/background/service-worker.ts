import { sendToTab } from "@/shared/tab-messaging";
import { buildHotkeyBindings, HOTKEY_STORAGE_KEY } from "@/shared/hotkeys";
import { executeWorkflowUnified } from "@/shared/executor";
import { listWorkflowsUnified, fetchHotkeySettingsUnified } from "@/shared/workflow-provider";
import type { ExtensionMessage, SelectionResultMessage, WriteClipboardResultMessage } from "@/shared/messages";
import type { Workflow, HistoryEntry, HotkeyBinding } from "@/shared/types";

// Allow content scripts to read chrome.storage.session (required for hotkey bindings)
chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" });

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Only accept messages from our own extension
  if (sender.id !== chrome.runtime.id) return false;

  // --- Content script detected a hotkey press ---
  if (msg.type === "EXECUTE_HOTKEY_WORKFLOW") {
    // Open side panel SYNCHRONOUSLY while the user-gesture context is still
    // available.  After any `await` Chrome no longer considers this user-initiated
    // and chrome.sidePanel.open() silently fails.
    if (msg.needsSidePanel && sender.tab?.id) {
      chrome.sidePanel.open({ tabId: sender.tab.id }).catch(() => {});
    }
    handleHotkeyExecution(msg.workflowSlug, sender.tab).catch((err) => {
      console.error("Hotkey workflow execution failed:", err);
    });
    return false;
  }

  // --- Side panel loaded workflows, refresh the hotkey map ---
  if (msg.type === "REFRESH_HOTKEYS") {
    refreshHotkeyBindings().catch((err) => {
      console.error("Hotkey refresh failed:", err);
    });
    return false;
  }

  return false;
});

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

// Create context menu and refresh hotkeys on install/update
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "ancroo-run-workflow",
    title: chrome.i18n.getMessage("contextMenuRun"),
    contexts: ["selection"],
  });

  refreshHotkeyBindings(3).catch(() => {});

  // Re-inject content scripts into existing tabs so hotkeys work immediately
  // after extension reload/update (old content scripts become orphaned).
  reinjectContentScripts();
});

// Refresh hotkeys on browser startup (session storage is cleared on restart)
chrome.runtime.onStartup.addListener(() => {
  refreshHotkeyBindings(3).catch(() => {});
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "ancroo-run-workflow" || !tab?.id) return;
  chrome.sidePanel.open({ tabId: tab.id });
});

// --- Hotkey management ---

/**
 * Fetch hotkey settings and store parsed bindings in chrome.storage.session
 * for the content script to read.
 *
 * Bindings are additionally persisted in chrome.storage.local so they
 * survive browser restarts.
 *
 * When called from startup/install, retries up to 3 times with
 * increasing delay so local storage has time to become ready.
 */
async function refreshHotkeyBindings(retries = 0): Promise<void> {
  try {
    const mappings = await fetchHotkeySettingsUnified();

    // Use cached workflows if available, otherwise fetch.
    const session = await chrome.storage.session.get("cachedWorkflows");
    let workflows: Workflow[] = (session.cachedWorkflows as Workflow[] | undefined) ?? [];
    if (workflows.length === 0) {
      workflows = await listWorkflowsUnified();
      await chrome.storage.session.set({ cachedWorkflows: workflows });
    }

    const bindings = buildHotkeyBindings(mappings, workflows);
    await chrome.storage.session.set({ [HOTKEY_STORAGE_KEY]: bindings });
    // Persist for offline / startup fallback
    await chrome.storage.local.set({ [HOTKEY_STORAGE_KEY]: bindings });
  } catch (err) {
    console.error("refreshHotkeyBindings failed:", err);
    if (retries > 0) {
      const delay = (4 - retries) * 5_000; // 5s, 10s, 15s
      await new Promise((r) => setTimeout(r, delay));
      return refreshHotkeyBindings(retries - 1);
    }
    // All retries exhausted — fall back to persisted bindings from a
    // previous successful fetch so hotkeys still work across restarts.
    const stored = await chrome.storage.local.get(HOTKEY_STORAGE_KEY);
    const cached = (stored[HOTKEY_STORAGE_KEY] as HotkeyBinding[] | undefined) ?? [];
    if (cached.length > 0) {
      await chrome.storage.session.set({ [HOTKEY_STORAGE_KEY]: cached });
    } else {
      await chrome.storage.session.remove(HOTKEY_STORAGE_KEY);
    }
  }
}

/**
 * Handle workflow execution triggered by a hotkey from the content script.
 *
 * Text workflows: execute directly (GET_SELECTION → LLM → INSERT_TEXT).
 * Manual/complex workflows: set pending state and open the side panel.
 */
async function handleHotkeyExecution(workflowSlug: string, tab?: chrome.tabs.Tab): Promise<void> {
  if (!tab?.id) return;

  // Get workflow metadata to decide how to handle execution
  const session = await chrome.storage.session.get("cachedWorkflows");
  let workflows: Workflow[] = (session.cachedWorkflows as Workflow[] | undefined) ?? [];

  if (workflows.length === 0) {
    try {
      workflows = await listWorkflowsUnified();
      await chrome.storage.session.set({ cachedWorkflows: workflows });
    } catch {
      return;
    }
  }

  const workflow = workflows.find((w) => w.slug === workflowSlug);
  if (!workflow) return;

  const collectSources = Array.isArray(workflow.recipe?.collect) ? workflow.recipe.collect : [];
  const needsManual = collectSources.includes("manual_input");
  const needsComplexInput = collectSources.includes("form_fields");

  // Manual/complex workflows need the side panel — store pending state.
  // The side panel was already opened synchronously in the onMessage handler.
  if (needsManual || needsComplexInput) {
    await chrome.storage.session.set({ pendingWorkflowSlug: workflowSlug });
    return;
  }

  // Simple text workflow: execute directly from background
  let response;
  try {
    response = await sendToTab<SelectionResultMessage>(tab.id, {
      type: "GET_SELECTION",
    } as ExtensionMessage);
  } catch {
    return;
  }

  if (!response?.text) return;

  // Show processing toast
  await sendToTab(tab.id, {
    type: "SHOW_TOAST",
    text: `${workflow.name}...`,
    variant: "processing",
  } as ExtensionMessage);

  try {
    const result = await executeWorkflowUnified(workflow, {
      text: response.text,
      html: response.html,
      context: { url: response.url, title: response.title },
    });

    await addToHistory({
      id: result.execution_id ?? crypto.randomUUID(),
      workflow_slug: workflow.slug,
      workflow_name: workflow.name,
      input_preview: response.text.slice(0, 100),
      output_preview: (result.result?.text ?? "").slice(0, 100),
      output_full: result.result?.text ?? undefined,
      success: result.result?.success ?? false,
      timestamp: Date.now(),
    });

    if (result.result?.success && result.result.text) {
      const action = workflow.output_action ?? result.result.action ?? "none";

      if (action === "replace_selection" || action === "insert_text") {
        await sendToTab(tab.id, {
          type: "INSERT_TEXT",
          text: result.result.text,
        } as ExtensionMessage);
        await sendToTab(tab.id, {
          type: "SHOW_TOAST",
          text: workflow.name,
          variant: "success",
          duration: 2000,
        } as ExtensionMessage);
      } else if (action === "insert_before") {
        await sendToTab(tab.id, {
          type: "INSERT_BEFORE",
          text: result.result.text,
        } as ExtensionMessage);
        await sendToTab(tab.id, {
          type: "SHOW_TOAST",
          text: workflow.name,
          variant: "success",
          duration: 2000,
        } as ExtensionMessage);
      } else if (action === "insert_after") {
        await sendToTab(tab.id, {
          type: "INSERT_AFTER",
          text: result.result.text,
        } as ExtensionMessage);
        await sendToTab(tab.id, {
          type: "SHOW_TOAST",
          text: workflow.name,
          variant: "success",
          duration: 2000,
        } as ExtensionMessage);
      } else if (action === "copy_to_clipboard" || action === "clipboard") {
        const res = await sendToTab<WriteClipboardResultMessage>(tab.id, {
          type: "WRITE_CLIPBOARD",
          text: result.result.text,
        } as ExtensionMessage);
        if (res?.success) {
          await sendToTab(tab.id, {
            type: "SHOW_TOAST",
            text: `Copied — ${workflow.name}`,
            variant: "success",
            duration: 2000,
          } as ExtensionMessage);
        } else {
          await sendToTab(tab.id, {
            type: "SHOW_TOAST",
            text: `Copy failed — ${workflow.name}`,
            variant: "error",
            duration: 3000,
          } as ExtensionMessage);
        }
      } else if (action === "side_panel_only" || action === "notification") {
        await chrome.storage.session.set({
          pendingResult: {
            text: result.result.text,
            workflowName: workflow.name,
          },
        });
        await sendToTab(tab.id, { type: "HIDE_TOAST" } as ExtensionMessage);
        await tryOpenSidePanel(tab.id);
      }
    } else {
      const errorDetail = result.result?.error
        ? `${workflow.name}: ${result.result.error}`
        : `${workflow.name} failed`;
      await sendToTab(tab.id, {
        type: "SHOW_TOAST",
        text: errorDetail,
        variant: "error",
        duration: 4000,
      } as ExtensionMessage);
    }
  } catch (error) {
    console.error("Workflow execution failed:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    await sendToTab(tab.id, {
      type: "SHOW_TOAST",
      text: msg,
      variant: "error",
      duration: 4000,
    } as ExtensionMessage).catch(() => {});
  }
}

/** Append a history entry to chrome.storage.local (shared with side panel). */
async function addToHistory(entry: HistoryEntry): Promise<void> {
  const stored = await chrome.storage.local.get("history");
  const existing = (stored.history as HistoryEntry[] | undefined) ?? [];
  const updated = [entry, ...existing].slice(0, 50);
  await chrome.storage.local.set({ history: updated });
}

/** Try to open the side panel, silently ignoring user-gesture errors. */
async function tryOpenSidePanel(tabId: number): Promise<void> {
  try {
    await chrome.sidePanel.open({ tabId });
  } catch {
    // sidePanel.open() requires a user gesture context which is lost after await.
    // The pending state is already stored — user can open manually via Alt+Shift+Y.
  }
}

/**
 * Re-inject content scripts into all matching tabs.
 *
 * After extension install/update, content scripts from the previous version
 * become orphaned — their keydown listeners still fire but runtime messaging
 * silently fails. Injecting fresh scripts restores hotkey functionality
 * without requiring the user to reload every tab.
 */
async function reinjectContentScripts(): Promise<void> {
  const manifest = chrome.runtime.getManifest();
  const files = manifest.content_scripts?.[0]?.js ?? [];
  if (files.length === 0) return;

  try {
    const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
    for (const tab of tabs) {
      if (!tab.id) continue;
      chrome.scripting.executeScript({ target: { tabId: tab.id }, files }).catch(() => {});
    }
  } catch {
    // tabs.query or scripting API not available — ignore
  }
}
