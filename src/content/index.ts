import type { ExtensionMessage } from "@/shared/messages";
import { matchesEvent, HOTKEY_STORAGE_KEY } from "@/shared/hotkeys";
import type { HotkeyBinding } from "@/shared/types";
import { smartInsertText, smartInsertBefore, smartInsertAfter } from "./text-inserter";

// --- Selection helpers ---
// window.getSelection() does NOT return text selected inside <textarea> or
// <input> elements.  selectionStart/selectionEnd survive focus loss, so we
// track the last focused input and read it directly on demand.

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
    typeof el.selectionStart === "number" &&
    typeof el.selectionEnd === "number" &&
    el.selectionStart !== el.selectionEnd
  ) {
    return el.value.substring(el.selectionStart, el.selectionEnd);
  }
  return "";
}

// --- Selection caching ---
// When the user clicks the side panel, the page loses focus and the browser
// clears the active selection.  We cache the last non-empty selection so
// GET_SELECTION can still return it.

let cachedSelectionText = "";
let cachedSelectionHtml = "";

document.addEventListener("selectionchange", () => {
  const sel = window.getSelection();
  const text = sel?.toString() ?? "";
  if (text.length > 0 && sel && sel.rangeCount > 0) {
    cachedSelectionText = text;
    const container = document.createElement("div");
    container.appendChild(sel.getRangeAt(0).cloneContents());
    cachedSelectionHtml = container.innerHTML;
  }
});

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
          needsSidePanel: binding.needsSidePanel,
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

// Typed state for audio recording, shared between executeScript calls
// and this content script (both run in the same isolated world).
interface AncrooRecordingState {
  recorder?: MediaRecorder;
  stream?: MediaStream;
  chunks?: Blob[];
  mimeType?: string;
}

// Namespaced global to avoid polluting globalThis with multiple properties
const ANCROO_KEY = "__ancrooRecording";

function getRecordingState(): AncrooRecordingState {
  return ((globalThis as Record<string, unknown>)[ANCROO_KEY] as AncrooRecordingState) ?? {};
}

function clearRecordingState(): void {
  delete (globalThis as Record<string, unknown>)[ANCROO_KEY];
}

// Sanity-check selectors. Workflows can target arbitrary form patterns on
// arbitrary sites, so we don't whitelist tags/attributes — we only reject
// selectors whose entire match would be a global/document-root anchor.
// Compound selectors like "body input" remain allowed; only bare top-level
// selectors are blocked.
const BLOCKED_BARE_PARTS = new Set(["*", "html", "body", "head", ":root"]);
function isAllowedSelector(selector: string): boolean {
  const parts = selector
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p !== "");
  if (parts.length === 0) return false;
  return parts.every((p) => !BLOCKED_BARE_PARTS.has(p));
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  // Only accept messages from our own extension
  if (sender.id !== chrome.runtime.id) {
    return false;
  }

  if (message.type === "GET_SELECTION") {
    // 1. Check last focused textarea/input (selectionStart/End survive blur)
    let text = getInputSelection();
    let html = "";

    // 2. Fall back to regular DOM selection
    if (!text) {
      const sel = window.getSelection();
      text = sel?.toString() ?? "";
      if (text.length > 0 && sel && sel.rangeCount > 0) {
        const container = document.createElement("div");
        container.appendChild(sel.getRangeAt(0).cloneContents());
        html = container.innerHTML;
      }
    }
    // 3. Fall back to cached selection (lost when side panel takes focus)
    if (!text && cachedSelectionText) {
      text = cachedSelectionText;
      html = cachedSelectionHtml;
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

  if (message.type === "GET_PAGE_HTML") {
    sendResponse({
      type: "PAGE_HTML_RESULT",
      html: document.documentElement.outerHTML,
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

  if (message.type === "GET_FORM_FIELDS") {
    const result: Record<string, string> = {};
    for (const field of message.fields) {
      try {
        if (!isAllowedSelector(field.selector)) continue;
        const el = document.querySelector(field.selector);
        if (el) {
          if (
            el instanceof HTMLInputElement &&
            (el.type === "checkbox" || el.type === "radio")
          ) {
            // Collect all checked values for checkbox/radio groups with the same name
            const name = el.getAttribute("name");
            if (name) {
              const checked = document.querySelectorAll(
                `input[name='${name}']:checked`,
              );
              result[field.name] = Array.from(checked)
                .map((cb) => (cb as HTMLInputElement).value)
                .join(", ");
            } else {
              result[field.name] = el.checked ? el.value : "";
            }
          } else if (
            el instanceof HTMLInputElement ||
            el instanceof HTMLTextAreaElement ||
            el instanceof HTMLSelectElement
          ) {
            result[field.name] = el.value;
          } else {
            result[field.name] = el.textContent ?? "";
          }
        }
      } catch {
        continue;
      }
    }
    sendResponse({ type: "FORM_FIELDS_RESULT", fields: result });
    return true;
  }

  if (message.type === "SET_FORM_FIELDS") {
    const errors: string[] = [];
    let setCount = 0;
    for (const [key, { selector, value }] of Object.entries(message.fields)) {
      try {
        if (!isAllowedSelector(selector)) {
          errors.push(`Blocked selector for "${key}": ${selector}`);
          continue;
        }
        const el = document.querySelector(selector);
        if (!el) {
          errors.push(`No element found for "${key}" (${selector})`);
          continue;
        }
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          const proto =
            el instanceof HTMLTextAreaElement
              ? HTMLTextAreaElement.prototype
              : HTMLInputElement.prototype;
          const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
          if (nativeSetter) {
            nativeSetter.call(el, value);
          } else {
            el.value = value;
          }
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          setCount++;
        } else if (el instanceof HTMLSelectElement) {
          el.value = value;
          el.dispatchEvent(new Event("change", { bubbles: true }));
          setCount++;
        } else {
          el.textContent = value;
          setCount++;
        }
      } catch (err) {
        errors.push(`Error setting "${key}": ${err}`);
      }
    }
    sendResponse({
      type: "SET_FORM_FIELDS_RESULT",
      success: errors.length === 0,
      set_count: setCount,
      errors,
    });
    return true;
  }

  // Recording is started via chrome.scripting.executeScript from the side panel,
  // which stores MediaRecorder state in globalThis.__ancrooRecording (isolated world shared).
  if (message.type === "STOP_RECORDING") {
    const state = getRecordingState();

    if (!state.recorder || state.recorder.state === "inactive") {
      sendResponse({ success: false, error: "Not recording" });
      return true;
    }

    const { recorder, stream, chunks, mimeType } = state;
    const resolvedMimeType = mimeType ?? "audio/webm";

    recorder.onstop = async () => {
      const blob = new Blob(chunks ?? [], { type: resolvedMimeType });
      const arrayBuffer = await blob.arrayBuffer();
      stream?.getTracks().forEach((t) => t.stop());
      clearRecordingState();
      sendResponse({ success: true, audioData: arrayBuffer, mimeType: resolvedMimeType });
    };

    recorder.stop();
    return true; // keep channel open for async sendResponse
  }

  if (message.type === "CANCEL_RECORDING") {
    const state = getRecordingState();
    if (state.recorder && state.recorder.state !== "inactive") {
      state.recorder.stop();
    }
    state.stream?.getTracks().forEach((t) => t.stop());
    clearRecordingState();
    sendResponse({ success: true });
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

  const icons = { processing: "\u23F3", success: "\u2714", error: "\u2718" };
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
