import type { ExtensionMessage } from "@/shared/messages";
import { matchesEvent, HOTKEY_STORAGE_KEY } from "@/shared/hotkeys";
import type { HotkeyBinding } from "@/shared/types";
import { smartInsertText, smartInsertBefore, smartInsertAfter } from "./text-inserter";

// --- Selection helpers ---
// window.getSelection() does NOT return text selected inside <textarea> or
// <input> elements, so we track the last focused field and read its selection
// directly.  We only read it while that field is still the active element,
// otherwise a selection left behind after blur would look like a current one.

let lastFocusedInput: HTMLTextAreaElement | HTMLInputElement | null = null;

document.addEventListener(
  "focus",
  (e) => {
    const el = e.target;
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      lastFocusedInput = el;
    }
  },
  true,
); // capture phase — fires before blur

function getInputSelection(): string {
  const el = lastFocusedInput;
  if (
    el &&
    document.contains(el) &&
    // Only honour the selection while the field is still focused. A textarea's
    // selectionStart/End survive blur, so without this a selection left behind
    // after the user clicked away would be returned as a stale "current"
    // selection. Clicking the side panel keeps the field as activeElement
    // (only window focus is lost), so genuine runs still work.
    document.activeElement === el &&
    typeof el.selectionStart === "number" &&
    typeof el.selectionEnd === "number" &&
    el.selectionStart !== el.selectionEnd
  ) {
    return el.value.substring(el.selectionStart, el.selectionEnd);
  }
  return "";
}

// --- Hotkey handling ---

let hotkeyBindings: HotkeyBinding[] = [];

// Load initial bindings from session storage.
// If empty, fall back to persistent local storage (survives browser restarts).
// If still empty, ask the background to refresh from the server.
// Wrapped in try-catch to gracefully handle orphaned content scripts
// ("Extension context invalidated" after extension reload).
try {
  chrome.storage.session
    .get(HOTKEY_STORAGE_KEY)
    .then(async (data) => {
      hotkeyBindings = (data[HOTKEY_STORAGE_KEY] as HotkeyBinding[] | undefined) ?? [];
      if (hotkeyBindings.length === 0) {
        const local = await chrome.storage.local.get(HOTKEY_STORAGE_KEY);
        hotkeyBindings = (local[HOTKEY_STORAGE_KEY] as HotkeyBinding[] | undefined) ?? [];
        if (hotkeyBindings.length > 0) {
          await chrome.storage.session.set({ [HOTKEY_STORAGE_KEY]: hotkeyBindings });
        } else {
          chrome.runtime.sendMessage({ type: "REFRESH_HOTKEYS" });
        }
      }
    })
    .catch(() => {});
} catch {
  // Orphaned content script — silently ignore
}

// Stay in sync when background updates the bindings
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "session" && changes[HOTKEY_STORAGE_KEY]) {
    hotkeyBindings = (changes[HOTKEY_STORAGE_KEY].newValue as HotkeyBinding[]) ?? [];
  }
});

// Listen for keyboard shortcuts (capture phase to intercept before page handlers)
function hotkeyHandler(event: KeyboardEvent): void {
  // Skip if no modifier keys are pressed — all hotkeys require at least one
  if (!event.ctrlKey && !event.metaKey && !event.altKey) return;
  if (hotkeyBindings.length === 0) return;

  for (const binding of hotkeyBindings) {
    if (matchesEvent(event, binding.parsed)) {
      event.preventDefault();
      event.stopPropagation();

      try {
        chrome.runtime.sendMessage({
          type: "EXECUTE_HOTKEY_WORKFLOW",
          workflowSlug: binding.workflow_slug,
        });
      } catch {
        // "Extension context invalidated" — this content script is orphaned
        // after an extension reload.  Remove the listener so the freshly
        // injected script can handle hotkeys without interference.
        document.removeEventListener("keydown", hotkeyHandler, true);
      }
      return;
    }
  }
}
document.addEventListener("keydown", hotkeyHandler, true);

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  // Only accept messages from our own extension
  if (sender.id !== chrome.runtime.id) {
    return false;
  }

  if (message.type === "GET_SELECTION") {
    let text = "";
    let html = "";

    // 1. Live DOM selection — the source of truth. The page keeps its selection
    //    even when the side panel takes focus, so this is re-read fresh on every
    //    call. It MUST come first: a textarea/<input> selection survives blur
    //    indefinitely, so checking that first would let a stale field selection
    //    shadow the page text the user just highlighted.
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && sel.toString().length > 0) {
      text = sel.toString();
      const container = document.createElement("div");
      container.appendChild(sel.getRangeAt(0).cloneContents());
      // cloneContents() can return an empty fragment even when toString() has
      // text (observed on some ranges). Fall back to the plain text so
      // selection_html never receives an empty input.
      html = container.innerHTML || text;
    }

    // 2. Textarea/<input> selection — invisible to window.getSelection().
    //    Plain-text fields have no HTML, so selection_html falls back to text.
    if (!text) {
      text = getInputSelection();
      if (text) html = text;
    }

    sendResponse({
      type: "SELECTION_RESULT",
      text,
      html,
      url: window.location.href,
      title: document.title,
    });
    return true;
  }

  if (message.type === "GET_PAGE_TEXT") {
    sendResponse({
      type: "PAGE_TEXT_RESULT",
      text: document.body.innerText,
      url: window.location.href,
      title: document.title,
    });
    return true;
  }

  if (message.type === "INSERT_TEXT") {
    smartInsertText(message.text).then((success) => {
      sendResponse({
        type: "INSERT_RESULT",
        success,
      });
    });
    return true; // keep channel open for async sendResponse
  }

  if (message.type === "INSERT_BEFORE") {
    smartInsertBefore(message.text).then((success) => {
      sendResponse({ type: "INSERT_RESULT", success });
    });
    return true;
  }

  if (message.type === "INSERT_AFTER") {
    smartInsertAfter(message.text).then((success) => {
      sendResponse({ type: "INSERT_RESULT", success });
    });
    return true;
  }

  if (message.type === "SHOW_TOAST") {
    showToast(message.text, message.variant, message.duration);
    return false;
  }

  if (message.type === "HIDE_TOAST") {
    hideToast();
    return false;
  }

  if (message.type === "WRITE_CLIPBOARD") {
    navigator.clipboard.writeText(message.text).then(
      () => sendResponse({ type: "WRITE_CLIPBOARD_RESULT", success: true }),
      () => {
        // Fallback: execCommand doesn't require user activation
        try {
          const ta = document.createElement("textarea");
          ta.value = message.text;
          ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          const ok = document.execCommand("copy");
          document.body.removeChild(ta);
          sendResponse({ type: "WRITE_CLIPBOARD_RESULT", success: ok });
        } catch {
          sendResponse({ type: "WRITE_CLIPBOARD_RESULT", success: false });
        }
      },
    );
    return true;
  }

  return false;
});

// --- Toast overlay for hotkey feedback ---

const TOAST_ID = "__ancroo-toast";
let toastTimer: ReturnType<typeof setTimeout> | undefined;

function showToast(
  text: string,
  variant: "processing" | "success" | "error",
  duration?: number,
): void {
  let el = document.getElementById(TOAST_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = TOAST_ID;
    el.style.cssText = [
      "position:fixed",
      "bottom:24px",
      "right:24px",
      "z-index:2147483647",
      "padding:10px 18px",
      "border-radius:8px",
      "font:14px/1.4 -apple-system,BlinkMacSystemFont,sans-serif",
      "color:#fff",
      "box-shadow:0 4px 12px rgba(0,0,0,.25)",
      "pointer-events:none",
      "transition:opacity .2s",
      "opacity:0",
    ].join(";");
    document.documentElement.appendChild(el);
  }

  const colors = { processing: "#3b82f6", success: "#22c55e", error: "#ef4444" };
  el.style.background = colors[variant];

  const icons = { processing: "⏳", success: "✔", error: "✘" };
  el.textContent = `${icons[variant]}  ${text}`;

  // Force reflow then fade in
  void el.offsetWidth;
  el.style.opacity = "1";

  clearTimeout(toastTimer);
  if (duration && duration > 0) {
    toastTimer = setTimeout(hideToast, duration);
  }
}

function hideToast(): void {
  const el = document.getElementById(TOAST_ID);
  if (el) {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 200);
  }
  clearTimeout(toastTimer);
}
