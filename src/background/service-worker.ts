import { buildHotkeyBindings, HOTKEY_STORAGE_KEY } from "@/shared/hotkeys";
import { fetchHotkeySettingsUnified } from "@/shared/workflow-provider";
import type { HotkeyBinding } from "@/shared/types";

// Allow content scripts to read chrome.storage.session (required for hotkey bindings)
chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" });

chrome.runtime.onMessage.addListener((msg, sender) => {
  // Only accept messages from our own extension
  if (sender.id !== chrome.runtime.id) return false;

  // --- Content script detected a hotkey press ---
  if (msg.type === "EXECUTE_HOTKEY_WORKFLOW") {
    // Open the side panel SYNCHRONOUSLY while the user-gesture context is still
    // available.  After any `await` Chrome no longer considers this user-initiated
    // and chrome.sidePanel.open() silently fails.  The side panel is the single
    // orchestrator now, so every hotkey opens it (a no-op when already open).
    if (sender.tab?.id) {
      chrome.sidePanel.open({ tabId: sender.tab.id }).catch(() => {});
    }
    // Queue the workflow for the side panel to pick up. The nonce makes the
    // storage value change on every press, so an already-open panel reacts via
    // storage.onChanged even when the same hotkey is pressed twice in a row.
    chrome.storage.session
      .set({ pendingWorkflowTrigger: { slug: msg.workflowSlug, nonce: Date.now() } })
      .catch(() => {});
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

// Refresh hotkeys and re-inject content scripts on install/update
chrome.runtime.onInstalled.addListener(() => {
  refreshHotkeyBindings(3).catch(() => {});

  // Re-inject content scripts into existing tabs so hotkeys work immediately
  // after extension reload/update (old content scripts become orphaned).
  reinjectContentScripts();
});

// Refresh hotkeys on browser startup (session storage is cleared on restart)
chrome.runtime.onStartup.addListener(() => {
  refreshHotkeyBindings(3).catch(() => {});
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

    const bindings = buildHotkeyBindings(mappings);
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
